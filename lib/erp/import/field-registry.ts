import type { FieldDef, EntityType } from "./types"

const productFields: FieldDef[] = [
  {
    name: "name",
    label: "Nome do Produto",
    type: "string",
    required: true,
    example: "Camiseta Algodão Premium",
    description: "Nome ou título principal do produto",
    synonyms: [
      "nome", "produto", "item", "descrição produto", "nome produto", "descricao",
      "nome do produto", "product name", "name", "descricao produto", "produto nome",
      "produto/serviço", "titulo", "título", "designação", "descrição do item"
    ]
  },
  {
    name: "sku",
    label: "SKU / Código",
    type: "string",
    isIdentifier: true,
    example: "CAM-ALG-001",
    description: "Código interno único para controle de estoque",
    synonyms: [
      "sku", "código", "codigo", "codigo interno", "referencia", "ref",
      "código do produto", "cód interno", "code", "part number", "cod prod",
      "código sku", "cod_item", "código item"
    ]
  },
  {
    name: "gtin",
    label: "Código de Barras (GTIN/EAN)",
    type: "string",
    example: "7891234567890",
    description: "Código de barras universal (EAN-13, EAN-8, UPC, etc.)",
    synonyms: [
      "gtin", "ean", "código barras", "codigo barras", "barra", "barcode",
      "ean13", "código de barras", "codigo de barras", "barras", "gtin/ean",
      "ean/gtin", "código gtin", "codigo ean"
    ]
  },
  {
    name: "price",
    label: "Preço de Venda",
    type: "number",
    required: true,
    example: "49.90",
    description: "Valor de venda cobrado do cliente",
    synonyms: [
      "preço", "preco", "valor", "preço venda", "preco venda", "valor unitario",
      "valor venda", "price", "sale price", "preço de venda", "preco de venda",
      "pv", "preço final", "preco final", "valor unitário", "preço unitário"
    ]
  },
  {
    name: "cost_price",
    label: "Preço de Custo",
    type: "number",
    example: "25.00",
    description: "Custo de aquisição ou fabricação",
    synonyms: [
      "custo", "preço custo", "preco custo", "custo unitario", "preço de custo",
      "preco de custo", "cost", "cost price", "valor custo", "preço de compra",
      "custo unitário", "valor de custo"
    ]
  },
  {
    name: "promotional_price",
    label: "Preço Promocional",
    type: "number",
    example: "39.90",
    description: "Preço com desconto em vigor",
    synonyms: [
      "preço promocional", "preco promocional", "promotional price", "preço promo",
      "preco promo", "promo price", "preço desconto", "valor promocional"
    ]
  },
  {
    name: "stock_quantity",
    label: "Estoque Atual",
    type: "number",
    example: "100",
    description: "Quantidade disponível em estoque",
    synonyms: [
      "qtd", "quantidade", "estoque", "saldo", "quantidade estoque", "stock",
      "quantity", "qtde", "qty", "estoque atual", "saldo estoque", "quant",
      "quantidade atual"
    ]
  },
  {
    name: "min_stock",
    label: "Estoque Mínimo",
    type: "number",
    example: "10",
    description: "Quantidade mínima para aviso de reposição",
    synonyms: [
      "estoque mínimo", "estoque minimo", "min stock", "est min", "qtd min",
      "quantidade mínima", "quantidade minima", "min estoque", "estoque de segurança"
    ]
  },
  {
    name: "unit",
    label: "Unidade de Medida",
    type: "enum",
    options: ["UN", "KG", "G", "L", "ML", "M", "M2", "CX", "PC", "PAR"],
    example: "UN",
    description: "Unidade comercial de venda",
    synonyms: ["unidade", "un", "unit", "und", "medida", "unid", "u.m.", "unidade medida"]
  },
  {
    name: "category",
    label: "Categoria",
    type: "string",
    example: "Vestuário",
    description: "Categoria principal do produto",
    synonyms: [
      "categoria", "cat", "category", "categoria produto", "categoria do produto",
      "departamento", "depto", "seção", "grupo"
    ]
  },
  {
    name: "subcategory",
    label: "Subcategoria",
    type: "string",
    example: "Camisetas",
    description: "Subdivisão da categoria",
    synonyms: ["subcategoria", "sub categoria", "subcategory", "sub-categoria", "subgrupo"]
  },
  {
    name: "brand",
    label: "Marca",
    type: "string",
    example: "Dudit Wear",
    description: "Marca ou fabricante do produto",
    synonyms: ["marca", "brand", "marca produto", "marca do produto", "fabricante", "marca/fabricante"]
  },
  {
    name: "supplier",
    label: "Fornecedor",
    type: "string",
    example: "Distribuidora Nacional",
    description: "Fornecedor padrão",
    synonyms: ["fornecedor", "fornecedor principal", "supplier", "forn", "vendedor", "fabricante fornecedor"]
  },
  {
    name: "status",
    label: "Status",
    type: "enum",
    options: ["Ativo", "Inativo", "Rascunho"],
    example: "Ativo",
    description: "Situação do cadastro no sistema",
    synonyms: ["status", "situação", "situacao", "estado", "ativo/inativo", "ativo", "inativo", "status produto"]
  },
  {
    name: "show_in_marketplace",
    label: "Visibilidade na Loja",
    type: "enum",
    options: ["Sim", "Não"],
    example: "Sim",
    description: "Exibir o produto no catálogo/marketplace online",
    synonyms: ["visibilidade", "visibility", "exibir", "publicado", "exibir na loja", "mostrar", "marketplace", "loja", "catálogo", "catalogo"]
  },
  {
    name: "description",
    label: "Descrição",
    type: "string",
    example: "Camiseta 100% algodão fio 30.1 penteado",
    description: "Descrição detalhada do produto",
    synonyms: ["descrição", "descricao", "description", "detalhes", "desc completa", "desc detalhada", "descricao completa", "sobre o produto"]
  },
  {
    name: "product_type",
    label: "Tipo de Produto",
    type: "enum",
    options: ["Físico", "Digital", "Serviço"],
    example: "Físico",
    description: "Natureza do produto",
    synonyms: ["tipo", "tipo produto", "product type", "tipo de produto", "natureza"]
  },
  {
    name: "condition",
    label: "Condição",
    type: "enum",
    options: ["Novo", "Usado", "Recondicionado"],
    example: "Novo",
    description: "Estado de conservação",
    synonyms: ["condição", "condicao", "condition", "estado conservacao", "novo/usado"]
  },
  {
    name: "ncm",
    label: "NCM",
    type: "string",
    example: "61091000",
    description: "Código NCM (8 dígitos)",
    synonyms: ["ncm", "ncm/sh", "ncm sh", "código ncm", "codigo ncm", "classificação fiscal", "classificacao fiscal"]
  },
  {
    name: "cest",
    label: "CEST",
    type: "string",
    example: "2803800",
    description: "Código CEST (7 dígitos)",
    synonyms: ["cest", "código cest", "codigo cest"]
  },
  {
    name: "origin",
    label: "Origem Fiscal",
    type: "enum",
    options: ["0 - Nacional", "1 - Estrangeira Importação Direta", "2 - Estrangeira Adquirida no Mercado Interno"],
    example: "0 - Nacional",
    description: "Origem da mercadoria para emissão fiscal",
    synonyms: ["origem", "origin", "origem produto", "origem mercadoria", "origem fiscal"]
  },
  {
    name: "weight_gross",
    label: "Peso Bruto (g)",
    type: "number",
    example: "250",
    description: "Peso total incluindo embalagem em gramas",
    synonyms: ["peso", "weight", "peso bruto", "peso g", "gross weight", "peso total", "peso em gramas"]
  },
  {
    name: "weight_net",
    label: "Peso Líquido (g)",
    type: "number",
    example: "200",
    description: "Peso do produto em gramas",
    synonyms: ["peso líquido", "peso liquido", "peso l", "net weight", "peso sem embalagem"]
  },
  {
    name: "width",
    label: "Largura (cm)",
    type: "number",
    example: "20",
    description: "Largura do pacote em centímetros",
    synonyms: ["largura", "width", "larg", "largura cm", "w", "cm largura"]
  },
  {
    name: "height",
    label: "Altura (cm)",
    type: "number",
    example: "5",
    description: "Altura do pacote em centímetros",
    synonyms: ["altura", "height", "alt", "altura cm", "h", "cm altura"]
  },
  {
    name: "length",
    label: "Comprimento (cm)",
    type: "number",
    example: "25",
    description: "Comprimento ou profundidade em centímetros",
    synonyms: ["comprimento", "length", "comp", "compr", "profundidade", "prof", "cm comprimento", "l", "profundidade cm"]
  },
  {
    name: "packaging_type",
    label: "Tipo de Embalagem",
    type: "enum",
    options: ["Pacote/Caixa", "Envelope", "Rolo/Cilindro"],
    example: "Pacote/Caixa",
    description: "Tipo de embalagem logística",
    synonyms: ["embalagem", "packaging", "tipo embalagem", "packaging type"]
  },
  {
    name: "preparation_days",
    label: "Dias de Preparação",
    type: "number",
    example: "1",
    description: "Prazo em dias para postagem/preparo",
    synonyms: ["dias preparo", "preparation days", "dias para preparo", "prazo preparo", "tempo preparo"]
  },
  {
    name: "tags",
    label: "Tags",
    type: "string",
    example: "moda, verao, casual",
    description: "Palavras-chave separadas por vírgula",
    synonyms: ["tags", "etiquetas", "labels", "palavras chave", "palavras-chave", "keywords"]
  },
]

