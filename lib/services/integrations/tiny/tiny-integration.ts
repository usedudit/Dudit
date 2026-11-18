import "server-only"

import { createAdminClient } from "@/lib/supabase/server"
import { encrypt, decrypt } from "@/lib/cryptoService"
import { createTinyClient, type TinyClient, type TinyProductDetail } from "./tiny-client"
import { resolveOrderBuyerFiscal } from "@/lib/orders/buyer-fiscal"
import { captureError, addMonitoringBreadcrumb } from "@/lib/monitoring/sentry"
import { logAuditEvent } from "@/lib/services/timeline.service"
import type { PartnerIntegrationRow } from "@/lib/services/integrations/types"

export const TINY_PROVIDER = "tiny"

export interface TinyIntegrationConfig {
  sync_stock?: boolean
  auto_export_orders?: boolean
  default_deposit?: string | null
}

export interface TinyIntegrationMetadata {
  last_sync_at?: string | null
  synced_count?: number
  last_export_at?: string | null
  last_error?: string | null
}

/**
 * Busca o registro de conexão do Tiny ERP para um parceiro
 */
export async function findTinyIntegration(
  supabase: any,
  partnerId: string
): Promise<PartnerIntegrationRow | null> {
  const { data, error } = await supabase
    .from("partner_integrations")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("provider_slug", TINY_PROVIDER)
    .maybeSingle()

  if (error || !data) return null
  return data as PartnerIntegrationRow
}

/**
 * Instancia o cliente do Tiny descriptografando o token do parceiro
 */
export async function getValidTinyClient(partnerId: string): Promise<TinyClient> {
  const supabase = createAdminClient()
  const integration = await findTinyIntegration(supabase, partnerId)

  if (!integration || integration.status !== "connected" || !integration.access_token_encrypted) {
    throw new Error("Integração com Tiny ERP não está ativa para esta loja.")
  }

  let token: string
  try {
    token = decrypt(integration.access_token_encrypted, "tiny")
  } catch (err) {
    captureError(err, {
      module: "integrations",
      action: "getValidTinyClient",
      partnerId,
      metadata: { provider: "tiny" },
    })
    throw new Error("Falha ao descriptografar token do Tiny ERP.")
  }

  return createTinyClient(token)
}

/**
 * Sincroniza catálogo de produtos do Tiny ERP para o banco da Dudit
 */
