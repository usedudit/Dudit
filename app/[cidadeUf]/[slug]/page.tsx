import { cache } from "react"
import type { Metadata } from 'next'
import { redirect, permanentRedirect, notFound } from 'next/navigation'
import { isValidCitySlug } from '@/lib/validation/city'
import { searchMarketplaceDirect } from '@/app/actions/marketplace/search'
import ExplorarPage from '@/app/explorar/[[...slug]]/page'
import { getStoreBySlug } from '@/app/actions/marketplace/stores'
import { buildStoreCitySlug } from '@/app/actions/marketplace/stores-utils'
import { StorePage, generateStoreMetadata } from './store-page'

const CATEGORY_SLUG_MAP: { [key: string]: string } = {
  "alimentacao": "Alimentação",
  "casa": "Casa",
  "tecnologia": "Tecnologia",
  "moda-e-beleza": "Moda e Beleza",
  "saude": "Saúde",
  "automotivo": "Automotivo",
  "pets": "Pets",
  "servicos": "Serviços",
  "outros": "Outros"
}

const revalidate = 86400

type Props = {
  params: Promise<{ cidadeUf: string; slug: string }>
}

function isStoreInCity(store: any, cidadeUf: string): boolean {
  const storeCitySlug = buildStoreCitySlug(store)
  if (!storeCitySlug) return true
  return storeCitySlug === cidadeUf.toLowerCase()
}

const getStoreForPage = cache(async (slug: string, cidadeUf: string) => {
  const store = await getStoreBySlug(slug)
  if (!store) return null
  if (!isStoreInCity(store, cidadeUf)) return null
  return store
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cidadeUf, slug } = await params

  if (!isValidCitySlug(cidadeUf) && cidadeUf.length !== 2) {
    return {
      title: "Página não encontrada | Dudit",
      robots: { index: false, follow: false },
    }
  }

  const store = await getStoreForPage(slug, cidadeUf)
  if (store) {
    return generateStoreMetadata(store, cidadeUf)
  }

  const cityFormatted = cidadeUf.split('-').slice(0, -1).join(' ').replace(/\b\w/g, l => l.toUpperCase())
  const stateFormatted = cidadeUf.split('-').pop()?.toUpperCase() || ''
  const termFormatted = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())

  const query = `${slug.replace(/-/g, ' ')} ${cidadeUf}`
  const results = await searchMarketplaceDirect(query, 'tudo', { geral: 1 })
  const hasResults = results && results.length > 0

  return {
    title: `Encontre ${termFormatted} em ${cityFormatted} - ${stateFormatted}`,
    description: `Resultados locais para ${termFormatted} na cidade de ${cityFormatted} (${stateFormatted}). Compare preços, veja avaliações e agende serviços locais sem taxas pela Dudit.`,
    robots: {
      index: hasResults,
      follow: true,
    },
    alternates: {
      canonical: `https://dudit.com.br/${cidadeUf.toLowerCase()}/${slug.toLowerCase()}`,
    },
    openGraph: {
      title: `${termFormatted} em ${cityFormatted}`,
      description: `Compre ou agende ${termFormatted} em ${cityFormatted} de forma rápida e segura.`,
      url: `https://dudit.com.br/${cidadeUf}/${slug}`,
      type: 'website',
    }
  }
}

export default async function CityTermPage({ params }: Props) {
  const { cidadeUf, slug } = await params

  if (cidadeUf.length === 2) {
    permanentRedirect(`/${slug}-${cidadeUf}`)
  }

  if (!isValidCitySlug(cidadeUf)) {
    if (cidadeUf.includes('.') || slug.includes('.')) {
      notFound()
    }
    redirect(`/explorar?q=${slug}`)
  }

  if (cidadeUf !== cidadeUf.toLowerCase() || slug !== slug.toLowerCase()) {
    permanentRedirect(`/${cidadeUf.toLowerCase()}/${slug.toLowerCase()}`)
  }

  const store = await getStoreForPage(slug, cidadeUf)
  if (store) {
    return <StorePage storeData={store} />
  }

  const categoryName = CATEGORY_SLUG_MAP[slug]

  const overrideParams = {
    slug: [cidadeUf, categoryName ? slug : ""].filter(Boolean)
  }

  const overrideSearchParams = {
    ...(categoryName ? {} : { q: slug.replace(/-/g, ' ') }),
    type: "tudo" as const
  }

  return <ExplorarPage params={Promise.resolve(overrideParams)} searchParams={Promise.resolve(overrideSearchParams)} />
}
