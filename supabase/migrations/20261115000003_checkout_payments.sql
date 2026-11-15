-- cintiQ Phase 3: cart, checkout, orders, payments, commissions, webhooks.
-- All money is integer kobo. All financial state transitions run inside SECURITY DEFINER functions.

create type public.order_status as enum (
  'pending_payment', 'payment_confirmed', 'seller_notified', 'accepted', 'processing', 'ready_for_delivery',
  'out_for_delivery', 'delivered', 'customer_confirmed', 'completed',
  'rejected', 'cancelled', 'disputed', 'refund_pending', 'refunded', 'expired');
create type public.checkout_status as enum ('pending_payment', 'paid', 'failed', 'expired', 'cancelled');
create type public.payment_status as enum ('initialized', 'success', 'failed', 'abandoned', 'amount_mismatch');
create type public.fulfilment_method as enum ('delivery', 'collection');

alter table public.seller_profiles
  add column commission_percent numeric(5,2) check (commission_percent is null or (commission_percent >= 0 and commission_percent <= 50));

insert into public.platform_settings (key, value, description, is_public) values
  ('delivery_fee_kobo', '0', 'Delivery charge in kobo applied per seller order (0 = sellers deliver free). Not applied to collection.', true),
  ('checkout_expiry_minutes', '30', 'Minutes an unpaid checkout holds reserved stock', false)
on conflict (key) do nothing;

-- ------------------------------------------------------------ saved delivery information
create table public.delivery_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  recipient_name text not null check (char_length(recipient_name) between 2 and 120),
  phone text not null check (phone ~ '^\+[0-9]{10,15}$'),
  address text not null check (char_length(address) between 5 and 300),
  created_at timestamptz not null default now()
);
create index delivery_addresses_user_idx on public.delivery_addresses (user_id);
alter table public.delivery_addresses enable row level security;
create policy daddr_all on public.delivery_addresses for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.delivery_addresses from authenticated;

-- ------------------------------------------------------------ cart
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now()
);
create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity between 1 and 99),
  created_at timestamptz not null default now(),
  unique (cart_id, product_id)
);
create index cart_items_cart_idx on public.cart_items (cart_id);

alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
create policy carts_own on public.carts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cart_items_select on public.cart_items for select to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));
create policy cart_items_insert on public.cart_items for insert to authenticated
  with check (
    exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid())
    and exists (select 1 from public.products p where p.id = product_id and p.status = 'active'
                and p.seller_id <> auth.uid() and public.is_active_seller(p.seller_id)));
create policy cart_items_update on public.cart_items for update to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));
create policy cart_items_delete on public.cart_items for delete to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));
revoke update on public.cart_items from authenticated;
grant update (quantity) on public.cart_items to authenticated;

-- ------------------------------------------------------------ checkouts / orders
create table public.checkouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  reference text not null unique,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 80),
  status public.checkout_status not null default 'pending_payment',
  subtotal_kobo bigint not null check (subtotal_kobo > 0),
  delivery_fee_kobo bigint not null check (delivery_fee_kobo >= 0),
  total_kobo bigint not null check (total_kobo > 0),
  fulfilment_method public.fulfilment_method not null,
  recipient_name text not null,
  recipient_phone text not null,
  delivery_address text not null,
  notes text check (notes is null or char_length(notes) <= 500),
  expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (total_kobo = subtotal_kobo + delivery_fee_kobo)
);
create index checkouts_user_idx on public.checkouts (user_id, created_at desc);
create index checkouts_pending_idx on public.checkouts (expires_at) where status = 'pending_payment';
create trigger checkouts_updated before update on public.checkouts for each row execute function public.set_updated_at();

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  checkout_id uuid not null references public.checkouts(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  seller_id uuid not null references public.seller_profiles(user_id) on delete restrict,
  status public.order_status not null default 'pending_payment',
  subtotal_kobo bigint not null check (subtotal_kobo > 0),
  delivery_fee_kobo bigint not null check (delivery_fee_kobo >= 0),
  total_kobo bigint not null check (total_kobo = subtotal_kobo + delivery_fee_kobo),
  fulfilment_method public.fulfilment_method not null,
  recipient_name text not null,
  recipient_phone text not null,
  delivery_address text not null,
  notes text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (checkout_id, seller_id)
);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_seller_idx on public.orders (seller_id, created_at desc) where paid_at is not null;
create index orders_status_idx on public.orders (status);
create trigger orders_updated before update on public.orders for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  unit_price_kobo bigint not null check (unit_price_kobo > 0),
  quantity integer not null check (quantity > 0),
  line_total_kobo bigint not null check (line_total_kobo = unit_price_kobo * quantity)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  actor_id uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index order_history_order_idx on public.order_status_history (order_id, id);

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  percent numeric(5,2) not null check (percent >= 0 and percent <= 100),
  gross_kobo bigint not null check (gross_kobo > 0),
  commission_kobo bigint not null check (commission_kobo >= 0),
  delivery_fee_kobo bigint not null default 0 check (delivery_fee_kobo >= 0),
  seller_proceeds_kobo bigint not null check (seller_proceeds_kobo >= 0),
  created_at timestamptz not null default now(),
  check (seller_proceeds_kobo = gross_kobo - commission_kobo + delivery_fee_kobo)
);

