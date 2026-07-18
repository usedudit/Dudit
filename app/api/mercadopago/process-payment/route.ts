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
import { calculateOrderPricing } from "@/lib/services/pricing-engine"
import {
  priceMarketplaceCartCheckout,
  mapOrderItemsForPaymentInsert,
} from "@/lib/services/marketplace-cart-checkout"
import { buildDepositCheckoutMeta } from "@/lib/services/marketplace-checkout-amounts"
import { patchDepositCheckoutOnPayment } from "@/lib/payments/order-financial-state"
import { resolveDeliverySettingsRow } from "@/app/actions/shared/delivery"

const isDev = process.env.NODE_ENV === "development"

interface ProcessPaymentRequest {
  paymentFormData: any
  items: Array<{ id: string; name: string; price: number; quantity: number; variant_id?: string }>
  partnerId: string
  buyerId: string
  storeId?: string
  deliveryType: string
  deliveryAddress?: string
  notes?: string
  cartItemIds?: string[]
  couponCode?: string | null
  deliveryFee?: number
  payDepositOnly?: boolean
  checkoutPricing?: {
    subtotal: number
    couponDiscount: number
    paymentMethodDiscount: number
    paymentMethodInterest: number
    paymentMethodFee: number
    deliveryFee: number
    finalTotal: number
  }
}

const roundMoney = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
const moneyOrZero = (value: unknown) => {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, roundMoney(n))
}

