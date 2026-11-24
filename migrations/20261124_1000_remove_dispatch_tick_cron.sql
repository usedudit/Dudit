-- ============================================================================
-- Migration: 20261124_1000_remove_dispatch_tick_cron.sql
-- Descrição:
--   Remove o job pg_cron 'dudit_dispatch_tick' para eliminar execuções
--   ociosas por minuto no banco. O dispatch_tick() passa a rodar apenas
--   sob demanda (ao solicitar entrega, autorizar bônus, reatribuir ou
--   consultar status de solicitação ainda aberta).
-- ============================================================================

DO $cron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'dudit_dispatch_tick'
    AND database = current_database();
END
$cron$;
