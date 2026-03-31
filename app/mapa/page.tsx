import { Metadata } from "next"
import { getCurrentUser } from "@/lib/auth/authorization"
import { getUserSessionData } from "@/lib/data/user"
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import { MapPageClient } from "@/components/map/MapPageClient"

export const metadata: Metadata = {
  title: "Mapa de Lojas e Parceiros",
  description: "Encontre as melhores lojas e parceiros Dudit próximos a você pelo mapa interativo.",
  alternates: {
      canonical: "https://dudit.com.br/mapa",
  },
}

export default async function MapaPage() {
  const user = await getCurrentUser()
  const sessionData = user ? await getUserSessionData(user.id) : null

  const userProfile = sessionData?.profile
      ? {
          full_name: sessionData.profile.full_name,
          address: sessionData.profile.city
              ? `${sessionData.profile.city} - ${sessionData.profile.state}`
              : null,
      }
      : null

  const cartCount = sessionData?.cartCount || 0

  return (
      <div className="bg-white min-h-screen font-sans flex flex-col pt-[110px] lg:pt-[108px] h-screen overflow-hidden">
          <MarketplaceHeader userProfile={userProfile} cartCount={cartCount} />
          
          <main className="flex-1 w-full relative flex">
             <MapPageClient initialUserLocation={userProfile?.address} />
          </main>
      </div>
  )
}
