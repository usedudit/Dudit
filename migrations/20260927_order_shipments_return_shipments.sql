-- ============================================================================
-- Reverse logistics support for order_shipments.
--
--   kind             - shipment direction: 'outbound' (store -> buyer) or
--                      'return' (buyer -> store, reverse logistics label)
--   return_request_id- set for kind='return'; links the reverse shipment to
--                      its return request.
--
-- Existing rows are all outbound labels; the default keeps them unchanged.
-- ============================================================================

ALTER TABLE public.order_shipments
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'outbound'
    CHECK (kind IN ('outbound', 'return')),
  ADD COLUMN IF NOT EXISTS return_request_id UUID NULL
    REFERENCES public.return_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_shipments_return_request
  ON public.order_shipments (return_request_id)
  WHERE return_request_id IS NOT NULL;

COMMENT ON COLUMN public.order_shipments.kind IS
  'Shipment direction: outbound (store -> buyer) or return (buyer -> store, reverse logistics).';
COMMENT ON COLUMN public.order_shipments.return_request_id IS
  'Set for kind=return; links the reverse shipment to its return request.';
