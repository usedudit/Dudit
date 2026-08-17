-- ============================================================
-- 20260817_create_legal_consents.sql
-- Registro de aceite dos Termos de Uso e Política de Privacidade.
--
-- Duas tabelas:
--  1) legal_documents      : versões publicadas de cada documento.
--  2) user_legal_consents  : histórico append-only de cada aceite.
--
-- APÓS APLICAR ESTA MIGRATION, registrar as versões vigentes com o hash
-- real (SHA-256 do texto publicado):
--
--   npm run seed:legal -- terms 1.0 ./docs/termos-v1-agosto-2026.txt
--   npm run seed:legal -- privacy 1.0 ./docs/privacidade-v1-agosto-2026.txt
-- ============================================================

-- 1. Versões publicadas dos documentos legais
CREATE TABLE IF NOT EXISTS public.legal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('terms', 'privacy')),
  versao TEXT NOT NULL,
  conteudo_hash TEXT,
  url TEXT,
  publicado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  vigente_em TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tipo, versao)
);

COMMENT ON TABLE public.legal_documents IS 'Versões publicadas dos documentos legais (Termos de Uso e Política de Privacidade).';
COMMENT ON COLUMN public.legal_documents.conteudo_hash IS 'SHA-256 do texto publicado. Prova do conteúdo exato que foi aceito.';
COMMENT ON COLUMN public.legal_documents.vigente_em IS 'Data em que a versão entra em vigor (Termos: 10 dias após publicação; Privacidade: imediato).';

-- 2. Histórico de aceites (append-only, imutável para o usuário)
CREATE TABLE IF NOT EXISTS public.user_legal_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  documento_id UUID REFERENCES public.legal_documents(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('terms', 'privacy')),
  versao TEXT NOT NULL,
  conteudo_hash TEXT,
  origem TEXT NOT NULL DEFAULT 'signup' CHECK (origem IN ('signup', 'oauth', 'reconsent', 'migration')),
  aceito_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_legal_consents IS 'Histórico de aceites dos usuários. Append-only: usuário pode ler as próprias linhas, mas não alterar ou apagar.';
COMMENT ON COLUMN public.user_legal_consents.origem IS 'Origem do aceite: signup (formulário), oauth (Google), reconsent (nova versão) ou migration (backfill).';

CREATE INDEX IF NOT EXISTS idx_user_legal_consents_user_tipo
  ON public.user_legal_consents (user_id, tipo, aceito_em DESC);

CREATE INDEX IF NOT EXISTS idx_legal_documents_tipo_vigente
  ON public.legal_documents (tipo, vigente_em DESC);

-- RLS
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_legal_consents ENABLE ROW LEVEL SECURITY;

-- Documentos legais são públicos (páginas institucionais)
DROP POLICY IF EXISTS legal_documents_public_read ON public.legal_documents;
CREATE POLICY legal_documents_public_read
  ON public.legal_documents FOR SELECT
  USING (true);

-- Usuário lê somente as próprias linhas de consentimento (LGPD)
DROP POLICY IF EXISTS user_legal_consents_own_select ON public.user_legal_consents;
CREATE POLICY user_legal_consents_own_select
  ON public.user_legal_consents FOR SELECT
  USING (auth.uid() = user_id);

-- Usuário autenticado pode registrar re-consentimento da própria conta.
-- Os inserts de cadastro (pré-confirmação de e-mail / OAuth) usam o client
-- service_role via server action, que ignora RLS.
DROP POLICY IF EXISTS user_legal_consents_own_insert ON public.user_legal_consents;
CREATE POLICY user_legal_consents_own_insert
  ON public.user_legal_consents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Sem política de UPDATE/DELETE: o histórico não pode ser alterado pelo usuário.