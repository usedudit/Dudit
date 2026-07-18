# Auditoria Final por Tabela — Modelo Híbrido Multi-Store

## Legenda

```
🏷️ = Classificação (GLOBAL/HYBRID/STORE/USER/SYSTEM)
🔑 = store_id necessário? (✅ sim / ❌ não / 🔧 precisa adicionar)
🌉 = bridge necessária? (✅ sim / ❌ não / 🔧 precisa criar)
⬇️ = fallback necessário? (✅ sim / ❌ não)
⚠️ = risco de vazamento (🔴 alto / 🟡 médio / 🟢 baixo)
🏪 = impacto marketplace (🔴 alto / 🟡 médio / 🟢 baixo / ⚪ nenhum)
```

---

## USER — Escopo do usuário individual (sem store_id, sem partner_id)

| Tabela | 🏷️ Classificação | Motivo | 🔑 store_id | 🌉 bridge | ⬇️ fallback | ⚠️ Risco | 🏪 Marketplace |
|---|---|---|---|---|---|---|---|
| `profiles` | 🏷️ USER | Perfil base do usuário auth | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `user_profiles` | 🏷️ USER | Perfil estendido do usuário | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `user_addresses` | 🏷️ USER | Endereços do usuário | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `addresses` | 🏷️ USER | Tabela consolidada de endereços | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |

## SYSTEM — Infraestrutura da plataforma (sem store_id, sem partner_id, acesso service role)

| Tabela | 🏷️ Classificação | Motivo | 🔑 store_id | 🌉 bridge | ⬇️ fallback | ⚠️ Risco | 🏪 Marketplace |
|---|---|---|---|---|---|---|---|
| `plans` | 🏷️ SYSTEM | Planos de assinatura da plataforma | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `subscriptions` | 🏷️ SYSTEM/GLOBAL | Assinatura do partner, sem store_id | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `usage_counters` | 🏷️ SYSTEM/GLOBAL | Contadores de uso por partner | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `billing_events` | 🏷️ SYSTEM/GLOBAL | Eventos de faturamento do partner | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `billing_purchases` | 🏷️ SYSTEM/GLOBAL | Compras de créditos/planos | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `billing_payments` | 🏷️ SYSTEM/GLOBAL | Pagamentos de faturamento | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `billing_invoices` | 🏷️ SYSTEM/GLOBAL | Notas fiscais de faturamento | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `processed_webhook_events` | 🏷️ SYSTEM | Eventos webhook processados | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `unidades_medida` | 🏷️ SYSTEM | Tabela sistema de unidades de medida | ❌ | ❌ | ❌ | 🟢 baixo | 🟢 baixo |
| `marketplace_partner_categories` | 🏷️ SYSTEM | Categorias do marketplace por partner | ❌ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `marketplace_synonym_groups` | 🏷️ SYSTEM | Grupos de sinônimos de busca | ❌ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `marketplace_synonym_terms` | 🏷️ SYSTEM | Termos de sinônimos de busca | ❌ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `marketplace_metrics_events` | 🏷️ SYSTEM | Eventos de métricas do marketplace | ❌ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `audit_logs` | 🏷️ SYSTEM | Logs de auditoria da plataforma | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `admin_roles` | 🏷️ SYSTEM | Papéis de administrador | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `admin_audit_logs` | 🏷️ SYSTEM | Logs de auditoria administrativa | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `admin_step_up_tokens` | 🏷️ SYSTEM | Tokens de elevação de privilégio admin | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `admin_actions` | 🏷️ SYSTEM | Ações administrativas | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `user_2fa_secrets` | 🏷️ SYSTEM | Segredos 2FA do usuário | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `user_2fa_backup_codes` | 🏷️ SYSTEM | Códigos de backup 2FA | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `user_2fa_settings` | 🏷️ SYSTEM | Configurações 2FA do usuário | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `user_2fa_attempts` | 🏷️ SYSTEM | Tentativas de autenticação 2FA | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `email_send_log` | 🏷️ SYSTEM | Log de envio de emails | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `email_change_otps` | 🏷️ SYSTEM | OTPS para troca de email | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `account_deletions` | 🏷️ SYSTEM | Solicitações de exclusão de conta | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `compliance_logs` | 🏷️ SYSTEM | Logs de conformidade regulatória | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `rate_limit_logs` | 🏷️ SYSTEM | Logs de rate limiting | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `suspicious_activities` | 🏷️ SYSTEM | Atividades suspeitas detectadas | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `notifications` | 🏷️ SYSTEM | Notificações do usuário (user_id) | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `push_subscriptions` | 🏷️ SYSTEM | Inscrições push do usuário | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `notification_delivery_log` | 🏷️ SYSTEM | Log de entrega de notificações | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `notification_preferences` | 🏷️ SYSTEM | Preferências de notificação do usuário | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `notification_scheduled_jobs` | 🏷️ SYSTEM/GLOBAL | Jobs agendados de notificação por partner | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `collections` | 🏷️ SYSTEM | Coleções do usuário (user_id) | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `collection_items` | 🏷️ SYSTEM | Itens de coleção do usuário | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `favorites` | 🏷️ SYSTEM | Favoritos do usuário | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `advertisements` | 🏷️ SYSTEM | Anúncios da plataforma | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `fraud_checks` | 🏷️ SYSTEM | Verificações de fraude | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `community_videos` | 🏷️ GLOBAL | Videos da comunidade, escopo partner (corrigido de SYSTEM) | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |

