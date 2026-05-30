import MarketplaceHome from "@/components/marketplace/MarketplaceHomepage"
import { getHomeDataByCity, resolveCityAndStateFromSlug } from "@/app/actions/marketplace/products"
import { getCurrentUser } from "@/lib/auth/authorization"
import { getUserSessionData } from "@/lib/data/user"
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import MarketplaceFooter from "@/components/marketplace/MarketplaceFooter"
import { Suspense } from "react"
import { ThreeDotsLoader } from "@/components/reusable"
import type { Metadata } from "next"
import { enrichMarketplaceDistance } from "@/lib/services/location.service"
import { cookies } from "next/headers"

export const metadata: Metadata = {
    title: "Dudit | Encontre produtos e serviços perto de você",
    description: "Descubra produtos, serviços e até itens para aluguel perto de você. Explore negócios locais, fale direto com vendedores e encontre tudo na sua cidade em um só lugar.",
    openGraph: {
        title: "Dudit | Encontre produtos e serviços perto de você",
        description: "Encontre produtos e serviços na sua cidade. Explore negócios locais e fale direto com quem vende.",
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
    },
    keywords: [
        "produtos perto de mim",
        "serviços na minha cidade",
        "comprar local",
        "negócios locais",
        "marketplace local brasil"
    ]
}

async function ProductFeedWrapper({ user, userProfile, cartCount, citySlug, cityName }: any) {
    const t0 = performance.now()
    console.log(`[SSR] Home (Feed Payload) | START for city: ${cityName || "global"}`)

    let products: any[] = []
    let vitrines: any[] = []

    if (cityName && citySlug) {
        const state = citySlug.split("-").pop()?.toUpperCase() || ""
        const isDefaultSP = citySlug === "sao-paulo-sp" && cityName === "Estado de São Paulo"
        const cityData = await getHomeDataByCity(cityName, state, isDefaultSP)
        products = cityData.products
        vitrines = cityData.vitrines
    }

    const productsWithDistance = enrichMarketplaceDistance(products || [], userProfile?.latitude && userProfile?.longitude
        ? { lat: userProfile.latitude, lng: userProfile.longitude }
        : null)

    const tEnd = performance.now()
    console.log(`[SSR] Home (Feed Payload) | END | Time: ${(tEnd - t0).toFixed(2)}ms`)

    return (
        <MarketplaceHome
            products={productsWithDistance}
            vitrines={vitrines || []}
            user={user}
            userProfile={userProfile}
            cartCount={cartCount}
            selectedCitySlug={citySlug}
            selectedCityName={cityName}
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

    const userProfile = dbProfile
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
