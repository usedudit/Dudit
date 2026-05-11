"use client"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion"
import { useSupabase } from "@/providers/supabase-provider"
import { HeartIcon, ShareIcon, StarIcon, ChevronRightIcon, ChevronLeftIcon, ChevronDownIcon, CheckCircleIcon, XIcon, ShoppingCartIcon, MoneyIcon, TruckIcon, FlagIcon, ArrowLeftRightIcon } from "@/lib/icons"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { MarketplaceFooter } from "./MarketplaceFooter"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { Button, Input, FormDropdown, IconPlaceholder, DefaultModal, Separator } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils";
import { ShareModal } from "./ShareModal"
import { ReportModal } from "./ReportModal"
import { addToCartAction } from "@/app/actions/marketplace/cart"
import { InfoCard } from "@/components/reusable/InfoCard"
import { getPartnerUrl } from "@/lib/utils/url-generator"
import { useNotification } from "@/hooks/use-notification"
import { invalidateCartCache } from "@/hooks/use-cart"
import { computeOrderPreparationEstimate } from "@/lib/utils/order-preparation"
import { getPartnerDeliveryConfigAction } from "@/app/actions/shared/delivery"

interface ProductDetailsPageClientProps {
  product: any
  variants: any[]
  reviews: any[]
  currentUserId?: string | null
  userProfile?: any
  cartCount?: number
  hideHeaderAndFooter?: boolean
}

const PLACEHOLDER = "https://img.dudit.com.br/static/Placeholder.png"

const getProductImageUrl = (path: string | null | undefined) => getR2ImageUrl(path)

const parseVariantAttributes = (variant: any): Record<string, string> => {
  if (variant.variant_options && typeof variant.variant_options === "object") {
    const opts = variant.variant_options
    const attrs: Record<string, string> = {}
    Object.keys(opts).forEach((k) => { if (k !== "image" && opts[k]) attrs[k] = opts[k] })
    if (Object.keys(attrs).length > 0) return attrs
  }
  const types = (variant.variant_type || "").split("/").map((s: string) => s.trim()).filter(Boolean)
  const values = (variant.variant_name || "").split("/").map((s: string) => s.trim())
  const attrs: Record<string, string> = {}
  types.forEach((t: string, i: number) => { if (t && values[i]) attrs[t] = values[i] })
  return attrs
}

const formatMoney = (val: number) => formatCurrency(val);

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? "-100%" : "100%", opacity: 0 }),
}

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[...Array(5)].map((_, i) => (
        <StarIcon key={i} size={size} strokeWidth={0}
          className={i < Math.round(rating) ? "text-brand-green fill-brand-green" : "text-gray-300 fill-gray-300"} />
      ))}
    </div>
  )
}

function ActionButtons({ className = "", onShareClick }: { className?: string, onShareClick?: () => void }) {
  return (
    <div className={`flex gap-2 ${className}`}>
      <button className="w-9 h-9 lg:w-11 lg:h-11 bg-white rounded-full flex items-center justify-center border border-brand-border hover:bg-brand-gray transition-colors">
        <HeartIcon className="w-4 h-4 lg:w-5 lg:h-5 text-brand-inactive-text" />
      </button>
      <button
        onClick={onShareClick}
        className="w-9 h-9 lg:w-11 lg:h-11 bg-white rounded-full flex items-center justify-center border border-brand-border hover:bg-brand-gray transition-colors"
      >
        <ShareIcon className="w-4 h-4 lg:w-5 lg:h-5 text-brand-green" />
      </button>
    </div>
  )
}

