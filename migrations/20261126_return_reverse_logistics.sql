-- ============================================================================
-- Logística reversa em solicitações de troca e devolução (return_requests).
--
--   reverse_logistics_method:
--     'not_required'      - não precisa devolver fisicamente o item
--     'in_person'         - devolução presencial na loja
--     'own_pickup'        - coleta própria / motoboy
--     'carrier_label'     - transportadora / Correios (etiqueta SuperFrete)
--     'customer_shipping' - envio por conta do cliente (sem etiqueta no sistema)
--
--   reverse_logistics_status:
--     'not_required' | 'pending' | 'scheduled' | 'in_transit' | 'received'
--
--   reverse_logistics_tracking_code - código de rastreio (quando envio próprio/externo)
--   reverse_logistics_notes         - instruções/detalhes da coleta ou devolução
--
--   (return_freight_payer já existe via 20260930_return_freight_payer.sql)
-- ============================================================================

ALTER TABLE public.return_requests
  ADD COLUMN IF NOT EXISTS reverse_logistics_method TEXT NULL
    CHECK (reverse_logistics_method IN ('not_required', 'in_person', 'own_pickup', 'carrier_label', 'customer_shipping')),
  ADD COLUMN IF NOT EXISTS reverse_logistics_status TEXT NULL
    CHECK (reverse_logistics_status IN ('not_required', 'pending', 'scheduled', 'in_transit', 'received')),
  ADD COLUMN IF NOT EXISTS reverse_logistics_tracking_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS reverse_logistics_notes TEXT NULL;

COMMENT ON COLUMN public.return_requests.reverse_logistics_method IS
  'Modalidade de logística reversa: not_required | in_person | own_pickup | carrier_label | customer_shipping.';
COMMENT ON COLUMN public.return_requests.reverse_logistics_status IS
  'Status da devolução física do item: not_required | pending | scheduled | in_transit | received.';
COMMENT ON COLUMN public.return_requests.reverse_logistics_tracking_code IS
  'Código de rastreio informado manualmente quando não há etiqueta gerada no sistema.';
COMMENT ON COLUMN public.return_requests.reverse_logistics_notes IS
  'Instruções ou detalhes da logística reversa (ex.: agendamento de motoboy, horário de entrega na loja).';
