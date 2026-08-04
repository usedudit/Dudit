import "server-only"
import { redis } from "@/lib/redis"

const MAX_FAILED_ATTEMPTS = 10 // Max failed attempts across any IP per account
const LOCKOUT_DURATION_SECONDS = 15 * 60 // 15 minutes lockout
const WINDOW_SECONDS = 15 * 60 // 15 minutes window

/**
 * SECURITY (LOW-04): Account-level brute-force protection.
 *
 * Tracks failed login attempts per email address across all IP addresses.
 * After MAX_FAILED_ATTEMPTS failed attempts within WINDOW_SECONDS, the account
 * target is locked out for LOCKOUT_DURATION_SECONDS to prevent distributed
 * credential stuffing and brute-force attacks.
 */
export async function checkAccountLockout(email: string): Promise<{ locked: boolean; remainingSeconds?: number }> {
    if (!email) return { locked: false }
    const normalizedEmail = email.toLowerCase().trim()
    const lockoutKey = `lockout:acc:${normalizedEmail}`

    try {
        const ttl = await redis.ttl(lockoutKey)
        if (ttl > 0) {
            return { locked: true, remainingSeconds: ttl }
        }
    } catch (err) {
        console.error("[ACCOUNT-LOCKOUT] Redis error in checkAccountLockout:", err)
    }

    return { locked: false }
}

export async function recordFailedLogin(email: string): Promise<{ lockedNow: boolean }> {
    if (!email) return { lockedNow: false }
    const normalizedEmail = email.toLowerCase().trim()
    const attemptsKey = `failed_logins:acc:${normalizedEmail}`
    const lockoutKey = `lockout:acc:${normalizedEmail}`

    try {
        const attempts = await redis.incr(attemptsKey)
        if (attempts === 1) {
            await redis.expire(attemptsKey, WINDOW_SECONDS)
        }

        if (attempts >= MAX_FAILED_ATTEMPTS) {
            await redis.set(lockoutKey, "1", { ex: LOCKOUT_DURATION_SECONDS })
            await redis.del(attemptsKey)
            console.warn(`[ACCOUNT-LOCKOUT] Account ${normalizedEmail} locked out due to ${attempts} failed attempts.`)
            return { lockedNow: true }
        }
    } catch (err) {
        console.error("[ACCOUNT-LOCKOUT] Redis error in recordFailedLogin:", err)
    }

    return { lockedNow: false }
}

export async function clearFailedLogins(email: string): Promise<void> {
    if (!email) return
    const normalizedEmail = email.toLowerCase().trim()
    const attemptsKey = `failed_logins:acc:${normalizedEmail}`

    try {
        await redis.del(attemptsKey)
    } catch (err) {
        console.error("[ACCOUNT-LOCKOUT] Redis error in clearFailedLogins:", err)
    }
}
