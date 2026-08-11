-- ==============================================================================
-- DROP RECEIVABLES - Fase 2 (ledger único, Opção A)
-- Data: 2026-08-05 | Projeto: Dudit
-- ------------------------------------------------------------------------------
-- A tabela public.receivables foi criada na Fase 1 como candidata a camada de
-- contas a receber. Após a auditoria, a decisão foi evoluir o módulo existente
-- (installment_groups + transactions + transaction_payments) como fonte única -
-- receivables tornaria paralela a estrutura, exatamente o que queremos evitar.
--
-- A tabela está VAZIA (0 linhas) e SEM dependências (não é referenciada por
-- nenhum FK, código ou view). Rollback: ver 20260805_rollback_drop_receivables.sql.
-- ==============================================================================

BEGIN;

DROP TABLE IF EXISTS public.receivables;

COMMIT;