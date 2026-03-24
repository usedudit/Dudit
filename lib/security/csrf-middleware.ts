/**
 * CSRF middleware for API routes and server actions
 */

import { validateCSRFToken } from "@/lib/csrf-protection"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

/**
 * CSRF validation result
 */
export interface CSRFValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validate CSRF token for API routes
 */
export async function validateCSRFForAPI(request: NextRequest): Promise<CSRFValidationResult> {
  // Skip CSRF validation for GET, HEAD, OPTIONS requests
  const method = request.method
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return { valid: true }
  }

  // Skip CSRF validation for webhooks (they use signature validation instead)
  const pathname = request.nextUrl.pathname
  if (pathname.includes("/webhook")) {
    return { valid: true }
  }

  const isValid = await validateCSRFToken(request)
  
  if (!isValid) {
    return {
      valid: false,
      error: "Token CSRF inválido ou ausente",
    }
  }

  return { valid: true }
}

/**
 * Wrapper for API routes with CSRF protection
 */
export function withCSRFProtection(
  handler: (request: NextRequest) => Promise<NextResponse>,
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const csrfValidation = await validateCSRFForAPI(request)
    
    if (!csrfValidation.valid) {
      return NextResponse.json(
        { error: csrfValidation.error || "CSRF token inválido" },
        { status: 403 },
      )
    }

    return handler(request)
  }
}

/**
 * Validate CSRF token for server actions
 * Note: Server actions in Next.js don't have direct access to Request object,
 * so we need to get the token from headers or form data
 */
export async function validateCSRFForAction(token?: string): Promise<CSRFValidationResult> {
  if (!token) {
    return {
      valid: false,
      error: "Token CSRF não fornecido",
    }
  }

  // Get token from cookies
  const { getCSRFToken } = await import("@/lib/csrf-protection")
  const cookieToken = await getCSRFToken()

  if (!cookieToken) {
    return {
      valid: false,
      error: "Token CSRF não encontrado nos cookies",
    }
  }

  // Constant-time comparison
  const { timingSafeEqual } = await import("@/lib/csrf-protection")
  const isValid = timingSafeEqual(
    Buffer.from(cookieToken, "utf-8"),
    Buffer.from(token, "utf-8"),
  )

  if (!isValid) {
    return {
      valid: false,
      error: "Token CSRF inválido",
    }
  }

  return { valid: true }
}
