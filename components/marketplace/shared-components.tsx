"use client"

import React, { useState, useEffect, useRef } from "react"
import { HeartIcon, StarIcon, ChevronRightIcon, ChevronLeftIcon, ShieldIcon, InfoIcon, EditIcon } from "@/lib/icons"
import Link from "next/link"
import { createSlug } from "@/lib/utils/slugify"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { getProductUrl } from "@/lib/utils/url-generator"
import { formatCurrency } from "@/lib/utils";
import { calculateHaversineDistance, formatDistance } from "@/lib/utils/geo";

// Cache for user location to avoid repeated prompts in the same session
let cachedUserLocation: { lat: number; lng: number } | null = null;

const HOME_BANNERS = [
    { id: 1, src: 'https://img.dudit.com.br/static/banners/Banner-1.png', alt: 'Venda aqui' },
    { id: 2, src: 'https://img.dudit.com.br/static/banners/Banner-2.png', alt: 'Gerencie tudo' },
];

const HOME_CATEGORIES = [
    { name: 'Decoração', image: 'https://img.dudit.com.br/static/Placeholder.png' },
];

function getProductImageUrl(images: string[] | null | undefined): string {
    if (!images || images.length === 0) return "https://img.dudit.com.br/static/Placeholder.png"
    const firstImage = images[0]
    return getR2ImageUrl(firstImage)
}

const DURATION = 5000;

