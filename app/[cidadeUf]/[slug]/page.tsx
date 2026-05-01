import { Metadata } from 'next'
import { searchMarketplaceDirect } from '@/app/actions/marketplace/search'
import MarketplaceHeader from '@/components/marketplace/MarketplaceHeader'
import MarketplaceFooter from '@/components/marketplace/MarketplaceFooter'
import { ItemCard } from '@/components/marketplace/shared-components'
import Link from 'next/link'

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
      canonical: `https://dudit.com.br/${cidadeUf}/${slug}`,
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

  const cityFormatted = cidadeUf.split('-').slice(0, -1).join(' ').replace(/\b\w/g, l => l.toUpperCase())
  const stateFormatted = cidadeUf.split('-').pop()?.toUpperCase() || ''
  const termFormatted = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())

  // Busca real de SEO
  const query = `${slug.replace(/-/g, ' ')} ${cidadeUf}`
  const results = await searchMarketplaceDirect(query, 'tudo', { geral: 40 })

  return (
    <div className="bg-white min-h-screen font-sans text-brand-dark flex flex-col pt-[60px]">
      <MarketplaceHeader />

      <main className="container mx-auto px-4 py-8 flex-grow">
        <header className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            {termFormatted} em <span className="text-brand-primary">{cityFormatted} - {stateFormatted}</span>
          </h1>
          <p className="text-gray-600">
            Encontramos {results.length} resultado(s) local(is) para você na Dudit.
          </p>
        </header>

        {results.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {results.map((item: any) => {
              if (item.itemType === 'loja') {
                return (
                  <Link key={`loja-${item.id}`} href={`/${cidadeUf}/${item.slug || item.name.toLowerCase().replace(/ /g, '-')}/v/${item.id}`} prefetch={false} className="border border-brand-border p-4 rounded-xl flex flex-col items-center text-center hover:border-brand-green transition-colors group">
                    <img src={item.images?.[0] || 'https://img.dudit.com.br/static/Placeholder.png'} alt={item.name} className="w-20 h-20 rounded-full object-cover mb-4 shadow-sm" />
                    <h3 className="font-bold text-brand-dark truncate w-full group-hover:text-brand-green transition-colors">{item.name}</h3>
                    <p className="text-xs text-brand-inactive-text truncate w-full mb-4">{item.partners?.city} - {item.partners?.state}</p>
                    <span className="text-sm font-bold text-brand-green mt-auto uppercase tracking-wide">Explorar Loja</span>
                  </Link>
                )
              }
              return <ItemCard key={`${item.itemType}-${item.id}`} product={item} />
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <h2 className="text-2xl font-semibold mb-4">Nenhum resultado encontrado</h2>
            <p className="text-gray-500 mb-8 max-w-md">
              Ainda não temos parceiros para <strong>{termFormatted}</strong> em <strong>{cityFormatted}</strong>.
            </p>
          </div>
        )}
      </main>

      <MarketplaceFooter />
    </div>
  )
}
