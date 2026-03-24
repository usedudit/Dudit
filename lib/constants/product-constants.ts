// --- CONSTANTES FISCAIS SIMPLIFICADAS (DUDIT V1.0) ---

export const PRODUCT_CONDITIONS = ["Novo", "Usado", "Recondicionado"] as const

export const PRODUCT_TYPES = ["Físico", "Digital", "Serviço"] as const

export const UNITS = ["UN", "PC", "KG", "LT", "MT", "CX", "PT", "DZ", "PAR"] as const

// AQUI ESTÁ A MUDANÇA PRINCIPAL
// O usuário escolhe apenas a origem lógica. O sistema decide o resto.
export const PRODUCT_SITUATIONS = [
  { value: "revenda", label: "Compro para Revender" },          // Mapeia para Tipo 00
  { value: "producao_propria", label: "Eu Produzo / Fabrico" }, // Mapeia para Tipo 04
] as const

export const CSOSN_OPTIONS = [
  { value: "102", label: "102 - Tributado pelo Simples Nacional" },
  { value: "500", label: "500 - ICMS pago anteriormente (ST/Substituição)" },
  { value: "900", label: "900 - Outros (Exceções)" }, // Bom ter de backup
] as const

// Origens mais comuns no topo e com texto amigável
export const ORIGIN_OPTIONS = [
  { value: "0", label: "0 - Nacional (Padrão)" },
  { value: "1", label: "1 - Importação Direta (Eu importei)" },
  { value: "2", label: "2 - Estrangeira (Comprei no Brasil)" },
  // Os outros abaixo são raríssimos para MEI, mas mantive por compatibilidade se quiser
  { value: "3", label: "3 - Nacional (Conteúdo Importado > 40%)" },
  { value: "4", label: "4 - Nacional (Processo Produtivo Básico)" },
  { value: "5", label: "5 - Nacional (Conteúdo Importado <= 40%)" },
  { value: "6", label: "6 - Estrangeira (Sem Similar Nacional)" },
  { value: "7", label: "7 - Estrangeira (Sem Similar - Mercado Interno)" },
  { value: "8", label: "8 - Nacional (Conteúdo Importado > 70%)" },
] as const

// SPED / XML (Apenas o que importa)
export const ITEM_TYPES = [
  { code: "00", description: "Mercadoria para Revenda" }, // Use se product_situation == 'revenda'
  { code: "04", description: "Produto Acabado" },         // Use se product_situation == 'producao_propria'
  { code: "09", description: "Serviços" },                // Caso venda serviço
  { code: "99", description: "Outras" },
] as const

export const PACKAGING_TYPES = [
  { value: "package", label: "Pacote/Caixa" },
  { value: "roll", label: "Rolo/Cilindro" },
  { value: "envelope", label: "Envelope" },
] as const

export const DEFAULT_PRODUCT_VALUES = {
  condition: "Novo",
  productType: "Físico",
  unit: "UN",
  origin: "0", // String para bater com o select
  
  // Lógica Padrão: Revenda
  product_situation: "revenda",
  item_type: "00", 
  
  // CFOPs Padrão de Revenda
  cfop_internal: "5102",
  cfop_external: "6102",
  
  csosn: "102", // O padrão é tributado, a IA muda pra 500 se achar ST
  
  // Impostos zerados (Simples Nacional paga na DAS)
  pis_cst: "99",
  pis_rate: 0.0,
  cofins_cst: "99",
  cofins_rate: 0.0,
  ipi_cst: "99",
  
  is_active: true,
  stock_quantity: 0,
  min_stock: 0,
  packaging_type: "package",
  allow_sell_without_stock: false,
} as const