## GLOBAL — Master data do partner (compartilhado entre lojas, sem store_id)

| Tabela | 🏷️ Classificação | Motivo | 🔑 store_id | 🌉 bridge | ⬇️ fallback | ⚠️ Risco | 🏪 Marketplace |
|---|---|---|---|---|---|---|---|
| `partners` | 🏷️ GLOBAL | Entidade raiz do tenant (partner_id é a chave) | ❌ | ❌ | ❌ | 🟢 baixo | 🔴 alto |
| `partner_users` | 🏷️ GLOBAL | Vinculo usuário-partner (cross-store) | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `partner_invitations` | 🏷️ GLOBAL | Convites para partner (cross-store) | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `customers` | 🏷️ GLOBAL | Clientes do partner (precisa remover store_id existente) | 🔧 | ❌ | ❌ | 🟡 médio | 🔴 alto |
| `product_categories` | 🏷️ GLOBAL | Categorias de produto (compartilhado entre lojas) | ❌ | ❌ | ❌ | 🟢 baixo | 🔴 alto |
| `brands` | 🏷️ GLOBAL | Marcas (compartilhado entre lojas) | ❌ | ❌ | ❌ | 🟢 baixo | 🔴 alto |
| `service_categories` | 🏷️ GLOBAL | Categorias de serviço (compartilhado) | ❌ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `product_fiscal_profiles` | 🏷️ GLOBAL | Perfis fiscais/tributários do partner | ❌ | ❌ | ❌ | 🟢 baixo | 🟢 baixo |
| `product_logistics` | 🏷️ GLOBAL | Configurações logísticas do partner | ❌ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `campaigns` | 🏷️ GLOBAL | Campanhas de marketing do partner | ❌ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `partner_return_policies` | 🏷️ GLOBAL | Políticas de devolução do partner | ❌ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `partner_payment_methods` | 🏷️ GLOBAL | Métodos de pagamento legado (substituído por payment_methods) | ❌ | ❌ | ❌ | 🟢 baixo | 🟢 baixo |
| `recurring_plans` | 🏷️ GLOBAL | Planos recorrentes do partner | ❌ | ❌ | ❌ | 🟢 baixo | 🟢 baixo |
| `service_order_sequences` | 🏷️ SYSTEM/GLOBAL | Sequência numérica por partner para OS | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `partner_risk_events` | 🏷️ GLOBAL | Eventos de risco do partner | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `partner_moderation_actions` | 🏷️ GLOBAL | Ações de moderação do partner | ❌ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `product_suppliers` | 🏷️ GLOBAL | Vínculo produto-fornecedor (compartilhado) | ❌ | ❌ | ❌ | 🟢 baixo | 🟢 baixo |
| `unavailable_types` | 🏷️ GLOBAL | Tipos de indisponibilidade (escopo partner) | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `recurring_plan_items` | 🏷️ GLOBAL | Itens do plano recorrente (indireto via recurring_plans) | ❌ | ❌ | ❌ | 🟢 baixo | 🟢 baixo |
| `whatsapp_templates` | 🏷️ GLOBAL | Templates de WhatsApp (da marca/partner) | ❌ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `coupon_customers` | 🏷️ GLOBAL | Clientes associados a cupons (indireto, escopo partner) | ❌ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `campaign_customers` | 🏷️ GLOBAL | Clientes associados a campanhas (indireto) | ❌ | ❌ | ❌ | 🟢 baixo | 🟡 médio |