-- ------------------------------------------------------------ payments
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  checkout_id uuid not null unique references public.checkouts(id) on delete restrict,
  reference text not null unique,
  provider text not null default 'paystack',
  amount_kobo bigint not null check (amount_kobo > 0),
  currency text not null default 'NGN',
  status public.payment_status not null default 'initialized',
  authorization_url text,
  access_code text,
  provider_transaction_id text,
  channel text,
  gateway_response text,
  fees_kobo bigint check (fees_kobo is null or fees_kobo >= 0),
  paid_at timestamptz,
  verified_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index payments_provider_tx_unique on public.payments (provider, provider_transaction_id) where provider_transaction_id is not null and status = 'success';
create index payments_status_idx on public.payments (status, created_at desc);
create trigger payments_updated before update on public.payments for each row execute function public.set_updated_at();

create table public.payment_webhooks (
  id bigint generated always as identity primary key,
  dedupe_key text not null unique,
  provider text not null default 'paystack',
  event_type text not null,
  reference text,
  signature_valid boolean not null,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'error')),
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index payment_webhooks_ref_idx on public.payment_webhooks (reference);

-- ------------------------------------------------------------ RLS
alter table public.checkouts enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.commissions enable row level security;
alter table public.payments enable row level security;
alter table public.payment_webhooks enable row level security;

create policy checkouts_select on public.checkouts for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- Customer: all own orders. Seller: only own orders that are paid. Admin: all.
create policy orders_select on public.orders for select to authenticated
  using (customer_id = auth.uid() or (seller_id = auth.uid() and paid_at is not null) or public.is_admin());
create policy order_items_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy order_history_select on public.order_status_history for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy commissions_select on public.commissions for select to authenticated
  using (public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.seller_id = auth.uid() and o.paid_at is not null));
create policy payments_select on public.payments for select to authenticated
  using (public.is_admin() or exists (select 1 from public.checkouts c where c.id = checkout_id and c.user_id = auth.uid()));
create policy webhooks_admin_select on public.payment_webhooks for select to authenticated using (public.is_admin());

revoke insert, update, delete on public.checkouts, public.orders, public.order_items, public.order_status_history,
  public.commissions, public.payments, public.payment_webhooks from authenticated, anon;
-- Customers must not read gateway internals
revoke select (raw, access_code, provider_transaction_id) on public.payments from authenticated;
grant select (raw, access_code, provider_transaction_id) on public.payments to service_role;

-- ------------------------------------------------------------ functions
create or replace function public.setting_bigint(_key text, _default bigint)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::bigint from public.platform_settings where key = _key), _default);
$$;
create or replace function public.setting_numeric(_key text, _default numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = _key), _default);
$$;
revoke all on function public.setting_bigint(text, bigint), public.setting_numeric(text, numeric) from public, anon, authenticated;

-- Commission rounding: half away from zero on the item subtotal only (delivery fee is not commissionable).
create or replace function public.calc_commission_kobo(_gross bigint, _percent numeric)
returns bigint language sql immutable as $$
  select round(_gross * _percent / 100)::bigint;
$$;

