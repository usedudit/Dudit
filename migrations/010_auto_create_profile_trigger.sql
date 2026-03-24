-- Remove manual profile creation and use a trigger instead
-- This trigger automatically creates a profile when a new user signs up

-- Function to generate name from email
create or replace function public.generate_name_from_email(email text)
returns text
language plpgsql
immutable
as $$
declare
  name_part text;
  words text[];
  i integer;
  result text := '';
begin
  -- Extract the part before @
  name_part := split_part(email, '@', 1);
  
  -- Split by dots, dashes, or underscores and capitalize each word
  words := regexp_split_to_array(name_part, '[._-]+');
  
  -- Build the name by capitalizing each word
  for i in 1..array_length(words, 1) loop
    if words[i] != '' then
      if result = '' then
        result := initcap(words[i]);
      else
        result := result || ' ' || initcap(words[i]);
      end if;
    end if;
  end loop;
  
  return result;
end;
$$;

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

  -- Insert into profiles table
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    final_name
  )
  on conflict (id) do nothing;

  -- Insert into user_profiles table if user wants to be a partner
  if (new.raw_user_meta_data ->> 'wants_partner')::boolean = true then
    insert into public.user_profiles (user_id, full_name, pending_partner_registration)
    values (
      new.id,
      final_name,
      true
    )
    on conflict (user_id) do nothing;
  else
    -- Create user_profiles for regular users too
    insert into public.user_profiles (user_id, full_name, pending_partner_registration)
    values (
      new.id,
      final_name,
      false
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

-- Drop existing trigger if it exists
drop trigger if exists on_auth_user_created on auth.users;

-- Create trigger that fires when a new user is created
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
