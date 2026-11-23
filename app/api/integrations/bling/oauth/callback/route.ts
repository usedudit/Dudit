import { type NextRequest, NextResponse } from "next/server"
import { createHmac } from "crypto"
import { cookies } from "next/headers"
import { getAdminClient } from "@/lib/supabase/admin"
import { encrypt } from "@/lib/cryptoService"
import { timingSafeStringEqual } from "@/lib/security/timing-safe"
import { exchangeBlingAuthCode } from "@/lib/services/integrations/bling/bling-client"
import {
  BLING_PROVIDER,
  findBlingIntegration,
  resolveBlingOAuthAppCredentials,
} from "@/lib/services/integrations/bling/bling-integration"
import { captureError } from "@/lib/monitoring/sentry"

export const dynamic = "force-dynamic"

const BLING_OAUTH_COOKIE = "bling_oauth_state"
const STATE_MAX_AGE_MS = 10 * 60 * 1000

function normalizeBaseUrl(rawUrl: string): string {
  return rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl
}

function getOAuthSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("OAUTH_STATE_SECRET must be configured in production.")
    }
    return "build-time-placeholder"
  }
  return secret
}

function validateBlingState(receivedState: string, cookieState: string | undefined): {
  valid: boolean
  partnerId?: string
  userId?: string
  error?: string
} {
  if (!receivedState || !cookieState) {
    return { valid: false, error: "missing_state" }
  }
  if (!timingSafeStringEqual(receivedState, cookieState)) {
    return { valid: false, error: "state_mismatch" }
  }

  try {
    const decoded = Buffer.from(receivedState, "base64url").toString("utf8")
    const parts = decoded.split(":")
    if (parts.length !== 5) return { valid: false, error: "malformed_state" }

    const [partnerId, userId, timestampStr, nonce, receivedHmac] = parts
    const timestamp = Number(timestampStr)
    if (!timestamp || Date.now() - timestamp > STATE_MAX_AGE_MS) {
      return { valid: false, error: "state_expired" }
    }

    const expectedHmac = createHmac("sha256", getOAuthSecret())
      .update(`${partnerId}:${userId}:${timestampStr}:${nonce}`)
      .digest("hex")

    if (!timingSafeStringEqual(receivedHmac, expectedHmac)) {
      return { valid: false, error: "invalid_signature" }
    }

    return { valid: true, partnerId, userId }
  } catch {
    return { valid: false, error: "decode_failed" }
  }
}

export async function GET(request: NextRequest) {
  const appUrl = normalizeBaseUrl(
    process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin || "https://dudit.com.br"
  )

  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  const oauthError = request.nextUrl.searchParams.get("error")

  if (oauthError) {
    return NextResponse.redirect(
      `${appUrl}/erp/configuracoes?tab=integracoes&bling_error=${encodeURIComponent(oauthError)}`
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/erp/configuracoes?tab=integracoes&bling_error=missing_code`)
  }

  const cookieStore = await cookies()
  const storedState = cookieStore.get(BLING_OAUTH_COOKIE)?.value
  cookieStore.delete(BLING_OAUTH_COOKIE)

  const validation = validateBlingState(state, storedState)
  if (!validation.valid || !validation.partnerId) {
    return NextResponse.redirect(
      `${appUrl}/erp/configuracoes?tab=integracoes&bling_error=${validation.error || "invalid_state"}`
    )
  }

  const partnerId = validation.partnerId
  const supabase = getAdminClient()

  try {
    // Garante que o provedor 'bling' existe no catálogo
    await supabase
      .from("integration_providers")
      .upsert(
        { slug: BLING_PROVIDER, category: "other", name: "Bling ERP", is_active: true, docs_url: "https://developer.bling.com.br" },
        { onConflict: "slug" }
      )

    const existing = await findBlingIntegration(supabase, partnerId)
    const { clientId, clientSecret } = resolveBlingOAuthAppCredentials(existing)

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(`${appUrl}/erp/configuracoes?tab=integracoes&bling_error=missing_credentials`)
    }

    const tokenData = await exchangeBlingAuthCode({ clientId, clientSecret, code })
    const nowIso = new Date().toISOString()
    const expiresAtIso = new Date(Date.now() + Number(tokenData.expires_in || 21600) * 1000).toISOString()

    // Tenta buscar o ID da empresa no Bling (companyId) para rotear webhooks globais de App Público
    let blingAccountId: string | null = existing?.account_id || null
    let blingAccountEmail: string | null = existing?.account_email || null
    try {
      const meRes = await fetch("https://api.bling.com.br/Api/v3/empresas/me/dados-basicos", {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/json" },
        cache: "no-store",
      })
      if (meRes.ok) {
        const meJson = await meRes.json().catch(() => ({}))
        const info = meJson?.data
        if (info?.id) blingAccountId = String(info.id)
        if (info?.email) blingAccountEmail = String(info.email)
      }
    } catch { }

    const existingConfig = (existing?.config as Record<string, any>) || {}
    const webhookSecret = existingConfig.webhook_secret || crypto.randomUUID().replace(/-/g, "")

    const existingCreds = (existing?.credentials as Record<string, any>) || {}

    const record = {
      partner_id: partnerId,
      provider_slug: BLING_PROVIDER,
      status: "connected",
      account_id: blingAccountId,
      account_email: blingAccountEmail,
      access_token_encrypted: encrypt(tokenData.access_token, BLING_PROVIDER),
      config: {
        sync_stock: existingConfig.sync_stock ?? true,
        auto_export_orders: existingConfig.auto_export_orders ?? true,
        default_deposit_id: existingConfig.default_deposit_id ?? null,
        webhook_secret: webhookSecret,
      },
      credentials: {
        ...existingCreds,
        refresh_token_encrypted: encrypt(tokenData.refresh_token, BLING_PROVIDER),
        token_expires_at: expiresAtIso,
      },
      metadata: {
        ...((existing?.metadata as Record<string, any>) || {}),
        token_expires_at: expiresAtIso,
        last_error: null,
      },
      connected_at: nowIso,
      disconnected_at: null,
      updated_at: nowIso,
    }

    const { error: upsertErr } = await supabase
      .from("partner_integrations")
      .upsert(record, { onConflict: "partner_id,provider_slug" })

    if (upsertErr) {
      throw new Error(upsertErr.message)
    }

    return NextResponse.redirect(`${appUrl}/erp/configuracoes?tab=integracoes&bling_connected=1`)
  } catch (err: any) {
    captureError(err, {
      module: "integrations",
      action: "bling_oauth_callback",
      partnerId,
      metadata: { provider: BLING_PROVIDER },
    })
    console.error("[BLING OAuth callback] error:", err)
    return NextResponse.redirect(
      `${appUrl}/erp/configuracoes?tab=integracoes&bling_error=${encodeURIComponent(err?.message || "callback_failed")}`
    )
  }
}
