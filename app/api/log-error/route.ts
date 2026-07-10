import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.error("=== CLIENT ERROR LOG ===")
    console.error("Name:", body.name)
    console.error("Message:", body.message)
    console.error("Digest:", body.digest)
    console.error("Stack:", body.stack)
    console.error("=== END CLIENT ERROR LOG ===")
  } catch (e) {
    console.error("Failed to parse error log body:", e)
  }
  return NextResponse.json({ ok: true })
}
