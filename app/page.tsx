import MarketplaceHome from "@/components/marketplace/MarketplaceHomepage"
import { getHomeSections, type HomeSection } from "@/app/actions/marketplace/discover"
import { resolveCityAndStateFromSlug } from "@/app/actions/marketplace/products"
import { getCurrentUser } from "@/lib/auth/authorization"
import { getUserSessionData } from "@/lib/data/user"
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import MarketplaceFooter from "@/components/marketplace/MarketplaceFooter"
import { Suspense } from "react"
import { ThreeDotsLoader } from "@/components/reusable"
import type { Metadata } from "next"
import { getSponsoredAdsForSlot } from "@/app/actions/marketplace/ads"
import type { SponsoredAd } from "@/lib/ads/types"
import { cookies } from "next/headers"

export const metadata: Metadata = {
    title: "Dudit | Descubra. Anuncie. Organize.",
    description: "Encontre produtos, serviços e negócios perto de você. E ajude seu negócio a ser descoberto por mais pessoas. A Dudit ajuda pessoas a encontrarem o que precisam e negócios a serem encontrados.",
    openGraph: {
        title: "Dudit | Descubra. Anuncie. Organize.",
        description: "Encontre produtos, serviços e negócios perto de você. E ajude seu negócio a ser descoberto por mais pessoas. A Dudit ajuda pessoas a encontrarem o que precisam e negócios a serem encontrados.",
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
        description: "Encontre produtos, serviços e negócios perto de você. E ajude seu negócio a ser descoberto por mais pessoas.",
        images: ["https://img.dudit.com.br/static/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br",
    },
    keywords: [
        "produtos perto de mim",
        "serviços na minha cidade",
        "comprar local",
        "negócios locais",
        "marketplace local brasil",
    ],
}

async function ProductFeedWrapper({ user, userProfile, cartCount, citySlug, cityName }: any) {
    let sections: HomeSection[] = []
    let homeAds: SponsoredAd[] = []
    let displayCityName: string | null = cityName

    if (cityName && citySlug) {
        const state = citySlug.split("-").pop()?.toUpperCase() || ""
        const isDefaultSP = citySlug === "sao-paulo-sp" && cityName === "Estado de São Paulo"

        const coords = userProfile?.latitude && userProfile?.longitude
            ? { lat: userProfile.latitude, lng: userProfile.longitude }
            : null

        const scope = isDefaultSP ? "country" : "city"

        // Country scope: override display values to "Brasil"
        const ctxCity = scope === "country" ? "Brasil" : cityName
        const ctxState = scope === "country" ? "BR" : state
        const ctxStateOnly = scope === "country" ? false : isDefaultSP

        displayCityName = ctxCity

        // console.log(`[DIAG] scope=${scope} displayCity=${ctxCity} displayState=${ctxState} cityName=${cityName} isDefaultSP=${isDefaultSP}`)

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
        <div className="w-full bg-white flex-grow">
            <section className="mt-6 mb-12 px-4 lg:px-0 flex justify-center w-full">
                <div className="w-full max-w-[1400px] rounded-xl bg-gray-100 animate-pulse aspect-[16/9] sm:aspect-[2.1/1] md:aspect-[2.2/1] lg:aspect-[2.5/1]" />
            </section>
            <div className="mx-auto max-w-[1400px] px-4 xl:px-0 space-y-10 pb-12">
                <div className="space-y-4">
                    <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
                    <div className="flex gap-4 overflow-hidden">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="w-[190px] sm:w-[210px] shrink-0 space-y-3">
                                <div className="w-full aspect-square bg-gray-100 rounded-2xl animate-pulse" />
                                <div className="h-4 bg-gray-100 rounded w-3/4 animate-pulse" />
                                <div className="h-4 bg-gray-100 rounded w-1/2 animate-pulse" />
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
        ? getUserSessionData(user.id)
        : Promise.resolve(null)

    const sessionData = await sessionDataPromise

    const dbProfile = sessionData?.profile

    // Resolve city selection (either from user profile or visitor cookie)
    let citySlug: string | null = null
    let cityName: string | null = null

    if (dbProfile?.city && dbProfile?.state) {
        cityName = dbProfile.city
        const normalizedCity = dbProfile.city
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")
        citySlug = `${normalizedCity}-${dbProfile.state.toLowerCase()}`
    } else if (!user) {
        // Logged-out visitors only: check the location cookie
        const cookieStore = await cookies()
        const cookieCity = cookieStore.get("dudit_city")?.value
        if (cookieCity) {
            const resolved = await resolveCityAndStateFromSlug(cookieCity)
            if (resolved) {
                citySlug = cookieCity
                cityName = resolved.city
            }
        }
    }

    let isDefaultStateSP = false
    if (!citySlug || !cityName) {
        citySlug = "sao-paulo-sp"
        cityName = "Estado de São Paulo"
        isDefaultStateSP = true
    }

    let userProfile = dbProfile
        ? {
            full_name: dbProfile.full_name,
            latitude: dbProfile.latitude,
            longitude: dbProfile.longitude,
            address: dbProfile.city
                ? `${dbProfile.city} - ${dbProfile.state}`
                : null,
            city: dbProfile.city || null,
            state: dbProfile.state || null,
        }
        : (cityName && citySlug ? {
            full_name: null,
            latitude: null,
            longitude: null,
            address: isDefaultStateSP ? "Estado de São Paulo" : `${cityName} - ${citySlug.split("-").pop()?.toUpperCase()}`,
            city: cityName,
            state: citySlug.split("-").pop()?.toUpperCase(),
        } : null)

    // Country scope (no real location context): override header to show "Brasil"
    if (isDefaultStateSP && userProfile) {
        userProfile = { ...userProfile, address: "Brasil", city: "Brasil", state: "BR" }
    }

    const cartCount = sessionData?.cartCount || 0

    return (
        <div className="bg-white min-h-screen font-sans text-brand-dark flex flex-col pt-[110px] lg:pt-[108px]">
            <MarketplaceHeader currentView="home" userProfile={userProfile} cartCount={cartCount} />

            <Suspense fallback={<HomeFeedSkeleton />}>
                <ProductFeedWrapper
                    user={user}
                    userProfile={userProfile}
                    cartCount={cartCount}
                    citySlug={citySlug}
                    cityName={cityName}
                />
            </Suspense>

            <MarketplaceFooter />
        </div>
    )
}
