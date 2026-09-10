import { type NextRequest, NextResponse } from "next/server"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const rawCep = searchParams.get("cep") || ""
  const cleanCep = rawCep.replace(/\D/g, "")
  const partnerId = searchParams.get("partnerId")

  if (!cleanCep || cleanCep.length !== 8) {
    return NextResponse.json({ error: "CEP inválido" }, { status: 400 })
  }

  // 1. If partnerId is present and has an active MP token, try Mercado Libre's official API first
  if (partnerId) {
    try {
      const token = await getValidMercadoPagoAccessToken(partnerId)
      if (token) {
        const meliRes = await fetch(`https://api.mercadolibre.com/countries/BR/zip_codes/${cleanCep}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(3000),
        })

        if (meliRes.ok) {
          const meliData = await meliRes.json()
          return NextResponse.json(meliData, {
            status: 200,
            headers: {
              "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
            },
          })
        }
      }
    } catch {
      // Fallback to Dudit internal CEP resolution
    }
  }

  // 2. Fallback to Dudit internal /api/cep endpoint
  try {
    const cepUrl = new URL(`/api/cep?cep=${cleanCep}`, request.url)
    const localRes = await fetch(cepUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    })

    if (localRes.ok) {
      const data = await localRes.json()
      const street = data.logradouro || ""
      const neighborhood = data.bairro || ""
      const city = data.localidade || data.municipio || ""
      const state = data.uf || ""

      const meliResponse = {
        zip_code: cleanCep,
        street_name: street,
        street: street,
        neighborhood: {
          id: "",
          name: neighborhood,
        },
        city: {
          id: `BR-${state}`,
          name: city,
        },
        state: {
          id: `BR-${state}`,
          name: state,
        },
        country: {
          id: "BR",
          name: "Brasil",
        },
        extended_attributes: {
          address: street,
          street: street,
          city_name: city,
          neighborhood: neighborhood,
          status: "active",
        },
      }

      return NextResponse.json(meliResponse, {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
        },
      })
    }
  } catch (err: any) {
    console.warn(`[MP ZipCode] Erro ao buscar CEP ${cleanCep}:`, err?.message || err)
  }

  return NextResponse.json({ error: "CEP não encontrado" }, { status: 404 })
}
