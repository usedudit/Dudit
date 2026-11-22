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
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    AlertModal,
    SavingStatusModal,
    NumberInputWithCheckbox,
    MoneyInput,
    PercentageInput,
    FormSection,
    FormDropdown,
    SidebarCard,
} from "@/components/reusable"
import { BusinessHoursSelector } from "@/components/BusinessHoursSelector"
import { updatePartnerAction } from "@/app/actions/marketplace/partners"
import { updateStoreAction } from "@/app/actions/erp/stores"
import {
    getFiscalProfileAction,
    getRevenueLimitStatusAction,
    saveFiscalProfileAction,
    type FiscalEntityDto,
    type RevenueLimitStatus,
} from "@/app/actions/erp/fiscal-entity"
import { ChevronLeftIcon, SaveIcon, Store, ChevronRightIcon, UserIcon, StoreIcon, TagIcon, BriefcaseIcon, ClockIcon } from "@/lib/icons"
import PartnerCategoryModal from "./PartnerCategoryModal"
import { FiscalProfileSection, type FiscalProfileFormValue } from "./FiscalProfileSection"
import { getDefaultAnnualLimit, TAX_PROFILE_META, type TaxProfile } from "@/lib/fiscal-entity"
import { getPartnerCategoryPathClient } from "@/lib/data/partner-categories-client"
import { useNotification } from "@/hooks/use-notification"
import { useScrollToFirstError } from "@/hooks/use-scroll-to-first-error"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { FadeIn } from "@/components/animations/FadeIn"
import { normalizeOpeningHours } from "@/lib/utils/opening-hours"
import { formatE164ToDisplay } from "@/lib/utils/phone-utils"
import { validateBrazilMobile, validateCPF, validateCNPJ } from "@/lib/input-validator"
import { normalizeBusinessInfo, type BusinessMode } from "@/lib/business-info"
import { useStore } from "@/lib/store-context"
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"
import { consultarCNPJ } from "@/lib/fiscal"

const TIMEZONE_OPTIONS = [
    { value: "America/Noronha", label: "Fernando de Noronha (UTC-2)" },
    { value: "America/Sao_Paulo", label: "Brasília (UTC-3)" },
    { value: "America/Manaus", label: "Amazonas (UTC-4)" },
    { value: "America/Rio_Branco", label: "Acre (UTC-5)" },
]

const MODE_OPTIONS: Array<{
    value: BusinessMode
    icon: any
    title: string
    description: string
}> = [
        {
            value: "desapego",
            icon: TagIcon,
            title: "Anúncio Rápido / Desapego",
            description: "Vender itens pontuais, desapegos ou serviços simples sem burocracia",
        },
        {
            value: "quick",
            icon: Store,
            title: "Vitrine Online",
            description: "Crie uma vitrine com sua marca para divulgar e vender seus produtos",
        },
        {
            value: "erp",
            icon: BriefcaseIcon,
            title: "Gerenciar meu negócio",
            description: "Controle completo do seu negócio, financeiro, equipe e relatórios",
        },
    ]

