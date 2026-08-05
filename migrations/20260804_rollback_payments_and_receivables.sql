-- ==============================================================================
-- ROLLBACK — PAYMENTS & RECEIVABLES (Fase 1)
-- Data: 2026-08-04 | Projeto: Dudit
-- Descrição: Remove exatamente o que a migration 20260804 criou, em ordem
-- inversa de dependência. Nenhuma estrutura pré-existente é tocada.
--
-- ATENÇÃO: só execute após confirmar que não há dados a preservar em
-- payments/receivables (esta fase ainda não é usada por nenhum fluxo).
-- ==============================================================================

BEGIN;

-- 1. Triggers (dependem das tabelas e da função compartilhada — a função
--    update_updated_at_column() NÃO é dropada: é pré-existente e compartilhada)
DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
DROP TRIGGER IF EXISTS trg_receivables_updated_at ON public.receivables;

-- 2. Receivables antes de payments (FK receivables.payment_id → payments)
--    DROP TABLE remove índices e policies RLS automaticamente (CASCADE).
DROP TABLE IF EXISTS public.receivables;
DROP TABLE IF EXISTS public.payments;

COMMIT;
