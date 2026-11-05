import { isValidBearerToken } from "@/lib/security/timing-safe"
import { NextResponse } from "next/server"
import { runDueRecurringTransactions } from "@/lib/services/recurring-transactions.server"

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization")
    const secret = process.env.CRON_SECRET
    if (!isValidBearerToken(authHeader, secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const limit = 500
    const result = await runDueRecurringTransactions(limit)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      processed: result.data.processed_count,
      created: result.data.created_count,
      deactivated: result.data.deactivated_count,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 })
  }
}

