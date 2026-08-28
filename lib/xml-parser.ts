import { cleanAndFormatPhone, sanitizeAddressComplement } from "@/lib/utils/phone-utils"

export interface ProductFromXML {
  codigo: string
  nome: string
  preco_custo: number
  estoque_entrada: number
  unidade: string
  ncm?: string
  cest?: string
  origem?: string
  gtin?: string
  peso_bruto?: number
  peso_liquido?: number
  largura?: number
  altura?: number
  comprimento?: number
  cfop?: string
  cst?: string
  csosn?: string
  pis_cst?: string
  cofins_cst?: string
  ipi_code?: string
  fiscal_detail?: Record<string, any>
}

export interface EmitenteFromXML {
  cnpj?: string
  cpf?: string
  nome: string
  nome_fantasia?: string
  ie?: string
  ie_st?: string
  crt?: string
  email?: string
  fone?: string
  endereco?: {
    logradouro: string
    numero: string
    complemento?: string
    bairro: string
    cidade: string
    uf: string
    cep: string
    pais?: string
    codigo_municipio?: string
    codigo_pais?: string
  }
}

export interface InvoiceInfo {
  chave: string
  numero: string
  serie: string
  data_emissao: string
  data_saida?: string
  modelo?: string
  protocolo?: string
  ambiente?: string
  finalidade?: string
  tipo_operacao?: string
  cstat?: string
  valor_total: number
}

export interface DuplicataFromXML {
  numero: string
  vencimento: string
  valor: number
}

export interface TransporteFromXML {
  modalidade_frete?: string
  transportadora?: string
  cnpj?: string
  cpf?: string
  ie?: string
  rntrc?: string
  placa?: string
  placa_uf?: string
  qtd_volumes?: number
  especie?: string
  marca?: string
  peso_bruto?: number
  peso_liquido?: number
}

export interface NFMetadata {
  emitente: EmitenteFromXML
  destinatario: {
    cnpj?: string
    cpf?: string
    nome: string
  }
  invoice: InvoiceInfo
  produtos: ProductFromXML[]
  duplicatas?: DuplicataFromXML[]
  transporte?: TransporteFromXML
  inf_cpl?: string
  inf_ad_fisco?: string
  fiscal_totals?: Record<string, number>
}

const MONOPHASIC_PREFIXES = [
  "2201", "2202", "2203",
  "3003", "3004", "3303", "3304", "3305", "3307", "3401",
  "4011", "4013", "8708", "8511", "8512"
]

function isMonophasic(ncm?: string): boolean {
  if (!ncm) return false
  const cleanNcm = ncm.replace(/\D/g, "")
  return MONOPHASIC_PREFIXES.some(prefix => cleanNcm.startsWith(prefix))
}

function getTagValue(tag: string, content: string): string | null {
  const regex = new RegExp(`<${tag}>(.*?)<\/${tag}>`, "i")
  const match = content.match(regex)
  return match ? match[1].trim() : null
}

