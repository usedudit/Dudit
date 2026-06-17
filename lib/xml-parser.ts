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
}

export interface EmitenteFromXML {
  cnpj?: string
  cpf?: string
  nome: string
  nome_fantasia?: string
  ie?: string
  endereco?: {
    logradouro: string
    numero: string
    bairro: string
    cidade: string
    uf: string
    cep: string
  }
}

export interface InvoiceInfo {
  chave: string
  numero: string
  serie: string
  data_emissao: string
  valor_total: number
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

export function parseNFeFull(xmlContent: string): NFMetadata {
  const cleanXml = xmlContent.replace(/xmlns[^=]*="[^"]*"/g, "")

  const emitBlock = extractBlock("emit", cleanXml)
  if (!emitBlock) throw new Error("Emitente não encontrado no XML")

  const destBlock = extractBlock("dest", cleanXml)
  if (!destBlock) throw new Error("Destinatário não encontrado no XML")

  const ideBlock = extractBlock("ide", cleanXml)

  const emitente: EmitenteFromXML = {
    cnpj: getTagValue("CNPJ", emitBlock) || undefined,
    cpf: getTagValue("CPF", emitBlock) || undefined,
    nome: getTagValue("xNome", emitBlock) || "Emitente não identificado",
    nome_fantasia: getTagValue("xFant", emitBlock) || undefined,
    ie: getTagValue("IE", emitBlock) || undefined,
  }

  const enderecoEmit = extractBlock("enderEmit", emitBlock)
  if (enderecoEmit) {
    emitente.endereco = {
      logradouro: getTagValue("xLgr", enderecoEmit) || "",
      numero: getTagValue("nro", enderecoEmit) || "",
      bairro: getTagValue("xBairro", enderecoEmit) || "",
      cidade: getTagValue("xMun", enderecoEmit) || "",
      uf: getTagValue("UF", enderecoEmit) || "",
      cep: getTagValue("CEP", enderecoEmit) || "",
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
    valor_total: 0,
  }

  const totalBlock = extractBlock("total", cleanXml)
  if (totalBlock) {
    const icmsTotBlock = extractBlock("ICMSTot", totalBlock)
    if (icmsTotBlock) {
      const vNF = getTagValue("vNF", icmsTotBlock)
      invoice.valor_total = vNF ? Number.parseFloat(vNF) : 0
    }
  }

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
      const icmsBlock = extractBlock("ICMS", impostoBlock)
      if (icmsBlock) {
        const icmsContent = icmsBlock
        const ufContent = extractBlock("ICMSUFDest", icmsBlock) || ""

        const vBC = getTagValue("vBC", icmsBlock)
        const vICMS = getTagValue("vICMS", icmsBlock)
        const pICMS = getTagValue("pICMS", icmsBlock)

        if (vBC && vICMS && Number.parseFloat(vBC) > 0) {
          product.preco_custo -= Number.parseFloat(vICMS) / Number.parseFloat(qCom || "1")
        }
      }
    }

    produtos.push(product)
  }

  return { emitente, destinatario, invoice, produtos }
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
