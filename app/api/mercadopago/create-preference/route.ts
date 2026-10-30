import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { checkPartnerPermission, getCurrentUser, requireStorePermission } from "@/lib/auth/authorization"
import { SecureLogger } from "@/lib/secure-logger"
import { withCSRFProtection } from "@/lib/security/csrf-middleware"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"
import { validateCoupon } from "@/lib/services/coupons"
import { calculateOrderPricing } from "@/lib/services/pricing-engine"
import { resolveCheckoutCartLinesFresh } from "@/lib/cache/checkout-cache"
import { quoteDeliveryFeeAction, calculateServiceTravelFeeForOrder } from "@/app/actions/shared/delivery"
import {
  quoteCarrierFreightFee,
  extractPostalCodeFromAddress,
} from "@/lib/services/shipping/carrier-checkout"
import { issuePaymentQuote } from "@/lib/mercadopago/payment-quote"
import {
  findMercadoPagoIntegration,
  mapToMpPartnerFields,
} from "@/lib/services/payments/mercadopago-integration"

interface PreferenceRequest {
  items?: Array<{
    id: string
    name: string
    price: number
    quantity: number
    variant_id?: string
    service_id?: string
    itemType?: string | null
    fulfillmentMode?: string | null
  }>
  products?: Array<{
    id: string
    name: string
    price: number
    quantity: number
    variant_id?: string
    service_id?: string
    itemType?: string | null
    fulfillmentMode?: string | null
  }>
  partnerId?: string
  storeId?: string
  buyerId?: string
  existingOrderId?: string
  orderId?: string
  paymentOrderId?: string
  couponCode?: string | null
  deliveryFee?: number
  deliveryType?: "delivery" | "pickup"
  deliveryAddress?: string
  cartItemIds?: string[]
  payDepositOnly?: boolean
  quoteOnly?: boolean
  checkoutPricing?: {
    subtotal?: number
    couponDiscount?: number
    paymentMethodDiscount?: number
    paymentMethodInterest?: number
    paymentMethodFee?: number
    paymentMethodFixedFee?: number
    deliveryFee?: number
    finalTotal: number
    carrierServiceId?: number | null
    destinationPostalCode?: string | null
    destinationCoords?: { lat: number; lng: number } | null
  }
}

