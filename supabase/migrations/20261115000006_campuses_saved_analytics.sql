-- cintiQ Phase 6 + Multi-Campus + Saved Products + Support + Product Slugs + Shared Rate Limits

-- ------------------------------------------------------------ campuses
create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  university_name text not null check (char_length(university_name) between 2 and 150),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  location text not null check (char_length(location) between 2 and 200),
  status text not null default 'active' check (status in ('active', 'coming_soon', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger campuses_updated before update on public.campuses for each row execute function public.set_updated_at();

alter table public.campuses enable row level security;
create policy campuses_select on public.campuses for select to anon, authenticated
  using (status in ('active', 'coming_soon') or public.is_admin());
create policy campu`ses_admin_write on public.campuses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Initial launch campus (editable by administrators)
insert into public.campuses (name, university_name, slug, location, status) values
  ('Main Campus', 'University of Lagos (UNILAG)', 'unilag', 'Akoka, Yaba, Lagos', 'active');

alter table public.profiles add column campus_id uuid references public.campuses(id) on delete set null;
grant update (campus_id) on public.profiles to authenticated;

alter table public.seller_applications add column campus_id uuid references public.campuses(id) on delete restrict;
grant insert (campus_id) on public.seller_applications to authenticated;

alter table public.seller_profiles add column campus_id uuid references public.campuses(id) on delete restrict;
create index seller_profiles_campus_idx on public.seller_profiles (campus_id) where status = 'active';

alter table public.products
  add column campus_id uuid references public.campuses(id) on delete restrict,
  add column slug text unique;
create index products_campus_idx on public.products (campus_id) where status = 'active';
grant insert (campus_id, slug) on public.products to authenticated;
grant update (campus_id) on public.products to authenticated;

-- Propagate campus_id when a seller application is approved
create or replace function public.review_seller_application(_id uuid, _decision text, _reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  _actor uuid := auth.uid();
  _app public.seller_applications;
  _slug text;
begin
  if _actor is null or not public.is_admin(_actor) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into _app from public.seller_applications where id = _id for update;
  if not found then raise exception 'application not found'; end if;

  if _decision = 'under_review' then
    if _app.status <> 'pending' then raise exception 'invalid transition from %', _app.status; end if;
    update public.seller_applications set status = 'under_review', reviewed_by = _actor where id = _id;
    perform public.notify(_app.user_id, 'seller.application', 'Application under review',
      'An administrator has started reviewing your application.', '/seller');

  elsif _decision = 'approved' then
    if _app.status not in ('pending', 'under_review') then raise exception 'invalid transition from %', _app.status; end if;
    _slug := trim(both '-' from regexp_replace(lower(_app.business_name), '[^a-z0-9]+', '-', 'g'));
    if _slug = '' then _slug := 'store'; end if;
    _slug := _slug || '-' || substr(md5(gen_random_uuid()::text), 1, 5);
    update public.seller_applications
      set status = 'approved', reviewed_by = _actor, reviewed_at = now(), rejection_reason = null where id = _id;
    insert into public.seller_profiles (user_id, application_id, campus_id, store_name, slug, description, location, phone, seller_type)
    values (_app.user_id, _id, _app.campus_id, _app.business_name, _slug, _app.description, _app.business_location, _app.phone, _app.seller_type);
    insert into public.user_roles (user_id, role, granted_by) values (_app.user_id, 'seller', _actor) on conflict do nothing;
    perform public.notify(_app.user_id, 'seller.application', 'Application approved',
      'You can now create your storefront products.', '/seller');

  elsif _decision = 'rejected' then
    if _app.status not in ('pending', 'under_review') then raise exception 'invalid transition from %', _app.status; end if;
    if _reason is null or char_length(trim(_reason)) < 5 then raise exception 'a rejection reason is required'; end if;
    update public.seller_applications
      set status = 'rejected', reviewed_by = _actor, reviewed_at = now(), rejection_reason = trim(_reason) where id = _id;
    perform public.notify(_app.user_id, 'seller.application', 'Application not approved', trim(_reason), '/seller');

  else
    raise exception 'unknown decision';
  end if;

  perform public.write_audit(_actor, 'seller.application.' || _decision, 'seller_application', _id::text,
    jsonb_build_object('reason', _reason));
end $$;

-- ------------------------------------------------------------ saved_products
create table public.saved_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);
create index saved_products_user_idx on public.saved_products (user_id, created_at desc);
alter table public.saved_products enable row level security;
create policy saved_products_own on public.saved_products for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------------ support_tickets (/contact)
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  name text not null check (char_length(name) between 2 and 120),
  email text not null,
  subject text not null check (char_length(subject) between 3 and 160),
  message text not null check (char_length(message) between 10 and 3000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  created_at timestamptz not null default now()
);
alter table public.support_tickets enable row level security;
create policy support_insert_any on public.support_tickets for insert to anon, authenticated with check (true);
create policy support_select_own_or_admin on public.support_tickets for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy support_update_admin on public.support_tickets for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------ shared rate limits
create table public.rate_limits (
  key text primary key,
  count integer not null default 1,
  window_start timestamptz not null default now()
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from public, anon, authenticated;

create or replace function public.check_rate_limit(_key text, _limit integer, _window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  _now timestamptz := now();
  _rec public.rate_limits;
begin
  select * into _rec from public.rate_limits where key = _key for update;
  if not found then
    insert into public.rate_limits (key, count, window_start) values (_key, 1, _now);
    return true;
  end if;
  if _rec.window_start + make_interval(secs => _window_seconds) < _now then
    update public.rate_limits set count = 1, window_start = _now where key = _key;
    return true;
  end if;
  if _rec.count >= _limit then
    return false;
  end if;
  update public.rate_limits set count = count + 1 where key = _key;
  return true;
end $$;
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
