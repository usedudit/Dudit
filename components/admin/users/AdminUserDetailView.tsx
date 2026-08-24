"use client"

import React, { useState, useEffect, useRef, useCallback, useTransition } from "react"
import {
    ChevronLeftIcon,
    UserIcon,
    StoreIcon,
    ShoppingCartIcon,
    ReturnIcon,
    AlertTriangleIcon,
    ShieldIcon,
    EditIcon,
    ClockIcon,
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
    ListItem,
    AlertModal,
    DefaultModal,
    Input,
} from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"
import { getPaymentStatusMeta } from "@/lib/orders/status"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { getAdminUserDetail, banUser, unbanUser, updateUserRiskScore } from "@/app/actions/admin/enforcement"
import Link from "next/link"
import { toast } from "@/hooks/use-notification"
import { useSidebar } from "@/lib/sidebar-context"

const formatProviderLabel = (raw?: string | null) => {
    const r = String(raw || "").trim().toLowerCase()
    const labels: Record<string, string> = {
        email: "E-mail",
        password: "E-mail",
        phone: "Telefone",
        google: "Google",
        github: "GitHub",
        facebook: "Facebook",
        apple: "Apple",
        magiclink: "Link Mágico",
        "magic link": "Link Mágico",
        linkedin: "LinkedIn",
        twitter: "Twitter",
    }
    return labels[r] || (r ? r.charAt(0).toUpperCase() + r.slice(1) : "E-mail")
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

interface AdminUserDetailViewProps {
    userId: string
    initialData?: any
    onBack: () => void
    onUserUpdated?: () => void
}

export function AdminUserDetailView({
    userId,
    initialData,
    onBack,
    onUserUpdated,
}: AdminUserDetailViewProps) {
    const [detail, setDetail] = useState<any>(initialData || null)
    const [isLoading, setIsLoading] = useState(!initialData)
    const [activeTab, setActiveTab] = useState("profile")
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const [isPending, startTransition] = useTransition()

    // Modals
    const [banModalOpen, setBanModalOpen] = useState(false)
    const [unbanModalOpen, setUnbanModalOpen] = useState(false)
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
            const data = await getAdminUserDetail(userId)
            if (data) {
                setDetail(data)
                setNewRiskScore(String(data.profile?.risk_score || 0))
            }
        } catch (err) {
            console.error("Error fetching user detail:", err)
            toast.error("Erro ao carregar dados do usuário")
        } finally {
            setIsLoading(false)
        }
    }, [userId])

    useEffect(() => {
        loadDetail()
    }, [loadDetail])

    const profile = detail?.profile
    const userName = profile?.full_name || "Usuário"

    useEffect(() => {
        if (!setHeaderOverride) return
        setHeaderOverride({
            title: userName,
            onBack,
            isSubPage: true,
        })
        return () => setHeaderOverride(null)
    }, [userName, onBack, setHeaderOverride])

    if (isLoading && !detail) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <ThreeDotsLoader />
            </div>
        )
    }

    if (!detail || !detail.profile) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
                <IconPlaceholder
                    icon={UserIcon}
                    containerSize="w-16 h-16 mb-2"
                    iconSize="w-6 h-6"
                    title="Usuário não encontrado"
                    subtitle="A conta pode ter sido removida ou o identificador é inválido."
                    itemButton={{
                        text: "Voltar para lista",
                        action: onBack,
                        variant: "outline",
                    }}
                />
            </div>
        )
    }

    const { authUser, partner, orders, returns, auditEvents } = detail
    const isBanned = !!profile.banned_at

    const handleConfirmBan = () => {
        startTransition(async () => {
            try {
                const res = await banUser(userId, "Banimento manual via detalhes de usuário")
                if (res.success) {
                    toast.success(`Usuário banido com sucesso! ${res.caseId ? `Protocolo: ${res.caseId}` : ""}`)
                    setBanModalOpen(false)
                    loadDetail()
                    onUserUpdated?.()
                } else {
                    toast.error(res.error || "Erro ao banir usuário")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    const handleConfirmUnban = () => {
        startTransition(async () => {
            try {
                const res = await unbanUser(userId, "Desbanimento via detalhes de usuário")
                if (res.success) {
                    toast.success("Acesso do usuário restabelecido com sucesso")
                    setUnbanModalOpen(false)
                    loadDetail()
                    onUserUpdated?.()
                } else {
                    toast.error(res.error || "Erro ao desbanir usuário")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    const handleSaveRiskScore = () => {
        const scoreNum = parseInt(newRiskScore, 10)
        if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
            toast.error("Insira uma pontuação válida entre 0 e 100")
            return
        }

        startTransition(async () => {
            try {
                const res = await updateUserRiskScore(userId, scoreNum, riskReason, riskTitle || undefined)
                if (res.success) {
                    toast.success("Score de risco do usuário atualizado e notificação enviada!")
                    setRiskModalOpen(false)
                    setRiskTitle("")
                    setRiskReason("")
                    loadDetail()
                    onUserUpdated?.()
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
                        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

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
                                                <span className="hidden md:inline truncate">{profile.full_name || "Usuário"}</span>
                                                <Badge variant={isBanned ? "red" : "green"}>
                                                    {isBanned ? "Banido" : "Ativo"}
                                                </Badge>
                                                <Badge variant={(profile.risk_score || 0) >= 50 ? "red" : (profile.risk_score || 0) >= 25 ? "orange" : "gray"}>
                                                    Risco: {profile.risk_score || 0} pts
                                                </Badge>
                                            </h1>

                                            <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                                ID: {profile.user_id} • E-mail: {authUser?.email || "Sem e-mail registrado"}
                                            </div>
                                        </div>

                                        {/* Desktop action buttons */}
                                        <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                            <Button
                                                variant="outline"
                                                onClick={() => {
                                                    setNewRiskScore(String(profile.risk_score || 0))
                                                    setRiskModalOpen(true)
                                                }}
                                                leftIcon={<EditIcon size={16} />}
                                            >
                                                Score de Risco
                                            </Button>

                                            {isBanned ? (
                                                <Button
                                                    variant="outline"
                                                    onClick={() => setUnbanModalOpen(true)}
                                                    className="text-brand-green border-brand-green/30 hover:bg-brand-green/10"
                                                >
                                                    Desbanir Usuário
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant="destructive"
                                                    onClick={() => setBanModalOpen(true)}
                                                >
                                                    Banir Usuário
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Tabs */}
                                    <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                            <TabsTrigger value="profile">Perfil & Cadastro</TabsTrigger>
                                            <TabsTrigger value="orders">Compras ({orders.length})</TabsTrigger>
                                            <TabsTrigger value="returns">Devoluções ({returns.length})</TabsTrigger>
                                            <TabsTrigger value="audit">Auditoria ({auditEvents.length})</TabsTrigger>
                                        </TabsList>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                                <Tabs value={activeTab} onValueChange={setActiveTab}>
                                    {/* Aba 1: Perfil */}
                                    <TabsContent value="profile" className="mt-0">
                                        <FadeIn key="profile">
                                            {isBanned && (
                                                <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-2xl flex items-start gap-3 mb-8">
                                                    <AlertTriangleIcon className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <h3 className="text-sm font-bold text-red-950 dark:text-red-300">
                                                                Usuário Bloqueado / Banido
                                                            </h3>
                                                            {profile.banned_case_id && (
                                                                <button
                                                                    onClick={() => {
                                                                        navigator.clipboard.writeText(profile.banned_case_id)
                                                                        toast.success("Protocolo do caso copiado!")
                                                                    }}
                                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 font-mono text-xs font-bold border border-red-200 dark:border-red-800 cursor-pointer hover:bg-red-200"
                                                                    title="Clique para copiar o protocolo"
                                                                >
                                                                    <span>Caso: {profile.banned_case_id}</span>
                                                                    <span className="text-[10px] uppercase font-sans font-semibold">Copiar</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-red-900/80 dark:text-red-400/80 mt-0.5">
                                                            Motivo: {profile.banned_reason || "Sem motivo informado."} • Banido em: {formatDate(profile.banned_at)}
                                                            {profile.banned_until ? ` • Vigência até: ${formatDate(profile.banned_until)}` : " • Permanente"}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                {/* Coluna principal */}
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12 space-y-6">
                                                    <FormSection title="Dados Pessoais & Conta" hasSeparator>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                                            <div>
                                                                <span className="text-xs font-semibold text-brand-inactive-text block">Nome Completo</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block">
                                                                    {profile.full_name || "Não informado"}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <span className="text-xs font-semibold text-brand-inactive-text block">E-mail de Login</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block">
                                                                    {authUser?.email || "Sem e-mail"}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <span className="text-xs font-semibold text-brand-inactive-text block">Telefone</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block">
                                                                    {profile.phone || "Não informado"}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <span className="text-xs font-semibold text-brand-inactive-text block">CPF</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block">
                                                                    {profile.cpf || "Não informado"}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <span className="text-xs font-semibold text-brand-inactive-text block">Provedor de Login</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block">
                                                                    {formatProviderLabel(authUser?.app_metadata?.provider)}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <span className="text-xs font-semibold text-brand-inactive-text block">Data de Cadastro</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block">
                                                                    {formatDate(profile.created_at)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </FormSection>

                                                    {/* Lojas vinculadas */}
                                                    {partner && partner.stores && partner.stores.length > 0 && (
                                                        <FormSection title={`Lojas Vinculadas como Parceiro (${partner.stores.length})`} hasSeparator>
                                                            <div className="space-y-3">
                                                                {partner.stores.map((s: any) => (
                                                                    <ListItem
                                                                        key={s.id}
                                                                        icon={StoreIcon}
                                                                        title={s.name}
                                                                        description={`Score de Risco: ${s.risk_score || 0} pts • ${s.is_active ? "Ativa" : "Suspensa"}`}
                                                                        right={
                                                                            <Link
                                                                                href={`/ddt-admin/partners?view=${s.id}`}
                                                                                className="text-xs font-bold text-brand-green hover:underline"
                                                                            >
                                                                                Ver Loja →
                                                                            </Link>
                                                                        }
                                                                    />
                                                                ))}
                                                            </div>
                                                        </FormSection>
                                                    )}
                                                </div>

                                                {/* Sidebar */}
                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border space-y-6">
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden transition-colors">
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                            Score de Risco do Usuário
                                                        </h3>
                                                        <div className="flex justify-between items-center text-sm">
                                                            <span className="text-brand-inactive-text">Pontuação Atual</span>
                                                            <Badge variant={(profile.risk_score || 0) >= 50 ? "red" : (profile.risk_score || 0) >= 25 ? "orange" : "gray"}>
                                                                {profile.risk_score || 0} pts
                                                            </Badge>
                                                        </div>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => {
                                                                setNewRiskScore(String(profile.risk_score || 0))
                                                                setRiskModalOpen(true)
                                                            }}
                                                            className="w-full mt-4 text-xs"
                                                        >
                                                            Ajustar Score
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    {/* Aba 2: Compras */}
                                    <TabsContent value="orders" className="mt-0">
                                        <FadeIn key="orders">
                                            <FormSection title={`Histórico de Compras (${orders.length})`} hasSeparator>
                                                {orders.length === 0 ? (
                                                    <IconPlaceholder
                                                        icon={ShoppingCartIcon}
                                                        containerSize="w-14 h-14 mb-2"
                                                        iconSize="w-6 h-6"
                                                        title="Nenhuma compra realizada"
                                                        subtitle="Este usuário ainda não fez pedidos na plataforma."
                                                    />
                                                ) : (
                                                    <div className="space-y-3">
                                                        {orders.map((o: any) => (
                                                            <ListItem
                                                                key={o.id}
                                                                icon={ShoppingCartIcon}
                                                                title={`Pedido #${o.order_number || o.id.slice(0, 8)} • ${o.stores?.name || "Marketplace"}`}
                                                                description={`${formatDate(o.created_at)} • Total: ${formatCurrency(Number(o.total_amount || 0))}`}
                                                                right={
                                                                    <div className="flex items-center gap-3">
                                                                        <Badge variant={o.situation === "paid" ? "green" : o.situation === "cancelled" ? "red" : "orange"}>
                                                                            {o.situation === "paid" ? "Pago" : o.situation === "cancelled" ? "Cancelado" : "Pendente"}
                                                                        </Badge>
                                                                        <Link
                                                                            href={`/ddt-admin/orders?view=${o.id}`}
                                                                            className="text-xs font-bold text-brand-green hover:underline"
                                                                        >
                                                                            Ver Pedido →
                                                                        </Link>
                                                                    </div>
                                                                }
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </FormSection>
                                        </FadeIn>
                                    </TabsContent>

                                    {/* Aba 3: Devoluções */}
                                    <TabsContent value="returns" className="mt-0">
                                        <FadeIn key="returns">
                                            <FormSection title={`Histórico de Trocas & Devoluções (${returns.length})`} hasSeparator>
                                                {returns.length === 0 ? (
                                                    <IconPlaceholder
                                                        icon={ReturnIcon}
                                                        containerSize="w-14 h-14 mb-2"
                                                        iconSize="w-6 h-6"
                                                        title="Nenhuma devolução registrada"
                                                        subtitle="O usuário não abriu contestações ou solicitações de troca."
                                                    />
                                                ) : (
                                                    <div className="space-y-3">
                                                        {returns.map((r: any) => (
                                                            <ListItem
                                                                key={r.id}
                                                                icon={ReturnIcon}
                                                                title={`Solicitação #${r.id.slice(0, 8)} • ${formatRequestTypeLabel(r.request_type)}`}
                                                                description={`${formatDate(r.created_at)} • Valor: ${formatCurrency(Number(r.refund_amount || 0))}`}
                                                                right={
                                                                    <div className="flex items-center gap-3">
                                                                        <Badge variant={r.status === "approved" || r.status === "completed" ? "green" : r.status === "rejected" ? "red" : "orange"}>
                                                                            {formatReturnStatusLabel(r.status)}
                                                                        </Badge>
                                                                        <Link
                                                                            href={`/ddt-admin/returns?view=${r.id}`}
                                                                            className="text-xs font-bold text-brand-green hover:underline"
                                                                        >
                                                                            Ver Devolução →
                                                                        </Link>
                                                                    </div>
                                                                }
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </FormSection>
                                        </FadeIn>
                                    </TabsContent>

                                    {/* Aba 4: Auditoria */}
                                    <TabsContent value="audit" className="mt-0">
                                        <FadeIn key="audit">
                                            <FormSection title={`Logs de Auditoria (${auditEvents.length})`} hasSeparator>
                                                {auditEvents.length === 0 ? (
                                                    <IconPlaceholder
                                                        icon={ClockIcon}
                                                        containerSize="w-14 h-14 mb-2"
                                                        iconSize="w-6 h-6"
                                                        title="Nenhum evento registrado"
                                                        subtitle="Não há ações administrativas registradas para este usuário."
                                                    />
                                                ) : (
                                                    <div className="space-y-3">
                                                        {auditEvents.map((ev: any) => (
                                                            <div
                                                                key={ev.id}
                                                                className="p-4 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                                                            >
                                                                <div className="flex flex-col">
                                                                    <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                                        {ev.action_type || "Ação Administrativa"}
                                                                    </span>
                                                                    <span className="text-xs text-brand-inactive-text">
                                                                        {ev.details?.reason || JSON.stringify(ev.details || {})}
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
                                </Tabs>
                            </div>
                        </div>
                    </Tabs>
                </div>
            </FadeIn>

            {/* Mobile bottom bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                {isBanned ? (
                    <Button
                        variant="outline"
                        onClick={() => setUnbanModalOpen(true)}
                        className="flex-1 text-brand-green border-brand-green/30"
                    >
                        Desbanir
                    </Button>
                ) : (
                    <Button
                        variant="destructive"
                        onClick={() => setBanModalOpen(true)}
                        className="flex-1"
                    >
                        Banir
                    </Button>
                )}
                <Button
                    variant="outline"
                    onClick={() => {
                        setNewRiskScore(String(profile.risk_score || 0))
                        setRiskModalOpen(true)
                    }}
                    className="flex-1"
                >
                    Score de Risco
                </Button>
            </div>

            {/* Modal: Ajustar Score de Risco */}
            <DefaultModal
                isOpen={riskModalOpen}
                onClose={() => {
                    setRiskModalOpen(false)
                    setRiskTitle("")
                }}
                title="Ajustar Score de Risco do Usuário"
            >
                <div className="space-y-4 pt-2">
                    <div>
                        <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1">
                            Pontuação de Risco (0 - 100)
                        </label>
                        <Input
                            type="number"
                            min={0}
                            max={100}
                            value={newRiskScore}
                            onChange={(e) => setNewRiskScore(e.target.value)}
                            placeholder="Ex: 10"
                        />
                        <span className="text-[11px] text-brand-inactive-text mt-1 block">
                            0 a 24: Baixo risco • 25 a 49: Médio risco • 50+: Alto risco (alerta vermelho)
                        </span>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1">
                            Título da Notificação (Opcional)
                        </label>
                        <Input
                            type="text"
                            value={riskTitle}
                            onChange={(e) => setRiskTitle(e.target.value)}
                            placeholder="Ex: Atualização no Score de Risco"
                        />
                        <span className="text-[11px] text-brand-inactive-text mt-1 block">
                            Se vazio, um título padrão sobre o ajuste de risco será utilizado.
                        </span>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1">
                            Motivo / Mensagem da Notificação (Enviado para o Cliente)
                        </label>
                        <textarea
                            value={riskReason}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRiskReason(e.target.value)}
                            placeholder="Descreva o motivo do ajuste que será enviado para o cliente..."
                            rows={3}
                            className="w-full px-3 py-2 text-sm rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading placeholder:text-brand-inactive-text focus:outline-none focus:ring-2 focus:ring-brand-green/20"
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
            </DefaultModal>

            {/* Modal: Banir Usuário */}
            <AlertModal
                isOpen={banModalOpen}
                onClose={() => setBanModalOpen(false)}
                onConfirm={handleConfirmBan}
                title="Banir Usuário"
                description={`Tem certeza que deseja banir ${profile.full_name || authUser?.email}? O usuário perderá acesso imediato à plataforma.`}
                confirmText="Banir Usuário"
                variant="danger"
            />

            {/* Modal: Desbanir Usuário */}
            <AlertModal
                isOpen={unbanModalOpen}
                onClose={() => setUnbanModalOpen(false)}
                onConfirm={handleConfirmUnban}
                title="Desbanir Usuário"
                description={`Deseja restabelecer o acesso de ${profile.full_name || authUser?.email}?`}
                confirmText="Desbanir Usuário"
                variant="success"
            />
        </>
    )
}

export default AdminUserDetailView