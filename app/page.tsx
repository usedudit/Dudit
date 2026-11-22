import MarketplaceHome from "@/components/marketplace/MarketplaceHomepage"
import { getHomeSections, type HomeSection } from "@/app/actions/marketplace/discover"
import { resolveCityAndStateFromSlug } from "@/app/actions/marketplace/products"
import { getCurrentUser } from "@/lib/auth/authorization"
import { getMarketplaceHomeSessionData } from "@/lib/data/user"
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import MarketplaceFooter from "@/components/marketplace/MarketplaceFooter"
import { Suspense } from "react"
import type { Metadata } from "next"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import { getSponsoredAdsForSlot } from "@/app/actions/marketplace/ads"
import type { SponsoredAd } from "@/lib/ads/types"
import { cookies } from "next/headers"
import { ESTADO_MAP } from "@/components/marketplace/explorar-constants"

export const metadata: Metadata = {
    title: "Dudit | Descubra. Anuncie. Organize.",
    description: "Descubra produtos e serviços perto de você ou compre de pequenos negócios que enviam para todo o Brasil com 0% de comissão. Plataforma de vendas e gestão para pessoas físicas, autônomos e empresas.",
    openGraph: {
        title: "Dudit | Descubra. Anuncie. Organize.",
        description: "Descubra produtos e serviços perto de você ou compre de pequenos negócios que enviam para todo o Brasil com 0% de comissão. Plataforma de vendas e gestão para pessoas físicas, autônomos e empresas.",
        url: "https://dudit.com.br",
        siteName: "Dudit",
        images: [
            {
                url: "https://img.dudit.com.br/static/og-image.png",
                width: 1200,
                height: 400,
            },
        ],
        locale: "pt_BR",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        site: "@dudit",
        creator: "@dudit",
        title: "Dudit | Descubra. Anuncie. Organize.",
        description: "Descubra produtos e serviços perto de você ou compre de lojas que enviam para todo o Brasil com 0% de comissão.",
        images: ["https://img.dudit.com.br/static/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br",
    },
    keywords: [
        "comprar online brasil",
        "produtos perto de mim",
        "lojas que entregam no brasil",
        "sistema de vendas sem taxa",
        "servicos na minha cidade",
        "comercio local brasil",
        "catalogo online gratis",
        "dudit",
    ],
}

async function ProductFeedWrapper({ user, userProfile, cartCount, citySlug, cityName, savedCitySlug }: any) {
    let sections: HomeSection[] = []
    let homeAds: SponsoredAd[] = []
    let displayCityName: string | null = cityName

    if (cityName && citySlug) {
        const state = citySlug.split("-").pop()?.toUpperCase() || ""
        const isDefaultSP = citySlug === "sao-paulo-sp" && cityName === "Estado de São Paulo"
        const isCountryScope = citySlug === "brasil" || cityName === "Brasil" || isDefaultSP
        const isStateScope = citySlug.startsWith("estado-")

        const matchesSavedAddress = Boolean(savedCitySlug && savedCitySlug === citySlug)

        const coords = matchesSavedAddress && userProfile?.latitude && userProfile?.longitude
            ? { lat: userProfile.latitude, lng: userProfile.longitude }
            : null

        const scope = isCountryScope ? "country" : (isStateScope ? "state" : "city")

        // Scope display values
        const ctxCity = scope === "country" ? "Brasil" : cityName
        const ctxState = scope === "country" ? "BR" : (isStateScope ? citySlug.replace("estado-", "").toUpperCase() : state)
        const ctxStateOnly = isStateScope

        displayCityName = ctxCity

        const [sectionsResult, adsResult] = await Promise.all([
            getHomeSections({
                city: ctxCity,
                state: ctxState,
                stateOnly: ctxStateOnly,
                citySlug,
                coords,
                userId: user?.id ?? null,
                scope,
            }),
            getSponsoredAdsForSlot("home", {
                lat: userProfile?.latitude ?? null,
                lng: userProfile?.longitude ?? null,
                citySlug,
                city: ctxCity,
                state: ctxState,
            }),
        ])

        sections = sectionsResult
        homeAds = adsResult
    }

    return (
        <MarketplaceHome
            sections={sections}
            user={user}
            userProfile={userProfile}
            cartCount={cartCount}
            selectedCitySlug={citySlug}
            selectedCityName={displayCityName}
            hideHeaderAndFooter={true}
            homeAds={homeAds}
        />
    )
}

function HomeFeedSkeleton() {
    return (
        <div className="w-full bg-white flex-grow dark:bg-dark-surface">
            <section className="mt-4 sm:mt-6 mb-8 sm:mb-12 px-4 lg:px-0 flex justify-center w-full">
                <div className="w-full max-w-[1400px] rounded-xl lg:rounded-2xl bg-gray-100 animate-pulse aspect-[1400/300] dark:bg-dark-border/50 shadow-xs" />
            </section>
            <div className="mx-auto max-w-[1400px] px-4 xl:px-0 space-y-10 pb-12">
                <div className="space-y-4">
                    <div className="h-6 w-48 bg-gray-200 rounded animate-pulse dark:bg-dark-border" />
                    <div className="flex gap-4 overflow-hidden">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="w-[150px] md:w-[230px] shrink-0 space-y-3">
                                <div className="w-full aspect-square bg-gray-100 rounded-2xl animate-pulse dark:bg-dark-border/50" />
                                <div className="h-4 bg-gray-100 rounded w-3/4 animate-pulse dark:bg-dark-border/50" />
                                <div className="h-4 bg-gray-100 rounded w-1/2 animate-pulse dark:bg-dark-border/50" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default async function HomePage() {
    // Fetches required for the header
    const user = await getCurrentUser()

    const sessionDataPromise = user
        ? getMarketplaceHomeSessionData(user.id)
        : Promise.resolve(null)

    const sessionData = await sessionDataPromise
    const dbProfile = sessionData?.profile

    // Resolve city selection:
    // 1. Explicit city cookie (user selected a city or used current location) takes priority.
    // 2. For authenticated users without an explicit override cookie, use their default address.
    // 3. Fallback to default state SP (Brasil scope).
    let citySlug: string | null = null
    let cityName: string | null = null

    const cookieStore = await cookies()
    const cookieCity = cookieStore.get("dudit_city")?.value

    if (cookieCity === "brasil") {
        citySlug = "brasil"
        cityName = "Brasil"
    } else if (cookieCity?.startsWith("estado-")) {
        const uf = cookieCity.replace("estado-", "").toLowerCase()
        citySlug = cookieCity
        cityName = ESTADO_MAP[uf] || `Estado de ${uf.toUpperCase()}`
    } else if (cookieCity) {
        const resolved = await resolveCityAndStateFromSlug(cookieCity)
        if (resolved) {
            citySlug = cookieCity
            cityName = resolved.city
        }
    }

    const savedCitySlug = dbProfile?.city && dbProfile?.state
        ? `${dbProfile.city
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")}-${dbProfile.state.toLowerCase()}`
        : null

    if ((!citySlug || !cityName) && dbProfile?.city && dbProfile?.state && savedCitySlug) {
        cityName = dbProfile.city
        citySlug = savedCitySlug
    }

    let isDefaultStateSP = false
    if (!citySlug || !cityName) {
        citySlug = "sao-paulo-sp"
        cityName = "Estado de São Paulo"
        isDefaultStateSP = true
    }

    const resolvedHeaderAddress = cityName && citySlug
        ? (isDefaultStateSP || citySlug === "brasil"
            ? "Brasil"
            : (citySlug.startsWith("estado-")
                ? cityName
                : `${cityName} - ${citySlug.split("-").pop()?.toUpperCase()}`))
        : (dbProfile?.city ? `${dbProfile.city} - ${dbProfile.state}` : null)

    const resolvedHeaderState = citySlug === "brasil" || isDefaultStateSP
        ? "BR"
        : (citySlug?.startsWith("estado-")
            ? citySlug.replace("estado-", "").toUpperCase()
            : (citySlug ? citySlug.split("-").pop()?.toUpperCase() : dbProfile?.state) || null)

    let userProfile = dbProfile
        ? {
            full_name: dbProfile.full_name,
            latitude: dbProfile.latitude,
            longitude: dbProfile.longitude,
            address: resolvedHeaderAddress,
            city: (isDefaultStateSP || citySlug === "brasil") ? "Brasil" : (cityName || dbProfile.city || null),
            state: resolvedHeaderState,
        }
        : (cityName && citySlug ? {
            full_name: null,
            latitude: null,
            longitude: null,
            address: resolvedHeaderAddress,
            city: (isDefaultStateSP || citySlug === "brasil") ? "Brasil" : cityName,
            state: resolvedHeaderState,
        } : null)

    const cartCount = sessionData?.cartCount || 0

    const homeJsonLd = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Dudit",
        url: "https://dudit.com.br",
        description: "Encontre produtos e serviços locais e compre de lojas que enviam para todo o Brasil com 0% de comissão.",
        potentialAction: {
            "@type": "SearchAction",
            target: {
                "@type": "EntryPoint",
                urlTemplate: "https://dudit.com.br/explorar?q={search_term_string}",
            },
            "query-input": "required name=search_term_string",
        },
    }

    return (
        <div className="bg-white min-h-screen font-sans text-brand-dark flex flex-col pt-[80px] lg:pt-[108px] dark:bg-dark-background dark:text-dark-heading overflow-x-clip">
            <h1 className="sr-only">
                Dudit | Compre perto de você e receba de qualquer lugar do Brasil com 0% de comissão
            </h1>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(homeJsonLd) }}
            />
            <MarketplaceHeader currentView="home" userProfile={userProfile} cartCount={cartCount} />

            <Suspense fallback={<HomeFeedSkeleton />}>
                <ProductFeedWrapper
                    user={user}
                    userProfile={userProfile}
                    cartCount={cartCount}
                    citySlug={citySlug}
                    cityName={cityName}
                    savedCitySlug={savedCitySlug}
                />
            </Suspense>

            <MarketplaceFooter />
        </div>
    )
}
