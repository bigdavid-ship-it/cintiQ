-- cintiQ Phase 4: order fulfilment lifecycle, delivery OTP, disputes, evidence, reviews

create type public.dispute_reason as enum ('non_delivery', 'wrong_product', 'damaged_product', 'missing_items', 'other');
create type public.dispute_status as enum ('open', 'under_investigation', 'resolved_refund', 'resolved_release', 'closed');

alter table public.orders
  add column delivery_evidence_path text,
  add column delivery_note text,
  add column accepted_at timestamptz,
  add column delivered_at timestamptz,
  add column confirmed_at timestamptz,
  add column completed_at timestamptz,
  add column rejection_reason text,
  add column cancellation_reason text;

-- ------------------------------------------------------------ delivery_confirmations (OTP)
create table public.delivery_confirmations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  otp_hash text not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  expires_at timestamptz not null,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.delivery_confirmations enable row level security;
create policy dconf_select on public.delivery_confirmations for select to authenticated
  using (public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or o.seller_id = auth.uid())));
revoke insert, update, delete on public.delivery_confirmations from authenticated, anon;
revoke select (otp_hash) on public.delivery_confirmations from authenticated, anon;

-- ------------------------------------------------------------ disputes & evidence
create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  seller_id uuid not null references public.seller_profiles(user_id) on delete restrict,
  reason public.dispute_reason not null,
  description text not null check (char_length(description) between 10 and 2000),
  status public.dispute_status not null default 'open',
  resolution_note text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index disputes_status_idx on public.disputes (status, created_at desc);
create trigger disputes_updated before update on public.disputes for each row execute function public.set_updated_at();

create table public.dispute_evidence (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index dispute_evidence_dispute_idx on public.dispute_evidence (dispute_id);

alter table public.disputes enable row level security;
alter table public.dispute_evidence enable row level security;

create policy disputes_select on public.disputes for select to authenticated
  using (customer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());
create policy devidence_select on public.dispute_evidence for select to authenticated
  using (exists (select 1 from public.disputes d where d.id = dispute_id and (d.customer_id = auth.uid() or d.seller_id = auth.uid() or public.is_admin())));
create policy devidence_insert on public.dispute_evidence for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and storage_path like auth.uid()::text || '/%'
    and exists (select 1 from public.disputes d where d.id = dispute_id
                and d.status in ('open', 'under_investigation')
                and (d.customer_id = auth.uid() or d.seller_id = auth.uid() or public.is_admin()))
  );
revoke insert, update, delete on public.disputes from authenticated, anon;
revoke update, delete on public.dispute_evidence from authenticated, anon;

-- ------------------------------------------------------------ reviews
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.seller_profiles(user_id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  created_at timestamptz not null default now()
);
create index reviews_seller_idx on public.reviews (seller_id, created_at desc);
alter table public.reviews enable row level security;
create policy reviews_select on public.reviews for select to anon, authenticated using (true);
create policy reviews_insert on public.reviews for insert to authenticated
  with check (
    customer_id = auth.uid()
    and exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()
                and o.seller_id = reviews.seller_id and o.status in ('customer_confirmed', 'completed'))
  );
revoke update, delete on public.reviews from authenticated, anon;

