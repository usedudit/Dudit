import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { checkPartnerPermission, getCurrentUser, requireStorePermission } from "@/lib/auth/authorization"
import { SecureLogger } from "@/lib/secure-logger"
import { createHash } from "crypto"
import { withCSRFProtection } from "@/lib/security/csrf-middleware"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"
import {
  findMercadoPagoIntegration,
  mapToMpPartnerFields,
} from "@/lib/services/payments/mercadopago-integration"
import { createMercadoPagoPayment } from "@/lib/mercadopago/payment-client"
import { verifyPaymentQuote } from "@/lib/mercadopago/payment-quote"
import { mergeCheckoutFulfillment } from "@/lib/payments/order-financial-state"

const isDev = process.env.NODE_ENV === "development"

interface ProcessErpPaymentRequest {
  paymentFormData: any
  partnerId: string
  amount: number
  paymentQuote?: string
  description?: string
  orderId?: string
  deviceId?: string | null
  isDepositCharge?: boolean
  depositMeta?: Record<string, unknown>
}

/**
 * Gera uma chave de idempotência determinística para pagamentos ERP.
 */
function generateIdempotencyKey(input: {
  partnerId: string
  userId: string
  amount: number
  paymentQuote: string
  orderId?: string
}): string {
  const payload = `erp_${input.partnerId}_${input.userId}_${input.orderId || "no-order"}_${input.amount.toFixed(2)}_${input.paymentQuote}`
  return createHash("sha256").update(payload).digest("hex").substring(0, 48)
}

