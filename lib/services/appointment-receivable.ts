import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveMarketplaceOrderFinanceAccountId } from "@/app/actions/erp/finance-accounts"
import { startOfDay, getDefaultTimezone } from "@/lib/date"

export type SyncAppointmentReceivableParams = {
  supabase: SupabaseClient
  partnerId: string
  appointmentId: string
  customerId: string | null
  serviceName: string
  startDate: string
  remaining: number
  paidAmount: number
  paymentMethod?: string | null
  financeAccountId?: string | null
}

/**
 * Idempotent receivable + optional payment transaction for appointments.
 * Shared by storefront fulfillment, ERP, and recurring executions.
 */
export async function syncAppointmentReceivable(
  params: SyncAppointmentReceivableParams,
): Promise<string | null> {
  const { supabase, partnerId, appointmentId, customerId, serviceName, startDate, remaining, paidAmount, paymentMethod, financeAccountId: preResolvedFinanceAccountId } =
    params

  if (remaining <= 0.009) {
    const ref = `appointment:${appointmentId}:receivable`
    await supabase
      .from("transactions")
      .update({
        status: "paid",
        payment_date: new Date().toISOString().slice(0, 10),
        payment_type: paymentMethod || "Agendamento",
      })
      .eq("partner_id", partnerId)
      .eq("reference_note", ref)
      .eq("status", "pending")
    return null
  }

  const ref = `appointment:${appointmentId}:receivable`
  const financeAccountId = preResolvedFinanceAccountId || await resolveMarketplaceOrderFinanceAccountId(supabase as any, partnerId, false)

  const { data: existing } = await supabase
    .from("transactions")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("reference_note", ref)
    .limit(1)
    .maybeSingle()

  let receivableId = existing?.id as string | undefined

  if (receivableId) {
    await supabase
      .from("transactions")
      .update({
        amount: remaining,
        original_amount: remaining,
        status: "pending",
        payment_type: paymentMethod || "Agendamento",
      })
      .eq("id", receivableId)
  } else {
    const { data: txData } = await supabase
      .from("transactions")
      .insert({
        partner_id: partnerId,
        description: serviceName,
        category: "Vendas",
        customer_id: customerId,
        contact_type: "customer",
        amount: remaining,
        due_date: startDate,
        payment_date: paidAmount > 0.009 ? new Date().toISOString().slice(0, 10) : null,
        transaction_date: startOfDay(startDate, getDefaultTimezone()).toISOString(),
        status: "pending",
        payment_type: paymentMethod || "Agendamento",
        original_amount: remaining,
        fee_amount: 0,
        transaction_type: "income",
        origin: "system",
        reference_note: ref,
        account_id: financeAccountId || null,
      })
      .select("id")
      .single()

    receivableId = txData?.id
  }

  if (paidAmount > 0.009) {
    const payRef = `appointment:${appointmentId}:payment`
    const { data: existingPay } = await supabase
      .from("transactions")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("reference_note", payRef)
      .maybeSingle()

    if (!existingPay?.id) {
      const { data: paidTx } = await supabase
        .from("transactions")
        .insert({
          partner_id: partnerId,
          description: serviceName,
          category: "Vendas",
          customer_id: customerId,
          contact_type: "customer",
          amount: paidAmount,
          due_date: startDate,
          payment_date: new Date().toISOString().slice(0, 10),
          transaction_date: startOfDay(startDate, getDefaultTimezone()).toISOString(),
          status: "paid",
          payment_type: paymentMethod || "Agendamento",
          original_amount: paidAmount,
          fee_amount: 0,
          transaction_type: "income",
          origin: "system",
          reference_note: payRef,
          account_id: financeAccountId || null,
        })
        .select("id")
        .single()

      if (paidTx?.id) {
        await supabase
          .from("appointments")
          .update({ payment_transaction_id: paidTx.id })
          .eq("id", appointmentId)
      }
    }
  }

  return receivableId || null
}
