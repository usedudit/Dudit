-- Fix OAuth profile creation issue
-- The problem: trigger tries to insert into user_profiles which doesn't exist

-- 1. Create the user_profiles table that's missing
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  pending_partner_registration boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.user_profiles enable row level security;

create policy "user_profiles_select_own"
  on public.user_profiles for select
  using (auth.uid() = user_id);

create policy "user_profiles_insert_own"
  on public.user_profiles for insert
  with check (auth.uid() = user_id);

create policy "user_profiles_update_own"
  on public.user_profiles for update
  using (auth.uid() = user_id);

-- 2. Fix the trigger to handle errors better and only use profiles table
-- (user_profiles will be managed separately or by the API)
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  final_name text;
begin
  -- Determine the final name: use provided name or generate from email
  final_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    public.generate_name_from_email(new.email)
  );

  -- Insert into profiles table only
  -- This is the main table that stores user info
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    final_name
  )
  on conflict (id) do update
  set email = EXCLUDED.email, full_name = EXCLUDED.full_name;

  return new;
exception when others then
  -- Log the error but don't fail - the signup will succeed even if profile creation fails
  raise notice 'Error in handle_new_user for user %: %', new.id, SQLERRM;
  return new;
end;
$$;

-- Create trigger that fires when a new user is created
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- 3. Ensure all existing auth users have profiles
insert into public.profiles (id, email, full_name)
select 
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', public.generate_name_from_email(u.email))
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;