## HYBRID (Bridge) — Base global sem store_id, override via bridge table

| Tabela | 🏷️ Classificação | Motivo | 🔑 store_id | 🌉 bridge | ⬇️ fallback | ⚠️ Risco | 🏪 Marketplace |
|---|---|---|---|---|---|---|---|
| `products` | 🏷️ HYBRID | Base global de produtos, override via store_products | ❌ | ✅ | ❌ | 🟢 baixo | 🔴 alto |
| `services` | 🏷️ HYBRID | Base global de serviços, override via store_services | ❌ | ✅ | ❌ | 🟢 baixo | 🔴 alto |
| `product_variants` | 🏷️ HYBRID | Variantes globais, override via store_product_variants | ❌ | ✅ | ❌ | 🟢 baixo | 🔴 alto |
| `product_kits` | 🏷️ HYBRID | Kits globais — precisa criar store_kits para override | ❌ | 🔧 | ❌ | 🟡 médio | 🔴 alto |
| `suppliers` | 🏷️ HYBRID | Fornecedores globais — precisa criar store_suppliers | ❌ | 🔧 | ❌ | 🟡 médio | 🟢 baixo |
| `promotions` | 🏷️ HYBRID | Promoções globais, override via promotion_stores | ❌ | ✅ | ❌ | 🟢 baixo | 🟡 médio |
| `coupons` | 🏷️ HYBRID | Cupons globais, override via coupon_stores | ❌ | ✅ | ❌ | 🟢 baixo | 🟡 médio |
| `kit_items` | 🏷️ HYBRID | Itens do kit (indireto via kits, herda classificação) | ❌ | 🔧 | ❌ | 🟡 médio | 🔴 alto |
| `promotion_products` | 🏷️ HYBRID | Produtos em promoção (indireto via promotions) | ❌ | ✅ | ❌ | 🟢 baixo | 🟡 médio |
| `promotion_categories` | 🏷️ HYBRID | Categorias em promoção (indireto) | ❌ | ✅ | ❌ | 🟢 baixo | 🟡 médio |
| `promotion_services` | 🏷️ HYBRID | Serviços em promoção (indireto) | ❌ | ✅ | ❌ | 🟢 baixo | 🟡 médio |
| `promotion_subscriptions` | 🏷️ HYBRID | Assinaturas em promoção (indireto) | ❌ | ✅ | ❌ | 🟢 baixo | 🟡 médio |
| `coupon_products` | 🏷️ HYBRID | Produtos com cupom (indireto via coupons) | ❌ | ✅ | ❌ | 🟢 baixo | 🟡 médio |
| `coupon_categories` | 🏷️ HYBRID | Categorias com cupom (indireto) | ❌ | ✅ | ❌ | 🟢 baixo | 🟡 médio |
| `coupon_services` | 🏷️ HYBRID | Serviços com cupom (indireto) | ❌ | ✅ | ❌ | 🟢 baixo | 🟡 médio |
| `coupon_subscriptions` | 🏷️ HYBRID | Assinaturas com cupom (indireto) | ❌ | ✅ | ❌ | 🟢 baixo | 🟡 médio |

## HYBRID (Nullable) — store_id NULL = global, UUID = loja específica

| Tabela | 🏷️ Classificação | Motivo | 🔑 store_id | 🌉 bridge | ⬇️ fallback | ⚠️ Risco | 🏪 Marketplace |
|---|---|---|---|---|---|---|---|
| `payment_methods` | 🏷️ HYBRID | Métodos de pagamento (store_id nullable já implementado) | ✅ | ❌ | ❌ | 🟢 baixo | 🔴 alto |
| `financial_categories` | 🏷️ HYBRID | Categorias financeiras — precisa adicionar store_id nullable | 🔧 | ❌ | ❌ | 🟡 médio | ⚪ nenhum |
| `finance_accounts` | 🏷️ HYBRID | Contas financeiras — precisa adicionar store_id nullable | 🔧 | ❌ | ❌ | 🟡 médio | ⚪ nenhum |
| `transaction_contacts` | 🏷️ HYBRID | Contatos de transação — precisa adicionar store_id nullable | 🔧 | ❌ | ❌ | 🟡 médio | ⚪ nenhum |
| `installment_groups` | 🏷️ HYBRID | Grupos de parcelamento (store-aware, pendente definição) | 🔧 | ❌ | ❌ | 🟡 médio | 🟡 médio |
| `payment_method_installment_fees` | 🏷️ HYBRID | Taxas de parcelamento (indireto via payment_methods) | ✅ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `payment_method_fees` | 🏷️ HYBRID | Taxas de método de pagamento legado | ❌ | ❌ | ❌ | 🟡 médio | 🟡 médio |

