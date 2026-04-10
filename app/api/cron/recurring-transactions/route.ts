import { NextResponse } from "next/server"
import { runDueRecurringTransactionsAction } from "@/app/actions/erp/recurring-transactions"

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization")
    const secret = process.env.CRON_SECRET
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const limit = 500
    const result = await runDueRecurringTransactionsAction(limit)
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

