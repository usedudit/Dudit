-- ============================================================================
-- Quem paga o frete da remessa reversa (logística reversa), por devolução.
--
--   return_freight_payer - escolhido no modal de geração da etiqueta de
--     devolução; pré-preenchido com a política do parceiro
--     (partner_return_policies.shipping_payer).
--
--       'seller'       - vendedor paga: gera despesa financeira com
--                        vencimento de 30 dias após o pagamento do frete.
--       'customer'     - cliente paga: valor descontado do reembolso
--                        (return_requests.refund_amount) na quitação.
--       'case_by_case' - a combinar: nenhum lançamento automático.
--       NULL           - devolução anterior à feature (nenhum lançamento).
-- ============================================================================

ALTER TABLE public.return_requests
  ADD COLUMN IF NOT EXISTS return_freight_payer TEXT NULL
    CHECK (return_freight_payer IN ('seller', 'customer', 'case_by_case'));

COMMENT ON COLUMN public.return_requests.return_freight_payer IS
  'Quem paga o frete da remessa reversa: seller | customer | case_by_case (NULL = não definido).';
