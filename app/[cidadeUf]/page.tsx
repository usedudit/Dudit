import { Metadata } from 'next'
import { searchMarketplaceDirect } from '@/app/actions/marketplace/search'
import MarketplaceHeader from '@/components/marketplace/MarketplaceHeader'
import MarketplaceFooter from '@/components/marketplace/MarketplaceFooter'
import { ItemCard } from '@/components/marketplace/shared-components'
import Link from 'next/link'

export const revalidate = 86400 // Cache 24h

type Props = {
  params: Promise<{ cidadeUf: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cidadeUf } = await params

  const cityFormatted = cidadeUf.split('-').slice(0, -1).join(' ').replace(/\b\w/g, l => l.toUpperCase())
  const stateFormatted = cidadeUf.split('-').pop()?.toUpperCase() || ''

  return {
    title: `Dudit ${cityFormatted} - ${stateFormatted} | Serviços e Lojas Locais`,
    description: `Descubra as melhores lojas e profissionais em ${cityFormatted} (${stateFormatted}). Compare preços, agende serviços e compre direto sem taxas na Dudit.`,
    alternates: {
      canonical: `https://dudit.com.br/${cidadeUf}`,
    },
    openGraph: {
      title: `Dudit ${cityFormatted} | Lojas e Serviços Locais`,
      description: `Compre e agende serviços locais de forma rápida e segura na cidade de ${cityFormatted}.`,
      url: `https://dudit.com.br/${cidadeUf}`,
      type: 'website',
    }
  }
}

export default async function CityPage({ params }: Props) {
  const { cidadeUf } = await params

  const cityFormatted = cidadeUf.split('-').slice(0, -1).join(' ').replace(/\b\w/g, l => l.toUpperCase())
  const stateFormatted = cidadeUf.split('-').pop()?.toUpperCase() || ''

  // Busca lojas e produtos em destaque na cidade
  const query = `${cidadeUf}` // A FTS busca pela cidade através do '-sp' (estado) e fuzzy na cidade
  const results = await searchMarketplaceDirect(query, 'tudo', { geral: 12 })

  // Termos populares (Mock para SEO / Exemplo de links úteis)
  const popularTerms = ['encanador', 'eletricista', 'manicure', 'arroz', 'supermercado', 'mecanico']

  return (
    <div className="bg-white min-h-screen font-sans text-brand-dark flex flex-col pt-[60px]">
      <MarketplaceHeader />

      <main className="container mx-auto px-4 py-8 flex-grow">
        <header className="mb-12 text-center max-w-2xl mx-auto">
          <h1 className="text-4xl font-extrabold mb-4">
            Serviços e Produtos em <span className="text-brand-primary">{cityFormatted} - {stateFormatted}</span>
          </h1>
          <p className="text-lg text-gray-600">
            Conecte-se com os melhores profissionais e comércios locais sem pagar taxas intermediárias.
          </p>
        </header>

        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Buscas Populares em {cityFormatted}</h2>
          <div className="flex flex-wrap gap-3">
            {popularTerms.map(term => (
              <Link
                key={term}
                href={`/${cidadeUf}/${term}`}
                className="px-4 py-2 bg-gray-100 hover:bg-brand-primary hover:text-white rounded-full transition-colors font-medium capitalize"
              >
                {term}
              </Link>
            ))}
          </div>
        </section>

        <section>
          <div className="flex justify-between items-end mb-6">
            <h2 className="text-2xl font-bold">Destaques Locais</h2>
            <Link href={`/explorar?cidade=${cidadeUf}`} className="text-brand-primary font-semibold hover:underline">
              Ver tudo
            </Link>
          </div>

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
            <div className="bg-gray-50 rounded-xl p-8 text-center border border-gray-100">
              <p className="text-gray-500">
                Estamos expandindo em {cityFormatted}. Em breve mais parceiros disponíveis!
              </p>
            </div>
          )}
        </section>
      </main>

      <MarketplaceFooter />
    </div>
  )
}
