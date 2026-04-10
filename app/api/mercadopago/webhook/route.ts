import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { createHmac, timingSafeEqual } from "crypto"
import { SecureLogger } from "@/lib/secure-logger"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"

const isDev = true // Forcing logs to debug webhook issues
const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000
const AMOUNT_TOLERANCE = 0.01
const MAX_RETRIES = 3
const RETRY_DELAYS = [3000, 5000, 8000]

function validateWebhookSignature(signature: string, requestId: string, resourceId: string): boolean {
  try {
    const webhookSecret = process.env.MP_WEBHOOK_SECRET

    if (!webhookSecret) {
      if (isDev) {
        console.error("[WEBHOOK] ⚠️ MP_WEBHOOK_SECRET não configurado. Ignorando validação em DEV.")
        return true
      }
      return false
    }

    const parts = signature.split(",")
    let timestamp = ""
    let receivedSignature = ""

    for (const part of parts) {
      const trimmed = part.trim()
      if (trimmed.startsWith("ts=")) {
        timestamp = trimmed.replace("ts=", "")
      } else if (trimmed.startsWith("v1=")) {
        receivedSignature = trimmed.replace("v1=", "")
      }
    }

    if (!timestamp || !receivedSignature) {
      if (isDev) console.warn("[WEBHOOK] Assinatura inválida: faltam timestamp ou v1")
      return false
    }

    const timestampMs = parseInt(timestamp, 10) * 1000 // Convert to milliseconds
    const now = Date.now()
    if (now - timestampMs > MAX_WEBHOOK_AGE_MS) {
      if (isDev) console.warn(`[WEBHOOK] Webhook expirado (age: ${now - timestampMs}ms, max: ${MAX_WEBHOOK_AGE_MS}ms)`)
      return false
    }

    // Template padrão do Mercado Pago: id:..., request-id:..., ts:...
    const requestSignature = `id:${resourceId};request-id:${requestId};ts:${timestamp}`
    const computedHmac = createHmac("sha256", webhookSecret)
      .update(requestSignature)
      .digest("hex")

    if (isDev) console.log("[WEBHOOK] Validação de assinatura:", {
      esperado: computedHmac.substring(0, 16) + "...",
      recebido: receivedSignature.substring(0, 16) + "...",
      match: computedHmac === receivedSignature,
    })

    if (computedHmac.length !== receivedSignature.length) return false
    return timingSafeEqual(Buffer.from(computedHmac), Buffer.from(receivedSignature))
  } catch (error: any) {
    if (isDev) console.error("[WEBHOOK] Erro ao validar assinatura:", error.message)
    return false
  }
}

export async function POST(request: NextRequest) {
  if (isDev) console.log("[WEBHOOK] ========== WEBHOOK RECEBIDO ==========")
  if (isDev) console.log("[WEBHOOK] Timestamp:", new Date().toISOString())
  if (isDev) console.log("[WEBHOOK] Headers:", {
    signature: request.headers.get("x-signature")?.substring(0, 20) + "...",
    requestId: request.headers.get("x-request-id"),
  })

  try {
    const signature = request.headers.get("x-signature")
    const requestId = request.headers.get("x-request-id")

    if (isDev) console.log("[WEBHOOK] Validando headers...")
    if (!signature || !requestId) {
      if (isDev) {
        console.error("[WEBHOOK] ⚠️ Headers inválidos: signature ou request-id faltando. Ignorando em DEV para debugar.")
      } else {
        return NextResponse.json({ error: "Invalid request" }, { status: 401 })
      }
    }

    const body = await request.json()
    if (isDev) console.log("[WEBHOOK] Body recebido:", JSON.stringify({
      type: body.type,
      action: body.action,
      paymentId: body.data?.id,
      externalReference: body.data?.external_reference,
    }))

    if (!body?.data?.id) {
      if (isDev) console.error("[WEBHOOK] ❌ Payment ID faltando no body")
      return NextResponse.json({ error: "Invalid request" }, { status: 401 })
    }

    if (isDev) console.log("[WEBHOOK] Validando assinatura...")
    const signatureToValidate = signature || ""
    const reqIdToValidate = requestId || ""
    const isValid = signatureToValidate ? validateWebhookSignature(signatureToValidate, reqIdToValidate, body.data.id.toString()) : isDev
    if (!isValid) {
      if (isDev) {
        console.error("[WEBHOOK] ⚠️ Assinatura inválida. Ignorando em DEV para debugar.")
      } else {
        return NextResponse.json({ error: "Invalid request" }, { status: 401 })
      }
    }

    if (isDev) console.log("[WEBHOOK] ✅ Assinatura válida")
    if (isDev) console.log("[WEBHOOK] Retornando ACK imediato ao Mercado Pago...")
    const response = NextResponse.json({ received: true }, { status: 200 })

    // Processar assincronamente
    processWebhookWithRetry(body, requestId || "").catch((error) => {
      if (isDev) console.error("[WEBHOOK] ❌ Erro processando webhook:", error.message)
      SecureLogger.error("Webhook processing failed:", { error: error.message })
    })

    return response
  } catch (error: any) {
    if (isDev) console.error("[WEBHOOK] ❌ Erro no handler POST:", error.message)
    return NextResponse.json({ received: true }, { status: 200 })
  }
}