const customerFields: FieldDef[] = [
  {
    name: "name",
    label: "Nome / Razão Social",
    type: "string",
    required: true,
    example: "Maria Silva Santos",
    description: "Nome completo do cliente ou Razão Social",
    synonyms: [
      "nome", "name", "cliente", "razão social", "razao social", "nome completo",
      "full name", "nome cliente", "nome / razão social", "destinatario"
    ]
  },
  {
    name: "person_type",
    label: "Tipo de Pessoa",
    type: "enum",
    options: ["Física", "Jurídica"],
    example: "Física",
    description: "Pessoa Física (PF) ou Pessoa Jurídica (PJ)",
    synonyms: ["tipo", "tipo pessoa", "person type", "pf/pj", "pessoa física/jurídica", "tipo cliente", "natureza"]
  },
  {
    name: "cpf",
    label: "CPF",
    type: "cpf_cnpj",
    isIdentifier: true,
    example: "123.456.789-00",
    description: "Cadastro de Pessoa Física (11 dígitos)",
    synonyms: ["cpf", "documento", "doc", "documento pf", "cpf/cnpj", "cpfcnpj", "documento principal"]
  },
  {
    name: "cnpj",
    label: "CNPJ",
    type: "cpf_cnpj",
    isIdentifier: true,
    example: "12.345.678/0001-90",
    description: "Cadastro Nacional da Pessoa Jurídica (14 dígitos)",
    synonyms: ["cnpj", "documento pj", "documento jurídico", "cnpj/cpf"]
  },
  {
    name: "email",
    label: "E-mail",
    type: "email",
    isIdentifier: true,
    example: "maria.silva@email.com",
    description: "Endereço eletrônico de contato",
    synonyms: ["email", "e-mail", "mail", "e mail", "correio eletrônico", "endereço de email", "email principal"]
  },
  {
    name: "phone",
    label: "Celular / WhatsApp",
    type: "phone",
    example: "(11) 98765-4321",
    description: "Telefone móvel com DDD",
    synonyms: ["telefone", "phone", "celular", "whatsapp", "tel", "fone", "contato", "telefone celular", "cel", "mobile", "phone number", "whats"]
  },
  {
    name: "phone_fixed",
    label: "Telefone Fixo",
    type: "phone",
    example: "(11) 3456-7890",
    description: "Telefone residencial ou comercial com DDD",
    synonyms: ["telefone fixo", "fixo", "tel fixo", "fone fixo", "telefone residencial", "tel residencial"]
  },
  {
    name: "birth_date",
    label: "Data de Nascimento",
    type: "date",
    example: "15/04/1988",
    description: "Data de nascimento no formato DD/MM/AAAA",
    synonyms: ["nascimento", "birth", "birth date", "data nascimento", "data de nascimento", "dt nascimento", "aniversário", "aniversario"]
  },
  {
    name: "status",
    label: "Status",
    type: "enum",
    options: ["Ativo", "Inativo", "Bloqueado"],
    example: "Ativo",
    description: "Status da conta do cliente",
    synonyms: ["status", "situação", "situacao", "estado", "ativo/inativo", "status cliente"]
  },
  {
    name: "zip_code",
    label: "CEP",
    type: "string",
    example: "01310-100",
    description: "Código de Endereçamento Postal (8 dígitos)",
    synonyms: ["cep", "zip", "zip code", "código postal", "codigo postal", "postal code"]
  },
  {
    name: "street",
    label: "Logradouro (Rua/Av)",
    type: "string",
    example: "Avenida Paulista",
    description: "Nome da rua, avenida, praça, etc.",
    synonyms: ["endereço", "endereco", "rua", "street", "logradouro", "av", "avenida", "travessa", "logradouro / rua"]
  },
  {
    name: "number",
    label: "Número",
    type: "string",
    example: "1000",
    description: "Número do imóvel ou S/N",
    synonyms: ["número", "numero", "n°", "nº", "number", "nr", "num", "no"]
  },
  {
    name: "complement",
    label: "Complemento",
    type: "string",
    example: "Apto 42",
    description: "Apartamento, bloco, sala, etc.",
    synonyms: ["complemento", "complement", "compl", "adicional", "apto", "sala", "bloco"]
  },
  {
    name: "neighborhood",
    label: "Bairro",
    type: "string",
    example: "Bela Vista",
    description: "Bairro ou distrito",
    synonyms: ["bairro", "neighborhood", "bair", "distrito"]
  },
  {
    name: "city",
    label: "Cidade",
    type: "string",
    example: "São Paulo",
    description: "Município",
    synonyms: ["cidade", "city", "município", "municipio"]
  },
  {
    name: "state",
    label: "Estado (UF)",
    type: "enum",
    options: ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"],
    example: "SP",
    description: "Sigla da Unidade Federativa com 2 letras",
    synonyms: ["estado", "state", "uf", "sigla estado", "sigla uf", "uf estado"]
  },
  {
    name: "inscricao_estadual",
    label: "Inscrição Estadual",
    type: "string",
    example: "123.456.789.110",
    description: "Inscrição Estadual para empresas",
    synonyms: ["ie", "inscrição estadual", "inscricao estadual", "inscrição", "insc estadual"]
  },
  {
    name: "notes",
    label: "Observações",
    type: "string",
    example: "Cliente VIP, prefere contato por WhatsApp",
    description: "Anotações internas sobre o cliente",
    synonyms: ["observações", "observacoes", "notes", "obs", "anotações", "anotacoes", "informações adicionais", "anotacao"]
  },
]