async function handler(request: NextRequest) {
  try {
    const body: PreferenceRequest = await request.json()
    SecureLogger.info("MP preference request received", {
      hasItems: Boolean(body.items?.length || body.products?.length),
      cartItemCount: body.cartItemIds?.length || 0,
      hasCoupon: Boolean(body.couponCode),
      deliveryType: body.deliveryType || "pickup",
      hasClientPricingSnapshot: Boolean(body.checkoutPricing),
    })

    const user = await getCurrentUser()
    const adminClient = createAdminClient()

    // SEGURANÇA: Verificar que o usuário está autenticado
    if (!user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    // Normalizar items (podem vir como 'products' ou 'items')
    const items = body.items || body.products || []

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Nenhum produto fornecido" }, { status: 400 })
    }

    const isServiceItem = (item: { service_id?: string; itemType?: string | null }) =>
      Boolean(item.service_id) || item.itemType === "service" || item.itemType === "service_booking"
    const resolveServiceId = (item: { id: string; service_id?: string; itemType?: string | null }) =>
      item.service_id || (isServiceItem(item) ? item.id : null)

    const rawExistingOrderId = body.existingOrderId || body.orderId
    const existingOrderId = typeof rawExistingOrderId === "string" && !rawExistingOrderId.startsWith("temp-") ? rawExistingOrderId : undefined
    if (body.paymentOrderId !== undefined && (typeof body.paymentOrderId !== "string" || !body.paymentOrderId.trim())) {
      return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
    }
    if (body.paymentOrderId && existingOrderId && body.paymentOrderId !== existingOrderId) {
      return NextResponse.json({ error: "Pedidos divergentes" }, { status: 400 })
    }
    let existingOrder: any = null
    if (existingOrderId) {
      const { data: fetchedOrder, error: fetchError } = await adminClient
        .from("orders")
        .select("*, order_items(*)")
        .eq("id", existingOrderId)
        .single()

      if (fetchError || !fetchedOrder) {
        SecureLogger.error("Failed to fetch existing order in create-preference", { orderId: existingOrderId, error: fetchError?.message })
        return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 })
      }

      if (fetchedOrder.buyer_id !== user.id) {
        SecureLogger.warn("Order ID mismatch attempt in create-preference", { orderId: existingOrderId, buyerId: fetchedOrder.buyer_id, userId: user.id })
        return NextResponse.json({ error: "Acesso negado ao pedido" }, { status: 403 })
      }

      existingOrder = fetchedOrder
    }

    // O partnerId do client é apenas uma alegação. Resolva o parceiro real
    // diretamente no carrinho/produtos/pedido antes de consultar configuração/token MP.
    let partnerId: string | undefined
    let resolvedCartResult: Awaited<ReturnType<typeof resolveCheckoutCartLinesFresh>> | null = null
    let hasCartProducts = false
    let hasCartDeliveryLines = false
    let hasOnlyServiceLines = false
    let hasOnlySubscriptionLines = false
    const useUnifiedCart = Boolean(!existingOrder && body.cartItemIds && body.cartItemIds.length > 0)

    if (existingOrder) {
      partnerId = existingOrder.partner_id
    } else if (useUnifiedCart) {
      const resolved = await resolveCheckoutCartLinesFresh(adminClient, user.id, body.cartItemIds!)
      if (!resolved.success) {
        return NextResponse.json({ error: resolved.error }, { status: 400 })
      }
      partnerId = resolved.partnerId
      resolvedCartResult = resolved
      hasCartProducts = resolved.hasProducts
      hasCartDeliveryLines = resolved.hasDeliveryLines
      hasOnlyServiceLines = resolved.lines.length > 0 && resolved.lines.every((l) => l.itemType === "service_booking")
      hasOnlySubscriptionLines = resolved.lines.length > 0 && resolved.lines.every((l) => l.itemType === "subscription")
    } else {
      const productIds = items.filter(i => !isServiceItem(i) && !i.variant_id).map(i => i.id).filter(Boolean)
      const serviceIds = items.map(i => resolveServiceId(i)).filter(Boolean) as string[]
      const variantIds = items.filter(i => !isServiceItem(i)).map(i => i.variant_id || i.id).filter(Boolean) as string[]
      const [productsRes, variantsRes, servicesRes] = await Promise.all([
        adminClient.from("products").select("id, partner_id").in("id", productIds),
        adminClient.from("product_variants").select("id, products!inner(partner_id)").in("id", variantIds),
        adminClient.from("services").select("id, partner_id").in("id", serviceIds),
      ])
      const productsMap = new Map<string, any>(productsRes.data?.map((p: any) => [p.id, p]))
      const variantsMap = new Map<string, any>(variantsRes.data?.map((v: any) => [v.id, v]))
      const servicesMap = new Map<string, any>(servicesRes.data?.map((s: any) => [s.id, s]))
      const resolvedPartnerIds = items.map(item => {
        if (isServiceItem(item)) {
          const serviceId = resolveServiceId(item)
          return serviceId ? servicesMap.get(serviceId)?.partner_id : undefined
        }
        const variant = item.variant_id ? variantsMap.get(item.variant_id) : variantsMap.get(item.id)
        return variant?.products?.partner_id || productsMap.get(item.id)?.partner_id
      })

      const uniquePartners = new Set(resolvedPartnerIds.filter(Boolean))
      if (uniquePartners.size > 1) {
        return NextResponse.json({ error: "Itens de vendedores diferentes ou inválidos" }, { status: 400 })
      }
      if (uniquePartners.size === 1) {
        partnerId = Array.from(uniquePartners)[0]
      } else if (body.partnerId) {
        partnerId = body.partnerId
      } else {
        return NextResponse.json({ error: "Itens de vendedores diferentes ou inválidos" }, { status: 400 })
      }
      hasCartProducts = productIds.length > 0 || variantIds.length > 0
      hasOnlyServiceLines = serviceIds.length > 0 && !hasCartProducts
      hasOnlySubscriptionLines = false
      hasCartDeliveryLines = hasCartProducts && body.deliveryType === "delivery"
    }

    if (!partnerId) {
      return NextResponse.json({ error: "Vendedor não identificado" }, { status: 400 })
    }
    if (body.partnerId && body.partnerId !== partnerId) {
      SecureLogger.warn("Client partnerId mismatch in preference", { claimedPartnerId: body.partnerId, resolvedPartnerId: partnerId })
      return NextResponse.json({ error: "Vendedor inválido para os itens informados" }, { status: 400 })
    }

    if (!partnerId && items.length > 0) {
      // Tentar obter partner_id do primeiro item (pode ser produto ou variante)
      const { data: product } = await adminClient
        .from("products")
        .select("partner_id")
        .eq("id", items[0].id)
        .single()

      if (product) {
        partnerId = product.partner_id
      } else {
        // Pode ser uma variante - buscar via product_variants
        const { data: variant } = await adminClient
          .from("product_variants")
          .select("products(partner_id)")
          .eq("id", items[0].id)
          .single()

        if (variant) {
          partnerId = (variant.products as any)?.partner_id
        }
      }
    }

    if (!partnerId) {
      return NextResponse.json({ error: "Vendedor não identificado" }, { status: 400 })
    }

    const { data: partner, error: partnerError } = await adminClient
      .from("partners")
      .select("id")
      .eq("id", partnerId)
      .single()

    if (partnerError) {
      console.error("Partner query error:", partnerError)
      return NextResponse.json({ error: `Erro ao buscar vendedor: ${partnerError.message}` }, { status: 400 })
    }

    if (!partner) {
      console.error("Partner not found for ID:", partnerId)
      return NextResponse.json({ error: "Vendedor não encontrado" }, { status: 400 })
    }

    let mpAccessToken: string
    try {
      mpAccessToken = await getValidMercadoPagoAccessToken(partnerId)
    } catch (err: any) {
      SecureLogger.error("Failed to obtain valid MP token", { partnerId, error: err.message })
      return NextResponse.json({ error: "Sessão do Mercado Pago inválida ou expirada" }, { status: 400 })
    }

    let totalAmount = 0
    const preferenceItems: any[] = []
    let couponItems: any[] = []
    let deliveryFee = 0
    let deliveryStoreId: string | null = body.storeId || null
    let serviceDepositDelta = 0
    let resolverAdjustedForDeposit = false

    if (existingOrder) {
      deliveryStoreId = existingOrder.store_id || deliveryStoreId
      const storeCredit = Number(existingOrder.store_credit_amount || 0)
      const paidAmount = Number(existingOrder.paid_amount || 0)
      const orderTotal = Number(existingOrder.total_amount || 0)
      const remainingToPay = Math.round((orderTotal - storeCredit - paidAmount + Number.EPSILON) * 100) / 100

      if (remainingToPay <= 0) {
        return NextResponse.json({ error: "Este pedido já foi quitado ou possui saldo zero." }, { status: 400 })
      }

      totalAmount = remainingToPay
      const orderLabel = existingOrder.order_number ? `Pedido #${existingOrder.order_number}` : `Pedido ${existingOrder.id.slice(0, 8)}`

      preferenceItems.length = 0
      preferenceItems.push({
        id: String(existingOrder.id),
        title: orderLabel,
        description: `Pagamento do ${orderLabel}`,
        unit_price: remainingToPay,
        quantity: 1,
        currency_id: "BRL",
      })
    } else if (useUnifiedCart) {
      // Update pay_deposit_only in DB
      await adminClient
        .from("cart_items")
        .update({ pay_deposit_only: Boolean(body.payDepositOnly), updated_at: new Date().toISOString() })
        .in("id", body.cartItemIds!)
        .eq("user_id", user.id)

      if (body.deliveryType) {
        const targetFulfillmentMode = body.deliveryType === "delivery" ? "delivery" : "pickup"
        await adminClient
          .from("cart_items")
          .update({ fulfillment_mode: targetFulfillmentMode, updated_at: new Date().toISOString() })
          .in("id", body.cartItemIds!)
          .eq("user_id", user.id)
          .or("item_type.eq.product,item_type.is.null,product_id.not.is.null")
      }

      const resolved = await resolveCheckoutCartLinesFresh(adminClient, user.id, body.cartItemIds!)
      if (!resolved.success) {
        return NextResponse.json({ error: resolved.error }, { status: 400 })
      }
      resolvedCartResult = resolved
      hasCartProducts = resolved.hasProducts
      hasCartDeliveryLines = resolved.hasDeliveryLines
      hasOnlyServiceLines = resolved.lines.length > 0 && resolved.lines.every((l) => l.itemType === "service_booking")
      hasOnlySubscriptionLines = resolved.lines.length > 0 && resolved.lines.every((l) => l.itemType === "subscription")
      resolverAdjustedForDeposit = resolved.lines.some(
        (line) => line.itemType === "service_booking" && line.depositAmount != null,
      )
      deliveryStoreId = resolved.lines.find((line) => line.storeId)?.storeId || deliveryStoreId

      for (const line of resolved.lines) {
        preferenceItems.push({
          title: line.lineName,
          description: `Item: ${line.lineName}`,
          unit_price: line.unitPrice,
          quantity: line.quantity,
          currency_id: "BRL",
        })
        totalAmount += line.unitPrice * line.quantity
      }

      couponItems = resolved.lines.map(l => ({
        productId: l.productId || null,
        serviceId: l.serviceId || null,
        recurringPlanId: l.recurringPlanId || null,
      }))

      if (body.payDepositOnly) {
        const { data: partnerDepositRow } = await adminClient
          .from("partners")
          .select("service_deposit_percentage")
          .eq("id", partnerId)
          .single()
        const depositPct = Number(partnerDepositRow?.service_deposit_percentage || 50)

        const svcFullTotal = resolved.lines
          .filter((line) => line.itemType === "service_booking")
          .reduce((sum, line) => sum + Number(line.fullPrice || line.unitPrice || 0) * Number(line.quantity || 1), 0)

        // Calcula o sinal diretamente (não via delta) para evitar perda de 1 centavo
        // em arredondamentos, e garante mínimo de 1 centavo quando há serviço a cobrar.
        const serviceDepositAmount = svcFullTotal > 0
          ? Math.max(0.01, Math.round(svcFullTotal * (depositPct / 100) * 100) / 100)
          : 0
        serviceDepositDelta = Math.max(0, Math.round((svcFullTotal - serviceDepositAmount) * 100) / 100)
      }
    } else {
      const productIds = items.filter(i => !isServiceItem(i) && !i.variant_id).map(i => i.id).filter(Boolean)
      const serviceIds = items.map(i => resolveServiceId(i)).filter(Boolean) as string[]
      const variantIds = items.filter(i => !isServiceItem(i)).map(i => i.variant_id || i.id).filter(Boolean) as string[]

      const [productsRes, variantsRes, servicesRes] = await Promise.all([
        adminClient
          .from("products")
          .select("id, price, promotional_price, stock_available, partner_id, name, store_id")
          .in("id", productIds),
        adminClient
          .from("product_variants")
          .select("id, price_adjustment, stock_available, product_id, products!inner(partner_id, price, promotional_price, name, store_id)")
          .in("id", variantIds),
        adminClient
          .from("services")
          .select("id, price, promotional_price, partner_id, name, store_id")
          .in("id", serviceIds)
      ])

      const productsMap = new Map<string, any>(productsRes.data?.map((p: any) => [p.id, p]))
      const variantsMap = new Map<string, any>(variantsRes.data?.map((v: any) => [v.id, v]))
      const servicesMap = new Map<string, any>(servicesRes.data?.map((s: any) => [s.id, s]))

      for (const item of items) {
        // Validar quantidade
        if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 9999) {
          return NextResponse.json({ error: `Quantidade inválida para ${item.name}` }, { status: 400 })
        }

        let resolvedPrice: number
        let resolvedStock: number
        let resolvedPartnerId: string
        let resolvedName: string

        const variant = item.variant_id ? variantsMap.get(item.variant_id) : (variantsMap.get(item.id) || null)
        const serviceId = resolveServiceId(item)
        const service = serviceId ? servicesMap.get(serviceId) : null

        if (service) {
          const basePrice = Number(service.price)
          const promoPrice = service.promotional_price ? Number(service.promotional_price) : 0
          resolvedPrice = (promoPrice > 0 && promoPrice < basePrice) ? promoPrice : basePrice
          resolvedStock = Number.MAX_SAFE_INTEGER
          resolvedPartnerId = service.partner_id
          resolvedName = service.name
          deliveryStoreId = deliveryStoreId || service.store_id || null
        } else if (variant) {
          // Encontrado como variante
          const parentProduct = variant.products as any
          resolvedPrice = variant.price_adjustment
            ? Number(variant.price_adjustment)
            : Number(parentProduct.price)
          resolvedStock = variant.stock_available ?? 0
          resolvedPartnerId = parentProduct.partner_id
          resolvedName = parentProduct.name
          deliveryStoreId = deliveryStoreId || parentProduct.store_id || null
        } else {
          // Tentar como produto
          const product = productsMap.get(item.id)
          if (product) {
            const basePrice = Number(product.price)
            const promoPrice = product.promotional_price ? Number(product.promotional_price) : 0
            resolvedPrice = (promoPrice > 0 && promoPrice < basePrice) ? promoPrice : basePrice
            resolvedStock = product.stock_available
            resolvedPartnerId = product.partner_id
            resolvedName = product.name
            deliveryStoreId = deliveryStoreId || product.store_id || null
          } else if (item.price && item.name) {
            resolvedPrice = Number(item.price)
            resolvedStock = 9999
            resolvedPartnerId = partnerId
            resolvedName = item.name
          } else {
            return NextResponse.json({ error: `Produto/Variante ${item.id} não encontrado` }, { status: 400 })
          }
        }

        // Verificar que o produto pertence ao parceiro
        if (resolvedPartnerId !== partnerId) {
          SecureLogger.error("Catalog item partner mismatch in preference", { productId: item.id, serviceId: item.service_id })
          return NextResponse.json({ error: "Produto não pertence a este vendedor" }, { status: 400 })
        }

        const itemTotal = resolvedPrice * item.quantity
        totalAmount += itemTotal

        preferenceItems.push({
          title: resolvedName,
          description: `${service ? "Serviço" : "Produto"}: ${resolvedName}`,
          unit_price: resolvedPrice,
          quantity: item.quantity,
          currency_id: "BRL",
        })
      }

      couponItems = items.map(i => {
        const serviceId = resolveServiceId(i)
        return serviceId ? { productId: null, serviceId } : { productId: i.id, serviceId: null }
      })
    }

    // ── Central pricing engine (única fonte de verdade) ──────────────────────
    if (!existingOrder) {
      const shouldQuoteDelivery = hasOnlySubscriptionLines
        ? Boolean(body.deliveryAddress) && body.deliveryType === "delivery"
        : !hasOnlyServiceLines &&
          (hasCartDeliveryLines || (hasCartProducts && body.deliveryType === "delivery")) &&
          Boolean(body.deliveryAddress) &&
          body.deliveryType === "delivery"

      if (shouldQuoteDelivery) {
        if (!body.deliveryAddress?.trim()) {
          return NextResponse.json({ error: "Endereço de entrega não informado" }, { status: 400 })
        }
        const carrierServiceId = Number(body.checkoutPricing?.carrierServiceId || 0)
        if (carrierServiceId) {
          const cep =
            String(body.checkoutPricing?.destinationPostalCode || "").replace(/\D/g, "") ||
            extractPostalCodeFromAddress(body.deliveryAddress)
          const carrier = await quoteCarrierFreightFee(adminClient, {
            partnerId,
            toPostalCode: cep,
            serviceId: carrierServiceId,
          })
          if (carrier.success) {
            deliveryFee = carrier.fee
          } else {
            const deliveryQuote = await quoteDeliveryFeeAction({
              partnerId,
              storeId: deliveryStoreId,
              destinationAddress: body.deliveryAddress,
              orderSubtotal: totalAmount,
            })
            if (!deliveryQuote.success) {
              return NextResponse.json({ error: carrier.error || deliveryQuote.error }, { status: 400 })
            }
            deliveryFee = Number(deliveryQuote.fee || 0)
          }
        } else {
          const deliveryQuote = await quoteDeliveryFeeAction({
            partnerId,
            storeId: deliveryStoreId,
            destinationAddress: body.deliveryAddress,
            orderSubtotal: totalAmount,
          })
          if (!deliveryQuote.success) {
            return NextResponse.json({ error: deliveryQuote.error }, { status: 400 })
          }
          deliveryFee = Number(deliveryQuote.fee || 0)
        }
      }

      // Taxa de deslocamento de serviços a domicílio (customer_location)
      const serviceLinesForTravel = (resolvedCartResult?.lines || []).filter(
        (l: any) => l.itemType === "service_booking" && (l.fulfillmentMode === "customer_location" || l.lineRequiresDelivery),
      )
      if (serviceLinesForTravel.length > 0) {
        if (!body.deliveryAddress?.trim()) {
          return NextResponse.json({ error: "Endereço de atendimento não informado" }, { status: 400 })
        }
        const serviceLineForTravel = serviceLinesForTravel.find((l: any) => l.storeId) || serviceLinesForTravel[0]
        const serviceTravel = await calculateServiceTravelFeeForOrder({
          supabase: adminClient,
          partnerId,
          storeId: serviceLineForTravel.storeId || deliveryStoreId,
          serviceId: serviceLineForTravel.serviceId || null,
          deliveryAddress: body.deliveryAddress,
          destinationCoords: body.checkoutPricing?.destinationCoords ?? null,
          orderSubtotal: totalAmount,
        })
        if (!serviceTravel.success) {
          return NextResponse.json({ error: serviceTravel.error || "Endereço fora do raio de atendimento deste serviço." }, { status: 400 })
        }
        if (serviceTravel.fee > 0) {
          deliveryFee = Math.round((deliveryFee + serviceTravel.fee) * 100) / 100
        }
      }

      // Build pricing items from already-resolved preference items
      type PricingItem = import("@/lib/services/pricing-engine").PricingItem
      type PricingCoupon = import("@/lib/services/pricing-engine").PricingCoupon
      const pricingItems: PricingItem[] = preferenceItems
        .filter((p: any) => p.unit_price > 0)
        .map((p: any) => ({
          unitPrice: p.unit_price,
          quantity: p.quantity,
        }))

      // Coupon validation
      let couponPricingData: PricingCoupon | null = null
      let couponDiscount = 0
      if (body.couponCode) {
        const itemsSubtotal = pricingItems.reduce((s: number, i: any) => s + i.unitPrice * i.quantity, 0)
        const couponResult = await validateCoupon({
          partnerId,
          code: body.couponCode,
          customerId: user.id,
          subtotal: itemsSubtotal,
          shippingCost: deliveryFee,
          items: couponItems,
        }, adminClient)

        if (couponResult.valid) {
          couponDiscount = couponResult.discountAmount
          couponPricingData = {
            id: couponResult.couponId || "",
            code: body.couponCode,
            discountType: "fixed",
            discountValue: couponDiscount,
            maxDiscountValue: null,
            freeShipping: false,
            allowCombination: true,
          }

          // Don't add negative unit_price items as Mercado Pago API strictly rejects them
        }
      }

      // Delivery fee item for MP display
      if (deliveryFee > 0) {
        preferenceItems.push({
          title: hasOnlyServiceLines ? "Taxa de deslocamento" : "Taxa de entrega",
          unit_price: deliveryFee,
          quantity: 1,
          currency_id: "BRL",
        })
      }

      // Run central pricing for authoritative total
      const pricingResult = calculateOrderPricing({
        items: pricingItems,
        shippingCost: deliveryFee,
        coupon: couponPricingData,
      })
      totalAmount = pricingResult.finalTotal

      if (serviceDepositDelta > 0) {
        if (!resolverAdjustedForDeposit) {
          totalAmount = Math.max(0, Number((totalAmount - serviceDepositDelta).toFixed(2)))
        }
      }

      const prefSum = preferenceItems.reduce((acc: number, i: any) => acc + Number(i.unit_price || 0) * Number(i.quantity || 1), 0)
      if (totalAmount > 0 && Math.abs(prefSum - totalAmount) > 0.01) {
        preferenceItems.length = 0
        preferenceItems.push({
          title: "Compra na Dudit",
          description: "Pedido feito na Dudit",
          unit_price: totalAmount,
          quantity: 1,
          currency_id: "BRL",
        })
      }
    }

    // SEGURANÇA: Validar total usando o snapshot do checkout quando disponível
    const checkoutPricing = body.checkoutPricing
    if (checkoutPricing) {
      const snapshotFinalTotal = Number(checkoutPricing.finalTotal || 0)
      const tolerance = 0.05
      const matches =
        Math.abs(snapshotFinalTotal - totalAmount) <= tolerance ||
        (existingOrder && Math.abs(snapshotFinalTotal - Number(existingOrder.total_amount || 0)) <= tolerance)

      if (!matches && snapshotFinalTotal > 0) {
        const snapshotSubtotal = Number(checkoutPricing.subtotal || 0)
        const snapshotDeliveryFee = Number(checkoutPricing.deliveryFee || 0)
        const snapshotCouponDiscount = Number(checkoutPricing.couponDiscount || 0)
        const snapshotMethodDiscount = Number(checkoutPricing.paymentMethodDiscount || 0)
        const snapshotMethodInterest = Number(checkoutPricing.paymentMethodInterest || 0)
        const snapshotMethodFee = Number(checkoutPricing.paymentMethodFee || 0)
        const snapshotMethodFixedFee = Number(checkoutPricing.paymentMethodFixedFee || 0)
        const expectedFromSnapshot = Math.round((snapshotSubtotal + snapshotDeliveryFee - snapshotCouponDiscount - snapshotMethodDiscount + snapshotMethodInterest + snapshotMethodFee + snapshotMethodFixedFee + Number.EPSILON) * 100) / 100
        if (Math.abs(expectedFromSnapshot - snapshotFinalTotal) > 0.01) {
          SecureLogger.warn("MP preference pricing snapshot self-validation mismatch", {
            expectedFromSnapshot,
            snapshotFinalTotal,
            serverTotal: totalAmount,
          })
          return NextResponse.json({ error: "Os valores do checkout não conferem. Atualize a página e tente novamente." }, { status: 400 })
        }
      }
    }

    const cleanTotalAmount = Math.round((Number(totalAmount) + Number.EPSILON) * 100) / 100

    if (!Number.isFinite(cleanTotalAmount) || cleanTotalAmount <= 0 || cleanTotalAmount > 999999) {
      SecureLogger.error("Invalid preference total amount", { totalAmount, cleanTotalAmount })
      return NextResponse.json({ error: "Valor total inválido" }, { status: 400 })
    }

    const paymentOrderId = body.paymentOrderId || existingOrderId
    if (paymentOrderId && !existingOrder) {
      const { data: paymentOrder, error: paymentOrderError } = await adminClient
        .from("orders")
        .select("id, partner_id, store_id")
        .eq("id", paymentOrderId)
        .eq("partner_id", partnerId)
        .maybeSingle()

      if (paymentOrderError || !paymentOrder) {
        return NextResponse.json({ error: "Pedido não encontrado para este parceiro" }, { status: 404 })
      }

      const { allowed: canEditOrders } = await checkPartnerPermission(partnerId, "orders", "edit")
      if (!canEditOrders) {
        return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
      }
      if (paymentOrder.store_id) {
        await requireStorePermission(paymentOrder.store_id, partnerId, "orders", "edit")
      }
    }

    const paymentQuote = issuePaymentQuote({
      userId: user.id,
      partnerId,
      maxAmount: cleanTotalAmount,
      orderId: paymentOrderId,
    })

    if (body.quoteOnly) {
      return NextResponse.json({ success: true, payment_quote: paymentQuote })
    }

    // Sanitize and validate every item for Mercado Pago Preferences API:
    // Every item MUST have unit_price > 0 (strictly positive number with max 2 decimals) and integer quantity >= 1
    const validItems = preferenceItems
      .filter((item: any) => {
        const price = Number(item.unit_price)
        const qty = Number(item.quantity)
        return Number.isFinite(price) && price > 0 && Number.isFinite(qty) && qty >= 1
      })
      .map((item: any) => ({
        id: item.id ? String(item.id).slice(0, 64) : undefined,
        title: String(item.title || "Item").slice(0, 128),
        description: item.description ? String(item.description).slice(0, 256) : undefined,
        quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
        unit_price: Math.round((Number(item.unit_price) + Number.EPSILON) * 100) / 100,
        currency_id: "BRL",
      }))

    const itemsSum = Math.round((validItems.reduce((acc: number, item: any) => acc + item.unit_price * item.quantity, 0) + Number.EPSILON) * 100) / 100

    // If valid items match cleanTotalAmount within 1 cent and no existingOrder (which prefers a consolidated order item), use them.
    // Otherwise, send a single clean item matching cleanTotalAmount exactly to prevent MP from failing with unit_price invalid.
    const finalPreferenceItems = (!existingOrder && validItems.length > 0 && Math.abs(itemsSum - cleanTotalAmount) <= 0.01)
      ? validItems
      : [
        {
          title: existingOrder?.order_number
            ? `Pedido #${existingOrder.order_number}`
            : (existingOrder ? `Pedido ${existingOrder.id.slice(0, 8)}` : "Compra na Dudit"),
          description: "Pagamento do pedido",
          unit_price: cleanTotalAmount,
          quantity: 1,
          currency_id: "BRL",
        },
      ]

    // Criar preferência no Mercado Pago
    const preferencePayload: Record<string, any> = {
      items: finalPreferenceItems,
      metadata: {
        dudit_partner_id: partnerId,
        ...(paymentOrderId ? { dudit_order_id: paymentOrderId } : {}),
        dudit_authorized_amount: cleanTotalAmount,
      },
      payer: {
        name: "Cliente",
        email: user.email,
      },
      external_reference: paymentOrderId || `${partnerId}-${Date.now()}`,
      notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/mercadopago/webhook`,
      back_urls: {
        success: `${process.env.NEXT_PUBLIC_APP_URL}/payment/success`,
        failure: `${process.env.NEXT_PUBLIC_APP_URL}/payment/failure`,
        pending: `${process.env.NEXT_PUBLIC_APP_URL}/payment/pending`,
      },
      auto_return: "approved",
    }

    // Filter payment methods based on partner's MP accepted payment methods
    const partnerIntegration = await findMercadoPagoIntegration(adminClient, partnerId)
    const acceptedMethods = mapToMpPartnerFields(partnerIntegration).mp_accepted_payment_methods || {}
    const excludedPaymentTypes: Array<{ id: string }> = []
    if (acceptedMethods.pix === false) excludedPaymentTypes.push({ id: "pix" })
    if (acceptedMethods.credit_card === false) excludedPaymentTypes.push({ id: "credit_card" })
    if (acceptedMethods.debit_card === false) excludedPaymentTypes.push({ id: "debit_card" })
    if (acceptedMethods.boleto === false || body.payDepositOnly) excludedPaymentTypes.push({ id: "ticket" })
    // NOTE: Do NOT exclude "account_money" based on payDepositOnly here — the Mercado Pago API
    // rejects it with "account_money cannot be excluded". The sinal (deposit) use-case is
    // already blocked downstream: the frontend Brick hides the mercadoPago option when
    // payDepositOnly is true, and process-payment/process-erp-payment reject any
    // account_money payment_method_id for deposit charges.
    if (acceptedMethods.mercado_pago_wallet === false) excludedPaymentTypes.push({ id: "account_money" })
    if (excludedPaymentTypes.length > 0) {
      preferencePayload.payment_methods = {
        excluded_payment_types: excludedPaymentTypes,
      }
    }

    // Adicionar expiração de 30 minutos (1800 segundos) para PIX
    const thirtyMinutesFromNow = new Date(Date.now() + 30 * 60 * 1000)
    preferencePayload.expiration_date_from = new Date().toISOString()
    preferencePayload.expiration_date_to = thirtyMinutesFromNow.toISOString()

    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preferencePayload),
    })

    console.log("MP Response status:", mpResponse.status)

    if (!mpResponse.ok) {
      let errorMessage = "Erro ao criar preferência de pagamento"
      let mpErrorData: any = null
      try {
        mpErrorData = await mpResponse.json()

        const causeDesc = Array.isArray(mpErrorData?.cause) && mpErrorData.cause.length > 0
          ? mpErrorData.cause.map((c: any) => c.description || c.code).join(", ")
          : null

        if (mpErrorData?.message) {
          errorMessage = causeDesc ? `${mpErrorData.message} (${causeDesc})` : mpErrorData.message
        } else if (mpErrorData?.error?.message) {
          errorMessage = mpErrorData.error.message
        } else if (mpErrorData?.errors?.[0]?.message) {
          errorMessage = mpErrorData.errors[0].message
        }
      } catch (parseErr) {
        console.error("Failed to parse MP error:", parseErr)
        errorMessage = `HTTP ${mpResponse.status}`
      }

      SecureLogger.error("Mercado Pago preference creation failed", {
        status: mpResponse.status,
        errorMessage,
        errorData: mpErrorData,
        payloadItems: preferencePayload.items,
        partnerId,
      })
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }

    const preference = await mpResponse.json()
    return NextResponse.json({
      success: true,
      preference_id: preference.id,
      payment_quote: paymentQuote,
      preferenceId: preference.id,
      initPoint: preference.init_point,
      init_point: preference.init_point,
      total_amount: cleanTotalAmount,
    })
  } catch (error: any) {
    console.error("API Error:", error)
    console.error("Error stack:", error?.stack)
    SecureLogger.error("Failed to create preference", { error: error?.message })
    return NextResponse.json(
      { error: error?.message || "Erro interno ao criar preferência" },
      { status: 500 }
    )
  }
}

export const POST = withCSRFProtection(handler)
