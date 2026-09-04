"use client"

import React, { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/reusable/Button"
import { Input } from "@/components/reusable/Input"
import {
    MapPinIcon,
    SearchIcon,
    ShoppingBagIcon,
    StoreIcon,
    TrendingUpIcon,
    CheckIcon,
    WhatsappIcon,
    CalendarIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    ArrowRightIcon,
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
    const [openSellerIndex, setOpenSellerIndex] = useState<number | null>(0)

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
            router.push("/erp/trocar-erp")
        } else {
            router.push("/auth/login?mode=partner")
        }
    }

    const effectiveCityName = selectedCityName && selectedCityName !== "Brasil" ? selectedCityName : null

    const bentoCards = [
        {
            title: "Precisa de alguma coisa?",
            subtitle: "PARA QUEM PROCURA",
            description: "Encontrar lojas, produtos, serviços e oportunidades perto de você.",
            type: "buy",
        },
        {
            title: "Tem algo para vender?",
            subtitle: "DESAPEGOS E PRODUTOS",
            description: "Anuncie produtos, serviços ou qualquer coisa de forma simples.",
            type: "sell",
        },
        {
            title: "Tem um negócio?",
            subtitle: "PARA EMPREENDEDORES",
            description: "Mostre o que você vende e facilite para clientes encontrarem você.",
            type: "store",
        },
        {
            title: "Precisa marcar um horário?",
            subtitle: "AGENDAMENTOS",
            description: "Encontre profissionais e agende serviços na hora, sem espera.",
            type: "schedule",
        },
    ]

    const sellerItems = [
        {
            num: "01",
            title: "Mais uma vitrine",
            desc: "Chegue até mais pessoas da sua cidade. Sua loja aparece para quem está procurando exatamente o que você vende.",
        },
        {
            num: "02",
            title: "Contato direto",
            desc: "Clientes chamam no WhatsApp ou compram direto na sua vitrine. Sem intermediários, sem complicação.",
        },
        {
            num: "03",
            title: "Sem comissão",
            desc: "100% do lucro da venda fica com você. A Dudit não cobra comissão sobre suas vendas.",
        },
        {
            num: "04",
            title: "Link na bio",
            desc: "Tenha um catálogo limpo e profissional para compartilhar nas suas redes sociais. Seu link único para usar no Instagram.",
        },
    ]

    const buyerItems = [
        {
            icon: SearchIcon,
            title: "Encontre o que precisa",
            desc: "Comprar novos ou usados, encontrar serviços, descobrir negócios próximos ou resolver uma necessidade do dia a dia. Quando precisar de alguma coisa, dê uma olhada na Dudit.",
        },
        {
            icon: ShoppingBagIcon,
            title: "Produtos & Serviços",
            desc: "De eletrônicos a roupas, de marmitas a encanadores. Tudo organizado para você encontrar rápido o que precisa, perto de você.",
        },
        {
            icon: WhatsappIcon,
            title: "Contato direto",
            desc: "Tire dúvidas no WhatsApp de quem vende, compare opções e feche o negócio sem burocracia. Direto com o vendedor.",
        },
    ]

    return (
        <div className="w-full flex flex-col font-sans">
            {/* 1. HERO COM LOCALIZAÇÃO E MOCKUP INSTITUCIONAL */}
            <section className="relative bg-white pt-6 sm:pt-10 pb-16 overflow-hidden flex flex-col justify-center dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">
                <div className="flex-1 flex flex-col container mx-auto px-4 lg:px-0 max-w-[1400px] w-full">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <div>
                            {isCityEmpty && effectiveCityName ? (
                                <span className="text-xs font-medium tracking-wider uppercase mb-3 block text-brand-green">
                                    ESTAMOS CHEGANDO NA SUA REGIÃO
                                </span>
                            ) : (
                                <span className="text-xs font-medium tracking-wider uppercase mb-3 block text-brand-inactive-text dark:text-dark-body">
                                    CONECTANDO A SUA CIDADE
                                </span>
                            )}

                            <h1 className="text-4xl md:text-5xl font-bold text-brand-dark dark:text-dark-heading mb-4 tracking-tight leading-tight">
                                {isCityEmpty && effectiveCityName ? (
                                    <>
                                        Estamos chegando em{" "}
                                        <span className="text-brand-green">{effectiveCityName}.</span>
                                    </>
                                ) : (
                                    <>
                                        O que você precisa hoje pode estar na{" "}
                                        <span className="text-brand-green">Dudit.</span>
                                    </>
                                )}
                            </h1>

                            <p className="text-brand-inactive-text dark:text-dark-body text-base md:text-lg mb-8 max-w-lg leading-relaxed">
                                {isCityEmpty && effectiveCityName
                                    ? `Ainda não temos vendedores ou produtos cadastrados em ${effectiveCityName}. Você pode trocar de cidade abaixo ou ser o pioneiro e começar a vender na sua cidade de graça, sem comissão nenhuma.`
                                    : "Descubra produtos, serviços e negócios perto de você. Compre, anuncie ou agende de um jeito simples."}
                            </p>

                            {/* Campo de Endereço / Cidade do Dudit */}
                            <div className="border border-gray-200 dark:border-dark-border rounded-xl p-4 bg-white dark:bg-dark-surface max-w-lg">
                                <label
                                    htmlFor="landingCityInput"
                                    className="block text-xs font-medium text-brand-dark dark:text-dark-heading mb-2"
                                >
                                    Informe sua cidade para ver os itens perto de você:
                                </label>

                                <div className="relative">
                                    <Input
                                        id="landingCityInput"
                                        name="landingCityInput"
                                        placeholder="Digite sua cidade (ex: Londrina, São Paulo...)"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        prefix={<MapPinIcon size={18} className="text-brand-green" />}
                                    />

                                    {filteredCities.length > 0 && (
                                        <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-dark-border">
                                            {filteredCities.map((slug) => (
                                                <button
                                                    key={slug}
                                                    type="button"
                                                    onClick={() => onSelectCitySlug(slug)}
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

                                <div className="flex flex-wrap gap-2 mt-3">
                                    <Button
                                        variant="default"
                                        onClick={onRequestLocation}
                                        disabled={isLocationLoading}
                                        className="text-xs py-2 px-4"
                                    >
                                        {isLocationLoading ? "Localizando..." : "Usar localização atual"}
                                    </Button>

                                    {user ? (
                                        <Button
                                            variant="outline"
                                            onClick={onOpenAddressModal}
                                            className="text-xs py-2 px-4"
                                        >
                                            Cadastrar endereço
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            onClick={onOpenVisitorModal}
                                            className="text-xs py-2 px-4"
                                        >
                                            Ver todas as cidades
                                        </Button>
                                    )}
                                </div>

                                {locationError && (
                                    <p className="text-brand-red text-xs mt-2 font-medium">{locationError}</p>
                                )}
                            </div>
                        </div>

                        {/* Coluna Direita: Mockup Oficial Institucional do Dudit */}
                        <div className="relative">
                            <div className="bg-white rounded-xl overflow-hidden border border-gray-100 dark:bg-dark-surface dark:border-dark-border">
                                <div className="bg-gray-50 dark:bg-dark-border/40 p-3 border-b border-gray-100 dark:border-dark-border flex items-center gap-2">
                                    <div className="flex gap-1.5">
                                        <div className="w-2.5 h-2.5 rounded-full bg-brand-red"></div>
                                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400"></div>
                                        <div className="w-2.5 h-2.5 rounded-full bg-brand-green"></div>
                                    </div>
                                    <div className="bg-white dark:bg-dark-surface px-3 py-1 rounded text-[10px] text-brand-inactive-text flex-1 text-center font-mono border border-gray-100 dark:border-dark-border">
                                        dudit.com.br
                                    </div>
                                </div>

                                <div className="p-6 space-y-3">
                                    <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-100 dark:border-blue-900/40">
                                        <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center text-blue-600">
                                            <ShoppingBagIcon size={16} />
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                Descubra
                                            </div>
                                            <div className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                Produtos, serviços e negócios perto de você
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-100 dark:border-green-900/40">
                                        <div className="w-8 h-8 bg-green-100 dark:bg-green-900/50 rounded-lg flex items-center justify-center text-green-600">
                                            <StoreIcon size={16} />
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                Anuncie
                                            </div>
                                            <div className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                Seja descoberto por mais pessoas
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-100 dark:border-purple-900/40">
                                        <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/50 rounded-lg flex items-center justify-center text-purple-600">
                                            <CheckIcon size={16} />
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                Organize
                                            </div>
                                            <div className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                Gestão simples para o seu dia a dia
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-3 border-t border-gray-100 dark:border-dark-border flex items-center justify-between">
                                        <div className="text-center">
                                            <div className="text-xl font-bold text-brand-green">0%</div>
                                            <div className="text-[10px] text-brand-inactive-text dark:text-dark-body">
                                                comissão
                                            </div>
                                        </div>
                                        <div className="h-8 w-px bg-gray-100 dark:bg-dark-border"></div>
                                        <div className="text-center">
                                            <div className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                                                100%
                                            </div>
                                            <div className="text-[10px] text-brand-inactive-text dark:text-dark-body">
                                                do lucro é seu
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 2. O QUE DÁ PRA FAZER NA DUDIT (Bento Features) */}
            <section className="py-20 bg-white dark:bg-dark-surface relative border-t border-gray-100 dark:border-dark-border">
                <div className="max-w-[1400px] w-full mx-auto px-4 lg:px-0">
                    <div className="mb-12 max-w-2xl">
                        <span className="text-sm font-medium tracking-wider uppercase mb-3 block text-brand-inactive-text dark:text-dark-body">
                            RESOLVER O QUE VOCÊ PRECISA HOJE
                        </span>
                        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-brand-dark dark:text-dark-heading">
                            O que dá pra fazer na Dudit
                        </h2>
                    </div>

                    <p className="text-brand-inactive-text dark:text-dark-body max-w-2xl mb-12 text-base -mt-8">
                        A Dudit conecta o que as pessoas procuram com o que os negócios e profissionais oferecem.
                    </p>

                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {bentoCards.map((card, idx) => (
                            <div key={idx} className="flex flex-col justify-between">
                                <div className="bg-brand-slate dark:bg-dark-border/40 border border-gray-100 dark:border-dark-border h-64 rounded-xl overflow-hidden relative p-6 flex items-center justify-center">
                                    {card.type === "buy" && (
                                        <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[220px] rounded-lg border border-gray-100 dark:border-dark-border text-xs">
                                            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-50 dark:border-dark-border">
                                                <SearchIcon size={14} className="text-brand-green" />
                                                <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">
                                                    Buscar na sua cidade
                                                </span>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="bg-gray-50 dark:bg-dark-border/40 p-2 rounded flex items-center justify-between">
                                                    <span className="text-[10px] text-brand-dark dark:text-dark-heading font-medium">
                                                        Bolo Caseiro
                                                    </span>
                                                    <span className="text-[8px] text-brand-green font-bold">600m</span>
                                                </div>
                                                <div className="bg-gray-50 dark:bg-dark-border/40 p-2 rounded flex items-center justify-between">
                                                    <span className="text-[10px] text-brand-dark dark:text-dark-heading font-medium">
                                                        Oficina Mecânica
                                                    </span>
                                                    <span className="text-[8px] text-blue-600 font-bold">1.2 km</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {card.type === "sell" && (
                                        <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[220px] rounded-lg border border-gray-100 dark:border-dark-border text-xs">
                                            <div className="flex justify-between mb-3 border-b border-gray-50 dark:border-dark-border pb-2">
                                                <span className="text-[10px] font-bold text-brand-inactive-text uppercase">
                                                    Novo anúncio
                                                </span>
                                                <div className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-[8px] font-bold">
                                                    Ativo
                                                </div>
                                            </div>
                                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-0.5">
                                                Violão Seminovo
                                            </div>
                                            <div className="text-brand-green font-extrabold text-xs mb-3">
                                                R$ 280,00
                                            </div>
                                            <div className="w-full bg-brand-green text-white py-1.5 rounded text-[9px] font-bold text-center flex items-center justify-center gap-1">
                                                <WhatsappIcon size={10} /> Chamar no WhatsApp
                                            </div>
                                        </div>
                                    )}

                                    {card.type === "store" && (
                                        <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[220px] rounded-lg border border-gray-100 dark:border-dark-border text-xs">
                                            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-50 dark:border-dark-border">
                                                <StoreIcon size={16} className="text-brand-dark dark:text-dark-heading" />
                                                <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">
                                                    Sua Vitrine Online
                                                </span>
                                            </div>
                                            <div className="bg-gray-50 dark:bg-dark-border/40 p-2 rounded text-[9px] font-mono text-brand-inactive-text mb-2 text-center">
                                                dudit.com.br/sualoja
                                            </div>
                                            <div className="bg-brand-green/10 text-brand-green text-[9px] font-bold py-1 rounded text-center">
                                                Aberta para clientes locais
                                            </div>
                                        </div>
                                    )}

                                    {card.type === "schedule" && (
                                        <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[220px] rounded-lg border border-gray-100 dark:border-dark-border text-xs">
                                            <div className="flex justify-between items-center mb-3 border-b border-gray-50 dark:border-dark-border pb-2">
                                                <span className="text-[10px] font-bold text-brand-inactive-text uppercase">
                                                    Agenda Hoje
                                                </span>
                                                <CalendarIcon size={12} className="text-brand-inactive-text" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <div className="flex justify-between items-center bg-blue-50 dark:bg-blue-950/40 p-1.5 rounded text-[10px]">
                                                    <span className="font-bold text-blue-800 dark:text-blue-300">
                                                        14:00 - Corte
                                                    </span>
                                                    <span className="text-blue-600 dark:text-blue-400 font-semibold text-[8px]">
                                                        Disponível
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center bg-gray-50 dark:bg-dark-border/40 p-1.5 rounded text-[10px]">
                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                        16:30 - Manutenção
                                                    </span>
                                                    <span className="text-brand-green font-semibold text-[8px]">
                                                        Agendar
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="pt-5">
                                    <span className="text-[10px] font-bold text-brand-green uppercase tracking-wider block mb-1">
                                        {card.subtitle}
                                    </span>
                                    <h4 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-1">
                                        {card.title}
                                    </h4>
                                    <p className="text-brand-inactive-text dark:text-dark-body text-xs leading-relaxed">
                                        {card.description}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 3. PARA QUEM PROCURA */}
            <section className="relative py-20 bg-white dark:bg-dark-surface border-t border-gray-100 dark:border-dark-border">
                <div className="max-w-[1400px] w-full mx-auto px-4 lg:px-0">
                    <div className="mb-8 max-w-2xl">
                        <span className="text-sm font-medium tracking-wider uppercase mb-3 block text-brand-inactive-text dark:text-dark-body">
                            PARA QUEM PROCURA
                        </span>
                        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-brand-dark dark:text-dark-heading">
                            O que você procura?
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-0 mt-8">
                        {buyerItems.map((item, idx) => {
                            const IconComponent = item.icon
                            return (
                                <div
                                    key={idx}
                                    className={`py-8 px-8 ${
                                        idx < buyerItems.length - 1
                                            ? "md:border-r md:border-dashed md:border-gray-200 dark:md:border-dark-border"
                                            : ""
                                    } ${
                                        idx < buyerItems.length - 1
                                            ? "border-b md:border-b-0 border-dashed border-gray-200 dark:border-dark-border"
                                            : ""
                                    }`}
                                >
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 bg-brand-dark rounded-xl flex items-center justify-center text-white shrink-0">
                                            <IconComponent size={20} />
                                        </div>
                                        <h4 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                                            {item.title}
                                        </h4>
                                    </div>
                                    <p className="text-brand-inactive-text dark:text-dark-body text-sm leading-relaxed">
                                        {item.desc}
                                    </p>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </section>

            {/* 4. PARA QUEM VENDE */}
            <section className="relative py-20 bg-white dark:bg-dark-surface border-t border-gray-100 dark:border-dark-border">
                <div className="max-w-[1400px] w-full mx-auto px-4 lg:px-0">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                        {/* Lado esquerdo: Imagem institucional de vendedor */}
                        <div>
                            <div className="bg-brand-green-light dark:bg-dark-border/40 rounded-3xl p-6 md:p-10">
                                <div className="rounded-2xl overflow-hidden">
                                    <img
                                        src="https://img.dudit.com.br/static/institucional/vendedor.jpg"
                                        alt="Vendedor usando a Dudit"
                                        className="w-full h-auto object-cover aspect-[4/5]"
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement
                                            target.style.display = "none"
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Lado direito: Accordion de vantagens */}
                        <div>
                            <span className="text-sm font-medium tracking-wider uppercase mb-4 block text-brand-inactive-text dark:text-dark-body">
                                MAIS UMA PORTA ABERTA
                            </span>
                            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-brand-dark dark:text-dark-heading mb-6">
                                Seu negócio também pode ser encontrado na Dudit
                            </h2>
                            <p className="text-brand-inactive-text dark:text-dark-body text-base leading-relaxed mb-8">
                                Você já usa Instagram e WhatsApp? Continue usando. A Dudit é mais uma vitrine para seus produtos e serviços chegarem até mais pessoas.
                            </p>

                            <div className="space-y-0">
                                {sellerItems.map((item, idx) => {
                                    const isOpen = openSellerIndex === idx
                                    return (
                                        <div
                                            key={idx}
                                            className={`border-t border-gray-200 dark:border-dark-border ${
                                                idx === sellerItems.length - 1 ? "border-b" : ""
                                            }`}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => setOpenSellerIndex(isOpen ? null : idx)}
                                                className="w-full flex items-center gap-4 py-5 text-left cursor-pointer"
                                            >
                                                <span className="text-sm font-medium text-brand-inactive-text w-8 shrink-0">
                                                    {item.num}.
                                                </span>
                                                <span className="text-lg font-bold flex-1 text-brand-dark dark:text-dark-heading">
                                                    {item.title}
                                                </span>
                                                <ChevronDownIcon
                                                    size={18}
                                                    className={`text-brand-inactive-text transition-transform duration-200 shrink-0 ${
                                                        isOpen ? "rotate-180" : ""
                                                    }`}
                                                />
                                            </button>
                                            {isOpen && (
                                                <div className="pb-5 pl-12 pr-8">
                                                    <p className="text-brand-inactive-text dark:text-dark-body text-sm leading-relaxed">
                                                        {item.desc}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>

                            <div className="mt-8">
                                <Button
                                    variant="default"
                                    onClick={handleSellerClick}
                                    className="py-3 px-6"
                                    rightIcon={<ArrowRightIcon size={16} />}
                                >
                                    Começar a vender na Dudit
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 5. BANNER CTA FINAL DO DUDIT */}
            <section className="py-20 px-4 bg-white dark:bg-dark-surface border-t border-gray-100 dark:border-dark-border">
                <div className="max-w-[1400px] mx-auto">
                    <div className="bg-brand-dark rounded-3xl p-10 md:p-16 text-center relative overflow-hidden">
                        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                            Pronto para vender na sua cidade?
                        </h2>
                        <p className="text-base md:text-lg text-gray-300 mb-8 max-w-xl mx-auto leading-relaxed">
                            Crie sua vitrine em minutos, receba pedidos direto no celular e mantenha 100% do seu lucro.
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
            </section>
        </div>
    )
}
