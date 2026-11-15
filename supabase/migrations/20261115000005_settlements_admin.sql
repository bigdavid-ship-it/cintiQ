-- cintiQ Phase 5: seller settlements, refunds, commission overrides, customer moderation

alter table public.seller_bank_accounts
  add column paystack_subaccount_code text,
  add column paystack_recipient_code text;

create table public.seller_settlements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  seller_id uuid not null references public.seller_profiles(user_id) on delete restrict,
  amount_kobo bigint not null check (amount_kobo >= 0),
  provider text not null,
  status text not null default 'pending_provider'
    check (status in ('pending_provider', 'queued', 'processing', 'settled', 'failed', 'on_hold')),
  provider_reference text,
  failure_reason text,
  initiated_by uuid references public.profiles(id) on delete set null,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index seller_settlements_seller_idx on public.seller_settlements (seller_id, created_at desc);
create index seller_settlements_status_idx on public.seller_settlements (status);
create trigger seller_settlements_updated before update on public.seller_settlements
  for each row execute function public.set_updated_at();

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  amount_kobo bigint not null check (amount_kobo > 0),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'refunded', 'failed')),
  provider_reference text,
  processed_by uuid references public.profiles(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index refunds_status_idx on public.refunds (status, created_at desc);

alter table public.seller_settlements enable row level security;
alter table public.refunds enable row level security;

create policy settlements_select on public.seller_settlements for select to authenticated
  using (seller_id = auth.uid() or public.is_admin());
create policy refunds_select on public.refunds for select to authenticated
  using (public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));

revoke insert, update, delete on public.seller_settlements, public.refunds from authenticated, anon;

-- ------------------------------------------------------------ admin RPCs
create or replace function public.admin_set_user_suspended(_target uuid, _suspend boolean, _reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare _actor uuid := auth.uid();
begin
  if _actor is null or not public.is_admin(_actor) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _target = _actor then raise exception 'cannot suspend your own account'; end if;
  if public.is_super_admin(_target) and not public.is_super_admin(_actor) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.profiles set is_suspended = _suspend where id = _target;
  if not found then raise exception 'user not found'; end if;
  perform public.write_audit(_actor, case when _suspend then 'user.suspend' else 'user.reactivate' end,
    'user', _target::text, jsonb_build_object('reason', _reason));
end $$;
revoke all on function public.admin_set_user_suspended(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_user_suspended(uuid, boolean, text) to authenticated;

create or replace function public.admin_set_seller_commission(_seller_id uuid, _percent numeric)
returns void language plpgsql security definer set search_path = public as $$
declare _actor uuid := auth.uid();
begin
  if _actor is null or not public.is_admin(_actor) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _percent is not null and (_percent < 0 or _percent > 50) then
    raise exception 'commission must be between 0 and 50 percent';
  end if;
  update public.seller_profiles set commission_percent = _percent where user_id = _seller_id;
  if not found then raise exception 'seller not found'; end if;
  perform public.write_audit(_actor, 'seller.commission.update', 'seller', _seller_id::text,
    jsonb_build_object('commission_percent', _percent));
end $$;
revoke all on function public.admin_set_seller_commission(uuid, numeric) from public, anon;
grant execute on function public.admin_set_seller_commission(uuid, numeric) to authenticated;

create or replace function public.admin_update_setting(_key text, _value jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare _actor uuid := auth.uid();
begin
  if _actor is null or not public.is_admin(_actor) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _key = 'settlement_mode' and not public.is_super_admin(_actor) then
    raise exception 'only a super administrator can change settlement_mode' using errcode = '42501';
  end if;
  update public.platform_settings set value = _value, updated_by = _actor where key = _key;
  if not found then raise exception 'unknown setting %', _key; end if;
  perform public.write_audit(_actor, 'setting.update', 'platform_setting', _key, jsonb_build_object('value', _value));
end $$;
revoke all on function public.admin_update_setting(text, jsonb) from public, anon;
grant execute on function public.admin_update_setting(text, jsonb) to authenticated;

create or replace function public.mark_order_refunded(_order_id uuid, _provider_ref text, _reason text default 'Refund processed')
returns void language plpgsql security definer set search_path = public as $$
declare
  _actor uuid := auth.uid();
  _o public.orders;
  _pay_id uuid;
begin
  if _actor is null or not public.is_admin(_actor) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into _o from public.orders where id = _order_id for update;
  if not found then raise exception 'order not found'; end if;
  if _o.status <> 'refund_pending' then raise exception 'order is not awaiting refund'; end if;

  select id into _pay_id from public.payments where checkout_id = _o.checkout_id;

  insert into public.refunds (order_id, payment_id, amount_kobo, reason, status, provider_reference, processed_by, processed_at)
  values (_o.id, _pay_id, _o.total_kobo, _reason, 'refunded', _provider_ref, _actor, now())
  on conflict (order_id) do update set
    status = 'refunded', provider_reference = excluded.provider_reference, processed_by = _actor, processed_at = now();

  update public.orders set status = 'refunded' where id = _o.id;
  insert into public.order_status_history (order_id, from_status, to_status, actor_id, note)
    values (_o.id, 'refund_pending', 'refunded', _actor, 'refund completed (' || coalesce(_provider_ref, 'manual') || ')');

  perform public.notify(_o.customer_id, 'order.refunded', 'Refund processed',
    'Your refund for order #' || left(_o.id::text, 8) || ' has been processed.', '/orders/' || _o.checkout_id);
  perform public.write_audit(_actor, 'order.refunded', 'order', _o.id::text, jsonb_build_object('provider_ref', _provider_ref));
end $$;
revoke all on function public.mark_order_refunded(uuid, text, text) from public, anon;
grant execute on function public.mark_order_refunded(uuid, text, text) to authenticated;
