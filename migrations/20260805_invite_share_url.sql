-- ============================================================================
-- Migration: Persist invite share URL
-- ============================================================================
-- O link de convite é gerado apenas no momento da criação (token raw só existe
-- ali). Para o admin da equipe poder copiar o link novamente da lista de
-- convites pendentes (sem regenerar/invalidar o convite), persistimos a URL
-- completa do convite nesta coluna.
--
-- O token já é armazenado com hash em token_hash; share_url guarda a versão
-- shareável (url + token raw) para os convites criados a partir de agora.
-- Convites pendentes legados ficam com share_url NULL e a UI mostra aviso.
-- ============================================================================

ALTER TABLE public.partner_invitations
ADD COLUMN IF NOT EXISTS share_url TEXT;

CREATE INDEX IF NOT EXISTS idx_partner_invitations_share_url
ON public.partner_invitations (share_url)
WHERE share_url IS NOT NULL;
