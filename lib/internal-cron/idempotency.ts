import "server-only"

import { redis } from "@/lib/redis"
import { cronLogger } from "./logger"

/**
 * Result of attempting to acquire an execution lock.
 */
export interface ExecutionLockResult {
  /** Whether the lock was successfully acquired */
  acquired: boolean
  /** The Redis key used for the lock (use to release) */
  lockKey: string
}

/**
 * Acquire a Redis-based execution lock to prevent overlapping cron executions.
 *
 * Uses Upstash Redis SET NX EX for atomic lock acquisition.
 * Default TTL is 55 seconds — safe for 60-second cron intervals from cron-job.org.
 *
 * If the lock is already held, returns { acquired: false } — the caller should
 * return 200 OK with { skipped: true, reason: "lock_active" } to avoid
 * cron-job.org interpreting it as failure.
 *
 * @param jobName - Unique name for the cron job (used as Redis key suffix)
 * @param ttlSeconds - Lock TTL in seconds (default: 55)
 * @returns ExecutionLockResult
 */
export async function acquireExecutionLock(
  jobName: string,
  ttlSeconds: number = 55,
): Promise<ExecutionLockResult> {
  const lockKey = `cron:lock:${jobName}`

  try {
    // SET NX EX — only sets if key doesn't exist, with expiry
    const result = await redis.set(lockKey, Date.now().toString(), {
      nx: true,
      ex: ttlSeconds,
    })

    const acquired = result === "OK"

    if (!acquired) {
      cronLogger.warn(jobName, "Execution lock already active — skipping", { lockKey, ttlSeconds })
    }

    return { acquired, lockKey }
  } catch (err) {
    // If Redis is unavailable, allow execution to proceed to avoid
    // permanently blocked jobs. Log the error for monitoring.
    cronLogger.error(jobName, "Failed to acquire execution lock — proceeding without lock", {
      lockKey,
      error: err instanceof Error ? err.message : "unknown",
    })
    return { acquired: true, lockKey }
  }
}

/**
 * Release an execution lock early (before TTL expires).
 * Call this in a finally block after job completion.
 *
 * @param lockKey - The lockKey returned from acquireExecutionLock
 */
export async function releaseExecutionLock(lockKey: string): Promise<void> {
  try {
    await redis.del(lockKey)
  } catch {
    // Non-critical — lock will auto-expire via TTL
  }
}
