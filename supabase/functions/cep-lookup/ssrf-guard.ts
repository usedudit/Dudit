// Minimal SSRF-safe fetch for Supabase Edge Functions (Deno).
// Reuses the hostname allowlist strategy from lib/security/ssrf-guard.ts
// but is self-contained (no Next.js imports).

const DEFAULT_TIMEOUT_MS = 6_000
const DEFAULT_MAX_RESPONSE_BYTES = 256 * 1024
const DEFAULT_MAX_REDIRECTS = 2

const ALLOWED_HOSTNAMES: ReadonlySet<string> = new Set([
	"viacep.com.br",
	"brasilapi.com.br",
	"cep.awesomeapi.com.br",
	"opencep.com",
	"api.mapbox.com",
	"nominatim.openstreetmap.org",
])

export class SSRFError extends Error {
	constructor(message: string) {
		super(`[SSRF_GUARD] ${message}`)
		this.name = "SSRFError"
	}
}

function isPrivateIPv4(ip: string): boolean {
	const parts = ip.split(".")
	if (parts.length !== 4) return false
	const nums = parts.map(Number)
	if (nums.some((n) => isNaN(n) || n < 0 || n > 255)) return false
	const [a, b] = nums
	if (a === 0) return true
	if (a === 10) return true
	if (a === 127) return true
	if (a === 100 && b >= 64 && b <= 127) return true
	if (a === 169 && b === 254) return true
	if (a === 172 && b >= 16 && b <= 31) return true
	if (a === 192 && b === 168) return true
	if (a >= 224) return true
	return false
}

function isPrivateIPv6(ip: string): boolean {
	const normalized = ip.toLowerCase().trim().replace(/%.*$/, "")
	if (normalized === "::1") return true
	if (normalized === "::") return true
	if (normalized.startsWith("fe80:")) return true
	if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true
	if (normalized.startsWith("::ffff:")) {
		if (isPrivateIPv4(normalized.substring(7))) return true
	}
	return false
}

function isPrivateIP(ip: string): boolean {
	return isPrivateIPv4(ip) || isPrivateIPv6(ip)
}

function isRawIPAddress(hostname: string): boolean {
	if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true
	if (hostname.includes(":")) return true
	if (/^\d+$/.test(hostname) && hostname.length > 0) return true
	if (/^0x[0-9a-f]+$/i.test(hostname)) return true
	if (/^0[0-7]+$/.test(hostname)) return true
	if (/^(0[0-7]*\.)+0[0-7]*$/.test(hostname)) return true
	return false
}

function validateUrl(rawUrl: string, allowedHostnames: ReadonlySet<string>) {
	let parsed: URL
	try {
		parsed = new URL(rawUrl)
	} catch {
		return { valid: false, error: `Invalid URL: ${rawUrl.substring(0, 100)}` }
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		return { valid: false, error: `Blocked protocol: ${parsed.protocol}` }
	}

	if (parsed.username || parsed.password) {
		return { valid: false, error: "URLs with embedded credentials are not allowed" }
	}

	const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "")
	if (!hostname) return { valid: false, error: "Missing hostname" }

	if (isRawIPAddress(hostname)) {
		if (isPrivateIP(hostname)) {
			return { valid: false, error: `Blocked private/reserved IP: ${hostname}` }
		}
	}

	if (!allowedHostnames.has(hostname)) {
		return { valid: false, error: `Hostname not in allowlist: ${hostname}` }
	}

	return { valid: true, parsedUrl: parsed }
}

