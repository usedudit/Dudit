import { isValidBearerToken } from "@/lib/security/timing-safe"
import { NextResponse } from "next/server"
import { sweepAbandonedCarts } from "@/lib/services/cart-abandonment.service"

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization")
    const secret = process.env.CRON_SECRET
    if (!isValidBearerToken(authHeader, secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await sweepAbandonedCarts()

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 })
  }
}
