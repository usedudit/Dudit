import { isValidBearerToken } from "@/lib/security/timing-safe"
import { NextResponse } from "next/server"
import { sweepDueNotificationJobs } from "@/lib/services/notification.service"

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization")
    const secret = process.env.CRON_SECRET
    if (!isValidBearerToken(authHeader, secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const processed = await sweepDueNotificationJobs(100)
    return NextResponse.json({ success: true, processed })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
