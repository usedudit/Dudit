export const CATEGORY_SLUG_MAP: { [key: string]: string } = {
    "casa-e-utilidades": "Casa & Utilidades",
    "moda-e-beleza": "Moda & Beleza",
    "saude-e-bem-estar": "Saúde & Bem-estar",
    "tecnologia-e-eletronicos": "Tecnologia & Eletrônicos",
    "auto-e-moto": "Auto & Moto",
    "pets": "Pets",
    "construcao-e-ferramentas": "Construção & Ferramentas",
    "agro-e-jardim": "Agro & Jardim",
    "infantil-e-brinquedos": "Infantil & Brinquedos",
    "alimentacao": "Alimentação",
    "outros": "Outros"
}

export const SECTIONS_BANNERS = [
    {
        id: "promos",
        title: "Em promoção",
        subtitle: "Ofertas imperdíveis",
        emoji: "🎯",
        gradient: "from-[#FF6B35] to-[#FF8C42]"
    },
    {
        id: "best-rated",
        title: "Melhor avaliados",
        subtitle: "Nota acima de 4.8",
        emoji: "🏆",
        gradient: "from-[#11998e] to-[#38ef7d]"
    },
    {
        id: "best-sellers",
        title: "Mais vendidos",
        subtitle: "Os queridinhos da cidade",
        emoji: "🔥",
        gradient: "from-[#4facfe] to-[#00f2fe]"
    }
]

export const CATEGORY_GRADIENTS = [
    "from-[#FF8008] to-[#FFC837]",
    "from-[#11998e] to-[#38ef7d]",
    "from-[#00c6ff] to-[#0072ff]",
    "from-[#7F00FF] to-[#E100FF]",
    "from-[#fe0979] to-[#ff6a00]",
    "from-[#F7971E] to-[#FFD200]",
    "from-[#4facfe] to-[#00f2fe]",
    "from-[#00b09b] to-[#96c93d]"
]

export const FALLBACK_CATEGORIES = [
    { name: "Casa & Utilidades", icon_url: "https://img.dudit.com.br/static/categories/products/Casa-e-utilidades.png" },
    { name: "Moda & Beleza", icon_url: "https://img.dudit.com.br/static/categories/products/Moda-e-beleza.png" },
    { name: "Saúde & Bem-estar", icon_url: "https://img.dudit.com.br/static/categories/products/Saude-e-bem-estar.png" },
    { name: "Tecnologia & Eletrônicos", icon_url: "https://img.dudit.com.br/static/categories/products/Tecnologia-e-eletronicos.png" },
    { name: "Auto & Moto", icon_url: "https://img.dudit.com.br/static/categories/products/Auto-e-moto.png" },
    { name: "Pets", icon_url: "https://img.dudit.com.br/static/categories/products/Pets.png" },
    { name: "Construção & Ferramentas", icon_url: "https://img.dudit.com.br/static/categories/products/Construcao-e-ferramentas.png" },
    { name: "Agro & Jardim", icon_url: "https://img.dudit.com.br/static/categories/products/Agro-e-jardim.png" },
    { name: "Infantil & Brinquedos", icon_url: "https://img.dudit.com.br/static/categories/products/Infantil-e-brinquedos.png" }
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

export type SortOption = "relevancia" | "preco_menor" | "preco_maior" | "recentes"
export type ViewMode = "grid" | "list"
