import { Metadata } from 'next'
import { getHomeDataByCity, resolveCityAndStateFromSlug } from '@/app/actions/marketplace/products'
import { getCurrentUser } from '@/lib/auth/authorization'
import { getUserSessionData } from '@/lib/data/user'
import { MarketplaceHeader } from '@/components/marketplace/MarketplaceHeader'
import MarketplaceFooter from '@/components/marketplace/MarketplaceFooter'
import MarketplaceHome from '@/components/marketplace/MarketplaceHomepage'
import { enrichMarketplaceDistance } from '@/lib/services/location.service'
import { redirect, permanentRedirect } from 'next/navigation'
import { isValidCitySlug } from '@/lib/validation/city'

export const revalidate = 86400 // Cache 24h

type Props = {
  params: Promise<{ cidadeUf: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cidadeUf } = await params

  const resolved = await resolveCityAndStateFromSlug(cidadeUf)
  const cityFormatted = resolved?.city || cidadeUf.split('-').slice(0, -1).join(' ').replace(/\b\w/g, l => l.toUpperCase())
  const stateFormatted = resolved?.state || cidadeUf.split('-').pop()?.toUpperCase() || ''

  return {
    title: `Dudit ${cityFormatted} - ${stateFormatted} | Serviços e Lojas Locais`,
    description: `Descubra as melhores lojas e profissionais em ${cityFormatted} (${stateFormatted}). Compare preços, agende serviços e compre direto sem taxas na Dudit.`,
    alternates: {
      canonical: `https://dudit.com.br/${cidadeUf.toLowerCase()}`,
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

  if (!isValidCitySlug(cidadeUf)) {
    const cleanSearch = cidadeUf.replace(/-[a-z]{2}$/i, '')
    redirect(`/explorar?q=${cleanSearch}`)
  }

  if (cidadeUf !== cidadeUf.toLowerCase()) {
    permanentRedirect(`/${cidadeUf.toLowerCase()}`)
  }

  // Resolve user info for layout & headers
  const user = await getCurrentUser()
  const sessionDataPromise = user
    ? getUserSessionData(user.id)
    : Promise.resolve(null)

  const sessionData = await sessionDataPromise
  const dbProfile = sessionData?.profile
  const cartCount = sessionData?.cartCount || 0

  // Resolve the capitalized city name and state from slug
  const resolved = await resolveCityAndStateFromSlug(cidadeUf)
  const cityName = resolved?.city || cidadeUf.split('-').slice(0, -1).join(' ').replace(/\b\w/g, l => l.toUpperCase())
  const state = resolved?.state || cidadeUf.split('-').pop()?.toUpperCase() || ''

  // Format user profile
  const userProfile = dbProfile
    ? {
      full_name: dbProfile.full_name,
      latitude: dbProfile.latitude,
      longitude: dbProfile.longitude,
      address: `${cityName} - ${state}`,
      city: cityName,
      state: state,
    }
    : {
      full_name: null,
      latitude: null,
      longitude: null,
      address: `${cityName} - ${state}`,
      city: cityName,
      state: state,
    }

  // Fetch products and vitrines located in this city
  const cityData = await getHomeDataByCity(cityName, state)
  const products = cityData.products
  const vitrines = cityData.vitrines

  const productsWithDistance = enrichMarketplaceDistance(products || [], userProfile?.latitude && userProfile?.longitude
    ? { lat: userProfile.latitude, lng: userProfile.longitude }
    : null)

  return (
    <div className="bg-white min-h-screen font-sans text-brand-dark flex flex-col pt-[110px] lg:pt-[108px]">
      <MarketplaceHeader currentView="home" userProfile={userProfile} cartCount={cartCount} />

      <MarketplaceHome
        products={productsWithDistance}
        vitrines={vitrines || []}
        user={user}
        userProfile={userProfile}
        cartCount={cartCount}
        selectedCitySlug={cidadeUf}
        selectedCityName={cityName}
        hideHeaderAndFooter={true}
      />

      <MarketplaceFooter />
    </div>
  )
}

