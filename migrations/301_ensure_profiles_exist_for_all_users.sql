-- Ensure all auth.users have a corresponding profile
-- This fixes the foreign key error when adding items to cart

-- Insert profiles for any auth.users that don't have one
insert into public.profiles (id, email, full_name)
select 
  au.id,
  au.email,
  coalesce(au.raw_user_meta_data ->> 'full_name', au.email)
from auth.users au
where not exists (
  select 1 from public.profiles p where p.id = au.id
)
on conflict (id) do nothing;

-- Also ensure user_profiles exists for all users
insert into public.user_profiles (user_id, full_name, pending_partner_registration)
select 
  au.id,
  coalesce(au.raw_user_meta_data ->> 'full_name', au.email),
  false
from auth.users au
where not exists (
  select 1 from public.user_profiles up where up.user_id = au.id
)
on conflict (user_id) do nothing;
