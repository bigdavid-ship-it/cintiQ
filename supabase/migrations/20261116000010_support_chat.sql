-- cintiQ customer support chat: one conversation per user, replied to by admins only.

create table public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'resolved')),
  last_message_at timestamptz not null default now(),
  last_message_preview text not null default '',
  admin_unread integer not null default 0,
  user_unread integer not null default 0,
  created_at timestamptz not null default now()
);
create index support_conversations_last_idx on public.support_conversations (last_message_at desc);
create index support_conversations_admin_unread_idx on public.support_conversations (admin_unread) where admin_unread > 0;

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, -- conversation owner (used for realtime filters)
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_role text not null check (sender_role in ('user', 'admin')),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index support_messages_conv_idx on public.support_messages (conversation_id, created_at);
create index support_messages_user_idx on public.support_messages (user_id, created_at);

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;

-- Users read only their own conversation; admins read everything. All writes go through the RPC below
-- (called from server actions after authorization), so no insert/update/delete policies exist.
create policy support_conv_select on public.support_conversations for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy support_msg_select on public.support_messages for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

revoke insert, update, delete on public.support_conversations from authenticated, anon;
revoke insert, update, delete on public.support_messages from authenticated, anon;

create or replace function public.support_send_message(_user_id uuid, _sender uuid, _role text, _body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _conv uuid;
  _msg uuid;
  _preview text := left(regexp_replace(_body, '\s+', ' ', 'g'), 120);
begin
  if _role not in ('user', 'admin') then
    raise exception 'invalid sender role';
  end if;

  insert into public.support_conversations (user_id) values (_user_id)
    on conflict (user_id) do nothing;
  select id into _conv from public.support_conversations where user_id = _user_id;

  insert into public.support_messages (conversation_id, user_id, sender_id, sender_role, body)
    values (_conv, _user_id, _sender, _role, _body)
    returning id into _msg;

  update public.support_conversations set
    last_message_at = now(),
    last_message_preview = _preview,
    status = case when _role = 'user' then 'open' else status end,
    admin_unread = admin_unread + (case when _role = 'user' then 1 else 0 end),
    user_unread = user_unread + (case when _role = 'admin' then 1 else 0 end)
  where id = _conv;

  return _msg;
end $$;
revoke all on function public.support_send_message(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.support_send_message(uuid, uuid, text, text) to service_role;

-- Realtime so new messages and unread counters appear instantly.
alter publication supabase_realtime add table public.support_messages;
alter publication supabase_realtime add table public.support_conversations;