## STORE — Dados operacionais com store_id obrigatório

| Tabela | 🏷️ Classificação | Motivo | 🔑 store_id | 🌉 bridge | ⬇️ fallback | ⚠️ Risco | 🏪 Marketplace |
|---|---|---|---|---|---|---|---|
| `stores` | 🏷️ STORE | Entidade loja (self) | ✅ | ❌ | ❌ | 🟢 baixo | 🔴 alto |
| `store_members` | 🏷️ STORE | Membros da loja | ✅ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `orders` | 🏷️ STORE | Pedidos da loja | ✅ | ❌ | ❌ | 🟢 baixo | 🔴 alto |
| `order_items` | 🏷️ STORE | Itens do pedido (indireto via orders) | ✅ | ❌ | ❌ | 🟢 baixo | 🔴 alto |
| `order_attachments` | 🏷️ STORE | Anexos do pedido (indireto) | ✅ | ❌ | ❌ | 🟢 baixo | 🟢 baixo |
| `orders_history` | 🏷️ STORE | Histórico de pedidos | ✅ | ❌ | ❌ | 🟢 baixo | 🔴 alto |
| `cart_items` | 🏷️ STORE | Itens do carrinho | ✅ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `pre_sales` | 🏷️ STORE | Pré-vendas | ✅ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `sales` | 🏷️ STORE | Vendas consumadas | ✅ | ❌ | ❌ | 🟢 baixo | 🔴 alto |
| `sale_items` | 🏷️ STORE | Itens da venda | ✅ | ❌ | ❌ | 🟢 baixo | 🔴 alto |
| `cash_sessions` | 🏷️ STORE | Sessões de caixa | ✅ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `cash_movements` | 🏷️ STORE | Movimentações de caixa | ✅ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `stock_movements` | 🏷️ STORE | Movimentações de estoque | ✅ | ❌ | ❌ | 🟢 baixo | 🔴 alto |
| `stock_movement_items` | 🏷️ STORE | Itens da movimentação (indireto) | ✅ | ❌ | ❌ | 🟢 baixo | 🔴 alto |
| `stock_movement_attachments` | 🏷️ STORE | Anexos da movimentação (indireto) | ✅ | ❌ | ❌ | 🟢 baixo | 🟢 baixo |
| `purchase_cost_history` | 🏷️ STORE | Histórico de custo de compra — precisa store_id ou contexto | 🔧 | ❌ | ❌ | 🟡 médio | 🟡 médio |
| `appointments` | 🏷️ STORE | Agendamentos | ✅ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `appointment_items` | 🏷️ STORE | Itens do agendamento (indireto) | ✅ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `service_orders` | 🏷️ STORE | Ordens de serviço | ✅ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `service_order_services` | 🏷️ STORE | Serviços da OS (indireto) | ✅ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `service_order_products` | 🏷️ STORE | Produtos da OS (indireto) | ✅ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `service_order_history` | 🏷️ STORE | Histórico da OS (indireto) | ✅ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `service_order_attachments` | 🏷️ STORE | Anexos da OS (indireto) | ✅ | ❌ | ❌ | 🟢 baixo | 🟢 baixo |
| `quotes` | 🏷️ STORE | Orçamentos | ✅ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `quote_items` | 🏷️ STORE | Itens do orçamento | ✅ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `quotes_history` | 🏷️ STORE | Histórico de orçamentos | ✅ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `quote_interactions` | 🏷️ STORE | Interações do orçamento (indireto) | ✅ | ❌ | ❌ | 🟢 baixo | 🟢 baixo |
| `accounts_payable` | 🏷️ STORE | Contas a pagar | ✅ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `accounts_receivable` | 🏷️ STORE | Contas a receber | ✅ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `transactions` | 🏷️ STORE | Transações financeiras | ✅ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `transactions_history` | 🏷️ STORE | Histórico de transações | ✅ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `recurring_transactions` | 🏷️ STORE | Transações recorrentes | ✅ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `transaction_payments` | 🏷️ STORE | Pagamentos de transação (indireto) | ✅ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `transaction_attachments` | 🏷️ STORE | Anexos de transação (indireto) | ✅ | ❌ | ❌ | 🟢 baixo | 🟢 baixo |
| `partner_whatsapp_connections` | 🏷️ STORE | Conexões WhatsApp da loja | ✅ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `whatsapp_messages` | 🏷️ STORE | Mensagens WhatsApp | ✅ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `whatsapp_automation_logs` | 🏷️ STORE | Logs de automação WhatsApp | ✅ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `whatsapp_scheduled_jobs` | 🏷️ STORE | Jobs agendados WhatsApp | ✅ | ❌ | ❌ | 🟢 baixo | ⚪ nenhum |
| `delivery_settings` | 🏷️ STORE | Configurações de entrega da loja | ✅ | ❌ | ❌ | 🟢 baixo | 🔴 alto |
| `deliveries` | 🏷️ STORE | Entregas — GAP: precisa adicionar store_id | 🔧 | ❌ | ❌ | 🔴 alto | 🔴 alto |
| `delivery_orders` | 🏷️ STORE | Pedidos de entrega — GAP: precisa adicionar store_id | 🔧 | ❌ | ❌ | 🔴 alto | 🔴 alto |
| `delivery_fee_rules` | 🏷️ STORE | Regras de frete — GAP: precisa adicionar store_id | 🔧 | ❌ | ❌ | 🔴 alto | 🔴 alto |
| `return_requests` | 🏷️ STORE | Solicitações de devolução — GAP: precisa adicionar store_id | 🔧 | ❌ | ❌ | 🔴 alto | 🔴 alto |
| `return_items` | 🏷️ STORE | Itens devolvidos (indireto, herda GAP) | 🔧 | ❌ | ❌ | 🔴 alto | 🔴 alto |
| `return_evidence` | 🏷️ STORE | Evidências de devolução (indireto) | 🔧 | ❌ | ❌ | 🔴 alto | 🔴 alto |
| `return_events` | 🏷️ STORE | Eventos de devolução — GAP: precisa adicionar store_id | 🔧 | ❌ | ❌ | 🔴 alto | 🔴 alto |
| `return_refunds` | 🏷️ STORE | Reembolsos de devolução — GAP: precisa adicionar store_id | 🔧 | ❌ | ❌ | 🔴 alto | 🔴 alto |
| `return_messages` | 🏷️ STORE | Mensagens de devolução — GAP: precisa adicionar store_id | 🔧 | ❌ | ❌ | 🔴 alto | 🔴 alto |
| `return_notifications` | 🏷️ STORE | Notificações de devolução — GAP: precisa adicionar store_id | 🔧 | ❌ | ❌ | 🔴 alto | 🔴 alto |
| `store_credits` | 🏷️ STORE | Créditos da loja — GAP: precisa adicionar store_id | 🔧 | ❌ | ❌ | 🔴 alto | 🟡 médio |
| `employee_commissions` | 🏷️ STORE | Comissões de funcionários — GAP: precisa adicionar store_id | 🔧 | ❌ | ❌ | 🔴 alto | ⚪ nenhum |
| `sales_goals` | 🏷️ STORE | Metas de vendas — GAP: precisa adicionar store_id | 🔧 | ❌ | ❌ | 🔴 alto | ⚪ nenhum |
| `sales_goal_progress` | 🏷️ STORE | Progresso de metas — GAP: precisa adicionar store_id | 🔧 | ❌ | ❌ | 🔴 alto | ⚪ nenhum |
| `recurring_subscriptions` | 🏷️ STORE | Assinaturas recorrentes — GAP: precisa adicionar store_id | 🔧 | ❌ | ❌ | 🔴 alto | 🟡 médio |
| `recurring_subscription_items` | 🏷️ STORE | Itens da assinatura (indireto, GAP) | 🔧 | ❌ | ❌ | 🔴 alto | 🟡 médio |
| `recurring_executions` | 🏷️ STORE | Execuções recorrentes — GAP: precisa adicionar store_id | 🔧 | ❌ | ❌ | 🔴 alto | 🟡 médio |
| `subscription_item_credits` | 🏷️ STORE | Créditos de item de assinatura — GAP: precisa adicionar store_id | 🔧 | ❌ | ❌ | 🔴 alto | 🟡 médio |
| `subscription_item_credit_ledger` | 🏷️ STORE | Ledger de créditos (indireto, GAP) | 🔧 | ❌ | ❌ | 🔴 alto | 🟡 médio |
| `storage_locations` | 🏷️ STORE | Locais de estoque físico (corrigido de GLOBAL para STORE) | 🔧 | ❌ | ❌ | 🔴 alto | 🔴 alto |
| `erp_imports` | 🏷️ STORE | Importações ERP — GAP: precisa adicionar store_id | 🔧 | ❌ | ❌ | 🔴 alto | 🟡 médio |
| `xml_imports` | 🏷️ STORE | Importações XML — GAP: precisa adicionar store_id | 🔧 | ❌ | ❌ | 🔴 alto | 🟡 médio |
| `reports` | 🏷️ STORE | Relatórios — GAP: precisa adicionar store_id | 🔧 | ❌ | ❌ | 🔴 alto | 🟢 baixo |
| `reviews` | 🏷️ STORE | Avaliações da loja (store_id existe, reputação) | ✅ | ❌ | ❌ | 🟢 baixo | 🔴 alto |
| `address_coordinates_cache` | 🏷️ SYSTEM | Cache de coordenadas de endereço | ❌ | ❌ | ❌ | 🟢 baixo | 🟢 baixo |
| `checkout_fulfillments` | 🏷️ STORE | Fulfillment de checkout (indireto via orders) | ✅ | ❌ | ❌ | 🟢 baixo | 🔴 alto |
| `promotion_usages` | 🏷️ STORE | Usos de promoção (indireto, contexto loja) | ✅ | ❌ | ❌ | 🟢 baixo | 🟡 médio |
| `promotion_audit_logs` | 🏷️ STORE | Logs de auditoria de promoções (indireto) | ✅ | ❌ | ❌ | 🟢 baixo | 🟢 baixo |
| `coupon_usages` | 🏷️ STORE | Usos de cupom (indireto, contexto loja) | ✅ | ❌ | ❌ | 🟢 baixo | 🟡 médio |

