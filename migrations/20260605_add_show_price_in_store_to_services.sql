-- Migration to add show_price_in_store to services table
ALTER TABLE services ADD COLUMN IF NOT EXISTS show_price_in_store BOOLEAN DEFAULT true;
