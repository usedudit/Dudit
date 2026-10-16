import { NextResponse } from 'next/server'
import { revalidateExploreSearch } from '@/lib/utils/revalidation'

export async function GET(req: Request) {
  const start = Date.now()
  try {
    const authHeader = req.headers.get('Authorization')
    const secret = process.env.CRON_SECRET
    if (secret && authHeader && authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // O marketplace agora utiliza busca e browse 100% via PostgreSQL Full-Text Search (RPC)
    // e cache em memória RAM. As antigas leituras de chaves explore:index:* e data:v2:* no Redis
    // foram descontinuadas, economizando milhares de comandos ZRANGE e MGET periódicos.
    await revalidateExploreSearch({ silent: true })

    const elapsed = Date.now() - start
    return NextResponse.json({
      status: 'success',
      message: 'Explore index runs on PostgreSQL FTS; Redis legacy explore keys retired',
      audited: 0,
      synced: 0,
      missed: 0,
      elapsedMs: Math.round(elapsed),
    })
  } catch (error: any) {
    console.error("[Cron Reconciliation Error]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
