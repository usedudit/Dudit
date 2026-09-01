import "server-only"
import { createAdminClient } from "@/lib/supabase/server"
import { encrypt, decrypt } from "@/lib/cryptoService"

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

    const { data: partner, error } = await supabase
        .from("partners")
        .select("mp_access_token_encrypted, mp_refresh_token_encrypted, mp_token_expires_at")
        .eq("id", partnerId)
        .single()

    if (error || !partner || !partner.mp_access_token_encrypted) {
        throw new Error("Partner or encrypted access token not found")
    }

    const expiresAt = partner.mp_token_expires_at ? new Date(partner.mp_token_expires_at) : null

    // Add a 5 minute buffer to avoid using a token that is about to expire mid-flight
    const BUFFER_MS = 5 * 60 * 1000

    if (expiresAt && (expiresAt.getTime() - BUFFER_MS > Date.now())) {
        try {
            return decrypt(partner.mp_access_token_encrypted, "mercadopago")
        } catch (err) {
            console.error({ event: "mercadopago_token_decrypt_error", partnerId, error: err })
            throw new Error("Failed to decrypt current access token")
        }
    }

    // Token is expired or about to expire. We need to refresh it.
    if (!partner.mp_refresh_token_encrypted) {
        console.error({ event: "mercadopago_missing_refresh_token", partnerId })
        throw new Error("Refresh token not found for partner")
    }

    let decryptedRefreshToken: string
    try {
        decryptedRefreshToken = decrypt(partner.mp_refresh_token_encrypted, "mercadopago")
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

        // Prepare update payload
        const updatePayload: any = {
            mp_access_token_encrypted: encrypt(tokenData.access_token, "mercadopago"),
            mp_token_expires_at: newExpiresAt?.toISOString(),
        }

        // MercadoPago typically rotates the refresh token, store the new one if provided
        if (tokenData.refresh_token) {
            updatePayload.mp_refresh_token_encrypted = encrypt(tokenData.refresh_token, "mercadopago")
        }

        // Keep environment metadata in sync on every refresh
        if (typeof tokenData.live_mode === "boolean") {
            updatePayload.mp_live_mode = tokenData.live_mode
        }
        if (tokenData.public_key) {
            updatePayload.mp_public_key = tokenData.public_key
        }

        // Store the updated tokens
        const { error: updateError } = await supabase
            .from("partners")
            .update(updatePayload)
            .eq("id", partnerId)

        if (updateError) {
            console.error({
                event: "mercadopago_token_update_failed",
                partnerId,
                error: updateError.message
            })
            // Even if update fails, we can still return the new token for this request to succeed and not block the user.
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
