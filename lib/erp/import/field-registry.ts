import type { FieldDef, EntityType } from "./types"

const productFields: FieldDef[] = [
  { name: "name", label: "Nome", type: "string", required: true, synonyms: ["nome", "produto", "item", "descrição produto", "nome produto", "descricao", "nome do produto", "product name", "name", "descricao produto", "produto nome", "produto/serviço"] },
  { name: "sku", label: "SKU", type: "string", synonyms: ["sku", "código", "codigo interno", "referencia", "ref", "código do produto", "codigo", "cód interno", "code", "part number", "cod prod"] },
  { name: "gtin", label: "Código Barras", type: "string", synonyms: ["gtin", "ean", "código barras", "codigo barras", "barra", "barcode", "ean13", "código de barras", "codigo de barras", "barras", "gtin/ean"] },
  { name: "price", label: "Preço Venda", type: "number", required: true, synonyms: ["preço", "preco", "valor", "preço venda", "preco venda", "valor unitario", "valor venda", "price", "sale price", "preço de venda", "preco de venda", "pv", "preço final", "preco final"] },
  { name: "cost_price", label: "Preço Custo", type: "number", synonyms: ["custo", "preço custo", "preco custo", "custo unitario", "preço de custo", "preco de custo", "cost", "cost price", "valor custo", "preço de compra"] },
  { name: "stock_quantity", label: "Estoque", type: "number", synonyms: ["qtd", "quantidade", "estoque", "saldo", "quantidade estoque", "stock", "quantity", "qtde", "qty", "estoque atual", "saldo estoque", "quant"] },
  { name: "min_stock", label: "Estoque Mínimo", type: "number", synonyms: ["estoque mínimo", "estoque minimo", "min stock", "est min", "qtd min", "quantidade mínima", "quantidade minima", "min estoque"] },
  { name: "max_stock", label: "Estoque Máximo", type: "number", synonyms: ["estoque máximo", "estoque maximo", "max stock", "est max", "qtd max", "quantidade máxima", "quantidade maxima", "max estoque"] },
  { name: "description", label: "Descrição", type: "string", synonyms: ["descrição", "descricao", "description", "detalhes", "desc completa", "desc detalhada", "descricao completa"] },
  { name: "unit", label: "Unidade", type: "string", synonyms: ["unidade", "un", "unit", "und", "medida", "unid"] },
  { name: "category", label: "Categoria", type: "string", synonyms: ["categoria", "cat", "category", "categoria produto", "categoria do produto", "departamento", "depto"] },
  { name: "brand", label: "Marca", type: "string", synonyms: ["marca", "brand", "marca produto", "marca do produto", "fabricante", "marca/fabricante"] },
  { name: "supplier", label: "Fornecedor", type: "string", synonyms: ["fornecedor", "fornecedor principal", "supplier", "forn", "vendedor", "provedor", "fabricante fornecedor"] },
  { name: "weight_gross", label: "Peso Bruto", type: "number", synonyms: ["peso", "weight", "peso bruto", "peso g", "gross weight", "peso total", "kg"] },
  { name: "weight_net", label: "Peso Líquido", type: "number", synonyms: ["peso líquido", "peso liquido", "peso l", "net weight", "peso sem embalagem"] },
  { name: "height", label: "Altura", type: "number", synonyms: ["altura", "height", "alt", "altura cm", "h", "cm altura"] },
  { name: "width", label: "Largura", type: "number", synonyms: ["largura", "width", "larg", "largura cm", "w", "cm largura"] },
  { name: "length", label: "Comprimento", type: "number", synonyms: ["comprimento", "length", "comp", "compr", "profundidade", "prof", "cm comprimento", "l", "profundidade cm"] },
  { name: "ncm", label: "NCM", type: "string", synonyms: ["ncm", "ncm/sh", "ncm sh", "código ncm", "codigo ncm", "classificação fiscal", "classificacao fiscal"] },
  { name: "cest", label: "CEST", type: "string", synonyms: ["cest", "código cest", "codigo cest"] },
  { name: "origin", label: "Origem", type: "number", synonyms: ["origem", "origin", "origem produto", "origem mercadoria"] },
  { name: "product_type", label: "Tipo Produto", type: "string", synonyms: ["tipo", "tipo produto", "product type", "tipo de produto", "natureza"] },
  { name: "condition", label: "Condição", type: "string", synonyms: ["condição", "condicao", "condition", "estado", "novo/usado"] },
  { name: "promotional_price", label: "Preço Promocional", type: "number", synonyms: ["preço promocional", "preco promocional", "promotional price", "preço promo", "preco promo", "promo price", "preço desconto"] },
  { name: "fci_code", label: "FCI", type: "string", synonyms: ["fci", "fci code", "código fci", "codigo fci"] },
  { name: "packaging_type", label: "Tipo Embalagem", type: "string", synonyms: ["embalagem", "packaging", "tipo embalagem", "packaging type"] },
  { name: "preparation_days", label: "Dias Preparo", type: "number", synonyms: ["dias preparo", "preparation days", "dias para preparo", "prazo preparo"] },
  { name: "tags", label: "Tags", type: "string", synonyms: ["tags", "etiquetas", "labels", "palavras chave", "palavras-chave", "keywords"] },
  { name: "technical_specs", label: "Especificações", type: "string", synonyms: [] },
]

