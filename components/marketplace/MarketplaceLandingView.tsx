"use client"

import { useState, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/reusable/Button"
import { Input } from "@/components/reusable/Input"
import {
    MapPinIcon,
    ChevronRightIcon,
    GlobeIcon,
} from "@/lib/icons"
import { COMMON_CITY_ACCENTS } from "@/components/marketplace/explorar-constants"
import { HorizontalCarousel, ItemCard } from "./shared-components"
import type { HomeSection } from "@/app/actions/marketplace/discover"
import { InfoCard } from "../reusable"

interface MarketplaceLandingViewProps {
    user?: any
    userProfile?: any
    selectedCityName?: string | null
    selectedCitySlug?: string | null
    isCityEmpty?: boolean
    onOpenAddressModal: () => void
    onOpenVisitorModal: () => void
    onRequestLocation: () => void
    isLocationLoading?: boolean
    locationError?: string | null
    onSelectCitySlug: (slug: string) => void
    citiesList: string[]
    brasilTodoSection?: HomeSection | null
    userCoords?: { lat: number; lng: number } | null
}

export function MarketplaceLandingView({
    user,
    userProfile,
    selectedCityName,
    selectedCitySlug,
    isCityEmpty = false,
    onOpenAddressModal,
    onOpenVisitorModal,
    onRequestLocation,
    isLocationLoading = false,
    locationError = null,
    onSelectCitySlug,
    citiesList = [],
    brasilTodoSection = null,
    userCoords = null,
}: MarketplaceLandingViewProps) {
    const router = useRouter()
    const [searchQuery, setSearchQuery] = useState("")
    const [isInputFocused, setIsInputFocused] = useState(false)
    const searchInputRef = useRef<HTMLInputElement>(null)

    const formatCitySlug = (slug: string): string => {
        if (!slug) return ""
        if (slug === "brasil") return "Brasil"
        if (slug.startsWith("estado-")) {
            return slug.replace("estado-", "").toUpperCase()
        }
        const parts = slug.split("-")
        const state = parts.pop()?.toUpperCase() || ""
        const cityKey = parts.join("-")

        let city = COMMON_CITY_ACCENTS[cityKey]
        if (!city) {
            city = parts
                .map((p) => {
                    if (p === "sao") return "São"
                    if (p === "joao") return "João"
                    if (p === "jose") return "José"
                    if (p === "conceicao") return "Conceição"
                    if (p === "ribeirao") return "Ribeirão"
                    if (p === "uniao") return "União"
                    if (p === "cristovao") return "Cristóvão"
                    if (p === "sebastiao") return "Sebastião"
                    if (p === "cambe") return "Cambé"
                    if (p === "e") return "e"
                    if (p === "do" || p === "da" || p === "dos" || p === "das" || p === "de") return p
                    return p.charAt(0).toUpperCase() + p.slice(1)
                })
                .join(" ")
        }
        return `${city} - ${state}`
    }

    const filteredCities = useMemo(() => {
        if (!searchQuery || searchQuery.trim().length < 2 || citiesList.length === 0) return []
        const q = searchQuery
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[-\s]+/g, " ")
            .trim()

        return citiesList
            .filter((slug: string) => {
                const norm = slug
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[-\s]+/g, " ")
                return norm.includes(q)
            })
            .slice(0, 6)
    }, [searchQuery, citiesList])

    const handleSellerClick = () => {
        if (userProfile) {
            router.push("/erp/inicio")
        } else {
            router.push("/auth/login?mode=partner")
        }
    }

    const handleInvite = () => {
        const cityNameOnly = effectiveCityName || ""
        const text = cityNameOnly
            ? `Oi! Procurei por produtos e serviços na Dudit em ${cityNameOnly} e ainda não encontrei vendedores locais. Que tal começar a vender na Dudit? É 100% gratuito e com 0% de comissão: https://dudit.com.br/auth/login?mode=partner`
            : `Oi! Procurei por produtos e serviços na Dudit e ainda não encontrei vendedores na nossa região. Que tal começar a vender na Dudit? É 100% gratuito e com 0% de comissão: https://dudit.com.br/auth/login?mode=partner`
        const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
        window.open(url, "_blank")
    }

    const handleBuyerFocus = () => {
        if (searchInputRef.current) {
            searchInputRef.current.focus()
            searchInputRef.current.scrollIntoView({ behavior: "smooth", block: "center" })
        } else {
            onOpenVisitorModal()
        }
    }

    const effectiveCityName = selectedCityName && selectedCityName !== "Brasil" ? selectedCityName : null

    return (
        <div className="w-full flex flex-col font-sans">

            {/* ═══════════════════════════════════════════════════════════
                HERO 1 - LOCALIZAÇÃO / CIDADE VAZIA & ESCOPO NACIONAL
            ═══════════════════════════════════════════════════════════ */}
            <section className="w-full bg-gradient-to-b from-brand-dark to-[#0a4a3a] text-white">
                <div className="container mx-auto px-4 lg:px-0 max-w-[1000px] py-8 md:py-12 flex flex-col md:flex-row items-center justify-center gap-10 md:gap-16">

                    {/* Texto + Busca */}
                    <div className="flex-grow text-center md:text-left max-w-[640px]">
                        {isCityEmpty && effectiveCityName ? (
                            <>
                                <h1 className="text-3xl md:text-[42px] font-black mb-4 leading-tight">
                                    Estamos chegando em{" "}
                                    <span className="text-brand-green">{effectiveCityName}</span>!
                                </h1>
                                <p className="text-white/70 text-base md:text-lg mb-8 leading-relaxed max-w-lg mx-auto md:mx-0">
                                    Ainda não temos lojas com retirada local cadastradas aqui.
                                    Mas você pode comprar de lojas que enviam para todo o Brasil ou ser o primeiro a cadastrar seu negócio de graça!
                                </p>
                            </>
                        ) : (
                            <>
                                <h1 className="text-3xl md:text-[42px] font-black mb-4 leading-tight">
                                    O que você precisa hoje pode estar na{" "}
                                    <span className="text-brand-green">Dudit.</span>
                                </h1>
                                <p className="text-white/70 text-base md:text-lg mb-8 leading-relaxed max-w-lg mx-auto md:mx-0">
                                    Descubra produtos, serviços e negócios locais pertinho de você ou compre de lojas que enviam para todo o Brasil.
                                </p>
                            </>
                        )}

                        {/* Campo de Busca de Cidade */}
                        <div className="max-w-md mx-auto md:mx-0 relative mb-6">
                            <Input
                                ref={searchInputRef}
                                id="landingCitySearchInput"
                                name="landingCitySearchInput"
                                placeholder="Digite sua cidade (ex: Londrina, Curitiba...)"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onFocus={() => setIsInputFocused(true)}
                                onBlur={() => setTimeout(() => setIsInputFocused(false), 250)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && filteredCities.length > 0) {
                                        e.preventDefault()
                                        onSelectCitySlug(filteredCities[0])
                                    }
                                }}
                                prefix={<MapPinIcon size={18} className="text-brand-green" />}
                            />

                            {isInputFocused && filteredCities.length > 0 && (
                                <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-dark-border shadow-lg">
                                    {filteredCities.map((slug) => (
                                        <button
                                            key={slug}
                                            type="button"
                                            onMouseDown={() => onSelectCitySlug(slug)}
                                            className="w-full text-left px-4 py-3 hover:bg-brand-gray dark:hover:bg-dark-border/40 text-brand-dark dark:text-dark-heading text-sm font-medium flex items-center justify-between"
                                        >
                                            <div className="flex items-center gap-2">
                                                <MapPinIcon size={16} className="text-brand-green shrink-0" />
                                                <span>{formatCitySlug(slug)}</span>
                                            </div>
                                            <ChevronRightIcon size={16} className="text-brand-inactive-text" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                            <Button
                                onClick={onRequestLocation}
                                disabled={isLocationLoading}
                            >
                                {isLocationLoading ? "Localizando..." : "Usar localização atual"}
                            </Button>
                        </div>

                        {locationError && (
                            <InfoCard
                                message={locationError}
                                color="red"
                            />
                        )}
                    </div>

                    {/* Mascote lateral */}
                    {isCityEmpty ? (
                        <div className="w-[200px] md:w-[280px] shrink-0 flex items-center justify-center">
                            <img
                                src="https://img.dudit.com.br/static/mascots/EstamosChegando.png"
                                alt="Estamos chegando!"
                                className="w-full h-auto object-contain select-none drop-shadow-2xl"
                            />
                        </div>
                    ) : (
                        <div className="w-[180px] md:w-[260px] shrink-0 flex items-center justify-center">
                            <img
                                src="https://img.dudit.com.br/static/mascots/OndeVoceEsta.png"
                                alt="Onde você está?"
                                className="w-full h-auto object-contain select-none drop-shadow-2xl"
                            />
                        </div>
                    )}
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════
                DESTAQUES EM TODO O BRASIL (Quando há produtos nacionais)
            ═══════════════════════════════════════════════════════════ */}
            {brasilTodoSection && brasilTodoSection.items && brasilTodoSection.items.length > 0 && (
                <div className="w-full bg-white dark:bg-dark-background py-6">
                    <div className="container mx-auto px-4 max-w-[1400px]">
                        <HorizontalCarousel
                            key={brasilTodoSection.id}
                            title={brasilTodoSection.title}
                            subtitle={brasilTodoSection.subtitle}
                            items={brasilTodoSection.items}
                            onSeeAll={brasilTodoSection.seeMoreLink ? () => router.push(brasilTodoSection.seeMoreLink!) : undefined}
                            renderItem={(item: any) => (
                                <ItemCard
                                    product={item}
                                    userCoords={userCoords}
                                    locationContext={{ scope: "country" }}
                                    className="w-full"
                                />
                            )}
                            itemWidthClass="w-[150px] md:w-[230px]"
                        />
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════
                HERO 2 - VOCÊ VENDE? (Situação: "Quero ser encontrado")
            ═══════════════════════════════════════════════════════════ */}
            <section className="w-full bg-white dark:bg-dark-background">
                <div className="container mx-auto px-4 lg:px-0 max-w-[1000px] py-8 md:py-10 flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12">

                    {/* Imagem */}
                    <div className="w-[180px] md:w-[240px] shrink-0 flex items-center justify-center order-2 md:order-1">
                        <img
                            src="https://img.dudit.com.br/static/mascots/Carousel1.png"
                            alt="Venda na Dudit"
                            className="w-full h-auto object-contain select-none"
                        />
                    </div>

                    {/* Texto */}
                    <div className="flex-1 text-center md:text-left order-1 md:order-2 max-w-[580px]">
                        <h2 className="text-2xl md:text-[32px] font-black text-brand-dark dark:text-dark-heading mb-3 leading-tight">
                            Seu negócio também pode ser encontrado na Dudit
                        </h2>
                        <p className="text-brand-inactive-text dark:text-dark-body text-base md:text-lg leading-relaxed mb-6">
                            Chegue até mais pessoas da sua cidade e de todo o Brasil. Tenha sua vitrine aberta 24h, receba pedidos no WhatsApp ou direto pelo sistema e venda com 0% de comissão.
                        </p>
                        <Button
                            variant="default"
                            onClick={handleSellerClick}
                            className="py-3 px-8 text-sm"
                        >
                            Começar a vender
                        </Button>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════
                HERO 3 - VOCÊ COMPRA? (Situação: "Preciso de algo")
            ═══════════════════════════════════════════════════════════ */}
            <section className="w-full bg-brand-gray/40 dark:bg-dark-surface/50">
                <div className="container mx-auto px-4 lg:px-0 max-w-[1000px] py-8 md:py-10 flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12">

                    {/* Texto */}
                    <div className="flex-1 text-center md:text-left max-w-[580px]">
                        <h2 className="text-2xl md:text-[32px] font-black text-brand-dark dark:text-dark-heading mb-3 leading-tight">
                            Tem algo para vender ou desapegar?
                        </h2>
                        <p className="text-brand-inactive-text dark:text-dark-body text-base md:text-lg leading-relaxed mb-6">
                            Anuncie produtos novos, seminovos ou desapegos de forma simples. Encontre compradores na sua região ou receba pedidos de todo o Brasil, sem pagar taxas sobre o que vender.
                        </p>
                        <Button
                            variant="outline"
                            onClick={handleSellerClick}
                            className="py-3 px-8 text-sm"
                        >
                            Anunciar na Dudit
                        </Button>
                    </div>

                    {/* Imagem */}
                    <div className="w-[180px] md:w-[240px] shrink-0 flex items-center justify-center">
                        <img
                            src="https://img.dudit.com.br/static/mascots/Carousel6.png"
                            alt="Encontre perto de você"
                            className="w-full h-auto object-contain select-none"
                        />
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════
                HERO 4 - PRECISA DE ALGO? (Situação: consumidor)
            ═══════════════════════════════════════════════════════════ */}
            <section className="w-full bg-white dark:bg-dark-background">
                <div className="container mx-auto px-4 lg:px-0 max-w-[1000px] py-8 md:py-10 flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12">

                    {/* Imagem */}
                    <div className="w-[180px] md:w-[240px] shrink-0 flex items-center justify-center order-2 md:order-1">
                        <img
                            src="https://img.dudit.com.br/static/mascots/OndeVoceEsta.png"
                            alt="Encontre perto de você"
                            className="w-full h-auto object-contain select-none"
                        />
                    </div>

                    {/* Texto */}
                    <div className="flex-1 text-center md:text-left order-1 md:order-2 max-w-[580px]">
                        <h2 className="text-2xl md:text-[32px] font-black text-brand-dark dark:text-dark-heading mb-3 leading-tight">
                            Precisa de algo? Procura na Dudit.
                        </h2>
                        <p className="text-brand-inactive-text dark:text-dark-body text-base md:text-lg leading-relaxed mb-6">
                            De eletrônicos a roupas, de marmitas a encanadores. Tudo organizado para você encontrar rápido o que precisa, pertinho de você ou com entrega para todo o Brasil.
                        </p>
                        <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                            <Button
                                onClick={() => onSelectCitySlug("brasil")}
                                className="py-3 px-8 text-sm"
                            >
                                Ver ofertas do Brasil todo
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleBuyerFocus}
                                className="py-3 px-6 text-sm"
                            >
                                Buscar na minha cidade
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════
                HERO 5 - PRONTO PARA VENDER E CONVITE
            ═══════════════════════════════════════════════════════════ */}
            <section className="py-10 px-4 bg-white dark:bg-dark-background relative">
                <div className="max-w-[1400px] mx-auto relative z-10">
                    <div className="bg-brand-dark rounded-3xl p-8 md:p-10 flex flex-col md:flex-row items-center gap-8 md:gap-12 overflow-hidden">
                        {/* Background decorative faint rings */}
                        <div className="absolute inset-0 opacity-10 pointer-events-none select-none">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] sm:w-[800px] sm:h-[800px] lg:w-[1000px] lg:h-[1000px] border border-white rounded-full" />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] sm:w-[600px] sm:h-[600px] lg:w-[750px] lg:h-[750px] border border-white rounded-full" />
                        </div>

                        {/* Texto + Botão */}
                        <div className="flex-1 text-center md:text-left">
                            <h2 className="text-2xl md:text-[32px] font-black text-white mb-3 leading-tight">
                                Pronto para vender na sua cidade e em todo o Brasil?
                            </h2>
                            <p className="text-white/70 text-base md:text-lg leading-relaxed mb-6">
                                Crie sua vitrine em minutos, receba pedidos pelo WhatsApp ou direto na Dudit e venda com 0% de comissão. Sem taxas por pedido ou surpresas no fim do mês.
                            </p>
                            <div className="flex flex-wrap items-center gap-3 justify-center md:justify-start">
                                <Button asChild className="h-11">
                                    <Link href="/auth/login?mode=partner" prefetch={false}>
                                        Começar grátis
                                    </Link>
                                </Button>
                            </div>
                        </div>

                        {/* Dino */}
                        <div className="w-[160px] md:w-[220px] shrink-0 flex items-center justify-center">
                            <img
                                src="https://img.dudit.com.br/static/mascots/Carousel2.png"
                                alt="Venda na Dudit"
                                className="w-full h-auto object-contain select-none"
                            />
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )
}
