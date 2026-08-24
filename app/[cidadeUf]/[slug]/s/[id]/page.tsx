import { redirect } from "next/navigation"
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
import { getPartnerPlan } from "@/lib/services/subscription.service"
import MarketplaceFooter from "@/components/marketplace/MarketplaceFooter"

export const dynamic = 'force-dynamic'
export const dynamicParams = true

export async function generateMetadata({ params }: { params: Promise<{ slug: string; cidadeUf: string; id: string }> }): Promise<Metadata> {
    const { id } = await params
    const service = await getMarketplaceService(id)

    if (!service) {
        return { title: 'Serviço não encontrado' }
    }

    const p = Array.isArray(service.partners) ? service.partners[0] : service.partners
    const address = p?.addresses?.[0] || {}
    const city = address?.city || "Brasil"

    const serviceUrl = `https://dudit.com.br${getServiceUrl(service)}`

    const title = `${service.name} - Agendar em ${city}`
    const description = `Agende ${service.name} em ${city}. Reserve online pela Dudit com horários disponíveis em tempo real!`

    return {
        title,
        description,
        alternates: { canonical: serviceUrl },
        openGraph: {
            title,
            description,
            url: serviceUrl,
            siteName: 'Dudit',
            images: [
                {
                    url: (service.images && service.images[0]) || p?.store_image_url || 'https://img.dudit.com.br/static/Logo.png',
                    width: 1200,
                    height: 630,
                    alt: `Agendar ${service.name} em ${city}`,
                },
            ],
            locale: 'pt_BR',
            type: 'website',
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            images: [(service.images && service.images[0]) || p?.store_image_url || 'https://img.dudit.com.br/static/Logo.png'],
        },
    }
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
        redirect("/")
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
        const isNewOneGeneric = correctUrl.includes('/vitrine/s/') || correctUrl.includes('/brasil/s/')
        if (!(isCurrentlyDetailed && isNewOneGeneric)) {
            redirect(correctUrl)
        }
    }

    // Fetch staff + reviews + partner plan in parallel
    const partner = Array.isArray(service.partners) ? service.partners[0] : service.partners
    const resolvedPartnerId = partner?.id || service.partner_id
    const [staff, reviews, detailAds, partnerPlan] = await Promise.all([
        getServiceStaffMembers(resolvedPartnerId, storeId),
        getServiceReviews(service.id, storeId),
        getSponsoredAdsForSlot("detail", {

            lat: userProfile?.latitude ?? null,
            lng: userProfile?.longitude ?? null,
            citySlug: currentCidadeUf,
            city: userProfile?.city ?? null,
            state: userProfile?.state ?? currentCidadeUf.split("-").pop()?.toUpperCase() ?? null,
        }),
        getPartnerPlan(resolvedPartnerId).catch(() => null),
    ])
    const detailAd = detailAds[0] ?? null
    const partnerPlanSlug = partnerPlan?.slug || "free"

    // Schema.org JSON-LD for Service
    const reviewCount = reviews?.length || 0
    const avgRating = reviewCount > 0
        ? (reviews.reduce((acc: number, cur: any) => acc + cur.rating, 0) / reviewCount).toFixed(1)
        : 5.0

    const schemaJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: service.name,
        description: service.description || `Serviço ${service.name} disponível para agendamento na Dudit.`,
        image: (service.images && service.images[0]) || partner?.store_image_url || 'https://img.dudit.com.br/static/Logo.png',
        provider: {
            '@type': 'LocalBusiness',
            name: partner?.store_name || 'Profissional Dudit',
            address: partner?.addresses?.[0] ? {
                '@type': 'PostalAddress',
                streetAddress: partner.addresses[0].street,
                addressLocality: partner.addresses[0].city,
                addressRegion: partner.addresses[0].state,
                postalCode: partner.addresses[0].zip_code,
                addressCountry: 'BR',
            } : undefined,
        },
        offers: {
            '@type': 'Offer',
            url: `https://dudit.com.br${getServiceUrl(service)}`,
            priceCurrency: 'BRL',
            price: service.price,
            availability: 'https://schema.org/InStock',
        },
        aggregateRating: reviewCount > 0 ? {
            '@type': 'AggregateRating',
            ratingValue: avgRating,
            reviewCount: reviewCount,
        } : undefined,
    }

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
                partnerPlanSlug={partnerPlanSlug}
            />

            <MarketplaceFooter />
        </div>
    )
}
