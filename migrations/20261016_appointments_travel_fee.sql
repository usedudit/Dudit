-- ============================================================================
-- MIGRATION: service attendance travel fee persisted on appointments
-- Data: 2026-10-16
-- Objetivo: gravar a taxa de deslocamento (service attendance) calculada no
--   momento do checkout diretamente no registro de agendamento, de modo que a
--   ordem de serviço fique com o valor final correto e o breakdown fique
--   auditável mesmo quando o preço do serviço for reprocessado.
-- ============================================================================

BEGIN;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS travel_fee NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS travel_fee_breakdown JSONB NULL;

COMMENT ON COLUMN public.appointments.travel_fee IS
  'Taxa de deslocamento cobrada ao cliente por atendimento a domicílio (service attendance).';
COMMENT ON COLUMN public.appointments.travel_fee_breakdown IS
  'Breakdown estruturado da taxa de deslocamento: { mode, distanceKm, maxKm, fee, freeTraveledKm, outOfRadius }.';

COMMIT;
