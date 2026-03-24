import { NextResponse } from "next/server"
import { generateCSRFToken, getCSRFToken } from "@/lib/csrf-protection"

/**
 * GET /api/csrf-token
 * Returns the current CSRF token or generates a new one
 */
export async function GET() {
  try {
    // Try to get existing token
    let token = await getCSRFToken()

    // If no token exists, generate a new one
    if (!token) {
      token = await generateCSRFToken()
    }

    return NextResponse.json({ token }, {
      headers: { "Cache-Control": "private, max-age=300" },
    })
  } catch (error) {
    console.error("[CSRF] Error generating token:", error)
    return NextResponse.json({ error: "Erro ao gerar token CSRF" }, { status: 500 })
  }
}
