/**
 * Módulo de consultas fiscais (CEP e CNPJ).
 * Substituição da antiga integração com a Nuvemfiscal.
 * Realiza as chamadas via rotas internas de API (/api/cep e /api/cnpj)
 * mantendo as mesmas assinaturas e retornos esperados pelos componentes.
 */

export async function consultarCEP(cep: string) {
  const cepClean = cep.replace(/\D/g, "")
  if (cepClean.length !== 8) {
    return { error: "CEP deve conter 8 dígitos" }
  }

  try {
    const url =
      typeof window !== "undefined"
        ? `/api/cep?cep=${cepClean}`
        : `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/cep?cep=${cepClean}`

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
    const url =
      typeof window !== "undefined"
        ? `/api/cnpj?cnpj=${cnpjClean}`
        : `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/cnpj?cnpj=${cnpjClean}`

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
