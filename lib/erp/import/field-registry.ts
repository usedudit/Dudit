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
      "nome do produto", "nome produto", "produto nome", "produto", "nome",
      "item", "product name", "name", "produto/serviço", "titulo", "título",
      "título do produto", "titulo do produto", "designação"
    ]
  },
  {
    name: "sku",
    label: "SKU / Código",
    type: "string",
    isIdentifier: true,
    example: "CAM-ALG-001",
    description: "Código interno único para controle de estoque (deixe em branco se o produto tiver variações)",
    synonyms: [
      "sku", "sku / código", "sku / codigo", "sku/código", "sku/codigo",
      "código sku", "codigo sku", "código interno", "codigo interno",
      "referencia", "ref", "código do produto", "codigo do produto",
      "cód interno", "cod interno", "code", "part number", "cod prod",
      "cód prod", "cod_item", "código item", "codigo item", "código", "codigo"
    ]
  },
  {
    name: "gtin",
    label: "Código de Barras (GTIN/EAN)",
    type: "string",
    example: "7891234567890",
    description: "Código de barras universal (EAN-13, EAN-8, UPC, etc.)",
    synonyms: [
      "código de barras (gtin/ean)", "codigo de barras (gtin/ean)",
      "código de barras (gtin / ean)", "codigo de barras (gtin / ean)",
      "código de barras gtin/ean", "codigo de barras gtin/ean",
      "codigo de barras gtin ean", "código de barras gtin ean",
      "código de barras", "codigo de barras", "código de barra", "codigo de barra",
      "cód de barras", "cod de barras", "cód barras", "cod barras",
      "código barras", "codigo barras", "barra", "barras", "barcode",
      "gtin", "ean", "ean13", "ean-13", "ean8", "ean-8", "upc",
      "gtin/ean", "ean/gtin", "gtin ean", "ean gtin", "código gtin",
      "codigo gtin", "código ean", "codigo ean"
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
      "preço de venda", "preco de venda", "preço venda", "preco venda",
      "valor de venda", "valor venda", "preço unitário", "preco unitario",
      "valor unitário", "valor unitario", "preço final", "preco final",
      "preço", "preco", "valor", "price", "sale price", "pv"
    ]
  },
  {
    name: "cost_price",
    label: "Preço de Custo",
    type: "number",
    example: "25.00",
    description: "Custo de aquisição ou fabricação",
    synonyms: [
      "preço de custo", "preco de custo", "preço custo", "preco custo",
      "custo unitário", "custo unitario", "valor de custo", "valor custo",
      "preço de compra", "preco de compra", "cost", "cost price", "custo"
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
      "estoque atual", "saldo estoque", "quantidade estoque", "quantidade atual",
      "qtd", "quantidade", "estoque", "saldo", "stock", "quantity", "qtde", "qty", "quant"
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
    synonyms: ["unidade de medida", "unidade medida", "unidade", "un", "unit", "und", "medida", "unid", "u.m."]
  },
  {
    name: "brand",
    label: "Marca",
    type: "string",
    example: "Dudit Wear",
    description: "Marca ou fabricante do produto",
    synonyms: ["marca do produto", "marca produto", "marca", "brand", "fabricante", "marca/fabricante"]
  },
  {
    name: "variant_type",
    label: "Tipo de Variação",
    type: "string",
    example: "Tamanho",
    description: "Nome do atributo ou atributos da variação (ex: Tamanho, Cor, Cor / Tamanho)",
    synonyms: [
      "tipo de variacao", "tipo de variação", "tipo de variante", "tipo variacao",
      "tipo variação", "tipo variante", "variacao tipo", "variante tipo",
      "grade tipo", "tipo grade", "atributo variacao", "atributo", "atributos"
    ]
  },
  {
    name: "variants",
    label: "Variações (Grade)",
    type: "string",
    example: "P (Estoque: 10, Preço: 49.90); M (Estoque: 20, Preço: 49.90); G (Estoque: 15, Preço: 54.90)",
    description: "Lista de variações separadas por ponto e vírgula (;). Ex: P; M; G ou P (Estoque: 10, Preço: 49.90, SKU: CAM-P); M (Estoque: 20)",
    synonyms: [
      "variações (grade)", "variacoes (grade)", "lista variacoes", "lista variações",
      "lista variantes", "itens grade", "grade produtos", "valores variacao",
      "valores variação", "variacoes produto", "variantes produto", "variacoes",
      "variações", "variantes", "grade", "opcoes", "opções"
    ]
  },
  {
    name: "status",
    label: "Status",
    type: "enum",
    options: ["Ativo", "Inativo", "Rascunho"],
    example: "Ativo",
    description: "Situação do cadastro no sistema",
    synonyms: ["status produto", "status", "situação", "situacao", "estado", "ativo/inativo", "ativo", "inativo"]
  },
  {
    name: "show_in_marketplace",
    label: "Visibilidade na Loja",
    type: "enum",
    options: ["Sim", "Não"],
    example: "Sim",
    description: "Exibir o produto no catálogo/marketplace online",
    synonyms: ["visibilidade na loja", "visibilidade", "visibility", "exibir na loja", "exibir", "publicado", "mostrar", "marketplace", "loja", "catálogo", "catalogo"]
  },
  {
    name: "description",
    label: "Descrição",
    type: "string",
    example: "Camiseta 100% algodão fio 30.1 penteado",
    description: "Descrição detalhada do produto",
    synonyms: [
      "descrição do produto", "descricao do produto", "descrição produto",
      "descricao produto", "descrição detalhada", "descricao detalhada",
      "descrição completa", "descricao completa", "sobre o produto",
      "descrição", "descricao", "description", "detalhes", "desc",
      "observações", "observacoes", "obs", "especificações", "especificacoes"
    ]
  },
  {
    name: "product_type",
    label: "Tipo de Produto",
    type: "enum",
    options: ["Físico", "Digital", "Serviço"],
    example: "Físico",
    description: "Natureza do produto",
    synonyms: ["tipo de produto", "tipo produto", "product type", "natureza", "tipo"]
  },
  {
    name: "condition",
    label: "Condição",
    type: "enum",
    options: ["Novo", "Usado", "Recondicionado"],
    example: "Novo",
    description: "Estado de conservação",
    synonyms: ["estado conservacao", "condição", "condicao", "condition", "novo/usado"]
  },
  {
    name: "ncm",
    label: "NCM",
    type: "string",
    example: "61091000",
    description: "Código NCM (8 dígitos)",
    synonyms: ["classificação fiscal", "classificacao fiscal", "código ncm", "codigo ncm", "ncm/sh", "ncm sh", "ncm"]
  },
  {
    name: "cest",
    label: "CEST",
    type: "string",
    example: "2803800",
    description: "Código CEST (7 dígitos)",
    synonyms: ["código cest", "codigo cest", "cest"]
  },
  {
    name: "weight_gross",
    label: "Peso Bruto (g)",
    type: "number",
    example: "250",
    description: "Peso total incluindo embalagem em gramas",
    synonyms: [
      "peso bruto (g)", "peso bruto g", "peso bruto (gramas)", "peso bruto gramas",
      "peso total (g)", "peso total g", "peso bruto", "gross weight", "peso total",
      "peso com embalagem", "peso embalagem"
    ]
  },
  {
    name: "weight_net",
    label: "Peso Líquido (g)",
    type: "number",
    example: "200",
    description: "Peso do produto em gramas",
    synonyms: [
      "peso líquido (g)", "peso liquido (g)", "peso líquido g", "peso liquido g",
      "peso líquido (gramas)", "peso liquido (gramas)", "peso líquido", "peso liquido",
      "peso liq (g)", "peso líq (g)", "peso liq", "peso líq", "peso l", "net weight",
      "peso sem embalagem", "peso produto", "peso real", "peso real (g)"
    ]
  },
  {
    name: "width",
    label: "Largura (cm)",
    type: "number",
    example: "20",
    description: "Largura do pacote em centímetros",
    synonyms: ["largura (cm)", "largura cm", "cm largura", "largura", "width", "larg", "w"]
  },
  {
    name: "height",
    label: "Altura (cm)",
    type: "number",
    example: "5",
    description: "Altura do pacote em centímetros",
    synonyms: ["altura (cm)", "altura cm", "cm altura", "altura", "height", "alt", "h"]
  },
  {
    name: "length",
    label: "Comprimento (cm)",
    type: "number",
    example: "25",
    description: "Comprimento ou profundidade em centímetros",
    synonyms: [
      "comprimento (cm)", "comprimento cm", "cm comprimento", "profundidade (cm)",
      "profundidade cm", "comprimento", "profundidade", "length", "comp", "compr", "prof", "l"
    ]
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
    synonyms: ["status cliente", "status", "situação", "situacao", "ativo/inativo", "ativo", "inativo", "status do cliente"]
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
    synonyms: [
      "estado (uf)", "estado ( uf )", "estado/uf", "estado uf", "uf / estado",
      "uf/estado", "uf estado", "estado", "uf", "sigla do estado", "sigla estado",
      "sigla da uf", "sigla uf", "state", "província", "provincia"
    ]
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
      "nome do serviço", "nome do servico", "nome serviço", "nome servico",
      "serviço nome", "servico nome", "service name", "serviço", "servico",
      "service", "nome", "name", "título", "titulo", "título do serviço", "titulo do servico"
    ]
  },
  {
    name: "sku",
    label: "SKU / Código",
    type: "string",
    isIdentifier: true,
    example: "SERV-001",
    description: "Código interno do serviço",
    synonyms: [
      "sku", "sku / código", "sku / codigo", "sku/código", "sku/codigo",
      "código do serviço", "codigo do servico", "código serviço", "codigo servico",
      "cód serviço", "cod servico", "código interno", "codigo interno",
      "referencia", "ref", "código", "codigo"
    ]
  },
  {
    name: "price",
    label: "Preço",
    type: "number",
    required: true,
    example: "150.00",
    description: "Valor cobrado pelo serviço",
    synonyms: [
      "preço do serviço", "preco do servico", "preço serviço", "preco servico",
      "valor do serviço", "valor do servico", "valor serviço", "valor servico",
      "preço de venda", "preco de venda", "preço unitário", "preco unitario",
      "valor unitário", "valor unitario", "preço", "preco", "price", "valor"
    ]
  },
  {
    name: "cost_price",
    label: "Preço de Custo",
    type: "number",
    example: "30.00",
    description: "Custo operacional estimado do serviço",
    synonyms: [
      "preço de custo", "preco de custo", "preço custo", "preco custo",
      "custo do serviço", "custo do servico", "custo serviço", "custo servico",
      "valor de custo", "valor custo", "custo operacional", "custo estimado",
      "custo", "cost", "cost price"
    ]
  },
  {
    name: "duration_minutes",
    label: "Duração (minutos)",
    type: "number",
    example: "60",
    description: "Tempo estimado de execução em minutos",
    synonyms: [
      "duração (minutos)", "duracao (minutos)", "duração minutos", "duracao minutos",
      "duração em minutos", "duracao em minutos", "duracao (min)", "duração (min)",
      "tempo estimado", "tempo do serviço", "tempo do servico", "tempo serviço",
      "tempo servico", "duração", "duracao", "duration", "tempo", "minutes", "minutos"
    ]
  },
  {
    name: "category",
    label: "Categoria",
    type: "string",
    example: "Assistência Técnica",
    description: "Categoria do serviço",
    synonyms: ["categoria do serviço", "categoria do servico", "categoria serviço", "categoria servico", "categoria", "category", "cat", "tipo serviço", "tipo servico", "grupo"]
  },
  {
    name: "service_type",
    label: "Tipo de Atendimento",
    type: "enum",
    options: ["Presencial", "Online", "Híbrido"],
    example: "Presencial",
    description: "Modo de execução do atendimento",
    synonyms: [
      "tipo de atendimento", "tipo atendimento", "modo de atendimento", "modo atendimento",
      "modalidade de atendimento", "modalidade atendimento", "presencial / online",
      "presencial/online", "presencial ou online", "atendimento presencial / online",
      "atendimento", "service type", "modalidade", "tipo"
    ]
  },
  {
    name: "status",
    label: "Status",
    type: "enum",
    options: ["Ativo", "Inativo"],
    example: "Ativo",
    description: "Situação do serviço",
    synonyms: ["status serviço", "status servico", "status", "situação", "situacao", "estado", "ativo/inativo"]
  },
  {
    name: "unit",
    label: "Unidade",
    type: "string",
    example: "Serviço",
    description: "Unidade de cobrança (ex: Hora, Diária, Serviço)",
    synonyms: ["unidade de cobrança", "unidade cobranca", "unidade de medida", "unidade medida", "unidade", "un", "unit", "medida"]
  },
  {
    name: "description",
    label: "Descrição",
    type: "string",
    example: "Instalação do SO, drivers e limpeza física dos componentes",
    description: "Detalhes do que está incluso no serviço",
    synonyms: [
      "descrição do serviço", "descricao do servico", "descrição serviço", "descricao servico",
      "descrição detalhada", "descricao detalhada", "descrição completa", "descricao completa",
      "descrição", "descricao", "description", "detalhes", "desc", "escopo", "sobre o serviço"
    ]
  },
]