function extractBlock(tag: string, xml: string): string | null {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`, "i")
  const match = xml.match(regex)
  return match ? match[1] : null
}

export function parseNFeXML(xmlContent: string): ProductFromXML[] {
  const metadata = parseNFeFull(xmlContent)
  return metadata.produtos
}

function extractAllDet(tag: string, content: string): { [key: string]: string } {
  const obj: { [key: string]: string } = {}
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i")
  const match = content.match(regex)
  if (!match) return obj
  const inner = match[1]
  const fieldRegex = /<(\w+)>([^<]*)<\/\1>/g
  let m
  while ((m = fieldRegex.exec(inner)) !== null) {
    obj[m[1]] = m[2].trim()
  }
  return obj
}

export function parseNFeFull(xmlContent: string): NFMetadata {
  const cleanXml = xmlContent.replace(/xmlns[^=]*="[^"]*"/g, "")

  const emitBlock = extractBlock("emit", cleanXml)
  if (!emitBlock) throw new Error("Emitente não encontrado no XML")

  const destBlock = extractBlock("dest", cleanXml)
  if (!destBlock) throw new Error("Destinatário não encontrado no XML")

  const ideBlock = extractBlock("ide", cleanXml)

  const enderecoEmit = extractBlock("enderEmit", emitBlock)

  const rawPhone = getTagValue("fone", enderecoEmit || "") || getTagValue("fone", emitBlock) || undefined
  const formattedPhone = cleanAndFormatPhone(rawPhone) || undefined

  const rawCep = getTagValue("CEP", enderecoEmit || "") || ""
  const cleanCep = rawCep.replace(/\D/g, "").padStart(8, "0")

  const emitente: EmitenteFromXML = {
    cnpj: getTagValue("CNPJ", emitBlock) || undefined,
    cpf: getTagValue("CPF", emitBlock) || undefined,
    nome: getTagValue("xNome", emitBlock) || "Emitente não identificado",
    nome_fantasia: getTagValue("xFant", emitBlock) || undefined,
    ie: getTagValue("IE", emitBlock) || undefined,
    ie_st: getTagValue("IEST", emitBlock) || undefined,
    crt: getTagValue("CRT", emitBlock) || undefined,
    email: getTagValue("email", emitBlock) || undefined,
    fone: formattedPhone,
  }

  if (enderecoEmit) {
    const rawComplement = getTagValue("xCpl", enderecoEmit)
    const cleanComplement = sanitizeAddressComplement(rawComplement)

    emitente.endereco = {
      logradouro: getTagValue("xLgr", enderecoEmit) || "",
      numero: getTagValue("nro", enderecoEmit) || "",
      complemento: cleanComplement || undefined,
      bairro: getTagValue("xBairro", enderecoEmit) || "",
      cidade: getTagValue("xMun", enderecoEmit) || "",
      uf: getTagValue("UF", enderecoEmit) || "",
      cep: cleanCep,
      pais: getTagValue("xPais", enderecoEmit) || undefined,
      codigo_municipio: getTagValue("cMun", enderecoEmit) || undefined,
      codigo_pais: getTagValue("cPais", enderecoEmit) || undefined,
    }
  }

  const destinatario = {
    cnpj: getTagValue("CNPJ", destBlock) || undefined,
    cpf: getTagValue("CPF", destBlock) || undefined,
    nome: getTagValue("xNome", destBlock) || "Destinatário não identificado",
  }

  let chave = ""
  const chaveMatch = cleanXml.match(/<chave>\s*(.*?)\s*<\/chave>/i) || cleanXml.match(/<Chave>\s*(.*?)\s*<\/Chave>/i)
  if (chaveMatch) chave = chaveMatch[1].trim()
  if (!chave) {
    const nfeTagMatch = cleanXml.match(/<infNFe\s+(?:[^>]*?\s+)?Id\s*=\s*["']NFe(\d{44})["']/i)
    if (nfeTagMatch) chave = nfeTagMatch[1]
  }

  const invoice: InvoiceInfo = {
    chave,
    numero: getTagValue("nNF", ideBlock || "") || "",
    serie: getTagValue("serie", ideBlock || "") || "",
    data_emissao: getTagValue("dhEmi", ideBlock || "") || getTagValue("dEmi", ideBlock || "") || "",
    data_saida: getTagValue("dhSaiEnt", ideBlock || "") || getTagValue("dSaiEnt", ideBlock || "") || undefined,
    modelo: getTagValue("mod", ideBlock || "") || undefined,
    protocolo: getTagValue("nProt", cleanXml) || undefined,
    cstat: getTagValue("cStat", cleanXml) || undefined,
    ambiente: getTagValue("tpAmb", ideBlock || "") || undefined,
    finalidade: getTagValue("finNFe", ideBlock || "") || undefined,
    tipo_operacao: getTagValue("tpNF", ideBlock || "") || undefined,
    valor_total: 0,
  }

  const totalBlock = extractBlock("total", cleanXml)
  let fiscalTotals: Record<string, number> = {}
  if (totalBlock) {
    const icmsTotBlock = extractBlock("ICMSTot", totalBlock)
    if (icmsTotBlock) {
      const extractVal = (tag: string) => {
        const v = getTagValue(tag, icmsTotBlock)
        return v ? Number.parseFloat(v) : 0
      }
      invoice.valor_total = extractVal("vNF")
      fiscalTotals = {
        vProd: extractVal("vProd"),
        vFrete: extractVal("vFrete"),
        vSeg: extractVal("vSeg"),
        vDesc: extractVal("vDesc"),
        vOutro: extractVal("vOutro"),
        vBC: extractVal("vBC"),
        vICMS: extractVal("vICMS"),
        vBCST: extractVal("vBCST"),
        vST: extractVal("vST"),
        vIPI: extractVal("vIPI"),
        vPIS: extractVal("vPIS"),
        vCOFINS: extractVal("vCOFINS"),
      }
    }
  }

  // Duplicatas (cobr/fat/dup)
  const duplicatas: DuplicataFromXML[] = []
  const cobrBlock = extractBlock("cobr", cleanXml)
  if (cobrBlock) {
    const fatBlock = extractBlock("fat", cobrBlock)
    const dupRegex = /<dup>([\s\S]*?)<\/dup>/g
    let dupMatch
    while ((dupMatch = dupRegex.exec(cobrBlock)) !== null) {
      const dupContent = dupMatch[1]
      duplicatas.push({
        numero: getTagValue("nDup", dupContent) || "",
        vencimento: getTagValue("dVenc", dupContent) || "",
        valor: Number.parseFloat(getTagValue("vDup", dupContent) || "0"),
      })
    }
  }

  // Transporte
  const transpBlock = extractBlock("transp", cleanXml)
  let transporte: TransporteFromXML | undefined
  if (transpBlock) {
    const transportaBlock = extractBlock("transporta", transpBlock)
    const volBlock = extractBlock("vol", transpBlock)
    transporte = {
      modalidade_frete: getTagValue("modFrete", transpBlock) || undefined,
    }
    if (transportaBlock) {
      transporte.transportadora = getTagValue("xNome", transportaBlock) || undefined
      transporte.cnpj = getTagValue("CNPJ", transportaBlock) || undefined
      transporte.cpf = getTagValue("CPF", transportaBlock) || undefined
      transporte.ie = getTagValue("IE", transportaBlock) || undefined
      transporte.placa = getTagValue("placa", transportaBlock) || undefined
      transporte.placa_uf = getTagValue("UF", transportaBlock) || undefined
      transporte.rntrc = getTagValue("RNTRC", transportaBlock) || undefined
    }
    if (volBlock) {
      transporte.qtd_volumes = Number.parseInt(getTagValue("qVol", volBlock) || "0", 10) || undefined
      transporte.especie = getTagValue("esp", volBlock) || undefined
      transporte.marca = getTagValue("marca", volBlock) || undefined
      transporte.peso_bruto = Number.parseFloat(getTagValue("pesoB", volBlock) || "0") || undefined
      transporte.peso_liquido = Number.parseFloat(getTagValue("pesoL", volBlock) || "0") || undefined
    }
  }

  // Informações complementares
  const infCpl = getTagValue("infCpl", cleanXml) || undefined
  const infAdFisco = getTagValue("infAdFisco", cleanXml) || undefined

  const produtos: ProductFromXML[] = []
  const detRegex = /<det\s+nItem="(\d+)">([\s\S]*?)<\/det>/g
  let detMatch

  while ((detMatch = detRegex.exec(cleanXml)) !== null) {
    const detContent = detMatch[2]
    const prodMatch = detContent.match(/<prod>([\s\S]*?)<\/prod>/)
    if (!prodMatch) continue

    const prodContent = prodMatch[1]

    const cProd = getTagValue("cProd", prodContent)
    const xProd = getTagValue("xProd", prodContent)
    const ncm = getTagValue("NCM", prodContent)
    const cest = getTagValue("CEST", prodContent)
    const cfop = getTagValue("CFOP", prodContent)
    const uCom = getTagValue("uCom", prodContent)
    const qCom = getTagValue("qCom", prodContent)
    const vUnCom = getTagValue("vUnCom", prodContent)
    const cEAN = getTagValue("cEAN", prodContent)
    const orig = getTagValue("orig", prodContent)
    const vProd = getTagValue("vProd", prodContent)
    const pesoB = getTagValue("pesoB", prodContent) || getTagValue("vPesoB", prodContent)
    const pesoL = getTagValue("pesoL", prodContent) || getTagValue("vPesoL", prodContent)
    const larg = getTagValue("vLarg", prodContent) || getTagValue("largura", prodContent)
    const alt = getTagValue("vAlt", prodContent) || getTagValue("altura", prodContent)
    const comp = getTagValue("vComp", prodContent) || getTagValue("comprimento", prodContent)

    const product: ProductFromXML = {
      codigo: cProd || "",
      nome: xProd || "Produto sem nome",
      preco_custo: vUnCom ? Number.parseFloat(vUnCom) : (vProd && qCom ? Number.parseFloat(vProd) / Number.parseFloat(qCom) : 0),
      estoque_entrada: qCom ? Number.parseFloat(qCom) : 0,
      unidade: uCom || "UN",
      ncm: ncm || undefined,
      cest: cest || undefined,
      cfop: cfop || undefined,
      origem: orig || "0",
      gtin: cEAN && cEAN !== "SEM GTIN" && cEAN !== "" ? cEAN : undefined,
      peso_bruto: pesoB ? Number.parseFloat(pesoB) : undefined,
      peso_liquido: pesoL ? Number.parseFloat(pesoL) : undefined,
      largura: larg ? Number.parseFloat(larg) : undefined,
      altura: alt ? Number.parseFloat(alt) : undefined,
      comprimento: comp ? Number.parseFloat(comp) : undefined,
    }

    const impostoBlock = extractBlock("imposto", detContent)
    if (impostoBlock) {
      const fiscalDetail: Record<string, any> = {}

      const icmsBlock = extractBlock("ICMS", impostoBlock)
      if (icmsBlock) {
        const icmsData = extractAllDet("ICMS", impostoBlock)
        const icmsUfBlock = extractBlock("ICMSUFDest", icmsBlock) || ""

        const vBC = getTagValue("vBC", icmsBlock)
        const vICMS = getTagValue("vICMS", icmsBlock)
        const pICMS = getTagValue("pICMS", icmsBlock)
        const origTag = getTagValue("orig", icmsBlock)

        fiscalDetail.icms_orig = origTag || orig
        fiscalDetail.icms_cst = getTagValue("CST", icmsBlock) || getTagValue("CSOSN", icmsBlock) || undefined
        fiscalDetail.icms_csosn = getTagValue("CSOSN", icmsBlock) || undefined
        fiscalDetail.icms_vbc = vBC || undefined
        fiscalDetail.icms_vicms = vICMS || undefined
        fiscalDetail.icms_picms = pICMS || undefined
        fiscalDetail.icms_modalidade_bc = getTagValue("modBC", icmsBlock) || undefined
        fiscalDetail.icms_vbcst = getTagValue("vBCST", icmsBlock) || undefined
        fiscalDetail.icms_vst = getTagValue("vST", icmsBlock) || undefined
        fiscalDetail.icms_picmsst = getTagValue("pICMSST", icmsBlock) || undefined
        fiscalDetail.icms_pmva = getTagValue("pMVAST", icmsBlock) || undefined
        fiscalDetail.icms_vfcp = getTagValue("vFCP", icmsBlock) || undefined
        fiscalDetail.icms_vfcpst = getTagValue("vFCPST", icmsBlock) || undefined

        if (vBC && vICMS && Number.parseFloat(vBC) > 0) {
          product.preco_custo -= Number.parseFloat(vICMS) / Number.parseFloat(qCom || "1")
        }
      }

      const ipiBlock = extractBlock("IPI", impostoBlock)
      if (ipiBlock) {
        fiscalDetail.ipi_cst = getTagValue("CST", ipiBlock) || undefined
        fiscalDetail.ipi_vbc = getTagValue("vBC", ipiBlock) || undefined
        fiscalDetail.ipi_pipi = getTagValue("pIPI", ipiBlock) || undefined
        fiscalDetail.ipi_vipi = getTagValue("vIPI", ipiBlock) || undefined
        fiscalDetail.ipi_codigo = getTagValue("cEnq", ipiBlock) || undefined
        product.ipi_code = fiscalDetail.ipi_codigo
      }

      const pisBlock = extractBlock("PIS", impostoBlock)
      if (pisBlock) {
        fiscalDetail.pis_cst = getTagValue("CST", pisBlock) || undefined
        fiscalDetail.pis_vbc = getTagValue("vBC", pisBlock) || undefined
        fiscalDetail.pis_ppis = getTagValue("pPIS", pisBlock) || undefined
        fiscalDetail.pis_vpis = getTagValue("vPIS", pisBlock) || undefined
        product.pis_cst = fiscalDetail.pis_cst
      }

      const cofinsBlock = extractBlock("COFINS", impostoBlock)
      if (cofinsBlock) {
        fiscalDetail.cofins_cst = getTagValue("CST", cofinsBlock) || undefined
        fiscalDetail.cofins_vbc = getTagValue("vBC", cofinsBlock) || undefined
        fiscalDetail.cofins_pcofins = getTagValue("pCOFINS", cofinsBlock) || undefined
        fiscalDetail.cofins_vcofins = getTagValue("vCOFINS", cofinsBlock) || undefined
        product.cofins_cst = fiscalDetail.cofins_cst
      }

      product.cst = fiscalDetail.icms_cst
      product.csosn = fiscalDetail.icms_csosn
      product.fiscal_detail = fiscalDetail
    }

    produtos.push(product)
  }

  return { emitente, destinatario, invoice, produtos, duplicatas, transporte, inf_cpl: infCpl, inf_ad_fisco: infAdFisco, fiscal_totals: fiscalTotals }
}

export function mapNFeToProductData(product: ProductFromXML) {
  const isMono = isMonophasic(product.ncm)
  const cstPadrao = isMono ? "04" : "99"

  return {
    name: product.nome,
    sku: product.codigo,
    gtin: product.gtin,
    ncm: product.ncm,
    cest: product.cest,
    origin: Number(product.origem || 0),
    cost_price: product.preco_custo,
    price: product.preco_custo,
    stock_quantity: product.estoque_entrada,
    min_stock: 0,
    unit: product.unidade,
    condition: "Novo",
    pis_rate: "0.00",
    cofins_rate: "0.00",
    pis_cst: cstPadrao,
    cofins_cst: cstPadrao,
    product_situation: product.cest ? "st_retido" : "tributado",
    csosn: product.cest ? "500" : "102",
    cfop_internal: null,
    cfop_external: null,
    weight_gross: product.peso_bruto,
    weight_net: product.peso_liquido,
    width: product.largura,
    height: product.altura,
    length: product.comprimento,
  }
}
