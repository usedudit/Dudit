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
}

// Lista básica de prefixos NCM Monofásicos (Bebidas, Farmácia, Autopeças)
const MONOPHASIC_PREFIXES = [
  "2201", "2202", "2203", // Bebidas
  "3003", "3004", "3303", "3304", "3305", "3307", "3401", // Farmácia/Higiene
  "4011", "4013", "8708", "8511", "8512" // Autopeças
]

function isMonophasic(ncm?: string): boolean {
  if (!ncm) return false
  const cleanNcm = ncm.replace(/\D/g, "")
  return MONOPHASIC_PREFIXES.some(prefix => cleanNcm.startsWith(prefix))
}

export function parseNFeXML(xmlContent: string): ProductFromXML[] {
  const products: ProductFromXML[] = []

  try {
    console.log("Iniciando parse do XML...")
    const cleanXml = xmlContent.replace(/xmlns[^=]*="[^"]*"/g, "")

    const detRegex = /<det\s+nItem="(\d+)">([\s\S]*?)<\/det>/g
    let detMatch

    while ((detMatch = detRegex.exec(cleanXml)) !== null) {
      const detContent = detMatch[2]

      // Extrai o bloco <prod>
      const prodMatch = detContent.match(/<prod>([\s\S]*?)<\/prod>/)
      if (!prodMatch) continue

      const prodContent = prodMatch[1]

      const getTagValue = (tag: string, content: string): string | null => {
        const regex = new RegExp(`<${tag}>(.*?)<\/${tag}>`, "i")
        const match = content.match(regex)
        return match ? match[1].trim() : null
      }

      // Dados principais
      const cProd = getTagValue("cProd", prodContent) // SKU do fornecedor
      const xProd = getTagValue("xProd", prodContent)
      const ncm = getTagValue("NCM", prodContent)
      const cest = getTagValue("CEST", prodContent)
      // Nota: Ignoramos CFOP do XML pois é de saída do fornecedor
      const uCom = getTagValue("uCom", prodContent)
      const qCom = getTagValue("qCom", prodContent)
      const vUnCom = getTagValue("vUnCom", prodContent) // Valor Unitário (Custo)
      const cEAN = getTagValue("cEAN", prodContent)
      const orig = getTagValue("orig", prodContent) // Origem da mercadoria

      // Monta objeto temporário
      const product: ProductFromXML = {
        codigo: cProd || "",
        nome: xProd || "Produto sem nome",
        preco_custo: vUnCom ? Number.parseFloat(vUnCom) : 0, // Importante: XML traz custo
        estoque_entrada: qCom ? Number.parseFloat(qCom) : 0,
        unidade: uCom || "UN",
        ncm: ncm || undefined,
        cest: cest || undefined,
        origem: orig || "0",
        gtin: cEAN && cEAN !== "SEM GTIN" ? cEAN : undefined,
      }

      products.push(product)
    }

    return products
  } catch (error) {
    console.error("Erro ao processar XML:", error)
    throw error
  }
}

// Essa função converte o dado bruto do XML para as colunas do seu Banco de Dados
export function mapNFeToProductData(product: ProductFromXML) {
  // Lógica fiscal automática
  const isMono = isMonophasic(product.ncm)
  const cstPadrao = isMono ? "04" : "99" // 04=Monofásico, 99=Outros (Simples Nacional)

  return {
    // Campos Básicos
    name: product.nome,
    sku: product.codigo, // SKU recebe o código do fornecedor inicialmente
    gtin: product.gtin,
    ncm: product.ncm,
    cest: product.cest,
    origin: Number(product.origem || 0),

    // Preços
    cost_price: product.preco_custo, // Custo real
    price: product.preco_custo, // Inicializa Venda = Custo (usuário ajusta margem depois)

    // Estoque
    stock_quantity: product.estoque_entrada,
    min_stock: 0,

    // Detalhes
    unit: product.unidade,
    condition: "Novo",

    // === FISCAL (Correção dos nomes das colunas e valores) ===

    // Zera alíquotas para evitar cálculo errado na venda Simples Nacional
    pis_rate: "0.00",
    cofins_rate: "0.00",

    // Define CST baseado no NCM (Inteligência Fiscal)
    pis_cst: cstPadrao,
    cofins_cst: cstPadrao,

    // Define situação tributária padrão
    // Se tiver CEST, geralmente é ST (Substituição Tributária)
    product_situation: product.cest ? "st_retido" : "tributado",
    csosn: product.cest ? "500" : "102", // 500=Pago anteriormente, 102=Sem crédito

    // Não importamos CFOP de entrada para saída (deixa nulo pro sistema calcular)
    cfop_internal: null,
    cfop_external: null
  }
}
