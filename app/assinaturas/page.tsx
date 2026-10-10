import { requireUser } from "@/lib/auth/authorization"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { MySubscriptionsClient } from "@/components/marketplace/MySubscriptionsClient"
import { getMyRecurringSubscriptionsAction } from "@/app/actions/marketplace/recurring-subscriptions"
import { getUserSessionData } from "@/lib/data/user"
import { InfoCard } from "@/components/reusable"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Minhas Assinaturas",
  description: "Acompanhe suas assinaturas recorrentes, entregas e créditos na Dudit",
}

export default async function MySubscriptionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string; subscription?: string }>
}) {
  const resolvedParams = await searchParams
  const user = await requireUser()
  if (!user) redirect("/auth/login")

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

  const initialSubscriptionId = resolvedParams?.view || resolvedParams?.subscription || null

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-dark-surface transition-colors duration-300">
      <main className="flex-1 w-full">
        {!result.success ? (
          <div className="container mx-auto px-4 max-w-[1400px] w-full pt-6 md:pt-10 pb-20 mt-[78px] lg:mt-[108px]">
            <InfoCard color="red" message={result.error || "Erro ao carregar suas assinaturas."} />
          </div>
        ) : (
          <MySubscriptionsClient
            subscriptions={result.data || []}
            initialSubscriptionId={initialSubscriptionId}
            userProfile={userProfile}
            cartCount={sessionData?.cartCount || 0}
            userId={user.id}
          />
        )}
      </main>

      <MarketplaceFooter />
    </div>
  )
}
