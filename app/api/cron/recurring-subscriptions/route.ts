import { NextResponse } from "next/server"
import { runDueRecurringSubscriptionsAction } from "@/app/actions/erp/recurring-subscriptions"

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization")
    const secret = process.env.CRON_SECRET
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const limit = 200
    const result = await runDueRecurringSubscriptionsAction(limit)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      claimed: result.data.claimed,
      completed: result.data.completed,
      failed: result.data.failed,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
