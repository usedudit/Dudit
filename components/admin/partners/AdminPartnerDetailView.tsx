"use client"

import React, { useState, useEffect, useRef, useCallback, useTransition } from "react"
import {
    ChevronLeftIcon,
    StoreIcon,
    PackageIcon,
    ShoppingCartIcon,
    ReturnIcon,
    AlertTriangleIcon,
    ClockIcon,
    EditIcon,
    CalendarIcon,
    BlockedIcon,
    CheckCircleIcon,
    ThreeDotsIcon,
} from "@/lib/icons"
import {
    Button,
    Badge,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    ThreeDotsLoader,
    FormSection,
    IconPlaceholder,
    Pagination,
    DefaultModal,
    Input,
    ActionsDropdown,
    DropdownItem,
    SidebarCard,
    FormTextarea,
    InfoCard,
} from "@/components/reusable"
import { AdminEnforcementModal } from "../AdminEnforcementModal"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import {
    getAdminPartnerDetail,
    suspendPartner,
    unsuspendPartner,
    suspendStore,
    unsuspendStore,
    disableTenantAccess,
    enableTenantAccess,
    updateStoreRiskScore,
} from "@/app/actions/admin/enforcement"
import Link from "next/link"
import { toast } from "@/hooks/use-notification"
import { useSidebar } from "@/lib/sidebar-context"

const ITEMS_PER_PAGE = 8

const formatPersonTypeLabel = (raw?: string | null) => {
    const r = String(raw || "").trim().toUpperCase()
    const labels: Record<string, string> = {
        PJ: "Pessoa Jurídica",
        PF: "Pessoa Física",
        JURIDICA: "Pessoa Jurídica",
        FISICA: "Pessoa Física",
        "PESSOA JURÍDICA": "Pessoa Jurídica",
        "PESSOA FÍSICA": "Pessoa Física",
    }
    return labels[r] || (r || "PJ")
}

const formatReturnStatusLabel = (raw?: string | null) => {
    const s = String(raw || "").toUpperCase()
    const labels: Record<string, string> = {
        PENDING_REVIEW: "Pendente",
        PENDING: "Pendente",
        UNDER_ANALYSIS: "Em análise",
        IN_ANALYSIS: "Em análise",
        WAITING_CUSTOMER: "Aguardando cliente",
        WAITING_ITEM_RETURN: "Aguardando devolução",
        APPROVED: "Aprovada",
        COMPLETED: "Concluída",
        REJECTED: "Recusada",
        PROCESSING: "Processando",
        RESOLVED: "Concluída",
        EXPIRED: "Expirada",
        ESCALATED: "Escalada",
        cancelled: "Cancelada",
        CANCELED: "Cancelada",
    }
    return labels[s] || s || "Pendente"
}

const formatRequestTypeLabel = (raw?: string | null): string => {
    const r = String(raw || "").trim().toLowerCase()
    if (r === "exchange" || r === "troca") return "Troca"
    if (r === "refund" || r === "return" || r === "devolução" || r === "devolucao") return "Devolução"
    return r ? r.charAt(0).toUpperCase() + r.slice(1) : "Devolução"
}

interface AdminPartnerDetailViewProps {
    storeId: string
    initialData?: any
    onBack: () => void
    onPartnerUpdated?: () => void
}

