/**
 * API Route: Processa jobs de moderação pendentes.
 * Chamado via Vercel Cron ou trigger manual.
 *
 * POST /api/moderation/process
 * Header: Authorization: Bearer <CRON_SECRET>
 *
 * Response: { processed, failed, retried, skipped, elapsed_ms }
 */

import { processPendingModerationJobs } from "@/lib/moderation/process-moderation-jobs"

export async function POST(req: Request) {
    const authHeader = req.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const metrics = await processPendingModerationJobs()
        return Response.json(metrics)
    } catch (error: any) {
        console.error("[MODERATION API] Fatal error:", error.message)
        return Response.json({ error: error.message }, { status: 500 })
    }
}
