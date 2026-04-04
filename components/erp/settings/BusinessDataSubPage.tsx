"use client"

import React, { useState, useEffect, useCallback, useRef, useTransition } from "react"
import cn from "classnames"
import { motion, AnimatePresence } from "framer-motion"
import { Button, InfoCard, Badge, AlertModal, Input as FormInput, Checkbox as FormCheckbox, RadioButton as FormRadioButton, IconPlaceholder } from "@/components/reusable"
import { CpfCnpjInput, CepInput, StateComboBox, MoneyInput, PhoneInput, ListItem, Spinner, Tabs, TabsList, TabsTrigger, TabsContent, DefaultModal, Dropdown, DropdownItem, FormDropdown } from "@/components/reusable"
import { Switch } from "@/components/reusable/Switch"
import { BusinessHoursSelector } from "@/components/business-hours-selector"
import { updatePartnerAction } from "@/app/actions/marketplace/partners"
import { createPaymentMethodAction, updatePaymentMethodAction, deletePaymentMethodAction } from "@/app/actions/payment-methods"
import { ChevronLeftIcon, SaveIcon, EditIcon, PlusIcon, Store, ShoppingBag, HomeIcon, SearchIcon, ThreeDotsIcon, TrashIcon, MoneyIcon, CreditCardIcon, MapPin, Package, XIcon, WrenchIcon, QRCodeIcon, FilterIcon } from "@/lib/icons"
import { useNotification } from "@/hooks/use-notification"
import ImageCropperModal from "@/components/ImageCropperModal"
import { fetchWithCSRF } from "@/lib/utils/fetch-with-csrf"
import { NumberInputWithCheckbox } from "@/components/reusable/Inputs/NumberInputWithCheckbox"
import { FadeIn } from "@/components/animations/FadeIn"

const SELLS_OPTIONS = [
    {
        value: "products",
        icon: ShoppingBag,
        title: "Produtos",
        description: "Venda roupas, eletrônicos, comida ou alugue equipamentos e trajes."
    },
    {
        value: "services",
        icon: WrenchIcon,
        title: "Serviços",
        description: "Para quem trabalha com agendamentos, orçamentos ou consultorias."
    },
]

const CHANNEL_OPTIONS = [
    {
        value: "online",
        icon: Store,
        title: "Vitrine da Dudit",
        description: "Apareça na internet e venda para todos pelo nosso catálogo online."
    },
    {
        value: "pdv",
        icon: HomeIcon,
        title: "Venda no Balcão",
        description: "Organize suas vendas presenciais e o estoque da sua loja física."
    },
]

