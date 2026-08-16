"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion"
import { useSupabase } from "@/providers/supabase-provider"
import { HeartIcon, ShareIcon, StarIcon, ChevronRightIcon, ChevronLeftIcon, ChevronDownIcon, TagIcon, MapPinIcon, CheckIcon, WhatsappIcon, InfoIcon, ShieldIcon, CheckCircleIcon, ArrowLeftIcon, XIcon } from "@/lib/icons"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { Button, Input, FormSection, CepInput, Spinner, RadioButton, DefaultModal } from "@/components/reusable"
import { InfoCard } from "@/components/reusable/InfoCard"
import { formatCurrency } from "@/lib/utils"
import { ShareModal } from "./ShareModal"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { useNotification } from "@/hooks/use-notification"
import { getAddressesAction, createAddressAction } from "@/app/actions/shared/addresses"
import { addSubscriptionToCartAction, checkCanUserBuyFromStoreAction } from "@/app/actions/marketplace/cart-extensions"
import { invalidateCartCache } from "@/hooks/use-cart"
import { getStoreUrl, formatCityStateSlug } from "@/lib/utils/url-generator"
import { fetchCSRFTokenSingleton } from "@/hooks/use-csrf-token"

interface PlanDetailsPageClientProps {
    plan: any
    currentUserId?: string | null
    userProfile?: any
    cartCount?: number
    hideHeaderAndFooter?: boolean
}

const PLACEHOLDER = "https://img.dudit.com.br/static/Placeholder.png"

const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? "-100%" : "100%", opacity: 0 }),
}

