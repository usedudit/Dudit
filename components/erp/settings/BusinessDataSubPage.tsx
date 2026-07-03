"use client"

import React, { useState, useCallback, useRef, useTransition, useMemo, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Button,
    Input,
    Checkbox,
    RadioButton,
    CpfCnpjInput,
    CepInput,
    StateComboBox,
    PhoneInput,
    ListItem,
    Spinner,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    AlertModal,
    SavingStatusModal,
    NumberInputWithCheckbox,
    FormSection
} from "@/components/reusable"
import { BusinessHoursSelector } from "@/components/BusinessHoursSelector"
import { updatePartnerAction } from "@/app/actions/marketplace/partners"
import { ChevronLeftIcon, SaveIcon, Store, ShoppingBagIcon, HomeIcon, WrenchIcon, ChevronRightIcon, UserIcon, StoreIcon } from "@/lib/icons"
import PartnerCategoryModal from "./PartnerCategoryModal"
import { getPartnerCategoryPathClient } from "@/lib/data/partner-categories-client"
import { useNotification } from "@/hooks/use-notification"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { FadeIn } from "@/components/animations/FadeIn"
import { normalizeOpeningHours } from "@/lib/utils/opening-hours"
import { formatE164ToDisplay } from "@/lib/utils/phone-utils"
import type { BusinessMode } from "@/lib/business-info"
import { normalizeBusinessInfo } from "@/lib/business-info"

