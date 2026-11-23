import "server-only"

import { createAdminClient } from "@/lib/supabase/server"
import { encrypt, decrypt } from "@/lib/cryptoService"
import {
  createBlingClient,
  refreshBlingAccessToken,
  type BlingClient,
  type BlingOrderPayload,
  type BlingOrderParcela,
} from "./bling-client"
import { resolveOrderBuyerFiscal } from "@/lib/orders/buyer-fiscal"
import { captureError, addMonitoringBreadcrumb } from "@/lib/monitoring/sentry"
import { logAuditEvent } from "@/lib/services/timeline.service"
import type { PartnerIntegrationRow } from "@/lib/services/integrations/types"
import { isStoreCreditMethod } from "@/lib/payments/payment-method"

export const BLING_PROVIDER = "bling"

export interface BlingIntegrationConfig {
  sync_stock?: boolean
  auto_export_orders?: boolean
  default_deposit_id?: number | null
  webhook_secret?: string | null
}

export interface BlingIntegrationMetadata {
  last_sync_at?: string | null
  synced_count?: number
  last_export_at?: string | null
  last_error?: string | null
  token_expires_at?: string | null
}

// In-process lock por parceiro para evitar dupla rotação simultânea do refresh_token de uso único do Bling
const activeRefreshPromises = new Map<string, Promise<string>>()

/**
 * Busca o registro de conexão do Bling ERP para um parceiro
 */
export async function findBlingIntegration(
  supabase: any,
  partnerId: string
): Promise<PartnerIntegrationRow | null> {
  const { data, error } = await supabase
    .from("partner_integrations")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("provider_slug", BLING_PROVIDER)
    .maybeSingle()

  if (error || !data) return null
  return data as PartnerIntegrationRow
}

/**
 * Resolve Client ID e Client Secret (prioriza credenciais privadas do parceiro; fallback para app público global em env)
 */
export function resolveBlingOAuthAppCredentials(integration?: PartnerIntegrationRow | null): {
  clientId: string | null
  clientSecret: string | null
} {
  const creds = (integration?.credentials as Record<string, any>) || {}
  let customClientId: string | null = null
  let customClientSecret: string | null = null

  if (creds.client_id_encrypted) {
    try {
      customClientId = decrypt(creds.client_id_encrypted, BLING_PROVIDER)
    } catch { }
  }
  if (creds.client_secret_encrypted) {
    try {
      customClientSecret = decrypt(creds.client_secret_encrypted, BLING_PROVIDER)
    } catch { }
  }

  return {
    clientId: customClientId || process.env.BLING_CLIENT_ID || null,
    clientSecret: customClientSecret || process.env.BLING_CLIENT_SECRET || null,
  }
}

/**
 * Obtém um BlingClient válido, renovando automaticamente o access_token via refresh_token se próximo do vencimento
 */
export async function getValidBlingClient(partnerId: string): Promise<BlingClient> {
  const supabase = createAdminClient()
  const integration = await findBlingIntegration(supabase, partnerId)

  if (!integration || integration.status !== "connected" || !integration.access_token_encrypted) {
    throw new Error("Integração com Bling ERP não conectada.")
  }

  const creds = (integration.credentials as Record<string, any>) || {}
  const meta = (integration.metadata as BlingIntegrationMetadata) || {}
  const expiresAtIso = creds.token_expires_at || meta.token_expires_at || null
  const expiresAtMs = expiresAtIso ? new Date(expiresAtIso).getTime() : 0
  const isExpiredOrNearExpiry = expiresAtMs > 0 && Date.now() >= expiresAtMs - 5 * 60 * 1000

  if (!isExpiredOrNearExpiry) {
    const accessToken = decrypt(integration.access_token_encrypted, BLING_PROVIDER)
    return createBlingClient(accessToken)
  }

  // Renova o token com lock por partnerId para não invalidar o refresh_token de uso único em paralelo
  let refreshPromise = activeRefreshPromises.get(partnerId)
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const { clientId, clientSecret } = resolveBlingOAuthAppCredentials(integration)
      if (!clientId || !clientSecret) {
        throw new Error("Credenciais OAuth (Client ID / Client Secret) do Bling não configuradas.")
      }
      if (!creds.refresh_token_encrypted) {
        throw new Error("Refresh token do Bling ausente. Reconecte sua conta do Bling.")
      }

      const currentRefreshToken = decrypt(creds.refresh_token_encrypted, BLING_PROVIDER)
      const tokenData = await refreshBlingAccessToken({
        clientId,
        clientSecret,
        refreshToken: currentRefreshToken,
      })

      const newExpiresAt = new Date(Date.now() + Number(tokenData.expires_in || 21600) * 1000).toISOString()
      const newAccessEncrypted = encrypt(tokenData.access_token, BLING_PROVIDER)
      const newRefreshEncrypted = encrypt(tokenData.refresh_token, BLING_PROVIDER)

      await supabase
        .from("partner_integrations")
        .update({
          access_token_encrypted: newAccessEncrypted,
          credentials: {
            ...creds,
            refresh_token_encrypted: newRefreshEncrypted,
            token_expires_at: newExpiresAt,
          },
          metadata: {
            ...meta,
            token_expires_at: newExpiresAt,
            last_error: null,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id)

      return tokenData.access_token
    })().finally(() => {
      activeRefreshPromises.delete(partnerId)
    })

    activeRefreshPromises.set(partnerId, refreshPromise)
  }

  const freshToken = await refreshPromise
  return createBlingClient(freshToken)
}

function formatBlingDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function addDays(baseDate: Date, days: number): Date {
  const result = new Date(baseDate.getTime())
  result.setDate(result.getDate() + days)
  return result
}

/**
 * Constrói a grade de parcelas para o Bling ERP v3 (cartão parcelado, múltiplos meios,
 * crédito de loja e saldo pendente a receber)
 */
export function buildBlingOrderParcelas(order: {
  total_amount?: number | null
  paid_amount?: number | null
  payment_method?: string | null
  payment_breakdown?: any[] | null
  store_credit_amount?: number | null
  created_at?: string | null
}): BlingOrderParcela[] {
  const totalAmount = Math.max(0, Number(order.total_amount || 0))
  const storeCredit = Math.max(0, Number(order.store_credit_amount || 0))
  const baseDate = order.created_at ? new Date(order.created_at) : new Date()
  const rawBreakdown = Array.isArray(order.payment_breakdown) ? [...order.payment_breakdown] : []

  interface Leg {
    method: string
    amount: number
    installments: number
    isStoreCredit: boolean
  }

  const legs: Leg[] = []
  for (const item of rawBreakdown) {
    if (!item) continue
    const amt = Math.max(0, Number(item.amount ?? item.amountReceived ?? 0))
    if (amt <= 0.009) continue
    const method = String(item.method || order.payment_method || "Outros")
    const installments = Math.max(1, Number(item.installmentNumber || item.installments || 1))
    legs.push({
      method,
      amount: amt,
      installments,
      isStoreCredit: isStoreCreditMethod(method),
    })
  }

  if (storeCredit > 0.009 && !legs.some((l) => l.isStoreCredit)) {
    legs.push({
      method: "Crédito de Loja",
      amount: storeCredit,
      installments: 1,
      isStoreCredit: true,
    })
  }

  if (legs.length === 0 && totalAmount > 0) {
    legs.push({
      method: order.payment_method || "Mercado Pago",
      amount: totalAmount,
      installments: 1,
      isStoreCredit: false,
    })
  }

  const parcelas: BlingOrderParcela[] = []
  let allocated = 0

  for (const leg of legs) {
    const n = Math.max(1, leg.installments)
    const baseVal = Math.floor((leg.amount / n) * 100) / 100
    const remainder = Number((leg.amount - baseVal * n).toFixed(2))

    for (let k = 0; k < n; k++) {
      const val = Number((k === 0 ? baseVal + remainder : baseVal).toFixed(2))
      if (val <= 0.009) continue

      const days = n > 1 ? (k + 1) * 30 : 0
      const obs = leg.isStoreCredit
        ? "Crédito de Loja / Carteira"
        : n > 1
          ? `Parcela ${k + 1}/${n} - ${leg.method}`
          : leg.method

      parcelas.push({
        dataVencimento: formatBlingDate(addDays(baseDate, days)),
        valor: val,
        observacoes: obs,
      })
      allocated = Number((allocated + val).toFixed(2))
    }
  }

  const unallocated = Number((totalAmount - allocated).toFixed(2))
  if (unallocated > 0.009) {
    parcelas.push({
      dataVencimento: formatBlingDate(addDays(baseDate, 30)),
      valor: unallocated,
      observacoes: "Saldo a Receber",
    })
  }

  return parcelas
}

/**
 * Sincroniza produtos, variações e estoque (físico + reservado) do Bling ERP v3 para a Dudit
 */
