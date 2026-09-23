import { safeFetch, SSRFError } from "./ssrf-guard.ts"
import type { CepLookupResult } from "./types.ts"

const STREET_TYPE_PREFIXES = /^(r\.|rua|av\.|avenida|tv\.|travessa|al\.|alameda|rod\.|rodovia|estrada|estr\.|praca|praça|pc\.|pç\.|largo|lg\.|quadra|qd\.|bloco|bl\.|setor|st\.|vila|vl\.|parque|pq\.|jardim|jd\.)$/i

const COMMON_FETCH_HEADERS = {
	"User-Agent": "Dudit/1.0 (Edge Function)",
	Accept: "application/json",
}

const NOMINATIM_USER_AGENT = "Dudit/1.0 (contato@dudit.com.br)"
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function cleanAddressLogradouro(rawLogradouro: string) {
	let cleanLogradouro = (rawLogradouro || "").trim()
	let parsedNumber = ""

	if (!cleanLogradouro) return { cleanLogradouro: "", parsedNumber: "" }

	const rangeMatch = cleanLogradouro.match(/^(.+?)\s*-\s*(?:de\s+\d+|até\s+\d+|lado\s+(?:par|ímpar)|unidade).*$/i)
	if (rangeMatch) {
		cleanLogradouro = rangeMatch[1].trim()
	}

	const commaMatch = cleanLogradouro.match(/^(.+?),\s*(?:n[º°.]*|no\.?|num(?:ero)?\.?)?\s*(\d+[a-zA-Z]?|s\/n)\b/i)
	if (commaMatch) {
		const streetPart = commaMatch[1].trim()
		const numPart = commaMatch[2].trim()
		if (!STREET_TYPE_PREFIXES.test(streetPart)) {
			return { cleanLogradouro: streetPart, parsedNumber: numPart }
		}
	}

	const numPrefixMatch = cleanLogradouro.match(/^(.+?)\s+(?:n[º°.]+|no\.|num(?:ero)?\.?)\s*(\d+[a-zA-Z]?|s\/n)\b/i)
	if (numPrefixMatch) {
		const streetPart = numPrefixMatch[1].trim()
		const numPart = numPrefixMatch[2].trim()
		if (!STREET_TYPE_PREFIXES.test(streetPart)) {
			return { cleanLogradouro: streetPart, parsedNumber: numPart }
		}
	}

	const endNumMatch = cleanLogradouro.match(/^(.+?)\s+(\d+[a-zA-Z]?|s\/n)(?:\s*-\s*.*)?$/i)
	if (endNumMatch) {
		const streetPart = endNumMatch[1].trim()
		const numPart = endNumMatch[2].trim()
		if (!STREET_TYPE_PREFIXES.test(streetPart)) {
			return { cleanLogradouro: streetPart, parsedNumber: numPart }
		}
	}

	return { cleanLogradouro, parsedNumber }
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
	if (!address) return null

	const raw = String(address || "").trim()
	const cepMatch = raw.match(/\b(\d{5})-?(\d{3})\b/)
	if (cepMatch) {
		const cleanCep = `${cepMatch[1]}${cepMatch[2]}`
		try {
			const cepRes = await safeFetch(`https://cep.awesomeapi.com.br/json/${cleanCep}`, {
				headers: { "User-Agent": NOMINATIM_USER_AGENT },
				timeoutMs: 3500,
			})
			if (cepRes.ok) {
				const data = await cepRes.json()
				if (data.lat && data.lng) {
					const lat = Number(data.lat)
					const lng = Number(data.lng)
					if (!isNaN(lat) && !isNaN(lng)) return { lat, lng }
				}
			}
		} catch {
			// Fallback to Nominatim
		}
	}

	const query = raw
		.replace(/\b\d{5}-?\d{3}\b/g, "")
		.replace(/\s*-\s*/g, ", ")
		.replace(/,\s*BR\b/gi, "")
		.replace(/,\s*Brasil\b/gi, "")
		.replace(/,\s*Brazil\b/gi, "")
		.replace(/,\s*,/g, ",")
		.replace(/\s{2,}/g, " ")
		.replace(/,\s*$/g, "")
		.trim()

	if (!query) return null

	const rawParts = query.split(",").map((s) => s.trim()).filter(Boolean)
	let cityStateQuery: string | null = null

	if (rawParts.length >= 3) {
		const state = rawParts[rawParts.length - 1]
		const city = rawParts[rawParts.length - 2]
		cityStateQuery = `${city}, ${state}`
	} else if (rawParts.length === 2) {
		cityStateQuery = `${rawParts[0]}, ${rawParts[1]}`
	} else {
		cityStateQuery = query
	}

	if (!cityStateQuery) return null

	const params = new URLSearchParams({
		q: cityStateQuery,
		format: "jsonv2",
		limit: "1",
		countrycodes: "br",
		addressdetails: "0",
	})
	const url = `${NOMINATIM_URL}?${params.toString()}`

	for (let attempt = 0; attempt <= 1; attempt++) {
		try {
			const controller = new AbortController()
			setTimeout(() => controller.abort(), 3500)

			const response = await safeFetch(url, {
				headers: {
					"User-Agent": NOMINATIM_USER_AGENT,
					Accept: "application/json",
				},
				timeoutMs: 3500,
				signal: controller.signal,
			})

			if (!response.ok) {
				if (attempt < 1 && response.status >= 500) {
					await sleep(250 * (attempt + 1))
					continue
				}
				return null
			}

			const payload = await response.json()
			const first = Array.isArray(payload) ? payload[0] : null
			if (!first) return null
			const lat = Number(first?.lat)
			const lng = Number(first?.lon)
			if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
				return { lat, lng }
			}
			return null
		} catch {
			if (attempt < 1) {
				await sleep(250 * (attempt + 1))
				continue
			}
			return null
		}
	}

	return null
}