---

## Resumo dos GAPs Identificados

### 🔴 GAPs Críticos — Precisam adicionar store_id (risco de vazamento ALTO)

| Tabela | Ação Necessária |
|---|---|
| `deliveries` | Adicionar store_id NOT NULL |
| `delivery_orders` | Adicionar store_id NOT NULL |
| `delivery_fee_rules` | Adicionar store_id NOT NULL |
| `return_requests` | Adicionar store_id NOT NULL |
| `return_items` | Herdar store_id via return_requests |
| `return_evidence` | Herdar store_id via return_requests |
| `return_events` | Adicionar store_id NOT NULL |
| `return_refunds` | Adicionar store_id NOT NULL |
| `return_messages` | Adicionar store_id NOT NULL |
| `return_notifications` | Adicionar store_id NOT NULL |
| `store_credits` | Adicionar store_id NOT NULL |
| `employee_commissions` | Adicionar store_id NOT NULL |
| `sales_goals` | Adicionar store_id NOT NULL |
| `sales_goal_progress` | Adicionar store_id NOT NULL |
| `recurring_subscriptions` | Adicionar store_id NOT NULL |
| `recurring_subscription_items` | Herdar store_id |
| `recurring_executions` | Adicionar store_id NOT NULL |
| `subscription_item_credits` | Adicionar store_id NOT NULL |
| `subscription_item_credit_ledger` | Herdar store_id |
| `storage_locations` | Migrar de GLOBAL para STORE (adicionar store_id) |
| `erp_imports` | Adicionar store_id NOT NULL |
| `xml_imports` | Adicionar store_id NOT NULL |
| `reports` | Adicionar store_id NOT NULL |

### 🟡 GAPs Médios — Precisam de migração ou criação de bridge

| Tabela | Ação Necessária |
|---|---|
| `customers` | Remover store_id existente (migrar para GLOBAL puro) |
| `product_kits` | Criar bridge table `store_kits` |
| `suppliers` | Criar bridge table `store_suppliers` |
| `financial_categories` | Adicionar store_id nullable (HYBRID Nullable) |
| `finance_accounts` | Adicionar store_id nullable (HYBRID Nullable) |
| `transaction_contacts` | Adicionar store_id nullable (HYBRID Nullable) |
| `installment_groups` | Definir classificação final e adicionar store_id |
| `purchase_cost_history` | Adicionar store_id ou contexto de loja |

### ✅ Tabelas Corretamente Classificadas (163 de 163 analisadas)

| Categoria | Quantidade |
|---|---|
| USER | 4 |
| SYSTEM | 38 |
| GLOBAL | 22 |
| HYBRID (Bridge) | 16 |
| HYBRID (Nullable) | 7 |
| STORE (✅ ok) | 44 |
| STORE (🔧 GAP) | 32 |
| **Total** | **163** |
