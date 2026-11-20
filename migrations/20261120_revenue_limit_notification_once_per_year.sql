-- ============================================================================
-- Aviso de limite de faturamento: uma vez por entidade fiscal a cada ano
-- ----------------------------------------------------------------------------
-- Antes o dedupe dependia da própria linha em `notifications` existir. Como o
-- painel permite "Excluir todas" (e qualquer limpeza de notificações), o aviso
-- era recriado no próximo carregamento do painel - na prática, todo dia.
--
-- A marca passa a viver na entidade fiscal. Assim:
--   * o aviso é enviado uma única vez por ano, independentemente de a
--     notificação ter sido lida ou excluída;
--   * na virada do ano (`revenue_limit_notified_year < ano atual`) o aviso
--     volta a ficar disponível normalmente.
-- ============================================================================

BEGIN;

ALTER TABLE public.fiscal_entities
  ADD COLUMN IF NOT EXISTS revenue_limit_notified_year INTEGER;

COMMENT ON COLUMN public.fiscal_entities.revenue_limit_notified_year IS
  'Ano em que o aviso de limite de faturamento já foi enviado para esta entidade. Excluir a notificação não libera novo envio no mesmo ano.';

-- Backfill: quem já recebeu o alerta neste ano não deve receber outro logo
-- após o deploy. Usa o maior ano registrado nas notificações existentes.
UPDATE public.fiscal_entities fe
SET revenue_limit_notified_year = sub.max_year
FROM (
  SELECT
    entity_id,
    MAX((data->>'year')::int) AS max_year
  FROM public.notifications
  WHERE type = 'revenue_limit_alert'
    AND entity_id IS NOT NULL
    AND (data->>'year') ~ '^[0-9]{4}$'
  GROUP BY entity_id
) sub
WHERE fe.id = sub.entity_id
  AND (
    fe.revenue_limit_notified_year IS NULL
    OR fe.revenue_limit_notified_year < sub.max_year
  );

COMMIT;
