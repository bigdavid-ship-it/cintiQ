-- Enable Supabase Realtime postgres_changes for user notifications
alter publication supabase_realtime add table public.notifications;
