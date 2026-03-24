import { type NextRequest, NextResponse } from "next/server"
import { consultarCEP } from "@/lib/nuvem-fiscal"

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

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
      },
    })
  } catch (error) {
    console.warn(`[API CEP] Falha na Nuvem Fiscal para o CEP ${cep}, tentando ViaCEP...`)

    try {
      // 2. Fallback para ViaCEP
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const viaCepData = await response.json()

      if (viaCepData.erro) {
        return NextResponse.json({ error: "CEP não encontrado" }, { status: 404 })
      }

      // Mapear dados do ViaCEP para o formato esperado pela aplicação
      const mappedData = {
        cep: viaCepData.cep,
        logradouro: viaCepData.logradouro,
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
