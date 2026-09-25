/**
 * Módulo de consultas fiscais (CEP e CNPJ).
 * Direciona chamadas para as Edge Functions do Supabase para latência mínima
 * (execução na borda, < 30ms de cold start, SSRF-safe).
 *
 * Fallback automático para /api/cep e /api/cnpj (Next.js routes) em caso de:
 * - Quota excedida (429)
 * - Edge Function indisponível (503/timeout)
 * - Erro de rede
 *
 * Mantém as mesmas assinaturas e retornos esperados pelos componentes.
 */

const isBrowser = typeof window !== "undefined"
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const FUNCTIONS_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : ""

// HTTP status codes que indicam "tente o fallback"
const SHOULD_FALLBACK_CODES = new Set([429, 502, 503, 504])

export async function consultarCEP(cep: string) {
	const cepClean = cep.replace(/\D/g, "")
	if (cepClean.length !== 8) {
		return { error: "CEP deve conter 8 dígitos" }
	}

	// Primary: Supabase Edge Function (edge, SSRF-safe, cached CDN)
	if (FUNCTIONS_URL) {
		const result = await _fetchEdgeFunction("cep-lookup", `?cep=${cepClean}`)
		if (!result.shouldFallback) {
			return result.data
		}
		console.warn("[consultarCEP] Edge Function failed, trying fallback...", result.reason)
	}

	// Fallback 1: local /api/cep route (Next.js serverless)
	if (isBrowser) {
		const result = await _fetchFromApiRoute(`/api/cep?cep=${cepClean}`)
		if (!result.shouldFallback) {
			return result.data
		}
		console.warn("[consultarCEP] Fallback route failed", result.reason)
	}

	return { error: "Erro ao consultar CEP" }
}

export async function consultarCNPJ(cnpj: string) {
	const cnpjClean = cnpj.replace(/\D/g, "")
	if (cnpjClean.length !== 14) {
		return { error: "CNPJ inválido" }
	}

	// Primary: Supabase Edge Function
	if (FUNCTIONS_URL) {
		const result = await _fetchEdgeFunction("cnpj-lookup", `?cnpj=${cnpjClean}`)
		if (!result.shouldFallback) {
			return result.data
		}
		console.warn("[consultarCNPJ] Edge Function failed, trying fallback...", result.reason)
	}

	// Fallback 1: local /api/cnpj route
	if (isBrowser) {
		const result = await _fetchFromApiRoute(`/api/cnpj?cnpj=${cnpjClean}`)
		if (!result.shouldFallback) {
			return result.data
		}
		console.warn("[consultarCNPJ] Fallback route failed", result.reason)
	}

	return { error: "Erro ao consultar CNPJ" }
}

/**
 * Fetches from a Supabase Edge Function with timeout + fallback detection.
 */
async function _fetchEdgeFunction(
	functionName: string,
	query: string,
): Promise<{ data?: any; shouldFallback: boolean; reason?: string }> {
	const url = `${FUNCTIONS_URL}/${functionName}${query}`

	try {
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), 8_000)

		const res = await fetch(url, {
			signal: controller.signal,
			headers: { Accept: "application/json" },
		})
		clearTimeout(timeout)

		if (res.ok) {
			return { data: await res.json(), shouldFallback: false }
		}

		// Rate-limited or edge function degraded → try fallback
		if (SHOULD_FALLBACK_CODES.has(res.status)) {
			const errData = await res.json().catch(() => ({}))
			return { shouldFallback: true, reason: errData.error || `HTTP ${res.status}` }
		}

		// 404 not found / 400 bad request → legitimate response, no fallback
		const errData = await res.json().catch(() => ({}))
		return { data: { error: errData.error || "Not found" }, shouldFallback: false }
	} catch (err: any) {
		const isAbort = err?.name === "AbortError"
		return {
			shouldFallback: true,
			reason: isAbort ? "timeout" : err?.message || "Network error",
		}
	}
}

/**
 * Fetches from local Next.js API route (browser-only, server-side uses EF directly).
 */
async function _fetchFromApiRoute(
	path: string,
): Promise<{ data?: any; shouldFallback: boolean; reason?: string }> {
	const url = path.startsWith("http") ? path : path

	try {
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), 6_000)

		const res = await fetch(url, {
			signal: controller.signal,
			headers: { Accept: "application/json" },
		})
		clearTimeout(timeout)

		if (res.ok) {
			return { data: await res.json(), shouldFallback: false }
		}

		if (SHOULD_FALLBACK_CODES.has(res.status)) {
			return { shouldFallback: true, reason: `HTTP ${res.status}` }
		}

		const errData = await res.json().catch(() => ({}))
		return { data: { error: errData.error || "Not found" }, shouldFallback: false }
	} catch (err: any) {
		return {
			shouldFallback: true,
			reason: err?.name === "AbortError" ? "timeout" : err?.message || "Network error",
		}
	}
}
