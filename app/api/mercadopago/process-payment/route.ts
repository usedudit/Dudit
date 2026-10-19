import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getCurrentUser } from "@/lib/auth/authorization"
import { SecureLogger } from "@/lib/secure-logger"
import { captureError } from "@/lib/monitoring/sentry"
import { createHash, randomUUID } from "crypto"
import { revalidateProducts, revalidateMarketplace, revalidateCart } from "@/lib/utils/revalidation"
import { withCSRFProtection } from "@/lib/security/csrf-middleware"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { checkLimit, increment_usage_counter } from "@/lib/services/subscription.service"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"
import {
  findMercadoPagoIntegration,
  mapToMpPartnerFields,
} from "@/lib/services/payments/mercadopago-integration"
import { createMercadoPagoPayment } from "@/lib/mercadopago/payment-client"
import { reserveOrderInventory } from "@/lib/stock/reservations"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import { validateCoupon } from "@/lib/services/coupons"
import { calculateOrderPricing } from "@/lib/services/pricing-engine"
import {
  priceMarketplaceCartCheckout,
  mapOrderItemsForPaymentInsert,
} from "@/lib/services/marketplace-cart-checkout"
import { resolveCheckoutCartLinesFresh } from "@/lib/cache/checkout-cache"
import { buildDepositCheckoutMeta } from "@/lib/services/marketplace-checkout-amounts"
import { patchDepositCheckoutOnPayment } from "@/lib/payments/order-financial-state"
import { quoteDeliveryFeeAction, resolveDeliverySettingsRow, calculateServiceTravelFeeForOrder } from "@/app/actions/shared/delivery"
import {
  quoteCarrierFreightFee,
  extractPostalCodeFromAddress,
} from "@/lib/services/shipping/carrier-checkout"

const isDev = process.env.NODE_ENV === "development"

