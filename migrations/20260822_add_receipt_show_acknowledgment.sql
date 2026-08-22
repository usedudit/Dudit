-- =============================================================================
-- Migration: Add receipt_show_acknowledgment to partner_return_policies
-- =============================================================================

ALTER TABLE public.partner_return_policies
ADD COLUMN IF NOT EXISTS receipt_show_acknowledgment BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.partner_return_policies.receipt_show_acknowledgment IS
'Indica se o recibo de venda deve exibir o termo de confirmação de recebimento e linha de assinatura do cliente.';
