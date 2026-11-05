import { isValidBearerToken } from "@/lib/security/timing-safe"
import { NextResponse } from "next/server"
import { runDueRecurringSubscriptionsAction, sweepExpiredPriceChangeWindowsAction } from "@/app/actions/erp/recurring-subscriptions"

// O cron-job.org corta a conexão em 30s. As execuções que não couberem no
// orçamento continuam pendentes no banco e entram na próxima rodada.
const RUN_BUDGET_MS = 22_000
const MIN_WINDOW_MS = 3_000

export async function GET(req: Request) {
  const startedAt = Date.now()
  try {
    const authHeader = req.headers.get("Authorization")
    const secret = process.env.CRON_SECRET
    if (!isValidBearerToken(authHeader, secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Congela janelas de consentimento vencidas ANTES de rodar os ciclos, para
    // nao cobrar assinaturas que ficaram aguardando resposta do cliente.
    const sweep = await sweepExpiredPriceChangeWindowsAction(100)
    const frozenPriceChanges = sweep.success ? sweep.data?.frozen ?? 0 : 0

    const deadline = startedAt + RUN_BUDGET_MS
    if (deadline - Date.now() < MIN_WINDOW_MS) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "deadline",
        frozenPriceChanges,
        elapsedMs: Date.now() - startedAt,
      })
    }

    const limit = 200
    const result = await runDueRecurringSubscriptionsAction(limit, { deadline })
    if (!result.success || !result.data) {
      return NextResponse.json({ error: result.error || "No data returned" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      frozenPriceChanges,
      claimed: result.data.claimed,
      completed: result.data.completed,
      failed: result.data.failed,
      deferred: result.data.deferred,
      elapsedMs: Date.now() - startedAt,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