export const HeroBanner: React.FC = () => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [progress, setProgress] = useState(0);
    const rafRef = useRef<number | null>(null);
    const startTimeRef = useRef<number | null>(null);

    const resetAndGo = (index: number) => {
        setCurrentIndex(index);
        setProgress(0);
        startTimeRef.current = null;
    };

    const goToSlide = (index: number) => resetAndGo(index);
    const prevSlide = () => resetAndGo((currentIndex - 1 + HOME_BANNERS.length) % HOME_BANNERS.length);
    const nextSlide = () => resetAndGo((currentIndex + 1) % HOME_BANNERS.length);

    useEffect(() => {
        const animate = (ts: number) => {
            if (!startTimeRef.current) startTimeRef.current = ts;
            const elapsed = ts - startTimeRef.current;
            const pct = Math.min(elapsed / DURATION, 1);
            setProgress(pct);
            if (pct < 1) {
                rafRef.current = requestAnimationFrame(animate);
            } else {
                setCurrentIndex((prev) => (prev + 1) % HOME_BANNERS.length);
                setProgress(0);
                startTimeRef.current = null;
                rafRef.current = requestAnimationFrame(animate);
            }
        };
        rafRef.current = requestAnimationFrame(animate);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [currentIndex]);

    return (
        <section className="mt-6 mb-12 px-4 lg:px-0 group">
            <div className="mx-auto max-w-[1300px] w-full relative rounded-[20px] overflow-hidden shadow-sm">
                <div
                    className="flex transition-transform duration-500 ease-out"
                    style={{ transform: `translateX(-${currentIndex * 100}%)` }}
                >
                    {HOME_BANNERS.map((banner) => (
                        <div key={banner.id} className="w-full shrink-0 relative aspect-[1300/300] bg-gray-100">
                            <img
                                src={banner.src || "https://img.dudit.com.br/static/Placeholder.png"}
                                alt={banner.alt}
                                className="w-full h-full object-cover"
                                loading="lazy"
                            />
                        </div>
                    ))}
                </div>

                <button
                    onClick={prevSlide}
                    className="hidden md:flex absolute top-1/2 left-4 -translate-y-1/2 bg-white/80 hover:bg-white text-[#003d32] p-2 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-all duration-300 z-10"
                >
                    <ChevronLeftIcon size={24} />
                </button>
                <button
                    onClick={nextSlide}
                    className="hidden md:flex absolute top-1/2 right-4 -translate-y-1/2 bg-white/80 hover:bg-white text-[#003d32] p-2 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-all duration-300 z-10"
                >
                    <ChevronRightIcon size={24} />
                </button>

                {/* Dots estilo OLX com progresso */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                    {HOME_BANNERS.map((_, index) => (
                        <button
                            key={index}
                            onClick={() => goToSlide(index)}
                            className={`h-1 rounded-full transition-all duration-300 overflow-hidden relative ${currentIndex === index
                                ? 'w-10 bg-brand-gray/40'
                                : 'w-5 bg-white/30 hover:bg-white/50'
                                }`}
                        >
                            {currentIndex === index && (
                                <span
                                    className="absolute inset-y-0 left-0 bg-white rounded-full"
                                    style={{ width: `${progress * 100}%` }}
                                />
                            )}
                        </button>
                    ))}
                </div>
            </div>
        </section>
    );
};

export const CategoryList: React.FC = () => {
    return (
        <section className="mx-auto mb-16 max-w-[1300px]">
            <div className="px-4 lg:px-0 mb-8">
                <h2 className="text-2xl md:text-[32px] font-bold text-brand-dark mb-1 leading-tight">Vitrines Populares</h2>
                <div className="text-gray-500 font-normal text-sm md:text-base">Explore lojas e encontre itens únicos da sua região.</div>
            </div>

            <div className="flex overflow-x-auto gap-4 md:gap-8 px-4 lg:px-0 scrollbar-hide pb-4">
                {HOME_CATEGORIES.map((cat) => (
                    <Link href={`/explorar?q=${cat.name}`} key={cat.name} prefetch={false} className="flex flex-col gap-3 min-w-[100px] items-center text-center group">
                        <div className="w-[100px] h-[100px] md:w-[120px] md:h-[120px] rounded-full overflow-hidden border border-gray-100 shadow-sm group-hover:shadow-md transition-all">
                            <img
                                src={cat.image || "https://img.dudit.com.br/static/Placeholder.png"}
                                alt={cat.name}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                loading="lazy"
                            />
                        </div>
                        <span className="font-semibold text-gray-800 text-xs md:text-sm group-hover:text-brand-green transition-colors">{cat.name}</span>
                    </Link>
                ))}
            </div>
        </section>
    );
};

export const InfoSection: React.FC = () => {
    const items = [
        { title: 'O cliente é seu', text: 'Sem canais intermediários blindando vendas. Você controla a carteira de clientes, fidelizando-os mais a cada compra.', icon: <InfoIcon size={28} className="text-brand-green" strokeWidth={2} /> },
        { title: 'Sem cobrança de comissões', text: 'Você sabe tudo que gasta antes. Sem sustos com 15% ou 20% das suas vendas sendo engolidas pela taxa da plataforma.', icon: <ShieldIcon size={28} className="text-brand-green" strokeWidth={2} /> },
        { title: 'Personalize como quiser', text: 'Configure produtos e variações localmente. Tenha uma vitrine fiel ao rosto real da sua marca física.', icon: <EditIcon size={28} className="text-brand-green" strokeWidth={2} /> },
        { title: 'Sistema Completo e Simples', text: 'Nada de telas de ERP complexas. Entenda exatamente seu fluxo de caixa desde o balcão até a entrega final.', icon: <HeartIcon size={28} className="text-brand-green" strokeWidth={2} /> }
    ];

    return (
        <section className="mb-16">
            <div className="mx-auto max-w-[1300px]">
                <h2 className="text-2xl md:text-[32px] font-bold text-brand-dark mb-8 px-4 lg:px-0">Vender online nunca foi tão simples</h2>
                <div className="flex overflow-x-auto gap-4 md:gap-6 px-4 lg:px-0 scrollbar-hide pb-4 snap-x">
                    {items.map((item, idx) => (
                        <div key={idx} className="bg-[#ffebe5] p-6 rounded-[16px] min-w-[260px] md:flex-1 flex flex-col items-start gap-4 snap-center cursor-pointer hover:shadow-md transition-shadow">
                            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm">
                                {item.icon}
                            </div>
                            <div>
                                <h3 className="font-bold text-brand-dark text-lg mb-2 leading-tight">{item.title}</h3>
                                <p className="text-gray-600 text-sm leading-relaxed">{item.text}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

interface ItemCardProps {
    product: {
        id: string
        name: string
        price: number
        images?: string[]
        originalPrice?: number
        slug?: string
        rating?: number
        reviews?: number
        partners?: {
            store_name: string
            store_avatar?: string
            latitude?: number | null
            longitude?: number | null
        }
    }
    userCoords?: { lat: number; lng: number } | null
}

export const ItemCard: React.FC<ItemCardProps> = ({ product, userCoords }) => {
  const imageUrl = getProductImageUrl(product.images)
  const [distance, setDistance] = useState<string | null>(null)

  useEffect(() => {
    const calculateAndSetDistance = (userLat: number, userLng: number) => {
      if (product.partners?.latitude && product.partners?.longitude) {
        const dist = calculateHaversineDistance(
          userLat,
          userLng,
          product.partners.latitude,
          product.partners.longitude
        )
        setDistance(formatDistance(dist))
      } else {
        setDistance(null)
      }
    }

    const detectLocation = () => {
      // 1. Prioritize coordinates from props (user address)
      if (userCoords?.lat && userCoords?.lng) {
        calculateAndSetDistance(userCoords.lat, userCoords.lng)
        return
      }

      // 2. Fallback to session cache
      if (cachedUserLocation) {
        calculateAndSetDistance(cachedUserLocation.lat, cachedUserLocation.lng)
        return
      }

      // 3. Fallback to localStorage
      const stored = typeof window !== 'undefined' ? localStorage.getItem('user_coords') : null
      if (stored) {
        try {
          const coords = JSON.parse(stored)
          cachedUserLocation = coords
          calculateAndSetDistance(coords.lat, coords.lng)
          return
        } catch (e) {}
      }

      // 4. Last resort: Browser geolocation
      if (typeof window !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
            cachedUserLocation = coords
            localStorage.setItem('user_coords', JSON.stringify(coords))
            calculateAndSetDistance(coords.lat, coords.lng)
          },
          () => {},
          { timeout: 5000 }
        )
      }
    }

    detectLocation()
  }, [userCoords, product.partners?.latitude, product.partners?.longitude])

  return (
    <div
      className="w-[160px] md:w-[196px] relative group/card h-full shrink-0"
    >
      <Link
        href={getProductUrl(product, product.partners)}
        prefetch={false}
        className="block h-full flex-col hover:no-underline"
      >
        <div className="relative mb-3 overflow-hidden rounded-[16px] border border-gray-100 bg-brand-gray aspect-square">
          <img
            src={imageUrl || "https://img.dudit.com.br/static/Placeholder.png"}
            alt={product.name}
            className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-500"
            loading="lazy"
          />
          <button className="absolute top-2 right-2 p-1.5 bg-white rounded-full shadow-sm text-gray-400 hover:text-brand-green opacity-0 group-hover/card:opacity-100 transition-opacity z-10">
            <HeartIcon size={18} />
          </button>
        </div>

        <div className="px-1">
          <h3 className="text-[13px] md:text-[15px] font-normal text-brand-dark line-clamp-2 min-h-[2.5em] mb-1">
            {product.name}
          </h3>

          <div className="flex justify-between items-center mb-3">
            <div className="flex flex-col">
              {product.originalPrice && (
                <span className="text-[10px] text-gray-400 line-through">
                  {formatCurrency(product.originalPrice)}
                </span>
              )}
              <span className="text-base font-bold text-brand-dark leading-tight">
                {formatCurrency(product.price)}
              </span>
            </div>

            <div className="flex items-center gap-0.5">
              <StarIcon size={12} className="text-brand-green fill-brand-green" />
              <span className="text-[11px] font-bold text-brand-dark">{product.rating || 4.5}</span>
            </div>
          </div>

          <div className="border-t border-gray-100 my-2" />

          <div className="flex items-start gap-2 pt-1">
            <div className="w-6 h-6 md:w-8 md:h-8 rounded-full overflow-hidden border border-gray-100 shrink-0 bg-gray-50 mt-0.5">
              <img
                src={product.partners?.store_avatar || 'https://img.dudit.com.br/static/Logo.png'}
                alt={product.partners?.store_name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex flex-col min-w-0">
              <p className="text-[11px] md:text-xs text-brand-dark font-medium truncate leading-tight">
                {product.partners?.store_name || 'Vendedor'}
              </p>
              {distance && (
                <p className="text-[10px] text-gray-400 font-normal">
                  {distance}
                </p>
              )}
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
};

interface ProductCarouselProps {
    title: string
    subtitle?: string
    products: any[]
    seeMoreLink?: string
    userCoords?: { lat: number; lng: number } | null
}

export const ProductCarousel: React.FC<ProductCarouselProps> = ({
    title,
    subtitle,
    products,
    seeMoreLink = "#",
    userCoords
}) => {
    return (
        <section className="mx-auto mb-12 md:mb-16 max-w-[1300px] overflow-hidden">
            <div className="flex items-end justify-between px-4 lg:px-0 mb-6 md:mb-8">
                <div>
                    <h2 className="text-2xl md:text-[32px] font-bold text-brand-dark mb-1">{title}</h2>
                    {subtitle && <p className="text-brand-inactive-text text-sm md:text-base">{subtitle}</p>}
                </div>
                <Link
                    href={seeMoreLink}
                    prefetch={true}
                    className="hidden md:flex font-bold text-brand-green hover:underline text-sm mb-1 items-center gap-1"
                >
                    Exibir mais <ChevronRightIcon size={16} />
                </Link>
            </div>

            <div className="flex overflow-x-auto gap-4 md:gap-6 px-4 lg:px-0 scrollbar-hide pb-4 snap-x snap-mandatory">
                {products.map((product) => (
                    <ItemCard key={product.id} product={product} userCoords={userCoords} />
                ))}
            </div>
        </section>
    );
};