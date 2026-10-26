"use server"

import { createAdminClient } from "@/lib/supabase/server"
import {
  requirePartnerAccess,
  requirePartnerAccessWithPermission,
  requireUser,
} from "@/lib/auth/authorization"
import { logAudit } from "@/lib/observability/audit-log"
import { resolveOrderBuyerFiscal } from "@/lib/orders/buyer-fiscal"
import { revalidateOrders } from "@/lib/utils/revalidation"

export interface OrderFiscalStatus {
  orderId: string
  partnerId: string
  requiresNfe: boolean
  buyerName: string | null
  buyerPersonType: "pf" | "pj" | null
  nfeNumber: string | null
  nfeSeries: string | null
  nfeAccessKey: string | null
  nfeIssuedAt: string | null
  fiscalDocumentType: string | null
  overrideAt: string | null
  overrideReason: string | null
}

async function loadOrder(orderId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("orders")
    .select(
      "id, partner_id, customer_id, buyer_id, customer_name, nfe_number, nfe_series, nfe_access_key, nfe_issued_at, fiscal_document_type, nfe_override_at, nfe_override_reason",
    )
    .eq("id", orderId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("Pedido não encontrado")
  return data as any
}

async function resolveBuyerDocument(order: any) {
  return resolveOrderBuyerFiscal(createAdminClient(), order)
}

export async function getOrderFiscalStatusAction(input: { orderId: string }): Promise<{
  success: boolean
  data?: OrderFiscalStatus
  error?: string
}> {
  try {
    await requireUser()
    const order = await loadOrder(input.orderId)
    await requirePartnerAccess(order.partner_id)

    const buyer = await resolveBuyerDocument(order)

    return {
      success: true,
      data: {
        orderId: order.id,
        partnerId: order.partner_id,
        // A obrigação de NF-e/NFS-e existe sempre que o comprador é PJ.
        requiresNfe: buyer.personType === "pj",
        buyerName: buyer.name,
        buyerPersonType: buyer.personType,
        nfeNumber: order.nfe_number || null,
        nfeSeries: order.nfe_series || null,
        nfeAccessKey: order.nfe_access_key || null,
        nfeIssuedAt: order.nfe_issued_at || null,
        fiscalDocumentType: order.fiscal_document_type || null,
        overrideAt: order.nfe_override_at || null,
        overrideReason: order.nfe_override_reason || null,
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro ao carregar dados fiscais do pedido." }
  }
}

export interface SaveOrderNfeInput {
  orderId: string
  nfeNumber: string
  nfeSeries?: string | null
  nfeAccessKey?: string | null
  nfeIssuedAt?: string | null
  fiscalDocumentType?: "nfe" | "nfse" | null
}

export async function saveOrderNfeAction(input: SaveOrderNfeInput): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const user = await requireUser()
    const order = await loadOrder(input.orderId)
    await requirePartnerAccessWithPermission(order.partner_id, "orders", "edit", user)

    const number = String(input.nfeNumber || "").trim()
    if (!number) return { success: false, error: "Informe o número da nota fiscal." }
    if (number.length > 30) return { success: false, error: "Número da nota fiscal inválido." }

    const accessKey = String(input.nfeAccessKey || "").replace(/\D/g, "")
    if (accessKey && accessKey.length !== 44) {
      return { success: false, error: "A chave de acesso da NF-e deve ter 44 dígitos." }
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from("orders")
      .update({
        nfe_number: number,
        nfe_series: input.nfeSeries ? String(input.nfeSeries).trim() : null,
        nfe_access_key: accessKey || null,
        nfe_issued_at: input.nfeIssuedAt || new Date().toISOString(),
        fiscal_document_type: input.fiscalDocumentType || "nfe",
        nfe_override_by: null,
        nfe_override_at: null,
        nfe_override_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.orderId)

    if (error) return { success: false, error: error.message }

    await revalidateOrders(order.partner_id)

    logAudit("order.nfe_saved", {
      partnerId: order.partner_id,
      orderId: input.orderId,
      nfeNumber: number,
      userId: user.id,
    })

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro ao salvar a nota fiscal." }
  }
}

export async function recordNfeOverrideAction(input: {
  orderId: string
  reason?: string | null
}): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireUser()
    const order = await loadOrder(input.orderId)
    await requirePartnerAccessWithPermission(order.partner_id, "orders", "edit", user)

    const admin = createAdminClient()
    const reason =
      (input.reason || "").trim() ||
      "Vendedor optou por enviar sem informar o número da nota fiscal."

    const { error } = await admin
      .from("orders")
      .update({
        nfe_override_by: user.id,
        nfe_override_at: new Date().toISOString(),
        nfe_override_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.orderId)

    if (error) return { success: false, error: error.message }

    await revalidateOrders(order.partner_id)

    logAudit("order.nfe_override", {
      partnerId: order.partner_id,
      orderId: input.orderId,
      reason,
      userId: user.id,
    })

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro ao registrar a liberação." }
  }
}
