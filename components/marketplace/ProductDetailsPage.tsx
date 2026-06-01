"use client"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion"
import { useSupabase } from "@/providers/supabase-provider"
import { HeartIcon, ShareIcon, StarIcon, ChevronRightIcon, ChevronLeftIcon, ChevronDownIcon, CheckCircleIcon, XIcon, ShoppingCartIcon, TruckIcon, FlagIcon, ArrowLeftRightIcon, PlusIcon } from "@/lib/icons"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { Button, Input, FormDropdown, IconPlaceholder, DefaultModal, Separator, FormSection, CepInput, Spinner, StateComboBox, RadioButton, NumberInputWithCheckbox } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import { ShareModal } from "./ShareModal"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { ReportModal } from "./ReportModal"
import { addToCartAction } from "@/app/actions/marketplace/cart"
import { InfoCard } from "@/components/reusable/InfoCard"
import { useNotification } from "@/hooks/use-notification"
import { invalidateCartCache } from "@/hooks/use-cart"
import { computeOrderPreparationEstimate } from "@/lib/utils/order-preparation"
import { getPartnerDeliveryConfigAction, quoteDeliveryFeeAction } from "@/app/actions/shared/delivery"
import { getAddressesAction, createAddressAction } from "@/app/actions/shared/addresses"
import { FavoriteButton } from "./FavoriteButton"
import { VendorPaymentMethodsModal } from "./VendorPaymentMethodsModal"
import { getPartnerUrl } from "@/lib/utils/url-generator"

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

