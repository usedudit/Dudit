import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getCurrentUser } from "@/lib/auth/authorization"
import { SecureLogger } from "@/lib/secure-logger"
import { createHash } from "crypto"
import { revalidateProducts, revalidateMarketplace, revalidateCart } from "@/lib/utils/revalidation"
import { withCSRFProtection } from "@/lib/security/csrf-middleware"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"
import { reserveOrderInventory } from "@/lib/stock/reservations"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import { validateCoupon } from "@/lib/services/coupons"

const isDev = process.env.NODE_ENV === "development"

interface ProcessPaymentRequest {
  paymentFormData: any
  items: Array<{ id: string; name: string; price: number; quantity: number; variant_id?: string }>
  partnerId: string
  buyerId: string
  deliveryType: string
  deliveryAddress?: string
  notes?: string
  cartItemIds?: string[]
  couponCode?: string | null
  deliveryFee?: number
}

/**
 * Gera uma chave de idempotência determinística baseada nos itens, comprador e parceiro.
 * Garante que requisições duplicadas (double-click) não criem pagamentos duplicados.
 */
function generateIdempotencyKey(buyerId: string, partnerId: string, items: Array<{ id: string; quantity: number }>): string {
  const itemsHash = items
    .map(i => `${i.id}:${i.quantity}`)
    .sort()
    .join("|")
  // Janela temporal de 30 segundos para permitir compras legítimas repetidas
  const timeWindow = Math.floor(Date.now() / 30000)
  const payload = `${buyerId}_${partnerId}_${itemsHash}_${timeWindow}`
  return createHash("sha256").update(payload).digest("hex").substring(0, 48)
}

