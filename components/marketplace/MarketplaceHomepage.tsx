"use client"

import { useState, useMemo } from "react"
import { MarketplaceHeader } from "./MarketplaceHeader"
import MarketplaceFooter from "./MarketplaceFooter"
import {
  HeroBanner,
  ProductCarousel,
  CategoryList,
  InfoSection
} from "./shared-components"

interface MarketplaceHomeProps {
  products: any[]
  user?: any
  userProfile?: any
  cartCount?: number
  hideHeaderAndFooter?: boolean
}

const TRENDS = [
  "Copos personalizados",
  "Esculturas",
  "Presentes de natal",
  "Bebê reborn",
  "Tapeçaria",
  "Terrário",
  "Papai noel",
]

export default function MarketplaceHome({ products = [], user, userProfile, cartCount, hideHeaderAndFooter }: MarketplaceHomeProps) {
  const [activeTrend, setActiveTrend] = useState(TRENDS[0])

  // useMemo: Prevent re-computation when activeTrend changes (products don't change)
  const displayProducts = useMemo(() => products.map((product) => {
    const hasOwnImages = product.images && product.images.length > 0
    const images = hasOwnImages ? product.images : (product.fallback_variant_image ? [product.fallback_variant_image] : product.images)
    const basePrice = Number(product.promotional_price || product.price)
    const price = (!product.promotional_price && product.fallback_variant_price) ? Number(product.fallback_variant_price) : basePrice

    return {
      id: product.id,
      name: product.name,
      price,
      originalPrice: product.promotional_price ? Number(product.price) : undefined,
      images,
      rating: product.rating,
      reviews: 0,
      partners: Array.isArray(product.partners) ? product.partners[0] : product.partners,
    }
  }), [products])

  const recentProducts = displayProducts.slice(0, 10)
  const alsoLikeProducts = displayProducts.slice(10, 20)

  // OSSR/Hydration error prevention strategy changed: we remove `if (!mounted) return null`
  // so the page content renders immediately. The user auth state is handled elsewhere.

  const content = (
    <div className="w-full bg-white flex-grow">
      <HeroBanner />

      {recentProducts.length > 0 && (
        <ProductCarousel
          title="Seus queridinhos estão aqui"
          products={recentProducts}
          seeMoreLink="/explorar"
          userCoords={userProfile?.latitude && userProfile?.longitude ? { lat: userProfile.latitude, lng: userProfile.longitude } : null}
        />
      )}

      {alsoLikeProducts.length > 0 && (
        <ProductCarousel
          title="Viu e ainda não levou?"
          products={alsoLikeProducts}
          seeMoreLink="/explorar"
          userCoords={userProfile?.latitude && userProfile?.longitude ? { lat: userProfile.latitude, lng: userProfile.longitude } : null}
        />
      )}

      <div className="container mx-auto px-4 lg:px-0 max-w-[1300px] mb-16">
        <div className="bg-[#dfff00] rounded-[20px] p-6 md:px-12 md:py-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
          <div className="text-center md:text-left">
            <h2 className="text-[#335a03] font-black text-3xl md:text-[40px] mb-1 tracking-tight leading-none">BLACK FRIDAY</h2>
            <p className="text-[#335a03] font-bold text-lg">Os melhores descontos do ano!</p>
          </div>
          <button
            className="bg-brand-green text-white font-bold py-3.5 px-8 rounded-full hover:bg-[#047857] transition-colors text-base shadow-sm"
          >
            Conferir ofertas
          </button>
        </div>
      </div>

      <CategoryList />

      <InfoSection />

      <section className="mx-auto mb-16 max-w-[1300px] px-4 lg:px-0">
        <h2 className="text-2xl md:text-[32px] font-bold text-gray-900 mb-6">Siga as tendências</h2>
        <div className="flex flex-wrap gap-3">
          {TRENDS.map((trend) => (
            <button
              key={trend}
              onClick={() => setActiveTrend(trend)}
              className={`px-6 py-2.5 border rounded-full font-semibold text-sm transition-colors ${activeTrend === trend
                ? "bg-brand-green text-white border-brand-green"
                : "border-gray-200 text-gray-600 hover:bg-brand-gray hover:border-gray-300"
                }`}
            >
              {trend}
            </button>
          ))}
        </div>
      </section>

      <section className="bg-[#fff3db] py-16 md:py-24 mb-0">
        <div className="mx-auto max-w-[1300px] px-4 flex flex-col md:flex-row items-center gap-12 md:gap-24">
          <div className="flex-1 md:max-w-[500px]">
            <h1 className="text-4xl md:text-[3.5rem] font-black text-brand-dark mb-6 leading-[1.1] tracking-tight">
              Pare de trabalhar para pagar comissão. Fique com o lucro.
            </h1>
            <p className="font-bold text-gray-800 text-lg mb-4">
              Chega de dar 20% da sua venda pros aplicativos e depender de algoritmos.
            </p>
            <p className="text-gray-600 text-base md:text-lg mb-8 leading-relaxed">
              Monte sua vitrine, organize seus clientes e venda direto, de graça. <br /><br />
              Não somos um marketplace mercenário. Aqui não tem taxa e o cliente é seu do começo ao fim.
            </p>
            <button className="bg-brand-green text-white font-bold py-3.5 px-8 rounded-full hover:bg-[#047857] transition-colors">
              Criar Conta Grátis e Vender Mais
            </button>
          </div>

          <div className="flex-1 relative h-[300px] md:h-[400px] w-full mt-8 md:mt-0">
            <div className="absolute top-0 left-0 w-[55%] md:w-[280px] aspect-[4/3] z-10 shadow-lg rounded-[16px] overflow-hidden border-4 border-white transform -rotate-2">
              <img src="https://img.elo7.com.br/elo7-assets/Jaque.DbUaCvDP.webp" className="w-full h-full object-cover" alt="Vitrine Local 1" loading="lazy" />
            </div>
            <div className="absolute top-[10%] right-0 w-[50%] md:w-[260px] aspect-[3/4] z-20 shadow-xl rounded-[16px] overflow-hidden border-4 border-white transform rotate-3">
              <img src="https://img.elo7.com.br/elo7-assets/Bolo_2.DbQJb_rC.webp" className="w-full h-full object-cover" alt="Vitrine Local 2" loading="lazy" />
            </div>
            <div className="absolute bottom-[-10%] left-[20%] w-[45%] md:w-[240px] aspect-square z-30 shadow-2xl rounded-[16px] overflow-hidden border-4 border-white transform -rotate-6">
              <img src="https://img.elo7.com.br/elo7-assets/Copo.Ch2n71m8.webp" className="w-full h-full object-cover" alt="Vitrine Local 3" loading="lazy" />
            </div>
          </div>
        </div>
      </section>
    </div>
  )

  if (hideHeaderAndFooter) {
    return content
  }

  return (
    <div className="bg-white min-h-screen font-sans text-[#003d32] flex flex-col pt-[110px] lg:pt-[108px]">
      {/* Header com setView opcional para evitar erros */}
      <MarketplaceHeader currentView="home" userProfile={userProfile} cartCount={cartCount} />

      {/* Espaçador para o Header Fixo */}
      <div className="pt-[50px]" />

      {content}

      <MarketplaceFooter />
    </div>
  )
}
