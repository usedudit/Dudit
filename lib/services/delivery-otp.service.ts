import { randomInt, randomBytes, createHmac, timingSafeEqual } from "crypto"
import { getAdminClient } from "@/lib/supabase/admin"
import { encrypt, decrypt } from "@/lib/cryptoService"

export type DeliveryModality =
  | "dudit_platform"
  | "store_internal"
  | "carrier"
  | "pickup"
  | "other"

export interface DeliveryOtpRequirement {
  requiresOtp: boolean
  modality: DeliveryModality
  reason: string
  thresholdAmount?: number
  eligibleAmount: number
  hasActiveDriver: boolean
  driverType?: "dudit_platform" | "store_internal" | null
}

export interface DeliveryOtpResult {
  requiresOtp: boolean
  code?: string
  expiresAt?: string
  status?: "pending" | "confirmed"
  confirmedAt?: string | null
  modality?: DeliveryModality
}

export interface VerifyDeliveryOtpParams {
  orderId: string
  code: string
  confirmedByUserId: string
  adminClient?: any
}

export interface VerifyDeliveryOtpResponse {
  success: boolean
  alreadyConfirmed?: boolean
  error?: string
  remainingAttempts?: number
}

const DEFAULT_INTERNAL_DELIVERY_THRESHOLD = 500.00
const OTP_EXPIRATION_HOURS = 48
const MAX_ATTEMPTS = 5

/**
 * Evaluates whether an order strictly requires delivery confirmation OTP based on real DB records.
 * Rules:
 * A. Rede Dudit: ALWAYS requires OTP, regardless of order amount.
 * B. Store internal driver: REQUIRES OTP if total_amount > R$ 500.00 (or custom threshold). If <= R$ 500.00, does not require OTP.
 * C. Carrier: NEVER requires OTP.
 * D. Other/Unknown/Pickup: NEVER requires OTP (does not presume unknown is store internal).
 */
