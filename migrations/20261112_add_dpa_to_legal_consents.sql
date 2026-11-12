-- ============================================================
-- Migration: 20261112_add_dpa_to_legal_consents.sql
-- Descrição:
--   Atualiza as constraints de tipo nas tabelas legal_documents
--   e user_legal_consents para suportar 'dpa' (Data Processing Agreement)
--   destinado aos Parceiros do módulo ERP.
-- ============================================================

-- 1. Atualizar CHECK constraint na tabela legal_documents
ALTER TABLE public.legal_documents
  DROP CONSTRAINT IF EXISTS legal_documents_tipo_check;

ALTER TABLE public.legal_documents
  ADD CONSTRAINT legal_documents_tipo_check
  CHECK (tipo IN ('terms', 'privacy', 'dpa'));

-- 2. Atualizar CHECK constraint de tipo na tabela user_legal_consents
ALTER TABLE public.user_legal_consents
  DROP CONSTRAINT IF EXISTS user_legal_consents_tipo_check;

ALTER TABLE public.user_legal_consents
  ADD CONSTRAINT user_legal_consents_tipo_check
  CHECK (tipo IN ('terms', 'privacy', 'dpa'));

-- 3. Atualizar CHECK constraint de origem na tabela user_legal_consents para suportar partner_activation
ALTER TABLE public.user_legal_consents
  DROP CONSTRAINT IF EXISTS user_legal_consents_origem_check;

ALTER TABLE public.user_legal_consents
  ADD CONSTRAINT user_legal_consents_origem_check
  CHECK (origem IN ('signup', 'oauth', 'reconsent', 'migration', 'partner_activation'));

COMMENT ON TABLE public.legal_documents IS 'Versões publicadas dos documentos legais (Termos de Uso, Política de Privacidade e DPA do ERP).';
