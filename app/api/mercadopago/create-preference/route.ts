import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getCurrentUser } from "@/lib/auth/authorization"
import { SecureLogger } from "@/lib/secure-logger"
import { withCSRFProtection } from "@/lib/security/csrf-middleware"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"
import { validateCoupon } from "@/lib/services/coupons"

interface PreferenceRequest {
  items?: Array<{
    id: string
    name: string
    price: number
    quantity: number
    variant_id?: string
  }>
  products?: Array<{
    id: string
    name: string
    price: number
    quantity: number
    variant_id?: string
  }>
  partnerId?: string
  buyerId?: string
  couponCode?: string | null
  deliveryFee?: number
}

async function handler(request: NextRequest) {
  try {
    const body: PreferenceRequest = await request.json()
    console.log("Request body:", { ...body, partnerId: body.partnerId ? "[HIDDEN]" : undefined })

    const user = await getCurrentUser()
    const supabase = await getSupabaseServerClient()

    // SEGURANÃ‡A: Verificar que o usuário está autenticado
    if (!user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    // Normalizar items (podem vir como 'products' ou 'items')
    const items = body.items || body.products || []

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Nenhum produto fornecido" }, { status: 400 })
    }

    // Se houver partnerId, validar
    let partnerId = body.partnerId
    if (!partnerId && items.length > 0) {
      // Tentar obter partner_id do primeiro item (pode ser produto ou variante)
      const { data: product } = await supabase
        .from("products")
        .select("partner_id")
        .eq("id", items[0].id)
        .single()

      if (product) {
        partnerId = product.partner_id
      } else {
        // Pode ser uma variante â€” buscar via product_variants
        const { data: variant } = await supabase
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

    const adminClient = createAdminClient()
    const { data: partner, error: partnerError } = await adminClient
      .from("partners")
      .select("id, store_name")
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

    // SEGURANÃ‡A: SEMPRE validar preços no banco (nunca confiar em body.amount ou item.price)
    // Otimização: Buscar todos os produtos e variantes de uma vez para evitar N+1 queries
    const productIds = items.filter(i => !i.variant_id).map(i => i.id)
    const variantIds = items.map(i => i.variant_id || i.id).filter(Boolean) as string[]

    const [productsRes, variantsRes] = await Promise.all([
      adminClient
        .from("products")
        .select("id, price, promotional_price, stock_available, partner_id, name")
        .in("id", productIds),
      adminClient
        .from("product_variants")
        .select("id, price_adjustment, stock_available, product_id, products!inner(partner_id, price, promotional_price, name)")
        .in("id", variantIds)
    ])

    const productsMap = new Map<string, any>(productsRes.data?.map((p: any) => [p.id, p]))
    const variantsMap = new Map<string, any>(variantsRes.data?.map((v: any) => [v.id, v]))

    let totalAmount = 0
    const preferenceItems = []

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

      if (variant) {
        // Encontrado como variante
        const parentProduct = variant.products as any
        resolvedPrice = variant.price_adjustment
          ? Number(variant.price_adjustment)
          : Number(parentProduct.price)
        resolvedStock = variant.stock_available ?? 0
        resolvedPartnerId = parentProduct.partner_id
        resolvedName = parentProduct.name
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
        } else {
          return NextResponse.json({ error: `Produto/Variante ${item.id} não encontrado` }, { status: 400 })
        }
      }

      // Verificar que o produto pertence ao parceiro
      if (resolvedPartnerId !== partnerId) {
        SecureLogger.error("Product partner mismatch in preference", { productId: item.id })
        return NextResponse.json({ error: "Produto não pertence a este vendedor" }, { status: 400 })
      }

      // Verificar estoque
      if (resolvedStock < item.quantity) {
        return NextResponse.json({ error: `Estoque insuficiente para ${resolvedName}` }, { status: 400 })
      }

      const itemTotal = resolvedPrice * item.quantity
      totalAmount += itemTotal

      preferenceItems.push({
        title: resolvedName,
        description: `Produto: ${resolvedName}`,
        unit_price: resolvedPrice,
        quantity: item.quantity,
        currency_id: "BRL",
      })
    }

    // DELIVERY FEE
    const deliveryFee = Number(body.deliveryFee || 0)
    if (deliveryFee > 0) {
      totalAmount += deliveryFee
      preferenceItems.push({
        title: "Taxa de entrega",
        unit_price: deliveryFee,
        quantity: 1,
        currency_id: "BRL",
      })
    }

    // COUPON VALIDATION
    let couponDiscount = 0
    if (body.couponCode) {
      const couponResult = await validateCoupon({
        partnerId,
        code: body.couponCode,
        customerId: user.id,
        subtotal: totalAmount - deliveryFee,
        shippingCost: deliveryFee,
        items: items.map(i => ({ productId: i.id })) // simplified
      }, adminClient)

      if (couponResult.valid) {
        couponDiscount = couponResult.discountAmount

        // Add discount as a separate item in MP preference
        if (couponDiscount > 0) {
          preferenceItems.push({
            title: `Desconto: ${body.couponCode}`,
            unit_price: -couponDiscount,
            quantity: 1,
            currency_id: "BRL",
          })
          totalAmount -= couponDiscount
        }
      }
    }

    // SEGURANÃ‡A: Validar total
    if (totalAmount <= 0 || totalAmount > 999999) {
      SecureLogger.error("Invalid preference total amount", { totalAmount })
      return NextResponse.json({ error: "Valor total inválido" }, { status: 400 })
    }

    // Criar preferência no Mercado Pago
    const preferencePayload: Record<string, any> = {
      items: preferenceItems,
      payer: {
        name: "Cliente",
        email: user.email,
      },
      external_reference: `${partnerId}-${Date.now()}`,
      notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/mercadopago/webhook`,
      back_urls: {
        success: `${process.env.NEXT_PUBLIC_APP_URL}/payment/success`,
        failure: `${process.env.NEXT_PUBLIC_APP_URL}/payment/failure`,
        pending: `${process.env.NEXT_PUBLIC_APP_URL}/payment/pending`,
      },
      auto_return: "approved",
    }

    // Adicionar expiração de 30 minutos (1800 segundos) para PIX
    // Isso cria um deadline para o pagamento PIX
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
        console.error("MP Error Response (full):", JSON.stringify(mpErrorData, null, 2))

        // Tentar extrair mensagem de erro do Mercado Pago
        if (mpErrorData?.message) {
          errorMessage = mpErrorData.message
        } else if (mpErrorData?.error?.message) {
          errorMessage = mpErrorData.error.message
        } else if (mpErrorData?.errors?.[0]?.message) {
          errorMessage = mpErrorData.errors[0].message
        }
      } catch (parseErr) {
        console.error("Failed to parse MP error:", parseErr)
        errorMessage = `HTTP ${mpResponse.status}`
      }

      console.error("Final error message to return:", errorMessage)
      SecureLogger.error("Mercado Pago preference creation failed", {
        status: mpResponse.status,
        errorMessage,
        mpErrorData
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
      preferenceId: preference.id,
      initPoint: preference.init_point,
      init_point: preference.init_point,
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
