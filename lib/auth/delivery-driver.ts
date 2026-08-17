import "server-only"

import { requireUser, ForbiddenError } from "@/lib/auth/authorization"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"

export async function requireDeliveryDriver() {
  const user = await requireUser()
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from("delivery_drivers")
    .select("user_id, is_active")
    .eq("user_id", user.id)
    .maybeSingle()

  if (error || !data || data.is_active !== true) {
    throw new ForbiddenError("Acesso restrito ao portal de entregadores")
  }

  return { user, driverId: user.id }
}
