"use client"

import { useState, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/reusable/Button"
import { Input } from "@/components/reusable/Input"
import {
    MapPinIcon,
    ChevronRightIcon,
    SearchIcon,
    ShoppingBagIcon,
    WhatsappIcon,
    GlobeIcon,
    StoreIcon,
    TruckIcon,
    TagIcon,
    CheckCircleIcon,
    ArrowRightIcon,
    WrenchIcon,
    SparklesIcon,
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

const FEATURED_CATEGORIES = [
    {
        name: "Alimentação",
        slug: "alimentacao",
        iconUrl: "https://img.dudit.com.br/static/categories/products/Alimentacao.png",
    },
    {
        name: "Casa & Utilidades",
        slug: "casa",
        iconUrl: "https://img.dudit.com.br/static/categories/products/Casa-e-utilidades.png",
    },
    {
        name: "Tecnologia",
        slug: "tecnologia",
        iconUrl: "https://img.dudit.com.br/static/categories/products/Tecnologia-e-eletronicos.png",
    },
    {
        name: "Moda & Beleza",
        slug: "moda-e-beleza",
        iconUrl: "https://img.dudit.com.br/static/categories/products/Moda-e-beleza.png",
    },
    {
        name: "Saúde & Bem-Estar",
        slug: "saude",
        iconUrl: "https://img.dudit.com.br/static/categories/products/Saude-e-bem-estar.png",
    },
    {
        name: "Pets",
        slug: "pets",
        iconUrl: "https://img.dudit.com.br/static/categories/products/Pets.png",
    },
    {
        name: "Auto & Moto",
        slug: "automotivo",
        iconUrl: "https://img.dudit.com.br/static/categories/products/Auto-e-moto.png",
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
            ? `Oi! Procurei por produtos e serviços na Dudit em ${cityNameOnly} e ainda não encontrei vendedores. Que tal começar a vender na Dudit? É 100% gratuito e com 0% de comissão: https://dudit.com.br/auth/login?mode=partner`
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
                HERO 1 - LOCALIZAÇÃO / ESCOPO LOCAL & NACIONAL
            ═══════════════════════════════════════════════════════════ */}
            <section className="w-full bg-gradient-to-b from-brand-dark via-brand-dark to-[#093d30] text-white relative overflow-hidden">
                <div className="container mx-auto px-4 lg:px-0 max-w-[1100px] py-10 md:py-16 flex flex-col md:flex-row items-center justify-between gap-10 md:gap-14">

                    {/* Texto + Busca */}
                    <div className="flex-grow text-center md:text-left max-w-[650px] z-10">
                        {isCityEmpty && effectiveCityName ? (
                            <>
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-xs text-white/90 text-xs font-semibold mb-4 border border-white/15">
                                    <MapPinIcon size={14} className="text-brand-green shrink-0" />
                                    <span>{effectiveCityName}</span>
                                    <span className="text-white/40">•</span>
                                    <span className="text-white/90">Envio para todo o Brasil</span>
                                </div>
                                <h1 className="text-3xl md:text-[42px] font-black mb-4 leading-tight">
                                    Ainda sem lojas locais em{" "}
                                    <span className="text-brand-green">{effectiveCityName}</span>?
                                </h1>
                                <p className="text-white/80 text-base md:text-lg mb-8 leading-relaxed max-w-xl mx-auto md:mx-0">
                                    Ainda não temos lojas físicas com retirada aqui. Mas você pode comprar de vitrines que entregam em todo o Brasil ou ser o primeiro a cadastrar seu negócio aqui com 0% de comissão.
                                </p>
                            </>
                        ) : (
                            <>
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-xs text-white/90 text-xs font-semibold mb-4 border border-white/15">
                                    <MapPinIcon size={14} className="text-brand-green shrink-0" />
                                    <span>Local & Nacional</span>
                                    <span className="text-white/40">•</span>
                                    <span className="text-white/90">0% de comissão</span>
                                </div>
                                <h1 className="text-3xl md:text-[42px] font-black mb-4 leading-tight">
                                    O que você precisa hoje pode estar na{" "}
                                    <span className="text-brand-green">Dudit.</span>
                                </h1>
                                <p className="text-white/80 text-base md:text-lg mb-8 leading-relaxed max-w-xl mx-auto md:mx-0">
                                    Descubra produtos, serviços e negócios locais pertinho de você ou compre direto de lojas e artesãos que entregam para todo o Brasil.
                                </p>
                            </>
                        )}

                        {/* Campo de Busca de Cidade */}
                        <div className="max-w-md mx-auto md:mx-0 relative mb-6">
                            <Input
                                ref={searchInputRef}
                                id="landingCitySearchInput"
                                name="landingCitySearchInput"
                                placeholder="Digite sua cidade (ex: São Paulo, Londrina...)"
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
                                <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl max-h-52 overflow-y-auto divide-y divide-gray-100 dark:divide-dark-border shadow-2xl">
                                    {filteredCities.map((slug) => (
                                        <button
                                            key={slug}
                                            type="button"
                                            onMouseDown={() => onSelectCitySlug(slug)}
                                            className="w-full text-left px-4 py-3 hover:bg-brand-gray dark:hover:bg-dark-border/40 text-brand-dark dark:text-dark-heading text-sm font-medium flex items-center justify-between transition-colors"
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

                        {/* Ações principais */}
                        <div className="flex flex-wrap gap-3 justify-center md:justify-start items-center">
                            <Button
                                onClick={() => onSelectCitySlug("brasil")}
                                className="bg-brand-green text-white hover:bg-[#047857] shadow-lg shadow-brand-green/20"
                            >
                                <GlobeIcon size={16} className="mr-1.5" />
                                Ver lojas do Brasil todo
                            </Button>

                            <Button
                                variant="outline"
                                onClick={onRequestLocation}
                                disabled={isLocationLoading}
                                className="border-white/20 text-white hover:bg-white/10 dark:bg-transparent dark:text-white"
                            >
                                <MapPinIcon size={16} className="mr-1.5 text-brand-green" />
                                {isLocationLoading ? "Localizando..." : "Usar localização atual"}
                            </Button>

                            {user ? (
                                <Button
                                    variant="outline"
                                    onClick={onOpenAddressModal}
                                    className="border-white/20 text-white hover:bg-white/10 dark:bg-transparent dark:text-white"
                                >
                                    Adicionar Endereço
                                </Button>
                            ) : (
                                <Button
                                    variant="outline"
                                    onClick={onOpenVisitorModal}
                                    className="border-white/20 text-white hover:bg-white/10 dark:bg-transparent dark:text-white"
                                >
                                    Escolher Cidade
                                </Button>
                            )}
                        </div>

                        {/* WhatsApp Invite para cidade vazia */}
                        {isCityEmpty && effectiveCityName && (
                            <p className="mt-4 text-xs text-white/60 text-center md:text-left">
                                Conhece lojistas ou prestadores em {effectiveCityName}?{" "}
                                <button
                                    type="button"
                                    onClick={handleInvite}
                                    className="text-brand-green hover:underline font-bold inline-flex items-center gap-1"
                                >
                                    <WhatsappIcon size={13} />
                                    Indique para vender na Dudit
                                </button>
                            </p>
                        )}

                        {locationError && (
                            <p className="text-red-300 text-sm mt-3 font-semibold">{locationError}</p>
                        )}
                    </div>

                    {/* Mascote Hero */}
                    <div className="w-[200px] md:w-[280px] shrink-0 flex items-center justify-center z-10">
                        {isCityEmpty ? (
                            <img
                                src="https://img.dudit.com.br/static/mascots/EstamosChegando.png"
                                alt="Dudit está em todo o Brasil"
                                className="w-full h-auto object-contain select-none drop-shadow-2xl"
                            />
                        ) : (
                            <img
                                src="https://img.dudit.com.br/static/mascots/OndeVoceEsta.png"
                                alt="O que você precisa hoje?"
                                className="w-full h-auto object-contain select-none drop-shadow-2xl"
                            />
                        )}
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════
                SEÇÃO 1 - CATEGORIAS & ATALHOS DE EXPLORAÇÃO
                (Inspirado no iFood: Restaurante, Mercado + Chips de categorias)
            ═══════════════════════════════════════════════════════════ */}
            <section className="w-full bg-white dark:bg-dark-background py-10 md:py-14 border-b border-gray-100 dark:border-dark-border">
                <div className="container mx-auto px-4 lg:px-0 max-w-[1100px]">
                    <div className="text-center md:text-left mb-8">
                        <span className="text-xs font-bold text-brand-green uppercase tracking-wider block mb-1">
                            O QUE VOCÊ PROCURA?
                        </span>
                        <h2 className="text-2xl md:text-3xl font-black text-brand-dark dark:text-dark-heading">
                            Explore e receba onde estiver
                        </h2>
                        <p className="text-brand-inactive-text dark:text-dark-body text-sm md:text-base mt-1">
                            Compre produtos com envio para todo o Brasil ou encontre prestadores de serviço com contato direto.
                        </p>
                    </div>

                    {/* 2 Grandes Cards Destaque (Estilo iFood: Restaurante e Mercado) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
                        {/* Card Produtos */}
                        <Link
                            href="/explorar/brasil?type=produtos"
                            className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/60 dark:from-dark-surface dark:to-dark-surface border border-emerald-200/60 dark:border-dark-border p-6 md:p-8 flex flex-col justify-between hover:shadow-md transition-all duration-200"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-brand-green text-white mb-3">
                                        <TruckIcon size={12} />
                                        Envio para todo o Brasil
                                    </span>
                                    <h3 className="text-2xl font-black text-brand-dark dark:text-dark-heading group-hover:text-brand-green transition-colors">
                                        Produtos & Lojas
                                    </h3>
                                    <p className="text-brand-inactive-text dark:text-dark-body text-sm mt-2 max-w-sm">
                                        Moda, tecnologia, casa, artesanato e desapegos. Compre de pequenos negócios e receba na sua casa.
                                    </p>
                                </div>
                                <div className="w-14 h-14 rounded-2xl bg-brand-green/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                    <ShoppingBagIcon size={28} className="text-brand-green" />
                                </div>
                            </div>
                            <div className="mt-6 flex items-center gap-2 text-sm font-bold text-brand-green group-hover:translate-x-1 transition-transform">
                                <span>Explorar produtos</span>
                                <ArrowRightIcon size={16} />
                            </div>
                        </Link>

                        {/* Card Serviços */}
                        <Link
                            href={`/explorar/${selectedCitySlug || "brasil"}?type=servicos`}
                            className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100/60 dark:from-dark-surface dark:to-dark-surface border border-blue-200/60 dark:border-dark-border p-6 md:p-8 flex flex-col justify-between hover:shadow-md transition-all duration-200"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-600 text-white mb-3">
                                        <WrenchIcon size={12} />
                                        Agendamentos & Orçamentos
                                    </span>
                                    <h3 className="text-2xl font-black text-brand-dark dark:text-dark-heading group-hover:text-blue-600 transition-colors">
                                        Serviços & Autônomos
                                    </h3>
                                    <p className="text-brand-inactive-text dark:text-dark-body text-sm mt-2 max-w-sm">
                                        Encontre profissionais, consulte avaliações e agende serviços ou solicite orçamentos sem burocracia.
                                    </p>
                                </div>
                                <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                    <WrenchIcon size={28} className="text-blue-600 dark:text-blue-400" />
                                </div>
                            </div>
                            <div className="mt-6 flex items-center gap-2 text-sm font-bold text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform">
                                <span>Buscar serviços</span>
                                <ArrowRightIcon size={16} />
                            </div>
                        </Link>
                    </div>

                    {/* Linha de Categorias (Estilo iFood: Bebidas, Farmácia, Pet shop, etc.) */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading uppercase tracking-wide">
                                Categorias populares
                            </h4>
                            <Link
                                href="/explorar/brasil?type=produtos"
                                className="text-xs font-bold text-brand-green hover:underline flex items-center gap-1"
                            >
                                Ver todas
                                <ChevronRightIcon size={14} />
                            </Link>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
                            {FEATURED_CATEGORIES.map((cat) => (
                                <Link
                                    key={cat.slug}
                                    href={`/explorar/brasil/${cat.slug}`}
                                    className="group bg-brand-slate dark:bg-dark-surface/60 border border-gray-100 dark:border-dark-border rounded-xl p-3.5 flex flex-col items-center text-center hover:border-brand-green/40 hover:shadow-xs transition-all duration-200"
                                >
                                    <div className="w-12 h-12 mb-2 flex items-center justify-center">
                                        <img
                                            src={cat.iconUrl}
                                            alt={cat.name}
                                            className="w-10 h-10 object-contain group-hover:scale-110 transition-transform duration-200"
                                            loading="lazy"
                                        />
                                    </div>
                                    <span className="text-xs font-bold text-brand-dark dark:text-dark-heading group-hover:text-brand-green transition-colors line-clamp-1">
                                        {cat.name}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════
                SEÇÃO 2 - DESTAQUE NACIONAL: FRETE E 0% DE COMISSÃO
                (Inspirado no iFood Imagem 2: Banners promocionais e destaques)
            ═══════════════════════════════════════════════════════════ */}
            <section className="w-full bg-brand-gray/40 dark:bg-dark-surface/40 py-12 md:py-16 border-b border-gray-100 dark:border-dark-border">
                <div className="container mx-auto px-4 lg:px-0 max-w-[1100px]">
                    <div className="text-center max-w-2xl mx-auto mb-10">
                        <span className="text-xs font-bold text-brand-green uppercase tracking-wider block mb-1">
                            COMPRE DIRETO DE QUEM FAZ
                        </span>
                        <h2 className="text-2xl md:text-3xl font-black text-brand-dark dark:text-dark-heading">
                            {effectiveCityName
                                ? `Lojas e produtores que entregam em ${effectiveCityName}`
                                : "Lojas e produtores que entregam em todo o Brasil"}
                        </h2>
                        <p className="text-brand-inactive-text dark:text-dark-body text-sm md:text-base mt-2 leading-relaxed">
                            A Dudit conecta você a milhares de empreendedores, artesãos e marcas independentes do país inteiro, sem taxas abusivas de intermediação.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        {/* Benefício 1 */}
                        <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-gray-100 dark:border-dark-border shadow-xs">
                            <div className="w-12 h-12 rounded-xl bg-brand-green/10 text-brand-green flex items-center justify-center mb-4">
                                <TruckIcon size={24} />
                            </div>
                            <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading mb-1.5">
                                Envio para todo o Brasil
                            </h3>
                            <p className="text-brand-inactive-text dark:text-dark-body text-xs md:text-sm leading-relaxed">
                                Vendedores preparados para postar para qualquer estado com frete seguro via Correios ou transportadoras.
                            </p>
                        </div>

                        {/* Benefício 2 */}
                        <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-gray-100 dark:border-dark-border shadow-xs">
                            <div className="w-12 h-12 rounded-xl bg-brand-green/10 text-brand-green flex items-center justify-center mb-4">
                                <TagIcon size={24} />
                            </div>
                            <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading mb-1.5">
                                0% de comissão por venda
                            </h3>
                            <p className="text-brand-inactive-text dark:text-dark-body text-xs md:text-sm leading-relaxed">
                                Sem taxas sobre os pedidos dos vendedores. Isso valoriza quem produz e garante preços muito mais justos para você.
                            </p>
                        </div>

                        {/* Benefício 3 */}
                        <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-gray-100 dark:border-dark-border shadow-xs">
                            <div className="w-12 h-12 rounded-xl bg-brand-green/10 text-brand-green flex items-center justify-center mb-4">
                                <WhatsappIcon size={24} />
                            </div>
                            <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading mb-1.5">
                                Contato direto no WhatsApp
                            </h3>
                            <p className="text-brand-inactive-text dark:text-dark-body text-xs md:text-sm leading-relaxed">
                                Fale com o lojista, tire dúvidas sobre medidas e combine pedidos sob encomenda de forma simples e humana.
                            </p>
                        </div>
                    </div>

                    <div className="text-center">
                        <Button
                            onClick={() => onSelectCitySlug("brasil")}
                            className="bg-brand-green text-white hover:bg-[#047857] px-8 py-3"
                        >
                            <GlobeIcon size={16} className="mr-2" />
                            Ver vitrines do Brasil todo
                        </Button>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════
                SEÇÃO 3 - CARDS DUPLOS: DESAPEGAR / CADASTRAR NEGÓCIO
                (Inspirado no iFood Imagem 3: Entregador & Restaurante)
            ═══════════════════════════════════════════════════════════ */}
            <section className="w-full bg-white dark:bg-dark-background py-12 md:py-16">
                <div className="container mx-auto px-4 lg:px-0 max-w-[1100px]">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                        {/* Card A: Desapegos & Venda Avulsa */}
                        <div className="bg-brand-slate dark:bg-dark-surface/60 border border-gray-100 dark:border-dark-border rounded-3xl p-8 flex flex-col justify-between relative overflow-hidden">
                            <div>
                                <span className="text-[11px] font-bold text-brand-green uppercase tracking-wider block mb-2">
                                    DESAPEGOS E PRODUTOS
                                </span>
                                <h3 className="text-2xl font-black text-brand-dark dark:text-dark-heading mb-3">
                                    Tem algo para desapegar ou vender?
                                </h3>
                                <p className="text-brand-inactive-text dark:text-dark-body text-sm leading-relaxed mb-6">
                                    Anuncie itens usados, seminovos ou seus próprios produtos em minutos. Encontre compradores na sua região ou envie para todo o país sem comissões.
                                </p>
                            </div>

                            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-4 border-t border-gray-100 dark:border-dark-border/40">
                                <Button
                                    variant="outline"
                                    onClick={handleSellerClick}
                                    className="w-full sm:w-auto px-6 py-2.5 text-sm font-bold"
                                >
                                    Começar a anunciar
                                </Button>
                                <div className="w-24 h-24 shrink-0 flex items-center justify-center">
                                    <img
                                        src="https://img.dudit.com.br/static/mascots/Carousel6.png"
                                        alt="Desapegue na Dudit"
                                        className="w-full h-auto object-contain select-none"
                                        loading="lazy"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Card B: Empreendedores e Prestadores */}
                        <div className="bg-brand-slate dark:bg-dark-surface/60 border border-gray-100 dark:border-dark-border rounded-3xl p-8 flex flex-col justify-between relative overflow-hidden">
                            <div>
                                <span className="text-[11px] font-bold text-brand-green uppercase tracking-wider block mb-2">
                                    PARA O SEU NEGÓCIO
                                </span>
                                <h3 className="text-2xl font-black text-brand-dark dark:text-dark-heading mb-3">
                                    {effectiveCityName
                                        ? `Tem um negócio em ${effectiveCityName}?`
                                        : "Tem uma loja ou presta serviços?"}
                                </h3>
                                <p className="text-brand-inactive-text dark:text-dark-body text-sm leading-relaxed mb-6">
                                    {effectiveCityName
                                        ? `Seja a primeira vitrine da sua cidade na Dudit! Ganhe visibilidade local e nacional com link na bio, catálogo online e pedidos no WhatsApp com 0% de comissão.`
                                        : "Abra sua vitrine online, organize pedidos e clientes em um só lugar e venda na sua região ou para todo o Brasil sem intermediários."}
                                </p>
                            </div>

                            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-4 border-t border-gray-100 dark:border-dark-border/40">
                                <Button
                                    onClick={handleSellerClick}
                                    className="w-full sm:w-auto bg-brand-green text-white hover:bg-[#047857] px-6 py-2.5 text-sm font-bold"
                                >
                                    Criar vitrine grátis
                                </Button>
                                <div className="w-24 h-24 shrink-0 flex items-center justify-center">
                                    <img
                                        src="https://img.dudit.com.br/static/mascots/Carousel1.png"
                                        alt="Venda na Dudit"
                                        className="w-full h-auto object-contain select-none"
                                        loading="lazy"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════
                SEÇÃO 4 - VALORES INSTITUCIONAIS: DESCUBRA, ANUNCIE, ORGANIZE
                (Alinhado com a página institucional Dudit)
            ═══════════════════════════════════════════════════════════ */}
            <section className="w-full bg-brand-slate dark:bg-dark-surface/30 py-12 md:py-16 border-t border-gray-100 dark:border-dark-border">
                <div className="container mx-auto px-4 lg:px-0 max-w-[1100px]">
                    <div className="text-center max-w-2xl mx-auto mb-12">
                        <span className="text-xs font-bold text-brand-green uppercase tracking-wider block mb-1">
                            MAIS QUE UM MARKETPLACE
                        </span>
                        <h2 className="text-2xl md:text-3xl font-black text-brand-dark dark:text-dark-heading">
                            O que dá pra fazer na Dudit
                        </h2>
                        <p className="text-brand-inactive-text dark:text-dark-body text-sm md:text-base mt-2">
                            A Dudit conecta o que as pessoas procuram com o que os negócios e profissionais oferecem.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Descubra */}
                        <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-gray-100 dark:border-dark-border flex flex-col justify-between">
                            <div>
                                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4">
                                    <ShoppingBagIcon size={20} />
                                </div>
                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-2">
                                    Descubra
                                </h3>
                                <p className="text-brand-inactive-text dark:text-dark-body text-xs md:text-sm leading-relaxed">
                                    Encontre lojas, produtos, serviços e oportunidades perto de você ou em qualquer cidade do Brasil com envio seguro.
                                </p>
                            </div>
                            <div className="mt-6 pt-4 border-t border-gray-50 dark:border-dark-border/40 text-xs font-bold text-brand-green flex items-center gap-1">
                                <span>Compre sem comissão embutida</span>
                            </div>
                        </div>

                        {/* Anuncie */}
                        <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-gray-100 dark:border-dark-border flex flex-col justify-between">
                            <div>
                                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-brand-green flex items-center justify-center mb-4">
                                    <StoreIcon size={20} />
                                </div>
                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-2">
                                    Anuncie
                                </h3>
                                <p className="text-brand-inactive-text dark:text-dark-body text-xs md:text-sm leading-relaxed">
                                    Mostre o que você vende com um catálogo limpo, link na bio profissional e facilite para clientes encontrarem você.
                                </p>
                            </div>
                            <div className="mt-6 pt-4 border-t border-gray-50 dark:border-dark-border/40 text-xs font-bold text-brand-green flex items-center gap-1">
                                <span>Mais uma vitrine aberta 24h</span>
                            </div>
                        </div>

                        {/* Organize */}
                        <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-gray-100 dark:border-dark-border flex flex-col justify-between">
                            <div>
                                <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-4">
                                    <CheckCircleIcon size={20} />
                                </div>
                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-2">
                                    Organize
                                </h3>
                                <p className="text-brand-inactive-text dark:text-dark-body text-xs md:text-sm leading-relaxed">
                                    Gestão simples de pedidos, clientes e agendamentos. 0% de comissão por venda: 100% do valor recebido fica com você.
                                </p>
                            </div>
                            <div className="mt-6 pt-4 border-t border-gray-50 dark:border-dark-border/40 text-xs font-bold text-brand-green flex items-center gap-1">
                                <span>100% do valor da venda é seu</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════════════════
                SEÇÃO 5 - BANNER FINAL: CONVITE PARA VENDER E PLANOS
            ═══════════════════════════════════════════════════════════ */}
            <section className="py-12 px-4 bg-white dark:bg-dark-background">
                <div className="max-w-[1100px] mx-auto">
                    <div className="bg-gradient-to-r from-brand-dark to-[#093d30] rounded-3xl p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8 md:gap-12 text-white relative overflow-hidden shadow-xl">
                        {/* Texto + Ações */}
                        <div className="flex-1 text-center md:text-left z-10 max-w-xl">
                            <span className="text-xs font-bold text-brand-green uppercase tracking-wider block mb-2">
                                COMECE HOJE MESMO
                            </span>
                            <h2 className="text-2xl md:text-[34px] font-black mb-3 leading-tight">
                                Venda na sua cidade ou envie para todo o Brasil.
                            </h2>
                            <p className="text-white/80 text-sm md:text-base leading-relaxed mb-6">
                                Crie sua vitrine em minutos, receba pedidos pelo WhatsApp ou direto na Dudit e venda com 0% de comissão. Sem taxas por pedido ou surpresas no fim do mês.
                            </p>
                            <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                                <Button asChild className="bg-brand-green text-white hover:bg-[#047857] h-11 px-7 font-bold">
                                    <Link href="/auth/login?mode=partner" prefetch={false}>
                                        Começar Grátis
                                    </Link>
                                </Button>
                                <Button
                                    asChild
                                    variant="outline"
                                    className="border-white/20 text-white hover:bg-white/10 dark:bg-transparent dark:text-white h-11 px-7"
                                >
                                    <Link href="/institucional/planos" prefetch={false}>
                                        Conhecer Planos
                                    </Link>
                                </Button>
                            </div>
                        </div>

                        {/* Mascote Dino */}
                        <div className="w-[180px] md:w-[240px] shrink-0 flex items-center justify-center z-10">
                            <img
                                src="https://img.dudit.com.br/static/mascots/Carousel2.png"
                                alt="Faça parte da Dudit"
                                className="w-full h-auto object-contain select-none drop-shadow-2xl"
                                loading="lazy"
                            />
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )
}
