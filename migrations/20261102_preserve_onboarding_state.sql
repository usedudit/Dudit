-- ============================================================================
-- GUIA DE CONFIGURAÇÃO (onboarding) — flag write-once em `business_info`
-- ============================================================================
--
-- `partners.business_info.onboardingCompleted` é a fonte de verdade que faz o
-- botão "Guia de Configuração" sumir depois de concluído.
--
-- Fluxos que reconstruíam o `business_info` do zero (salvar em "Gerenciar
-- recursos", trocar o modo de negócio, editar o perfil da loja) apagavam essa
-- flag, e o guia voltava a aparecer na home do ERP mesmo para quem já tinha
-- concluído.
--
-- Esta migration:
--   1. Recupera a flag dos parceiros afetados usando a loja como fonte
--      (o wizard grava a flag nos dois níveis: parceiro e loja).
--   2. Instala um trigger que torna a flag write-once: uma vez concluído, o
--      guia não volta a aparecer, mesmo que algum fluxo futuro escreva o
--      `business_info` sem as flags de onboarding.
--
-- Para reexibir o guia de propósito para um parceiro, desabilite o trigger:
--   ALTER TABLE public.partners DISABLE TRIGGER trg_partners_preserve_onboarding;
--   UPDATE public.partners
--      SET business_info = business_info - 'onboardingCompleted'
--    WHERE id = '<partner_id>';
--   ALTER TABLE public.partners ENABLE TRIGGER trg_partners_preserve_onboarding;

BEGIN;

-- ─── 1. Recuperação da flag apagada ────────────────────────────────────────
-- Usa a loja mais recente que ainda possui a flag. `DISTINCT ON` garante uma
-- única linha por parceiro (evita atualização não determinística quando o
-- parceiro tem várias lojas).
UPDATE public.partners p
SET business_info = COALESCE(p.business_info, '{}'::jsonb) || jsonb_build_object(
        'onboardingCompleted', true,
        'onboardingGoals', COALESCE(s.business_info -> 'onboardingGoals', '[]'::jsonb),
        'onboardingCompletedAt', COALESCE(
            s.business_info ->> 'onboardingCompletedAt',
            to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )
    )
FROM (
    SELECT DISTINCT ON (partner_id)
        partner_id,
        business_info
    FROM public.stores
    WHERE business_info IS NOT NULL
      AND (business_info ->> 'onboardingCompleted') = 'true'
    ORDER BY partner_id,
             (business_info ->> 'onboardingCompletedAt') DESC NULLS LAST,
             updated_at DESC NULLS LAST
) s
WHERE s.partner_id = p.id
  AND COALESCE(p.business_info ->> 'onboardingCompleted', 'false') <> 'true';

-- ─── 2. Trigger write-once ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.preserve_onboarding_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.business_info IS NULL OR OLD.business_info IS NULL THEN
        RETURN NEW;
    END IF;

    -- Só reage quando o registro antigo já estava concluído e o novo tenta
    -- remover (ou inverter) a flag.
    IF (OLD.business_info ->> 'onboardingCompleted') = 'true'
       AND COALESCE(NEW.business_info ->> 'onboardingCompleted', 'false') <> 'true' THEN
        NEW.business_info := NEW.business_info || jsonb_build_object(
            'onboardingCompleted', true,
            'onboardingGoals', COALESCE(OLD.business_info -> 'onboardingGoals', '[]'::jsonb),
            'onboardingCompletedAt', COALESCE(
                OLD.business_info ->> 'onboardingCompletedAt',
                to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.preserve_onboarding_state() IS
    'Mantém as flags de onboarding (Guia de Configuração) write-once em partners/stores.business_info.';

DROP TRIGGER IF EXISTS trg_partners_preserve_onboarding ON public.partners;
CREATE TRIGGER trg_partners_preserve_onboarding
    BEFORE UPDATE OF business_info ON public.partners
    FOR EACH ROW
    EXECUTE FUNCTION public.preserve_onboarding_state();

DROP TRIGGER IF EXISTS trg_stores_preserve_onboarding ON public.stores;
CREATE TRIGGER trg_stores_preserve_onboarding
    BEFORE UPDATE OF business_info ON public.stores
    FOR EACH ROW
    EXECUTE FUNCTION public.preserve_onboarding_state();

COMMIT;
