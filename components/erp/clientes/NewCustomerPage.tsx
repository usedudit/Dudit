"use client"

import { useState, useEffect, useCallback, useRef, useMemo, type FC } from "react"
import {
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    Button,
    FormDropdown,
    Input,
    Checkbox,
    PhoneInput,
    EmailInput,
    FixedPhoneInput,
    WebsiteInput,
    DatePicker,
    ListItem,
    RadioButton,
    FormTextarea,
    UnsavedChangesDialog,
    FormSection,
    ThreeDotsLoader,
    Tooltip
} from "@/components/reusable"
import { CepInput } from "@/components/reusable/Inputs/CepInput"
import { CpfCnpjInput } from "@/components/reusable/Inputs/CpfCnpjInput"
import { StateComboBox } from "@/components/reusable/Inputs/StateComboBox"
import { NumberInputWithCheckbox } from "@/components/reusable/Inputs/NumberInputWithCheckbox"
import { ChevronLeftIcon, SaveIcon, EditIcon, UserIcon, StoreIcon } from "@/lib/icons"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { useNotification } from "@/hooks/use-notification"
import { useSidebar } from "@/lib/sidebar-context"
import { FadeIn } from "@/components/animations/FadeIn"
import { motion, AnimatePresence } from "framer-motion"
import { createComprehensiveCustomerAction, updateComprehensiveCustomerAction, getCustomerByIdAction } from "@/app/actions/erp/customers"
import { useR2Upload } from "@/hooks/use-r2-upload"
import ImageCropperModal from "@/components/ImageCropperModal"
import { getAddressesAction } from "@/app/actions/shared/addresses"
import { consultarCNPJ } from "@/lib/fiscal"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"
import { validateEmail, validateCPF, validateCNPJ, validatePhoneBR, validateURL, validateCEP } from "@/lib/input-validator"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

interface NewCustomerPageProps {
    onBack: () => void;
    partnerId: string;
    customerId?: string;
    initialData?: any;
    onSuccess?: (msg: string) => void;
    onError?: (msg: string) => void;
}

const REQUIRED_FIELDS = [
    { field: "customerName", tab: "general" },
    { field: "email", tab: "general" },
    { field: "mobile", tab: "general" },
    { field: "phone", tab: "general" },
    { field: "website", tab: "general" },
    { field: "cpf", tab: "general" },
    { field: "cnpj", tab: "general" },
    { field: "cep", tab: "address" },
    { field: "billingCep", tab: "address" },
]

const SidebarCard = ({ children, className = "", hasTopStrip = false }: { children: React.ReactNode; className?: string; hasTopStrip?: boolean }) => (
    <div className={`bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors ${className}`}>
        {hasTopStrip && <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>}
        {children}
    </div>
)

