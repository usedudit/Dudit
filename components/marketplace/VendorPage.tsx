"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Search, StarIcon, ArrowLeftIcon, MapPinIcon, ChevronDownIcon, ChevronUpIcon, ChevronRightIcon, ShareIcon, HeartIcon, WhatsappIcon, FlagIcon, Check } from "@/lib/icons"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { getProductUrl } from "@/lib/utils/url-generator"
import IconPlaceholder from "@/components/reusable/IconPlaceholder"
import { ShareModal } from "./ShareModal"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { formatCurrency, formatDate, formatMonth, formatYear, formatNumber } from "@/lib/utils"

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

const formatOpeningHours = (hours: any) => {
  if (typeof hours === 'string') return hours;
  if (!hours || typeof hours !== 'object' || Object.keys(hours).length === 0) {
    return "Segunda a Sexta: 09:00 - 18:00";
  }

  const daysMap: Record<string, string> = {
    monday: "Seg",
    tuesday: "Ter",
    wednesday: "Qua",
    thursday: "Qui",
    friday: "Sex",
    saturday: "Sáb",
    sunday: "Dom"
  };

  const enabledDays = Object.entries(hours)
    .filter(([_, value]: [string, any]) => value?.enabled)
    .sort((a, b) => {
      const order = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      return order.indexOf(a[0]) - order.indexOf(b[0]);
    })
    .map(([key, value]: [string, any]) => {
      const dayName = daysMap[key] || key;
      return `${dayName}: ${value.from}-${value.to}`;
    });

  if (enabledDays.length === 0) return "Fechado temporariamente";
  return enabledDays.join(" • ");
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

        // Se lat/lng estiverem vazios ou inválidos, tenta buscar as coordenadas pelo endereço (Geocoding)
        if ((!finalLat || !finalLng || isNaN(Number(finalLat))) && address) {
          try {
            const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${token}&limit=1`
            const res = await fetch(geocodeUrl)
            const data = await res.json()
            if (data.features && data.features.length > 0) {
              [finalLng, finalLat] = data.features[0].center
            }
          } catch (err) {
            console.warn("Geocoding failed:", err)
          }
        }

        // Se ainda não tivermos coordenadas, cancelamos (evita mostrar SP aleatório)
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

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[18px] font-semibold text-brand-dark">Horário de Funcionamento</h3>
          <ChevronDownIcon size={20} className="text-brand-inactive-text" />
        </div>
        <p className="text-[14px] text-brand-inactive-text">
          {formatOpeningHours(partner.openingHours)}
        </p>
      </div>

      <div className="h-[1px] bg-brand-border w-full" />

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

// Modal genérico de bottom-sheet mobile
const BottomSheetModal = ({ open, onClose, title, options, active, onSelect }: {
  open: boolean; onClose: () => void; title: string
  options: string[]; active: string; onSelect: (v: string) => void
}) => (
  <div className={`lg:hidden fixed inset-0 z-[1000] transition-all duration-300 ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
    <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />
    <div className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] transition-transform duration-500 ease-[cubic-bezier(0.32,0,0.67,0)] ${open ? "translate-y-0" : "translate-y-full"}`}>
      <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mt-3 mb-6" />
      <div className="text-center mb-6">
        <h2 className="text-[20px] font-normal text-brand-dark">{title}</h2>
      </div>
      <div className="px-5 pb-12">
        {options.map((opt, i) => (
          <div key={opt} onClick={() => { onSelect(opt); onClose() }}
            className={`flex items-center justify-between py-5 cursor-pointer ${i !== options.length - 1 ? "border-b border-brand-border" : ""}`}>
            <span className={`text-[16px] ${active === opt ? "font-medium text-brand-green" : "font-normal text-brand-dark"}`}>{opt}</span>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${active === opt ? "border-brand-green" : "border-brand-border"}`}>
              {active === opt && <div className="w-3 h-3 bg-brand-green rounded-full animate-scale-in" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
)

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
  const [isMounted, setIsMounted] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setIsMounted(true) }, [])

  const partnerProfileImageUrl = getImageUrl(partner.profile_image_url || partner.storeImageUrl)
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

  // Página "Sobre" mobile
  if (isAboutPageOpen) {
    return (
      <div className="bg-white min-h-screen font-sans animate-fade-in text-brand-dark fixed inset-0 z-[2000] overflow-y-auto no-scrollbar">
        <div className="h-[60px] border-b border-brand-border flex items-center px-4 bg-white sticky top-0 z-50">
          <button onClick={() => setIsAboutPageOpen(false)} className="text-brand-dark w-10 h-10 flex items-center justify-start -ml-2">
            <ArrowLeftIcon size={24} />
          </button>
          <div className="flex-1 text-center pr-8">
            <h2 className="text-[17px] font-semibold text-brand-dark">Sobre {partner.storeName}</h2>
          </div>
        </div>

        <div className="px-6 py-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-[64px] h-[64px] rounded-full overflow-hidden border border-brand-border shrink-0">
              <img
                src={partnerProfileImageUrl || "https://img.dudit.com.br/static/Placeholder.png"}
                alt={partner.storeName}
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h2 className="text-[22px] font-semibold text-brand-dark leading-none mb-1">{partner.storeName}</h2>
              <p className="text-[14px] text-brand-inactive-text font-normal">{partner.city}, {partner.state}</p>
            </div>
          </div>
          <StoreStats rating={partner.rating} sales={stats.salesCount} createdAt={partner.createdAt} reviewsCount={stats.reviewsCount} />
        </div>

        <div className="flex border-b border-brand-border sticky top-[60px] bg-white z-40 shadow-sm">
          {(["reviews", "info"] as const).map(tab => (
            <button key={tab} onClick={() => setMobileModalTab(tab)}
              className={`flex-1 py-4 text-[16px] font-medium text-center relative transition-colors ${mobileModalTab === tab ? "text-brand-green" : "text-brand-inactive-text"}`}>
              {tab === "reviews" ? "Avaliações" : "Informações"}
              {mobileModalTab === tab && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-brand-green" />}
            </button>
          ))}
        </div>

        <div className="px-6 pt-6">
          {mobileModalTab === "reviews"
            ? <ReviewsTab partner={partner} stats={stats} ratingDistribution={ratingDistribution} reviews={reviews} />
            : <InfoTab partner={partner} stats={stats} />
          }
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-0 lg:px-6 max-w-[1300px] animate-fade-in lg:mt-6">
      <MarketplaceHeader 
        productName={partner.storeName}
        onShare={() => setShowShareModal(true)}
        userProfile={userProfile}
        cartCount={cartCount}
      />

      {/* Banner - rounded a partir de md, sem margem lateral no mobile para ocupar tudo sob o header */}
      <div className="w-full h-[220px] md:rounded-[24px] md:mb-4 overflow-hidden relative">
        <img
          src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=1400"
          alt="Banner"
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-black/10" />
      </div>

      <div className="container mx-auto px-0">
        {/* Header da loja */}
        <div className="px-6 lg:px-0 py-6 mb-2 lg:mb-4">
          <div className="flex items-center justify-between gap-5">
            <div className="flex items-center gap-5">
              <div className="w-[70px] h-[70px] lg:w-[96px] lg:h-[96px] rounded-full overflow-hidden shrink-0 border border-brand-border bg-white z-10">
                <img
                  src={partnerProfileImageUrl || "https://img.dudit.com.br/static/Placeholder.png"}
                  alt={partner.storeName}
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-[24px] font-semibold text-brand-dark leading-none">{partner.storeName}</h1>
                  <button onClick={() => setShowShareModal(true)} className="hidden lg:flex w-[26px] h-[26px] rounded-full border border-brand-border items-center justify-center text-brand-inactive-text hover:text-brand-green hover:border-brand-green transition-colors">
                    <ShareIcon size={14} />
                  </button>
                </div>
                <p className="text-[14px] text-brand-inactive-text font-normal">{partner.city}, {partner.state}</p>
                {/* Estrelas só aparecem se houver avaliações */}
                {partner.rating > 0 && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <div className="flex gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <StarIcon key={i} size={16} fill="brand-green" className="text-brand-green" />
                      ))}
                    </div>
                    <span className="text-[13px] font-semibold text-brand-dark pt-0.5">({stats.reviewsCount})</span>
                  </div>
                )}
              </div>
            </div>

            {/* Ações desktop */}
            <div className="hidden lg:flex items-start gap-3">
              <button className="w-[42px] h-[42px] rounded-full border border-brand-border flex items-center justify-center text-brand-inactive-text hover:text-[#ef4444] hover:border-[#ef4444] transition-colors">
                <HeartIcon size={20} />
              </button>
              <button
                onClick={handleWhatsApp}
                className="h-[42px] px-6 bg-brand-green text-white rounded-full flex items-center gap-2 font-semibold text-[14px] hover:bg-[#047857] transition-colors shadow-sm"
              >
                <WhatsappIcon size={18} /> Contato
              </button>
            </div>

            {/* Ações mobile */}
            <div className="lg:hidden flex flex-col items-end gap-3">
              <button onClick={() => setIsAboutPageOpen(true)} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-brand-dark active:bg-gray-200 transition-colors">
                <ChevronRightIcon size={20} />
              </button>
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

      {/* Bottom-sheet modals mobile */}
      <BottomSheetModal
        open={isContextModalOpen}
        onClose={() => setIsContextModalOpen(false)}
        title="Selecione"
        options={["Produtos", "Serviços"]}
        active={activeContext}
        onSelect={v => setActiveContext(v as any)}
      />
      <BottomSheetModal
        open={isSortOpen}
        onClose={() => setIsSortOpen(false)}
        title="ordenar por"
        options={SORT_OPTIONS}
        active={selectedSort}
        onSelect={setSelectedSort}
      />
    </div>
  )
}