export async function doesOrderRequireDeliveryOtp(
  orderId: string,
  options?: { adminClient?: any; orderData?: any }
): Promise<DeliveryOtpRequirement> {
  const admin = options?.adminClient || getAdminClient()

  let order = options?.orderData
  if (!order) {
    const { data: fetchedOrder } = await admin
      .from("orders")
      .select("id, total_amount, situation, delivery_status, delivery_type, delivery_breakdown, partner_id, buyer_id")
      .eq("id", orderId)
      .maybeSingle()

    order = fetchedOrder
  }

  if (!order) {
    return {
      requiresOtp: false,
      modality: "other",
      reason: "Pedido não encontrado.",
      eligibleAmount: 0,
      hasActiveDriver: false,
    }
  }

  const eligibleAmount = Number(order.total_amount || 0)

  // 1. Pickup modality: Never requires OTP
  if (order.delivery_type === "pickup") {
    return {
      requiresOtp: false,
      modality: "pickup",
      reason: "Retirada no estabelecimento não exige código de entrega.",
      eligibleAmount,
      hasActiveDriver: false,
    }
  }

  // 2. Carrier modality: Never requires OTP
  const isSuperfrete = (order.delivery_breakdown as any)?.source === "superfrete"
  if (isSuperfrete) {
    return {
      requiresOtp: false,
      modality: "carrier",
      reason: "Envio por transportadora possui fluxo próprio de rastreamento e não exige código OTP.",
      eligibleAmount,
      hasActiveDriver: false,
    }
  }

  const { data: shipments } = await admin
    .from("order_shipments")
    .select("id")
    .eq("order_id", orderId)
    .limit(1)

  if (shipments && shipments.length > 0) {
    return {
      requiresOtp: false,
      modality: "carrier",
      reason: "Envio por transportadora possui rastreamento por etiqueta e não exige código OTP.",
      eligibleAmount,
      hasActiveDriver: false,
    }
  }

  // 3. Dudit Platform Delivery check
  const { data: assignments } = await admin
    .from("delivery_assignments")
    .select("id, status, driver_id")
    .eq("order_id", orderId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)

  const activeAssignment = assignments?.[0]
  if (activeAssignment) {
    return {
      requiresOtp: true,
      modality: "dudit_platform",
      reason: "Entregas realizadas pela Rede Dudit exigem código de confirmação obrigatoriamente.",
      eligibleAmount,
      hasActiveDriver: Boolean(activeAssignment.driver_id),
      driverType: "dudit_platform",
    }
  }

  // Also check if order is part of a delivery assigned to Dudit platform driver
  const { data: deliveryOrder } = await admin
    .from("delivery_orders")
    .select("delivery_id")
    .eq("order_id", orderId)
    .maybeSingle()

  let storeDelivery: any = null

  if (deliveryOrder?.delivery_id) {
    const { data: deliveryGroupAssignment } = await admin
      .from("delivery_assignments")
      .select("id, status, driver_id")
      .eq("delivery_id", deliveryOrder.delivery_id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)

    if (deliveryGroupAssignment?.[0]) {
      return {
        requiresOtp: true,
        modality: "dudit_platform",
        reason: "Entregas realizadas pela Rede Dudit exigem código de confirmação obrigatoriamente.",
        eligibleAmount,
        hasActiveDriver: Boolean(deliveryGroupAssignment[0].driver_id),
        driverType: "dudit_platform",
      }
    }

    const { data: fetchedStoreDelivery } = await admin
      .from("deliveries")
      .select("id, delivery_person_id, partner_id")
      .eq("id", deliveryOrder.delivery_id)
      .maybeSingle()

    storeDelivery = fetchedStoreDelivery

    // If delivery explicitly assigned to Dudit platform driver or network
    if (
      storeDelivery?.delivery_person_id === "dudit_network" ||
      storeDelivery?.delivery_person_id === "platform:dudit_network" ||
      (typeof storeDelivery?.delivery_person_id === "string" && storeDelivery.delivery_person_id.startsWith("platform:"))
    ) {
      return {
        requiresOtp: true,
        modality: "dudit_platform",
        reason: "Entregas realizadas pela Rede Dudit exigem código de confirmação obrigatoriamente.",
        eligibleAmount,
        hasActiveDriver: storeDelivery.delivery_person_id !== "platform:dudit_network" && storeDelivery.delivery_person_id !== "dudit_network",
        driverType: "dudit_platform",
      }
    }
  }

  // 4. Store Internal Delivery check
  // An order is store internal delivery if it is assigned to a delivery in `deliveries` (without Dudit platform assignment)
  if (deliveryOrder?.delivery_id) {
    let threshold = DEFAULT_INTERNAL_DELIVERY_THRESHOLD
    const effectivePartnerId = order.partner_id || storeDelivery?.partner_id
    if (effectivePartnerId) {
      const { data: settings } = await admin
        .from("delivery_settings")
        .select("otp_min_order_amount")
        .eq("partner_id", effectivePartnerId)
        .maybeSingle()

      if (settings?.otp_min_order_amount != null) {
        const customVal = Number(settings.otp_min_order_amount)
        if (!Number.isNaN(customVal) && customVal >= 0) {
          threshold = customVal
        }
      }
    }

    const exceedsThreshold = eligibleAmount > threshold
    return {
      requiresOtp: exceedsThreshold,
      modality: "store_internal",
      thresholdAmount: threshold,
      reason: exceedsThreshold
        ? `Entrega própria da loja com valor (${eligibleAmount.toFixed(2)}) superior a R$ ${threshold.toFixed(2)} exige código de confirmação.`
        : `Entrega própria da loja com valor (${eligibleAmount.toFixed(2)}) não superior a R$ ${threshold.toFixed(2)} não exige código.`,
      eligibleAmount,
      hasActiveDriver: Boolean(storeDelivery?.delivery_person_id),
      driverType: "store_internal",
    }
  }

  // 5. Other / Unassigned / Unknown modality
  return {
    requiresOtp: false,
    modality: "other",
    reason: "Modalidade sem entregador designado ou padrão não sujeito a OTP.",
    eligibleAmount,
    hasActiveDriver: false,
    driverType: null,
  }
}

/**
 * Returns existing active OTP or securely generates a fresh one if the order requires OTP.
 */
