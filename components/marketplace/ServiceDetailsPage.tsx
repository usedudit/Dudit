"use client"

import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useSupabase } from "@/providers/supabase-provider"
import {
  StarIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  ClockIcon,
  CalendarIcon,
  CheckIcon,
  ShareIcon,
  HeartIcon,
  XIcon,
  TruckIcon,
  ArrowLeftRightIcon,
  PlusIcon,
  TagIcon,
} from "@/lib/icons"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { FavoriteButton } from "./FavoriteButton"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { Button, Input, FormSection, IconPlaceholder, DefaultModal, CepInput, Separator, Spinner, StateComboBox, RadioButton, NumberInputWithCheckbox, Badge } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import { ShareModal } from "./ShareModal"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { useNotification } from "@/hooks/use-notification"
import { getPublicAvailableTimeSlots } from "@/app/actions/marketplace/services"
import {
  prepareServiceBookingCheckoutAction,
  addServiceBookingToCartAction,
  addPurchasableServiceToCartAction,
} from "@/app/actions/marketplace/cart-extensions"
import { invalidateCartCache } from "@/hooks/use-cart"
import { getPartnerDeliveryConfigAction, quoteDeliveryFeeAction } from "@/app/actions/shared/delivery"
import { getAddressesAction, createAddressAction } from "@/app/actions/shared/addresses"
import { computeOrderPreparationEstimate } from "@/lib/utils/order-preparation"
import { VendorPaymentMethodsModal } from "./VendorPaymentMethodsModal"
import { getPartnerUrl, formatCityStateSlug } from "@/lib/utils/url-generator"
import { listActivePromotionsForMarketplaceAction } from "@/app/actions/shared/promotions"

// ─── Types ─────────────────────────────────────────────────────────────────

interface ServiceDetailsPageClientProps {
  service: any
  staff: Array<{ id: string; name: string; isOwner: boolean }>
  reviews: any[]
  currentUserId?: string | null
  userProfile?: any
  cartCount?: number
}

type BookingStep = "info" | "schedule" | "confirm"

// ─── Helpers ───────────────────────────────────────────────────────────────

const PLACEHOLDER = "https://img.dudit.com.br/static/Placeholder.png"

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

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function generateDateRange(startDate: Date, days: number = 7) {
  const dates = []
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate)
    d.setDate(startDate.getDate() + i)
    dates.push({
      date: d,
      dateStr: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      num: d.getDate(),
      day: dayNames[d.getDay()],
      month: d.toLocaleDateString("pt-BR", { month: "short" }),
      isToday: i === 0,
    })
  }
  return dates
}

// ─── Main Component ────────────────────────────────────────────────────────

