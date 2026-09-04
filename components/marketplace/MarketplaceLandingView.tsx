"use client"

import React, { useState, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/reusable/Button"
import {
    MapPin,
    Search,
    ShoppingBag,
    Store,
    Truck,
    ArrowRight,
    CheckCircle2,
    MessageCircle,
    Sparkles,
    ShieldCheck,
    LocateFixed,
    Wrench,
    TrendingUp,
    HeartHandshake,
    ChevronRight,
} from "lucide-react"
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

const LANDING_CATEGORIES = [
    {
        name: "Alimentação",
        slug: "alimentacao",
        iconUrl: "https://img.dudit.com.br/static/categories/products/Alimentacao.png",
        desc: "Restaurantes, lanches e doces",
    },
    {
        name: "Casa & Utilidades",
        slug: "casa",
        iconUrl: "https://img.dudit.com.br/static/categories/products/Casa-e-utilidades.png",
        desc: "Móveis, decoração e utilidades",
    },
    {
        name: "Tecnologia",
        slug: "tecnologia",
        iconUrl: "https://img.dudit.com.br/static/categories/products/Tecnologia-e-eletronicos.png",
        desc: "Celulares, cabos e acessórios",
    },
    {
        name: "Moda & Beleza",
        slug: "moda-e-beleza",
        iconUrl: "https://img.dudit.com.br/static/categories/products/Moda-e-beleza.png",
        desc: "Roupas, calçados e cosméticos",
    },
    {
        name: "Serviços & Reparos",
        slug: "servicos",
        iconUrl: "",
        desc: "Encanadores, técnicos e diaristas",
        fallbackIcon: Wrench,
    },
    {
        name: "Saúde & Bem-estar",
        slug: "saude",
        iconUrl: "https://img.dudit.com.br/static/categories/products/Saude-e-bem-estar.png",
        desc: "Suplementos, óticas e cuidados",
    },
    {
        name: "Pets",
        slug: "pets",
        iconUrl: "https://img.dudit.com.br/static/categories/products/Pets.png",
        desc: "Rações, pet shops e veterinários",
    },
    {
        name: "Automotivo",
        slug: "automotivo",
        iconUrl: "https://img.dudit.com.br/static/categories/products/Auto-e-moto.png",
        desc: "Peças, oficinas e acessórios",
    },
]

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
    const [hintMessage, setHintMessage] = useState<string | null>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)

    // Formata slug de cidade para exibição amigável
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

    // Cidades filtradas no input do Hero
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

    const handleCategoryClick = (catSlug: string) => {
        if (selectedCitySlug && selectedCitySlug !== "brasil") {
            router.push(`/explorar/${selectedCitySlug}/${catSlug}`)
        } else {
            // Se ainda não tem cidade, foca o campo de busca de cidade no Hero
            searchInputRef.current?.focus()
            setHintMessage("Digite ou selecione sua cidade para ver os itens dessa categoria!")
            setTimeout(() => setHintMessage(null), 4000)
        }
    }

    const handleSellerClick = () => {
        if (userProfile) {
            router.push("/erp/trocar-erp")
        } else {
            router.push("/auth/login?mode=partner")
        }
    }

    const effectiveCityName = selectedCityName && selectedCityName !== "Brasil" ? selectedCityName : null

    return (
        <div className="w-full flex flex-col font-sans">
            {/* 1. HERO SECTION COM BUSCA DE ENDEREÇO (Estilo iFood / DoorDash / Keeta) */}
            <section className="relative overflow-hidden bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border/60 py-10 sm:py-16">
                <div className="max-w-[1400px] mx-auto px-4 lg:px-8">
                    <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
                        {/* Coluna Esquerda: Texto + Barra de Endereço */}
                        <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left">
                            {/* Badge */}
                            {isCityEmpty && effectiveCityName ? (
                                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 text-brand-green border border-emerald-200/60 font-semibold text-xs mb-4 dark:bg-emerald-950/40 dark:border-emerald-800/40">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>Estamos chegando em {effectiveCityName}!</span>
                                </div>
                            ) : (
                                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-slate text-brand-dark border border-gray-200/60 font-semibold text-xs mb-4 dark:bg-dark-border/60 dark:text-dark-heading dark:border-dark-border">
                                    <MapPin className="w-3.5 h-3.5 text-brand-green" />
                                    <span>Marketplace & Comércio Local</span>
                                </div>
                            )}

                            {/* Título Principal */}
                            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-brand-dark dark:text-dark-heading tracking-tight leading-[1.15] mb-4">
                                {isCityEmpty && effectiveCityName ? (
                                    <>
                                        Seja o pioneiro e comece a vender em{" "}
                                        <span className="text-brand-green">{effectiveCityName}</span>
                                    </>
                                ) : (
                                    <>
                                        Tudo o que você precisa hoje pode estar na{" "}
                                        <span className="text-brand-green">Dudit.</span>
                                    </>
                                )}
                            </h1>

                            {/* Subtítulo */}
                            <p className="text-brand-inactive-text dark:text-dark-body text-base sm:text-lg max-w-xl mb-8 leading-relaxed">
                                {isCityEmpty && effectiveCityName
                                    ? `Ainda não temos vendedores cadastrados em ${effectiveCityName}. Você pode escolher outra cidade abaixo ou cadastrar sua vitrine de graça agora mesmo!`
                                    : "Descubra produtos, serviços e negócios pertinho de você. Compre com facilidade, combine entregas rápidas e fale direto no WhatsApp de quem vende."}
                            </p>

                            {/* BARRA DE ENDEREÇO ESTILO IFOOD / DOORDASH */}
                            <div className="w-full max-w-xl relative">
                                <div className="bg-white dark:bg-dark-surface border-2 border-gray-200 dark:border-dark-border rounded-2xl shadow-lg p-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 transition-all focus-within:border-brand-green focus-within:ring-4 focus-within:ring-brand-green/10">
                                    <div className="flex items-center gap-2.5 px-3 py-2 flex-grow">
                                        <MapPin className="w-5 h-5 text-brand-green shrink-0" />
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            onFocus={() => setIsInputFocused(true)}
                                            onBlur={() => setTimeout(() => setIsInputFocused(false), 250)}
                                            placeholder="Onde você quer receber? Digite sua cidade..."
                                            className="w-full bg-transparent text-brand-dark dark:text-dark-heading placeholder-gray-400 dark:placeholder-gray-500 text-sm sm:text-base font-medium outline-none"
                                        />
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        {/* Botão de Localização Atual */}
                                        <button
                                            type="button"
                                            onClick={onRequestLocation}
                                            disabled={isLocationLoading}
                                            title="Usar minha localização atual (GPS)"
                                            className="h-10 px-3.5 bg-brand-slate hover:bg-gray-200/80 dark:bg-dark-border dark:hover:bg-dark-border/80 text-brand-dark dark:text-dark-heading text-xs font-bold rounded-xl flex items-center gap-2 transition-all disabled:opacity-50"
                                        >
                                            {isLocationLoading ? (
                                                <span className="w-4 h-4 border-2 border-brand-green border-t-transparent rounded-full animate-spin shrink-0" />
                                            ) : (
                                                <LocateFixed className="w-4 h-4 text-brand-green shrink-0" />
                                            )}
                                            <span className="hidden sm:inline">Localização</span>
                                        </button>

                                        {/* Botão de Modal completo ou Ação */}
                                        {user ? (
                                            <Button
                                                variant="default"
                                                size="sm"
                                                onClick={onOpenAddressModal}
                                                className="h-10 px-4 whitespace-nowrap"
                                            >
                                                Meu Endereço
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="default"
                                                size="sm"
                                                onClick={onOpenVisitorModal}
                                                className="h-10 px-4 whitespace-nowrap"
                                            >
                                                Cidades
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {/* Mensagem de dica se clicou em categoria */}
                                {hintMessage && (
                                    <p className="text-brand-green font-semibold text-xs mt-2 text-left animate-pulse">
                                        {hintMessage}
                                    </p>
                                )}

                                {/* Mensagem de erro de localização */}
                                {locationError && (
                                    <p className="text-brand-red font-semibold text-xs mt-2 text-left">
                                        {locationError}
                                    </p>
                                )}

                                {/* Dropdown de cidades filtradas */}
                                {isInputFocused && filteredCities.length > 0 && (
                                    <div className="absolute z-50 left-0 right-0 top-[calc(100%+6px)] bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-2xl shadow-xl max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-dark-border">
                                        {filteredCities.map((slug) => (
                                            <button
                                                key={slug}
                                                type="button"
                                                onMouseDown={() => onSelectCitySlug(slug)}
                                                className="w-full text-left px-4 py-3 hover:bg-brand-gray dark:hover:bg-dark-border/40 text-brand-dark dark:text-dark-heading text-sm transition-colors font-medium flex items-center justify-between group"
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <MapPin className="w-4 h-4 text-brand-green shrink-0 group-hover:scale-110 transition-transform" />
                                                    <span>{formatCitySlug(slug)}</span>
                                                </div>
                                                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-brand-green group-hover:translate-x-0.5 transition-all" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Sugestões rápidas de cidades */}
                            <div className="mt-4 flex flex-wrap items-center justify-center lg:justify-start gap-2 text-xs text-brand-inactive-text dark:text-dark-body">
                                <span>Cidades mais buscadas:</span>
                                {["sao-paulo-sp", "curitiba-pr", "londrina-pr", "rio-de-janeiro-rj", "belo-horizonte-mg"].map((cSlug) => (
                                    <button
                                        key={cSlug}
                                        type="button"
                                        onClick={() => onSelectCitySlug(cSlug)}
                                        className="font-semibold text-brand-dark dark:text-dark-heading hover:text-brand-green underline decoration-gray-300 hover:decoration-brand-green transition-colors"
                                    >
                                        {formatCitySlug(cSlug).split(" - ")[0]}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Coluna Direita: Mascote Oficial */}
                        <div className="lg:col-span-5 flex justify-center lg:justify-end">
                            <div className="relative group">
                                <div className="w-[200px] sm:w-[260px] lg:w-[320px] aspect-square flex items-center justify-center p-4">
                                    <img
                                        src={
                                            isCityEmpty
                                                ? "https://img.dudit.com.br/static/mascots/EstamosChegando.png"
                                                : "https://img.dudit.com.br/static/mascots/OndeVoceEsta.png"
                                        }
                                        alt="Mascote Dudit"
                                        className="w-full h-auto object-contain transform group-hover:scale-105 transition-transform duration-300 drop-shadow-sm select-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 2. TEASER DE CATEGORIAS (O que você encontra na Dudit) */}
            <section className="py-12 bg-gray-50/50 dark:bg-dark-surface/40 border-b border-gray-100 dark:border-dark-border/60">
                <div className="max-w-[1400px] mx-auto px-4 lg:px-8">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 text-center sm:text-left">
                        <div>
                            <span className="text-xs font-bold text-brand-green tracking-wider uppercase">
                                Explore a Dudit
                            </span>
                            <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-dark dark:text-dark-heading tracking-tight mt-1">
                                O que você procura hoje?
                            </h2>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push("/explorar")}
                            rightIcon={<ArrowRight className="w-4 h-4" />}
                        >
                            Ver tudo no Explorar
                        </Button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 sm:gap-4">
                        {LANDING_CATEGORIES.map((cat) => {
                            const FallbackIcon = cat.fallbackIcon || ShoppingBag
                            return (
                                <button
                                    key={cat.slug}
                                    type="button"
                                    onClick={() => handleCategoryClick(cat.slug)}
                                    className="bg-white dark:bg-dark-surface border border-gray-200/80 dark:border-dark-border hover:border-brand-green dark:hover:border-brand-green rounded-2xl p-4 flex flex-col items-center text-center transition-all hover:shadow-md hover:-translate-y-1 group"
                                >
                                    <div className="w-14 h-14 rounded-2xl bg-brand-slate dark:bg-dark-border/50 flex items-center justify-center mb-3 p-2 group-hover:bg-brand-green/10 transition-colors">
                                        {cat.iconUrl ? (
                                            <img
                                                src={cat.iconUrl}
                                                alt={cat.name}
                                                className="w-10 h-10 object-contain group-hover:scale-110 transition-transform"
                                                onError={(e) => {
                                                    const target = e.target as HTMLImageElement
                                                    target.style.display = "none"
                                                }}
                                            />
                                        ) : (
                                            <FallbackIcon className="w-6 h-6 text-brand-dark dark:text-dark-heading group-hover:text-brand-green transition-colors" />
                                        )}
                                    </div>
                                    <span className="text-xs sm:text-sm font-bold text-brand-dark dark:text-dark-heading line-clamp-1 group-hover:text-brand-green transition-colors">
                                        {cat.name}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            </section>

            {/* 3. COMO FUNCIONA NA DUDIT (3 Passos Simples) */}
            <section className="py-16 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border/60">
                <div className="max-w-[1400px] mx-auto px-4 lg:px-8">
                    <div className="text-center max-w-2xl mx-auto mb-12">
                        <span className="text-xs font-bold text-brand-green tracking-wider uppercase">
                            Sem burocracia
                        </span>
                        <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-dark dark:text-dark-heading tracking-tight mt-1 mb-3">
                            Como a Dudit funciona
                        </h2>
                        <p className="text-brand-inactive-text dark:text-dark-body text-sm sm:text-base">
                            Conectamos quem procura produtos e serviços com os melhores negócios da sua cidade.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Passo 1 */}
                        <div className="bg-brand-slate/60 dark:bg-dark-border/30 border border-gray-100 dark:border-dark-border rounded-3xl p-6 sm:p-8 flex flex-col items-start relative overflow-hidden">
                            <div className="w-12 h-12 rounded-2xl bg-brand-green text-white flex items-center justify-center font-black text-lg mb-6 shadow-sm">
                                1
                            </div>
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-2">
                                Diga onde você está
                            </h3>
                            <p className="text-brand-inactive-text dark:text-dark-body text-sm leading-relaxed">
                                Digite sua cidade ou endereço para descobrir lojas, restaurantes, autônomos e serviços pertinho da sua casa.
                            </p>
                        </div>

                        {/* Passo 2 */}
                        <div className="bg-brand-slate/60 dark:bg-dark-border/30 border border-gray-100 dark:border-dark-border rounded-3xl p-6 sm:p-8 flex flex-col items-start relative overflow-hidden">
                            <div className="w-12 h-12 rounded-2xl bg-brand-green text-white flex items-center justify-center font-black text-lg mb-6 shadow-sm">
                                2
                            </div>
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-2">
                                Escolha ou negocie direto
                            </h3>
                            <p className="text-brand-inactive-text dark:text-dark-body text-sm leading-relaxed">
                                Compre online pela vitrine ou converse diretamente no WhatsApp de quem vende para tirar dúvidas e fechar negócio.
                            </p>
                        </div>

                        {/* Passo 3 */}
                        <div className="bg-brand-slate/60 dark:bg-dark-border/30 border border-gray-100 dark:border-dark-border rounded-3xl p-6 sm:p-8 flex flex-col items-start relative overflow-hidden">
                            <div className="w-12 h-12 rounded-2xl bg-brand-green text-white flex items-center justify-center font-black text-lg mb-6 shadow-sm">
                                3
                            </div>
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-2">
                                Receba rápido ou retire
                            </h3>
                            <p className="text-brand-inactive-text dark:text-dark-body text-sm leading-relaxed">
                                Receba no conforto da sua casa com agilidade ou combine a retirada no local. Sem taxas escondidas nem comissões.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* 4. CALL TO ACTION DUPLO (VENDEDORES & COMPRADORES) - Inspirado no DoorDash / iFood */}
            <section className="py-16 bg-gray-50/50 dark:bg-dark-surface/40 border-b border-gray-100 dark:border-dark-border/60">
                <div className="max-w-[1400px] mx-auto px-4 lg:px-8">
                    <div className="grid lg:grid-cols-2 gap-8">
                        {/* Card 1: Vendedor / Parceiro */}
                        <div className="bg-gradient-to-br from-emerald-50 via-white to-emerald-50/30 dark:from-dark-surface dark:to-dark-surface border border-emerald-200/80 dark:border-dark-border rounded-3xl p-8 flex flex-col justify-between relative overflow-hidden shadow-sm">
                            <div>
                                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-green text-white text-[11px] font-bold uppercase tracking-wider mb-4">
                                    <Store className="w-3.5 h-3.5" />
                                    <span>Para Empreendedores & Lojistas</span>
                                </div>
                                <h3 className="text-2xl sm:text-3xl font-extrabold text-brand-dark dark:text-dark-heading tracking-tight mb-3">
                                    Venda na Dudit com <span className="text-brand-green">0% de comissão</span>
                                </h3>
                                <p className="text-brand-inactive-text dark:text-dark-body text-sm sm:text-base leading-relaxed mb-6">
                                    Chegue a mais clientes da sua cidade. Crie sua vitrine online grátis, receba pedidos no WhatsApp e controle tudo pelo ERP Dudit.
                                </p>

                                <ul className="space-y-2.5 mb-8 text-sm text-brand-dark dark:text-dark-heading">
                                    <li className="flex items-center gap-2.5 font-medium">
                                        <CheckCircle2 className="w-4 h-4 text-brand-green shrink-0" />
                                        <span>100% do lucro da venda é seu (sem comissão por pedido)</span>
                                    </li>
                                    <li className="flex items-center gap-2.5 font-medium">
                                        <CheckCircle2 className="w-4 h-4 text-brand-green shrink-0" />
                                        <span>Vitrine própria com seu link para usar no Instagram</span>
                                    </li>
                                    <li className="flex items-center gap-2.5 font-medium">
                                        <CheckCircle2 className="w-4 h-4 text-brand-green shrink-0" />
                                        <span>Gestão de pedidos, estoque e financeiro no ERP</span>
                                    </li>
                                </ul>
                            </div>

                            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-4 border-t border-emerald-100 dark:border-dark-border">
                                <Button
                                    variant="default"
                                    size="lg"
                                    onClick={handleSellerClick}
                                    className="w-full sm:w-auto"
                                    rightIcon={<ArrowRight className="w-4 h-4" />}
                                >
                                    Começar a vender na Dudit
                                </Button>
                                <div className="w-24 h-24 shrink-0 hidden sm:flex items-center justify-center">
                                    <img
                                        src="https://img.dudit.com.br/static/mascots/PlanoVender.png"
                                        alt="Venda na Dudit"
                                        className="w-full h-full object-contain"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Card 2: Consumidor / Quem Procura */}
                        <div className="bg-white dark:bg-dark-surface border border-gray-200/80 dark:border-dark-border rounded-3xl p-8 flex flex-col justify-between relative overflow-hidden shadow-sm">
                            <div>
                                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-slate dark:bg-dark-border text-brand-dark dark:text-dark-heading text-[11px] font-bold uppercase tracking-wider mb-4">
                                    <ShoppingBag className="w-3.5 h-3.5 text-brand-green" />
                                    <span>Para Quem Compra ou Contrata</span>
                                </div>
                                <h3 className="text-2xl sm:text-3xl font-extrabold text-brand-dark dark:text-dark-heading tracking-tight mb-3">
                                    O comércio da sua cidade na palma da sua mão
                                </h3>
                                <p className="text-brand-inactive-text dark:text-dark-body text-sm sm:text-base leading-relaxed mb-6">
                                    Encontre produtos novos e desapegos, agende profissionais qualificados e aproveite preços reais perto de você.
                                </p>

                                <ul className="space-y-2.5 mb-8 text-sm text-brand-dark dark:text-dark-heading">
                                    <li className="flex items-center gap-2.5 font-medium">
                                        <CheckCircle2 className="w-4 h-4 text-brand-green shrink-0" />
                                        <span>Negociação direta com o vendedor sem taxas abusivas</span>
                                    </li>
                                    <li className="flex items-center gap-2.5 font-medium">
                                        <CheckCircle2 className="w-4 h-4 text-brand-green shrink-0" />
                                        <span>Entrega rápida ou retirada imediata no seu bairro</span>
                                    </li>
                                    <li className="flex items-center gap-2.5 font-medium">
                                        <CheckCircle2 className="w-4 h-4 text-brand-green shrink-0" />
                                        <span>Produtos e serviços no mesmo lugar</span>
                                    </li>
                                </ul>
                            </div>

                            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-4 border-t border-gray-100 dark:border-dark-border">
                                <Button
                                    variant="outline"
                                    size="lg"
                                    onClick={() => {
                                        if (searchInputRef.current) {
                                            searchInputRef.current.focus()
                                            window.scrollTo({ top: 0, behavior: "smooth" })
                                        } else {
                                            onOpenVisitorModal()
                                        }
                                    }}
                                    className="w-full sm:w-auto"
                                    rightIcon={<Search className="w-4 h-4" />}
                                >
                                    Definir minha cidade
                                </Button>
                                <div className="w-24 h-24 shrink-0 hidden sm:flex items-center justify-center">
                                    <img
                                        src="https://img.dudit.com.br/static/mascots/HappyDino.png"
                                        alt="Apoie o comércio local"
                                        className="w-full h-full object-contain"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 5. DIFERENCIAIS DA DUDIT (Value Props 4 Colunas) */}
            <section className="py-16 bg-white dark:bg-dark-surface">
                <div className="max-w-[1400px] mx-auto px-4 lg:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="p-6 rounded-2xl bg-brand-slate/40 dark:bg-dark-border/20 border border-gray-100 dark:border-dark-border">
                            <div className="w-10 h-10 rounded-xl bg-brand-green/10 text-brand-green flex items-center justify-center mb-4">
                                <TrendingUp className="w-5 h-5" />
                            </div>
                            <h4 className="text-base font-bold text-brand-dark dark:text-dark-heading mb-1.5">
                                0% de comissão
                            </h4>
                            <p className="text-brand-inactive-text dark:text-dark-body text-xs sm:text-sm leading-relaxed">
                                Lojistas não pagam taxas por venda, permitindo oferecer preços muito mais justos para você.
                            </p>
                        </div>

                        <div className="p-6 rounded-2xl bg-brand-slate/40 dark:bg-dark-border/20 border border-gray-100 dark:border-dark-border">
                            <div className="w-10 h-10 rounded-xl bg-brand-green/10 text-brand-green flex items-center justify-center mb-4">
                                <MessageCircle className="w-5 h-5" />
                            </div>
                            <h4 className="text-base font-bold text-brand-dark dark:text-dark-heading mb-1.5">
                                Contato direto no WhatsApp
                            </h4>
                            <p className="text-brand-inactive-text dark:text-dark-body text-xs sm:text-sm leading-relaxed">
                                Fale com o dono do negócio, tire dúvidas e personalize seus pedidos sem barreiras de chat.
                            </p>
                        </div>

                        <div className="p-6 rounded-2xl bg-brand-slate/40 dark:bg-dark-border/20 border border-gray-100 dark:border-dark-border">
                            <div className="w-10 h-10 rounded-xl bg-brand-green/10 text-brand-green flex items-center justify-center mb-4">
                                <ShoppingBag className="w-5 h-5" />
                            </div>
                            <h4 className="text-base font-bold text-brand-dark dark:text-dark-heading mb-1.5">
                                Produtos & Serviços
                            </h4>
                            <p className="text-brand-inactive-text dark:text-dark-body text-xs sm:text-sm leading-relaxed">
                                Do almoço aos reparos da sua casa. Tudo organizado e categorizado na sua região.
                            </p>
                        </div>

                        <div className="p-6 rounded-2xl bg-brand-slate/40 dark:bg-dark-border/20 border border-gray-100 dark:border-dark-border">
                            <div className="w-10 h-10 rounded-xl bg-brand-green/10 text-brand-green flex items-center justify-center mb-4">
                                <HeartHandshake className="w-5 h-5" />
                            </div>
                            <h4 className="text-base font-bold text-brand-dark dark:text-dark-heading mb-1.5">
                                Fortaleça sua cidade
                            </h4>
                            <p className="text-brand-inactive-text dark:text-dark-body text-xs sm:text-sm leading-relaxed">
                                Comprar na Dudit valoriza os empreendedores locais e faz a economia do seu município girar.
                            </p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )
}
