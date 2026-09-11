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
  options?: { refundMode?: 'store_credit' | 'financial' | 'none'; orderData?: any }
): Promise<void> {
  let orderPartnerId: string | null = null

  // Refund subscription credits or exchange credits if any were consumed
  try {
    let order = options?.orderData
    if (!order) {
      const { data: fetchedOrder, error: orderError } = await supabase
        .from("orders")
        .select("id, partner_id, buyer_id, customer_id, store_id, paid_amount, exchange_return_request_id, payment_breakdown")
        .eq("id", orderId)
        .single()

      if (orderError || !fetchedOrder?.partner_id) {
        console.error("[syncCancelledOrder] Order not found or missing partner scope:", orderId)
        return
      }
      order = fetchedOrder
    }

    orderPartnerId = order.partner_id

    if (order.buyer_id) {
      // Marketplace buyers do not have partner_users membership. Resolve the
      // canonical ERP customer only inside the already-authorized order scope.
      // Never use buyer_id directly as a customers.id without this mapping.
      let customerId: string | null = order.customer_id || null
      if (!customerId) {
        const { data: marketplaceCustomer } = await supabase
          .from("customers")
          .select("id")
          .eq("partner_id", order.partner_id)
          .eq("marketplace_user_id", order.buyer_id)
          .maybeSingle()
        customerId = marketplaceCustomer?.id || null
      }

      if (customerId) {
        const { refundSubscriptionCredits } = await import("@/lib/services/credit.service")
        await refundSubscriptionCredits(supabase, {
          partnerId: order.partner_id,
          customerId,
          orderId,
        })
      }

      if (order.exchange_return_request_id && options?.refundMode === "store_credit" && customerId) {
        const exchangeCreditAmount = Number(order.paid_amount || 0)
        if (exchangeCreditAmount > 0) {
          await supabase.from("store_credits").insert({
            partner_id: order.partner_id,
            store_id: order.store_id || null,
            customer_id: customerId,
            return_request_id: order.exchange_return_request_id,
            amount: exchangeCreditAmount,
            remaining_amount: exchangeCreditAmount,
            metadata: { cancellation_notes: `Estorno do pedido de troca ${orderId}` },
          })

          const { data: customer } = await supabase
            .from("customers")
            .select("store_credit")
            .eq("id", customerId)
            .eq("partner_id", order.partner_id)
            .single()

          await supabase
            .from("customers")
            .update({
              store_credit: (Number(customer?.store_credit || 0) + exchangeCreditAmount),
              updated_at: new Date().toISOString(),
            })
            .eq("id", customerId)
            .eq("partner_id", order.partner_id)
        }
      }
    }
  } catch (err) {
    console.error("[syncCancelledOrder] Error refunding subscription or exchange credits:", err)
  }

  // 1. Cancel linked delivery orders and update delivery status if all orders are cancelled
  if (orderPartnerId) {
    try {
      const { data: deliveryLinks } = await supabase
        .from("delivery_orders")
        .select("id, delivery_id, status, deliveries!inner(id, partner_id, status, delivery_person_id)")
        .eq("order_id", orderId)

      for (const link of deliveryLinks || []) {
        const delivery = (link as any).deliveries
        if (!delivery?.id) continue

        // Update this delivery_order link to cancelled
        await supabase
          .from("delivery_orders")
          .update({ status: "cancelled" })
          .eq("id", link.id)

        // Check if all delivery_orders in this delivery are now cancelled/failed
        const { data: allDeliveryOrders } = await supabase
          .from("delivery_orders")
          .select("id, status")
          .eq("delivery_id", delivery.id)

        const allCancelledOrFailed = (allDeliveryOrders || []).every(
          (d: any) => d.status === "cancelled" || d.status === "delivery_failed"
        )

        if (allCancelledOrFailed && delivery.status !== "delivered" && delivery.status !== "cancelled") {
          await supabase
            .from("deliveries")
            .update({
              status: "cancelled",
              updated_at: new Date().toISOString(),
            })
            .eq("id", delivery.id)
            .eq("partner_id", orderPartnerId)

          if (delivery.delivery_person_id) {
            try {
              const { reverseCommissionForEntity } = await import("@/lib/services/commission-ledger.service")
              await reverseCommissionForEntity({
                supabase,
                partnerId: orderPartnerId,
                entityType: "delivery",
                entityId: delivery.id,
                partnerUserId: String(delivery.delivery_person_id),
                createdByUserId: null,
              })
            } catch (commErr) {
              console.warn("[syncCancelledOrder] reverseCommissionForEntity error:", commErr)
            }
          }
        }
      }
    } catch (deliveryErr) {
      console.error("[syncCancelledOrder] Error syncing linked delivery:", deliveryErr)
    }
  }

  // 2. Fetch appointments linked to the order (by marketplace_order_id or linked order_items)
  let orderItemIds: string[] = []
  try {
    const { data: orderItems } = await supabase
      .from("order_items")
      .select("id")
      .eq("order_id", orderId)
    orderItemIds = (orderItems || []).map((item: any) => item.id).filter(Boolean)
  } catch (itemErr) {
    console.warn("[syncCancelledOrder] Error fetching order items for appointment linkage:", itemErr)
  }

  let apptQuery = supabase
    .from("appointments")
    .select("id, status, receivable_transaction_id, payment_transaction_id, store_id, price, paid_amount, partner_id, customer_id, service_name, start_date, start_time")

  if (orderItemIds.length > 0) {
    apptQuery = apptQuery.or(`marketplace_order_id.eq.${orderId},order_item_id.in.(${orderItemIds.join(",")})`)
  } else {
    apptQuery = apptQuery.eq("marketplace_order_id", orderId)
  }

  if (orderPartnerId) {
    apptQuery = apptQuery.eq("partner_id", orderPartnerId)
  }

  const { data: appointments, error: fetchApptsError } = await apptQuery

  if (fetchApptsError) {
    console.error("[syncCancelledOrder] Error fetching appointments:", fetchApptsError)
    return
  }

  if (appointments && appointments.length > 0) {
    // Identify active appointments to cancel (not Concluído or Cancelado)
    const activeAppts = appointments.filter(
      (appt) => appt.status !== "Concluído" && appt.status !== "Cancelado"
    )

    if (activeAppts.length > 0) {
      const activeApptIds = activeAppts.map((appt) => appt.id)
      const { error: updateApptsError } = await supabase
        .from("appointments")
        .update({
          status: "Cancelado",
          payment_status: "unpaid",
          updated_at: new Date().toISOString(),
        })
        .in("id", activeApptIds)

      if (updateApptsError) {
        console.error("[syncCancelledOrder] Error updating appointments status:", updateApptsError)
      } else {
        // Release consumable stock items linked to these appointments
        try {
          const { handleAppointmentItemsStockMovement } = await import("@/app/actions/erp/appointment-items")
          for (const appt of activeAppts) {
            await handleAppointmentItemsStockMovement({
              appointmentId: appt.id,
              partnerId: appt.partner_id || orderPartnerId || "",
              oldStatus: appt.status,
              newStatus: "Cancelado",
              userId: (appt as any).user_id || orderPartnerId || "",
              storeId: appt.store_id || null,
              paymentStatus: "unpaid",
              paidAmount: Number(appt.paid_amount || 0),
              price: Number(appt.price || 0),
            })
          }
        } catch (stockErr) {
          console.warn("[syncCancelledOrder] Error releasing appointment items stock:", stockErr)
        }
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
      let txQuery = supabase
        .from("transactions")
        .select("id, status")
        .in("id", Array.from(txIds))

      if (orderPartnerId) {
        txQuery = txQuery.eq("partner_id", orderPartnerId)
      }

      const { data: txs, error: fetchTxsError } = await txQuery

      if (fetchTxsError) {
        console.error("[syncCancelledOrder] Error fetching transactions:", fetchTxsError)
      } else if (txs && txs.length > 0) {
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

  // 6. Invalidate agenda and appointment caches
  try {
    const { revalidatePath } = await import("next/cache")
    revalidatePath("/erp/agendamentos")
    revalidatePath("/erp/servicos")
    revalidatePath("/erp/pedidos")
  } catch {
    // Non-fatal if outside request context
  }
}
