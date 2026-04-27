"use server"

import { unstable_cache } from "next/cache"
import { safeFetch } from "@/lib/security/ssrf-guard"

// Nuvem Fiscal API integration
const NUVEM_FISCAL_AUTH_URL = "https://auth.nuvemfiscal.com.br/oauth/token"
const NUVEM_FISCAL_API_URL = "https://api.nuvemfiscal.com.br"

// Token cache in-memory (para reuso rápido na mesma execução)
let cachedToken: { access_token: string; expires_at: number } | null = null

// --- 1. Autenticação e Retry (Helpers Internos) ---

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3, baseDelay = 1000): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await safeFetch(url, {
        ...options,
        timeoutMs: 10_000,
        maxResponseBytes: 1 * 1024 * 1024, // 1 MB
      })
      if (response.status === 429) { // Rate limit
        const delay = baseDelay * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }
      return response
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }
    }
  }
  throw lastError || new Error("Max retries exceeded")
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expires_at > Date.now()) {
    return cachedToken.access_token
  }

  const clientId = process.env.NUVEM_FISCAL_CLIENT_ID
  const clientSecret = process.env.NUVEM_FISCAL_CLIENT_SECRET

  if (!clientId || !clientSecret) throw new Error("Credenciais Nuvem Fiscal ausentes")

  try {
    const response = await safeFetch(NUVEM_FISCAL_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "cep cnpj nfse nfe nfce",
      }),
      timeoutMs: 10_000,
      maxResponseBytes: 512 * 1024, // 512 KB
    })

    if (!response.ok) throw new Error(`Auth failed: ${response.status}`)
    const data = await response.json()

    cachedToken = {
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in - 300) * 1000,
    }
    return data.access_token
  } catch (error) {
    console.error("[Nuvem Fiscal] Auth Error:", error)
    throw error
  }
}

// --- 2. Funções Públicas com CACHE (A Otimização Real) ---

// Cacheia consultas de CEP por 30 dias (Dados de endereço mudam raramente)
export const consultarCEP = async (cep: string) => {
  const cepClean = cep.replace(/\D/g, "")
  if (cepClean.length !== 8) throw new Error("CEP deve conter 8 dígitos")

  return unstable_cache(
    async () => {
      try {
        const token = await getAccessToken()
        const response = await fetchWithRetry(`${NUVEM_FISCAL_API_URL}/cep/${cepClean}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        })

        if (!response.ok) {
          if (response.status === 404) return { error: "CEP não encontrado" }
          throw new Error(`Erro API: ${response.status}`)
        }

        const data = await response.json()
        return {
          cep: data.cep,
          logradouro: data.logradouro,
          complemento: data.complemento || "",
          bairro: data.bairro,
          localidade: data.municipio,
          uf: data.uf,
          ibge: data.codigo_municipio, // <--- O CÓDIGO IMPORTANTE AQUI
        }
      } catch (error: any) {
        console.error("[Nuvem Fiscal] CEP Error:", error)
        throw error
      }
    },
    [`cep-query-${cepClean}`],
    { tags: ["cep-cache"], revalidate: 2592000 } // 30 dias
  )()
}

// Cacheia consultas de CNPJ por 7 dias
export const consultarCNPJ = async (cnpj: string) => {
  const cnpjClean = cnpj.replace(/\D/g, "")
  if (cnpjClean.length !== 14) throw new Error("CNPJ inválido")

  return unstable_cache(
    async () => {
      try {
        const token = await getAccessToken()
        const response = await fetchWithRetry(`${NUVEM_FISCAL_API_URL}/cnpj/${cnpjClean}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        })

        if (!response.ok) {
          if (response.status === 404) return { error: "CNPJ não encontrado" }
          throw new Error(`Erro API: ${response.status}`)
        }

        const data = await response.json()
        return {
          cnpj: data.cnpj,
          razao_social: data.razao_social,
          nome_fantasia: data.nome_fantasia,
          situacao_cadastral: data.situacao_cadastral,
          logradouro: data.endereco?.logradouro,
          numero: data.endereco?.numero,
          complemento: data.endereco?.complemento,
          bairro: data.endereco?.bairro,
          cep: data.endereco?.cep,
          uf: data.endereco?.uf,
          municipio: data.endereco?.municipio,
          municipio_codigo_ibge: data.endereco?.codigo_municipio, // Mapeado para uso futuro
          telefone: data.telefone,
          email: data.email,
          cnae_fiscal: data.cnae_principal?.codigo,
        }
      } catch (error: any) {
        console.error("[Nuvem Fiscal] CNPJ Error:", error)
        throw error
      }
    },
    [`cnpj-query-${cnpjClean}`],
    { tags: ["cnpj-cache"], revalidate: 604800 } // 7 dias
  )()
}
