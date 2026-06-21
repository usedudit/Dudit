"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { generateSignedUploadUrl } from "@/lib/r2/server"
import { R2_PREFIXES, ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS, MAX_FILE_SIZE } from "@/lib/r2/config"
import { createNotification } from "@/lib/services/notification.service"
import { revalidatePath } from "next/cache"
import { increment_usage_counter } from "@/lib/services/subscription.service"

export type ServiceOrderListCursor = { createdAt: string; id: string } | null

function buildKeysetOrFilter(cursor: { createdAt: string; id: string }): string {
  const ts = cursor.createdAt
  const id = cursor.id
  const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`
  return `created_at.lt.${q(ts)},and(created_at.eq.${q(ts)},id.lt.${q(id)})`
}

const PAGE_SIZE = 100

export async function getERPServiceOrdersPageAction(
  partnerId: string,
  options?: { cursor?: ServiceOrderListCursor; limit?: number; status?: string },
): Promise<
  | { success: true; items: any[]; nextCursor: ServiceOrderListCursor; hasMore: boolean }
  | { success: false; error: string }
> {
  try {
    await requirePermission(partnerId, "service_orders", "view")
    const supabase = await getSupabaseServerClient()

    const cursor = options?.cursor ?? null
    const limit = Math.max(1, Math.min(250, Math.floor(Number(options?.limit || PAGE_SIZE))))
    const fetchLimit = limit + 1

    let q = supabase
      .from("service_orders")
      .select("id, order_number, title, status, customer_id, customer_snapshot, assigned_user_id, expected_completion_date, total_amount, created_at, updated_at, created_by, completed_at, signature_image_key, signed_at")
      .eq("partner_id", partnerId)

    if (options?.status && options.status !== "all") {
      q = q.eq("status", options.status)
    }

    if (cursor) {
      q = q.or(buildKeysetOrFilter(cursor))
    }

    const { data, error } = await q
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(fetchLimit)

    if (error) throw error

    const rows = data || []
    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows
    const last = items[items.length - 1]
    const nextCursor = hasMore && last?.created_at && last?.id
      ? { createdAt: String(last.created_at), id: String(last.id) }
      : null

    return { success: true, items, nextCursor, hasMore }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao carregar ordens de serviço" }
  }
}

export async function getServiceOrderDetailsAction(
  serviceOrderId: string,
  partnerId: string,
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    await requirePermission(partnerId, "service_orders", "view")
    const supabase = await getSupabaseServerClient()

    const { data: order, error } = await supabase
      .from("service_orders")
      .select("*")
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)
      .single()

    if (error) throw error
    if (!order) throw new Error("Ordem de serviço não encontrada")

    const [servicesRes, productsRes, attachmentsRes, historyRes, historyRes2] = await Promise.all([
      supabase.from("service_order_services").select("*, services(name, price)").eq("service_order_id", serviceOrderId).order("sort_order"),
      supabase.from("service_order_products").select("*, products(name, price)").eq("service_order_id", serviceOrderId).order("sort_order"),
      supabase.from("service_order_attachments").select("*").eq("service_order_id", serviceOrderId).order("created_at", { ascending: false }),
      fetchTimelineForEntity("service_order", serviceOrderId, partnerId),
      supabase.from("service_order_history").select("*").eq("service_order_id", serviceOrderId).order("created_at", { ascending: false }),
    ])

    return {
      success: true,
      data: {
        ...order,
        services: servicesRes.data || [],
        products: productsRes.data || [],
        attachments: attachmentsRes.data || [],
        history: historyRes,
        statusHistory: historyRes2?.data || [],
      },
    }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao carregar detalhes da OS" }
  }
}

async function fetchTimelineForEntity(entityType: string, entityId: string, partnerId: string) {
  const admin = getAdminClient()
  const { data } = await admin
    .from("audit_logs")
    .select("id, actor_user_id, action_type, change_lines, created_at, metadata")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(50)
  return data || []
}

export async function createServiceOrderAction(
  partnerId: string,
  input: {
    title: string
    description?: string
    internal_notes?: string
    customer_id?: string
    expected_completion_date?: string
    assigned_user_id?: string
    status?: string
  },
): Promise<{ success: true; data: any; orderNumber: string } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "create")
    const user = await requireUser()
    const admin = getAdminClient()

    const { data: seqRes } = await admin.rpc("next_service_order_number", {
      p_partner_id: partnerId,
    })
    const orderNumber = seqRes || `OS-${new Date().getFullYear()}-0001`

    const status = input.status || "aberta"

    const { data, error } = await admin
      .from("service_orders")
      .insert({
        partner_id: partnerId,
        order_number: orderNumber,
        title: input.title,
        description: input.description || null,
        internal_notes: input.internal_notes || null,
        customer_id: input.customer_id || null,
        customer_snapshot: input.customer_id ? await getCustomerSnapshot(admin, input.customer_id) : null,
        expected_completion_date: input.expected_completion_date || null,
        assigned_user_id: input.assigned_user_id || null,
        status,
        created_by: user.id,
      })
      .select("*")
      .single()

    if (error) throw error

    await logAuditEvent({
      partnerId,
      actorUserId: user.id,
      entityType: "service_order",
      entityId: data.id,
      actionType: "created",
      source: "manual",
      changeLines: [`OS #${orderNumber} criada por ${user.email || "usuário"}`],
    })

    try {
      await increment_usage_counter(partnerId, "service_orders_month_count")
    } catch {}

    if (input.assigned_user_id) {
      try {
        await createNotification({
          userId: input.assigned_user_id,
          type: "service_order_assigned" as any,
          title: "Nova OS atribuída",
          message: `OS #${orderNumber}: ${input.title}`,
          entityType: "service_order" as any,
          entityId: data.id,
          data: { partnerId, orderNumber },
          idempotencyKey: `os-assigned-${data.id}-${input.assigned_user_id}`,
        })
      } catch {}
    }

    revalidatePath("/erp/service-orders")
    return { success: true, data, orderNumber }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao criar ordem de serviço" }
  }
}

