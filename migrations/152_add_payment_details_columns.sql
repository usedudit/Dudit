-- Add payment details columns to orders table

-- Add payment_provider column (Mercado Pago, Dinheiro, etc)
ALTER TABLE orders ADD COLUMN payment_provider VARCHAR(50);

-- Add mp_date_approved column to store when MP payment was approved
ALTER TABLE orders ADD COLUMN mp_date_approved TIMESTAMP WITH TIME ZONE;
