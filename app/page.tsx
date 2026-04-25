import MarketplaceHome from "@/components/marketplace/MarketplaceHomepage"
import { getCachedHomeProducts } from "@/app/actions/marketplace/products"
import { getCurrentUser } from "@/lib/auth/authorization"
import { getUserSessionData } from "@/lib/data/user"
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import MarketplaceFooter from "@/components/marketplace/MarketplaceFooter"
import { Suspense } from "react"
import { ThreeDotsLoader } from "@/components/reusable"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Dudit: Pare de Perder Pedidos no WhatsApp | Venda na Cidade",
    description: "Cansado do caos no WhatsApp? Na Dudit você organiza pedidos, não paga taxas abusivas e encontra produtos ou serviços na sua cidade em um só lugar.",
    openGraph: {
        title: "Dudit: Pare de Perder Pedidos no WhatsApp | Venda na Cidade",
        description: "Cansado do caos no WhatsApp? Na Dudit você organiza pedidos, não paga taxas abusivas e encontra produtos ou serviços na sua cidade em um só lugar.",
        url: "https://dudit.com.br",
        siteName: "Dudit",
        images: [
            {
                url: "https://img.dudit.com.br/static/Icon.png",
                width: 512,
                height: 512,
            },
        ],
        locale: "pt_BR",
        type: "website",
    }
}

async function ProductFeedWrapper({ user, userProfile, cartCount }: any) {
  const t0 = performance.now()
  console.log(`[SSR] Home (Feed Payload) | START`)

  const products = await getCachedHomeProducts()

  const tEnd = performance.now()
  console.log(`[SSR] Home (Feed Payload) | END | Time: ${(tEnd - t0).toFixed(2)}ms`)

  return (
    <MarketplaceHome
      products={products}
      user={user}
      userProfile={userProfile}
      cartCount={cartCount}
      hideHeaderAndFooter={true}
    />
  )
}

export default async function HomePage() {
  const tStart = performance.now()
  console.log(`[SSR] Home (Page) | START at ${new Date().toISOString()}`)

  // Fetches required for the header
  const user = await getCurrentUser()
  const tUser = performance.now()
  console.log(`[SSR] Home (Page) | User resolved in ${(tUser - tStart).toFixed(2)}ms`)

  const sessionDataPromise = user
    ? getUserSessionData(user.id)
    : Promise.resolve(null)

  const sessionData = await sessionDataPromise
  const tSession = performance.now()
  console.log(`[SSR] Home (Page) | Session resolved in ${(tSession - tUser).toFixed(2)}ms`)

  const userProfile = sessionData?.profile
    ? {
      full_name: sessionData.profile.full_name,
      address: sessionData.profile.city
        ? `${sessionData.profile.city} - ${sessionData.profile.state}`
        : null,
    }
    : null

  const cartCount = sessionData?.cartCount || 0

  const tEnd = performance.now()
  console.log(`[SSR] Home (Header) | END | Total Time: ${(tEnd - tStart).toFixed(2)}ms | User: ${!!user}`)

  return (
    <div className="bg-white min-h-screen font-sans text-brand-dark flex flex-col pt-[110px] lg:pt-[108px]">
      <MarketplaceHeader currentView="home" userProfile={userProfile} cartCount={cartCount} />

      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-[50vh] w-full pt-10">
            <ThreeDotsLoader />
          </div>
        }
      >
        <ProductFeedWrapper
          user={user}
          userProfile={userProfile}
          cartCount={cartCount}
        />
      </Suspense>

      <MarketplaceFooter />
    </div>
  )
}