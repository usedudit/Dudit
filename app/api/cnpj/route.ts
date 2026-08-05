import { type NextRequest, NextResponse } from "next/server"
import { safeFetch } from "@/lib/security/ssrf-guard"

export const runtime = "edge"

function mapCnpjaData(data: any, cnpj: string) {
  let phone = ""
  if (Array.isArray(data.phones) && data.phones.length > 0) {
    const p = data.phones[0]
    if (p.area && p.number) {
      phone = `(${p.area}) ${p.number}`
    } else if (p.number) {
      phone = String(p.number)
    }
  }

  let email = ""
  if (Array.isArray(data.emails) && data.emails.length > 0) {
    email = data.emails[0]?.address || ""
  }

  return {
    cnpj: data.taxId || cnpj,
    razao_social: data.company?.name || "",
    nome_fantasia: data.alias || data.company?.name || "",
    situacao_cadastral: data.status?.text || (data.status?.id ? String(data.status.id) : ""),
    logradouro: data.address?.street || "",
    numero: data.address?.number || "",
    complemento: data.address?.details || "",
    bairro: data.address?.district || "",
    cep: data.address?.zip || "",
    uf: data.address?.state || "",
    municipio: data.address?.city || "",
    municipio_codigo_ibge: data.address?.ibgeId ? String(data.address.ibgeId) : undefined,
    telefone: phone,
    email: email,
    cnae_fiscal: data.mainActivity?.id ? String(data.mainActivity.id) : undefined,
    simples_optante: data.simples?.optant ?? false,
    simei_optante: data.simei?.optant ?? false,
  }
}

function mapBrasilApiData(bData: any, cnpj: string) {
  let phone = ""
  if (bData.ddd_telefone_1) {
    phone = bData.ddd_telefone_1
  }

  return {
    cnpj: bData.cnpj || cnpj,
    razao_social: bData.razao_social || "",
    nome_fantasia: bData.nome_fantasia || bData.razao_social || "",
    situacao_cadastral: bData.descricao_situacao_cadastral || "",
    logradouro: bData.logradouro || "",
    numero: bData.numero || "",
    complemento: bData.complemento || "",
    bairro: bData.bairro || "",
    cep: bData.cep || "",
    uf: bData.uf || "",
    municipio: bData.municipio || "",
    municipio_codigo_ibge: bData.codigo_municipio ? String(bData.codigo_municipio) : undefined,
    telefone: phone,
    email: bData.email || "",
    cnae_fiscal: bData.cnae_fiscal ? String(bData.cnae_fiscal) : undefined,
    simples_optante: bData.opcao_pelo_simples ?? false,
    simei_optante: bData.opcao_pelo_mei ?? false,
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const cnpj = searchParams.get("cnpj")?.replace(/\D/g, "")

  if (!cnpj || cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido" }, { status: 400 })
  }

  // 1. Tentar CNPJA Open API primeiro
  try {
    const response = await safeFetch(`https://open.cnpja.com/office/${cnpj}`, {
      timeoutMs: 8_000,
      maxResponseBytes: 512 * 1024,
      maxRedirects: 2,
      skipDnsCheck: true,
    })

    if (response.ok) {
      const data = await response.json()
      const mapped = mapCnpjaData(data, cnpj)
      return NextResponse.json(mapped, {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800",
        },
      })
    }
  } catch (cnpjaErr) {
    console.warn(`[API CNPJ] Falha ao consultar CNPJA para ${cnpj}:`, cnpjaErr)
  }

  // 2. Fallback para BrasilAPI caso CNPJA falhe ou atinja rate limit
  try {
    const fallbackRes = await safeFetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      timeoutMs: 8_000,
      maxResponseBytes: 512 * 1024,
      maxRedirects: 2,
      skipDnsCheck: true,
    })

    if (fallbackRes.ok) {
      const bData = await fallbackRes.json()
      const mapped = mapBrasilApiData(bData, cnpj)
      return NextResponse.json(mapped, {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800",
        },
      })
    } else if (fallbackRes.status === 404) {
      return NextResponse.json({ error: "CNPJ não encontrado" }, { status: 404 })
    }
  } catch (fallbackErr) {
    console.error(`[API CNPJ] Falha no fallback BrasilAPI para ${cnpj}:`, fallbackErr)
  }

  return NextResponse.json({ error: "Erro ao consultar CNPJ" }, { status: 500 })
}
