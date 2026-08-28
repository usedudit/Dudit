import { type NextRequest, NextResponse } from "next/server"
import { safeFetch } from "@/lib/security/ssrf-guard"
import { geocodeAddress } from "@/lib/services/location.service"

const STREET_TYPE_PREFIXES = /^(r\.|rua|av\.|avenida|tv\.|travessa|al\.|alameda|rod\.|rodovia|estrada|estr\.|praca|praça|pc\.|pç\.|largo|lg\.|quadra|qd\.|bloco|bl\.|setor|st\.|vila|vl\.|parque|pq\.|jardim|jd\.)$/i

function cleanAddressLogradouro(rawLogradouro: string) {
  let cleanLogradouro = (rawLogradouro || "").trim()
  let parsedNumber = ""

  if (!cleanLogradouro) return { cleanLogradouro: "", parsedNumber: "" }

  // 1. Remove standard Correios range or side descriptors from logradouro (e.g., ' - de 100 a 200', ' - lado ímpar', ' - até...')
  const rangeMatch = cleanLogradouro.match(/^(.+?)\s*-\s*(?:de\s+\d+|até\s+\d+|lado\s+(?:par|ímpar)|unidade).*$/i)
  if (rangeMatch) {
    cleanLogradouro = rangeMatch[1].trim()
  }

  // 2. Comma with number/sn after it: e.g. 'Praça da Sé, 108' or 'Av Paulista, 1000 - Sala 1' or 'Praça da Sé, nº 108'
  const commaMatch = cleanLogradouro.match(/^(.+?),\s*(?:n[º°.]*|no\.?|num(?:ero)?\.?)?\s*(\d+[a-zA-Z]?|s\/n)\b/i)
  if (commaMatch) {
    const streetPart = commaMatch[1].trim()
    const numPart = commaMatch[2].trim()
    if (!STREET_TYPE_PREFIXES.test(streetPart)) {
      return {
        cleanLogradouro: streetPart,
        parsedNumber: numPart,
      }
    }
  }

  // 3. Explicit prefix like ' nº 108', ' n° 108', ' num 108', ' no. 108'
  const numPrefixMatch = cleanLogradouro.match(/^(.+?)\s+(?:n[º°.]+|no\.|num(?:ero)?\.?)\s*(\d+[a-zA-Z]?|s\/n)\b/i)
  if (numPrefixMatch) {
    const streetPart = numPrefixMatch[1].trim()
    const numPart = numPrefixMatch[2].trim()
    if (!STREET_TYPE_PREFIXES.test(streetPart)) {
      return {
        cleanLogradouro: streetPart,
        parsedNumber: numPart,
      }
    }
  }

  // 4. Number at the end of the logradouro: e.g. 'Praça da Sé 108' or 'Rua 25 de Março 100' or 'Praça da Sé 108 - Bloco B'
  const endNumMatch = cleanLogradouro.match(/^(.+?)\s+(\d+[a-zA-Z]?|s\/n)(?:\s*-\s*.*)?$/i)
  if (endNumMatch) {
    const streetPart = endNumMatch[1].trim()
    const numPart = endNumMatch[2].trim()
    if (!STREET_TYPE_PREFIXES.test(streetPart)) {
      return {
        cleanLogradouro: streetPart,
        parsedNumber: numPart,
      }
    }
  }

  return { cleanLogradouro, parsedNumber }
}

const COMMON_FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Dudit/1.0",
  "Accept": "application/json",
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
      headers: COMMON_FETCH_HEADERS,
      timeoutMs: 6_000,
      maxResponseBytes: 256 * 1024,
      maxRedirects: 2,
      skipDnsCheck: true,
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
          complemento: cleanComplemento,
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
  } catch (viaCepErr: any) {
    console.warn(`[API CEP] Falha ao consultar ViaCEP para ${cep}:`, viaCepErr?.message || viaCepErr)
  }

  // 2. Fallback para BrasilAPI caso ViaCEP falhe
  try {
    const fallbackRes = await safeFetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, {
      headers: COMMON_FETCH_HEADERS,
      timeoutMs: 6_000,
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
            console.warn(`[API CEP] Falha na geocodificação fallback BrasilAPI do CEP ${cep}:`, geocodeErr)
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
  } catch (fallbackErr: any) {
    console.warn(`[API CEP] Falha no fallback BrasilAPI para ${cep}:`, fallbackErr?.message || fallbackErr)
  }

  // 3. Fallback 3: AwesomeAPI (inclui latitude e longitude de quase todos os CEPs do Brasil)
  try {
    const awesomeRes = await safeFetch(`https://cep.awesomeapi.com.br/json/${cep}`, {
      headers: COMMON_FETCH_HEADERS,
      timeoutMs: 6_000,
      maxResponseBytes: 256 * 1024,
      maxRedirects: 2,
      skipDnsCheck: true,
    })

    if (awesomeRes.ok) {
      const awesomeData = await awesomeRes.json()
      const { cleanLogradouro, parsedNumber } = cleanAddressLogradouro(awesomeData.address || awesomeData.address_name || "")

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

      const mappedData = {
        cep: formattedCep,
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

      return NextResponse.json(mappedData, {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
        },
      })
    }
  } catch (awesomeErr: any) {
    console.warn(`[API CEP] Falha no fallback AwesomeAPI para ${cep}:`, awesomeErr?.message || awesomeErr)
  }

  return NextResponse.json({ error: "Erro interno ao buscar CEP" }, { status: 500 })
}
