import { redirect } from "next/navigation"
import type { Metadata } from 'next'
import { PlanDetailsPageClient } from "@/components/marketplace/PlanDetailsPage"
import { getMarketplaceRecurringPlanAction } from "@/app/actions/marketplace/recurring-subscriptions"
import { getPlanUrl } from "@/lib/utils/url-generator"
import { getCurrentUser } from "@/lib/auth/authorization"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import { getUserSessionData } from "@/lib/data/user"
import MarketplaceFooter from "@/components/marketplace/MarketplaceFooter"

export const dynamic = 'force-dynamic'
export const dynamicParams = true

export async function generateMetadata({ params }: { params: Promise<{ slug: string; cidadeUf: string; id: string }> }): Promise<Metadata> {
    const { id } = await params
    const plan = await getMarketplaceRecurringPlanAction(id)

    if (!plan) {
        return { title: 'Assinatura não encontrada' }
    }

    const p = plan.partners || {}
    const address = p?.addresses?.[0] || {}
    const city = address?.city || "Brasil"

    const planUrl = `https://dudit.com.br${getPlanUrl(plan)}`

    const title = `${plan.name} | Assinatura em ${city}`
    const description = `${plan.description || `Assine ${plan.name} em ${city}. Cancele a qualquer momento na Dudit!`}`

    const imgUrl = (plan.images && plan.images[0]) || p?.store_image_url || 'https://img.dudit.com.br/static/Logo.png'

    return {
        title,
        description,
        alternates: { canonical: planUrl },
        openGraph: {
            title,
            description,
            url: planUrl,
            siteName: 'Dudit',
            images: [
                {
                    url: imgUrl,
                    width: 1200,
                    height: 630,
                    alt: `Assinatura ${plan.name} em ${city}`,
                },
            ],
            locale: 'pt_BR',
            type: 'website',
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            images: [imgUrl],
        },
    }
}

export default async function PlanDetailsPage({
    params,
}: {
    params: Promise<{ slug: string; cidadeUf: string; id: string }>
}) {
    const { id, slug: currentSlug, cidadeUf: currentCidadeUf } = await params

    const [user, plan] = await Promise.all([
        getCurrentUser(),
        getMarketplaceRecurringPlanAction(id),
    ])

    if (!plan) {
        redirect("/")
    }

    const sessionData = user ? await getUserSessionData(user.id) : null
    const userProfile = sessionData?.profile ? {
        full_name: sessionData.profile.full_name,
        address: sessionData.profile.city ? `${sessionData.profile.city} - ${sessionData.profile.state}` : null,
        avatar_url: sessionData.profile.avatar_url || null
    } : null
    const cartCount = sessionData?.cartCount || 0

    // Canonical URL redirect
    const correctUrl = getPlanUrl(plan)
    const currentPath = `/${currentCidadeUf}/${currentSlug}/sub/${id}`
    if (currentPath !== correctUrl) {
        const isCurrentlyDetailed = currentCidadeUf !== 'vitrine' && currentCidadeUf !== 'brasil'
        const isNewOneGeneric = correctUrl.includes('/vitrine/sub/') || correctUrl.includes('/brasil/sub/')
        if (!(isCurrentlyDetailed && isNewOneGeneric)) {
            redirect(correctUrl)
        }
    }

    const partner = plan.partners || {}

    // Schema.org JSON-LD for Product/Service/Plan
    const schemaJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: plan.name,
        description: plan.description || `Plano de assinatura ${plan.name} disponível na Dudit.`,
        image: (plan.images && plan.images[0]) || partner?.store_image_url || 'https://img.dudit.com.br/static/Logo.png',
        offers: {
            '@type': 'AggregateOffer',
            url: `https://dudit.com.br${getPlanUrl(plan)}`,
            priceCurrency: 'BRL',
            lowPrice: plan.price,
            highPrice: plan.price,
            offerCount: '1',
        },
    }

    return (
        <div className="bg-white min-h-screen font-sans text-brand-dark flex flex-col">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(schemaJsonLd) }}
            />

            <PlanDetailsPageClient
                plan={plan}
                currentUserId={user?.id || null}
                userProfile={userProfile}
                cartCount={cartCount}
            />

            <MarketplaceFooter />
        </div>
    )
}