-- ------------------------------------------------------------ storage: order-evidence
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('order-evidence', 'order-evidence', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "order evidence upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'order-evidence' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "order evidence read participants and admins" on storage.objects for select to authenticated
  using (bucket_id = 'order-evidence' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ------------------------------------------------------------ fulfilment RPCs
create or replace function public.seller_advance_order(
  _order_id uuid, _next public.order_status, _note text default null, _evidence_path text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _o public.orders;
begin
  if _uid is null or not public.is_active_seller(_uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into _o from public.orders where id = _order_id and seller_id = _uid for update;
  if not found then raise exception 'order not found'; end if;

  if _next = 'rejected' then
    if _o.status <> 'seller_notified' then raise exception 'can only reject newly notified orders'; end if;
    if _note is null or char_length(trim(_note)) < 5 then raise exception 'rejection reason is required'; end if;
    update public.products p set quantity = p.quantity + oi.quantity
      from public.order_items oi where oi.order_id = _o.id and oi.product_id = p.id;
    update public.orders set status = 'rejected', rejection_reason = trim(_note) where id = _o.id;
    insert into public.order_status_history (order_id, from_status, to_status, actor_id, note)
      values (_o.id, _o.status, 'rejected', _uid, trim(_note));
    update public.orders set status = 'refund_pending' where id = _o.id;
    insert into public.order_status_history (order_id, from_status, to_status, actor_id, note)
      values (_o.id, 'rejected', 'refund_pending', _uid, 'awaiting refund after seller rejection');
    perform public.notify(_o.customer_id, 'order.rejected', 'Order rejected by seller',
      'Seller could not fulfil your order: ' || trim(_note) || '. Refund is pending.', '/orders/' || _o.checkout_id);
    perform public.notify_admins('order.refund_required', 'Refund required: seller rejected order',
      'Order ' || _o.id::text || ' rejected by seller.', '/admin/disputes');

  elsif (_o.status = 'seller_notified' and _next = 'accepted') then
    update public.orders set status = 'accepted', accepted_at = now() where id = _o.id;
    insert into public.order_status_history (order_id, from_status, to_status, actor_id, note)
      values (_o.id, _o.status, 'accepted', _uid, _note);
    perform public.notify(_o.customer_id, 'order.accepted', 'Order accepted',
      'The seller accepted your order and will begin preparing it.', '/orders/' || _o.checkout_id);

  elsif (_o.status = 'accepted' and _next = 'processing') then
    update public.orders set status = 'processing' where id = _o.id;
    insert into public.order_status_history (order_id, from_status, to_status, actor_id, note)
      values (_o.id, _o.status, 'processing', _uid, _note);
    perform public.notify(_o.customer_id, 'order.status', 'Order is being prepared', null, '/orders/' || _o.checkout_id);

  elsif (_o.status = 'processing' and _next = 'ready_for_delivery') then
    update public.orders set status = 'ready_for_delivery' where id = _o.id;
    insert into public.order_status_history (order_id, from_status, to_status, actor_id, note)
      values (_o.id, _o.status, 'ready_for_delivery', _uid, _note);
    perform public.notify(_o.customer_id, 'order.status',
      case when _o.fulfilment_method = 'collection' then 'Order ready for collection' else 'Order ready for delivery' end,
      null, '/orders/' || _o.checkout_id);

  elsif (_o.status = 'ready_for_delivery' and _next = 'out_for_delivery' and _o.fulfilment_method = 'delivery') then
    update public.orders set status = 'out_for_delivery' where id = _o.id;
    insert into public.order_status_history (order_id, from_status, to_status, actor_id, note)
      values (_o.id, _o.status, 'out_for_delivery', _uid, _note);
    perform public.notify(_o.customer_id, 'order.status', 'Order is out for delivery',
      'Generate your delivery confirmation code when the item arrives.', '/orders/' || _o.checkout_id);

  elsif ((_o.status = 'out_for_delivery' or (_o.status = 'ready_for_delivery' and _o.fulfilment_method = 'collection')) and _next = 'delivered') then
    update public.orders set status = 'delivered', delivered_at = now(),
      delivery_evidence_path = coalesce(_evidence_path, delivery_evidence_path),
      delivery_note = coalesce(nullif(trim(coalesce(_note, '')), ''), delivery_note)
      where id = _o.id;
    insert into public.order_status_history (order_id, from_status, to_status, actor_id, note)
      values (_o.id, _o.status, 'delivered', _uid, _note);
    perform public.notify(_o.customer_id, 'order.delivered', 'Order marked as delivered',
      'Confirm receipt using your delivery OTP or report a problem if anything is wrong.', '/orders/' || _o.checkout_id);
  else
    raise exception 'invalid status transition from % to %', _o.status, _next;
  end if;

  perform public.write_audit(_uid, 'order.status.' || _next::text, 'order', _o.id::text, jsonb_build_object('note', _note));
end $$;
revoke all on function public.seller_advance_order(uuid, public.order_status, text, text) from public, anon;
grant execute on function public.seller_advance_order(uuid, public.order_status, text, text) to authenticated;

create or replace function public.customer_cancel_order(_order_id uuid, _reason text)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _o public.orders;
begin
  if _uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into _o from public.orders where id = _order_id and customer_id = _uid for update;
  if not found then raise exception 'order not found'; end if;
  if _o.status not in ('payment_confirmed', 'seller_notified') then
    raise exception 'order can no longer be cancelled after the seller accepts it';
  end if;
  if _reason is null or char_length(trim(_reason)) < 3 then raise exception 'provide a cancellation reason'; end if;

  update public.products p set quantity = p.quantity + oi.quantity
    from public.order_items oi where oi.order_id = _o.id and oi.product_id = p.id;
  update public.orders set status = 'cancelled', cancellation_reason = trim(_reason) where id = _o.id;
  insert into public.order_status_history (order_id, from_status, to_status, actor_id, note)
    values (_o.id, _o.status, 'cancelled', _uid, trim(_reason));
  update public.orders set status = 'refund_pending' where id = _o.id;
  insert into public.order_status_history (order_id, from_status, to_status, actor_id, note)
    values (_o.id, 'cancelled', 'refund_pending', _uid, 'awaiting refund after customer cancellation');

  perform public.notify(_o.seller_id, 'order.cancelled', 'Order cancelled by customer', trim(_reason), '/seller/orders/' || _o.id);
  perform public.notify_admins('order.refund_required', 'Refund required: customer cancelled order',
    'Order ' || _o.id::text || ' cancelled before acceptance.', '/admin/disputes');
  perform public.write_audit(_uid, 'order.cancelled', 'order', _o.id::text, jsonb_build_object('reason', _reason));
end $$;
revoke all on function public.customer_cancel_order(uuid, text) from public, anon;
grant execute on function public.customer_cancel_order(uuid, text) to authenticated;

-- ------------------------------------------------------------ OTP generation & verification
create or replace function public.request_delivery_otp(_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  _uid uuid := auth.uid();
  _o public.orders;
  _otp text;
  _hash text;
  _ttl int;
  _max int;
  _exp timestamptz;
begin
  if _uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into _o from public.orders where id = _order_id and customer_id = _uid for update;
  if not found then raise exception 'order not found'; end if;
  if _o.status not in ('ready_for_delivery', 'out_for_delivery', 'delivered') then
    raise exception 'delivery confirmation code is not available yet';
  end if;

  _ttl := public.setting_bigint('delivery_otp_ttl_minutes', 1440);
  _max := public.setting_bigint('delivery_otp_max_attempts', 5);
  _exp := now() + make_interval(mins => _ttl);
  -- Cryptographically random 6-digit OTP via pgcrypto
  _otp := lpad(((get_byte(gen_random_bytes(4), 0)::bigint * 16777216 + get_byte(gen_random_bytes(4), 1)::bigint * 65536
                + get_byte(gen_random_bytes(4), 2)::bigint * 256 + get_byte(gen_random_bytes(4), 3)::bigint) % 900000 + 100000)::text, 6, '0');
  _hash := encode(digest(_o.id::text || ':' || _otp, 'sha256'), 'hex');

  insert into public.delivery_confirmations (order_id, otp_hash, attempts, max_attempts, expires_at, verified_at, verified_by)
  values (_o.id, _hash, 0, _max, _exp, null, null)
  on conflict (order_id) do update set
    otp_hash = excluded.otp_hash, attempts = 0, max_attempts = excluded.max_attempts,
    expires_at = excluded.expires_at, verified_at = null, verified_by = null;

  perform public.write_audit(_uid, 'order.otp.generated', 'order', _o.id::text, '{}');
  return jsonb_build_object('otp', _otp, 'expires_at', _exp);
end $$;
revoke all on function public.request_delivery_otp(uuid) from public, anon;
grant execute on function public.request_delivery_otp(uuid) to authenticated;

create or replace function public.verify_delivery_otp(_order_id uuid, _otp text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
  _uid uuid := auth.uid();
  _o public.orders;
  _dc public.delivery_confirmations;
  _hash text;
begin
  if _uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into _o from public.orders where id = _order_id for update;
  if not found or (_o.customer_id <> _uid and _o.seller_id <> _uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _o.status not in ('out_for_delivery', 'delivered', 'ready_for_delivery') then
    raise exception 'order is not awaiting delivery confirmation';
  end if;

  select * into _dc from public.delivery_confirmations where order_id = _o.id for update;
  if not found then raise exception 'no delivery OTP has been generated for this order'; end if;
  if _dc.verified_at is not null then raise exception 'delivery already confirmed'; end if;
  if _dc.expires_at < now() then raise exception 'delivery OTP has expired; ask the customer to generate a new one'; end if;
  if _dc.attempts >= _dc.max_attempts then raise exception 'maximum OTP attempts exceeded; ask the customer to generate a new code'; end if;

  _hash := encode(digest(_o.id::text || ':' || trim(_otp), 'sha256'), 'hex');
  if _hash <> _dc.otp_hash then
    update public.delivery_confirmations set attempts = attempts + 1 where id = _dc.id;
    raise exception 'invalid delivery code (% attempts remaining)', (_dc.max_attempts - _dc.attempts - 1);
  end if;

  update public.delivery_confirmations set verified_at = now(), verified_by = _uid where id = _dc.id;
  update public.orders set status = 'customer_confirmed', delivered_at = coalesce(delivered_at, now()), confirmed_at = now() where id = _o.id;
  insert into public.order_status_history (order_id, from_status, to_status, actor_id, note)
    values (_o.id, _o.status, 'customer_confirmed', _uid, 'delivery confirmed with OTP');

  update public.orders set status = 'completed', completed_at = now() where id = _o.id;
  insert into public.order_status_history (order_id, from_status, to_status, actor_id, note)
    values (_o.id, 'customer_confirmed', 'completed', _uid, 'order completed');

  perform public.notify(_o.seller_id, 'order.completed', 'Order completed',
    'Customer receipt confirmed. Order is now completed.', '/seller/orders/' || _o.id);
  perform public.notify(_o.customer_id, 'order.completed', 'Order completed',
    'Thank you for confirming receipt. You can now leave a review.', '/orders/' || _o.checkout_id);
  perform public.write_audit(_uid, 'order.delivery.confirmed', 'order', _o.id::text, '{}');
  return true;
end $$;
revoke all on function public.verify_delivery_otp(uuid, text) from public, anon;
grant execute on function public.verify_delivery_otp(uuid, text) to authenticated;

-- ------------------------------------------------------------ disputes
create or replace function public.open_dispute(_order_id uuid, _reason public.dispute_reason, _description text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _o public.orders;
  _win int;
  _did uuid;
begin
  if _uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into _o from public.orders where id = _order_id and customer_id = _uid for update;
  if not found then raise exception 'order not found'; end if;
  if _o.status not in ('accepted', 'processing', 'ready_for_delivery', 'out_for_delivery', 'delivered') then
    raise exception 'dispute cannot be opened in status %', _o.status;
  end if;
  if _o.status = 'delivered' and _o.delivered_at is not null then
    _win := public.setting_bigint('dispute_window_days', 3);
    if _o.delivered_at + make_interval(days => _win) < now() then
      raise exception 'the dispute window for this order has closed';
    end if;
  end if;
  if _description is null or char_length(trim(_description)) < 10 then
    raise exception 'describe the issue (at least 10 characters)';
  end if;

  insert into public.disputes (order_id, customer_id, seller_id, reason, description)
  values (_o.id, _uid, _o.seller_id, _reason, trim(_description))
  returning id into _did;

  update public.orders set status = 'disputed' where id = _o.id;
  insert into public.order_status_history (order_id, from_status, to_status, actor_id, note)
    values (_o.id, _o.status, 'disputed', _uid, 'dispute opened: ' || _reason::text);

  perform public.notify(_o.seller_id, 'dispute.opened', 'Customer opened a dispute',
    'Please review and respond with evidence.', '/seller/orders/' || _o.id);
  perform public.notify_admins('dispute.opened', 'New order dispute',
    'Order ' || _o.id::text || ' (' || _reason::text || ')', '/admin/disputes/' || _did);
  perform public.write_audit(_uid, 'dispute.opened', 'dispute', _did::text, jsonb_build_object('reason', _reason));
  return _did;
end $$;
revoke all on function public.open_dispute(uuid, public.dispute_reason, text) from public, anon;
grant execute on function public.open_dispute(uuid, public.dispute_reason, text) to authenticated;

create or replace function public.resolve_dispute(_dispute_id uuid, _decision text, _note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  _actor uuid := auth.uid();
  _d public.disputes;
begin
  if _actor is null or not public.is_admin(_actor) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into _d from public.disputes where id = _dispute_id for update;
  if not found then raise exception 'dispute not found'; end if;

  if _decision = 'under_investigation' then
    if _d.status <> 'open' then raise exception 'invalid transition'; end if;
    update public.disputes set status = 'under_investigation' where id = _d.id;
    perform public.notify(_d.customer_id, 'dispute.update', 'Dispute under investigation', 'An administrator is reviewing your dispute.', '/orders');
    perform public.notify(_d.seller_id, 'dispute.update', 'Dispute under investigation', 'An administrator is reviewing the dispute.', '/seller/orders/' || _d.order_id);

  elsif _decision in ('resolved_refund', 'resolved_release') then
    if _d.status not in ('open', 'under_investigation') then raise exception 'dispute already resolved'; end if;
    if _note is null or char_length(trim(_note)) < 5 then raise exception 'resolution note is required'; end if;
    update public.disputes set status = _decision::public.dispute_status, resolution_note = trim(_note),
      resolved_by = _actor, resolved_at = now() where id = _d.id;

    if _decision = 'resolved_refund' then
      update public.orders set status = 'refund_pending' where id = _d.order_id;
      insert into public.order_status_history (order_id, from_status, to_status, actor_id, note)
        values (_d.order_id, 'disputed', 'refund_pending', _actor, 'dispute resolved: refund approved - ' || trim(_note));
      perform public.notify(_d.customer_id, 'dispute.resolved', 'Refund approved', trim(_note), '/orders');
      perform public.notify(_d.seller_id, 'dispute.resolved', 'Dispute resolved (refund to buyer)', trim(_note), '/seller/orders/' || _d.order_id);
    else
      update public.orders set status = 'customer_confirmed', confirmed_at = now() where id = _d.order_id;
      insert into public.order_status_history (order_id, from_status, to_status, actor_id, note)
        values (_d.order_id, 'disputed', 'customer_confirmed', _actor, 'dispute resolved in seller favour - ' || trim(_note));
      update public.orders set status = 'completed', completed_at = now() where id = _d.order_id;
      insert into public.order_status_history (order_id, from_status, to_status, actor_id, note)
        values (_d.order_id, 'customer_confirmed', 'completed', _actor, 'order completed');
      perform public.notify(_d.customer_id, 'dispute.resolved', 'Dispute closed', trim(_note), '/orders');
      perform public.notify(_d.seller_id, 'dispute.resolved', 'Dispute resolved in your favour', trim(_note), '/seller/orders/' || _d.order_id);
    end if;
  else
    raise exception 'unknown decision';
  end if;

  perform public.write_audit(_actor, 'dispute.' || _decision, 'dispute', _d.id::text, jsonb_build_object('note', _note));
end $$;
revoke all on function public.resolve_dispute(uuid, text, text) from public, anon;
grant execute on function public.resolve_dispute(uuid, text, text) to authenticated;

-- Auto-complete delivered orders after auto_settlement_days with no dispute, ONLY if settlement mode is configured.
create or replace function public.auto_complete_delivered_orders()
returns integer language plpgsql security definer set search_path = public as $$
declare
  _mode text;
  _days int;
  _n int := 0;
  r record;
begin
  select (value #>> '{}') into _mode from public.platform_settings where key = 'settlement_mode';
  if coalesce(_mode, 'unconfigured') = 'unconfigured' then
    return 0;
  end if;
  _days := public.setting_bigint('auto_settlement_days', 3);

  for r in
    select id, customer_id, seller_id, checkout_id from public.orders
    where status = 'delivered' and delivered_at is not null
      and delivered_at + make_interval(days => _days) < now()
    for update skip locked
  loop
    update public.orders set status = 'customer_confirmed', confirmed_at = now() where id = r.id;
    insert into public.order_status_history (order_id, from_status, to_status, note)
      values (r.id, 'delivered', 'customer_confirmed', 'auto-confirmed after delivery window');
    update public.orders set status = 'completed', completed_at = now() where id = r.id;
    insert into public.order_status_history (order_id, from_status, to_status, note)
      values (r.id, 'customer_confirmed', 'completed', 'auto-completed');
    perform public.notify(r.seller_id, 'order.completed', 'Order auto-completed',
      'Delivery window elapsed with no dispute.', '/seller/orders/' || r.id);
    _n := _n + 1;
  end loop;
  return _n;
end $$;
revoke all on function public.auto_complete_delivered_orders() from public, anon, authenticated;
