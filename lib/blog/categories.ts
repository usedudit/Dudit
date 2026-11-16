export interface BlogCategory {
    id: string
    label: string
    shortLabel: string
    description: string
    emoji: string
    accent: "green" | "blue" | "purple" | "orange" | "red" | "cyan" | "gray"
}

export const BLOG_CATEGORIES: BlogCategory[] = [
    {
        id: "protecao-e-seguranca",
        label: "Proteção e Segurança",
        shortLabel: "Segurança",
        description: "Como reconhecer golpes, proteger sua conta e vender com tranquilidade.",
        emoji: "🛡️",
        accent: "red",
    },
    {
        id: "gestao-financeira",
        label: "Gestão Financeira",
        shortLabel: "Financeiro",
        description: "Fluxo de caixa, precificação, margem e decisões com números na mão.",
        emoji: "💰",
        accent: "green",
    },
    {
        id: "vendas-e-marketing",
        label: "Vendas e Marketing",
        shortLabel: "Vendas",
        description: "Estratégias práticas para vender mais no balcão, no WhatsApp e online.",
        emoji: "🚀",
        accent: "purple",
    },
    {
        id: "fotos-e-anuncios",
        label: "Fotos e Anúncios",
        shortLabel: "Fotos",
        description: "Fotos, descrições e vitrines que convertem visitantes em clientes.",
        emoji: "📸",
        accent: "orange",
    },
    {
        id: "gestao-do-negocio",
        label: "Gestão do Negócio",
        shortLabel: "Gestão",
        description: "Organização, estoque, atendimento e rotinas para crescer sem caos.",
        emoji: "📊",
        accent: "blue",
    },
    {
        id: "dicas-da-plataforma",
        label: "Dicas da Plataforma",
        shortLabel: "Plataforma",
        description: "Truques e atalhos para aproveitar melhor a Dudit no dia a dia.",
        emoji: "💡",
        accent: "cyan",
    },
    {
        id: "noticias",
        label: "Notícias",
        shortLabel: "Notícias",
        description: "Novidades, atualizações e comunicados da Dudit.",
        emoji: "📰",
        accent: "gray",
    },
    {
        id: "geral",
        label: "Geral",
        shortLabel: "Geral",
        description: "Conteúdos gerais sobre empreender e cuidar do seu negócio.",
        emoji: "📚",
        accent: "gray",
    },
]

const FALLBACK_CATEGORY: BlogCategory = BLOG_CATEGORIES[BLOG_CATEGORIES.length - 1]

export function getBlogCategory(id: string | null | undefined): BlogCategory {
    return BLOG_CATEGORIES.find((category) => category.id === id) ?? FALLBACK_CATEGORY
}

export const BLOG_CATEGORY_OPTIONS = BLOG_CATEGORIES.map((category) => ({
    value: category.id,
    label: `${category.emoji} ${category.label}`,
}))

export interface RelatedBlogLink {
    href: string
    label: string
    description: string
}

export const BLOG_RELATED_LINKS: Record<string, RelatedBlogLink[]> = {
    "protecao-e-seguranca": [
        {
            href: "/ajuda/login-registro/acessando-conta",
            label: "Proteger minha conta",
            description: "Veja como manter o acesso à sua conta seguro.",
        },
        {
            href: "/institucional/termos",
            label: "Termos de uso",
            description: "Entenda as regras da plataforma e seus direitos.",
        },
        {
            href: "/institucional/privacidade",
            label: "Política de privacidade",
            description: "Saiba como seus dados são tratados na Dudit.",
        },
    ],
    "gestao-financeira": [
        {
            href: "/ajuda/financeiro/primeiros-passos-financeiro",
            label: "Primeiros passos do financeiro",
            description: "Aprenda a lançar entradas, saídas e organizar contas.",
        },
        {
            href: "/ferramentas/calculadora-ponto-equilibrio",
            label: "Calculadora de ponto de equilíbrio",
            description: "Descubra quanto precisa vender para cobrir os custos.",
        },
        {
            href: "/ferramentas/calculadora-margem-lucro-preco-venda",
            label: "Calculadora de margem e preço",
            description: "Precifique com margem real, sem achismo.",
        },
    ],
    "vendas-e-marketing": [
        {
            href: "/ajuda/marketing/visao-geral-campanhas-promocoes",
            label: "Campanhas e promoções",
            description: "Crie ofertas que fazem sentido para o seu público.",
        },
        {
            href: "/institucional/segmentos",
            label: "Soluções por segmento",
            description: "Veja ideias aplicadas ao seu tipo de negócio.",
        },
        {
            href: "/institucional/planos",
            label: "Planos da Dudit",
            description: "Compare recursos e escolha o plano ideal.",
        },
    ],
    "fotos-e-anuncios": [
        {
            href: "/ajuda/produtos-estoque/como-cadastrar-produto",
            label: "Como cadastrar um produto",
            description: "Passo a passo para publicar seu anúncio.",
        },
        {
            href: "/ajuda/vitrine-online/visao-geral-vitrine-online",
            label: "Vitrine online",
            description: "Entenda como sua loja aparece para os clientes.",
        },
        {
            href: "/ferramentas",
            label: "Ferramentas grátis",
            description: "Calculadoras e geradores para o seu negócio.",
        },
    ],
    "gestao-do-negocio": [
        {
            href: "/ajuda/vendas/visao-geral-vendas",
            label: "Visão geral de vendas",
            description: "Organize pedidos, orçamentos e atendimento.",
        },
        {
            href: "/ajuda/produtos-estoque/como-controlar-estoque",
            label: "Controle de estoque",
            description: "Evite rupturas e compras desnecessárias.",
        },
        {
            href: "/institucional/planos",
            label: "Planos da Dudit",
            description: "Veja o que cada plano oferece para a sua rotina.",
        },
    ],
    "dicas-da-plataforma": [
        {
            href: "/ajuda",
            label: "Central de Ajuda",
            description: "Tutoriais completos de todos os módulos.",
        },
        {
            href: "/institucional/inicio",
            label: "Como a Dudit funciona",
            description: "Conheça os recursos da plataforma.",
        },
        {
            href: "/institucional/contato",
            label: "Falar com a gente",
            description: "Tire dúvidas com o time de suporte.",
        },
    ],
    noticias: [
        {
            href: "/institucional/sobre",
            label: "Sobre a Dudit",
            description: "Conheça nossa história e nosso propósito.",
        },
        {
            href: "/institucional/estatisticas",
            label: "Estatísticas do comércio",
            description: "Dados para entender o mercado local.",
        },
        {
            href: "/mapa-do-site",
            label: "Mapa do site",
            description: "Encontre rapidamente todas as páginas.",
        },
    ],
    geral: [
        {
            href: "/ajuda",
            label: "Central de Ajuda",
            description: "Guias passo a passo da plataforma.",
        },
        {
            href: "/institucional/inicio",
            label: "Como a Dudit funciona",
            description: "Conheça os recursos da plataforma.",
        },
        {
            href: "/institucional/planos",
            label: "Planos da Dudit",
            description: "Escolha o plano ideal para o seu momento.",
        },
    ],
}