function normalizeCheckoutPricing(input?: ProcessPaymentRequest["checkoutPricing"] | null) {
  if (!input) return null
  const snapshot = {
    subtotal: moneyOrZero(input.subtotal),
    couponDiscount: moneyOrZero(input.couponDiscount),
    paymentMethodDiscount: moneyOrZero(input.paymentMethodDiscount),
    paymentMethodInterest: moneyOrZero(input.paymentMethodInterest),
    paymentMethodFee: moneyOrZero(input.paymentMethodFee),
    deliveryFee: moneyOrZero(input.deliveryFee),
    finalTotal: moneyOrZero(input.finalTotal),
  }
  const expected = roundMoney(
    snapshot.subtotal
    + snapshot.deliveryFee
    - snapshot.couponDiscount
    - snapshot.paymentMethodDiscount
    + snapshot.paymentMethodInterest
    + snapshot.paymentMethodFee,
  )
  if (Math.abs(expected - snapshot.finalTotal) > 0.01) return null
  return snapshot
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
    const { paymentFormData, items, partnerId, buyerId, deliveryType, deliveryAddress, notes, cartItemIds, couponCode, payDepositOnly, storeId } = body
    const checkoutPricing = normalizeCheckoutPricing(body.checkoutPricing)
    if (body.checkoutPricing && !checkoutPricing) {
      return NextResponse.json({ error: "Os valores do checkout nÃ£o conferem. Atualize a pÃ¡gina e tente novamente." }, { status: 400 })
    }
    const normalizedDeliveryType = (deliveryType === "delivery" ? "delivery" : "pickup") as "delivery" | "pickup"

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

    let mpAccessToken: string
    try {
      mpAccessToken = await getValidMercadoPagoAccessToken(partnerId)
    } catch (err: any) {
      SecureLogger.warn("Failed to obtain valid MP token for partner", { partnerId, error: err.message })
      return NextResponse.json({
        error: "Sessão do Mercado Pago inválida ou expirada. O vendedor precisa reconectar."
      }, { status: 400 })
    }

    // SEGURANÇA: Validar e recalcular preços (NUNCA confiar no frontend)
    let totalAmount = 0
    let deliveryFee = 0
    let couponIdToSave: string | null = null
    let couponDiscountAmount = 0
    let checkoutFulfillment: Record<string, unknown> | null = null
    let promotionsApplied: Array<Record<string, unknown>> = []
    let reserveItems: Array<{ product_id: string; variant_id: string | null; quantity: number }> = []
    let productIdsForCache: string[] = []
    let orderItemsForInsert: Record<string, unknown>[] = []
    let resolvedOrderDeliveryType = normalizedDeliveryType
    let resolvedOrderDeliveryAddress = deliveryAddress || null
    let paymentMethodDiscountAmount = 0
    let paymentMethodExtraAmount = 0
    const validatedItems: Array<{
      product_id: string
      variant_id: string | null
      product_name: string
      product_price: number
      quantity: number
    }> = []

    let depositCheckoutMeta: Record<string, unknown> | null = null
    let fullOrderTotal = 0
    let depositPercent = 50
    let cartPmtConfig: import("@/lib/services/pricing-engine").PricingInput["paymentMethod"] = null

    const useUnifiedCart = Boolean(cartItemIds && cartItemIds.length > 0)

    if (useUnifiedCart) {
      // Update pay_deposit_only in DB
      await adminClient
        .from("cart_items")
        .update({ pay_deposit_only: Boolean(payDepositOnly), updated_at: new Date().toISOString() })
        .in("id", cartItemIds!)
        .eq("user_id", buyerId)

      // Resolve local payment method config for the unified engine
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(paymentFormData?.payment_method_id || ""))
      let pmtConfig: import("@/lib/services/pricing-engine").PricingInput["paymentMethod"] = null
      if (isUuid) {
        const { data: pmtMethod } = await adminClient
          .from("payment_methods")
          .select("*, payment_method_installment_fees(installment_number, fee_percent)")
          .eq("id", paymentFormData.payment_method_id)
          .eq("partner_id", partnerId)
          .single()
        if (pmtMethod) {
          const fees = pmtMethod.payment_method_installment_fees || []
          pmtConfig = {
            discountPercent: Number(pmtMethod.discount_percent || 0),
            feePercent: Number(pmtMethod.fee_percent || pmtMethod.percentage_rate || 0),
            feeFixed: Number(pmtMethod.fee_fixed || pmtMethod.fixed_amount || 0),
            feeBearer: (pmtMethod.fee_bearer || "merchant") as "merchant" | "customer",
            maxInstallments: Number(pmtMethod.max_installments || 1),
            installmentNumber: Math.max(1, Number(paymentFormData?.installments || 1)),
            installmentFees: (fees || []).map((row: any) => ({
              installmentNumber: Number(row.installment_number || 1),
              feePercent: Number(row.fee_percent || 0),
            })),
          }
        }
      }

      const priced = await priceMarketplaceCartCheckout(adminClient, {
        userId: buyerId,
        cartItemIds: cartItemIds!,
        deliveryType: normalizedDeliveryType,
        deliveryAddress: deliveryAddress || "",
        couponCode,
        paymentMethod: pmtConfig,
      })

      if (!priced.success) {
        return NextResponse.json({ error: priced.error }, { status: 400 })
      }

      if (priced.data.partnerId !== partnerId) {
        SecureLogger.error("Cart partner mismatch in process-payment", { partnerId, cartPartner: priced.data.partnerId })
        return NextResponse.json({ error: "Itens não pertencem a este vendedor" }, { status: 400 })
      }

      cartPmtConfig = pmtConfig
      totalAmount = priced.data.totalAmount
      fullOrderTotal = priced.data.totalAmount
      deliveryFee = priced.data.deliveryFee
      couponIdToSave = priced.data.couponId
      couponDiscountAmount = priced.data.couponDiscountAmount
      paymentMethodDiscountAmount = priced.data.pricingResult.paymentMethodDiscountAmount
      paymentMethodExtraAmount = priced.data.pricingResult.paymentMethodInterestAmount + priced.data.pricingResult.paymentMethodFeeAmount
      checkoutFulfillment = priced.data.fulfillmentPayload as unknown as Record<string, unknown>
      resolvedOrderDeliveryType =
        priced.data.fulfillmentPayload.deliveryType === "delivery" ? "delivery" : "pickup"
      resolvedOrderDeliveryAddress = priced.data.fulfillmentPayload.deliveryAddress || deliveryAddress || null
      promotionsApplied = priced.data.promotionsAppliedSnapshot
      reserveItems = priced.data.reserveItems
      productIdsForCache = priced.data.productIds
      orderItemsForInsert = priced.data.orderItems

      if (Boolean(payDepositOnly)) {
        const { data: partnerDepositRow } = await adminClient
          .from("partners")
          .select("service_deposit_enabled, service_deposit_percentage")
          .eq("id", partnerId)
          .single()
        depositPercent = Number(partnerDepositRow?.service_deposit_percentage || 50)

        await adminClient
          .from("cart_items")
          .update({ pay_deposit_only: false, updated_at: new Date().toISOString() })
          .in("id", cartItemIds!)
          .eq("user_id", buyerId)
          .eq("item_type", "service_booking")

        const fullPriced = await priceMarketplaceCartCheckout(adminClient, {
          userId: buyerId,
          cartItemIds: cartItemIds!,
          deliveryType: normalizedDeliveryType,
          deliveryAddress: deliveryAddress || "",
          couponCode,
          paymentMethod: pmtConfig,
        })

        await adminClient
          .from("cart_items")
          .update({ pay_deposit_only: true, updated_at: new Date().toISOString() })
          .in("id", cartItemIds!)
          .eq("user_id", buyerId)
          .eq("item_type", "service_booking")

        if (fullPriced.success) {
          fullOrderTotal = fullPriced.data.totalAmount
          const serviceDepositAmount = (priced.data.resolvedLines || [])
            .filter((line) => line.payDepositOnly && line.depositAmount != null)
            .reduce((sum, line) => sum + Number(line.depositAmount || 0) * Number(line.quantity || 1), 0)

          depositCheckoutMeta = buildDepositCheckoutMeta({
            payDepositOnly: true,
            depositPercent,
            serviceDepositAmount,
            fullOrderTotal,
            initialChargeAmount: totalAmount,
            paymentProvider: "Mercado Pago",
          })

          if (checkoutFulfillment) {
            checkoutFulfillment = {
              ...checkoutFulfillment,
              depositCheckout: depositCheckoutMeta,
            }
          }
        }
      }

      for (const row of orderItemsForInsert) {
        if (!row.product_id) continue
        validatedItems.push({
          product_id: row.product_id as string,
          variant_id: (row.variant_id as string) || null,
          product_name: String(row.product_name || "Item"),
          product_price: Number(row.product_price || 0),
          quantity: Number(row.quantity || 0),
        })
      }
    } else if (isDev) console.log("Starting item validation for", items.length, "items")

    if (!useUnifiedCart) for (const item of items) {
      if (isDev) console.log("Validating item:", item)

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
        if (isDev) console.log("Validating variant with ID:", item.variant_id)
        const { data: variant } = await adminClient
          .from("product_variants")
          .select("id, price_adjustment, stock_available, product_id, products!inner(partner_id, price, promotional_price)")
          .eq("id", item.variant_id)
          .single()

        if (!variant) {
          if (isDev) console.error("ERROR: Variant not found:", item.variant_id)
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

      // Accumulated for coupon validation; final total comes from central engine
      totalAmount += resolvedPrice * item.quantity

      validatedItems.push({
        product_id: resolvedProductId,
        variant_id: resolvedVariantId,
        product_name: item.name,
        product_price: resolvedPrice,
        quantity: item.quantity,
      })

      if (isDev) console.log("Item validated:", { product_id: resolvedProductId, price: resolvedPrice, quantity: item.quantity })
    }

    if (isDev) console.log("All items validated. Total amount:", totalAmount)

    if (!useUnifiedCart) {
      deliveryFee = Number(body.deliveryFee || 0)

      // ── Build pricing items from validated items ──────────────────────────
      const pricingItems: import("@/lib/services/pricing-engine").PricingItem[] = validatedItems.map((v) => ({
        productId: v.product_id,
        unitPrice: v.product_price,
        quantity: v.quantity,
      }))

      // ── Coupon validation ─────────────────────────────────────────────────
      let couponPricingData: import("@/lib/services/pricing-engine").PricingCoupon | null = null
      if (couponCode) {
        const couponResult = await validateCoupon({
          partnerId,
          code: couponCode,
          customerId: buyerId,
          subtotal: totalAmount,
          shippingCost: deliveryFee,
          items: validatedItems.map(i => ({ productId: i.product_id })),
        }, adminClient)

        if (couponResult.valid) {
          couponIdToSave = couponResult.couponId || null
          couponPricingData = {
            id: couponResult.couponId || "",
            code: couponCode,
            discountType: "fixed",
            discountValue: couponResult.discountAmount,
            maxDiscountValue: null,
            freeShipping: false,
            allowCombination: true,
          }
        }
      }

      // ── Payment method config ─────────────────────────────────────────────
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(paymentFormData?.payment_method_id || ""))
      let pmtConfig: import("@/lib/services/pricing-engine").PricingInput["paymentMethod"] = null
      if (isUuid) {
        const { data: pmtMethod } = await adminClient
          .from("payment_methods")
          .select("*, payment_method_installment_fees(installment_number, fee_percent)")
          .eq("id", paymentFormData.payment_method_id)
          .eq("partner_id", partnerId)
          .single()
        if (pmtMethod) {
          const fees = pmtMethod.payment_method_installment_fees || []
          pmtConfig = {
            discountPercent: Number(pmtMethod.discount_percent || 0),
            feePercent: Number(pmtMethod.fee_percent || pmtMethod.percentage_rate || 0),
            feeFixed: Number(pmtMethod.fee_fixed || pmtMethod.fixed_amount || 0),
            feeBearer: (pmtMethod.fee_bearer || "merchant") as "merchant" | "customer",
            maxInstallments: Number(pmtMethod.max_installments || 1),
            installmentNumber: Math.max(1, Number(paymentFormData?.installments || 1)),
            installmentFees: (fees || []).map((row: any) => ({
              installmentNumber: Number(row.installment_number || 1),
              feePercent: Number(row.fee_percent || 0),
            })),
          }
        }
      }

      // ── Central pricing engine (única fonte de verdade) ────────────────────
      const pricingResult = calculateOrderPricing({
        items: pricingItems,
        shippingCost: deliveryFee,
        coupon: couponPricingData,
        paymentMethod: pmtConfig,
      })

      totalAmount = pricingResult.finalAmountWithPayment
      couponDiscountAmount = pricingResult.couponDiscountAmount
      paymentMethodDiscountAmount = pricingResult.paymentMethodDiscountAmount
      paymentMethodExtraAmount = pricingResult.paymentMethodInterestAmount + pricingResult.paymentMethodFeeAmount

      orderItemsForInsert = validatedItems.map((item) => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        product_name: item.product_name,
        product_price: item.product_price,
        quantity: item.quantity,
        subtotal: item.product_price * item.quantity,
      }))
      reserveItems = validatedItems.map((item) => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
      }))
      productIdsForCache = [...new Set(validatedItems.map((i) => i.product_id))]
    }

    // SEGURANÇA: Validar que o total do servidor coincide com o snapshot do frontend
    if (checkoutPricing) {
      if (Math.abs(totalAmount - checkoutPricing.finalTotal) > 0.01) {
        SecureLogger.error("Checkout pricing mismatch in process-payment", {
          serverTotal: totalAmount,
          clientFinalTotal: checkoutPricing.finalTotal,
        })
        return NextResponse.json({
          error: "Os valores do checkout não conferem. Atualize a página e tente novamente."
        }, { status: 400 })
      }
      // Usar deliveryFee e descontos do snapshot apenas para manter compatibilidade
      deliveryFee = checkoutPricing.deliveryFee
      couponDiscountAmount = checkoutPricing.couponDiscount
      paymentMethodDiscountAmount = checkoutPricing.paymentMethodDiscount
      paymentMethodExtraAmount = roundMoney(checkoutPricing.paymentMethodInterest + checkoutPricing.paymentMethodFee)
    }

    if (totalAmount <= 0 || totalAmount > 999999) {
      SecureLogger.error("Invalid total amount calculated", { totalAmount })
      return NextResponse.json({ error: "Valor total inválido" }, { status: 400 })
    }

    const chargeAmount = totalAmount
    if (!fullOrderTotal) fullOrderTotal = totalAmount

    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("full_name, phone")
      .eq("user_id", buyerId)
      .single()

    const customerName = userProfile?.full_name || "Cliente"
    const customerNameParts = customerName.split(" ")
    const payerFirstName = customerNameParts[0] || "Cliente"
    const payerLastName = customerNameParts.slice(1).join(" ") || "Comprador"

    // SEGURANÇA: Montar requisição para API do MP usando chargeAmount do SERVIDOR
    const mpPaymentRequest: Record<string, any> = {
      transaction_amount: chargeAmount,
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
      // Se já for sigla (2 letras), usar diretamente; caso contrário, converter
      const federalUnitAbbr = rawFederalUnit.length === 2
        ? rawFederalUnit.toUpperCase()
        : (stateNameToAbbr.get(rawFederalUnit.toLowerCase()) || rawFederalUnit)

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
    const idempotencyKey = useUnifiedCart
      ? generateIdempotencyKey(buyerId, partnerId, cartItemIds!.map((id) => ({ id, quantity: 1 })))
      : generateIdempotencyKey(buyerId, partnerId, validatedItems.map(i => ({ id: i.product_id, quantity: i.quantity })))

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

    if (isDev) console.log("MP Response status:", mpResponse.status)

    if (!mpResponse.ok) {
      let mpErrorData: any = null
      let mpErrorText = ""

      try {
        mpErrorText = await mpResponse.text()
        if (isDev) console.log("MP Error response (raw text):", mpErrorText)

        try {
          mpErrorData = JSON.parse(mpErrorText)
          if (isDev) console.log("MP Error response (parsed JSON):", JSON.stringify(mpErrorData, null, 2))
        } catch (parseErr) {
          if (isDev) console.log("Could not parse error response as JSON")
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
    } else if (mpPaymentResponse.payment_type_id === "debit_card") {
      paymentMethodDisplayName = "Cartão de Débito"
    } else if (mpPaymentResponse.payment_type_id === "account_money" || paymentFormData.payment_method_id === "account_money") {
      paymentMethodDisplayName = "Saldo Mercado Pago"
    } else if (mpPaymentResponse.payment_type_id === "digital_currency" || paymentFormData.payment_method_id === "mercado_credito") {
      paymentMethodDisplayName = "Mercado Crédito"
    } else {
      paymentMethodDisplayName = "Crédito"
    }

    // Ensure customer exists/is updated for this partner
    let payerCpf: string | null = null
    const idenType = String(paymentFormData.payer?.identification?.type || "").toUpperCase()
    if (idenType === "CPF") {
      payerCpf = paymentFormData.payer?.identification?.number || null
    }

    let resolvedCustomerId: string | null = null
    try {
      const { ensureMarketplaceCustomer } = await import("@/lib/services/marketplace-customer")
      resolvedCustomerId = await ensureMarketplaceCustomer({
        partnerId: partnerId,
        name: customerName,
        email: user.email,
        phone: userProfile?.phone || null,
        cpf: payerCpf,
        userId: buyerId,
      })
    } catch (e) {
      console.error("Error ensuring marketplace customer in process-payment route:", e)
    }

    // Compute payment_expires_at
    const { computePaymentExpiresAt } = await import("@/lib/services/order-expiration")
    const paymentExpiresAt = paymentStatus === "approved"
      ? null
      : computePaymentExpiresAt(paymentFormData.payment_method_id ?? paymentMethodDisplayName).toISOString()

    // CRIAR ORDER NO BANCO
    if (isDev) console.log("Creating order with data:", {
      partner_id: partnerId,
      buyer_id: buyerId,
      delivery_type: deliveryType,
      total_amount: totalAmount,
      payment_status: paymentStatus,
    })

    const { resolveSituationFromPaid } = await import("@/lib/payments/order-financial-state")
    const approvedPaidAmount = paymentStatus === "approved" ? chargeAmount : 0
    const orderSituation =
      paymentStatus === "approved"
        ? resolveSituationFromPaid(approvedPaidAmount, fullOrderTotal)
        : paymentStatus === "in_process"
          ? "in_process"
          : paymentStatus === "rejected"
            ? "cancelled"
            : "pending"

    // Fetch delivery_payer setting for snapshot (store-aware)
    const deliveryRow = await resolveDeliverySettingsRow(adminClient, partnerId, storeId)
    const deliveryPayer: "customer" | "seller" = deliveryRow?.delivery_payer === "seller" ? "seller" : "customer"
    if (storeId && deliveryRow?.store_id === storeId) {
      console.log(`[delivery_payer] MP payment using store override: store=${storeId}, partner=${partnerId}, payer=${deliveryPayer}`)
    }
    // For MP orders (customer-initiated), seller_commission_amount is 0
    const sellerCommissionAmount = 0

    if (checkoutFulfillment && approvedPaidAmount > 0) {
      checkoutFulfillment = patchDepositCheckoutOnPayment(
        checkoutFulfillment,
        approvedPaidAmount,
        fullOrderTotal,
      ) as Record<string, unknown>
    }

    const { data: newOrder, error: orderError } = await adminClient
      .from("orders")
      .insert({
        partner_id: partnerId,
        buyer_id: buyerId,
        customer_id: resolvedCustomerId,
        customer_name: customerName,
        delivery_type: resolvedOrderDeliveryType,
        delivery_address: resolvedOrderDeliveryAddress,
        notes: notes,
        total_amount: fullOrderTotal,
        situation: orderSituation,
        payment_method: paymentMethodDisplayName,
        payment_provider: "Mercado Pago",
        mp_payment_id: mpPaymentId.toString(),
        coupon_id: couponIdToSave,
        discount_amount: couponDiscountAmount,
        payment_method_discount_amount: paymentMethodDiscountAmount,
        payment_method_extra_amount: paymentMethodExtraAmount,
        delivery_fee: deliveryFee,
        delivery_payer: deliveryPayer,
        seller_commission_amount: sellerCommissionAmount,
        payment_breakdown: [{
          method: paymentMethodDisplayName,
          amount: chargeAmount,
          effectiveAmount: chargeAmount,
          amountReceived: paymentStatus === "approved" ? chargeAmount : 0,
          provider: "Mercado Pago",
          adjustmentType: "none",
          checkoutPricing: checkoutPricing || {
            subtotal: orderItemsForInsert.reduce((sum, item) => sum + Number(item.subtotal || 0), 0),
            couponDiscount: couponDiscountAmount,
            paymentMethodDiscount: paymentMethodDiscountAmount,
            paymentMethodInterest: 0,
            paymentMethodFee: paymentMethodExtraAmount,
            deliveryFee,
            finalTotal: fullOrderTotal,
          },
        }],
        checkout_fulfillment: checkoutFulfillment,
        order_source: "Vitrine Online",
        promotions_applied: promotionsApplied.length > 0 ? promotionsApplied : null,
        pricing_version: "2.0",
        amount_paid: approvedPaidAmount,
        paid_amount: approvedPaidAmount,
        paid_at: paymentStatus === "approved" ? new Date().toISOString() : null,
        payment_expires_at: paymentExpiresAt,
      })
      .select()
      .single()

    if (orderError || !newOrder) {
      SecureLogger.error("Failed to create order", { errorCode: orderError?.code, errorMessage: orderError?.message })
      return NextResponse.json({ error: "Erro ao criar pedido" }, { status: 500 })
    }

    if (couponIdToSave) {
      await adminClient.from("coupon_usages").upsert(
        {
          coupon_id: couponIdToSave,
          customer_id: buyerId,
          order_id: newOrder.id,
        },
        { onConflict: "coupon_id,order_id" }
      ).catch((err: any) => {
        SecureLogger.error("Failed to record coupon usage", { orderId: newOrder.id, error: err })
      })
    }

    if (isDev) console.log("Order created successfully:", newOrder.id)

    const itemsWithSubtotal = mapOrderItemsForPaymentInsert(newOrder.id, orderItemsForInsert)

    const { error: itemsError } = await adminClient.from("order_items").insert(itemsWithSubtotal)

    if (itemsError) {
      SecureLogger.error("Failed to insert order items", { orderId: newOrder.id, error: itemsError, errorCode: itemsError?.code, errorMessage: itemsError?.message })
      return NextResponse.json({ error: "Erro ao criar itens do pedido" }, { status: 500 })
    }

    const reserveResult = reserveItems.length > 0
      ? await reserveOrderInventory({
          client: adminClient,
          partnerId,
          orderId: newOrder.id,
          items: reserveItems,
        })
      : { success: true as const }

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
          total_amount: chargeAmount,
          payment_method: paymentMethodDisplayName,
          payment_provider: "Mercado Pago",
          payment_date: new Date().toISOString(),
          payment_breakdown: [{ method: paymentMethodDisplayName, amount: chargeAmount }],
          customer_id: resolvedCustomerId,
          customer_name: customerName,
        })

        const { fulfillMarketplaceOrder } = await import("@/lib/services/marketplace-checkout-fulfillment")
        await fulfillMarketplaceOrder(adminClient, newOrder.id)
      } catch (txErr: any) {
        console.error("Erro ao criar transaction ou incrementar vendas:", txErr.message)
      }
    }

    const uniqueProductIds = [...new Set(productIdsForCache)]
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
        if (isDev) console.log("Cart items removed successfully")
      }
    }

    // 3. Revalidar carrinho do usuário (SEMPRE, após possível deleção)
    await revalidateCart(buyerId)

    // Retornar sucesso (sem informações internas)
    const successResponse = {
      success: true,
      orderId: newOrder.id,
      orderNumber: newOrder.order_number,
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
