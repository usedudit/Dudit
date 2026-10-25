import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

const clientErrorSchema = z.object({
  name: z.string().trim().max(160).optional(),
  message: z.string().trim().max(2000).optional(),
  digest: z.string().trim().max(160).optional(),
  stack: z.string().trim().max(8000).optional(),
}).strict()

function cleanLogValue(value: string | undefined): string {
  return (value || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "?")
}

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") || 0)
  if (contentLength > 16 * 1024) {
    return NextResponse.json({ error: "Payload muito grande." }, { status: 413 })
  }

  const platformIP = (req as NextRequest & { ip?: string }).ip
  const rateLimit = await checkRateLimitForAPI(
    RateLimitCategory.CLIENT_ERROR_LOG,
    "client-error-log",
    platformIP,
  )
  if (rateLimit.limited) {
    return NextResponse.json(rateLimit.body, { status: rateLimit.status || 429 })
  }

  try {
    const body = clientErrorSchema.parse(await req.json())
    console.error("=== CLIENT ERROR LOG ===")
    console.error("Name:", cleanLogValue(body.name))
    console.error("Message:", cleanLogValue(body.message))
    console.error("Digest:", cleanLogValue(body.digest))
    console.error("Stack:", cleanLogValue(body.stack))
    console.error("=== END CLIENT ERROR LOG ===")
  } catch {
    return NextResponse.json({ error: "Payload de erro inválido." }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
