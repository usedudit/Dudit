"use client"

import type React from "react"
import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    MapPinIcon, PlusIcon, Package, TagIcon, X, ChevronUpIcon, ChevronDownIcon,
} from "@/lib/icons"
import { Button, Spinner, IconPlaceholder, DefaultModal, CepInput, StateComboBox, RadioButton, ListItem, InfoCard, Separator } from "@/components/reusable"
import { useNotification } from "@/hooks/use-notification"
import { Input } from "@/components/reusable"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getAddressesAction, createAddressAction } from "@/app/actions/shared/addresses"
import { useSupabase } from "@/providers/supabase-provider"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import Link from "next/link"

interface ProductItem {
    id: string
    name: string
    price: number
    quantity: number
    image?: string
    variant?: string
}

interface CheckoutWrapperProps {
    open: boolean
    onClose: () => void
    products: ProductItem[]
    partnerId?: string
    partnerInfo: {
        address: string | {
            street?: string
            number?: string
            neighborhood?: string
            city?: string
            state?: string
            zipCode?: string
        }
        paymentMethods: string[]
        installmentsWithoutInterest?: number
        interestRatePercent?: number
        maxInstallments?: number
        pixDiscountPercent?: number
        mpConnected?: boolean
        mpPublicKey?: string
    }
    onSubmit: (data: {
        deliveryType: "delivery" | "pickup"
        deliveryAddress: string
        paymentMethod: string
        notes: string
        quantities: Record<string, number>
        installments: number
        useMercadoPago?: boolean
        paymentFormData?: any
    }) => Promise<void>
}

interface UserAddress {
    id: string
    street: string
    number: string
    complement: string | null
    neighborhood: string
    city: string
    state: string
    zip_code: string
    is_default: boolean
}

const fadeVariants = {
    open: { opacity: 1, transition: { duration: 0.2 } },
    closed: { opacity: 0, transition: { duration: 0.2 } },
}

function SectionHeader({
    title,
    isOpen,
    onClick,
}: {
    title: string
    isOpen: boolean
    onClick: () => void
}) {
    return (
        <div
            onClick={onClick}
            className="px-6 py-4 border-b border-brand-border flex items-center justify-between bg-brand-gray cursor-pointer"
        >
            <div className="flex items-center gap-3">
                <span className="text-md font-bold text-brand-dark dark:text-dark-heading">
                    {title}
                </span>
            </div>
            <div className="text-brand-dark dark:text-dark-heading">
                {isOpen ? <ChevronUpIcon size={20} /> : <ChevronDownIcon size={20} />}
            </div>
        </div>
    )
}

// FIX 3: Use the reusable Input component for coupon
function CouponInput({ onApply }: { onApply: (code: string) => void }) {
    const [value, setValue] = useState("")
    const [applied, setApplied] = useState(false)

    const handleApply = () => {
        if (!value.trim()) return
        onApply(value.trim())
        setApplied(true)
    }

    const handleRemove = () => {
        setValue("")
        setApplied(false)
        onApply("")
    }

    return (
        <div>
            <div className="flex items-center gap-1.5 mb-2">
                <TagIcon size={13} className="text-brand-inactive-text" />
                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">Cupom de desconto</span>
            </div>
            <div className="flex items-center gap-2">
                <div className="flex-1">
                    <Input
                        value={value}
                        onChange={(e) => setValue(e.target.value.toUpperCase())}
                        disabled={applied}
                        placeholder="Digite seu cupom"
                        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && handleApply()}
                        className={applied ? "border-brand-green bg-green-50/30 dark:bg-green-900/10" : ""}
                    />
                </div>
                {applied ? (
                    <button type="button" onClick={handleRemove} className="text-xs font-semibold text-brand-red hover:text-red-600 flex items-center gap-1 flex-shrink-0 pb-0.5">
                        <X size={12} /> Remover
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={handleApply}
                        disabled={!value.trim()}
                        className="text-xs font-bold text-brand-green hover:text-[#047857] disabled:opacity-40 transition-colors flex-shrink-0 pb-0.5"
                    >
                        Aplicar
                    </button>
                )}
            </div>
        </div>
    )
}

