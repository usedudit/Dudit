-- Rollback de 20261005_recurring_store_backfill.sql.
--
-- Antes do backfill ambas as colunas eram populadas exclusivamente por NULL
-- (nenhuma acao as escrevia), entao o estado pre-feature e o reset total.

UPDATE recurring_subscriptions SET store_id = NULL;
UPDATE recurring_plans SET store_id = NULL;