const serviceFields: FieldDef[] = [
  {
    name: "name",
    label: "Nome do Serviço",
    type: "string",
    required: true,
    example: "Formatação e Limpeza de PC",
    description: "Nome ou título do serviço prestado",
    synonyms: [
      "nome", "name", "serviço", "servico", "service", "nome serviço", "nome servico",
      "service name", "título", "titulo", "descrição do serviço", "descricao servico"
    ]
  },
  {
    name: "sku",
    label: "SKU / Código",
    type: "string",
    isIdentifier: true,
    example: "SERV-001",
    description: "Código interno do serviço",
    synonyms: ["sku", "código", "codigo", "ref", "referencia", "código serviço", "codigo servico", "cód serviço"]
  },
  {
    name: "price",
    label: "Preço",
    type: "number",
    required: true,
    example: "150.00",
    description: "Valor cobrado pelo serviço",
    synonyms: [
      "preço", "preco", "price", "valor", "preço serviço", "preco servico",
      "valor serviço", "valor servico", "preço unitário", "valor unitario"
    ]
  },
  {
    name: "cost_price",
    label: "Preço de Custo",
    type: "number",
    example: "30.00",
    description: "Custo operacional estimado do serviço",
    synonyms: ["custo", "cost", "preço custo", "preco custo", "custo serviço", "valor de custo"]
  },
  {
    name: "duration_minutes",
    label: "Duração (minutos)",
    type: "number",
    example: "60",
    description: "Tempo estimado de execução em minutos",
    synonyms: [
      "duração", "duracao", "duration", "tempo", "minutes", "minutos",
      "duração minutos", "tempo serviço", "tempo servico", "duracao (min)", "tempo estimado"
    ]
  },
  {
    name: "category",
    label: "Categoria",
    type: "string",
    example: "Assistência Técnica",
    description: "Categoria do serviço",
    synonyms: ["categoria", "category", "cat", "categoria serviço", "categoria servico", "tipo serviço", "tipo servico", "grupo"]
  },
  {
    name: "service_type",
    label: "Tipo de Atendimento",
    type: "enum",
    options: ["Presencial", "Online", "Híbrido"],
    example: "Presencial",
    description: "Modo de execução do atendimento",
    synonyms: ["tipo atendimento", "modo atendimento", "presencial/online", "service type", "modalidade"]
  },
  {
    name: "status",
    label: "Status",
    type: "enum",
    options: ["Ativo", "Inativo"],
    example: "Ativo",
    description: "Situação do serviço",
    synonyms: ["status", "situação", "situacao", "estado", "ativo/inativo", "status servico"]
  },
  {
    name: "unit",
    label: "Unidade",
    type: "string",
    example: "Serviço",
    description: "Unidade de cobrança (ex: Hora, Diária, Serviço)",
    synonyms: ["unidade", "un", "unit", "medida", "unidade cobrança"]
  },
  {
    name: "description",
    label: "Descrição",
    type: "string",
    example: "Instalação do SO, drivers e limpeza física dos componentes",
    description: "Detalhes do que está incluso no serviço",
    synonyms: ["descrição", "descricao", "description", "detalhes", "desc serviço", "desc servico", "escopo"]
  },
]

export const fieldRegistry: Record<EntityType, FieldDef[]> = {
  products: productFields,
  customers: customerFields,
  services: serviceFields,
}

export function getFieldsForEntity(entity: EntityType): FieldDef[] {
  return fieldRegistry[entity] || []
}

export function getFieldByName(entity: EntityType, name: string): FieldDef | undefined {
  return fieldRegistry[entity]?.find((f) => f.name === name)
}

export function getRequiredFields(entity: EntityType): string[] {
  return (fieldRegistry[entity] || [])
    .filter((f) => f.required)
    .map((f) => f.name)
}
