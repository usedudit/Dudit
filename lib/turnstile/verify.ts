import "server-only"

export interface TurnstileVerificationResult {
  success: boolean
  hostname?: string
  action?: string
  cdata?: string
  errorCodes?: string[]
  error?: string
}

/**
 * Validação server-side canônica do Cloudflare Turnstile conforme especificação oficial.
 * Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
export async function verifyTurnstileToken({
  token,
  expectedAction,
  remoteIp,
}: {
  token?: string | null
  expectedAction?: string
  remoteIp?: string
}): Promise<TurnstileVerificationResult> {
  const secret = process.env.TURNSTILE_SECRET

  if (!secret) {
    console.warn("[TURNSTILE] TURNSTILE_SECRET não está configurado nas variáveis de ambiente.")
    return { success: false, error: "missing-secret" }
  }

  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return { success: false, error: "invalid-token" }
  }

  const expectedHostnames = new Set(
    (process.env.TURNSTILE_HOSTNAMES ?? "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean)
  )

  try {
    const params = new URLSearchParams({
      secret,
      response: token,
    })

    if (remoteIp) {
      params.append("remoteip", remoteIp)
    }

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
      body: params,
    })

    if (!res.ok) {
      throw new Error(`Turnstile siteverify respondeu com HTTP ${res.status}`)
    }

    const data = await res.json()

    if (!data.success) {
      return {
        success: false,
        errorCodes: data["error-codes"],
        error: "verification-failed",
      }
    }

    if (expectedAction && data.action && data.action !== expectedAction) {
      return {
        success: false,
        error: "action-mismatch",
      }
    }

    if (expectedHostnames.size > 0 && data.hostname && !expectedHostnames.has(data.hostname)) {
      return {
        success: false,
        error: "hostname-mismatch",
      }
    }

    return {
      success: true,
      hostname: data.hostname,
      action: data.action,
      cdata: data.cdata,
    }
  } catch (err: any) {
    console.error("[TURNSTILE] Falha na validação do token:", err)
    return {
      success: false,
      error: err.message || "network-error",
    }
  }
}