export function CheckoutWrapper({ open, onClose, products, partnerId, partnerInfo, onSubmit }: CheckoutWrapperProps) {
    const { user, supabase } = useSupabase()

    // FIX 4: Track closing animation state
    const [isVisible, setIsVisible] = useState(false)
    const [isAnimatingOut, setIsAnimatingOut] = useState(false)

    const formatPartnerAddress = (addr: any) => {
        if (!addr) return "Endereço não informado"
        if (typeof addr === "string") return addr
        return `${addr.street || ""}, ${addr.number || "S/N"} - ${addr.neighborhood || ""}, ${addr.city || ""} - ${addr.state || ""}`
    }

    const { error: notifyError } = useNotification()
    const [isLoading, setIsLoading] = useState(false)
    const [deliveryError, setDeliveryError] = useState<string | null>(null)
    const [paymentError, setPaymentError] = useState<string | null>(null)
    const quantities = useMemo<Record<string, number>>(() => {
        const acc: Record<string, number> = {}

        for (const p of products) {
            acc[p.id] = p.quantity
        }

        return acc
    }, [products])

    const [userId, setUserId] = useState<string | null>(null)
    const [userName, setUserName] = useState<string>("")
    const [userEmail, setUserEmail] = useState<string>("")

    const [userAddresses, setUserAddresses] = useState<UserAddress[]>([])
    const [selectedAddressId, setSelectedAddressId] = useState<string>("")
    const [showAddressForm, setShowAddressForm] = useState(false)
    const [loadingAddresses, setLoadingAddresses] = useState(false)
    const [loadingCep, setLoadingCep] = useState(false)
    const [newAddressData, setNewAddressData] = useState({
        zipCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "",
    })

    const [couponCode, setCouponCode] = useState("")

    const [formData, setFormData] = useState({
        deliveryType: "pickup" as "delivery" | "pickup",
        deliveryAddress: "",
        paymentMethod: partnerInfo.paymentMethods?.[0] || "Dinheiro",
        notes: "",
        installments: 1,
    })

    const [paymentOption, setPaymentOption] = useState<"traditional" | "mercadopago">(
        partnerInfo.mpConnected ? "mercadopago" : "traditional",
    )

    const [openSections, setOpenSections] = useState({ delivery: true, payment: true, notes: false })
    const toggleSection = (key: keyof typeof openSections) =>
        setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))

    // FIX 4: Handle open/close with fade animation
    useEffect(() => {
        if (open) {
            setIsVisible(true)
            setIsAnimatingOut(false)
        }
    }, [open])

    const handleClose = () => {
        setIsAnimatingOut(true)
        setTimeout(() => {
            setIsVisible(false)
            setIsAnimatingOut(false)
            onClose()
        }, 200)
    }

    useEffect(() => {
        if (!open) return
        if (user) {
            setUserId(user.id)
            setUserName(user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário")
            setUserEmail(user.email || "")
        }
    }, [open, user])

    useEffect(() => {
        if (open && userId) loadUserAddresses()
    }, [open, userId])

    useEffect(() => {
        if (open) {
            document.body.style.overflow = "hidden"
        } else {
            document.body.style.overflow = ""
        }

        return () => {
            document.body.style.overflow = ""
        }
    }, [open])

    const loadUserAddresses = async () => {
        if (!userId) return
        setLoadingAddresses(true)
        try {
            const result = await getAddressesAction(userId, "user")
            if (result.addresses) {
                setUserAddresses(result.addresses as UserAddress[])
                const defaultAddress = (result.addresses as UserAddress[]).find((a: UserAddress) => a.is_default)
                if (defaultAddress) {
                    setSelectedAddressId(defaultAddress.id)
                    setFormData(prev => ({ ...prev, deliveryAddress: buildAddressString(defaultAddress) }))
                }
            }
        } catch (err) {
            console.error("Error loading addresses:", err)
        }
        setLoadingAddresses(false)
    }

    const buildAddressString = (a: UserAddress) =>
        `${a.street}, ${a.number}${a.complement ? `, ${a.complement}` : ""} - ${a.neighborhood}, ${a.city} - ${a.state}, ${a.zip_code}`

    const handleAddressSelect = (addressId: string) => {
        setSelectedAddressId(addressId)
        const address = userAddresses.find(a => a.id === addressId)
        if (address) setFormData(prev => ({ ...prev, deliveryAddress: buildAddressString(address) }))
    }

    const handleCepBlur = async () => {
        const cep = newAddressData.zipCode.replace(/\D/g, "")
        if (cep.length !== 8) return
        setLoadingCep(true)
        try {
            const response = await fetch(`/api/cep?cep=${cep}`)
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
        const { zipCode, street, number, neighborhood, city, state } = newAddressData
        if (!zipCode || !street || !number || !neighborhood || !city || !state) {
            setDeliveryError("Preencha todos os campos obrigatórios do endereço")
            return
        }
        setIsLoading(true)
        let csrfToken = ""
        try {
            const csrfRes = await fetch("/api/csrf-token")
            const csrfData = await csrfRes.json()
            csrfToken = csrfData.token || ""
        } catch {
            notifyError("Erro de Segurança", "Erro ao validar segurança. Recarregue a página.")
            setIsLoading(false)
            return
        }
        const result = await createAddressAction({
            entityId: userId, entityType: "user",
            street, number, complement: newAddressData.complement,
            neighborhood, city, state, zipCode,
            isDefault: userAddresses.length === 0,
            csrf_token: csrfToken,
        })
        if (result.error) {
            setDeliveryError(result.error)
        } else {
            await loadUserAddresses()
            if (result.address) {
                setSelectedAddressId(result.address.id)
                setFormData(prev => ({ ...prev, deliveryAddress: buildAddressString(result.address) }))
            }
            setShowAddressForm(false)
            setNewAddressData({ zipCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "" })
        }
        setIsLoading(false)
    }

    const totalAmount = products.reduce((sum, p) => sum + p.price * (quantities[p.id] || p.quantity), 0)
    const paymentMethods = partnerInfo.paymentMethods?.length > 0 ? partnerInfo.paymentMethods : ["Dinheiro", "PIX"]
    const isPickup = formData.deliveryType === "pickup"
    const traditionalPaymentLabel = isPickup ? "Pagar na Retirada" : "Pagar na Entrega"

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        setDeliveryError(null)
        setPaymentError(null)
        setIsLoading(true)
        if (formData.deliveryType === "delivery") {
            if (showAddressForm) {
                setDeliveryError("Por favor, salve o endereço antes de finalizar o pedido")
                setIsLoading(false)
                return
            }
            if (!formData.deliveryAddress) {
                setDeliveryError("Por favor, selecione um endereço de entrega")
                setIsLoading(false)
                return
            }
        }

        try {
            if (paymentOption === "mercadopago") {
                await onSubmit({ ...formData, quantities, useMercadoPago: true })
            } else {
                await onSubmit({ ...formData, quantities, useMercadoPago: false })
            }
        } catch (err: any) {
            const msg = err.message || "Erro ao processar pedido"
            const systemKeywords = ["rls", "database", "server", "banco", "tabela", "processar pedido", "conexão"]
            const isSystemError = systemKeywords.some(key => msg.toLowerCase().includes(key))

            if (isSystemError) {
                notifyError("Erro do Sistema", msg)
            } else if (msg.toLowerCase().includes("endereço") || msg.toLowerCase().includes("entrega")) {
                setDeliveryError(msg)
            } else if (msg.toLowerCase().includes("pagamento") || msg.toLowerCase().includes("cartão") || msg.toLowerCase().includes("pix")) {
                setPaymentError(msg)
            } else {
                notifyError("Erro", msg)
            }
            setIsLoading(false)
        }
    }

    if (!isVisible && !open) return null

    return (
        <>
            {/* FIX 4: Fade in/out animation on the wrapper itself */}
            <motion.div
                key="checkout-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: isAnimatingOut ? 0 : 1 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[100] bg-white dark:bg-dark-surface overflow-y-auto custom-scrollbar"
            >
                <header className="lg:flex flex-col w-full bg-brand-dark sticky top-0 z-50 shadow-md">
                    <div className="w-full h-[68px] flex items-center justify-between max-w-[1300px] px-4 mx-auto gap-4">
                        <Link href="/" prefetch={true} className="cursor-pointer shrink-0 z-110 pt-1">
                            <img
                                src="https://img.dudit.com.br/static/Logo.png"
                                alt="Dudit"
                                width={140}
                                height={40}
                                className="h-10 w-auto object-contain"
                            />
                        </Link>
                        <div className="flex items-center gap-2 text-sm font-medium text-white tracking-wide">
                            🔒 Pagamento seguro
                        </div>
                    </div>
                </header>

                <div className="container mx-auto px-4 lg:px-6 max-w-[1300px] w-full pt-6 md:pt-10 pb-32 md:pb-20">
                    <div className="mb-8 flex flex-col md:flex-row md:items-center gap-4 w-full justify-start">
                        <div className="hidden md:flex">
                            <Button variant="filled" onClick={handleClose} className="w-10 h-10 p-0 flex items-center justify-center shrink-0">
                                <X className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </Button>
                        </div>
                        <div className="text-left w-full">
                            <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading flex items-center">Finalizar Compra</h1>
                            <p className="text-md text-brand-inactive-text mt-1">Conclua seu pedido informando os dados de entrega e pagamento.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                        <div className="lg:col-span-8 space-y-4">

                            {/* ENTREGA */}
                            <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl overflow-hidden">
                                <SectionHeader title="Entrega" isOpen={openSections.delivery} onClick={() => toggleSection("delivery")} />
                                <AnimatePresence initial={false}>
                                    {openSections.delivery && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                            <div className="p-6 space-y-6">
                                                <div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        <ListItem
                                                            className={`transition-all p-0 gap-0 h-[68px] ${formData.deliveryType === "delivery" ? "border-brand-green hover:border-brand-green" : "border-brand-border hover:border-brand-dark/30"}`}
                                                            title="Entrega"
                                                            titleClassName="text-md font-bold text-brand-dark dark:text-dark-heading truncate"
                                                            description="Receba em casa"
                                                            descriptionClassName="text-sm text-brand-inactive-text dark:text-dark-body leading-tight truncate"
                                                            onClick={() => setFormData({ ...formData, deliveryType: "delivery" })}
                                                            left={
                                                                <RadioButton
                                                                    name="deliveryType"
                                                                    value="delivery"
                                                                    checked={!isPickup}
                                                                    onChange={() => setFormData({ ...formData, deliveryType: "delivery" })}
                                                                />
                                                            }
                                                        />
                                                        <ListItem
                                                            className={`transition-all p-0 gap-0 h-[68px] ${isPickup ? "border-brand-green hover:border-brand-green" : "border-brand-border hover:border-brand-dark/30"}`}
                                                            title="Retirada no local"
                                                            titleClassName="text-md font-bold text-brand-dark dark:text-dark-heading truncate"
                                                            description="Retire imediatamente"
                                                            descriptionClassName="text-sm text-brand-inactive-text dark:text-dark-body leading-tight truncate"
                                                            onClick={() => {
                                                                setFormData({ ...formData, deliveryType: "pickup" })
                                                                if (partnerInfo.mpConnected) setPaymentOption("mercadopago")
                                                            }}
                                                            left={
                                                                <RadioButton
                                                                    name="deliveryType"
                                                                    value="pickup"
                                                                    checked={isPickup}
                                                                    onChange={() => {
                                                                        setFormData({ ...formData, deliveryType: "pickup" })
                                                                        if (partnerInfo.mpConnected) setPaymentOption("mercadopago")
                                                                    }}
                                                                />
                                                            }
                                                            right={<span className="text-sm font-bold text-brand-green flex-shrink-0 mr-4">Grátis</span>}
                                                        />
                                                    </div>
                                                </div>

                                                <AnimatePresence>
                                                    {isPickup && (
                                                        <motion.div key="pickup" initial="closed" animate="open" exit="closed" variants={fadeVariants}>
                                                            {/* FIX 1: Small square map image inline beside address text, no border wrapper */}
                                                            <div className="flex items-stretch gap-3">
                                                                <img
                                                                    src="https://img.dudit.com.br/static/Map.png"
                                                                    alt="Mapa do local"
                                                                    className="w-12 h-12 object-cover rounded-xl flex-shrink-0"
                                                                />
                                                                <div className="flex flex-col justify-center">
                                                                    <p className="text-md font-bold text-brand-dark dark:text-dark-heading">Local de Retirada</p>
                                                                    <p className="text-sm text-brand-inactive-text">{formatPartnerAddress(partnerInfo.address)}</p>
                                                                </div>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                    {!isPickup && (
                                                        <motion.div key="delivery" initial="closed" animate="open" exit="closed" variants={fadeVariants}>
                                                            {loadingAddresses ? (
                                                                <div className="py-8 text-center text-sm text-gray-400">Carregando endereços...</div>
                                                            ) : userAddresses.length > 0 ? (
                                                                <div className="space-y-3">
                                                                    {userAddresses.map((address) => (
                                                                        <div
                                                                            key={address.id}
                                                                            onClick={() => handleAddressSelect(address.id)}
                                                                            className={`flex items-start gap-3 p-4 border rounded-xl transition-all cursor-pointer ${selectedAddressId === address.id
                                                                                ? "border-brand-green bg-green-50/30 dark:bg-green-900/10"
                                                                                : "border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface"
                                                                                }`}
                                                                        >
                                                                            <div className="mt-0.5 flex-shrink-0">
                                                                                <RadioButton
                                                                                    name="addressSelect"
                                                                                    value={address.id}
                                                                                    checked={selectedAddressId === address.id}
                                                                                    onChange={() => handleAddressSelect(address.id)}
                                                                                />
                                                                            </div>
                                                                            <div className="flex-1">
                                                                                <p className="font-bold text-sm text-brand-dark dark:text-dark-heading">{address.street}, {address.number}</p>
                                                                                <p className="text-sm text-brand-inactive-text mt-0.5">{address.neighborhood} - {address.city}/{address.state}</p>
                                                                                <p className="text-xs text-brand-inactive-text mt-1">CEP: {address.zip_code}</p>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                    {!showAddressForm && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setShowAddressForm(true)}
                                                                            className="w-full py-3 border border-dashed border-brand-border dark:border-dark-border rounded-xl text-sm font-medium text-brand-dark dark:text-dark-heading transition-colors flex items-center justify-center gap-2"
                                                                        >
                                                                            <PlusIcon size={16} /> Adicionar outro endereço
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-col items-center border-t border-brand-border pt-6">
                                                                    <div className="flex flex-col items-center border-t border-brand-border pt-6">
                                                                        <IconPlaceholder
                                                                            icon={MapPinIcon}
                                                                            title="Nenhum endereço cadastrado"
                                                                            subtitle="Adicione um endereço para receber sua entrega."
                                                                            itemButton={{
                                                                                text: "Cadastrar Endereço",
                                                                                action: () => setShowAddressForm(true),
                                                                                variant: "outline"
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>

                                                {deliveryError && (
                                                    <div className="flex gap-3 mt-4 w-full">
                                                        <InfoCard message={`${deliveryError}`} color="red" />
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* PAGAMENTO */}
                            <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl overflow-hidden">
                                <SectionHeader title="Pagamento" isOpen={openSections.payment} onClick={() => toggleSection("payment")} />
                                <AnimatePresence initial={false}>
                                    {openSections.payment && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                            <div className="p-6">
                                                {partnerInfo.mpConnected ? (
                                                    <>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                                                            <ListItem
                                                                className={`transition-all p-0 gap-0 h-[68px] ${paymentOption === "mercadopago" ? "border-brand-green hover:border-brand-green" : "border-brand-border hover:border-brand-dark/30"}`}
                                                                title="Mercado Pago"
                                                                titleClassName="text-md font-bold text-brand-dark dark:text-dark-heading truncate"
                                                                description="Pague com cartão, Pix ou saldo MP."
                                                                descriptionClassName="text-sm text-brand-inactive-text dark:text-dark-body leading-tight truncate"
                                                                onClick={() => setPaymentOption("mercadopago")}
                                                                left={
                                                                    <RadioButton
                                                                        name="paymentOption"
                                                                        value="mercadopago"
                                                                        checked={paymentOption === "mercadopago"}
                                                                        onChange={() => setPaymentOption("mercadopago")}
                                                                    />
                                                                }
                                                            />
                                                            {(!isPickup || !partnerInfo.mpConnected) && (
                                                                <ListItem
                                                                    className={`transition-all p-0 gap-0 h-[68px] ${paymentOption === "traditional" ? "border-brand-green hover:border-brand-green" : "border-brand-border hover:border-brand-dark/30"}`}
                                                                    title={traditionalPaymentLabel}
                                                                    titleClassName="text-md font-bold text-brand-dark dark:text-dark-heading truncate"
                                                                    description="Combine o pagamento na entrega ou retirada."
                                                                    descriptionClassName="text-sm text-brand-inactive-text dark:text-dark-body leading-tight truncate"
                                                                    onClick={() => setPaymentOption("traditional")}
                                                                    left={
                                                                        <RadioButton
                                                                            name="paymentOption"
                                                                            value="traditional"
                                                                            checked={paymentOption === "traditional"}
                                                                            onChange={() => setPaymentOption("traditional")}
                                                                        />
                                                                    }
                                                                />
                                                            )}
                                                        </div>

                                                        <AnimatePresence mode="wait">
                                                            {paymentOption === "traditional" && (
                                                                <motion.div
                                                                    key="traditional"
                                                                    initial={{ opacity: 0 }}
                                                                    animate={{ opacity: 1 }}
                                                                    exit={{ opacity: 0 }}
                                                                    transition={{ duration: 0.2 }}
                                                                    className="mb-6"
                                                                >
                                                                    <Label className="mb-2 block">Selecione o método</Label>
                                                                    <Select value={formData.paymentMethod} onValueChange={(value) => setFormData({ ...formData, paymentMethod: value, installments: 1 })}>
                                                                        <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                                                                        <SelectContent>
                                                                            {paymentMethods.map((method) => (
                                                                                <SelectItem key={method} value={method}>{method}</SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="flex gap-3 mb-6">
                                                            <div className="w-1 rounded-full bg-brand-border dark:bg-dark-border flex-shrink-0" />
                                                            <p className="text-sm text-brand-inactive-text">Este vendedor aceita apenas pagamentos diretos (Entrega ou Retirada).</p>
                                                        </div>
                                                        <div className="mb-6">
                                                            <Label className="mb-2 block">Selecione o método</Label>
                                                            <Select value={formData.paymentMethod} onValueChange={(value) => setFormData({ ...formData, paymentMethod: value, installments: 1 })}>
                                                                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                                                                <SelectContent>
                                                                    {paymentMethods.map((method) => (
                                                                        <SelectItem key={method} value={method}>{method}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </>
                                                )}

                                                {paymentError && (
                                                    <div className="flex gap-3 mt-4 w-full">
                                                        <InfoCard message={`${paymentError}`} color="red" />
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* OBSERVAÇÕES */}
                            <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl overflow-hidden">
                                <SectionHeader title="Observações" isOpen={openSections.notes} onClick={() => toggleSection("notes")} />
                                <AnimatePresence initial={false}>
                                    {openSections.notes && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                            <div className="p-6">
                                                <Textarea
                                                    id="notes-cw"
                                                    placeholder="Ex: Tocar interfone, embalar para presente, detalhes da entrega..."
                                                    value={formData.notes}
                                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                                    className="resize-none"
                                                    rows={3}
                                                />
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* RIGHT COLUMN */}
                        <div className="lg:col-span-4 space-y-4">
                            <div className="border border-brand-border dark:border-dark-border rounded-xl overflow-hidden bg-white dark:bg-dark-surface">
                                <div className="text-md bg-brand-gray px-6 py-4 border-b border-brand-border font-bold text-brand-dark">
                                    Resumo do Pedido
                                </div>
                                <div className="p-6">
                                    <div className="space-y-4 mb-6 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                                        {products.map((item) => (
                                            <div key={item.id} className="flex gap-3">
                                                <div className="w-16 h-16 bg-gray-100 border border-brand-border dark:border-dark-border rounded-lg overflow-hidden flex-shrink-0">
                                                    {item.image ? (
                                                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <Package size={24} className="text-gray-300" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-bold text-brand-dark dark:text-dark-heading text-sm mb-0.5 line-clamp-2">{item.name}</h4>
                                                    {item.variant && (
                                                        <p className="text-xs text-brand-inactive-text mb-1">
                                                            {item.variant.includes(":") ? (
                                                                <>
                                                                    {item.variant.split(":")[0]}: <span className="font-medium text-brand-dark">{item.variant.split(":")[1]}</span>
                                                                </>
                                                            ) : item.variant}
                                                        </p>
                                                    )}
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs text-brand-inactive-text font-medium">Qtd: {quantities[item.id] || item.quantity}</span>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading text-sm">R$ {(item.price * (quantities[item.id] || item.quantity)).toFixed(2)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mb-4">
                                        <CouponInput onApply={(code) => setCouponCode(code)} />
                                    </div>

                                    <div className="space-y-3 mb-4">
                                        <div className="flex justify-between text-sm font-medium text-brand-inactive-text">
                                            <span>Total dos itens</span>
                                            <span className="text-brand-dark dark:text-dark-heading">R$ {totalAmount.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm font-medium text-brand-inactive-text">
                                            <span>Entrega</span>
                                            <span className={isPickup ? "text-brand-green font-semibold" : "text-brand-dark dark:text-dark-heading"}>
                                                {isPickup ? "Grátis" : "A combinar"}
                                            </span>
                                        </div>
                                    </div>

                                    <Separator className="mb-4" />

                                    <div className="flex justify-between items-end mb-4">
                                        <span className="font-bold text-xl text-brand-dark dark:text-dark-heading">Total</span>
                                        <span className="font-bold text-xl text-brand-dark dark:text-dark-heading">R$ {totalAmount.toFixed(2)}</span>
                                    </div>

                                    <Button
                                        onClick={(e) => handleSubmit(e as any)}
                                        disabled={isLoading}
                                        className="w-full h-[46px]"
                                    >
                                        {isLoading ? "Processando..." : `Finalizar pedido • R$ ${totalAmount.toFixed(2)}`}
                                    </Button>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                <div className="shrink-0 mt-auto pb-[80px] lg:pb-0">
                    <MarketplaceFooter />
                </div>

                <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border p-4 z-[110] lg:hidden">
                    <div className="flex gap-3">
                        <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading} className="flex-1 h-12 bg-transparent">
                            Voltar
                        </Button>
                        <Button
                            onClick={(e) => handleSubmit(e as any)}
                            disabled={isLoading}
                            className={`flex-2 h-12 ${isLoading ? "opacity-80" : ""}`}
                        >
                            {isLoading ? "Processando..." : `Finalizar pedido • R$ ${totalAmount.toFixed(2)}`}
                        </Button>
                    </div>
                </div>
            </motion.div>

            <DefaultModal
                isOpen={showAddressForm}
                onClose={() => setShowAddressForm(false)}
                title="Adicionar Novo Endereço"
            >
                <div className="flex flex-col gap-4">
                    <div onBlur={handleCepBlur}>
                        <CepInput
                            label="CEP"
                            value={newAddressData.zipCode}
                            onChange={(val) => setNewAddressData({ ...newAddressData, zipCode: val })}
                            disabled={loadingCep}
                        />
                    </div>
                    <div>
                        <Input
                            label="Logradouro"
                            value={newAddressData.street}
                            onChange={(e) => setNewAddressData({ ...newAddressData, street: e.target.value })}
                            placeholder="Ex: Rua das Flores"
                            disabled={loadingCep}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Input
                                label="Número"
                                value={newAddressData.number}
                                onChange={(e) => setNewAddressData({ ...newAddressData, number: e.target.value })}
                                placeholder="123"
                            />
                        </div>
                        <div>
                            <Input
                                label="Complemento"
                                value={newAddressData.complement}
                                onChange={(e) => setNewAddressData({ ...newAddressData, complement: e.target.value })}
                                placeholder="Apto, Sala..."
                            />
                        </div>
                    </div>
                    <div>
                        <Input
                            label="Bairro"
                            value={newAddressData.neighborhood}
                            onChange={(e) => setNewAddressData({ ...newAddressData, neighborhood: e.target.value })}
                            disabled={loadingCep}
                            placeholder="Bairro"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Input
                                label="Cidade"
                                value={newAddressData.city}
                                onChange={(e) => setNewAddressData({ ...newAddressData, city: e.target.value })}
                                disabled={loadingCep}
                                placeholder="Cidade"
                            />
                        </div>
                        <div>
                            <StateComboBox
                                label="Estado"
                                value={newAddressData.state}
                                onChange={(val) => setNewAddressData({ ...newAddressData, state: val })}
                            />
                        </div>
                    </div>

                    <Button
                        onClick={handleSaveNewAddress}
                        disabled={isLoading || loadingCep}
                        className="w-full mb-4"
                    >
                        {isLoading ? <Spinner className="mr-2" size={16} /> : null}
                        Salvar Endereço
                    </Button>
                </div>
            </DefaultModal>
        </>
    )
}