-- Releases reserved stock and closes an unpaid checkout. Internal.
create or replace function public.release_checkout(_id uuid, _status public.checkout_status)
returns boolean language plpgsql security definer set search_path = public as $$
declare c public.checkouts;
begin
  select * into c from public.checkouts where id = _id for update;
  if not found or c.status <> 'pending_payment' then return false; end if;

  update public.products p set quantity = p.quantity + oi.quantity
    from public.order_items oi join public.orders o on o.id = oi.order_id
    where o.checkout_id = _id and oi.product_id = p.id;

  update public.checkouts set status = _status where id = _id;
  update public.payments set status = case when _status = 'failed' then 'failed'::public.payment_status else 'abandoned'::public.payment_status end
    where checkout_id = _id and status = 'initialized';

  insert into public.order_status_history (order_id, from_status, to_status, note)
    select id, status, case when _status = 'expired' then 'expired'::public.order_status else 'cancelled'::public.order_status end,
           'checkout ' || _status::text
    from public.orders where checkout_id = _id;
  update public.orders set status = case when _status = 'expired' then 'expired'::public.order_status else 'cancelled'::public.order_status end
    where checkout_id = _id;
  return true;
end $$;
revoke all on function public.release_checkout(uuid, public.checkout_status) from public, anon, authenticated;

create or replace function public.create_checkout(
  _key text, _method public.fulfilment_method, _name text, _phone text, _address text, _notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _existing public.checkouts;
  _cart uuid;
  _fee_each bigint;
  _default_pct numeric;
  _expiry int;
  _subtotal bigint;
  _sellers int;
  _fee_total bigint;
  _checkout uuid;
  _ref text;
  r record;
  _order uuid;
  _pct numeric;
  _comm bigint;
begin
  if _uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = _uid and is_suspended) then
    raise exception 'account suspended' using errcode = '42501';
  end if;
  if _key is null or char_length(_key) < 8 then raise exception 'invalid idempotency key'; end if;

  -- Idempotency: a repeated submit returns the same checkout, never a second order.
  select * into _existing from public.checkouts where user_id = _uid and idempotency_key = _key;
  if found then
    return jsonb_build_object('checkout_id', _existing.id, 'reference', _existing.reference,
                              'total_kobo', _existing.total_kobo, 'reused', true);
  end if;

  -- Supersede earlier unpaid checkouts (returns their reserved stock)
  perform public.release_checkout(c.id, 'cancelled')
    from public.checkouts c where c.user_id = _uid and c.status = 'pending_payment';

  select id into _cart from public.carts where user_id = _uid;
  if _cart is null or not exists (select 1 from public.cart_items where cart_id = _cart) then
    raise exception 'your cart is empty';
  end if;

  -- Validate every line against live data, locking product rows in a stable order.
  for r in
    select ci.quantity, p.id, p.name, p.status, p.seller_id, p.quantity as stock
    from public.cart_items ci join public.products p on p.id = ci.product_id
    where ci.cart_id = _cart order by p.id for update of p
  loop
    if r.status <> 'active' or not public.is_active_seller(r.seller_id) then
      raise exception 'product unavailable: %', r.name;
    end if;
    if r.seller_id = _uid then raise exception 'you cannot buy your own product: %', r.name; end if;
    if r.stock < r.quantity then raise exception 'insufficient stock for %: only % left', r.name, r.stock; end if;
  end loop;

  select sum(p.price_kobo * ci.quantity)::bigint, count(distinct p.seller_id)
    into _subtotal, _sellers
    from public.cart_items ci join public.products p on p.id = ci.product_id where ci.cart_id = _cart;

  _fee_each := case when _method = 'delivery' then public.setting_bigint('delivery_fee_kobo', 0) else 0 end;
  _fee_total := _fee_each * _sellers;
  _default_pct := public.setting_numeric('default_commission_percent', 10);
  _expiry := public.setting_bigint('checkout_expiry_minutes', 30);
  _ref := 'CQ-' || upper(encode(gen_random_bytes(10), 'hex'));

  insert into public.checkouts (user_id, reference, idempotency_key, subtotal_kobo, delivery_fee_kobo, total_kobo,
      fulfilment_method, recipient_name, recipient_phone, delivery_address, notes, expires_at)
  values (_uid, _ref, _key, _subtotal, _fee_total, _subtotal + _fee_total, _method, trim(_name), trim(_phone),
      trim(_address), nullif(trim(coalesce(_notes, '')), ''), now() + make_interval(mins => _expiry))
  returning id into _checkout;

  for r in
    select p.seller_id, sum(p.price_kobo * ci.quantity)::bigint as sub
    from public.cart_items ci join public.products p on p.id = ci.product_id
    where ci.cart_id = _cart group by p.seller_id
  loop
    select coalesce(commission_percent, _default_pct) into _pct from public.seller_profiles where user_id = r.seller_id;
    _comm := public.calc_commission_kobo(r.sub, _pct);

    insert into public.orders (checkout_id, customer_id, seller_id, subtotal_kobo, delivery_fee_kobo, total_kobo,
        fulfilment_method, recipient_name, recipient_phone, delivery_address, notes)
    values (_checkout, _uid, r.seller_id, r.sub, _fee_each, r.sub + _fee_each, _method, trim(_name), trim(_phone),
        trim(_address), nullif(trim(coalesce(_notes, '')), ''))
    returning id into _order;

    insert into public.order_items (order_id, product_id, product_name, unit_price_kobo, quantity, line_total_kobo)
      select _order, p.id, p.name, p.price_kobo, ci.quantity, p.price_kobo * ci.quantity
      from public.cart_items ci join public.products p on p.id = ci.product_id
      where ci.cart_id = _cart and p.seller_id = r.seller_id;

    insert into public.commissions (order_id, percent, gross_kobo, commission_kobo, delivery_fee_kobo, seller_proceeds_kobo)
    values (_order, _pct, r.sub, _comm, _fee_each, r.sub - _comm + _fee_each);

    insert into public.order_status_history (order_id, to_status, actor_id, note)
    values (_order, 'pending_payment', _uid, 'checkout created');
  end loop;

  -- Reserve stock
  update public.products p set quantity = p.quantity - ci.quantity
    from public.cart_items ci where ci.cart_id = _cart and ci.product_id = p.id;

  insert into public.payments (checkout_id, reference, amount_kobo) values (_checkout, _ref, _subtotal + _fee_total);

  return jsonb_build_object('checkout_id', _checkout, 'reference', _ref, 'total_kobo', _subtotal + _fee_total, 'reused', false);
