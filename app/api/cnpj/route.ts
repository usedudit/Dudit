import { type NextRequest, NextResponse } from "next/server"
import { safeFetch } from "@/lib/security/ssrf-guard"

export const runtime = "nodejs"

function categorizePhones(rawPhones: string[]) {
  let telefone_fixo = ""
  let celular = ""

  for (const raw of rawPhones) {
    if (!raw) continue
    const digits = raw.replace(/\D/g, "")
    if (!digits) continue

    const isMobile = digits.length === 11 || (digits.length === 9 && digits.startsWith("9"))

    if (isMobile && !celular) {
      celular = digits.length === 11
        ? `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
        : digits
    } else if (!isMobile && !telefone_fixo) {
      telefone_fixo = digits.length === 10
        ? `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
        : digits
    }
  }

  const primaryPhone = telefone_fixo || celular || ""

  return {
    telefone: primaryPhone,
    telefone_fixo: telefone_fixo || undefined,
    celular: celular || undefined,
  }
}

/** Formata o CNAE no padrão 0000-0/00. */
function formatCnae(value: unknown): string | undefined {
  const digits = String(value ?? "").replace(/\D/g, "")
  if (!digits) return undefined
  const padded = digits.padStart(7, "0").slice(0, 7)
  return `${padded.slice(0, 4)}-${padded.slice(4, 5)}/${padded.slice(5, 7)}`
}

function mapCnpjaData(data: any, cnpj: string) {
  const rawPhones: string[] = []
  if (Array.isArray(data.phones)) {
    for (const p of data.phones) {
      if (p.area && p.number) {
        rawPhones.push(`${p.area}${p.number}`)
      } else if (p.number) {
        rawPhones.push(String(p.number))
      }
    }
  }

  const phoneObj = categorizePhones(rawPhones)

  let email = ""
  if (Array.isArray(data.emails) && data.emails.length > 0) {
    email = data.emails[0]?.address || ""
  }

  // CNAEs secundários, data de abertura e inscrição estadual vêm da mesma
  // consulta; antes só o CNAE principal era mapeado.
  const secondaryActivities = Array.isArray(data.sideActivities)
    ? data.sideActivities
        .map((activity: any) => formatCnae(activity?.id))
        .filter((value: string | undefined): value is string => Boolean(value))
    : []

  const stateRegistration = Array.isArray(data.registrations)
    ? data.registrations.find((r: any) => r?.enabled !== false) || data.registrations[0]
    : null

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
    telefone: phoneObj.telefone,
    telefone_fixo: phoneObj.telefone_fixo,
    celular: phoneObj.celular,
    email: email,
    cnae_fiscal: formatCnae(data.mainActivity?.id),
    cnae_fiscal_secundaria: secondaryActivities,
    data_abertura: typeof data.founded === "string" ? data.founded.slice(0, 10) : undefined,
    inscricao_estadual: stateRegistration?.number != null ? String(stateRegistration.number) : undefined,
    simples_optante: data.simples?.optant ?? false,
    simei_optante: data.simei?.optant ?? false,
  }
}

function mapBrasilApiData(bData: any, cnpj: string) {
  const rawPhones: string[] = []
  if (bData.ddd_telefone_1) rawPhones.push(String(bData.ddd_telefone_1))
  if (bData.ddd_telefone_2) rawPhones.push(String(bData.ddd_telefone_2))

  const phoneObj = categorizePhones(rawPhones)

  const secondaryActivities = Array.isArray(bData.cnaes_secundarios)
    ? bData.cnaes_secundarios
        .map((cnae: any) => formatCnae(cnae?.codigo))
        .filter((value: string | undefined): value is string => Boolean(value))
    : []

  const stateRegistration = Array.isArray(bData.inscricoes_estaduais)
    ? bData.inscricoes_estaduais.find((r: any) => r?.ativo) || bData.inscricoes_estaduais[0]
    : null

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
    telefone: phoneObj.telefone,
    telefone_fixo: phoneObj.telefone_fixo,
    celular: phoneObj.celular,
    email: bData.email || "",
    cnae_fiscal: formatCnae(bData.cnae_fiscal),
    cnae_fiscal_secundaria: secondaryActivities,
    data_abertura: bData.data_inicio_atividade
      ? String(bData.data_inicio_atividade).slice(0, 10)
      : undefined,
    inscricao_estadual:
      stateRegistration?.inscricao_estadual != null
        ? String(stateRegistration.inscricao_estadual)
        : undefined,
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
