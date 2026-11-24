import { notFound, permanentRedirect } from "next/navigation"
import type { Metadata } from 'next'
import { ServiceDetailsPageClient } from "@/components/marketplace/ServiceDetailsPage"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import {
    getMarketplaceService,
    getServiceStaffMembers,
    getServiceReviews,
} from "@/app/actions/marketplace/services"
import { getServiceUrl } from "@/lib/utils/url-generator"
import { getCurrentUser } from "@/lib/auth/authorization"
import { getUserSessionData } from "@/lib/data/user"
import { getSponsoredAdsForSlot } from "@/app/actions/marketplace/ads"
import { resolveMarketplaceCapabilities } from "@/lib/marketplace-capabilities"
import { buildServiceSeo } from "@/lib/seo/catalog-seo"
import MarketplaceFooter from "@/components/marketplace/MarketplaceFooter"

export const dynamic = 'force-dynamic'
export const dynamicParams = true

export async function generateMetadata({ params }: { params: Promise<{ slug: string; cidadeUf: string; id: string }> }): Promise<Metadata> {
    const { id } = await params
    const service = await getMarketplaceService(id)

    if (!service) {
        return {
            title: 'Serviço não encontrado',
            robots: { index: false, follow: true },
        }
    }

    const p = Array.isArray(service.partners) ? service.partners[0] : service.partners
    const storeObj = Array.isArray(service.stores) ? service.stores[0] : service.stores
    const address = p?.addresses?.[0] || storeObj?.addresses?.[0] || p?.address || storeObj?.address || p || {}
    const city = address?.city || service.store_city || storeObj?.city || "Brasil"

    const serviceUrl = `https://dudit.com.br${getServiceUrl(service)}`

    const { metadata } = buildServiceSeo({
        service,
        city,
        serviceUrl,
    })

    return metadata
}

export default async function ServiceDetailsPage({
    params,
}: {
    params: Promise<{ slug: string; cidadeUf: string; id: string }>
}) {
    const { id, slug: currentSlug, cidadeUf: currentCidadeUf } = await params

    const [user, service] = await Promise.all([
        getCurrentUser(),
        getMarketplaceService(id),
    ])

    if (!service) {
        notFound()
    }

    const storeId = service.store_id || null
    const sessionData = user ? await getUserSessionData(user.id) : null
    const userProfile = sessionData?.profile ? {
        full_name: sessionData.profile.full_name,
        address: sessionData.profile.city ? `${sessionData.profile.city} - ${sessionData.profile.state}` : null,
        latitude: sessionData.profile.latitude,
        longitude: sessionData.profile.longitude,
        city: sessionData.profile.city,
        state: sessionData.profile.state,
        avatar_url: sessionData.profile.avatar_url || null,
    } : null
    const cartCount = sessionData?.cartCount || 0

    // Canonical URL redirect
    const correctUrl = getServiceUrl(service)
    const currentPath = `/${currentCidadeUf}/${currentSlug}/s/${id}`
    if (currentPath !== correctUrl) {
        const isCurrentlyDetailed = currentCidadeUf !== 'vitrine' && currentCidadeUf !== 'brasil'
        const isNewOneGeneric = correctUrl.startsWith('/vitrine/') || correctUrl.startsWith('/brasil/')
        if (!(isCurrentlyDetailed && isNewOneGeneric)) {
            permanentRedirect(correctUrl)
        }
    }

    // Fetch staff + reviews + capabilities in parallel
    const partner = Array.isArray(service.partners) ? service.partners[0] : service.partners
    const resolvedPartnerId = partner?.id || service.partner_id
    const [staff, reviews, detailAds, capabilities] = await Promise.all([
        getServiceStaffMembers(resolvedPartnerId, storeId),
        getServiceReviews(service.id, storeId),
        getSponsoredAdsForSlot("detail", {

            lat: userProfile?.latitude ?? null,
            lng: userProfile?.longitude ?? null,
            citySlug: currentCidadeUf,
            city: userProfile?.city ?? null,
            state: userProfile?.state ?? currentCidadeUf.split("-").pop()?.toUpperCase() ?? null,
        }),
        resolvedPartnerId
            ? resolveMarketplaceCapabilities(resolvedPartnerId, { storeId })
            : Promise.resolve(null),
    ])
    const detailAd = detailAds[0] ?? null

    const p = Array.isArray(service.partners) ? service.partners[0] : service.partners
    const storeObj = Array.isArray(service.stores) ? service.stores[0] : service.stores
    const address = p?.addresses?.[0] || storeObj?.addresses?.[0] || p?.address || storeObj?.address || p || {}
    const city = address?.city || service.store_city || storeObj?.city || "Brasil"

    const { schemaJsonLd } = buildServiceSeo({
        service,
        city,
        serviceUrl: `https://dudit.com.br${correctUrl}`,
        reviews: reviews || [],
    })

    return (
        <div className="bg-white min-h-screen font-sans text-brand-dark flex flex-col">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(schemaJsonLd) }}
            />

            <ServiceDetailsPageClient
                service={service}
                staff={staff || []}
                reviews={reviews || []}
                currentUserId={user?.id || null}
                userProfile={userProfile}
                cartCount={cartCount}
                sponsoredAd={detailAd}
                quotesViaDudit={capabilities?.quotesViaDudit ?? false}
                appointmentsViaDudit={capabilities?.appointmentsViaDudit ?? false}
                quotesOpen={capabilities?.quotesOpen ?? false}
                appointmentsOpen={capabilities?.appointmentsOpen ?? false}
                checkoutOpen={capabilities?.checkoutOpen ?? false}
                whatsappPhone={capabilities?.whatsappPhone ?? null}
                orderFlow={capabilities?.baseOrderFlow ?? "dudit"}
            />

            <MarketplaceFooter />
        </div>
    )
}
