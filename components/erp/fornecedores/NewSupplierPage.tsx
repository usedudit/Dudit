"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo, type FC } from "react"
import {
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    Button,
    Badge,
    AlertModal,
    FormDropdown,
    Input,
    Checkbox,
    PhoneInput,
    EmailInput,
    FixedPhoneInput,
    WebsiteInput,
    ListItem,
    RadioButton,
    FormTextarea,
    UnsavedChangesDialog,
    FormSection,
    ThreeDotsLoader
} from "@/components/reusable"
import { CepInput } from "@/components/reusable/Inputs/CepInput"
import { CpfCnpjInput } from "@/components/reusable/Inputs/CpfCnpjInput"
import { StateComboBox } from "@/components/reusable/Inputs/StateComboBox"
import { NumberInputWithCheckbox } from "@/components/reusable/Inputs/NumberInputWithCheckbox"
import { ChevronLeftIcon, SaveIcon, EditIcon, UserIcon, StoreIcon } from "@/lib/icons"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { useNotification } from "@/hooks/use-notification"
import { FadeIn } from "@/components/animations/FadeIn"
import { motion, AnimatePresence } from "framer-motion"
import { createComprehensiveSupplierAction, updateComprehensiveSupplierAction, getSupplierByIdAction } from "@/app/actions/erp/suppliers"
import { consultarCNPJ } from "@/lib/nuvem-fiscal"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"
import { validateEmail, validateCPF, validateCNPJ, validatePhoneBR, validateURL, validateCEP } from "@/lib/input-validator"

interface NewSupplierPageProps {
    onBack: () => void;
    partnerId: string;
    supplierId?: string;
    onSuccess?: (msg: string) => void;
    onError?: (msg: string) => void;
}

const REQUIRED_FIELDS = [
    { field: "supplierName", tab: "general" },
    { field: "email", tab: "general" },
    { field: "mobile", tab: "general" },
    { field: "phone", tab: "general" },
    { field: "cpf", tab: "general" },
    { field: "cnpj", tab: "general" },
    { field: "cep", tab: "address" },
]

