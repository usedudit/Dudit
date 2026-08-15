import "server-only"

import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"

function equalsSecret(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

export function validateBackupCronRequest(req: Request): NextResponse | null {
  const secret = process.env.BACKUP_CRON_SECRET?.trim()
  if (!secret) {
    return NextResponse.json({ success: false, error: "Server misconfiguration" }, { status: 500 })
  }

  const authorization = req.headers.get("authorization") || ""
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : ""
  if (!equalsSecret(provided, secret)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  return null
}