export function PlanDetailsPageClient({
    plan,
    currentUserId: initialUserId,
    userProfile,
    cartCount,
    hideHeaderAndFooter = false,
}: PlanDetailsPageClientProps) {
    const router = useRouter()
    const { user, supabase } = useSupabase()
    const { success: notifySuccess, error: notifyError } = useNotification()

    const [userId, setUserId] = useState<string | null | undefined>(initialUserId || user?.id)
    const [submitting, setSubmitting] = useState(false)
    const [deliveryType, setDeliveryType] = useState<"pickup" | "delivery">("pickup")
    const [showShareModal, setShowShareModal] = useState(false)
    const [isMounted, setIsMounted] = useState(false)
    const [expandedAccordion, setExpandedAccordion] = useState<string | null>(null)
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)

    // Image gallery states
    const [activeImgIndex, setActiveImgIndex] = useState(0)
    const [slideDirection, setSlideDirection] = useState<1 | -1>(1)
    const [isLightboxOpen, setIsLightboxOpen] = useState(false)
    const [lightboxActiveImg, setLightboxActiveImg] = useState(0)
    const lightboxJustOpened = useRef(false)
    const touchStartX = useRef(0)
    const galleryContainerRef = useRef<HTMLDivElement>(null)

    const zoomOriginX = useMotionValue(50)
    const zoomOriginY = useMotionValue(50)
    const zoomScale = useMotionValue(1)
    const smoothScale = useSpring(zoomScale, { stiffness: 180, damping: 22 })
    const transformOrigin = useTransform([zoomOriginX, zoomOriginY], ([x, y]) => `${x}% ${y}%`)

    // Address states
    const [userAddresses, setUserAddresses] = useState<any[]>([])
    const [selectedAddressId, setSelectedAddressId] = useState<string>("")
    const selectedAddress = userAddresses.find(a => a.id === selectedAddressId)
    const [showAddressForm, setShowAddressForm] = useState(false)
    const [loadingAddresses, setLoadingAddresses] = useState(false)
    const [loadingCep, setLoadingCep] = useState(false)
    const [newAddressData, setNewAddressData] = useState({
        zipCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", noNumber: false
    })

    const partner = useMemo(() => {
        const p = plan.partners || {}
        const store = plan.stores || p.stores || p.store
        const address = store?.addresses?.[0] || p.addresses?.[0] || {}
        const storeId = store?.id || p.store_id || plan.store_id || p.id || plan.partner_id || "1"
        const storeName = store?.name || p?.name || p?.storeName || "Vendedor da Dudit"

        return {
            id: storeId,
            store_id: storeId,
            name: storeName,
            partner_id: p.id || plan.partner_id,
            user_id: p.user_id,
            store_name: storeName,
            city: address?.city || store?.city || p.city || "Brasil",
            state: address?.state || store?.state || p.state || "BR",
            store_image_url: store?.logo_url || p.store_image_url || null,
            store_avatar: store?.logo_url || p.store_image_url || p.store_avatar || p.profile_image_url || "https://img.dudit.com.br/static/Placeholder.png",
            profile_image_url: store?.logo_url || p.profile_image_url || null,
            banner_url: store?.banner_url || p.banner_url || null,
            rating: store?.rating ?? p.rating ?? 0,
            vendas_totais: store?.vendas_totais ?? p.vendas_totais ?? 0,
            created_at: store?.created_at || p.created_at,
            phone: store?.phone || p.phone || null,
            addresses: store?.addresses || p.addresses || [],
            mp_user_id: p.mp_user_id || null,
            mp_public_key: p.mp_public_key || null,
        }
    }, [plan])

    const planImages = useMemo(() => {
        const imgs = (plan.images || []).filter((img: any) => typeof img === "string" && img.trim()).map((img: string) => getR2ImageUrl(img))
        return imgs.length > 0 ? imgs : [PLACEHOLDER]
    }, [plan.images])

    const galleryItems = useMemo(() => {
        return planImages.map((src: string) => ({ type: "image" as const, src }))
    }, [planImages])

    const [canBuyState, setCanBuyState] = useState<{ canBuy: boolean; isOwner: boolean; isTeamMember: boolean; reason?: string }>(() => {
        const isOwner = !!(userId && partner?.user_id && userId === partner.user_id)
        return {
            canBuy: !isOwner,
            isOwner,
            isTeamMember: false,
            reason: isOwner ? "Você não pode assinar seus próprios planos." : undefined,
        }
    })

    useEffect(() => {
        if (!partner?.partner_id && !partner?.id && !plan?.partner_id) return
        const targetPartnerId = plan?.partner_id || partner.partner_id || partner.id
        const targetStoreId = plan?.store_id || partner.store_id || partner.id
        checkCanUserBuyFromStoreAction(targetPartnerId, targetStoreId).then(res => {
            setCanBuyState(res)
        })
    }, [userId, partner?.partner_id, partner?.id, partner?.store_id, plan?.partner_id, plan?.store_id])

    const isPlanOwner = !canBuyState.canBuy
    const isTeamMember = canBuyState.isTeamMember

    useEffect(() => {
        setIsMounted(true)
        if (user?.id) {
            setUserId(user.id)
        }
    }, [user])

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
                    number: data.numero || prev.number,
                    noNumber: data.numero ? data.numero === "S/N" : prev.noNumber,
                    neighborhood: data.bairro || prev.neighborhood,
                    city: data.localidade || prev.city,
                    state: data.uf || prev.state,
                }))
            }
        } catch (err) {
            console.error("Error fetching CEP:", err)
        } finally {
            setLoadingCep(false)
        }
    }

    const handleSaveAddress = async () => {
        if (!userId) return
        const { zipCode, street, number, neighborhood, city, state, noNumber } = newAddressData
        const finalNumber = noNumber ? "S/N" : number

        if (!zipCode || !street || !finalNumber || !neighborhood || !city || !state) {
            notifyError("Por favor, preencha todos os campos do endereço.")
            return
        }

        try {
            const result = await createAddressAction({
                entityId: userId,
                entityType: "user",
                zipCode,
                street,
                number: finalNumber,
                complement: newAddressData.complement,
                neighborhood,
                city,
                state,
                isDefault: userAddresses.length === 0,
                addressType: "casa",
            })

            if (result.error) {
                notifyError(result.error)
            } else {
                notifySuccess("Endereço salvo com sucesso!")
                setShowAddressForm(false)
                setNewAddressData({ zipCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", noNumber: false })
                await loadUserAddresses()
            }
        } catch (err) {
            notifyError("Erro ao cadastrar endereço.")
        }
    }

    const buildAddressString = (a: any) =>
        `${a.street}, ${a.number}${a.complement ? `, ${a.complement}` : ""} - ${a.neighborhood}, ${a.city} - ${a.state}, ${a.zip_code}`

    const handleSubscribe = async () => {
        if (!userId) {
            router.push(`/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`)
            return
        }

        if (deliveryType === "delivery" && !selectedAddressId) {
            notifyError("Por favor, selecione um endereço de entrega.")
            return
        }

        setSubmitting(true)
        try {
            const token = await fetchCSRFTokenSingleton() || ""
            const result = await addSubscriptionToCartAction({
                recurringPlanId: plan.id,
                partnerId: partner.id,
                csrf_token: token,
            })

            if (result.success) {
                invalidateCartCache()
                const checkoutData = {
                    source: "cart",
                    partnerId: partner.id,
                    products: [{
                        id: plan.id,
                        name: plan.name,
                        price: planPrice,
                        quantity: 1,
                    }],
                    partnerInfo: {
                        address: partner.addresses?.[0] || {},
                        paymentMethods: [],
                        mpConnected: !!partner.mp_user_id,
                        mpPublicKey: partner.mp_public_key,
                        store_name: partner.store_name,
                    },
                    cartItems: result.cartItemId
                        ? [{ cartItemId: result.cartItemId, productId: plan.id, quantity: 1 }]
                        : [],
                    deliverySettings: null,
                }
                sessionStorage.setItem("checkout_session", JSON.stringify(checkoutData))
                router.push("/checkout")
            } else {
                notifyError(result.error || "Ocorreu um erro ao assinar o plano.")
            }
        } catch (err) {
            notifyError("Erro inesperado ao assinar.")
        } finally {
            setSubmitting(false)
        }
    }

    const frequencyLabel = useMemo(() => {
        const interval = plan.frequency_interval || 1
        const type = plan.frequency_type || "monthly"

        if (type === "daily") return interval === 1 ? "diário" : `a cada ${interval} dias`
        if (type === "weekly") return interval === 1 ? "semanal" : `a cada ${interval} semanas`
        if (type === "monthly") return interval === 1 ? "mensal" : `a cada ${interval} meses`
        if (type === "yearly") return interval === 1 ? "anual" : `a cada ${interval} anos`
        return "recorrente"
    }, [plan])

    const planPrice = Number(plan.price || 0)

    const handleWhatsApp = useCallback(() => {
        const cleaned = partner.phone?.replace(/\D/g, "") ?? ""
        const number = cleaned.startsWith("55") ? cleaned : `55${cleaned}`
        const text = encodeURIComponent(`Olá, ${partner.store_name || partner.store_name}! Vi seu plano "${plan.name}" na Dudit e gostaria de mais informações.`)
        window.open(`https://wa.me/${number}?text=${text}`, "_blank")
    }, [partner.phone, partner.store_name, partner.store_name, plan.name])

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

    const displayRating = useMemo(() => {
        return Number(partner.rating) > 0 ? Number(partner.rating).toFixed(1) : "-";
    }, [partner.rating])

    const BuyPanel = (
        <div className="bg-white relative">
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-[#ecfdf5] text-brand-green font-bold text-xs rounded-full uppercase tracking-wider">
                        Assinatura {frequencyLabel}
                    </span>
                </div>
            </div>

            <h1 className="text-xl md:text-3xl leading-[1.1] font-medium text-brand-dark mb-6 tracking-tight">
                {plan.name}
            </h1>

            {/* Price details */}
            <div className="mb-6 pb-6 border-b border-brand-border">
                <span className="text-xs text-brand-inactive-text font-medium block mb-1">
                    Valor da assinatura
                </span>
                <div className="flex items-baseline gap-1.5">
                    <span className="text-[32px] lg:text-[40px] font-bold text-brand-dark leading-none tracking-tight">
                        {formatCurrency(planPrice)}
                    </span>
                    <span className="text-sm font-semibold text-brand-inactive-text uppercase">
                        / {plan.frequency_type === "monthly" ? "mês" : plan.frequency_type === "weekly" ? "semana" : plan.frequency_type === "daily" ? "dia" : "período"}
                    </span>
                </div>
                <span className="text-xs text-brand-green font-semibold mt-2 block">
                    ✓ Cobrança recorrente {frequencyLabel}
                </span>
            </div>

            {isPlanOwner ? (
                <InfoCard
                    message={canBuyState.reason || (isTeamMember
                        ? "Você não pode assinar planos de um negócio do qual faz parte da equipe."
                        : "Você não pode assinar seus próprios planos.")}
                    color="orange"
                    className="mb-8"
                />
            ) : (
                <>
                    {/* Delivery Options */}
                    <div className="mb-6">
                        <h3 className="text-sm font-bold text-brand-dark mb-3">Como deseja receber?</h3>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeliveryType("pickup")}
                                className={`flex-1 py-3 px-4 rounded-xl border text-center transition-all ${deliveryType === "pickup"
                                    ? "border-brand-green bg-[#ecfdf5] text-brand-green font-bold"
                                    : "border-brand-border bg-white text-brand-dark hover:border-gray-300"
                                    }`}
                            >
                                Retirar no Local
                            </button>
                            <button
                                onClick={() => setDeliveryType("delivery")}
                                className={`flex-1 py-3 px-4 rounded-xl border text-center transition-all ${deliveryType === "delivery"
                                    ? "border-brand-green bg-[#ecfdf5] text-brand-green font-bold"
                                    : "border-brand-border bg-white text-brand-dark hover:border-gray-300"
                                    }`}
                            >
                                Entrega
                            </button>
                        </div>
                    </div>

                    {/* Address select when delivery */}
                    {deliveryType === "delivery" && (
                        <div className="mb-6 animate-fade-in">
                            <h3 className="text-sm font-bold text-brand-dark mb-3">Endereço de entrega</h3>

                            {loadingAddresses ? (
                                <div className="flex items-center justify-center py-4">
                                    <Spinner size={20} />
                                </div>
                            ) : userAddresses.length > 0 ? (
                                <div className="space-y-3 mb-3">
                                    {userAddresses.map((a: any) => (
                                        <div
                                            key={a.id}
                                            onClick={() => setSelectedAddressId(a.id)}
                                            className={`p-3 rounded-xl border cursor-pointer flex items-start gap-2.5 transition-all ${selectedAddressId === a.id
                                                ? "border-brand-green bg-[#ecfdf5] text-brand-green"
                                                : "border-brand-border hover:border-gray-300 text-brand-dark"
                                                }`}
                                        >
                                            <MapPinIcon size={16} className="mt-0.5 shrink-0 text-brand-inactive-text" />
                                            <div className="text-xs font-medium leading-relaxed flex-1">
                                                <span className="font-bold text-brand-dark block mb-0.5 uppercase tracking-wide">
                                                    {a.address_type || "Casa"}
                                                </span>
                                                {buildAddressString(a)}
                                            </div>
                                            {selectedAddressId === a.id && (
                                                <CheckIcon size={16} className="shrink-0 text-brand-green" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-brand-inactive-text mb-3">Nenhum endereço cadastrado.</p>
                            )}

                            {!showAddressForm ? (
                                <button
                                    onClick={() => setShowAddressForm(true)}
                                    className="text-xs font-bold text-brand-green hover:underline flex items-center gap-1"
                                >
                                    + Cadastrar novo endereço
                                </button>
                            ) : (
                                <div className="p-4 rounded-xl border border-dashed border-gray-300 space-y-4">
                                    <h4 className="text-xs font-bold text-brand-dark mb-1">Novo Endereço</h4>
                                    <CepInput
                                        id="new-addr-cep"
                                        name="zipCode"
                                        value={newAddressData.zipCode}
                                        onChange={val => setNewAddressData(prev => ({ ...prev, zipCode: val }))}
                                        onAddressFetched={handleCepBlur}
                                    />
                                    <Input
                                        label="Rua"
                                        id="new-addr-street"
                                        name="street"
                                        value={newAddressData.street}
                                        onChange={e => setNewAddressData(prev => ({ ...prev, street: e.target.value }))}
                                        disabled={loadingCep}
                                    />
                                    <div className="grid grid-cols-2 gap-3">
                                        <Input
                                            label="Número"
                                            id="new-addr-number"
                                            name="number"
                                            value={newAddressData.number}
                                            onChange={e => setNewAddressData(prev => ({ ...prev, number: e.target.value }))}
                                            disabled={newAddressData.noNumber}
                                        />
                                        <Input
                                            label="Complemento"
                                            id="new-addr-comp"
                                            name="complement"
                                            value={newAddressData.complement}
                                            onChange={e => setNewAddressData(prev => ({ ...prev, complement: e.target.value }))}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="new-addr-noNumber"
                                            checked={newAddressData.noNumber}
                                            onChange={e => setNewAddressData(prev => ({ ...prev, noNumber: e.target.checked, number: e.target.checked ? "S/N" : "" }))}
                                        />
                                        <label htmlFor="new-addr-noNumber" className="text-xs text-brand-dark font-medium">Sem número (S/N)</label>
                                    </div>
                                    <Input
                                        label="Bairro"
                                        id="new-addr-neighborhood"
                                        name="neighborhood"
                                        value={newAddressData.neighborhood}
                                        onChange={e => setNewAddressData(prev => ({ ...prev, neighborhood: e.target.value }))}
                                        disabled={loadingCep}
                                    />
                                    <div className="grid grid-cols-2 gap-3">
                                        <Input
                                            label="Cidade"
                                            id="new-addr-city"
                                            name="city"
                                            value={newAddressData.city}
                                            onChange={e => setNewAddressData(prev => ({ ...prev, city: e.target.value }))}
                                            disabled={loadingCep}
                                        />
                                        <Input
                                            label="Estado"
                                            id="new-addr-state"
                                            name="state"
                                            value={newAddressData.state}
                                            onChange={e => setNewAddressData(prev => ({ ...prev, state: e.target.value }))}
                                            disabled={loadingCep}
                                        />
                                    </div>
                                    <div className="flex gap-2 pt-2">
                                        <Button size="sm" onClick={handleSaveAddress} className="bg-brand-green text-white hover:bg-[#047857]">
                                            Salvar
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => setShowAddressForm(false)}>
                                            Cancelar
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Subscribe button */}
                    <button
                        onClick={handleSubscribe}
                        disabled={submitting || (deliveryType === "delivery" && !selectedAddressId && !showAddressForm)}
                        className="w-full py-4 bg-brand-green text-white font-bold rounded-full flex items-center justify-center gap-2 hover:bg-[#047857] transition-all transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed shadow-md text-[15px]"
                    >
                        {submitting ? (
                            <>
                                <Spinner size={16} className="text-white" />
                                Processando assinatura...
                            </>
                        ) : (
                            <>
                                <CheckCircleIcon size={18} />
                                Assinar Agora
                            </>
                        )}
                    </button>

                    <p className="text-[11px] text-brand-inactive-text text-center mt-4 leading-relaxed font-medium">
                        Ao assinar, você concorda com os termos da Dudit e autoriza cobranças recorrentes no período selecionado. Cancele quando quiser.
                    </p>
                </>
            )}
        </div>
    )

    const renderGalleryItem = (
        item: (typeof galleryItems)[number],
        className: string,
        alt: string,
        layout: "inline" | "lightbox" = "inline",
    ) => {
        return <motion.img key={item.src} src={item.src} className={className} alt={alt} custom={slideDirection} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }} />
    }

    return (
        <div className="bg-white min-h-screen text-brand-dark flex flex-col pt-4">
            {!hideHeaderAndFooter && <MarketplaceHeader userProfile={userProfile} cartCount={cartCount} />}

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
                                {/* Mobile top bar */}
                                <div className="flex lg:hidden items-center justify-between px-6 pt-12 pb-4 shrink-0">
                                    <button onClick={() => setIsLightboxOpen(false)}
                                        className="w-10 h-10 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center text-white transition-colors">
                                        <XIcon size={20} />
                                    </button>
                                    <span className="text-white text-sm font-semibold">
                                        {lightboxActiveImg + 1}/{galleryItems.length}
                                    </span>
                                    <div className="w-10 h-10"></div>
                                </div>

                                {/* Desktop layout */}
                                <div className="hidden lg:flex flex-1 min-h-0 relative">
                                    <button onClick={() => setIsLightboxOpen(false)}
                                        className="absolute top-6 right-6 z-10 w-11 h-11 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center text-white transition-colors">
                                        <XIcon size={22} />
                                    </button>

                                    {/* Thumbnails column */}
                                    <div className="flex flex-col gap-2 w-[120px] shrink-0 overflow-y-auto px-5 py-6">
                                        {galleryItems.map((item: any, i: number) => (
                                            <div key={i} onClick={() => { lightboxJustOpened.current = false; setSlideDirection(i > lightboxActiveImg ? 1 : -1); setLightboxActiveImg(i) }}
                                                className={`w-full aspect-square rounded-md border-2 cursor-pointer overflow-hidden shrink-0 transition-all
                                                    ${lightboxActiveImg === i ? "border-white" : "border-white/20 hover:border-white/50"}`}>
                                                <img src={item.src} className="w-full h-full object-cover" alt={`Foto de ${plan.name} à venda em ${partner.city} - ${partner.state}`} />
                                            </div>
                                        ))}
                                    </div>

                                    {/* Main image */}
                                    <div className="relative flex-1 flex items-center justify-center min-w-0 p-8">
                                        <AnimatePresence mode="wait" custom={slideDirection}
                                            onExitComplete={() => { lightboxJustOpened.current = false }}>
                                            {renderGalleryItem(galleryItems[lightboxActiveImg], "max-w-full max-h-full object-contain", `Foto principal de ${plan.name} à venda em ${partner.city} - ${partner.state}`, "lightbox")}
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

                                {/* Mobile image area */}
                                <div className="flex lg:hidden flex-1 min-h-0 relative items-center justify-center"
                                    onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX }}
                                    onTouchEnd={(e) => {
                                        const diff = e.changedTouches[0].clientX - touchStartX.current
                                        if (Math.abs(diff) > 50) {
                                            lightboxNav(diff > 0 ? -1 : 1)
                                        }
                                    }}
                                >
                                    <AnimatePresence mode="wait" custom={slideDirection}
                                        onExitComplete={() => { lightboxJustOpened.current = false }}>
                                        {renderGalleryItem(galleryItems[lightboxActiveImg], "max-w-full max-h-full object-contain px-4", `Foto de ${plan.name} à venda em ${partner.city} - ${partner.state}`, "lightbox")}
                                    </AnimatePresence>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>,
                    document.body
                )}

                <div className="container mx-auto px-4 max-w-[1400px] lg:mt-6 mb-6 flex-grow pb-24 lg:pb-12">
                    {/* Breadcrumbs */}
                    <div className="hidden lg:flex items-center gap-2 text-sm text-brand-inactive-text mb-8">
                        {partner.city && partner.state && (
                            <>
                                <Link href={`/explorar/${formatCityStateSlug(partner.city, partner.state)}`} prefetch={false} className="hover:text-brand-dark transition-colors">
                                    {partner.city} - {partner.state}
                                </Link>
                                <ChevronRightIcon size={10} />
                            </>
                        )}
                        <Link href={`/explorar/${formatCityStateSlug(partner.city, partner.state)}?type=planos`} prefetch={false} className="hover:text-brand-dark transition-colors">
                            Assinaturas
                        </Link>
                        <ChevronRightIcon size={10} />
                        <span className="text-brand-inactive-text truncate max-w-[300px]">{plan.name}</span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-12">
                        {/* Left Column: Details */}
                        <div className="lg:col-span-8">

                            {/* Gallery */}
                            <div className="flex gap-3 mb-6">
                                {/* Desktop thumbnails */}
                                <div className="hidden lg:flex flex-col gap-2 w-[70px] shrink-0">
                                    {galleryItems.map((item: any, i: number) => (
                                        <div key={i} onClick={() => goToImage(i)}
                                            className={`w-full aspect-square rounded-md border cursor-pointer overflow-hidden transition-all
                                                ${activeImgIndex === i ? "border-brand-green ring-1 ring-brand-green" : "border-brand-border hover:border-brand-border"}`}>
                                            <img src={item.src} className="w-full h-full object-cover" alt={`Foto de ${plan.name} em ${partner.city}`} />
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
                                                    <motion.img key={activeImgIndex} src={galleryItems[activeImgIndex].src}
                                                        className="absolute inset-0 w-full h-full object-contain cursor-pointer" alt={`Foto de ${plan.name} à venda em ${partner.city} - ${partner.state}`}
                                                        custom={slideDirection} variants={slideVariants}
                                                        initial="enter" animate="center" exit="exit"
                                                        transition={{ duration: 0.2 }}
                                                        onClick={() => openLightbox(activeImgIndex)}
                                                        style={{ transformOrigin, scale: smoothScale }} />
                                                </AnimatePresence>
                                            </div>
                                        </div>

                                        {/* Mobile main image */}
                                        <div className="lg:hidden relative bg-white rounded-xl overflow-hidden" style={{ aspectRatio: "1/1" }}>
                                            <AnimatePresence mode="wait" custom={slideDirection}>
                                                {renderGalleryItem(galleryItems[activeImgIndex], "absolute inset-0 w-full h-full object-contain", `Foto de ${plan.name} à venda em ${partner.city} - ${partner.state}`)}
                                            </AnimatePresence>
                                        </div>
                                    </div>

                                    {/* Desktop Right Column (Actions + Next) */}
                                    <div className="hidden lg:flex flex-col gap-3 shrink-0 items-center self-stretch">
                                        <Button variant="outline" onClick={() => setShowShareModal(true)} className="w-10 h-10 flex items-center justify-center border-brand-border rounded-full" title="Compartilhar">
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

                            {/* Buy panel (mobile/tablet layout) */}
                            <div className="lg:hidden mb-6">{BuyPanel}</div>

                            {/* Description */}
                            <div className="mb-10">
                                <h3 className="text-xl font-medium text-brand-dark mb-4">Descrição</h3>
                                <div className={`relative ${!isDescriptionExpanded ? "max-h-[150px] overflow-hidden" : ""}`}>
                                    <p className="text-sm md:text-[0.9375rem] text-gray-600 leading-relaxed whitespace-pre-wrap">
                                        {plan.description || "Sem descrição."}
                                    </p>
                                    {!isDescriptionExpanded && plan.description?.length > 200 && (
                                        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent" />
                                    )}
                                </div>
                                {plan.description?.length > 200 && (
                                    <button onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                                        className="flex items-center gap-1 text-brand-green font-bold text-sm mt-3 hover:underline">
                                        {isDescriptionExpanded ? "Ver menos descrição" : "Ver mais descrição"}
                                        <ChevronDownIcon size={16} className={`transition-transform ${isDescriptionExpanded ? "rotate-180" : ""}`} />
                                    </button>
                                )}
                            </div>

                            {/* Items Included */}
                            <div className="border-t border-brand-border pt-8 mb-10">
                                <h3 className="text-xl font-medium text-brand-dark mb-5 flex items-center gap-2">
                                    Itens inclusos na assinatura
                                </h3>
                                <div className="space-y-4">
                                    {plan.items && plan.items.length > 0 ? (
                                        plan.items.map((item: any) => {
                                            const type = item.item_type || "product"
                                            const quantity = item.quantity || 1
                                            const details = type === "product" ? item.products : item.services
                                            const name = details?.name || (type === "product" ? "Produto" : "Serviço")
                                            const itemImages = details?.images
                                            const imgUrl = (Array.isArray(itemImages) && itemImages[0]) || PLACEHOLDER

                                            return (
                                                <div
                                                    key={item.id}
                                                    className="flex items-center gap-4 p-4 rounded-xl border border-brand-border bg-brand-gray hover:border-gray-200 transition-colors"
                                                >
                                                    <div className="w-16 h-16 rounded-[12px] bg-white border border-brand-border overflow-hidden shrink-0">
                                                        <img
                                                            src={getR2ImageUrl(imgUrl)}
                                                            alt={name}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="text-[15px] font-medium text-brand-dark truncate">
                                                            {name}
                                                        </h3>
                                                        <p className="text-xs text-brand-inactive-text font-medium mt-0.5">
                                                            Qtd: {quantity}x • {type === "product" ? "Entregável" : "Serviço/Agendável"}
                                                        </p>
                                                    </div>
                                                </div>
                                            )
                                        })
                                    ) : (
                                        <p className="text-sm text-brand-inactive-text">Nenhum item adicionado a este plano.</p>
                                    )}
                                </div>
                            </div>

                            {/* Seller / Store Reputation & Levels Card */}
                            <div className="border-t border-brand-border pt-8 mb-10">
                                <h3 className="text-xl font-medium text-brand-dark mb-5">Quem oferece?</h3>
                                {(() => {
                                    const sellerBannerImage = partner.banner_url ? getR2ImageUrl(partner.banner_url, "large") : PLACEHOLDER
                                    const sellerAvatarImage = partner.store_avatar && !partner.store_avatar.includes("Placeholder.png") ? getR2ImageUrl(partner.store_avatar) : null

                                    return (
                                        <div className="border border-brand-border rounded-2xl overflow-hidden bg-white">
                                            {/* Banner Link to Partner Profile */}
                                            <Link href={getStoreUrl(partner)} className="block group">
                                                <div className="aspect-[2.65/1] w-full relative bg-gray-100 overflow-hidden select-none">
                                                    <img src={sellerBannerImage} alt={`Banner de ${partner.store_name}`} className="w-full h-full object-cover" />
                                                    <div className="absolute inset-0" />
                                                </div>

                                                <div className="px-5 pt-0 relative flex flex-col">
                                                    {/* Avatar overlapping banner */}
                                                    <div className="w-16 h-16 rounded-full border-2 border-white overflow-hidden bg-white -mt-8 z-10 self-start shadow-sm">
                                                        <UserProfileImage
                                                            fullName={partner.store_name || partner.store_name}
                                                            imageUrl={sellerAvatarImage}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    </div>

                                                    <div className="mt-3 min-w-0">
                                                        <div className="flex items-center gap-1.5 justify-between">
                                                            <span className="font-bold text-brand-dark text-lg truncate">
                                                                {partner.store_name || partner.store_name}
                                                            </span>
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <StarIcon size={14} className="text-brand-green fill-brand-green" strokeWidth={0} />
                                                                <span className="text-sm font-bold text-brand-dark">{displayRating}</span>
                                                            </div>
                                                        </div>
                                                        <p className="text-xs text-brand-inactive-text mt-0.5 font-medium">
                                                            {partner.city} - {partner.state}
                                                        </p>
                                                    </div>
                                                </div>
                                            </Link>

                                            <div className="px-5 pb-5 mt-4">
                                                {/* Reputation / Levels metrics */}
                                                <div className="my-5 flex flex-col gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-lg leading-none">{reputationLevel.badge}</span>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-bold text-brand-dark">Selo Dudit: {reputationLevel.name}</span>
                                                            <span className="text-xs text-brand-inactive-text">Nível do vendedor baseado em reputação e vendas</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1 h-1.5 w-full bg-transparent rounded-full overflow-hidden mt-1 select-none">
                                                        {[1, 2, 3, 4, 5].map((lvl) => (
                                                            <div
                                                                key={lvl}
                                                                className={`flex-1 h-full rounded-sm transition-all duration-300 ${reputationLevel.level >= lvl ? "bg-brand-green" : "bg-gray-200"}`}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>

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

                            {/* Accordion FAQs */}
                            <div className="border-t border-brand-border pt-8 mb-10">
                                <h3 className="text-xl font-medium text-brand-dark mb-5">Dúvidas Frequentes</h3>
                                <div className="border border-brand-border rounded-2xl overflow-hidden divide-y divide-brand-border">
                                    {[
                                        {
                                            id: "faq-how",
                                            title: "Como funciona a assinatura?",
                                            content: `As assinaturas recorrentes são processadas de forma automática de acordo com o intervalo do plano (${frequencyLabel}). Você recebe todos os itens descritos no plano de forma recorrente. A cobrança é gerada de acordo com as regras estabelecidas pelo parceiro.`
                                        },
                                        {
                                            id: "faq-pause",
                                            title: "Posso pausar ou cancelar a qualquer momento?",
                                            content: "Sim! Na Dudit, você tem total autonomia. Acessando a área 'Minhas Assinaturas' no seu perfil, você pode pausar temporariamente ou cancelar o plano a qualquer momento, sem taxas ocultas ou multas rescisórias."
                                        },
                                        {
                                            id: "faq-delivery",
                                            title: "Como funciona a entrega/retirada recorrente?",
                                            content: "Você define a modalidade de entrega na hora de assinar. Se optar por Entrega, ela será efetuada no endereço fornecido em cada período de recorrência do plano. Se preferir Retirada, basta comparecer ao local do vendedor no dia combinado."
                                        }
                                    ].map((item) => (
                                        <div key={item.id} className="bg-white">
                                            <button
                                                onClick={() => setExpandedAccordion(expandedAccordion === item.id ? null : item.id)}
                                                className="w-full text-left px-5 py-4 flex items-center justify-between text-[15px] font-medium text-brand-dark hover:bg-brand-gray transition-colors"
                                            >
                                                <span>{item.title}</span>
                                                <ChevronDownIcon size={16} className={`transform transition-transform text-brand-inactive-text duration-200 ${expandedAccordion === item.id ? "rotate-180" : ""}`} />
                                            </button>
                                            <AnimatePresence initial={false}>
                                                {expandedAccordion === item.id && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: "auto", opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.2, ease: "easeInOut" }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="px-5 pb-4 text-sm text-brand-inactive-text leading-relaxed">
                                                            {item.content}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Desktop Buy Panel */}
                        <div className="hidden lg:block lg:col-span-4 relative">
                            {BuyPanel}
                        </div>
                    </div>
                </div>

                {/* Mobile Bottom Bar */}
                {!isPlanOwner && (
                    <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 z-50 flex gap-3 lg:hidden shadow-lg items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-brand-inactive-text font-bold uppercase tracking-wider">Assinatura</span>
                            <span className="text-lg font-bold text-brand-dark leading-none mt-0.5">
                                {formatCurrency(planPrice)}
                                <span className="text-xs text-brand-inactive-text font-normal"> / {plan.frequency_type === "monthly" ? "mês" : "período"}</span>
                            </span>
                        </div>
                        <button
                            onClick={handleSubscribe}
                            disabled={submitting || (deliveryType === "delivery" && !selectedAddressId && !showAddressForm)}
                            className="px-6 py-3.5 bg-brand-green text-white font-bold rounded-full flex items-center justify-center gap-2 hover:bg-[#047857] transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-md text-sm shrink-0"
                        >
                            {submitting ? (
                                <>
                                    <Spinner size={14} className="text-white animate-spin" />
                                    Assinando...
                                </>
                            ) : (
                                <>
                                    <CheckCircleIcon size={16} />
                                    Assinar
                                </>
                            )}
                        </button>
                    </div>
                )}
            </motion.div>

            <ShareModal
                isOpen={showShareModal}
                onClose={() => setShowShareModal(false)}
                url={isMounted ? window.location.href : ""}
                title={plan.name}
                shareMessage={`Gostou? Espalhe a novidade!\n\n*${plan.name}*\nAssinatura recorrente na Dudit:`}
                label="Link do plano"
            />
        </div>
    )
}
