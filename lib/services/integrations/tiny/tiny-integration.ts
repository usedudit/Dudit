import "server-only"

import { createAdminClient } from "@/lib/supabase/server"
import { encrypt, decrypt } from "@/lib/cryptoService"
import { createTinyClient, type TinyClient, type TinyProductDetail, type TinyOrderPayload } from "./tiny-client"
import { resolveOrderBuyerFiscal } from "@/lib/orders/buyer-fiscal"
import { captureError, addMonitoringBreadcrumb } from "@/lib/monitoring/sentry"
import { logAuditEvent } from "@/lib/services/timeline.service"
import type { PartnerIntegrationRow } from "@/lib/services/integrations/types"

export const TINY_PROVIDER = "tiny"

export interface TinyIntegrationConfig {
  sync_stock?: boolean
  auto_export_orders?: boolean
  default_deposit?: string | null
  webhook_secret?: string | null
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
      delivery_fee,
      delivery_type,
      delivery_breakdown,
      delivery_address,
      payment_method,
      partner_id,
      customer_id,
      buyer_id,
      customer_name,
      notes,
      external_order_id,
      external_order_number,
      external_sync_status,
      order_items (
        id,
        product_id,
        product_name,
        product_price,
        quantity,
        subtotal
      ),
      order_shipments (
        id,
        status,
        kind,
        carrier,
        service_name,
        service_code,
        price,
        tracking_number,
        tracking_url
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

    // Resolve dados de contato e endereço estruturado do cliente
    const targetCustomerId = buyerFiscal.customerId || order.customer_id
    let customerPhone: string | undefined
    let customerEmail: string | undefined
    let addressData: {
      street?: string | null
      number?: string | null
      complement?: string | null
      neighborhood?: string | null
      city?: string | null
      state?: string | null
      zip_code?: string | null
    } | null = null

    if (targetCustomerId) {
      const [{ data: custRow }, { data: addrRow }] = await Promise.all([
        supabase
          .from("customers")
          .select("email, phone, phone_fixed")
          .eq("id", targetCustomerId)
          .maybeSingle(),
        supabase
          .from("addresses")
          .select("street, number, complement, neighborhood, city, state, zip_code")
          .eq("customer_id", targetCustomerId)
          .order("is_default", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      customerPhone = custRow?.phone || custRow?.phone_fixed || undefined
      customerEmail = custRow?.email || undefined
      if (addrRow) {
        addressData = addrRow
      }
    }

    const rawDeliveryAddress = String(order.delivery_address || "").trim()
    const cepMatch = rawDeliveryAddress.match(/\b\d{5}-?\d{3}\b/)
    const extractedCep = cepMatch ? cepMatch[0].replace(/\D/g, "") : undefined

    const clientStreet = addressData?.street || rawDeliveryAddress || undefined
    const clientNumber = addressData?.number || undefined
    const clientComplement = addressData?.complement || undefined
    const clientNeighborhood = addressData?.neighborhood || undefined
    const clientCity = addressData?.city || undefined
    const clientUf = addressData?.state || undefined
    const clientCep = addressData?.zip_code?.replace(/\D/g, "") || extractedCep || undefined

    // Resolve dados de frete e transporte
    const deliveryFee = Number(order.delivery_fee || 0)
    const isPickup = String(order.delivery_type || "").toLowerCase() === "pickup"
    const activeShipment = Array.isArray(order.order_shipments)
      ? order.order_shipments.find((s: any) => s.kind !== "return")
      : null

    let formaEnvio = isPickup ? "Retirada" : undefined
    let formaFrete: string | undefined = undefined
    if (!isPickup) {
      if (activeShipment?.carrier) {
        formaEnvio = activeShipment.carrier
      } else if (order.delivery_breakdown?.carrier) {
        formaEnvio = order.delivery_breakdown.carrier
      } else {
        formaEnvio = "Entrega"
      }

      if (activeShipment?.service_name) {
        formaFrete = activeShipment.service_name
      } else if (order.delivery_breakdown?.service_name) {
        formaFrete = order.delivery_breakdown.service_name
      }
    }

    const fretePorConta: "R" | "S" = isPickup ? "S" : deliveryFee > 0 ? "R" : "S"
    const trackingCode = activeShipment?.tracking_number || undefined
    const trackingUrl = activeShipment?.tracking_url || undefined

    // Monta itens do pedido para o Tiny
    const items = (order.order_items || []).map((it: any) => ({
      item: {
        descricao: it.product_name,
        quantidade: Number(it.quantity || 1),
        valor_unitario: Number(it.product_price || 0),
        unidade: "UN",
      },
    }))

    const payload: TinyOrderPayload = {
      pedido: {
        cliente: {
          nome: customerName,
          tipo_pessoa: isPj ? ("J" as const) : ("F" as const),
          cpf_cnpj: customerDocument,
          email: customerEmail,
          fone: customerPhone,
          endereco: clientStreet,
          numero: clientNumber,
          complemento: clientComplement,
          bairro: clientNeighborhood,
          cidade: clientCity,
          uf: clientUf,
          cep: clientCep,
        },
        endereco_entrega: rawDeliveryAddress
          ? {
              nome_destinatario: customerName,
              tipo_pessoa: isPj ? ("J" as const) : ("F" as const),
              cpf_cnpj: customerDocument,
              endereco: clientStreet,
              numero: clientNumber,
              complemento: clientComplement,
              bairro: clientNeighborhood,
              cidade: clientCity,
              uf: clientUf,
              cep: clientCep,
              fone: customerPhone,
            }
          : undefined,
        itens: items,
        total_pedido: Number(order.total_amount || 0),
        valor_frete: deliveryFee > 0 ? deliveryFee : undefined,
        forma_envio: formaEnvio,
        forma_frete: formaFrete,
        frete_por_conta: fretePorConta,
        codigo_rastreamento: trackingCode,
        url_rastreamento: trackingUrl,
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

/**
 * Sincroniza o código e link de rastreamento com o Tiny ERP se o pedido estiver integrado
 */
export async function syncOrderTrackingToTiny(params: {
  orderId: string
  trackingCode: string
  trackingUrl?: string | null
}): Promise<{ success: boolean; error?: string }> {
  const { orderId, trackingCode, trackingUrl } = params
  if (!trackingCode) return { success: true }

  const supabase = createAdminClient()
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, partner_id, external_order_id, external_provider")
    .eq("id", orderId)
    .single()

  if (orderErr || !order) {
    return { success: false, error: "Pedido não encontrado" }
  }

  if (order.external_provider !== TINY_PROVIDER || !order.external_order_id) {
    return { success: true }
  }

  try {
    const client = await getValidTinyClient(order.partner_id)
    await client.updateOrderTracking({
      id: order.external_order_id,
      codigoRastreamento: trackingCode,
      urlRastreamento: trackingUrl || undefined,
      enviarEmail: "N",
    })

    await logAuditEvent({
      partnerId: order.partner_id,
      actorUserId: null,
      entityType: "order",
      entityId: orderId,
      actionType: "tiny_order_tracking_updated",
      changeLines: [`Código de rastreio sincronizado no Tiny ERP: ${trackingCode}`],
      source: "system",
      metadata: {
        tinyOrderId: order.external_order_id,
        trackingCode,
        trackingUrl,
      },
    })

    return { success: true }
  } catch (err: any) {
    captureError(err, {
      module: "integrations",
      action: "syncOrderTrackingToTiny",
      entityId: orderId,
      metadata: { provider: "tiny", trackingCode },
    })
    return {
      success: false,
      error: err?.message || "Erro ao atualizar rastreamento no Tiny ERP",
    }
  }
}

/**
 * Processa eventos de webhook enviados pelo Tiny ERP (estoque em tempo real, NF-e emitida, etc.)
 */
export async function processTinyWebhook(
  partnerId: string,
  rawPayload: any
): Promise<{ success: boolean; event: string; affectedCount: number; details?: any }> {
  const supabase = createAdminClient()
  let payload = rawPayload
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload)
    } catch {
      return { success: false, event: "unknown", affectedCount: 0, details: "Invalid JSON" }
    }
  }

  // Desencapsula campos caso o Tiny envie em 'dados'
  const root = payload?.dados || payload
  const event = String(root?.evento || root?.event || root?.tipo || "").toLowerCase()
  let affectedCount = 0

  // ─── 1. Atualização de Estoque em Tempo Real ───
  if (
    event.includes("estoque") ||
    event === "atualizacao_estoque" ||
    Array.isArray(root?.produtos) ||
    root?.produto
  ) {
    const rawProducts = Array.isArray(root.produtos)
      ? root.produtos
      : root.produto
      ? [root.produto]
      : []

    for (const item of rawProducts) {
      const externalId = item.id ? String(item.id) : null
      const sku = item.sku || item.codigo ? String(item.sku || item.codigo).trim() : null
      const newStock = Math.max(0, Number(item.saldo ?? item.quantidade ?? 0))

      if (!externalId && !sku) continue

      let productQuery = supabase
        .from("products")
        .select("id, name, stock_quantity")
        .eq("partner_id", partnerId)
        .is("deleted_at", null)

      if (externalId && sku) {
        productQuery = productQuery.or(`external_id.eq.${externalId},sku.eq.${sku}`)
      } else if (externalId) {
        productQuery = productQuery.eq("external_id", externalId)
      } else if (sku) {
        productQuery = productQuery.eq("sku", sku)
      }

      const { data: matchedProducts } = await productQuery

      for (const prod of matchedProducts || []) {
        await supabase
          .from("products")
          .update({
            stock_quantity: newStock,
            last_external_sync_at: new Date().toISOString(),
          })
          .eq("id", prod.id)

        try {
          const { invalidateProductCache } = await import("@/lib/cache/invalidation")
          await invalidateProductCache(prod.id, partnerId, "update", { silent: true })
        } catch {}

        affectedCount++
      }
    }

    return {
      success: true,
      event: "atualizacao_estoque",
      affectedCount,
    }
  }

  // ─── 2. Envio de Nota Fiscal (NF-e) ───
  if (
    event.includes("nota_fiscal") ||
    event.includes("nfe") ||
    Array.isArray(root?.notas) ||
    root?.nota_fiscal ||
    root?.nota
  ) {
    const rawNotas = Array.isArray(root.notas)
      ? root.notas
      : root.nota_fiscal
      ? [root.nota_fiscal]
      : root.nota
      ? [root.nota]
      : []

    for (const nota of rawNotas) {
      const nfeNumber = String(nota.numero || "").trim()
      const nfeSeries = String(nota.serie || "1").trim()
      const nfeAccessKey = String(nota.chave_acesso || "").replace(/\D/g, "")
      const nfeIssuedAt = nota.data_emissao
        ? new Date(nota.data_emissao).toISOString()
        : new Date().toISOString()
      const danfeUrl = nota.danfe_url || nota.link_danfe || null
      const xmlUrl = nota.xml_url || nota.link_xml || null
      const pedidoId = nota.pedido_id ? String(nota.pedido_id) : null
      const pedidoNumero = nota.pedido_numero ? String(nota.pedido_numero).trim() : null

      if (!pedidoId && !pedidoNumero && !nfeAccessKey) continue

      let orderQuery = supabase
        .from("orders")
        .select("id, order_number, partner_id, nfe_number")
        .eq("partner_id", partnerId)

      if (pedidoId && pedidoNumero) {
        orderQuery = orderQuery.or(
          `external_order_id.eq.${pedidoId},external_order_number.eq.${pedidoNumero},order_number.eq.${pedidoNumero}`
        )
      } else if (pedidoId) {
        orderQuery = orderQuery.eq("external_order_id", pedidoId)
      } else if (pedidoNumero) {
        orderQuery = orderQuery.or(
          `external_order_number.eq.${pedidoNumero},order_number.eq.${pedidoNumero}`
        )
      }

      const { data: matchedOrders } = await orderQuery

      for (const order of matchedOrders || []) {
        // Atualiza campos fiscais no pedido
        await supabase
          .from("orders")
          .update({
            nfe_number: nfeNumber || order.nfe_number,
            nfe_series: nfeSeries || null,
            nfe_access_key: nfeAccessKey || null,
            nfe_issued_at: nfeIssuedAt,
            fiscal_document_type: "nfe",
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id)

        // Anexa DANFE (PDF) aos anexos do pedido (se fornecido)
        if (danfeUrl) {
          const danfeFileName = `DANFE-NF-${nfeNumber || "e"}.pdf`
          const { data: existingDanfe } = await supabase
            .from("order_attachments")
            .select("id")
            .eq("order_id", order.id)
            .or(`file_name.eq.${danfeFileName},file_key.eq.${danfeUrl}`)
            .maybeSingle()

          if (!existingDanfe) {
            let finalDanfeKey = danfeUrl
            let danfeSize: number | null = null

            // Baixa o PDF do Tiny e armazena com segurança no bucket privado dudit-private
            try {
              const res = await fetch(danfeUrl, { signal: AbortSignal.timeout(15000) })
              if (res.ok) {
                const arrayBuffer = await res.arrayBuffer()
                const buffer = Buffer.from(arrayBuffer)
                danfeSize = buffer.length
                const r2Key = `orders/attachments/${order.id}/${danfeFileName}`
                const { uploadBufferToR2 } = await import("@/lib/r2/server")
                await uploadBufferToR2({
                  buffer,
                  key: r2Key,
                  contentType: "application/pdf",
                })
                finalDanfeKey = r2Key
              }
            } catch (fetchErr) {
              console.warn("[tiny-integration] Não foi possível salvar DANFE no R2 (dudit-private), usando URL externa:", fetchErr)
            }

            await supabase.from("order_attachments").insert({
              order_id: order.id,
              file_name: danfeFileName,
              file_key: finalDanfeKey,
              file_type: "application/pdf",
              file_size: danfeSize,
            })
          }
        }

        // Anexa XML aos anexos do pedido (se fornecido)
        if (xmlUrl) {
          const xmlFileName = `NFE-${nfeNumber || "e"}.xml`
          const { data: existingXml } = await supabase
            .from("order_attachments")
            .select("id")
            .eq("order_id", order.id)
            .or(`file_name.eq.${xmlFileName},file_key.eq.${xmlUrl}`)
            .maybeSingle()

          if (!existingXml) {
            let finalXmlKey = xmlUrl
            let xmlSize: number | null = null

            // Baixa o XML do Tiny e armazena com segurança no bucket privado dudit-private
            try {
              const res = await fetch(xmlUrl, { signal: AbortSignal.timeout(15000) })
              if (res.ok) {
                const arrayBuffer = await res.arrayBuffer()
                const buffer = Buffer.from(arrayBuffer)
                xmlSize = buffer.length
                const r2Key = `orders/attachments/${order.id}/${xmlFileName}`
                const { uploadBufferToR2 } = await import("@/lib/r2/server")
                await uploadBufferToR2({
                  buffer,
                  key: r2Key,
                  contentType: "application/xml",
                })
                finalXmlKey = r2Key
              }
            } catch (fetchErr) {
              console.warn("[tiny-integration] Não foi possível salvar XML no R2 (dudit-private), usando URL externa:", fetchErr)
            }

            await supabase.from("order_attachments").insert({
              order_id: order.id,
              file_name: xmlFileName,
              file_key: finalXmlKey,
              file_type: "application/xml",
              file_size: xmlSize,
            })
          }
        }

        // Registra evento de auditoria
        await logAuditEvent({
          partnerId,
          actorUserId: null,
          entityType: "order",
          entityId: order.id,
          actionType: "tiny_nfe_received",
          changeLines: [
            `Nota Fiscal nº ${nfeNumber} emitida no Tiny ERP e vinculada ao pedido.`,
            nfeAccessKey ? `Chave: ${nfeAccessKey}` : "",
          ].filter(Boolean),
          source: "webhook",
          metadata: {
            nfeNumber,
            nfeSeries,
            nfeAccessKey,
            danfeUrl,
            xmlUrl,
          },
        })

        try {
          const { revalidateOrders } = await import("@/lib/utils/revalidation")
          await revalidateOrders(partnerId)
        } catch {}

        affectedCount++
      }
    }

    return {
      success: true,
      event: "envio_nota_fiscal",
      affectedCount,
    }
  }

  // ─── 3. Atualização de Situação de Pedido (ex: faturado, enviado, entregue) ───
  if (
    event.includes("situacao_pedido") ||
    event.includes("status_pedido") ||
    Array.isArray(root?.pedidos) ||
    root?.pedido
  ) {
    const rawOrders = Array.isArray(root.pedidos)
      ? root.pedidos
      : root.pedido
      ? [root.pedido]
      : []

    for (const p of rawOrders) {
      const pedidoId = p.id ? String(p.id) : null
      const pedidoNumero = p.numero ? String(p.numero).trim() : null
      const situacaoAtual = String(p.situacao_atual || p.situacao || "").toLowerCase()

      if (!pedidoId && !pedidoNumero) continue

      let orderQuery = supabase
        .from("orders")
        .select("id, order_number, partner_id, delivery_status, situation")
        .eq("partner_id", partnerId)

      if (pedidoId && pedidoNumero) {
        orderQuery = orderQuery.or(
          `external_order_id.eq.${pedidoId},external_order_number.eq.${pedidoNumero},order_number.eq.${pedidoNumero}`
        )
      } else if (pedidoId) {
        orderQuery = orderQuery.eq("external_order_id", pedidoId)
      } else if (pedidoNumero) {
        orderQuery = orderQuery.or(
          `external_order_number.eq.${pedidoNumero},order_number.eq.${pedidoNumero}`
        )
      }

      const { data: matchedOrders } = await orderQuery

      for (const order of matchedOrders || []) {
        const patch: Record<string, any> = { updated_at: new Date().toISOString() }

        // Se faturado com dados de nota fiscal
        if (p.nota_fiscal && (situacaoAtual === "faturado" || p.nota_fiscal.numero)) {
          patch.nfe_number = String(p.nota_fiscal.numero || "").trim()
          if (p.nota_fiscal.serie) patch.nfe_series = String(p.nota_fiscal.serie).trim()
          if (p.nota_fiscal.chave_acesso) {
            patch.nfe_access_key = String(p.nota_fiscal.chave_acesso).replace(/\D/g, "")
          }
          patch.fiscal_document_type = "nfe"
        }

        if (situacaoAtual === "enviado" || situacaoAtual === "pronto_envio") {
          patch.delivery_status = "sent"
        } else if (situacaoAtual === "entregue") {
          patch.delivery_status = "delivered"
        } else if (situacaoAtual === "cancelado" && order.situation !== "cancelled") {
          patch.situation = "cancelled"
        }

        if (Object.keys(patch).length > 1) {
          await supabase.from("orders").update(patch).eq("id", order.id)
          affectedCount++
        }
      }
    }

    return {
      success: true,
      event: "atualizacao_situacao_pedido",
      affectedCount,
    }
  }

  return {
    success: true,
    event: event || "unhandled",
    affectedCount: 0,
  }
}
