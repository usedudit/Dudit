-- Fix: Atualizar check constraint de payment_status na tabela appointments para incluir 'pending'
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_payment_status_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_payment_status_check 
  CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid', 'refunded', 'pending'));
