/**
 * Slugs de categoria válidos no caminho /explorar/{cidade}/{categoria}.
 * Inclui as categorias de produtos, de serviços e de lojas (vitrines) - sem
 * elas, um link de vitrine por categoria cairia em 404.
 */
export const CATEGORY_SLUG_MAP: { [key: string]: string } = {
    // Produtos
    "alimentacao": "Alimentação",
    "casa": "Casa",
    "tecnologia": "Tecnologia",
    "moda-e-beleza": "Moda e Beleza",
    "saude": "Saúde",
    "automotivo": "Automotivo",
    "pets": "Pets",
    "servicos": "Serviços",
    "outros": "Outros",
    // Serviços
    "reformas-e-manutencao": "Reformas e Manutenção",
    "assistencia-tecnica": "Assistência Técnica",
    "beleza-e-estetica": "Beleza e Estética",
    "fretes-e-profissionais": "Fretes e Profissionais",
    "outros-servicos": "Outros Serviços",
    // Lojas / vitrines
    "varejo": "Varejo",
    "construcao-e-casa": "Construção e Casa",
    "profissional-consultoria": "Profissional / Consultoria",
    "educacao": "Educação",
}

export const CATEGORY_GRADIENTS: Record<string, string> = {
    "alimentacao": "from-[#d63031] to-[#e17055]",
    "casa": "from-[#FF8008] to-[#FFC837]",
    "tecnologia": "from-[#00c6ff] to-[#0072ff]",
    "moda-e-beleza": "from-[#fe0979] to-[#ff6a00]",
    "saude": "from-[#11998e] to-[#38ef7d]",
    "automotivo": "from-[#4facfe] to-[#00f2fe]",
    "pets": "from-[#7F00FF] to-[#E100FF]",
    "servicos": "from-[#636e72] to-[#8d99ae]",
    "outros": "from-[#b2bec3] to-[#636e72]",
}

export const FALLBACK_CATEGORIES = [
    { name: "Alimentação", slug: "alimentacao", icon_url: "https://img.dudit.com.br/static/categories/products/Alimentacao.png" },
    { name: "Casa", slug: "casa", icon_url: "https://img.dudit.com.br/static/categories/products/Casa-e-utilidades.png" },
    { name: "Tecnologia", slug: "tecnologia", icon_url: "https://img.dudit.com.br/static/categories/products/Tecnologia-e-eletronicos.png" },
    { name: "Moda e Beleza", slug: "moda-e-beleza", icon_url: "https://img.dudit.com.br/static/categories/products/Moda-e-beleza.png" },
    { name: "Saúde", slug: "saude", icon_url: "https://img.dudit.com.br/static/categories/products/Saude-e-bem-estar.png" },
    { name: "Automotivo", slug: "automotivo", icon_url: "https://img.dudit.com.br/static/categories/products/Auto-e-moto.png" },
    { name: "Pets", slug: "pets", icon_url: "https://img.dudit.com.br/static/categories/products/Pets.png" },
    { name: "Serviços", slug: "servicos", icon_url: "" },
    { name: "Outros", slug: "outros", icon_url: "" },
]

export const COMMON_CITY_ACCENTS: Record<string, string> = {
    "sao-paulo": "São Paulo",
    "cambe": "Cambé",
    "brasilia": "Brasília",
    "goiania": "Goiânia",
    "florianopolis": "Florianópolis",
    "belem": "Belém",
    "sao-luis": "São Luís",
    "maceio": "Maceió",
    "cuiaba": "Cuiabá",
    "macapa": "Macapá",
    "vitoria": "Vitória",
    "ribeirao-preto": "Ribeirão Preto",
    "sao-jose-dos-campos": "São José dos Campos",
    "sao-bernardo-do-campo": "São Bernardo do Campo",
    "sao-caetano-do-sul": "São Caetano do Sul",
    "sao-jose-do-rio-preto": "São José do Rio Preto",
    "sao-goncalo": "São Gonçalo",
    "sao-joao-de-meriti": "São João de Meriti",
    "sao-jose": "São José",
    "petropolis": "Petrópolis",
    "teresopolis": "Teresópolis",
    "sao-carlos": "São Carlos",
    "chapeco": "Chapecó",
    "marilia": "Marília",
    "paranagua": "Paranaguá",
    "cacador": "Caçador",
    "criciuma": "Criciúma",
    "tubarao": "Tubarão",
    "blumenau": "Blumenau",
    "joinville": "Joinville",
    "itajai": "Itajaí",
    "balneario-camboriu": "Balneário Camboriú",
    "sao-francisco-do-sul": "São Francisco do Sul",
    "sao-joaquim": "São João",
    "caxias-do-sul": "Caxias do Sul",
    "maringa": "Maringá",
    "cascavel": "Cascavel",
    "ponta-grossa": "Ponta Grossa",
    "foz-do-iguacu": "Foz do Iguaçu",
    "guarapuava": "Guarapuava",
    "paranavai": "Paranavaí",
    "apucarana": "Apucarana",
    "arapongas": "Arapongas",
    "umuarama": "Umuarama",
    "toledo": "Toledo",
    "campo-mourao": "Campo Mourão",
    "patos-de-minas": "Patos de Minas",
    "pocos-de-caldas": "Poços de Caldas",
    "juiz-de-fora": "Juiz de Fora",
    "governador-valadares": "Governador Valadares",
    "teofilo-otoni": "Teófilo Otoni",
    "sao-joao-del-rei": "São João del-Rei",
    "sao-lourenco": "São Lourenço",
    "sao-sebastiao": "São Sebastião",
    "ilhabela": "Ilhabela",
    "ubatuba": "Ubatuba",
    "guaruja": "Guarujá",
    "aracaju": "Aracaju",
    "joao-pessoa": "João Pessoa",
}

export const ESTADO_MAP: Record<string, string> = {
    ac: "Acre", al: "Alagoas", ap: "Amapá", am: "Amazonas",
    ba: "Bahia", ce: "Ceará", df: "Distrito Federal",
    es: "Espírito Santo", go: "Goiás", ma: "Maranhão",
    mt: "Mato Grosso", ms: "Mato Grosso do Sul", mg: "Minas Gerais",
    pa: "Pará", pb: "Paraíba", pr: "Paraná", pe: "Pernambuco",
    pi: "Piauí", rj: "Rio de Janeiro", rn: "Rio Grande do Norte",
    rs: "Rio Grande do Sul", ro: "Rondônia", rr: "Roraima",
    sc: "Santa Catarina", sp: "São Paulo", se: "Sergipe", to: "Tocantins",
}

export type SortOption =
    | "relevancia"
    | "preco_menor"
    | "preco_maior"
    | "recentes"
    | "avaliacao"
    | "distancia"
