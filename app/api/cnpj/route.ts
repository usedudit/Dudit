import { type NextRequest, NextResponse } from "next/server"
import { consultarCNPJ } from "@/lib/nuvem-fiscal"

export const runtime = "edge"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const cnpj = searchParams.get("cnpj")?.replace(/\D/g, "")

  if (!cnpj || cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido" }, { status: 400 })
  }

  try {
    const data = await consultarCNPJ(cnpj)

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800",
      },
    })
  } catch (error) {
    console.error("Erro ao buscar CNPJ:", error)

    if (error instanceof Error) {
      if (error.message.includes("não encontrado")) {
        return NextResponse.json({ error: "CNPJ não encontrado" }, { status: 404 })
      }
    }

    return NextResponse.json({ error: "Erro interno ao buscar CNPJ" }, { status: 500 })
  }
}
