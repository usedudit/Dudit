"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useSupabase } from "@/providers/supabase-provider"
import { HeartIcon, ShareIcon, StarIcon, ChevronRightIcon, TagIcon, MapPinIcon, CheckIcon, WhatsappIcon, InfoIcon, ShieldIcon, CheckCircleIcon, ArrowLeftIcon } from "@/lib/icons"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { Button, Input, FormSection, CepInput, Spinner, RadioButton, DefaultModal } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import { ShareModal } from "./ShareModal"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { useNotification } from "@/hooks/use-notification"
import { getAddressesAction, createAddressAction } from "@/app/actions/shared/addresses"
import { subscribeToRecurringPlanAction } from "@/app/actions/marketplace/recurring-subscriptions"
import { getPartnerUrl } from "@/lib/utils/url-generator"

interface PlanDetailsPageClientProps {
    plan: any
    currentUserId?: string | null
    userProfile?: any
    cartCount?: number
    hideHeaderAndFooter?: boolean
}

const PLACEHOLDER = "https://img.dudit.com.br/static/Placeholder.png"

export function PlanDetailsPageClient({
    plan,
    currentUserId: initialUserId,
    userProfile,
    cartCount,
    hideHeaderAndFooter = false,
}: PlanDetailsPageClientProps) {
    const router = useRouter()
    const { user } = useSupabase()
    const { success: notifySuccess, error: notifyError } = useNotification()

    const [userId, setUserId] = useState<string | null | undefined>(initialUserId || user?.id)
    const [submitting, setSubmitting] = useState(false)
    const [deliveryType, setDeliveryType] = useState<"pickup" | "delivery">("pickup")
    const [showShareModal, setShowShareModal] = useState(false)
    const [isMounted, setIsMounted] = useState(false)
    const [expandedAccordion, setExpandedAccordion] = useState<string | null>(null)

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
        const address = p.addresses?.[0] || {}
        return {
            id: p.id || plan.partner_id || "1",
            user_id: p.user_id,
            store_name: p.store_name || "Vendedor da Dudit",
            city: address?.city || "Brasil",
            state: address?.state || "BR",
            store_image_url: p.store_image_url || null,
            store_avatar: p.store_image_url || p.store_avatar || p.profile_image_url || "https://img.dudit.com.br/static/Placeholder.png",
            profile_image_url: p.profile_image_url || null,
            banner_url: p.banner_url || null,
            rating: p.rating || 0,
            vendas_totais: p.vendas_totais || 0,
            created_at: p.created_at,
            phone: p.phone || null,
        }
    }, [plan])

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
            const addressString = selectedAddress ? buildAddressString(selectedAddress) : null
            const result = await subscribeToRecurringPlanAction({
                partnerId: partner.id,
                planId: plan.id,
                deliveryType,
                deliveryAddress: deliveryType === "delivery" ? addressString : null,
            })

            if (result.success) {
                notifySuccess("Inscrição realizada!", "Sua assinatura foi criada com sucesso.")
                router.push("/assinaturas")
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

    const toggleAccordion = (id: string) => {
        setExpandedAccordion(prev => (prev === id ? null : id))
    }

    const handleWhatsApp = useCallback(() => {
        const cleaned = partner.phone?.replace(/\D/g, "") ?? ""
        const number = cleaned.startsWith("55") ? cleaned : `55${cleaned}`
        const text = encodeURIComponent(`Olá, ${partner.store_name}! Vi seu plano "${plan.name}" na Dudit e gostaria de mais informações.`)
        window.open(`https://wa.me/${number}?text=${text}`, "_blank")
    }, [partner.phone, partner.store_name, plan.name])

    const mainImageUrl = (plan.images && plan.images[0]) || PLACEHOLDER

    return (
        <div className="bg-white min-h-screen text-brand-dark flex flex-col pt-4">
            {!hideHeaderAndFooter && <MarketplaceHeader userProfile={userProfile} cartCount={cartCount} />}

            <main className="flex-grow container mx-auto px-4 max-w-[1400px] py-6 lg:py-10">
                {/* Back button and breadcrumb */}
                <div className="flex items-center justify-between mb-6 lg:mb-8">
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-2 text-brand-inactive-text hover:text-brand-dark transition-colors font-medium text-sm"
                    >
                        <ArrowLeftIcon size={16} /> Voltar
                    </button>
                    <button
                        onClick={() => setShowShareModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-brand-border text-xs font-bold text-brand-inactive-text hover:text-brand-green hover:border-brand-green transition-colors"
                    >
                        <ShareIcon size={14} /> Compartilhar
                    </button>
                </div>

                <div className="flex flex-col lg:flex-row gap-10 xl:gap-14 items-start">
                    {/* Left Column: Plan Content */}
                    <div className="flex-1 w-full space-y-8">
                        {/* Title and Badge */}
                        <div>
                            <div className="flex flex-wrap gap-2 items-center mb-3">
                                <span className="px-3 py-1 bg-[#ecfdf5] text-brand-green font-bold text-xs rounded-full uppercase tracking-wider">
                                    Assinatura {frequencyLabel}
                                </span>
                            </div>
                            <h1 className="text-2xl lg:text-4xl font-semibold text-brand-dark leading-tight mb-4">
                                {plan.name}
                            </h1>
                            {plan.description && (
                                <p className="text-[15px] lg:text-[16px] text-brand-inactive-text leading-relaxed whitespace-pre-wrap">
                                    {plan.description}
                                </p>
                            )}
                        </div>

                        {/* Plan Visual Banner */}
                        <div className="relative aspect-[2/1] w-full rounded-2xl overflow-hidden bg-brand-gray border border-brand-border">
                            <img
                                src={mainImageUrl}
                                alt={plan.name}
                                className="w-full h-full object-cover"
                            />
                        </div>

                        {/* Items Included */}
                        <div className="border-t border-brand-border pt-8">
                            <h2 className="text-lg lg:text-xl font-semibold text-brand-dark mb-5 flex items-center gap-2">
                                Itens inclusos na assinatura
                            </h2>
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

                        {/* Reputação / Vendedor Card */}
                        <div className="border-t border-brand-border pt-8">
                            <h2 className="text-lg lg:text-xl font-semibold text-brand-dark mb-5">Quem oferece?</h2>
                            <div className="p-5 rounded-2xl border border-brand-border bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                                <div className="flex items-center gap-4 min-w-0">
                                    <UserProfileImage
                                        fullName={partner.store_name}
                                        imageUrl={partner.store_avatar?.includes("Placeholder.png") ? null : partner.store_avatar}
                                        className="w-14 h-14 border border-brand-border shrink-0 bg-gray-50"
                                    />
                                    <div className="min-w-0">
                                        <h3 className="font-semibold text-[16px] text-brand-dark truncate leading-tight mb-1">
                                            {partner.store_name}
                                        </h3>
                                        <p className="text-xs text-brand-inactive-text mb-1">
                                            {partner.city} - {partner.state}
                                        </p>
                                        <div className="flex items-center gap-1.5 text-xs text-brand-dark font-medium">
                                            <StarIcon size={12} className="text-brand-green fill-brand-green" />
                                            <span>{Number(partner.rating).toFixed(1)}</span>
                                            {partner.vendas_totais > 0 && (
                                                <span className="text-brand-inactive-text">
                                                    • {partner.vendas_totais} vendas
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2.5">
                                    <Link
                                        href={getPartnerUrl(partner)}
                                        className="flex-1 sm:flex-initial text-center px-4 py-2 border border-brand-border rounded-full text-xs font-bold text-brand-dark hover:bg-brand-gray transition-colors"
                                    >
                                        Visitar Vitrine
                                    </Link>
                                    {partner.phone && (
                                        <button
                                            onClick={handleWhatsApp}
                                            className="px-4 py-2 bg-brand-green text-white rounded-full text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[#047857] transition-colors"
                                        >
                                            <WhatsappIcon size={14} /> Contato
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Accordion FAQ */}
                        <div className="border-t border-brand-border pt-8">
                            <h2 className="text-lg lg:text-xl font-semibold text-brand-dark mb-5">Dúvidas Frequentes</h2>
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
                                            onClick={() => toggleAccordion(item.id)}
                                            className="w-full text-left px-5 py-4 flex items-center justify-between text-[15px] font-medium text-brand-dark hover:bg-brand-gray transition-colors"
                                        >
                                            <span>{item.title}</span>
                                            <span className={`transform transition-transform text-brand-inactive-text ${expandedAccordion === item.id ? "rotate-180" : ""}`}>
                                                ▼
                                            </span>
                                        </button>
                                        {expandedAccordion === item.id && (
                                            <div className="px-5 pb-4 text-sm text-brand-inactive-text leading-relaxed">
                                                {item.content}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Checkout subscribing panel */}
                    <div className="w-full lg:w-[380px] xl:w-[420px] shrink-0 sticky top-[198px] z-30">
                        <div className="rounded-2xl border border-brand-border p-6 shadow-sm bg-white">
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

                            <p className="text-[11px] text-brand-inactive-text text-center mt-4 leading-relaxed">
                                Ao assinar, você concorda com os termos da Dudit e autoriza cobranças recorrentes no período selecionado. Cancele quando quiser.
                            </p>
                        </div>
                    </div>
                </div>
            </main>

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
