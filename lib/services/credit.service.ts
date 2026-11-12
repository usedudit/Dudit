import { SupabaseClient } from "@supabase/supabase-js"
import { getAdminClient } from "@/lib/supabase/admin"

export interface GrantCreditsInput {
  partnerId: string
  customerId: string
  subscriptionId: string
  executionId: string
  nextExecutionAt?: string
  expiresAtOverride?: string
}

/**
 * Grants credits to a customer based on active subscription items.
 */
export async function grantSubscriptionCredits(
  supabase: SupabaseClient,
  input: GrantCreditsInput
): Promise<{ success: boolean; grantedCount: number; error?: string }> {
  try {
    // 1. Fetch the subscription, subscription items (snapshot) and plan details
    const { data: sub, error: subErr } = await supabase
      .from("recurring_subscriptions")
      .select(`
        id, next_execution_at,
        recurring_plans(billing_mode, credit_expiration_policy, credit_expiration_days),
        recurring_subscription_items(id, item_type, service_id, product_id, quantity, unit_price)
      `)
      .eq("id", input.subscriptionId)
      .single()

    if (subErr || !sub) {
      return { success: false, grantedCount: 0, error: subErr?.message || "Assinatura não encontrada." }
    }

    const plan = sub.recurring_plans as any
    let items = (sub.recurring_subscription_items || []) as any[]

    if (items.length === 0 && (sub as any).recurring_plan_id) {
      const { data: planItems } = await supabase
        .from("recurring_plan_items")
        .select("id, item_type, service_id, product_id, quantity, unit_price")
        .eq("plan_id", (sub as any).recurring_plan_id)
      if (planItems && planItems.length > 0) {
        items = planItems as any[]
      }
    }

    const grantableItems = items.filter(item =>
      (item.item_type === 'service' && item.service_id) ||
      (item.item_type === 'product' && item.product_id)
    )

    if (grantableItems.length === 0) {
      return { success: true, grantedCount: 0 } // No services/products, nothing to grant
    }

    // 2. Calculate credit expiration date
    let expiresAt: string | null = null
    if (input.expiresAtOverride) {
      expiresAt = input.expiresAtOverride
    } else {
      const policy = plan?.credit_expiration_policy || 'end_of_cycle'
      if (policy === 'end_of_cycle') {
        expiresAt = input.nextExecutionAt || sub.next_execution_at
      } else if (policy === 'fixed_days' && plan?.credit_expiration_days) {
        const date = new Date()
        date.setDate(date.getDate() + plan.credit_expiration_days)
        expiresAt = date.toISOString()
      }
    }

    let grantedCount = 0

    // 3. Grant credits for each service/product item
    for (const item of grantableItems) {
      const quantity = Number(item.quantity || 1)
      const idempotencyKey = `grant:${input.executionId}:${item.id}`

      // Idempotency check: did we already grant credits for this item in this execution?
      const { data: existingLedger } = await supabase
        .from("subscription_item_credit_ledger")
        .select("id")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle()

      if (existingLedger) {
        continue // Already granted
      }

      // Insert credit record
      const { data: credit, error: creditErr } = await supabase
        .from("subscription_item_credits")
        .insert({
          partner_id: input.partnerId,
          customer_id: input.customerId,
          subscription_id: input.subscriptionId,
          subscription_item_id: item.id,
          service_id: item.service_id || null,
          product_id: item.product_id || null,
          quantity,
          consumed: 0,
          expires_at: expiresAt,
        })
        .select("id")
        .single()

      if (creditErr || !credit) {
        console.error(`[grantSubscriptionCredits] Failed to insert credit row:`, creditErr)
        throw new Error(creditErr?.message || "Falha ao conceder crédito")
      }

      // Log in credit ledger
      const { error: ledgerErr } = await supabase
        .from("subscription_item_credit_ledger")
        .insert({
          partner_id: input.partnerId,
          customer_id: input.customerId,
          service_id: item.service_id || null,
          product_id: item.product_id || null,
          quantity,
          transaction_type: 'grant',
          credit_id: credit.id,
          execution_id: input.executionId,
          idempotency_key: idempotencyKey,
        })

      if (ledgerErr) {
        console.error(`[grantSubscriptionCredits] Failed to insert ledger row:`, ledgerErr)
        throw new Error(ledgerErr.message)
      }

      grantedCount += quantity
    }

    return { success: true, grantedCount }
  } catch (err: any) {
    return { success: false, grantedCount: 0, error: err?.message || String(err) }
  }
}