async function handler(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await checkRateLimitForAPI(RateLimitCategory.PAYMENT)
    if (rateLimitResult.limited) {
      return NextResponse.json(rateLimitResult.body, { status: rateLimitResult.status })
    }

    const body: ProcessErpPaymentRequest = await request.json()
    const { paymentFormData, partnerId, amount, paymentQuote, description, orderId, deviceId } = body

    // Validações
    if (!paymentFormData?.payment_method_id) {
      return NextResponse.json({ error: "Método de pagamento não informado" }, { status: 400 })
    }

    if (body.isDepositCharge) {
      const depositMethodId = String(paymentFormData.payment_method_id || "").toLowerCase()
      if (depositMethodId === "bolbradesco" || depositMethodId === "boleto" || depositMethodId === "ticket") {
        return NextResponse.json({ error: "Boleto não está disponível para pagamento de sinal." }, { status: 400 })
      }
      if (depositMethodId === "account_money" || depositMethodId === "mercado_pago_wallet" || depositMethodId === "saldo mercado pago") {
        return NextResponse.json({ error: "Saldo Mercado Pago não está disponível para pagamento de sinal. Use PIX, cartão de crédito (1 parcela) ou cartão de débito." }, { status: 400 })
      }
    }

    if (typeof partnerId !== "string" || !partnerId.trim()) {
      return NextResponse.json({ error: "Parceiro não informado" }, { status: 400 })
    }

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > 999999) {
      return NextResponse.json({ error: "Valor inválido" }, { status: 400 })
    }

    if (orderId !== undefined && (typeof orderId !== "string" || !orderId.trim())) {
      return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
    }

    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    // A cobrança é uma mutação de pedido; exigir a permissão ERP atual no servidor.
    // A tabela legada team_members só prova vínculo e não representa o RBAC ativo.
    const { allowed: canEditOrders } = await checkPartnerPermission(partnerId, "orders", "edit")
    if (!canEditOrders) {
      SecureLogger.warn("Unauthorized ERP payment attempt", { userId: user.id, partnerId })
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    // Usado para validar o pedido informado e resolver os dados do parceiro.
    const adminClient = createAdminClient()

    if (orderId) {
      const { data: targetOrder, error: targetOrderError } = await adminClient
        .from("orders")
        .select("id, situation, total_amount, paid_amount, amount_paid, store_id")
        .eq("id", orderId)
        .eq("partner_id", partnerId)
        .maybeSingle()

      if (targetOrderError || !targetOrder) {
        return NextResponse.json({ error: "Pedido não encontrado para este parceiro." }, { status: 404 })
      }

      if (targetOrder.store_id) {
        await requireStorePermission(targetOrder.store_id, partnerId, "orders", "edit")
      }

      const totalAmount = Number(targetOrder.total_amount || 0)
      const paidAmount = Number(targetOrder.paid_amount ?? targetOrder.amount_paid ?? 0)
      const remainingAmount = Math.max(0, totalAmount - paidAmount)
      if (
        targetOrder.situation === "paid" ||
        totalAmount <= 0 ||
        remainingAmount <= 0.009
      ) {
        return NextResponse.json({ error: "Este pedido já está totalmente pago e não permite novas cobranças." }, { status: 400 })
      }
      if (amount > remainingAmount + 0.01) {
        return NextResponse.json({ error: "O valor da cobrança excede o saldo restante do pedido." }, { status: 400 })
      }
    }
    const { data: partner, error: partnerError } = await adminClient
      .from("partners")
      .select("id")
      .eq("id", partnerId)
      .single()

    if (partnerError || !partner) {
      SecureLogger.error("Partner not found for ERP payment", { partnerId })
      return NextResponse.json({ error: "Vendedor não encontrado" }, { status: 400 })
    }

    // Buscar nome da loja na tabela stores
    const { data: partnerStore } = await adminClient
      .from("stores")
      .select("name")
      .eq("partner_id", partnerId)
      .order("is_headquarters", { ascending: false })
      .limit(1)
      .maybeSingle()
    const partnerStoreName = partnerStore?.name || "Loja"

    // Validate payment method against partner's accepted MP methods
    {
      const partnerIntegration = await findMercadoPagoIntegration(adminClient, partnerId)

      const accepted = mapToMpPartnerFields(partnerIntegration).mp_accepted_payment_methods || ({} as Record<string, boolean>)
      const methodId = String(paymentFormData.payment_method_id || "").toLowerCase()

      const methodAllowed = methodId === "pix" ? accepted.pix !== false
        : methodId === "bolbradesco" ? accepted.boleto !== false
          : ["account_money", "mercado_pago_wallet"].includes(methodId) ? accepted.mercado_pago_wallet !== false
            : true

      if (!methodAllowed) {
        return NextResponse.json({ error: "Método de pagamento não habilitado pelo vendedor" }, { status: 400 })
      }
    }

    if (!paymentQuote) {
      return NextResponse.json({ error: "Cotação de pagamento ausente. Atualize a tela e tente novamente." }, { status: 400 })
    }
    const quoteValidation = verifyPaymentQuote(paymentQuote, {
      userId: user.id,
      partnerId,
      amount,
      orderId,
    })
    if (!quoteValidation.valid) {
      SecureLogger.warn("ERP payment quote rejected", {
        userId: user.id,
        partnerId,
        reason: quoteValidation.error,
      })
      return NextResponse.json({ error: quoteValidation.error }, { status: 400 })
    }

    // Obter token do MP
    let mpAccessToken: string
    try {
      mpAccessToken = await getValidMercadoPagoAccessToken(partnerId)
    } catch (err: any) {
      SecureLogger.warn("Failed to obtain valid MP token for ERP payment", { partnerId, error: err.message })
      return NextResponse.json({
        error: "Sessão do Mercado Pago inválida ou expirada. Reconecte nas configurações."
      }, { status: 400 })
    }

    // Montar requisição para a API do MP
    const rawFirstName = (paymentFormData.payer?.first_name || paymentFormData.payer?.firstName || "").trim();
    const rawLastName = (paymentFormData.payer?.last_name || paymentFormData.payer?.lastName || "").trim();

    let firstName = rawFirstName;
    let lastName = rawLastName;

    if (!firstName && !lastName) {
      firstName = "Cliente";
    } else if (firstName && !lastName && firstName.includes(" ")) {
      const parts = firstName.split(/\s+/);
      firstName = parts[0];
      lastName = parts.slice(1).join(" ");
    }

    const identificationNumber = paymentFormData.payer?.identification?.number ? String(paymentFormData.payer.identification.number).replace(/\D/g, "") : "";

    const isPix = paymentFormData.payment_method_id === "pix";
    const customerEmail = (paymentFormData.payer?.email || "").trim();
    const hasCustomerEmail = customerEmail.length > 0;

    const targetReference = orderId || `ERP-${partnerId.slice(0, 8)}-${Date.now()}`

    const rawPayerAddr = paymentFormData.payer?.address
    const payerZipCode = String(rawPayerAddr?.zipCode || rawPayerAddr?.zip_code || "").replace(/\D/g, "")
    const payerStreetName = String(rawPayerAddr?.streetName || rawPayerAddr?.street_name || "").trim()
    const payerStreetNumber = String(rawPayerAddr?.streetNumber || rawPayerAddr?.street_number || "").trim()
    const payerNeighborhood = String(rawPayerAddr?.neighborhood || "").trim()
    const payerCity = String(rawPayerAddr?.city || "").trim()
    const payerFederalUnit = String(rawPayerAddr?.federalUnit || rawPayerAddr?.federal_unit || "").trim()

    const rawPhone = String(paymentFormData.payer?.phone?.number || "").replace(/\D/g, "")
    const cleanPhone = rawPhone.startsWith("55") && rawPhone.length > 11 ? rawPhone.slice(2) : rawPhone
    const payerPhone = cleanPhone.length >= 10 ? {
      area_code: cleanPhone.slice(0, 2),
      number: cleanPhone.slice(2),
    } : undefined

    const mpPaymentRequest: Record<string, any> = {
      transaction_amount: amount,
      payment_method_id: paymentFormData.payment_method_id,
      notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/mercadopago/webhook`,
      external_reference: targetReference,
      metadata: {
        dudit_partner_id: partnerId,
        ...(orderId ? { dudit_order_id: orderId } : {}),
        dudit_authorized_amount: amount,
      },
      statement_descriptor: "DUDIT",
      description: (description || `Venda ERP - ${partnerStoreName}`).slice(0, 250),
      payer: {
        email: hasCustomerEmail ? customerEmail : user.email,
        first_name: firstName,
        ...(lastName ? { last_name: lastName } : {}),
        ...(payerPhone ? { phone: payerPhone } : {}),
        ...(identificationNumber ? {
          identification: {
            type: paymentFormData.payer?.identification?.type || (identificationNumber.length > 11 ? "CNPJ" : "CPF"),
            number: identificationNumber,
          },
        } : {}),
        ...(payerStreetName ? {
          address: {
            zip_code: payerZipCode || "",
            street_name: payerStreetName,
            street_number: payerStreetNumber || "",
            neighborhood: payerNeighborhood || "",
            city: payerCity || "",
            federal_unit: payerFederalUnit || "",
          },
        } : {}),
      },
      additional_info: {
        items: [
          {
            id: "venda_erp",
            title: (description || `Venda ERP - ${partnerStoreName}`).slice(0, 256),
            description: `Venda no valor de R$ ${amount.toFixed(2)} - Loja ${partnerStoreName}`.slice(0, 256),
            category_id: "others",
            quantity: 1,
            unit_price: amount,
          },
        ],
        payer: {
          first_name: firstName,
          last_name: lastName || firstName,
          registration_date: user.created_at || new Date().toISOString(),
          ...(payerPhone ? { phone: payerPhone } : {}),
          ...(payerStreetName ? {
            address: {
              zip_code: payerZipCode || undefined,
              street_name: payerStreetName,
              street_number: payerStreetNumber ? (Number(payerStreetNumber.replace(/\D/g, "")) || payerStreetNumber) : undefined,
            },
          } : {}),
        },
      },
    }

    // Token para cartão de crédito
    if (paymentFormData.token) {
      mpPaymentRequest.token = paymentFormData.token
    }
    // Para sinal, forçar 1 parcela no cartão de crédito
    if (body.isDepositCharge && paymentFormData.payment_method_id !== "pix" && paymentFormData.payment_method_id !== "bolbradesco") {
      mpPaymentRequest.installments = 1
    } else if (paymentFormData.installments) {
      mpPaymentRequest.installments = paymentFormData.installments
    }
    if (paymentFormData.issuer_id) {
      mpPaymentRequest.issuer_id = paymentFormData.issuer_id
    }

    // Boleto: additional_info obrigatório (BACEN)
    if (paymentFormData.payment_method_id === "bolbradesco") {
      const stateNameToAbbr = new Map<string, string>([
        ["acre", "AC"], ["alagoas", "AL"], ["amapá", "AP"], ["amazonas", "AM"],
        ["bahia", "BA"], ["ceará", "CE"], ["distrito federal", "DF"], ["espírito santo", "ES"],
        ["goiás", "GO"], ["maranhão", "MA"], ["mato grosso", "MT"], ["mato grosso do sul", "MS"],
        ["minas gerais", "MG"], ["pará", "PA"], ["paraíba", "PB"], ["paraná", "PR"],
        ["pernambuco", "PE"], ["piauí", "PI"], ["rio de janeiro", "RJ"],
        ["rio grande do norte", "RN"], ["rio grande do sul", "RS"], ["rondônia", "RO"],
        ["roraima", "RR"], ["santa catarina", "SC"], ["são paulo", "SP"],
        ["sergipe", "SE"], ["tocantins", "TO"],
      ])

      const rawFederalUnit = mpPaymentRequest.payer?.address?.federal_unit || ""
      const federalUnitAbbr = rawFederalUnit.length === 2
        ? rawFederalUnit.toUpperCase()
        : (stateNameToAbbr.get(rawFederalUnit.toLowerCase()) || rawFederalUnit)

      if (mpPaymentRequest.payer?.address) {
        mpPaymentRequest.payer.address.federal_unit = federalUnitAbbr
      }

      mpPaymentRequest.additional_info.payer = {
        ...(mpPaymentRequest.additional_info?.payer || {}),
        first_name: mpPaymentRequest.payer.first_name,
        last_name: mpPaymentRequest.payer.last_name,
        address: {
          zip_code: mpPaymentRequest.payer?.address?.zip_code || "",
          street_name: mpPaymentRequest.payer?.address?.street_name || "",
          street_number: mpPaymentRequest.payer?.address?.street_number || "",
        },
      }
    }

    SecureLogger.info("ERP MP payment request prepared", {
      paymentMethodId: paymentFormData?.payment_method_id,
      partnerId,
      hasPaymentToken: Boolean(paymentFormData?.token),
    })

    // Idempotency key
    const idempotencyKey = generateIdempotencyKey({
      partnerId,
      userId: user.id,
      amount,
      paymentQuote,
      orderId,
    })

    // Processar pagamento via SDK Oficial do Mercado Pago (+5 pontos Backend SDK, +2 pontos Device ID)
    const paymentResult = await createMercadoPagoPayment({
      accessToken: mpAccessToken,
      paymentPayload: mpPaymentRequest,
      idempotencyKey,
      deviceId,
    })

    if (!paymentResult.success || !paymentResult.data) {
      SecureLogger.error("MP SDK ERP payment failed", {
        status: paymentResult.status,
        errorCode: paymentResult.errorCode,
        errorMessage: paymentResult.errorMessage?.slice(0, 160),
      })
      return NextResponse.json({
        error: "Erro ao processar pagamento com Mercado Pago. Tente novamente."
      }, { status: paymentResult.status >= 500 ? 500 : 400 })
    }

    const mpPaymentResponse = paymentResult.data
    const mpPaymentId = mpPaymentResponse.id

    if (!mpPaymentId) {
      SecureLogger.error("MP returned no payment ID for ERP payment", { status: mpPaymentResponse.status })
      return NextResponse.json({ error: "Erro ao processar pagamento - ID não retornado." }, { status: 500 })
    }

    // If this is a deposit charge against an existing order, persist deposit metadata
    if (body.isDepositCharge && orderId && body.depositMeta) {
      const depositCheckout = body.depositMeta as Record<string, any>
      // Never replace the whole column: `checkout_fulfillment.lines` carries the
      // booking date/time/staff used later to create the appointment.
      const { data: currentOrder } = await adminClient
        .from("orders")
        .select("order_number, checkout_fulfillment, partner_id")
        .eq("id", orderId)
        .eq("partner_id", partnerId)
        .maybeSingle()

      const currentFulfillment = (currentOrder?.checkout_fulfillment as Record<string, any>) || {}
      const existingHistory = Array.isArray(currentFulfillment.depositCheckoutHistory)
        ? currentFulfillment.depositCheckoutHistory
        : []

      const depositAmount = Number(
        depositCheckout.initialChargeAmount ||
        depositCheckout.depositAmount ||
        depositCheckout.serviceDepositAmount ||
        body.amount ||
        0
      )

      const createdAt = new Date().toISOString()
      const updatedDepositCheckout = {
        ...depositCheckout,
        depositStatus: "pending",
        sinalPaid: false,
        createdAt,
        mpPaymentId: mpPaymentId.toString(),
      }

      const mergedFulfillment = mergeCheckoutFulfillment(
        currentFulfillment,
        {
          ...depositCheckout,
          depositCheckout: updatedDepositCheckout,
          depositCheckoutHistory: [
            ...existingHistory,
            {
              ...updatedDepositCheckout,
              action: "created",
              depositStatus: "pending",
              createdAt,
              createdBy: user?.id || null,
              mpPaymentId: mpPaymentId.toString(),
              depositAmount,
            },
          ],
        },
      )

      await adminClient
        .from("orders")
        .update({
          mp_payment_id: mpPaymentId.toString(),
          payment_provider: "Mercado Pago",
          payment_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          checkout_fulfillment: mergedFulfillment,
          updated_at: createdAt,
        })
        .eq("id", orderId)
        .eq("partner_id", partnerId)

      try {
        const { logAuditEvent } = await import("@/lib/services/timeline.service")
        await logAuditEvent({
          partnerId,
          actorUserId: user?.id || null,
          entityType: "order",
          entityId: orderId,
          actionType: "deposit_created",
          changeLines: [
            "gerou uma nova cobrança de sinal para o pedido.",
            `Sinal: R$ ${depositAmount.toFixed(2)}`,
          ],
          metadata: {
            orderNumber: currentOrder?.order_number,
            depositAmount,
            initialChargeAmount: depositAmount,
            mpPaymentId: mpPaymentId.toString(),
          },
          source: "erp",
        })
      } catch (auditErr: any) {
        console.error("[process-erp-payment] Error logging deposit_created audit event:", auditErr)
      }

      try {
        const { revalidateOrderHistory } = await import("@/lib/utils/revalidation")
        const { revalidatePath } = await import("next/cache")
        await revalidateOrderHistory(orderId)
        if (currentOrder?.order_number) {
          revalidatePath(`/order/${currentOrder.order_number}`)
        }
        revalidatePath("/erp/pedidos")
      } catch (revalErr: any) {
        console.error("[process-erp-payment] Error revalidating history:", revalErr)
      }
    }

    // Extrair dados de Pix
    let pixData = null
    if (paymentFormData.payment_method_id === "pix" && mpPaymentResponse.point_of_interaction?.transaction_data) {
      const transactionData = mpPaymentResponse.point_of_interaction.transaction_data
      pixData = {
        qrCode: transactionData.qr_code,
        qrCodeBase64: transactionData.qr_code_base64,
        ticketUrl: transactionData.ticket_url,
      }
    }

    // Extrair dados de Boleto
    let boletoData = null
    if (paymentFormData.payment_method_id === "bolbradesco") {
      const externalUrl = mpPaymentResponse.transaction_details?.external_resource_url || mpPaymentResponse.point_of_interaction?.transaction_data?.ticket_url
      const barcode = mpPaymentResponse.barcode?.content || mpPaymentResponse.point_of_interaction?.transaction_data?.barcode

      if (externalUrl || barcode) {
        boletoData = { ticketUrl: externalUrl, barcode: barcode }
      }
    }

    // Determinar nome do método
    let paymentMethodDisplayName = "Mercado Pago"
    if (paymentFormData.payment_method_id === "pix") {
      paymentMethodDisplayName = "Pix (Mercado Pago)"
    } else if (paymentFormData.payment_method_id === "bolbradesco") {
      paymentMethodDisplayName = "Boleto (Mercado Pago)"
    } else {
      paymentMethodDisplayName = "Cartão (Mercado Pago)"
    }

    const paymentStatus = mpPaymentResponse.status || "pending"

    return NextResponse.json({
      success: true,
      paymentStatus,
      mpPaymentId: mpPaymentId.toString(),
      paymentMethod: paymentFormData.payment_method_id,
      paymentMethodDisplayName,
      pixData,
      boletoData,
    })
  } catch (error: any) {
    SecureLogger.error("Error in process-erp-payment endpoint", {
      errorMessage: error?.message,
      errorCode: error?.code,
    })
    return NextResponse.json({ error: "Erro ao processar pagamento. Tente novamente." }, { status: 500 })
  }
}

export const POST = withCSRFProtection(handler)
