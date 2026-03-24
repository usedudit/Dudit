-- Fix OAuth profile creation by removing invalid table reference
-- The trigger was trying to insert into non-existent 'profiles' table

-- Drop the problematic trigger
drop trigger if exists on_auth_user_created on auth.users;

-- Drop the problematic function
drop function if exists public.handle_new_user() cascade;

-- Create a corrected function that only uses user_profiles
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

  -- Create user profile (always for all new users)
  insert into public.user_profiles (id, user_id, full_name, pending_partner_registration)
  values (
    gen_random_uuid(),
    new.id,
    final_name,
    false
  )
  on conflict do nothing;

  return new;
exception when others then
  -- Log error but don't fail the auth process
  raise warning 'Error creating user profile: %', sqlerrm;
  return new;
end;
$$;

-- Create trigger that fires when a new user is created
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Backfill user_profiles for any existing auth users who don't have a profile
insert into public.user_profiles (id, user_id, full_name, pending_partner_registration)
select 
  gen_random_uuid(),
  au.id,
  coalesce(
    au.raw_user_meta_data ->> 'full_name',
    split_part(au.email, '@', 1)
  ),
  false
from auth.users au
left join public.user_profiles up on au.id = up.user_id
where up.user_id is null
on conflict do nothing;

-- Verify the trigger was created correctly
select trigger_name, event_manipulation, event_object_table 
from information_schema.triggers 
where trigger_name = 'on_auth_user_created';
