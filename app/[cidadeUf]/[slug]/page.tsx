import { Metadata } from 'next'
import { searchMarketplaceDirect } from '@/app/actions/marketplace/search'
import { redirect, permanentRedirect } from 'next/navigation'
import { isValidCitySlug } from '@/lib/validation/city'
import ExplorarPage from '@/app/explorar/page'

const CATEGORY_SLUG_MAP: { [key: string]: string } = {
  "alimentacao": "Alimentação",
  "mercado-e-conveniencia": "Mercado & Conveniência",
  "casa-e-construcao": "Casa & Construção",
  "servicos-residenciais": "Serviços residenciais",
  "automotivo": "Automotivo",
  "beleza-e-bem-estar": "Beleza & Bem-estar",
  "moda-e-acessorios": "Moda & Acessórios",
  "tecnologia": "Tecnologia",
  "saude": "Saúde",
  "outros": "Outros"
}

export const revalidate = 86400 // Cache 24h

type Props = {
  params: Promise<{ cidadeUf: string; slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cidadeUf, slug } = await params

  // Format para título legível
  const cityFormatted = cidadeUf.split('-').slice(0, -1).join(' ').replace(/\b\w/g, l => l.toUpperCase())
  const stateFormatted = cidadeUf.split('-').pop()?.toUpperCase() || ''
  const termFormatted = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())

  // Busca rápida apenas para verificar se há resultados e indexar ou não
  const query = `${slug.replace(/-/g, ' ')} ${cidadeUf}`
  const results = await searchMarketplaceDirect(query, 'tudo', { geral: 1 })

  const hasResults = results && results.length > 0

  return {
    title: `Encontre ${termFormatted} em ${cityFormatted} - ${stateFormatted} | Dudit`,
    description: `Resultados locais para ${termFormatted} na cidade de ${cityFormatted} (${stateFormatted}). Compare preços, veja avaliações e agende serviços locais sem taxas pela Dudit.`,
    robots: {
      index: hasResults,
      follow: true,
    },
    alternates: {
      canonical: `https://dudit.com.br/${cidadeUf.toLowerCase()}/${slug.toLowerCase()}`,
    },
    openGraph: {
      title: `${termFormatted} em ${cityFormatted} | Dudit`,
      description: `Compre ou agende ${termFormatted} em ${cityFormatted} de forma rápida e segura.`,
      url: `https://dudit.com.br/${cidadeUf}/${slug}`,
      type: 'website',
    }
  }
}

export default async function CityTermPage({ params }: Props) {
  const { cidadeUf, slug } = await params

  // Redirect legacy /sp/sao-paulo to /sao-paulo-sp
  if (cidadeUf.length === 2) {
    permanentRedirect(`/${slug}-${cidadeUf}`)
  }

  // Redirect invalid city to /explorar
  if (!isValidCitySlug(cidadeUf)) {
    redirect(`/explorar?q=${slug}`)
  }

  // Canonical lowercase redirect
  if (cidadeUf !== cidadeUf.toLowerCase() || slug !== slug.toLowerCase()) {
    permanentRedirect(`/${cidadeUf.toLowerCase()}/${slug.toLowerCase()}`)
  }

  const categoryName = CATEGORY_SLUG_MAP[slug]

  const overrideParams = {
    cidade: cidadeUf,
    ...(categoryName ? { categoria: slug } : { q: slug.replace(/-/g, ' ') }),
    type: "tudo" as const
  }

  return <ExplorarPage searchParams={Promise.resolve(overrideParams)} />
}
