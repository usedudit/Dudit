export function getDefaultTimezone(): string {
  return process.env.APP_DEFAULT_TIMEZONE || "America/Sao_Paulo"
}

/**
 * Fetches the partner's configured timezone from the stores table.
 * Falls back to getDefaultTimezone() if not found.
 */
export async function getPartnerTimezone(partnerId: string): Promise<string> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/server")
    const supabase = createAdminClient()
    const { data } = await supabase
      .from("stores")
      .select("timezone")
      .eq("partner_id", partnerId)
      .limit(1)
      .maybeSingle()
    return data?.timezone || getDefaultTimezone()
  } catch {
    return getDefaultTimezone()
  }
}
