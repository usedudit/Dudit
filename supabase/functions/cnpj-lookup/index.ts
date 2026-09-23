import { safeFetch, SSRFError } from "../cep-lookup/ssrf-guard.ts"

const COMMON_FETCH_HEADERS = {
	"User-Agent": "Dudit/1.0 (Edge Function)",
	Accept: "application/json",
}

function categorizePhones(rawPhones: string[]) {
	let telefone_fixo = ""
	let celular = ""

	for (const raw of rawPhones) {
		if (!raw) continue
		const digits = raw.replace(/\D/g, "")
		if (!digits) continue

		const isMobile = digits.length === 11 || (digits.length === 9 && digits.startsWith("9"))

		if (isMobile && !celular) {
			celular = digits.length === 11
				? `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
				: digits
		} else if (!isMobile && !telefone_fixo) {
			telefone_fixo = digits.length === 10
				? `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
				: digits
		}
	}

	const primaryPhone = telefone_fixo || celular || ""

	return {
		telefone: primaryPhone,
		telefone_fixo: telefone_fixo || undefined,
		celular: celular || undefined,
	}
}

function mapCnpjaData(data: any, cnpj: string) {
	const rawPhones: string[] = []
	if (Array.isArray(data.phones)) {
		for (const p of data.phones) {
			if (p.area && p.number) {
				rawPhones.push(`${p.area}${p.number}`)
			} else if (p.number) {
				rawPhones.push(String(p.number))
			}
		}
	}

	const phoneObj = categorizePhones(rawPhones)

	let email = ""
	if (Array.isArray(data.emails) && data.emails.length > 0) {
		email = data.emails[0]?.address || ""
	}

	return {
		cnpj: data.taxId || cnpj,
		razao_social: data.company?.name || "",
		nome_fantasia: data.alias || data.company?.name || "",
		situacao_cadastral: data.status?.text || (data.status?.id ? String(data.status.id) : ""),
		logradouro: data.address?.street || "",
		numero: data.address?.number || "",
		complemento: data.address?.details || "",
		bairro: data.address?.district || "",
		cep: data.address?.zip || "",
		uf: data.address?.state || "",
		municipio: data.address?.city || "",
		municipio_codigo_ibge: data.address?.ibgeId ? String(data.address.ibgeId) : undefined,
		telefone: phoneObj.telefone,
		telefone_fixo: phoneObj.telefone_fixo,
		celular: phoneObj.celular,
		email: email,
		cnae_fiscal: data.mainActivity?.id ? String(data.mainActivity.id) : undefined,
		simples_optante: data.simples?.optant ?? false,
		simei_optante: data.simei?.optant ?? false,
	}
}

function mapBrasilApiData(bData: any, cnpj: string) {
	const rawPhones: string[] = []
	if (bData.ddd_telefone_1) rawPhones.push(String(bData.ddd_telefone_1))
	if (bData.ddd_telefone_2) rawPhones.push(String(bData.ddd_telefone_2))

	const phoneObj = categorizePhones(rawPhones)

	return {
		cnpj: bData.cnpj || cnpj,
		razao_social: bData.razao_social || "",
		nome_fantasia: bData.nome_fantasia || bData.razao_social || "",
		situacao_cadastral: bData.descricao_situacao_cadastral || "",
		logradouro: bData.logradouro || "",
		numero: bData.numero || "",
		complemento: bData.complemento || "",
		bairro: bData.bairro || "",
		cep: bData.cep || "",
		uf: bData.uf || "",
		municipio: bData.municipio || "",
		municipio_codigo_ibge: bData.codigo_municipio ? String(bData.codigo_municipio) : undefined,
		telefone: phoneObj.telefone,
		telefone_fixo: phoneObj.telefone_fixo,
		celular: phoneObj.celular,
		email: bData.email || "",
		cnae_fiscal: bData.cnae_fiscal ? String(bData.cnae_fiscal) : undefined,
		simples_optante: bData.opcao_pelo_simples ?? false,
		simei_optante: bData.opcao_pelo_mei ?? false,
	}
}

Deno.serve(async (req: Request) => {
	try {
		const url = new URL(req.url)
		const cnpj = url.searchParams.get("cnpj")?.replace(/\D/g, "")

		if (!cnpj || cnpj.length !== 14) {
			return new Response(JSON.stringify({ error: "CNPJ inválido" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		// 1. Try CNPJA Open API
		try {
			const response = await safeFetch(`https://open.cnpja.com/office/${cnpj}`, {
				headers: COMMON_FETCH_HEADERS,
				timeoutMs: 8_000,
				maxResponseBytes: 512 * 1024,
				maxRedirects: 2,
			})

			if (response.ok) {
				const data = await response.json()
				const mapped = mapCnpjaData(data, cnpj)
				return new Response(JSON.stringify(mapped), {
					status: 200,
					headers: {
						"Content-Type": "application/json",
						"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800",
					},
				})
			}
		} catch (err: unknown) {
			if (err instanceof SSRFError) {
				console.warn(`[CNPJ] SSRF guard blocked CNPJA: ${err.message}`)
			} else {
				console.warn(`[CNPJ] CNPJA error:`, (err as Error)?.message || err)
			}
		}

		// 2. Fallback: BrasilAPI
		try {
			const fallbackRes = await safeFetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
				headers: COMMON_FETCH_HEADERS,
				timeoutMs: 8_000,
				maxResponseBytes: 512 * 1024,
				maxRedirects: 2,
			})

			if (fallbackRes.ok) {
				const bData = await fallbackRes.json()
				const mapped = mapBrasilApiData(bData, cnpj)
				return new Response(JSON.stringify(mapped), {
					status: 200,
					headers: {
						"Content-Type": "application/json",
						"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800",
					},
				})
			} else if (fallbackRes.status === 404) {
				return new Response(JSON.stringify({ error: "CNPJ não encontrado" }), {
					status: 404,
					headers: { "Content-Type": "application/json" },
				})
			}
		} catch (err: unknown) {
			if (err instanceof SSRFError) {
				console.warn(`[CNPJ] SSRF guard blocked BrasilAPI: ${err.message}`)
			} else {
				console.error(`[CNPJ] BrasilAPI error:`, (err as Error)?.message || err)
			}
		}

		return new Response(JSON.stringify({ error: "Erro ao consultar CNPJ" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err)
		console.error("[CNPJ] Internal error:", message)
		return new Response(JSON.stringify({ error: "Internal server error" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
})
