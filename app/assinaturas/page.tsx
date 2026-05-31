import { requireUser } from "@/lib/auth/authorization"
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { MySubscriptionsClient } from "@/components/marketplace/MySubscriptionsClient"
import { getMyRecurringSubscriptionsAction } from "@/app/actions/marketplace/recurring-subscriptions"
import { getUserSessionData } from "@/lib/data/user"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function MySubscriptionsPage() {
  const user = await requireUser()
  if (!user) redirect("/login")

  const [result, sessionData] = await Promise.all([
    getMyRecurringSubscriptionsAction(),
    getUserSessionData(user.id),
  ])

  const userProfile = sessionData?.profile
    ? {
      full_name: sessionData.profile.full_name,
      address: sessionData.profile.city
        ? `${sessionData.profile.city} - ${sessionData.profile.state}`
        : null,
    }
    : null

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-dark-surface transition-colors duration-300">
      <MarketplaceHeader simpleTitle="Minhas Assinaturas" userProfile={userProfile} cartCount={sessionData?.cartCount || 0} />

      <main className="flex-1 container mx-auto px-4 max-w-[900px] w-full pt-6 md:pt-10 pb-20 mt-[78px] lg:mt-[108px]">
        <h1 className="text-2xl font-bold mb-6">Minhas Assinaturas</h1>
        {!result.success ? (
          <p className="text-red-600">{result.error}</p>
        ) : (
          <MySubscriptionsClient subscriptions={result.data || []} />
        )}
      </main>

      <MarketplaceFooter />
    </div>
  )
}