export async function getOrGenerateDeliveryOtp(
  orderId: string,
  options?: { adminClient?: any }
): Promise<DeliveryOtpResult> {
  const admin = options?.adminClient || getAdminClient()
  const requirement = await doesOrderRequireDeliveryOtp(orderId, { adminClient: admin })

  if (!requirement.requiresOtp) {
    return {
      requiresOtp: false,
      modality: requirement.modality,
    }
  }

  const now = new Date()

  // 1. Check if there's already an active (unconfirmed, non-invalidated) OTP
  const { data: activeOtps } = await admin
    .from("order_delivery_otps")
    .select("id, encrypted_code, expires_at, confirmed_at, invalidated_at, delivery_mode")
    .eq("order_id", orderId)
    .is("invalidated_at", null)
    .order("created_at", { ascending: false })
    .limit(1)

  const active = activeOtps?.[0]
  if (active) {
    if (active.confirmed_at) {
      return {
        requiresOtp: true,
        status: "confirmed",
        confirmedAt: active.confirmed_at,
        expiresAt: active.expires_at,
        modality: active.delivery_mode as DeliveryModality,
      }
    }

    // Check if not expired
    if (new Date(active.expires_at) > now) {
      try {
        const decryptedCode = await decrypt(active.encrypted_code, "delivery_otp")
        return {
          requiresOtp: true,
          code: decryptedCode,
          expiresAt: active.expires_at,
          status: "pending",
          modality: active.delivery_mode as DeliveryModality,
        }
      } catch (err) {
        console.error("[DeliveryOtp] Failed to decrypt existing OTP code. Regenerating...", err)
      }
    } else {
      // Mark as invalidated due to expiration
      await admin
        .from("order_delivery_otps")
        .update({ invalidated_at: now.toISOString(), invalidation_reason: "expired" })
        .eq("id", active.id)
    }
  }

  // 2. Generate a fresh cryptographically secure 6-digit numeric code
  const code = String(randomInt(100000, 1000000))
  const salt = randomBytes(16).toString("hex")
  const codeHash = createHmac("sha256", salt).update(code).digest("hex")
  const encryptedCode = await encrypt(code, "delivery_otp")

  const expiresAt = new Date(now.getTime() + OTP_EXPIRATION_HOURS * 60 * 60 * 1000).toISOString()

  // Resolve partner_id for tenant grouping
  const { data: ord } = await admin.from("orders").select("partner_id").eq("id", orderId).maybeSingle()

  const { error: insertError } = await admin.from("order_delivery_otps").insert({
    order_id: orderId,
    partner_id: ord?.partner_id || null,
    code_hash: codeHash,
    salt,
    encrypted_code: encryptedCode,
    delivery_mode: requirement.modality === "dudit_platform" ? "dudit_platform" : "store_internal",
    attempts: 0,
    max_attempts: MAX_ATTEMPTS,
    expires_at: expiresAt,
    metadata: {
      modality: requirement.modality,
      eligible_amount: requirement.eligibleAmount,
      reason: requirement.reason,
    },
  })

  if (insertError) {
    // If concurrent insert occurred, return the one created by the winner
    const { data: fallback } = await admin
      .from("order_delivery_otps")
      .select("encrypted_code, expires_at, confirmed_at, delivery_mode")
      .eq("order_id", orderId)
      .is("invalidated_at", null)
      .maybeSingle()

    if (fallback) {
      if (fallback.confirmed_at) {
        return {
          requiresOtp: true,
          status: "confirmed",
          confirmedAt: fallback.confirmed_at,
          expiresAt: fallback.expires_at,
          modality: fallback.delivery_mode as DeliveryModality,
        }
      }
      const decrypted = await decrypt(fallback.encrypted_code, "delivery_otp")
      return {
        requiresOtp: true,
        code: decrypted,
        expiresAt: fallback.expires_at,
        status: "pending",
        modality: fallback.delivery_mode as DeliveryModality,
      }
    }
    throw new Error(`Failed to generate delivery OTP: ${insertError.message}`)
  }

  return {
    requiresOtp: true,
    code,
    expiresAt,
    status: "pending",
    modality: requirement.modality,
  }
}

/**
 * Validates and atomically consumes a delivery OTP submitted by the courier.
 */
