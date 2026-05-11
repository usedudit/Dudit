"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Search, StarIcon, ArrowLeftIcon, MapPinIcon, ChevronDownIcon, ChevronUpIcon, ChevronRightIcon, ShareIcon, HeartIcon, WhatsappIcon, FlagIcon, Check } from "@/lib/icons"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { getProductUrl } from "@/lib/utils/url-generator"
import IconPlaceholder from "@/components/reusable/IconPlaceholder"
import { ShareModal } from "./ShareModal"
import { ReportModal } from "./ReportModal"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { getRandomDefaultBanner } from "@/lib/utils/banner"
import { useSupabase } from "@/providers/supabase-provider"
import { formatCurrency, formatDate, formatMonth, formatYear, formatNumber } from "@/lib/utils"
import { normalizeOpeningHours } from "@/lib/utils/opening-hours"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import { useTransitionDirection } from "@/providers/transition-provider"
import { ShoppingBagIcon } from "@/lib/icons"
import BottomSheet from "@/components/BottomSheet"
import { Button } from "@/components/reusable/Button"
import { PackageIcon } from "lucide-react"
import { DefaultModal } from "@/components/reusable"

const AVAILABLE_BRANDS = [
    { id: "american_express", label: "American Express", image: "https://img.dudit.com.br/static/icons/payments/Amex.png" },
    { id: "diners", label: "Diners Club", image: "https://img.dudit.com.br/static/icons/payments/Diners.png" },
    { id: "discover", label: "Discover", image: "https://img.dudit.com.br/static/icons/payments/Discover.png" },
    { id: "elo", label: "Elo", image: "https://img.dudit.com.br/static/icons/payments/Elo.png" },
    { id: "hipercard", label: "Hipercard", image: "https://img.dudit.com.br/static/icons/payments/Hipercard.png" },
    { id: "jcb", label: "JCB", image: "https://img.dudit.com.br/static/icons/payments/JCB.png" },
    { id: "mastercard", label: "Mastercard", image: "https://img.dudit.com.br/static/icons/payments/Mastercard.png" },
    { id: "visa", label: "Visa", image: "https://img.dudit.com.br/static/icons/payments/Visa.png" },
]

// --- TYPES ---
interface VendorPageClientProps {
    partner: any
    products: any[]
    services: any[]
    reviews: any[]
    stats: any
    ratingDistribution: { star: number; count: number }[]
    productCategories: string[]
    serviceCategories: string[]
    userProfile?: any
    cartCount?: number
}

// --- CONSTANTS ---
const SORT_OPTIONS = ["Mais recentes", "Mais vendidos", "Preço: menor para maior", "Preço: maior para menor"]

