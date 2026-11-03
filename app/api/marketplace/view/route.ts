import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { incrementMarketplaceView } from "@/lib/services/marketplace-metrics.service"

const VALID_TYPES = new Set(["produto", "servico", "plano"])
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const entityType = String(body.entityType || "")
    const entityId = String(body.entityId || "")

    if (!VALID_TYPES.has(entityType) || !UUID_REGEX.test(entityId)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const supabase = await createClient()
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
