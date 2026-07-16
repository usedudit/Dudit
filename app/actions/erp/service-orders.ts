"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { sanitizeNotes } from "@/lib/input-validator"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { generateSignedUploadUrl } from "@/lib/r2/server"
import {
  R2_PREFIXES,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
  getUploadKindFromMimeType,
  getUploadValidationRules,
  ALL_MIME_TO_EXT,
} from "@/lib/r2/config"
import { createNotification } from "@/lib/services/notification.service"
import { revalidatePath } from "next/cache"
import { checkLimit, increment_usage_counter } from "@/lib/services/subscription.service"

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

    const [servicesRes, productsRes, attachmentsRes, historyRes, saleRes] = await Promise.all([
      supabase.from("service_order_services").select("*, services(name, price)").eq("service_order_id", serviceOrderId).order("sort_order"),
      supabase.from("service_order_products").select("*, products(name, price)").eq("service_order_id", serviceOrderId).order("sort_order"),
      supabase.from("service_order_attachments").select("*").eq("service_order_id", serviceOrderId).order("created_at", { ascending: false }),
      fetchTimelineForEntity("service_order", serviceOrderId, partnerId),
      order.sale_id ? supabase.from("sales").select("*").eq("id", order.sale_id).single() : Promise.resolve({ data: null }),
    ])

    let specifications = order.specifications
    if (typeof specifications === "string") {
      try {
        specifications = JSON.parse(specifications)
      } catch {
        specifications = []
      }
    }

    return {
      success: true,
      data: {
        ...order,
        specifications,
        services: servicesRes.data || [],
        products: productsRes.data || [],
        attachments: attachmentsRes.data || [],
        history: historyRes,
        sale: saleRes?.data || null,
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

  const logs = data || []
  if (logs.length === 0) return []

  const actorIds = Array.from(
    new Set(
      logs
        .map((entry: any) => entry.actor_user_id)
        .filter((value: any): value is string => Boolean(value)),
    ),
  )

  let namesByUserId = new Map<string, string>()

  if (actorIds.length > 0) {
    const { data: profiles, error: profileError } = await admin
      .from("user_profiles")
      .select("user_id, full_name")
      .in("user_id", actorIds)

    if (profileError) {
      console.error("[service_order_history] profile fetch error:", profileError)
    } else {
      namesByUserId = new Map(
        (profiles || []).map((profile: { user_id: string; full_name: string | null }) => [
          profile.user_id,
          profile.full_name?.trim() || "Usuário",
        ]),
      )
    }
  }

  return logs.map((entry: any) => ({
    ...entry,
    actor_name: entry.actor_user_id ? (namesByUserId.get(entry.actor_user_id) || "Usuário") : "Sistema",
  }))
}

export async function createServiceOrderAction(
  partnerId: string,
  input: {
    title: string
    description?: string
    diagnosis?: string
    internal_notes?: string
    customer_id?: string | null
    expected_completion_date?: string | null
    assigned_user_id?: string | null
    status?: string
    priority?: string
    estimated_hours?: number | null
    expected_completion_time?: string | null
    discount_value?: number
    discount_type?: string
    coupon_id?: string | null
    coupon_code?: string | null
    coupon_discount_amount?: number
    other_costs?: number
    payment_status?: string
    paid_amount?: number
    payment_method?: string | null
    payment_breakdown?: any
    created_at?: string | null
    specifications?: { name: string; value: string }[]
  },
): Promise<{ success: true; data: any; orderNumber: string } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "create")
    const user = await requireUser()
    const admin = getAdminClient()

    const status = input.status || "aberta"

    // -- Plan limit check --
    const limitCheck = await checkLimit(partnerId, "monthly_service_orders")
    if (!limitCheck.allowed) {
      return { success: false, error: limitCheck.message || "Limite mensal de ordens de serviço atingido." }
    }

    const publicToken = crypto.randomUUID()

    const { data, error } = await admin
      .from("service_orders")
      .insert({
        partner_id: partnerId,
        public_token: publicToken,
        title: input.title,
        description: input.description || null,
        diagnosis: input.diagnosis || null,
        internal_notes: sanitizeNotes(input.internal_notes),
        customer_id: input.customer_id || null,
        customer_snapshot: input.customer_id ? await getCustomerSnapshot(admin, input.customer_id) : null,
        expected_completion_date: input.expected_completion_date || null,
        assigned_user_id: input.assigned_user_id || null,
        status,
        created_by: user.id,
        priority: input.priority || 'baixa',
        estimated_hours: input.estimated_hours || null,
        expected_completion_time: input.expected_completion_time || null,
        discount_value: input.discount_value || 0,
        discount_type: input.discount_type || 'fixed',
        coupon_id: input.coupon_id || null,
        coupon_code: input.coupon_code || null,
        coupon_discount_amount: input.coupon_discount_amount || 0,
        other_costs: input.other_costs || 0,
        payment_status: input.payment_status || 'unpaid',
        paid_amount: input.paid_amount || 0,
        payment_method: input.payment_method || null,
        payment_breakdown: input.payment_breakdown ? JSON.stringify(input.payment_breakdown) : null,
        created_at: input.created_at || undefined,
        specifications: input.specifications ? input.specifications : undefined,
      })
      .select("*")
      .single()

    if (error) throw error

    const orderNumber = data.order_number

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
    } catch { }

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
      } catch { }
    }

    await recalcTotals(admin, data.id)
    revalidatePath("/erp/service-orders")
    return { success: true, data, orderNumber }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao criar ordem de serviço" }
  }
}

async function getCustomerSnapshot(admin: any, customerId: string) {
  const [{ data: customer }, { data: address }] = await Promise.all([
    admin
      .from("customers")
      .select("id, name, email, phone")
      .eq("id", customerId)
      .single(),
    admin
      .from("addresses")
      .select("zip_code, street, number, complement, neighborhood, city, state")
      .eq("customer_id", customerId)
      .eq("address_type", "primary")
      .limit(1)
      .maybeSingle(),
  ])

  if (!customer) return null

  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    city: address?.city || null,
    state: address?.state || null,
    zip_code: address?.zip_code || null,
    street: address?.street || null,
    number: address?.number || null,
    complement: address?.complement || null,
    neighborhood: address?.neighborhood || null,
  }
}

