import { type NextRequest, NextResponse } from "next/server"
import { safeFetch } from "@/lib/security/ssrf-guard"
import { geocodeAddress } from "@/lib/services/location.service"

export const runtime = "edge"

function cleanAddressLogradouro(rawLogradouro: string) {
  let cleanLogradouro = rawLogradouro || ""
  let parsedNumber = ""
  const commaIndex = cleanLogradouro.lastIndexOf(",")
  if (commaIndex !== -1) {
    const afterComma = cleanLogradouro.substring(commaIndex + 1).trim()
    if (/^(\d+|s\/n)/i.test(afterComma)) {
      cleanLogradouro = cleanLogradouro.substring(0, commaIndex).trim()
      parsedNumber = afterComma.split(" - ")[0].trim()
    }
  }
  return { cleanLogradouro, parsedNumber }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const cep = searchParams.get("cep")?.replace(/\D/g, "")

  if (!cep || cep.length !== 8) {
    return NextResponse.json({ error: "CEP inválido" }, { status: 400 })
  }

  const formattedCep = `${cep.slice(0, 5)}-${cep.slice(5)}`

  // 1. Tentar ViaCEP primeiro
  try {
    const response = await safeFetch(`https://viacep.com.br/ws/${cep}/json/`, {
      timeoutMs: 8_000,
      maxResponseBytes: 256 * 1024,
      maxRedirects: 2,
      skipDnsCheck: true,
    })

    if (response.ok) {
      const viaCepData = await response.json()

      if (!viaCepData.erro) {
        const { cleanLogradouro, parsedNumber } = cleanAddressLogradouro(viaCepData.logradouro || "")

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
          cep: viaCepData.cep || formattedCep,
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
      } else {
        return NextResponse.json({ error: "CEP não encontrado" }, { status: 404 })
      }
    }
  } catch (viaCepErr) {
    console.warn(`[API CEP] Falha ao consultar ViaCEP para ${cep}:`, viaCepErr)
  }

  // 2. Fallback para BrasilAPI caso ViaCEP falhe (erro de rede, timeout, SSRF guard, etc)
  try {
    const fallbackRes = await safeFetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, {
      timeoutMs: 8_000,
      maxResponseBytes: 256 * 1024,
      maxRedirects: 2,
      skipDnsCheck: true,
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
          try {
            const fullAddress = addressParts.join(", ")
            const coords = await geocodeAddress(fullAddress)
            if (coords) {
              latitude = coords.lat
              longitude = coords.lng
            }
          } catch (geocodeErr) {
            console.warn(`[API CEP] Falha na geocodificação fallback do CEP ${cep}:`, geocodeErr)
          }
        }
      }

      const mappedData = {
        cep: formattedCep,
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

      return NextResponse.json(mappedData, {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
        },
      })
    } else if (fallbackRes.status === 404) {
      return NextResponse.json({ error: "CEP não encontrado" }, { status: 404 })
    }
  } catch (fallbackErr) {
    console.warn(`[API CEP] Falha no fallback BrasilAPI para ${cep}:`, fallbackErr)
  }

  return NextResponse.json({ error: "Erro interno ao buscar CEP" }, { status: 500 })
}