export const BusinessDataSubPage = ({
    partner,
    store,
    paymentMethods,
    initialTab,
    onBack,
}: {
    partner: any
    store?: any
    paymentMethods: any[]
    /** Aba inicial (deep link ?fiscal=1). */
    initialTab?: string
    onBack: () => void
}) => {
    const { refreshStores } = useStore()
    const { success: notifySuccess, error: notifyError } = useNotification()
    const [isPending, startTransition] = useTransition()
    const [isLoading, setIsLoading] = useState(false)
    const [activeTab, setActiveTab] = useState(initialTab || "general")

    // Deep link vindo do card/notificação de limite de faturamento.
    useEffect(() => {
        if (initialTab) setActiveTab(initialTab)
    }, [initialTab])
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set())
    const [showValidationModal, setShowValidationModal] = useState(false)
    const [isSearchingCnpj, setIsSearchingCnpj] = useState(false)

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const partnerBusinessInfo = normalizeBusinessInfo(partner.business_info)
    const storeBusinessInfo = store?.business_info ? normalizeBusinessInfo(store.business_info) : null
    const effectiveBusinessInfo = storeBusinessInfo || partnerBusinessInfo

    const [generalInfo, setGeneralInfo] = useState({
        storeName: store?.name || partner.store_name || "",
        storeDescription: store?.description || partner.store_description || "",
        personType: store?.person_type || "pf",
        cnpj: store?.cpf || store?.cnpj || "",
        razaoSocial: store?.razao_social || "",
        nomeFantasia: store?.nome_fantasia || "",
        mode: ((store?.business_info?.mode || partnerBusinessInfo?.mode || "erp")) as BusinessMode,
        phone: store?.phone ? formatE164ToDisplay(store.phone) : (partner.phone ? formatE164ToDisplay(partner.phone) : ""),
        category: partner.category || "",
        categoryId: store?.category_id || partner?.category_id || null,
        subcategoryId: store?.subcategory_id || partner?.subcategory_id || null,
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

    useEffect(() => {
        if (!store?.id) return
        const fetchAddress = async () => {
            const { data: storeData } = await supabase
                .from("stores")
                .select("*, addresses!store_id(id, zip_code, street, number, complement, neighborhood, city, state, is_default, municipio_codigo_ibge)")
                .eq("id", store.id)
                .single()
            if (storeData?.addresses?.[0]) {
                const addr = storeData.addresses[0] as any
                setAddresses({
                    zipCode: addr.zip_code || "",
                    street: addr.street || "",
                    number: addr.number || "",
                    complement: addr.complement || "",
                    neighborhood: addr.neighborhood || "",
                    city: addr.city || "",
                    state: addr.state || "",
                    noNumber: addr.number === "S/N",
                    ibge: addr.municipio_codigo_ibge || "",
                    latitude: addr.latitude ?? null,
                    longitude: addr.longitude ?? null,
                })
            }
        }
        fetchAddress()
    }, [store?.id])

    // Carrega o perfil fiscal da loja (CNPJ/limite/CNAE) e o status do limite
    // anual. O perfil é a fonte da verdade, então também alinha o CRT exibido.
    useEffect(() => {
        if (!store?.id) {
            setFiscalLoading(false)
            return
        }
        let active = true
        setFiscalLoading(true)

        Promise.all([
            getFiscalProfileAction({ storeId: store.id }),
            getRevenueLimitStatusAction({ storeId: store.id }),
        ])
            .then(([profileRes, statusRes]) => {
                if (!active) return

                if (profileRes.success && profileRes.data) {
                    const dto = profileRes.data
                    // Sem limite salvo, mostra o padrão do enquadramento para o
                    // campo não aparecer zerado (o back-end aplica o mesmo padrão).
                    const defaultLimit =
                        getDefaultAnnualLimit(dto.taxProfile, new Date().getFullYear()) ?? 0
                    const nextProfile: FiscalProfileFormValue = {
                        taxProfile: dto.taxProfile,
                        cnaePrimary: dto.cnaePrimary || "",
                        cnaeSecondary: (dto.cnaeSecondary || []).join(", "),
                        annualRevenueLimit: Number(dto.annualRevenueLimit || defaultLimit),
                        openingDate: dto.openingDate ? dto.openingDate.slice(0, 10) : "",
                    }
                    const loadedCrt =
                        dto.taxProfile === "mei"
                            ? "4"
                            : dto.taxProfile === "pf_contribuinte"
                                ? "3"
                                : store.crt || ""

                    setFiscalEntity(dto)
                    setFiscalProfile(nextProfile)
                    setFiscalInfo(prev => ({ ...prev, crt: loadedCrt }))
                    // Dados vieram do banco: não podem marcar o form como sujo.
                    setInitialState(prev => ({
                        ...prev,
                        fiscalProfile: { ...nextProfile },
                        fiscalInfo: { ...prev.fiscalInfo, crt: loadedCrt },
                    }))
                }

                if (statusRes.success && statusRes.data) setRevenueStatus(statusRes.data)
            })
            .catch(() => { })
            .finally(() => {
                if (active) setFiscalLoading(false)
            })

        return () => {
            active = false
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store?.id])

    const partnerAddress = partner.addresses?.[0] || partner.address || {};
    const storeAddress = store?.addresses?.[0] || store?.address || {};
    const effectiveZip = store?.zip_code || storeAddress.zip_code || partnerAddress.zip_code || partner.zip_code || "";
    const effectiveStreet = store?.street || storeAddress.street || partnerAddress.street || partner.street || "";
    const effectiveNumber = store?.number || storeAddress.number || partnerAddress.number || partner.number || "";
    const effectiveComplement = store?.complement || storeAddress.complement || partnerAddress.complement || partner.complement || "";
    const effectiveNeighborhood = store?.neighborhood || storeAddress.neighborhood || partnerAddress.neighborhood || partner.neighborhood || "";
    const effectiveCity = store?.city || storeAddress.city || partnerAddress.city || partner.city || "";
    const effectiveState = store?.state || storeAddress.state || partnerAddress.state || partner.state || "";
    const [addresses, setAddresses] = useState({
        zipCode: effectiveZip,
        street: effectiveStreet,
        number: effectiveNumber,
        complement: effectiveComplement,
        neighborhood: effectiveNeighborhood,
        city: effectiveCity,
        state: effectiveState,
        noNumber: effectiveNumber === "S/N",
        ibge: store?.addresses?.[0]?.municipio_codigo_ibge || "",
        latitude: store?.addresses?.[0]?.latitude ?? null,
        longitude: store?.addresses?.[0]?.longitude ?? null,
    })

    const [fiscalInfo, setFiscalInfo] = useState({
        crt: store?.crt || "",
        contribuinte: store?.contribuinte || "9",
        inscricaoEstadual: store?.inscricao_estadual || "",
        ieIsento: store?.ie_isento ?? false,
        inscricaoMunicipal: store?.inscricao_municipal || "",
    })

    // Perfil fiscal é controlado por este formulário: a aba "Dados fiscais"
    // apenas edita, e o botão Salvar principal persiste tudo.
    const [fiscalProfile, setFiscalProfile] = useState<FiscalProfileFormValue>({
        taxProfile: "nao_informado",
        cnaePrimary: "",
        cnaeSecondary: "",
        annualRevenueLimit: 0,
        openingDate: "",
    })
    const [fiscalEntity, setFiscalEntity] = useState<FiscalEntityDto | null>(null)
    const [revenueStatus, setRevenueStatus] = useState<RevenueLimitStatus | null>(null)
    const [fiscalLoading, setFiscalLoading] = useState(Boolean(store?.id))

    // Regime tributário simplificado usado no DRE gerencial.
    const [taxInfo, setTaxInfo] = useState({
        simplesTaxRateProducts: Number(store?.simples_tax_rate_products || 0),
        simplesTaxRateServices: Number(store?.simples_tax_rate_services || 0),
        meiFixedTaxAmount: Number(store?.mei_fixed_tax_amount || 0),
    })

    const storeHoursObj = store?.opening_hours && typeof store.opening_hours === "object" && Object.keys(store.opening_hours).length > 0 ? store.opening_hours : null
    const partnerHoursObj = partner?.opening_hours && typeof partner.opening_hours === "object" && Object.keys(partner.opening_hours).length > 0 ? partner.opening_hours : null
    const effectiveHours = storeHoursObj || partnerHoursObj || {}

    const [hours, setHours] = useState(() => normalizeOpeningHours(effectiveHours))
    const [timezone, setTimezone] = useState<string>(store?.timezone || "America/Sao_Paulo")
    const [acceptOrdersWhenClosed, setAcceptOrdersWhenClosed] = useState<boolean>(store?.accept_orders_when_closed ?? partner?.accept_orders_when_closed ?? true)

    const [initialState, setInitialState] = useState(() => ({
        generalInfo: { ...generalInfo },
        addresses: { ...addresses },
        fiscalInfo: { ...fiscalInfo },
        fiscalProfile: { ...fiscalProfile },
        taxInfo: { ...taxInfo },
        hours: { ...hours },
        timezone: store?.timezone || "America/Sao_Paulo",
        acceptOrdersWhenClosed: store?.accept_orders_when_closed ?? partner?.accept_orders_when_closed ?? true,
    }))

    const isDirty = useMemo(() => {
        return JSON.stringify(initialState.generalInfo) !== JSON.stringify(generalInfo) ||
            JSON.stringify(initialState.addresses) !== JSON.stringify(addresses) ||
            JSON.stringify(initialState.fiscalInfo) !== JSON.stringify(fiscalInfo) ||
            JSON.stringify(initialState.fiscalProfile) !== JSON.stringify(fiscalProfile) ||
            JSON.stringify(initialState.taxInfo) !== JSON.stringify(taxInfo) ||
            JSON.stringify(initialState.hours) !== JSON.stringify(hours) ||
            initialState.timezone !== timezone ||
            initialState.acceptOrdersWhenClosed !== acceptOrdersWhenClosed
    }, [initialState, generalInfo, addresses, fiscalInfo, fiscalProfile, taxInfo, hours, timezone, acceptOrdersWhenClosed])

    const { showConfirmDialog, confirmNavigation, cancelNavigation, handleNavigation } = useUnsavedChanges(isDirty)

    const handleBack = useCallback(() => {
        handleNavigation(onBack)
    }, [handleNavigation, onBack])

    const handleCnpjBlur = useCallback(async () => {
        const cleanCnpj = generalInfo.cnpj.replace(/\D/g, "")
        if (cleanCnpj.length === 14) {
            setIsSearchingCnpj(true)
            try {
                const data = await consultarCNPJ(cleanCnpj)
                if (data && !data.error) {
                    setGeneralInfo(prev => ({
                        ...prev,
                        razaoSocial: data.razao_social || prev.razaoSocial,
                        nomeFantasia: data.nome_fantasia || prev.nomeFantasia,
                    }))
                    setAddresses(prev => {
                        if (data.logradouro && !prev.street) {
                            return {
                                ...prev,
                                street: data.logradouro || prev.street,
                                neighborhood: data.bairro || prev.neighborhood,
                                city: data.municipio || prev.city,
                                state: data.uf || prev.state,
                                zipCode: data.cep || prev.zipCode,
                            }
                        }
                        return prev
                    })

                    // A mesma consulta preenche o perfil fiscal (CNAE principal e
                    // secundários, data de abertura) e os dados tributários (CRT,
                    // contribuinte e IE quando a base retorna).
                    const secondaryCnaes = Array.isArray(data.cnae_fiscal_secundaria)
                        ? data.cnae_fiscal_secundaria.map((c: any) => String(c)).filter(Boolean)
                        : []
                    const isMei = Boolean(data.simei_optante)
                    const openingDate =
                        typeof data.data_abertura === "string" ? data.data_abertura.slice(0, 10) : ""
                    const rawStateRegistration =
                        data.inscricao_estadual != null && data.inscricao_estadual !== ""
                            ? String(data.inscricao_estadual).trim()
                            : ""
                    // Algumas bases devolvem "ISENTO" no campo da IE e outras não
                    // devolvem nada; nesse segundo caso preservamos o que o usuário
                    // já tinha informado.
                    const stateRegistrationIsExempt = /^isento$/i.test(rawStateRegistration)

                    setFiscalProfile(prev => ({
                        ...prev,
                        taxProfile: isMei ? "mei" : prev.taxProfile,
                        cnaePrimary: data.cnae_fiscal ? String(data.cnae_fiscal) : prev.cnaePrimary,
                        // A resposta é a fonte da verdade para o CNPJ consultado:
                        // limpa secundários antigos quando não houver nenhum.
                        cnaeSecondary: secondaryCnaes.join(", "),
                        // Não sobrescreve um limite personalizado já salvo: só
                        // aplica o padrão quando o perfil acabou de virar MEI.
                        annualRevenueLimit:
                            isMei && prev.taxProfile !== "mei"
                                ? (getDefaultAnnualLimit("mei", new Date().getFullYear()) ?? prev.annualRevenueLimit)
                                : prev.annualRevenueLimit,
                        openingDate: openingDate || prev.openingDate,
                    }))

                    setFiscalInfo(prev => ({
                        ...prev,
                        crt: isMei ? "4" : prev.crt,
                        // MEI é não contribuinte de ICMS por padrão.
                        contribuinte: isMei ? "9" : prev.contribuinte,
                        ...(stateRegistrationIsExempt
                            ? { inscricaoEstadual: "", ieIsento: true }
                            : rawStateRegistration
                                ? { inscricaoEstadual: rawStateRegistration, ieIsento: false }
                                : {}),
                    }))

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
    }, [generalInfo.cnpj, notifySuccess, notifyError])

    const setMode = (mode: BusinessMode) =>
        setGeneralInfo((prev: any) => ({ ...prev, mode }))

    // Troca o tipo de pessoa alinhando o documento e o perfil fiscal, para o
    // formulário legado não enviar CPF como CNPJ (ou um perfil de MEI em loja PF).
    const handlePersonTypeChange = (next: "pf" | "pj") => {
        const digits = generalInfo.cnpj.replace(/\D/g, "")
        setGeneralInfo(prev => ({
            ...prev,
            personType: next,
            cnpj:
                next === "pf" && digits.length === 14
                    ? ""
                    : next === "pj" && digits.length === 11
                        ? ""
                        : prev.cnpj,
        }))

        const year = new Date().getFullYear()
        if (next === "pf") {
            setFiscalInfo(prev => ({ ...prev, crt: "" }))
            setFiscalProfile(prev => {
                if (prev.taxProfile !== "mei" && prev.taxProfile !== "pf_contribuinte") return prev
                return {
                    ...prev,
                    taxProfile: "nano",
                    annualRevenueLimit: getDefaultAnnualLimit("nano", year) ?? 0,
                    openingDate: "",
                }
            })
        } else {
            // O público PJ suportado é o MEI (SIMEI).
            setFiscalInfo(prev => ({ ...prev, crt: prev.crt || "4" }))
            setFiscalProfile(prev => {
                if (prev.taxProfile === "mei" || prev.taxProfile === "pf_contribuinte") return prev
                return {
                    ...prev,
                    taxProfile: "mei",
                    annualRevenueLimit: getDefaultAnnualLimit("mei", year) ?? 0,
                }
            })
        }
    }

    // Troca explícita do perfil na aba Dados fiscais: define o limite padrão do
    // novo enquadramento e mantém o CRT legado coerente (MEI = 4, PF = 3).
    const handleTaxProfileChange = useCallback((next: TaxProfile) => {
        const year = new Date().getFullYear()
        const meta = TAX_PROFILE_META[next]
        setFiscalProfile(prev => ({
            ...prev,
            taxProfile: next,
            annualRevenueLimit: meta.hasRevenueLimit ? (getDefaultAnnualLimit(next, year) ?? 0) : 0,
            openingDate: next === "mei" ? prev.openingDate : "",
        }))
        setFiscalInfo(prev => ({ ...prev, crt: meta.crt ?? "" }))

        // Nano é pessoa física: CNPJ não se aplica.
        if (next === "nano") {
            setGeneralInfo(prev => {
                const digits = prev.cnpj.replace(/\D/g, "")
                return digits.length === 14 ? { ...prev, personType: "pf", cnpj: "" } : prev
            })
        }
    }, [])

    const validate = useCallback(() => {
        const errors = new Set<string>()
        if (!generalInfo.storeName.trim()) errors.add("storeName")
        if (!generalInfo.phone.trim()) {
            errors.add("phone")
        } else if (!validateBrazilMobile(generalInfo.phone)) {
            errors.add("phone")
        }

        if (generalInfo.personType === "pj" && generalInfo.cnpj && !validateCNPJ(generalInfo.cnpj)) {
            errors.add("cnpj")
        }
        if (generalInfo.personType === "pf" && generalInfo.cnpj && !validateCPF(generalInfo.cnpj)) {
            errors.add("cnpj")
        }

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
            return ["storeName", "phone", "cnpj"].filter(f => fieldErrors.has(f)).length
        }
        if (tab === "address") {
            return ["zipCode", "street", "neighborhood", "city", "state"].filter(f => fieldErrors.has(f)).length
        }
        return 0
    }, [fieldErrors])

    const { scrollToFirstError } = useScrollToFirstError({
        fieldErrors,
        REQUIRED_FIELDS: [
            { field: "storeName", tab: "general" },
            { field: "phone", tab: "general" },
            { field: "cnpj", tab: "general" },
            { field: "zipCode", tab: "address" },
            { field: "street", tab: "address" },
            { field: "neighborhood", tab: "address" },
            { field: "city", tab: "address" },
            { field: "state", tab: "address" },
        ],
        scrollContainerRef,
        activeTab,
        setActiveTab,
    })

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()

        if (!validate()) {
            scrollToFirstError()
            setShowValidationModal(true)
            return
        }

        setIsLoading(true)
        startTransition(async () => {
            try {
                const businessInfoData = {
                    mode: generalInfo.mode,
                }

                // O formulário legado ainda permite editar CNPJ/CPF. Antes de
                // salvar a loja, alinha a identidade fiscal (fonte da verdade
                // do limite) para os dois cadastros não divergirem. O perfil
                // vem da aba Dados fiscais e é persistido aqui, pelo Salvar.
                let persistedCrt: string | undefined
                let persistedProfile: FiscalProfileFormValue | undefined
                const documentDigits = generalInfo.cnpj.replace(/\D/g, "")
                const initialDocumentDigits = initialState.generalInfo.cnpj.replace(/\D/g, "")
                const documentChanged =
                    documentDigits !== initialDocumentDigits ||
                    generalInfo.personType !== initialState.generalInfo.personType
                const crtChanged = fiscalInfo.crt !== initialState.fiscalInfo.crt
                const fiscalProfileChanged =
                    JSON.stringify(fiscalProfile) !== JSON.stringify(initialState.fiscalProfile)

                if ((documentChanged || crtChanged || fiscalProfileChanged) && store?.id) {
                    const meta = TAX_PROFILE_META[fiscalProfile.taxProfile]
                    const syncRes = await saveFiscalProfileAction({
                        storeId: store.id,
                        taxProfile: fiscalProfile.taxProfile,
                        document: documentDigits || null,
                        cnaePrimary: fiscalProfile.cnaePrimary.trim() || null,
                        cnaeSecondary: fiscalProfile.cnaeSecondary
                            .split(",")
                            .map((value) => value.trim())
                            .filter(Boolean),
                        annualRevenueLimit:
                            meta.hasRevenueLimit && fiscalProfile.annualRevenueLimit > 0
                                ? fiscalProfile.annualRevenueLimit
                                : null,
                        openingDate:
                            fiscalProfile.taxProfile === "mei" ? fiscalProfile.openingDate || null : null,
                    })
                    if (!syncRes.success) {
                        notifyError(syncRes.error || "Erro ao salvar o perfil fiscal.")
                        setIsLoading(false)
                        return
                    }

                    const synced = syncRes.data
                    if (synced) {
                        const nextCrt =
                            synced.taxProfile === "mei"
                                ? "4"
                                : synced.taxProfile === "pf_contribuinte"
                                    ? "3"
                                    : ""
                        persistedCrt = nextCrt
                        const normalized: FiscalProfileFormValue = {
                            taxProfile: synced.taxProfile,
                            cnaePrimary: synced.cnaePrimary || "",
                            cnaeSecondary: (synced.cnaeSecondary || []).join(", "),
                            annualRevenueLimit: Number(synced.annualRevenueLimit || 0),
                            openingDate: synced.openingDate ? synced.openingDate.slice(0, 10) : "",
                        }
                        persistedProfile = normalized
                        setFiscalEntity(synced)
                        setFiscalProfile(normalized)
                        setFiscalInfo(prev => ({ ...prev, crt: nextCrt }))
                    }
                }

                // O perfil fiscal é a fonte da verdade do CRT; quando ele não
                // define regime (nano), limpa; em "não informado", preserva o
                // CRT legado da loja.
                const profileCrt = TAX_PROFILE_META[fiscalProfile.taxProfile].crt
                const storeCrt =
                    fiscalProfile.taxProfile === "nano"
                        ? ""
                        : profileCrt ?? fiscalInfo.crt

                // Store-level fields → updateStoreAction
                if (store?.id) {
                    const storeResult = await updateStoreAction({
                        storeId: store.id,
                        partnerId: partner.id,
                        name: generalInfo.storeName,
                        description: generalInfo.storeDescription || undefined,
                        phone: generalInfo.phone || undefined,
                        business_info: businessInfoData as any,
                        opening_hours: normalizeOpeningHours(hours) as any,
                        accept_orders_when_closed: acceptOrdersWhenClosed,
                        category_id: generalInfo.categoryId,
                        subcategory_id: generalInfo.subcategoryId,
                        zip_code: addresses.zipCode,
                        street: addresses.street,
                        number: addresses.number,
                        complement: addresses.complement,
                        neighborhood: addresses.neighborhood,
                        city: addresses.city,
                        state: addresses.state,
                        noNumber: addresses.noNumber,
                        municipioCodigoIbge: addresses.ibge || undefined,
                        latitude: addresses.latitude ?? null,
                        longitude: addresses.longitude ?? null,
                        timezone: timezone || "America/Sao_Paulo",
                        person_type: generalInfo.personType as "pf" | "pj",
                        cnpj: generalInfo.personType === "pj" ? (generalInfo.cnpj || null) : null,
                        cpf: generalInfo.personType === "pf" ? (generalInfo.cnpj || null) : null,
                        razaoSocial: generalInfo.personType === "pj" ? (generalInfo.razaoSocial || null) : null,
                        nomeFantasia: generalInfo.personType === "pj" ? (generalInfo.nomeFantasia || null) : null,
                        // persistedCrt reflete o CRT que a sincronização fiscal
                        // acabou de gravar; o state ainda pode estar atrasado.
                        crt: (persistedCrt ?? storeCrt) || undefined,
                        contribuinte: fiscalInfo.contribuinte,
                        inscricaoEstadual: fiscalInfo.inscricaoEstadual || null,
                        ieIsento: fiscalInfo.ieIsento,
                        inscricaoMunicipal: fiscalInfo.inscricaoMunicipal || null,
                        simplesTaxRateProducts: taxInfo.simplesTaxRateProducts,
                        simplesTaxRateServices: taxInfo.simplesTaxRateServices,
                        meiFixedTaxAmount: taxInfo.meiFixedTaxAmount,
                    })
                    if (!storeResult.success) {
                        notifyError(storeResult.error!)
                        setIsLoading(false)
                        return
                    }
                }

                // Partner-level fields → updatePartnerAction (address + category only)
                const partnerResult = await updatePartnerAction(partner.id, {
                    category: generalInfo.category || null,
                    categoryId: generalInfo.categoryId,
                    subcategoryId: generalInfo.subcategoryId,
                    userId: partner.user_id,
                })

                if (!partnerResult.success) {
                    notifyError(partnerResult.error!)
                    setIsLoading(false)
                } else {
                    notifySuccess("Configurações atualizadas com sucesso!")
                    await refreshStores()
                    // O limite exibido depende do faturamento/perfil recém-salvos.
                    if (store?.id) {
                        getRevenueLimitStatusAction({ storeId: store.id })
                            .then((res) => {
                                if (res.success && res.data) setRevenueStatus(res.data)
                            })
                            .catch(() => { })
                    }
                    setInitialState({
                        generalInfo: { ...generalInfo },
                        addresses: { ...addresses },
                        // Usa o CRT realmente persistido (a sincronização fiscal
                        // pode ter mudado o regime durante o save).
                        fiscalInfo: {
                            ...fiscalInfo,
                            crt: persistedCrt ?? fiscalInfo.crt,
                        },
                        fiscalProfile: persistedProfile ?? { ...fiscalProfile },
                        taxInfo: { ...taxInfo },
                        hours: { ...hours },
                        timezone: timezone || "America/Sao_Paulo",
                        acceptOrdersWhenClosed: acceptOrdersWhenClosed,
                    })
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
        <FadeIn className="h-full">
            <div className="flex flex-col h-full bg-white dark:bg-dark-background overflow-hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto custom-scrollbar w-full relative pb-20 md:pb-0">

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
                                <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
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

                                {/* Tabs Navigation */}
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
                                        <TabsTrigger value="fiscal">Dados fiscais</TabsTrigger>
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
                                                            maxLength={150}
                                                            dataField="storeName"
                                                        />
                                                    </div>
                                                    <div className="col-span-12 md:col-span-6">
                                                        <PhoneInput
                                                            label="Celular"
                                                            value={generalInfo.phone}
                                                            onChange={(e) => {
                                                                setGeneralInfo({ ...generalInfo, phone: e.target.value })
                                                                setFieldErrors(prev => { const n = new Set(prev); n.delete("phone"); return n })
                                                            }}
                                                            error={fieldErrors.has("phone")}
                                                            errorMessage={fieldErrors.has("phone") && generalInfo.phone.trim() ? "Número de celular inválido" : "Celular é obrigatório"}
                                                            dataField="phone"
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
                                            <FormSection hasSeparator title="Dados tributários">
                                                <div className="space-y-6">
                                                    <div>
                                                        <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">Tipo de pessoa</label>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <ListItem
                                                                icon={UserIcon}
                                                                title="Pessoa Física"
                                                                description="Usado para pessoas"
                                                                onClick={() => handlePersonTypeChange("pf")}
                                                                className={`px-4 py-3 gap-4 ${generalInfo.personType === "pf" ? "border-brand-green dark:border-brand-green" : ""}`}
                                                                right={
                                                                    <RadioButton
                                                                        name="personType"
                                                                        value="pf"
                                                                        checked={generalInfo.personType === "pf"}
                                                                        onChange={() => handlePersonTypeChange("pf")}
                                                                    />
                                                                }
                                                            />
                                                            <ListItem
                                                                icon={StoreIcon}
                                                                title="Pessoa Jurídica"
                                                                description="Usado para empresas"
                                                                onClick={() => handlePersonTypeChange("pj")}
                                                                className={`px-4 py-3 gap-4 ${generalInfo.personType === "pj" ? "border-brand-green dark:border-brand-green" : ""}`}
                                                                right={
                                                                    <RadioButton
                                                                        name="personType"
                                                                        value="pj"
                                                                        checked={generalInfo.personType === "pj"}
                                                                        onChange={() => handlePersonTypeChange("pj")}
                                                                    />
                                                                }
                                                            />
                                                        </div>
                                                    </div>

                                                    <motion.div initial={false} animate={{ opacity: 1 }} className="grid">
                                                        <div className="flex flex-col gap-1.5">
                                                            <CpfCnpjInput
                                                                label={generalInfo.personType === "pj" ? "CNPJ" : "CPF"}
                                                                placeholder={generalInfo.personType === "pj" ? "00.000.000/0000-00" : "000.000.000-00"}
                                                                value={generalInfo.cnpj}
                                                                onChange={(e) => {
                                                                    setGeneralInfo({ ...generalInfo, cnpj: e.target.value })
                                                                    setFieldErrors(prev => { const n = new Set(prev); n.delete("cnpj"); return n })
                                                                }}
                                                                onBlur={generalInfo.personType === "pj" ? handleCnpjBlur : undefined}
                                                                name="cnpj"
                                                                error={fieldErrors.has("cnpj")}
                                                                errorMessage={fieldErrors.has("cnpj") ? (generalInfo.personType === "pj" ? "CNPJ inválido" : "CPF inválido") : undefined}
                                                                dataField="cnpj"
                                                            />
                                                            {isSearchingCnpj ? (
                                                                <span className="text-[11px] text-brand-primary animate-pulse font-medium">Consultando CNPJ...</span>
                                                            ) : generalInfo.personType === "pj" ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={handleCnpjBlur}
                                                                    disabled={generalInfo.cnpj.replace(/\D/g, "").length !== 14}
                                                                    className="self-start text-[11px] font-bold text-brand-primary hover:underline disabled:text-brand-inactive-text disabled:no-underline dark:disabled:text-dark-body"
                                                                >
                                                                    Buscar dados do CNPJ
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                    </motion.div>

                                                    {generalInfo.personType === "pj" && (
                                                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                                <Input
                                                                    label="Razão Social"
                                                                    placeholder="Razão social da empresa"
                                                                    value={generalInfo.razaoSocial}
                                                                    onChange={(e) => setGeneralInfo({ ...generalInfo, razaoSocial: e.target.value })}
                                                                    maxLength={150}
                                                                />
                                                                <Input
                                                                    label="Nome Fantasia"
                                                                    placeholder="Nome comercial"
                                                                    value={generalInfo.nomeFantasia}
                                                                    onChange={(e) => setGeneralInfo({ ...generalInfo, nomeFantasia: e.target.value })}
                                                                    maxLength={150}
                                                                />
                                                            </div>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                                <FormDropdown
                                                                    label="CRT (Código de Regime Tributário)"
                                                                    value={fiscalInfo.crt}
                                                                    setValue={(v) => {
                                                                        setFiscalInfo(prev => ({ ...prev, crt: v }))
                                                                        // Mantém o perfil da aba Dados fiscais coerente.
                                                                        if (v === "4" && fiscalProfile.taxProfile !== "mei") {
                                                                            handleTaxProfileChange("mei")
                                                                        } else if (v === "3" && fiscalProfile.taxProfile !== "pf_contribuinte") {
                                                                            handleTaxProfileChange("pf_contribuinte")
                                                                        }
                                                                    }}
                                                                    options={[
                                                                        { value: "4", label: "4 - MEI (SIMEI)" },
                                                                        ...(fiscalInfo.crt && fiscalInfo.crt !== "4"
                                                                            ? [{ value: fiscalInfo.crt, label: `Configuração legada (CRT ${fiscalInfo.crt})` }]
                                                                            : []),
                                                                    ]}
                                                                />
                                                                <FormDropdown
                                                                    label="Contribuinte"
                                                                    value={fiscalInfo.contribuinte}
                                                                    setValue={(v) => setFiscalInfo({ ...fiscalInfo, contribuinte: v })}
                                                                    options={[
                                                                        { value: "1", label: "1 - Contribuinte de ICMS" },
                                                                        { value: "2", label: "2 - Contribuinte isento de inscrição" },
                                                                        { value: "9", label: "9 - Não contribuinte" },
                                                                    ]}
                                                                />
                                                            </div>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                                <div className="flex-1 w-full">
                                                                    <Input
                                                                        label="Inscrição Estadual (IE)"
                                                                        placeholder="Ex: 110.042.490.114"
                                                                        value={fiscalInfo.inscricaoEstadual}
                                                                        onChange={(e) => setFiscalInfo({ ...fiscalInfo, inscricaoEstadual: e.target.value })}
                                                                    />
                                                                </div>
                                                                <div className="flex-1 w-full">
                                                                    <Input
                                                                        label="Inscrição Municipal (IM)"
                                                                        placeholder="Ex: 123456"
                                                                        value={fiscalInfo.inscricaoMunicipal}
                                                                        onChange={(e) => setFiscalInfo({ ...fiscalInfo, inscricaoMunicipal: e.target.value })}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-3 pt-1">
                                                                <Checkbox
                                                                    id="ieIsento"
                                                                    checked={fiscalInfo.ieIsento}
                                                                    onChange={(e) => setFiscalInfo({ ...fiscalInfo, ieIsento: e })}
                                                                />
                                                                <label htmlFor="ieIsento" className="text-sm font-medium text-brand-dark dark:text-dark-heading cursor-pointer select-none">
                                                                    Inscrição Estadual isenta (IE Isento)
                                                                </label>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </div>
                                            </FormSection>
                                        </div>

                                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                                            <SidebarCard hasTopStrip hasSeparator title="Categoria do Negócio">
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
                                            </SidebarCard>
                                        </div>
                                    </motion.div>
                                </TabsContent>

                                <TabsContent value="fiscal" className="mt-0 focus-visible:outline-none">
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                        <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                                            {store?.id ? (
                                                <FiscalProfileSection
                                                    value={fiscalProfile}
                                                    status={revenueStatus}
                                                    loading={fiscalLoading}
                                                    sharedStoreCount={fiscalEntity?.sharedStoreIds.length ?? 0}
                                                    hasDocument={generalInfo.cnpj.replace(/\D/g, "").length === 14}
                                                    onChange={(patch) => setFiscalProfile(prev => ({ ...prev, ...patch }))}
                                                    onTaxProfileChange={handleTaxProfileChange}
                                                />
                                            ) : (
                                                <FormSection hasSeparator title="Perfil fiscal e limite de faturamento">
                                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                                                        Salve os dados do negócio para configurar o perfil fiscal.
                                                    </p>
                                                </FormSection>
                                            )}
                                        </div>

                                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                                            <SidebarCard hasTopStrip hasSeparator title="Impostos sobre faturamento (DRE)">
                                                <div className="space-y-5">
                                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                        Usado para estimar a dedução de impostos no DRE. As alíquotas do Simples têm prioridade; se informar somente o DAS-MEI (valor fixo mensal), ele será rateado por dia no período selecionado.
                                                    </p>
                                                    <PercentageInput
                                                        label="Simples Nacional - Produtos (%)"
                                                        value={taxInfo.simplesTaxRateProducts}
                                                        onChange={(v) => setTaxInfo(prev => ({ ...prev, simplesTaxRateProducts: v }))}
                                                    />
                                                    <PercentageInput
                                                        label="Simples Nacional - Serviços (%)"
                                                        value={taxInfo.simplesTaxRateServices}
                                                        onChange={(v) => setTaxInfo(prev => ({ ...prev, simplesTaxRateServices: v }))}
                                                    />
                                                    <MoneyInput
                                                        label="DAS-MEI (valor fixo mensal)"
                                                        value={taxInfo.meiFixedTaxAmount}
                                                        onChange={(v) => setTaxInfo(prev => ({ ...prev, meiFixedTaxAmount: v }))}
                                                    />
                                                </div>
                                            </SidebarCard>
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
                                                                noNumber: data.number === "S/N",
                                                                ibge: data.ibge || prev.ibge,
                                                                latitude: typeof data.latitude === "number" ? data.latitude : prev.latitude,
                                                                longitude: typeof data.longitude === "number" ? data.longitude : prev.longitude,
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
                                                        dataField="zipCode"
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
                                                        dataField="street"
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
                                                        dataField="neighborhood"
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
                                                                dataField="city"
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
                                            <SidebarCard hasTopStrip hasSeparator title="Localização">
                                                <div className="flex flex-col">
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
                                            </SidebarCard>
                                        </div>
                                    </motion.div>
                                </TabsContent>

                                <TabsContent value="hours" className="mt-0 focus-visible:outline-none">
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                        <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                                            <FormSection title="Horários de Funcionamento">
                                                <BusinessHoursSelector value={hours as any} onChange={setHours} />
                                            </FormSection>
                                        </div>

                                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                                            <SidebarCard hasTopStrip hasSeparator title="Fuso horário">
                                                <div className="space-y-2">
                                                    <FormDropdown
                                                        label="Fuso horário do negócio"
                                                        value={timezone}
                                                        setValue={setTimezone}
                                                        options={TIMEZONE_OPTIONS}
                                                    />
                                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                        Define como datas e horários de pedidos, agendamentos e relatórios são interpretados no sistema.
                                                    </p>
                                                </div>
                                            </SidebarCard>
                                        </div>
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