/**
 * Consumes credits for a service booking using FIFO policy.
 */
export async function consumeSubscriptionCredits(
  supabase: SupabaseClient,
  input: {
    partnerId: string
    customerId: string
    serviceId?: string | null
    productId?: string | null
    quantity: number
    appointmentId?: string | null
    orderId?: string | null
    idempotencyKey?: string | null
  }
): Promise<{ success: boolean; error?: string }> {
  if (!input.serviceId && !input.productId) {
    return { success: false, error: "Informe serviceId ou productId." }
  }

  // Call the database function
  // This SECURITY DEFINER RPC mutates credit balances and is service-role only.
  // Callers perform their user/partner checks before reaching this server helper.
  const { data, error } = await getAdminClient().rpc("consume_credits_fifo", {
    p_partner_id: input.partnerId,
    p_customer_id: input.customerId,
    p_service_id: input.serviceId || null,
    p_product_id: input.productId || null,
    p_quantity: input.quantity,
    p_appointment_id: input.appointmentId || null,
    p_order_id: input.orderId || null,
    p_idempotency_key: input.idempotencyKey || null,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  if (data === true) {
    return { success: true }
  } else {
    return { success: false, error: "Créditos insuficientes para agendamento." }
  }
}

/**
 * Refunds consumed credits if an appointment or order is cancelled.
 */
export async function refundSubscriptionCredits(
  supabase: SupabaseClient,
  input: {
    partnerId: string
    customerId: string
    appointmentId?: string | null
    orderId?: string | null
    idempotencyKey?: string | null
  }
): Promise<{ success: boolean; refundedCount: number; error?: string }> {
  try {
    // 1. Fetch all consume transactions for the given target
    let query = supabase
      .from("subscription_item_credit_ledger")
      .select("id, credit_id, service_id, product_id, quantity")
      .eq("transaction_type", "consume")

    if (input.appointmentId) {
      query = query.eq("appointment_id", input.appointmentId)
    } else if (input.orderId) {
      query = query.eq("order_id", input.orderId)
    } else {
      return { success: false, refundedCount: 0, error: "Informe appointmentId ou orderId." }
    }

    const { data: consumes, error: fetchErr } = await query

    if (fetchErr) throw fetchErr
    if (!consumes || consumes.length === 0) {
      return { success: true, refundedCount: 0 } // Nothing to refund
    }

    let refundedCount = 0

    for (const consume of consumes) {
      if (!consume.credit_id) continue

      const refundQty = Math.abs(consume.quantity)
      const idempotencyKey = input.idempotencyKey 
        ? `${input.idempotencyKey}:${consume.id}`
        : `refund:${consume.id}`

      // Idempotency guard
      const { data: existingRefund } = await supabase
        .from("subscription_item_credit_ledger")
        .select("id")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle()

      if (existingRefund) continue

      // Update credit row (reduce consumed count)
      const { error: updateErr } = await supabase.rpc("refund_credit_row", {
        p_credit_id: consume.credit_id,
        p_qty: refundQty
      })

      // If rpc fails or doesn't exist, we can fallback to standard update
      if (updateErr) {
        // Fallback: fetch credit, decrement consumed
        const { data: credit } = await supabase
          .from("subscription_item_credits")
          .select("consumed")
          .eq("id", consume.credit_id)
          .single()

        if (credit) {
          await supabase
            .from("subscription_item_credits")
            .update({
              consumed: Math.max(0, credit.consumed - refundQty),
              updated_at: new Date().toISOString()
            })
            .eq("id", consume.credit_id)
        }
      }

      // Log positive entry in ledger (grant/refund)
      await supabase
        .from("subscription_item_credit_ledger")
        .insert({
          partner_id: input.partnerId,
          customer_id: input.customerId,
          service_id: consume.service_id,
          product_id: consume.product_id,
          quantity: refundQty,
          transaction_type: 'refund',
          credit_id: consume.credit_id,
          appointment_id: input.appointmentId || null,
          order_id: input.orderId || null,
          idempotency_key: idempotencyKey
        })

      refundedCount += refundQty
    }

    return { success: true, refundedCount }
  } catch (err: any) {
    return { success: false, refundedCount: 0, error: err?.message || String(err) }
  }
}

/**
 * Sweeps and expires all obsolete credits.
 */
export async function expireObsoleteCredits(
  supabase: SupabaseClient,
  partnerId: string
): Promise<{ success: boolean; expiredCount: number; error?: string }> {
  try {
    // Select active credits that have expired
    const { data: expiredList, error: listErr } = await supabase
      .from("subscription_item_credits")
      .select("id, customer_id, service_id, product_id, quantity, consumed")
      .eq("partner_id", partnerId)
      .lt("expires_at", new Date().toISOString())

    // Filter in JavaScript to be compliant with standard JS filtering
    const filtered = (expiredList || []).filter(c => c.quantity > c.consumed)

    if (filtered.length === 0) {
      return { success: true, expiredCount: 0 }
    }

    let expiredCount = 0

    for (const credit of filtered) {
      const remaining = credit.quantity - credit.consumed
      const idempotencyKey = `expire:${credit.id}`

      // Update credit consumed count to quantity
      const { error: updateErr } = await supabase
        .from("subscription_item_credits")
        .update({
          consumed: credit.quantity,
          updated_at: new Date().toISOString()
        })
        .eq("id", credit.id)

      if (updateErr) continue

      // Log in ledger
      await supabase
        .from("subscription_item_credit_ledger")
        .insert({
          partner_id: partnerId,
          customer_id: credit.customer_id,
          service_id: credit.service_id,
          product_id: credit.product_id,
          quantity: -remaining,
          transaction_type: 'expire',
          credit_id: credit.id,
          idempotency_key: idempotencyKey
        })

      expiredCount += remaining
    }

    return { success: true, expiredCount }
  } catch (err: any) {
    return { success: false, expiredCount: 0, error: err?.message || String(err) }
  }
}

/**
 * Sweeps and expires all obsolete credits globally.
 */
export async function expireObsoleteCreditsGlobally(
  supabase: SupabaseClient
): Promise<{ success: boolean; expiredCount: number; error?: string }> {
  try {
    const { data: expiredList, error: listErr } = await supabase
      .from("subscription_item_credits")
      .select("id, partner_id, customer_id, service_id, product_id, quantity, consumed")
      .lt("expires_at", new Date().toISOString())
      
    if (listErr) throw listErr

    const filtered = (expiredList || []).filter(c => c.quantity > c.consumed)

    if (filtered.length === 0) {
      return { success: true, expiredCount: 0 }
    }

    let expiredCount = 0

    for (const credit of filtered) {
      const remaining = credit.quantity - credit.consumed
      const idempotencyKey = `expire:${credit.id}`

      // Update credit consumed count to quantity
      const { error: updateErr } = await supabase
        .from("subscription_item_credits")
        .update({
          consumed: credit.quantity,
          updated_at: new Date().toISOString()
        })
        .eq("id", credit.id)

      if (updateErr) continue

      // Log in ledger
      await supabase
        .from("subscription_item_credit_ledger")
        .insert({
          partner_id: credit.partner_id,
          customer_id: credit.customer_id,
          service_id: credit.service_id,
          product_id: credit.product_id,
          quantity: -remaining,
          transaction_type: 'expire',
          credit_id: credit.id,
          idempotency_key: idempotencyKey
        })

      expiredCount += remaining
    }

    return { success: true, expiredCount }
  } catch (err: any) {
    return { success: false, expiredCount: 0, error: err?.message || String(err) }
  }
}

/**
 * Atomic helper to reset expired credits and grant fresh credits for a cycle via SQL RPC.
 */
export async function resetAndGrantSubscriptionCredits(
  supabase: SupabaseClient,
  input: { subscriptionId: string; executionId?: string }
): Promise<{ success: boolean; grantedCount: number; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("reset_and_grant_subscription_credits", {
      p_subscription_id: input.subscriptionId,
      p_execution_id: input.executionId || null,
    })
    if (error) throw error
    return { success: true, grantedCount: Number(data || 0) }
  } catch (err: any) {
    return { success: false, grantedCount: 0, error: err?.message || String(err) }
  }
}
