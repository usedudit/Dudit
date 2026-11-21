import { isValidBearerToken } from "@/lib/security/timing-safe"
import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"
import { expireAllExpiredEnforcements } from "@/lib/services/enforcement-expiration.service"

export async function GET(req: Request) {
  const startedAt = Date.now()
  try {
    const authHeader = req.headers.get("Authorization")
    const secret = process.env.CRON_SECRET
    if (!isValidBearerToken(authHeader, secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const client = getAdminClient()
    const result = await expireAllExpiredEnforcements(client)

    return NextResponse.json({
      success: true,
      ...result,
      elapsedMs: Date.now() - startedAt,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 })
  }
}
