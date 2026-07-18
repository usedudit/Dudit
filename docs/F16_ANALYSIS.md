# F16 — Análise Técnica

## Contexto

Após 15 fases de store-awareness, **31 tabelas** estão completas. Restam ~105 tabelas de partner sem `store_id`. Esta análise prioriza a próxima fase com base em: valor de negócio, risco técnico, dependências, e esforço.

---

## Critérios de Priorização

| Critério | Peso | Descrição |
|----------|------|-----------|
| Risco de vazamento | Alto | Loja A acessar dados da Loja B |
| Esforço de implementação | Médio | Quantidade de arquivos/tabelas |
| Dependências | Alto | Bloqueia outras fases |
| Valor de negócio | Alto | Feature requestada por clientes |
| Completude | Médio | Finalizar área já parcialmente feita |

---

## Candidatos

### Opção A: Promoções/Cupons — RLS + Actions

**Tabelas:** `promotions`, `campaigns`, `coupons` + child tables (12 no total)

**Já existe:**
- Bridge tables `promotion_stores` e `coupon_stores` (F13)
- RLS atual: `partner_id IN (get_user_partner_ids())` sem store check
- Actions de promoção/cupom existentes

**O que fazer:**
1. RLS em `promotions`/`campaigns`: adicionar `AND (store_id IS NULL OR EXISTS SELECT 1 FROM promotion_stores WHERE promotion_id = id AND user_has_store_access(store_id))`
2. Mesmo padrão para `coupons` via `coupon_stores`
3. Actions: filtro store-aware nas listagens (padrão F14)
4. UI: toggle legados nas páginas de promoção/cupom

**Esforço:** Baixo (~5 arquivos)
**Risco:** Muito baixo (bridge tables já em produção)
**Valor:** Alto (lojas precisam de promoções independentes)
**Dependências:** Nenhuma

**Riscos:**
- RLS com subconsulta em bridge table: possível recursão. Solução: usar `get_user_partner_ids()` na bridge, não na promotion.
- Performance: `EXISTS` com bridge table é indexado.

---

### Opção B: Finance Accounts + Financial Categories

**Tabelas:** `finance_accounts`, `financial_categories`

**Já existe:**
- `transactions` store-aware (F9, completa)
- `payment_methods` referenciam `finance_accounts` por FK

**O que fazer:**
1. Adicionar `store_id` em `finance_accounts` e `financial_categories`
2. RLS store-aware
3. Actions: filtro store-aware
4. UI: toggle legados

**Esforço:** Médio (~8 arquivos)
**Risco:** Médio (finance_accounts referenciado por payment_methods + transactions)
**Valor:** Alto (cada loja pode ter contas separadas)
**Dependências:** F15 já finalizada (payment_methods store-aware)

**Riscos:**
- FK de `payment_methods` para `finance_accounts` (`default_finance_account_id`) — se conta é por loja, precisa validar consistência
- Relatório financeiro cross-store precisa ser partner-level

---

### Opção C: Empréstimos (Devoluções/Trocas)

**Tabelas:** `return_requests` + 7 child tables

**Já existe:**
- `orders` store-aware (store_id + RLS)
- Returns vinculados a orders por FK

**O que fazer:**
1. Adicionar `store_id` em `return_requests`
2. Propagar para child tables via trigger ou application
3. RLS store-aware
4. Actions: filtro store-aware
5. UI: toggle legados

**Esforço:** Alto (~12 arquivos, UI complexa)
**Risco:** Alto (integração com marketplace + fluxo de reembolso)
**Valor:** Médio (devoluções seguem a loja do pedido original)
**Dependências:** Orders store-aware (já completo)

**Riscos:**
- Fluxo de reembolso (Mercado Pago) pode precisar de store_id
- Store credits vinculados à loja de origem
- Regras de SLA (return_policies) podem ser globais

---

### Opção D: Configurações Financeiras (F15 Leftovers)

**Escopo:** Corrigir os ~5 gaps críticos de runtime identificados na auditoria F15

**O que fazer:**
1. `delivery_payer` snapshots em 5 locais — adicionar store awareness
2. `pdv.ts:120` e `orders.ts:244` — fee resolution com store filtering
3. `usePaymentMethods` hook — aceitar storeId

**Esforço:** Baixo (~7 arquivos)
**Risco:** Médio (mexe em cálculo de fee de pedido — regression)
**Valor:** Alto (fecha gaps que podem causar erro em override de loja)
**Dependências:** F15

**Riscos:**
- Mudar snapshot pode alterar valor final de pedidos existentes
- `delivery_payer` correto depende de ter delivery_settings por loja (já implementado)

---

## Recomendação

### Fase 16 Sugerida: **Opção A — Promoções/Cupons RLS + Actions**

**Justificativa:**

