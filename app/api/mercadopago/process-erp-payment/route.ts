import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/authorization"
import { SecureLogger } from "@/lib/secure-logger"
import { createHash } from "crypto"
import { withCSRFProtection } from "@/lib/security/csrf-middleware"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"

const isDev = process.env.NODE_ENV === "development"

interface ProcessErpPaymentRequest {
  paymentFormData: any
  partnerId: string
  amount: number
  description?: string
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
    const { paymentFormData, partnerId, amount, description } = body

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
    const { data: partner, error: partnerError } = await adminClient
      .from("partners")
      .select("id, store_name, user_id")
      .eq("id", partnerId)
      .single()

    if (partnerError || !partner) {
      SecureLogger.error("Partner not found for ERP payment", { partnerId })
      return NextResponse.json({ error: "Vendedor não encontrado" }, { status: 400 })
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
    const mpPaymentRequest: Record<string, any> = {
      transaction_amount: amount,
      payment_method_id: paymentFormData.payment_method_id,
      payer: {
        email: paymentFormData.payer?.email || user.email,
        first_name: paymentFormData.payer?.first_name || "Cliente",
        last_name: paymentFormData.payer?.last_name || "ERP",
        identification: {
          type: paymentFormData.payer?.identification?.type || "CPF",
          number: paymentFormData.payer?.identification?.number,
        },
        ...(paymentFormData.payer?.address ? {
          address: {
            zip_code: paymentFormData.payer.address.zipCode || paymentFormData.payer.address.zip_code || "",
            street_name: paymentFormData.payer.address.streetName || paymentFormData.payer.address.street_name || "",
            street_number: paymentFormData.payer.address.streetNumber || paymentFormData.payer.address.street_number || "",
            neighborhood: paymentFormData.payer.address.neighborhood || "",
            city: paymentFormData.payer.address.city || "",
            federal_unit: paymentFormData.payer.address.federalUnit || paymentFormData.payer.address.federal_unit || "",
          },
        } : {}),
      },
      description: description || `Venda ERP - ${partner.store_name || "Loja"}`,
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

      mpPaymentRequest.additional_info = {
        payer: {
          first_name: mpPaymentRequest.payer.first_name,
          last_name: mpPaymentRequest.payer.last_name,
          address: {
            zip_code: mpPaymentRequest.payer?.address?.zip_code || "",
            street_name: mpPaymentRequest.payer?.address?.street_name || "",
            street_number: mpPaymentRequest.payer?.address?.street_number || "",
          },
        },
      }
    }

    if (isDev) console.log("[ERP MP PAYMENT REQUEST]:", JSON.stringify(mpPaymentRequest, null, 2))

    // Idempotency key
    const idempotencyKey = generateIdempotencyKey(partnerId, amount)

    // Chamar API do MP
    const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(mpPaymentRequest),
    })

    if (!mpResponse.ok) {
      let mpErrorData: any = null
      try {
        const mpErrorText = await mpResponse.text()
        if (isDev) console.log("[ERP MP Error]:", mpErrorText)
        try { mpErrorData = JSON.parse(mpErrorText) } catch { }
      } catch { }

      SecureLogger.error("MP API ERP payment failed", { status: mpResponse.status, errorData: mpErrorData })
      return NextResponse.json({ error: "Erro ao processar pagamento. Tente novamente." }, { status: 400 })
    }

    const mpPaymentResponse = await mpResponse.json()
    const mpPaymentId = mpPaymentResponse.id

    if (!mpPaymentId) {
      SecureLogger.error("MP returned no payment ID for ERP payment", { status: mpPaymentResponse.status })
      return NextResponse.json({ error: "Erro ao processar pagamento — ID não retornado." }, { status: 500 })
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
