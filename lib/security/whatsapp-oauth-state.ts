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

const WA_OAUTH_STATE_COOKIE = "wa_oauth_state"
const STATE_MAX_AGE_MS = 10 * 60 * 1000

type WhatsappOAuthStateValidation =
  | { valid: true; partnerId: string; userId: string }
  | { valid: false; error: string }

function buildSignedState(partnerId: string, userId: string): string {
  const timestamp = Date.now().toString()
  const nonce = randomBytes(16).toString("base64url")
  const payload = `${partnerId}:${userId}:${timestamp}:${nonce}`
  const hmac = createHmac("sha256", getOAuthSecret()).update(payload).digest("hex")
  return Buffer.from(`${payload}:${hmac}`).toString("base64url")
}

function verifySignedState(state: string, expectedUserId: string): WhatsappOAuthStateValidation {
  const decoded = Buffer.from(state, "base64url").toString("utf8")
  const parts = decoded.split(":")
  if (parts.length !== 5) {
    return { valid: false, error: "Invalid state format" }
  }

  const [partnerId, userId, timestamp, nonce, hmac] = parts
  const payload = `${partnerId}:${userId}:${timestamp}:${nonce}`
  const expectedHmac = createHmac("sha256", getOAuthSecret()).update(payload).digest("hex")

  const hmacBuffer = Buffer.from(hmac)
  const expectedBuffer = Buffer.from(expectedHmac)
  if (hmacBuffer.length !== expectedBuffer.length || !timingSafeEqual(hmacBuffer, expectedBuffer)) {
    return { valid: false, error: "Invalid state signature" }
  }

  const stateTime = Number(timestamp)
  if (!Number.isFinite(stateTime) || Date.now() - stateTime > STATE_MAX_AGE_MS) {
    return { valid: false, error: "OAuth state expired" }
  }

  if (userId !== expectedUserId) {
    return { valid: false, error: "User mismatch" }
  }

  return { valid: true, partnerId, userId }
}

/** Starts Embedded Signup: sets one-time cookie for CSRF binding. */
export async function generateWhatsappOAuthState(partnerId: string, userId: string): Promise<void> {
  const state = buildSignedState(partnerId, userId)
  const cookieStore = await cookies()
  cookieStore.set(WA_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  })
}

/** Validates and consumes the one-time OAuth cookie after Embedded Signup completes. */
export async function validateWhatsappOAuthState(expectedUserId: string): Promise<WhatsappOAuthStateValidation> {
  try {
    const cookieStore = await cookies()
    const cookieState = cookieStore.get(WA_OAUTH_STATE_COOKIE)?.value
    cookieStore.delete(WA_OAUTH_STATE_COOKIE)

    if (!cookieState) {
      return { valid: false, error: "OAuth state cookie not found" }
    }

    return verifySignedState(cookieState, expectedUserId)
  } catch (err) {
    console.error("[WhatsApp] OAuth state validation failed:", err)
    return { valid: false, error: "Failed to validate OAuth state" }
  }
}