export async function verifyAndConsumeDeliveryOtp(
  params: VerifyDeliveryOtpParams
): Promise<VerifyDeliveryOtpResponse> {
  const admin = params.adminClient || getAdminClient()
  const sanitizedCode = String(params.code || "").trim()

  if (!/^\d{6}$/.test(sanitizedCode)) {
    return {
      success: false,
      error: "Código de entrega inválido. Digite os 6 dígitos numéricos.",
    }
  }

  // 1. Fetch active OTP record for salt and lock status
  const { data: otpRecord } = await admin
    .from("order_delivery_otps")
    .select("id, salt, attempts, max_attempts, locked_until, expires_at, confirmed_at")
    .eq("order_id", params.orderId)
    .is("invalidated_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!otpRecord) {
    // Check if an earlier OTP for this order was already confirmed (idempotency)
    const { data: confirmedRecord } = await admin
      .from("order_delivery_otps")
      .select("id, confirmed_at")
      .eq("order_id", params.orderId)
      .not("confirmed_at", "is", null)
      .limit(1)
      .maybeSingle()

    if (confirmedRecord) {
      return {
        success: true,
        alreadyConfirmed: true,
      }
    }

    return {
      success: false,
      error: "Código de confirmação de entrega não encontrado para este pedido.",
    }
  }

  if (otpRecord.confirmed_at) {
    return {
      success: true,
      alreadyConfirmed: true,
    }
  }

  const now = new Date()

  // 2. Check lockout
  if (otpRecord.locked_until && new Date(otpRecord.locked_until) > now) {
    return {
      success: false,
      error: "Muitas tentativas incorretas. Entrega bloqueada temporariamente para validação.",
    }
  }

  // 3. Check expiration
  if (new Date(otpRecord.expires_at) <= now) {
    await admin
      .from("order_delivery_otps")
      .update({ invalidated_at: now.toISOString(), invalidation_reason: "expired" })
      .eq("id", otpRecord.id)

    return {
      success: false,
      error: "O código de confirmação deste pedido expirou.",
    }
  }

  // 4. Compute HMAC hash of submitted code
  const testHash = createHmac("sha256", otpRecord.salt).update(sanitizedCode).digest("hex")

  // 5. Try calling the atomic SQL RPC function if present
  try {
    const { data: rpcRes, error: rpcErr } = await admin.rpc("verify_and_consume_delivery_otp", {
      p_order_id: params.orderId,
      p_code_hash: testHash,
      p_confirmed_by: params.confirmedByUserId,
      p_max_attempts: otpRecord.max_attempts || MAX_ATTEMPTS,
    })

    if (!rpcErr && rpcRes) {
      if (rpcRes.success) {
        return {
          success: true,
          alreadyConfirmed: Boolean(rpcRes.already_confirmed),
        }
      }
      return {
        success: false,
        error: rpcRes.message || "Código incorreto.",
        remainingAttempts: rpcRes.remaining_attempts,
      }
    }
  } catch {
    // If RPC is unavailable (e.g. before DB migration is executed in local test environment), execute fallback
  }

  // Fallback atomic execution in application layer
  const { data: currentOtp } = await admin
    .from("order_delivery_otps")
    .select("id, code_hash, attempts, max_attempts")
    .eq("id", otpRecord.id)
    .is("confirmed_at", null)
    .is("invalidated_at", null)
    .maybeSingle()

  if (!currentOtp) {
    return { success: false, error: "Código de entrega já utilizado ou expirado." }
  }

  const hashesMatch = timingSafeEqual(
    Buffer.from(currentOtp.code_hash, "hex"),
    Buffer.from(testHash, "hex")
  )

  if (!hashesMatch) {
    const newAttempts = (currentOtp.attempts || 0) + 1
    const maxAtt = currentOtp.max_attempts || MAX_ATTEMPTS
    const isLocked = newAttempts >= maxAtt
    const lockedUntil = isLocked ? new Date(now.getTime() + 15 * 60 * 1000).toISOString() : null

    await admin
      .from("order_delivery_otps")
      .update({
        attempts: newAttempts,
        locked_until: lockedUntil,
        updated_at: now.toISOString(),
      })
      .eq("id", currentOtp.id)

    return {
      success: false,
      remainingAttempts: Math.max(0, maxAtt - newAttempts),
      error: isLocked
        ? "Limite de tentativas excedido. Bloqueado temporariamente por 15 minutos."
        : "Código de confirmação incorreto.",
    }
  }

  // Valid! Confirm it
  await admin
    .from("order_delivery_otps")
    .update({
      confirmed_at: now.toISOString(),
      confirmed_by: params.confirmedByUserId,
      updated_at: now.toISOString(),
    })
    .eq("id", currentOtp.id)

  return {
    success: true,
    alreadyConfirmed: false,
  }
}

/**
 * Authorizes an owner/admin to bypass OTP confirmation in ERP when required.
 * Marks the active OTP as confirmed/bypassed with audit trails.
 */
