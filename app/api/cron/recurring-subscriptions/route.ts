import { isValidBearerToken, timingSafeStringEqual } from "@/lib/security/timing-safe"
import { NextResponse } from "next/server"
import {
  runDueRecurringSubscriptionsAction,
  sweepExpiredPriceChangeWindowsAction,
} from "@/app/actions/erp/recurring-subscriptions"
import { getAdminClient } from "@/lib/supabase/admin"

// O cron-job.org corta a conexão em 30s. As execuções que não couberem no
// orçamento continuam pendentes no banco e entram na próxima rodada.
const RUN_BUDGET_MS = 22_000
const MIN_WINDOW_MS = 3_000

export async function GET(req: Request) {
  const startedAt = Date.now()
  try {
    const authHeader = req.headers.get("Authorization")
    const customHeaderSecret = req.headers.get("x-cron-secret")
    const url = new URL(req.url)
    const querySecret = url.searchParams.get("key") || url.searchParams.get("secret")
    const secret = process.env.CRON_SECRET

    const isAuthorized =
      isValidBearerToken(authHeader, secret) ||
      (secret && customHeaderSecret && timingSafeStringEqual(customHeaderSecret, secret)) ||
      (secret && querySecret && timingSafeStringEqual(querySecret, secret))

    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 1) Congela janelas de consentimento vencidas ANTES de rodar os ciclos, para
    // não cobrar assinaturas que ficaram aguardando resposta do cliente.
    const sweep = await sweepExpiredPriceChangeWindowsAction(100)
    const frozenPriceChanges = sweep.success ? sweep.data?.frozen ?? 0 : 0

    // 2) Executa processamento via RPC do PostgreSQL para assinaturas vencidas
    let rpcProcessed = 0
    try {
      const admin = getAdminClient()
      const { data: rpcCount, error: rpcErr } = await admin.rpc(
        "cron_process_due_recurring_subscriptions",
        { p_limit: 50 },
      )
      if (!rpcErr && typeof rpcCount === "number") {
        rpcProcessed = rpcCount
      }
    } catch (e) {
      console.error("[cron/recurring-subscriptions] RPC cron_process_due_recurring_subscriptions warning:", e)
    }

    const deadline = startedAt + RUN_BUDGET_MS
    if (deadline - Date.now() < MIN_WINDOW_MS) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "deadline",
        frozenPriceChanges,
        rpcProcessed,
        elapsedMs: Date.now() - startedAt,
      })
    }

    // 3) Processa a fila de execuções geradas (cobrança, pedidos, concessão/reset de créditos)
    const limit = 200
    const result = await runDueRecurringSubscriptionsAction(limit, { deadline })
    if (!result.success || !result.data) {
      return NextResponse.json({ error: result.error || "No data returned" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      frozenPriceChanges,
      rpcProcessed,
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

export async function POST(req: Request) {
  return GET(req)
}