async function fetchCep(cep: string): Promise<CepLookupResult | null> {
	// 1. Try ViaCEP
	try {
		const response = await safeFetch(`https://viacep.com.br/ws/${cep}/json/`, {
			headers: COMMON_FETCH_HEADERS,
			timeoutMs: 6_000,
			maxResponseBytes: 256 * 1024,
			maxRedirects: 2,
		})

		if (response.ok) {
			const viaCepData = await response.json()
			if (!viaCepData.erro) {
				let { cleanLogradouro, parsedNumber } = cleanAddressLogradouro(viaCepData.logradouro || "")
				let cleanComplemento = viaCepData.complemento || ""

				if (!parsedNumber && cleanComplemento) {
					const compMatch = cleanComplemento.trim().match(/^(?:(?:n[º°.]*|no\.?|num(?:ero)?\.?)\s*)?(\d+[a-zA-Z]?|s\/n)$/i)
					if (compMatch) {
						parsedNumber = compMatch[1].trim()
						cleanComplemento = ""
					}
				}

				let latitude: number | null = null
				let longitude: number | null = null

				const addressParts = [
					cleanLogradouro,
					viaCepData.bairro,
					viaCepData.localidade,
					viaCepData.uf,
					"Brasil",
				].filter(Boolean)

				if (addressParts.length > 0) {
					const coords = await geocodeAddress(addressParts.join(", "))
					if (coords) {
						latitude = coords.lat
						longitude = coords.lng
					}
				}

				return {
					cep: viaCepData.cep || `${cep.slice(0, 5)}-${cep.slice(5)}`,
					logradouro: cleanLogradouro,
					numero: parsedNumber,
					complemento: cleanComplemento,
					bairro: viaCepData.bairro || "",
					localidade: viaCepData.localidade || "",
					uf: viaCepData.uf || "",
					ibge: viaCepData.ibge || "",
					latitude,
					longitude,
				}
			} else {
				return null
			}
		}
	} catch (err: unknown) {
		if (err instanceof SSRFError) {
			console.warn(`[CEP] SSRF guard blocked ViaCEP: ${err.message}`)
		} else {
			console.warn(`[CEP] ViaCEP error:`, (err as Error)?.message || err)
		}
	}

	// 2. Fallback: BrasilAPI
	try {
		const fallbackRes = await safeFetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, {
			headers: COMMON_FETCH_HEADERS,
			timeoutMs: 6_000,
			maxResponseBytes: 256 * 1024,
			maxRedirects: 2,
		})

		if (fallbackRes.ok) {
			const brasilApiData = await fallbackRes.json()
			const { cleanLogradouro, parsedNumber } = cleanAddressLogradouro(brasilApiData.street || "")

			let latitude: number | null = null
			let longitude: number | null = null

			if (brasilApiData.location?.coordinates) {
				const coords = brasilApiData.location.coordinates
				if (typeof coords.latitude === "number" || typeof coords.latitude === "string") {
					const parsedLat = Number(coords.latitude)
					if (!isNaN(parsedLat)) latitude = parsedLat
				}
				if (typeof coords.longitude === "number" || typeof coords.longitude === "string") {
					const parsedLng = Number(coords.longitude)
					if (!isNaN(parsedLng)) longitude = parsedLng
				}
			}

			if (!latitude || !longitude) {
				const addressParts = [
					cleanLogradouro,
					brasilApiData.neighborhood,
					brasilApiData.city,
					brasilApiData.state,
					"Brasil",
				].filter(Boolean)

				if (addressParts.length > 0) {
					const coords = await geocodeAddress(addressParts.join(", "))
					if (coords) {
						latitude = coords.lat
						longitude = coords.lng
					}
				}
			}

			return {
				cep: `${cep.slice(0, 5)}-${cep.slice(5)}`,
				logradouro: cleanLogradouro,
				numero: parsedNumber,
				complemento: "",
				bairro: brasilApiData.neighborhood || "",
				localidade: brasilApiData.city || "",
				uf: brasilApiData.state || "",
				ibge: "",
				latitude,
				longitude,
			}
		} else if (fallbackRes.status === 404) {
			return null
		}
	} catch (err: unknown) {
		if (err instanceof SSRFError) {
			console.warn(`[CEP] SSRF guard blocked BrasilAPI: ${err.message}`)
		} else {
			console.warn(`[CEP] BrasilAPI error:`, (err as Error)?.message || err)
		}
	}

	// 3. Fallback: AwesomeAPI
	try {
		const awesomeRes = await safeFetch(`https://cep.awesomeapi.com.br/json/${cep}`, {
			headers: COMMON_FETCH_HEADERS,
			timeoutMs: 6_000,
			maxResponseBytes: 256 * 1024,
			maxRedirects: 2,
		})

		if (awesomeRes.ok) {
			const awesomeData = await awesomeRes.json()
			const { cleanLogradouro, parsedNumber } = cleanAddressLogradouro(
				awesomeData.address || awesomeData.address_name || "",
			)

			let latitude: number | null = null
			let longitude: number | null = null

			if (awesomeData.lat && awesomeData.lng) {
				const pLat = Number(awesomeData.lat)
				const pLng = Number(awesomeData.lng)
				if (!isNaN(pLat) && !isNaN(pLng)) {
					latitude = pLat
					longitude = pLng
				}
			}

			return {
				cep: `${cep.slice(0, 5)}-${cep.slice(5)}`,
				logradouro: cleanLogradouro,
				numero: parsedNumber,
				complemento: "",
				bairro: awesomeData.district || "",
				localidade: awesomeData.city || "",
				uf: awesomeData.state || "",
				ibge: awesomeData.city_ibge || "",
				latitude,
				longitude,
			}
		}
	} catch (err: unknown) {
		if (err instanceof SSRFError) {
			console.warn(`[CEP] SSRF guard blocked AwesomeAPI: ${err.message}`)
		} else {
			console.warn(`[CEP] AwesomeAPI error:`, (err as Error)?.message || err)
		}
	}

	return null
}

Deno.serve(async (req: Request) => {
	try {
		const url = new URL(req.url)
		const cep = url.searchParams.get("cep")?.replace(/\D/g, "")

		if (!cep || cep.length !== 8) {
			return new Response(JSON.stringify({ error: "CEP inválido" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const result = await fetchCep(cep)

		if (!result) {
			return new Response(JSON.stringify({ error: "CEP não encontrado" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
			},
		})
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err)
		console.error("[CEP] Internal error:", message)

		return new Response(JSON.stringify({ error: "Erro interno ao buscar CEP" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
})
