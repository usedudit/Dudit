import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"
import {
	validateCronRequest,
	acquireExecutionLock,
	releaseExecutionLock,
	cronLogger,
} from "@/lib/internal-cron"

const JOB_NAME = "process-pending-webhooks"
const BATCH_SIZE = 2
const MAX_EVENT_ATTEMPTS = 5
export const maxDuration = 300

interface PendingWebhookEvent {
	id: string
	idempotency_key: string
	request_id: string
	signature: string | null
	payload: Record<string, unknown>
	provider: string
	event_type: string
	resource_id: string | null
	status: string
	inserted_at: string
	processed_at: string | null
	processing_error: string | null
	attempts: number
}

/**
 * POST /api/internal/jobs/process-pending-webhooks
 *
 * Called by cron-job.org to drain pending webhook events from the
 * pending_webhook_events outbox table (populated by the mercadopago-webhook
 * Edge Function) and replay them to the existing Next.js webhook endpoint.
 *
 * Decouples fast edge ingestion (ACK < 1s) from async processing.
 */
export async function POST(req: Request) {
	// 1. Auth
	const authResult = validateCronRequest(req, JOB_NAME)
	if (!authResult.ok) {
		return authResult.error
	}

	cronLogger.start(JOB_NAME)
	const startTime = Date.now()
	const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
	const cronSecret = process.env.INTERNAL_CRON_SECRET
	let webhookUrl: URL | null = null
	try {
		if (appUrl) webhookUrl = new URL(appUrl)
	} catch {
		webhookUrl = null
	}
	if (!webhookUrl || !["https:", ...(process.env.NODE_ENV !== "production" ? ["http:"] : [])].includes(webhookUrl.protocol) || !cronSecret) {
		return NextResponse.json(
			{ success: false, error: "Webhook worker configuration is incomplete." },
			{ status: 503 },
		)
	}

	try {
		const admin = getAdminClient()

		// 2. Fast check: Claim a batch of pending events (FIFO)
		const { data: events, error: fetchError } = await admin
			.from("pending_webhook_events")
			.select("*")
			.eq("provider", "mercadopago")
			.eq("status", "pending")
			.order("inserted_at", { ascending: true })
			.limit(BATCH_SIZE)

		if (fetchError) {
			cronLogger.error(JOB_NAME, "Failed to query pending events", {
				error: fetchError.message,
			})
			return NextResponse.json(
				{ success: false, error: fetchError.message },
				{ status: 500 },
			)
		}

		if (!events || events.length === 0) {
			const elapsed = Date.now() - startTime
			cronLogger.success(JOB_NAME, { idle: true }, elapsed)
			return NextResponse.json({
				success: true,
				processed: 0,
				pending: 0,
				idle: true,
			})
		}

		// 3. Concurrency lock ONLY when there are actual events to process
		const lock = await acquireExecutionLock(JOB_NAME, 360, { failClosed: true })
		if (!lock.acquired) {
			if (lock.unavailable) {
				return NextResponse.json(
					{ success: false, error: "Execution lock unavailable" },
					{ status: 503 },
				)
			}
			cronLogger.warn(JOB_NAME, "Execution skipped - lock held", {
				lockKey: lock.lockKey,
			})
			return NextResponse.json(
				{ success: false, skipped: true, reason: "lock_held" },
				{ status: 409 },
			)
		}

		try {
			let processed = 0
			let failed = 0

			for (const event of events as PendingWebhookEvent[]) {
				try {
					// Re-play to the existing Next.js webhook endpoint
					// It will re-validate the signature and run full business logic
					const webhookRes = await fetch(
						new URL("/api/mercadopago/webhook", webhookUrl).toString(),
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								"User-Agent": "Dudit-Webhook-Drain/1.0",
								Authorization: `Bearer ${cronSecret}`,
								"x-signature": event.signature || "",
								"x-request-id": event.request_id,
							},
							body: JSON.stringify(event.payload),
							signal: AbortSignal.timeout(110_000),
						},
					)

					if (webhookRes.ok) {
						const { error: markError } = await admin
							.from("pending_webhook_events")
							.update({
								status: "completed",
								processed_at: new Date().toISOString(),
							})
							.eq("idempotency_key", event.idempotency_key)
						if (markError) {
							failed++
							cronLogger.error(JOB_NAME, "Failed to mark webhook event completed", {
								idempotencyKey: event.idempotency_key,
								error: markError.message,
							})
						} else {
							processed++
						}
					} else {
						failed++
						cronLogger.warn(JOB_NAME, "Webhook reprocessing returned non-200", {
							idempotencyKey: event.idempotency_key,
							status: webhookRes.status,
						})
						await admin
							.from("pending_webhook_events")
							.update({
								status: event.attempts + 1 >= MAX_EVENT_ATTEMPTS ? "failed" : "pending",
								processing_error: `HTTP ${webhookRes.status}`,
								attempts: event.attempts + 1,
							})
							.eq("idempotency_key", event.idempotency_key)
					}
				} catch (err: unknown) {
					failed++
					const message = err instanceof Error ? err.message : String(err)
					cronLogger.error(JOB_NAME, "Error processing event", {
						idempotencyKey: event.idempotency_key,
						error: message,
					})
					await admin
						.from("pending_webhook_events")
						.update({
							status: event.attempts + 1 >= MAX_EVENT_ATTEMPTS ? "failed" : "pending",
							processing_error: message.slice(0, 300),
							attempts: event.attempts + 1,
						})
						.eq("idempotency_key", event.idempotency_key)
				}
			}

			const elapsed = Date.now() - startTime
			cronLogger.success(JOB_NAME, { processed, failed, total: events.length }, elapsed)

			return NextResponse.json({
				success: true,
				processed,
				failed,
				total: events.length,
				elapsedMs: elapsed,
			})
		} finally {
			await releaseExecutionLock(lock.lockKey, lock.lockToken)
		}
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err)
		const elapsed = Date.now() - startTime
		cronLogger.error(JOB_NAME, "Unexpected error", { error: message, durationMs: elapsed })
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		)
	}
}
