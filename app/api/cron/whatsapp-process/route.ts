import { NextResponse } from "next/server"
import { processPendingWhatsappMessages } from "@/lib/services/whatsapp-dispatch.service"
import { processDueScheduledJobs } from "@/lib/services/whatsapp-automation.service"

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization")
    const secret = process.env.CRON_SECRET
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const [messagesResult, scheduledCount] = await Promise.all([
      processPendingWhatsappMessages(20),
      processDueScheduledJobs(30),
    ])

    return NextResponse.json({
      success: true,
      messagesProcessed: messagesResult.processed,
      scheduledJobsProcessed: scheduledCount,
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    )
  }
}
