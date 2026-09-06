"use client"

import { useState, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/reusable/Button"
import { Input } from "@/components/reusable/Input"
import {
    MapPinIcon,
    ChevronRightIcon,
} from "@/lib/icons"
import { COMMON_CITY_ACCENTS } from "@/components/marketplace/explorar-constants"

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
            ? `Oi! Procurei por produtos e serviços na Dudit em ${cityNameOnly} e ainda não encontrei vendedores. Que tal começar a vender na Dudit? É 100% gratuito e sem taxas: https://dudit.com.br/invite`
            : `Oi! Procurei por produtos e serviços na Dudit e ainda não encontrei vendedores na nossa região. Que tal começar a vender na Dudit? É 100% gratuito e sem taxas: https://dudit.com.br/invite`
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
        <div className="container mx-auto px-4 lg:px-0 max-w-[1400px] my-8 flex flex-col gap-10 font-sans">
            {/* 1. HERO COM LOCALIZAÇÃO E O DINO "ONDE VOCÊ ESTÁ" OU BLOCO DE AÇÃO DA CIDADE */}
            <div className="bg-[#fcf8f2] rounded-[24px] border border-[#f5e9d9] p-8 md:p-12 w-full flex flex-col md:flex-row items-center justify-between gap-8 dark:bg-[#2a2417] dark:border-[#3a3120]">
                <div className={`flex-grow text-center md:text-left ${isCityEmpty ? "md:max-w-[58%]" : "md:max-w-[65%]"}`}>
                    <h2 className="text-3xl font-black text-brand-dark mb-4 leading-tight dark:text-dark-heading">
                        {isCityEmpty && effectiveCityName ? (
                            <>
                                Estamos chegando em{" "}
                                <span className="text-brand-green">{effectiveCityName}!</span>
                            </>
                        ) : (
                            "Onde você está?"
                        )}
                    </h2>

                    <p className="text-gray-600 text-base md:text-lg mb-6 leading-relaxed dark:text-dark-body">
                        {isCityEmpty && effectiveCityName
                            ? `Ainda não temos lojas ou produtos cadastrados em ${effectiveCityName}. Você pode escolher outra cidade abaixo ou cadastrar seu negócio de graça!`
                            : "Para encontrar os melhores produtos, serviços e negócios locais pertinho de você, precisamos saber a sua localização."}
                    </p>

                    {/* Campo de Busca de Cidade */}
                    <div className="max-w-md mx-auto md:mx-0 relative mb-4">
                        <Input
                            ref={searchInputRef}
                            id="landingCitySearchInput"
                            name="landingCitySearchInput"
                            placeholder="Digite sua cidade (ex: Londrina, Curitiba...)"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onFocus={() => setIsInputFocused(true)}
                            onBlur={() => setTimeout(() => setIsInputFocused(false), 250)}
                            prefix={<MapPinIcon size={18} className="text-brand-green" />}
                        />

                        {isInputFocused && filteredCities.length > 0 && (
                            <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-dark-border">
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

                        {user ? (
                            <Button
                                variant="outline"
                                onClick={onOpenAddressModal}
                            >
                                Adicionar Endereço
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                onClick={onOpenVisitorModal}
                            >
                                Escolher Cidade
                            </Button>
                        )}
                    </div>

                    {locationError && (
                        <p className="text-brand-red text-sm mt-3 font-semibold">{locationError}</p>
                    )}
                </div>

                {/* LADO DIREITO: Se a cidade estiver vazia, exibe o card de ação amigável (Eu vendo algo / Conheço quem vende). Se não, mostra o dino Onde Você Está */}
                {isCityEmpty ? (
                    <div className="w-full md:w-[320px] lg:w-[350px] shrink-0 bg-white dark:bg-dark-surface border border-[#f5e9d9] dark:border-[#3a3120] rounded-[20px] p-6 flex flex-col items-center text-center">
                        <img
                            src="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                            alt="Não temos nada por aqui ainda!"
                            className="w-28 h-28 md:w-32 md:h-32 object-contain mb-3 select-none"
                        />
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-1.5">
                            Não temos nada por aqui ainda!
                        </h3>
                        <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-5 leading-relaxed">
                            {effectiveCityName
                                ? `Que tal ser pioneiro em ${effectiveCityName} ou convidar lojas e profissionais que você conhece?`
                                : "Que tal ser pioneiro na sua cidade ou convidar lojas e profissionais que você conhece?"}
                        </p>
                        <div className="flex flex-col gap-2.5 w-full">
                            <Button
                                variant="default"
                                onClick={handleSellerClick}
                                className="w-full justify-center text-sm font-semibold py-2.5"
                            >
                                Eu vendo algo
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleInvite}
                                className="w-full justify-center text-sm font-semibold py-2.5"
                            >
                                Conheço quem vende
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="w-[180px] md:w-[240px] shrink-0">
                        <img
                            src="https://img.dudit.com.br/static/mascots/OndeVoceEsta.png"
                            alt="Onde você está?"
                            className="w-full h-auto object-contain select-none"
                        />
                    </div>
                )}
            </div>

            {/* 2. CARDS ESTILO IFOOD COM OS DINOS DA DUDIT */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Card 1: Vendedores / Lojistas */}
                <div className="bg-[#fcf8f2] rounded-[24px] border border-[#f5e9d9] p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6 dark:bg-[#2a2417] dark:border-[#3a3120]">
                    <div className="w-28 h-28 sm:w-36 sm:h-36 shrink-0 flex items-center justify-center">
                        <img
                            src="https://img.dudit.com.br/static/mascots/PlanoVender.png"
                            alt="Venda na Dudit"
                            className="w-full h-full object-contain select-none"
                        />
                    </div>
                    <div className="flex-1 text-center sm:text-left">
                        <h3 className="text-xl sm:text-2xl font-bold text-brand-dark dark:text-dark-heading mb-2">
                            A sua loja pode crescer na Dudit
                        </h3>
                        <p className="text-brand-inactive-text dark:text-dark-body text-sm leading-relaxed mb-5">
                            Cadastre seus produtos ou serviços e alcance clientes da sua cidade com 0% de comissão e contato direto no WhatsApp.
                        </p>
                        <Button
                            variant="default"
                            onClick={handleSellerClick}
                            className="py-2.5 px-6 text-sm"
                        >
                            Começar a vender
                        </Button>
                    </div>
                </div>

                {/* Card 2: Consumidores / Compradores */}
                <div className="bg-[#fcf8f2] rounded-[24px] border border-[#f5e9d9] p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6 dark:bg-[#2a2417] dark:border-[#3a3120]">
                    <div className="w-28 h-28 sm:w-36 sm:h-36 shrink-0 flex items-center justify-center">
                        <img
                            src="https://img.dudit.com.br/static/mascots/HappyDino.png"
                            alt="Compre local"
                            className="w-full h-full object-contain select-none"
                        />
                    </div>
                    <div className="flex-1 text-center sm:text-left">
                        <h3 className="text-xl sm:text-2xl font-bold text-brand-dark dark:text-dark-heading mb-2">
                            Tudo o que você precisa perto de você
                        </h3>
                        <p className="text-brand-inactive-text dark:text-dark-body text-sm leading-relaxed mb-5">
                            Encontre lojas locais, produtos novos, desapegos e contrate serviços com rapidez, sem taxas e direto com o vendedor.
                        </p>
                        <Button
                            variant="outline"
                            onClick={handleBuyerFocus}
                            className="py-2.5 px-6 text-sm"
                        >
                            Informar minha cidade
                        </Button>
                    </div>
                </div>
            </div>

            {/* 3. BANNER: PRONTO PARA VENDER NA SUA CIDADE? */}
            <div className="bg-brand-dark rounded-[24px] p-8 sm:p-12 text-center text-white">
                <h3 className="text-2xl sm:text-3xl font-bold mb-3">
                    Pronto para vender na sua cidade?
                </h3>
                <p className="text-gray-300 text-sm sm:text-base max-w-xl mx-auto mb-6 leading-relaxed">
                    Crie sua vitrine em minutos, receba pedidos direto no WhatsApp e mantenha 100% do seu lucro sem pagar comissão.
                </p>
                <div className="flex justify-center">
                    <Button
                        variant="default"
                        onClick={handleSellerClick}
                        className="bg-brand-green text-white hover:bg-brand-green font-bold py-3 px-8 text-sm"
                    >
                        Começar grátis
                    </Button>
                </div>
            </div>
        </div>
    )
}