const NewCustomerPage: FC<NewCustomerPageProps> = ({ onBack, partnerId, customerId, initialData, onSuccess, onError }) => {
    const { success: notifySuccess, error: notifyError } = useNotification()
    const { uploadFile, isLoading: isUploadingImage } = useR2Upload({
        prefix: "customers/",
    })
    const [activeTab, setActiveTab] = useState("general")
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    // Form State
    const [personType, setPersonType] = useState("Pessoa Jurídica")
    const [customerName, setCustomerName] = useState("")
    const [storeCredit, setStoreCredit] = useState(0)
    const [fantasia, setFantasia] = useState("")
    const [cnpj, setCnpj] = useState("")
    const [ie, setIe] = useState("")
    const [cpf, setCpf] = useState("")
    const [rg, setRg] = useState("")
    const [email, setEmail] = useState("")
    const [phone, setPhone] = useState("")
    const [mobile, setMobile] = useState("")
    const [website, setWebsite] = useState("")
    const [birthDate, setBirthDate] = useState("")
    const [motherName, setMotherName] = useState("")
    const [fatherName, setFatherName] = useState("")
    const [observacoes, setObservacoes] = useState("")
    const [imageUrl, setImageUrl] = useState("")
    const [imagePreview, setImagePreview] = useState("")
    const [showImageCropper, setShowImageCropper] = useState(false)
    const [selectedImageForCrop, setSelectedImageForCrop] = useState<File | null>(null)
    const [imageFile, setImageFile] = useState<File | null>(null)
    const imageInputRef = useRef<HTMLInputElement>(null)
    const [status, setStatus] = useState("Ativo")
    const [contribuinte, setContribuinte] = useState("9")
    const [ieIsento, setIeIsento] = useState(false)
    const [inscricaoMunicipal, setInscricaoMunicipal] = useState("")
    const [crt, setCrt] = useState("1")

    // Address States
    const [cep, setCep] = useState("")
    const [street, setStreet] = useState("")
    const [number, setNumber] = useState("")
    const [complement, setComplement] = useState("")
    const [neighborhood, setNeighborhood] = useState("")
    const [city, setCity] = useState("")
    const [uf, setUf] = useState("SP")
    const [municipioIbge, setMunicipioIbge] = useState("")
    const [noNumber, setNoNumber] = useState(false)
    const [addressType, setAddressType] = useState("Casa")
    const [hasDifferentBillingAddress, setHasDifferentBillingAddress] = useState(false)

    // Billing Address States
    const [billingCep, setBillingCep] = useState("")
    const [billingStreet, setBillingStreet] = useState("")
    const [billingNumber, setBillingNumber] = useState("")
    const [billingComplement, setBillingComplement] = useState("")
    const [billingNeighborhood, setBillingNeighborhood] = useState("")
    const [billingCity, setBillingCity] = useState("")
    const [billingUf, setBillingUf] = useState("SP")
    const [billingNoNumber, setBillingNoNumber] = useState(false)
    const [billingAddressType, setBillingAddressType] = useState("Casa")

    const [isSaving, setIsSaving] = useState(false)
    const [isSearchingCnpj, setIsSearchingCnpj] = useState(false)
    const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set())

    const isDirty = useMemo(() => {
        return customerName !== "" || fantasia !== "" || cnpj !== "" || ie !== "" || cpf !== "" || rg !== "" ||
            email !== "" || phone !== "" || mobile !== "" || website !== "" || birthDate !== "" || motherName !== "" || fatherName !== "" || observacoes !== "" ||
            cep !== "" || street !== "" || number !== "" || neighborhood !== "" || city !== "" || imageUrl !== "" || imageFile !== null ||
            ieIsento !== false || inscricaoMunicipal !== ""
    }, [customerName, fantasia, cnpj, ie, cpf, rg, email, phone, mobile, website, birthDate, motherName, fatherName, observacoes, cep, street, number, neighborhood, city, imageUrl, imageFile, ieIsento, inscricaoMunicipal])

    const { showConfirmDialog, confirmNavigation, cancelNavigation, handleNavigation } = useUnsavedChanges(isDirty)

    const [isLoadingData, setIsLoadingData] = useState(false)
    const initialDataAppliedRef = useRef(false)

    // Helper to populate form fields from a customer data object
    const populateFormFromCustomer = useCallback((c: any) => {
        if (!c) return
        setCustomerName(c.name || "")
        setPersonType(c.person_type === "pj" ? "Pessoa Jurídica" : "Pessoa Física")
        setFantasia(c.nome_fantasia || "")
        setCnpj(c.cnpj || "")
        setIe(c.inscricao_estadual || "")
        setCpf(c.cpf || "")
        setRg(c.rg || "")
        setEmail(c.email || "")
        setMobile(c.phone || "")
        setStoreCredit(c.store_credit || 0)
        setStatus(c.status === "ativo" ? "Ativo" : c.status === "inativo" ? "Inativo" : "Bloqueado")
        setContribuinte(c.contribuinte || "9")
        setCrt(c.crt || "1")
        setIeIsento(c.ie_isento ?? false)
        setInscricaoMunicipal(c.inscricao_municipal || "")
        setObservacoes(c.notes || "")
        setWebsite(c.website || "")
        setBirthDate(c.birth_date || "")
        setMotherName(c.mother_name || "")
        setFatherName(c.father_name || "")
        setImageUrl(c.image_url || "")
        setImagePreview(c.image_url || "")
        if (c.phone_fixed) setPhone(c.phone_fixed)
    }, [])

    // Immediately populate from initialData (from cache) so fields are filled without waiting for fetch
    useEffect(() => {
        if (initialData && !initialDataAppliedRef.current) {
            initialDataAppliedRef.current = true
            populateFormFromCustomer(initialData)
        }
    }, [initialData, populateFormFromCustomer])

    // Fetch customer data for editing (full detail fetch with addresses)
    useEffect(() => {
        if (customerId) {
            const fetchData = async () => {
                // Only show loading overlay if we don't have initial data
                if (!initialData) setIsLoadingData(true)
                try {
                    const res = await getCustomerByIdAction(customerId)
                    if (res.customer) {
                        const c = res.customer
                        if (c) {
                            populateFormFromCustomer(c)

                            // Fetch addresses from the addresses table
                            try {
                                const addrRes = await getAddressesAction(customerId, "customer")
                                if (addrRes.addresses && addrRes.addresses.length > 0) {
                                    const primary = addrRes.addresses.find((a: any) => a.address_type === "primary" || a.is_default) || addrRes.addresses[0]
                                    if (primary) {
                                        setCep(primary.zip_code || "")
                                        setStreet(primary.street || "")
                                        setNumber(primary.number || "")
                                        setComplement(primary.complement || "")
                                        setNeighborhood(primary.neighborhood || "")
                                        setCity(primary.city || "")
                                        setUf(primary.state || "SP")
                                        setNoNumber(primary.number === "S/N")
                                    }

                                    const billing = addrRes.addresses.find((a: any) => a.address_type === "billing")
                                    if (billing) {
                                        setHasDifferentBillingAddress(true)
                                        setBillingCep(billing.zip_code || "")
                                        setBillingStreet(billing.street || "")
                                        setBillingNumber(billing.number || "")
                                        setBillingComplement(billing.complement || "")
                                        setBillingNeighborhood(billing.neighborhood || "")
                                        setBillingCity(billing.city || "")
                                        setBillingUf(billing.state || "SP")
                                        setBillingNoNumber(billing.number === "S/N")
                                    }
                                }
                            } catch (addrErr) {
                                console.error("Erro ao carregar endereços:", addrErr)
                            }
                        }
                    }
                } catch (e) {
                    console.error("Erro ao carregar dados para edição:", e)
                } finally {
                    setIsLoadingData(false)
                }
            }
            fetchData()
        }
    }, [customerId, partnerId, populateFormFromCustomer])

    const handleImageCropComplete = useCallback(async (croppedImageDataUrl: string) => {
        try {
            const response = await fetch(croppedImageDataUrl)
            const blob = await response.blob()
            const extension = blob.type === "image/png" ? "png" : "jpg"
            const file = new File([blob], `customer-image.${extension}`, { type: blob.type })
            setImageFile(file)
            setImagePreview(croppedImageDataUrl)
            setShowImageCropper(false)
            setSelectedImageForCrop(null)
        } catch (error) {
            console.error("Erro ao processar imagem recortada", error)
        }
    }, [])

    const handleBack = useCallback(() => handleNavigation(onBack), [handleNavigation, onBack])

    const getTabErrorCount = useCallback((tab: string) => {
        return REQUIRED_FIELDS.filter(({ field, tab: fieldTab }) => fieldTab === tab && fieldErrors.has(field)).length
    }, [fieldErrors])

    const handleCnpjBlur = useCallback(async () => {
        const cleanCnpj = cnpj.replace(/\D/g, "")
        if (cleanCnpj.length === 14) {
            setIsSearchingCnpj(true)
            try {
                const data = await consultarCNPJ(cleanCnpj)
                if (data && !data.error) {
                    if (data.razao_social) setCustomerName(data.razao_social)
                    if (data.nome_fantasia) setFantasia(data.nome_fantasia)
                    if (data.email) setEmail(data.email)
                    if (data.celular) setMobile(data.celular)
                    if (data.telefone_fixo) setPhone(data.telefone_fixo)
                    else if (data.telefone && !data.celular) {
                        const digits = data.telefone.replace(/\D/g, "")
                        if (digits.length === 11 || (digits.length === 9 && digits.startsWith("9"))) {
                            setMobile(data.telefone)
                        } else {
                            setPhone(data.telefone)
                        }
                    }
                    if (data.cep) setCep(data.cep)
                    if (data.logradouro) setStreet(data.logradouro)
                    if (data.numero) setNumber(data.numero)
                    if (data.complemento) setComplement(data.complemento)
                    if (data.bairro) setNeighborhood(data.bairro)
                    if (data.municipio) setCity(data.municipio)
                    if (data.uf) setUf(data.uf)
                    if (data.simples_optante) { setContribuinte("1"); setCrt("1") }
                    else if (data.simei_optante) setCrt("4")
                    else setCrt("3")
                    notifySuccess("Dados da empresa importados com sucesso!")

                } else if (data?.error) {
                    notifyError("CNPJ não encontrado ou erro na consulta.")
                }
            } catch (error) {
                console.error("Erro ao consultar CNPJ:", error)
            } finally {
                setIsSearchingCnpj(false)
            }
        }
    }, [cnpj, notifySuccess, notifyError])

    const getCsrfToken = async (): Promise<string> => {
        const { fetchCSRFTokenSingleton: getToken } = await import("@/hooks/use-csrf-token")
        return (await getToken()) || ""
    }

    const handleSave = async () => {
        const errors = new Set<string>()
        if (!customerName.trim()) {
            errors.add("customerName")
        }

        if (email && !validateEmail(email)) {
            errors.add("email")
        }

        if (mobile && !validatePhoneBR(mobile)) {
            errors.add("mobile")
        }

        if (phone && !validatePhoneBR(phone)) {
            errors.add("phone")
        }

        if (website && !validateURL(website)) {
            const urlWithProto = website.startsWith("http") ? website : `https://${website}`
            if (!validateURL(urlWithProto)) {
                errors.add("website")
            }
        }

        if (personType === "Pessoa Física" && cpf && !validateCPF(cpf)) {
            errors.add("cpf")
        }

        if (personType === "Pessoa Jurídica" && cnpj && !validateCNPJ(cnpj)) {
            errors.add("cnpj")
        }

        if (cep && !validateCEP(cep)) {
            errors.add("cep")
        }

        if (hasDifferentBillingAddress && billingCep && !validateCEP(billingCep)) {
            errors.add("billingCep")
        }

        if (errors.size > 0) {
            setFieldErrors(errors)
            notifyError("Corrija os erros no formulário antes de salvar.")
            return
        }
        setFieldErrors(new Set())

        try {
            setIsSaving(true)
            const pType = personType === "Pessoa Jurídica" ? "pj" : "pf"
            const token = await getCsrfToken()

            let finalImageUrl = imageUrl
            if (imageFile) {
                const uploadRes = await uploadFile(imageFile)
                if (uploadRes && uploadRes.publicUrl) {
                    finalImageUrl = uploadRes.publicUrl
                } else {
                    notifyError("Erro ao fazer upload da imagem.")
                    setIsSaving(false)
                    return
                }
            }

            const payload = {
                partnerId,
                name: customerName,
                email: email,
                phone: mobile || "",
                phoneFixed: phone || "",
                website: website || "",
                personType: pType as "pj" | "pf",
                cpf: cpf,
                contribuinte: contribuinte,
                cnpj: cnpj,
                nomeFantasia: fantasia,
                inscricaoEstadual: ieIsento ? "" : ie,
                ieIsento: ieIsento,
                inscricaoMunicipal: inscricaoMunicipal,
                crt: crt,
                zipCode: cep,
                street: street,
                number: noNumber ? "S/N" : number,
                complement: complement,
                neighborhood: neighborhood,
                city: city,
                state: uf,
                municipioCodigoIbge: municipioIbge || undefined,
                csrf_token: token,
                status: status === "Ativo" ? "ativo" : status === "Inativo" ? "inativo" : "bloqueado",
                notes: observacoes,
                birthDate: birthDate || null,
                motherName: motherName || null,
                fatherName: fatherName || null,
                image_url: finalImageUrl || null,
                hasDifferentBillingAddress: hasDifferentBillingAddress,
                billingZipCode: hasDifferentBillingAddress ? billingCep : undefined,
                billingStreet: hasDifferentBillingAddress ? billingStreet : undefined,
                billingNumber: hasDifferentBillingAddress ? (billingNoNumber ? "S/N" : billingNumber) : undefined,
                billingComplement: hasDifferentBillingAddress ? billingComplement : undefined,
                billingNeighborhood: hasDifferentBillingAddress ? billingNeighborhood : undefined,
                billingCity: hasDifferentBillingAddress ? billingCity : undefined,
                billingState: hasDifferentBillingAddress ? billingUf : undefined,
            }

            const res = customerId
                ? await updateComprehensiveCustomerAction({ ...payload, customerId })
                : await createComprehensiveCustomerAction(payload)

            if (res.error) {
                notifyError("Erro ao salvar: " + res.error)
            } else {
                notifySuccess("Cliente cadastrado com sucesso!")
                onBack()
            }
        } catch (e) {
            console.error(e)
            notifyError("Ocorreu um erro ao salvar o cliente.")
        } finally {
            setIsSaving(false)
        }
    }

    const pageTitle = customerId ? "Editar cliente" : "Novo cliente"
    const isEditLoadingLocked = Boolean(customerId && isLoadingData)

    const { setHeaderOverride } = useSidebar()

    useEffect(() => {
        setHeaderOverride({
            title: pageTitle,
            onBack: handleBack,
            isSubPage: true
        })
        return () => setHeaderOverride(null)
    }, [pageTitle, handleBack, setHeaderOverride])

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                {/* Back button - desktop only */}
                                <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                {/* Title row */}
                                <div className="hidden md:flex items-start justify-between">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span className="truncate">{pageTitle}</span>
                                        </h1>

                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            Preencha as informações para cadastrar o novo cliente
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        <Button variant="outline" onClick={handleBack} disabled={isSaving || isEditLoadingLocked}>
                                            Cancelar
                                        </Button>
                                        <Button onClick={handleSave} disabled={isSaving || isEditLoadingLocked} leftIcon={<SaveIcon size={18} />}>
                                            {isSaving ? "Salvando..." : "Salvar"}
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
                                        <TabsTrigger value="notes">Observações</TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        {/* Content Body */}
                        <div className={`px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px] relative ${isEditLoadingLocked ? "pointer-events-none" : ""}`}>
                            {isEditLoadingLocked && (
                                <div className="flex items-center justify-center h-[calc(100vh-65px)] w-full">
                                    <ThreeDotsLoader />
                                </div>
                            )}
                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                {/* Form Column */}
                                <div className={`col-span-12 ${activeTab !== 'notes' ? 'lg:col-span-8 lg:pr-12' : ''}`}>
                                    <AnimatePresence mode="wait">
                                        <TabsContent value="general" className="mt-0">
                                            <FadeIn key="general" className="space-y-10">
                                                {/* Mobile/Tablet Image Header Card (< lg) */}
                                                <div className="block lg:hidden">
                                                    <div className="bg-white dark:bg-dark-surface p-4 rounded-2xl border border-brand-border dark:border-dark-border flex items-center gap-4">
                                                        <label className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-full shrink-0 flex items-center justify-center relative group cursor-pointer overflow-hidden border-2 border-dashed border-brand-border dark:border-dark-border hover:border-brand-dark transition-colors">
                                                            <input
                                                                type="file"
                                                                accept="image/png, image/jpeg, image/webp"
                                                                className="hidden"
                                                                onChange={(e) => {
                                                                    const file = e.target.files?.[0]
                                                                    if (file) {
                                                                        setSelectedImageForCrop(file)
                                                                        setShowImageCropper(true)
                                                                    }
                                                                    e.target.value = ""
                                                                }}
                                                            />
                                                            {imagePreview ? (
                                                                <img
                                                                    src={getR2ImageUrl(imagePreview)}
                                                                    alt="Imagem do cliente"
                                                                    className="w-full h-full object-cover"
                                                                />
                                                            ) : (
                                                                <EditIcon size={24} className="text-gray-300 group-hover:opacity-10 transition-opacity" />
                                                            )}
                                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <span className="text-white text-[10px] font-bold uppercase tracking-wider">
                                                                    {imagePreview ? "Alterar" : "Enviar"}
                                                                </span>
                                                            </div>
                                                        </label>
                                                        <div className="min-w-0 flex-1">
                                                            <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading">Imagem do Cliente</h3>
                                                            <p className="text-xs text-brand-inactive-text mt-0.5">Formatos aceitos: PNG, JPG ou WEBP (máx. 5MB)</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Identificação */}
                                                <FormSection title="Identificação">
                                                    <div className="grid grid-cols-12 gap-5">
                                                        <div className="col-span-12 md:col-span-6">
                                                            <Input
                                                                label="Nome ou Razão Social"
                                                                placeholder="Ex: João da Silva ou Empresa LTDA"
                                                                value={customerName}
                                                                onChange={(e) => {
                                                                    setCustomerName(e.target.value)
                                                                    setFieldErrors(prev => {
                                                                        const next = new Set(prev)
                                                                        next.delete("customerName")
                                                                        return next
                                                                    })
                                                                }}
                                                                required
                                                                error={fieldErrors.has("customerName")}
                                                                errorMessage={fieldErrors.has("customerName") ? "O nome é obrigatório" : undefined}
                                                            />
                                                        </div>
                                                        <div className="col-span-12 md:col-span-6 mt-[1px]">
                                                            <FormDropdown
                                                                label="Status"
                                                                value={status}
                                                                setValue={(val) => setStatus(val)}
                                                                options={[
                                                                    { value: "Ativo", label: "Ativo" },
                                                                    { value: "Inativo", label: "Inativo" },
                                                                    { value: "Bloqueado", label: "Bloqueado" }
                                                                ]}
                                                            />
                                                        </div>
                                                    </div>
                                                </FormSection>

                                                {/* Dados Tributários */}
                                                <FormSection
                                                    title="Dados tributários"
                                                    hasSeparator
                                                >
                                                    <div className="space-y-6">
                                                        <div>
                                                            <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">Tipo de pessoa</label>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                <ListItem
                                                                    icon={UserIcon}
                                                                    title="Pessoa Física"
                                                                    description="Usado para pessoas"
                                                                    onClick={() => setPersonType("Pessoa Física")}
                                                                    className={`px-4 py-3 gap-4 ${personType === "Pessoa Física" ? "border-brand-green dark:border-brand-green" : ""}`}
                                                                    right={
                                                                        <RadioButton
                                                                            name="personType"
                                                                            value="pf"
                                                                            checked={personType === "Pessoa Física"}
                                                                            onChange={() => setPersonType("Pessoa Física")}
                                                                        />
                                                                    }
                                                                />
                                                                <ListItem
                                                                    icon={StoreIcon}
                                                                    title="Pessoa Jurídica"
                                                                    description="Usado para empresas"
                                                                    onClick={() => setPersonType("Pessoa Jurídica")}
                                                                    className={`px-4 py-3 gap-4 ${personType === "Pessoa Jurídica" ? "border-brand-green dark:border-brand-green" : ""}`}
                                                                    right={
                                                                        <RadioButton
                                                                            name="personType"
                                                                            value="pj"
                                                                            checked={personType === "Pessoa Jurídica"}
                                                                            onChange={() => setPersonType("Pessoa Jurídica")}
                                                                        />
                                                                    }
                                                                />
                                                            </div>
                                                        </div>

                                                        {personType === "Pessoa Jurídica" ? (
                                                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                                    <div className="flex flex-col gap-1.5">
                                                                        <CpfCnpjInput
                                                                            label="CNPJ"
                                                                            placeholder="00.000.000/0000-00"
                                                                            value={cnpj}
                                                                            onChange={(e) => {
                                                                                setCnpj(e.target.value)
                                                                                setFieldErrors(prev => {
                                                                                    const next = new Set(prev)
                                                                                    next.delete("cnpj")
                                                                                    return next
                                                                                })
                                                                            }}
                                                                            onBlur={handleCnpjBlur}
                                                                            name="cnpj"
                                                                            error={fieldErrors.has("cnpj")}
                                                                            errorMessage={fieldErrors.has("cnpj") ? "CNPJ inválido" : undefined}
                                                                        />
                                                                        {isSearchingCnpj && <span className="text-[11px] text-brand-primary animate-pulse font-medium">Consultando CNPJ...</span>}
                                                                    </div>
                                                                    <Input
                                                                        label="Inscrição Estadual"
                                                                        placeholder="Número da IE"
                                                                        value={ie}
                                                                        onChange={(e) => setIe(e.target.value)}
                                                                        disabled={ieIsento}
                                                                        suffix={
                                                                            <Tooltip text="Inscrição Estadual isenta">
                                                                                <Checkbox
                                                                                    checked={ieIsento}
                                                                                    onChange={(e) => {
                                                                                        setIeIsento(e)
                                                                                        if (e) setIe("")
                                                                                    }}
                                                                                    className="pointer-events-auto"
                                                                                />
                                                                            </Tooltip>
                                                                        }
                                                                    />
                                                                </div>
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                                    <Input label="Nome Fantasia" placeholder="Nome comercial" value={fantasia} onChange={(e) => setFantasia(e.target.value)} />
                                                                    <Input label="Inscrição Municipal" placeholder="Ex: 123456" value={inscricaoMunicipal} onChange={(e) => setInscricaoMunicipal(e.target.value)} />
                                                                </div>
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                                    <FormDropdown
                                                                        label="CRT (Código de Regime Tributário)"
                                                                        value={crt}
                                                                        setValue={(val) => setCrt(val)}
                                                                        options={[
                                                                            { value: "1", label: "1 - Simples Nacional" },
                                                                            { value: "3", label: "3 - Regime Normal" },
                                                                            { value: "4", label: "4 - MEI" }
                                                                        ]}
                                                                    />
                                                                    <FormDropdown
                                                                        label="Contribuinte"
                                                                        value={contribuinte}
                                                                        setValue={(val) => setContribuinte(val)}
                                                                        options={[
                                                                            { value: "1", label: "1 - Contribuinte ICMS" },
                                                                            { value: "2", label: "2 - Contribuinte Isento" },
                                                                            { value: "9", label: "9 - Não Contribuinte" }
                                                                        ]}
                                                                    />
                                                                </div>
                                                            </motion.div>
                                                        ) : (
                                                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                                <CpfCnpjInput
                                                                    label="CPF"
                                                                    placeholder="000.000.000-00"
                                                                    value={cpf}
                                                                    onChange={(e) => {
                                                                        setCpf(e.target.value)
                                                                        setFieldErrors(prev => {
                                                                            const next = new Set(prev)
                                                                            next.delete("cpf")
                                                                            return next
                                                                        })
                                                                    }}
                                                                    name="cpf"
                                                                    error={fieldErrors.has("cpf")}
                                                                    errorMessage={fieldErrors.has("cpf") ? "CPF inválido" : undefined}
                                                                />
                                                                <Input label="RG" placeholder="00.000.000-0" value={rg} onChange={(e) => setRg(e.target.value)} />
                                                            </motion.div>
                                                        )}
                                                    </div>
                                                </FormSection>

                                                {/* Contato */}
                                                <FormSection
                                                    title="Contato"
                                                    hasSeparator
                                                >
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                        <EmailInput
                                                            label="E-mail"
                                                            value={email}
                                                            onChange={(e) => {
                                                                setEmail(e.target.value)
                                                                setFieldErrors(prev => {
                                                                    const next = new Set(prev)
                                                                    next.delete("email")
                                                                    return next
                                                                })
                                                            }}
                                                            error={fieldErrors.has("email")}
                                                            errorMessage={fieldErrors.has("email") ? "E-mail inválido" : undefined}
                                                        />
                                                        <PhoneInput
                                                            label="Celular (WhatsApp)"
                                                            value={mobile}
                                                            onChange={(e) => {
                                                                setMobile(e.target.value)
                                                                setFieldErrors(prev => {
                                                                    const next = new Set(prev)
                                                                    next.delete("mobile")
                                                                    return next
                                                                })
                                                            }}
                                                            error={fieldErrors.has("mobile")}
                                                            errorMessage={fieldErrors.has("mobile") ? "Celular inválido" : undefined}
                                                        />
                                                        <FixedPhoneInput
                                                            label="Telefone Fixo"
                                                            value={phone}
                                                            onChange={(e) => {
                                                                setPhone(e.target.value)
                                                                setFieldErrors(prev => {
                                                                    const next = new Set(prev)
                                                                    next.delete("phone")
                                                                    return next
                                                                })
                                                            }}
                                                            error={fieldErrors.has("phone")}
                                                            errorMessage={fieldErrors.has("phone") ? "Telefone inválido" : undefined}
                                                        />
                                                        <WebsiteInput
                                                            label="Site"
                                                            value={website}
                                                            onChange={(e) => {
                                                                setWebsite(e.target.value)
                                                                setFieldErrors(prev => {
                                                                    const next = new Set(prev)
                                                                    next.delete("website")
                                                                    return next
                                                                })
                                                            }}
                                                            error={fieldErrors.has("website")}
                                                            errorMessage={fieldErrors.has("website") ? "Website inválido" : undefined}
                                                        />
                                                    </div>
                                                </FormSection>

                                                {/* Mobile/Tablet Informações adicionais (< lg) */}
                                                <div className="block lg:hidden">
                                                    <FormSection title="Informações adicionais" hasSeparator>
                                                        <div className="space-y-5">
                                                            <DatePicker
                                                                label="Data de aniversário"
                                                                value={birthDate}
                                                                onChange={(date: Date | undefined) => {
                                                                    if (!date) {
                                                                        setBirthDate("")
                                                                        return
                                                                    }

                                                                    const year = date.getFullYear()
                                                                    const month = String(date.getMonth() + 1).padStart(2, "0")
                                                                    const day = String(date.getDate()).padStart(2, "0")
                                                                    setBirthDate(`${year}-${month}-${day}`)
                                                                }}
                                                            />
                                                            <Input
                                                                label="Nome da mãe"
                                                                placeholder="Ex: Maria da Silva"
                                                                value={motherName}
                                                                onChange={(e) => setMotherName(e.target.value)}
                                                            />
                                                            <Input
                                                                label="Nome do pai"
                                                                placeholder="Ex: José da Silva"
                                                                value={fatherName}
                                                                onChange={(e) => setFatherName(e.target.value)}
                                                            />
                                                        </div>
                                                    </FormSection>
                                                </div>
                                            </FadeIn>
                                        </TabsContent>

                                        <TabsContent value="address" className="mt-0">
                                            <FadeIn key="address" className="space-y-10">
                                                <FormSection title="Endereço principal">
                                                    <div className="space-y-4">
                                                        <CepInput
                                                            label="CEP"
                                                            placeholder="00000-000"
                                                            value={cep}
                                                            onChange={(val) => {
                                                                setCep(val)
                                                                setFieldErrors(prev => {
                                                                    const next = new Set(prev)
                                                                    next.delete("cep")
                                                                    return next
                                                                })
                                                            }}
                                                            name="cep"
                                                            onAddressFetched={(data) => {
                                                                setStreet(data.street)
                                                                setNeighborhood(data.neighborhood)
                                                                setCity(data.city)
                                                                setUf(data.state || "SP")
                                                                setNumber(data.number || "")
                                                                setNoNumber(data.number === "S/N")
                                                                if (data.ibge) setMunicipioIbge(data.ibge)
                                                            }}
                                                            error={fieldErrors.has("cep")}
                                                            errorMessage={fieldErrors.has("cep") ? "CEP inválido" : undefined}
                                                        />
                                                        <Input label="Rua/Avenida" placeholder="Rua, Avenida, etc." value={street} onChange={e => setStreet(e.target.value)} />

                                                        <div className="grid grid-cols-2 gap-3 flex-row items-center pt-1.5 pb-1.5">
                                                            <NumberInputWithCheckbox
                                                                label="Número"
                                                                number={number}
                                                                noNumber={noNumber}
                                                                onNumberChange={val => setNumber(val)}
                                                                onNoNumberChange={checked => { setNoNumber(checked); if (checked) setNumber(""); }}
                                                                placeholder="123"
                                                            />
                                                            <Input label="Complemento" placeholder="Apto, Bloco, etc." value={complement} onChange={e => setComplement(e.target.value)} />
                                                        </div>
                                                        <Input label="Bairro" placeholder="Nome do bairro" value={neighborhood} onChange={e => setNeighborhood(e.target.value)} />

                                                        <div className="grid grid-cols-2 gap-3 items-end">
                                                            <Input label="Cidade" placeholder="Nome da cidade" value={city} onChange={e => setCity(e.target.value)} />
                                                            <StateComboBox
                                                                value={uf}
                                                                onChange={setUf}
                                                                className="w-full"
                                                            />
                                                        </div>
                                                    </div>
                                                </FormSection>

                                                <div className="h-px bg-brand-border dark:bg-dark-border w-full" />

                                                <section>
                                                    <Checkbox
                                                        label="Endereço de cobrança diferente do principal"
                                                        checked={hasDifferentBillingAddress}
                                                        onChange={() => setHasDifferentBillingAddress(!hasDifferentBillingAddress)}
                                                        name="diffBilling"
                                                    />
                                                    {hasDifferentBillingAddress && (
                                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-8 space-y-5">
                                                            <FormSection title="Endereço de cobrança" hasSeparator>
                                                                <div className="space-y-4">
                                                                    <CepInput
                                                                        value={billingCep}
                                                                        onChange={(val) => {
                                                                            setBillingCep(val)
                                                                            setFieldErrors(prev => {
                                                                                const next = new Set(prev)
                                                                                next.delete("billingCep")
                                                                                return next
                                                                            })
                                                                        }}
                                                                        name="billingCep"
                                                                        onAddressFetched={(data) => {
                                                                            setBillingStreet(data.street)
                                                                            setBillingNeighborhood(data.neighborhood)
                                                                            setBillingCity(data.city)
                                                                            setBillingUf(data.state || "SP")
                                                                            setBillingNumber(data.number || "")
                                                                            setBillingNoNumber(data.number === "S/N")
                                                                        }}
                                                                        error={fieldErrors.has("billingCep")}
                                                                        errorMessage={fieldErrors.has("billingCep") ? "CEP inválido" : undefined}
                                                                    />
                                                                    <Input label="Rua/Avenida" placeholder="Rua, Avenida, etc." value={billingStreet} onChange={e => setBillingStreet(e.target.value)} />
                                                                    <div className="grid grid-cols-2 gap-3 flex-row items-center">
                                                                        <NumberInputWithCheckbox
                                                                            label="Número"
                                                                            number={billingNumber}
                                                                            noNumber={billingNoNumber}
                                                                            onNumberChange={val => setBillingNumber(val)}
                                                                            onNoNumberChange={checked => { setBillingNoNumber(checked); if (checked) setBillingNumber(""); }}
                                                                            placeholder="123"
                                                                        />
                                                                        <Input label="Complemento" placeholder="Apto, Bloco, etc." value={billingComplement} onChange={e => setBillingComplement(e.target.value)} />
                                                                    </div>
                                                                    <Input label="Bairro" placeholder="Nome do bairro" value={billingNeighborhood} onChange={e => setBillingNeighborhood(e.target.value)} />
                                                                    <div className="grid grid-cols-2 gap-3 items-end">
                                                                        <Input label="Cidade" placeholder="Nome da cidade" value={billingCity} onChange={e => setBillingCity(e.target.value)} />
                                                                        <StateComboBox
                                                                            value={billingUf}
                                                                            onChange={setBillingUf}
                                                                            className="w-full"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </FormSection>
                                                        </motion.div>
                                                    )}
                                                </section>
                                            </FadeIn>
                                        </TabsContent>

                                        <TabsContent value="notes" className="mt-0">
                                            <FadeIn key="notes">
                                                <FormSection title="Observações">
                                                    <FormTextarea
                                                        label="Observações"
                                                        value={observacoes}
                                                        onChange={(e) => setObservacoes(e.target.value)}
                                                        placeholder="Adicione observações internas sobre este cliente..."
                                                        name="observacoes"
                                                        maxLength={500}
                                                        showCharacterCount
                                                    />
                                                </FormSection>
                                            </FadeIn>
                                        </TabsContent>
                                    </AnimatePresence>
                                </div>

                                {/* Sidebar Column */}
                                {activeTab !== 'notes' && (
                                    <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                                        {activeTab === 'general' ? (
                                            <div className="hidden lg:block space-y-8">
                                                <SidebarCard hasTopStrip>
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Imagem do Cliente</h3>
                                                    <div className="flex items-center gap-4 dark:bg-dark-background/50">
                                                        <div onClick={() => imageInputRef.current?.click()} className="w-16 h-16 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border cursor-pointer relative group overflow-hidden">
                                                            {imagePreview ? (
                                                                <img
                                                                    src={imagePreview.startsWith("data:") ? imagePreview : getR2ImageUrl(imagePreview)}
                                                                    alt="Imagem do cliente"
                                                                    className="object-cover w-full h-full rounded-full"
                                                                />
                                                            ) : (
                                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 w-5 h-5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                                            )}
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                                            </div>
                                                        </div>
                                                        <div className="flex-1">
                                                            <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Imagem</p>
                                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">Máx 5MB (PNG, JPG, WEBP)</p>
                                                        </div>
                                                        <input ref={imageInputRef} type="file" hidden accept="image/png, image/jpeg, image/webp" onChange={(e) => {
                                                            const file = e.target.files?.[0]
                                                            if (file) {
                                                                setSelectedImageForCrop(file)
                                                                setShowImageCropper(true)
                                                            }
                                                            e.target.value = ""
                                                        }} />
                                                    </div>
                                                </SidebarCard>

                                                {personType === "Pessoa Física" && (
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border mt-8 relative overflow-hidden">
                                                        <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                                                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Informações adicionais</h3>
                                                        <div className="space-y-5">
                                                            <DatePicker
                                                                label="Data de aniversário"
                                                                value={birthDate}
                                                                onChange={(date: Date | undefined) => {
                                                                    if (!date) {
                                                                        setBirthDate("")
                                                                        return
                                                                    }

                                                                    const year = date.getFullYear()
                                                                    const month = String(date.getMonth() + 1).padStart(2, "0")
                                                                    const day = String(date.getDate()).padStart(2, "0")
                                                                    setBirthDate(`${year}-${month}-${day}`)
                                                                }}
                                                            />
                                                            <Input
                                                                label="Nome da mãe"
                                                                placeholder="Ex: Maria da Silva"
                                                                value={motherName}
                                                                onChange={(e) => setMotherName(e.target.value)}
                                                            />
                                                            <Input
                                                                label="Nome do pai"
                                                                placeholder="Ex: José da Silva"
                                                                value={fatherName}
                                                                onChange={(e) => setFatherName(e.target.value)}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : activeTab === 'address' ? (
                                            <div className="bg-white dark:bg-dark-surface p-0 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden flex flex-col">
                                                <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                                                <div className="p-4 flex items-center justify-between border-b border-brand-border dark:border-dark-border mt-1 border-opacity-60">
                                                    <h3 className="font-bold text-brand-dark dark:text-dark-heading">Endereço Principal</h3>
                                                </div>
                                                <div className="p-4 flex flex-col">
                                                    <div className="w-full h-[120px] bg-brand-gray dark:bg-dark-border rounded-lg relative overflow-hidden mb-4 flex items-center justify-center cursor-pointer group" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${street}, ${number}, ${neighborhood}, ${city} - ${uf}, ${cep}`)}`, '_blank')}>
                                                        <img alt="Mapa" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" src="https://img.dudit.com.br/static/MapLarge.png" onError={(e) => { e.currentTarget.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" fill="rgb(229,231,235)"><rect width="100%" height="100%"/></svg>' }} />
                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                            <div className="w-6 h-6 bg-brand-green rounded-full border-2 border-white flex items-center justify-center text-white z-10 transition-transform group-hover:scale-110">
                                                                <div className="w-2 h-2 bg-white rounded-full"></div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex flex-col flex-1 truncate pr-4">
                                                            <h4 className="font-bold text-brand-dark dark:text-dark-heading text-[15px] mb-1.5 truncate">
                                                                {customerName || "Nome do Cliente"}
                                                            </h4>

                                                            <p className="text-brand-inactive-text dark:text-dark-body text-[13px] truncate">
                                                                {street
                                                                    ? `${street}, ${noNumber ? 'S/N' : number} - ${neighborhood || 'Bairro não informado'}`
                                                                    : 'Logradouro não informado'}
                                                            </p>

                                                            <p className="text-brand-inactive-text dark:text-dark-body text-[13px] truncate">
                                                                {city && uf
                                                                    ? `${city} - ${uf}`
                                                                    : 'Cidade/Estado não informados'}
                                                            </p>

                                                            <p className="text-brand-inactive-text dark:text-dark-body text-[13px] truncate">
                                                                {cep || 'CEP não informado'}
                                                            </p>
                                                        </div>
                                                        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${street}, ${noNumber ? 'S/N' : number}, ${neighborhood}, ${city} - ${uf}, ${cep}`)}`} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold text-brand-dark dark:text-dark-heading underline decoration-brand-dark/20 dark:decoration-dark-heading/20 hover:decoration-brand-dark whitespace-nowrap pt-1">Ver no mapa</a>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                )}

                            </div>
                        </div>
                    </div>

                    {/* Mobile Bottom Action Bar */}
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                        <Button
                            variant="outline"
                            onClick={handleBack}
                            disabled={isSaving || isEditLoadingLocked}
                            className="flex-1 h-12"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isSaving || isEditLoadingLocked}
                            className="flex-1 h-12"
                            leftIcon={<SaveIcon size={18} />}
                        >
                            {isSaving ? "Salvando..." : "Salvar"}
                        </Button>
                    </div>
                </Tabs>

                {/* Modals */}
                {showImageCropper && selectedImageForCrop && (
                    <ImageCropperModal
                        isOpen={showImageCropper}
                        onClose={() => setShowImageCropper(false)}
                        imageFile={selectedImageForCrop}
                        onCropComplete={handleImageCropComplete}
                        aspectRatio={1}
                    />
                )}

                <UnsavedChangesDialog open={showConfirmDialog} onConfirm={confirmNavigation} onCancel={cancelNavigation} />

                <SavingStatusModal isOpen={isSaving} text={customerId ? "Salvando cliente..." : "Criando cliente..."} />
            </div >
        </FadeIn >
    )
}

export default NewCustomerPage