async function handler(request: NextRequest) {
  try {
    // SECURITY FIX: Rate limiting on payment processing
    const rateLimitResult = await checkRateLimitForAPI(RateLimitCategory.PAYMENT)
    if (rateLimitResult.limited) {
      return NextResponse.json(rateLimitResult.body, { status: rateLimitResult.status })
    }

    const body: ProcessPaymentRequest = await request.json()
    const { paymentFormData, items, partnerId, buyerId, deliveryType, deliveryAddress, notes, cartItemIds, couponCode } = body

    // SEGURANÃ‡A: Validação de campos obrigatórios ANTES de qualquer operação
    if (!paymentFormData?.payment_method_id) {
      return NextResponse.json({ error: "Método de pagamento não informado" }, { status: 400 })
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Nenhum item informado" }, { status: 400 })
    }

    if (!partnerId || !buyerId) {
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 })
    }

    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const supabase = await getSupabaseServerClient()

    // SEGURANÃ‡A: Verificar que o buyerId corresponde ao usuário logado
    if (buyerId !== user.id) {
      SecureLogger.warn("Buyer ID mismatch attempt", { buyerId, userId: user.id })
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    // SEGURANÃ‡A: Validar parceiro e token MP (usa admin client para bypass RLS â€” dados sensíveis)
    const adminClient = createAdminClient()
    const { data: partner, error: partnerError } = await adminClient
      .from("partners")
      .select("id, store_name")
      .eq("id", partnerId)
      .single()

    if (partnerError || !partner) {
      SecureLogger.error("Partner not found", { partnerId })
      return NextResponse.json({ error: "Vendedor não encontrado" }, { status: 400 })
    }

    let mpAccessToken: string
    try {
      mpAccessToken = await getValidMercadoPagoAccessToken(partnerId)
    } catch (err: any) {
      SecureLogger.warn("Failed to obtain valid MP token for partner", { partnerId, error: err.message })
      return NextResponse.json({
        error: "Sessão do Mercado Pago inválida ou expirada. O vendedor precisa reconectar."
      }, { status: 400 })
    }

    // SEGURANÃ‡A: Validar e recalcular preços (NUNCA confiar no frontend)
    let totalAmount = 0
    const validatedItems = []

    if (isDev) console.log("[v0] Starting item validation for", items.length, "items")

    for (const item of items) {
      if (isDev) console.log("[v0] Validating item:", item)

      // Validar formato do ID
      if (!item.id || typeof item.id !== "string") {
        return NextResponse.json({ error: "ID de produto inválido" }, { status: 400 })
      }

      // Validar quantidade
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 9999) {
        return NextResponse.json({ error: `Quantidade inválida para ${item.name || item.id}` }, { status: 400 })
      }

      // Primeiro tentar buscar como variante se houver ID de variante
      let resolvedProductId = item.id
      let resolvedPrice: number
      let resolvedStock: number
      let resolvedPartnerId: string
      let resolvedVariantId: string | null = null

      if (item.variant_id) {
        if (isDev) console.log("[v0] Validating variant with ID:", item.variant_id)
        const { data: variant } = await adminClient
          .from("product_variants")
          .select("id, price_adjustment, stock_available, product_id, products!inner(partner_id, price, promotional_price)")
          .eq("id", item.variant_id)
          .single()

        if (!variant) {
          if (isDev) console.error("[v0] ERROR: Variant not found:", item.variant_id)
          return NextResponse.json({ error: `Variante ${item.variant_id} não encontrada` }, { status: 400 })
        }

        const parentProduct = variant.products as any
        resolvedPrice = variant.price_adjustment
          ? Number(variant.price_adjustment)
          : Number(parentProduct.price)
        resolvedStock = variant.stock_available ?? 0
        resolvedPartnerId = parentProduct.partner_id
        resolvedProductId = variant.product_id // Use product_id from variant
        resolvedVariantId = variant.id
      } else {
        // Se não houver variant_id, buscar como produto padrão
        const { data: product } = await adminClient
          .from("products")
          .select("id, price, promotional_price, stock_available, partner_id")
          .eq("id", item.id)
          .single()

        if (product) {
          // Produto encontrado â€” usar preço promocional se disponível
          const basePrice = Number(product.price)
          const promoPrice = product.promotional_price ? Number(product.promotional_price) : 0
          resolvedPrice = (promoPrice > 0 && promoPrice < basePrice) ? promoPrice : basePrice
          resolvedStock = product.stock_available
          resolvedPartnerId = product.partner_id
          resolvedProductId = product.id
        } else {
          // Nenhum dos dois funcionou
          SecureLogger.warn("Product not found during payment", { productId: item.id })
          return NextResponse.json({ error: `Produto ${item.id} não encontrado` }, { status: 400 })
        }
      }

      // SEGURANÃ‡A (FIX CRIT-04): Verificar que o produto pertence ao parceiro
      // Prevents payment redirection attack by ensuring all items belong to the stated partner
      if (resolvedPartnerId !== partnerId) {
        SecureLogger.error("Product partner mismatch â€” possible payment redirection attack", { productId: item.id, expectedPartner: partnerId, actualPartner: resolvedPartnerId })
        return NextResponse.json({ error: "Produto não pertence a este vendedor" }, { status: 400 })
      }

      // SEGURANÃ‡A: Verificar estoque
      if (resolvedStock < item.quantity) {
        SecureLogger.warn("Insufficient stock", { productId: item.id, available: resolvedStock, requested: item.quantity })
        return NextResponse.json({ error: `Estoque insuficiente para ${item.name}` }, { status: 400 })
      }

      const itemTotal = resolvedPrice * item.quantity
      totalAmount += itemTotal

      validatedItems.push({
        product_id: resolvedProductId,
        variant_id: resolvedVariantId,
        product_name: item.name,
        product_price: resolvedPrice,
        quantity: item.quantity,
      })

      if (isDev) console.log("[v0] Item validated:", { product_id: resolvedProductId, price: resolvedPrice, quantity: item.quantity })
    }

    if (isDev) console.log("[v0] All items validated. Total amount:", totalAmount)

    // SEGURANÃ‡A: Validar cupom se fornecido
    let couponIdToSave: string | null = null
    let couponDiscountAmount = 0

    if (couponCode) {
      const couponResult = await validateCoupon({
        partnerId,
        code: couponCode,
        customerId: buyerId,
        subtotal: totalAmount,
        items: validatedItems.map(i => ({ productId: i.product_id }))
      })

      if (couponResult.valid) {
        couponIdToSave = couponResult.couponId || null
        couponDiscountAmount = couponResult.discountAmount
        totalAmount = Math.max(0, totalAmount - couponDiscountAmount)
        if (isDev) console.log("[v0] Coupon applied:", couponCode, "Discount:", couponDiscountAmount, "New total:", totalAmount)
      }
    }

    // DELIVERY FEE
    const deliveryFee = Number(body.deliveryFee || 0)
    if (deliveryFee > 0) {
      totalAmount += deliveryFee
      if (isDev) console.log("[v0] Delivery fee applied:", deliveryFee, "New total:", totalAmount)
    }

    // SEGURANÃ‡A: Validar que o total é positivo e razoável
    if (totalAmount <= 0 || totalAmount > 999999) {
      SecureLogger.error("Invalid total amount calculated", { totalAmount })
      return NextResponse.json({ error: "Valor total inválido" }, { status: 400 })
    }

    // Buscar dados do usuário para pegar o nome completo
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("full_name")
      .eq("user_id", buyerId)
      .single()

    const customerName = userProfile?.full_name || "Cliente"
    const customerNameParts = customerName.split(" ")
    const payerFirstName = customerNameParts[0] || "Cliente"
    const payerLastName = customerNameParts.slice(1).join(" ") || "Comprador"

    // SEGURANÃ‡A: Montar requisição para API do MP usando totalAmount do SERVIDOR
    const mpPaymentRequest: Record<string, any> = {
      transaction_amount: totalAmount, // âœ… Valor calculado pelo servidor, não do frontend
      payment_method_id: paymentFormData.payment_method_id,
      payer: {
        email: paymentFormData.payer?.email || user.email,
        first_name: payerFirstName,
        last_name: payerLastName,
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
      description: `Pedido de ${customerName}`,
    }

    // Adicionar token se for cartão de crédito
    if (paymentFormData.token) {
      mpPaymentRequest.token = paymentFormData.token
    }
    if (paymentFormData.installments) {
      mpPaymentRequest.installments = paymentFormData.installments
    }
    if (paymentFormData.issuer_id) {
      mpPaymentRequest.issuer_id = paymentFormData.issuer_id
    }

    // BACEN: Para boleto registrado, endereço do pagador é obrigatório em additional_info
    // federal_unit deve ser a SIGLA do estado (ex: "SP"), não o nome completo
    if (paymentFormData.payment_method_id === "bolbradesco") {
      const stateNameToAbbr: Record<string, string> = {
        "acre": "AC", "alagoas": "AL", "amapá": "AP", "amazonas": "AM",
        "bahia": "BA", "ceará": "CE", "distrito federal": "DF", "espírito santo": "ES",
        "goiás": "GO", "maranhão": "MA", "mato grosso": "MT", "mato grosso do sul": "MS",
        "minas gerais": "MG", "pará": "PA", "paraíba": "PB", "paraná": "PR",
        "pernambuco": "PE", "piauí": "PI", "rio de janeiro": "RJ",
        "rio grande do norte": "RN", "rio grande do sul": "RS", "rondônia": "RO",
        "roraima": "RR", "santa catarina": "SC", "são paulo": "SP",
        "sergipe": "SE", "tocantins": "TO",
      }

      const rawFederalUnit = mpPaymentRequest.payer?.address?.federal_unit || ""
      // Se já for sigla (2 letras), usar diretamente; caso contrário, converter
      const federalUnitAbbr = rawFederalUnit.length === 2
        ? rawFederalUnit.toUpperCase()
        : (stateNameToAbbr[rawFederalUnit.toLowerCase()] || rawFederalUnit)

      // Corrigir a sigla no payer.address também
      if (mpPaymentRequest.payer?.address) {
        mpPaymentRequest.payer.address.federal_unit = federalUnitAbbr
      }

      // additional_info.payer.address é OBRIGATÓRIO para boleto desde BACEN Set/2024
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

    console.log("[MP PAYMENT REQUEST PAYLOAD]:", JSON.stringify(mpPaymentRequest, null, 2))

    // SEGURANÃ‡A: Idempotency key determinística (protege contra double-click)
    const idempotencyKey = generateIdempotencyKey(buyerId, partnerId, validatedItems.map(i => ({ id: i.product_id, quantity: i.quantity })))

    // Fazer requisição Ã  API do Mercado Pago
    const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(mpPaymentRequest),
    })

    if (isDev) console.log("[v0] MP Response status:", mpResponse.status)

    if (!mpResponse.ok) {
      let mpErrorData: any = null
      let mpErrorText = ""

      try {
        mpErrorText = await mpResponse.text()
        if (isDev) console.log("[v0] MP Error response (raw text):", mpErrorText)

        try {
          mpErrorData = JSON.parse(mpErrorText)
          if (isDev) console.log("[v0] MP Error response (parsed JSON):", JSON.stringify(mpErrorData, null, 2))
        } catch (parseErr) {
          if (isDev) console.log("[v0] Could not parse error response as JSON")
        }
      } catch (readErr) {
        SecureLogger.error("Failed to read MP error response", {})
      }

      console.error("[CRITICAL MP PAYMENT ERROR]", {
        status: mpResponse.status,
        errorData: JSON.stringify(mpErrorData, null, 2),
        errorText: mpErrorText
      })

      // SEGURANÃ‡A: Logar detalhes internamente, retornar mensagem genérica ao frontend
      SecureLogger.error("MP API payment creation failed", {
        status: mpResponse.status,
        errorData: mpErrorData,
        errorText: mpErrorText.substring(0, 500)
      })
      return NextResponse.json({
        error: "Erro ao processar pagamento. Tente novamente."
      }, { status: 400 })
    }

    const mpPaymentResponse = await mpResponse.json()

    // Extrair o ID do pagamento da resposta da API
    const mpPaymentId = mpPaymentResponse.id

    // GUARD: Se MP não retornou ID, tratar como erro (não criar order órfã)
    if (!mpPaymentId) {
      SecureLogger.error("MP returned no payment ID", { status: mpPaymentResponse.status })
      return NextResponse.json({
        error: "Erro ao processar pagamento â€” ID não retornado. Tente novamente."
      }, { status: 500 })
    }

    // Se for PIX, extrair os dados de QR code
    let pixData = null
    if (paymentFormData.payment_method_id === "pix" && mpPaymentResponse.point_of_interaction?.transaction_data) {
      const transactionData = mpPaymentResponse.point_of_interaction.transaction_data
      pixData = {
        qrCode: transactionData.qr_code,
        qrCodeBase64: transactionData.qr_code_base64,
        ticketUrl: transactionData.ticket_url,
      }
    }

    // Se for Boleto, extrair dados do boleto
    let boletoData = null
    if (paymentFormData.payment_method_id === "bolbradesco") {
      const externalUrl = mpPaymentResponse.transaction_details?.external_resource_url || mpPaymentResponse.point_of_interaction?.transaction_data?.ticket_url;
      const barcode = mpPaymentResponse.barcode?.content || mpPaymentResponse.point_of_interaction?.transaction_data?.barcode;

      if (externalUrl || barcode) {
        boletoData = {
          ticketUrl: externalUrl,
          barcode: barcode,
        }
      }
    }

    // Atualizar status baseado na resposta
    let paymentStatus = mpPaymentResponse.status || "pending"

    // Determinar tipo de pagamento e status
    let paymentMethodDisplayName = "Desconhecido"

    if (paymentFormData.payment_method_id === "pix") {
      paymentMethodDisplayName = "Pix"
    } else if (paymentFormData.payment_method_id === "bolbradesco") {
      paymentMethodDisplayName = "Boleto"
    } else {
      paymentMethodDisplayName = "Crédito"
    }

    // CRIAR ORDER NO BANCO
    if (isDev) console.log("[v0] Creating order with data:", {
      partner_id: partnerId,
      buyer_id: buyerId,
      delivery_type: deliveryType,
      total_amount: totalAmount,
      payment_status: paymentStatus,
    })

    const { data: newOrder, error: orderError } = await adminClient
      .from("orders")
      .insert({
        partner_id: partnerId,
        buyer_id: buyerId,
        customer_name: customerName,
        delivery_type: deliveryType,
        delivery_address: deliveryAddress,
        notes: notes,
        total_amount: totalAmount,
        situation: paymentStatus === "approved" ? "paid" : (paymentStatus === "in_process" ? "in_process" : "pending"),
        payment_method: paymentMethodDisplayName,
        payment_provider: "Mercado Pago",
        mp_payment_id: mpPaymentId.toString(),
        coupon_id: couponIdToSave,
        discount_amount: couponDiscountAmount,
        delivery_fee: deliveryFee,
        shipping_cost: deliveryFee,
      })
      .select()
      .single()

    if (orderError || !newOrder) {
      SecureLogger.error("Failed to create order", { errorCode: orderError?.code, errorMessage: orderError?.message })
      return NextResponse.json({ error: "Erro ao criar pedido" }, { status: 500 })
    }

    if (isDev) console.log("[v0] Order created successfully:", newOrder.id)

    // INSERIR ORDER ITEMS - Preparar dados ANTES do log
    const itemsWithSubtotal = validatedItems.map(item => ({
      order_id: newOrder.id,
      product_id: item.product_id,
      variant_id: item.variant_id, // âœ… Adicionado
      product_name: item.product_name,
      product_price: item.product_price,
      quantity: item.quantity,
      subtotal: item.product_price * item.quantity,
    }))

    const { error: itemsError } = await adminClient.from("order_items").insert(itemsWithSubtotal)

    if (itemsError) {
      SecureLogger.error("Failed to insert order items", { orderId: newOrder.id, error: itemsError, errorCode: itemsError?.code, errorMessage: itemsError?.message })
      return NextResponse.json({ error: "Erro ao criar itens do pedido" }, { status: 500 })
    }

    const reserveResult = await reserveOrderInventory({
      client: adminClient,
      partnerId,
      orderId: newOrder.id,
      items: validatedItems.map((item) => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
      })),
    })

    if ("error" in reserveResult) {
      await adminClient.from("order_items").delete().eq("order_id", newOrder.id)
      await adminClient.from("orders").delete().eq("id", newOrder.id)
      return NextResponse.json({ error: reserveResult.error }, { status: 400 })
    }

    // NOTA: O decrement_stock agora é feito automaticamente pelo trigger no banco
    // quando o status da order mudar para 'paid' ou 'approved'
    // Isso evita duplicação com webhook/sync-payment-status

    // Criar transaction de receita se pagamento já aprovado
    if (paymentStatus === "approved") {
      try {
        const { createTransactionFromOrder } = await import("@/lib/services/transaction.service")
        await createTransactionFromOrder(adminClient, {
          order_number: newOrder.order_number || newOrder.id,
          partner_id: partnerId,
          total_amount: totalAmount,
          payment_method: paymentMethodDisplayName,
          payment_provider: "Mercado Pago",
          payment_date: new Date().toISOString(),
          payment_breakdown: [{ method: paymentMethodDisplayName, amount: totalAmount }],
          customer_contact_id: buyerId,
          customer_name: customerName,
        })

        // Increment partner's total sales count
        await adminClient.rpc('increment_partner_sales', { partner_uuid: partnerId })
      } catch (txErr: any) {
        console.error("[v0] Erro ao criar transaction ou incrementar vendas:", txErr.message)
      }
    }

    // 3. Revalidar cache dos produtos (para atualizar UI com estoque correto)
    const uniqueProductIds = [...new Set(validatedItems.map(i => i.product_id))]
    for (const pid of uniqueProductIds) {
      await invalidateProductCache(pid, partnerId, "update", { silent: true })
      revalidateProducts(partnerId, pid)
    }
    revalidateMarketplace()

    if (cartItemIds && cartItemIds.length > 0) {
      const { error: deleteError } = await adminClient.from("cart_items").delete().in("id", cartItemIds).eq("user_id", buyerId)

      if (deleteError) {
        SecureLogger.warn("Cart deletion failed but continuing", {})
      } else {
        if (isDev) console.log("[v0] Cart items removed successfully")
      }
    }

    // 3. Revalidar carrinho do usuário (SEMPRE, após possível deleção)
    await revalidateCart(buyerId)

    // Retornar sucesso (sem informações internas)
    const successResponse = {
      success: true,
      orderId: newOrder.id,
      paymentStatus: paymentStatus === "approved" ? "approved" : paymentStatus,
      paymentMethod: paymentFormData.payment_method_id,
      pixData: pixData,
      boletoData: boletoData,
      mpPaymentId: mpPaymentId,
    }

    return NextResponse.json(successResponse)
  } catch (error: any) {
    SecureLogger.error("Error in process-payment endpoint", {
      errorMessage: error?.message,
      errorCode: error?.code,
    })

    return NextResponse.json(
      { error: "Erro ao processar pagamento. Tente novamente." },
      { status: 500 }
    )
  }
}

// SECURITY FIX (CRIT-01): Wrap handler with CSRF protection
export const POST = withCSRFProtection(handler)