export async function bypassDeliveryOtp(params: {
  orderId: string
  bypassedByUserId: string
  reason?: string
  adminClient?: any
}): Promise<{ success: boolean; error?: string }> {
  const admin = params.adminClient || getAdminClient()
  const now = new Date().toISOString()

  // Ensure an OTP record exists so that bypass is auditable
  await getOrGenerateDeliveryOtp(params.orderId, { adminClient: admin })

  // Find active OTP for this order
  const { data: activeOtps } = await admin
    .from("order_delivery_otps")
    .select("id, confirmed_at, invalidated_at")
    .eq("order_id", params.orderId)
    .is("confirmed_at", null)
    .is("invalidated_at", null)
    .order("created_at", { ascending: false })
    .limit(1)

  const activeOtp = activeOtps?.[0]
  if (activeOtp) {
    const bypassNote = params.reason ? `Bypass autorizado por administrador: ${params.reason}` : "Bypass autorizado por administrador via ERP"
    await admin
      .from("order_delivery_otps")
      .update({
        confirmed_at: now,
        confirmed_by: params.bypassedByUserId,
        invalidation_reason: bypassNote,
        updated_at: now,
      })
      .eq("id", activeOtp.id)
  }

  return { success: true }
}

/**
 * Retrieves the OTP code strictly for the authorized customer/buyer.
 */
export async function getCustomerDeliveryOtp(params: {
  orderId: string
  userId: string
  adminClient?: any
}): Promise<{ success: boolean; data?: DeliveryOtpResult; error?: string }> {
  const admin = params.adminClient || getAdminClient()

  // 1. Verify ownership: user must be order.buyer_id or linked customer or store staff
  const { data: order } = await admin
    .from("orders")
    .select("id, buyer_id, customer_id, partner_id, situation, delivery_status")
    .eq("id", params.orderId)
    .maybeSingle()

  if (!order) {
    return { success: false, error: "Pedido não encontrado." }
  }

  let isAuthorized = order.buyer_id === params.userId

  if (!isAuthorized && order.customer_id) {
    const { data: cust } = await admin
      .from("customers")
      .select("user_id, marketplace_user_id")
      .eq("id", order.customer_id)
      .maybeSingle()

    if (cust?.user_id === params.userId || cust?.marketplace_user_id === params.userId) {
      isAuthorized = true
    }
  }

  if (!isAuthorized && order.partner_id) {
    const { data: partnerUser } = await admin
      .from("partner_users")
      .select("id")
      .eq("partner_id", order.partner_id)
      .eq("user_id", params.userId)
      .maybeSingle()

    if (partnerUser) {
      isAuthorized = true
    }
  }

  if (!isAuthorized) {
    return { success: false, error: "Você não tem permissão para visualizar o código deste pedido." }
  }

  // 2. Fetch or generate OTP
  try {
    const result = await getOrGenerateDeliveryOtp(params.orderId, { adminClient: admin })
    return { success: true, data: result }
  } catch (err: any) {
    return { success: false, error: err?.message || "Não foi possível carregar o código de entrega." }
  }
}

/**
 * Invalidates any active OTP for an order (e.g. upon order cancellation or driver reassignment).
 */
export async function invalidateDeliveryOtp(
  orderId: string,
  reason: string,
  options?: { adminClient?: any }
): Promise<void> {
  const admin = options?.adminClient || getAdminClient()
  await admin
    .from("order_delivery_otps")
    .update({
      invalidated_at: new Date().toISOString(),
      invalidation_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", orderId)
    .is("confirmed_at", null)
    .is("invalidated_at", null)
}

/**
 * Query delivery OTP status without exposing code (safe for ERP, drivers, and admin views).
 */
export async function getOrderDeliveryOtpStatus(
  orderId: string,
  options?: { adminClient?: any }
): Promise<{
  requiresOtp: boolean
  modality: DeliveryModality
  isConfirmed: boolean
  confirmedAt?: string | null
  attempts: number
  isLocked: boolean
}> {
  const admin = options?.adminClient || getAdminClient()
  const requirement = await doesOrderRequireDeliveryOtp(orderId, { adminClient: admin })

  if (!requirement.requiresOtp) {
    return {
      requiresOtp: false,
      modality: requirement.modality,
      isConfirmed: false,
      attempts: 0,
      isLocked: false,
    }
  }

  const { data: record } = await admin
    .from("order_delivery_otps")
    .select("confirmed_at, attempts, max_attempts, locked_until")
    .eq("order_id", orderId)
    .is("invalidated_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const isConfirmed = Boolean(record?.confirmed_at)
  const isLocked = Boolean(record?.locked_until && new Date(record.locked_until) > new Date())

  return {
    requiresOtp: true,
    modality: requirement.modality,
    isConfirmed,
    confirmedAt: record?.confirmed_at || null,
    attempts: record?.attempts || 0,
    isLocked,
  }
}