export async function syncTinyProductsToDudit(params: {
  partnerId: string
  storeId?: string | null
  maxPages?: number
}): Promise<{
  success: boolean
  totalProcessed: number
  totalCreated: number
  totalUpdated: number
  errors: string[]
}> {
  const { partnerId, storeId } = params
  const maxPages = params.maxPages || 5
  const supabase = createAdminClient()
  const client = await getValidTinyClient(partnerId)

  let totalProcessed = 0
  let totalCreated = 0
  let totalUpdated = 0
  const errors: string[] = []

  // Resolve storeId padrão se não fornecido
  let effectiveStoreId = storeId
  if (!effectiveStoreId) {
    const { data: storeRow } = await supabase
      .from("stores")
      .select("id")
      .eq("partner_id", partnerId)
      .order("is_headquarters", { ascending: false })
      .limit(1)
      .maybeSingle()
    effectiveStoreId = storeRow?.id || null
  }

  addMonitoringBreadcrumb({
    domain: "stock",
    message: "tiny.sync_products.started",
    metadata: { partnerId, storeId: effectiveStoreId, maxPages },
  })

  try {
    let currentPage = 1
    let hasMore = true

    while (hasMore && currentPage <= maxPages) {
      const searchRes = await client.searchProducts({ pagina: currentPage })
      const items = searchRes.produtos || []

      if (items.length === 0) {
        break
      }

      for (const item of items) {
        const summary = item.produto
        if (!summary || !summary.id) continue

        totalProcessed++

        try {
          // Busca detalhes completos do produto no Tiny
          const detail: TinyProductDetail = await client.getProduct(summary.id)

          const externalId = String(detail.id)
          const sku = detail.codigo?.trim() || `TINY-${externalId}`
          const name = detail.nome?.trim() || "Produto sem nome"
          const price = Number(detail.preco || 0)
          const promotionalPrice = detail.preco_promocional ? Number(detail.preco_promocional) : null
          const costPrice = Number((detail as any).preco_custo || 0) || 0
          const unit = detail.unidade?.trim() || "UN"
          const stock = Number(detail.saldo || 0)
          const minStock = Number(detail.estoque_minimo || 0)
          const gtin = detail.gtin?.trim() || null
          const description = detail.observacoes?.trim() || null
          const isActive = detail.situacao !== "I"

          // Extrai URLs de imagens se houver
          const images: string[] = []
          if (Array.isArray(detail.anexos)) {
            for (const att of detail.anexos) {
              if (att && att.anexo) images.push(att.anexo)
            }
          } else if (Array.isArray(detail.imagens)) {
            for (const img of detail.imagens) {
              if (img && img.url) images.push(img.url)
            }
          }

          // Checa se já existe na Dudit pelo external_id ou SKU
          let { data: existingProduct } = await supabase
            .from("products")
            .select("id, stock_quantity")
            .eq("partner_id", partnerId)
            .eq("external_id", externalId)
            .maybeSingle()

          if (!existingProduct && sku) {
            const { data: bySku } = await supabase
              .from("products")
              .select("id, stock_quantity")
              .eq("partner_id", partnerId)
              .eq("sku", sku)
              .maybeSingle()
            existingProduct = bySku
          }

          const now = new Date().toISOString()
          let targetProductId: string | null = null

          if (existingProduct) {
            targetProductId = existingProduct.id
            // Atualiza produto existente (sem ncm na tabela products)
            const { error: updateErr } = await supabase
              .from("products")
              .update({
                name,
                price,
                promotional_price: promotionalPrice,
                cost_price: costPrice,
                sku,
                gtin,
                unit,
                min_stock: minStock,
                stock_quantity: stock,
                description: description || undefined,
                images: images.length > 0 ? images : undefined,
                status: isActive ? "ativo" : "inativo",
                deleted_at: null,
                deleted_by: null,
                deleted_reason: null,
                external_id: externalId,
                external_provider: TINY_PROVIDER,
                last_external_sync_at: now,
                updated_at: now,
              })
              .eq("id", existingProduct.id)

            if (updateErr) {
              errors.push(`Erro ao atualizar ${name} (${sku}): ${updateErr.message}`)
            } else {
              totalUpdated++
            }
          } else {
            // Insere novo produto (sem ncm na tabela products)
            const { data: createdProduct, error: insertErr } = await supabase
              .from("products")
              .insert({
                partner_id: partnerId,
                store_id: effectiveStoreId,
                name,
                price,
                promotional_price: promotionalPrice,
                cost_price: costPrice,
                sku,
                gtin,
                unit,
                min_stock: minStock,
                stock_quantity: stock,
                description: description || "",
                images: images.length > 0 ? images : [],
                status: isActive ? "ativo" : "inativo",
                product_type: "Físico",
                condition: "Novo",
                show_price_in_store: true,
                show_in_marketplace: true,
                external_id: externalId,
                external_provider: TINY_PROVIDER,
                last_external_sync_at: now,
                created_at: now,
                updated_at: now,
              })
              .select("id")
              .single()

            if (insertErr) {
              errors.push(`Erro ao criar ${name} (${sku}): ${insertErr.message}`)
            } else {
              targetProductId = createdProduct?.id || null
              totalCreated++
            }
          }

          // Se tiver dados fiscais (NCM), grava na tabela product_fiscal_profiles
          if (targetProductId && detail.ncm) {
            try {
              await supabase
                .from("product_fiscal_profiles")
                .upsert(
                  {
                    product_id: targetProductId,
                    store_id: effectiveStoreId,
                    ncm: detail.ncm.trim(),
                    origin: Number(detail.origem || 0),
                    updated_at: now,
                  },
                  { onConflict: "product_id" }
                )
            } catch (fErr: any) {
              console.warn(`[TINY] Aviso fiscal produto ${targetProductId}:`, fErr?.message)
            }
          }

          // Se tiver peso/dimensões, grava na tabela product_logistics
          if (targetProductId && (detail.peso_bruto || detail.peso_liquido)) {
            try {
              await supabase
                .from("product_logistics")
                .upsert(
                  {
                    product_id: targetProductId,
                    weight_gross: Number(detail.peso_bruto || 0),
                    weight_net: Number(detail.peso_liquido || 0),
                    updated_at: now,
                  },
                  { onConflict: "product_id" }
                )
            } catch (lErr: any) {
              console.warn(`[TINY] Aviso logística produto ${targetProductId}:`, lErr?.message)
            }
          }
        } catch (itemErr: any) {
          errors.push(`Falha no produto ID ${summary.id}: ${itemErr?.message}`)
        }
      }

      if (searchRes.numero_paginas && currentPage >= searchRes.numero_paginas) {
        hasMore = false
      } else {
        currentPage++
      }
    }

    // Atualiza metadados da integração
    await supabase
      .from("partner_integrations")
      .update({
        metadata: {
          last_sync_at: new Date().toISOString(),
          synced_count: totalProcessed,
          last_sync_created: totalCreated,
          last_sync_updated: totalUpdated,
          last_error: errors.length > 0 ? errors[0] : null,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("partner_id", partnerId)
      .eq("provider_slug", TINY_PROVIDER)

    return {
      success: true,
      totalProcessed,
      totalCreated,
      totalUpdated,
      errors,
    }
  } catch (err: any) {
    captureError(err, {
      module: "integrations",
      action: "syncTinyProductsToDudit",
      partnerId,
      metadata: { provider: "tiny" },
    })
    return {
      success: false,
      totalProcessed,
      totalCreated,
      totalUpdated,
      errors: [err?.message || "Erro desconhecido ao sincronizar com Tiny ERP"],
    }
  }
}

/**
 * Exporta um pedido pago da Dudit para o Tiny ERP
 */
export async function exportDuditOrderToTiny(orderId: string): Promise<{
  success: boolean
  tinyOrderId?: string | number
  tinyOrderNumber?: string | number
  error?: string
}> {
  const supabase = createAdminClient()

  // Busca dados completos do pedido
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(`
      id,
      order_number,
      total_amount,
      paid_amount,
      delivery_address,
      payment_method,
      partner_id,
      customer_id,
      buyer_id,
      customer_name,
      notes,
      external_order_id,
      external_sync_status,
      order_items (
        id,
        product_id,
        product_name,
        product_price,
        quantity,
        subtotal
      )
    `)
    .eq("id", orderId)
    .single()

  if (orderErr || !order) {
    return { success: false, error: "Pedido não encontrado" }
  }

  // Se já foi exportado com sucesso, não duplica
  if (order.external_sync_status === "synced" && order.external_order_id) {
    return {
      success: true,
      tinyOrderId: order.external_order_id,
      tinyOrderNumber: order.external_order_number,
    }
  }

  const integration = await findTinyIntegration(supabase, order.partner_id)
  if (!integration || integration.status !== "connected") {
    // Integração não configurada para este parceiro - ignora
    return { success: false, error: "Tiny ERP não conectado para esta loja." }
  }

  const config = (integration.config as TinyIntegrationConfig) || {}
  if (config.auto_export_orders === false) {
    return { success: false, error: "Exportação automática desativada nas configurações." }
  }

  try {
    const client = await getValidTinyClient(order.partner_id)

    // Resolve dados fiscais do comprador
    const buyerFiscal = await resolveOrderBuyerFiscal(supabase, {
      partner_id: order.partner_id,
      customer_id: order.customer_id,
      buyer_id: order.buyer_id,
      customer_name: order.customer_name,
    })

    const customerName = buyerFiscal.name || order.customer_name || "Cliente Dudit"
    const customerDocument = buyerFiscal.document?.replace(/\D/g, "") || undefined
    const isPj = buyerFiscal.personType === "pj" || (customerDocument && customerDocument.length === 14)

    // Monta itens do pedido para o Tiny
    const items = (order.order_items || []).map((it: any) => ({
      item: {
        descricao: it.product_name,
        quantidade: Number(it.quantity || 1),
        valor_unitario: Number(it.product_price || 0),
        unidade: "UN",
      },
    }))

    const payload = {
      pedido: {
        cliente: {
          nome: customerName,
          tipo_pessoa: isPj ? ("J" as const) : ("F" as const),
          cpf_cnpj: customerDocument,
          endereco: order.delivery_address || undefined,
        },
        itens: items,
        total_pedido: Number(order.total_amount || 0),
        forma_pagamento: order.payment_method || "Mercado Pago",
        meio_pagamento: "Mercado Pago",
        numero_ordem_compra: order.order_number || String(order.id),
        obs: `Pedido Dudit Marketplace #${order.order_number || order.id}. ${order.notes || ""}`.trim(),
      },
    }

    const tinyRes = await client.createOrder(payload)

    // Atualiza pedido na Dudit com as referências do Tiny
    await supabase
      .from("orders")
      .update({
        external_order_id: String(tinyRes.id),
        external_order_number: String(tinyRes.numero),
        external_provider: TINY_PROVIDER,
        external_sync_status: "synced",
        external_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)

    // Registra na timeline de auditoria
    await logAuditEvent({
      partnerId: order.partner_id,
      actorUserId: null,
      entityType: "order",
      entityId: orderId,
      actionType: "tiny_order_exported",
      changeLines: [`Pedido exportado para o Tiny ERP (Nº ${tinyRes.numero || tinyRes.id})`],
      source: "system",
      metadata: {
        tinyOrderId: tinyRes.id,
        tinyOrderNumber: tinyRes.numero,
      },
    })

    return {
      success: true,
      tinyOrderId: tinyRes.id,
      tinyOrderNumber: tinyRes.numero,
    }
  } catch (err: any) {
    captureError(err, {
      module: "integrations",
      action: "exportDuditOrderToTiny",
      entityId: orderId,
      metadata: { provider: "tiny" },
    })

    // Salva status de erro no pedido
    await supabase
      .from("orders")
      .update({
        external_provider: TINY_PROVIDER,
        external_sync_status: "error",
        external_sync_error: err?.message || "Falha ao exportar pedido para o Tiny ERP",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)

    return {
      success: false,
      error: err?.message || "Erro ao exportar pedido para o Tiny ERP",
    }
  }
}

/**
 * Atualiza a situação de um pedido existente no Tiny ERP (ex: cancelado, aprovado)
 */
export async function updateTinyOrderStatus(params: {
  orderId: string
  situacao: "aberto" | "aprovado" | "cancelado" | "enviado" | "entregue"
}): Promise<{ success: boolean; error?: string }> {
  const { orderId, situacao } = params
  const supabase = createAdminClient()

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, partner_id, external_order_id, external_provider, external_sync_status")
    .eq("id", orderId)
    .single()

  if (orderErr || !order) {
    return { success: false, error: "Pedido não encontrado" }
  }

  // Se o pedido não foi exportado para o Tiny, não há o que atualizar lá
  if (order.external_provider !== TINY_PROVIDER || !order.external_order_id) {
    return { success: true }
  }

  try {
    const client = await getValidTinyClient(order.partner_id)
    await client.updateOrderStatus(order.external_order_id, situacao)

    await logAuditEvent({
      partnerId: order.partner_id,
      actorUserId: null,
      entityType: "order",
      entityId: orderId,
      actionType: "tiny_order_status_updated",
      changeLines: [`Situação no Tiny ERP atualizada para: ${situacao}`],
      source: "system",
      metadata: {
        tinyOrderId: order.external_order_id,
        situacao,
      },
    })

    return { success: true }
  } catch (err: any) {
    captureError(err, {
      module: "integrations",
      action: "updateTinyOrderStatus",
      entityId: orderId,
      metadata: { provider: "tiny", situacao },
    })
    return {
      success: false,
      error: err?.message || "Erro ao atualizar situação do pedido no Tiny ERP",
    }
  }
}
