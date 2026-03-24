// ======================================================
// Fiscal Utilities - MVP Safe (SEFAZ Friendly)
// Público-alvo: MEI + Simples Nacional + PF / B2C
// ======================================================

// ------------------------------------------------------
// Tipos base
// ------------------------------------------------------

export type ItemType = "00" | "04" // 00 = Revenda | 04 = Produção Própria

export interface FiscalProductFlags {
  hasIcmsSt: boolean               // ICMS Substituição Tributária
  hasMonophasicPisCofins: boolean  // PIS/COFINS Monofásico
}

// ------------------------------------------------------
// CFOP
// ------------------------------------------------------

export function getCFOPForProduct(params: {
  itemType?: ItemType
  flags: FiscalProductFlags
  customerState?: string | null
  storeState?: string | null
}): string {

  const {
    itemType = "00",
    flags,
    customerState,
    storeState
  } = params

  // Se não tiver UF definida, assume operação interna
  const isInternal =
    !customerState ||
    !storeState ||
    customerState === storeState

  // 1️⃣ Produção própria
  if (itemType === "04") {
    return isInternal ? "5101" : "6101"
  }

  // 2️⃣ Revenda
  if (flags.hasIcmsSt) {
    // ST só faz sentido em operação interna
    return isInternal ? "5405" : "6102"
  }

  // 3️⃣ Revenda normal
  return isInternal ? "5102" : "6102"
}

// ------------------------------------------------------
// CSOSN (Simples Nacional)
// ------------------------------------------------------

export function getCSOSNForProduct(flags: FiscalProductFlags): string {
  // No MVP, só usamos 102 e 500
  return flags.hasIcmsSt ? "500" : "102"
}

// ------------------------------------------------------
// Indicador de IE (destinatário)
// ------------------------------------------------------

export function getIndicadorIE(params: {
  cpf?: string | null
  cnpj?: string | null
  inscricaoEstadual?: string | null
}): string {

  const { cpf, cnpj, inscricaoEstadual } = params

  // Pessoa Física → Não Contribuinte
  if (cpf || !cnpj) return "9"

  // Pessoa Jurídica com IE válida
  const ieClean = inscricaoEstadual?.replace(/\D/g, "")
  if (ieClean && ieClean.length > 2) return "1"

  // Pessoa Jurídica sem IE → Não Contribuinte
  // "9" é o valor mais seguro para evitar rejeição
  return "9"
}

// ------------------------------------------------------
// Formatação / Validação
// ------------------------------------------------------

export function onlyNumbers(value?: string | number | null): string {
  return value ? String(value).replace(/\D/g, "") : ""
}

export function formatCFOP(cfop: string): string {
  return onlyNumbers(cfop).padStart(4, "0")
}

export function formatNCM(ncm: string | number): string {
  return onlyNumbers(ncm).padStart(8, "0")
}

export function formatCEST(cest: string | number): string {
  return onlyNumbers(cest).padStart(7, "0")
}

export function validateNCM(ncm?: string): boolean {
  const clean = onlyNumbers(ncm)
  return clean.length === 8 && clean !== "00000000"
}

export function validateCEST(cest?: string): boolean {
  const clean = onlyNumbers(cest)
  return clean.length === 7
}

// ------------------------------------------------------
// Monofásico PIS/COFINS (heurística MVP)
// ------------------------------------------------------

// Prefixos de NCM com incidência monofásica mais comum
const MONOPHASIC_PREFIXES = [
  // Bebidas frias
  "2201", "2202", "2203",

  // Medicamentos / Higiene (Lei 10.147/2000)
  "3003", "3004",
  "3303", "3304", "3305", "3307",
  "3401",
  "4014",
  "960321",

  // Autopeças
  "4011", "4013", "8409", "8511", "8512", "8708"
]

export function detectMonophasicByNcm(ncm?: string): boolean {
  const clean = onlyNumbers(ncm)
  if (!clean) return false
  return MONOPHASIC_PREFIXES.some(prefix => clean.startsWith(prefix))
}

// ------------------------------------------------------
// Cálculo de impostos (IBPT + PIS/COFINS)
// ------------------------------------------------------

export interface TaxCalculationResult {
  tax_percentage: number
  pis_cst: string
  cofins_cst: string
  pis_rate: number
  cofins_rate: number
  monophasic: boolean
}

export async function calculateProductTaxes(params: {
  ncm?: string
  pis_cst?: string
  cofins_cst?: string
}): Promise<TaxCalculationResult> {

  const result: TaxCalculationResult = {
    tax_percentage: 0,
    pis_cst: params.pis_cst || "99",
    cofins_cst: params.cofins_cst || "99",
    pis_rate: 0,
    cofins_rate: 0,
    monophasic: false
  }

  const cleanNcm = onlyNumbers(params.ncm)
  if (!validateNCM(cleanNcm)) return result

  try {
    // Importação dinâmica (SSR safe)
    const { supabaseBrowser: supabase } = await import("@/lib/supabase/browser-client")

    // 1️⃣ IBPT - busca NCM exato
    let { data } = await supabase
      .from("ncm_data")
      .select("nacionalfederal, estadual, municipal")
      .eq("codigo", cleanNcm)
      .limit(1)

    // Fallback: capítulo (4 dígitos)
    if (!data || data.length === 0) {
      const chapter = cleanNcm.substring(0, 4)
      const { data: fallback } = await supabase
        .from("ncm_data")
        .select("nacionalfederal, estadual, municipal")
        .like("codigo", `${chapter}%`)
        .limit(1)
      data = fallback
    }

    if (data && data.length > 0) {
      const tax = data[0]
      const total =
        (Number(tax.nacionalfederal) || 0) +
        (Number(tax.estadual) || 0) +
        (Number(tax.municipal) || 0)

      result.tax_percentage = Number(total.toFixed(2))
    }

    // 2️⃣ Monofásico PIS/COFINS
    const isMonophasic = detectMonophasicByNcm(cleanNcm)
    result.monophasic = isMonophasic

    if (isMonophasic) {
      // CST correto para monofásico na revenda
      result.pis_cst = "04"
      result.cofins_cst = "04"
      result.pis_rate = 0
      result.cofins_rate = 0
    }

    return result

  } catch (err) {
    console.error("Erro fiscal (IBPT/PIS/COFINS):", err)
    return result
  }
}