export const BusinessDataSubPage = ({
    partner,
    paymentMethods,
    onBack,
}: {
    partner: any
    paymentMethods: any[]
    onBack: () => void
}) => {
    const { success: notifySuccess, error: notifyError } = useNotification()
    const [isPending, startTransition] = useTransition()
    const [isLoading, setIsLoading] = useState(false)
    const [activeTab, setActiveTab] = useState("general")
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const businessInfo = typeof partner.business_info === "string"
        ? JSON.parse(partner.business_info)
        : (partner.business_info || { sells: ["products"], channels: ["online"] })

    const [generalInfo, setGeneralInfo] = useState({
        storeName: partner.store_name || "",
        storeDescription: partner.store_description || "",
        storeImageUrl: partner.store_image_url || "",
        businessType: partner.business_type || "pf",
        cnpj: partner.cnpj || "",
        sells: businessInfo?.sells || ["products"],
        channels: businessInfo?.channels || ["online"],
        phone: partner.phone || "",
    })

    const address = partner.addresses?.[0] || {};
    const [addresses, setAddresses] = useState({
        zipCode: partner.zip_code || address.zip_code || "",
        street: partner.street || address.street || "",
        number: partner.number || address.number || "",
        complement: partner.complement || address.complement || "",
        neighborhood: partner.neighborhood || address.neighborhood || "",
        city: partner.city || address.city || "",
        state: partner.state || address.state || "",
        noNumber: (partner.number || address.number) === "S/N",
    })

    const [fiscalInfo, setFiscalInfo] = useState({
        crt: partner.crt || "1",
        contribuinte: partner.contribuinte || "9",
        inscricaoEstadual: partner.inscricao_estadual || "",
        ieIsento: partner.ie_isento || false,
        inscricaoMunicipal: partner.inscricao_municipal || "",
    })

    const [hours, setHours] = useState(partner.opening_hours || {})
    const [methods, setMethods] = useState<any[]>(paymentMethods || [])
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [filteredMethods, setFilteredMethods] = useState<any[]>(paymentMethods || [])

    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearch(search), 300)
        return () => clearTimeout(handler)
    }, [search])

    useEffect(() => {
        if (!debouncedSearch) {
            setFilteredMethods(methods)
            return
        }
        const term = debouncedSearch.toLowerCase()
        setFilteredMethods(methods.filter(m =>
            m.name?.toLowerCase().includes(term) ||
            m.payment_type?.toLowerCase().includes(term) ||
            m.card_brand?.toLowerCase().includes(term)
        ))
    }, [debouncedSearch, methods])

    const [imagePreview, setImagePreview] = useState<string | null>(partner.store_image_url || null)
    const [cropModalOpen, setCropModalOpen] = useState(false)
    const [paymentModalOpen, setPaymentModalOpen] = useState(false)
    const [editingPayment, setEditingPayment] = useState<any | null>(null)
    const [tempImageFile, setTempImageFile] = useState<File | null>(null)
    const [imageUploading, setImageUploading] = useState(false)
    const [isSavingPayment, setIsSavingPayment] = useState(false)

    const [isTogglingStatus, setIsTogglingStatus] = useState<Set<string>>(new Set())
    const [isDeletingMethod, setIsDeletingMethod] = useState<Set<string>>(new Set())
    const [methodToDelete, setMethodToDelete] = useState<any>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const toggleArrayItem = (key: "sells" | "channels", value: string) =>
        setGeneralInfo((prev: any) => {
            const arr = prev[key]
            return {
                ...prev,
                [key]: arr.includes(value) ? arr.filter((i: string) => i !== value) : [...arr, value],
            }
        })

    const handleSubmit = async (e: React.FormEvent) => {
        if (e) e.preventDefault()
        startTransition(async () => {
            setIsLoading(true)

            try {
                const businessInfoData = {
                    sells: generalInfo.sells,
                    channels: generalInfo.channels,
                }

                const result = await updatePartnerAction(partner.id, {
                    storeName: generalInfo.storeName,
                    storeDescription: generalInfo.storeDescription,
                    storeImageUrl: generalInfo.storeImageUrl || null,
                    businessType: generalInfo.businessType as "pf" | "pj",
                    cnpj: generalInfo.businessType === "pj" ? (generalInfo.cnpj || null) : null,
                    cpf: generalInfo.businessType === "pf" ? (generalInfo.cnpj || null) : null,
                    business_info: businessInfoData,
                    zipCode: addresses.zipCode,
                    street: addresses.street,
                    number: addresses.noNumber ? "S/N" : addresses.number,
                    complement: addresses.complement,
                    neighborhood: addresses.neighborhood,
                    city: addresses.city,
                    state: addresses.state,
                    openingHours: hours,
                    crt: fiscalInfo.crt,
                    contribuinte: fiscalInfo.contribuinte,
                    inscricaoEstadual: fiscalInfo.inscricaoEstadual || null,
                    ieIsento: fiscalInfo.ieIsento,
                    inscricaoMunicipal: fiscalInfo.inscricaoMunicipal || null,
                    userId: partner.user_id,
                })

                if (result?.error) {
                    notifyError(result.error)
                } else {
                    notifySuccess("Configurações atualizadas com sucesso!")
                }
            } catch (err) {
                notifyError("Erro ao atualizar configurações")
            } finally {
                setIsLoading(false)
            }
        })
    }

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (file.size > 3 * 1024 * 1024) return void notifyError("Máximo 3MB")
        setTempImageFile(file)
        setCropModalOpen(true)
    }

    const handleCropComplete = async (url: string) => {
        setImageUploading(true)
        setCropModalOpen(false)
        setImagePreview(url)
        try {
            const blob = await (await fetch(url)).blob()
            const ext = blob.type === "image/png" ? "png" : "jpg"
            const file = new File([blob], `partner-logo.${ext}`, { type: blob.type })
            const formData = new FormData()
            formData.append("file", file, "partner-logo.jpg")

            const response = await fetchWithCSRF("/api/upload-image?uploadType=partner-logo", { method: "POST", body: formData })
            const data = await response.json()

            if (!response.ok) {
                setImagePreview(partner.store_image_url || null)
                setGeneralInfo((p: any) => ({ ...p, storeImageUrl: partner.store_image_url || "" }))
                notifyError(data.error || "Erro ao fazer upload")
                return
            }

            if (data.success && data.publicUrl) {
                setGeneralInfo((p: any) => ({ ...p, storeImageUrl: data.publicUrl }))
                notifySuccess("Logo enviada com sucesso!")
            } else {
                setImagePreview(partner.store_image_url || null)
                setGeneralInfo((p: any) => ({ ...p, storeImageUrl: partner.store_image_url || "" }))
                notifyError(data.error || "Erro ao fazer upload")
            }
        } catch {
            setImagePreview(partner.store_image_url || null)
            setGeneralInfo((p: any) => ({ ...p, storeImageUrl: partner.store_image_url || "" }))
            notifyError("Erro no upload da imagem")
        } finally {
            setImageUploading(false)
            setTempImageFile(null)
        }
    }

    const handleSavePaymentMethod = async (data: any) => {
        startTransition(async () => {
            setIsSavingPayment(true)
            try {
                if (editingPayment) {
                    const res = await updatePaymentMethodAction(editingPayment.id, {
                        name: data.name,
                        isActive: data.isActive,
                        cardBrand: data.cardBrand,
                        maxInstallments: data.maxInstallments,
                        feeType: data.feeType,
                        percentageRate: data.percentageRate,
                        fixedAmount: data.fixedAmount,
                        receivingDays: data.receivingDays,
                        discountPercent: data.discountPercent
                    })
                    if (res.success) {
                        const updatedMethod = {
                            ...editingPayment,
                            name: data.name,
                            payment_type: data.paymentType,
                            card_brand: data.cardBrand,
                            max_installments: data.maxInstallments,
                            fee_type: data.feeType,
                            percentage_rate: data.percentageRate,
                            fixed_amount: data.fixedAmount,
                            receiving_days: data.receivingDays,
                            discount_percent: data.discountPercent,
                            is_active: data.isActive
                        }
                        setMethods(prev => prev.map(m => m.id === editingPayment.id ? updatedMethod : m))
                        notifySuccess("Método atualizado!")
                        setPaymentModalOpen(false)
                    } else notifyError(res.error || "Erro ao atualizar")
                } else {
                    const res = await createPaymentMethodAction({
                        partnerId: partner.id,
                        ...data
                    })
                    if (res.success) {
                        setMethods(prev => [...prev, res.method])
                        notifySuccess("Método adicionado!")
                        setPaymentModalOpen(false)
                    } else notifyError(res.error || "Erro ao adicionar")
                }
            } catch {
                notifyError("Erro ao salvar método")
            } finally {
                setIsSavingPayment(false)
            }
        })
    }

    const handleDeletePaymentMethod = async (id: string) => {
        setIsDeletingMethod(prev => new Set(prev).add(id))
        setMethodToDelete(null)
        try {
            const res = await deletePaymentMethodAction(id)
            if (res.success) {
                setMethods(prev => prev.filter(m => m.id !== id))
                notifySuccess("Método removido com sucesso!")
            } else {
                notifyError(res.error || "Erro ao remover método")
            }
        } catch {
            notifyError("Erro inesperado ao remover o método de pagamento")
        } finally {
            setIsDeletingMethod(prev => {
                const next = new Set(prev)
                next.delete(id)
                return next
            })
        }
    }

    const togglePaymentStatus = async (method: any, checked: boolean) => {
        // Optimistic update
        const originalStatus = method.is_active
        setMethods(prev => prev.map(m => m.id === method.id ? { ...m, is_active: checked } : m))
        setIsTogglingStatus(prev => new Set(prev).add(method.id))

        try {
            const res = await updatePaymentMethodAction(method.id, { isActive: checked })
            if (!res.success) {
                // Rollback on error
                setMethods(prev => prev.map(m => m.id === method.id ? { ...m, is_active: originalStatus } : m))
                notifyError(res.error || "Erro ao alterar status")
            } else {
                notifySuccess(`Método ${checked ? 'ativado' : 'desativado'} com sucesso!`)
            }
        } catch {
            setMethods(prev => prev.map(m => m.id === method.id ? { ...m, is_active: originalStatus } : m))
            notifyError("Erro inesperado ao alterar status")
        } finally {
            setIsTogglingStatus(prev => {
                const next = new Set(prev)
                next.delete(method.id)
                return next
            })
        }
    }

    const getPaymentIcon = (type: string) => {
        switch (type) {
            case "pix": return <QRCodeIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
            case "dinheiro": return <MoneyIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
            default: return <CreditCardIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
        }
    }

    const PaymentRow = ({ method, onToggleStatus, onEdit, onDelete }: any) => (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="group hover:bg-brand-gray dark:hover:bg-dark-border/20 transition-colors bg-white dark:bg-dark-background border-b border-brand-border dark:border-dark-border"
        >
            <td className="p-3 pl-6 w-12">
                <FormCheckbox checked={false} onChange={() => { }} />
            </td>
            <td className="p-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border flex-shrink-0 flex items-center justify-center border border-gray-100 dark:border-gray-700">
                        {getPaymentIcon(method.payment_type)}
                    </div>
                    <div className="flex flex-col text-left">
                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5">
                            {method.name}
                        </span>
                        <div className="flex items-center gap-1.5">
                            {method.card_brand && (
                                <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body uppercase">
                                    {method.card_brand.replace("_", " ")}
                                </span>
                            )}
                            {method.card_brand && method.max_installments && <span className="text-[10px] text-brand-border dark:text-dark-border">•</span>}
                            {method.max_installments && (
                                <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body">
                                    Até {method.max_installments}x
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </td>
            <td className="p-3">
                <Badge variant="gray" className="capitalize text-[11px] px-2 py-0.5">{method.payment_type.replace("_", " ")}</Badge>
            </td>
            <td className="p-3">
                <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                    {method.discount_percent ? `${method.discount_percent}%` : "-"}
                </span>
            </td>
            <td className="p-3">
                <div className="flex flex-col">
                    <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                        {method.percentage_rate ? `${method.percentage_rate}%` : "-"}
                    </span>
                    {method.fixed_amount > 0 && (
                        <span className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                            + R$ {method.fixed_amount.toFixed(2)}
                        </span>
                    )}
                </div>
            </td>
            <td className="p-3 text-center">
                <div className="flex justify-center">
                    {isTogglingStatus.has(method.id) ? (
                        <Spinner size={16} className="text-brand-dark dark:text-dark-heading" />
                    ) : (
                        <Switch
                            checked={method.is_active}
                            onCheckedChange={(checked) => onToggleStatus(method, checked)}
                        />
                    )}
                </div>
            </td>
            <td className="p-3 text-center">
                <div className="flex justify-center">
                    {isDeletingMethod.has(method.id) ? (
                        <Spinner size={16} className="text-brand-red" />
                    ) : (
                        <Dropdown
                            align="right"
                            showChevron={false}
                            trigger={
                                <Button variant="outline" size="icon" className="w-[36px] h-[36px] p-0 flex items-center justify-center bg-transparent border-opacity-40">
                                    <ThreeDotsIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-heading" />
                                </Button>
                            }
                        >
                            <DropdownItem onClick={() => onEdit(method)}>
                                <EditIcon className="w-4 h-4 mr-2" /> Editar
                            </DropdownItem>
                            <DropdownItem onClick={() => setMethodToDelete(method)} className="text-brand-red focus:text-brand-red focus:bg-red-50 dark:focus:bg-red-900/10">
                                <TrashIcon className="w-4 h-4 mr-2" /> Excluir
                            </DropdownItem>
                        </Dropdown>
                    )}
                </div>
            </td>
        </motion.tr>
    )

    const PaymentMobileItem = ({ method, onToggleStatus, onEdit, onDelete }: any) => (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-5 border-b border-brand-border dark:border-dark-border last:border-0 cursor-pointer"
            onClick={() => onEdit(method)}
        >
            <div className="flex items-start gap-4 h-auto px-4">
                <div className="w-14 h-14 rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border flex-shrink-0 flex items-center justify-center">
                    {getPaymentIcon(method.payment_type)}
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                    <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                            {method.name}
                        </h3>
                        {isTogglingStatus.has(method.id) || isDeletingMethod.has(method.id) ? (
                            <Spinner size={12} className="mt-1" />
                        ) : (
                            <div className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${method.is_active ? "bg-brand-green" : "bg-brand-red"}`}></div>
                        )}
                    </div>

                    <div className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body uppercase">
                        {method.payment_type.replace("_", " ")} {method.card_brand ? `• ${method.card_brand.replace("_", " ")}` : ""}
                    </div>

                    <div className="flex items-end justify-between gap-2 mt-0.5">
                        <div className="flex items-center gap-2">
                            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                Taxa: {method.percentage_rate ? `${method.percentage_rate}%` : "0%"}
                            </span>
                            <span className="text-brand-inactive-text dark:text-dark-border">•</span>
                            <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                Desc: {method.discount_percent ? `${method.discount_percent}%` : "0%"}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    )

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                {/* Back button — desktop only */}
                                <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                {/* Title row */}
                                <div className="hidden md:flex items-start justify-between">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span className="truncate">Dados do Negócio</span>
                                        </h1>

                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            Gerencie informações da empresa, endereço, fiscal e horários
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-3 flex-shrink-0 ml-3">
                                        <Button variant="outline" onClick={onBack} disabled={isLoading}>
                                            Cancelar
                                        </Button>
                                        <Button onClick={handleSubmit} disabled={isLoading}>
                                            <SaveIcon className="w-5 h-5 mr-2" />
                                            {isLoading ? "Salvando..." : "Salvar"}
                                        </Button>
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="general">Dados gerais</TabsTrigger>
                                        <TabsTrigger value="address">Endereço</TabsTrigger>
                                        <TabsTrigger value="hours">Horários</TabsTrigger>
                                        <TabsTrigger value="payment">Pagamentos</TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        {/* Content Body */}
                        <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            <AnimatePresence mode="wait">
                                <TabsContent value="general" className="mt-0 focus-visible:outline-none">
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                        <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                                            {/* Identificação */}
                                            <section>
                                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Identificação</h3>
                                                <div className="grid grid-cols-12 gap-5">
                                                    <div className="col-span-12 md:col-span-6">
                                                        <FormInput
                                                            label="Nome do negócio"
                                                            placeholder="Ex: Minha Loja"
                                                            value={generalInfo.storeName}
                                                            onChange={(e) => setGeneralInfo({ ...generalInfo, storeName: e.target.value })}
                                                        />
                                                    </div>
                                                    <div className="col-span-12 md:col-span-6">
                                                        <PhoneInput
                                                            label="Celular (WhatsApp)"
                                                            placeholder="(00) 00000-0000"
                                                            value={generalInfo.phone}
                                                            onChange={(val) => setGeneralInfo({ ...generalInfo, phone: val })}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="mt-5">
                                                    <FormInput
                                                        label="Descrição (O que faz)"
                                                        type="textarea"
                                                        placeholder="Conte um pouco sobre seu negócio..."
                                                        value={generalInfo.storeDescription}
                                                        onChange={(e) => setGeneralInfo({ ...generalInfo, storeDescription: e.target.value })}
                                                        rows={3}
                                                    />
                                                </div>
                                            </section>

                                            <div className="h-px bg-brand-border dark:bg-dark-border w-full" />

                                            {/* Dados Tributários */}
                                            <section>
                                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Dados tributários</h3>
                                                <div className="space-y-6">
                                                    <div>
                                                        <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">Tipo de pessoa</label>
                                                        <div className="flex gap-8">
                                                            <FormRadioButton
                                                                name="businessType"
                                                                value="pf"
                                                                checked={generalInfo.businessType === "pf"}
                                                                onChange={() => setGeneralInfo({ ...generalInfo, businessType: "pf" })}
                                                                label="Pessoa Física"
                                                            />
                                                            <FormRadioButton
                                                                name="businessType"
                                                                value="pj"
                                                                checked={generalInfo.businessType === "pj"}
                                                                onChange={() => setGeneralInfo({ ...generalInfo, businessType: "pj" })}
                                                                label="Pessoa Jurídica"
                                                            />
                                                        </div>
                                                    </div>

                                                    <motion.div initial={false} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                        <CpfCnpjInput
                                                            label={generalInfo.businessType === "pj" ? "CNPJ" : "CPF"}
                                                            placeholder={generalInfo.businessType === "pj" ? "00.000.000/0000-00" : "000.000.000-00"}
                                                            value={generalInfo.cnpj}
                                                            onChange={(e) => setGeneralInfo({ ...generalInfo, cnpj: e.target.value })}
                                                            name="cnpj"
                                                        />
                                                    </motion.div>
                                                </div>
                                            </section>

                                            <div className="h-px bg-brand-border dark:bg-dark-border w-full" />

                                            {/* O que você oferece? */}
                                            <section className="space-y-6">
                                                <div>
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">O que você oferece?</h3>
                                                    <div className="grid gap-3">
                                                        {SELLS_OPTIONS.map(opt => (
                                                            <ListItem
                                                                key={opt.value}
                                                                icon={opt.icon}
                                                                title={opt.title}
                                                                description={opt.description}
                                                                onClick={() => toggleArrayItem("sells", opt.value)}
                                                                left={
                                                                    <FormCheckbox
                                                                        checked={generalInfo.sells.includes(opt.value)}
                                                                        onChange={() => toggleArrayItem("sells", opt.value)}
                                                                    />
                                                                }
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Por onde você vai atender?</h3>
                                                    <div className="grid gap-3">
                                                        {CHANNEL_OPTIONS.map(opt => (
                                                            <ListItem
                                                                key={opt.value}
                                                                icon={opt.icon}
                                                                title={opt.title}
                                                                description={opt.description}
                                                                onClick={() => toggleArrayItem("channels", opt.value)}
                                                                left={
                                                                    <FormCheckbox
                                                                        checked={generalInfo.channels.includes(opt.value)}
                                                                        onChange={() => toggleArrayItem("channels", opt.value)}
                                                                    />
                                                                }
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            </section>
                                        </div>

                                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                                            <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border flex flex-col relative overflow-hidden">
                                                <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Logo do Negócio</h3>

                                                <div className="flex items-center gap-4 p-3 border rounded-xl bg-brand-gray/50 border-dashed border-gray-200 dark:border-dark-border dark:bg-dark-background/50">
                                                    <div onClick={() => fileInputRef.current?.click()} className="h-16 w-16 bg-white dark:bg-dark-border border dark:border-dark-border rounded-lg flex items-center justify-center cursor-pointer hover:border-brand-green dark:hover:border-brand-green relative overflow-hidden shadow-sm">
                                                        {imagePreview ? (
                                                            <img src={imagePreview} alt="Logo" className="object-cover w-full h-full" />
                                                        ) : (
                                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 w-5 h-5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                                        )}
                                                        {imageUploading && (
                                                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                                <Spinner size={20} className="text-white" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-sm font-semibold text-gray-900 dark:text-dark-heading">Logo da Loja</p>
                                                        <p className="text-xs text-gray-500 dark:text-dark-body">Máx 3MB (PNG, JPG, WEBP)</p>
                                                    </div>
                                                    <input ref={fileInputRef} type="file" hidden accept="image/*" onChange={handleImageChange} />
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                </TabsContent>

                                <TabsContent value="address" className="mt-0 focus-visible:outline-none">
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                        <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                                            <section>
                                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Endereço do negócio</h3>
                                                <div className="space-y-4">
                                                    <CepInput
                                                        label="CEP"
                                                        placeholder="00000-000"
                                                        value={addresses.zipCode}
                                                        onChange={(val) => setAddresses({ ...addresses, zipCode: val })}
                                                        name="cep"
                                                        onAddressFetched={(data) => {
                                                            setAddresses(prev => ({
                                                                ...prev,
                                                                street: data.street || prev.street,
                                                                neighborhood: data.neighborhood || prev.neighborhood,
                                                                city: data.city || prev.city,
                                                                state: data.state || prev.state,
                                                            }))
                                                        }}
                                                    />
                                                    <FormInput
                                                        label="Logradouro"
                                                        placeholder="Rua, Avenida, etc."
                                                        value={addresses.street}
                                                        onChange={e => setAddresses({ ...addresses, street: e.target.value })}
                                                    />

                                                    <div className="grid grid-cols-2 gap-3 flex-row items-center pt-1.5 pb-1.5">
                                                        <div>
                                                            <NumberInputWithCheckbox
                                                                label="Número"
                                                                value={addresses.number}
                                                                number={addresses.number}
                                                                noNumber={addresses.noNumber}
                                                                onNumberChange={e => setAddresses({ ...addresses, number: e.target.value })}
                                                                onNoNumberChange={checked => setAddresses({ ...addresses, noNumber: checked, number: checked ? "S/N" : "" })}
                                                            />
                                                        </div>
                                                        <div className="mt-[27px]">
                                                            <FormInput
                                                                label="Complemento"
                                                                placeholder="Apto, Bloco, etc."
                                                                value={addresses.complement}
                                                                onChange={e => setAddresses({ ...addresses, complement: e.target.value })}
                                                            />
                                                        </div>
                                                    </div>
                                                    <FormInput
                                                        label="Bairro"
                                                        placeholder="Nome do bairro"
                                                        value={addresses.neighborhood}
                                                        onChange={e => setAddresses({ ...addresses, neighborhood: e.target.value })}
                                                    />

                                                    <div className="grid grid-cols-2 gap-3 items-end">
                                                        <div className="mb-[22px]">
                                                            <FormInput
                                                                label="Cidade"
                                                                placeholder="Nome da cidade"
                                                                value={addresses.city}
                                                                onChange={e => setAddresses({ ...addresses, city: e.target.value })}
                                                            />
                                                        </div>
                                                        <div>
                                                            <StateComboBox
                                                                label="UF"
                                                                value={addresses.state}
                                                                onChange={v => setAddresses({ ...addresses, state: v })}
                                                                className="w-full"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </section>
                                        </div>

                                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                                            <div className="bg-white dark:bg-dark-surface p-0 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden flex flex-col">
                                                <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                                                <div className="p-4 flex items-center justify-between border-b border-brand-border dark:border-dark-border mt-1 border-opacity-60">
                                                    <h3 className="font-bold text-brand-dark dark:text-dark-heading">Localização</h3>
                                                </div>
                                                <div className="p-4 flex flex-col">
                                                    <div
                                                        className="w-full h-[120px] bg-gray-200 dark:bg-dark-border rounded-lg relative overflow-hidden mb-4 flex items-center justify-center cursor-pointer group"
                                                        onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${addresses.street}, ${addresses.number}, ${addresses.neighborhood}, ${addresses.city} - ${addresses.state}, ${addresses.zipCode}`)}`, '_blank')}
                                                    >
                                                        <img
                                                            alt="Satelite Map"
                                                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                                            onError={(e) => { e.currentTarget.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" fill="rgb(229,231,235)"><rect width="100%" height="100%"/></svg>' }}
                                                        />
                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                            <div className="w-5 h-5 rounded-full border-[3px] border-white bg-orange-500 shadow-sm relative z-10 transition-transform group-hover:scale-110"></div>
                                                            <div className="w-12 h-12 bg-white/30 rounded-full absolute mix-blend-overlay animate-pulse"></div>
                                                        </div>
                                                        <div className="absolute top-1.5 right-1.5 bg-white/95 px-1.5 py-0.5 rounded text-[9px] text-gray-500 font-medium">Map data ©2024</div>
                                                    </div>
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex flex-col flex-1 truncate pr-4 text-left">
                                                            <h4 className="font-bold text-brand-dark dark:text-dark-heading text-[15px] mb-1.5 truncate">{generalInfo.storeName || "Nome do Negócio"}</h4>
                                                            <p className="text-brand-inactive-text text-[13px] leading-snug truncate">{addresses.street ? `${addresses.street}, ${addresses.number}` : 'Endereço não informado'}</p>
                                                            <p className="text-brand-inactive-text text-[13px] leading-snug truncate mt-0.5">{addresses.neighborhood ? `${addresses.neighborhood}, ${addresses.city} - ${addresses.state}` : 'Bairro/Cidade não informados'}</p>
                                                        </div>
                                                        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${addresses.street}, ${addresses.number}, ${addresses.neighborhood}, ${addresses.city} - ${addresses.state}, ${addresses.zipCode}`)}`} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold text-brand-dark dark:text-dark-heading underline decoration-brand-dark/20 dark:decoration-dark-heading/20 hover:decoration-brand-dark whitespace-nowrap pt-1">Ver no mapa</a>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                </TabsContent>

                                <TabsContent value="hours" className="mt-0 focus-visible:outline-none">
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Horários de Funcionamento</h3>
                                        <BusinessHoursSelector value={hours} onChange={setHours} />
                                    </motion.div>
                                </TabsContent>

                                <TabsContent value="payment" className="mt-0 focus-visible:outline-none">
                                    <div className="max-w-[1300px] mx-auto pb-20 relative">
                                        {/* Header Row */}
                                        <div className="flex justify-between items-center mb-4">
                                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Métodos de Pagamento ({methods.length})</h3>
                                            <Button variant="link" className="flex items-center hidden md:flex" onClick={() => { setEditingPayment(null); setPaymentModalOpen(true) }}>
                                                + Adicionar Método
                                            </Button>
                                        </div>

                                        {/* Search & Filter Row */}
                                        <div className="flex flex-col md:flex-row gap-3 mb-6">
                                            <FormInput
                                                name="searchPayment"
                                                placeholder="Buscar método..."
                                                value={search}
                                                onChange={(e) => setSearch(e.target.value)}
                                                className="h-[42px] flex-1"
                                                variant="full-rounded"
                                                label=""
                                                prefix={<SearchIcon className="w-4 h-4 text-brand-inactive-text" />}
                                            />
                                            <div className="flex gap-2">
                                                <Button variant="outline" className="md:hidden flex-1" onClick={() => { setEditingPayment(null); setPaymentModalOpen(true) }}>
                                                    <PlusIcon className="w-4 h-4 mr-2" /> Novo
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="w-full bg-white dark:bg-dark-surface rounded-xl relative border border-transparent dark:border-dark-border/20 overflow-hidden">
                                            {/* Table - Desktop */}
                                            <div className="hidden md:block overflow-x-auto no-scrollbar">
                                                {filteredMethods.length > 0 ? (
                                                    <table className="w-full text-left border-collapse">
                                                        <thead>
                                                            <tr className="border-b border-brand-border dark:border-dark-border bg-brand-gray/50 dark:bg-dark-border/10">
                                                                <th className="p-4 pl-8 w-12"><FormCheckbox checked={false} onChange={() => { }} /></th>
                                                                <th className="p-4 text-xs font-bold text-brand-inactive-text uppercase tracking-wider">Método</th>
                                                                <th className="p-4 text-xs font-bold text-brand-inactive-text uppercase tracking-wider">Tipo</th>
                                                                <th className="p-4 text-xs font-bold text-brand-inactive-text uppercase tracking-wider">Desconto</th>
                                                                <th className="p-4 text-xs font-bold text-brand-inactive-text uppercase tracking-wider">Taxas</th>
                                                                <th className="p-4 text-xs font-bold text-brand-inactive-text uppercase tracking-wider text-center">Status</th>
                                                                <th className="p-4 text-xs font-bold text-brand-inactive-text uppercase tracking-wider text-center">Ações</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {filteredMethods.map((method) => (
                                                                <PaymentRow
                                                                    key={method.id}
                                                                    method={method}
                                                                    onToggleStatus={togglePaymentStatus}
                                                                    onEdit={(m: any) => { setEditingPayment(m); setPaymentModalOpen(true) }}
                                                                    onDelete={handleDeletePaymentMethod}
                                                                />
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                ) : (
                                                    <div className="py-20 flex flex-col items-center justify-center text-center">
                                                        <IconPlaceholder
                                                            icon={CreditCardIcon}
                                                            title={search ? "Nenhum resultado encontrado" : "Nenhum método cadastrado"}
                                                            subtitle={search ? "Tente buscar por outro termo ou limpe o filtro." : "Adicione métodos de pagamento como Pix, Dinheiro ou Cartões para começar a vender."}
                                                            itemButton={!search ? {
                                                                text: "Adicionar Primeiro Método",
                                                                action: () => setPaymentModalOpen(true),
                                                                variant: "outline"
                                                            } : undefined}
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            {/* List - Mobile */}
                                            <div className="md:hidden">
                                                {filteredMethods.length > 0 ? (
                                                    <div className="divide-y divide-brand-border dark:divide-dark-border">
                                                        {filteredMethods.map((method) => (
                                                            <PaymentMobileItem
                                                                key={method.id}
                                                                method={method}
                                                                onToggleStatus={togglePaymentStatus}
                                                                onEdit={(m: any) => { setEditingPayment(m); setPaymentModalOpen(true) }}
                                                                onDelete={handleDeletePaymentMethod}
                                                            />
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="py-12 flex flex-col items-center justify-center text-center">
                                                        <IconPlaceholder
                                                            icon={CreditCardIcon}
                                                            title={search ? "Nada encontrado" : "Vazio"}
                                                            subtitle={search ? "Busque novamente." : "Comece agora."}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </TabsContent>
                            </AnimatePresence>
                        </div>
                    </div>
                </Tabs>

                {/* Payment Modal */}
                <DefaultModal
                    isOpen={paymentModalOpen}
                    onClose={() => setPaymentModalOpen(false)}
                    title={editingPayment ? "Editar Método" : "Novo Método"}
                >
                    <div className="space-y-6 pt-2 pb-2">
                        <FormInput
                            label="Nome de exibição"
                            placeholder="Ex: Cartão de Crédito Visa"
                            value={editingPayment?.name || ""}
                            onChange={(e: any) => setEditingPayment((prev: any) => ({ ...prev, name: e.target.value }))}
                        />

                        <div className="grid grid-cols-12 gap-4">
                            <div className="col-span-8">
                                <FormDropdown
                                    label="Tipo de pagamento"
                                    options={[
                                        { value: "dinheiro", label: "Dinheiro" },
                                        { value: "pix", label: "Pix" },
                                        { value: "credito", label: "C. Crédito" },
                                        { value: "debito", label: "C. Débito" },
                                    ]}
                                    value={editingPayment?.payment_type || "credito"}
                                    setValue={(val) => setEditingPayment((prev: any) => ({ ...prev, payment_type: val }))}
                                />
                            </div>
                            <div className="col-span-4">
                                <MoneyInput
                                    label="Desconto (%)"
                                    value={editingPayment?.discount_percent || 0}
                                    onChange={(val: number) => setEditingPayment((prev: any) => ({ ...prev, discount_percent: val }))}
                                />
                            </div>
                        </div>

                        {(editingPayment?.payment_type === "credito" || editingPayment?.payment_type === "debito") && (
                            <div className="grid grid-cols-2 gap-4">
                                <FormDropdown
                                    label="Bandeira"
                                    options={[
                                        { value: "visa", label: "Visa" },
                                        { value: "mastercard", label: "Mastercard" },
                                        { value: "elo", label: "Elo" },
                                        { value: "hipercard", label: "Hipercard" },
                                        { value: "amex", label: "Amex" },
                                        { value: "other", label: "Outra" },
                                    ]}
                                    value={editingPayment?.card_brand || "visa"}
                                    setValue={(val) => setEditingPayment((prev: any) => ({ ...prev, card_brand: val }))}
                                />
                                {editingPayment?.payment_type === "credito" && (
                                    <FormInput
                                        label="Parcelas máx."
                                        type="number"
                                        value={editingPayment?.max_installments || 1}
                                        onChange={(e: any) => setEditingPayment((prev: any) => ({ ...prev, max_installments: parseInt(e.target.value) }))}
                                    />
                                )}
                            </div>
                        )}

                        <div className="bg-brand-gray/30 dark:bg-dark-border/10 rounded-xl p-5 border border-brand-border dark:border-dark-border">
                            <h4 className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider mb-4">Taxas da Operadora</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <MoneyInput
                                    label="Taxa (%)"
                                    value={editingPayment?.percentage_rate || 0}
                                    onChange={(val: number) => setEditingPayment((prev: any) => ({ ...prev, percentage_rate: val }))}
                                />
                                <MoneyInput
                                    label="Fixa (R$)"
                                    value={editingPayment?.fixed_amount || 0}
                                    onChange={(val: number) => setEditingPayment((prev: any) => ({ ...prev, fixed_amount: val }))}
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 pt-2">
                            <Button
                                className="w-full h-12 text-base font-bold bg-brand-green hover:bg-brand-green/90 text-white rounded-full shadow-lg shadow-brand-green/20"
                                onClick={() => handleSavePaymentMethod({
                                    name: editingPayment?.name || "",
                                    paymentType: editingPayment?.payment_type || "credito",
                                    cardBrand: editingPayment?.card_brand,
                                    maxInstallments: editingPayment?.max_installments,
                                    feeType: "both",
                                    percentageRate: editingPayment?.percentage_rate || 0,
                                    fixedAmount: editingPayment?.fixed_amount || 0,
                                    receivingDays: editingPayment?.receiving_days || 0,
                                    discountPercent: editingPayment?.discount_percent || 0,
                                    isActive: editingPayment?.is_active ?? true
                                })}
                                disabled={isSavingPayment}
                            >
                                {isSavingPayment ? "Salvando..." : "Salvar Alterações"}
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full h-12 text-base font-bold bg-transparent border-brand-border dark:border-dark-border text-brand-inactive-text dark:text-dark-body rounded-full"
                                onClick={() => setPaymentModalOpen(false)}
                                disabled={isSavingPayment}
                            >
                                Cancelar
                            </Button>
                        </div>
                    </div>
                </DefaultModal>

                <DefaultModal isOpen={isLoading} onClose={() => { }} title="" maxWidth="sm" hideHeader>
                    <div className="flex flex-col items-center justify-center p-6 gap-6 h-full mt-4">
                        <img src="https://img.dudit.com.br/static/mascots/Aguarde.png" alt="Aguarde" className="w-36 h-36 object-contain" />
                        <p className="text-lg font-semibold text-brand-dark dark:text-dark-heading text-center leading-tight">
                            Salvando configurações...
                        </p>
                    </div>
                </DefaultModal>

                <ImageCropperModal
                    isOpen={cropModalOpen}
                    onClose={() => setCropModalOpen(false)}
                    imageFile={tempImageFile}
                    onCropComplete={handleCropComplete}
                />

                <AlertModal
                    isOpen={!!methodToDelete}
                    onClose={() => setMethodToDelete(null)}
                    title="Excluir Método?"
                    description={`Tem certeza que deseja excluir o método "${methodToDelete?.name}"? Esta ação não pode ser desfeita.`}
                    confirmText="Sim, Excluir"
                    cancelText="Cancelar"
                    onConfirm={() => handleDeletePaymentMethod(methodToDelete.id)}
                    isDestructive
                    isLoading={isDeletingMethod.has(methodToDelete?.id)}
                />
            </div>
        </FadeIn>
    )
}