export async function syncBlingProductsToDudit(params: {
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
  const client = await getValidBlingClient(partnerId)

  let totalProcessed = 0
  let totalCreated = 0
  let totalUpdated = 0
  const errors: string[] = []
  const syncedProductIds = new Set<string>()

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
    message: "bling.sync_products.started",
    metadata: { partnerId, storeId: effectiveStoreId, maxPages },
  })

  try {
    let currentPage = 1

    while (currentPage <= maxPages) {
      const items = await client.listProducts({ pagina: currentPage, limite: 100 })
      if (items.length === 0) break

      // Filtra variações filhas soltas (idProdutoPai > 0) — elas são importadas dentro do produto pai
      const rootItems = items.filter((it) => !it.idProdutoPai || Number(it.idProdutoPai) === 0)

      // Busca saldos em lote para os produtos simples desta página
      const simpleIds = rootItems.filter((it) => it.formato !== "V").map((it) => it.id)
      const stockMap = new Map<number, { physical: number; reserved: number }>()
      if (simpleIds.length > 0) {
        try {
          const balances = await client.getProductStocks(simpleIds)
          for (const b of balances) {
            const physical = Math.max(0, Number(b.saldoFisicoTotal || 0))
            const virtual = Math.max(0, Number(b.saldoVirtualTotal ?? physical))
            const reserved = Math.max(0, physical - virtual)
            stockMap.set(Number(b.produto.id), { physical, reserved })
          }
        } catch { }
      }

      for (const summary of rootItems) {
        if (!summary?.id) continue
        totalProcessed++

        try {
          const detail = await client.getProduct(summary.id)
          if (detail.idProdutoPai && Number(detail.idProdutoPai) > 0) continue

          const externalId = String(detail.id)
          const sku = detail.codigo?.trim() || `BLING-${externalId}`
          const name = detail.nome?.trim() || "Produto sem nome"
          const price = Number(detail.preco || 0)
          const costPrice = Number(detail.precoCusto || 0)
          const unit = detail.unidade?.trim() || "UN"
          const minStock = Number(detail.estoque?.minimo || 0)
          const gtin = detail.gtin?.trim() || null
          const description = detail.descricaoComplementar?.trim() || detail.descricaoCurta?.trim() || null
          const isActive = detail.situacao !== "I"

          const hasVariations = Array.isArray(detail.variacoes) && detail.variacoes.length > 0
          const stockInfo = stockMap.get(Number(detail.id))
          const stock = stockInfo ? stockInfo.physical : Math.max(0, Number(detail.estoque?.saldoVirtualTotal || 0))
          const stockReserved = stockInfo ? stockInfo.reserved : 0

          // Extrai imagens
          const images: string[] = []
          if (detail.imagemURL) images.push(detail.imagemURL)
          if (Array.isArray(detail.midia?.imagens?.externas)) {
            for (const img of detail.midia!.imagens!.externas!) {
              if (img?.link && !images.includes(img.link)) images.push(img.link)
            }
          }
          if (Array.isArray(detail.midia?.imagens?.internas)) {
            for (const img of detail.midia!.imagens!.internas!) {
              if (img?.link && !images.includes(img.link)) images.push(img.link)
            }
          }

          let { data: existingProduct } = await supabase
            .from("products")
            .select("id")
            .eq("partner_id", partnerId)
            .eq("external_id", externalId)
            .maybeSingle()

          if (!existingProduct && sku) {
            const { data: bySku } = await supabase
              .from("products")
              .select("id")
              .eq("partner_id", partnerId)
              .eq("sku", sku)
              .maybeSingle()
            existingProduct = bySku
          }

          const now = new Date().toISOString()
          let targetProductId: string | null = null

          if (existingProduct) {
            targetProductId = existingProduct.id
            const { error: updateErr } = await supabase
              .from("products")
              .update({
                name,
                price,
                cost_price: costPrice,
                sku,
                gtin,
                unit,
                min_stock: minStock,
                stock_quantity: stock,
                stock_reserved: stockReserved,
                description: description || undefined,
                images: images.length > 0 ? images : undefined,
                status: isActive ? "ativo" : "inativo",
                deleted_at: null,
                deleted_by: null,
                deleted_reason: null,
                external_id: externalId,
                external_provider: BLING_PROVIDER,
                last_external_sync_at: now,
                updated_at: now,
              })
              .eq("id", existingProduct.id)

            if (updateErr) {
              errors.push(`Erro ao atualizar ${name} (${sku}): ${updateErr.message}`)
            } else {
              totalUpdated++
              if (targetProductId) syncedProductIds.add(targetProductId)
            }
          } else {
            const { data: createdProduct, error: insertErr } = await supabase
              .from("products")
              .insert({
                partner_id: partnerId,
                store_id: effectiveStoreId,
                name,
                price,
                cost_price: costPrice,
                sku,
                gtin,
                unit,
                min_stock: minStock,
                stock_quantity: stock,
                stock_reserved: stockReserved,
                description: description || "",
                images,
                status: isActive ? "ativo" : "inativo",
                product_type: "Físico",
                condition: "Novo",
                show_price_in_store: true,
                show_in_marketplace: true,
                external_id: externalId,
                external_provider: BLING_PROVIDER,
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
              if (targetProductId) syncedProductIds.add(targetProductId)
            }
          }

          // Dados fiscais
          if (targetProductId && detail.tributacao?.ncm) {
            try {
              await supabase
                .from("product_fiscal_profiles")
                .upsert(
                  {
                    product_id: targetProductId,
                    store_id: effectiveStoreId,
                    ncm: String(detail.tributacao.ncm).trim(),
                    origin: Number(detail.tributacao.origem || 0),
                    updated_at: now,
                  },
                  { onConflict: "product_id" }
                )
            } catch { }
          }

          // Dados logísticos
          if (targetProductId && (detail.pesoBruto || detail.pesoLiquido)) {
            try {
              await supabase
                .from("product_logistics")
                .upsert(
                  {
                    product_id: targetProductId,
                    weight_gross: Number(detail.pesoBruto || 0),
                    weight_net: Number(detail.pesoLiquido || 0),
                    updated_at: now,
                  },
                  { onConflict: "product_id" }
                )
            } catch { }
          }

          // Variações
          if (targetProductId && hasVariations && detail.variacoes) {
            const varIds = detail.variacoes.map((v) => v.id).filter(Boolean)
            const varStockMap = new Map<number, { physical: number; reserved: number }>()
            if (varIds.length > 0) {
              try {
                const balances = await client.getProductStocks(varIds)
                for (const b of balances) {
                  const physical = Math.max(0, Number(b.saldoFisicoTotal || 0))
                  const virtual = Math.max(0, Number(b.saldoVirtualTotal ?? physical))
                  varStockMap.set(Number(b.produto.id), {
                    physical,
                    reserved: Math.max(0, physical - virtual),
                  })
                }
              } catch { }
            }

            let totalVariantStock = 0
            let totalVariantReserved = 0

            for (const v of detail.variacoes) {
              const vSku = v.codigo ? String(v.codigo).trim() : `BLING-${v.id}`
              const rawVarName = v.variacao?.nome || v.nome || vSku
              // Ex no Bling: "Cor:Branca;Tamanho:M" -> "Branca / M"
              const pairs = rawVarName.split(";").map((part) => part.split(":").map((s) => s.trim()))
              const gradeTypes = pairs.filter((p) => p.length === 2).map((p) => p[0])
              const gradeVals = pairs.filter((p) => p.length === 2).map((p) => p[1])
              const gradeType = gradeTypes.length > 0 ? gradeTypes.join(" / ") : "Opção"
              const gradeName = gradeVals.length > 0 ? gradeVals.join(" / ") : rawVarName
              const gradeOptions: Record<string, string> = {}
              pairs.forEach((p) => {
                if (p.length === 2 && p[0] && p[1]) gradeOptions[p[0]] = p[1]
              })

              const vBal = varStockMap.get(Number(v.id))
              const vStock = vBal ? vBal.physical : 0
              const vReserved = vBal ? vBal.reserved : 0
              totalVariantStock += vStock
              totalVariantReserved += vReserved

              const vPrice = Number(v.preco || price)
              const variantFinalPrice = vPrice > 0 ? vPrice : price

              // Limpa eventual produto avulso duplicado criado para essa variação
              await supabase
                .from("products")
                .update({ deleted_at: now, status: "inativo" })
                .eq("partner_id", partnerId)
                .neq("id", targetProductId)
                .is("deleted_at", null)
                .or(`external_id.eq.${v.id},sku.eq.${vSku}`)

              let existingVar = null
              const { data: bySku } = await supabase
                .from("product_variants")
                .select("id")
                .eq("sku", vSku)
                .maybeSingle()
              existingVar = bySku

              if (!existingVar) {
                const { data: byName } = await supabase
                  .from("product_variants")
                  .select("id")
                  .eq("product_id", targetProductId)
                  .eq("variant_name", gradeName)
                  .maybeSingle()
                existingVar = byName
              }

              if (existingVar) {
                await supabase
                  .from("product_variants")
                  .update({
                    variant_name: gradeName,
                    variant_type: gradeType,
                    variant_value: gradeName,
                    sku: vSku,
                    price_adjustment: variantFinalPrice,
                    stock_quantity: vStock,
                    stock_reserved: vReserved,
                    variant_options: gradeOptions,
                    is_active: v.situacao !== "I",
                    updated_at: now,
                  })
                  .eq("id", existingVar.id)
              } else {
                await supabase
                  .from("product_variants")
                  .insert({
                    product_id: targetProductId,
                    variant_name: gradeName,
                    variant_type: gradeType,
                    variant_value: gradeName,
                    sku: vSku,
                    price_adjustment: variantFinalPrice,
                    stock_quantity: vStock,
                    stock_reserved: vReserved,
                    variant_options: gradeOptions,
                    is_active: v.situacao !== "I",
                    created_at: now,
                    updated_at: now,
                  })
              }
            }

            await supabase
              .from("products")
              .update({
                stock_quantity: totalVariantStock,
                stock_reserved: totalVariantReserved,
              })
              .eq("id", targetProductId)
          }
        } catch (itemErr: any) {
          errors.push(`Falha no produto Bling ID ${summary.id}: ${itemErr?.message}`)
        }
      }

      if (items.length < 100) break
      currentPage++
    }

    const integration = await findBlingIntegration(supabase, partnerId)
    if (integration) {
      await supabase
        .from("partner_integrations")
        .update({
          metadata: {
            ...(integration.metadata || {}),
            last_sync_at: new Date().toISOString(),
            synced_count: totalCreated + totalUpdated,
            last_error: errors.length > 0 ? errors[0] : null,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id)
    }

    // Revalida cache de produtos e vitrine do Marketplace imediatamente para refletir estoque/preço na hora
    if (syncedProductIds.size > 0) {
      try {
        const { invalidateProductCache } = await import("@/lib/cache/invalidation")
        const { revalidateProducts, revalidateMarketplace } = await import("@/lib/utils/revalidation")
        for (const pid of syncedProductIds) {
          await invalidateProductCache(pid, partnerId, "update")
          await revalidateProducts(partnerId, pid)
        }
        await revalidateMarketplace()
      } catch (cacheErr) {
        console.warn("[BLING] Aviso ao revalidar cache do marketplace após sync:", cacheErr)
      }
    }

    return {
      success: errors.length === 0 || totalCreated + totalUpdated > 0,
      totalProcessed,
      totalCreated,
      totalUpdated,
      errors,
    }
  } catch (err: any) {
    captureError(err, {
      module: "integrations",
      action: "syncBlingProductsToDudit",
      partnerId,
      metadata: { provider: BLING_PROVIDER },
    })
    return {
      success: false,
      totalProcessed,
      totalCreated,
      totalUpdated,
      errors: [err?.message || "Erro desconhecido ao sincronizar com Bling ERP"],
    }
  }
}

/**
 * Exporta um pedido da Dudit para o Bling ERP v3
 */
export async function exportDuditOrderToBling(orderId: string): Promise<{
  success: boolean
  blingOrderId?: number
  blingOrderNumber?: string | number
  error?: string
}> {
  const supabase = createAdminClient()

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(`
      id,
      order_number,
      total_amount,
      paid_amount,
      situation,
      delivery_fee,
      delivery_type,
      delivery_breakdown,
      delivery_address,
      payment_method,
      payment_provider,
      payment_breakdown,
      store_credit_amount,
      discount_amount,
      discount_value,
      discount_type,
      manual_discount_amount,
      campaign_discount_amount,
      payment_method_discount_amount,
      exchange_return_request_id,
      created_at,
      partner_id,
      customer_id,
      buyer_id,
      customer_name,
      notes,
      external_order_id,
      external_order_number,
      external_provider,
      external_sync_status,
      order_items (
        id,
        product_id,
        variant_id,
        product_name,
        product_price,
        quantity,
        subtotal,
        products (
          id,
          name,
          sku,
          external_id,
          external_provider
        ),
        product_variants (
          id,
          sku,
          variant_name
        )
      ),
      order_shipments (
        id,
        status,
        kind,
        carrier,
        service_name,
        tracking_number,
        tracking_url
      )
    `)
    .eq("id", orderId)
    .single()

  if (orderErr || !order) {
    return { success: false, error: "Pedido não encontrado" }
  }

  if (order.external_sync_status === "synced" && order.external_order_id) {
    return {
      success: true,
      blingOrderId: Number(order.external_order_id),
      blingOrderNumber: order.external_order_number,
    }
  }

  const integration = await findBlingIntegration(supabase, order.partner_id)
  if (!integration || integration.status !== "connected") {
    return { success: false, error: "Bling ERP não conectado para esta loja." }
  }

  const config = (integration.config as BlingIntegrationConfig) || {}
  if (config.auto_export_orders === false) {
    return { success: false, error: "Exportação automática desativada nas configurações." }
  }

  try {
    const client = await getValidBlingClient(order.partner_id)

    const buyerFiscal = await resolveOrderBuyerFiscal(supabase, {
      partner_id: order.partner_id,
      customer_id: order.customer_id,
      buyer_id: order.buyer_id,
      customer_name: order.customer_name,
    })

    const customerName = buyerFiscal.name || order.customer_name || "Cliente Dudit"
    const customerDocument = buyerFiscal.document?.replace(/\D/g, "") || undefined
    const isPj = buyerFiscal.personType === "pj" || (customerDocument && customerDocument.length === 14)

    const targetCustomerId = buyerFiscal.customerId || order.customer_id
    let customerPhone: string | undefined
    let customerEmail: string | undefined
    let addressData: any = null

    if (targetCustomerId) {
      const [{ data: custRow }, { data: addrRow }] = await Promise.all([
        supabase.from("customers").select("email, phone, phone_fixed").eq("id", targetCustomerId).maybeSingle(),
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
      addressData = addrRow || null
    }

    const contactId = await client.findOrCreateContact({
      nome: customerName,
      numeroDocumento: customerDocument,
      tipo: isPj ? "J" : "F",
      email: customerEmail,
      telefone: customerPhone,
      endereco: addressData
        ? {
          endereco: addressData.street || undefined,
          numero: addressData.number || undefined,
          complemento: addressData.complement || undefined,
          bairro: addressData.neighborhood || undefined,
          cep: addressData.zip_code?.replace(/\D/g, "") || undefined,
          municipio: addressData.city || undefined,
          uf: addressData.state || undefined,
        }
        : undefined,
    })

    const deliveryFee = Number(order.delivery_fee || 0)
    const isPickup = String(order.delivery_type || "").toLowerCase() === "pickup"
    const activeShipment = Array.isArray(order.order_shipments)
      ? order.order_shipments.find((s: any) => s.kind !== "return")
      : null
    const breakdown = (order.delivery_breakdown as Record<string, any> | null) || null
    const isCarrier = Boolean(
      activeShipment?.carrier ||
      breakdown?.source === "superfrete" ||
      breakdown?.companyName ||
      breakdown?.carrier
    )

    const carrierName = isPickup
      ? "Retirada na Loja"
      : !isCarrier
        ? "Entrega Própria (Delivery)"
        : breakdown?.companyName || activeShipment?.carrier || breakdown?.carrier || undefined
    const serviceName = isPickup
      ? undefined
      : !isCarrier
        ? "Delivery / Motoboy"
        : activeShipment?.service_name || breakdown?.serviceName || breakdown?.service_name || undefined

    // Modalidade oficial SEFAZ/Bling:
    // 9 = Sem ocorrência de transporte (Retirada), 3 = Transporte Próprio por conta do Remetente (Delivery/Motoboy), 0 = CIF Transportadora
    const blingFretePorConta = isPickup ? 9 : !isCarrier ? 3 : deliveryFee > 0 ? 0 : 9

    const items = (order.order_items || []).map((it: any) => {
      const prod = it.products
      const variant = it.product_variants
      const codigo = variant?.sku || prod?.sku || undefined
      let descricao = it.product_name
      if (variant?.variant_name && !descricao.includes(variant.variant_name)) {
        descricao = `${descricao} - ${variant.variant_name}`
      }
      const blingProdId =
        !variant && prod?.external_provider === BLING_PROVIDER && prod?.external_id
          ? Number(prod.external_id)
          : undefined

      return {
        codigo,
        unidade: "UN",
        quantidade: Number(it.quantity || 1),
        valor: Number(it.product_price || 0),
        descricao,
        ...(blingProdId ? { produto: { id: blingProdId } } : {}),
      }
    })

    const itemsTotal = items.reduce((sum: number, it: any) => sum + it.quantidade * it.valor, 0)
    const orderTotal = Number(order.total_amount || 0)
    const explicitDiscount = Math.max(
      0,
      Number(order.discount_amount || 0) +
      Number(order.manual_discount_amount || 0) +
      Number((order as any).campaign_discount_amount || 0) +
      Number(order.payment_method_discount_amount || 0)
    )
    const impliedDiscount = Math.max(0, Number((itemsTotal + deliveryFee - orderTotal).toFixed(2)))
    const totalDiscount = explicitDiscount > 0.009 ? explicitDiscount : impliedDiscount

    const parcelas = buildBlingOrderParcelas(order)
    const baseDate = order.created_at ? new Date(order.created_at) : new Date()
    const exchangeNote = order.exchange_return_request_id
      ? ` [Troca ref. Devolução #${order.exchange_return_request_id}]`
      : ""

    const payload: BlingOrderPayload = {
      numeroLoja: order.order_number || String(order.id),
      data: formatBlingDate(baseDate),
      contato: { id: contactId },
      itens: items,
      ...(totalDiscount > 0.009 ? { desconto: { valor: Number(totalDiscount.toFixed(2)), unidade: "REAL" } } : {}),
      ...(parcelas.length > 0 ? { parcelas } : {}),
      transporte: {
        fretePorConta: blingFretePorConta,
        frete: deliveryFee > 0 ? deliveryFee : 0,
        ...(carrierName ? { contato: { nome: carrierName } } : {}),
        ...(addressData?.street
          ? {
            etiqueta: {
              nome: customerName,
              endereco: addressData.street,
              numero: addressData.number || "",
              complemento: addressData.complement || "",
              bairro: addressData.neighborhood || "",
              municipio: addressData.city || "",
              uf: addressData.state || "",
              cep: addressData.zip_code?.replace(/\D/g, "") || "",
            },
          }
          : {}),
        ...(serviceName || activeShipment?.tracking_number
          ? {
            volumes: [
              {
                ...(serviceName ? { servico: serviceName } : {}),
                ...(activeShipment?.tracking_number ? { codigoRastreamento: activeShipment.tracking_number } : {}),
              },
            ],
          }
          : {}),
      },
      observacoes: `Pedido Dudit #${order.order_number || order.id}. ${order.notes || ""}${exchangeNote}`.trim(),
    }

    const blingRes = await client.createOrder(payload)

    await supabase
      .from("orders")
      .update({
        external_order_id: String(blingRes.id),
        external_order_number: blingRes.numero ? String(blingRes.numero) : String(blingRes.id),
        external_provider: BLING_PROVIDER,
        external_sync_status: "synced",
        external_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)

    await logAuditEvent({
      partnerId: order.partner_id,
      actorUserId: null,
      entityType: "order",
      entityId: orderId,
      actionType: "bling_order_exported",
      changeLines: [`Pedido exportado para o Bling ERP (Nº ${blingRes.numero || blingRes.id})`],
      source: "system",
      metadata: {
        blingOrderId: blingRes.id,
        blingOrderNumber: blingRes.numero,
      },
    })

    return {
      success: true,
      blingOrderId: blingRes.id,
      blingOrderNumber: blingRes.numero,
    }
  } catch (err: any) {
    captureError(err, {
      module: "integrations",
      action: "exportDuditOrderToBling",
      entityId: orderId,
      metadata: { provider: BLING_PROVIDER },
    })

    await supabase
      .from("orders")
      .update({
        external_provider: BLING_PROVIDER,
        external_sync_status: "error",
        external_sync_error: err?.message || "Erro ao exportar para o Bling",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)

    return { success: false, error: err?.message || "Erro ao exportar para o Bling ERP" }
  }
}

/**
 * Atualiza a situação de um pedido no Bling ERP (ex: cancelado)
 */
export async function updateBlingOrderStatus(params: {
  orderId: string
  situacao: "aberto" | "aprovado" | "cancelado" | "enviado" | "entregue"
}): Promise<{ success: boolean; error?: string }> {
  const { orderId, situacao } = params
  const supabase = createAdminClient()

  const { data: order } = await supabase
    .from("orders")
    .select("id, partner_id, external_order_id, external_provider")
    .eq("id", orderId)
    .maybeSingle()

  if (!order || order.external_provider !== BLING_PROVIDER || !order.external_order_id) {
    return { success: true }
  }

  try {
    const client = await getValidBlingClient(order.partner_id)
    const statuses = await client.listOrderStatuses()

    const matchKeywords: Record<string, string[]> = {
      cancelado: ["cancelado"],
      aprovado: ["atendido", "em andamento", "aprovado"],
      aberto: ["em aberto"],
      enviado: ["atendido", "enviado"],
      entregue: ["atendido", "entregue"],
    }

    const keywords = matchKeywords[situacao] || [situacao]
    const matched = statuses.find((s) =>
      keywords.some((kw) => String(s.nome || "").toLowerCase().includes(kw))
    )

    // IDs padrão do Bling v3 (6 = Em aberto, 9 = Atendido, 12 = Cancelado)
    const fallbackIds: Record<string, number> = {
      aberto: 6,
      aprovado: 9,
      enviado: 9,
      entregue: 9,
      cancelado: 12,
    }
    const targetStatusId = matched?.id || fallbackIds[situacao] || 12

    await client.updateOrderStatus(order.external_order_id, targetStatusId)

    await logAuditEvent({
      partnerId: order.partner_id,
      actorUserId: null,
      entityType: "order",
      entityId: orderId,
      actionType: "bling_order_status_updated",
      changeLines: [`Situação no Bling ERP atualizada para: ${situacao}`],
      source: "system",
      metadata: { blingOrderId: order.external_order_id, situacao, targetStatusId },
    })

    return { success: true }
  } catch (err: any) {
    captureError(err, {
      module: "integrations",
      action: "updateBlingOrderStatus",
      entityId: orderId,
      metadata: { provider: BLING_PROVIDER, situacao },
    })
    return { success: false, error: err?.message || "Erro ao atualizar situação no Bling" }
  }
}

/**
 * Envia atualização de estoque (balanço) de um produto ou variante da Dudit para o Bling ERP
 */
export async function syncDuditStockToBling(params: {
  partnerId: string
  productId?: string
  variantId?: string
  sku?: string
  newStock: number
  reason?: string
}): Promise<{ success: boolean; error?: string }> {
  const { partnerId, productId, variantId, sku, newStock, reason } = params
  const supabase = createAdminClient()

  const integration = await findBlingIntegration(supabase, partnerId)
  if (!integration || integration.status !== "connected") {
    return { success: false, error: "Bling ERP não conectado." }
  }

  const config = (integration.config as BlingIntegrationConfig) || {}
  if (config.sync_stock === false) {
    return { success: false, error: "Sincronização de estoque desativada." }
  }

  try {
    const client = await getValidBlingClient(partnerId)
    let targetBlingId: number | null = null

    // 1. Resolve ID do produto/variação no Bling
    if (variantId) {
      const { data: vRow } = await supabase
        .from("product_variants")
        .select("sku")
        .eq("id", variantId)
        .maybeSingle()

      if (vRow?.sku) {
        const list = await client.listProducts({ codigo: vRow.sku, limite: 5 })
        const found = list.find((p) => String(p.codigo || "").trim().toLowerCase() === vRow.sku.trim().toLowerCase())
        if (found?.id) targetBlingId = found.id
      }
    }

    if (!targetBlingId && productId) {
      const { data: pRow } = await supabase
        .from("products")
        .select("external_id, external_provider, sku")
        .eq("id", productId)
        .maybeSingle()

      if (pRow?.external_provider === BLING_PROVIDER && pRow?.external_id) {
        targetBlingId = Number(pRow.external_id)
      } else if (pRow?.sku) {
        const list = await client.listProducts({ codigo: pRow.sku, limite: 5 })
        const found = list.find((p) => String(p.codigo || "").trim().toLowerCase() === pRow.sku.trim().toLowerCase())
        if (found?.id) targetBlingId = found.id
      }
    }

    if (!targetBlingId && sku) {
      const list = await client.listProducts({ codigo: sku, limite: 5 })
      const found = list.find((p) => String(p.codigo || "").trim().toLowerCase() === sku.trim().toLowerCase())
      if (found?.id) targetBlingId = found.id
    }

    if (!targetBlingId) {
      return { success: false, error: "Produto/variação não encontrado no Bling ERP." }
    }

    // 2. Resolve depósito padrão
    let depositId = config.default_deposit_id || null
    if (!depositId) {
      const deposits = await client.listDeposits()
      const def = deposits.find((d) => d.padrao) || deposits[0]
      if (def?.id) {
        depositId = def.id
        await supabase
          .from("partner_integrations")
          .update({ config: { ...config, default_deposit_id: depositId } })
          .eq("id", integration.id)
      }
    }

    if (!depositId) {
      return { success: false, error: "Nenhum depósito encontrado na conta do Bling." }
    }

    await client.updateProductStock({
      produtoId: targetBlingId,
      depositoId: depositId,
      quantidade: newStock,
      operacao: "B",
      observacoes: reason || "Ajuste de estoque via Dudit",
    })

    return { success: true }
  } catch (err: any) {
    console.warn(`[BLING] Erro ao sincronizar estoque para parceiro ${partnerId}:`, err?.message)
    return { success: false, error: err?.message || "Erro ao atualizar estoque no Bling" }
  }
}

/**
 * Processa eventos de webhook enviados pelo Bling ERP v3 (estoque e NF-e)
 */
export async function processBlingWebhook(
  partnerId: string,
  rawPayload: any
): Promise<{ success: boolean; event: string; affectedCount: number; details?: any }> {
  const supabase = createAdminClient()
  const payload = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload
  const event = String(payload?.event || "").toLowerCase()
  const data = payload?.data || payload
  let affectedCount = 0

  // ─── 1. Atualização de Estoque em Tempo Real ───
  if (event.startsWith("stock.") || event.startsWith("virtual_stock.")) {
    const prodId = data?.produto?.id ? String(data.produto.id) : null
    const physical = Math.max(0, Number(data?.saldoFisicoTotal ?? data?.saldoFisico ?? 0))
    const virtual = Math.max(0, Number(data?.saldoVirtualTotal ?? data?.saldoVirtual ?? physical))
    const reserved = Math.max(0, physical - virtual)

    // Tenta resolver SKU no Bling se necessário
    let sku: string | null = data?.produto?.codigo ? String(data.produto.codigo).trim() : null
    if (!sku && prodId) {
      try {
        const client = await getValidBlingClient(partnerId)
        const prodDetail = await client.getProduct(prodId)
        sku = prodDetail?.codigo?.trim() || null
      } catch { }
    }

    let matchedVariant = false
    if (sku) {
      const { data: matchedVariants } = await supabase
        .from("product_variants")
        .select("id, product_id, products!inner(partner_id)")
        .ilike("sku", sku)
        .eq("products.partner_id", partnerId)

      if (matchedVariants && matchedVariants.length > 0) {
        matchedVariant = true
        for (const variant of matchedVariants) {
          await supabase
            .from("product_variants")
            .update({
              stock_quantity: physical,
              stock_reserved: reserved,
              updated_at: new Date().toISOString(),
            })
            .eq("id", variant.id)

          const { data: allVars } = await supabase
            .from("product_variants")
            .select("stock_quantity, stock_reserved")
            .eq("product_id", variant.product_id)

          const totalParentStock = (allVars || []).reduce((acc: number, v: any) => acc + Math.max(0, Number(v.stock_quantity || 0)), 0)
          const totalParentReserved = (allVars || []).reduce((acc: number, v: any) => acc + Math.max(0, Number(v.stock_reserved || 0)), 0)

          await supabase
            .from("products")
            .update({
              stock_quantity: totalParentStock,
              stock_reserved: totalParentReserved,
              last_external_sync_at: new Date().toISOString(),
            })
            .eq("id", variant.product_id)

          try {
            const { invalidateProductCache } = await import("@/lib/cache/invalidation")
            await invalidateProductCache(variant.product_id, partnerId, "update", { silent: true })
          } catch { }

          affectedCount++
        }
      }
    }

    if (!matchedVariant && (prodId || sku)) {
      let query = supabase
        .from("products")
        .select("id")
        .eq("partner_id", partnerId)
        .is("deleted_at", null)

      if (prodId && sku) {
        query = query.or(`external_id.eq.${prodId},sku.ilike.${sku}`)
      } else if (prodId) {
        query = query.eq("external_id", prodId)
      } else if (sku) {
        query = query.ilike("sku", sku)
      }

      const { data: matchedProducts } = await query
      for (const prod of matchedProducts || []) {
        await supabase
          .from("products")
          .update({
            stock_quantity: physical,
            stock_reserved: reserved,
            last_external_sync_at: new Date().toISOString(),
          })
          .eq("id", prod.id)

        try {
          const { invalidateProductCache } = await import("@/lib/cache/invalidation")
          await invalidateProductCache(prod.id, partnerId, "update", { silent: true })
        } catch { }

        affectedCount++
      }
    }

    return { success: true, event: event || "stock.updated", affectedCount }
  }

  // ─── 2. Nota Fiscal Eletrônica (NF-e) Autorizada ───
  if (event.startsWith("invoice.") || event.includes("nfe")) {
    const nfeId = data?.id
    if (nfeId) {
      try {
        const client = await getValidBlingClient(partnerId)
        const nfe = await client.getNfe(nfeId)
        const orderRef = nfe?.numeroPedidoLoja ? String(nfe.numeroPedidoLoja).trim() : null
        const danfeUrl = nfe?.linkPDF || nfe?.linkDanfe || null

        if (orderRef) {
          const { data: orderRow } = await supabase
            .from("orders")
            .select("id, order_number")
            .eq("partner_id", partnerId)
            .or(`order_number.eq.${orderRef},external_order_id.eq.${orderRef}`)
            .maybeSingle()

          if (orderRow?.id) {
            const nfeNumber = nfe?.numero ? String(nfe.numero).trim() : String(nfeId)
            const nfeSeries = nfe?.serie ? String(nfe.serie).trim() : "1"
            const nfeAccessKey = nfe?.chaveAcesso ? String(nfe.chaveAcesso).replace(/\D/g, "") : null

            await supabase
              .from("orders")
              .update({
                nfe_number: nfeNumber,
                nfe_series: nfeSeries,
                nfe_access_key: nfeAccessKey,
                nfe_issued_at: nfe?.dataEmissao || new Date().toISOString(),
                fiscal_document_type: "nfe",
                updated_at: new Date().toISOString(),
              })
              .eq("id", orderRow.id)

            if (danfeUrl) {
              const danfeFileName = `DANFE-NF-${nfeNumber}.pdf`
              const { data: existingDanfe } = await supabase
                .from("order_attachments")
                .select("id")
                .eq("order_id", orderRow.id)
                .or(`file_name.eq.${danfeFileName},file_key.eq.${danfeUrl}`)
                .maybeSingle()

              if (!existingDanfe) {
                let finalDanfeKey = danfeUrl
                let danfeSize: number | null = null

                try {
                  const res = await fetch(danfeUrl, { signal: AbortSignal.timeout(15000) })
                  if (res.ok) {
                    const buffer = Buffer.from(await res.arrayBuffer())
                    danfeSize = buffer.length
                    const r2Key = `orders/attachments/${orderRow.id}/${danfeFileName}`
                    const { uploadBufferToR2 } = await import("@/lib/r2/server")
                    await uploadBufferToR2({
                      buffer,
                      key: r2Key,
                      contentType: "application/pdf",
                    })
                    finalDanfeKey = r2Key
                  }
                } catch (fetchErr) {
                  console.warn("[bling-integration] Falha ao salvar DANFE no R2 (dudit-private), usando URL externa:", fetchErr)
                }

                await supabase.from("order_attachments").insert({
                  order_id: orderRow.id,
                  file_name: danfeFileName,
                  file_key: finalDanfeKey,
                  file_type: "application/pdf",
                  file_size: danfeSize,
                })
              }
            }

            await logAuditEvent({
              partnerId,
              actorUserId: null,
              entityType: "order",
              entityId: orderRow.id,
              actionType: "bling_nfe_received",
              changeLines: [`NF-e Nº ${nfeNumber} autorizada no Bling ERP e anexada ao pedido.`],
              source: "system",
              metadata: { nfeId, danfeUrl, chaveAcesso: nfeAccessKey },
            })
            affectedCount++
          }
        }
      } catch (nfeErr: any) {
        console.warn("[BLING] Erro ao processar NF-e via webhook:", nfeErr?.message)
      }
    }
    return { success: true, event: event || "invoice.updated", affectedCount }
  }

  return { success: true, event: event || "ignored", affectedCount: 0 }
}
