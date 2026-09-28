import "server-only"
import { createAdminClient } from "@/lib/supabase/server"
import { encrypt, decrypt } from "@/lib/cryptoService"
import {
    MERCADOPAGO_PROVIDER,
    findMercadoPagoIntegration,
    getMpTokenExpiresAt,
    getMpRefreshTokenEncrypted,
} from "@/lib/services/payments/mercadopago-integration"

const refreshPromises = new Map<string, Promise<string>>()

export async function getValidMercadoPagoAccessToken(partnerId: string): Promise<string> {
    if (refreshPromises.has(partnerId)) {
        return refreshPromises.get(partnerId)!
    }

    const refreshPromise = performTokenRefreshOrReturnValid(partnerId)
    refreshPromises.set(partnerId, refreshPromise)

    try {
        const token = await refreshPromise
        return token
    } finally {
        refreshPromises.delete(partnerId)
    }
}

async function performTokenRefreshOrReturnValid(partnerId: string): Promise<string> {
    const supabase = createAdminClient()

    const integration = await findMercadoPagoIntegration(supabase, partnerId)

    if (!integration?.access_token_encrypted) {
        throw new Error("Partner or encrypted access token not found")
    }

    const expiresAt = getMpTokenExpiresAt(integration)

    // Add a 5 minute buffer to avoid using a token that is about to expire mid-flight
    const BUFFER_MS = 5 * 60 * 1000

    if (expiresAt && (expiresAt.getTime() - BUFFER_MS > Date.now())) {
        try {
            return decrypt(integration.access_token_encrypted, MERCADOPAGO_PROVIDER)
        } catch (err) {
            console.error({ event: "mercadopago_token_decrypt_error", partnerId, error: err })
            throw new Error("Failed to decrypt current access token")
        }
    }

    // Token is expired or about to expire. We need to refresh it.
    const refreshTokenEncrypted = getMpRefreshTokenEncrypted(integration)
    if (!refreshTokenEncrypted) {
        console.error({ event: "mercadopago_missing_refresh_token", partnerId })
        throw new Error("Refresh token not found for partner")
    }

    let decryptedRefreshToken: string
    try {
        decryptedRefreshToken = decrypt(refreshTokenEncrypted, MERCADOPAGO_PROVIDER)
    } catch (err) {
        console.error({ event: "mercadopago_refresh_token_decrypt_error", partnerId, error: err })
        throw new Error("Failed to decrypt refresh token")
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    try {
        const tokenResponse = await fetch("https://api.mercadopago.com/oauth/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
            },
            body: new URLSearchParams({
                client_id: process.env.MP_CLIENT_ID!,
                client_secret: process.env.MP_CLIENT_SECRET!,
                grant_type: "refresh_token",
                refresh_token: decryptedRefreshToken,
            }),
            signal: controller.signal
        })

        clearTimeout(timeoutId)

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json().catch(() => null)
            console.error({
                event: "mercadopago_token_refresh_failed",
                partnerId,
                status: tokenResponse.status,
                code: errorData?.error
            })
            throw new Error(`MercadoPago refresh failed with status ${tokenResponse.status}`)
        }

    interface MercadoPagoRefreshResponse {
            access_token: string
            refresh_token?: string
            expires_in?: number
            public_key?: string
            live_mode?: boolean
        }

        const tokenData = (await tokenResponse.json()) as MercadoPagoRefreshResponse

        if (!tokenData.access_token) {
            console.error({
                event: "mercadopago_invalid_refresh_response",
                partnerId,
                error: "Missing access_token in refresh response"
            })
            throw new Error("Invalid response from MercadoPago refresh")
        }

        const newExpiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null

        // Secrets live in partner_integrations. JSONB columns are replaced as a
        // whole, so they are merged with the values read before the refresh.
        const metadata = { ...(integration.metadata || {}) }
        if (newExpiresAt) {
            metadata.token_expires_at = newExpiresAt.toISOString()
        } else {
            delete metadata.token_expires_at
        }

        const credentials = { ...(integration.credentials || {}) }
        // MercadoPago typically rotates the refresh token, store the new one if provided
        if (tokenData.refresh_token) {
            credentials.refresh_token_encrypted = encrypt(tokenData.refresh_token, MERCADOPAGO_PROVIDER)
        }

        const { error: updateError } = await supabase
            .from("partner_integrations")
            .update({
                access_token_encrypted: encrypt(tokenData.access_token, MERCADOPAGO_PROVIDER),
                credentials,
                metadata,
            })
            .eq("partner_id", partnerId)
            .eq("provider_slug", MERCADOPAGO_PROVIDER)

        if (updateError) {
            console.error({
                event: "mercadopago_token_update_failed",
                partnerId,
                error: updateError.message
            })
            // Even if update fails, we can still return the new token for this request to succeed and not block the user.
        }

        // Status fields are still read from partners (legacy path) until the
        // follow-up migration moves them into partner_integrations.config.
        const legacyStatusPayload: Record<string, unknown> = {
            mp_token_expires_at: newExpiresAt?.toISOString() ?? null,
        }
        if (typeof tokenData.live_mode === "boolean") {
            legacyStatusPayload.mp_live_mode = tokenData.live_mode
        }
        if (tokenData.public_key) {
            legacyStatusPayload.mp_public_key = tokenData.public_key
        }

        const { error: legacyStatusError } = await supabase
            .from("partners")
            .update(legacyStatusPayload)
            .eq("id", partnerId)

        if (legacyStatusError) {
            console.error({
                event: "mercadopago_status_update_failed",
                partnerId,
                error: legacyStatusError.message
            })
        }

        return tokenData.access_token

    } catch (err) {
        clearTimeout(timeoutId)
        console.error({
            event: "mercadopago_token_refresh_network_error",
            partnerId,
            error: err instanceof Error ? err.message : "Unknown error"
        })
        throw err
    }
}
