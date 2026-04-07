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
    RadioButton,
    Input as FormInput,
    Checkbox as FormCheckbox
} from "@/components/reusable"
import { CepInput } from "@/components/reusable/Inputs/CepInput"
import { CpfCnpjInput } from "@/components/reusable/Inputs/CpfCnpjInput"
import { MoneyInput } from "@/components/reusable/Inputs/MoneyInput"
import { StateComboBox } from "@/components/reusable/Inputs/StateComboBox"
import { NumberInputWithCheckbox } from "@/components/reusable/Inputs/NumberInputWithCheckbox"
import { ChevronLeftIcon, SaveIcon, EditIcon } from "@/lib/icons"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { useNotification } from "@/hooks/use-notification"
import { FadeIn } from "@/components/animations/FadeIn"
import { motion, AnimatePresence } from "framer-motion"
import { createComprehensiveCustomerAction, updateComprehensiveCustomerAction, getPartnerCustomersAction } from "@/app/actions/erp/customers"
import { consultarCNPJ } from "@/lib/nuvem-fiscal"

interface NewCustomerPageProps {
    onBack: () => void;
    partnerId: string;
    customerId?: string;
    onSuccess?: (msg: string) => void;
    onError?: (msg: string) => void;
}

const NewCustomerPage: FC<NewCustomerPageProps> = ({ onBack, partnerId, customerId, onSuccess, onError }) => {
    const { success: notifySuccess, error: notifyError } = useNotification()
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
    const [observacoes, setObservacoes] = useState("")
    const [status, setStatus] = useState("Ativo")
    const [contribuinte, setContribuinte] = useState("9")

    // Address States
    const [cep, setCep] = useState("")
    const [street, setStreet] = useState("")
    const [number, setNumber] = useState("")
    const [complement, setComplement] = useState("")
    const [neighborhood, setNeighborhood] = useState("")
    const [city, setCity] = useState("")
    const [uf, setUf] = useState("SP")
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

    const isDirty = useMemo(() => {
        return customerName !== "" || fantasia !== "" || cnpj !== "" || ie !== "" || cpf !== "" || rg !== "" ||
            email !== "" || phone !== "" || mobile !== "" || website !== "" || observacoes !== "" ||
            cep !== "" || street !== "" || number !== "" || neighborhood !== "" || city !== ""
    }, [customerName, fantasia, cnpj, ie, cpf, rg, email, phone, mobile, website, observacoes, cep, street, number, neighborhood, city])

    const { showConfirmDialog: unsavedChangesDialogOpen, confirmNavigation: handleUnsavedChangesConfirm, cancelNavigation: handleUnsavedChangesDialogClose } = useUnsavedChanges(isDirty)

    const [nextAction, setNextAction] = useState<(() => void) | null>(null)
    const [showAlertModal, setShowAlertModal] = useState(false)
    const [isLoadingData, setIsLoadingData] = useState(false)

    // Fetch customer data for editing
    useEffect(() => {
        if (customerId) {
            const fetchData = async () => {
                setIsLoadingData(true)
                try {
                    const res = await getPartnerCustomersAction(partnerId)
                    if (res.customers) {
                        const c = res.customers.find((x: any) => x.id === customerId)
                        if (c) {
                            setCustomerName(c.name || "")
                            setPersonType(c.person_type === "pj" ? "Pessoa Jurídica" : "Pessoa Física")
                            setFantasia(c.nome_fantasia || "")
                            setCnpj(c.cnpj || "")
                            setIe(c.inscricao_estadual || "")
                            setCpf(c.cpf || "")
                            // ... other fields
                            setEmail(c.email || "")
                            setMobile(c.phone || "")
                            setStoreCredit(c.store_credit || 0)
                            setStatus(c.status === "ativo" ? "Ativo" : c.status === "inativo" ? "Inativo" : "Bloqueado")
                            setContribuinte(c.contribuinte || "9")
                            
                            // Address
                            setCep(c.zip_code || "")
                            setStreet(c.street || "")
                            setNumber(c.number || "")
                            setComplement(c.complement || "")
                            setNeighborhood(c.neighborhood || "")
                            setCity(c.city || "")
                            setUf(c.state || "SP")
                            setNoNumber(c.number === "S/N")
                            setObservacoes(c.notes || "")
                            setWebsite(c.website || "")
                            setRg(c.rg || "")
                            if (c.phone_fixed) setPhone(c.phone_fixed)
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
    }, [customerId, partnerId])

    const handleAttemptNav = useCallback((action: () => void) => {
        if (isDirty) { setNextAction(() => action); setShowAlertModal(true) }
        else action()
    }, [isDirty])

    const handleBack = useCallback(() => handleAttemptNav(onBack), [handleAttemptNav, onBack])

    const confirmNavigation = useCallback(() => {
        nextAction?.()
        setShowAlertModal(false)
    }, [nextAction])

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
        if (!customerName.trim()) {
            notifyError("O nome é obrigatório.")
            return
        }

        try {
            setIsSaving(true)
            const pType = personType === "Pessoa Jurídica" ? "pj" : "pf"
            const token = await getCsrfToken()
            
            const payload = {
                partnerId,
                name: customerName,
                email: email,
                phone: mobile || phone || "",
                personType: pType as "pj" | "pf",
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
                store_credit: storeCredit,
                status: status === "Ativo" ? "ativo" : status === "Inativo" ? "inativo" : "bloqueado",
                notes: observacoes
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

    const pageTitle = customerId ? "Editar Cliente" : "Novo Cliente"

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
                                    <div className="hidden md:flex items-center gap-3 flex-shrink-0 ml-3">
                                        <Button variant="outline" onClick={handleBack} disabled={isSaving}>
                                            Cancelar
                                        </Button>
                                        <Button onClick={handleSave} disabled={isSaving}>
                                            <SaveIcon className="w-5 h-5 mr-2" />
                                            {isSaving ? "Salvando..." : "Salvar"}
                                        </Button>
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="general">Dados gerais</TabsTrigger>
                                        <TabsTrigger value="address">Endereço</TabsTrigger>
                                        <TabsTrigger value="notes">Observações</TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        {/* Content Body */}
                        <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">

                                {/* Form Column */}
                                <div className={`col-span-12 ${activeTab !== 'notes' ? 'lg:col-span-8 lg:pr-12' : ''}`}>
                                    <AnimatePresence mode="wait">
                                        <TabsContent value="general" className="mt-0">
                                            <motion.div key="general" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-10">
                                                {/* Identificação */}
                                                <section>
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Identificação</h3>
                                                    <div className="grid grid-cols-12 gap-5">
                                                        <div className="col-span-12 md:col-span-8">
                                                            <FormInput
                                                                label="Nome ou Razão Social"
                                                                placeholder="Ex: João da Silva ou Empresa LTDA"
                                                                value={customerName}
                                                                onChange={(e) => setCustomerName(e.target.value)}
                                                            />
                                                        </div>
                                                        <div className="col-span-12 md:col-span-4 mt-[1px]">
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
                                                </section>

                                                <div className="h-px bg-brand-border dark:bg-dark-border w-full" />

                                                {/* Dados Tributários */}
                                                <section>
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Dados tributários</h3>
                                                    <div className="space-y-6">
                                                        <div>
                                                            <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">Tipo de pessoa</label>
                                                            <div className="flex gap-8">
                                                                <RadioButton
                                                                    name="personType"
                                                                    value="Pessoa Física"
                                                                    checked={personType === "Pessoa Física"}
                                                                    onChange={() => setPersonType("Pessoa Física")}
                                                                    label="Pessoa Física"
                                                                />
                                                                <RadioButton
                                                                    name="personType"
                                                                    value="Pessoa Jurídica"
                                                                    checked={personType === "Pessoa Jurídica"}
                                                                    onChange={() => setPersonType("Pessoa Jurídica")}
                                                                    label="Pessoa Jurídica"
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
                                                                            onChange={(e) => setCnpj(e.target.value)}
                                                                            onBlur={handleCnpjBlur}
                                                                            name="cnpj"
                                                                        />
                                                                        {isSearchingCnpj && <span className="text-[11px] text-brand-primary animate-pulse font-medium">Consultando CNPJ...</span>}
                                                                    </div>
                                                                    <FormInput label="Inscrição Estadual" placeholder="Isento ou número da IE" value={ie} onChange={(e) => setIe(e.target.value)} />
                                                                </div>
                                                                <FormInput label="Nome Fantasia" placeholder="Nome comercial" value={fantasia} onChange={(e) => setFantasia(e.target.value)} />
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
                                                                <CpfCnpjInput label="CPF" placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(e.target.value)} name="cpf" />
                                                                <FormInput label="RG" placeholder="00.000.000-0" value={rg} onChange={(e) => setRg(e.target.value)} />
                                                            </motion.div>
                                                        )}
                                                    </div>
                                                </section>

                                                <div className="h-px bg-brand-border dark:bg-dark-border w-full" />

                                                {/* Contato */}
                                                <section>
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Contato</h3>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                        <FormInput label="E-mail" type="email" placeholder="email@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                                                        <FormInput label="Celular (WhatsApp)" placeholder="(00) 00000-0000" value={mobile} onChange={(e) => setMobile(e.target.value)} />
                                                        <FormInput label="Telefone Fixo" placeholder="(00) 0000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
                                                        <FormInput label="Site" placeholder="www.site.com.br" value={website} onChange={(e) => setWebsite(e.target.value)} />
                                                    </div>
                                                </section>
                                            </motion.div>
                                        </TabsContent>

                                        <TabsContent value="address" className="mt-0">
                                            <motion.div key="address" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-10">
                                                <section>
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Endereço principal</h3>
                                                    <div className="space-y-4">
                                                        <CepInput
                                                            label="CEP"
                                                            placeholder="00000-000"
                                                            value={cep}
                                                            onChange={setCep}
                                                            name="cep"
                                                            onAddressFetched={(data) => {
                                                                setStreet(data.street)
                                                                setNeighborhood(data.neighborhood)
                                                                setCity(data.city)
                                                                setUf(data.state || "SP")
                                                            }}
                                                        />
                                                        <FormInput label="Logradouro" placeholder="Rua, Avenida, etc." value={street} onChange={e => setStreet(e.target.value)} />

                                                        <div className="grid grid-cols-2 gap-3 flex-row items-center pt-1.5 pb-1.5">
                                                            <NumberInputWithCheckbox
                                                                label="Número"
                                                                value={number}
                                                                number={number}
                                                                noNumber={noNumber}
                                                                onNumberChange={e => setNumber(e.target.value)}
                                                                onNoNumberChange={checked => { setNoNumber(checked); if (checked) setNumber(""); }}
                                                            />
                                                            <FormInput label="Complemento" placeholder="Apto, Bloco, etc." value={complement} onChange={e => setComplement(e.target.value)} />
                                                        </div>
                                                        <FormInput label="Bairro" placeholder="Nome do bairro" value={neighborhood} onChange={e => setNeighborhood(e.target.value)} />

                                                        <div className="grid grid-cols-2 gap-3 items-end">
                                                            <FormInput label="Cidade" placeholder="Nome da cidade" value={city} onChange={e => setCity(e.target.value)} />
                                                            <StateComboBox
                                                                label="Estado"
                                                                value={uf}
                                                                onChange={setUf}
                                                                className="w-full"
                                                            />
                                                        </div>
                                                    </div>
                                                </section>

                                                <div className="h-px bg-brand-border dark:bg-dark-border w-full" />

                                                <section>
                                                    <FormCheckbox
                                                        label="Endereço de cobrança diferente do principal"
                                                        checked={hasDifferentBillingAddress}
                                                        onChange={() => setHasDifferentBillingAddress(!hasDifferentBillingAddress)}
                                                        name="diffBilling"
                                                    />
                                                    {hasDifferentBillingAddress && (
                                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-8 space-y-5">
                                                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Endereço de cobrança</h3>
                                                            <div className="space-y-4">
                                                                <CepInput
                                                                    label="CEP"
                                                                    placeholder="00000-000"
                                                                    value={billingCep}
                                                                    onChange={setBillingCep}
                                                                    name="billingCep"
                                                                    onAddressFetched={(data) => {
                                                                        setBillingStreet(data.street)
                                                                        setBillingNeighborhood(data.neighborhood)
                                                                        setBillingCity(data.city)
                                                                        setBillingUf(data.state || "SP")
                                                                    }}
                                                                />
                                                                <FormInput label="Logradouro" placeholder="Rua, Avenida, etc." value={billingStreet} onChange={e => setBillingStreet(e.target.value)} />
                                                                <div className="grid grid-cols-2 gap-3 flex-row items-center">
                                                                    <NumberInputWithCheckbox
                                                                        label="Número"
                                                                        value={billingNumber}
                                                                        number={billingNumber}
                                                                        noNumber={billingNoNumber}
                                                                        onNumberChange={e => setBillingNumber(e.target.value)}
                                                                        onNoNumberChange={checked => { setBillingNoNumber(checked); if (checked) setBillingNumber(""); }}
                                                                    />
                                                                    <FormInput label="Complemento" placeholder="Apto, Bloco, etc." value={billingComplement} onChange={e => setBillingComplement(e.target.value)} />
                                                                </div>
                                                                <FormInput label="Bairro" placeholder="Nome do bairro" value={billingNeighborhood} onChange={e => setBillingNeighborhood(e.target.value)} />
                                                                <div className="grid grid-cols-2 gap-3 items-end">
                                                                    <FormInput label="Cidade" placeholder="Nome da cidade" value={billingCity} onChange={e => setBillingCity(e.target.value)} />
                                                                    <StateComboBox
                                                                        label="Estado"
                                                                        value={billingUf}
                                                                        onChange={setBillingUf}
                                                                        className="w-full"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </section>
                                            </motion.div>
                                        </TabsContent>

                                        <TabsContent value="notes" className="mt-0">
                                            <motion.div key="notes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                                <section>
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Observações</h3>
                                                    <div className="bg-gray-50 dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-5 h-[400px]">
                                                        <textarea
                                                            value={observacoes}
                                                            onChange={(e) => setObservacoes(e.target.value)}
                                                            className="w-full h-full bg-transparent border-none text-[15px] text-brand-dark dark:text-dark-heading leading-relaxed focus:outline-none resize-none placeholder:text-brand-inactive-text"
                                                            placeholder="Adicione observações internas sobre este cliente..."
                                                        />
                                                    </div>
                                                </section>
                                            </motion.div>
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
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Imagem do Cliente</h3>
                                                    <div className="w-28 h-28 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4 relative group cursor-pointer overflow-hidden border-2 border-dashed border-brand-border dark:border-dark-border hover:border-brand-dark transition-colors">
                                                        <EditIcon size={32} className="text-gray-300 group-hover:opacity-10 transition-opacity" />
                                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <span className="text-white text-sm font-bold uppercase tracking-wider">Alterar</span>
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-brand-inactive-text max-w-[200px]">Formatos aceitos: PNG, JPG ou WEBP (máx. 2MB)</p>
                                                </div>

                                                <div className="bg-white dark:bg-dark-surface p-0 rounded-2xl space-y-3 mt-8">
                                                    <MoneyInput
                                                        label="Crédito em loja"
                                                        value={storeCredit}
                                                        onChange={setStoreCredit}
                                                        placeholder="0,00"
                                                    />
                                                    <p className="text-[11px] text-brand-inactive-text leading-tight">
                                                        É o valor disponível para o cliente usar em compras futuras.
                                                    </p>
                                                </div>
                                            </>
                                        ) : activeTab === 'address' ? (
                                            <div className="bg-white dark:bg-dark-surface p-0 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden flex flex-col">
                                                <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                                                <div className="p-4 flex items-center justify-between border-b border-brand-border dark:border-dark-border mt-1 border-opacity-60">
                                                    <h3 className="font-bold text-brand-dark dark:text-dark-heading">Endereço Principal</h3>
                                                </div>
                                                <div className="p-4 flex flex-col">
                                                    <div className="w-full h-[120px] bg-gray-200 dark:bg-dark-border rounded-lg relative overflow-hidden mb-4 flex items-center justify-center cursor-pointer group" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${street}, ${number}, ${neighborhood}, ${city} - ${uf}, ${cep}`)}`, '_blank')}>
                                                        <img alt="Satelite Map" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" onError={(e) => { e.currentTarget.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" fill="rgb(229,231,235)"><rect width="100%" height="100%"/></svg>' }} />
                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                            <div className="w-5 h-5 rounded-full border-[3px] border-white bg-orange-500 shadow-sm relative z-10 transition-transform group-hover:scale-110"></div>
                                                            <div className="w-12 h-12 bg-white/30 rounded-full absolute mix-blend-overlay animate-pulse"></div>
                                                        </div>
                                                        <div className="absolute top-1.5 right-1.5 bg-white/95 px-1.5 py-0.5 rounded text-[9px] text-gray-500 font-medium">Map data ©2024</div>
                                                    </div>
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex flex-col flex-1 truncate pr-4">
                                                            <h4 className="font-bold text-brand-dark dark:text-dark-heading text-[15px] mb-1.5 truncate">{customerName || "Nome do Cliente"}</h4>
                                                            <p className="text-brand-inactive-text text-[13px] leading-snug truncate">{street ? `${street}, ${noNumber ? 'S/N' : number}` : 'Logradouro não informado'}</p>
                                                            <p className="text-brand-inactive-text text-[13px] leading-snug truncate mt-0.5">{neighborhood ? `${neighborhood}, ${city} - ${uf}` : 'Bairro/Cidade não informados'}</p>
                                                            <p className="text-brand-inactive-text text-[13px] leading-snug mt-0.5">{cep || 'CEP não informado'}</p>
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
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3">
                        <Button
                            variant="outline"
                            onClick={handleBack}
                            disabled={isSaving}
                            className="flex-1 h-[48px]"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="flex-1 h-[48px]"
                        >
                            <SaveIcon className="w-4 h-4 mr-2" />
                            {isSaving ? "Salvando..." : "Salvar"}
                        </Button>
                    </div>
                </Tabs>

                {/* Modals */}
                {unsavedChangesDialogOpen && (
                    <AlertModal
                        isOpen={unsavedChangesDialogOpen}
                        onClose={handleUnsavedChangesDialogClose}
                        onConfirm={handleUnsavedChangesConfirm}
                        title="Descartar alterações?"
                        description="Você tem alterações não salvas. Se sair agora, perderá todo o progresso deste cadastro."
                        confirmText="Sair sem salvar"
                        variant="warning"
                    />
                )}
                {showAlertModal && (
                    <AlertModal
                        isOpen
                        onClose={() => setShowAlertModal(false)}
                        onConfirm={confirmNavigation}
                        title="Descartar alterações?"
                        description="Existem dados não salvos neste formulário. Tem certeza que deseja cancelar o cadastro?"
                        confirmText="Sair sem salvar"
                        variant="warning"
                    />
                )}
            </div>
        </FadeIn>
    )
}

export default NewCustomerPage