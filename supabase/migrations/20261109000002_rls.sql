-- Access: single owner. Only signed-in users whose email is in allowed_users can read or write.
-- Anyone else who signs in via magic link sees nothing and can change nothing.

create table public.allowed_users (
  email      text primary key check (email = lower(trim(email))),
  created_at timestamptz not null default now()
);

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.allowed_users
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated;

alter table public.allowed_users enable row level security;
-- The app only needs to ask "am I allowed?"; the list itself is managed in the SQL editor.
create policy allowed_users_self on public.allowed_users
  for select to authenticated using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

do $$
declare t text;
begin
  foreach t in array array['boxes','seasons','ring_sequences','birds','pairings','clutches','comments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_owner()) with check (public.is_owner())',
      t || '_owner_all', t);
  end loop;
end $$;
revoke all on public.allowed_users from anon;
