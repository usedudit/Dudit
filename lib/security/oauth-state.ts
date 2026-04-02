"use server"

import { createHmac, timingSafeEqual, randomBytes } from "crypto"
import { cookies } from "next/headers"

const OAUTH_STATE_SECRET = process.env.OAUTH_STATE_SECRET

function getOAuthSecret() {
    if (!OAUTH_STATE_SECRET) {
        return "build-time-placeholder"
    }
    return OAUTH_STATE_SECRET
}


const OAUTH_STATE_COOKIE = "mp_oauth_state"
const STATE_MAX_AGE_MS = 10 * 60 * 1000 // 10 minutes

type OAuthStateValidation =
    | { valid: true; partnerId: string; userId: string }
    | { valid: false; error: string }

/**
 * Generate a signed OAuth state token and store it in a secure cookie.
 * Format: base64url(partnerId:userId:timestamp:hmac)
 */
export async function generateOAuthState(
    partnerId: string,
    userId: string
): Promise<string> {
    const timestamp = Date.now().toString()
    const nonce = randomBytes(16).toString("base64url")

    const payload = `${partnerId}:${userId}:${timestamp}:${nonce}`

    const hmac = createHmac("sha256", getOAuthSecret())
        .update(payload)
        .digest("hex")

    const state = Buffer.from(`${payload}:${hmac}`).toString("base64url")

    const cookieStore = await cookies()

    cookieStore.set(OAUTH_STATE_COOKIE, state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 600,
        path: "/api/mercadopago/oauth",
    })

    return state
}

/**
 * Validate OAuth state token from callback
 */
export async function validateOAuthState(
    state: string,
    expectedUserId: string
): Promise<OAuthStateValidation> {
    try {
        const cookieStore = await cookies()
        const cookieState = cookieStore.get(OAUTH_STATE_COOKIE)?.value

        if (!cookieState) {
            return { valid: false, error: "OAuth state cookie not found" }
        }

        // delete immediately (single use)
        cookieStore.delete(OAUTH_STATE_COOKIE)

        const cookieBuffer = Buffer.from(cookieState)
        const stateBuffer = Buffer.from(state)

        if (cookieBuffer.length !== stateBuffer.length) {
            return { valid: false, error: "OAuth state mismatch" }
        }

        if (!timingSafeEqual(cookieBuffer, stateBuffer)) {
            return { valid: false, error: "OAuth state mismatch" }
        }

        const decoded = Buffer.from(state, "base64url").toString("utf8")

        const parts = decoded.split(":")

        if (parts.length !== 5) {
            return { valid: false, error: "Invalid state format" }
        }

        const [partnerId, userId, timestamp, nonce, hmac] = parts

        const payload = `${partnerId}:${userId}:${timestamp}:${nonce}`

        const expectedHmac = createHmac("sha256", getOAuthSecret())
            .update(payload)
            .digest("hex")

        const hmacBuffer = Buffer.from(hmac)
        const expectedBuffer = Buffer.from(expectedHmac)

        if (hmacBuffer.length !== expectedBuffer.length) {
            return { valid: false, error: "Invalid state signature" }
        }

        if (!timingSafeEqual(hmacBuffer, expectedBuffer)) {
            return { valid: false, error: "Invalid state signature" }
        }

        const stateTime = Number(timestamp)

        if (!Number.isFinite(stateTime)) {
            return { valid: false, error: "Invalid timestamp" }
        }

        if (Date.now() - stateTime > STATE_MAX_AGE_MS) {
            return { valid: false, error: "OAuth state expired" }
        }

        if (userId !== expectedUserId) {
            return { valid: false, error: "User mismatch" }
        }

        return {
            valid: true,
            partnerId,
            userId,
        }
    } catch (err) {
        console.error("OAuth state validation failed:", err)

        return {
            valid: false,
            error: "Failed to validate OAuth state",
        }
    }
}