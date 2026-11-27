"use client"

import { useState, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/reusable/Button"
import { Input } from "@/components/reusable/Input"
import {
    MapPinIcon,
    ChevronRightIcon,
    ArrowRightIcon,
} from "@/lib/icons"
import { COMMON_CITY_ACCENTS } from "@/components/marketplace/explorar-constants"
import { HorizontalCarousel, ItemCard, VitrineCard } from "./shared-components"
import type { HomeSection } from "@/app/actions/marketplace/discover"
import { FormSection, InfoCard, Separator } from "../reusable"

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
    brasilTodoVitrinesSection?: HomeSection | null
    userCoords?: { lat: number; lng: number } | null
}

export function MarketplaceLandingView({
    userProfile,
    selectedCityName,
    isCityEmpty = false,
    onRequestLocation,
    isLocationLoading = false,
    locationError = null,
    onSelectCitySlug,
    citiesList = [],
    brasilTodoSection = null,
    brasilTodoVitrinesSection = null,
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

    const effectiveCityName = selectedCityName && selectedCityName !== "Brasil" ? selectedCityName : null
    const hasBrasilVitrines = Boolean(brasilTodoVitrinesSection?.items && brasilTodoVitrinesSection.items.length > 0)
    const hasBrasilProducts = Boolean(brasilTodoSection?.items && brasilTodoSection.items.length > 0)
    const hasBrasilDestaques = hasBrasilVitrines || hasBrasilProducts

    const valueProps = [
        {
            image: "https://img.dudit.com.br/static/mascots/Carousel1.png",
            alt: "Venda na Dudit",
            title: "Seu negócio também pode ser encontrado na Dudit",
            description:
                "Chegue até mais pessoas da sua cidade e de todo o Brasil. Tenha sua vitrine aberta 24h, receba pedidos no WhatsApp ou pelo sistema e venda com 0% de comissão.",
            ctaLabel: "Começar a vender",
            onClick: handleSellerClick,
        },
        {
            image: "https://img.dudit.com.br/static/mascots/Carousel6.png",
            alt: "Anuncie na Dudit",
            title: "Tem algo para vender ou desapegar?",
            description:
                "Anuncie produtos novos, seminovos ou desapegos de forma simples. Encontre compradores na sua região ou receba pedidos de todo o Brasil, sem taxas por venda.",
            ctaLabel: "Anunciar na Dudit",
            onClick: handleSellerClick,
        },
        {
            image: "https://img.dudit.com.br/static/mascots/OndeVoceEsta.png",
            alt: "Procure na Dudit",
            title: "Precisa de algo? Procura na Dudit.",
            description:
                "De eletrônicos a roupas, de marmitas a serviços. Tudo organizado para você encontrar rápido o que precisa, pertinho de você ou com envio para todo o Brasil.",
            ctaLabel: "Ver ofertas do Brasil todo",
            onClick: () => onSelectCitySlug("brasil"),
        },
    ]

    return (
        <div className="w-full flex flex-col font-sans bg-white dark:bg-dark-background">

            {/* ═══════════════════════════════════════════════════════════
                HERO - LOCALIZAÇÃO / CIDADE VAZIA (Estilo Institucional)
            ═══════════════════════════════════════════════════════════ */}
            <section className="w-full bg-white dark:bg-dark-background">
                <div className="max-w-[1400px] w-full mx-auto px-4 xl:px-0 py-10 md:py-16">
                    <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
                        {/* Texto + Busca */}
                        <div className="text-center lg:text-left">
                            {isCityEmpty && effectiveCityName ? (
                                <>
                                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-brand-dark dark:text-dark-heading mb-5 leading-tight">
                                        Estamos chegando em{" "}
                                        <span className="text-brand-green">{effectiveCityName}</span>!
                                    </h1>
                                    <p className="text-brand-inactive-text dark:text-dark-body text-base md:text-lg lg:text-xl mb-8 leading-relaxed max-w-xl mx-auto lg:mx-0">
                                        Ainda não há lojas cadastradas por aqui, mas você já pode explorar vitrines e produtos de todo o Brasil - ou buscar em outra cidade.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-brand-dark dark:text-dark-heading mb-5 leading-tight">
                                        O que você precisa hoje pode estar na{" "}
                                        <span className="text-brand-green">Dudit.</span>
                                    </h1>
                                    <p className="text-brand-inactive-text dark:text-dark-body text-base md:text-lg lg:text-xl mb-8 leading-relaxed max-w-xl mx-auto lg:mx-0">
                                        Encontre produtos, serviços e vitrines locais perto de você ou compre de negócios que enviam para todo o Brasil.
                                    </p>
                                </>
                            )}

                            {/* Campo de Busca de Cidade */}
                            <div className="max-w-md mx-auto lg:mx-0 relative mb-4">
                                <Input
                                    ref={searchInputRef}
                                    id="landingCitySearchInput"
                                    name="landingCitySearchInput"
                                    placeholder="Digite sua cidade (ex: Londrina, Curitiba...)"
                                    variant="full-rounded"
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

                            <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
                                <Button
                                    onClick={onRequestLocation}
                                    disabled={isLocationLoading}
                                >
                                    <MapPinIcon size={16} />
                                    {isLocationLoading ? "Localizando..." : "Usar localização atual"}
                                </Button>
                            </div>

                            {locationError && (
                                <div className="mt-4 max-w-md mx-auto lg:mx-0 text-left">
                                    <InfoCard
                                        message={locationError}
                                        color="red"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Mascote lateral */}
                        <div className="flex items-center justify-center lg:justify-end">
                            <div className="w-[220px] sm:w-[280px] lg:w-[340px] flex items-center justify-center">
                                <img
                                    src={
                                        isCityEmpty
                                            ? "https://img.dudit.com.br/static/mascots/EstamosChegando.png"
                                            : "https://img.dudit.com.br/static/mascots/OndeVoceEsta.png"
                                    }
                                    alt={isCityEmpty ? "Estamos chegando!" : "Onde você está?"}
                                    className="w-full h-auto object-contain select-none"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Divider 1 */}
            <div className="max-w-[1400px] w-full mx-auto px-4 xl:px-0">
                <Separator className="dark:bg-dark-border" />
            </div>

            {/* ═══════════════════════════════════════════════════════════
                DESTAQUES EM TODO O BRASIL (FormSection com Vitrines + Produtos)
            ═══════════════════════════════════════════════════════════ */}
            {hasBrasilDestaques && (
                <>
                    <section className="w-full py-10 md:py-12">
                        <div className="max-w-[1400px] w-full mx-auto px-4 xl:px-0">
                            <FormSection title="Destaques em todo o Brasil">
                                {hasBrasilVitrines && brasilTodoVitrinesSection && (
                                    <HorizontalCarousel
                                        key={brasilTodoVitrinesSection.id}
                                        title={brasilTodoVitrinesSection.title}
                                        items={brasilTodoVitrinesSection.items}
                                        onSeeAll={
                                            brasilTodoVitrinesSection.seeMoreLink
                                                ? () => router.push(brasilTodoVitrinesSection.seeMoreLink!)
                                                : undefined
                                        }
                                        renderItem={(item: any) => (
                                            <VitrineCard
                                                vitrine={item}
                                                userCoords={userCoords}
                                                locationContext={{ scope: "country" }}
                                                className="w-full"
                                            />
                                        )}
                                        itemWidthClass="w-[270px] sm:w-[320px]"
                                    />
                                )}

                                {hasBrasilProducts && brasilTodoSection && (
                                    <HorizontalCarousel
                                        key={brasilTodoSection.id}
                                        title="Melhores produtos"
                                        items={brasilTodoSection.items}
                                        onSeeAll={
                                            brasilTodoSection.seeMoreLink
                                                ? () => router.push(brasilTodoSection.seeMoreLink!)
                                                : undefined
                                        }
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
                                )}
                            </FormSection>
                        </div>
                    </section>

                    {/* Divider 2 */}
                    <div className="max-w-[1400px] w-full mx-auto px-4 xl:px-0">
                        <Separator className="dark:bg-dark-border" />
                    </div>
                </>
            )}

            {/* ═══════════════════════════════════════════════════════════
                3 PILARES LADO A LADO (Estilo DoorDash)
            ═══════════════════════════════════════════════════════════ */}
            <section className="w-full py-12 md:py-16">
                <div className="max-w-[1400px] w-full mx-auto px-4 xl:px-0">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-10 lg:gap-12">
                        {valueProps.map((item, idx) => (
                            <div
                                key={idx}
                                className="flex flex-col items-center text-center"
                            >
                                <div className="h-36 md:h-44 w-full flex items-center justify-center mb-6">
                                    <img
                                        src={item.image}
                                        alt={item.alt}
                                        className="h-full w-auto max-w-[180px] md:max-w-[200px] object-contain select-none"
                                    />
                                </div>
                                <h2 className="text-xl md:text-2xl font-black text-brand-dark dark:text-dark-heading mb-3 leading-snug max-w-xs">
                                    {item.title}
                                </h2>
                                <p className="text-brand-inactive-text dark:text-dark-body text-sm md:text-base leading-relaxed mb-5 max-w-sm">
                                    {item.description}
                                </p>
                                <button
                                    type="button"
                                    onClick={item.onClick}
                                    className="mt-auto inline-flex items-center gap-1.5 text-brand-green font-bold text-sm md:text-base hover:underline cursor-pointer"
                                >
                                    <span>{item.ctaLabel}</span>
                                    <ArrowRightIcon size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Divider 3 */}
            <div className="max-w-[1400px] w-full mx-auto px-4 xl:px-0">
                <Separator className="dark:bg-dark-border" />
            </div>

            {/* ═══════════════════════════════════════════════════════════
                BANNER FINAL - PRONTO PARA VENDER
            ═══════════════════════════════════════════════════════════ */}
            <section className="py-10 md:py-12 bg-white dark:bg-dark-background">
                <div className="max-w-[1400px] w-full mx-auto px-4 xl:px-0">
                    <div className="relative bg-brand-dark rounded-3xl p-8 md:p-10 flex flex-col md:flex-row items-center gap-8 md:gap-12 overflow-hidden">
                        {/* Background decorative faint rings */}
                        <div className="absolute inset-0 opacity-10 pointer-events-none select-none">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] sm:w-[800px] sm:h-[800px] lg:w-[1000px] lg:h-[1000px] border border-white rounded-full" />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] sm:w-[600px] sm:h-[600px] lg:w-[750px] lg:h-[750px] border border-white rounded-full" />
                        </div>

                        {/* Texto + Botão */}
                        <div className="flex-1 text-center md:text-left relative z-10">
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
                        <div className="w-[160px] md:w-[220px] shrink-0 flex items-center justify-center relative z-10">
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