async function getCustomerSnapshot(admin: any, customerId: string) {
  const { data } = await admin
    .from("customers")
    .select("id, name, email, phone, address, cpf_cnpj, city, state, zip_code")
    .eq("id", customerId)
    .single()
  return data || null
}

export async function addServicesToOrderAction(
  partnerId: string,
  serviceOrderId: string,
  services: { service_id: string; quantity?: number }[],
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()
    const admin = getAdminClient()

    const { data: svcRows, error: svcErr } = await admin
      .from("services")
      .select("id, name, price, cost_price")
      .in("id", services.map(s => s.service_id))
    if (svcErr) throw svcErr

    const items = services.map((s, idx) => {
      const svc = svcRows?.find((r: any) => r.id === s.service_id)
      const qty = s.quantity || 1
      return {
        service_order_id: serviceOrderId,
        service_id: s.service_id,
        service_name: svc?.name || "Serviço removido",
        service_price: svc?.price || 0,
        quantity: qty,
        total_price: (svc?.price || 0) * qty,
        sort_order: idx,
      }
    })

    const { data, error } = await admin.from("service_order_services").insert(items).select("*")
    if (error) throw error

    await recalcTotals(admin, serviceOrderId)

    await logAuditEvent({
      partnerId, actorUserId: user.id,
      entityType: "service_order", entityId: serviceOrderId,
      actionType: "services_added", source: "manual",
      changeLines: [`${items.length} serviço(s) adicionado(s)`],
    })

    revalidatePath("/erp/service-orders")
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao adicionar serviços" }
  }
}

export async function addProductsToOrderAction(
  partnerId: string,
  serviceOrderId: string,
  products: { product_id: string; variant_id?: string; quantity?: number }[],
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()
    const admin = getAdminClient()

    const { data: prodRows, error: prodErr } = await admin
      .from("products")
      .select("id, name, price, cost_price")
      .in("id", products.map(p => p.product_id))
    if (prodErr) throw prodErr

    const items = products.map((p, idx) => {
      const prod = prodRows?.find((r: any) => r.id === p.product_id)
      const qty = p.quantity || 1
      return {
        service_order_id: serviceOrderId,
        product_id: p.product_id,
        variant_id: p.variant_id || null,
        product_name: prod?.name || "Produto removido",
        unit_price: prod?.price || 0,
        quantity: qty,
        total_price: (prod?.price || 0) * qty,
        sort_order: idx,
      }
    })

    const { data, error } = await admin.from("service_order_products").insert(items).select("*")
    if (error) throw error

    await recalcTotals(admin, serviceOrderId)

    await logAuditEvent({
      partnerId, actorUserId: user.id,
      entityType: "service_order", entityId: serviceOrderId,
      actionType: "products_added", source: "manual",
      changeLines: [`${items.length} produto(s) adicionado(s)`],
    })

    revalidatePath("/erp/service-orders")
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao adicionar produtos" }
  }
}