async function processWebhookWithRetry(body: any, requestId: string, attempt: number = 0) {
  const { type, data } = body
  const paymentId = data?.id

  if (isDev) console.log(`[WEBHOOK] Processando pagamento ${paymentId} (tentativa ${attempt + 1}/${MAX_RETRIES})`)

  try {
    if (type !== "payment" || !paymentId) {
      if (isDev) console.log("[WEBHOOK] Tipo de webhook não é pagamento, ignorando")
      return
    }

    const supabase = createAdminClient()

    if (isDev) console.log("[WEBHOOK] Verificando se pedido já foi processado...")
    const { data: existingOrderData, error: checkError } = await supabase
      .from("orders")
      .select("id, situation, total_amount, partner_id")
      .eq("mp_payment_id", paymentId.toString())
      .limit(1)
      .single()

    if (checkError && checkError.code !== "PGRST116") {
      if (isDev) console.log("[WEBHOOK] Erro ao buscar pedido (pode não existir ainda):", checkError.message)
    }

    // Se já foi processado como pago, ignorar
    if (existingOrderData?.situation === "paid") {
      if (isDev) console.log(`[WEBHOOK] ⚠️ Pedido ${existingOrderData.id} já foi marcado como pago, ignorando`)
      return
    }

    const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)]
    if (isDev) console.log(`[WEBHOOK] Aguardando ${delay}ms para evitar race conditions...`)
    await new Promise((resolve) => setTimeout(resolve, delay))

    // Buscar dados do pagamento na API do Mercado Pago
    if (isDev) console.log("[WEBHOOK] Buscando informações do pagamento no Mercado Pago...")
    let partnerId = existingOrderData?.partner_id || null
    let paymentInfo = null

    if (!partnerId) {
      if (isDev) console.log("[WEBHOOK] Partner ID não encontrado no pedido, procurando entre partners...")
      const { data: partners } = await supabase
        .from("partners")
        .select("id")
        .not("mp_access_token_encrypted", "is", null)

      if (isDev) console.log(`[WEBHOOK] Encontrados ${partners?.length || 0} partners com token MP`)

      for (const partner of partners || []) {
        try {
          if (isDev) console.log(`[WEBHOOK] Tentando buscar pagamento com token do partner ${partner.id}...`)
          const partnerToken = await getValidMercadoPagoAccessToken(partner.id)
          const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: {
              Authorization: `Bearer ${partnerToken}`,
            },
          })

          if (mpResponse.ok) {
            paymentInfo = await mpResponse.json()
            partnerId = partner.id
            if (isDev) console.log(`[WEBHOOK] ✅ Dados do pagamento obtidos do partner ${partnerId}`)
            if (isDev) console.log("[WEBHOOK] Status do pagamento:", paymentInfo.status)
            break
          } else {
            if (isDev) console.log(`[WEBHOOK] ⚠️ Resposta ${mpResponse.status} do partner ${partner.id}`)
          }
        } catch (err: any) {
          if (isDev) console.log(`[WEBHOOK] ⚠️ Erro tentando partner ${partner.id}:`, err.message)
          continue
        }
      }
    } else {
      if (isDev) console.log(`[WEBHOOK] Partner ID conhecido: ${partnerId}, buscando dados...`)

      try {
        const partnerToken = await getValidMercadoPagoAccessToken(partnerId)
        const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: {
            Authorization: `Bearer ${partnerToken}`,
          },
        })

        if (mpResponse.ok) {
          paymentInfo = await mpResponse.json()
          if (isDev) console.log(`[WEBHOOK] ✅ Dados do pagamento obtidos`)
          if (isDev) console.log("[WEBHOOK] Status do pagamento:", paymentInfo.status)
        } else {
          if (isDev) console.error(`[WEBHOOK] ❌ Erro ${mpResponse.status} ao buscar pagamento`)
        }
      } catch (err: any) {
        if (isDev) console.error("[WEBHOOK] ❌ Erro ao buscar dados do pagamento:", err.message)
      }
    }

    if (!paymentInfo || !partnerId) {
      if (isDev) console.error("[WEBHOOK] ❌ Não consegui obter dados do pagamento ou partner ID")
      if (attempt < MAX_RETRIES - 1) {
        if (isDev) console.log(`[WEBHOOK] Tentando novamente em 2s...`)
        await new Promise((resolve) => setTimeout(resolve, 2000))
        return processWebhookWithRetry(body, requestId, attempt + 1)
      }
      if (isDev) console.error("[WEBHOOK] ❌ Falhou após todas as tentativas de retry")
      return
    }

    // Buscar pedido
    if (!existingOrderData) {
      if (isDev) console.log("[WEBHOOK] Buscando pedido no banco...")
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("id, situation, total_amount")
        .eq("mp_payment_id", paymentId.toString())
        .limit(1)
        .single()

      if (orderError || !order) {
        if (isDev) console.error("[WEBHOOK] ❌ Pedido não encontrado no banco:", orderError?.message)
        if (attempt < MAX_RETRIES - 1) {
          if (isDev) console.log(`[WEBHOOK] Tentando novamente em 2s...`)
          await new Promise((resolve) => setTimeout(resolve, 2000))
          return processWebhookWithRetry(body, requestId, attempt + 1)
        }
        return
      }
    }

    const existingOrder = existingOrderData || existingOrderData
    const orderId = existingOrder!.id

    if (isDev) console.log(`[WEBHOOK] Pedido encontrado: ${orderId}`)
    if (isDev) console.log("[WEBHOOK] Status atual do pedido:", existingOrder!.situation)

    // Validar valor do pagamento
    if (paymentInfo.status === "approved" && paymentInfo.transaction_amount != null) {
      const paidAmount = Number(paymentInfo.transaction_amount)
      const orderAmount = Number(existingOrder!.total_amount)

      if (isDev) console.log("[WEBHOOK] Validando valor:", { paidAmount, orderAmount })

      if (Math.abs(paidAmount - orderAmount) > AMOUNT_TOLERANCE) {
        if (isDev) console.error("[WEBHOOK] ❌ Valor do pagamento NÃO corresponde ao do pedido - POSSÍVEL FRAUDE")
        SecureLogger.error("Webhook: Payment amount mismatch", {
          paidAmount,
          orderAmount,
          paymentId: paymentId.toString(),
          orderId,
        })
        return
      }
      if (isDev) console.log("[WEBHOOK] ✅ Valor do pagamento validado")
    }

    // Determinar novo status
    let orderStatus = "pending"
    if (paymentInfo.status === "approved") {
      orderStatus = "paid"
    } else if (paymentInfo.status === "in_process") {
      orderStatus = "in_process"
    } else if (["rejected", "cancelled", "refunded", "charged_back"].includes(paymentInfo.status)) {
      orderStatus = "cancelled"
    }

    if (isDev) console.log(`[WEBHOOK] Novo status: ${paymentInfo.status} -> pedido: ${orderStatus}`)

    // Guard: nunca regredir
    const finalStatuses = ["paid", "shipped", "delivered"]
    if (finalStatuses.includes(existingOrder!.situation) && !finalStatuses.includes(orderStatus)) {
      if (orderStatus !== "cancelled") {
        if (isDev) console.log(`[WEBHOOK] ⚠️ Pedido já em status final ${existingOrder!.situation}, não regressando`)
        return
      }
    }

    const previousSituation = existingOrder!.situation

    const updateData: any = {
      situation: orderStatus,
      payment_method: paymentInfo.payment_method?.type || "desconhecido",
      payment_provider: "Mercado Pago",
      mp_payment_id: paymentId.toString(),
      updated_at: new Date().toISOString(),
    }

    if (paymentInfo.status === "approved" && paymentInfo.date_approved) {
      updateData.mp_date_approved = paymentInfo.date_approved
    }

    if (isDev) console.log(`[WEBHOOK] Atualizando pedido ${orderId} de ${previousSituation} para ${orderStatus}...`)
    if (isDev) console.log("[WEBHOOK] Dados para atualizar:", updateData)

    const { error: updateError } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", orderId)

    if (updateError) {
      if (isDev) console.error("[WEBHOOK] ❌ Erro ao atualizar pedido:", updateError.message)
      if (attempt < MAX_RETRIES - 1) {
        if (isDev) console.log(`[WEBHOOK] Tentando novamente em 2s...`)
        await new Promise((resolve) => setTimeout(resolve, 2000))
        return processWebhookWithRetry(body, requestId, attempt + 1)
      }
      SecureLogger.error("Error updating order in webhook", { error: updateError.message })
      return
    }

    if (isDev) console.log(`[WEBHOOK] ✅ Pedido ${orderId} atualizado para ${orderStatus}`)

    // Criar transaction de receita quando pedido for pago
    if (orderStatus === "paid") {
      try {
        const { createTransactionFromOrder } = await import("@/lib/services/transaction.service")
        const { data: fullOrder } = await supabase
          .from("orders")
          .select("order_number, partner_id, total_amount, payment_method, payment_provider, payment_breakdown, buyer_id, customer_name")
          .eq("id", orderId)
          .single()

        if (fullOrder) {
          await createTransactionFromOrder(supabase, {
            order_number: fullOrder.order_number,
            partner_id: fullOrder.partner_id,
            total_amount: fullOrder.total_amount,
            payment_method: fullOrder.payment_method,
            payment_provider: fullOrder.payment_provider,
            payment_breakdown: fullOrder.payment_breakdown,
            payment_date: paymentInfo.date_approved || new Date().toISOString(),
            customer_contact_id: fullOrder.buyer_id,
            customer_name: fullOrder.customer_name,
          })

          // Increment partner's total sales count
          await supabase.rpc('increment_partner_sales', { partner_uuid: fullOrder.partner_id })
        }
      } catch (txErr: any) {
        if (isDev) console.error("[WEBHOOK] Erro ao criar transaction ou incrementar vendas:", txErr.message)
      }
    }

    // NOTA: Decrement de estoque será feito pelo sync-payment-status para evitar duplicação
    // quando o webhook e sync forem chamados em sequência

    // --- REVALIDAÇÃO DE CACHE ---
    // Mesmo que o decremento seja via trigger ou sync, precisamos limpar o cache
    // para que o front mostre o estoque atualizado imediatamente.
    if (orderStatus === "paid") {
      try {
        if (isDev) console.log("[WEBHOOK] Revalidando cache de produtos...")
        // Import dinâmico para evitar problemas de ciclo ou init
        const { revalidateProducts, revalidateMarketplace } = await import("@/lib/utils/revalidation")

        const { data: orderItems } = await supabase
          .from("order_items")
          .select("product_id")
          .eq("order_id", orderId)

        if (orderItems && orderItems.length > 0) {
          const uniqueProductIds = [...new Set(orderItems.map((i: any) => i.product_id))]
          for (const pid of uniqueProductIds) {
            if (isDev) console.log(`[WEBHOOK] Revalidando produto ${pid}...`)
            await revalidateProducts(existingOrder!.partner_id, String(pid))
          }
        }
        await revalidateMarketplace()
      } catch (cacheError: any) {
        if (isDev) console.error("[WEBHOOK] ⚠️ Erro ao revalidar cache:", cacheError.message)
      }
    }

    if (isDev) console.log(`[WEBHOOK] ✅✅✅ WEBHOOK PROCESSADO COM SUCESSO ✅✅✅`)
    if (isDev) console.log(`[WEBHOOK] Pedido ${orderId} atualizado para ${orderStatus}`)
    if (isDev) console.log("[WEBHOOK] ========== FIM DO WEBHOOK ==========\n")
  } catch (error: any) {
    if (isDev) console.error(`[WEBHOOK] ❌ Erro geral no processamento:`, error.message)
    if (isDev) console.error("[WEBHOOK] Stack:", error.stack)

    if (attempt < MAX_RETRIES - 1) {
      if (isDev) console.log(`[WEBHOOK] Tentando novamente em 3s (tentativa ${attempt + 2}/${MAX_RETRIES})...`)
      await new Promise((resolve) => setTimeout(resolve, 3000))
      return processWebhookWithRetry(body, requestId, attempt + 1)
    }

    if (isDev) console.error("[WEBHOOK] ❌ Falhou após todas as tentativas")
    SecureLogger.error("Webhook processing failed after all retries", { error: error.message })
  }
}