const appointmentFields: FieldDef[] = [
  {
    name: "customer_name",
    label: "Nome do Cliente",
    type: "string",
    required: true,
    example: "Mariana Souza",
    description: "Nome completo do cliente",
    synonyms: [
      "nome do cliente", "nome cliente", "cliente nome", "cliente", "nome",
      "paciente", "client", "customer", "customer name", "attendee", "aluno",
      "contato", "solicitante"
    ]
  },
  {
    name: "customer_phone",
    label: "Telefone / Celular",
    type: "phone",
    example: "(11) 98765-4321",
    description: "Telefone de contato ou WhatsApp do cliente",
    synonyms: [
      "telefone", "celular", "whatsapp", "whats", "phone", "tel", "contato",
      "telefone cliente", "celular cliente", "phone number", "mobile", "fone"
    ]
  },
  {
    name: "customer_email",
    label: "E-mail do Cliente",
    type: "email",
    example: "mariana.souza@email.com",
    description: "E-mail de contato do cliente",
    synonyms: [
      "email", "e-mail", "email do cliente", "e-mail do cliente", "email cliente",
      "client email", "customer email", "mail"
    ]
  },
  {
    name: "service_name",
    label: "Nome do Serviço",
    type: "string",
    required: true,
    example: "Corte e Escova",
    description: "Nome do serviço ou procedimento agendado",
    synonyms: [
      "nome do serviço", "nome do servico", "nome serviço", "nome servico",
      "serviço", "servico", "service", "service name", "procedimento", "item",
      "resumo", "summary", "título", "titulo", "subject", "assunto", "tratamento"
    ]
  },
  {
    name: "start_date",
    label: "Data",
    type: "date",
    required: true,
    example: "25/08/2026",
    description: "Data do agendamento (DD/MM/AAAA ou AAAA-MM-DD)",
    synonyms: [
      "data", "data do agendamento", "data agendamento", "data início",
      "data inicio", "start date", "date", "dia", "data da reserva", "dt agendamento"
    ]
  },
  {
    name: "start_time",
    label: "Horário de Início",
    type: "string",
    required: true,
    example: "14:30",
    description: "Horário inicial do atendimento (formato HH:MM)",
    synonyms: [
      "horário de início", "horario de inicio", "hora início", "hora inicio",
      "horário", "horario", "hora", "hora inicial", "horário inicial",
      "start time", "time", "hora agendamento", "início", "inicio"
    ]
  },
  {
    name: "end_time",
    label: "Horário de Término",
    type: "string",
    example: "15:30",
    description: "Horário final do atendimento (formato HH:MM)",
    synonyms: [
      "horário de término", "horario de termino", "hora término", "hora termino",
      "hora final", "horário final", "end time", "término", "termino", "fim", "hora fim"
    ]
  },
  {
    name: "duration_minutes",
    label: "Duração (minutos)",
    type: "number",
    example: "60",
    description: "Duração estimada do atendimento em minutos",
    synonyms: [
      "duração", "duracao", "duração (minutos)", "duracao (minutos)", "duração (min)",
      "duracao (min)", "tempo", "minutos", "duration", "duration (min)", "tempo estimado"
    ]
  },
  {
    name: "staff_name",
    label: "Profissional / Atendente",
    type: "string",
    example: "Carlos Silva",
    description: "Nome do colaborador ou profissional responsável",
    synonyms: [
      "profissional", "atendente", "colaborador", "prestador", "especialista",
      "staff", "staff name", "barbeiro", "cabeleireiro", "médico", "medico",
      "terapeuta", "funcionário", "funcionario", "responsável", "responsavel"
    ]
  },
  {
    name: "price",
    label: "Valor / Preço",
    type: "number",
    example: "85.00",
    description: "Valor cobrado pelo agendamento",
    synonyms: [
      "valor", "preço", "preco", "valor do serviço", "valor do servico",
      "preço do serviço", "preco do servico", "valor total", "total",
      "price", "amount", "valor cobrado"
    ]
  },
  {
    name: "status",
    label: "Status / Situação",
    type: "enum",
    options: ["Reservado", "Confirmado", "Aguardando", "Em andamento", "Iniciado", "Concluído", "Pago", "Ausência", "Cancelado"],
    example: "Confirmado",
    description: "Situação atual do agendamento",
    synonyms: [
      "status", "situação", "situacao", "estado", "state", "status agendamento",
      "situação agendamento", "situacao agendamento", "status do agendamento"
    ]
  },
  {
    name: "notes",
    label: "Observações",
    type: "string",
    example: "Cliente prefere corte na tesoura",
    description: "Notas adicionais, preferências ou histórico",
    synonyms: [
      "observações", "observacoes", "notas", "notes", "obs", "anotações",
      "anotacoes", "description", "descrição", "descricao", "detalhes", "informações adicionais"
    ]
  },
]

export const fieldRegistry: Record<EntityType, FieldDef[]> = {
  products: productFields,
  customers: customerFields,
  services: serviceFields,
  appointments: appointmentFields,
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

