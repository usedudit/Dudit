import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/authorization"
import { SecureLogger } from "@/lib/secure-logger"
import { createHash } from "crypto"
import { withCSRFProtection } from "@/lib/security/csrf-middleware"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"
import { createMercadoPagoPayment } from "@/lib/mercadopago/payment-client"
import { verifyPaymentQuote } from "@/lib/mercadopago/payment-quote"

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
function generateIdempotencyKey(partnerId: string, amount: number): string {
  const timeWindow = Math.floor(Date.now() / 30000)
  const payload = `erp_${partnerId}_${amount}_${timeWindow}`
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

    if (!partnerId) {
      return NextResponse.json({ error: "Parceiro não informado" }, { status: 400 })
    }

    if (!amount || amount <= 0 || amount > 999999) {
      return NextResponse.json({ error: "Valor inválido" }, { status: 400 })
    }

    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    // Validar que o usuário tem acesso ao parceiro (é dono ou membro da equipe)
    const adminClient = createAdminClient()

    if (orderId) {
      const { data: targetOrder } = await adminClient
        .from("orders")
        .select("id, situation, total_amount, paid_amount")
        .eq("id", orderId)
        .eq("partner_id", partnerId)
        .maybeSingle()

      if (targetOrder) {
        const isOrderPaid =
          targetOrder.situation === "paid" ||
          (Number(targetOrder.paid_amount || 0) >= Number(targetOrder.total_amount || 0) - 0.009 && Number(targetOrder.total_amount || 0) > 0)
        if (isOrderPaid) {
          return NextResponse.json({ error: "Este pedido já está totalmente pago e não permite novas cobranças." }, { status: 400 })
        }
      }
    }
    const { data: partner, error: partnerError } = await adminClient
      .from("partners")
      .select("id, user_id")
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
      const { data: partnerMethods } = await adminClient
        .from("partners")
        .select("mp_accepted_payment_methods")
        .eq("id", partnerId)
        .single()

      const accepted = (partnerMethods?.mp_accepted_payment_methods || {}) as Record<string, boolean>
      const methodId = String(paymentFormData.payment_method_id || "").toLowerCase()

      const methodAllowed = methodId === "pix" ? accepted.pix !== false
        : methodId === "bolbradesco" ? accepted.boleto !== false
          : ["account_money", "mercado_pago_wallet"].includes(methodId) ? accepted.mercado_pago_wallet !== false
            : true

      if (!methodAllowed) {
        return NextResponse.json({ error: "Método de pagamento não habilitado pelo vendedor" }, { status: 400 })
      }
    }

    // Verificar se o usuário é dono do parceiro ou membro da equipe
    let hasAccess = partner.user_id === user.id
    if (!hasAccess) {
      const { data: teamMember } = await adminClient
        .from("team_members")
        .select("id")
        .eq("partner_id", partnerId)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .single()
      hasAccess = !!teamMember
    }

    if (!hasAccess) {
      SecureLogger.warn("Unauthorized ERP payment attempt", { userId: user.id, partnerId })
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    if (!paymentQuote) {
      return NextResponse.json({ error: "Cotação de pagamento ausente. Atualize a tela e tente novamente." }, { status: 400 })
    }
    const quoteValidation = verifyPaymentQuote(paymentQuote, {
      userId: user.id,
      partnerId,
      amount,
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

    const targetReference = `ERP-${partnerId.slice(0, 8)}-${Date.now()}`

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
    if (paymentFormData.installments) {
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
    const idempotencyKey = generateIdempotencyKey(partnerId, amount)

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
      const { buildDepositCheckoutMeta } = await import("@/lib/services/marketplace-checkout-amounts")
      const depositCheckout = body.depositMeta
      await adminClient
        .from("orders")
        .update({
          mp_payment_id: mpPaymentId.toString(),
          payment_provider: "Mercado Pago",
          checkout_fulfillment: {
            ...(depositCheckout as Record<string, unknown>),
            depositCheckout,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .eq("partner_id", partnerId)
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