const SORT_STRATEGIES: Record<string, (a: any, b: any) => number> = {
    "Mais recentes": (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    "Mais vendidos": (a, b) => (b.sales_count || 0) - (a.sales_count || 0),
    "Preço: menor para maior": (a, b) => (a.promotional_price || a.price) - (b.promotional_price || b.price),
    "Preço: maior para menor": (a, b) => (b.promotional_price || b.price) - (a.promotional_price || a.price),
}

const getImageUrl = (path?: string | null) => getR2ImageUrl(path)

const formatJoinDate = (createdAt: string | Date) => {
    const month = formatMonth(createdAt)
    const capitalizedMonth = month.charAt(0).toUpperCase() + month.slice(1)
    return `Entrou em ${capitalizedMonth} de ${formatYear(createdAt)}`
}

const openWhatsApp = (phone?: string, storeName?: string) => {
    const cleaned = phone?.replace(/\D/g, "") ?? ""
    const number = cleaned.startsWith("55") ? cleaned : `55${cleaned}`
    const text = encodeURIComponent(`Olá, ${storeName || "tudo bem"}! Vi sua loja na Dudit e gostaria de saber mais. 😊`)
    window.open(`https://wa.me/${number}?text=${text}`, "_blank")
}

const formatOpeningHoursList = (hours: any) => {
    if (typeof hours === 'string') return [];
    if (!hours || typeof hours !== 'object' || Object.keys(hours).length === 0) {
        return [];
    }
    const normalizedHours = normalizeOpeningHours(hours)

    const daysMap: Record<string, string> = {
        monday: "Segunda-feira",
        tuesday: "Terça-feira",
        wednesday: "Quarta-feira",
        thursday: "Quinta-feira",
        friday: "Sexta-feira",
        saturday: "Sábado",
        sunday: "Domingo"
    };

    const currentDayIndex = new Date().getDay();
    const daysKeys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const currentDayKey = daysKeys[currentDayIndex];

    return Object.entries(normalizedHours)
        .sort((a, b) => {
            const order = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
            return order.indexOf(a[0]) - order.indexOf(b[0]);
        })
        .map(([key, value]: [string, any]) => {
            const dayName = daysMap[key] || key;
            const isCurrentDay = key === currentDayKey;
            const timeString = value?.enabled ? `${value.from} - ${value.to}` : "Fechado";
            return { dayName, timeString, isCurrentDay };
        });
};

// --- SUB-COMPONENTS ---

const StoreStats = ({ rating, sales, createdAt, reviewsCount }: any) => (
    <div className="flex items-center justify-between mb-8">
        <StatItem
            value={rating > 0 ? formatNumber(rating, 1, 1) : "-"}
            label="Avaliação"
            icon={rating > 0 ? <StarIcon size={14} fill="brand-green" className="text-brand-green" /> : null}
        />
        <div className="w-[1px] h-8 bg-brand-border" />
        <StatItem value={sales >= 1000 ? `${formatNumber(sales / 1000, 1, 1)}k` : sales} label="Vendas" />
        <div className="w-[1px] h-8 bg-brand-border" />
        <StatItem value={formatJoinDate(createdAt)} label="Na Dudit" />
    </div>
)

const StatItem = ({ value, label, icon }: any) => (
    <div className="flex flex-col items-center flex-1">
        <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[16px] font-semibold text-brand-dark">{value}</span>
            {icon}
        </div>
        <span className="text-[11px] text-brand-inactive-text font-medium uppercase tracking-wide">{label}</span>
    </div>
)

const ProductCard = ({ item, partner }: { item: any; partner: any }) => {
    const displayImage = item.images?.[0] ?? item.fallback_variant_image ?? null
    const displayPrice = (!item.promotional_price && item.fallback_variant_price)
        ? item.fallback_variant_price
        : (item.promotional_price || item.price)

    return (
        <Link href={getProductUrl(item, partner)} prefetch={false} className="group cursor-pointer">
            <div className="relative mb-3 overflow-hidden rounded-[16px]">
                <div className="relative w-full aspect-square">
                    <img
                        src={getImageUrl(displayImage) || "https://img.dudit.com.br/static/Placeholder.png"}
                        alt={item.name}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                </div>
            </div>
            <div className="px-1">
                <h3 className="text-[14px] font-normal text-brand-dark mb-1 group-hover:text-brand-green transition-colors line-clamp-2">
                    {item.name}
                </h3>
                <span className="text-[16px] font-bold text-brand-dark">
                    {formatCurrency(displayPrice)}
                </span>
            </div>
        </Link>
    )
}

// Componente de Mapa utilizando Mapbox para melhor performance e estética
const MapboxMap = ({ lat, lng, name, address }: { lat?: number; lng?: number; name?: string; address?: string }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null)
    const mapRef = useRef<any>(null)
    const [isMapping, setIsMapping] = useState(true)

    useEffect(() => {
        let cancelled = false
        const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN

        const initMap = async () => {
            if (cancelled || !mapContainerRef.current || !token) return

            try {
                let finalLat = lat
                let finalLng = lng

                // Never geocode during page rendering; coordinates must already be persisted.
                if (!finalLat || !finalLng || isNaN(Number(finalLat))) {
                    setIsMapping(false)
                    return
                }
                // Carrega CSS do Mapbox se necessário
                if (!document.getElementById("mapbox-gl-css")) {
                    const link = document.createElement("link")
                    link.id = "mapbox-gl-css"
                    link.rel = "stylesheet"
                    link.href = "https://api.mapbox.com/mapbox-gl-js/v3.1.2/mapbox-gl.css"
                    document.head.appendChild(link)
                }

                // Carrega JS do Mapbox se necessário
                if (!(window as any).mapboxgl) {
                    await new Promise((resolve, reject) => {
                        const script = document.createElement("script")
                        script.src = "https://api.mapbox.com/mapbox-gl-js/v3.1.2/mapbox-gl.js"
                        script.async = true
                        script.onload = resolve
                        script.onerror = reject
                        document.head.appendChild(script)
                    })
                }

                if (cancelled || !mapContainerRef.current) return

                const mapboxgl = (window as any).mapboxgl
                mapboxgl.accessToken = token

                // Inicializa o mapa com as coordenadas finais (geocodificadas ou passadas)
                mapRef.current = new mapboxgl.Map({
                    container: mapContainerRef.current,
                    style: "mapbox://styles/mapbox/light-v11",
                    center: [finalLng, finalLat],
                    zoom: 15,
                    attributionControl: false,
                })

                // Adiciona marcador customizado
                const marker = new mapboxgl.Marker({ color: "#059669" })
                    .setLngLat([finalLng, finalLat])
                    .addTo(mapRef.current)

                // Adiciona Popup informativo
                if (name || address) {
                    const popupContent = `
            <div style="padding: 4px; font-family: system-ui, -apple-system, sans-serif;">
              <h4 style="margin: 0 0 2px 0; font-size: 14px; font-weight: 700; color: #111827;">${name}</h4>
              ${address ? `<p style="margin: 0; font-size: 12px; color: #4B5563; line-height: 1.4;">${address}</p>` : ""}
            </div>
          `
                    const popup = new mapboxgl.Popup({ offset: 35, closeButton: false })
                        .setHTML(popupContent)

                    marker.setPopup(popup)

                    // Abre o popup por padrão em telas maiores para facilitar a localização
                    if (window.innerWidth > 1024) {
                        marker.togglePopup()
                    }
                }

            } catch (err) {
                console.error("Mapbox initialization error:", err)
            }
        }

        initMap()

        return () => {
            cancelled = true
            if (mapRef.current) {
                mapRef.current.remove()
            }
        }
    }, [lat, lng, address])

    if (!process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || !isMapping) {
        return (
            <div className="w-full h-full bg-gray-100 flex items-center justify-center p-4 text-center">
                <p className="text-[12px] text-brand-inactive-text">Localização indisponível no mapa.</p>
            </div>
        )
    }

    return <div ref={mapContainerRef} className="w-full h-full bg-gray-100" />
}

