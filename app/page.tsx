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
    description: "Tudo o que você precisa para encontrar, anunciar e organizar em um só lugar.",
    openGraph: {
        title: "Dudit | Descubra. Anuncie. Organize.",
        description: "Tudo o que você precisa para encontrar, anunciar e organizar em um só lugar.",
        url: "https://dudit.com.br",
        siteName: "Dudit",
        images: [
            {
                url: "https://img.dudit.com.br/static/og-image.png",
                width: 1200,
                height: 630,
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
        description: "Tudo o que você precisa para encontrar, anunciar e organizar em um só lugar.",
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
    const t0 = performance.now()
    console.log(`[SSR] Home (Feed Payload) | START for city: ${cityName || "global"}`)

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

        console.log(`[DIAG] scope=${scope} displayCity=${ctxCity} displayState=${ctxState} cityName=${cityName} isDefaultSP=${isDefaultSP}`)

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

    const tEnd = performance.now()
    console.log(`[SSR] Home (Feed Payload) | END | ${sections.length} sections | Time: ${(tEnd - t0).toFixed(2)}ms`)

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
    } else {
        // If not logged in or has no profile address, check cookie
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
                    citySlug={citySlug}
                    cityName={cityName}
                />
            </Suspense>

            <MarketplaceFooter />
        </div>
    )
}
