-- Fix cart_items table structure
-- This migration ensures cart_items has proper foreign key to profiles
-- and that the 'selected' column exists for cart item selection

-- Drop the existing constraint if it references the wrong table
alter table if exists public.cart_items drop constraint if exists cart_items_user_id_fkey;

-- Re-add constraint to profiles(id)
alter table public.cart_items
  add constraint cart_items_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

-- Ensure selected column exists (added in later version)
alter table public.cart_items add column if not exists selected boolean default true;