export function AdminPartnerDetailView({
    storeId,
    initialData,
    onBack,
    onPartnerUpdated,
}: AdminPartnerDetailViewProps) {
    const [detail, setDetail] = useState<any>(initialData || null)
    const [isLoading, setIsLoading] = useState(!initialData)
    const [activeTab, setActiveTab] = useState("general")
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const [isPending, startTransition] = useTransition()

    // Pagination for tabs
    const [productPage, setProductPage] = useState(1)
    const [servicePage, setServicePage] = useState(1)
    const [orderPage, setOrderPage] = useState(1)
    const [returnPage, setReturnPage] = useState(1)

    // Modals
    const [suspendStoreModalOpen, setSuspendStoreModalOpen] = useState(false)
    const [unsuspendStoreModalOpen, setUnsuspendStoreModalOpen] = useState(false)
    const [disableErpModalOpen, setDisableErpModalOpen] = useState(false)
    const [enableErpModalOpen, setEnableErpModalOpen] = useState(false)
    const [suspendPartnerModalOpen, setSuspendPartnerModalOpen] = useState(false)
    const [unsuspendPartnerModalOpen, setUnsuspendPartnerModalOpen] = useState(false)
    const [riskModalOpen, setRiskModalOpen] = useState(false)
    const [newRiskScore, setNewRiskScore] = useState<string>("")
    const [riskTitle, setRiskTitle] = useState("")
    const [riskReason, setRiskReason] = useState("")

    // Header override for mobile back button
    let sidebarContext: ReturnType<typeof useSidebar> | null = null
    try {
        sidebarContext = useSidebar()
    } catch { }

    const setHeaderOverride = sidebarContext?.setHeaderOverride

    const handleScroll = useCallback(() => {
        setIsScrolled((scrollRef.current?.scrollTop || 0) > 20)
    }, [])

    const loadDetail = useCallback(async () => {
        try {
            console.log(`[AdminPartnerDetailView] Fetching partner detail for storeId: "${storeId}"`)
            setIsLoading(true)
            const data = await getAdminPartnerDetail(storeId)
            if (data && data.store) {
                console.log(`[AdminPartnerDetailView] Partner detail loaded successfully for "${data.store.name || storeId}"`, data)
                setDetail(data)
                setNewRiskScore(String(data.store?.risk_score || 0))
            } else {
                console.warn(`[AdminPartnerDetailView] Store/Partner not found in database for storeId: "${storeId}"`)
                toast.error(`Loja ou parceiro não encontrado (ID: ${storeId})`)
                setDetail(null)
            }
        } catch (err: any) {
            console.error("[AdminPartnerDetailView] Error fetching partner detail:", err)
            toast.error(`Erro ao carregar dados: ${err?.message || "Falha desconhecida"}`)
            setDetail(null)
        } finally {
            setIsLoading(false)
        }
    }, [storeId])

    useEffect(() => {
        loadDetail()
    }, [loadDetail])

    const store = detail?.store
    const storeName = store?.name || "Loja Parceira"

    useEffect(() => {
        if (!setHeaderOverride) return
        setHeaderOverride({
            title: storeName,
            onBack,
            isSubPage: true,
        })
        return () => setHeaderOverride(null)
    }, [storeName, onBack, setHeaderOverride])

    if (isLoading && !detail) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <ThreeDotsLoader />
            </div>
        )
    }

    if (!detail || !detail.store) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[450px] p-6 text-center max-w-lg mx-auto">
                <IconPlaceholder
                    icon={StoreIcon}
                    containerSize="w-16 h-16 mb-2"
                    iconSize="w-6 h-6"
                    title="Loja ou Parceiro não encontrado"
                    subtitle={`Não foi possível carregar os dados para o identificador "${storeId}". O registro pode ter sido excluído ou o ID está incorreto.`}
                    itemButton={{
                        text: "Voltar para lista",
                        action: onBack,
                        variant: "outline",
                    }}
                />
                <div className="mt-4 flex gap-2">
                    <Button variant="filled" onClick={loadDetail} size="sm">
                        Tentar Novamente
                    </Button>
                </div>
            </div>
        )
    }

    const {
        partner,
        ownerProfile,
        productsCount = 0,
        recentProducts = [],
        servicesCount = 0,
        recentServices = [],
        ordersCount = 0,
        recentOrders = [],
        returnsCount = 0,
        recentReturns = [],
        auditEvents = [],
    } = detail

    const isStoreSuspended = !!store.suspended_at || !store.is_active
    const isErpDisabled = !!partner?.erp_disabled
    const isPartnerSuspended = partner ? (!!partner.suspended_at || !partner.is_active) : false

    // Pagination calculations
    const paginatedProducts = recentProducts.slice((productPage - 1) * ITEMS_PER_PAGE, productPage * ITEMS_PER_PAGE)
    const totalProductPages = Math.ceil(recentProducts.length / ITEMS_PER_PAGE) || 1

    const paginatedServices = recentServices.slice((servicePage - 1) * ITEMS_PER_PAGE, servicePage * ITEMS_PER_PAGE)
    const totalServicePages = Math.ceil(recentServices.length / ITEMS_PER_PAGE) || 1

    const paginatedOrders = recentOrders.slice((orderPage - 1) * ITEMS_PER_PAGE, orderPage * ITEMS_PER_PAGE)
    const totalOrderPages = Math.ceil(recentOrders.length / ITEMS_PER_PAGE) || 1

    const paginatedReturns = recentReturns.slice((returnPage - 1) * ITEMS_PER_PAGE, returnPage * ITEMS_PER_PAGE)
    const totalReturnPages = Math.ceil(recentReturns.length / ITEMS_PER_PAGE) || 1

    const handleCopyStoreId = () => {
        if (!store?.id) return
        navigator.clipboard.writeText(store.id)
        toast.success("ID da loja copiado com sucesso!")
    }

    const handleCopyPartnerId = () => {
        const partnerId = store?.partner_id || detail?.partner?.id
        if (!partnerId) return
        navigator.clipboard.writeText(partnerId)
        toast.success("ID do parceiro copiado com sucesso!")
    }

    // ── Handlers: Loja Específica ──
    const handleConfirmSuspendStore = async ({ reason, durationDays, stepUpToken, riskScore, notifyOwner }: { reason: string; durationDays: number | null; stepUpToken: string; riskScore?: number | null; notifyOwner: boolean }) => {
        if (!store?.id) return
        try {
            const res = await suspendStore(store.id, reason, durationDays, stepUpToken, riskScore, notifyOwner)
            if (res.success) {
                toast.success(`Loja suspensa com sucesso! ${res.caseId ? `Protocolo: ${res.caseId}` : ""}`)
                setSuspendStoreModalOpen(false)
                loadDetail()
                onPartnerUpdated?.()
            } else {
                toast.error(res.error || "Erro ao suspender loja")
            }
            return res
        } catch (err: any) {
            if (err?.message === "NEXT_REDIRECT" || err?.digest?.includes?.("NEXT_REDIRECT")) {
                throw err
            }
            toast.error(err.message || "Erro inesperado")
            throw err
        }
    }

    const handleConfirmUnsuspendStore = async ({ reason, stepUpToken, riskScore, notifyOwner }: { reason: string; durationDays: number | null; stepUpToken: string; riskScore?: number | null; notifyOwner: boolean }) => {
        if (!store?.id) return
        try {
            const res = await unsuspendStore(store.id, reason, stepUpToken, riskScore, notifyOwner)
            if (res.success) {
                toast.success("Loja reativada com sucesso!")
                setUnsuspendStoreModalOpen(false)
                loadDetail()
                onPartnerUpdated?.()
            } else {
                toast.error(res.error || "Erro ao reativar loja")
            }
            return res
        } catch (err: any) {
            if (err?.message === "NEXT_REDIRECT" || err?.digest?.includes?.("NEXT_REDIRECT")) {
                throw err
            }
            toast.error(err.message || "Erro inesperado")
            throw err
        }
    }

    // ── Handlers: Acesso ao ERP (Tenant) ──
    const handleConfirmDisableERP = async ({ reason, durationDays, stepUpToken, riskScore, notifyOwner }: { reason: string; durationDays: number | null; stepUpToken: string; riskScore?: number | null; notifyOwner: boolean }) => {
        const partnerId = store?.partner_id || partner?.id
        if (!partnerId) return
        try {
            const res = await disableTenantAccess(partnerId, reason, durationDays, stepUpToken, riskScore, notifyOwner)
            if (res.success) {
                toast.success(`Acesso ao ERP desativado! ${res.caseId ? `Protocolo: ${res.caseId}` : ""}`)
                setDisableErpModalOpen(false)
                loadDetail()
                onPartnerUpdated?.()
            } else {
                toast.error(res.error || "Erro ao desativar ERP")
            }
            return res
        } catch (err: any) {
            if (err?.message === "NEXT_REDIRECT" || err?.digest?.includes?.("NEXT_REDIRECT")) {
                throw err
            }
            toast.error(err.message || "Erro inesperado")
            throw err
        }
    }

    const handleConfirmEnableERP = async ({ reason, stepUpToken, riskScore, notifyOwner }: { reason: string; durationDays: number | null; stepUpToken: string; riskScore?: number | null; notifyOwner: boolean }) => {
        const partnerId = store?.partner_id || partner?.id
        if (!partnerId) return
        try {
            const res = await enableTenantAccess(partnerId, reason, stepUpToken, riskScore, notifyOwner)
            if (res.success) {
                toast.success("Acesso ao ERP restabelecido com sucesso!")
                setEnableErpModalOpen(false)
                loadDetail()
                onPartnerUpdated?.()
            } else {
                toast.error(res.error || "Erro ao reativar ERP")
            }
            return res
        } catch (err: any) {
            if (err?.message === "NEXT_REDIRECT" || err?.digest?.includes?.("NEXT_REDIRECT")) {
                throw err
            }
            toast.error(err.message || "Erro inesperado")
            throw err
        }
    }

    // ── Handlers: Parceiro Completo ──
    const handleConfirmSuspendPartner = async ({ reason, durationDays, stepUpToken, riskScore, notifyOwner }: { reason: string; durationDays: number | null; stepUpToken: string; riskScore?: number | null; notifyOwner: boolean }) => {
        const partnerId = store?.partner_id || partner?.id
        if (!partnerId) return
        try {
            const res = await suspendPartner(partnerId, reason, durationDays, stepUpToken, riskScore, notifyOwner)
            if (res.success) {
                toast.success(`Parceiro e todas as lojas suspensos! ${res.caseId ? `Protocolo: ${res.caseId}` : ""}`)
                setSuspendPartnerModalOpen(false)
                loadDetail()
                onPartnerUpdated?.()
            } else {
                toast.error(res.error || "Erro ao suspender parceiro")
            }
            return res
        } catch (err: any) {
            if (err?.message === "NEXT_REDIRECT" || err?.digest?.includes?.("NEXT_REDIRECT")) {
                throw err
            }
            toast.error(err.message || "Erro inesperado")
            throw err
        }
    }

    const handleConfirmUnsuspendPartner = async ({ reason, stepUpToken, riskScore, notifyOwner }: { reason: string; durationDays: number | null; stepUpToken: string; riskScore?: number | null; notifyOwner: boolean }) => {
        const partnerId = store?.partner_id || partner?.id
        if (!partnerId) return
        try {
            const res = await unsuspendPartner(partnerId, reason, stepUpToken, riskScore, notifyOwner)
            if (res.success) {
                toast.success("Parceiro e lojas reativados com sucesso!")
                setUnsuspendPartnerModalOpen(false)
                loadDetail()
                onPartnerUpdated?.()
            } else {
                toast.error(res.error || "Erro ao reativar parceiro")
            }
            return res
        } catch (err: any) {
            if (err?.message === "NEXT_REDIRECT" || err?.digest?.includes?.("NEXT_REDIRECT")) {
                throw err
            }
            toast.error(err.message || "Erro inesperado")
            throw err
        }
    }

    const handleSaveRiskScore = () => {
        const scoreNum = parseInt(newRiskScore, 10)
        if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
            toast.error("Insira uma pontuação válida entre 0 e 100")
            return
        }

        startTransition(async () => {
            try {
                const res = await updateStoreRiskScore(store.id, scoreNum, riskReason, riskTitle || undefined)
                if (res.success) {
                    toast.success("Score de risco atualizado e notificação enviada!")
                    setRiskModalOpen(false)
                    setRiskTitle("")
                    setRiskReason("")
                    loadDetail()
                    onPartnerUpdated?.()
                } else {
                    toast.error(res.error || "Erro ao atualizar score de risco")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    return (
        <>
            <FadeIn>
                <div className="flex flex-col bg-white dark:bg-dark-background min-h-screen">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 lg:pb-0">

                            {/* Sticky Header */}
                            <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                                <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                    {/* Back button - desktop only */}
                                    <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                        <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                            <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                        </Button>
                                    </div>

                                    {/* Title row - desktop */}
                                    <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                        <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                            <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                                <span className="hidden md:inline truncate">{store.name}</span>
                                                <Badge variant={isStoreSuspended ? "red" : "green"}>
                                                    {isStoreSuspended ? "Loja Suspensa" : "Loja Ativa"}
                                                </Badge>
                                                {isErpDisabled && (
                                                    <Badge variant="red">
                                                        ERP Desativado
                                                    </Badge>
                                                )}
                                                {isPartnerSuspended && (
                                                    <Badge variant="red">
                                                        Parceiro Suspenso
                                                    </Badge>
                                                )}
                                                <Badge variant={store.risk_score >= 50 ? "red" : store.risk_score >= 25 ? "orange" : "gray"}>
                                                    Risco: {store.risk_score || 0} pts
                                                </Badge>
                                            </h1>

                                            <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                                Responsável: {ownerProfile?.full_name || "Lojista"} • {ownerProfile?.email || "Sem e-mail"}
                                            </div>
                                        </div>

                                        {/* Desktop action buttons */}
                                        <div className="hidden md:flex items-center gap-2.5 shrink-0 ml-3">
                                            <Button
                                                variant="outline"
                                                onClick={() => {
                                                    setNewRiskScore(String(store.risk_score || 0))
                                                    setRiskModalOpen(true)
                                                }}
                                                leftIcon={<EditIcon size={16} />}
                                            >
                                                Score de Risco
                                            </Button>

                                            {/* Ação direta: Suspender / Reativar Esta Loja */}
                                            {isStoreSuspended ? (
                                                <Button
                                                    variant="outline"
                                                    onClick={() => setUnsuspendStoreModalOpen(true)}
                                                    className="text-brand-green border-brand-green/30 hover:bg-brand-green/10"
                                                >
                                                    Reativar Loja
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant="destructive"
                                                    onClick={() => setSuspendStoreModalOpen(true)}
                                                >
                                                    Suspender Loja
                                                </Button>
                                            )}

                                            {/* Dropdown de Ações Administrativas (ERP / Parceiro) */}
                                            <ActionsDropdown>
                                                {isErpDisabled ? (
                                                    <DropdownItem
                                                        onClick={() => setEnableErpModalOpen(true)}
                                                    >
                                                        <CheckCircleIcon size={16} className="text-brand-green" /> Reativar Acesso ao ERP
                                                    </DropdownItem>
                                                ) : (
                                                    <DropdownItem
                                                        onClick={() => setDisableErpModalOpen(true)}
                                                        className="text-brand-red"
                                                    >
                                                        <BlockedIcon size={16} className="text-brand-red" /> Desativar Acesso ao ERP
                                                    </DropdownItem>
                                                )}

                                                {isPartnerSuspended ? (
                                                    <DropdownItem
                                                        onClick={() => setUnsuspendPartnerModalOpen(true)}
                                                    >
                                                        <CheckCircleIcon size={16} className="text-brand-green" /> Reativar Parceiro Inteiro
                                                    </DropdownItem>
                                                ) : (
                                                    <DropdownItem
                                                        onClick={() => setSuspendPartnerModalOpen(true)}
                                                        className="text-brand-red"
                                                    >
                                                        <AlertTriangleIcon size={16} className="text-brand-red" /> Suspender Parceiro (Todas as Lojas)
                                                    </DropdownItem>
                                                )}
                                            </ActionsDropdown>
                                        </div>
                                    </div>

                                    {/* Tabs */}
                                    <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                            <TabsTrigger value="general">Dados da Loja</TabsTrigger>
                                            <TabsTrigger value="products">Produtos ({productsCount || recentProducts.length})</TabsTrigger>
                                            <TabsTrigger value="services">Serviços ({servicesCount || recentServices.length})</TabsTrigger>
                                            <TabsTrigger value="orders">Pedidos ({ordersCount || recentOrders.length})</TabsTrigger>
                                            <TabsTrigger value="returns">Devoluções ({returnsCount || recentReturns.length})</TabsTrigger>
                                            <TabsTrigger value="audit">Auditoria & Risco ({auditEvents.length})</TabsTrigger>
                                        </TabsList>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                                {/* Aba 1: Dados da Loja */}
                                <TabsContent value="general" className="mt-0">
                                    <FadeIn key="general">
                                        {/* Banner: ERP Desativado */}
                                        {isErpDisabled && (
                                            <InfoCard
                                                title="Acesso ao ERP Desativado (Conta do Parceiro)"
                                                message={`Motivo: ${partner?.suspended_reason || "Sem motivo informado."}${partner?.suspended_until ? ` • Vigência até: ${formatDate(partner.suspended_until)}` : " • Permanente"}`}
                                                color="orange"
                                                bottomElement={
                                                    partner?.suspended_case_id && (
                                                        <Button
                                                            variant="link"
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(partner.suspended_case_id)
                                                                toast.success("Protocolo do caso copiado!")
                                                            }}
                                                        >
                                                            <span>
                                                                Caso: {partner.suspended_case_id}
                                                            </span>
                                                            <span className="text-sm uppercase font-semibold">
                                                                Copiar
                                                            </span>
                                                        </Button>
                                                    )
                                                }
                                            />
                                        )}
                                        {/* Banner: Loja Suspensa */}
                                        {isStoreSuspended && (
                                            <InfoCard
                                                title="Loja Suspensa Administrativamente"
                                                message={`Motivo: ${store.suspended_reason || partner?.suspended_reason || "Sem motivo especificado."}`}
                                                color="red"
                                                bottomElement={
                                                    (store.suspended_case_id || partner?.suspended_case_id) && (
                                                        <Button
                                                            variant="link"
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(
                                                                    store.suspended_case_id || partner?.suspended_case_id
                                                                )
                                                                toast.success("Protocolo do caso copiado!")
                                                            }}
                                                        >
                                                            <span>
                                                                Caso: {store.suspended_case_id || partner?.suspended_case_id}
                                                            </span>
                                                            <span className="text-sm uppercase font-semibold">
                                                                Copiar
                                                            </span>
                                                        </Button>
                                                    )
                                                }
                                            />
                                        )}

                                        <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                            {/* Coluna principal */}
                                            <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                <FormSection title="Informações Cadastrais">
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                                        <div>
                                                            <span className="text-xs font-semibold text-brand-inactive-text block">Nome Comercial</span>
                                                            <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block">{store.name}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-xs font-semibold text-brand-inactive-text block">Tipo de Pessoa</span>
                                                            <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block">
                                                                {formatPersonTypeLabel(store.person_type)}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <span className="text-xs font-semibold text-brand-inactive-text block">Telefone</span>
                                                            <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block">
                                                                {store.phone || "Não informado"}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <span className="text-xs font-semibold text-brand-inactive-text block">Criado em</span>
                                                            <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block">
                                                                {formatDate(store.created_at)}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <span className="text-xs font-semibold text-brand-inactive-text block">ID da Loja (UUID)</span>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className="font-mono text-xs text-brand-dark dark:text-dark-heading select-all truncate">{store.id || "-"}</span>
                                                                {store.id && <button onClick={handleCopyStoreId} className="text-xs font-bold text-brand-green hover:underline shrink-0">Copiar</button>}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <span className="text-xs font-semibold text-brand-inactive-text block">ID do Parceiro (Tenant)</span>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className="font-mono text-xs text-brand-dark dark:text-dark-heading select-all truncate">{store.partner_id || "-"}</span>
                                                                {store.partner_id && <button onClick={handleCopyPartnerId} className="text-xs font-bold text-brand-green hover:underline shrink-0">Copiar</button>}
                                                            </div>
                                                        </div>
                                                        <div className="sm:col-span-2">
                                                            <span className="text-xs font-semibold text-brand-inactive-text block">Descrição</span>
                                                            <p className="text-sm text-brand-dark dark:text-dark-heading mt-0.5">
                                                                {store.description || "Sem descrição informada."}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </FormSection>
                                            </div>

                                            {/* Sidebar */}
                                            <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border space-y-6">
                                                <SidebarCard hasTopStrip hasSeparator title="Proprietário / Titular">
                                                    <div className="flex items-center gap-3">
                                                        <UserProfileImage
                                                            fullName={ownerProfile?.full_name || "Proprietário"}
                                                            imageUrl={ownerProfile?.avatar_url}
                                                            className="w-12 h-12 text-lg shrink-0"
                                                        />
                                                        <div className="min-w-0">
                                                            <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading truncate">
                                                                {ownerProfile?.full_name || "Lojista"}
                                                            </h3>
                                                            <span className="text-xs text-brand-inactive-text truncate block">
                                                                {ownerProfile?.email || "Sem e-mail"}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {partner?.user_id && (
                                                        <div className="pt-3 mt-3 border-t border-brand-border dark:border-dark-border">
                                                            <Link
                                                                href={`/ddt-admin/users?view=${partner.user_id}`}
                                                                className="text-xs font-bold text-brand-green hover:underline"
                                                            >
                                                                Ver perfil completo do usuário →
                                                            </Link>
                                                        </div>
                                                    )}
                                                </SidebarCard>

                                                <SidebarCard hasSeparator hasTopStrip title="Avaliação de Risco">
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-brand-inactive-text">Score Atual</span>
                                                        <Badge variant={store.risk_score >= 50 ? "red" : store.risk_score >= 25 ? "orange" : "gray"}>
                                                            {store.risk_score || 0} pts
                                                        </Badge>
                                                    </div>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            setNewRiskScore(String(store.risk_score || 0))
                                                            setRiskModalOpen(true)
                                                        }}
                                                        className="w-full mt-4 text-xs"
                                                    >
                                                        Ajustar Score
                                                    </Button>
                                                </SidebarCard>

                                                <SidebarCard hasSeparator hasTopStrip title="Identificadores">
                                                    <div className="space-y-2 text-xs">
                                                        {(store.suspended_case_id || partner?.suspended_case_id) && (
                                                            <div className="pt-2 border-t border-brand-border dark:border-dark-border">
                                                                <span className="text-brand-inactive-text block">Protocolo do Caso</span>
                                                                <div className="flex items-center justify-between mt-0.5">
                                                                    <span className="font-mono font-bold text-red-600 dark:text-red-400">{store.suspended_case_id || partner?.suspended_case_id}</span>
                                                                    <button
                                                                        onClick={() => {
                                                                            navigator.clipboard.writeText(store.suspended_case_id || partner?.suspended_case_id)
                                                                            toast.success("Protocolo copiado!")
                                                                        }}
                                                                        className="text-brand-green font-bold hover:underline"
                                                                    >
                                                                        Copiar
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </SidebarCard>
                                            </div>
                                        </div>
                                    </FadeIn>
                                </TabsContent>

                                {/* Aba 2: Produtos */}
                                <TabsContent value="products" className="mt-0">
                                    <FadeIn key="products">
                                        <FormSection title={`Produtos Cadastrados (${recentProducts.length})`}>
                                            {recentProducts.length === 0 ? (
                                                <IconPlaceholder
                                                    icon={PackageIcon}
                                                    containerSize="w-14 h-14 mb-2"
                                                    iconSize="w-6 h-6"
                                                    title="Nenhum produto cadastrado"
                                                    subtitle="Esta loja ainda não possui produtos no catálogo."
                                                />
                                            ) : (
                                                <div className="space-y-4">
                                                    {/* Desktop Table */}
                                                    <div className="hidden md:block overflow-x-auto custom-scrollbar">
                                                        <table className="w-full text-left border-separate border-spacing-0">
                                                            <thead>
                                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                    <th className="py-3 px-3 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body">Produto</th>
                                                                    <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body">SKU</th>
                                                                    <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Estoque</th>
                                                                    <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Preço</th>
                                                                    <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Status</th>
                                                                    <th className="py-3 px-3 pr-4 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Ações</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {paginatedProducts.map((p: any) => (
                                                                    <tr key={p.id} className="border-b border-brand-border dark:border-dark-border">
                                                                        <td className="py-3 px-3 flex items-center gap-3">
                                                                            <div className="w-10 h-10 rounded-lg bg-brand-gray dark:bg-dark-border/30 flex items-center justify-center overflow-hidden shrink-0">
                                                                                {p.images ? (
                                                                                    <img src={getR2ImageUrl(p.images)} alt="" className="w-full h-full object-cover" />
                                                                                ) : (
                                                                                    <PackageIcon className="w-5 h-5 text-brand-inactive-text" />
                                                                                )}
                                                                            </div>
                                                                            <span className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                                                {p.name}
                                                                            </span>
                                                                        </td>
                                                                        <td className="py-3 px-3 text-xs text-brand-inactive-text font-mono">
                                                                            {p.sku || "-"}
                                                                        </td>
                                                                        <td className="py-3 px-3 text-sm text-center font-semibold">
                                                                            {p.stock_quantity ?? "-"}
                                                                        </td>
                                                                        <td className="py-3 px-3 text-sm text-center font-bold text-brand-green">
                                                                            {formatCurrency(Number(p.price || 0))}
                                                                        </td>
                                                                        <td className="py-3 px-3 pr-4 text-center">
                                                                            <Badge variant={p.is_active ? "green" : "gray"}>
                                                                                {p.is_active ? "Ativo" : "Inativo"}
                                                                            </Badge>
                                                                        </td>
                                                                        <td className="py-3 px-3 pr-4 text-center">
                                                                            <Link
                                                                                href={`/ddt-admin/catalog/products/${p.id}`}
                                                                                className="text-xs font-bold text-brand-green hover:underline"
                                                                            >
                                                                                Ver Produto →
                                                                            </Link>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    {/* Mobile Cards */}
                                                    <div className="md:hidden divide-y divide-brand-border dark:divide-dark-border">
                                                        {paginatedProducts.map((p: any) => (
                                                            <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                                                                <div className="flex items-center gap-3 min-w-0">
                                                                    <div className="w-10 h-10 rounded-lg bg-brand-gray dark:bg-dark-border/30 flex items-center justify-center overflow-hidden shrink-0">
                                                                        {p.images ? (
                                                                            <img src={getR2ImageUrl(p.images)} alt="" className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <PackageIcon className="w-5 h-5 text-brand-inactive-text" />
                                                                        )}
                                                                    </div>
                                                                    <div className="min-w-0 flex flex-col">
                                                                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{p.name}</span>
                                                                        <span className="text-xs text-brand-inactive-text">Estoque: {p.stock_quantity ?? "-"}</span>
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-col items-end gap-1 shrink-0">
                                                                    <span className="font-bold text-sm text-brand-green">{formatCurrency(Number(p.price || 0))}</span>
                                                                    <Link href={`/ddt-admin/catalog/products/${p.id}`} className="text-xs text-brand-green font-semibold">Ver →</Link>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {totalProductPages > 1 && (
                                                        <div className="pt-4">
                                                            <Pagination currentPage={productPage} totalPages={totalProductPages} onPageChange={setProductPage} fixedUntil="lg" />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </FormSection>
                                    </FadeIn>
                                </TabsContent>

                                {/* Aba 3: Serviços */}
                                <TabsContent value="services" className="mt-0">
                                    <FadeIn key="services">
                                        <FormSection title={`Serviços Cadastrados (${recentServices.length})`}>
                                            {recentServices.length === 0 ? (
                                                <IconPlaceholder
                                                    icon={CalendarIcon}
                                                    containerSize="w-14 h-14 mb-2"
                                                    iconSize="w-6 h-6"
                                                    title="Nenhum serviço cadastrado"
                                                    subtitle="Esta loja ainda não possui serviços disponíveis para agendamento."
                                                />
                                            ) : (
                                                <div className="space-y-4">
                                                    <div className="hidden md:block overflow-x-auto custom-scrollbar">
                                                        <table className="w-full text-left border-separate border-spacing-0">
                                                            <thead>
                                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                    <th className="py-3 px-3 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body">Serviço</th>
                                                                    <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Preço</th>
                                                                    <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Criado em</th>
                                                                    <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Status</th>
                                                                    <th className="py-3 px-3 pr-4 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Ações</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {paginatedServices.map((s: any) => (
                                                                    <tr key={s.id} className="border-b border-brand-border dark:border-dark-border">
                                                                        <td className="py-3 px-3 font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                                            {s.name}
                                                                        </td>
                                                                        <td className="py-3 px-3 text-sm text-center font-bold text-brand-green">
                                                                            {formatCurrency(Number(s.price || 0))}
                                                                        </td>
                                                                        <td className="py-3 px-3 text-xs text-center text-brand-inactive-text">
                                                                            {formatDate(s.created_at)}
                                                                        </td>
                                                                        <td className="py-3 px-3 pr-4 text-center">
                                                                            <Badge variant={s.is_active ? "green" : "gray"}>
                                                                                {s.is_active ? "Ativo" : "Inativo"}
                                                                            </Badge>
                                                                        </td>
                                                                        <td className="py-3 px-3 pr-4 text-center">
                                                                            <Link
                                                                                href={`/ddt-admin/catalog/services/${s.id}`}
                                                                                className="text-xs font-bold text-brand-green hover:underline"
                                                                            >
                                                                                Ver Serviço →
                                                                            </Link>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    <div className="md:hidden divide-y divide-brand-border dark:divide-dark-border">
                                                        {paginatedServices.map((s: any) => (
                                                            <div key={s.id} className="py-3 flex items-center justify-between gap-3">
                                                                <div className="min-w-0 flex flex-col">
                                                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{s.name}</span>
                                                                    <span className="text-xs text-brand-inactive-text">{formatDate(s.created_at)}</span>
                                                                </div>
                                                                <div className="flex flex-col items-end gap-1 shrink-0">
                                                                    <span className="font-bold text-sm text-brand-green">{formatCurrency(Number(s.price || 0))}</span>
                                                                    <Link href={`/ddt-admin/catalog/services/${s.id}`} className="text-xs text-brand-green font-semibold">Ver →</Link>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {totalServicePages > 1 && (
                                                        <div className="pt-4">
                                                            <Pagination currentPage={servicePage} totalPages={totalServicePages} onPageChange={setServicePage} fixedUntil="lg" />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </FormSection>
                                    </FadeIn>
                                </TabsContent>

                                {/* Aba 4: Pedidos */}
                                <TabsContent value="orders" className="mt-0">
                                    <FadeIn key="orders">
                                        <FormSection title={`Vendas Registradas (${recentOrders.length})`}>
                                            {recentOrders.length === 0 ? (
                                                <IconPlaceholder
                                                    icon={ShoppingCartIcon}
                                                    containerSize="w-14 h-14 mb-2"
                                                    iconSize="w-6 h-6"
                                                    title="Nenhuma venda registrada"
                                                    subtitle="Esta loja ainda não realizou vendas na plataforma."
                                                />
                                            ) : (
                                                <div className="space-y-4">
                                                    <div className="hidden md:block overflow-x-auto custom-scrollbar">
                                                        <table className="w-full text-left border-separate border-spacing-0">
                                                            <thead>
                                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                    <th className="py-3 px-3 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body">Pedido</th>
                                                                    <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body">Cliente</th>
                                                                    <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body">Canal</th>
                                                                    <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Total</th>
                                                                    <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Status</th>
                                                                    <th className="py-3 px-3 pr-4 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Ações</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {paginatedOrders.map((o: any) => (
                                                                    <tr key={o.id} className="border-b border-brand-border dark:border-dark-border">
                                                                        <td className="py-3 px-3 font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                                            #{o.order_number || (o.id ? o.id.slice(0, 8) : "")}
                                                                        </td>
                                                                        <td className="py-3 px-3 text-sm text-brand-dark dark:text-dark-heading truncate">
                                                                            {o.customer_name || "Cliente"}
                                                                        </td>
                                                                        <td className="py-3 px-3 text-xs text-brand-inactive-text">
                                                                            {o.order_source || "Marketplace"}
                                                                        </td>
                                                                        <td className="py-3 px-3 text-sm text-center font-bold text-brand-green">
                                                                            {formatCurrency(Number(o.total_amount || o.paid_amount || 0))}
                                                                        </td>
                                                                        <td className="py-3 px-3 text-center">
                                                                            <Badge variant={o.situation === "paid" ? "green" : o.situation === "cancelled" ? "red" : "orange"}>
                                                                                {o.situation === "paid" ? "Pago" : o.situation === "cancelled" ? "Cancelado" : "Pendente"}
                                                                            </Badge>
                                                                        </td>
                                                                        <td className="py-3 px-3 pr-4 text-center">
                                                                            <Link
                                                                                href={`/ddt-admin/orders?view=${o.id}`}
                                                                                className="text-xs font-bold text-brand-green hover:underline"
                                                                            >
                                                                                Ver Pedido →
                                                                            </Link>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    <div className="md:hidden divide-y divide-brand-border dark:divide-dark-border">
                                                        {paginatedOrders.map((o: any) => (
                                                            <div key={o.id} className="py-3 flex items-center justify-between gap-3">
                                                                <div className="min-w-0 flex flex-col">
                                                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">#{o.order_number || (o.id ? o.id.slice(0, 8) : "")}</span>
                                                                    <span className="text-xs text-brand-inactive-text">{o.customer_name || "Cliente"}</span>
                                                                </div>
                                                                <div className="flex flex-col items-end gap-1 shrink-0">
                                                                    <span className="font-bold text-sm text-brand-green">{formatCurrency(Number(o.total_amount || 0))}</span>
                                                                    <Link href={`/ddt-admin/orders?view=${o.id}`} className="text-xs text-brand-green font-semibold">Ver →</Link>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {totalOrderPages > 1 && (
                                                        <div className="pt-4">
                                                            <Pagination currentPage={orderPage} totalPages={totalOrderPages} onPageChange={setOrderPage} fixedUntil="lg" />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </FormSection>
                                    </FadeIn>
                                </TabsContent>

                                {/* Aba 5: Devoluções */}
                                <TabsContent value="returns" className="mt-0">
                                    <FadeIn key="returns">
                                        <FormSection title={`Solicitações de Troca & Devolução (${recentReturns.length})`}>
                                            {recentReturns.length === 0 ? (
                                                <IconPlaceholder
                                                    icon={ReturnIcon}
                                                    containerSize="w-14 h-14 mb-2"
                                                    iconSize="w-6 h-6"
                                                    title="Nenhum devolução registrada"
                                                    subtitle="Esta loja não possui pós-vendas ou disputas em andamento."
                                                />
                                            ) : (
                                                <div className="space-y-4">
                                                    <div className="hidden md:block overflow-x-auto custom-scrollbar">
                                                        <table className="w-full text-left border-separate border-spacing-0">
                                                            <thead>
                                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                    <th className="py-3 px-3 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body">Solicitação</th>
                                                                    <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body">Cliente</th>
                                                                    <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Tipo</th>
                                                                    <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Reembolso</th>
                                                                    <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Status</th>
                                                                    <th className="py-3 px-3 pr-4 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Ações</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {paginatedReturns.map((r: any) => (
                                                                    <tr key={r.id} className="border-b border-brand-border dark:border-dark-border">
                                                                        <td className="py-3 px-3 font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                                            #{r.id ? r.id.slice(0, 8) : ""}
                                                                        </td>
                                                                        <td className="py-3 px-3 text-sm text-brand-dark dark:text-dark-heading truncate">
                                                                            {r.customer_name_snapshot || "Consumidor"}
                                                                        </td>
                                                                        <td className="py-3 px-3 text-center">
                                                                            <Badge variant="blue">
                                                                                {formatRequestTypeLabel(r.request_type)}
                                                                            </Badge>
                                                                        </td>
                                                                        <td className="py-3 px-3 text-sm text-center font-bold text-brand-green">
                                                                            {formatCurrency(Number(r.refund_amount || 0))}
                                                                        </td>
                                                                        <td className="py-3 px-3 text-center">
                                                                            <Badge variant={r.status === "approved" || r.status === "completed" ? "green" : r.status === "rejected" ? "red" : "orange"}>
                                                                                {formatReturnStatusLabel(r.status)}
                                                                            </Badge>
                                                                        </td>
                                                                        <td className="py-3 px-3 pr-4 text-center">
                                                                            <Link
                                                                                href={`/ddt-admin/returns?view=${r.id}`}
                                                                                className="text-xs font-bold text-brand-green hover:underline"
                                                                            >
                                                                                Ver Devolução →
                                                                            </Link>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    <div className="md:hidden divide-y divide-brand-border dark:divide-dark-border">
                                                        {paginatedReturns.map((r: any) => (
                                                            <div key={r.id} className="py-3 flex items-center justify-between gap-3">
                                                                <div className="min-w-0 flex flex-col">
                                                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">#{r.id ? r.id.slice(0, 8) : ""}</span>
                                                                    <span className="text-xs text-brand-inactive-text">{r.customer_name_snapshot || "Cliente"}</span>
                                                                </div>
                                                                <div className="flex flex-col items-end gap-1 shrink-0">
                                                                    <span className="font-bold text-sm text-brand-green">{formatCurrency(Number(r.refund_amount || 0))}</span>
                                                                    <Link href={`/ddt-admin/returns?view=${r.id}`} className="text-xs text-brand-green font-semibold">Ver →</Link>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {totalReturnPages > 1 && (
                                                        <div className="pt-4">
                                                            <Pagination currentPage={returnPage} totalPages={totalReturnPages} onPageChange={setReturnPage} fixedUntil="lg" />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </FormSection>
                                    </FadeIn>
                                </TabsContent>

                                {/* Aba 6: Auditoria & Risco */}
                                <TabsContent value="audit" className="mt-0">
                                    <FadeIn key="audit">
                                        <FormSection title={`Histórico de Auditoria (${auditEvents.length})`}>
                                            {auditEvents.length === 0 ? (
                                                <IconPlaceholder
                                                    icon={ClockIcon}
                                                    containerSize="w-14 h-14 mb-2"
                                                    iconSize="w-6 h-6"
                                                    title="Nenhum evento registrado"
                                                    subtitle="Não há logs administrativos ou alterações registradas para este parceiro."
                                                />
                                            ) : (
                                                <div className="space-y-3">
                                                    {auditEvents.map((ev: any) => (
                                                        <div
                                                            key={ev.id || `${ev.created_at}-${Math.random()}`}
                                                            className="p-4 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                                                        >
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                                    {ev.action_type || "Ação Administrativa"}
                                                                </span>
                                                                <span className="text-xs text-brand-inactive-text">
                                                                    {ev.metadata?.reason || ev.details?.reason || (typeof ev.metadata === 'object' && ev.metadata ? JSON.stringify(ev.metadata) : ev.details ? JSON.stringify(ev.details) : "Ação administrativa registrada")}
                                                                </span>
                                                            </div>
                                                            <span className="text-xs text-brand-inactive-text shrink-0">
                                                                {formatDateTime(ev.created_at)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </FormSection>
                                    </FadeIn>
                                </TabsContent>
                            </div>
                        </div>
                    </Tabs>
                </div >
            </FadeIn >

            {/* Mobile bottom bar */}
            < div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-2" >
                {
                    isStoreSuspended ? (
                        <Button
                            variant="outline"
                            onClick={() => setUnsuspendStoreModalOpen(true)
                            }
                            className="flex-1 h-12"
                        >
                            Reativar Loja
                        </Button >
                    ) : (
                        <Button
                            variant="destructive"
                            onClick={() => setSuspendStoreModalOpen(true)}
                            className="flex-1 h-12"
                        >
                            Suspender Loja
                        </Button>
                    )}

                <Button
                    variant="outline"
                    onClick={() => {
                        setNewRiskScore(String(store.risk_score || 0))
                        setRiskModalOpen(true)
                    }}
                    className="flex-1 h-12"
                >
                    Score Risco
                </Button>

                <ActionsDropdown trigger={
                    <Button variant="outline" className="h-12 w-12">
                        <ThreeDotsIcon size={20} />
                    </Button>
                }>
                    {isErpDisabled ? (
                        <DropdownItem onClick={() => setEnableErpModalOpen(true)}>
                            <CheckCircleIcon size={16} className="text-brand-green" /> Reativar ERP
                        </DropdownItem>
                    ) : (
                        <DropdownItem onClick={() => setDisableErpModalOpen(true)} className="text-brand-red">
                            <BlockedIcon size={16} className="text-brand-red" /> Desativar ERP
                        </DropdownItem>
                    )}
                    {isPartnerSuspended ? (
                        <DropdownItem onClick={() => setUnsuspendPartnerModalOpen(true)}>
                            <CheckCircleIcon size={16} className="text-brand-green" /> Reativar Parceiro
                        </DropdownItem>
                    ) : (
                        <DropdownItem onClick={() => setSuspendPartnerModalOpen(true)} className="text-brand-red">
                            <AlertTriangleIcon size={16} className="text-brand-red" /> Suspender Parceiro
                        </DropdownItem>
                    )}
                </ActionsDropdown>
            </div >

            {/* Modal: Ajustar Score de Risco */}
            < DefaultModal
                isOpen={riskModalOpen}
                onClose={() => {
                    setRiskModalOpen(false)
                    setRiskTitle("")
                }}
                title="Ajustar Score de Risco"
            >
                <div className="space-y-4 pt-2">
                    <div>
                        <Input
                            label="Pontuação de Risco (0 - 100)"
                            type="number"
                            min={0}
                            max={100}
                            value={newRiskScore}
                            onChange={(e) => setNewRiskScore(e.target.value)}
                            placeholder="Ex: 25"
                        />
                        <span className="text-[11px] text-brand-inactive-text mt-1 block">
                            0 a 24: Baixo risco • 25 a 49: Médio risco • 50+: Alto risco (alerta vermelho)
                        </span>
                    </div>

                    <div>
                        <Input
                            label="Título da Notificação (Opcional)"
                            type="text"
                            value={riskTitle}
                            onChange={(e) => setRiskTitle(e.target.value)}
                            placeholder="Ex: Atualização no Score de Risco da Loja"
                        />
                        <span className="text-[11px] text-brand-inactive-text mt-1 block">
                            Se vazio, um título padrão sobre o ajuste de risco será utilizado.
                        </span>
                    </div>

                    <div>
                        <FormTextarea
                            label="Motivo / Mensagem da Notificação (Opcional)"
                            value={riskReason}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRiskReason(e.target.value)}
                            placeholder="Descreva o motivo do ajuste que será enviado para o cliente..."
                            rows={2}
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-3 border-t border-brand-border dark:border-dark-border">
                        <Button variant="outline" onClick={() => {
                            setRiskModalOpen(false)
                            setRiskTitle("")
                        }}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSaveRiskScore} disabled={isPending}>
                            Salvar Alteração
                        </Button>
                    </div>
                </div>
            </DefaultModal >

            {/* 1. Modal: Suspender Loja (Apenas esta filial) */}
            < AdminEnforcementModal
                isOpen={suspendStoreModalOpen}
                onClose={() => setSuspendStoreModalOpen(false)}
                onConfirm={handleConfirmSuspendStore}
                actionType="suspend"
                scope="store"
                entityId={store.id}
                entityName={store.name}
                currentRiskScore={store.risk_score}
            />

            {/* 2. Modal: Reativar Loja (Apenas esta filial) */}
            < AdminEnforcementModal
                isOpen={unsuspendStoreModalOpen}
                onClose={() => setUnsuspendStoreModalOpen(false)}
                onConfirm={handleConfirmUnsuspendStore}
                actionType="unsuspend"
                scope="store"
                entityId={store.id}
                entityName={store.name}
                currentRiskScore={store.risk_score}
            />

            {/* 3. Modal: Desativar Acesso ao ERP (Conta do Parceiro) */}
            < AdminEnforcementModal
                isOpen={disableErpModalOpen}
                onClose={() => setDisableErpModalOpen(false)}
                onConfirm={handleConfirmDisableERP}
                actionType="suspend"
                scope="erp"
                entityId={partner?.id || store.partner_id}
                entityName={partner?.store_name || store.name}
                currentRiskScore={store.risk_score}
            />

            {/* 4. Modal: Reativar Acesso ao ERP (Conta do Parceiro) */}
            < AdminEnforcementModal
                isOpen={enableErpModalOpen}
                onClose={() => setEnableErpModalOpen(false)}
                onConfirm={handleConfirmEnableERP}
                actionType="unsuspend"
                scope="erp"
                entityId={partner?.id || store.partner_id}
                entityName={partner?.store_name || store.name}
                currentRiskScore={store.risk_score}
            />

            {/* 5. Modal: Suspender Parceiro Inteiro */}
            < AdminEnforcementModal
                isOpen={suspendPartnerModalOpen}
                onClose={() => setSuspendPartnerModalOpen(false)}
                onConfirm={handleConfirmSuspendPartner}
                actionType="suspend"
                scope="partner"
                entityId={partner?.id || store.partner_id}
                entityName={partner?.store_name || store.name}
                currentRiskScore={store.risk_score}
            />

            {/* 6. Modal: Reativar Parceiro Inteiro */}
            < AdminEnforcementModal
                isOpen={unsuspendPartnerModalOpen}
                onClose={() => setUnsuspendPartnerModalOpen(false)}
                onConfirm={handleConfirmUnsuspendPartner}
                actionType="unsuspend"
                scope="partner"
                entityId={partner?.id || store.partner_id}
                entityName={partner?.store_name || store.name}
                currentRiskScore={store.risk_score}
            />
        </>
    )
}

export default AdminPartnerDetailView