export async function updateServiceOrderStatusAction(
  partnerId: string,
  serviceOrderId: string,
  status: string,
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()
    const admin = getAdminClient()

    const { data: current } = await admin
      .from("service_orders")
      .select("status, order_number")
      .eq("id", serviceOrderId)
      .single()

    if (!current) throw new Error("OS não encontrada")

    const updateData: any = { status }
    if (status === "concluida") {
      updateData.completed_at = new Date().toISOString()
    }

    const { data, error } = await admin
      .from("service_orders")
      .update(updateData)
      .eq("id", serviceOrderId)
      .select("*")
      .single()

    if (error) throw error

    await logAuditEvent({
      partnerId, actorUserId: user.id,
      entityType: "service_order", entityId: serviceOrderId,
      actionType: "status_changed", source: "manual",
      changeLines: [`Status alterado: ${current.status} → ${status}`],
    })

    await admin.from("service_order_history").insert({
      service_order_id: serviceOrderId,
      previous_status: current.status,
      new_status: status,
      changed_fields: JSON.stringify({ status: { from: current.status, to: status } }),
      created_by: user.id,
    })

    revalidatePath("/erp/service-orders")
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao atualizar status" }
  }
}

export async function assignServiceOrderAction(
  partnerId: string,
  serviceOrderId: string,
  assignedUserId: string | null,
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()
    const admin = getAdminClient()

    const { data, error } = await admin
      .from("service_orders")
      .update({ assigned_user_id: assignedUserId })
      .eq("id", serviceOrderId)
      .select("*")
      .single()

    if (error) throw error

    await logAuditEvent({
      partnerId, actorUserId: user.id,
      entityType: "service_order", entityId: serviceOrderId,
      actionType: "assigned", source: "manual",
      changeLines: [assignedUserId ? `OS atribuída a novo responsável` : `Responsável removido`],
    })

    if (assignedUserId) {
      try {
        await createNotification({
          userId: assignedUserId,
          type: "service_order_assigned" as any,
          title: "OS atribuída a você",
          message: `OS #${data.order_number}: ${data.title}`,
          entityType: "service_order" as any,
          entityId: serviceOrderId,
          data: { partnerId, orderNumber: data.order_number },
          idempotencyKey: `os-assigned-${serviceOrderId}-${assignedUserId}`,
        })
      } catch {}
    }

    revalidatePath("/erp/service-orders")
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao atribuir OS" }
  }
}

export async function saveSignatureAction(
  partnerId: string,
  serviceOrderId: string,
  signatureImageKey: string,
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()
    const admin = getAdminClient()

    const { data, error } = await admin
      .from("service_orders")
      .update({
        signature_image_key: signatureImageKey,
        signed_at: new Date().toISOString(),
      })
      .eq("id", serviceOrderId)
      .select("*")
      .single()

    if (error) throw error

    await logAuditEvent({
      partnerId, actorUserId: user.id,
      entityType: "service_order", entityId: serviceOrderId,
      actionType: "signed", source: "manual",
      changeLines: ["OS assinada pelo cliente"],
    })

    revalidatePath("/erp/service-orders")
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao salvar assinatura" }
  }
}

export async function getPresignedUploadUrlAction(
  partnerId: string,
  prefix: string,
  fileName: string,
  fileType: string,
  fileSize: number,
): Promise<
  | { success: true; uploadUrl: string; publicUrl: string; key: string }
  | { success: false; error: string }
> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()

    if (fileSize > MAX_FILE_SIZE) {
      return { success: false, error: "Arquivo muito grande. Máximo: 5MB." }
    }

    const result = await generateSignedUploadUrl({
      fileName,
      fileType,
      userId: user.id,
      prefix,
      allowedMimeTypes: [...ALLOWED_MIME_TYPES, "application/pdf", "image/svg+xml"].filter(t => t !== "image/svg+xml"),
      allowedExtensions: [...ALLOWED_EXTENSIONS, ".pdf"] as any,
    })

    return {
      success: true,
      uploadUrl: result.uploadUrl,
      publicUrl: result.publicUrl,
      key: result.key,
    }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao gerar URL de upload" }
  }
}

export async function saveAttachmentAction(
  partnerId: string,
  serviceOrderId: string,
  fileKey: string,
  fileName: string,
  fileType: string,
  fileSize: number,
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()
    const admin = getAdminClient()

    const { data, error } = await admin
      .from("service_order_attachments")
      .insert({
        service_order_id: serviceOrderId,
        file_key: fileKey,
        file_name: fileName,
        file_type: fileType,
        file_size: fileSize,
        uploaded_by: user.id,
      })
      .select("*")
      .single()

    if (error) throw error
    revalidatePath("/erp/service-orders")
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao salvar anexo" }
  }
}

