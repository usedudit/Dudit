import "server-only"

import { cronLogger, type CronCorrelation } from "./logger"

/** Maximum retry attempts for enqueuing a Trigger.dev task */
const MAX_ENQUEUE_RETRIES = 3

/** Base delay in ms for exponential backoff (doubles each retry) */
const BASE_BACKOFF_MS = 500

/**
 * Sleep helper with optional jitter for retry backoff.
 */
function sleepWithJitter(baseMs: number, attempt: number): Promise<void> {
  const exponentialDelay = baseMs * Math.pow(2, attempt)
  const jitter = Math.floor(Math.random() * exponentialDelay * 0.3)
  const totalDelay = exponentialDelay + jitter
  return new Promise((resolve) => setTimeout(resolve, totalDelay))
}

/**
 * Enqueue a single Trigger.dev task with automatic retry + exponential backoff.
 *
 * Retries up to 3 times with exponential backoff + jitter if Trigger.dev
 * is temporarily unavailable. Fails loudly if TRIGGER_SECRET_KEY is not set.
 *
 * @param taskId - The Trigger.dev task ID (e.g. "whatsapp-scheduled-job")
 * @param payload - The task payload
 * @param options - Optional Trigger.dev trigger options (delay, idempotencyKey, etc.)
 * @param correlation - Optional correlation context for logging
 * @returns true if successfully enqueued, false if all retries failed
 */
export async function enqueueTriggerTask(
  taskId: string,
  payload: unknown,
  options?: { delay?: Date | string; idempotencyKey?: string },
  correlation?: CronCorrelation,
): Promise<boolean> {
  if (!process.env.TRIGGER_SECRET_KEY) {
    cronLogger.warn("enqueue", "TRIGGER_SECRET_KEY is not configured - fallback execution will be used", {
      taskId,
    }, correlation)
    return false
  }

  for (let attempt = 0; attempt < MAX_ENQUEUE_RETRIES; attempt++) {
    try {
      // @ts-ignore - Trigger.dev SDK types are resolved at runtime via its own build pipeline
      const { tasks } = await import("@trigger.dev/sdk/v3")

      const triggerOptions: Record<string, unknown> = {}
      if (options?.delay) triggerOptions.delay = options.delay
      if (options?.idempotencyKey) triggerOptions.idempotencyKey = options.idempotencyKey

      await tasks.trigger(taskId, payload, triggerOptions)

      if (attempt > 0) {
        cronLogger.info("enqueue", `Task enqueued after ${attempt + 1} attempts`, {
          taskId,
          attempt: attempt + 1,
        }, correlation)
      }

      return true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "unknown"
      const isLastAttempt = attempt === MAX_ENQUEUE_RETRIES - 1

      if (isLastAttempt) {
        cronLogger.error("enqueue", `Failed to enqueue task after ${MAX_ENQUEUE_RETRIES} attempts`, {
          taskId,
          error: errorMessage,
          totalAttempts: MAX_ENQUEUE_RETRIES,
        }, correlation)
        return false
      }

      cronLogger.warn("enqueue", `Enqueue attempt ${attempt + 1} failed - retrying`, {
        taskId,
        error: errorMessage,
        nextAttempt: attempt + 2,
      }, correlation)

      await sleepWithJitter(BASE_BACKOFF_MS, attempt)
    }
  }

  return false
}

/**
 * Enqueue multiple Trigger.dev tasks in sequence with per-item error handling.
 *
 * Each item is enqueued independently. If one fails, the others still proceed.
 * Returns a summary with enqueued count, failed count, and failedIndices.
 *
 * @param taskId - The Trigger.dev task ID
 * @param items - Array of items to enqueue, each with payload and optional options
 * @param jobName - Job name for logging context
 * @returns Summary with enqueued, failed counts and failedIndices
 */
export async function enqueueTriggerBatch(
  taskId: string,
  items: Array<{
    payload: unknown
    options?: { delay?: Date | string; idempotencyKey?: string }
    correlation?: CronCorrelation
  }>,
  jobName: string,
): Promise<{ enqueued: number; failed: number; failedIndices: number[] }> {
  let enqueued = 0
  let failed = 0
  const failedIndices: number[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const success = await enqueueTriggerTask(
      taskId,
      item.payload,
      item.options,
      item.correlation,
    )

    if (success) {
      enqueued++
    } else {
      failed++
      failedIndices.push(i)
    }
  }

  cronLogger.info(jobName, `Batch enqueue complete: ${enqueued} enqueued, ${failed} failed`, {
    taskId,
    total: items.length,
    enqueued,
    failed,
  })

  return { enqueued, failed, failedIndices }
}
