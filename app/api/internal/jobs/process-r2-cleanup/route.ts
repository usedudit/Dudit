import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { cronLogger } from "@/lib/internal-cron"
import { processR2CleanupBatch } from "@/lib/r2/cleanup-queue"

const JOB_NAME = "process-r2-cleanup"
export const maxDuration = 60
export const runtime = "nodejs"

export async function POST(req: Request) {
  const secret = process.env.R2_CLEANUP_CRON_SECRET
  if (!secret) {
    return NextResponse.json({ success: false, error: "Worker secret is not configured" }, { status: 503 })
  }
  const supplied = req.headers.get("authorization") || ""
  const expectedBytes = Buffer.from(`Bearer ${secret}`)
  const suppliedBytes = Buffer.from(supplied)
  if (
    expectedBytes.length !== suppliedBytes.length ||
    !timingSafeEqual(expectedBytes, suppliedBytes)
  ) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const startedAt = Date.now()
  cronLogger.start(JOB_NAME)
  try {
    const result = await processR2CleanupBatch()
    cronLogger.success(JOB_NAME, result, Date.now() - startedAt)
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    cronLogger.error(JOB_NAME, "R2 cleanup batch failed", {
      error: error?.message || "unknown_error",
    })
    return NextResponse.json(
      { success: false, error: "R2 cleanup batch failed" },
      { status: 500 },
    )
  }
}
