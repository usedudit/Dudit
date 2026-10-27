import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { expireAllExpiredOrders } from "@/lib/services/order-expiration"

// O cron-job.org corta a conexão em 30s. Paramos de iniciar novos pedidos antes
// disso para a execução não ser marcada como timeout; o que sobrar fica para a
// próxima rodada, já que a consulta é sempre "vencidos até agora".
const RUN_BUDGET_MS = 22_000

export async function GET(req: Request) {
  const startedAt = Date.now()
  try {
    const authHeader = req.headers.get("Authorization")
    const secret = process.env.CRON_SECRET
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const client = createAdminClient()
    const result = await expireAllExpiredOrders(client, { deadline: startedAt + RUN_BUDGET_MS })

    return NextResponse.json({
      success: true,
      expiredCount: result.expiredCount,
      deferred: result.deferred,
      elapsedMs: Date.now() - startedAt,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 })
  }
}
