-- Migration: Drop application_access_logs, purge function, and pg_cron job
-- Motivo: Logs de acesso HTTP brutos geram ruído (scans de bots), não capturam IP sem headers confiáveis,
-- e sobrecarregam o banco relacional desnecessariamente. A borda (Cloudflare) já retém logs de tráfego,
-- enquanto auditorias críticas de negócio e segurança utilizam audit_logs, admin_audit_logs e compliance_logs.

-- 1. Cancelar o agendamento no pg_cron (se ativo)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-application-access-logs') THEN
      PERFORM cron.unschedule('purge-application-access-logs');
    END IF;
  END IF;
END;
$$;

-- 2. Remover a function de expurgo
DROP FUNCTION IF EXISTS public.purge_old_application_access_logs();

-- 3. Dropar a tabela (índices, sequences de identity, policies de RLS e grants somem em cascata)
DROP TABLE IF EXISTS public.application_access_logs CASCADE;

