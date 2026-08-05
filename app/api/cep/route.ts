import { type NextRequest, NextResponse } from "next/server"
import { safeFetch } from "@/lib/security/ssrf-guard"
import { geocodeAddress } from "@/lib/services/location.service"

export const runtime = "edge"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const cep = searchParams.get("cep")?.replace(/\D/g, "")

  if (!cep || cep.length !== 8) {
    return NextResponse.json({ error: "CEP inválido" }, { status: 400 })
  }

  try {
    // Consulta direta ao ViaCEP via safeFetch
    const response = await safeFetch(`https://viacep.com.br/ws/${cep}/json/`, {
      timeoutMs: 8_000,
      maxResponseBytes: 256 * 1024,
      maxRedirects: 2,
      skipDnsCheck: true,
    })

    const viaCepData = await response.json()

    if (viaCepData.erro) {
      return NextResponse.json({ error: "CEP não encontrado" }, { status: 404 })
    }

    // Extrai e sanitiza logradouro e número se presentes
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

    // Obter latitude e longitude via geocodificação
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
      try {
        const fullAddress = addressParts.join(", ")
        const coords = await geocodeAddress(fullAddress)
        if (coords) {
          latitude = coords.lat
          longitude = coords.lng
        }
      } catch (geocodeErr) {
        console.warn(`[API CEP] Falha na geocodificação do CEP ${cep}:`, geocodeErr)
      }
    }

    const mappedData = {
      cep: viaCepData.cep,
      logradouro: cleanLogradouro,
      numero: parsedNumber,
      complemento: viaCepData.complemento || "",
      bairro: viaCepData.bairro || "",
      localidade: viaCepData.localidade || "",
      uf: viaCepData.uf || "",
      ibge: viaCepData.ibge || "",
      latitude,
      longitude,
    }

    return NextResponse.json(mappedData, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
      },
    })
  } catch (error) {
    console.error(`[API CEP] Erro ao buscar CEP ${cep}:`, error)
    return NextResponse.json({ error: "Erro interno ao buscar CEP" }, { status: 500 })
  }
}
