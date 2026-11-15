-- cintiQ Phase 2: seller onboarding, verification, products, storage, notifications
-- (also fixes audit_logs so deleting a user can null actor_id without opening the log to edits)

-- ------------------------------------------------------------ audit immutability fix
create or replace function public.audit_logs_immutable()
returns trigger language plpgsql as $$
begin
  -- The only permitted change: ON DELETE SET NULL clearing actor_id
  if tg_op = 'UPDATE'
     and new.actor_id is null and old.actor_id is not null
     and (to_jsonb(new) - 'actor_id') = (to_jsonb(old) - 'actor_id') then
    return new;
  end if;
  raise exception 'audit_logs is append-only';
end $$;

-- ------------------------------------------------------------ notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create or replace function public.notify(_user uuid, _type text, _title text, _body text default null, _link text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, type, title, body, link) values (_user, _type, _title, _body, _link);
$$;
revoke all on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.notify_admins(_type text, _title text, _body text default null, _link text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, type, title, body, link)
  select distinct user_id, _type, _title, _body, _link from public.user_roles where role in ('admin', 'super_admin');
$$;
revoke all on function public.notify_admins(text, text, text, text) from public, anon, authenticated;

alter table public.notifications enable row level security;
create policy notifications_select_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, update, delete on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;

-- ------------------------------------------------------------ seller enums
create type public.seller_type as enum ('student', 'business');
create type public.application_status as enum ('pending', 'under_review', 'approved', 'rejected');

-- ------------------------------------------------------------ seller_applications
create table public.seller_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  seller_type public.seller_type not null,
  full_name text not null check (char_length(full_name) between 2 and 120),
  business_name text not null check (char_length(business_name) between 2 and 100),
  phone text not null check (phone ~ '^\+[0-9]{10,15}$'),
  email text not null,
  student_id_number text check (student_id_number is null or char_length(student_id_number) between 3 and 40),
  institution text check (institution is null or char_length(institution) <= 120),
  business_location text not null check (char_length(business_location) between 5 and 300),
  business_registration_number text check (business_registration_number is null or char_length(business_registration_number) <= 60),
  description text not null check (char_length(description) between 20 and 2000),
  category_ids uuid[] not null check (cardinality(category_ids) between 1 and 8),
  status public.application_status not null default 'pending',
  rejection_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_requires_id check (seller_type <> 'student' or student_id_number is not null),
  constraint rejection_requires_reason check (status <> 'rejected' or rejection_reason is not null)
);
-- one open application per user; rejected users may re-apply
create unique index seller_applications_one_open on public.seller_applications (user_id)
  where status in ('pending', 'under_review', 'approved');
create index seller_applications_status_idx on public.seller_applications (status, created_at);
create trigger seller_applications_updated before update on public.seller_applications
  for each row execute function public.set_updated_at();

create table public.seller_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  application_id uuid not null unique references public.seller_applications(id) on delete cascade,
  bank_name text not null check (char_length(bank_name) between 2 and 80),
  bank_code text check (bank_code is null or bank_code ~ '^[0-9]{3,6}$'),
  account_number text not null check (account_number ~ '^[0-9]{10}$'),
  account_name text not null check (char_length(account_name) between 2 and 120),
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);
create index seller_bank_accounts_user_idx on public.seller_bank_accounts (user_id);

create table public.seller_verification_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.seller_applications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  doc_type text not null check (doc_type in ('student_id', 'government_id', 'business_registration', 'proof_of_address', 'other')),
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);
create index seller_docs_app_idx on public.seller_verification_documents (application_id);

create table public.seller_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  application_id uuid not null unique references public.seller_applications(id) on delete cascade,
  store_name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '',
  location text not null,
  phone text not null,
  seller_type public.seller_type not null,
  status text not null default 'active' check (status in ('active', 'suspended')),
  suspended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger seller_profiles_updated before update on public.seller_profiles
  for each row execute function public.set_updated_at();

create or replace function public.is_active_seller(_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.seller_profiles where user_id = _user and status = 'active')
     and not exists (select 1 from public.profiles where id = _user and is_suspended);