export async function deleteAttachmentAction(
  partnerId: string,
  attachmentId: string,
  serviceOrderId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()
    const admin = getAdminClient()

    const { data: attachment } = await admin
      .from("service_order_attachments")
      .select("file_key")
      .eq("id", attachmentId)
      .single()

    if (attachment?.file_key) {
      const { deleteFileFromR2 } = await import("@/lib/r2/server")
      try { await deleteFileFromR2(attachment.file_key) } catch {}
    }

    await admin.from("service_order_attachments").delete().eq("id", attachmentId)

    await logAuditEvent({
      partnerId, actorUserId: user.id,
      entityType: "service_order", entityId: serviceOrderId,
      actionType: "attachment_deleted", source: "manual",
      changeLines: ["Anexo removido"],
    })

    revalidatePath("/erp/service-orders")
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao remover anexo" }
  }
}

export async function deleteServiceOrderAction(
  partnerId: string,
  serviceOrderId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "delete")
    const user = await requireUser()
    const admin = getAdminClient()

    await admin.from("service_orders").delete().eq("id", serviceOrderId).eq("partner_id", partnerId)

    await logAuditEvent({
      partnerId, actorUserId: user.id,
      entityType: "service_order", entityId: serviceOrderId,
      actionType: "deleted", source: "manual",
      changeLines: ["OS deletada"],
    })

    revalidatePath("/erp/service-orders")
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao deletar OS" }
  }
}

async function recalcTotals(admin: any, serviceOrderId: string) {
  const { data: services } = await admin
    .from("service_order_services")
    .select("total_price")
    .eq("service_order_id", serviceOrderId)

  const { data: products } = await admin
    .from("service_order_products")
    .select("total_price")
    .eq("service_order_id", serviceOrderId)

  const totalService = (services || []).reduce((sum: number, s: any) => sum + Number(s.total_price || 0), 0)
  const totalProduct = (products || []).reduce((sum: number, p: any) => sum + Number(p.total_price || 0), 0)
  const total = totalService + totalProduct

  await admin
    .from("service_orders")
    .update({
      total_service_amount: totalService,
      total_product_amount: totalProduct,
      total_amount: total,
    })
    .eq("id", serviceOrderId)
}

export async function getServiceOrderByTokenAction(
  token: string,
  ): Promise<{ success: true; data: { serviceOrder: any; services: any[]; products: any[]; attachments: any[]; history: any[]; statusHistory: any[] } } | { success: false; error: string }> {
  try {
    const admin = getAdminClient()

    const { data: row, error } = await admin
      .from("service_orders")
      .select("id, order_number, status, title, description, expected_completion_date, completed_at, total_service_amount, total_product_amount, total_amount, signature_image_key, signed_at, token_revoked_at, customer_snapshot, created_at")
      .eq("public_token", token)
      .single()

    if (error || !row) throw new Error("Ordem de serviço não encontrada")
    if (row.token_revoked_at) throw new Error("Link expirado ou revogado")

    const [services, products, attachments, historyRes, statusHistoryRes] = await Promise.all([
      admin.from("service_order_services").select("*").eq("service_order_id", row.id).order("sort_order"),
      admin.from("service_order_products").select("*").eq("service_order_id", row.id).order("sort_order"),
      admin.from("service_order_attachments").select("file_name, file_key, file_type, created_at").eq("service_order_id", row.id).order("created_at", { ascending: false }),
      admin.from("audit_logs").select("id, action_type, change_lines, created_at").eq("entity_type", "service_order").eq("entity_id", row.id).order("created_at", { ascending: false }).limit(50),
      admin.from("service_order_history").select("*").eq("service_order_id", row.id).order("created_at", { ascending: false }),
    ])

    const customerName = (row.customer_snapshot as any)?.name || null

    const serviceOrder = {
      id: row.id,
      order_number: row.order_number,
      status: row.status,
      title: row.title,
      description: row.description,
      expected_completion_date: row.expected_completion_date,
      completed_at: row.completed_at,
      created_at: row.created_at,
      total_service_amount: row.total_service_amount,
      total_product_amount: row.total_product_amount,
      total_amount: row.total_amount,
      signature_image_key: row.signature_image_key,
      signed_at: row.signed_at,
      customer_name: customerName,
    }

    return {
      success: true,
      data: {
        serviceOrder,
        services: services.data || [],
        products: products.data || [],
        attachments: attachments.data || [],
        history: historyRes.data || [],
        statusHistory: statusHistoryRes.data || [],
      },
    }
  } catch (err: any) {
    return { success: false, error: err.message || "Ordem de serviço não encontrada" }
  }
}

