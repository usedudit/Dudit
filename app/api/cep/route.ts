import { type NextRequest, NextResponse } from "next/server"
import { consultarCEP } from "@/lib/nuvem-fiscal"
import { safeFetch } from "@/lib/security/ssrf-guard"

export const runtime = "edge"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const cep = searchParams.get("cep")?.replace(/\D/g, "")

  if (!cep || cep.length !== 8) {
    return NextResponse.json({ error: "CEP inválido" }, { status: 400 })
  }

  try {
    // 1. Tentar Nuvem Fiscal primeiro
    const data = await consultarCEP(cep)

    // Se retornou erro de não encontrado, vamos para o fallback
    if (data && (data as any).error === "CEP não encontrado") {
      throw new Error("CEP não encontrado na Nuvem Fiscal")
    }

    // Parse logradouro to extract number
    let cleanLogradouro = data.logradouro || ""
    let parsedNumber = ""
    const commaIndex = cleanLogradouro.lastIndexOf(",")
    if (commaIndex !== -1) {
      const afterComma = cleanLogradouro.substring(commaIndex + 1).trim()
      if (/^(\d+|s\/n)/i.test(afterComma)) {
        cleanLogradouro = cleanLogradouro.substring(0, commaIndex).trim()
        parsedNumber = afterComma.split(" - ")[0].trim()
      }
    }

    const responseData = {
      ...data,
      logradouro: cleanLogradouro,
      numero: parsedNumber,
    }

    return NextResponse.json(responseData, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
      },
    })
  } catch (error) {
    console.warn(`[API CEP] Falha na Nuvem Fiscal para o CEP ${cep}, tentando ViaCEP...`)

    try {
      // 2. Fallback para ViaCEP
      // 2. Fallback para ViaCEP - safeFetch enforces hostname allowlist + timeout
      // CEP is already digits-only (line 8), safe from path injection
      const response = await safeFetch(`https://viacep.com.br/ws/${cep}/json/`, {
        timeoutMs: 8_000,
        maxResponseBytes: 256 * 1024, // 256 KB - CEP responses are tiny JSON
        maxRedirects: 2,
        skipDnsCheck: true, // Edge runtime - dns module unavailable
      })
      const viaCepData = await response.json()

      if (viaCepData.erro) {
        return NextResponse.json({ error: "CEP não encontrado" }, { status: 404 })
      }

      // Mapear dados do ViaCEP para o formato esperado pela aplicação
      let cleanLogradouro = viaCepData.logradouro || ""
      let parsedNumber = ""
      const commaIndex = cleanLogradouro.lastIndexOf(",")
      if (commaIndex !== -1) {
        const afterComma = cleanLogradouro.substring(commaIndex + 1).trim()
        if (/^(\d+|s\/n)/i.test(afterComma)) {
          cleanLogradouro = cleanLogradouro.substring(0, commaIndex).trim()
          parsedNumber = afterComma.split(" - ")[0].trim()
        }
      }

      const mappedData = {
        cep: viaCepData.cep,
        logradouro: cleanLogradouro,
        numero: parsedNumber,
        complemento: viaCepData.complemento || "",
        bairro: viaCepData.bairro,
        localidade: viaCepData.localidade,
        uf: viaCepData.uf,
        ibge: viaCepData.ibge,
      }

      return NextResponse.json(mappedData, {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
        },
      })
    } catch (fallbackError) {
      console.error("[API CEP] Erro no fallback ViaCEP:", fallbackError)
      return NextResponse.json({ error: "Erro ao buscar CEP em ambos os provedores" }, { status: 500 })
    }
  }
}
