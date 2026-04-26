"use client"

import React, { useState, useCallback, useRef, useTransition } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button, Input as FormInput, Checkbox as FormCheckbox, RadioButton as FormRadioButton } from "@/components/reusable"
import { CpfCnpjInput, CepInput, StateComboBox, PhoneInput, ListItem, Spinner, Tabs, TabsList, TabsTrigger, TabsContent, DefaultModal } from "@/components/reusable"
import { BusinessHoursSelector } from "@/components/business-hours-selector"
import { updatePartnerAction } from "@/app/actions/marketplace/partners"
import { ChevronLeftIcon, SaveIcon, Store, ShoppingBagIcon, HomeIcon, WrenchIcon } from "@/lib/icons"
import { useNotification } from "@/hooks/use-notification"
import ImageCropperModal from "@/components/ImageCropperModal"
import { fetchWithCSRF } from "@/lib/utils/fetch-with-csrf"
import { NumberInputWithCheckbox } from "@/components/reusable/Inputs/NumberInputWithCheckbox"
import { FadeIn } from "@/components/animations/FadeIn"
import { normalizeOpeningHours } from "@/lib/utils/opening-hours"

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

    const [hours, setHours] = useState(() => normalizeOpeningHours(partner.opening_hours))


    const [imagePreview, setImagePreview] = useState<string | null>(partner.store_image_url || null)
    const [cropModalOpen, setCropModalOpen] = useState(false)
    const [tempImageFile, setTempImageFile] = useState<File | null>(null)
    const [imageUploading, setImageUploading] = useState(false)
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

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                {/* Back button - desktop only */}
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
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
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
                                            <div className="mb-8">
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
                                            </div>

                                            <div className="h-px bg-brand-border dark:bg-dark-border w-full" />

                                            {/* Dados Tributários */}
                                            <div className="mt-8">
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
                                            </div>

                                            {/* O que você oferece? */}
                                            <div className="mt-8">
                                                <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">O que você oferece?</h3>
                                                <div className="grid gap-3">
                                                    {SELLS_OPTIONS.map(opt => (
                                                        <ListItem
                                                            key={opt.value}
                                                            icon={opt.icon}
                                                            title={opt.title}
                                                            description={opt.description}
                                                            onClick={() => toggleArrayItem("sells", opt.value)}
                                                            right={
                                                                <FormCheckbox
                                                                    checked={generalInfo.sells.includes(opt.value)}
                                                                    onChange={() => toggleArrayItem("sells", opt.value)}
                                                                />
                                                            }
                                                            className="py-4 px-6 gap-4"
                                                        />
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="mt-8">
                                                <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Por onde você vai atender?</h3>
                                                <div className="grid gap-3">
                                                    {CHANNEL_OPTIONS.map(opt => (
                                                        <ListItem
                                                            key={opt.value}
                                                            icon={opt.icon}
                                                            title={opt.title}
                                                            description={opt.description}
                                                            onClick={() => toggleArrayItem("channels", opt.value)}
                                                            right={
                                                                <FormCheckbox
                                                                    checked={generalInfo.channels.includes(opt.value)}
                                                                    onChange={() => toggleArrayItem("channels", opt.value)}
                                                                />
                                                            }
                                                            className="py-4 px-6 gap-4"
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                                            <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border flex flex-col relative overflow-hidden">
                                                <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Logo do Negócio</h3>

                                                <div className="flex items-center gap-4 dark:bg-dark-background/50">
                                                    <div onClick={() => fileInputRef.current?.click()} className="w-16 h-16 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                        {imagePreview ? (
                                                            <img src={imagePreview} alt="Logo" className="object-cover w-full h-full rounded-full" />
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
                                                        <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Selecione uma imagem</p>
                                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">Máx 3MB (PNG, JPG, WEBP)</p>
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
                                                                number={addresses.number}
                                                                noNumber={addresses.noNumber}
                                                                onNumberChange={val => setAddresses({ ...addresses, number: val })}
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
                                                        className="w-full h-[120px] bg-brand-gray dark:bg-dark-border rounded-lg relative overflow-hidden mb-4 flex items-center justify-center cursor-pointer group"
                                                        onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${addresses.street}, ${addresses.number}, ${addresses.neighborhood}, ${addresses.city} - ${addresses.state}, ${addresses.zipCode}`)}`, '_blank')}
                                                    >
                                                        <img
                                                            alt="Mapa"
                                                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                                            src="https://img.dudit.com.br/static/MapLarge.png"
                                                            onError={(e) => { e.currentTarget.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" fill="rgb(229,231,235)"><rect width="100%" height="100%"/></svg>' }}
                                                        />
                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                            <div className="w-6 h-6 bg-brand-green rounded-full border-2 border-white flex items-center justify-center text-white z-10 transition-transform group-hover:scale-110"></div>
                                                            <div className="w-12 h-12 bg-white/30 rounded-full absolute mix-blend-overlay animate-pulse"></div>
                                                        </div>
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
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative overflow-hidden">
                                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Horários de Funcionamento</h3>
                                        <BusinessHoursSelector value={hours} onChange={setHours} />
                                    </motion.div>
                                </TabsContent>

                            </AnimatePresence>
                        </div>
                    </div>
                </Tabs>

                {/* Mobile Bottom Action Bar */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3">
                    <Button
                        variant="outline"
                        onClick={onBack}
                        className="flex-1 h-[48px]"
                        disabled={isLoading}
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        className="flex-1 h-[48px]"
                        disabled={isLoading}
                        isLoading={isLoading}
                    >
                        Salvar
                    </Button>
                </div>


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

            </div>
        </FadeIn>
    )
}