const InfoTab = ({ partner, stats }: any) => {
    const hasDescription = Boolean(partner.storeDescription)
    const hoursList = formatOpeningHoursList(partner.openingHours)
    const [isPaymentSheetOpen, setIsPaymentSheetOpen] = useState(false)

    // Extrai métodos de pagamento
    const paymentMethodsArr = partner.paymentMethods || []

    const hasPix = paymentMethodsArr.some((pm: any) => pm.type === "pix" && pm.is_active)
    const hasCash = paymentMethodsArr.some((pm: any) => pm.type === "cash" && pm.is_active)

    const creditMethods = paymentMethodsArr.filter((pm: any) => pm.type === "credit_card" && pm.is_active)
    const debitMethods = paymentMethodsArr.filter((pm: any) => pm.type === "debit_card" && pm.is_active)

    const hasCredit = creditMethods.length > 0
    const hasDebit = debitMethods.length > 0

    const getUniqueBrands = (methods: any[]) => {
        const all = methods.flatMap((pm: any) =>
            (pm.card_brand || "").split(";").map((b: string) => b.trim().toLowerCase()).filter(Boolean)
        )
        return Array.from(new Set(all))
    }

    const creditoBrands = getUniqueBrands(creditMethods)
    const debitoBrands = getUniqueBrands(debitMethods)

    const hasMercadoPago = partner.businessInfo?.mercado_pago_connected || false

    const displayPaymentIcons = []
    if (hasPix) displayPaymentIcons.push({ id: "pix", icon: "https://img.dudit.com.br/static/icons/payments/Pix.png" })
    if (hasCash) displayPaymentIcons.push({ id: "dinheiro", icon: "https://img.dudit.com.br/static/icons/payments/Dinheiro.png" })
    if (hasCredit || hasDebit) {
        displayPaymentIcons.push({ id: "mastercard", icon: "https://img.dudit.com.br/static/icons/payments/Mastercard.png" })
        displayPaymentIcons.push({ id: "visa", icon: "https://img.dudit.com.br/static/icons/payments/Visa.png" })
    }
    if (hasMercadoPago) displayPaymentIcons.push({ id: "mercadopago", icon: "https://img.dudit.com.br/static/icons/payments/MercadoPago.png" })

    return (
        <div className="pb-10 space-y-8 animate-fade-in">
            <div className="hidden lg:block">
                <StoreStats rating={partner.rating} sales={stats.salesCount} createdAt={partner.createdAt} reviewsCount={stats.reviewsCount} />
                <div className="h-[1px] bg-brand-border w-full mb-8" />
            </div>

            {hasDescription && (
                <>
                    <div>
                        <h3 className="text-[18px] font-semibold text-brand-dark mb-4">Sobre {partner.storeName}</h3>
                        <p className="text-[15px] text-brand-inactive-text leading-relaxed whitespace-pre-wrap">{partner.storeDescription}</p>
                    </div>
                    <div className="h-[1px] bg-brand-border w-full" />
                </>
            )}

            {displayPaymentIcons.length > 0 && (
                <>
                    <div>
                        <h3 className="text-[18px] font-semibold text-brand-dark mb-4">Formas de pagamento</h3>
                        <div className="flex items-center gap-2 mb-3 overflow-x-auto hide-scrollbar">
                            {displayPaymentIcons.map(pm => (
                                <div key={pm.id} className="w-[42px] h-[30px] rounded-[4px] border border-brand-border bg-white flex items-center justify-center p-1 shrink-0">
                                    <img src={pm.icon} alt={pm.id} className="w-full h-full object-contain" />
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setIsPaymentSheetOpen(true)} className="text-[14px] font-semibold text-brand-green">
                            Ver mais detalhes
                        </button>
                    </div>
                    <div className="h-[1px] bg-brand-border w-full" />
                </>
            )}

            {hoursList.length > 0 && (
                <>
                    <div>
                        <h3 className="text-[18px] font-semibold text-brand-dark mb-4">Horário de Funcionamento</h3>
                        <div className="space-y-3">
                            {hoursList.map((item: any) => (
                                <div key={item.dayName} className="flex justify-between items-center text-[14px]">
                                    <span className={item.isCurrentDay ? "text-brand-green font-medium" : "text-brand-dark"}>
                                        {item.dayName}
                                    </span>
                                    <span className={item.isCurrentDay ? "text-brand-green font-medium" : "text-brand-inactive-text"}>
                                        {item.timeString}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="h-[1px] bg-brand-border w-full" />
                </>
            )}

            <div>
                <h3 className="text-[18px] font-semibold text-brand-dark mb-4">Endereço</h3>
                <div className="flex items-start gap-3 mb-5">
                    <MapPinIcon size={20} className="text-brand-inactive-text mt-1 shrink-0" />
                    <div>
                        <p className="text-[15px] text-brand-inactive-text">{partner.street}, {partner.number}</p>
                        <p className="text-[15px] text-brand-inactive-text">{partner.city} - {partner.state}</p>
                        <p className="text-[15px] text-brand-inactive-text">CEP: {partner.zipCode}</p>
                    </div>
                </div>
                <div className="w-full h-[150px] lg:h-[260px] rounded-[12px] overflow-hidden bg-gray-100 shrink-0">
                    <MapboxMap
                        lat={partner.lat}
                        lng={partner.lng}
                        name={partner.storeName}
                        address={`${partner.street}, ${partner.number}, ${partner.city}/${partner.state}, CEP: ${partner.zipCode}`}
                    />
                </div>
            </div>

            <DefaultModal
                isOpen={isPaymentSheetOpen}
                onClose={() => setIsPaymentSheetOpen(false)}
                title="Formas de pagamento"
                maxWidth="md"
            >
                <div className="space-y-6">
                    <div>
                        <h3 className="text-[16px] font-semibold text-brand-dark mb-3">Pagamento na entrega</h3>
                        <p className="text-[14px] text-brand-inactive-text mb-4">Abaixo estão as formas de pagamento aceitas diretamente no estabelecimento.</p>
                    </div>

                    {hasDebit && (
                        <div>
                            <h4 className="text-[14px] text-brand-inactive-text mb-3">Cartão de débito</h4>
                            <div className="flex flex-wrap gap-2">
                                {debitoBrands.map((brandId: string) => {
                                    const brand = AVAILABLE_BRANDS.find(b => b.id === brandId)
                                    if (!brand) return null
                                    return (
                                        <div key={brandId} className="h-10 px-3 rounded-[8px] border border-brand-border bg-white flex items-center gap-2">
                                            <img src={brand.image} alt={brand.label} className="h-4 object-contain" />
                                            <span className="text-[14px] text-brand-dark">{brand.label}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {hasCredit && (
                        <div>
                            <h4 className="text-[14px] text-brand-inactive-text mb-3 mt-5">Cartão de crédito</h4>
                            <div className="flex flex-wrap gap-2">
                                {creditoBrands.map((brandId: string) => {
                                    const brand = AVAILABLE_BRANDS.find(b => b.id === brandId)
                                    if (!brand) return null
                                    return (
                                        <div key={brandId} className="h-10 px-3 rounded-[8px] border border-brand-border bg-white flex items-center gap-2">
                                            <img src={brand.image} alt={brand.label} className="h-4 object-contain" />
                                            <span className="text-[14px] text-brand-dark">{brand.label}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {(hasPix || hasCash || hasMercadoPago) && (
                        <div>
                            <h4 className="text-[14px] text-brand-inactive-text mb-3 mt-5">Outros</h4>
                            <div className="flex flex-wrap gap-2">
                                {hasPix && (
                                    <div className="h-10 px-3 rounded-[8px] border border-brand-border bg-white flex items-center gap-2">
                                        <img src="https://img.dudit.com.br/static/icons/payments/Pix.png" alt="Pix" className="h-4 object-contain" />
                                        <span className="text-[14px] text-brand-dark">Pix</span>
                                    </div>
                                )}
                                {hasCash && (
                                    <div className="h-10 px-3 rounded-[8px] border border-brand-border bg-white flex items-center gap-2">
                                        <img src="https://img.dudit.com.br/static/icons/payments/Dinheiro.png" alt="Dinheiro" className="h-4 object-contain" />
                                        <span className="text-[14px] text-brand-dark">Dinheiro</span>
                                    </div>
                                )}
                                {hasMercadoPago && (
                                    <div className="h-10 px-3 rounded-[8px] border border-brand-border bg-white flex items-center gap-2">
                                        <img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="h-4 object-contain" />
                                        <span className="text-[14px] text-brand-dark">Mercado Pago</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </DefaultModal>
        </div>
    )
}

const ReviewsTab = ({ partner, stats, ratingDistribution, reviews }: any) => {
    const hasReviews = reviews.length > 0

    return (
        <div className="pb-10 animate-fade-in">
            {hasReviews ? (
                <>
                    <div className="bg-brand-gray rounded-[16px] p-5 mb-10 flex items-center justify-between max-w-[800px]">
                        <div className="flex flex-col items-center">
                            <span className="text-[48px] font-semibold text-brand-dark leading-none">
                                {partner.rating > 0 ? formatNumber(partner.rating, 1, 1) : "-"}
                            </span>
                            <div className="flex gap-0.5 my-2">
                                {[...Array(5)].map((_, i) => (
                                    <StarIcon
                                        key={i}
                                        size={20}
                                        fill={i < Math.floor(partner.rating) ? "brand-green" : "transparent"}
                                        className={i < Math.floor(partner.rating) ? "text-brand-green" : "text-brand-green"}
                                    />
                                ))}
                            </div>
                            <span className="text-[13px] text-brand-inactive-text font-medium">
                                média de {stats.reviewsCount} avaliações
                            </span>
                        </div>
                        <div className="flex-1 ml-10 space-y-1.5">
                            {ratingDistribution.map((row: any) => (
                                <div key={row.star} className="flex items-center gap-3">
                                    <span className="text-[12px] text-brand-inactive-text w-2">{row.star}</span>
                                    <StarIcon size={10} className="text-brand-inactive-text" />
                                    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-brand-green rounded-full"
                                            style={{ width: `${(row.count / stats.reviewsCount) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-8">
                        {reviews.map((rev: any) => (
                            <div key={rev.id} className="border-b border-brand-border pb-8 last:border-0 relative">
                                <div className="flex items-start gap-4 mb-3">
                                    <div className="w-[50px] h-[50px] rounded-full overflow-hidden shrink-0">
                                        <img src="https://img.dudit.com.br/static/Placeholder.png" className="w-full h-full object-cover" alt="" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[15px] font-semibold text-brand-dark">{rev.profiles?.full_name || "Usuário"}</span>
                                                <span className="text-[10px] text-brand-inactive-text">·</span>
                                                <span className="text-[13px] font-normal text-brand-inactive-text">{formatDate(rev.created_at)}</span>
                                            </div>
                                            <FlagIcon size={14} className="text-gray-300 cursor-pointer hover:text-[#d32f2f] transition-colors" />
                                        </div>
                                        <div className="flex gap-0.5 mb-2">
                                            {[...Array(5)].map((_, i) => (
                                                <StarIcon
                                                    key={i}
                                                    size={14}
                                                    fill={i < rev.rating ? "brand-green" : "transparent"}
                                                    className={i < rev.rating ? "text-brand-green" : "text-brand-green"}
                                                />
                                            ))}
                                        </div>
                                        {rev.comment && (
                                            <p className="text-[15px] text-brand-inactive-text leading-relaxed mb-3">{rev.comment}</p>
                                        )}
                                        <div className="flex items-center gap-3 bg-brand-gray p-2 rounded-[8px] border border-brand-border w-fit cursor-pointer hover:bg-gray-100 transition-colors">
                                            <div className="w-10 h-10 rounded-[6px] overflow-hidden bg-white border border-brand-border">
                                                <img src="https://img.dudit.com.br/static/Placeholder.png" className="w-full h-full object-cover opacity-80" alt="Produto" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[11px] text-brand-inactive-text font-normal leading-tight">Avaliação para:</span>
                                                <span className="text-[13px] font-medium text-brand-dark leading-tight line-clamp-1 max-w-[250px]">{rev.products?.name}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <IconPlaceholder
                    placeholderType="image"
                    imageSrc="https://img.dudit.com.br/static/mascots/Avaliacoes.png"
                    imageAlt="Sem avaliações"
                    title="Ainda não temos avaliações por aqui"
                    subtitle="Seja o primeiro a contar para a comunidade como foi sua experiência!"
                />
            )}
        </div>
    )
}

// Modal genérico de bottom-sheet mobile/desktop

// --- MAIN COMPONENT ---
export function VendorPageClient({ partner, products, services, reviews, stats, ratingDistribution, productCategories, serviceCategories, userProfile, cartCount }: VendorPageClientProps) {
    const router = useRouter()
    const [activeTag, setActiveTag] = useState("todos")
    const [activeSection, setActiveSection] = useState<"products" | "reviews" | "info">("products")
    const [activeContext, setActiveContext] = useState<"Produtos" | "Serviços">("Produtos")
    const [isContextModalOpen, setIsContextModalOpen] = useState(false)
    const [isSortOpen, setIsSortOpen] = useState(false)
    const [mobileModalTab, setMobileModalTab] = useState<"reviews" | "info">("reviews")
    const [isAboutPageOpen, setIsAboutPageOpen] = useState(false)
    const [searchValue, setSearchValue] = useState("")
    const [isDesktopSortOpen, setIsDesktopSortOpen] = useState(false)
    const [selectedSort, setSelectedSort] = useState("Mais recentes")
    const [showShareModal, setShowShareModal] = useState(false)
    const [showReportModal, setShowReportModal] = useState(false)
    const [isMounted, setIsMounted] = useState(false)
    const [isScrolled, setIsScrolled] = useState(false)
    const sortRef = useRef<HTMLDivElement>(null)
    const { setDirection } = useTransitionDirection()
    const { user } = useSupabase()
    const isStoreOwner = user?.id === partner.userId || user?.id === partner.user_id

    useEffect(() => { setIsMounted(true) }, [])

    // Removemos manipulação nativa de URL para não causar bugs de renderização/popstate.

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 10)
        }
        window.addEventListener("scroll", handleScroll, { passive: true })
        return () => window.removeEventListener("scroll", handleScroll)
    }, [])

    const partnerProfileImageUrl = getImageUrl(partner.store_avatar || partner.profile_image_url || partner.storeImageUrl)
    const bannerImage = (partner.banner_url && partner.banner_moderation_status === 'approved')
        ? getImageUrl(partner.banner_url)
        : (partner.banner_url || getRandomDefaultBanner())
    const currentTags = useMemo(
        () => ["todos", ...(activeContext === "Produtos" ? productCategories : serviceCategories)],
        [activeContext, productCategories, serviceCategories]
    )

    const displayItems = useMemo(() => {
        const items = activeContext === "Produtos" ? products : services
        const sorter = SORT_STRATEGIES[selectedSort] ?? SORT_STRATEGIES["Mais recentes"]
        return items
            .filter(item =>
                (activeTag === "todos" || item.category?.toLowerCase() === activeTag.toLowerCase()) &&
                (!searchValue || item.name.toLowerCase().includes(searchValue.toLowerCase()))
            )
            .sort(sorter)
    }, [products, services, activeContext, activeTag, searchValue, selectedSort])

    const shareMessage = useMemo(() => {
        return `🔥 Olha essa loja na Dudit!\n\n` +
            `*${partner.storeName}*\n` +
            `Confere aqui os produtos:`;
    }, [partner.storeName])

    // Lock scroll e z-index do header global quando modais estão abertos
    useEffect(() => {
        const locked = isContextModalOpen || isSortOpen || isAboutPageOpen
        document.body.style.overflow = locked ? "hidden" : ""
        document.querySelectorAll<HTMLElement>("header").forEach(h => {
            h.style.zIndex = locked ? "0" : ""
        })
        return () => { document.body.style.overflow = "" }
    }, [isContextModalOpen, isSortOpen, isAboutPageOpen])

    // Fecha dropdown de sort ao clicar fora
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (sortRef.current && !sortRef.current.contains(e.target as Node)) setIsDesktopSortOpen(false)
        }
        document.addEventListener("mousedown", handler)
        return () => document.removeEventListener("mousedown", handler)
    }, [])

    const handleWhatsApp = useCallback(() => {
        openWhatsApp(partner.phone, partner.storeName)
    }, [partner.phone, partner.storeName])

    const handleTagSelect = useCallback((tag: string) => {
        setActiveTag(tag)
        setActiveSection("products")
    }, [])

    // Detalhes agora renderizados pelo BottomSheet abaixo

    return (
        <div className="container mx-auto px-0 lg:px-6 max-w-[1300px] animate-fade-in lg:mt-6">
            <MarketplaceHeader
                productName={partner.storeName}
                onShare={() => setShowShareModal(true)}
                userProfile={userProfile}
                cartCount={cartCount}
            />

            {/* TABS STICKY MOBILE - Colado abaixo do header */}
            <div className={`lg:hidden w-full fixed top-[55px] left-0 right-0 z-[45] bg-brand-dark transition-all duration-300 ${isScrolled ? "opacity-100 pointer-events-auto translate-y-0" : "opacity-0 pointer-events-none -translate-y-2 absolute"}`}>
                <div className="flex items-center gap-3 px-4 py-2 border-t border-white/10 shadow-md">
                    <Button
                        variant="filled"
                        onClick={() => setIsContextModalOpen(true)}
                        className="h-10 w-10 shrink-0 p-0 rounded-xl flex items-center justify-center border-none shadow-none"
                    >
                        {activeContext === "Produtos" ? <PackageIcon size={18} /> : <HeartIcon size={18} />}
                    </Button>
                    <div className="w-[1px] h-6 bg-white/20 shrink-0" />
                    <div className="flex-1 overflow-x-auto hide-scrollbar -mx-2 px-2">
                        <Tabs value={activeTag} onValueChange={handleTagSelect}>
                            <TabsList className="border-0 pb-0 pt-1 gap-5 bg-transparent">
                                {currentTags.map(tag => (
                                    <TabsTrigger key={tag} value={tag.toLowerCase()} className="pb-1 capitalize text-white/70 hover:text-white data-[state=active]:text-white data-[state=active]:font-bold transition-all bg-transparent data-[state=active]:bg-transparent">
                                        {tag}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                    </div>
                </div>
            </div>

            {/* Banner - rounded a partir de lg, sem margem lateral no mobile para ocupar tudo sob o header */}
            <div className="w-full h-[180px] lg:h-[220px] lg:rounded-[24px] lg:mb-4 overflow-hidden relative">
                <img
                    src={bannerImage}
                    alt="Banner"
                    className="w-full h-full object-cover object-center"
                />
                <div className="absolute inset-0 bg-black/10" />
            </div>

            <div className="container mx-auto px-0">
                {/* Header da loja */}
                <div className="px-5 lg:px-0 py-5 lg:py-6 mb-2 lg:mb-4">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-[60px] h-[60px] lg:w-[96px] lg:h-[96px] rounded-full overflow-hidden shrink-0 border border-brand-border bg-white z-10">
                                <img
                                    src={partnerProfileImageUrl || "https://img.dudit.com.br/static/Placeholder.png"}
                                    alt={partner.storeName}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <h1 className="text-[20px] lg:text-[24px] font-semibold text-brand-dark leading-none">{partner.storeName}</h1>
                                    <button onClick={() => setShowShareModal(true)} className="hidden lg:flex w-[26px] h-[26px] rounded-full border border-brand-border items-center justify-center text-brand-inactive-text hover:text-brand-green hover:border-brand-green transition-colors">
                                        <ShareIcon size={14} />
                                    </button>
                                </div>
                                <p className="text-[13px] lg:text-[14px] text-brand-inactive-text font-normal">{partner.city}, {partner.state}</p>
                                {/* Estrelas só aparecem se houver avaliações */}
                                {partner.rating > 0 && (
                                    <div className="flex items-center gap-1.5 mt-1.5">
                                        <div className="flex gap-0.5">
                                            {[...Array(5)].map((_, i) => (
                                                <StarIcon key={i} size={14} fill="brand-green" className="text-brand-green" />
                                            ))}
                                        </div>
                                        <span className="text-[12px] lg:text-[13px] font-semibold text-brand-dark pt-0.5">({stats.reviewsCount})</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Ações desktop */}
                        <div className="hidden lg:flex items-start gap-3">
                            <button className="w-[42px] h-[42px] rounded-full border border-brand-border flex items-center justify-center text-brand-inactive-text hover:text-[#ef4444] hover:border-[#ef4444] transition-colors">
                                <HeartIcon size={20} />
                            </button>
                            {!isStoreOwner && (
                                <button
                                    onClick={() => setShowReportModal(true)}
                                    className="w-[42px] h-[42px] rounded-full border border-brand-border flex items-center justify-center text-brand-inactive-text hover:text-[#d32f2f] hover:border-[#d32f2f] transition-colors"
                                    title="Denunciar vendedor"
                                >
                                    <FlagIcon size={20} />
                                </button>
                            )}
                            <button
                                onClick={handleWhatsApp}
                                className="h-[42px] px-6 bg-brand-green text-white rounded-full flex items-center gap-2 font-semibold text-[14px] hover:bg-[#047857] transition-colors shadow-sm"
                            >
                                <WhatsappIcon size={18} /> Contato
                            </button>
                        </div>

                        {/* Ações mobile */}
                        <div className="lg:hidden flex flex-col items-end gap-3">
                            <div className="flex items-center gap-3">
                                {!isStoreOwner && (
                                    <button
                                        onClick={() => setShowReportModal(true)}
                                        className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-brand-dark active:bg-gray-200 transition-colors"
                                    >
                                        <FlagIcon size={18} />
                                    </button>
                                )}
                                <button onClick={() => setIsAboutPageOpen(true)} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-brand-dark active:bg-gray-200 transition-colors">
                                    <ChevronRightIcon size={20} />
                                </button>
                            </div>
                            <button onClick={handleWhatsApp} className="w-9 h-9 rounded-full bg-brand-green flex items-center justify-center text-white active:bg-[#047857] transition-colors shadow-sm">
                                <WhatsappIcon size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Layout principal */}
                <div className="flex flex-col lg:flex-row gap-10 px-0 pb-20">
                    {/* Sidebar desktop */}
                    <aside className="hidden lg:block w-[280px] shrink-0">
                        <div className="mb-8">
                            <h3 className="font-normal text-brand-dark text-[16px] mb-3">Sobre {partner.storeName}</h3>
                            <div className="flex flex-col gap-1">
                                {([{ id: "reviews", label: "Avaliações" }, { id: "info", label: "Informações" }] as const).map(b => (
                                    <button key={b.id} onClick={() => setActiveSection(b.id)}
                                        className={`w-full text-left px-3 py-2 rounded-[8px] text-[15px] transition-colors flex items-center gap-3 ${activeSection === b.id ? "bg-[#ecfdf5] text-brand-green font-semibold" : "text-brand-inactive-text hover:bg-brand-gray"}`}>
                                        <span>{b.label}</span>
                                        {activeSection === b.id && <Check size={16} className="ml-auto" />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="sticky top-[100px] z-20 bg-white pt-0">
                            <h3 className="font-normal text-brand-dark text-[16px] mb-4">Produtos</h3>
                            <div className="flex flex-col gap-1 mb-8">
                                {["todos", ...productCategories].map(tag => (
                                    <button key={tag} onClick={() => handleTagSelect(tag.toLowerCase())}
                                        className={`text-left px-3 py-2 rounded-[8px] text-[15px] transition-colors flex items-center justify-between ${activeTag === tag.toLowerCase() && activeSection === "products" ? "bg-[#ecfdf5] text-brand-green font-semibold" : "text-brand-inactive-text hover:bg-brand-gray"}`}>
                                        <span className="capitalize">{tag}</span>
                                        {activeTag === tag.toLowerCase() && activeSection === "products" && <Check size={16} />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </aside>

                    {/* Conteúdo principal */}
                    <main className="flex-1 px-5 lg:px-0">
                        {/* Grid de produtos (sempre visível em mobile; no desktop só quando activeSection === "products") */}
                        <div className={activeSection !== "products" ? "hidden lg:hidden" : ""}>
                            {/* Toolbar desktop */}
                            <div className="hidden lg:flex items-center justify-between mb-4">
                                <h2 className="text-[24px] font-normal text-brand-dark">{activeContext}</h2>
                                <span className="text-brand-inactive-text text-[14px] font-medium">{displayItems.length} itens encontrados</span>
                            </div>
                            <div className="hidden lg:flex items-center gap-4 mb-8">
                                <div className="relative flex-1">
                                    <input
                                        type="text"
                                        placeholder={`Buscar em ${partner.storeName}`}
                                        value={searchValue}
                                        onChange={e => setSearchValue(e.target.value)}
                                        className="w-full h-[42px] bg-white border border-brand-border rounded-[12px] pl-11 pr-4 text-[15px] outline-none focus:border-brand-green transition-colors"
                                    />
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-inactive-text" size={20} />
                                </div>
                                <div className="relative" ref={sortRef}>
                                    <button
                                        onClick={() => setIsDesktopSortOpen(v => !v)}
                                        className="flex items-center justify-between gap-3 bg-white border border-brand-border rounded-[12px] h-[42px] px-4 min-w-[220px] text-[14px] text-brand-dark hover:border-brand-green transition-colors"
                                    >
                                        <span className="font-medium">{selectedSort}</span>
                                        {isDesktopSortOpen
                                            ? <ChevronUpIcon size={20} className="text-brand-green" />
                                            : <ChevronDownIcon size={20} className="text-brand-green" />}
                                    </button>
                                    {isDesktopSortOpen && (
                                        <div className="absolute top-full right-0 w-full bg-white border border-brand-border rounded-[12px] shadow-[0_4px_20px_rgba(0,0,0,0.08)] mt-2 py-2 z-30 animate-fade-in">
                                            {SORT_OPTIONS.map(opt => (
                                                <div key={opt} onClick={() => { setSelectedSort(opt); setIsDesktopSortOpen(false) }}
                                                    className="flex items-center justify-between px-4 py-2.5 hover:bg-brand-gray cursor-pointer">
                                                    <span className={`text-[14px] ${selectedSort === opt ? "font-medium text-brand-dark" : "font-normal text-brand-inactive-text"}`}>{opt}</span>
                                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${selectedSort === opt ? "border-brand-green" : "border-brand-border"}`}>
                                                        {selectedSort === opt && <div className="w-2.5 h-2.5 bg-brand-green rounded-full" />}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Toolbar mobile */}
                            <div className="lg:hidden flex items-center gap-3 mb-6">
                                <div className="relative flex-1">
                                    <input
                                        type="text"
                                        placeholder="Buscar"
                                        value={searchValue}
                                        onChange={e => setSearchValue(e.target.value)}
                                        className="w-full h-[42px] bg-white border border-brand-border rounded-[10px] pl-9 pr-4 text-[14px] outline-none focus:border-brand-green"
                                    />
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-inactive-text" size={16} />
                                </div>
                                <button onClick={() => setIsSortOpen(true)} className="h-[42px] px-3 bg-white border border-brand-border rounded-[10px] flex items-center gap-1.5">
                                    <span className="text-[13px] font-medium text-brand-dark">Ordenar</span>
                                    <ChevronDownIcon size={14} className="text-brand-green" />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 lg:gap-x-6 gap-y-10 lg:gap-y-12 animate-fade-in">
                                {displayItems.map(item => <ProductCard key={item.id} item={item} partner={partner} />)}
                            </div>
                        </div>

                        {/* Seções do sidebar - desktop only */}
                        <div className="hidden lg:block">
                            {activeSection === "info" && (
                                <div>
                                    <h2 className="text-[24px] font-normal text-brand-dark mb-6">Informações de {partner.storeName}</h2>
                                    <InfoTab partner={partner} stats={stats} />
                                </div>
                            )}
                            {activeSection === "reviews" && (
                                <div>
                                    <h2 className="text-[24px] font-normal text-brand-dark mb-6">Avaliações</h2>
                                    <ReviewsTab partner={partner} stats={stats} ratingDistribution={ratingDistribution} reviews={reviews} />
                                </div>
                            )}
                        </div>
                    </main>
                </div>
            </div>

            <ShareModal
                isOpen={showShareModal}
                onClose={() => setShowShareModal(false)}
                url={isMounted ? window.location.href : ""}
                title={partner.storeName}
                shareMessage={shareMessage}
                label="Link da vitrine"
            />

            <ReportModal
                isOpen={showReportModal}
                onClose={() => setShowReportModal(false)}
                targetType="partner"
                targetId={partner.id}
                targetName={partner.storeName}
            />

            {/* Bottom-sheet modals mobile */}
            <BottomSheet isOpen={isContextModalOpen} onClose={() => setIsContextModalOpen(false)} title="Selecione">
                <div className="px-5 pb-8">
                    {["Produtos", "Serviços"].map((opt, i) => (
                        <div key={opt} onClick={() => { setActiveContext(opt as any); setIsContextModalOpen(false) }}
                            className={`flex items-center justify-between py-5 cursor-pointer ${i === 0 ? "border-b border-brand-border" : ""}`}>
                            <span className={`text-[16px] ${activeContext === opt ? "font-medium text-brand-green" : "font-normal text-brand-dark"}`}>{opt}</span>
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${activeContext === opt ? "border-brand-green" : "border-brand-border"}`}>
                                {activeContext === opt && <div className="w-3 h-3 bg-brand-green rounded-full animate-scale-in" />}
                            </div>
                        </div>
                    ))}
                </div>
            </BottomSheet>

            <BottomSheet isOpen={isSortOpen} onClose={() => setIsSortOpen(false)} title="Ordenar por">
                <div className="px-5 pb-8">
                    {SORT_OPTIONS.map((opt, i) => (
                        <div key={opt} onClick={() => { setSelectedSort(opt); setIsSortOpen(false) }}
                            className={`flex items-center justify-between py-5 cursor-pointer ${i !== SORT_OPTIONS.length - 1 ? "border-b border-brand-border" : ""}`}>
                            <span className={`text-[16px] ${selectedSort === opt ? "font-medium text-brand-green" : "font-normal text-brand-dark"}`}>{opt}</span>
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${selectedSort === opt ? "border-brand-green" : "border-brand-border"}`}>
                                {selectedSort === opt && <div className="w-3 h-3 bg-brand-green rounded-full animate-scale-in" />}
                            </div>
                        </div>
                    ))}
                </div>
            </BottomSheet>

            {/* Modal de Detalhes da Loja (Sobre) */}
            <BottomSheet isOpen={isAboutPageOpen} onClose={() => setIsAboutPageOpen(false)}>
                <div className="flex flex-col">
                    <div className="px-1 py-2 flex flex-col items-center">
                        <div className="w-[64px] h-[64px] rounded-full overflow-hidden border border-brand-border shrink-0 mb-3 shadow-sm">
                            <img
                                src={partnerProfileImageUrl || "https://img.dudit.com.br/static/Placeholder.png"}
                                alt={partner.storeName}
                                className="w-full h-full object-cover"
                            />
                        </div>
                        <h2 className="text-[20px] font-bold text-brand-dark leading-none mb-1">{partner.storeName}</h2>
                        <p className="text-[13px] text-brand-inactive-text font-medium">{partner.city}, {partner.state}</p>
                    </div>

                    <div className="mt-4 mb-2 flex justify-center">
                        <StoreStats rating={partner.rating} sales={stats.salesCount} createdAt={partner.createdAt} reviewsCount={stats.reviewsCount} />
                    </div>

                    <div className="sticky top-0 z-40 bg-white border-b border-brand-border mb-4">
                        <Tabs value={mobileModalTab} onValueChange={(v) => setMobileModalTab(v as any)}>
                            <TabsList className="justify-center gap-8 bg-transparent">
                                <TabsTrigger value="reviews" className="text-[15px] pb-3">Avaliações</TabsTrigger>
                                <TabsTrigger value="info" className="text-[15px] pb-3">Informações</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>

                    <div className="px-2 pb-6">
                        {mobileModalTab === "reviews"
                            ? <ReviewsTab partner={partner} stats={stats} ratingDistribution={ratingDistribution} reviews={reviews} />
                            : <InfoTab partner={partner} stats={stats} />
                        }
                    </div>
                </div>
            </BottomSheet>
        </div>
    )
}