export async function addServicesToOrderAction(
  partnerId: string,
  serviceOrderId: string,
  services: { service_id: string | null; service_name?: string; service_price?: number; quantity?: number }[],
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()
    const admin = getAdminClient()

    const { data: current } = await admin
      .from("service_orders")
      .select("payment_status")
      .eq("id", serviceOrderId)
      .single()
    if (current?.payment_status === "paid" || current?.payment_status === "partially_paid") {
      throw new Error("Não é possível alterar uma ordem de serviço com pagamentos registrados.")
    }

    const validServiceIds = services.map(s => s.service_id).filter((id): id is string => !!id)
    let svcRows: any[] = []
    if (validServiceIds.length > 0) {
      const { data, error: svcErr } = await admin
        .from("services")
        .select("id, name, price, cost_price")
        .in("id", validServiceIds)
      if (svcErr) throw svcErr
      svcRows = data || []
    }

    const items = services.map((s, idx) => {
      const svc = s.service_id ? svcRows.find((r: any) => r.id === s.service_id) : null
      const qty = s.quantity || 1
      const name = s.service_name || svc?.name || "Serviço avulso"
      const price = s.service_price !== undefined ? s.service_price : (svc?.price || 0)
      return {
        service_order_id: serviceOrderId,
        service_id: s.service_id || null,
        service_name: name,
        service_price: price,
        quantity: qty,
        total_price: price * qty,
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
  products: { product_id: string | null; variant_id?: string | null; product_name?: string; unit_price?: number; quantity?: number }[],
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()
    const admin = getAdminClient()

    const { data: current } = await admin
      .from("service_orders")
      .select("payment_status")
      .eq("id", serviceOrderId)
      .single()
    if (current?.payment_status === "paid" || current?.payment_status === "partially_paid") {
      throw new Error("Não é possível alterar uma ordem de serviço com pagamentos registrados.")
    }

    const validProductIds = products.map(p => p.product_id).filter((id): id is string => !!id)
    let prodRows: any[] = []
    if (validProductIds.length > 0) {
      const { data, error: prodErr } = await admin
        .from("products")
        .select("id, name, price, cost_price")
        .in("id", validProductIds)
      if (prodErr) throw prodErr
      prodRows = data || []
    }

    const items = products.map((p, idx) => {
      const prod = p.product_id ? prodRows.find((r: any) => r.id === p.product_id) : null
      const qty = p.quantity || 1
      const name = p.product_name || prod?.name || "Produto avulso"
      const price = p.unit_price !== undefined ? p.unit_price : (prod?.price || 0)
      return {
        service_order_id: serviceOrderId,
        product_id: p.product_id || null,
        variant_id: p.variant_id || null,
        product_name: name,
        unit_price: price,
        quantity: qty,
        total_price: price * qty,
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
      } catch { }
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

    const kind = getUploadKindFromMimeType(fileType) || "image"
    const rules = getUploadValidationRules(kind)

    if (fileSize > rules.maxSize) {
      const maxMB = (rules.maxSize / (1024 * 1024)).toFixed(0)
      return { success: false, error: `Arquivo muito grande. Máximo: ${maxMB}MB.` }
    }

    const result = await generateSignedUploadUrl({
      fileName,
      fileType,
      userId: user.id,
      prefix,
      kind,
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
  category?: "normal" | "antes" | "depois",
  fileHash?: string,
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()
    const admin = getAdminClient()

    // Enforce plan-based attachment count limits: Max 2 for crescer, Max 5 for escalar
    const { getPartnerPlan } = await import("@/lib/services/subscription.service")
    const plan = await getPartnerPlan(partnerId)
    const limit = plan.slug === "crescer" ? 2 : plan.slug === "escalar" ? 5 : 0

    const { count, error: countErr } = await admin
      .from("service_order_attachments")
      .select("id", { count: "exact", head: true })
      .eq("service_order_id", serviceOrderId)

    if (countErr) throw countErr

    if ((count || 0) >= limit) {
      return { success: false, error: `Limite de anexos excedido para o seu plano (${limit} arquivo(s)). Faça upgrade para enviar mais.` }
    }

    // 1. Compute/verify file hash on server if not provided (fallback for small files)
    let finalHash = fileHash || ""
    if (!finalHash && fileSize < 5 * 1024 * 1024) {
      try {
        const { getR2ServerConfig } = await import("@/lib/r2/r2-server-config")
        const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3")
        const serverConfig = getR2ServerConfig()
        const s3 = new S3Client({
          region: "auto",
          credentials: {
            accessKeyId: serverConfig.accessKeyId,
            secretAccessKey: serverConfig.secretAccessKey,
          },
          endpoint: `https://${serverConfig.accountId}.r2.cloudflarestorage.com`,
        })
        const obj = await s3.send(new GetObjectCommand({ Bucket: serverConfig.bucketName, Key: fileKey }))
        if (obj.Body) {
          const bytes = await obj.Body.transformToByteArray()
          const crypto = await import("crypto")
          finalHash = crypto.createHash("sha256").update(Buffer.from(bytes)).digest("hex")
        }
        s3.destroy()
      } catch (e) {
        console.error("Erro ao calcular hash do R2 no fallback:", e)
      }
    }

    // 2. Resolve safe Content-Type based on extension (ignore browser Content-Type)
    const extension = fileKey.substring(fileKey.lastIndexOf(".")).toLowerCase()
    const canonicalMime = Object.entries(ALL_MIME_TO_EXT).find(([_, ext]) => `.${ext}` === extension)?.[0]
    const validatedFileType = canonicalMime || "application/octet-stream"

    // 3. Save to database
    const { data, error } = await admin
      .from("service_order_attachments")
      .insert({
        service_order_id: serviceOrderId,
        file_key: fileKey,
        file_name: fileName, // Stores original filename
        file_type: validatedFileType, // Stores server-validated MIME
        file_size: fileSize,
        uploaded_by: user.id,
        category: category || "normal",
        file_hash: finalHash,
      })
      .select("*")
      .single()

    if (error) throw error

    // 4. Audit Log
    const { auditLog } = await import("@/lib/security/audit-logger")
    await auditLog({
      action: "document.uploaded",
      actorUserId: user.id,
      partnerId,
      metadata: {
        documentType: "Anexo de OS",
        fileName,
        fileSize,
        serviceOrderId,
        fileKey,
        fileHash: finalHash,
        fileType: validatedFileType,
      },
    })

    // 5. Timeline Audit Log (Service Order History)
    const { logAuditEvent } = await import("@/lib/services/timeline.service")
    await logAuditEvent({
      partnerId,
      actorUserId: user.id,
      entityType: "service_order",
      entityId: serviceOrderId,
      actionType: "attachment_created",
      source: "manual",
      changeLines: [`Anexo adicionado: ${fileName}`],
    })

    revalidatePath("/erp/service-orders")
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao salvar anexo" }
  }
}

export async function getServiceOrderAttachmentUrlAction(
  partnerId: string,
  fileKey: string
): Promise<{ success: true; downloadUrl: string } | { success: false; error: string }> {
  try {
    await requirePermission(partnerId, "service_orders", "view")
    const { generateSignedDownloadUrl } = await import("@/lib/r2/server")
    const downloadUrl = await generateSignedDownloadUrl(fileKey)
    return { success: true, downloadUrl }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao obter URL de download" }
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
      .select("file_key, file_name")
      .eq("id", attachmentId)
      .single()

    if (attachment?.file_key) {
      const { deleteFileFromR2 } = await import("@/lib/r2/server")
      try { await deleteFileFromR2(attachment.file_key) } catch { }
    }

    await admin.from("service_order_attachments").delete().eq("id", attachmentId)

    await logAuditEvent({
      partnerId, actorUserId: user.id,
      entityType: "service_order", entityId: serviceOrderId,
      actionType: "attachment_deleted", source: "manual",
      changeLines: [`Anexo removido: ${attachment?.file_name || "Documento"}`],
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
  const { data: order } = await admin
    .from("service_orders")
    .select("discount_value, discount_type, coupon_discount_amount, other_costs")
    .eq("id", serviceOrderId)
    .single()

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
  const subtotal = totalService + totalProduct

  const discVal = Number(order?.discount_value || 0)
  const discType = order?.discount_type || 'fixed'
  const couponDisc = Number(order?.coupon_discount_amount || 0)
  const otherCosts = Number(order?.other_costs || 0)

  let discountAmount = 0
  if (discType === 'percentage') {
    discountAmount = (subtotal * discVal) / 100
  } else if (discType === 'fixed') {
    discountAmount = discVal
  } else if (discType === 'coupon') {
    discountAmount = couponDisc
  }

  const finalTotal = Math.max(0, subtotal - discountAmount + otherCosts)

  await admin
    .from("service_orders")
    .update({
      total_service_amount: totalService,
      total_product_amount: totalProduct,
      total_amount: finalTotal,
    })
    .eq("id", serviceOrderId)
}

export async function ensurePublicTokenAction(partnerId: string, serviceOrderId: string): Promise<string | null> {
  try {
    const admin = getAdminClient()
    const { data } = await admin
      .from("service_orders")
      .select("public_token")
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)
      .single()
    if (data?.public_token) return data.public_token
    const newToken = crypto.randomUUID()
    await admin.from("service_orders").update({ public_token: newToken }).eq("id", serviceOrderId)
    return newToken
  } catch {
    return null
  }
}

export async function getServiceOrderByTokenAction(
  token: string,
): Promise<{ success: true; data: { serviceOrder: any; services: any[]; products: any[]; attachments: any[]; history: any[]; sale: any } } | { success: false; error: string }> {
  try {
    const admin = getAdminClient()

    let { data: row, error } = await admin
      .from("service_orders")
      .select(`
        id, order_number, status, title, description, diagnosis, expected_completion_date, completed_at,
        total_service_amount, total_product_amount, total_amount, signature_image_key, signed_at,
        customer_snapshot, created_at, sale_id, specifications, metadata, lockout_until, partner_id, assigned_user_id,
        public_token, payment_status, paid_amount, payment_method, priority, estimated_hours, expected_completion_time,
        partners (
          id, store_name, store_image_url, phone
        )
      `)
      .eq("public_token", token)
      .single()

    if (error || !row) {
      // Fallback: try lookup by id for legacy OSs without public_token
      const { data: byId } = await admin
        .from("service_orders")
        .select(`
          id, order_number, status, title, description, diagnosis, expected_completion_date, completed_at,
          total_service_amount, total_product_amount, total_amount, signature_image_key, signed_at,
          customer_snapshot, created_at, sale_id, specifications, metadata, lockout_until, partner_id, assigned_user_id,
          public_token, payment_status, paid_amount, payment_method, priority, estimated_hours, expected_completion_time,
          partners (
            id, store_name, store_image_url, phone
          )
        `)
        .eq("id", token)
        .single()
      if (byId) {
        // Generate public_token on the fly for this OS
        if (!byId.public_token) {
          const newToken = crypto.randomUUID()
          await admin.from("service_orders").update({ public_token: newToken }).eq("id", token)
          byId.public_token = newToken
        }
        row = byId
      } else {
        throw new Error("Ordem de serviço não encontrada")
      }
    }

    const [services, products, attachments, historyRes, saleRes, addressRes] = await Promise.all([
      admin.from("service_order_services").select("*").eq("service_order_id", row.id).order("sort_order"),
      admin.from("service_order_products").select("*").eq("service_order_id", row.id).order("sort_order"),
      admin.from("service_order_attachments").select("file_name, file_key, file_type, category, created_at").eq("service_order_id", row.id).order("created_at", { ascending: false }),
      admin.from("audit_logs").select("id, action_type, change_lines, created_at").eq("entity_type", "service_order").eq("entity_id", row.id).order("created_at", { ascending: false }).limit(50),
      row.sale_id ? admin.from("sales").select("id, sale_number, total_amount, discount_amount, final_amount, paid_amount, payment_status, status, created_at").eq("id", row.sale_id).single() : Promise.resolve({ data: null }),
      admin.from("addresses").select("street, number, complement, neighborhood, city, state, zip_code, is_default").eq("partner_id", row.partner_id),
    ])

    const customerName = (row.customer_snapshot as any)?.name || null

    let specifications = row.specifications
    if (typeof specifications === "string") {
      try {
        specifications = JSON.parse(specifications)
      } catch {
        specifications = []
      }
    }

    const { getPartnerPlan } = await import("@/lib/services/subscription.service")
    const plan = await getPartnerPlan(row.partner_id)
    const planTier = plan?.slug || "free"

    let assignedUserName = null
    if (row.assigned_user_id) {
      const { data: profile } = await admin
        .from("user_profiles")
        .select("full_name")
        .eq("user_id", row.assigned_user_id)
        .maybeSingle()
      assignedUserName = profile?.full_name || null
    }

    const addressesList = addressRes.data || []
    const addressRow = addressesList.find((a: any) => a.is_default) || addressesList[0]
    let partnerAddress = "Endereço não cadastrado"
    if (addressRow) {
      partnerAddress = `${addressRow.street || ""}, ${addressRow.number || "S/N"}${addressRow.complement ? ` - ${addressRow.complement}` : ""}${addressRow.neighborhood ? ` - ${addressRow.neighborhood}` : ""}, ${addressRow.city || ""} - ${addressRow.state || ""}`.replace(/\s+/g, ' ').trim()
    }

    const serviceOrder = {
      id: row.id,
      partner_id: row.partner_id,
      order_number: row.order_number,
      status: row.status,
      title: row.title,
      description: row.description,
      diagnosis: row.diagnosis,
      expected_completion_date: row.expected_completion_date,
      completed_at: row.completed_at,
      created_at: row.created_at,
      total_service_amount: row.total_service_amount,
      total_product_amount: row.total_product_amount,
      total_amount: row.total_amount,
      signature_image_key: row.signature_image_key,
      signed_at: row.signed_at,
      customer_name: customerName,
      sale_id: row.sale_id,
      specifications,
      metadata: row.metadata,
      lockout_until: row.lockout_until,
      assigned_user_name: assignedUserName,
      public_token: row.public_token,
      payment_status: row.payment_status,
      paid_amount: row.paid_amount,
      payment_method: row.payment_method,
      priority: row.priority,
      estimated_hours: row.estimated_hours,
      expected_completion_time: row.expected_completion_time,
      partners: row.partners ? {
        ...(Array.isArray(row.partners) ? row.partners[0] : row.partners),
        address: partnerAddress,
        plan_tier: planTier,
      } : null,
    }

    return {
      success: true,
      data: {
        serviceOrder,
        services: services.data || [],
        products: products.data || [],
        attachments: attachments.data || [],
        history: historyRes.data || [],
        sale: saleRes?.data || null,
      },
    }
  } catch (err: any) {
    console.error("Error in getServiceOrderByTokenAction:", err)
    return { success: false, error: err.message || "Ordem de serviço não encontrada" }
  }
}

export async function updateServiceOrderAction(
  partnerId: string,
  serviceOrderId: string,
  input: {
    title?: string
    description?: string
    diagnosis?: string
    internal_notes?: string
    customer_id?: string | null
    expected_completion_date?: string | null
    assigned_user_id?: string | null
    status?: string
    priority?: string
    estimated_hours?: number | null
    expected_completion_time?: string | null
    discount_value?: number
    discount_type?: string
    coupon_id?: string | null
    coupon_code?: string | null
    coupon_discount_amount?: number
    other_costs?: number
    payment_status?: string
    paid_amount?: number
    payment_method?: string | null
    payment_breakdown?: any
    created_at?: string | null
    specifications?: { name: string; value: string }[]
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

    const isPaid = current.payment_status === "paid" || current.payment_status === "partially_paid"
    const allowedWhenPaid = ["internal_notes", "status", "priority", "expected_completion_date", "expected_completion_time", "estimated_hours", "specifications"]

    const updateData: any = {}
    if (input.title !== undefined && !isPaid) updateData.title = input.title
    if (input.description !== undefined && !isPaid) updateData.description = input.description
    if (input.diagnosis !== undefined && !isPaid) updateData.diagnosis = input.diagnosis
    if (input.internal_notes !== undefined) updateData.internal_notes = sanitizeNotes(input.internal_notes)
    if (input.customer_id !== undefined && !isPaid) {
      updateData.customer_id = input.customer_id
      updateData.customer_snapshot = input.customer_id ? await getCustomerSnapshot(admin, input.customer_id) : null
    }
    if (input.expected_completion_date !== undefined) updateData.expected_completion_date = input.expected_completion_date
    if (input.assigned_user_id !== undefined && !isPaid) updateData.assigned_user_id = input.assigned_user_id
    if (input.status !== undefined) updateData.status = input.status
    if (input.priority !== undefined) updateData.priority = input.priority
    if (input.estimated_hours !== undefined) updateData.estimated_hours = input.estimated_hours
    if (input.expected_completion_time !== undefined) updateData.expected_completion_time = input.expected_completion_time
    if (input.discount_value !== undefined && !isPaid) updateData.discount_value = input.discount_value
    if (input.discount_type !== undefined && !isPaid) updateData.discount_type = input.discount_type
    if (input.coupon_id !== undefined && !isPaid) updateData.coupon_id = input.coupon_id
    if (input.coupon_code !== undefined && !isPaid) updateData.coupon_code = input.coupon_code
    if (input.coupon_discount_amount !== undefined && !isPaid) updateData.coupon_discount_amount = input.coupon_discount_amount
    if (input.other_costs !== undefined && !isPaid) updateData.other_costs = input.other_costs
    if (input.payment_status !== undefined && !isPaid) updateData.payment_status = input.payment_status
    if (input.paid_amount !== undefined && !isPaid) updateData.paid_amount = input.paid_amount
    if (input.payment_method !== undefined && !isPaid) updateData.payment_method = input.payment_method
    if (input.payment_breakdown !== undefined && !isPaid) {
      updateData.payment_breakdown = input.payment_breakdown ? JSON.stringify(input.payment_breakdown) : null
    }
    if (input.created_at !== undefined && !isPaid) updateData.created_at = input.created_at
    if (input.specifications !== undefined) updateData.specifications = input.specifications.length > 0 ? input.specifications : null
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

    await recalcTotals(admin, serviceOrderId)
    revalidatePath("/erp/service-orders")
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao atualizar ordem de serviço" }
  }
}

export async function syncServiceOrderServicesAction(
  partnerId: string,
  serviceOrderId: string,
  services: { service_id: string | null; service_name?: string; service_price?: number; quantity: number }[],
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const admin = getAdminClient()

    const { data: current } = await admin
      .from("service_orders")
      .select("payment_status")
      .eq("id", serviceOrderId)
      .single()
    if (current?.payment_status === "paid" || current?.payment_status === "partially_paid") {
      throw new Error("Não é possível alterar uma ordem de serviço com pagamentos registrados.")
    }

    // 1. Delete all existing services
    const { error: delErr } = await admin
      .from("service_order_services")
      .delete()
      .eq("service_order_id", serviceOrderId)
    if (delErr) throw delErr

    if (services.length > 0) {
      // 2. Fetch service names/prices
      const validServiceIds = services.map(s => s.service_id).filter((id): id is string => !!id)
      let svcRows: any[] = []
      if (validServiceIds.length > 0) {
        const { data: dataRows, error: svcErr } = await admin
          .from("services")
          .select("id, name, price")
          .in("id", validServiceIds)
        if (svcErr) throw svcErr
        svcRows = dataRows || []
      }

      const items = services.map((s, idx) => {
        const svc = s.service_id ? svcRows.find((r: any) => r.id === s.service_id) : null
        const qty = s.quantity || 1
        const name = s.service_name || svc?.name || "Serviço avulso"
        const price = s.service_price !== undefined ? s.service_price : (svc?.price || 0)
        return {
          service_order_id: serviceOrderId,
          service_id: s.service_id || null,
          service_name: name,
          service_price: price,
          quantity: qty,
          total_price: price * qty,
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
  products: { product_id: string | null; variant_id?: string | null; product_name?: string; unit_price?: number; quantity: number }[],
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const admin = getAdminClient()

    const { data: current } = await admin
      .from("service_orders")
      .select("payment_status")
      .eq("id", serviceOrderId)
      .single()
    if (current?.payment_status === "paid" || current?.payment_status === "partially_paid") {
      throw new Error("Não é possível alterar uma ordem de serviço com pagamentos registrados.")
    }

    // 1. Delete all existing products
    const { error: delErr } = await admin
      .from("service_order_products")
      .delete()
      .eq("service_order_id", serviceOrderId)
    if (delErr) throw delErr

    if (products.length > 0) {
      // 2. Fetch product names/prices
      const validProductIds = products.map(p => p.product_id).filter((id): id is string => !!id)
      let prodRows: any[] = []
      if (validProductIds.length > 0) {
        const { data: dataRows, error: prodErr } = await admin
          .from("products")
          .select("id, name, price")
          .in("id", validProductIds)
        if (prodErr) throw prodErr
        prodRows = dataRows || []
      }

      const items = products.map((p, idx) => {
        const prod = p.product_id ? prodRows.find((r: any) => r.id === p.product_id) : null
        const qty = p.quantity || 1
        const name = p.product_name || prod?.name || "Produto avulso"
        const price = p.unit_price !== undefined ? p.unit_price : (prod?.price || 0)
        return {
          service_order_id: serviceOrderId,
          product_id: p.product_id || null,
          variant_id: p.variant_id || null,
          product_name: name,
          unit_price: price,
          quantity: qty,
          total_price: price * qty,
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

export async function confirmServiceOrderPaymentAction(payload: {
  serviceOrderId: string
  partnerId: string
  paymentStatus: "paid" | "partially_paid" | "unpaid"
  paidAmount: number
  paymentMethod: string
  paymentBreakdown?: Array<{
    method: string
    amount: number
    paymentMethodId?: string | null
    installmentNumber?: number
    adjustmentType?: string
    adjustmentAmount?: number
    feeBearer?: string
    amountReceived?: number
    paymentMethodDiscountAmount?: number
    interestAmount?: number
    feeAmount?: number
    fixedFeeAmount?: number
  }>
  paymentProvider?: string | null
  mpPaymentId?: string | null
  financeAccountId?: string | null
  notes?: string
}) {
  try {
    const user = await requireUser()
    if (!user) return { success: false, error: "Não autenticado" }
    await requirePermission(payload.partnerId, "service_orders", "edit")

    const supabase = await getSupabaseServerClient()

    // 1. Get the service order
    const { data: order, error: orderErr } = await supabase
      .from("service_orders")
      .select("*")
      .eq("id", payload.serviceOrderId)
      .eq("partner_id", payload.partnerId)
      .single()

    if (orderErr || !order) {
      throw new Error("Ordem de serviço não encontrada")
    }

    // 2. Fetch services and products to build sale items
    const [servicesRes, productsRes] = await Promise.all([
      supabase.from("service_order_services").select("*").eq("service_order_id", order.id),
      supabase.from("service_order_products").select("*").eq("service_order_id", order.id),
    ])

    const orderServices = servicesRes.data || []
    const orderProducts = productsRes.data || []

    // Calculate subtotal (merchandise/services base total)
    const subtotal = orderServices.reduce((acc: number, s: any) => acc + Number(s.total_price || 0), 0) +
                     orderProducts.reduce((acc: number, p: any) => acc + Number(p.total_price || 0), 0)

    // Calculate discount amount from order discount fields
    let discountAmount = 0
    if (order.discount_type === "percentage") {
      discountAmount = subtotal * (Number(order.discount_value || 0) / 100)
    } else if (order.discount_type === "fixed") {
      discountAmount = Number(order.discount_value || 0)
    } else if (order.discount_type === "coupon") {
      discountAmount = Number(order.coupon_discount_amount || 0)
    }

    const otherCosts = Number(order.other_costs || 0)
    const baseFinalAmount = subtotal - discountAmount + otherCosts

    // Aggregate payment method adjustments
    let paymentMethodDiscountAmount = 0
    let paymentMethodExtraAmount = 0
    let interestAmount = 0
    let feeAmount = 0
    let originalAmount = 0

    if (payload.paymentBreakdown && Array.isArray(payload.paymentBreakdown)) {
      let customerFeeAmount = 0
      for (const entry of payload.paymentBreakdown) {
        const received = Number(entry.amountReceived ?? entry.amount ?? 0)
        originalAmount += received
        paymentMethodDiscountAmount += Number(entry.paymentMethodDiscountAmount ?? 0)
        interestAmount += Number(entry.interestAmount ?? 0)
        const entryFee = Number(entry.feeAmount ?? 0) + Number(entry.fixedFeeAmount ?? 0)
        const bearer = entry.feeBearer || "merchant"
        if (bearer === "merchant") {
          feeAmount += entryFee
        } else {
          customerFeeAmount += entryFee
        }
      }
      paymentMethodExtraAmount = interestAmount + customerFeeAmount
    } else {
      originalAmount = payload.paidAmount
    }

    const finalAmount = baseFinalAmount - paymentMethodDiscountAmount + paymentMethodExtraAmount

    // Map payment status to valid sales table values
    const salePaymentStatus = payload.paymentStatus === "unpaid" ? "pending" : payload.paymentStatus
    const saleStatus = payload.paymentStatus === "unpaid" ? "pending" : payload.paymentStatus

    // 3. Update the service order's payment info
    const { error: updateErr } = await supabase
      .from("service_orders")
      .update({
        payment_status: payload.paymentStatus,
        paid_amount: payload.paidAmount,
        payment_method: payload.paymentMethod || null,
        payment_breakdown: payload.paymentBreakdown ? JSON.stringify(payload.paymentBreakdown) : null,
      })
      .eq("id", order.id)

    if (updateErr) throw updateErr

    // 4. Create or update sale in `sales` table
    const saleRefNote = `service_order:${order.id}:sale`
    const { data: existingSale } = await supabase
      .from("sales")
      .select("id, sale_number")
      .eq("partner_id", payload.partnerId)
      .eq("notes", saleRefNote)
      .limit(1)
      .maybeSingle()

    let saleId = existingSale?.id || null
    let saleNumber = existingSale?.sale_number || null

    if (!saleId) {
      const { data: saleNumberData } = await supabase.rpc("generate_sale_number")
      saleNumber = String(saleNumberData || "").trim() || `OS-DDT-${String(order.id).slice(0, 8).toUpperCase()}`

      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert({
          partner_id: payload.partnerId,
          customer_id: order.customer_id || null,
          total_amount: subtotal,
          discount_amount: discountAmount,
          final_amount: finalAmount,
          paid_amount: payload.paidAmount,
          payment_status: salePaymentStatus,
          status: saleStatus,
          finance_account_id: payload.financeAccountId || null,
          notes: saleRefNote,
          finalized_by_user_id: user.id,
          sale_number: saleNumber,
          origin_type: "service_order",
          origin_id: order.id,
        })
        .select("id")
        .single()

      if (saleError) throw saleError
      saleId = sale?.id || null

      if (saleId) {
        // Link sale to OS bidirecionalmente
        const admin = getAdminClient()
        await admin.from("service_orders").update({ sale_id: saleId }).eq("id", order.id).eq("partner_id", payload.partnerId)
        await admin.from("sales").update({ origin_type: "service_order", origin_id: order.id }).eq("id", saleId)

        // Insert sale_items for services and products
        const saleItems: any[] = []
        orderServices.forEach((s: any) => {
          saleItems.push({
            sale_id: saleId,
            partner_id: payload.partnerId,
            product_id: null,
            variant_id: null,
            product_name: s.service_name || "Mão de Obra",
            variant_name: null,
            unit_price: Number(s.service_price || 0),
            quantity: Number(s.quantity || 1),
            subtotal: Number(s.total_price || 0),
            total_price: Number(s.total_price || 0),
          })
        })

        orderProducts.forEach((p: any) => {
          saleItems.push({
            sale_id: saleId,
            partner_id: payload.partnerId,
            product_id: p.product_id,
            variant_id: p.variant_id || null,
            product_name: p.product_name || "Produto",
            variant_name: null,
            unit_price: Number(p.unit_price || 0),
            quantity: Number(p.quantity || 1),
            subtotal: Number(p.total_price || 0),
            total_price: Number(p.total_price || 0),
          })
        })

        if (saleItems.length > 0) {
          const { error: itemsError } = await supabase.from("sale_items").insert(saleItems)
          if (itemsError) throw itemsError
        }
      }
    } else {
      // Update existing sale
      const admin = getAdminClient()
      const { error: saleUpdateError } = await supabase
        .from("sales")
        .update({
          total_amount: subtotal,
          discount_amount: discountAmount,
          final_amount: finalAmount,
          paid_amount: payload.paidAmount,
          payment_status: salePaymentStatus,
          status: saleStatus,
          finance_account_id: payload.financeAccountId || null,
        })
        .eq("id", saleId)

      if (saleUpdateError) throw saleUpdateError
      await admin.from("sales").update({ origin_type: "service_order", origin_id: order.id }).eq("id", saleId)
      await admin.from("service_orders").update({ sale_id: saleId }).eq("id", order.id)
    }

    // 5. Create or sync orders entry so the sale appears in the orders page
    const orderRefNote = `service_order:${order.id}:order`
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id")
      .eq("partner_id", payload.partnerId)
      .eq("notes", orderRefNote)
      .limit(1)
      .maybeSingle()

    const paymentMethodSummary = payload.paymentMethod
      ? [{ method: payload.paymentMethod, amount: payload.paidAmount }]
      : []

    let orderId: string | null = existingOrder?.id || null

    if (!orderId) {
      const orderNumber = saleNumber || `OS-${String(order.id).slice(0, 8).toUpperCase()}`

      const { data: newOrder, error: orderInsertErr } = await supabase
        .from("orders")
        .insert({
          partner_id: payload.partnerId,
          order_number: orderNumber,
          customer_name: (order.customer_snapshot as any)?.name || null,
          buyer_id: order.customer_id || null,
          total_amount: finalAmount,
          subtotal_value: subtotal,
          discount_value: order.discount_value || 0,
          discount_type: order.discount_type || "fixed",
          discount_amount: discountAmount,
          payment_method_discount_amount: paymentMethodDiscountAmount,
          payment_method_extra_amount: paymentMethodExtraAmount,
          additional_costs: otherCosts,
          paid_amount: payload.paidAmount,
          situation: saleStatus,
          delivery_status: "not_sent",
          delivery_type: "pickup",
          order_source: "admin_service_order",
          payment_method: payload.paymentMethod || null,
          payment_breakdown: JSON.stringify(paymentMethodSummary),
          notes: orderRefNote,
          created_at: new Date().toISOString(),
          created_by: user.id,
        })
        .select("id")
        .single()

      if (orderInsertErr) throw orderInsertErr
      orderId = newOrder?.id || null
    } else {
      const { error: orderUpdateErr } = await supabase
        .from("orders")
        .update({
          total_amount: finalAmount,
          subtotal_value: subtotal,
          discount_value: order.discount_value || 0,
          discount_type: order.discount_type || "fixed",
          discount_amount: discountAmount,
          payment_method_discount_amount: paymentMethodDiscountAmount,
          payment_method_extra_amount: paymentMethodExtraAmount,
          additional_costs: otherCosts,
          paid_amount: payload.paidAmount,
          situation: saleStatus,
          payment_method: payload.paymentMethod || null,
          payment_breakdown: JSON.stringify(paymentMethodSummary),
        })
        .eq("id", orderId)

      if (orderUpdateErr) throw orderUpdateErr
    }

    // Sync order_items from services and products
    if (orderId && (orderServices.length > 0 || orderProducts.length > 0)) {
      const orderItems = [
        ...orderServices.map((s: any) => ({
          order_id: orderId,
          partner_id: payload.partnerId,
          product_id: null,
          variant_id: null,
          product_name: s.service_name || "Mão de Obra",
          unit_price: Number(s.service_price || 0),
          quantity: Number(s.quantity || 1),
          total_price: Number(s.total_price || 0),
          line_type: "service_booking" as const,
        })),
        ...orderProducts.map((p: any) => ({
          order_id: orderId,
          partner_id: payload.partnerId,
          product_id: p.product_id,
          variant_id: p.variant_id || null,
          product_name: p.product_name || "Produto",
          unit_price: Number(p.unit_price || 0),
          quantity: Number(p.quantity || 1),
          total_price: Number(p.total_price || 0),
          line_type: "product" as const,
        })),
      ]

      await supabase.from("order_items").delete().eq("order_id", orderId)
      const { error: itemsErr } = await supabase.from("order_items").insert(orderItems)
      if (itemsErr) throw itemsErr
    }

    // 6. Create or update transaction in `transactions` table (if paidAmount > 0)
    if (payload.paidAmount > 0.009) {
      const txRefNote = `service_order:${order.id}:payment`
      const { data: existingPaymentTx } = await supabase
        .from("transactions")
        .select("id")
        .eq("partner_id", payload.partnerId)
        .eq("reference_note", txRefNote)
        .limit(1)
        .maybeSingle()

      const nowIso = new Date().toISOString()
      let txId = existingPaymentTx?.id || null

      if (!txId) {
        const { data: insertedTx, error: txError } = await supabase
          .from("transactions")
          .insert({
            partner_id: payload.partnerId,
            description: saleNumber || order.order_number,
            category: "Vendas",
            customer_id: order.customer_id || null,
            contact_type: "customer",
            amount: payload.paidAmount,
            due_date: null,
            payment_date: nowIso,
            transaction_date: nowIso,
            status: "paid",
            notes: null,
            payment_type: payload.paymentMethod || "Ordem de Serviço",
            payment_method_id: (payload.paymentBreakdown && payload.paymentBreakdown[0]?.paymentMethodId) || null,
            original_amount: originalAmount,
            interest_amount: interestAmount > 0 ? interestAmount : null,
            fee_amount: feeAmount,
            discount_amount: paymentMethodDiscountAmount > 0 ? paymentMethodDiscountAmount : null,
            transaction_type: "income",
            origin: "system",
            reference_note: txRefNote,
            account_id: payload.financeAccountId || null,
            created_by_user_id: user.id,
          })
          .select("id")
          .single()

        if (txError) throw txError
        txId = insertedTx?.id || null
      } else {
        const { error: txError } = await supabase
          .from("transactions")
          .update({
            amount: payload.paidAmount,
            original_amount: originalAmount,
            interest_amount: interestAmount > 0 ? interestAmount : null,
            fee_amount: feeAmount,
            discount_amount: paymentMethodDiscountAmount > 0 ? paymentMethodDiscountAmount : null,
            payment_type: payload.paymentMethod || "Ordem de Serviço",
            payment_method_id: (payload.paymentBreakdown && payload.paymentBreakdown[0]?.paymentMethodId) || null,
            account_id: payload.financeAccountId || null,
          })
          .eq("id", txId)

        if (txError) throw txError
      }

      // Sync transaction_payments
      if (txId && payload.paymentBreakdown && Array.isArray(payload.paymentBreakdown)) {
        let paymentLine = 0
        const paymentsToInsert = payload.paymentBreakdown.map((entry: any) => {
          paymentLine++
          const amt = Number(entry.amount || 0)
          const received = Number(entry.amountReceived || 0)
          const bearer = entry.feeBearer || "merchant"

          const entryInterest = Number(entry.interestAmount ?? 0)
          const entryDiscount = Number(entry.paymentMethodDiscountAmount ?? 0)

          return {
            partner_id: payload.partnerId,
            transaction_id: txId,
            amount: amt,
            base_amount: received,
            interest_amount: entryInterest,
            discount_amount: entryDiscount,
            payment_method_id: entry.paymentMethodId || null,
            created_by_user_id: user.id,
            idempotency_key: `${payload.partnerId}:${saleId}:line${paymentLine}:${entry.paymentMethodId || 'none'}`,
          }
        }).filter((p: any) => p.amount > 0)

        if (paymentsToInsert.length > 0) {
          await supabase.from("transaction_payments").delete().eq("transaction_id", txId)
          const { error: insPayErr } = await supabase.from("transaction_payments").insert(paymentsToInsert)
          if (insPayErr) console.error("Error inserting transaction_payments:", insPayErr)
        }
      }
    }

    // 7. Sync goals
    const sellerUserId = order.assigned_user_id || user.id
    if (sellerUserId) {
      try {
        const { applyServiceOrderToGoals } = await import("@/lib/services/sales-goals.service")
        const adminClient = getAdminClient()
        await applyServiceOrderToGoals({
          supabase: adminClient,
          partnerId: payload.partnerId,
          sellerUserId,
          saleAmount: finalAmount,
          createdByUserId: user.id,
        })
      } catch (err) {
        console.error("Error applying service order to goals:", err)
      }
    }

    // Log audit event
    await logAuditEvent({
      partnerId: payload.partnerId,
      actorUserId: user.id,
      entityType: "service_order",
      entityId: order.id,
      actionType: "payment_confirmed",
      source: "manual",
      changeLines: [
        `confirmou pagamento da OS: ${payload.paymentMethod} (R$ ${payload.paidAmount.toFixed(2)})`,
      ],
      metadata: {
        paymentMethod: payload.paymentMethod,
        amount: payload.paidAmount,
      },
    })

    revalidatePath("/erp/service-orders")
    return { success: true, orderId: order.id, orderNumber: order.order_number }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao processar pagamento da ordem de serviço" }
  }
}



export async function saveServiceOrderSpecificationsAction(
  partnerId: string,
  serviceOrderId: string,
  specifications: { name: string; value: string }[],
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const admin = getAdminClient()

    const { error } = await admin
      .from("service_orders")
      .update({ specifications })
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)

    if (error) throw error

    revalidatePath("/erp/service-orders")
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao salvar especificações" }
  }
}

export async function regenerateServiceOrderApprovalCodeAction(
  serviceOrderId: string,
  partnerId: string,
): Promise<{ success: true; code: string } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()
    const supabase = await getSupabaseServerClient()

    // 1. Fetch OS to make sure it exists
    const { data: so, error: soErr } = await supabase
      .from("service_orders")
      .select("id, status, metadata")
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)
      .single()

    if (soErr || !so) {
      return { success: false, error: "Ordem de serviço não encontrada" }
    }

    if (so.status === "concluida" || so.status === "entregue" || so.status === "cancelada") {
      return { success: false, error: "Não é possível alterar o código de uma OS finalizada ou cancelada." }
    }

    // 2. Generate new 4-digit code and salt
    const plainCode = Math.floor(1000 + Math.random() * 9000).toString() // 4 digits
    const salt = Math.random().toString(36).substring(2)

    // Compute hash using RPC
    const { data: hashData, error: hashErr } = await supabase.rpc("compute_approval_hash", {
      salt: salt,
      code: plainCode
    })

    if (hashErr || !hashData) {
      console.error("[regenerateServiceOrderApprovalCodeAction] hash computation error:", hashErr)
      return { success: false, error: "Erro ao gerar hash do código de assinatura." }
    }

    const hash = hashData as string

    // 3. Update service order
    const { error: updateErr } = await supabase
      .from("service_orders")
      .update({
        approval_code_salt: salt,
        approval_code_hash: hash,
        failed_attempts: 0,
        lockout_until: null,
        lockout_count: 0,
        metadata: {
          ...(so.metadata || {}),
          plain_code: plainCode
        }
      })
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)

    if (updateErr) {
      console.error("[regenerateServiceOrderApprovalCodeAction] update error:", updateErr)
      return { success: false, error: "Erro ao salvar novo código." }
    }

    revalidatePath("/erp/service-orders")
    return { success: true, code: plainCode }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao gerar novo código" }
  }
}

export async function getPublicPresignedUploadUrlAction(
  token: string,
  fileName: string,
  fileType: string,
  fileSize: number,
): Promise<
  | { success: true; uploadUrl: string; publicUrl: string; key: string }
  | { success: false; error: string }
> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    // 1. Fetch OS by token to get partner and assigned user details
    const admin = getAdminClient()
    const { data: order, error } = await admin
      .from("service_orders")
      .select("id, partner_id, assigned_user_id")
      .eq("public_token", token)
      .maybeSingle()

    if (error || !order) {
      return { success: false, error: "Ordem de serviço não encontrada ou token inválido" }
    }

    if (fileSize > MAX_FILE_SIZE) {
      return { success: false, error: "Arquivo muito grande. Máximo: 5MB." }
    }

    const uploadUserId = order.assigned_user_id || "public-guest"
    const prefix = R2_PREFIXES.serviceOrderSignatures

    // Generate safe extension
    const ext = fileName.split('.').pop() || "png"

    const result = await generateSignedUploadUrl({
      fileName,
      fileType,
      userId: uploadUserId,
      prefix,
      key: `users/${uploadUserId}/${prefix}${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`,
    })
    return { success: true, ...result }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao gerar URL" }
  }
}

export async function signPublicServiceOrderAction(
  token: string,
  approverName: string,
  approvalCode: string,
  signatureImageKey: string,
  ip?: string,
  userAgent?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    const admin = getAdminClient()

    // 1. Fetch OS by token
    const { data: order, error } = await admin
      .from("service_orders")
      .select("id, status, assigned_user_id, partner_id, customer_snapshot")
      .eq("public_token", token)
      .maybeSingle()

    if (error || !order) {
      return { success: false, error: "Ordem de serviço não encontrada ou token inválido" }
    }

    // 2. Determine auth method and check permission
    let loggedUser: any = null
    try {
      const { getCurrentUser } = await import("@/lib/auth/server-user")
      loggedUser = await getCurrentUser()
    } catch {
      // Not logged in
    }

    const customerEmail = (order.customer_snapshot as any)?.email || null
    let isAuthorized = false
    let method = "code"

    if (loggedUser) {
      if (customerEmail && loggedUser.email && loggedUser.email.toLowerCase() === customerEmail.toLowerCase()) {
        isAuthorized = true
        method = "auth"
      }
    }

    if (!isAuthorized) {
      if (!approvalCode || !approvalCode.trim()) {
        return { success: false, error: "Código de assinatura é obrigatório." }
      }
      method = "code"
    }

    if (method === "auth") {
      // Direct update for client signature to avoid creator/professional database RPC restriction
      const { error: updateErr } = await admin
        .from("service_orders")
        .update({
          signature_image_key: signatureImageKey,
          signed_at: new Date().toISOString(),
          failed_attempts: 0,
          lockout_until: null,
          lockout_count: 0,
          updated_at: new Date().toISOString()
        })
        .eq("id", order.id)

      if (updateErr) {
        return { success: false, error: updateErr.message || "Erro ao assinar ordem de serviço" }
      }

      await admin.from("audit_logs").insert({
        table_name: 'service_orders',
        action: 'SIGNED',
        partner_id: order.partner_id,
        entity_type: 'service_order',
        entity_id: order.id,
        action_type: 'signed',
        change_lines: ['OS assinada pelo cliente via portal público (autenticado por e-mail)'],
        source: 'system',
        metadata: {
          ipAddress: ip || null,
          userAgent: userAgent || null,
          timestamp: new Date().toISOString(),
          approver_name: loggedUser.email || "Cliente"
        }
      })
    } else {
      // Call DB function for code signature validation
      const { data: rpcRes, error: rpcErr } = await admin.rpc("sign_public_service_order", {
        p_so_id: order.id,
        p_name: "Cliente",
        p_code: approvalCode.trim(),
        p_signature_key: signatureImageKey,
        p_ip: ip || null,
        p_ua: userAgent || null,
        p_method: "code"
      })

      if (rpcErr) {
        console.error("[signPublicServiceOrderAction] RPC Error:", rpcErr)
        return { success: false, error: rpcErr.message || "Erro ao assinar ordem de serviço" }
      }

      const result = rpcRes as { success: boolean; error?: string }
      if (!result.success) {
        return { success: false, error: result.error || "Erro ao processar assinatura" }
      }
    }

    revalidatePath("/erp/service-orders")
    return { success: true }
  } catch (err: any) {
    console.error("[signPublicServiceOrderAction] Error:", err)
    return { success: false, error: err.message || "Erro interno ao assinar ordem de serviço" }
  }
}

export async function getServiceOrderAttachmentsAction(
  serviceOrderId: string
): Promise<{ success: true; data: any[] } | { success: false; error: string }> {
  try {
    await requireUser()
    const supabase = await getSupabaseServerClient()

    const { data, error } = await supabase
      .from("service_order_attachments")
      .select("*")
      .eq("service_order_id", serviceOrderId)
      .order("created_at", { ascending: false })

    if (error) throw error

    return { success: true, data: data || [] }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao listar anexos" }
  }
}