export function ServiceDetailsPageClient({
  service,
  staff,
  reviews,
  currentUserId: initialUserId,
  userProfile,
  cartCount,
}: ServiceDetailsPageClientProps) {
  const router = useRouter()
  const { user, supabase } = useSupabase()
  const { success: notifySuccess, error: notifyError } = useNotification()

  const [userId, setUserId] = useState<string | null | undefined>(initialUserId || user?.id)
  const [step, setStep] = useState<BookingStep>("info")
  const [selectedStaffId, setSelectedStaffId] = useState<string>(staff[0]?.id || "")
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDate, setSelectedDate] = useState<string>("")
  const [selectedTime, setSelectedTime] = useState<string>("")
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [isLoadingSlots, setIsLoadingSlots] = useState(false)
  const [isBooking, setIsBooking] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
  const [activeImgIndex, setActiveImgIndex] = useState(0)
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)
  const [lightboxActiveImg, setLightboxActiveImg] = useState(0)
  const lightboxJustOpened = useRef(false)

  // Redesign states
  const [cep, setCep] = useState("")
  const [shippingState, setShippingState] = useState<"initial" | "calculated">("initial")
  const [showPaymentMethodsModal, setShowPaymentMethodsModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showResponsibilityModal, setShowResponsibilityModal] = useState(false)
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)
  const [deliveryLoading, setDeliveryLoading] = useState(false)
  const [calculatedAddress, setCalculatedAddress] = useState<string | null>(null)
  const [expandedAccordion, setExpandedAccordion] = useState<string | null>(null)
  const [deliveryConfig, setDeliveryConfig] = useState<any>(null)
  const [isTeamMember, setIsTeamMember] = useState(false)

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
    const p = Array.isArray(service.partners) ? service.partners[0] : service.partners
    const address = p?.addresses?.[0] || {}
    return {
      id: p?.id || service.partner_id,
      user_id: p?.user_id,
      store_name: p?.store_name || "Profissional",
      city: address?.city || "Brasil",
      state: address?.state || "BR",
      store_avatar: p?.store_image_url || PLACEHOLDER,
      profile_image_url: p?.store_image_url || null,
      banner_url: p?.banner_url || null,
      logo_moderation_status: p?.logo_moderation_status || 'approved',
      banner_moderation_status: p?.banner_moderation_status || 'approved',
      opening_hours: p?.opening_hours || null,
      rating: p?.rating || 0,
      paymentMethods: p?.payment_methods || [],
      max_installments: p?.max_installments || 12,
      mp_user_id: p?.mp_user_id,
      mp_public_key: p?.mp_public_key,
      vendas_totais: p?.vendas_totais || 0,
      created_at: p?.created_at,
    }
  }, [service])

  const [activePromotions, setActivePromotions] = useState<any[]>([])

  useEffect(() => {
    if (partner?.id) {
      listActivePromotionsForMarketplaceAction(partner.id)
        .then((res) => {
          if (Array.isArray(res)) setActivePromotions(res)
        })
        .catch((e) => console.error("Error loading promotions:", e))
    }
  }, [partner?.id])

  const activePromo = useMemo(() => {
    return activePromotions.find((promo) => {
      if (promo.applyScope === "entire_cart") return true
      if (promo.applyScope === "specific_services" && promo.applicableServiceIds?.includes(service.id)) return true
      if (promo.applyScope === "category" && service.category_id && promo.applicableCategoryIds?.includes(service.category_id)) return true
      return false
    })
  }, [activePromotions, service.id, service.category_id])

  const handleCepChange = useCallback((e: any) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 8)
    setCep(raw.length > 5 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw)
  }, [])

  // Check if user is team member of the partner
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

  // Load partner delivery configuration
  useEffect(() => {
    if (partner.id) {
      getPartnerDeliveryConfigAction(partner.id).then((res: any) => {
        if (res.success) setDeliveryConfig(res)
      })
    }
  }, [partner.id])

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

  useEffect(() => { setIsMounted(true) }, [])
  useEffect(() => { if (!userId && user?.id) setUserId(user.id) }, [userId, user])

  // ─── Derived ──────────────────────────────────────────────────────────────

  const serviceImages = useMemo(() => {
    const images = (service.images || [])
      .filter((img: string) => typeof img === "string" && img.trim())
      .map((img: string) => getR2ImageUrl(img))
    return images.length > 0 ? images : [PLACEHOLDER]
  }, [service.images])

  const galleryItems = useMemo(() => {
    return serviceImages.map((src: any) => ({ type: "image" as const, src }))
  }, [serviceImages])

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

  const durationMinutes = Number(service.duration_minutes || 60)
  const bufferMinutes = Number(service.buffer_minutes || 0)
  const price = Number(service.price || 0)
  const schedulingEnabled = service.scheduling_enabled !== false
  const categoryName = (service as any).service_categories?.name || "Serviço"

  const pricing = useMemo(() => {
    const base = Number(service.price) || 0
    const promo = Number(service.promotional_price) || 0
    const hasPromo = promo > 0 && promo < base
    const current = hasPromo ? promo : base
    const total = current

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
      current, original: base, hasPromo, total,
      pix: pixTotal,
      pixDiscountPercent,
      hasCC,
      maxInstallments,
      installment: installmentPrice,
      discountPercent: Math.round(((base - promo) / base) * 100),
    }
  }, [service, partner])

  const preparationEstimate = useMemo(() => computeOrderPreparationEstimate({
    products: [{
      availability_value: Number(service.availability_value || 0),
      availability_unit: service.availability_unit || "Minutos",
    }],
    openingHours: partner.opening_hours || null,
    pickupWindowMinutes: 30,
    deliveryTimeEstimateMinutes: 0,
  }), [service, partner.opening_hours])

  const isProductOwner = !!(userId && (userId === partner.user_id || isTeamMember))

  const avgRating = useMemo(() =>
    reviews.length > 0 ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length : 0,
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
      return { name: "Diamante", badge: "💎", color: "text-brand-green bg-green-50/50 border-green-200", description: "Profissional Diamante com excelente histórico de atendimento.", level: 5 }
    }
    if (sales >= 500 && rating >= 4.5) {
      return { name: "Platina", badge: "💎", color: "text-brand-green bg-green-50/50 border-green-200", description: "Profissional Destaque Platina na Dudit.", level: 4 }
    }
    if (sales >= 100 && rating >= 4.3) {
      return { name: "Ouro", badge: "🥇", color: "text-brand-green bg-green-50/50 border-green-200", description: "Profissional com reputação Ouro e ótimo serviço.", level: 3 }
    }
    if (sales >= 20 && rating >= 4.0) {
      return { name: "Prata", badge: "🥈", color: "text-brand-green bg-green-50/50 border-green-200", description: "Profissional Prata consistente na plataforma.", level: 2 }
    }
    return { name: "Bronze", badge: "🥉", color: "text-brand-green bg-green-50/50 border-green-200", description: "Profissional Bronze iniciando seus serviços na Dudit.", level: 1 }
  }, [partner])

  const partnerProfileImageUrl = useMemo(() => {
    return getR2ImageUrl(partner.store_avatar)
  }, [partner.store_avatar])

  const selectedStaff = useMemo(() => staff.find((s) => s.id === selectedStaffId), [staff, selectedStaffId])

  // ─── Date navigation ──────────────────────────────────────────────────────

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const dates = useMemo(() => {
    const start = new Date(today)
    start.setDate(today.getDate() + weekOffset * 7)
    return generateDateRange(start, 7)
  }, [today, weekOffset])

  const currentMonth = useMemo(() => {
    if (dates.length === 0) return ""
    return dates[0].date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
  }, [dates])

  // ─── Fetch slots on date/staff change ─────────────────────────────────────

  useEffect(() => {
    if (!selectedDate || !selectedStaffId || !partner.id) return

    setIsLoadingSlots(true)
    setSelectedTime("")
    getPublicAvailableTimeSlots(
      partner.id,
      selectedStaffId,
      selectedDate,
      durationMinutes,
      bufferMinutes
    ).then((result) => {
      if (result.success) {
        setAvailableSlots(result.slots)
      } else {
        setAvailableSlots([])
      }
      setIsLoadingSlots(false)
    })
  }, [selectedDate, selectedStaffId, partner.id, durationMinutes, bufferMinutes])

  // Auto-select first date
  useEffect(() => {
    if (dates.length > 0 && !selectedDate) {
      setSelectedDate(dates[0].dateStr)
    }
  }, [dates, selectedDate])

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const buildBookingPayload = useCallback(() => ({
    serviceId: service.id,
    partnerId: partner.id,
    booking: {
      staffId: selectedStaffId,
      staffName: selectedStaff?.name || "Profissional",
      date: selectedDate,
      time: selectedTime,
      serviceName: service.name,
      price,
      durationMinutes,
    },
  }), [selectedStaffId, selectedStaff, selectedDate, selectedTime, service, partner, price, durationMinutes])

  const handleBookNowCheckout = useCallback(async () => {
    if (!userId) {
      router.push("/auth/login?next=" + encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : ""))
      return
    }
    if (schedulingEnabled && (!selectedDate || !selectedTime || !selectedStaffId)) {
      notifyError("Erro", "Selecione data, horário e profissional.")
      return
    }

    setIsBooking(true)
    try {
      const { token } = await (await fetch("/api/csrf-token")).json()

      let cartItemId: string | undefined
      if (!schedulingEnabled) {
        const cartResult = await addPurchasableServiceToCartAction({
          serviceId: service.id,
          partnerId: partner.id,
          csrf_token: token,
        })
        if (cartResult.error) {
          notifyError("Erro", cartResult.error)
          return
        }
        cartItemId = cartResult.cartItemId
        invalidateCartCache()
      } else {
        const result = await prepareServiceBookingCheckoutAction({
          ...buildBookingPayload(),
          csrf_token: token,
        })
        if (!result.success) {
          notifyError("Erro", result.error || "Não foi possível iniciar o checkout.")
          return
        }
        cartItemId = result.cartItemId
        invalidateCartCache()
      }

      const lineLabel = schedulingEnabled && selectedDate && selectedTime
        ? `${service.name} — ${selectedDate} ${selectedTime}`
        : service.name

      const cartLine = cartItemId
        ? [{
            cartItemId,
            itemType: "service_booking" as const,
            serviceId: service.id,
            productId: service.id,
            quantity: 1,
          }]
        : []

      const checkoutData = {
        source: "cart" as const,
        partnerId: partner.id,
        products: [{
          id: service.id,
          name: lineLabel,
          price,
          quantity: 1,
        }],
        partnerInfo: {
          address: partner.addresses?.[0] || {},
          paymentMethods: (partner.payment_methods || []).map((m: any) => m.payment_type || m.type).filter(Boolean),
          mpConnected: !!partner.mp_user_id,
          mpPublicKey: partner.mp_public_key,
          store_name: partner.store_name,
          openingHours: partner.opening_hours || null,
        },
        cartItems: cartLine,
        deliverySettings: null,
      }

      sessionStorage.setItem("checkout_session", JSON.stringify(checkoutData))
      router.push("/checkout")
    } catch {
      notifyError("Erro", "Erro inesperado ao iniciar checkout.")
    } finally {
      setIsBooking(false)
    }
  }, [userId, router, schedulingEnabled, selectedDate, selectedTime, selectedStaffId, buildBookingPayload, service, partner, price, notifyError])

  const handleAddBookingToCart = useCallback(async () => {
    if (!userId) {
      router.push("/auth/login?next=" + encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : ""))
      return
    }
    if (!selectedDate || !selectedTime || !selectedStaffId) {
      notifyError("Erro", "Selecione data, horário e profissional.")
      return
    }

    setIsBooking(true)
    try {
      const { token } = await (await fetch("/api/csrf-token")).json()
      const result = await addServiceBookingToCartAction({
        ...buildBookingPayload(),
        csrf_token: token,
      })
      if (result.success) {
        invalidateCartCache()
        notifySuccess("Adicionado à sacola", "O agendamento foi adicionado ao carrinho.")
      } else {
        notifyError("Erro", result.error || "Não foi possível adicionar à sacola.")
      }
    } catch {
      notifyError("Erro", "Erro inesperado.")
    } finally {
      setIsBooking(false)
    }
  }, [userId, router, selectedDate, selectedTime, selectedStaffId, buildBookingPayload, notifySuccess, notifyError])

  // ─── Booking Panel ────────────────────────────────────────────────────────

  const BookingPanel = (
    <div className="bg-white relative">
      {/* Service Info Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[11px] font-bold text-brand-dark bg-gray-100 px-2 py-0.5 rounded uppercase tracking-wider">{categoryName}</span>
        <span className="text-gray-300 text-xs">|</span>
        <span className="text-[13px] font-semibold text-brand-inactive-text">Serviço</span>
      </div>

      {/* Rating */}
      {reviews.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3">
          <StarIcon size={16} className="text-brand-green fill-brand-green" strokeWidth={0} />
          <span className="text-xs font-medium text-brand-inactive-text">
            {avgRating.toFixed(1)} ({reviews.length} {reviews.length === 1 ? "avaliação" : "avaliações"})
          </span>
        </div>
      )}

      <h1 className="text-xl sm:text-2xl md:text-[2rem] leading-[1.1] font-medium text-brand-dark mb-4 tracking-tight">
        {service.name}
      </h1>

      {activePromo && (
        <div className="mb-4 flex">
          <Badge variant="blue" icon={<TagIcon size={12} />} className="text-xs">
            {activePromo.name}
          </Badge>
        </div>
      )}

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
                <span className="text-sm text-brand-inactive-text line-through font-normal">{formatCurrency(pricing.original)}</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xl sm:text-2xl md:text-[2.25rem] leading-none font-bold text-brand-dark">
                    {formatCurrency(pixUnitPrice)}
                  </p>
                  <span className="bg-red-100 text-red-700 text-[11px] font-bold px-2 py-0.5 rounded-full">{pricing.discountPercent}% OFF</span>
                  <span className="text-xs md:text-sm font-semibold text-brand-green bg-green-50 border border-green-100 px-2 py-0.5 rounded-sm">no Pix</span>
                </div>
                <p className="text-xs md:text-[0.875rem] text-brand-inactive-text mt-1">
                  ou {formatCurrency(pricing.current)} em outros meios
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
                <span className="text-sm text-brand-inactive-text line-through font-normal">{formatCurrency(pricing.original)}</span>
                <div className="flex items-center gap-2">
                  <p className="text-xl sm:text-2xl md:text-[2.25rem] leading-none font-bold text-brand-dark">
                    {formatCurrency(pricing.current)}
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
                <span className="text-sm text-brand-inactive-text line-through font-normal">{formatCurrency(pricing.original)}</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xl sm:text-2xl md:text-[2.25rem] leading-none font-bold text-brand-dark">
                    {formatCurrency(pixUnitPrice)}
                  </p>
                  <span className="text-brand-green font-bold text-xs">{pricing.pixDiscountPercent}% no Pix</span>
                </div>
                <p className="text-xs md:text-[0.875rem] text-brand-inactive-text mt-1">
                  ou {formatCurrency(pricing.original)} em outros meios
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
                {formatCurrency(pricing.current)}
              </p>
              <button type="button" onClick={() => setShowPaymentMethodsModal(true)} className="text-xs md:text-[0.875rem] text-brand-green hover:underline font-bold mt-1 block text-left">
                ver opções de pagamento
              </button>
            </div>
          );
        })()}

        <div className="flex items-center gap-2 text-sm text-brand-inactive-text mt-3">
          <ClockIcon size={14} />
          <span>{formatDuration(durationMinutes)}</span>
          {bufferMinutes > 0 && (
            <span className="text-xs text-brand-inactive-text/70">+ {bufferMinutes}min intervalo</span>
          )}
        </div>
      </div>

      {/* ── Staff Selection ── */}
      {staff.length > 0 && (
        <div className="mb-6">
          <label className="block text-sm font-bold text-brand-dark mb-3">Profissional</label>
          <div className="flex flex-wrap gap-2">
            {staff.map((member) => (
              <button
                key={member.id}
                onClick={() => setSelectedStaffId(member.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${selectedStaffId === member.id
                  ? "border-brand-green bg-green-50 text-brand-green"
                  : "border-brand-border text-brand-dark hover:border-gray-300 bg-white"
                  }`}
              >
                <UserProfileImage fullName={member.name} className="w-6 h-6" />
                {member.name}
                {selectedStaffId === member.id && <CheckIcon size={14} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Date Selection ── */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <label className="text-sm font-bold text-brand-dark capitalize">{currentMonth}</label>
          <div className="flex gap-3">
            <button
              onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))}
              disabled={weekOffset === 0}
              className="text-brand-inactive-text hover:text-brand-dark disabled:opacity-30 transition-colors"
            >
              <ChevronLeftIcon size={16} />
            </button>
            <button
              onClick={() => setWeekOffset(weekOffset + 1)}
              className="text-brand-dark transition-colors"
            >
              <ChevronRightIcon size={16} />
            </button>
          </div>
        </div>
        <div className="flex justify-between items-center">
          {dates.map((d) => {
            const isSelected = selectedDate === d.dateStr
            return (
              <div
                key={d.dateStr}
                className="flex flex-col gap-2 cursor-pointer group items-center"
                onClick={() => { setSelectedDate(d.dateStr); setSelectedTime("") }}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${isSelected
                  ? "bg-brand-dark text-white"
                  : "text-brand-dark border border-gray-200 hover:border-brand-dark"
                  }`}>
                  {d.num}
                </div>
                <span className={`text-xs font-medium ${isSelected ? "text-brand-dark" : "text-brand-inactive-text"
                  }`}>
                  {d.day}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Time Slots ── */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <label className="text-sm font-bold text-brand-dark">Horários disponíveis</label>
        </div>

        {!selectedDate ? (
          <div className="text-center py-8">
            <IconPlaceholder
              icon={CalendarIcon}
              title="Selecione uma data"
              subtitle="Escolha uma data acima para ver os horários."
            />
          </div>
        ) : isLoadingSlots ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-brand-inactive-text font-medium">Verificando disponibilidade...</span>
          </div>
        ) : availableSlots.length === 0 ? (
          <div className="text-center py-8">
            <IconPlaceholder
              icon={CalendarIcon}
              title="Nenhum horário disponível"
              subtitle="Tente outra data ou outro profissional."
            />
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {availableSlots.map((slot) => (
              <button
                key={slot}
                onClick={() => setSelectedTime(slot)}
                className={`p-2.5 rounded-xl border text-sm font-bold transition-all text-center ${selectedTime === slot
                  ? "border-brand-dark bg-brand-dark text-white"
                  : "border-brand-border hover:border-gray-300 text-brand-dark"
                  }`}
              >
                {slot}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Selected Summary ── */}
      <AnimatePresence>
        {selectedTime && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircleIcon size={16} className="text-brand-green" />
                <span className="text-sm font-bold text-brand-dark">Resumo do agendamento</span>
              </div>
              <div className="space-y-1.5 text-sm text-brand-inactive-text">
                <div className="flex justify-between">
                  <span>Profissional</span>
                  <span className="font-bold text-brand-dark">{selectedStaff?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Data</span>
                  <span className="font-bold text-brand-dark">
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Horário</span>
                  <span className="font-bold text-brand-dark">{selectedTime}</span>
                </div>
                <div className="flex justify-between">
                  <span>Duração</span>
                  <span className="font-bold text-brand-dark">{formatDuration(durationMinutes)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-emerald-200 mt-2">
                  <span className="font-bold text-brand-dark">Valor</span>
                  <span className="font-bold text-brand-dark text-base">{formatCurrency(price)}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CTA Buttons ── */}
      <div className="hidden lg:block space-y-2 mb-4">
        <Button
          disabled={(schedulingEnabled && !selectedTime) || isBooking}
          onClick={handleBookNowCheckout}
          className="w-full h-[46px]"
        >
          {isBooking ? (
            <span className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Redirecionando...
            </span>
          ) : schedulingEnabled && !selectedTime ? (
            "Selecione um horário"
          ) : (
            <span className="flex items-center gap-2">
              <CalendarIcon size={18} />
              Reservar agora
            </span>
          )}
        </Button>
        {schedulingEnabled && (
          <Button
            variant="outline"
            disabled={!selectedTime || isBooking}
            onClick={handleAddBookingToCart}
            className="w-full h-[46px]"
          >
            Adicionar à sacola
          </Button>
        )}
      </div>

      {/* Shipping */}
      {!isProductOwner && (
        <FormSection title="Entrega" className="mt-6 mb-6">
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
                  className="bg-white"
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
                    <p className="text-sm text-brand-dark font-medium leading-snug">Entrega pela loja</p>
                    {deliveryLoading ? (
                      <p className="text-xs text-brand-inactive-text animate-pulse">Calculando...</p>
                    ) : deliveryError ? (
                      <p className="text-xs text-red-500">{deliveryError}</p>
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
                        {deliveryFee > 0 ? formatCurrency(deliveryFee) : "Grátis"}
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
                    <p className="text-xs text-brand-inactive-text">Fale com o profissional no WhatsApp após o pedido</p>
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
                {preparationEstimate && Number(service.availability_value || 0) > 0 && (
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
                    <span className="text-sm font-semibold text-brand-dark">Pagamento direto ao profissional</span>
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
                      <div className="flex items-center gap-1 shrink-0 bg-brand-gray border border-brand-border/60 rounded px-1.5 py-0.5">
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
                {/* Reputation & Levels Bar (iFood / ML style) */}
                <div className="mt-3 flex flex-col gap-2 p-3 bg-brand-gray/50 rounded-xl border border-brand-border/60">
                  <div className="flex items-center gap-2">
                    <span className="text-base leading-none">{reputationLevel.badge}</span>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-brand-dark">Selo Dudit: {reputationLevel.name}</span>
                      <span className="text-[10px] text-brand-inactive-text">Nível do profissional baseado em reputação e vendas</span>
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
                  {/* Labels */}
                  <div className="flex justify-between text-[9px] font-semibold text-brand-inactive-text mt-0.5 select-none">
                    <span className={reputationLevel.level === 1 ? "text-brand-green font-bold" : ""}>Bronze</span>
                    <span className={reputationLevel.level === 2 ? "text-brand-green font-bold" : ""}>Prata</span>
                    <span className={reputationLevel.level === 3 ? "text-brand-green font-bold" : ""}>Ouro</span>
                    <span className={reputationLevel.level === 4 ? "text-brand-green font-bold" : ""}>Platina</span>
                    <span className={reputationLevel.level === 5 ? "text-brand-green font-bold" : ""}>Diamante</span>
                  </div>
                  <p className="text-xs text-brand-inactive-text mt-1 leading-relaxed">
                    {reputationLevel.description}
                  </p>
                </div>

                {/* 3 columns metrics */}
                <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-brand-border/60 text-center select-none">
                  <div className="flex flex-col items-center">
                    <span className="text-sm font-bold text-brand-dark">{displayRating}</span>
                    <span className="text-[10px] font-semibold text-brand-inactive-text mt-0.5">Avaliação</span>
                  </div>
                  <div className="flex flex-col items-center border-x border-brand-border/60">
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
    </div>
  )

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        url={isMounted ? window.location.href : ""}
        title={service.name}
        shareMessage={`🗓️ Olha esse serviço na Dudit!\n\n*${service.name}*\nConfere aqui os detalhes:`}
        label="Link do serviço"
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
              Isso significa que o seu dinheiro vai direto para o profissional, seja através de facilitadores seguros (como o Mercado Pago) ou por meio do acerto que você fizer direto no balcão ou no WhatsApp. É mais lucro para quem vende e mais agilidade para quem compra!
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
              A Dudit é a ponte que conecta você ao profissional. Nós cuidamos da vitrine, da organização e do registro do seu pedido, mas a execução do serviço é por conta do profissional.
            </p>
            <p>
              A responsabilidade por realizar o serviço, oferecer garantia e resolver eventuais problemas é exclusivamente do profissional. Se tiver qualquer dúvida sobre o agendamento, o melhor caminho é chamar o profissional no WhatsApp para alinhar tudo, beleza?
            </p>
          </div>
          <Button onClick={() => setShowResponsibilityModal(false)} className="w-full mt-8 h-12">Entendi</Button>
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

      <MarketplaceHeader
        userProfile={userProfile}
        cartCount={cartCount}
        productName={service.name}
        onShare={() => setShowShareModal(true)}
        favoriteButton={
          <FavoriteButton
            itemId={service.id}
            itemType="servico"
            size="md"
            variant="icon-only"
          />
        }
      />

      {isMounted && createPortal(
        <AnimatePresence>
          {isLightboxOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[9999] bg-black/95 flex flex-col"
            >
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
                  <button onClick={() => setShowShareModal(true)} className="w-10 h-10 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center text-white transition-colors">
                    <ShareIcon size={20} />
                  </button>
                </div>
              </div>

              <div className="hidden lg:flex flex-1 min-h-0 relative">
                <button onClick={() => setIsLightboxOpen(false)}
                  className="absolute top-6 right-6 z-10 w-11 h-11 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center text-white transition-colors">
                  <XIcon size={22} />
                </button>

                <div className="flex flex-col gap-2 w-[120px] shrink-0 overflow-y-auto px-5 py-6">
                  {galleryItems.map((item: { src: string | Blob | undefined }, i: number) => (
                    <div key={i} onClick={() => { lightboxJustOpened.current = false; setSlideDirection(i > lightboxActiveImg ? 1 : -1); setLightboxActiveImg(i) }}
                      className={`w-full aspect-square rounded-md border-2 cursor-pointer overflow-hidden shrink-0 transition-all
                            ${lightboxActiveImg === i ? "border-white" : "border-white/20 hover:border-white/50"}`}>
                      <img src={item.src} className="w-full h-full object-cover" alt={`Foto de ${service.name} em ${partner.city} - ${partner.state}`} />
                    </div>
                  ))}
                </div>

                <div className="relative flex-1 flex items-center justify-center min-w-0 p-8">
                  <AnimatePresence mode="wait" custom={slideDirection}
                    onExitComplete={() => { lightboxJustOpened.current = false }}>
                    <motion.img
                      key={lightboxActiveImg}
                      src={galleryItems[lightboxActiveImg]?.src || PLACEHOLDER}
                      className="max-w-full max-h-full object-contain"
                      alt={`Foto principal de ${service.name} em ${partner.city} - ${partner.state}`}
                      custom={slideDirection}
                      variants={slideVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ duration: 0.2 }}
                    />
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

              <div className="flex lg:hidden flex-1 min-h-0 relative items-center justify-center">
                <AnimatePresence mode="wait" custom={slideDirection}
                  onExitComplete={() => { lightboxJustOpened.current = false }}>
                  <motion.img
                    key={lightboxActiveImg}
                    src={galleryItems[lightboxActiveImg]?.src || PLACEHOLDER}
                    className="max-w-full max-h-full object-contain px-4"
                    alt={`Foto de ${service.name} em ${partner.city} - ${partner.state}`}
                    custom={slideDirection}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.2 }}
                  />
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="min-h-screen bg-white lg:pt-[50px] font-sans flex flex-col"
      >
        <div className="container mx-auto px-4 max-w-[1400px] lg:mt-6 mb-6 flex-grow pb-24 lg:pb-12">
          {/* Breadcrumb */}
          <div className="hidden lg:flex items-center gap-2 text-sm text-brand-inactive-text mb-8">
            {partner.city && partner.state && (
              <>
                <Link href={`/explorar/${formatCityStateSlug(partner.city, partner.state)}`} prefetch={true} className="hover:text-brand-dark transition-colors">
                  {partner.city} - {partner.state}
                </Link>
                <ChevronRightIcon size={10} />
              </>
            )}
            <Link href={`/explorar/${formatCityStateSlug(partner.city, partner.state)}?type=servicos`} prefetch={true} className="hover:text-brand-dark transition-colors">
              Serviços
            </Link>
            <ChevronRightIcon size={10} />
            <span className="text-brand-inactive-text truncate max-w-[300px]">{service.name}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-12">
            {/* ── Left Column: Gallery + Description ── */}
            <div className="lg:col-span-8">
              {/* Gallery */}
              <div className="flex gap-3 mb-6">
                <div className="hidden lg:flex flex-col gap-2 w-[70px] shrink-0">
                  {galleryItems.map((item: { src: string | Blob | undefined }, i: number) => (
                    <div key={i} onClick={() => goToImage(i)}
                      className={`w-full aspect-square rounded-md border cursor-pointer overflow-hidden transition-all
                        ${activeImgIndex === i ? "border-brand-green ring-1 ring-brand-green" : "border-brand-border hover:border-brand-border"}`}>
                      <img src={item.src} className="w-full h-full object-cover" alt={`Foto de ${service.name} em ${partner.city}`} />
                    </div>
                  ))}
                </div>

                <div className="flex-1 min-w-0 flex items-center gap-2 lg:gap-4">
                  <div className="hidden lg:flex w-10 shrink-0 items-center justify-center">
                    {galleryItems.length > 1 && (
                      <button onClick={goToPrev} className="w-10 h-10 bg-white rounded-full flex items-center justify-center border border-brand-border hover:bg-brand-gray transition-colors shadow-sm">
                        <ChevronLeftIcon size={20} className="text-brand-dark" />
                      </button>
                    )}
                  </div>

                  <div className="relative flex-1 min-w-0">
                    <div className="hidden lg:block" style={{ paddingBottom: "100%", position: "relative" }}>
                      <div
                        className="absolute inset-0 bg-brand-gray overflow-hidden rounded-2xl cursor-zoom-in"
                        onClick={() => openLightbox(activeImgIndex)}
                      >
                        <AnimatePresence mode="popLayout" custom={slideDirection}>
                          <motion.img
                            key={activeImgIndex}
                            src={galleryItems[activeImgIndex]?.src || PLACEHOLDER}
                            className="absolute inset-0 w-full h-full object-contain cursor-pointer"
                            alt={`Foto de ${service.name} em ${partner.city} - ${partner.state}`}
                            custom={slideDirection}
                            variants={slideVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ duration: 0.2 }}
                          />
                        </AnimatePresence>
                      </div>
                    </div>

                    <div className="lg:hidden relative bg-white rounded-xl overflow-hidden" style={{ aspectRatio: "1/1" }}>
                      <AnimatePresence mode="wait" custom={slideDirection}>
                        <motion.img
                          key={activeImgIndex}
                          src={galleryItems[activeImgIndex]?.src || PLACEHOLDER}
                          className="absolute inset-0 w-full h-full object-contain"
                          alt={`Foto de ${service.name} em ${partner.city} - ${partner.state}`}
                          custom={slideDirection}
                          variants={slideVariants}
                          initial="enter"
                          animate="center"
                          exit="exit"
                          transition={{ duration: 0.2 }}
                        />
                      </AnimatePresence>
                    </div>
                  </div>

                  <div className="hidden lg:flex flex-col gap-3 shrink-0 items-center self-stretch">
                    <FavoriteButton
                      itemId={service.id}
                      itemType="servico"
                      size="lg"
                      variant="outline"
                    />

                    <Button variant="outline" onClick={() => setShowShareModal(true)} className="w-10 h-10 flex items-center justify-center" title="Compartilhar">
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

              {/* Mobile booking panel */}
              <div className="lg:hidden mb-6">{BookingPanel}</div>

              {/* Description */}
              <div className="mb-10">
                <h3 className="text-xl font-medium text-brand-dark mb-4">Descrição</h3>
                <div className={`relative ${!isDescriptionExpanded ? "max-h-[150px] overflow-hidden" : ""}`}>
                  <p className="text-sm md:text-[0.9375rem] text-gray-600 leading-relaxed whitespace-pre-wrap">
                    {service.description || "Sem descrição."}
                  </p>
                  {!isDescriptionExpanded && service.description?.length > 200 && (
                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent" />
                  )}
                </div>
                {service.description?.length > 200 && (
                  <button onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                    className="flex items-center gap-1 text-brand-green font-bold text-sm mt-3 hover:underline">
                    {isDescriptionExpanded ? "Ver menos" : "Ver mais"}
                  </button>
                )}
              </div>

              {/* Reviews */}
              <div className="border-t border-brand-border pt-2">
                <h3 className="text-xl font-medium text-brand-dark mb-6 mt-8">Avaliações do serviço</h3>
                {reviews.length > 0 && (
                  <div className="border border-brand-border rounded-xl p-5 mb-8 flex gap-8 items-center">
                    <div className="text-center shrink-0">
                      <p className="text-5xl font-black text-brand-dark leading-none mb-2">{avgRating.toFixed(1)}</p>
                      <div className="flex justify-center mb-1.5"><StarRow rating={avgRating} size={14} /></div>
                      <p className="text-xs text-brand-inactive-text">média de {reviews.length} avaliações</p>
                    </div>
                    <div className="flex-1 space-y-2">
                      {[5, 4, 3, 2, 1].map((star) => {
                        const count = reviews.filter((r: any) => r.rating === star).length
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
                    subtitle="Seja o primeiro a contar como foi sua experiência!"
                  />
                )}
              </div>
            </div>

            {/* ── Right Column: Booking Panel (Desktop) ── */}
            <div className="hidden lg:block lg:col-span-4 relative">
              {BookingPanel}
            </div>
          </div>

          {/* Mobile bottom bar */}
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 z-50 flex gap-2 lg:hidden shadow-lg">
            <div className="flex-1 flex flex-col justify-center min-w-0">
              <span className="text-lg font-bold text-brand-dark leading-none">
                {formatCurrency(pricing.pixDiscountPercent > 0 ? pricing.current * (1 - pricing.pixDiscountPercent / 100) : pricing.current)}
              </span>
              <span className="text-xs text-brand-inactive-text truncate">
                {pricing.pixDiscountPercent > 0 ? "no Pix" : formatDuration(durationMinutes)}
              </span>
            </div>
            {schedulingEnabled && (
              <Button
                variant="outline"
                className="rounded-full px-3"
                disabled={!selectedTime || isBooking}
                onClick={handleAddBookingToCart}
              >
                Sacola
              </Button>
            )}
            <Button
              className="flex-1 rounded-full min-w-[120px]"
              disabled={(schedulingEnabled && !selectedTime) || isBooking}
              onClick={handleBookNowCheckout}
            >
              {isBooking ? "..." : schedulingEnabled && !selectedTime ? "Horário" : "Reservar"}
            </Button>
          </div>
        </div>
      </motion.div>
    </>
  )
}
