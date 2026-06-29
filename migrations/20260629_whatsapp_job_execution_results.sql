-- Adiciona colunas de resultado de execução em whatsapp_scheduled_jobs
-- Separamos status (ciclo de vida) de result_status (resultado da execução)

ALTER TABLE whatsapp_scheduled_jobs
  ADD COLUMN IF NOT EXISTS result_status text,
  ADD COLUMN IF NOT EXISTS result_reason text,
  ADD COLUMN IF NOT EXISTS message_id uuid,
  ADD COLUMN IF NOT EXISTS provider_message_id text;
