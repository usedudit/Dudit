import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"

export type ApplicationAccessLogInput = {
  ipAddress: string
  country: string | null
  method: string
  path: string
  statusCode: number
  userAgent: string | null
  cloudflareRayId: string | null
}

/** Stores a minimal request record without query strings, cookies, or bodies. */
export async function recordApplicationAccess(input: ApplicationAccessLogInput): Promise<void> {
  try {
    const { error } = await getAdminClient().from("application_access_logs").insert({
      ip_address: input.ipAddress,
      country: input.country,
      method: input.method,
      path: input.path,
      status_code: input.statusCode,
      user_agent: input.userAgent,
      cloudflare_ray_id: input.cloudflareRayId,
    })

    if (error) {
      console.error("[ACCESS-LOG] Failed to persist request record", { code: error.code })
    }
  } catch (error) {
    console.error("[ACCESS-LOG] Request record unavailable", {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export function sanitizeAccessLogPath(pathname: string): string {
  const sensitiveRoutes = ["/quote/", "/os/", "/reembolso/", "/invite/", "/entregadores/convite/"]
  for (const prefix of sensitiveRoutes) {
    if (pathname.startsWith(prefix)) return `${prefix}[redacted]`
  }

  return pathname
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "[id]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted]")
    .slice(0, 512)
}