const SELLS_OPTIONS = [
    {
        value: "products",
        icon: ShoppingBagIcon,
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

const MODE_OPTIONS: Array<{
    value: BusinessMode
    icon: any
    title: string
    description: string
}> = [
        {
            value: "quick",
            icon: Store,
            title: "Anunciar rápido",
            description: "Só quero divulgar e vender meus produtos ou serviços na minha cidade",
        },
        {
            value: "erp",
            icon: HomeIcon,
            title: "Gerenciar meu negócio",
            description: "Quero organizar pedidos, clientes e tudo do meu negócio",
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
    const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set())
    const [showValidationModal, setShowValidationModal] = useState(false)

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const businessInfo = normalizeBusinessInfo(partner.business_info)

    const [generalInfo, setGeneralInfo] = useState({
        storeName: partner.store_name || "",
        storeDescription: partner.store_description || "",
        businessType: partner.business_type || "pf",
        cnpj: partner.cpf || partner.cnpj || "",
        sells: businessInfo?.sells || ["products"],
        mode: (businessInfo?.mode || "erp") as BusinessMode,
        phone: formatE164ToDisplay(partner.phone) || "",
        category: partner.category || "",
        categoryId: partner.category_id || null,
        subcategoryId: partner.subcategory_id || null,
    })

    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
    const [categoryPath, setCategoryPath] = useState("")

    useEffect(() => {
        const loadCategoryPath = async () => {
            const activeId = generalInfo.subcategoryId || generalInfo.categoryId
            if (activeId) {
                const path = await getPartnerCategoryPathClient(activeId)
                setCategoryPath(path)
            } else {
                setCategoryPath("")
            }
        }
        loadCategoryPath()
    }, [generalInfo.categoryId, generalInfo.subcategoryId])

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

    const [hours, setHours] = useState(() => normalizeOpeningHours(partner.opening_hours))

    const [initialState, setInitialState] = useState(() => ({
        generalInfo: { ...generalInfo },
        addresses: { ...addresses },
        fiscalInfo: { ...fiscalInfo },
        hours: { ...hours },
    }))

    const isDirty = useMemo(() => {
        return JSON.stringify(initialState.generalInfo) !== JSON.stringify(generalInfo) ||
            JSON.stringify(initialState.addresses) !== JSON.stringify(addresses) ||
            JSON.stringify(initialState.fiscalInfo) !== JSON.stringify(fiscalInfo) ||
            JSON.stringify(initialState.hours) !== JSON.stringify(hours)
    }, [initialState, generalInfo, addresses, fiscalInfo, hours])

    const { showConfirmDialog, confirmNavigation, cancelNavigation, handleNavigation } = useUnsavedChanges(isDirty)

    const handleBack = useCallback(() => {
        handleNavigation(onBack)
    }, [handleNavigation, onBack])

    const toggleArrayItem = (key: "sells", value: string) =>
        setGeneralInfo((prev: any) => {
            const arr = prev[key]
            return {
                ...prev,
                [key]: arr.includes(value) ? arr.filter((i: string) => i !== value) : [...arr, value],
            }
        })

    const setMode = (mode: BusinessMode) =>
        setGeneralInfo((prev: any) => ({ ...prev, mode }))

    const validate = useCallback(() => {
        const errors = new Set<string>()
        if (!generalInfo.storeName.trim()) errors.add("storeName")
        if (!generalInfo.phone.trim()) errors.add("phone")

        const cleanCep = addresses.zipCode.replace(/\D/g, "")
        if (cleanCep.length !== 8) errors.add("zipCode")

        if (!addresses.street.trim()) errors.add("street")
        if (!addresses.neighborhood.trim()) errors.add("neighborhood")
        if (!addresses.city.trim()) errors.add("city")
        if (!addresses.state.trim()) errors.add("state")

        setFieldErrors(errors)
        return errors.size === 0
    }, [generalInfo, addresses])

    const getTabErrorCount = useCallback((tab: string) => {
        if (tab === "general") {
            return ["storeName", "phone"].filter(f => fieldErrors.has(f)).length
        }
        if (tab === "address") {
            return ["zipCode", "street", "neighborhood", "city", "state"].filter(f => fieldErrors.has(f)).length
        }
        return 0
    }, [fieldErrors])

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()

        if (!validate()) {
            setShowValidationModal(true)
            return
        }

        setIsLoading(true)
        startTransition(async () => {
            try {
                const businessInfoData = {
                    sells: generalInfo.sells,
                    mode: generalInfo.mode,
                }

                const result = await updatePartnerAction(partner.id, {
                    storeName: generalInfo.storeName,
                    storeDescription: generalInfo.storeDescription,
                    phone: generalInfo.phone || null,
                    businessType: generalInfo.businessType as "pf" | "pj",
                    cnpj: generalInfo.businessType === "pj" ? (generalInfo.cnpj || null) : null,
                    cpf: generalInfo.businessType === "pf" ? (generalInfo.cnpj || null) : null,
                    businessInfo: businessInfoData,
                    zipCode: addresses.zipCode,
                    street: addresses.street,
                    number: addresses.noNumber ? "S/N" : addresses.number,
                    complement: addresses.complement,
                    neighborhood: addresses.neighborhood,
                    city: addresses.city,
                    state: addresses.state,
                    openingHours: normalizeOpeningHours(hours),
                    crt: fiscalInfo.crt,
                    contribuinte: fiscalInfo.contribuinte,
                    inscricaoEstadual: fiscalInfo.inscricaoEstadual || null,
                    ieIsento: fiscalInfo.ieIsento,
                    inscricaoMunicipal: fiscalInfo.inscricaoMunicipal || null,
                    category: generalInfo.category || null,
                    categoryId: generalInfo.categoryId,
                    subcategoryId: generalInfo.subcategoryId,
                    userId: partner.user_id,
                })

                if (result?.error) {
                    notifyError(result.error)
                    setIsLoading(false)
                } else {
                    notifySuccess("Configurações atualizadas com sucesso!")
                    setInitialState({
                        generalInfo: { ...generalInfo },
                        addresses: { ...addresses },
                        fiscalInfo: { ...fiscalInfo },
                        hours: { ...hours },
                    })
                    // Pequeno delay para garantir que o usuário veja a notificação e o modal de sucesso se houver, 
                    // e então volta para a página anterior
                    setTimeout(() => {
                        onBack()
                    }, 500)
                }
            } catch (err) {
                notifyError("Erro ao atualizar configurações")
                setIsLoading(false)
            }
        })
    }

    const formattedAddress = React.useMemo(() => {
        const streetLine = addresses.street
            ? `${addresses.street}${addresses.number ? `, ${addresses.number}` : ""} - ${addresses.neighborhood || "Bairro não informado"}`
            : null;

        const cityLine = (addresses.city || addresses.state)
            ? `${addresses.city || ""}${addresses.state ? ` - ${addresses.state}` : ""}`
            : null;

        const zipLine = addresses.zipCode;

        return [streetLine, cityLine, zipLine]
            .filter(Boolean)
            .join("\n");
    }, [addresses]);

    const mapsUrl = React.useMemo(() => {
        const fullAddress = `${addresses.street || ""}, ${addresses.number || ""}, ${addresses.neighborhood || ""}, ${addresses.city || ""} - ${addresses.state || ""}, ${addresses.zipCode || ""}`;
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;
    }, [addresses]);

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6">

                                {/* Back button - desktop only */}
                                <div className={`absolute -left-12 top-3 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
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
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        <Button variant="outline" onClick={handleBack} disabled={isLoading}>
                                            Cancelar
                                        </Button>
                                        <Button onClick={handleSubmit} disabled={isLoading} leftIcon={<SaveIcon size={18} />}>
                                            {isLoading ? "Salvando..." : "Salvar"}
                                        </Button>
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="general">
                                            Dados gerais
                                            {getTabErrorCount("general") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                        </TabsTrigger>
                                        <TabsTrigger value="address">
                                            Endereço
                                            {getTabErrorCount("address") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                        </TabsTrigger>
                                        <TabsTrigger value="hours">Horários</TabsTrigger>
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
                                            <FormSection title="Identificação" className="mb-8">
                                                <div className="grid grid-cols-12 gap-5">
                                                    <div className="col-span-12 md:col-span-6">
                                                        <Input
                                                            label="Nome do negócio"
                                                            placeholder="Ex: Minha Loja"
                                                            value={generalInfo.storeName}
                                                            onChange={(e) => {
                                                                setGeneralInfo({ ...generalInfo, storeName: e.target.value })
                                                                setFieldErrors(prev => { const n = new Set(prev); n.delete("storeName"); return n })
                                                            }}
                                                            error={fieldErrors.has("storeName")}
                                                        />
                                                    </div>
                                                    <div className="col-span-12 md:col-span-6">
                                                        <PhoneInput
                                                            label="Celular (WhatsApp)"
                                                            placeholder="(00) 00000-0000"
                                                            value={generalInfo.phone}
                                                            onChange={(e) => {
                                                                setGeneralInfo({ ...generalInfo, phone: e.target.value })
                                                                setFieldErrors(prev => { const n = new Set(prev); n.delete("phone"); return n })
                                                            }}
                                                            error={fieldErrors.has("phone")}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="mt-5">
                                                    <Input
                                                        label="Descrição (O que faz)"
                                                        type="textarea"
                                                        placeholder="Conte um pouco sobre seu negócio..."
                                                        value={generalInfo.storeDescription}
                                                        onChange={(e) => setGeneralInfo({ ...generalInfo, storeDescription: e.target.value })}
                                                        rows={3}
                                                    />
                                                </div>
                                            </FormSection>

                                            {/* Dados Tributários */}
                                            <FormSection hasSeparator title="Dados tributários" className="mb-8">
                                                <div className="space-y-6">
                                                    <div>
                                                        <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">Tipo de pessoa</label>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <ListItem
                                                                icon={UserIcon}
                                                                title="Pessoa Física"
                                                                description="Usado para pessoas"
                                                                onClick={() => setGeneralInfo({ ...generalInfo, businessType: "pf" })}
                                                                className={`px-4 py-3 gap-4 ${generalInfo.businessType === "pf" ? "border-brand-green dark:border-brand-green" : ""}`}
                                                                right={
                                                                    <RadioButton
                                                                        name="businessType"
                                                                        value="pf"
                                                                        checked={generalInfo.businessType === "pf"}
                                                                        onChange={() => setGeneralInfo({ ...generalInfo, businessType: "pf" })}
                                                                    />
                                                                }
                                                            />
                                                            <ListItem
                                                                icon={StoreIcon}
                                                                title="Pessoa Jurídica"
                                                                description="Usado para empresas"
                                                                onClick={() => setGeneralInfo({ ...generalInfo, businessType: "pj" })}
                                                                className={`px-4 py-3 gap-4 ${generalInfo.businessType === "pj" ? "border-brand-green dark:border-brand-green" : ""}`}
                                                                right={
                                                                    <RadioButton
                                                                        name="businessType"
                                                                        value="pj"
                                                                        checked={generalInfo.businessType === "pj"}
                                                                        onChange={() => setGeneralInfo({ ...generalInfo, businessType: "pj" })}
                                                                    />
                                                                }
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
                                            </FormSection>

                                            <FormSection hasSeparator title="O que você oferece?">
                                                <div className="grid gap-3">
                                                    {SELLS_OPTIONS.map(opt => (
                                                        <ListItem
                                                            key={opt.value}
                                                            icon={opt.icon}
                                                            title={opt.title}
                                                            description={opt.description}
                                                            onClick={() => toggleArrayItem("sells", opt.value)}
                                                            right={
                                                                <Checkbox
                                                                    checked={generalInfo.sells.includes(opt.value)}
                                                                    onChange={() => toggleArrayItem("sells", opt.value)}
                                                                />
                                                            }
                                                            className="py-4 px-6 gap-4"
                                                        />
                                                    ))}
                                                </div>
                                            </FormSection>
                                        </div>

                                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                                            <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border flex flex-col relative overflow-hidden">
                                                <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Categoria do Negócio</h3>

                                                <div className="flex flex-col gap-4">
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsCategoryModalOpen(true)}
                                                        className="w-full text-left p-4 border border-brand-border dark:border-dark-border rounded-xl bg-brand-gray/10 hover:bg-brand-gray/20 dark:bg-dark-background/10 dark:hover:bg-dark-background/20 flex items-center justify-between transition-all"
                                                    >
                                                        <span className="text-sm font-medium text-brand-dark dark:text-dark-heading truncate pr-2">
                                                            {categoryPath || "Selecione uma categoria..."}
                                                        </span>
                                                        <ChevronRightIcon className="w-5 h-5 text-gray-400 shrink-0" />
                                                    </button>

                                                    {categoryPath && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setGeneralInfo(prev => ({
                                                                    ...prev,
                                                                    categoryId: null,
                                                                    subcategoryId: null
                                                                }))
                                                                setCategoryPath("")
                                                            }}
                                                            className="text-xs font-bold text-brand-red hover:underline self-start"
                                                        >
                                                            Remover categoria
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                </TabsContent>

                                <TabsContent value="address" className="mt-0 focus-visible:outline-none">
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                        <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                                            <FormSection title="Endereço" >
                                                <div className="space-y-4">
                                                    <CepInput
                                                        value={addresses.zipCode}
                                                        onChange={(val) => {
                                                            setAddresses({ ...addresses, zipCode: val })
                                                            setFieldErrors(prev => { const n = new Set(prev); n.delete("zipCode"); return n })
                                                        }}
                                                        name="cep"
                                                        onAddressFetched={(data) => {
                                                            setAddresses(prev => ({
                                                                ...prev,
                                                                street: data.street || prev.street,
                                                                number: data.number || prev.number,
                                                                neighborhood: data.neighborhood || prev.neighborhood,
                                                                city: data.city || prev.city,
                                                                state: data.state || prev.state,
                                                                noNumber: data.number === "S/N"
                                                            }))
                                                            setFieldErrors(prev => {
                                                                const n = new Set(prev)
                                                                n.delete("street")
                                                                n.delete("neighborhood")
                                                                n.delete("city")
                                                                n.delete("state")
                                                                return n
                                                            })
                                                        }}
                                                        error={fieldErrors.has("zipCode")}
                                                        errorMessage={fieldErrors.has("zipCode") ? "CEP inválido" : ""}
                                                    />
                                                    <Input
                                                        label="Rua/Avenida"
                                                        placeholder="Rua, Avenida, etc."
                                                        value={addresses.street}
                                                        onChange={e => {
                                                            setAddresses({ ...addresses, street: e.target.value })
                                                            setFieldErrors(prev => { const n = new Set(prev); n.delete("street"); return n })
                                                        }}
                                                        error={fieldErrors.has("street")}
                                                    />

                                                    <div className="grid grid-cols-2 gap-3 flex-row items-start pt-1.5 pb-1.5">
                                                        <div>
                                                            <NumberInputWithCheckbox
                                                                label="Número"
                                                                number={addresses.number}
                                                                noNumber={addresses.noNumber}
                                                                onNumberChange={val => setAddresses({ ...addresses, number: val })}
                                                                onNoNumberChange={checked => setAddresses({ ...addresses, noNumber: checked, number: checked ? "S/N" : "" })}
                                                                placeholder="123"
                                                            />
                                                        </div>
                                                        <div>
                                                            <Input
                                                                label="Complemento"
                                                                placeholder="Apto, Bloco, etc."
                                                                value={addresses.complement}
                                                                onChange={e => setAddresses({ ...addresses, complement: e.target.value })}
                                                            />
                                                        </div>
                                                    </div>
                                                    <Input
                                                        label="Bairro"
                                                        placeholder="Nome do bairro"
                                                        value={addresses.neighborhood}
                                                        onChange={e => {
                                                            setAddresses({ ...addresses, neighborhood: e.target.value })
                                                            setFieldErrors(prev => { const n = new Set(prev); n.delete("neighborhood"); return n })
                                                        }}
                                                        error={fieldErrors.has("neighborhood")}
                                                    />

                                                    <div className="grid grid-cols-2 gap-3 items-start">
                                                        <div>
                                                            <Input
                                                                label="Cidade"
                                                                placeholder="Nome da cidade"
                                                                value={addresses.city}
                                                                onChange={e => {
                                                                    setAddresses({ ...addresses, city: e.target.value })
                                                                    setFieldErrors(prev => { const n = new Set(prev); n.delete("city"); return n })
                                                                }}
                                                                error={fieldErrors.has("city")}
                                                            />
                                                        </div>
                                                        <div>
                                                            <StateComboBox
                                                                value={addresses.state}
                                                                onChange={v => setAddresses({ ...addresses, state: v })}
                                                                className="w-full"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </FormSection>
                                        </div>

                                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                                            <div className="bg-white dark:bg-dark-surface p-0 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden flex flex-col">
                                                <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                                                <div className="p-4 flex items-center justify-between border-b border-brand-border dark:border-dark-border mt-1 border-opacity-60">
                                                    <h4 className="font-bold text-brand-dark dark:text-dark-heading">Localização</h4>
                                                </div>
                                                <div className="p-4 flex flex-col">
                                                    <div className="w-full h-[120px] bg-brand-gray dark:bg-dark-border rounded-lg relative overflow-hidden mb-4 flex items-center justify-center cursor-pointer group" onClick={() => window.open(mapsUrl, '_blank')}>
                                                        <img src="https://img.dudit.com.br/static/MapLarge.png" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Mapa" />
                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                            <div className="w-6 h-6 bg-brand-green rounded-full border-2 border-white flex items-center justify-center text-white z-10 transition-transform group-hover:scale-110">
                                                                <div className="w-2 h-2 bg-white rounded-full"></div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="mb-0">
                                                        <div className="flex justify-between items-start mb-1">
                                                            <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate pr-2">{generalInfo.storeName || "Nome do Negócio"}</h4>
                                                            <a href={mapsUrl} target="_blank" className="text-xs font-bold text-brand-dark dark:text-dark-heading underline decoration-brand-dark dark:decoration-dark-heading shrink-0">Ver Mapa</a>
                                                        </div>
                                                        <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed whitespace-pre-line">
                                                            {formattedAddress}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                </TabsContent>

                                <TabsContent value="hours" className="mt-0 focus-visible:outline-none">
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative overflow-hidden">
                                        <FormSection title="Horários de Funcionamento">
                                            <BusinessHoursSelector value={hours as any} onChange={setHours} />
                                        </FormSection>
                                    </motion.div>
                                </TabsContent>
                            </AnimatePresence>
                        </div>
                    </div>
                </Tabs>

                {/* Mobile Bottom Action Bar */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                    <Button
                        variant="outline"
                        onClick={handleBack}
                        className="flex-1 h-12"
                        disabled={isLoading}
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        className="flex-1 h-12"
                        disabled={isLoading}
                        isLoading={isLoading}
                    >
                        Salvar
                    </Button>
                </div>


                <SavingStatusModal isOpen={isLoading} text="Salvando configurações..." />

                {
                    showConfirmDialog && (
                        <AlertModal
                            isOpen={showConfirmDialog}
                            onClose={cancelNavigation}
                            onConfirm={confirmNavigation}
                            title="Sair sem salvar?"
                            description="Você tem alterações nos dados do negócio que ainda não foram salvas."
                            confirmText="Sair sem salvar"
                            cancelText="Continuar editando"
                            variant="warning"
                        />
                    )
                }

                <AlertModal
                    isOpen={showValidationModal}
                    onClose={() => setShowValidationModal(false)}
                    title="Campos obrigatórios"
                    description="Existem campos pendentes ou inválidos. Verifique as abas com a marcação vermelha antes de salvar."
                    variant="warning"
                />



                <PartnerCategoryModal
                    isOpen={isCategoryModalOpen}
                    onClose={() => setIsCategoryModalOpen(false)}
                    onSelect={({ categoryId, subcategoryId, path }) => {
                        setGeneralInfo(prev => ({
                            ...prev,
                            categoryId,
                            subcategoryId
                        }))
                        setCategoryPath(path)
                    }}
                />

            </div >
        </FadeIn >
    )
}