interface ProcessPaymentRequest {
  paymentFormData: any
  items: Array<{ id: string; name: string; price: number; quantity: number; variant_id?: string; service_id?: string }>
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
    paymentMethodFixedFee?: number
    deliveryFee: number
    finalTotal: number
    carrierServiceId?: number | null
    destinationPostalCode?: string | null
    destinationCoords?: { lat: number; lng: number } | null
  }
  existingOrderId?: string
  deviceId?: string | null
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
    paymentMethodFixedFee: moneyOrZero(input.paymentMethodFixedFee),
    deliveryFee: moneyOrZero(input.deliveryFee),
    finalTotal: moneyOrZero(input.finalTotal),
  }
  const expected = roundMoney(
    snapshot.subtotal
    + snapshot.deliveryFee
    - snapshot.couponDiscount
    - snapshot.paymentMethodDiscount
    + snapshot.paymentMethodInterest
    + snapshot.paymentMethodFee
    + snapshot.paymentMethodFixedFee,
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
    const { paymentFormData, items, buyerId, deliveryType, deliveryAddress, notes, cartItemIds, couponCode, payDepositOnly, storeId, existingOrderId: rawExistingOrderId, deviceId } = body
    const existingOrderId = typeof rawExistingOrderId === "string" && !rawExistingOrderId.startsWith("temp-") ? rawExistingOrderId : undefined
    const claimedPartnerId = body.partnerId
    const checkoutPricing = normalizeCheckoutPricing(body.checkoutPricing)
    if (body.checkoutPricing && !checkoutPricing) {
      return NextResponse.json({ error: "Os valores do checkout nÃ£o conferem. Atualize a pÃ¡gina e tente novamente." }, { status: 400 })
    }
    const normalizedDeliveryType = (deliveryType === "delivery" ? "delivery" : "pickup") as "delivery" | "pickup"

    // SEGURANÃ‡A: Validação de campos obrigatórios ANTES de qualquer operação
    if (!paymentFormData?.payment_method_id) {
      return NextResponse.json({ error: "Método de pagamento não informado" }, { status: 400 })
    }

    if (payDepositOnly) {
      const depositMethodId = String(paymentFormData.payment_method_id || "").toLowerCase()
      if (depositMethodId === "bolbradesco" || depositMethodId === "boleto" || depositMethodId === "ticket") {
        return NextResponse.json({ error: "Boleto não está disponível para pagamento de sinal." }, { status: 400 })
      }
    }

    const useUnifiedCart = Boolean(!existingOrderId && cartItemIds && cartItemIds.length > 0)

    if (!existingOrderId && (!items || items.length === 0) && !useUnifiedCart) {
      return NextResponse.json({ error: "Nenhum item informado" }, { status: 400 })
    }

    if (!claimedPartnerId || !buyerId) {
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

    let existingOrder: any = null
    if (existingOrderId) {
      const { data: fetchedOrder, error: fetchError } = await adminClient
        .from("orders")
        .select("*, order_items(*)")
        .eq("id", existingOrderId)
        .single()

      if (fetchError || !fetchedOrder) {
        SecureLogger.error("Failed to fetch existing order", { orderId: existingOrderId, error: fetchError?.message })
        return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 })
      }

      if (fetchedOrder.buyer_id !== buyerId) {
        SecureLogger.warn("Order ID mismatch attempt", { orderId: existingOrderId, buyerId, userId: buyerId })
        return NextResponse.json({ error: "Acesso negado ao pedido" }, { status: 403 })
      }

      existingOrder = fetchedOrder
    }

    // The client partnerId is only a claim. Resolve the canonical partner
    // from owned cart/products before reading any Mercado Pago configuration.
    let canonicalPartnerId: string | undefined
    let resolvedCartLines: any[] | null = null
    if (existingOrder) {
      canonicalPartnerId = existingOrder.partner_id
    } else if (useUnifiedCart) {
      const resolved = await resolveCheckoutCartLinesFresh(adminClient, buyerId, cartItemIds!)
      if (!resolved.success) {
        return NextResponse.json({ error: resolved.error }, { status: 400 })
      }
      canonicalPartnerId = resolved.partnerId
      resolvedCartLines = (resolved as any).lines || null
    } else {
      const productIds = items.filter(item => !item.variant_id && !item.service_id).map(item => item.id).filter(Boolean)
      const serviceIds = items.map(item => item.service_id).filter(Boolean) as string[]
      const variantIds = items.map(item => item.variant_id || item.id).filter(Boolean) as string[]
      const [productsRes, variantsRes, servicesRes] = await Promise.all([
        adminClient.from("products").select("id, partner_id").in("id", productIds),
        variantIds.length > 0
          ? adminClient.from("product_variants").select("id, products!inner(partner_id)").in("id", variantIds)
          : Promise.resolve({ data: [], error: null }),
        serviceIds.length > 0
          ? adminClient.from("services").select("id, partner_id").in("id", serviceIds)
          : Promise.resolve({ data: [], error: null }),
      ])

      if (productsRes.error || variantsRes.error || servicesRes.error) {
        SecureLogger.error("Failed to resolve canonical checkout partner", {
          productError: productsRes.error?.message,
          variantError: variantsRes.error?.message,
          serviceError: servicesRes.error?.message,
        })
        return NextResponse.json({ error: "Não foi possível validar os itens do checkout" }, { status: 400 })
      }

      const productsMap = new Map<string, { partner_id: string }>(
        (productsRes.data || []).map((product: any) => [product.id, product]),
      )
      const variantsMap = new Map<string, any>(
        (variantsRes.data || []).map((variant: any) => [variant.id, variant]),
      )
      const servicesMap = new Map<string, any>(
        (servicesRes.data || []).map((service: any) => [service.id, service]),
      )
      const resolvedPartnerIds = items.map(item => {
        const variant = item.variant_id ? variantsMap.get(item.variant_id) : variantsMap.get(item.id)
        return (
          variant?.products?.partner_id ||
          productsMap.get(item.id)?.partner_id ||
          (item.service_id ? servicesMap.get(item.service_id)?.partner_id : undefined)
        )
      })

      const uniquePartners = new Set(resolvedPartnerIds.filter(Boolean))
      if (uniquePartners.size > 1) {
        return NextResponse.json({ error: "Itens de vendedores diferentes ou inválidos" }, { status: 400 })
      }
      if (uniquePartners.size === 1) {
        canonicalPartnerId = Array.from(uniquePartners)[0]
      } else if (claimedPartnerId) {
        canonicalPartnerId = claimedPartnerId
      } else {
        return NextResponse.json({ error: "Itens de vendedores diferentes ou inválidos" }, { status: 400 })
      }
    }

    if (!canonicalPartnerId) {
      return NextResponse.json({ error: "Vendedor não identificado" }, { status: 400 })
    }

    if (claimedPartnerId !== canonicalPartnerId) {
      SecureLogger.warn("Client partnerId mismatch in process-payment", {
        claimedPartnerId,
        canonicalPartnerId,
      })
      return NextResponse.json({ error: "Vendedor inválido para os itens informados" }, { status: 400 })
    }

    const partnerId = canonicalPartnerId

    // Este request cria o pedido (fluxo temp-/unified cart): aplica os mesmos
    // limites do checkout de carrinho ANTES de gerar a cobrança. Pedidos já
    // existentes foram contados no checkout original. Lojas em fluxo WhatsApp
    // seguem o mesmo bypass do checkoutCartAction (sem limite e sem contagem).
    let isWhatsappOrderFlow = false
    if (!existingOrderId) {
      const { isPartnerWhatsappFlow } = await import("@/lib/partner-order-flow")
      isWhatsappOrderFlow = await isPartnerWhatsappFlow(partnerId)

      if (!isWhatsappOrderFlow) {
        const ordersLimitCheck = await checkLimit(partnerId, "monthly_orders")
        if (!ordersLimitCheck.allowed) {
          return NextResponse.json(
            { error: ordersLimitCheck.message || "A loja atingiu o limite mensal de pedidos." },
            { status: 403 },
          )
        }
      }

      const hasBookingLines = (resolvedCartLines || []).some(
        (line: any) => line?.itemType === "service_booking",
      )
      if (hasBookingLines) {
        const bookingLimitCheck = await checkLimit(partnerId, "monthly_appointments")
        if (!bookingLimitCheck.allowed) {
          return NextResponse.json(
            { error: bookingLimitCheck.message || "A agenda atingiu o limite mensal de agendamentos." },
            { status: 403 },
          )
        }
      }
    }

    const { data: partner, error: partnerError } = await adminClient
      .from("partners")
      .select("id")
      .eq("id", partnerId)
      .single()

    if (partnerError || !partner) {
      SecureLogger.error("Partner not found", { partnerId })
      return NextResponse.json({ error: "Vendedor não encontrado" }, { status: 400 })
    }

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
    let deliveryBreakdown: Record<string, unknown> | null = null
    let deliveryDistanceKm: number | null = null
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

    if (existingOrder) {
      fullOrderTotal = Number(existingOrder.total_amount || 0)
      deliveryFee = Number(existingOrder.delivery_fee || 0)
      couponIdToSave = existingOrder.coupon_id || null
      couponDiscountAmount = Number(existingOrder.discount_amount || 0)
      paymentMethodDiscountAmount = Number(existingOrder.payment_method_discount_amount || 0)
      paymentMethodExtraAmount = Number(existingOrder.payment_method_extra_amount || 0)
      resolvedOrderDeliveryType = (existingOrder.delivery_type === "delivery" ? "delivery" : "pickup") as "delivery" | "pickup"
      resolvedOrderDeliveryAddress = existingOrder.delivery_address || deliveryAddress || null
      checkoutFulfillment = (existingOrder.checkout_fulfillment as Record<string, unknown>) || null
      productIdsForCache = (existingOrder.order_items || []).map((i: any) => i.product_id).filter(Boolean)

      const remainingToPay = Math.max(
        0,
        Number((fullOrderTotal - Number(existingOrder.store_credit_amount || 0) - Number(existingOrder.paid_amount || 0)).toFixed(2))
      )
      totalAmount = remainingToPay
    } else if (useUnifiedCart) {
      // Update pay_deposit_only and fulfillment_mode in DB for cart items
      await adminClient
        .from("cart_items")
        .update({
          pay_deposit_only: Boolean(payDepositOnly),
          updated_at: new Date().toISOString(),
        })
        .in("id", cartItemIds!)
        .eq("user_id", buyerId)

      await adminClient
        .from("cart_items")
        .update({
          fulfillment_mode: normalizedDeliveryType,
          updated_at: new Date().toISOString(),
        })
        .in("id", cartItemIds!)
        .eq("user_id", buyerId)
        .or("item_type.eq.product,item_type.is.null,product_id.not.is.null")

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
            installmentFeeBearer: (pmtMethod.installment_fee_bearer || "merchant") as "merchant" | "customer",
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
        carrierServiceId: body.checkoutPricing?.carrierServiceId,
        destinationPostalCode: body.checkoutPricing?.destinationPostalCode,
        destinationCoords: body.checkoutPricing?.destinationCoords || null,
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
      deliveryBreakdown = priced.data.deliveryBreakdown ?? null
      deliveryDistanceKm = priced.data.distanceKm ?? null
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
          carrierServiceId: body.checkoutPricing?.carrierServiceId,
          destinationPostalCode: body.checkoutPricing?.destinationPostalCode,
          destinationCoords: body.checkoutPricing?.destinationCoords || null,
        })

        await adminClient
          .from("cart_items")
          .update({ pay_deposit_only: true, updated_at: new Date().toISOString() })
          .in("id", cartItemIds!)
          .eq("user_id", buyerId)
          .eq("item_type", "service_booking")

        if (fullPriced.success) {
          fullOrderTotal = fullPriced.data.totalAmount

          const serviceFullTotal = (priced.data.resolvedLines || [])
            .filter((line) => line.itemType === "service_booking")
            .reduce((sum, line) => sum + Number(line.fullPrice || line.unitPrice || 0) * Number(line.quantity || 1), 0)

          const serviceDepositDelta = serviceFullTotal > 0
            ? Math.round(serviceFullTotal * (1 - depositPercent / 100) * 100) / 100
            : 0

          const serviceDepositAmount = Math.max(0, serviceFullTotal - serviceDepositDelta)

          // Only subtract the delta if the resolver actually adjusted unitPrice.
          // When depositAmount is null (services with payment_requirement "full_payment"),
          // totalAmount is already the full order total - no subtraction needed.
          const resolverAdjustedPrices = (priced.data.resolvedLines || []).some(
            (line) => line.itemType === "service_booking" && line.depositAmount != null,
          )
          if (resolverAdjustedPrices) {
            // totalAmount from first pricing run is already the deposit-adjusted total
          } else {
            // totalAmount is the full total - subtract delta to get the deposit charge
            totalAmount = Math.max(0, Number((totalAmount - serviceDepositDelta).toFixed(2)))
          }

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

    if (!existingOrder && !useUnifiedCart) for (const item of items) {
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

      let allowSellWithoutStock = false

      if (item.variant_id) {
        if (isDev) console.log("Validating variant with ID:", item.variant_id)
        const { data: variant } = await adminClient
          .from("product_variants")
          .select("id, price_adjustment, stock_available, product_id, products!inner(partner_id, price, promotional_price, allow_sell_without_stock)")
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
        allowSellWithoutStock = Boolean(parentProduct?.allow_sell_without_stock)
      } else {
        // Se não houver variant_id, buscar como produto padrão
        const { data: product } = await adminClient
          .from("products")
          .select("id, price, promotional_price, stock_available, partner_id, allow_sell_without_stock")
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
          allowSellWithoutStock = Boolean(product?.allow_sell_without_stock)
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
      if (!allowSellWithoutStock && resolvedStock < item.quantity) {
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

    if (!existingOrder && !useUnifiedCart) {
      const productIds = items.filter(item => !item.variant_id && !item.service_id).map(item => item.id).filter(Boolean)
      const serviceIds = items.map(item => item.service_id).filter(Boolean) as string[]
      const variantIds = items.map(item => item.variant_id || item.id).filter(Boolean) as string[]
      const hasProducts = productIds.length > 0 || variantIds.length > 0
      const hasOnlyServices = serviceIds.length > 0 && !hasProducts

      const shouldQuoteDelivery = !hasOnlyServices && hasProducts && normalizedDeliveryType === "delivery"
      if (shouldQuoteDelivery) {
        if (!deliveryAddress?.trim()) {
          return NextResponse.json({ error: "Endereço de entrega não informado" }, { status: 400 })
        }
        const deliveryQuote = await quoteDeliveryFeeAction({
          partnerId,
          storeId: storeId || null,
          destinationAddress: deliveryAddress,
          orderSubtotal: totalAmount,
        })
        if (!deliveryQuote.success) {
          // Own delivery has no coverage → fallback to carrier freight (SuperFrete)
          const carrierServiceId = Number(body.checkoutPricing?.carrierServiceId || 0)
          if (!carrierServiceId) {
            return NextResponse.json({ error: deliveryQuote.error }, { status: 400 })
          }
          const cep =
            String(body.checkoutPricing?.destinationPostalCode || "").replace(/\D/g, "") ||
            extractPostalCodeFromAddress(deliveryAddress)
          const carrier = await quoteCarrierFreightFee(adminClient, {
            partnerId,
            toPostalCode: cep,
            serviceId: carrierServiceId,
          })
          if (!carrier.success) {
            return NextResponse.json({ error: carrier.error }, { status: 400 })
          }
          deliveryFee = carrier.fee
          deliveryBreakdown = carrier.breakdown
          deliveryDistanceKm = null
        } else {
          deliveryFee = Number(deliveryQuote.fee || 0)
          deliveryBreakdown = (deliveryQuote.breakdown as Record<string, unknown>) ?? null
          deliveryDistanceKm = deliveryQuote.distanceKm != null ? Number(deliveryQuote.distanceKm) : null
        }
      } else {
        deliveryFee = 0
      }

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
            installmentFeeBearer: (pmtMethod.installment_fee_bearer || "merchant") as "merchant" | "customer",
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
      const tolerance = 0.05
      const matches =
        Math.abs(totalAmount - checkoutPricing.finalTotal) <= tolerance ||
        (existingOrder && Math.abs(fullOrderTotal - checkoutPricing.finalTotal) <= tolerance)

      if (!matches) {
        SecureLogger.error("Checkout pricing mismatch in process-payment", {
          serverTotal: totalAmount,
          serverFullTotal: fullOrderTotal,
          clientFinalTotal: checkoutPricing.finalTotal,
        })
        return NextResponse.json({
          error: "Os valores do checkout não conferem. Atualize a página e tente novamente."
        }, { status: 400 })
      }
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

    const customerName = userProfile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || (user.email ? user.email.split("@")[0] : null) || user.email || "Cliente"
    const customerNameParts = customerName.split(" ")
    const payerFirstName = customerNameParts[0] || "Cliente"
    const payerLastName = customerNameParts.slice(1).join(" ") || "Comprador"

    const targetOrderId = existingOrderId || randomUUID()

    // Telefone seguro do pagador (DDD 2 dígitos + número)
    const rawPhone = String(userProfile?.phone || "").replace(/\D/g, "")
    const cleanPhone = rawPhone.startsWith("55") && rawPhone.length > 11 ? rawPhone.slice(2) : rawPhone
    const payerPhone = cleanPhone.length >= 10 ? {
      area_code: cleanPhone.slice(0, 2),
      number: cleanPhone.slice(2),
    } : undefined

    // Endereço estruturado do pagador
    const rawPayerAddr = paymentFormData.payer?.address
    const payerZipCode = String(rawPayerAddr?.zipCode || rawPayerAddr?.zip_code || "").replace(/\D/g, "")
    const payerStreetName = String(rawPayerAddr?.streetName || rawPayerAddr?.street_name || "").trim()
    const payerStreetNumber = String(rawPayerAddr?.streetNumber || rawPayerAddr?.street_number || "").trim()
    const payerNeighborhood = String(rawPayerAddr?.neighborhood || "").trim()
    const payerCity = String(rawPayerAddr?.city || "").trim()
    const payerFederalUnit = String(rawPayerAddr?.federalUnit || rawPayerAddr?.federal_unit || "").trim()

    // Itens formatados para o motor antifraude do Mercado Pago (+12 pontos)
    const orderItemsList = (existingOrder?.order_items && existingOrder.order_items.length > 0)
      ? existingOrder.order_items
      : (validatedItems.length > 0 ? validatedItems : (items || []))

    const additionalItems = orderItemsList.map((item: any) => {
      const rawName = String(item.product_name || item.name || "Item").trim()
      const rawDesc = String(item.description || item.product_description || "").trim()
      // Mercado Pago exige items.description descritivo para antifraude e aprovação
      const description = rawDesc.length >= 3 ? rawDesc : (rawName.length >= 3 ? `Produto: ${rawName}` : "Produto adquirido na Dudit")

      return {
        id: String(item.product_id || item.service_id || item.id || "item").slice(0, 64),
        title: rawName.slice(0, 256),
        description: description.slice(0, 256),
        category_id: String(item.category_id || "others").slice(0, 64),
        quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
        unit_price: roundMoney(Number(item.product_price || item.unit_price || item.price) || 0),
      }
    })

    // Garantir que additional_info.items NUNCA seja enviado vazio (exigência de certificação MP)
    const finalAdditionalItems = additionalItems.length > 0
      ? additionalItems
      : [{
        id: String(targetOrderId).slice(0, 32),
        title: `Pedido ${existingOrder?.order_number ? '#' + existingOrder.order_number : 'Dudit'}`.slice(0, 256),
        description: `Compra realizada na Dudit - ${customerName}`.slice(0, 256),
        category_id: "others",
        quantity: 1,
        unit_price: chargeAmount,
      }]

    // Dados do pagador no additional_info
    const additionalPayer: Record<string, any> = {
      first_name: payerFirstName,
      last_name: payerLastName,
      registration_date: user.created_at || new Date().toISOString(),
      ...(payerPhone ? { phone: payerPhone } : {}),
      ...(payerStreetName ? {
        address: {
          zip_code: payerZipCode || undefined,
          street_name: payerStreetName,
          street_number: payerStreetNumber ? (Number(payerStreetNumber.replace(/\D/g, "")) || payerStreetNumber) : undefined,
        },
      } : {}),
    }

    // Dados de envio (shipments) se entrega ativa (+5 a +7 pontos)
    const shipmentReceiver = (normalizedDeliveryType === "delivery" && payerStreetName) ? {
      receiver_address: {
        zip_code: payerZipCode || undefined,
        street_name: payerStreetName,
        street_number: payerStreetNumber ? (Number(payerStreetNumber.replace(/\D/g, "")) || payerStreetNumber) : undefined,
        city_name: payerCity || undefined,
        state_name: payerFederalUnit || undefined,
      },
    } : undefined

    // SEGURANÇA: Montar requisição para API do MP usando chargeAmount do SERVIDOR
    const mpPaymentRequest: Record<string, any> = {
      transaction_amount: chargeAmount,
      payment_method_id: paymentFormData.payment_method_id,
      notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/mercadopago/webhook`,
      external_reference: targetOrderId,
      statement_descriptor: "DUDIT",
      description: `Pedido de ${customerName}`.slice(0, 250),
      payer: {
        email: paymentFormData.payer?.email || user.email,
        first_name: payerFirstName,
        last_name: payerLastName,
        ...(payerPhone ? { phone: payerPhone } : {}),
        identification: {
          type: paymentFormData.payer?.identification?.type || "CPF",
          number: paymentFormData.payer?.identification?.number,
        },
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
        items: finalAdditionalItems,
        payer: additionalPayer,
        ...(shipmentReceiver ? { shipments: shipmentReceiver } : {}),
      },
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
      mpPaymentRequest.additional_info.payer = {
        ...(mpPaymentRequest.additional_info.payer || {}),
        first_name: mpPaymentRequest.payer.first_name,
        last_name: mpPaymentRequest.payer.last_name,
        address: {
          zip_code: mpPaymentRequest.payer?.address?.zip_code || "",
          street_name: mpPaymentRequest.payer?.address?.street_name || "",
          street_number: mpPaymentRequest.payer?.address?.street_number || "",
        },
      }
    }

    SecureLogger.info("MP payment request prepared", {
      paymentMethodId: paymentFormData?.payment_method_id,
      buyerId,
      partnerId,
      hasPaymentToken: Boolean(paymentFormData?.token),
    })

    // SEGURANÇA: Idempotency key determinística (protege contra double-click)
    // Para retries de ordem já existente (payment_failed/cancelled), inclui timestamp
    // de alta precisão para evitar cache do MP retornando a recusa original.
    const isRetry = existingOrder && ["payment_failed", "cancelled"].includes(existingOrder.situation)
    const idempotencyKey = existingOrderId
      ? createHash("sha256").update(`${buyerId}_${existingOrderId}_${paymentFormData.payment_method_id}_${isRetry ? Date.now() : Math.floor(Date.now() / 30000)}`).digest("hex").substring(0, 48)
      : useUnifiedCart
        ? generateIdempotencyKey(buyerId, partnerId, cartItemIds!.map((id) => ({ id, quantity: 1 })))
        : generateIdempotencyKey(buyerId, partnerId, validatedItems.map(i => ({ id: i.product_id, quantity: i.quantity })))

    // Processar requisição via SDK Oficial do Mercado Pago (+5 pontos Backend SDK, +2 pontos Device ID)
    const paymentResult = await createMercadoPagoPayment({
      accessToken: mpAccessToken,
      paymentPayload: mpPaymentRequest,
      idempotencyKey,
      deviceId,
    })

    if (isDev) console.log("MP SDK Response status:", paymentResult.status)

    if (!paymentResult.success || !paymentResult.data) {
      SecureLogger.error("MP SDK payment creation failed in process-payment", {
        status: paymentResult.status,
        errorCode: paymentResult.errorCode,
        errorMessage: paymentResult.errorMessage?.slice(0, 160),
      })
      return NextResponse.json({
        error: "Erro ao processar pagamento. Tente novamente."
      }, { status: paymentResult.status >= 500 ? 500 : 400 })
    }

    const mpPaymentResponse = paymentResult.data

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
            ? "payment_failed"
            : "pending"

    // Fetch delivery_payer setting for snapshot (store-aware)
    const rawMpStoreId = (orderItemsForInsert || []).find((l: any) => l.store_id)?.store_id
    const targetMpStoreId = typeof rawMpStoreId === "string" ? rawMpStoreId : null

    let effectiveStoreId =
      storeId ||
      existingOrder?.store_id ||
      targetMpStoreId ||
      null

    if (!effectiveStoreId) {
      const { data: defaultStore } = await adminClient
        .from("stores")
        .select("id")
        .eq("partner_id", partnerId)
        .order("is_headquarters", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
      if (defaultStore?.id) {
        effectiveStoreId = defaultStore.id
      }
    }

    const deliveryRow = await resolveDeliverySettingsRow(adminClient, partnerId, effectiveStoreId || targetMpStoreId)
    const effectiveDeliveryPayer: "customer" | "seller" = deliveryRow?.delivery_payer === "seller" ? "seller" : "customer"
    if ((effectiveStoreId || targetMpStoreId) && deliveryRow?.store_id === (effectiveStoreId || targetMpStoreId)) {
      console.log(`[delivery_payer] MP payment using store override: store=${effectiveStoreId || targetMpStoreId}, partner=${partnerId}, payer=${effectiveDeliveryPayer}`)
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

    let newOrder: any
    let orderError: any

    if (existingOrderId && existingOrder) {
      const existingBreakdown = Array.isArray(existingOrder.payment_breakdown) ? existingOrder.payment_breakdown : []
      // Keep store credit, pending legs (e.g. unpaid sinal), and any already-received
      // non-MP payments. Only replace a prior approved MP leg for this order.
      const keptBreakdown = existingBreakdown.filter((b: any) => {
        if (!b?.method) return false
        if (b.method === "store_credit") return true
        const received = Number(b.amountReceived || 0)
        const isMp = String(b.provider || "").toLowerCase().includes("mercado pago")
        if (isMp && received > 0.009) return false
        if (received > 0.009) return true
        // pending unpaid non-MP legs without a real method stay only if they look like a sinal placeholder
        return isMp
      })
      const updatedBreakdown = [
        ...keptBreakdown,
        {
          method: paymentMethodDisplayName,
          amount: chargeAmount,
          effectiveAmount: chargeAmount,
          amountReceived: paymentStatus === "approved" ? chargeAmount : 0,
          provider: "Mercado Pago",
          adjustmentType: "none",
          interestAmount: 0,
          feeAmount: 0,
          fixedFeeAmount: 0,
          feeBearer: "merchant",
          checkoutPricing: checkoutPricing || existingOrder.payment_breakdown?.[0]?.checkoutPricing || {
            subtotal: (existingOrder.order_items || []).reduce((sum: number, item: any) => sum + Number(item.subtotal || 0), 0) || (fullOrderTotal - deliveryFee),
            couponDiscount: couponDiscountAmount,
            paymentMethodDiscount: paymentMethodDiscountAmount,
            paymentMethodInterest: 0,
            paymentMethodFee: paymentMethodExtraAmount,
            deliveryFee,
            finalTotal: fullOrderTotal,
          },
        },
      ]

      const totalPaidAmount = paymentStatus === "approved"
        ? Number((Number(existingOrder.store_credit_amount || 0) + chargeAmount).toFixed(2))
        : Number(existingOrder.paid_amount || 0)

      const updatedSituation = paymentStatus === "approved"
        ? resolveSituationFromPaid(totalPaidAmount, fullOrderTotal)
        : (paymentStatus === "in_process" ? "in_process" : (paymentStatus === "rejected" ? "payment_failed" : existingOrder.situation))

      // Atualizar pedido existente com dados do pagamento
      const { data: updatedOrder, error: updateError } = await adminClient
        .from("orders")
        .update({
          payment_provider: "Mercado Pago",
          mp_payment_id: mpPaymentId.toString(),
          situation: updatedSituation,
          payment_breakdown: updatedBreakdown,
          paid_amount: totalPaidAmount,
          amount_paid: totalPaidAmount,
          paid_at: paymentStatus === "approved" ? new Date().toISOString() : existingOrder.paid_at,
          payment_expires_at: paymentExpiresAt,
          ...(effectiveStoreId && !existingOrder.store_id ? { store_id: effectiveStoreId } : {}),
        })
        .eq("id", existingOrderId)
        .select()
        .single()

      newOrder = updatedOrder
      orderError = updateError
    } else {
      // Criar novo pedido (fluxo original)
      const { data: insertedOrder, error: insertError } = await adminClient
        .from("orders")
        .insert({
          id: targetOrderId,
          partner_id: partnerId,
          store_id: effectiveStoreId,
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
          delivery_breakdown: deliveryBreakdown,
          distance_km: deliveryDistanceKm,
          delivery_payer: effectiveDeliveryPayer,
          seller_commission_amount: sellerCommissionAmount,
          payment_breakdown: [{
            method: paymentMethodDisplayName,
            amount: chargeAmount,
            effectiveAmount: chargeAmount,
            amountReceived: paymentStatus === "approved" ? chargeAmount : 0,
            provider: "Mercado Pago",
            adjustmentType: "none",
            interestAmount: 0,
            feeAmount: 0,
            fixedFeeAmount: 0,
            feeBearer: "merchant",
            mpPaymentStatus: paymentStatus,
            mpPaymentStatusDetail: mpPaymentResponse.status_detail ?? null,
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

      newOrder = insertedOrder
      orderError = insertError
    }

    if (orderError || !newOrder) {
      SecureLogger.error("Failed to create/update order", { errorCode: orderError?.code, errorMessage: orderError?.message })
      return NextResponse.json({ error: "Erro ao processar pedido" }, { status: 500 })
    }

    if (!existingOrderId && !isWhatsappOrderFlow) {
      increment_usage_counter(partnerId, "orders_month_count").catch(console.error)
    }

    if (!existingOrderId && couponIdToSave) {
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

    if (isDev) console.log(existingOrderId ? "Order updated successfully:" : "Order created successfully:", newOrder.id)

    if (!existingOrderId) {
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
    }

    // NOTA: O decrement_stock agora é feito automaticamente pelo trigger no banco
    // quando o status da order mudar para 'paid' ou 'approved'
    // Isso evita duplicação com webhook/sync-payment-status

    // Criar transaction de receita se pagamento já aprovado
    if (paymentStatus === "approved") {
      try {
        const { createTransactionFromOrder } = await import("@/lib/services/transaction.service")
        await createTransactionFromOrder(adminClient, {
          order_id: newOrder.id,
          store_id: newOrder.store_id || effectiveStoreId || storeId || null,
          order_number: newOrder.order_number || newOrder.id,
          partner_id: partnerId,
          total_amount: chargeAmount,
          payment_method: paymentMethodDisplayName,
          payment_provider: "Mercado Pago",
          payment_date: new Date().toISOString(),
          payment_breakdown: [{ method: paymentMethodDisplayName, amount: chargeAmount }],
          customer_id: resolvedCustomerId,
          customer_name: customerName,
          mp_payment_id: String(mpPaymentId),
        })
      } catch (txErr: any) {
        console.error("Erro ao criar transaction ou incrementar vendas:", txErr.message)
      }

      try {
        const { fulfillMarketplaceOrder } = await import("@/lib/services/marketplace-checkout-fulfillment")
        const fulfillmentResult = await fulfillMarketplaceOrder(adminClient, newOrder.id, { force: true })
        if (!fulfillmentResult.success) {
          SecureLogger.error("Marketplace order fulfillment failed in process-payment", {
            orderId: newOrder.id,
            fulfillmentError: fulfillmentResult.error,
            fulfillmentSkipped: fulfillmentResult.skipped,
          })
        }
      } catch (fulfillErr: any) {
        SecureLogger.error("Exception during marketplace order fulfillment in process-payment", {
          orderId: newOrder.id,
          errorMessage: fulfillErr.message,
          stack: fulfillErr.stack,
        })
        captureError(fulfillErr, {
          module: "orders",
          action: "marketplace_fulfillment_process_payment",
          entityId: newOrder.id,
        })
      }
    }

    const uniqueProductIds = [...new Set(productIdsForCache)]
    for (const pid of uniqueProductIds) {
      await invalidateProductCache(pid, partnerId, "update", { silent: true })
      revalidateProducts(partnerId, pid)
    }
    revalidateMarketplace()

    if (!existingOrderId && cartItemIds && cartItemIds.length > 0) {
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
      statusDetail: mpPaymentResponse.status_detail ?? null,
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
