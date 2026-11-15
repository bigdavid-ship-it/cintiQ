-- Supabase installs pgcrypto in the `extensions` schema; include `extensions` in search_path
-- for functions calling gen_random_bytes() or digest().
create extension if not exists pgcrypto with schema extensions;

alter function public.create_checkout(text, public.fulfilment_method, text, text, text, text)
  set search_path = public, extensions;

alter function public.request_delivery_otp(uuid)
  set search_path = public, extensions;

alter function public.verify_delivery_otp(uuid, text)
  set search_path = public, extensions;
