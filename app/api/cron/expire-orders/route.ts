import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { expireAllExpiredOrders } from "@/lib/services/order-expiration"

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization")
    const secret = process.env.CRON_SECRET
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const client = createAdminClient()
    const result = await expireAllExpiredOrders(client)

    return NextResponse.json({
      success: true,
      expiredCount: result.expiredCount,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 })
  }
}
