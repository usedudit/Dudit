// Supabase Edge Function: mercadopago-webhook
// Description: Ultra-fast edge ingestion (< 30ms cold start) for Mercado Pago
// payment webhooks. Validates HMAC SHA-256 signatures with Web Crypto API,
// inserts the event into pending_webhook_events outbox table, and ACKs
// immediately to Mercado Pago. The Next.js app polls the table or uses
// Realtime to process events asynchronously.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

interface MpWebhookPayload {
	action?: string
	type?: string
	data?: {
		id?: string | number
	}
}

const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000 // 5 minutes

// Constant-time string comparison for timing attack defense
function constantTimeEquals(a: string, b: string): boolean {
	if (a.length !== b.length) return false
	let result = 0
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i)
	}
	return result === 0
}

// Validates Mercado Pago HMAC SHA-256 signature using native Web Crypto API
async function validateMpSignature(
	signatureHeader: string,
	requestId: string,
	resourceId: string,
	secret: string,
): Promise<boolean> {
	try {
		const parts = signatureHeader.split(",")
		let timestamp = ""
		let receivedSignature = ""

		for (const part of parts) {
			const trimmed = part.trim()
			if (trimmed.startsWith("ts=")) {
				timestamp = trimmed.replace("ts=", "")
			} else if (trimmed.startsWith("v1=")) {
				receivedSignature = trimmed.replace("v1=", "")
			}
		}

		if (!timestamp || !receivedSignature) return false

		// Expired webhook check
		const timestampMs = parseInt(timestamp, 10) * 1000
		if (Date.now() - timestampMs > MAX_WEBHOOK_AGE_MS) return false

		const idStr = String(resourceId).trim()
		const idLower = idStr.toLowerCase()

		const candidateTemplates = [
			`id:${idLower};request-id:${requestId};ts:${timestamp};`,
			`id:${idStr};request-id:${requestId};ts:${timestamp};`,
			`id:${idLower};request-id:${requestId};ts:${timestamp}`,
			`id:${idStr};request-id:${requestId};ts:${timestamp}`,
		]

		const encoder = new TextEncoder()
		const key = await crypto.subtle.importKey(
			"raw",
			encoder.encode(secret),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		)

		for (const manifest of candidateTemplates) {
			const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(manifest))
			const computedHex = Array.from(new Uint8Array(signatureBuffer))
				.map((b) => b.toString(16).padStart(2, "0"))
				.join("")

			if (constantTimeEquals(computedHex, receivedSignature)) {
				return true
			}
		}

		return false
	} catch (err) {
		console.error("[Edge Function] Signature validation error:", err)
		return false
	}
}

Deno.serve(async (req: Request) => {
	// Only accept POST
	if (req.method !== "POST") {
		return new Response(JSON.stringify({ error: "Method not allowed" }), {
			status: 405,
			headers: { "Content-Type": "application/json" },
		})
	}

	const supabaseUrl = Deno.env.get("SUPABASE_URL")
	const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
	const mpWebhookSecret = Deno.env.get("MP_WEBHOOK_SECRET")

	if (!supabaseUrl || !supabaseServiceKey) {
		console.error("[Edge Function] Missing Supabase environment variables")
		return new Response(JSON.stringify({ error: "Internal configuration error" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}

	const signature = req.headers.get("x-signature")
	const requestId = req.headers.get("x-request-id")

	if (!signature || !requestId) {
		console.warn("[Edge Function] Missing signature or request-id headers")
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		})
	}

	try {
		const payload: MpWebhookPayload = await req.json()
		const resourceId = String(payload?.data?.id || "")

		if (!resourceId) {
			return new Response(JSON.stringify({ error: "Missing resource ID" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		// Validate signature if secret is configured
		if (mpWebhookSecret) {
			const isValid = await validateMpSignature(signature, requestId, resourceId, mpWebhookSecret)
			if (!isValid) {
				console.warn("[Edge Function] Invalid signature for resource:", resourceId)
				return new Response(JSON.stringify({ error: "Invalid signature" }), {
					status: 401,
					headers: { "Content-Type": "application/json" },
				})
			}
		}

		const supabase = createClient(supabaseUrl, supabaseServiceKey)

		// Build idempotency key: provider + type + resource_id + request_id
		// Prevents duplicate inserts when MP retries or duplicate webhooks arrive
		const idempotencyKey = `mercadopago:${payload.type || "unknown"}:${resourceId}:${requestId}`

		// Insert into outbox table (primary path)
		const { error: upsertError } = await supabase
			.from("pending_webhook_events")
			.upsert({
				provider: "mercadopago",
				event_type: payload.type || "unknown",
				request_id: requestId,
				signature: signature,
				payload: payload as any,
				resource_id: resourceId,
				status: "pending",
				idempotency_key: idempotencyKey,
			}, {
				onConflict: "idempotency_key",
			})

		if (upsertError) {
			console.error("[Edge Function] Failed to insert webhook event:", upsertError)

			// Fallback: forward to Next.js webhook endpoint directly
			// This ensures webhooks are still processed if the DB/write fails
			const appWebhookUrl = Deno.env.get("APP_WEBHOOK_URL")
			if (appWebhookUrl) {
				console.log("[Edge Function] Falling back to direct forward...")
				fetch(appWebhookUrl, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-signature": signature,
						"x-request-id": requestId,
						"x-forwarded-from": "edge-function-fallback",
					},
					body: JSON.stringify(payload),
				}).catch((e) => console.error("[Edge Function] Fallback forward failed:", e))
			}
		} else {
			console.log(`[Edge Function] Webhook queued: type=${payload.type} resourceId=${resourceId} requestId=${requestId}`)
		}

		// Immediate ACK to Mercado Pago (always 200 - we don't want MP to retry)
		return new Response(JSON.stringify({ received: true, status: "accepted" }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (err: unknown) {
		console.error("[Edge Function] Unhandled error:", err)
		const message = err instanceof Error ? err.message : "Internal server error"
		// Still return 200 to prevent MP from retrying on our internal errors
		return new Response(JSON.stringify({ received: true, status: "error", error: message }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	}
})
