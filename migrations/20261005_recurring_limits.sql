-- Limites do modulo de assinaturas recorrentes por plano.
--
--   recurring_plans        -> planos recorrentes ativos do parceiro
--   active_subscriptions   -> assinaturas nao terminais (nao cancelled/expired)
--
-- Valores:
--   free / crescer = 0     -> o modulo e' exclusivo do Escalar; 0 da protecao
--                             em dupla camada alem do gate de tier.
--   escalar / demais = 999999 -> padrao "ilimitado" ja usado pelos limites de
--                             itens/pedidos do proprio plano Escalar.

BEGIN;

UPDATE public.plans
SET limits_json =
      COALESCE(limits_json, '{}'::jsonb) ||
      CASE
        WHEN slug IN ('free', 'crescer')
          THEN '{"recurring_plans": 0, "active_subscriptions": 0}'::jsonb
        ELSE '{"recurring_plans": 999999, "active_subscriptions": 999999}'::jsonb
      END,
    updated_at = NOW()
WHERE NOT (limits_json ? 'recurring_plans');

COMMENT ON COLUMN public.plans.limits_json IS
  'Limites do plano. Chaves do modulo recorrente: recurring_plans (planos ativos) '
  'e active_subscriptions (assinaturas nao terminais); 0 = modulo indisponivel, '
  '999999 = ilimitado.';

COMMIT;