export async function updateServiceOrderAction(
  partnerId: string,
  serviceOrderId: string,
  input: {
    title?: string
    description?: string
    internal_notes?: string
    customer_id?: string | null
    expected_completion_date?: string | null
    assigned_user_id?: string | null
    status?: string
  },
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()
    const admin = getAdminClient()

    const { data: current, error: getErr } = await admin
      .from("service_orders")
      .select("*")
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)
      .single()

    if (getErr || !current) throw new Error("Ordem de serviço não encontrada")

    const updateData: any = {}
    if (input.title !== undefined) updateData.title = input.title
    if (input.description !== undefined) updateData.description = input.description
    if (input.internal_notes !== undefined) updateData.internal_notes = input.internal_notes
    if (input.customer_id !== undefined) {
      updateData.customer_id = input.customer_id
      updateData.customer_snapshot = input.customer_id ? await getCustomerSnapshot(admin, input.customer_id) : null
    }
    if (input.expected_completion_date !== undefined) updateData.expected_completion_date = input.expected_completion_date
    if (input.assigned_user_id !== undefined) updateData.assigned_user_id = input.assigned_user_id
    if (input.status !== undefined) updateData.status = input.status

    const { data, error } = await admin
      .from("service_orders")
      .update(updateData)
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)
      .select("*")
      .single()

    if (error) throw error

    // Log audit event
    const changes = []
    if (input.title && input.title !== current.title) changes.push(`Título: "${current.title}" -> "${input.title}"`)
    if (input.status && input.status !== current.status) changes.push(`Status: "${current.status}" -> "${input.status}"`)

    await logAuditEvent({
      partnerId, actorUserId: user.id,
      entityType: "service_order", entityId: serviceOrderId,
      actionType: "updated", source: "manual",
      changeLines: changes.length > 0 ? changes : ["Dados da OS atualizados"],
    })

    revalidatePath("/erp/service-orders")
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao atualizar ordem de serviço" }
  }
}

export async function syncServiceOrderServicesAction(
  partnerId: string,
  serviceOrderId: string,
  services: { service_id: string; quantity: number }[],
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const admin = getAdminClient()

    // 1. Delete all existing services
    const { error: delErr } = await admin
      .from("service_order_services")
      .delete()
      .eq("service_order_id", serviceOrderId)
    if (delErr) throw delErr

    if (services.length > 0) {
      // 2. Fetch service names/prices
      const { data: svcRows, error: svcErr } = await admin
        .from("services")
        .select("id, name, price")
        .in("id", services.map(s => s.service_id))
      if (svcErr) throw svcErr

      const items = services.map((s, idx) => {
        const svc = svcRows?.find((r: any) => r.id === s.service_id)
        const qty = s.quantity || 1
        return {
          service_order_id: serviceOrderId,
          service_id: s.service_id,
          service_name: svc?.name || "Serviço removido",
          service_price: svc?.price || 0,
          quantity: qty,
          total_price: (svc?.price || 0) * qty,
          sort_order: idx,
        }
      })

      const { error: insErr } = await admin.from("service_order_services").insert(items)
      if (insErr) throw insErr
    }

    await recalcTotals(admin, serviceOrderId)
    revalidatePath("/erp/service-orders")
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao sincronizar serviços" }
  }
}

export async function syncServiceOrderProductsAction(
  partnerId: string,
  serviceOrderId: string,
  products: { product_id: string; variant_id?: string | null; quantity: number }[],
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const admin = getAdminClient()

    // 1. Delete all existing products
    const { error: delErr } = await admin
      .from("service_order_products")
      .delete()
      .eq("service_order_id", serviceOrderId)
    if (delErr) throw delErr

    if (products.length > 0) {
      // 2. Fetch product names/prices
      const { data: prodRows, error: prodErr } = await admin
        .from("products")
        .select("id, name, price")
        .in("id", products.map(p => p.product_id))
      if (prodErr) throw prodErr

      const items = products.map((p, idx) => {
        const prod = prodRows?.find((r: any) => r.id === p.product_id)
        const qty = p.quantity || 1
        return {
          service_order_id: serviceOrderId,
          product_id: p.product_id,
          variant_id: p.variant_id || null,
          product_name: prod?.name || "Produto removido",
          unit_price: prod?.price || 0,
          quantity: qty,
          total_price: (prod?.price || 0) * qty,
          sort_order: idx,
        }
      })

      const { error: insErr } = await admin.from("service_order_products").insert(items)
      if (insErr) throw insErr
    }

    await recalcTotals(admin, serviceOrderId)
    revalidatePath("/erp/service-orders")
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao sincronizar produtos" }
  }
}
