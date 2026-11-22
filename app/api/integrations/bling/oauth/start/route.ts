import { type NextRequest, NextResponse } from "next/server"
import { createHmac, randomBytes } from "crypto"
import { cookies } from "next/headers"
import { getAdminClient } from "@/lib/supabase/admin"
import { getCurrentUser, requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import {
  findBlingIntegration,
  resolveBlingOAuthAppCredentials,
} from "@/lib/services/integrations/bling/bling-integration"

export const dynamic = "force-dynamic"

const BLING_OAUTH_COOKIE = "bling_oauth_state"

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

export async function GET(request: NextRequest) {
  const appUrl = normalizeBaseUrl(
    process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin || "https://dudit.com.br"
  )

  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.redirect(`${appUrl}/auth/login`)
    }

    const ctx = await getCurrentPartnerContext()
    if (!ctx?.partnerId) {
      return NextResponse.redirect(`${appUrl}/erp/configuracoes?tab=integracoes&bling_error=partner_not_found`)
    }

    await requirePartnerAccessWithPermission(ctx.partnerId, "settings", "settings_integrations", user)

    const supabase = getAdminClient()
    const integration = await findBlingIntegration(supabase, ctx.partnerId)
    const { clientId } = resolveBlingOAuthAppCredentials(integration)

    if (!clientId) {
      return NextResponse.redirect(`${appUrl}/erp/configuracoes?tab=integracoes&bling_error=missing_client_id`)
    }

    // Gera state assinado com HMAC e salva no cookie seguro
    const timestamp = Date.now().toString()
    const nonce = randomBytes(16).toString("base64url")
    const payload = `${ctx.partnerId}:${user.id}:${timestamp}:${nonce}`
    const hmac = createHmac("sha256", getOAuthSecret()).update(payload).digest("hex")
    const state = Buffer.from(`${payload}:${hmac}`).toString("base64url")

    const cookieStore = await cookies()
    cookieStore.set(BLING_OAUTH_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/api/integrations/bling/oauth",
    })

    const authUrl = new URL("https://www.bling.com.br/Api/v3/oauth/authorize")
    authUrl.searchParams.set("response_type", "code")
    authUrl.searchParams.set("client_id", clientId)
    authUrl.searchParams.set("state", state)

    return NextResponse.redirect(authUrl)
  } catch (err) {
    console.error("[BLING OAuth start] error:", err)
    return NextResponse.redirect(`${appUrl}/erp/configuracoes?tab=integracoes&bling_error=oauth_start_failed`)
  }
}