$$;

-- ------------------------------------------------------------ seller RLS
alter table public.seller_applications enable row level security;
alter table public.seller_bank_accounts enable row level security;
alter table public.seller_verification_documents enable row level security;
alter table public.seller_profiles enable row level security;

create policy sapps_select on public.seller_applications for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy sapps_insert on public.seller_applications for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
revoke insert, update, delete on public.seller_applications from authenticated, anon;
grant insert (user_id, seller_type, full_name, business_name, phone, email, student_id_number, institution,
  business_location, business_registration_number, description, category_ids) on public.seller_applications to authenticated;

create policy sbank_select on public.seller_bank_accounts for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy sbank_insert on public.seller_bank_accounts for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.seller_applications a
    where a.id = application_id and a.user_id = auth.uid() and a.status = 'pending'));
revoke insert, update, delete on public.seller_bank_accounts from authenticated, anon;
grant insert (user_id, application_id, bank_name, bank_code, account_number, account_name) on public.seller_bank_accounts to authenticated;

create policy sdocs_select on public.seller_verification_documents for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy sdocs_insert on public.seller_verification_documents for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.seller_applications a
    where a.id = application_id and a.user_id = auth.uid() and a.status = 'pending')
    and storage_path like auth.uid()::text || '/%');
revoke insert, update, delete on public.seller_verification_documents from authenticated, anon;
grant insert (application_id, user_id, doc_type, storage_path, original_name, mime_type, size_bytes)
  on public.seller_verification_documents to authenticated;

-- Public storefront data is limited to non-sensitive columns by this policy + app queries.
create policy sprofiles_select on public.seller_profiles for select to anon, authenticated
  using (status = 'active' or user_id = auth.uid() or public.is_admin());
create policy sprofiles_update_own on public.seller_profiles for update to authenticated
  using (user_id = auth.uid() and status = 'active') with check (user_id = auth.uid());
revoke insert, update, delete on public.seller_profiles from authenticated, anon;
grant update (description, location, phone) on public.seller_profiles to authenticated;

-- ------------------------------------------------------------ admin workflow RPCs
create or replace function public.notify_new_application()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_admins('seller.application', 'New seller application',
    new.business_name || ' (' || new.seller_type || ') applied to sell on cintiQ', '/admin/sellers/' || new.id);
  perform public.notify(new.user_id, 'seller.application', 'Application received',
    'Your seller application is pending review.', '/seller');
  perform public.write_audit(new.user_id, 'seller.application.submitted', 'seller_application', new.id::text, '{}');
  return new;
end $$;
create trigger seller_application_submitted after insert on public.seller_applications
  for each row execute function public.notify_new_application();

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
    insert into public.seller_profiles (user_id, application_id, store_name, slug, description, location, phone, seller_type)
    values (_app.user_id, _id, _app.business_name, _slug, _app.description, _app.business_location, _app.phone, _app.seller_type);
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
revoke all on function public.review_seller_application(uuid, text, text) from public, anon;
grant execute on function public.review_seller_application(uuid, text, text) to authenticated;

create or replace function public.set_seller_status(_user uuid, _suspend boolean, _reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare _actor uuid := auth.uid();
begin
  if _actor is null or not public.is_admin(_actor) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _suspend and (_reason is null or char_length(trim(_reason)) < 5) then
    raise exception 'a suspension reason is required';
  end if;
  update public.seller_profiles
    set status = case when _suspend then 'suspended' else 'active' end,
        suspended_reason = case when _suspend then trim(_reason) else null end
    where user_id = _user;
  if not found then raise exception 'seller not found'; end if;
  perform public.notify(_user, 'seller.status',
    case when _suspend then 'Seller account suspended' else 'Seller account reactivated' end,
    case when _suspend then trim(_reason) else 'Your seller account is active again.' end, '/seller');
  perform public.write_audit(_actor, case when _suspend then 'seller.suspend' else 'seller.reactivate' end,
    'seller', _user::text, jsonb_build_object('reason', _reason));
end $$;
revoke all on function public.set_seller_status(uuid, boolean, text) from public, anon;
grant execute on function public.set_seller_status(uuid, boolean, text) to authenticated;

-- ------------------------------------------------------------ products
create type public.product_status as enum ('draft', 'active', 'archived', 'suspended');

create table public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_profiles(user_id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 140),
  description text not null default '' check (char_length(description) <= 4000),
  price_kobo bigint not null check (price_kobo > 0 and price_kobo <= 100000000000),
  quantity integer not null default 0 check (quantity >= 0),
  status public.product_status not null default 'draft',
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('english', name || ' ' || description)) stored
);
create index products_search_idx on public.products using gin (search);
create index products_listing_idx on public.products (status, created_at desc);
create index products_category_idx on public.products (category_id) where status = 'active';
create index products_seller_idx on public.products (seller_id);
create index products_price_idx on public.products (price_kobo) where status = 'active';
create index products_featured_idx on public.products (created_at desc) where is_featured and status = 'active';
create trigger products_updated before update on public.products
  for each row execute function public.set_updated_at();

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, sort_order);

