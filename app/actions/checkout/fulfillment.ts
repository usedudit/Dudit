"use server"

import { createAdminClient } from "@/lib/supabase/server"

export async function checkSubscriptionStatusAction(subscriptionId: string) {
  if (!subscriptionId) {
    return { error: "ID da assinatura não fornecido" }
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from("recurring_subscriptions")
    .select("status, partner_id")
    .eq("id", subscriptionId)
    .single()

  if (error) {
    return { error: error.message }
  }

  return { status: data?.status, partner_id: data?.partner_id }
}