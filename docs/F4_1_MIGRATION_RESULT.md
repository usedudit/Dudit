# F4.1 — Migration Result

> Status: ✅ Concluída
> Data: 2026-07-18
> Fase 4.0 audit: `docs/F4_LEGACY_STORE_ID_AUDIT.md`

---

## Resumo

**Objetivo:** Parar writes em colunas `store_id` legadas e criar writes equivalentes nas bridge tables.

**Sem DROP COLUMN:** Colunas ainda existem para compatibilidade. Remoção será na Fase 4.3.

**Sem alteração de RLS:** Políticas ainda referenciam `store_id` legacy até Fase 4.2.

---

## Arquivos Alterados

### TypeScript (5 arquivos)

| Arquivo | Mudança | Risco |
|---------|---------|-------|
| `app/actions/erp/products.ts:44` | Add import `linkProductToStore` | 🟢 |
| `app/actions/erp/products.ts:434` | Remove `store_id: finalStoreId` do `productData` | 🔴 |
| `app/actions/erp/products.ts:549` | Add `linkProductToStore(insertedProduct.id, finalStoreId)` | 🟡 |
| `app/actions/erp/servicos.ts:110` | Add import `linkServiceToStore` | 🟢 |
| `app/actions/erp/servicos.ts:174` | Remove `store_id: finalStoreId` do `serviceData` | 🔴 |
| `app/actions/erp/servicos.ts:244` | Add `linkServiceToStore(inserted.id, finalStoreId)` | 🟡 |
| `app/actions/erp/servicos.ts:600` | Add `linkServiceToStore` em `duplicateServiceAction` | 🟡 |
| `lib/erp/import/batch-importer.ts:7` | Add import `linkServiceToStore` | 🟢 |
| `lib/erp/import/batch-importer.ts:604` | Remove `store_id: storeId` do `serviceData` | 🟡 |
| `lib/erp/import/batch-importer.ts:638-646` | Add `linkServiceToStore` loop após batch insert | 🟡 |
| `app/actions/erp/customers.ts:732` | Remove `store_id` do SELECT | 🟡 |
| `app/actions/erp/customers.ts:756-761` | Remove sort por `store_id` | 🟡 |
| `app/actions/erp/customers.ts:881-883` | Remove filter `.eq("store_id", options.storeId)` | 🟡 |

### SQL Migrations (3 novas)

| Migration | Arquivo | Mudança |
|-----------|---------|---------|
| F4.1a | `migrations/f4_1a_update_create_product_rpc.sql` | `create_product_transaction`: remove `store_id` do INSERT, cria `store_products` |
| F4.1b | `migrations/f4_1b_update_xml_import_rpc.sql` | `execute_xml_import`: remove `store_id` do INSERT, cria `store_products` |
| F4.1c | `migrations/f4_1c_migrate_legacy_bridges.sql` | Migra dados: `suppliers` → `store_suppliers`, `product_kits` → `store_product_kits` |

---

## Quantidade de Registros Migrados (pós-F4.1c)

> Executar no banco após aplicar a migration:

```sql
-- store_suppliers (suppliers com store_id ≠ bridge já existente)
SELECT COUNT(*) AS migrados FROM store_suppliers ss
WHERE EXISTS (SELECT 1 FROM suppliers s WHERE s.id = ss.supplier_id AND s.store_id = ss.store_id);

-- store_product_kits (product_kits com store_id ≠ bridge já existente)
SELECT COUNT(*) AS migrados FROM store_product_kits spk
WHERE EXISTS (SELECT 1 FROM product_kits pk WHERE pk.id = spk.kit_id AND pk.store_id = spk.store_id);

-- Ainda legacy (aguardando F4.3)
SELECT 'products' AS tabela, COUNT(*) AS com_store_id FROM products WHERE store_id IS NOT NULL
UNION ALL
SELECT 'services', COUNT(*) FROM services WHERE store_id IS NOT NULL
UNION ALL
SELECT 'customers', COUNT(*) FROM customers WHERE store_id IS NOT NULL;

-- Bridge já existentes (backfills anteriores de F5/F6)
SELECT 'store_products' AS bridge, COUNT(*) AS total FROM store_products
UNION ALL
SELECT 'store_services', COUNT(*) FROM store_services;
```

---

## Validações Executadas

### ✅ TypeScript

- [x] `npx tsc --noEmit` — zero erros

### Pendentes (após aplicar migrations no banco)

- [ ] Criar produto em Loja A → confirmar `store_products` criado (não `products.store_id`)
- [ ] Criar serviço em Loja A → confirmar `store_services` criado (não `services.store_id`)
- [ ] Duplicar serviço → confirmar bridge preservada
- [ ] Importar XML → confirmar `store_products` criado para novos produtos
- [ ] Importar serviços via batch → confirmar `store_services` criado
- [ ] Listar clientes → confirmar sem `store_id` no retorno
- [ ] Fornecedores e kits migrados → confirmar dados em `store_suppliers` / `store_product_kits`
- [ ] PDP Loja A mostra produto exclusivo de Loja B? → não deve mostrar
- [ ] PDP Loja A mostra reviews apenas da Loja A + globais → OK (corrigido na ressalva 2)

---

## Riscos Restantes

| Risco | Status | Mitigação |
|-------|--------|-----------|
| RLS policies ainda usam `store_id` nas tabelas base | ⏳ Fase 4.2 | Coluna ainda existe, RLS continua funcionando |
| `products.store_id` ainda populado (legado) | ⏳ Fase 4.3 | Backfill F5 já copiou para `store_products` |
| `services.store_id` ainda populado (legado) | ⏳ Fase 4.3 | Backfill F6 já copiou para `store_services` |
| `suppliers.store_id` ainda populado | ⏳ Fase 4.3 | F4.1c migrou para `store_suppliers` |
| `product_kits.store_id` ainda populado | ⏳ Fase 4.3 | F4.1c migrou para `store_product_kits` |
| `customers.store_id` ainda populado | ⏳ Fase 4.3 | Sem bridge — coluna será apenas removida |
| `fetchStoreSuppliers` ainda lê `suppliers.store_id` | 🟢 Baixo | Coluna ainda existe; atualizar em F4.2 |
| `product_kits_select_policy` usa `store_id` | 🟢 Baixo | Coluna ainda existe; atualizar em F4.2 |

---

## Fluxo de Dados Pós-F4.1

### Criação de Produto (ERP)
```
products.ts → remove store_id do payload JSON
         → chama RPC create_product_transaction
         → RPC cria products (sem store_id)
         → RPC cria store_products (bridge)
```

### Criação de Serviço (ERP)
```
servicos.ts → remove store_id do INSERT
          → INSERT INTO services (sem store_id)
          → linkServiceToStore() → INSERT INTO store_services
```

### Importação XML
```
xml-import.ts → chama RPC execute_xml_import(p_store_id)
            → RPC cria products (sem store_id)
            → RPC cria store_products (bridge)
```

### Leitura (não alterado — column still exists)
```
resolveProduct(storeId) → busca store_products + products
_getMarketplaceProductBase(id, storeId) → resolveProduct
_store page → fetchStoreProducts → store_products
```

---

## Aprovação para Fase 4.2

Pré-requisitos para avançar:

- [ ] Migrations F4.1a/b/c aplicadas no banco
- [ ] Validações pendentes acima executadas e aprovadas
- [ ] Nenhum fluxo quebrado (create/read/update/delete de produtos, serviços, clientes, fornecedores, kits)
- [ ] Bridge tables populadas corretamente
- [ ] Rollback disponível (reverter código + migrations)
