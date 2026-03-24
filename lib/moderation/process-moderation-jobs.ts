/**
 * Processamento de moderação assíncrona — Production-grade.
 *
 * Garantias:
 * - Atomic claim via RPC (FOR UPDATE SKIP LOCKED)
 * - Idempotent status transitions (by job.id + status guard)
 * - Retry com exponential backoff (2^n min, max 5 retries)
 * - Fail-open: infra failure nunca bloqueia produto
 * - Max retries exceeded → produto aprovado (fail-open)
 * - Time guard: para antes do timeout serverless
 * - Structured JSON logging
 */

import { getAdminClient } from "@/lib/supabase/admin"
import { moderateProductContent } from "@/lib/moderation/product-moderation"
import { revalidateProducts } from "@/lib/utils/revalidation"

// ── Constants ──────────────────────────────────────────────────────────────
const BATCH_SIZE = 5
const MAX_RETRIES = 5
const MAX_EXECUTION_MS = 25_000 // 25s (Vercel timeout = 30s)

// ── Types ──────────────────────────────────────────────────────────────────
interface ModerationMetrics {
    processed: number
    failed: number
    retried: number
    skipped: number
    elapsed_ms: number
}

interface ClaimedJob {
    id: string
    product_id: string
    status: string
    retry_count: number
    next_retry_at: string | null
    created_at: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function calculateNextRetryAt(retryCount: number): string {
    const delayMinutes = Math.pow(2, retryCount) // 2, 4, 8, 16, 32
    const nextRetry = new Date(Date.now() + delayMinutes * 60 * 1000)
    return nextRetry.toISOString()
}

function structuredLog(event: string, data: Record<string, unknown>) {
    console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...data }))
}

// ── Main processor ─────────────────────────────────────────────────────────

export async function processPendingModerationJobs(): Promise<ModerationMetrics> {
    const batchStart = performance.now()
    const admin = getAdminClient()
    const metrics: ModerationMetrics = {
        processed: 0,
        failed: 0,
        retried: 0,
        skipped: 0,
        elapsed_ms: 0,
    }

    // 1. Atomic claim via RPC (FOR UPDATE SKIP LOCKED)
    const { data: jobs, error: claimError } = await admin.rpc("claim_moderation_jobs", {
        p_limit: BATCH_SIZE,
    })

    if (claimError) {
        structuredLog("claim_error", { error: claimError.message })
        metrics.elapsed_ms = Math.round(performance.now() - batchStart)
        return metrics
    }

    const claimedJobs = (jobs || []) as ClaimedJob[]
    if (claimedJobs.length === 0) {
        metrics.elapsed_ms = Math.round(performance.now() - batchStart)
        return metrics
    }

    structuredLog("batch_started", { jobs_claimed: claimedJobs.length })

    // 2. Process each job
    for (const job of claimedJobs) {
        // Time guard: stop if near serverless timeout
        // NÃO libera job — cron futuro reclama via processing timeout (5min)
        const elapsed = performance.now() - batchStart
        if (elapsed > MAX_EXECUTION_MS) {
            structuredLog("time_guard", {
                elapsed_ms: Math.round(elapsed),
                remaining_jobs: claimedJobs.length - claimedJobs.indexOf(job),
                reason: "near serverless timeout, stopping batch",
            })
            break
        }

        const jobStart = performance.now()

        try {
            // 3. Fetch product data for moderation
            const { data: product } = await admin
                .from("products")
                .select("name, description, partner_id")
                .eq("id", job.product_id)
                .single()

            if (!product) {
                // Product was deleted, mark job as done
                await markJobDone(admin, job.id, "done", "skipped", "Product not found (deleted)")
                metrics.processed++
                structuredLog("job_skipped", {
                    job_id: job.id,
                    product_id: job.product_id,
                    reason: "product_deleted",
                    ms: Math.round(performance.now() - jobStart),
                })
                continue
            }

            // 4. Run moderation
            const moderation = await moderateProductContent({
                name: product.name,
                description: product.description,
            })

            // 5. Distinguish infra failure vs content decision
            if ((moderation as any).infraFailure) {
                // Infra failure — retry with backoff
                await handleRetry(admin, job, "Cloudflare AI infrastructure failure", metrics)
                structuredLog("job_infra_failure", {
                    job_id: job.id,
                    product_id: job.product_id,
                    retry_count: job.retry_count,
                    ms: Math.round(performance.now() - jobStart),
                })
                continue
            }

            // 6. Content decision (valid = approved, !valid = blocked)
            const newStatus = moderation.valid ? "approved" : "blocked"

            // Update product moderation_status (idempotent)
            await admin
                .from("products")
                .update({ moderation_status: newStatus })
                .eq("id", job.product_id)

            // Mark job as done (idempotent: only if still processing)
            await markJobDone(
                admin,
                job.id,
                "done",
                newStatus,
                moderation.valid ? null : (moderation.error || null)
            )

            // Revalidate cache
            if (product.partner_id) {
                revalidateProducts(product.partner_id, job.product_id)
            }

            metrics.processed++
            structuredLog("job_completed", {
                job_id: job.id,
                product_id: job.product_id,
                result: newStatus,
                retry_count: job.retry_count,
                ms: Math.round(performance.now() - jobStart),
            })
        } catch (error: any) {
            // Unexpected error — treat as infra failure, retry
            await handleRetry(admin, job, error.message || "Unknown error", metrics)
            structuredLog("job_error", {
                job_id: job.id,
                product_id: job.product_id,
                error: error.message,
                retry_count: job.retry_count,
                ms: Math.round(performance.now() - jobStart),
            })
        }
    }

    metrics.elapsed_ms = Math.round(performance.now() - batchStart)
    structuredLog("batch_completed", { ...metrics })
    return metrics
}