const customerFields: FieldDef[] = [
  { name: "name", label: "Nome", type: "string", required: true, synonyms: ["nome", "name", "cliente", "razão social", "razao social", "nome completo", "full name", "nome cliente"] },
  { name: "email", label: "E-mail", type: "string", synonyms: ["email", "e-mail", "mail", "e mail", "correio eletrônico", "endereço de email"] },
  { name: "phone", label: "Telefone", type: "string", synonyms: ["telefone", "phone", "celular", "whatsapp", "tel", "fone", "contato", "telefone celular", "cel", "mobile", "phone number"] },
  { name: "phone_fixed", label: "Telefone Fixo", type: "string", synonyms: ["telefone fixo", "fixo", "tel fixo", "fone fixo", "telefone residencial", "tel residencial"] },
  { name: "person_type", label: "Tipo Pessoa", type: "string", synonyms: ["tipo", "tipo pessoa", "person type", "pf/pj", "pessoa física/jurídica", "tipo cliente"] },
  { name: "cpf", label: "CPF", type: "string", synonyms: ["cpf", "documento", "doc", "documento pf", "cpf/cnpj", "cpfcnpj", "documento principal"] },
  { name: "cnpj", label: "CNPJ", type: "string", synonyms: ["cnpj", "documento pj", "documento jurídico"] },
  { name: "birth_date", label: "Nascimento", type: "string", synonyms: ["nascimento", "birth", "birth date", "data nascimento", "data de nascimento", "dt nascimento", "aniversário", "aniversario"] },
  { name: "notes", label: "Observações", type: "string", synonyms: ["observações", "observacoes", "notes", "obs", "anotações", "anotacoes", "informações adicionais"] },
  { name: "street", label: "Logradouro", type: "string", synonyms: ["endereço", "endereco", "rua", "street", "logradouro", "av", "avenida", "travessa"] },
  { name: "number", label: "Número", type: "string", synonyms: ["número", "numero", "n°", "nº", "number", "nr", "num"] },
  { name: "complement", label: "Complemento", type: "string", synonyms: ["complemento", "complement", "compl", "adicional", "apto", "sala", "bloco"] },
  { name: "neighborhood", label: "Bairro", type: "string", synonyms: ["bairro", "neighborhood", "bair", "distrito"] },
  { name: "city", label: "Cidade", type: "string", synonyms: ["cidade", "city", "município", "municipio", "cidade/estado"] },
  { name: "state", label: "Estado", type: "string", synonyms: ["estado", "state", "uf", "sigla estado", "sigla uf"] },
  { name: "zip_code", label: "CEP", type: "string", synonyms: ["cep", "zip", "zip code", "código postal", "codigo postal", "postal code"] },
]

const serviceFields: FieldDef[] = [
  { name: "name", label: "Nome", type: "string", required: true, synonyms: ["nome", "name", "serviço", "servico", "service", "nome serviço", "nome servico", "service name", "título", "titulo"] },
  { name: "description", label: "Descrição", type: "string", synonyms: ["descrição", "descricao", "description", "detalhes", "desc serviço", "desc servico"] },
  { name: "price", label: "Preço", type: "number", required: true, synonyms: ["preço", "preco", "price", "valor", "preço serviço", "preco servico", "valor serviço", "valor servico"] },
  { name: "cost_price", label: "Preço Custo", type: "number", synonyms: ["custo", "cost", "preço custo", "preco custo", "custo serviço"] },
  { name: "category", label: "Categoria", type: "string", synonyms: ["categoria", "category", "cat", "categoria serviço", "categoria servico", "tipo serviço", "tipo servico"] },
  { name: "duration_minutes", label: "Duração (min)", type: "number", synonyms: ["duração", "duracao", "duration", "tempo", "minutes", "minutos", "duração minutos", "tempo serviço", "tempo servico"] },
  { name: "sku", label: "SKU", type: "string", synonyms: ["sku", "código", "codigo", "ref", "referencia", "código serviço", "codigo servico"] },
  { name: "unit", label: "Unidade", type: "string", synonyms: ["unidade", "un", "unit", "medida"] },
]

export const fieldRegistry: Record<EntityType, FieldDef[]> = {
  products: productFields,
  customers: customerFields,
  services: serviceFields,
}

export function getFieldsForEntity(entity: EntityType): FieldDef[] {
  return fieldRegistry[entity]
}

export function getFieldByName(entity: EntityType, name: string): FieldDef | undefined {
  return fieldRegistry[entity].find((f) => f.name === name)
}

export function getRequiredFields(entity: EntityType): string[] {
  return fieldRegistry[entity]
    .filter((f) => f.required)
    .map((f) => f.name)
}
