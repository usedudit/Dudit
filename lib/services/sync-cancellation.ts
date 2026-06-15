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
): Promise<void> {
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
