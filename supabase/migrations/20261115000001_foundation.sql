-- cintiQ Phase 1: identity, roles, settings, audit log, categories, RLS
-- All money columns elsewhere use numeric(14,2) / integer kobo; see later migrations.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
create type public.app_role as enum ('customer', 'seller', 'admin', 'super_admin');

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text check (phone is null or phone ~ '^\+?[0-9]{10,15}$'),
  avatar_path text,
  is_suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- user_roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
create index user_roles_user_idx on public.user_roles (user_id);

-- Role checks (SECURITY DEFINER avoids RLS recursion). search_path pinned.
create or replace function public.has_role(_user uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user and role = _role);
$$;

create or replace function public.is_admin(_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user and role in ('admin', 'super_admin')
  );
$$;

create or replace function public.is_super_admin(_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user, 'super_admin');
$$;

-- On signup: create profile + customer role ONLY. Metadata is never trusted for roles.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120)
  );
  insert into public.user_roles (user_id, role) values (new.id, 'customer');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profile email in sync
create or replace function public.sync_user_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end $$;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.sync_user_email();

-- ---------------------------------------------------------------- audit_logs (append-only)
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create or replace function public.write_audit(
  _actor uuid, _action text, _entity_type text, _entity_id text, _metadata jsonb default '{}'
) returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (_actor, _action, _entity_type, _entity_id, coalesce(_metadata, '{}'));
$$;
revoke all on function public.write_audit(uuid, text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.audit_logs_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs is append-only';
end $$;
create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();

-- ---------------------------------------------------------------- role management
-- Only a super administrator may grant/revoke admin roles. Self-promotion is impossible.
create or replace function public.set_user_role(_target uuid, _role public.app_role, _grant boolean)
returns void language plpgsql security definer set search_path = public as $$
declare _actor uuid := auth.uid();
begin
  if _actor is null or not public.is_super_admin(_actor) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _target = _actor then
    raise exception 'cannot change own role' using errcode = '42501';
  end if;
  if _role in ('customer', 'seller') then
    raise exception 'customer/seller roles are managed by the platform workflow' using errcode = '42501';
  end if;
  if _grant then
    insert into public.user_roles (user_id, role, granted_by)
    values (_target, _role, _actor) on conflict do nothing;
  else
    delete from public.user_roles where user_id = _target and role = _role;
  end if;
  perform public.write_audit(_actor, case when _grant then 'role.grant' else 'role.revoke' end,
    'user', _target::text, jsonb_build_object('role', _role));
end $$;
revoke all on function public.set_user_role(uuid, public.app_role, boolean) from public, anon;
grant execute on function public.set_user_role(uuid, public.app_role, boolean) to authenticated;

-- ---------------------------------------------------------------- platform_settings
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  is_public boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create trigger platform_settings_updated before update on public.platform_settings
  for each row execute function public.set_updated_at();

-- Policy defaults (configuration, not sample data). Editable by administrators.
insert into public.platform_settings (key, value, description, is_public) values
  ('default_commission_percent', '10', 'Default platform commission percentage on item subtotal', false),
  ('delivery_otp_ttl_minutes', '1440', 'Delivery confirmation OTP validity', false),
  ('delivery_otp_max_attempts', '5', 'Maximum OTP verification attempts', false),
  ('auto_settlement_days', '3', 'Days after DELIVERED with no customer response before auto-completion (only if the settlement provider permits)', false),
  ('dispute_window_days', '3', 'Days after delivery within which a customer may open a dispute', true),
  ('settlement_mode', '"unconfigured"', 'unconfigured | paystack_split_manual | paystack_transfer', false);

-- ---------------------------------------------------------------- categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger categories_updated before update on public.categories
  for each row execute function public.set_updated_at();

insert into public.categories (name, slug, sort_order) values
  ('Food and groceries', 'food-and-groceries', 1),
  ('Fashion', 'fashion', 2),
  ('Electronics and accessories', 'electronics-and-accessories', 3),
  ('Personal care', 'personal-care', 4),
  ('Beauty and skincare', 'beauty-and-skincare', 5),
  ('Hostel essentials', 'hostel-essentials', 6),
  ('Academic materials', 'academic-materials', 7),
  ('Services', 'services', 8);

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.platform_settings enable row level security;
alter table public.categories enable row level security;

-- profiles
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- is_suspended and email must not be self-editable: enforce with column privileges
revoke update on public.profiles from authenticated;
grant update (full_name, phone, avatar_path) on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated, anon;

-- user_roles: read-only for clients (own roles; admins see all). Writes only via set_user_role / service role.
create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.user_roles from authenticated, anon;

-- audit_logs: admin read only; no client writes
create policy audit_logs_admin_select on public.audit_logs for select to authenticated
  using (public.is_admin());
revoke insert, update, delete on public.audit_logs from authenticated, anon;

-- platform_settings: public keys readable by anyone; admins read all; super admin writes
create policy settings_select_public on public.platform_settings for select to anon, authenticated
  using (is_public or public.is_admin());
create policy settings_update_admin on public.platform_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke insert, delete on public.platform_settings from authenticated, anon;
revoke update on public.platform_settings from authenticated;
grant update (value) on public.platform_settings to authenticated;

-- categories: active visible to all; admins manage
create policy categories_select on public.categories for select to anon, authenticated
  using (is_active or public.is_admin());
create policy categories_admin_write on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