function ActionButtons({ productId, onShareClick, className = "" }: { productId: string, onShareClick: () => void, className?: string }) {
    return (
        <div className={`flex flex-col gap-3 ${className}`}>
            <FavoriteButton
                itemId={productId}
                itemType="produto"
                size="lg"
                variant="inline"
            />
            <Button
                variant="filled"
                onClick={(e) => { e.stopPropagation(); onShareClick(); }}
                className="w-9 h-9 flex items-center justify-center"
            >
                <ShareIcon className="w-4 h-4 text-brand-green" />
            </Button>
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
    // isFavorite state is now managed by FavoritesProvider
    const [isMounted, setIsMounted] = useState(false)
    const [showQuantityModal, setShowQuantityModal] = useState(false)
    const [customQuantity, setCustomQuantity] = useState("")
    const [deliveryConfig, setDeliveryConfig] = useState<any>(null)
    const [showPaymentMethodsModal, setShowPaymentMethodsModal] = useState(false)
    const [deliveryFee, setDeliveryFee] = useState<number | null>(null)
    const [deliveryError, setDeliveryError] = useState<string | null>(null)
    const [deliveryLoading, setDeliveryLoading] = useState(false)
    const [calculatedAddress, setCalculatedAddress] = useState<string | null>(null)
    const [expandedAccordion, setExpandedAccordion] = useState<string | null>(null)

    // Address flow states (checkout-like)
    const [userAddresses, setUserAddresses] = useState<any[]>([])
    const [selectedAddressId, setSelectedAddressId] = useState<string>("")
    const selectedAddress = userAddresses.find(a => a.id === selectedAddressId)
    const [showAddressForm, setShowAddressForm] = useState(false)
    const [showAddressModal, setShowAddressModal] = useState(false)
    const [loadingAddresses, setLoadingAddresses] = useState(false)
    const [loadingCep, setLoadingCep] = useState(false)
    const [newAddressData, setNewAddressData] = useState({
        zipCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", noNumber: false
    })

    const partner = useMemo(() => {
        const p = Array.isArray(product.partners) ? product.partners[0] : product.partners
        const address = p?.addresses?.[0] || {}
        return {
            id: p?.id || product.partner_id || "1",
            user_id: p?.user_id,
            store_name: p?.store_name || "Vendedor da Dudit",
            city: address?.city || "Brasil",
            state: address?.state || "BR",
            store_image_url: p?.store_image_url || null,
            store_avatar: p?.store_image_url || p?.store_avatar || p?.profile_image_url || "https://img.dudit.com.br/static/Placeholder.png",
            profile_image_url: p?.profile_image_url || null,
            banner_url: p?.banner_url || null,
            logo_moderation_status: p?.logo_moderation_status || 'approved',
            banner_moderation_status: p?.banner_moderation_status || 'approved',
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
            vendas_totais: p?.vendas_totais || 0,
            created_at: p?.created_at,
        }
    }, [product])

    // Load user addresses if logged in
    useEffect(() => {
        if (userId) {
            loadUserAddresses()
        } else {
            setUserAddresses([])
            setSelectedAddressId("")
        }
    }, [userId])

    const loadUserAddresses = async () => {
        if (!userId) return
        setLoadingAddresses(true)
        try {
            const result = await getAddressesAction(userId, "user")
            if (result.addresses) {
                const list = result.addresses as any[]
                setUserAddresses(list)
                const defaultAddress = list.find((a: any) => a.is_default)
                if (defaultAddress) {
                    setSelectedAddressId(defaultAddress.id)
                } else if (list.length > 0) {
                    setSelectedAddressId(list[0].id)
                }
            }
        } catch (err) {
            console.error("Error loading addresses:", err)
        } finally {
            setLoadingAddresses(false)
        }
    }

    const buildAddressString = (a: any) =>
        `${a.street}, ${a.number}${a.complement ? `, ${a.complement}` : ""} - ${a.neighborhood}, ${a.city} - ${a.state}, ${a.zip_code}`

    const handleAddressSelect = (addressId: string) => {
        setSelectedAddressId(addressId)
    }

    const handleCepBlur = async () => {
        const zip = newAddressData.zipCode.replace(/\D/g, "")
        if (zip.length !== 8) return
        setLoadingCep(true)
        try {
            const response = await fetch(`/api/cep?cep=${zip}`)
            const data = await response.json()
            if (!data.erro && !data.error) {
                setNewAddressData(prev => ({
                    ...prev,
                    street: data.logradouro || prev.street,
                    neighborhood: data.bairro || prev.neighborhood,
                    city: data.localidade || data.municipio || prev.city,
                    state: data.uf || prev.state,
                }))
            }
        } catch (err) {
            console.error("Erro ao buscar CEP:", err)
        } finally {
            setLoadingCep(false)
        }
    }

    const handleSaveNewAddress = async () => {
        if (!userId) return
        const { zipCode, street, number, neighborhood, city, state, noNumber } = newAddressData
        const finalNumber = noNumber ? "S/N" : number
        if (!zipCode || !street || !finalNumber || !neighborhood || !city || !state) {
            setDeliveryError("Preencha todos os campos obrigatórios do endereço")
            return
        }
        setDeliveryLoading(true)
        let csrfToken = ""
        try {
            const csrfRes = await fetch("/api/csrf-token")
            const csrfData = await csrfRes.json()
            csrfToken = csrfData.token || ""
        } catch {
            notifyError("Erro de Segurança", "Erro ao validar segurança. Recarregue a página.")
            setDeliveryLoading(false)
            return
        }
        const result = await createAddressAction({
            entityId: userId, entityType: "user",
            street, number: finalNumber, complement: newAddressData.complement,
            neighborhood, city, state, zipCode,
            isDefault: userAddresses.length === 0,
            csrf_token: csrfToken,
        })
        if (result.error) {
            setDeliveryError(result.error)
        } else {
            if (result.address) {
                setUserAddresses(prev => [...prev, result.address])
                setSelectedAddressId(result.address.id)
            } else {
                await loadUserAddresses()
            }
            setShowAddressForm(false)
            setNewAddressData({ zipCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", noNumber: false })
            setDeliveryError(null)
        }
        setDeliveryLoading(false)
    }

    // Automatically calculate delivery when selectedAddress changes (for logged in users)
    useEffect(() => {
        if (!selectedAddress || !partner.id) return
        let active = true

        async function calculateForAddress() {
            setDeliveryLoading(true)
            setDeliveryError(null)
            try {
                const addressStr = buildAddressString(selectedAddress)
                setCalculatedAddress(`${selectedAddress.city} - ${selectedAddress.state}`)
                setShippingState("calculated")
                setCep(selectedAddress.zip_code || "")

                const quote = await quoteDeliveryFeeAction({
                    partnerId: partner.id,
                    destinationAddress: addressStr,
                })
                if (!active) return
                if (quote.success) {
                    setDeliveryFee(Number(quote.fee || 0))
                    setDeliveryError(null)
                } else {
                    setDeliveryFee(null)
                    setDeliveryError(quote.error || "Não realizamos entrega para este endereço.")
                }
            } catch (err) {
                if (active) {
                    setDeliveryError("Erro ao calcular o frete.")
                    setDeliveryFee(null)
                    setCalculatedAddress(null)
                }
            } finally {
                if (active) setDeliveryLoading(false)
            }
        }

        calculateForAddress()
        return () => { active = false }
    }, [selectedAddress, partner.id])

    // Automatically calculate delivery when CEP becomes 8 digits (for logged out users)
    useEffect(() => {
        if (userId) return // If logged in, use selectedAddress useEffect
        const cleanedCep = cep.replace(/\D/g, "")
        if (cleanedCep.length !== 8) {
            if (cleanedCep.length === 0) {
                setDeliveryFee(null)
                setDeliveryError(null)
                setCalculatedAddress(null)
                setShippingState("initial")
            }
            return
        }

        let active = true
        async function calculateForCep() {
            setDeliveryLoading(true)
            setDeliveryError(null)
            try {
                const response = await fetch(`/api/cep?cep=${cleanedCep}`)
                const data = await response.json()
                if (!active) return

                if (data.erro || data.error) {
                    setDeliveryError("CEP não encontrado.")
                    setDeliveryFee(null)
                    setCalculatedAddress(null)
                    return
                }

                const addressStr = `${data.logradouro || "Rua"}, S/N - ${data.bairro || "Bairro"}, ${data.localidade || "Cidade"} - ${data.uf || "UF"}, ${cleanedCep}`
                setCalculatedAddress(`${data.localidade} - ${data.uf}`)
                setShippingState("calculated")

                const quote = await quoteDeliveryFeeAction({
                    partnerId: partner.id,
                    destinationAddress: addressStr,
                })
                if (!active) return
                if (quote.success) {
                    setDeliveryFee(Number(quote.fee || 0))
                    setDeliveryError(null)
                } else {
                    setDeliveryFee(null)
                    setDeliveryError(quote.error || "Não realizamos entrega para este CEP.")
                }
            } catch (err) {
                if (active) {
                    setDeliveryError("Erro ao calcular o frete.")
                    setDeliveryFee(null)
                    setCalculatedAddress(null)
                }
            } finally {
                if (active) setDeliveryLoading(false)
            }
        }

        calculateForCep()
        return () => { active = false }
    }, [cep, partner.id, userId])

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
            if (variantImages.length) images = Array.from(new Set(variantImages))
        }
        if (images.length) return images
        if (product.video_type && product.video_url) return []
        const videoThumb = product.video_thumbnail
        if (videoThumb && String(videoThumb).trim()) {
            const url = String(videoThumb)
            return [url.startsWith("http") ? url : getProductImageUrl(url)]
        }
        return [PLACEHOLDER]
    }, [product.images, product.video_thumbnail, product.video_type, product.video_url, variants])

    const galleryItems = useMemo(() => {
        const videoType = product.video_type
        const hasVideo = videoType && product.video_url
        const videoItems = hasVideo ? [{
            type: "video" as const,
            src: String(product.video_url),
            poster: product.video_thumbnail || undefined,
            provider: videoType,
            providerId: product.video_provider_id || undefined,
        }] : []

        return [
            ...videoItems,
            ...productImages.map((src: string) => ({ type: "image" as const, src })),
        ]
    }, [product.video_type, product.video_url, product.video_thumbnail, product.video_provider_id, productImages])

    const videoOffset = galleryItems[0]?.type === "video" ? 1 : 0

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

    const displayRating = useMemo(() => {
        return reviews.length >= 3 ? avgRating.toFixed(1) : "-";
    }, [reviews, avgRating])

    const formattedJoinedDate = useMemo(() => {
        if (!partner.created_at) return "Recente"
        try {
            const date = new Date(partner.created_at)
            return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
        } catch {
            return "Recente"
        }
    }, [partner.created_at])

    const reputationLevel = useMemo(() => {
        const sales = partner.vendas_totais || 0
        const rating = partner.rating || 5.0
        if (sales >= 2000 && rating >= 4.7) {
            return { name: "Diamante", badge: "💎", color: "text-brand-green bg-green-50/50 border-green-200", description: "Vendedor Diamante com excelente histórico de atendimento.", level: 5 }
        }
        if (sales >= 500 && rating >= 4.5) {
            return { name: "Platina", badge: "💎", color: "text-brand-green bg-green-50/50 border-green-200", description: "Vendedor Destaque Platina na Dudit.", level: 4 }
        }
        if (sales >= 100 && rating >= 4.3) {
            return { name: "Ouro", badge: "🥇", color: "text-brand-green bg-green-50/50 border-green-200", description: "Vendedor com reputação Ouro e ótimo serviço.", level: 3 }
        }
        if (sales >= 20 && rating >= 4.0) {
            return { name: "Prata", badge: "🥈", color: "text-brand-green bg-green-50/50 border-green-200", description: "Vendedor Prata consistente na plataforma.", level: 2 }
        }
        return { name: "Bronze", badge: "🥉", color: "text-brand-green bg-green-50/50 border-green-200", description: "Vendedor Bronze iniciando suas vendas na Dudit.", level: 1 }
    }, [partner])

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

    const partnerProfileImageUrl = getR2ImageUrl(partner.store_avatar)
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
            if (first.imageIndex !== -1) setActiveImgIndex(first.imageIndex + videoOffset)
        }
    }, [processedVariants, selectedVariant, videoOffset])

    const handleAttributeSelect = useCallback((key: string, value: string) => {
        const newAttrs = { ...selectedAttributes, [key]: value }
        let match = processedVariants.find((v) => Object.entries(newAttrs).every(([k, val]) => v.attributes[k] === val))
        if (!match || (match.stock_available ?? match.stock_quantity ?? 0) === 0)
            match = processedVariants.find((v) => v.attributes[key] === value && (v.stock_available ?? v.stock_quantity ?? 0) > 0)
        if (match) {
            setSelectedAttributes(match.attributes)
            setSelectedVariant(match)
            setQuantity(1)
            if (match.imageIndex !== -1) setActiveImgIndex(match.imageIndex + videoOffset)
        }
    }, [selectedAttributes, processedVariants, videoOffset])

    const goToImage = useCallback((index: number) => {
        setSlideDirection(index > activeImgIndex ? 1 : -1)
        setActiveImgIndex(index)
    }, [activeImgIndex])

    const goToPrev = useCallback(() => {
        setSlideDirection(-1)
        setActiveImgIndex((p: number) => (p - 1 + galleryItems.length) % galleryItems.length)
    }, [galleryItems.length])

    const goToNext = useCallback(() => {
        setSlideDirection(1)
        setActiveImgIndex((p: number) => (p + 1) % galleryItems.length)
    }, [galleryItems.length])

    const lightboxNav = useCallback((dir: 1 | -1) => {
        lightboxJustOpened.current = false
        setSlideDirection(dir)
        setLightboxActiveImg((p: number) => (p + dir + galleryItems.length) % galleryItems.length)
    }, [galleryItems.length])

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
                image: productImages[Math.max(0, activeImgIndex - videoOffset)] || productImages[0],
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
    }, [userId, router, partner, product, selectedVariant, pricing.current, quantity, productImages, activeImgIndex, videoOffset])


    const shareMessage = useMemo(() => {
        return `🔥 Olha esse achado na Dudit!\n\n` +
            `*${product.name}*\n` +
            `Confere aqui os detalhes:`;
    }, [product.name, pricing]);

    // ─── Sub-sections ────────────────────────────────────────────────────────────

    const renderGalleryItem = (
        item: (typeof galleryItems)[number],
        className: string,
        alt: string,
        layout: "inline" | "lightbox" = "inline",
    ) => {
        if (item.type === "video") {
            const shellClass =
                layout === "lightbox"
                    ? "w-full h-full min-h-[50vh] max-h-[85vh] max-w-[min(96vw,1100px)] flex items-center justify-center"
                    : "absolute inset-0 w-full h-full"
            const mediaClass = layout === "lightbox" ? "w-full h-full min-h-[50vh] max-h-[85vh] aspect-video border-0" : "absolute inset-0 w-full h-full border-0"

            if (item.provider === "youtube" && item.providerId) {
                return (
                    <motion.div key={item.src} className={shellClass} custom={slideDirection} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
                        <iframe src={`https://www.youtube.com/embed/${item.providerId}`} title={alt} loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen className={mediaClass} />
                    </motion.div>
                )
            }
            if (item.provider === "vimeo" && item.providerId) {
                return (
                    <motion.div key={item.src} className={shellClass} custom={slideDirection} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
                        <iframe src={`https://player.vimeo.com/video/${item.providerId}`} title={alt} loading="lazy" allow="fullscreen; picture-in-picture" allowFullScreen className={mediaClass} />
                    </motion.div>
                )
            }
            return (
                <motion.div key={item.src} className={shellClass} custom={slideDirection} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
                    <video src={item.src} poster={item.poster} controls preload="metadata" playsInline className={mediaClass} />
                </motion.div>
            )
        }
        return <motion.img key={item.src} src={item.src} className={className} alt={alt} custom={slideDirection} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }} />
    }

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
                    <div className="flex items-center gap-2 mb-1.5">
                        <label className="block text-sm font-medium text-brand-dark dark:text-dark-heading truncate">Quantidade</label>
                        <span className="text-xs text-brand-inactive-text font-medium leading-none">({MAX_STOCK} disponíveis)</span>
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
                {(() => {
                    const hasPromo = pricing.hasPromo;
                    const hasPix = pricing.pixDiscountPercent > 0;
                    const pixUnitPrice = pricing.current * (1 - pricing.pixDiscountPercent / 100);
                    const totalDiscountPercent = pricing.original > 0 ? Math.round(((pricing.original - pixUnitPrice) / pricing.original) * 100) : 0;

                    // Caso 3: Promoção + Pix (melhor opção)
                    if (hasPromo && hasPix) {
                        return (
                            <div className="space-y-1">
                                <span className="text-sm text-brand-inactive-text line-through font-normal">{formatMoney(pricing.original)}</span>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-xl sm:text-2xl md:text-[2.25rem] leading-none font-bold text-brand-dark">
                                        {formatMoney(pixUnitPrice)}
                                    </p>
                                    <span className="bg-red-100 text-red-700 text-[11px] font-bold px-2 py-0.5 rounded-full">{pricing.discountPercent}% OFF</span>
                                    <span className="text-xs md:text-sm font-semibold text-brand-green bg-green-50 border border-green-100 px-2 py-0.5 rounded-sm">no Pix</span>
                                </div>
                                <p className="text-xs md:text-[0.875rem] text-brand-inactive-text mt-1">
                                    ou {formatMoney(pricing.current)} em outros meios
                                </p>
                                <button type="button" onClick={() => setShowPaymentMethodsModal(true)} className="text-xs md:text-[0.875rem] text-brand-green hover:underline font-bold mt-1 block text-left">
                                    ver opções de pagamento
                                </button>
                            </div>
                        );
                    }

                    // Caso 1: Só promoção
                    if (hasPromo && !hasPix) {
                        return (
                            <div className="space-y-1">
                                <span className="text-sm text-brand-inactive-text line-through font-normal">{formatMoney(pricing.original)}</span>
                                <div className="flex items-center gap-2">
                                    <p className="text-xl sm:text-2xl md:text-[2.25rem] leading-none font-bold text-brand-dark">
                                        {formatMoney(pricing.current)}
                                    </p>
                                    <span className="bg-red-100 text-red-700 text-[11px] font-bold px-2 py-0.5 rounded-full">{pricing.discountPercent}% OFF</span>
                                </div>
                                <button type="button" onClick={() => setShowPaymentMethodsModal(true)} className="text-xs md:text-[0.875rem] text-brand-green hover:underline font-bold mt-1 block text-left">
                                    ver opções de pagamento
                                </button>
                            </div>
                        );
                    }

                    // Caso 2: Só desconto no Pix
                    if (!hasPromo && hasPix) {
                        return (
                            <div className="space-y-1">
                                <span className="text-sm text-brand-inactive-text line-through font-normal">{formatMoney(pricing.original)}</span>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-3xl leading-none font-bold text-brand-dark">
                                        {formatMoney(pixUnitPrice)}
                                    </p>
                                    <span className="text-sm text-brand-green font-medium mt-auto">{pricing.pixDiscountPercent}% no Pix</span>
                                </div>
                                <p className="text-xs md:text-[0.875rem] text-brand-inactive-text mt-1">
                                    ou {formatMoney(pricing.original)} em outros meios
                                </p>
                                <button type="button" onClick={() => setShowPaymentMethodsModal(true)} className="text-xs md:text-[0.875rem] text-brand-green hover:underline font-bold mt-1 block text-left">
                                    ver opções de pagamento
                                </button>
                            </div>
                        );
                    }

                    // Caso 4: Sem promoção e sem Pix
                    return (
                        <div className="space-y-1">
                            <p className="text-xl sm:text-2xl md:text-[2.25rem] leading-none font-bold text-brand-dark">
                                {formatMoney(pricing.current)}
                            </p>
                            <Button variant="link" onClick={() => setShowPaymentMethodsModal(true)} className="text-xs md:text-[0.875rem] text-brand-green hover:underline font-bold mt-1 block text-left">
                                Ver opções de pagamento
                            </Button>
                        </div>
                    );
                })()}
            </div>

            {VariantsSection}

            {isProductOwner ? (
                <InfoCard
                    message={isTeamMember
                        ? "Você não pode comprar produtos de um negócio do qual faz parte da equipe."
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
                <FormSection title="Entrega" className="mb-8">
                    <div className="flex flex-col border border-brand-border rounded-2xl bg-white overflow-hidden">
                        {/* CEP Input or User Address */}
                        {userId ? (
                            loadingAddresses ? (
                                <div className="p-4 bg-brand-gray/10 text-center text-xs text-brand-inactive-text animate-pulse">
                                    Carregando endereços...
                                </div>
                            ) : userAddresses.length > 0 && selectedAddress ? (
                                <div className="flex items-center justify-between w-full p-4 bg-brand-gray/10">
                                    <div className="flex items-stretch gap-3">
                                        <img
                                            src="https://img.dudit.com.br/static/Map.png"
                                            alt="Endereço de entrega"
                                            className="w-12 h-12 object-cover rounded-xl shrink-0"
                                        />
                                        <div className="flex flex-col justify-center">
                                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Endereço de Entrega</p>
                                            <p className="text-xs text-brand-inactive-text max-w-[200px] sm:max-w-xs truncate">
                                                {selectedAddress.street}, {selectedAddress.number}
                                            </p>
                                        </div>
                                    </div>
                                    <Button variant="link" size="sm" className="text-brand-green font-bold hover:underline p-0" onClick={() => setShowAddressModal(true)}>
                                        Trocar
                                    </Button>
                                </div>
                            ) : (
                                <div className="p-4 bg-brand-gray/10 flex flex-col items-center justify-center text-center gap-2">
                                    <p className="text-xs text-brand-inactive-text">Nenhum endereço cadastrado</p>
                                    <Button variant="outline" size="sm" className="h-8 border-brand-green text-brand-green hover:bg-green-50" onClick={() => setShowAddressForm(true)}>
                                        Cadastrar endereço
                                    </Button>
                                </div>
                            )
                        ) : (
                            <div className="p-4 bg-brand-gray/10">
                                <CepInput
                                    value={cep}
                                    onChange={setCep}
                                    label="Calcular entrega"
                                />
                            </div>
                        )}

                        <Separator className="opacity-60" />

                        {/* Delivery Option if configured */}
                        {deliveryConfig?.settings?.isDeliveryEnabled ? (
                            <>
                                <div className="flex justify-between items-start py-4 px-4">
                                    <div>
                                        <p className="text-sm text-brand-dark font-medium leading-snug">Entrega pelo vendedor</p>
                                        {deliveryLoading ? (
                                            <p className="text-xs text-brand-inactive-text animate-pulse">Calculando...</p>
                                        ) : deliveryError ? (
                                            <p className="text-xs text-brand-red">{deliveryError}</p>
                                        ) : calculatedAddress ? (
                                            <p className="text-xs text-brand-green font-medium">Para {calculatedAddress}</p>
                                        ) : (
                                            <p className="text-xs text-brand-inactive-text">Informe seu CEP para calcular</p>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        {deliveryLoading ? (
                                            <div className="w-4 h-4 border-2 border-brand-green border-t-transparent rounded-full animate-spin ml-auto" />
                                        ) : deliveryFee !== null ? (
                                            <p className={`text-sm font-bold ${deliveryFee > 0 ? "text-brand-dark" : "text-brand-green"}`}>
                                                {deliveryFee > 0 ? formatMoney(deliveryFee) : "Grátis"}
                                            </p>
                                        ) : (
                                            <p className="text-sm font-semibold text-brand-inactive-text">-</p>
                                        )}
                                    </div>
                                </div>

                                <Separator className="opacity-60" />
                            </>
                        ) : (
                            <>
                                <div className="flex justify-between items-start py-4 px-4">
                                    <div>
                                        <p className="text-sm text-brand-dark font-medium leading-snug">Entrega a combinar</p>
                                        <p className="text-xs text-brand-inactive-text">Fale com o vendedor no WhatsApp após o pedido</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-brand-dark">A combinar</p>
                                    </div>
                                </div>

                                <Separator className="opacity-60" />
                            </>
                        )}

                        {/* Retirar no local - Always show if store exists */}
                        <div className="flex justify-between items-start py-4 px-4">
                            <div>
                                <p className="text-sm text-brand-dark font-medium leading-snug">Retirar no local</p>
                                {preparationEstimate && Number(product.availability_value || 0) > 0 && (
                                    <p className="text-xs text-brand-inactive-text">
                                        Pronto entre {preparationEstimate.readyAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} e {preparationEstimate.pickupWindowEnd.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                    </p>
                                )}
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-bold text-brand-green">Grátis</p>
                            </div>
                        </div>
                    </div>
                </FormSection>
            )}

            {/* Informações importantes Accordion */}
            <div className="border-t border-brand-border pt-4 mb-6">
                <div className="border-b border-brand-border pb-3">
                    <button
                        type="button"
                        onClick={() => setExpandedAccordion(expandedAccordion === "important_info" ? null : "important_info")}
                        className="w-full flex items-center justify-between py-2 text-left hover:text-brand-green transition-colors"
                    >
                        <span className="font-bold text-brand-dark text-sm">Informações importantes</span>
                        <ChevronDownIcon
                            size={18}
                            className={`text-brand-inactive-text transition-transform duration-200 ${expandedAccordion === "important_info" ? "rotate-180" : ""}`}
                        />
                    </button>
                    <AnimatePresence initial={false}>
                        {expandedAccordion === "important_info" && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2, ease: "easeInOut" }}
                                className="overflow-hidden"
                            >
                                <div className="pt-2 pb-1 flex flex-col gap-3">
                                    {/* Item 1 */}
                                    <button
                                        type="button"
                                        onClick={() => setShowPaymentModal(true)}
                                        className="w-full text-left py-2 px-1 hover:bg-brand-gray/50 transition-colors flex flex-col gap-0.5"
                                    >
                                        <span className="text-sm font-semibold text-brand-dark">Pagamento direto ao vendedor</span>
                                        <span className="text-xs text-brand-inactive-text">Entenda onde vai o seu dinheiro nesta compra</span>
                                    </button>
                                    {/* Item 2 */}
                                    <button
                                        type="button"
                                        onClick={() => setShowResponsibilityModal(true)}
                                        className="w-full text-left py-2 px-1 hover:bg-brand-gray/50 transition-colors flex flex-col gap-0.5"
                                    >
                                        <span className="text-sm font-semibold text-brand-dark">Quem cuida do seu pedido?</span>
                                        <span className="text-xs text-brand-inactive-text">Entenda sobre a entrega, garantia e pós-venda</span>
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Store (Reputation & Levels Card) */}
            <div className="mb-8 mt-4">
                {(() => {
                    const sellerBannerImage = partner.banner_url ? getR2ImageUrl(partner.banner_url) : "https://img.dudit.com.br/static/Placeholder.png";
                    const sellerAvatarImage = partner.store_avatar && !partner.store_avatar.includes("Placeholder.png") ? getR2ImageUrl(partner.store_avatar) : null;

                    return (
                        <div className="border border-brand-border rounded-2xl overflow-hidden bg-white">
                            {/* Top clickable block linking to partner profile */}
                            <Link href={getPartnerUrl(partner)} className="block group">
                                {/* Banner */}
                                <div className="h-20 w-full relative bg-gray-100 overflow-hidden select-none">
                                    <img src={sellerBannerImage} alt="" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/10" />
                                </div>

                                {/* Profile Header */}
                                <div className="px-4 pt-0 relative flex flex-col">
                                    {/* Avatar Container overlapping the banner */}
                                    <div className="w-16 h-16 rounded-full border-2 border-white overflow-hidden bg-white -mt-8 z-10 self-start">
                                        <UserProfileImage
                                            fullName={partner.store_name}
                                            imageUrl={sellerAvatarImage}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>

                                    {/* Store Name and Details */}
                                    <div className="mt-2 min-w-0">
                                        <div className="flex items-center gap-1.5 justify-between">
                                            <span className="font-bold text-brand-dark group-hover:text-brand-green group-hover:underline text-base truncate">
                                                {partner.store_name}
                                            </span>
                                            <div className="flex items-center gap-1 shrink-0 px-1.5 py-0.5">
                                                <StarIcon size={12} className="text-brand-green fill-brand-green" strokeWidth={0} />
                                                <span className="text-xs font-bold text-brand-dark">{displayRating}</span>
                                            </div>
                                        </div>
                                        <p className="text-xs text-brand-inactive-text mt-0.5 font-medium">
                                            {partner.city} - {partner.state}
                                        </p>
                                    </div>
                                </div>
                            </Link>

                            <div className="px-4 pb-4">
                                {/* Reputation & Levels Bar */}
                                <div className="my-6 flex flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-base leading-none">{reputationLevel.badge}</span>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-brand-dark">Selo Dudit: {reputationLevel.name}</span>
                                            <span className="text-xs text-brand-inactive-text">Nível do vendedor baseado em reputação e vendas</span>
                                        </div>
                                    </div>

                                    {/* Horizontal segment bars */}
                                    <div className="flex gap-1 h-1.5 w-full bg-transparent rounded-full overflow-hidden mt-1 select-none">
                                        {[1, 2, 3, 4, 5].map((lvl) => (
                                            <div
                                                key={lvl}
                                                className={`flex-1 h-full rounded-sm transition-all duration-300 ${reputationLevel.level >= lvl ? "bg-brand-green" : "bg-gray-200"
                                                    }`}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* 3 columns metrics */}
                                <div className="grid grid-cols-3 gap-2 pt-4 border-t border-brand-border text-center select-none">
                                    <div className="flex flex-col items-center">
                                        <span className="text-sm font-bold text-brand-dark">{displayRating}</span>
                                        <span className="text-[10px] font-semibold text-brand-inactive-text mt-0.5">Avaliação</span>
                                    </div>
                                    <div className="flex flex-col items-center border-x border-brand-border">
                                        <span className="text-sm font-bold text-brand-dark">{partner.vendas_totais || 0}</span>
                                        <span className="text-[10px] font-semibold text-brand-inactive-text mt-0.5">Vendas</span>
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <span className="text-sm font-bold text-brand-dark">{formattedJoinedDate}</span>
                                        <span className="text-[10px] font-semibold text-brand-inactive-text mt-0.5">Cadastro</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}
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



    // ─── Render ──────────────────────────────────────────────────────────────────
    return (
        <>
            <DefaultModal
                isOpen={showPaymentModal}
                onClose={() => setShowPaymentModal(false)}
                maxWidth="md"
                hideHeader={true}
            >
                <div className="flex flex-col relative">
                    <button
                        onClick={() => setShowPaymentModal(false)}
                        className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
                        title="Fechar"
                    >
                        <XIcon size={16} />
                    </button>
                    {/* Header with Dual Squares */}
                    <div className="h-[200px] rounded-2xl flex items-end justify-center mb-8 relative overflow-hidden"
                        style={{ background: 'linear-gradient(180deg, #0d5e49 0%, var(--brand-dark) 100%)' }}>
                        <img
                            src="https://img.dudit.com.br/static/icons/Pagamento.png"
                            alt="Pagamento"
                            className="w-64 h-auto object-contain transform translate-y-6"
                        />
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
                hideHeader={true}
            >
                <div className="flex flex-col relative">
                    <button
                        onClick={() => setShowResponsibilityModal(false)}
                        className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-brand-dark dark:text-dark-heading transition-colors"
                        title="Fechar"
                    >
                        <XIcon size={16} />
                    </button>
                    {/* Header with Dual Squares */}
                    <div className="bg-brand-gray dark:bg-dark-border/50 rounded-2xl p-10 flex items-center justify-center gap-8 mb-8 relative group">
                        <div className="w-20 h-20 bg-white dark:bg-dark-surface rounded-2xl p-4 flex items-center justify-center transform transition-transform group-hover:-rotate-3 overflow-hidden">
                            <UserProfileImage
                                fullName={partner.store_name}
                                imageUrl={partnerProfileImageUrl.includes("Placeholder.png") ? null : partnerProfileImageUrl}
                                className="w-full h-full rounded-lg"
                            />
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

            <VendorPaymentMethodsModal
                isOpen={showPaymentMethodsModal}
                onClose={() => setShowPaymentMethodsModal(false)}
                storeName={partner.store_name}
                paymentMethods={partner.paymentMethods}
                price={pricing.current}
                mpConnected={!!partner.mp_user_id}
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

            <DefaultModal
                isOpen={showAddressModal}
                onClose={() => setShowAddressModal(false)}
                title="Seus Endereços"
                maxWidth="md"
            >
                <div className="space-y-3 pb-4">
                    {userAddresses.map((address) => (
                        <div
                            key={address.id}
                            onClick={() => {
                                handleAddressSelect(address.id)
                                setShowAddressModal(false)
                            }}
                            className={`flex items-start border py-4 rounded-xl transition-all cursor-pointer ${selectedAddressId === address.id
                                ? "border-brand-green bg-green-50/30 dark:bg-green-900/10"
                                : "border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface"
                                }`}
                        >
                            <div className="mt-2.5 shrink-0 px-4">
                                <RadioButton
                                    name="addressSelect"
                                    value={address.id}
                                    checked={selectedAddressId === address.id}
                                    onChange={() => {
                                        handleAddressSelect(address.id)
                                        setShowAddressModal(false)
                                    }}
                                />
                            </div>
                            <div className="flex-1 pr-4">
                                <p className="font-bold text-sm text-brand-dark dark:text-dark-heading">{address.street}, {address.number}</p>
                                <p className="text-sm text-brand-inactive-text mt-0.5">{address.neighborhood} - {address.city}/{address.state}</p>
                                <p className="text-xs text-brand-inactive-text mt-1">CEP: {address.zip_code}</p>
                            </div>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() => {
                            setShowAddressModal(false)
                            setShowAddressForm(true)
                        }}
                        className="w-full py-3 border border-dashed border-brand-border dark:border-dark-border rounded-xl text-sm font-medium text-brand-dark dark:text-dark-heading transition-colors flex items-center justify-center gap-2 mt-4"
                    >
                        <PlusIcon size={16} /> Adicionar outro endereço
                    </button>
                </div>
            </DefaultModal>

            <DefaultModal
                isOpen={showAddressForm}
                onClose={() => setShowAddressForm(false)}
                title="Adicionar novo endereço"
            >
                <div className="flex flex-col gap-4">
                    <div onBlur={handleCepBlur}>
                        <CepInput
                            value={newAddressData.zipCode}
                            onChange={(val) => setNewAddressData({ ...newAddressData, zipCode: val })}
                            disabled={loadingCep}
                        />
                    </div>
                    <div>
                        <Input
                            label="Rua/Avenida"
                            value={newAddressData.street}
                            onChange={(e) => setNewAddressData({ ...newAddressData, street: e.target.value })}
                            placeholder="Rua, Avenida, etc."
                            disabled={loadingCep}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <NumberInputWithCheckbox
                                label="Número"
                                number={newAddressData.number}
                                noNumber={newAddressData.noNumber}
                                onNumberChange={(val) => setNewAddressData({ ...newAddressData, number: val })}
                                onNoNumberChange={(checked) => setNewAddressData({ ...newAddressData, noNumber: checked, number: checked ? "S/N" : "" })}
                                placeholder="123"
                            />
                        </div>
                        <div>
                            <Input
                                label="Complemento"
                                value={newAddressData.complement}
                                onChange={(e) => setNewAddressData({ ...newAddressData, complement: e.target.value })}
                                placeholder="Apto, Bloco, etc."
                            />
                        </div>
                    </div>
                    <div>
                        <Input
                            label="Bairro"
                            value={newAddressData.neighborhood}
                            onChange={(e) => setNewAddressData({ ...newAddressData, neighborhood: e.target.value })}
                            disabled={loadingCep}
                            placeholder="Nome do bairro"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Input
                                label="Cidade"
                                value={newAddressData.city}
                                onChange={(e) => setNewAddressData({ ...newAddressData, city: e.target.value })}
                                disabled={loadingCep}
                                placeholder="Nome da cidade"
                            />
                        </div>
                        <div>
                            <StateComboBox
                                value={newAddressData.state}
                                onChange={(val) => setNewAddressData({ ...newAddressData, state: val })}
                            />
                        </div>
                    </div>

                    <Button
                        onClick={handleSaveNewAddress}
                        disabled={deliveryLoading || loadingCep}
                        className="w-full mb-4"
                    >
                        {deliveryLoading ? <Spinner className="mr-2" size={16} /> : null}
                        Salvar Endereço
                    </Button>
                </div>
            </DefaultModal>


            {!hideHeaderAndFooter && (
                <MarketplaceHeader
                    userProfile={userProfile}
                    cartCount={cartCount}
                    productName={product.name}
                    onShare={() => setShowShareModal(true)}
                    favoriteButton={
                        <FavoriteButton
                            itemId={product.id}
                            itemType="produto"
                            size="md"
                            variant="icon-only"
                        />
                    }
                />
            )}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="min-h-screen bg-white lg:pt-[50px] font-sans flex flex-col"
            >

                {isMounted && createPortal(
                    <AnimatePresence>
                        {isLightboxOpen && (
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
                                        {lightboxActiveImg + 1}/{galleryItems.length}
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
                                        {galleryItems.map((item, i: number) => (
                                            <div key={i} onClick={() => { lightboxJustOpened.current = false; setSlideDirection(i > lightboxActiveImg ? 1 : -1); setLightboxActiveImg(i) }}
                                                className={`w-full aspect-square rounded-md border-2 cursor-pointer overflow-hidden shrink-0 transition-all
                            ${lightboxActiveImg === i ? "border-white" : "border-white/20 hover:border-white/50"}`}>
                                                <img src={item.type === "video" ? (item.poster || PLACEHOLDER) : item.src} className="w-full h-full object-cover" alt={`Foto de ${product.name} à venda em ${partner.city} - ${partner.state}`} />
                                            </div>
                                        ))}
                                    </div>

                                    {/* Main image */}
                                    <div className="relative flex-1 flex items-center justify-center min-w-0 p-8">
                                        <AnimatePresence mode="wait" custom={slideDirection}
                                            onExitComplete={() => { lightboxJustOpened.current = false }}>
                                            {renderGalleryItem(galleryItems[lightboxActiveImg], "max-w-full max-h-full object-contain", `Foto principal de ${product.name} à venda em ${partner.city} - ${partner.state}`, "lightbox")}
                                        </AnimatePresence>
                                        {galleryItems.length > 1 && (
                                            <>
                                                <Button variant="filled" onClick={() => lightboxNav(-1)}
                                                    className="absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center">
                                                    <ChevronLeftIcon size={26} />
                                                </Button>
                                                <Button variant="filled" onClick={() => lightboxNav(1)}
                                                    className="absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center">
                                                    <ChevronRightIcon size={26} />
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* ── Mobile image area ── */}
                                <div className="flex lg:hidden flex-1 min-h-0 relative items-center justify-center">
                                    <AnimatePresence mode="wait" custom={slideDirection}
                                        onExitComplete={() => { lightboxJustOpened.current = false }}>
                                        {renderGalleryItem(galleryItems[lightboxActiveImg], "max-w-full max-h-full object-contain px-4", `Foto de ${product.name} à venda em ${partner.city} - ${partner.state}`, "lightbox")}
                                    </AnimatePresence>

                                    {variantLabel && (
                                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-4 py-2 rounded-full whitespace-nowrap">
                                            {variantLabel}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>,
                    document.body
                )}

                <div className="container mx-auto px-4 max-w-[1400px] lg:mt-6 mb-6 flex-grow pb-24 lg:pb-12">
                    {/* Breadcrumb */}
                    <div className="hidden lg:flex items-center gap-2 text-sm text-brand-inactive-text mb-8">
                        <Link href="/" prefetch={true} className="hover:text-brand-dark transition-colors">Início</Link>
                        <ChevronRightIcon size={10} />
                        <Link href="/explorar?type=produtos" prefetch={true} className="hover:text-brand-dark transition-colors">Produtos</Link>
                        <ChevronRightIcon size={10} />
                        <span className="text-brand-inactive-text truncate max-w-[300px]">{product.name}</span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-12">
                        <div className="lg:col-span-8">

                            {/* Gallery */}
                            <div className="flex gap-3 mb-6">
                                {/* Desktop thumbnails */}
                                <div className="hidden lg:flex flex-col gap-2 w-[70px] shrink-0">
                                    {galleryItems.map((item, i: number) => (
                                        <div key={i} onClick={() => goToImage(i)}
                                            className={`w-full aspect-square rounded-md border cursor-pointer overflow-hidden transition-all
                        ${activeImgIndex === i ? "border-brand-green ring-1 ring-brand-green" : "border-brand-border hover:border-brand-border"}`}>
                                            <img src={item.type === "video" ? (item.poster || PLACEHOLDER) : item.src} className="w-full h-full object-cover" alt={`Foto de ${product.name} em ${partner.city}`} />
                                        </div>
                                    ))}
                                </div>

                                <div className="flex-1 min-w-0 flex items-center gap-2 lg:gap-4">
                                    {/* Desktop Prev Button */}
                                    <div className="hidden lg:flex w-10 shrink-0 items-center justify-center">
                                        {galleryItems.length > 1 && (
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
                                                <AnimatePresence mode="popLayout" custom={slideDirection}>
                                                    {galleryItems[activeImgIndex]?.type === "image" ? (
                                                        <motion.img key={activeImgIndex} src={galleryItems[activeImgIndex].src}
                                                            className="absolute inset-0 w-full h-full object-contain cursor-pointer" alt={`Foto de ${product.name} à venda em ${partner.city} - ${partner.state}`}
                                                            custom={slideDirection} variants={slideVariants}
                                                            initial="enter" animate="center" exit="exit"
                                                            transition={{ duration: 0.2 }}
                                                            onClick={() => openLightbox(activeImgIndex)}
                                                            style={{ transformOrigin, scale: smoothScale }} />
                                                    ) : renderGalleryItem(galleryItems[activeImgIndex], "absolute inset-0 w-full h-full object-contain", `Vídeo de ${product.name}`)}
                                                </AnimatePresence>
                                            </div>
                                        </div>

                                        {/* Mobile main image */}
                                        <div className="lg:hidden relative bg-white rounded-xl overflow-hidden" style={{ aspectRatio: "1/1" }}>
                                            <AnimatePresence mode="wait" custom={slideDirection}>
                                                {renderGalleryItem(galleryItems[activeImgIndex], "absolute inset-0 w-full h-full object-contain", `Foto de ${product.name} à venda em ${partner.city} - ${partner.state}`)}
                                            </AnimatePresence>

                                            {/* ActionButtons and Chevron navigation arrows hidden on mobile/tablet product image card as they are already displayed in the top header */}

                                        </div>
                                    </div>


                                    {/* Desktop Right Column (Actions + Next) */}
                                    <div className="hidden lg:flex flex-col gap-3 w-10 shrink-0 items-center self-stretch">
                                        <FavoriteButton
                                            itemId={product.id}
                                            itemType="produto"
                                            size="lg"
                                            variant="inline"
                                        />

                                        <Button variant="filled" onClick={() => setShowShareModal(true)} className="w-10 h-10 flex items-center justify-center" title="Compartilhar">
                                            <ShareIcon className="w-5 h-5 text-brand-green" />
                                        </Button>

                                        <div className="flex-1 flex items-center">
                                            {galleryItems.length > 1 && (
                                                <Button variant="filled" onClick={goToNext} className="w-10 h-10 flex items-center justify-center">
                                                    <ChevronRightIcon size={20} className="text-brand-dark" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
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
                                <h3 className="text-xl font-medium text-brand-dark mb-4">Especificações</h3>
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
                    <div className="hidden lg:block lg:col-span-4 relative">
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
            </motion.div>
        </>
    )
}