async function readResponseWithSizeLimit(
	response: Response,
	maxBytes: number,
): Promise<Response> {
	const contentLength = response.headers.get("content-length")
	if (contentLength) {
		const declared = parseInt(contentLength, 10)
		if (!isNaN(declared) && declared > maxBytes) {
			throw new SSRFError(`Response Content-Length ${declared} exceeds limit of ${maxBytes} bytes`)
		}
	}

	if (!response.body) return response

	const reader = response.body.getReader()
	const chunks: Uint8Array[] = []
	let totalBytes = 0

	try {
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			totalBytes += value.byteLength
			if (totalBytes > maxBytes) {
				reader.cancel()
				throw new SSRFError(`Response body exceeded ${maxBytes} bytes (read ${totalBytes} so far)`)
			}
			chunks.push(value)
		}
	} catch (err) {
		if (err instanceof SSRFError) throw err
		throw new SSRFError(`Error reading response body: ${(err as Error).message}`)
	}

	const newHeaders = new Headers(response.headers)
	newHeaders.delete("content-encoding")
	newHeaders.delete("content-length")
	newHeaders.delete("transfer-encoding")

	const blob = new Blob(chunks as BlobPart[])
	return new Response(blob, {
		status: response.status,
		statusText: response.statusText,
		headers: newHeaders,
	})
}

function isRedirectStatus(status: number): boolean {
	return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

export interface SafeFetchOptions extends Omit<RequestInit, "redirect"> {
	timeoutMs?: number
	maxResponseBytes?: number
	maxRedirects?: number
	allowedHostnames?: ReadonlySet<string>
}

export async function safeFetch(
	url: string | URL,
	options: SafeFetchOptions = {},
): Promise<Response> {
	const {
		timeoutMs = DEFAULT_TIMEOUT_MS,
		maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
		maxRedirects = DEFAULT_MAX_REDIRECTS,
		allowedHostnames: customAllowlist = ALLOWED_HOSTNAMES,
		signal: externalSignal,
		...fetchOptions
	} = options

	const rawUrl = typeof url === "string" ? url : url.toString()

	const validation = validateUrl(rawUrl, customAllowlist)
	if (!validation.valid) {
		throw new SSRFError(validation.error!)
	}

	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

	if (externalSignal) {
		if (externalSignal.aborted) {
			controller.abort()
		} else {
			externalSignal.addEventListener("abort", () => controller.abort(), { once: true })
		}
	}

	try {
		const reqHeaders = new Headers(fetchOptions.headers)
		if (!reqHeaders.has("user-agent") && !reqHeaders.has("User-Agent")) {
			reqHeaders.set("User-Agent", "Dudit/1.0 (Edge Function)")
		}

		let response = await fetch(rawUrl, {
			...fetchOptions,
			headers: reqHeaders,
			redirect: "manual",
			signal: controller.signal,
		})

		let redirectCount = 0
		while (isRedirectStatus(response.status) && redirectCount < maxRedirects) {
			redirectCount++
			const location = response.headers.get("location")
			if (!location) break

			let redirectUrl: string
			try {
				redirectUrl = new URL(location, rawUrl).toString()
			} catch {
				throw new SSRFError(`Malformed redirect Location: ${location.substring(0, 100)}`)
			}

			const redirectValidation = validateUrl(redirectUrl, customAllowlist)
			if (!redirectValidation.valid) {
				throw new SSRFError(
					`Redirect blocked (hop ${redirectCount}): ${redirectValidation.error}`,
				)
			}

			response = await fetch(redirectUrl, {
				...fetchOptions,
				headers: reqHeaders,
				redirect: "manual",
				signal: controller.signal,
			})
		}

		if (isRedirectStatus(response.status)) {
			throw new SSRFError(`Too many redirects (followed ${redirectCount}, max: ${maxRedirects})`)
		}

		if (maxResponseBytes > 0) {
			response = await readResponseWithSizeLimit(response, maxResponseBytes)
		}

		return response
	} catch (err) {
		if (err instanceof Error && err.name === "AbortError") {
			throw new SSRFError(`Request timed out after ${timeoutMs}ms: ${rawUrl.substring(0, 100)}`)
		}
		if (err instanceof SSRFError) throw err
		const e = err as Error
		throw new SSRFError(`Fetch failed: ${e.message}`)
	} finally {
		clearTimeout(timeoutId)
	}
}
