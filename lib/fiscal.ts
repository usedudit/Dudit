/**
 * Módulo de consultas fiscais (CEP e CNPJ).
 * Direciona chamadas para as Edge Functions do Supabase para latência mínima
 * (execução na borda, < 30ms de cold start, SSRF-safe).
 * Mantém as mesmas assinaturas e retornos esperados pelos componentes.
 */

const SUPABASE_FUNCTIONS_URL =
	typeof window !== "undefined"
		? `${process.env.NEXT_PUBLIC_SUPABASE_URL || ""}/functions/v1`
		: `${process.env.NEXT_PUBLIC_SUPABASE_URL || ""}/functions/v1`

export async function consultarCEP(cep: string) {
	const cepClean = cep.replace(/\D/g, "")
	if (cepClean.length !== 8) {
		return { error: "CEP deve conter 8 dígitos" }
	}

	try {
		const url = `${SUPABASE_FUNCTIONS_URL}/cep-lookup?cep=${cepClean}`

		const res = await fetch(url)
		if (!res.ok) {
			const errData = await res.json().catch(() => ({}))
			return { error: errData.error || "CEP não encontrado" }
		}

		return await res.json()
	} catch (error: any) {
		console.error("[consultarCEP Error]:", error)
		return { error: "Erro ao consultar CEP" }
	}
}

export async function consultarCNPJ(cnpj: string) {
	const cnpjClean = cnpj.replace(/\D/g, "")
	if (cnpjClean.length !== 14) {
		return { error: "CNPJ inválido" }
	}

	try {
		const url = `${SUPABASE_FUNCTIONS_URL}/cnpj-lookup?cnpj=${cnpjClean}`

		const res = await fetch(url)
		if (!res.ok) {
			const errData = await res.json().catch(() => ({}))
			return { error: errData.error || "CNPJ não encontrado" }
		}

		return await res.json()
	} catch (error: any) {
		console.error("[consultarCNPJ Error]:", error)
		return { error: "Erro ao consultar CNPJ" }
	}
}
