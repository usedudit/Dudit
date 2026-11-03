import { NextRequest, NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { incrementMarketplaceView } from "@/lib/services/marketplace-metrics.service"

const VALID_TYPES = new Set(["produto", "servico", "plano"])
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await checkRateLimitForAPI(RateLimitCategory.API_GENERAL)
    if (rateLimit.limited) {
      return NextResponse.json(rateLimit.body || { error: "Too many requests" }, {
        status: rateLimit.status || 429,
      })
    }

    const body = await request.json().catch(() => ({}))
    const entityType = String(body.entityType || "")
    const entityId = String(body.entityId || "")

    if (!VALID_TYPES.has(entityType) || !UUID_REGEX.test(entityId)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const supabase = getAdminClient()
    await incrementMarketplaceView(
      supabase,
      entityType as "produto" | "servico" | "plano",
      entityId,
    )

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