create or replace function public.limit_product_images()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.product_images where product_id = new.product_id) >= 6 then
    raise exception 'a product can have at most 6 images';
  end if;
  return new;
end $$;
create trigger product_images_limit before insert on public.product_images
  for each row execute function public.limit_product_images();

alter table public.products enable row level security;
alter table public.product_images enable row level security;

create policy products_select_public on public.products for select to anon, authenticated
  using (status = 'active' and public.is_active_seller(seller_id));
create policy products_select_own on public.products for select to authenticated
  using (seller_id = auth.uid() or public.is_admin());
create policy products_insert on public.products for insert to authenticated
  with check (seller_id = auth.uid() and public.is_active_seller(auth.uid()) and status in ('draft', 'active'));
create policy products_update_own on public.products for update to authenticated
  using (seller_id = auth.uid() and status <> 'suspended')
  with check (seller_id = auth.uid() and public.is_active_seller(auth.uid()) and status in ('draft', 'active', 'archived'));
create policy products_delete_own on public.products for delete to authenticated
  using (seller_id = auth.uid() and status <> 'suspended');
revoke insert, update, delete on public.products from authenticated, anon;
grant insert (seller_id, category_id, name, description, price_kobo, quantity, status) on public.products to authenticated;
grant update (category_id, name, description, price_kobo, quantity, status) on public.products to authenticated;
grant delete on public.products to authenticated;

create policy pimages_select on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));
create policy pimages_insert on public.product_images for insert to authenticated
  with check (exists (select 1 from public.products p where p.id = product_id and p.seller_id = auth.uid())
    and public.is_active_seller(auth.uid()) and storage_path like auth.uid()::text || '/%');
create policy pimages_delete on public.product_images for delete to authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.seller_id = auth.uid()));
revoke insert, update, delete on public.product_images from authenticated, anon;
grant insert (product_id, storage_path, sort_order) on public.product_images to authenticated;
grant delete on public.product_images to authenticated;

-- Admin moderation (feature / suspend): privileged columns only via RPC
create or replace function public.admin_moderate_product(_id uuid, _status public.product_status default null, _featured boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare _actor uuid := auth.uid();
begin
  if _actor is null or not public.is_admin(_actor) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.products set status = coalesce(_status, status), is_featured = coalesce(_featured, is_featured) where id = _id;
  if not found then raise exception 'product not found'; end if;
  perform public.write_audit(_actor, 'product.moderate', 'product', _id::text,
    jsonb_build_object('status', _status, 'featured', _featured));
end $$;
revoke all on function public.admin_moderate_product(uuid, public.product_status, boolean) from public, anon;
grant execute on function public.admin_moderate_product(uuid, public.product_status, boolean) to authenticated;

-- ------------------------------------------------------------ storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('seller-documents', 'seller-documents', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "product images are public" on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');
create policy "active sellers upload product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_active_seller(auth.uid()));
create policy "sellers delete own product images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "applicants upload own documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'seller-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners and admins read documents" on storage.objects for select to authenticated
  using (bucket_id = 'seller-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