end $$;
revoke all on function public.create_checkout(text, public.fulfilment_method, text, text, text, text) from public, anon;
grant execute on function public.create_checkout(text, public.fulfilment_method, text, text, text, text) to authenticated;

create or replace function public.cancel_checkout(_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.checkouts where id = _id and user_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.release_checkout(_id, 'cancelled');
end $$;
revoke all on function public.cancel_checkout(uuid) from public, anon;
grant execute on function public.cancel_checkout(uuid) to authenticated;

-- Called ONLY by trusted server code after the provider confirmed the transaction independently.
create or replace function public.confirm_payment(
  _reference text, _provider_tx text, _amount bigint, _currency text, _channel text,
  _fees bigint, _paid_at timestamptz, _raw jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  pay public.payments;
  c public.checkouts;
  r record;
  _ok boolean := true;
  _o record;
begin
  select * into pay from public.payments where reference = _reference for update;
  if not found then return 'unknown_reference'; end if;
  if pay.status = 'success' then return 'already_processed'; end if;   -- idempotent
  select * into c from public.checkouts where id = pay.checkout_id for update;

  if _amount <> pay.amount_kobo or upper(coalesce(_currency, '')) <> pay.currency then
    update public.payments set status = 'amount_mismatch', provider_transaction_id = _provider_tx,
      verified_at = now(), raw = _raw where id = pay.id;
    perform public.notify_admins('payment.suspicious', 'Payment amount mismatch',
      'Reference ' || _reference || ': expected ' || pay.amount_kobo || ' but provider reported ' || _amount, '/admin/payments');
    perform public.write_audit(null, 'payment.amount_mismatch', 'payment', pay.id::text,
      jsonb_build_object('expected', pay.amount_kobo, 'received', _amount, 'currency', _currency));
    return 'amount_mismatch';
  end if;

  update public.payments set status = 'success', provider_transaction_id = _provider_tx, channel = _channel,
    fees_kobo = _fees, paid_at = coalesce(_paid_at, now()), verified_at = now(), raw = _raw,
    gateway_response = 'Successful' where id = pay.id;

  -- Late payment on a closed checkout: stock was released. Re-reserve if everything is still available.
  if c.status <> 'pending_payment' then
    for r in
      select oi.product_id, oi.quantity, p.quantity as stock, p.status, p.seller_id
      from public.order_items oi join public.orders o on o.id = oi.order_id
      join public.products p on p.id = oi.product_id
      where o.checkout_id = c.id order by p.id for update of p
    loop
      if r.stock < r.quantity or r.status <> 'active' or not public.is_active_seller(r.seller_id) then _ok := false; end if;
    end loop;

    if not _ok then
      update public.checkouts set status = 'paid', paid_at = now() where id = c.id;
      insert into public.order_status_history (order_id, from_status, to_status, note)
        select id, status, 'refund_pending', 'payment received after checkout closed; stock unavailable' from public.orders where checkout_id = c.id;
      update public.orders set status = 'refund_pending' where checkout_id = c.id;
      perform public.notify_admins('payment.refund_required', 'Refund required: late payment',
        'Reference ' || _reference || ' was paid after expiry and items are no longer available.', '/admin/payments');
      perform public.notify(c.user_id, 'order.refund', 'Payment received, items unavailable',
        'Your payment arrived after the checkout closed and the items are no longer available. A refund will be processed.', '/orders/' || c.id);
      perform public.write_audit(null, 'payment.late_refund_required', 'payment', pay.id::text, '{}');
      return 'paid_refund_required';
    end if;

    update public.products p set quantity = p.quantity - oi.quantity
      from public.order_items oi join public.orders o on o.id = oi.order_id
      where o.checkout_id = c.id and oi.product_id = p.id;
  end if;

  update public.checkouts set status = 'paid', paid_at = coalesce(_paid_at, now()) where id = c.id;

  insert into public.order_status_history (order_id, from_status, to_status, note)
    select id, status, 'payment_confirmed', 'payment verified with provider' from public.orders where checkout_id = c.id;
  update public.orders set status = 'payment_confirmed', paid_at = now() where checkout_id = c.id;
  insert into public.order_status_history (order_id, from_status, to_status, note)
    select id, 'payment_confirmed', 'seller_notified', 'seller notified' from public.orders where checkout_id = c.id;
  update public.orders set status = 'seller_notified' where checkout_id = c.id;

  for _o in select id, seller_id, total_kobo from public.orders where checkout_id = c.id loop
    perform public.notify(_o.seller_id, 'order.new', 'New paid order',
      'You have a new order worth NGN ' || (_o.total_kobo / 100.0)::numeric(14,2) || '. Accept it to begin fulfilment.', '/seller/orders/' || _o.id);
  end loop;
  perform public.notify(c.user_id, 'payment.confirmed', 'Payment confirmed',
    'We received your payment (' || _reference || '). Sellers have been notified.', '/orders/' || c.id);

  delete from public.cart_items ci using public.carts ct
    where ct.id = ci.cart_id and ct.user_id = c.user_id
      and ci.product_id in (select oi.product_id from public.order_items oi join public.orders o on o.id = oi.order_id where o.checkout_id = c.id);

  perform public.write_audit(null, 'payment.confirmed', 'payment', pay.id::text, jsonb_build_object('reference', _reference));
  return 'confirmed';
end $$;
revoke all on function public.confirm_payment(text, text, bigint, text, text, bigint, timestamptz, jsonb) from public, anon, authenticated;

create or replace function public.fail_payment(_reference text, _reason text)
returns text language plpgsql security definer set search_path = public as $$
declare pay public.payments; c public.checkouts;
begin
  select * into pay from public.payments where reference = _reference for update;
  if not found then return 'unknown_reference'; end if;
  if pay.status = 'success' then return 'ignored'; end if;
  select * into c from public.checkouts where id = pay.checkout_id;
  perform public.release_checkout(c.id, 'failed');
  update public.payments set status = 'failed', gateway_response = left(coalesce(_reason, 'Payment failed'), 300) where id = pay.id;
  perform public.notify(c.user_id, 'payment.failed', 'Payment failed',
    'Your payment did not go through. No money was taken. You can try again from your cart.', '/cart');
  perform public.notify_admins('payment.failed', 'Failed payment', 'Reference ' || _reference || ': ' || coalesce(_reason, 'unknown'), '/admin/payments');
  return 'failed';
end $$;
revoke all on function public.fail_payment(text, text) from public, anon, authenticated;

create or replace function public.expire_stale_checkouts()
returns integer language plpgsql security definer set search_path = public as $$
declare _n integer := 0; r record;
begin
  for r in select id from public.checkouts where status = 'pending_payment' and expires_at < now() for update skip locked loop
    if public.release_checkout(r.id, 'expired') then _n := _n + 1; end if;
  end loop;
  return _n;
end $$;
revoke all on function public.expire_stale_checkouts() from public, anon, authenticated;
