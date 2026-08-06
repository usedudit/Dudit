import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Sync cancelled order status to appointments and transactions.
 * Rules:
 * 1. Cancel appointments (status = 'Cancelado') only if they are not already 'Concluído' or 'Cancelado'.
 * 2. Cancel linked transactions only if their status is 'pending', 'Pendente', or 'active'.
 *    Never alter status 'paid', 'partially_paid', 'overdue', 'refunded', or 'cancelled'.
 */
export async function syncCancelledOrderAppointmentsAndTransactions(
  supabase: SupabaseClient,
  orderId: string,
  options?: { refundMode?: 'store_credit' | 'financial' | 'none' }
): Promise<void> {
  // Refund subscription credits or exchange credits if any were consumed
  try {
    const { data: order } = await supabase
      .from("orders")
      .select("id, partner_id, buyer_id, store_id, paid_amount, exchange_return_request_id, payment_breakdown")
      .eq("id", orderId)
      .single()

    if (order?.partner_id && order?.buyer_id) {
      const { refundSubscriptionCredits } = await import("@/lib/services/credit.service")
      await refundSubscriptionCredits(supabase, {
        partnerId: order.partner_id,
        customerId: order.buyer_id,
        orderId,
      })

      if (order.exchange_return_request_id && options?.refundMode === "store_credit") {
        const exchangeCreditAmount = Number(order.paid_amount || 0)
        if (exchangeCreditAmount > 0) {
          await supabase.from("store_credits").insert({
            partner_id: order.partner_id,
            store_id: order.store_id || null,
            customer_id: order.buyer_id,
            return_request_id: order.exchange_return_request_id,
            amount: exchangeCreditAmount,
            remaining_amount: exchangeCreditAmount,
            metadata: { cancellation_notes: `Estorno do pedido de troca ${orderId}` },
          })

          const { data: customer } = await supabase
            .from("customers")
            .select("store_credit")
            .eq("id", order.buyer_id)
            .single()

          await supabase
            .from("customers")
            .update({
              store_credit: (Number(customer?.store_credit || 0) + exchangeCreditAmount),
              updated_at: new Date().toISOString(),
            })
            .eq("id", order.buyer_id)
        }
      }
    }
  } catch (err) {
    console.error("[syncCancelledOrder] Error refunding subscription or exchange credits:", err)
  }

  // 1. Fetch appointments linked to the order
  const { data: appointments, error: fetchApptsError } = await supabase
    .from("appointments")
    .select("id, status, receivable_transaction_id, payment_transaction_id")
    .eq("marketplace_order_id", orderId)

  if (fetchApptsError) {
    console.error("[syncCancelledOrder] Error fetching appointments:", fetchApptsError)
    return
  }

  if (!appointments || appointments.length === 0) {
    return
  }

  // 2. Identify active appointments to cancel (not Concluído or Cancelado)
  const activeAppts = appointments.filter(
    (appt) => appt.status !== "Concluído" && appt.status !== "Cancelado"
  )

  if (activeAppts.length > 0) {
    const activeApptIds = activeAppts.map((appt) => appt.id)
    const { error: updateApptsError } = await supabase
      .from("appointments")
      .update({
        status: "Cancelado",
        updated_at: new Date().toISOString(),
      })
      .in("id", activeApptIds)

    if (updateApptsError) {
      console.error("[syncCancelledOrder] Error updating appointments status:", updateApptsError)
    }
  }

  // 3. Collect transaction IDs to check
  const txIds = new Set<string>()
  for (const appt of appointments) {
    if (appt.receivable_transaction_id) txIds.add(appt.receivable_transaction_id)
    if (appt.payment_transaction_id) txIds.add(appt.payment_transaction_id)
  }

  if (txIds.size > 0) {
    // 4. Fetch the transactions to check their current status
    const { data: txs, error: fetchTxsError } = await supabase
      .from("transactions")
      .select("id, status")
      .in("id", Array.from(txIds))

    if (fetchTxsError) {
      console.error("[syncCancelledOrder] Error fetching transactions:", fetchTxsError)
      return
    }

    if (txs && txs.length > 0) {
      // 5. Filter for transactions with status 'pending', 'Pendente', or 'active'
      const pendingStatuses = ["pending", "Pendente", "active"]
      const txsToCancel = txs.filter((tx) => pendingStatuses.includes(tx.status))

      if (txsToCancel.length > 0) {
        const txIdsToCancel = txsToCancel.map((tx) => tx.id)
        const { error: updateTxsError } = await supabase
          .from("transactions")
          .update({
            status: "cancelled",
            updated_at: new Date().toISOString(),
          })
          .in("id", txIdsToCancel)

        if (updateTxsError) {
          console.error("[syncCancelledOrder] Error updating transactions status:", updateTxsError)
        }
      }
    }
  }
}