const NewSupplierPage: FC<NewSupplierPageProps> = ({ onBack, partnerId, supplierId, onSuccess, onError }) => {
    const { success: notifySuccess, error: notifyError } = useNotification()
    const [activeTab, setActiveTab] = useState("general")
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    // Form State
    const [personType, setPersonType] = useState("Pessoa Jurídica")
    const [supplierName, setSupplierName] = useState("")
    const [fantasia, setFantasia] = useState("")
    const [cnpj, setCnpj] = useState("")
    const [ie, setIe] = useState("")
    const [cpf, setCpf] = useState("")
    const [email, setEmail] = useState("")
    const [phone, setPhone] = useState("")
    const [mobile, setMobile] = useState("")
    const [website, setWebsite] = useState("")
    const [observacoes, setObservacoes] = useState("")
    const [status, setStatus] = useState("Ativo")
    const [contribuinte, setContribuinte] = useState("9")
    const [supplierCode, setSupplierCode] = useState("")

    // Address States
    const [cep, setCep] = useState("")
    const [street, setStreet] = useState("")
    const [number, setNumber] = useState("")
    const [complement, setComplement] = useState("")
    const [neighborhood, setNeighborhood] = useState("")
    const [city, setCity] = useState("")
    const [uf, setUf] = useState("SP")
    const [noNumber, setNoNumber] = useState(false)

    const [isSaving, setIsSaving] = useState(false)
    const [isSearchingCnpj, setIsSearchingCnpj] = useState(false)
    const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set())

    const isDirty = useMemo(() => {
        return supplierName !== "" || fantasia !== "" || cnpj !== "" || ie !== "" || cpf !== "" ||
            email !== "" || phone !== "" || mobile !== "" || website !== "" || observacoes !== "" ||
            cep !== "" || street !== "" || number !== "" || neighborhood !== "" || city !== ""
    }, [supplierName, fantasia, cnpj, ie, cpf, email, phone, mobile, website, observacoes, cep, street, number, neighborhood, city])

    const { showConfirmDialog, confirmNavigation, cancelNavigation, handleNavigation } = useUnsavedChanges(isDirty)

    const [isLoadingData, setIsLoadingData] = useState(false)

    // Fetch supplier data for editing
    useEffect(() => {
        if (supplierId) {
            const fetchData = async () => {
                setIsLoadingData(true)
                try {
                    const res = await getSupplierByIdAction(supplierId)
                    if (res.supplier) {
                        const s = res.supplier
                        setSupplierName(s.name || "")
                        setPersonType(s.person_type === "pj" ? "Pessoa Jurídica" : "Pessoa Física")
                        setFantasia(s.nome_fantasia || "")
                        setCnpj(s.cnpj || "")
                        setIe(s.inscricao_estadual || "")
                        setCpf(s.cpf || "")
                        setEmail(s.email || "")
                        setMobile(s.phone || "")
                        setStatus(s.status === "ativo" ? "Ativo" : "Inativo")
                        setContribuinte(s.contribuinte || "9")
                        setObservacoes(s.notes || "")
                        setSupplierCode(s.supplier_code || "")
                        // Address fields (direct from suppliers table)
                        setCep(s.zip_code || "")
                        setStreet(s.street || "")
                        setNumber(s.number || "")
                        setComplement(s.complement || "")
                        setNeighborhood(s.neighborhood || "")
                        setCity(s.city || "")
                        setUf(s.state || "SP")
                        setNoNumber(s.number === "S/N")
                        if (s.phone_fixed) setPhone(s.phone_fixed)
                    }
                } catch (e) {
                    console.error("Erro ao carregar dados para edição:", e)
                } finally {
                    setIsLoadingData(false)
                }
            }
            fetchData()
        }
    }, [supplierId, partnerId])

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
                    if (data.razao_social) setSupplierName(data.razao_social)
                    if (data.nome_fantasia) setFantasia(data.nome_fantasia)
                    if (data.email) setEmail(data.email)
                    if (data.telefone) setMobile(data.telefone)
                    if (data.cep) setCep(data.cep)
                    if (data.logradouro) setStreet(data.logradouro)
                    if (data.numero) setNumber(data.numero)
                    if (data.complemento) setComplement(data.complemento)
                    if (data.bairro) setNeighborhood(data.bairro)
                    if (data.municipio) setCity(data.municipio)
                    if (data.uf) setUf(data.uf)
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
        const { token } = await (await fetch("/api/csrf-token")).json()
        return token
    }

    const handleSave = async () => {
        const errors = new Set<string>()
        if (!supplierName.trim()) {
            errors.add("supplierName")
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

        if (personType === "Pessoa Física" && cpf && !validateCPF(cpf)) {
            errors.add("cpf")
        }

        if (personType === "Pessoa Jurídica" && cnpj && !validateCNPJ(cnpj)) {
            errors.add("cnpj")
        }

        if (cep && !validateCEP(cep)) {
            errors.add("cep")
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

            const payload = {
                partnerId,
                name: supplierName,
                email: email,
                phone: mobile || "",
                phoneFixed: phone || "",
                personType: pType,
                cpf: cpf,
                contribuinte: contribuinte,
                cnpj: cnpj,
                nomeFantasia: fantasia,
                inscricaoEstadual: ie,
                zipCode: cep,
                street: street,
                number: noNumber ? "S/N" : number,
                complement: complement,
                neighborhood: neighborhood,
                city: city,
                state: uf,
                csrf_token: token,
                notes: observacoes,
            }

            const res = supplierId
                ? await updateComprehensiveSupplierAction({ ...payload, supplierId })
                : await createComprehensiveSupplierAction(payload)

            if (res.error) {
                notifyError("Erro ao salvar: " + res.error)
            } else {
                notifySuccess(supplierId ? "Fornecedor atualizado!" : "Fornecedor cadastrado com sucesso!")
                onBack()
            }
        } catch (e) {
            console.error(e)
            notifyError("Ocorreu um erro ao salvar o fornecedor.")
        } finally {
            setIsSaving(false)
        }
    }

    const pageTitle = supplierId ? "Editar fornecedor" : "Novo fornecedor"
    const isEditLoadingLocked = Boolean(supplierId && isLoadingData)

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
                                            Preencha as informações para cadastrar o novo fornecedor
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
                                                {/* Identificação */}
                                                <section>
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Identificação</h3>
                                                    <div className="grid grid-cols-12 gap-5">
                                                        <div className="col-span-12 md:col-span-6">
                                                            <Input
                                                                label="Nome ou Razão Social"
                                                                placeholder="Ex: João da Silva ou Empresa LTDA"
                                                                value={supplierName}
                                                                onChange={(e) => {
                                                                    setSupplierName(e.target.value)
                                                                    setFieldErrors(prev => {
                                                                        const next = new Set(prev)
                                                                        next.delete("supplierName")
                                                                        return next
                                                                    })
                                                                }}
                                                                required
                                                                error={fieldErrors.has("supplierName")}
                                                                errorMessage={fieldErrors.has("supplierName") ? "O nome é obrigatório" : undefined}
                                                            />
                                                        </div>
                                                        <div className="col-span-12 md:col-span-6 mt-[1px]">
                                                            <FormDropdown
                                                                label="Status"
                                                                value={status}
                                                                setValue={(val) => setStatus(val)}
                                                                options={[
                                                                    { value: "Ativo", label: "Ativo" },
                                                                    { value: "Inativo", label: "Inativo" }
                                                                ]}
                                                            />
                                                        </div>
                                                    </div>
                                                </section>

                                                {/* Dados Tributários */}
                                                <FormSection title="Dados tributários" hasSeparator>
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
                                                                    <Input label="Inscrição Estadual" placeholder="Isento ou número da IE" value={ie} onChange={(e) => setIe(e.target.value)} />
                                                                </div>
                                                                <Input label="Nome Fantasia" placeholder="Nome comercial" value={fantasia} onChange={(e) => setFantasia(e.target.value)} />
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
                                                            </motion.div>
                                                        )}
                                                    </div>
                                                </FormSection>

                                                {/* Contato */}
                                                <FormSection title="Contato" hasSeparator>
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
                                            </FadeIn>
                                        </TabsContent>

                                        <TabsContent value="notes" className="mt-0">
                                            <FadeIn key="notes">
                                                <FormSection title="Observações">
                                                    <FormTextarea
                                                        label="Observações"
                                                        value={observacoes}
                                                        onChange={(e) => setObservacoes(e.target.value)}
                                                        placeholder="Adicione observações internas sobre este fornecedor..."
                                                        name="observacoes"
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
                                            <>
                                                <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border flex flex-col items-center text-center relative overflow-hidden">
                                                    <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Imagem do Fornecedor</h3>
                                                    <div className="w-28 h-28 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4 relative group cursor-pointer overflow-hidden border-2 border-dashed border-brand-border dark:border-dark-border hover:border-brand-dark transition-colors">
                                                        <EditIcon size={32} className="text-gray-300 group-hover:opacity-10 transition-opacity" />
                                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <span className="text-white text-sm font-bold uppercase tracking-wider">Alterar</span>
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-brand-inactive-text max-w-[200px]">Formatos aceitos: PNG, JPG ou WEBP (máx. 2MB)</p>
                                                </div>

                                                {supplierCode && (
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border mt-8 relative overflow-hidden">
                                                        <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                                                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-3 mt-2">Código do Fornecedor</h3>
                                                        <span className="text-xl font-mono font-bold text-brand-dark dark:text-dark-heading">{supplierCode}</span>
                                                    </div>
                                                )}
                                            </>
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
                                                                {supplierName || "Nome do Fornecedor"}
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
                <UnsavedChangesDialog open={showConfirmDialog} onConfirm={confirmNavigation} onCancel={cancelNavigation} />

                <SavingStatusModal isOpen={isSaving} text={supplierId ? "Salvando fornecedor..." : "Criando fornecedor..."} />
            </div>
        </FadeIn>
    )
}

export default NewSupplierPage
