import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { incrementMarketplaceView } from "@/lib/services/marketplace-metrics.service"

const VALID_TYPES = new Set(["produto", "servico", "plano"])

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const entityType = String(body.entityType || "")
    const entityId = String(body.entityId || "")

    if (!VALID_TYPES.has(entityType) || !entityId) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const supabase = await createAdminClient()
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
