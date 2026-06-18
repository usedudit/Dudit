# NF-e Import System — Resumo Completo

## Visão Geral

Sistema completo de importação de XML de NF-e que funciona como entrada de documento fiscal completo para o ERP Dudit, com preview assistido, matching de produtos, execução transacional, integração financeira e auditoria.

---

## Arquivos Criados / Modificados

### Migrations

| Arquivo | Descrição |
|---|---|
| `migrations/20260617_create_xml_import_system.sql` | Cria tabelas `xml_imports` e `xml_import_items` com RLS, índices, unique constraint `(partner_id, access_key)` |
| `migrations/20260617_create_xml_import_rpc.sql` | Cria RPC `execute_xml_import()` — transacional, `FOR UPDATE`, criação de produtos, atualização de estoque/custo, audit trail |
| `migrations/20260618_expand_xml_import_system.sql` | Expande schema: JSONB columns + modelo, protocolo, ambiente, finalidade, tipo_operacao, data_saida, inf_cpl, inf_ad_fisco, xml_hash, xml_size, duplicatas, raw_fiscal_detail |

### Server Actions

| Arquivo | Descrição |
|---|---|
| `app/actions/erp/xml-import.ts` | Todas as server actions: upload, preview, confirmação, listagem |

### Components

| Arquivo | Descrição |
|---|---|
| `components/erp/xml-import/XmlImportPageContent.tsx` | Página completa: lista/grid, sorting, ações, preview com SidebarCard/FormSection, checkbox contas a pagar |
| `components/erp/ERPSidebar.tsx` | Link "Importar XML (NF-e)" no menu Produtos |
| `components/erp/product/ProductsPage.tsx` | Botão "Importar XML" redireciona para `/erp/xml-import` |

### Parser

| Arquivo | Descrição |
|---|---|
| `lib/xml-parser.ts` | `parseNFeFull()` — extrai todos os blocos da NF-e |

---

## Schema do Banco

### xml_imports

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID PK | |
| `partner_id` | UUID FK → partners | Tenant |
| `supplier_id` | UUID FK → suppliers | Fornecedor (opcional) |
| `access_key` | TEXT | Chave de 44 dígitos |
| `invoice_number` | TEXT | Número da NF |
| `invoice_series` | TEXT | Série |
| `invoice_date` | TIMESTAMPTZ | Data de emissão |
| `data_saida` | TIMESTAMPTZ | Data de saída/entrada |
| `modelo` | TEXT | Modelo (55 = NF-e, 65 = NFC-e) |
| `protocolo` | TEXT | Protocolo de autorização SEFAZ |
| `ambiente` | TEXT | 1 = Produção, 2 = Homologação |
| `finalidade` | TEXT | 1 = Normal, 2 = Complementar, 3 = Ajuste, 4 = Devolução |
| `tipo_operacao` | TEXT | 0 = Entrada, 1 = Saída |
| `total_value` | NUMERIC(14,2) | Valor total |
| `fiscal_totals` | JSONB | `{ vBC, vICMS, vBCST, vST, vProd, vFrete, vSeg, vDesc, vOutro, vIPI, vPIS, vCOFINS }` |
| `transport_data` | JSONB | `{ modalidade_frete, transportadora, cnpj, cpf, placa, qtd_volumes, peso_bruto, peso_liquido, ... }` |
| `inf_cpl` | TEXT | Informações complementares |
| `inf_ad_fisco` | TEXT | Informações do fisco |
| `duplicatas` | JSONB | `[{ numero, vencimento, valor }]` |
| `supplier_name` | TEXT | Nome do emitente no XML |
| `supplier_document` | TEXT | CNPJ/CPF do emitente |
| `supplier_document_type` | TEXT | "cnpj" ou "cpf" |
| `supplier_ie` | TEXT | Inscrição estadual |
| `items_count` | INTEGER | Total de itens |
| `imported_items` | INTEGER | Itens importados com sucesso |
| `skipped_items` | INTEGER | Itens ignorados |
| `raw_xml` | TEXT | XML original |
| `xml_hash` | TEXT | SHA256 do XML |
| `xml_size` | INTEGER | Tamanho em bytes |
| `status` | TEXT | preview → completed / failed |
| `errors` | JSONB | Erros do RPC |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |
| `created_by` | UUID FK → auth.users | |
| `created_by_ip` | TEXT | IP do uploader |

