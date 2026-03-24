import "server-only"
import { cookies } from "next/headers"
import { randomBytes, timingSafeEqual as cryptoTimingSafeEqual } from "crypto"

const CSRF_TOKEN_NAME = "csrf_token"
const CSRF_HEADER_NAME = "x-csrf-token"

export async function generateCSRFToken(): Promise<string> {
  const token = randomBytes(32).toString("hex")
  const cookieStore = await cookies()

  cookieStore.set(CSRF_TOKEN_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24, // 24 hours
  })

  return token
}

export async function validateCSRFToken(request: Request): Promise<boolean> {
  const cookieStore = await cookies()
  const cookieToken = cookieStore.get(CSRF_TOKEN_NAME)?.value
  const headerToken = request.headers.get(CSRF_HEADER_NAME)

  if (!cookieToken || !headerToken) {
    return false
  }

  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
}

// SECURITY: Use Node.js built-in crypto.timingSafeEqual for guaranteed constant-time comparison
export function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false
  }
  return cryptoTimingSafeEqual(a, b)
}

export async function getCSRFToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(CSRF_TOKEN_NAME)?.value
}
