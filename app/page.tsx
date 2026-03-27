import MarketplaceHome from "@/components/marketplace/MarketplaceHomepage"
import { getCachedHomeProducts } from "@/app/actions/marketplace/products"
import { getCurrentUser } from "@/lib/auth/authorization"
import { getUserSessionData } from "@/lib/data/user"
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import MarketplaceFooter from "@/components/marketplace/MarketplaceFooter"
import { Suspense } from "react"

async function ProductFeedWrapper({ productsPromise, user, userProfile, cartCount }: any) {
  const t0 = performance.now()

  const products = await productsPromise

  const tEnd = performance.now()
  console.log(`[SSR] Home (Feed Payload) | Time: ${(tEnd - t0).toFixed(2)}ms`)

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
  const t0 = performance.now()

  // 🔥 roda em paralelo
  const userPromise = getCurrentUser()
  const productsPromise = getCachedHomeProducts()

  const user = await userPromise

  const sessionDataPromise = user
    ? getUserSessionData(user.id)
    : Promise.resolve(null)

  const sessionData = await sessionDataPromise

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
  console.log(`[SSR] Home (Header) | Time: ${(tEnd - t0).toFixed(2)}ms | User: ${!!user}`)

  return (
    <div className="bg-white min-h-screen font-sans text-brand-dark flex flex-col pt-[110px] lg:pt-[108px]">
      <MarketplaceHeader currentView="home" userProfile={userProfile} cartCount={cartCount} />

      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-[50vh] w-full pt-10">
            <div className="w-10 h-10 border-4 border-brand-green/30 border-t-brand-green rounded-full animate-spin" />
          </div>
        }
      >
        <ProductFeedWrapper
          productsPromise={productsPromise}
          user={user}
          userProfile={userProfile}
          cartCount={cartCount}
        />
      </Suspense>

      <MarketplaceFooter />
    </div>
  )
}