**Unique**: `(partner_id, access_key)` — garante idempotência.

### xml_import_items

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID PK | |
| `xml_import_id` | UUID FK → xml_imports | |
| `raw_sku` | TEXT | Código do produto no XML |
| `raw_name` | TEXT | Nome no XML |
| `raw_ean` | TEXT | GTIN/EAN |
| `raw_ncm` | TEXT | NCM |
| `raw_cest` | TEXT | CEST |
| `raw_cfop` | TEXT | CFOP |
| `raw_cst` | TEXT | CST (ICMS) |
| `raw_csosn` | TEXT | CSOSN |
| `raw_pis_cst` | TEXT | CST do PIS |
| `raw_cofins_cst` | TEXT | CST do COFINS |
| `raw_ipi_code` | TEXT | Código IPI |
| `raw_fiscal_detail` | JSONB | `{ icms_cst, icms_vbc, icms_vicms, icms_picms, ipi_cst, ipi_vbc, ipi_vipi, pis_cst, pis_vbc, pis_vpis, cofins_cst, cofins_vbc, cofins_vcofins, ... }` |
| `raw_unit` | TEXT | Unidade |
| `raw_quantity` | NUMERIC | Quantidade |
| `raw_unit_cost` | NUMERIC | Valor unitário |
| `raw_total_cost` | NUMERIC | Valor total |
| `raw_weight_gross` | NUMERIC | Peso bruto |
| `raw_weight_net` | NUMERIC | Peso líquido |
| `raw_width` | NUMERIC | Largura |
| `raw_height` | NUMERIC | Altura |
| `raw_length` | NUMERIC | Comprimento |
| `raw_origin` | TEXT | Origem do produto (0-8) |
| `match_status` | TEXT | new / matched / similar / skipped |
| `matched_product_id` | UUID FK → products | |
| `matched_product_name` | TEXT | Nome do produto match |
| `match_method` | TEXT | ean / sku / supplier_sku / ncm_gtin / similar |
| `match_confidence` | NUMERIC | Confiança do match |
| `conflicts` | JSONB | `[{ campo, valor_atual, valor_xml }]` |
| `created_at` | TIMESTAMPTZ | |

---

## Fluxo de Uso

### 1. Upload (`uploadXMLAction`)

1. Parse XML via `parseNFeFull()`
2. Valida situação NF-e (finalidade 2/3/4 → warnings)
3. Valida CPF/CNPJ do destinatário vs partner logado
4. Verifica idempotência por `access_key + partner_id`
5. Busca ou cria fornecedor (`findOrCreateSupplier`)
   - Cria endereço em `addresses` se fornecedor novo
6. Calcula SHA256 + tamanho do XML
7. Cria registro em `xml_imports` (status = `preview`)
8. Para cada produto: matching → `xml_import_items`
9. Retorna `ImportPreview` com todos os dados

### 2. Preview (`getImportPreviewAction`)

Carrega `xml_imports` + `xml_import_items` já salvos, retorna preview completo.

### 3. Confirmação (`confirmImportAction`)

1. Valida se status ainda é `preview`
2. Chama RPC `execute_xml_import()` — transação única:
   - `FOR UPDATE` nos produtos
   - Atualiza/cria produtos conforme decisões do usuário
   - Atualiza estoque via `stock_movements` + `stock_movement_items`
   - Atualiza custo (`cost_price`) com audit trail
   - Vincula produto ao fornecedor em `product_suppliers`
3. Se sucesso + `createPayables = true`:
   - Cria transactions (`transaction_type = 'expense'`, `category = 'purchasing'`)
   - Se existem duplicatas no XML → uma transaction por parcela
   - Se não → uma transaction com vencimento em 30 dias
4. Atualiza status para `completed` (ou `failed` se erro)

### 4. Listagem (`listImportsAction`)

Lista imports com paginação, ordenação, filtro por status.

---

## Matching de Produtos