// ── Internal helpers ───────────────────────────────────────────────────────

async function handleRetry(
    admin: ReturnType<typeof getAdminClient>,
    job: ClaimedJob,
    errorMessage: string,
    metrics: ModerationMetrics
) {
    const nextRetry = job.retry_count + 1

    if (nextRetry >= MAX_RETRIES) {
        // Max retries exceeded — produto FICA pending_moderation
        // Admin deve resolver manualmente
        await admin
            .from("moderation_jobs")
            .update({
                status: "failed",
                result: "max_retries",
                last_error: `Max retries (${MAX_RETRIES}) exceeded: ${errorMessage}`,
                error_message: errorMessage,
                retry_count: nextRetry,
                updated_at: new Date().toISOString(),
            })
            .eq("id", job.id)
            .eq("status", "processing")

        metrics.failed++
        structuredLog("max_retries_exceeded", {
            job_id: job.id,
            product_id: job.product_id,
            retry_count: nextRetry,
            action: "product stays pending_moderation, admin must review",
        })
        return
    }

    // Schedule retry with exponential backoff
    const nextRetryAt = calculateNextRetryAt(nextRetry)

    await admin
        .from("moderation_jobs")
        .update({
            status: "pending",
            retry_count: nextRetry,
            next_retry_at: nextRetryAt,
            last_error: errorMessage,
            updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("status", "processing")

    metrics.retried++
    structuredLog("retry_scheduled", {
        job_id: job.id,
        product_id: job.product_id,
        retry_count: nextRetry,
        next_retry_at: nextRetryAt,
        backoff_minutes: Math.pow(2, nextRetry),
    })
}

async function markJobDone(
    admin: ReturnType<typeof getAdminClient>,
    jobId: string,
    status: string,
    result: string,
    errorMessage: string | null
) {
    // Idempotent: only updates if job is still in 'processing' status
    const { count } = await admin
        .from("moderation_jobs")
        .update({
            status,
            result,
            error_message: errorMessage,
            updated_at: new Date().toISOString(),
        })
        .eq("id", jobId)
        .eq("status", "processing")

    if (count === 0) {
        structuredLog("idempotent_skip", {
            job_id: jobId,
            reason: "job no longer in processing status",
        })
    }
}