export function ProductDetailsPageClient({
  product,
  variants,
  reviews,
  currentUserId: initialUserId,
  userProfile,
  cartCount,
  hideHeaderAndFooter = false,
}: ProductDetailsPageClientProps) {
  const router = useRouter()
  const { user, supabase, isLoading } = useSupabase()

  const [userId, setUserId] = useState<string | null | undefined>(initialUserId || user?.id)
  const [activeImgIndex, setActiveImgIndex] = useState(product.primary_image_index || 0)
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1)
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({})
  const [selectedVariant, setSelectedVariant] = useState<any>(null)
  const [quantity, setQuantity] = useState(1)
  const [cep, setCep] = useState("")
  const [shippingState, setShippingState] = useState<"initial" | "calculated">("initial")
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)
  const [lightboxActiveImg, setLightboxActiveImg] = useState(0)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showResponsibilityModal, setShowResponsibilityModal] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [isFavorite, setIsFavorite] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [showQuantityModal, setShowQuantityModal] = useState(false)
  const [customQuantity, setCustomQuantity] = useState("")
  const [deliveryConfig, setDeliveryConfig] = useState<any>(null)


  const galleryContainerRef = useRef<HTMLDivElement>(null)
  const reviewsRef = useRef<HTMLDivElement>(null)
  const lightboxJustOpened = useRef(false)
  const isActionInProgress = useRef(false)

  const zoomOriginX = useMotionValue(50)
  const zoomOriginY = useMotionValue(50)
  const zoomScale = useMotionValue(1)
  const smoothScale = useSpring(zoomScale, { stiffness: 180, damping: 22 })
  const transformOrigin = useTransform([zoomOriginX, zoomOriginY], ([x, y]) => `${x}% ${y}%`)

  useEffect(() => { setIsMounted(true) }, [])

  useEffect(() => {
    if (!userId && user?.id) {
      setUserId(user.id)
    }
  }, [userId, user])

  const partner = useMemo(() => {
    const p = Array.isArray(product.partners) ? product.partners[0] : product.partners
    const address = p?.addresses?.[0] || {}
    return {
      id: p?.id || product.partner_id || "1",
      user_id: p?.user_id,
      store_name: p?.store_name || "Loja Parceira",
      city: address?.city || "Brasil",
      state: address?.state || "BR",
      profile_image_url: p?.profile_image_url || p?.store_image_url || null,
      banner_url: p?.banner_url || null,
      mp_user_id: p?.mp_user_id,
      mp_public_key: p?.mp_public_key,
      address: {
        street: address?.street, number: address?.number,
        neighborhood: address?.neighborhood, city: address?.city,
        state: address?.state, zipCode: address?.zip_code,
      },
      paymentMethods: p?.payment_methods || [],
      openingHours: p?.opening_hours || null,
      max_installments: p?.max_installments || 12,
      rating: p?.rating || p?.average_rating || 0,
    }
  }, [product])

  const productImages = useMemo(() => {
    let images = (product.images || [])
      .filter((img: any) => typeof img === "string" && img.trim())
      .map(getProductImageUrl)
    if (!images.length && variants.length > 0) {
      const variantImages = variants
        .map((v) => {
          const opts = typeof v.variant_options === "string" ? JSON.parse(v.variant_options) : v.variant_options
          return getProductImageUrl(v.image_url || opts?.image)
        })
        .filter((img): img is string => !!img && img.length > 5)
      images = variantImages.length ? Array.from(new Set(variantImages)) : [PLACEHOLDER]
    }
    return images.length ? images : [PLACEHOLDER]
  }, [product.images, variants])

  const processedVariants = useMemo(() => variants.map((v) => {
    const opts = typeof v.variant_options === "string" ? JSON.parse(v.variant_options) : v.variant_options
    const rawImg = v.image_url || opts?.image
    const fullImgUrl = rawImg && rawImg.length > 5 ? getProductImageUrl(rawImg) : PLACEHOLDER
    return { ...v, attributes: parseVariantAttributes(v), fullImgUrl, hasDbImage: !!rawImg && rawImg.length > 5, imageIndex: productImages.indexOf(fullImgUrl) }
  }), [variants, productImages])

  const attributeKeys = useMemo(() =>
    processedVariants.length > 0 ? Object.keys(processedVariants[0].attributes) : [],
    [processedVariants]
  )

  const pricing = useMemo(() => {
    const base = Number(product.price) || 0
    const promo = Number(product.promotional_price) || 0
    const hasPromo = promo > 0 && promo < base
    const current = selectedVariant ? Number(selectedVariant.price_adjustment) || base : hasPromo ? promo : base
    const total = current * quantity

    // Real Pix Discount from Partner's payment methods
    const pixMethod = partner.paymentMethods?.find((m: any) => m.payment_type === "pix" && m.is_active)
    const pixDiscountPercent = pixMethod?.discount_percent || 0
    const pixTotal = total * (1 - (pixDiscountPercent / 100))

    // Real Installments from Partner's credit card method
    const ccMethod = partner.paymentMethods?.find((m: any) => m.payment_type === "credito" && m.is_active)
    const hasCC = !!ccMethod
    const maxInstallments = ccMethod?.max_installments || partner.max_installments || 1
    const installmentPrice = total / maxInstallments

    return {
      current, original: base, hasPromo: !selectedVariant && hasPromo, total,
      pix: pixTotal,
      pixDiscountPercent,
      hasCC,
      maxInstallments,
      installment: installmentPrice,
      discountPercent: Math.round(((base - promo) / base) * 100),
    }
  }, [product, selectedVariant, quantity, partner])

  const avgRating = useMemo(() =>
    reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0,
    [reviews]
  )

  const MAX_STOCK = selectedVariant ? (selectedVariant.stock_available ?? selectedVariant.stock_quantity ?? 0) : (product.stock_available ?? product.stock_quantity ?? 0)
  const isOutOfStock = MAX_STOCK === 0

  // Check if user is owner OR team member of this store
  const [isTeamMember, setIsTeamMember] = useState(false)
  useEffect(() => {
    if (userId && userId !== partner.user_id && partner.id) {
      supabase
        .from("partner_users")
        .select("id")
        .eq("partner_id", partner.id)
        .eq("user_id", userId)
        .maybeSingle()
        .then(({ data }: any) => {
          if (data) setIsTeamMember(true)
        })
        .catch(() => { })
    }
  }, [userId, partner.id, partner.user_id, supabase])

  const partnerProfileImageUrl = getR2ImageUrl(partner.profile_image_url)

  // Fetch Delivery Config
  useEffect(() => {
    if (partner.id) {
      getPartnerDeliveryConfigAction(partner.id).then((res: any) => {
        if (res.success) setDeliveryConfig(res)
      })
    }
  }, [partner.id])



  const preparationEstimate = useMemo(() => computeOrderPreparationEstimate({
    products: [{
      availability_value: Number(product.availability_value || 0),
      availability_unit: product.availability_unit || "Minutos",
    }],
    openingHours: partner.openingHours || null,
    pickupWindowMinutes: 30,
    deliveryTimeEstimateMinutes: 0,
  }), [product, partner.openingHours])

  const isProductOwner = !!(userId && (userId === partner.user_id || isTeamMember))

  useEffect(() => {
    if (processedVariants.length > 0 && !selectedVariant) {
      const first = processedVariants.find((v) => (v.stock_available ?? v.stock_quantity ?? 0) > 0) || processedVariants[0]
      setSelectedAttributes(first.attributes)
      setSelectedVariant(first)
      if (first.imageIndex !== -1) setActiveImgIndex(first.imageIndex)
    }
  }, [processedVariants, selectedVariant])

  const handleAttributeSelect = useCallback((key: string, value: string) => {
    const newAttrs = { ...selectedAttributes, [key]: value }
    let match = processedVariants.find((v) => Object.entries(newAttrs).every(([k, val]) => v.attributes[k] === val))
    if (!match || (match.stock_available ?? match.stock_quantity ?? 0) === 0)
      match = processedVariants.find((v) => v.attributes[key] === value && (v.stock_available ?? v.stock_quantity ?? 0) > 0)
    if (match) {
      setSelectedAttributes(match.attributes)
      setSelectedVariant(match)
      setQuantity(1)
      if (match.imageIndex !== -1) setActiveImgIndex(match.imageIndex)
    }
  }, [selectedAttributes, processedVariants])

  const goToImage = useCallback((index: number) => {
    setSlideDirection(index > activeImgIndex ? 1 : -1)
    setActiveImgIndex(index)
  }, [activeImgIndex])

  const goToPrev = useCallback(() => {
    setSlideDirection(-1)
    setActiveImgIndex((p: number) => (p - 1 + productImages.length) % productImages.length)
  }, [productImages.length])

  const goToNext = useCallback(() => {
    setSlideDirection(1)
    setActiveImgIndex((p: number) => (p + 1) % productImages.length)
  }, [productImages.length])

  const lightboxNav = useCallback((dir: 1 | -1) => {
    lightboxJustOpened.current = false
    setSlideDirection(dir)
    setLightboxActiveImg((p: number) => (p + dir + productImages.length) % productImages.length)
  }, [productImages.length])

  const openLightbox = useCallback((index: number) => {
    lightboxJustOpened.current = true
    setLightboxActiveImg(index)
    setIsLightboxOpen(true)
  }, [])

  const handleCepChange = useCallback((e: any) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 8)
    setCep(raw.length > 5 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw)
  }, [])

  const { success: notifySuccess, error: notifyError } = useNotification()

  const handleAddToCart = useCallback(async () => {
    if (!userId) return router.push("/auth/login?next=" + encodeURIComponent(window.location.pathname))
    if (isActionInProgress.current) return

    isActionInProgress.current = true
    setLoading(true)
    try {
      const { token } = await fetch("/api/csrf-token").then((r) => r.json())
      const result = await addToCartAction(product.id, quantity, token, selectedVariant?.id)
      if (result.error) {
        notifyError("Erro ao adicionar ao carrinho", result.error)
      } else {
        invalidateCartCache()
        notifySuccess("Sucesso", "Produto adicionado ao carrinho!")
      }
    } catch {
      notifyError("Erro", "Erro ao adicionar ao carrinho")
    } finally {
      setLoading(false)
      isActionInProgress.current = false
    }
  }, [userId, router, product.id, quantity, selectedVariant, notifySuccess, notifyError])

  const handleBuyNow = useCallback(() => {
    if (!userId) return router.push("/auth/login?next=" + encodeURIComponent(window.location.pathname))
    const checkoutData = {
      source: "product",
      partnerId: partner.id,
      products: [{
        id: product.id,
        name: `${product.name} ${selectedVariant?.variant_name || ""}`,
        price: pricing.current,
        quantity,
        image: productImages[activeImgIndex],
        variant: selectedVariant?.variant_name,
        availabilityValue: Number(product.availability_value || 0),
        availabilityUnit: product.availability_unit || "Minutos",
      }],
      partnerInfo: {
        address: partner.address || {},
        paymentMethods: partner.paymentMethods || ["Dinheiro"],
        mpConnected: !!partner.mp_user_id,
        mpPublicKey: partner.mp_public_key,
        store_name: partner.store_name,
        openingHours: partner.openingHours || null,
      },
      itemId: selectedVariant?.id || product.id,
      itemType: "product",
      deliverySettings: deliveryConfig?.settings ? {
        base_fee: deliveryConfig.settings.baseFee,
        is_delivery_enabled: deliveryConfig.settings.isDeliveryEnabled,
      } : undefined,
    }

    sessionStorage.setItem("checkout_session", JSON.stringify(checkoutData))
    router.push("/checkout")
  }, [userId, router, partner, product, selectedVariant, pricing.current, quantity, productImages, activeImgIndex])


  const shareMessage = useMemo(() => {
    return `🔥 Olha esse achado na Dudit!\n\n` +
      `*${product.name}*\n` +
      `Confere aqui os detalhes:`;
  }, [product.name, pricing]);

  // ─── Sub-sections ────────────────────────────────────────────────────────────

  const VariantsSection = useMemo(() => (
    <div className="space-y-6 mb-8">
      {attributeKeys.map((type) => {
        const uniqueValues = Array.from(new Set(processedVariants.map((v) => v.attributes[type]))).filter(Boolean)
        const groupHasImage = uniqueValues.some((val) =>
          processedVariants.some((v) => v.attributes[type] === val && v.hasDbImage))
        return (
          <div key={type}>
            <label className="block text-sm font-bold text-brand-dark mb-3">
              {type}: <span className="font-normal text-gray-600 ml-1">{selectedAttributes[type]}</span>
            </label>
            <div className="flex flex-wrap gap-3">
              {uniqueValues.map((value: any) => {
                const isSelected = selectedAttributes[type] === value
                const isAvailable = processedVariants.some((v) => v.attributes[type] === value && (v.stock_available ?? v.stock_quantity ?? 0) > 0)
                const variantWithImg = processedVariants.find((v) => v.attributes[type] === value && v.hasDbImage)
                if (groupHasImage) {
                  return (
                    <button key={value} onClick={() => isAvailable && handleAttributeSelect(type, value)}
                      disabled={!isAvailable} title={!isAvailable ? `${value} (Indisponível)` : value}
                      className={`w-14 h-14 rounded-md relative focus:outline-none transition-all overflow-hidden bg-white
                        ${isSelected && isAvailable ? "ring-1 ring-offset-1 ring-brand-green" : ""}
                        ${!isSelected && isAvailable ? "ring-1 ring-gray-200 hover:ring-gray-300" : ""}
                        ${!isAvailable ? "opacity-60 cursor-not-allowed border border-dashed border-brand-border ring-0 grayscale" : ""}`}>
                      <img src={variantWithImg?.fullImgUrl || PLACEHOLDER} alt={value}
                        className={`w-full h-full object-cover ${!isAvailable ? "opacity-50" : ""}`} />
                      {isSelected && isAvailable && (
                        <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
                          <div className="bg-white rounded-full p-0.5 shadow-sm">
                            <CheckCircleIcon size={12} className="text-brand-green stroke-[4]" />
                          </div>
                        </div>
                      )}
                      {!isAvailable && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                          <div className="w-[150%] h-[1.5px] bg-red-500 rotate-45 transform origin-center shadow-sm" />
                        </div>
                      )}
                    </button>
                  )
                }
                return (
                  <button key={value} onClick={() => handleAttributeSelect(type, value)} disabled={!isAvailable}
                    className={`h-10 min-w-[3rem] px-3 rounded-lg text-sm font-bold transition-all border focus:outline-none
                      ${isSelected && isAvailable ? "border-brand-green text-brand-green bg-green-50" : ""}
                      ${!isSelected && isAvailable ? "border-brand-border text-brand-dark hover:border-brand-border bg-white" : ""}
                      ${!isAvailable ? "border-brand-border text-brand-inactive-text bg-brand-gray opacity-50 cursor-not-allowed" : ""}`}>
                    {value}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      {!isProductOwner && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <label className="text-sm font-bold text-brand-dark leading-none">Quantidade</label>
            <span className="text-xs text-brand-inactive-text font-medium leading-none mt-0.5">({MAX_STOCK} disponíveis)</span>
          </div>
          <FormDropdown
            options={isOutOfStock ? [] : [
              ...Array.from({ length: Math.min(5, MAX_STOCK) }, (_, i) => ({
                value: String(i + 1), label: `${i + 1} unidade${i > 0 ? "s" : ""}`,
              })),
              ...(MAX_STOCK > 5 ? [{ value: "other", label: "Outra quantidade" }] : [])
            ]}
            value={quantity > 5 ? "other" : String(quantity)}
            setValue={(v) => {
              if (v === "other") {
                setShowQuantityModal(true)
              } else {
                setQuantity(Number(v))
              }
            }}
            disabled={isOutOfStock} width="w-full"
          />
        </div>
      )}
    </div>
  ), [attributeKeys, processedVariants, selectedAttributes, handleAttributeSelect, MAX_STOCK, isOutOfStock, quantity, isProductOwner])

  const BuyPanel = (
    <div className="bg-white relative">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          {product.condition === "used" ? (
            <span className="text-[11px] font-bold text-brand-dark bg-gray-100 px-2 py-0.5 rounded uppercase tracking-wider">Usado</span>
          ) : product.condition === "refurbished" ? (
            <span className="text-[11px] font-bold text-brand-dark bg-gray-100 px-2 py-0.5 rounded uppercase tracking-wider">Recondicionado</span>
          ) : (
            <span className="text-[11px] font-bold text-brand-dark bg-gray-100 px-2 py-0.5 rounded uppercase tracking-wider">Novo</span>
          )}
          <span className="text-gray-300 text-xs">|</span>
          <span className="text-[13px] font-semibold text-brand-inactive-text">
            {product.product_type === "digital" ? "Produto Digital" : product.product_type === "service" ? "Serviço" : "Produto Físico"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => reviewsRef.current?.scrollIntoView({ behavior: "smooth" })}>
          <StarIcon size={16} className="text-brand-green fill-brand-green" strokeWidth={0} />
          <span className="text-[11px] sm:text-xs font-medium text-brand-inactive-text mt-0.5">
            {avgRating.toFixed(1)} ({reviews.length} avaliações)
          </span>
        </div>
      </div>

      <h1 className="text-xl sm:text-2xl md:text-[2rem] leading-[1.1] font-medium text-brand-dark mb-6 tracking-tight">
        {product.name}
      </h1>

      {/* Price */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-1">
          <p className="text-xl sm:text-2xl md:text-[2rem] leading-none font-medium text-brand-dark">
            {formatMoney(pricing.current)}
          </p>
          {pricing.pixDiscountPercent > 0 && (
            <>
              <span className="bg-[#e1ff00] text-[#025107] text-[0.75rem] font-bold px-2 py-0.5 rounded-sm">-{pricing.pixDiscountPercent}% no Pix</span>
              <span className="font-semibold text-brand-dark text-base md:text-lg">{formatMoney(pricing.pix)}</span>
            </>
          )}
          {pricing.hasPromo && (
            <span className="text-sm text-brand-inactive-text line-through font-normal">{formatMoney(pricing.original)}</span>
          )}
        </div>
        {pricing.hasCC && (
          <p className="text-xs md:text-[0.875rem] text-brand-inactive-text">
            ou {pricing.maxInstallments}x sem juros de {formatMoney(pricing.installment)} no cartão
          </p>
        )}
      </div>

      {VariantsSection}

      {isProductOwner ? (
        <InfoCard
          message={isTeamMember
            ? "Você não pode comprar produtos de uma loja da qual faz parte da equipe."
            : "Você não pode comprar seus próprios produtos."}
          color="orange"
          className="mb-8"
        />
      ) : (
        <div className="hidden lg:block">
          <Button disabled={isOutOfStock || loading} onClick={handleBuyNow} className="w-full mb-4 h-[46px]">
            {isOutOfStock ? "Esgotado" : "Comprar Agora"}
          </Button>
          <Button variant="outline" className="w-full border-brand-green text-brand-green hover:bg-green-50 h-[46px] mb-8"
            disabled={isOutOfStock || loading} onClick={handleAddToCart}>
            {loading ? "Adicionando..." : "Adicionar à sacola"}
          </Button>
        </div>
      )}

      {/* Shipping */}
      {!isProductOwner && (
        <div className="mb-8">
          <label className="text-sm font-bold text-brand-dark mb-2 block">Frete e Entrega</label>

          {/* Retirar no local - Always show if store exists */}
          <div className="flex flex-col border border-brand-border rounded-lg bg-white mb-3">
            <div className="flex justify-between items-start py-3 px-4 border-b border-brand-border last:border-0">
              <div>
                <p className="text-sm text-brand-dark font-medium leading-snug">Retirar no local</p>
                {preparationEstimate && (
                  <p className="text-xs text-brand-inactive-text">
                    Pronto entre {preparationEstimate.readyAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} e {preparationEstimate.pickupWindowEnd.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-brand-green">Grátis</p>
              </div>
            </div>

            {/* Delivery Option if configured */}
            {deliveryConfig?.settings?.isDeliveryEnabled && (
              <div className="flex justify-between items-start py-3 px-4 border-b border-brand-border last:border-0">
                <div>
                  <p className="text-sm text-brand-dark font-medium leading-snug">Entrega pela loja</p>
                  {userProfile?.address ? (
                    <p className="text-xs text-brand-inactive-text">Para {userProfile.address}</p>
                  ) : (
                    <p className="text-xs text-brand-inactive-text">Calcule informando seu CEP no checkout</p>
                  )}
                </div>
                <div className="text-right">
                  {(() => {
                    const fee = Number(deliveryConfig?.settings?.baseFee || 0)
                    return <p className={`text-sm font-bold ${fee > 0 ? "text-brand-dark" : "text-brand-green"}`}>{fee > 0 ? formatMoney(fee) : "Grátis"}</p>
                  })()}
                </div>
              </div>
            )}

            {/* A combinar if no delivery config but store is active */}
            {!deliveryConfig?.settings?.isDeliveryEnabled && (
              <div className="flex justify-between items-start py-3 px-4 last:border-0">
                <div>
                  <p className="text-sm text-brand-dark font-medium leading-snug">Entrega a combinar</p>
                  <p className="text-xs text-brand-inactive-text">Fale com o vendedor no WhatsApp após o pedido</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-brand-dark">A combinar</p>
                </div>
              </div>
            )}
          </div>

          {/* CEP Input if no address */}
          {!userProfile?.address && shippingState === "initial" && (
            <div className="flex gap-2">
              <Input placeholder="00000-000" value={cep} onChange={handleCepChange} maxLength={9} className="h-[48px] flex-1" />
              <Button onClick={() => { if (cep.replace("-", "").length >= 8) setShippingState("calculated") }}
                className="h-[48px] w-[48px] shrink-0">OK</Button>
            </div>
          )}

          {userProfile?.address && (
            <p className="text-[11px] text-brand-inactive-text px-1">
              Os valores e prazos são estimativas baseadas no endereço do seu perfil.
            </p>
          )}
        </div>
      )}

      {/* Segurança jurídica*/}
      <div className="border-t border-brand-border mb-6">
        {[
          {
            title: "Pagamento Direto ao Vendedor",
            sub: "A Dudit não processa pagamentos: o seu dinheiro vai direto para o vendedor.",
            onClick: () => setShowPaymentModal(true)
          },
          {
            title: "Entrega e Garantia do Vendedor",
            sub: "A entrega, troca e garantia são responsabilidade do vendedor. A Dudit conecta você a ele.",
            onClick: () => setShowResponsibilityModal(true)
          },
        ].map(({ title, sub, onClick }) => (
          <button key={title} onClick={onClick} className="w-full flex items-center justify-between py-5 border-b border-brand-border hover:bg-brand-gray text-left transition-colors">
            <div>
              <p className="font-bold text-brand-dark text-sm mb-0.5">{title}</p>
              <p className="text-brand-inactive-text text-xs">{sub}</p>
            </div>
            <ChevronRightIcon className="text-brand-green shrink-0" size={20} />
          </button>
        ))}
      </div>

      {/* Store */}
      <div className="rounded-2xl border border-brand-border overflow-hidden bg-white">
        <Link href={getPartnerUrl(partner)} prefetch={true} className="group block">
          <div className="relative aspect-[21/9] bg-brand-gray overflow-hidden">
            <img src={getR2ImageUrl(partner.banner_url) || getR2ImageUrl(partner.profile_image_url) || "https://img.dudit.com.br/static/Placeholder.png"}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              alt={partner.store_name} />
          </div>
          <div className="px-5 pb-4 pt-0 -mt-6 relative z-10 flex gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden border-4 border-white bg-white shrink-0 shadow-sm">
              <img src={getR2ImageUrl(partner.profile_image_url) || "https://img.dudit.com.br/static/Placeholder.png"}
                className="w-full h-full object-cover"
                alt={partner.store_name} />
            </div>
            <div className="flex-1 pt-7">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-brand-dark text-[1.0625rem] group-hover:text-brand-green transition-colors leading-tight">
                  {partner.store_name}
                </h4>
                {partner.rating > 0 && (
                  <div className="flex items-center gap-0.5 bg-brand-gray px-1.5 py-0.5 rounded text-[10px] font-bold text-brand-dark">
                    <StarIcon size={10} className="text-brand-green fill-brand-green" strokeWidth={0} />
                    <span>{Number(partner.rating).toFixed(1)}</span>
                  </div>
                )}
              </div>
              <p className="text-brand-inactive-text text-xs mt-0.5">{partner.city} - {partner.state}</p>
            </div>
          </div>
        </Link>
        <div className="px-5 pb-5 flex items-center gap-4 text-xs font-bold text-brand-dark">
          <Link href={`/explorar?q=${partner.city}&type=lojas`} prefetch={false} className="flex items-center gap-1 hover:text-brand-green transition-colors">
            Lojas em {partner.city} <ChevronRightIcon size={10} />
          </Link>
          <Link href={`/explorar?q=${partner.city}&type=produtos`} prefetch={false} className="flex items-center gap-1 hover:text-brand-green transition-colors">
            Produtos em {partner.city} <ChevronRightIcon size={10} />
          </Link>
        </div>
      </div>

      {!isProductOwner && (
        <button
          onClick={() => setShowReportModal(true)}
          className="w-full mt-4 flex items-center justify-center gap-2 py-2 text-xs font-medium text-brand-inactive-text hover:text-[#d32f2f] transition-colors"
        >
          <FlagIcon size={14} />
          Denunciar este produto
        </button>
      )}
    </div>
  )

  // ─── Lightbox ─────────────────────────────────────────────────────────────────
  const variantLabel = selectedVariant
    ? Object.entries(selectedVariant.attributes || {}).map(([k, v]) => `${k}: ${v}`).join(" · ")
    : null

  const LightboxContent = (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="fixed inset-0 z-[9999] flex flex-col bg-black lg:bg-black/90 lg:backdrop-blur-sm"
    >

      {/* ── Mobile / Tablet top bar (hidden on lg) ── */}
      <div className="flex lg:hidden items-center justify-between px-6 pt-12 pb-4 shrink-0">
        <button onClick={() => setIsLightboxOpen(false)}
          className="w-10 h-10 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center text-white transition-colors">
          <XIcon size={20} />
        </button>
        <span className="text-white text-sm font-semibold">
          {lightboxActiveImg + 1}/{productImages.length}
        </span>
        <div className="flex items-center gap-2">
          <button className="w-10 h-10 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center text-white transition-colors">
            <HeartIcon size={20} />
          </button>
        </div>
      </div>

      {/* ── Desktop layout ── */}
      <div className="hidden lg:flex flex-1 min-h-0 relative">
        {/* Close button */}
        <button onClick={() => setIsLightboxOpen(false)}
          className="absolute top-6 right-6 z-10 w-11 h-11 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center text-white transition-colors">
          <XIcon size={22} />
        </button>

        {/* Thumbnails column */}
        <div className="flex flex-col gap-2 w-[120px] shrink-0 overflow-y-auto px-5 py-6">
          {productImages.map((img: string, i: number) => (
            <div key={i} onClick={() => { lightboxJustOpened.current = false; setSlideDirection(i > lightboxActiveImg ? 1 : -1); setLightboxActiveImg(i) }}
              className={`w-full aspect-square rounded-md border-2 cursor-pointer overflow-hidden shrink-0 transition-all
                ${lightboxActiveImg === i ? "border-white" : "border-white/20 hover:border-white/50"}`}>
              <img src={img} className="w-full h-full object-cover" alt={`Foto de ${product.name} à venda em ${partner.city} - ${partner.state}`} />
            </div>
          ))}
        </div>

        {/* Main image */}
        <div className="relative flex-1 flex items-center justify-center min-w-0 p-8">
          <AnimatePresence mode="wait" custom={slideDirection}
            onExitComplete={() => { lightboxJustOpened.current = false }}>
            <motion.img
              key={lightboxActiveImg}
              src={productImages[lightboxActiveImg]}
              className="max-w-full max-h-full object-contain"
              alt={`Foto principal de ${product.name} à venda em ${partner.city} - ${partner.state}`}
              custom={slideDirection}
              variants={lightboxJustOpened.current ? {} : slideVariants}
              initial={lightboxJustOpened.current ? false : "enter"}
              animate="center"
              exit={lightboxJustOpened.current ? undefined : "exit"}
              transition={{ duration: 0.2 }}
            />
          </AnimatePresence>
          {productImages.length > 1 && (
            <>
              <button onClick={() => lightboxNav(-1)}
                className="absolute left-6 top-1/2 -translate-y-1/2 w-11 h-11 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center text-white transition-colors">
                <ChevronLeftIcon size={26} />
              </button>
              <button onClick={() => lightboxNav(1)}
                className="absolute right-6 top-1/2 -translate-y-1/2 w-11 h-11 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center text-white transition-colors">
                <ChevronRightIcon size={26} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Mobile image area ── */}
      <div className="flex lg:hidden flex-1 min-h-0 relative items-center justify-center">
        <AnimatePresence mode="wait" custom={slideDirection}
          onExitComplete={() => { lightboxJustOpened.current = false }}>
          <motion.img
            key={lightboxActiveImg}
            src={productImages[lightboxActiveImg]}
            className="max-w-full max-h-full object-contain px-4"
            alt={`Foto de ${product.name} à venda em ${partner.city} - ${partner.state}`}
            custom={slideDirection}
            variants={lightboxJustOpened.current ? {} : slideVariants}
            initial={lightboxJustOpened.current ? false : "enter"}
            animate="center"
            exit={lightboxJustOpened.current ? undefined : "exit"}
            transition={{ duration: 0.2 }}
          />
        </AnimatePresence>

        {variantLabel && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-4 py-2 rounded-full whitespace-nowrap">
            {variantLabel}
          </div>
        )}
      </div>
    </motion.div>
  )

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <DefaultModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        maxWidth="md"
      >
        <div className="flex flex-col">
          {/* Header with Dual Squares */}
          <div className="bg-brand-gray dark:bg-dark-border/50 rounded-2xl p-10 flex items-center justify-center gap-8 mb-8 relative group">
            <div className="w-20 h-20 bg-white dark:bg-dark-surface rounded-2xl p-4 flex items-center justify-center transform transition-transform group-hover:-rotate-3">
              <MoneyIcon size={32} className="text-brand-green" />
            </div>

            <div className="flex flex-col items-center gap-1">
              <div className="w-12 h-6 bg-white dark:bg-dark-surface rounded-full flex items-center justify-center border border-brand-border/50 dark:border-dark-border/50">
                <ArrowLeftRightIcon size={14} className="text-brand-dark dark:text-dark-heading" />
              </div>
            </div>

            <div className="w-20 h-20 bg-white dark:bg-dark-surface rounded-2xl p-4 flex items-center justify-center transform transition-transform group-hover:rotate-3 overflow-hidden">
              <img src={partnerProfileImageUrl || "https://img.dudit.com.br/static/Placeholder.png"} alt={partner.store_name} className="w-full h-full object-cover rounded-lg" />
            </div>
          </div>

          <h4 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-4 text-center">Onde vai o seu dinheiro?</h4>
          <div className="space-y-4 text-brand-inactive-text dark:text-dark-body text-[15px] text-center leading-relaxed">
            <p>
              Na Dudit, a transparência é total. Nós não processamos pagamentos diretamente e não ficamos com nenhuma comissão sobre a sua compra.
            </p>
            <p>
              Isso significa que o seu dinheiro vai direto para o vendedor, seja através de facilitadores seguros (como o Mercado Pago) ou por meio do acerto que você fizer direto no balcão ou no WhatsApp. É mais lucro para quem vende e mais agilidade para quem compra!
            </p>
          </div>
          <Button onClick={() => setShowPaymentModal(false)} className="w-full mt-8 h-12">Entendi</Button>
        </div>
      </DefaultModal>

      <DefaultModal
        isOpen={showResponsibilityModal}
        onClose={() => setShowResponsibilityModal(false)}
        maxWidth="md"
      >
        <div className="flex flex-col">
          {/* Header with Dual Squares */}
          <div className="bg-brand-gray dark:bg-dark-border/50 rounded-2xl p-10 flex items-center justify-center gap-8 mb-8 relative group">
            <div className="w-20 h-20 bg-white dark:bg-dark-surface rounded-2xl p-4 flex items-center justify-center transform transition-transform group-hover:-rotate-3 overflow-hidden">
              <img src={partnerProfileImageUrl || "https://img.dudit.com.br/static/Placeholder.png"} alt={partner.store_name} className="w-full h-full object-cover rounded-lg" />
            </div>

            <div className="flex flex-col items-center gap-1">
              <div className="w-12 h-6 bg-white dark:bg-dark-surface rounded-full flex items-center justify-center border border-brand-border/50 dark:border-dark-border/50">
                <ArrowLeftRightIcon size={14} className="text-brand-dark dark:text-dark-heading" />
              </div>
            </div>

            <div className="w-20 h-20 bg-white dark:bg-dark-surface rounded-2xl p-4 flex items-center justify-center transform transition-transform group-hover:rotate-3">
              <TruckIcon size={32} className="text-brand-green" />
            </div>
          </div>

          <h4 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-4 text-center">Quem cuida do seu pedido?</h4>
          <div className="space-y-4 text-brand-inactive-text dark:text-dark-body text-[15px] text-center leading-relaxed">
            <p>
              A Dudit é a ponte que conecta você ao vendedor. Nós cuidamos da vitrine, da organização e do registro do seu pedido, mas a execução da venda é por conta do vendedor.
            </p>
            <p>
              A responsabilidade por separar o produto, realizar a entrega, oferecer garantia e resolver trocas ou devoluções é exclusivamente do vendedor. Se tiver qualquer dúvida sobre o seu item, o melhor caminho é chamar o vendedor no WhatsApp para alinhar tudo, beleza?
            </p>
          </div>
          <Button onClick={() => setShowResponsibilityModal(false)} className="w-full mt-8 h-12">Entendi</Button>
        </div>
      </DefaultModal>

      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        url={isMounted ? window.location.href : ""}
        title={product.name}
        shareMessage={shareMessage}
        label="Link do produto"
      />

      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetType="product"
        targetId={product.id}
        targetName={product.name}
      />

      <DefaultModal
        isOpen={showQuantityModal}
        onClose={() => setShowQuantityModal(false)}
        maxWidth="sm"
      >
        <div className="flex flex-col items-center p-2">
          <h4 className="text-lg font-bold text-brand-dark mb-4 text-center">Informe a quantidade</h4>
          <div className="w-full space-y-4">
            <div>
              <label className="block text-xs font-bold text-brand-inactive-text mb-1 uppercase tracking-wider">Quantidade desejada</label>
              <Input
                type="number"
                placeholder="Ex: 10"
                value={customQuantity}
                onChange={(e) => setCustomQuantity(e.target.value)}
                autoFocus
                className="text-center text-lg font-bold"
              />
              <p className="text-[11px] text-brand-inactive-text mt-2 text-center">
                Limite disponível: <span className="font-bold">{MAX_STOCK} unidades</span>
              </p>
            </div>
            <Button
              className="w-full"
              disabled={!customQuantity || Number(customQuantity) <= 0 || Number(customQuantity) > MAX_STOCK}
              onClick={() => {
                setQuantity(Number(customQuantity))
                setShowQuantityModal(false)
              }}
            >
              Confirmar
            </Button>
          </div>
        </div>
      </DefaultModal>


      {!hideHeaderAndFooter && (
        <MarketplaceHeader
          userProfile={userProfile}
          cartCount={cartCount}
          productName={product.name}
          onShare={() => setShowShareModal(true)}
          onFavorite={() => setIsFavorite(!isFavorite)}
          isFavorite={isFavorite}
        />
      )}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="min-h-screen bg-white lg:pt-[50px] font-sans flex flex-col"
      >

        <AnimatePresence>
          {isMounted && isLightboxOpen && createPortal(LightboxContent, document.body)}
        </AnimatePresence>

        <div className="container mx-auto px-4 max-w-[1300px] lg:mt-6 mb-6 flex-grow pb-24 lg:pb-12">
          {/* Breadcrumb */}
          <div className="hidden lg:flex items-center gap-2 text-sm text-brand-inactive-text mb-8">
            <Link href="/" prefetch={true} className="hover:text-brand-dark transition-colors">Início</Link>
            <ChevronRightIcon size={10} />
            <Link href="/explorar?type=produtos" prefetch={true} className="hover:text-brand-dark transition-colors">Produtos</Link>
            <ChevronRightIcon size={10} />
            <span className="text-brand-inactive-text truncate max-w-[300px]">{product.name}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-12">
            <div className="lg:col-span-7">

              {/* Gallery */}
              <div className="flex gap-3 mb-6">
                {/* Desktop thumbnails */}
                <div className="hidden lg:flex flex-col gap-2 w-[70px] shrink-0">
                  {productImages.map((img: string, i: number) => (
                    <div key={i} onClick={() => goToImage(i)}
                      className={`w-full aspect-square rounded-md border cursor-pointer overflow-hidden transition-all
                        ${activeImgIndex === i ? "border-brand-green ring-1 ring-brand-green" : "border-brand-border hover:border-brand-border"}`}>
                      <img src={img} className="w-full h-full object-cover" alt={`Foto de ${product.name} em ${partner.city}`} />
                    </div>
                  ))}
                </div>

                <div className="flex-1 min-w-0 flex items-center gap-2 lg:gap-4">
                  {/* Desktop Prev Button */}
                  <div className="hidden lg:flex w-10 shrink-0 items-center justify-center">
                    {productImages.length > 1 && (
                      <button onClick={goToPrev} className="w-10 h-10 bg-white rounded-full flex items-center justify-center border border-brand-border hover:bg-brand-gray transition-colors shadow-sm">
                        <ChevronLeftIcon size={20} className="text-brand-dark" />
                      </button>
                    )}
                  </div>

                  <div className="relative flex-1 min-w-0">
                    {/* Desktop main image */}
                    <div className="hidden lg:block" style={{ paddingBottom: "100%", position: "relative" }}>
                      <div ref={galleryContainerRef}
                        className="absolute inset-0 bg-brand-gray overflow-hidden rounded-2xl cursor-zoom-in"
                        onMouseMove={(e) => {
                          const { left, top, width, height } = galleryContainerRef.current!.getBoundingClientRect()
                          zoomOriginX.set(((e.clientX - left) / width) * 100)
                          zoomOriginY.set(((e.clientY - top) / height) * 100)
                          zoomScale.set(2.2)
                        }}
                        onMouseLeave={() => zoomScale.set(1)}
                        onClick={() => openLightbox(activeImgIndex)}>
                        <AnimatePresence mode="wait" custom={slideDirection}>
                          <motion.img key={activeImgIndex} src={productImages[activeImgIndex]}
                            className="absolute inset-0 w-full h-full object-contain" alt={`Foto de ${product.name} à venda em ${partner.city} - ${partner.state}`}
                            custom={slideDirection} variants={slideVariants}
                            initial="enter" animate="center" exit="exit"
                            transition={{ duration: 0.2 }}
                            style={{ transformOrigin, scale: smoothScale }} />
                        </AnimatePresence>
                      </div>
                    </div>

                    {/* Mobile main image */}
                    <div className="lg:hidden relative bg-white rounded-xl overflow-hidden" style={{ aspectRatio: "1/1" }}>
                      <AnimatePresence mode="wait" custom={slideDirection}>
                        <motion.img key={activeImgIndex} src={productImages[activeImgIndex]}
                          className="absolute inset-0 w-full h-full object-contain" alt={`Foto de ${product.name} à venda em ${partner.city} - ${partner.state}`}
                          custom={slideDirection} variants={slideVariants}
                          initial="enter" animate="center" exit="exit"
                          transition={{ duration: 0.2 }}
                          onClick={() => openLightbox(activeImgIndex)} />
                      </AnimatePresence>
                      {productImages.length > 1 && (
                        <>
                          <button onClick={goToPrev}
                            className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/90 rounded-full flex items-center justify-center shadow-md z-10">
                            <ChevronLeftIcon size={18} className="text-brand-dark" />
                          </button>
                          <button onClick={goToNext}
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/90 rounded-full flex items-center justify-center shadow-md z-10">
                            <ChevronRightIcon size={18} className="text-brand-dark" />
                          </button>
                        </>
                      )}

                    </div>
                  </div>

                  {/* Desktop Next Button */}
                  <div className="hidden lg:flex w-10 shrink-0 items-center justify-center">
                    {productImages.length > 1 && (
                      <button onClick={goToNext} className="w-10 h-10 bg-white rounded-full flex items-center justify-center border border-brand-border hover:bg-brand-gray transition-colors shadow-sm">
                        <ChevronRightIcon size={20} className="text-brand-dark" />
                      </button>
                    )}
                  </div>

                  {/* Desktop Action Buttons */}
                  <div className="hidden lg:flex flex-col gap-3 shrink-0 self-start mt-2">
                    <button onClick={() => setIsFavorite(!isFavorite)} className="w-10 h-10 bg-white rounded-full flex items-center justify-center border border-brand-border hover:bg-brand-gray transition-colors shadow-sm" title="Favoritar">
                      <HeartIcon className={`w-5 h-5 ${isFavorite ? "text-brand-green fill-brand-green" : "text-brand-inactive-text"}`} />
                    </button>
                    <button onClick={() => setShowShareModal(true)} className="w-10 h-10 bg-white rounded-full flex items-center justify-center border border-brand-border hover:bg-brand-gray transition-colors shadow-sm" title="Compartilhar">
                      <ShareIcon className="w-5 h-5 text-brand-green" />
                    </button>
                  </div>
                </div>

              </div>

              {/* Buy panel (mobile/tablet) */}
              <div className="lg:hidden mb-6">{BuyPanel}</div>

              {/* Description */}
              <div className="mb-10">
                <h3 className="text-xl font-medium text-brand-dark mb-4">Descrição</h3>
                <div className={`relative ${!isDescriptionExpanded ? "max-h-[150px] overflow-hidden" : ""}`}>
                  <p className="text-sm md:text-[0.9375rem] text-gray-600 leading-relaxed whitespace-pre-wrap">
                    {product.description || "Sem descrição."}
                  </p>
                  {!isDescriptionExpanded && product.description?.length > 200 && (
                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent" />
                  )}
                </div>
                {product.description?.length > 200 && (
                  <button onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                    className="flex items-center gap-1 text-brand-green font-bold text-sm mt-3 hover:underline">
                    {isDescriptionExpanded ? "Ver menos descrição" : "Ver mais descrição"}
                    <ChevronDownIcon size={16} className={`transition-transform ${isDescriptionExpanded ? "rotate-180" : ""}`} />
                  </button>
                )}
              </div>

              {/* Technical specs */}
              {Array.isArray(product.technical_specs) && product.technical_specs.length > 0 && (
                <div className="mb-10">
                  <h3 className="text-xl font-medium text-brand-dark mb-4">Ficha Técnica</h3>
                  <div className="border border-brand-border rounded-xl overflow-hidden">
                    {product.technical_specs.map((spec: any, i: number, arr: any[]) => (
                      <div key={i} className={`flex justify-between items-center px-4 py-3
                        ${i % 2 === 0 ? "bg-brand-gray" : "bg-white"}
                        ${i < arr.length - 1 ? "border-b border-brand-border" : ""}`}>
                        <span className="text-sm text-brand-inactive-text font-medium">{spec.label || spec.name || ""}</span>
                        <span className="text-sm text-brand-dark font-semibold text-right">{spec.value || ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reviews */}
              <div ref={reviewsRef} className="border-t border-brand-border pt-2">
                <h3 className="text-xl font-medium text-brand-dark mb-6 mt-8">Avaliações do produto</h3>
                {reviews.length > 0 && (
                  <div className="border border-brand-border rounded-xl p-5 mb-8 flex gap-8 items-center">
                    <div className="text-center shrink-0">
                      <p className="text-5xl font-black text-brand-dark leading-none mb-2">{avgRating.toFixed(1)}</p>
                      <div className="flex justify-center mb-1.5"><StarRow rating={avgRating} size={14} /></div>
                      <p className="text-xs text-brand-inactive-text">média de {reviews.length} avaliações</p>
                    </div>
                    <div className="flex-1 space-y-2">
                      {[5, 4, 3, 2, 1].map((star) => {
                        const count = reviews.filter((r) => r.rating === star).length
                        const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0
                        return (
                          <div key={star} className="flex items-center gap-2">
                            <span className="text-xs text-brand-inactive-text w-3 shrink-0">{star}</span>
                            <StarIcon size={10} strokeWidth={0} className="text-brand-inactive-text fill-gray-400 shrink-0" />
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full bg-brand-green rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-brand-inactive-text w-4 text-right shrink-0">{count}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                {reviews.length > 0 ? (
                  <div className="space-y-6">
                    {reviews.map((rev: any, i: number) => (
                      <div key={i} className="border-b border-brand-border pb-6 last:border-0">
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-brand-inactive-text">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-sm text-brand-dark">{rev.profiles?.full_name || "Usuário"}</span>
                              <span className="text-xs text-brand-inactive-text shrink-0">
                                {new Date(rev.created_at).toLocaleDateString("pt-BR")}
                              </span>
                            </div>
                            <div className="mt-1"><StarRow rating={rev.rating} size={11} /></div>
                          </div>
                        </div>
                        <p className="text-gray-600 text-sm leading-relaxed ml-12">{rev.comment}</p>
                      </div>
                    ))}
                  </div>
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
            </div>

            {/* Desktop buy panel */}
            <div className="hidden lg:block lg:col-span-5 relative">
              {BuyPanel}
            </div>
          </div>

          {/* Mobile bottom bar */}
          {!isProductOwner && (
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 z-50 flex gap-3 lg:hidden shadow-lg">
              <Button variant="outline" className="w-12 h-12 rounded-full border-brand-green text-brand-green"
                disabled={isOutOfStock || loading} onClick={handleAddToCart}>
                <ShoppingCartIcon size={20} />
              </Button>
              <Button className="flex-1 rounded-full" disabled={isOutOfStock || loading} onClick={handleBuyNow}>
                {isOutOfStock ? "Esgotado" : "Comprar Agora"}
              </Button>
            </div>
          )}


        </div>

        {/* Redundant footer removed */}
      </motion.div>
    </>
  )
}