Ordem de precedência:
1. **GTIN/EAN** → `products.ean`
2. **SKU interno** → `products.sku`
3. **SKU do fornecedor** → `product_suppliers.supplier_sku`
4. **NCM + GTIN** → `NCM` + `EAN`
5. **Similaridade** → nome + NCM (nunca por nome sozinho)

Nunca atualiza produtos automaticamente — sempre mostra conflitos para o usuário decidir: Manter / Atualizar campos / Criar novo / Ignorar.

---

## Segurança

- **RLS**: Todas as tabelas com Row Level Security por `partner_id`
- **Idempotência**: Unique constraint `(partner_id, access_key)`
- **Transacional**: RPC `execute_xml_import()` com SECURITY DEFINER
- **Rate limit**: `requireRateLimit(RateLimitCategory.PRODUCT_CREATE)`
- **Decrypt**: CPF do partner é descriptografado com `decryptCPF()` antes de comparar com XML
- **Input validation**: CPF/CNPJ validados antes de buscar/criar fornecedor
- **Hash**: SHA256 do XML armazenado para auditoria

---

## Tratamento de Erros

`friendlyError()` traduz erros PostgreSQL (duplicate key, foreign key, not-null, permission denied) para mensagens amigáveis em português. Exemplos:

| Erro PG | Mensagem |
|---|---|
| `duplicate key` | "Registro duplicado" |
| `foreign key` | "Registro relacionado não encontrado" |
| `not-null` | "Campo obrigatório não preenchido" |
| `permission denied` | "Sem permissão para realizar esta operação" |

---

## UI

### Lista de Importações
- Tabs: Todos / Pendentes / Concluídos / Falhos
- Busca por texto
- Lista ou Grid (adaptável a mobile)
- Ordenação por coluna com `ArrowUpDownIcon`
- `ActionsDropdown` por linha: Revisar / Ver erro / Detalhes
- Paginação
- `InfoCard` para erros

### Preview da Importação
- Header: Série | N° + Valor Total + badges (modelo, protocolo, ambiente, data saída)
- Botão "Confirmar Importação" no desktop
- `FormSection` "Produtos" com decisões por item:
  - Manter / Atualizar / Criar / Ignorar
  - Ação de estoque (Somar / Média ponderada / Não alterar)
  - Ação de custo (Atualizar / Média ponderada / Não alterar)
  - Conflitos destacados (valor atual com linha, seta, valor XML em verde)
- `SidebarCard` "Resumo":
  - Total de Itens, Valor Total, Fornecedor, Data Emissão, Importado em
  - Duplicatas (parcelas da NF-e)
  - Checkbox "Criar contas a pagar" (default: ativado)
  - Chave NF-e
- Botões flutuantes mobile: "Voltar" + "Confirmar"
- `InfoCard` vermelho para erros

---

## Integração Financeira

Após importação bem-sucedida, se checkbox "Criar contas a pagar" estiver ativo:

- **Com duplicatas**: Cria uma `transaction` por parcela, com `due_date` = vencimento, `amount` = valor da parcela
- **Sem duplicatas**: Cria uma `transaction` com `due_date` = 30 dias a partir da data atual
- Todas as transactions: `transaction_type = 'expense'`, `category = 'purchasing'`, `status = 'pending'`

---

## Observações Técnicas Importantes

1. **JSONB + JSON.stringify**: Nunca usar `JSON.stringify()` ao passar valores para colunas JSONB no Supabase — o cliente serializa automaticamente. Passar `JSON.stringify(obj)` resulta em string JSON dentro do JSONB.
2. **Decrypt**: `partner.cpf` é AES-256-GCM (`v1:base64...`). Sempre usar `decryptCPF()` para comparar com texto plano do XML.
3. **React error #300**: Nunca usar `return` condicional antes de hooks em componente — usar sub-componentes nomeados com `{condition && <Componente />}`.
4. **stock_movements**: Colunas `product_id`, `quantity`, `previous_quantity`, `new_quantity` foram removidas pela migration 061. Usar `stock_movement_items` para quantidades por produto.
5. **Sem tabelas cost_history ou transportadora**: Não existem no schema atual. Custos são rastreados via audit trail na RPC.
6. **Array.isArray()**: O campo `conflicts` pode ser string ou array ao ser lido — sempre verificar com `Array.isArray()` antes de `.map()`.
