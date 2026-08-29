-- Migration: 20260829_simplify_quote_and_os_number_formats.sql
-- Description: Simplifica o formato de numeração de Orçamentos (ORC00005) e Ordens de Serviço (OS00005)

-- 1. Garante que as sequences existam
CREATE SEQUENCE IF NOT EXISTS public.quote_number_seq START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS public.service_order_number_seq START 1 INCREMENT 1;

-- 2. Atualiza a função geradora de números de orçamento (ex: ORC00001, ORC00005)
CREATE OR REPLACE FUNCTION public.generate_quote_number()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq_val BIGINT;
BEGIN
  seq_val := nextval('public.quote_number_seq');
  RETURN 'ORC' || lpad(seq_val::TEXT, 5, '0');
END;
$$;

-- 3. Atualiza a função geradora de números de ordens de serviço (ex: OS00001, OS00005)
CREATE OR REPLACE FUNCTION public.generate_service_order_number()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq_val BIGINT;
BEGIN
  seq_val := nextval('public.service_order_number_seq');
  RETURN 'OS' || lpad(seq_val::TEXT, 5, '0');
END;
$$;

-- 4. Notifica o PostgREST para recarregar o schema de funções
NOTIFY pgrst, 'reload schema';
