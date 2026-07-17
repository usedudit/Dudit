import { cache } from "react"
import type { Metadata } from 'next'
import { redirect, permanentRedirect, notFound } from 'next/navigation'
import { isValidCitySlug } from '@/lib/validation/city'
import { searchMarketplaceDirect } from '@/app/actions/marketplace/search'
import ExplorarPage from '@/app/explorar/[[...slug]]/page'
import { getStoreBySlug, buildStoreCitySlug } from '@/app/actions/marketplace/stores'
import { StorePage, generateStoreMetadata } from './store-page'

const CATEGORY_SLUG_MAP: { [key: string]: string } = {
  "casa-e-utilidades": "Casa & Utilidades",
  "moda-e-beleza": "Moda & Beleza",
  "saude-e-bem-estar": "Saúde & Bem-estar",
  "tecnologia-e-eletronicos": "Tecnologia & Eletrônicos",
  "auto-e-moto": "Auto & Moto",
  "pets": "Pets",
  "construcao-e-ferramentas": "Construção & Ferramentas",
  "agro-e-jardim": "Agro & Jardim",
  "infantil-e-brinquedos": "Infantil & Brinquedos"
}

const revalidate = 86400

type Props = {
  params: Promise<{ cidadeUf: string; slug: string }>
}

function parseCidadeUf(cidadeUf: string): { state: string; citySlug: string } {
  const parts = cidadeUf.split("-")
  const state = parts.pop()?.toUpperCase() || ""
  const citySlug = parts.join("-")
  return { state, citySlug }
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

  if (cidadeUf.length === 2) {
    permanentRedirect(`/${slug}-${cidadeUf}`)
  }

  if (!isValidCitySlug(cidadeUf)) {
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