| Critério | Opção A | Opção B | Opção C | Opção D |
|----------|---------|---------|---------|---------|
| Risco | ✅ Muito baixo | ⚠️ Médio | ❌ Alto | ⚠️ Médio |
| Esforço | ✅ Baixo | ⚠️ Médio | ❌ Alto | ✅ Baixo |
| Valor | ✅ Alto | ✅ Alto | ⚠️ Médio | ✅ Alto |
| Dependências | ✅ Nenhuma | ✅ Nenhuma | ✅ Nenhuma | ⚠️ Requer F15 |
| Bridge existe | ✅ Sim | ❌ Não | ❌ Não | N/A |

**Motivos:**
1. **Menor risco:** Bridge tables já existem e estão em produção desde F13. Nenhuma migration de schema.
2. **Escopo focado:** Apenas RLS + actions + UI. Sem ALTER TABLE, sem FK migration, sem dados existentes para migrar.
3. **Valor imediato:** Loja A cria promoção sem Loja B ver. Completa o que F13 começou.
4. **Acelera roadmap:** Fase rápida (estimativa: 2-3 dias) que libera equipe para fases maiores.

**Contra:**
- Não resolve os gaps de runtime da F15 (Opção D)
- Finance accounts continuam não-store-aware (Opção B)

**Sugestão:** Se F16 for rápida, planejar F16 = Opção A, F17 = Opção D (leftovers), F18 = Opção B.

---

## Escopo Detalhado — F16 (Promoções/Cupons)

### Tabelas Afetadas

| Tabela | Ação | Justificativa |
|--------|------|---------------|
| `promotions` | RLS: adicionar store check via `promotion_stores` | Já tem `partner_id`, bridge existe |
| `campaigns` | RLS: idem | Mesmo pattern |
| `promotion_products` | Nenhuma (herda de promotions) | RLS da parent protege |
| `promotion_categories` | Nenhuma | Idem |
| `promotion_services` | Nenhuma | Idem |
| `promotion_usages` | Nenhuma | Idem |
| `promotion_stores` | Já store-aware (F13) | Apenas confirmar RLS |
| `coupons` | RLS: adicionar store check via `coupon_stores` | Já tem `partner_id`, bridge existe |
| `coupon_products` | Nenhuma (herda de coupons) | RLS da parent protege |
| `coupon_categories` | Nenhuma | Idem |
| `coupon_services` | Nenhuma | Idem |
| `coupon_usages` | Nenhuma | Idem |
| `coupon_customers` | Nenhuma | Idem |
| `coupon_stores` | Já store-aware (F13) | Apenas confirmar RLS |

### RLS Pattern

```sql
-- promotions
DROP POLICY IF EXISTS promotions_partner_users ON promotions;
CREATE POLICY promotions_partner_users ON promotions
  FOR ALL USING (
    partner_id IN (SELECT get_user_partner_ids())
    AND (
      id IN (SELECT promotion_id FROM promotion_stores WHERE user_has_store_access(store_id))
      OR NOT EXISTS (SELECT 1 FROM promotion_stores WHERE promotion_id = id)  -- sem store vinculada = global
    )
  );
```

### Actions

- `listActivePromotionsInBatch` / `getPartnerPromotions` — aceitar `storeId`, filtrar por store
- `createPromotionAction` — aceitar `storeId`, criar bridge record
- `updatePromotionAction` — field-locking em store_id
- `deletePromotionAction` — requireStoreAccess

### UI

- Páginas de promoção: toggle "Legados" (padrão F14)
- Formulário de criação: seletor de loja (ou "Todas as lojas")
- Grid/lista: filtro por store ativa

### Dependências Técnicas

| Dependência | Status |
|-------------|--------|
| `get_user_partner_ids()` EXISTS | ✅ F3 |
| `user_has_store_access()` EXISTS | ✅ F3 |
| `promotion_stores` bridge | ✅ F13 |
| `coupon_stores` bridge | ✅ F13 |
| `getUserPartnerIds()` no frontend | ✅ hook exists |
| Store selector component | ✅ reutilizar de F14/F15 |

### Estimativa de Esforço

| Atividade | Arquivos | Estimativa |
|-----------|----------|------------|
| Migration RLS (SQL) | 1 | 2h |
| Actions store-aware | 3 | 4h |
| UI toggle + filtro | 4 | 6h |
| TypeScript + testes | 2 | 2h |
| **Total** | **~10** | **14h (~2 dias)** |

---

## Alternativa: F16 como "Cleanup" (Opção D)

Se preferir fechar os gaps de runtime da F15 antes de iniciar nova funcionalidade:

| Atividade | Arquivos | Risco |
|-----------|----------|-------|
| `delivery_payer` snapshots (5 locais) | 5 | Médio |
| `pdv.ts:120` fee resolution | 1 | Alto |
| `orders.ts:244` fee resolution | 1 | Alto |
| `usePaymentMethods` hook | 4 | Baixo |
| **Total** | **~11** | **Médio-Alto** |

Recomendo **Opção A** como F16 e **Opção D** como F17, pois:
1. Opção A não mexe em cálculo de fee (menos regression)
2. Opção A é schema-free (só RLS)
3. Opção D requer mais testes de regressão
