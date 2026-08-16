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
} from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"
import { getPaymentStatusMeta } from "@/lib/orders/status"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { getAdminUserDetail, banUser, unbanUser } from "@/app/actions/admin/enforcement"
import DestructiveActionModal from "@/components/admin/DestructiveActionModal"
import Link from "next/link"
import { toast } from "@/hooks/use-notification"

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

const getReturnStatusBadgeVariant = (raw?: string | null) => {
    const s = String(raw || "").toUpperCase()
    if (["APPROVED", "COMPLETED", "RESOLVED"].includes(s)) return "green" as const
    if (["REJECTED", "EXPIRED", "ESCALATED", "CANCELLED", "CANCELED"].includes(s)) return "red" as const
    return "orange" as const
}

const getOrderStatusBadgeVariant = (situation?: string | null) => {
    if (situation === "paid") return "green" as const
    if (situation === "cancelled") return "red" as const
    return "orange" as const
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

    const handleScroll = useCallback(() => {
        setIsScrolled((scrollRef.current?.scrollTop || 0) > 20)
    }, [])

    const loadDetail = async () => {
        try {
            const data = await getAdminUserDetail(userId)
            if (data) setDetail(data)
        } catch (err) {
            console.error("Error fetching user detail:", err)
            toast.error("Erro ao carregar dados do usuário")
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        loadDetail()
    }, [userId])

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
                    subtitle="O usuário pode ter sido removido ou o link está incorreto."
                    itemButton={{
                        text: "Voltar para lista",
                        action: onBack,
                        variant: "outline",
                    }}
                />
            </div>
        )
    }

    const { profile, authUser, partner, orders, returns, auditEvents } = detail
    const isBanned = !!profile.banned_at
    const stores = partner?.stores || []

    const handleConfirmBan = (reason: string) => {
        startTransition(async () => {
            try {
                const res = await banUser(userId, reason)
                if (res.success) {
                    toast.success("Usuário banido com sucesso")
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

    const handleConfirmUnban = (reason: string) => {
        startTransition(async () => {
            try {
                const res = await unbanUser(userId, reason)
                if (res.success) {
                    toast.success("Banimento revogado com sucesso")
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
                                                <span className="hidden md:inline truncate">{profile.full_name || "Usuário sem nome"}</span>
                                                <Badge variant={isBanned ? "red" : "green"}>
                                                    {isBanned ? "Banido" : "Ativo"}
                                                </Badge>
                                                {partner && (
                                                    <Badge variant="blue">Lojista / Parceiro</Badge>
                                                )}
                                            </h1>

                                            <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                                {authUser?.email || profile.phone || "Sem e-mail cadastrado"} • Cadastrado em {formatDate(profile.created_at)}
                                            </div>
                                        </div>

                                        {/* Desktop action buttons */}
                                        <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                            {isBanned ? (
                                                <Button
                                                    variant="outline"
                                                    onClick={() => setUnbanModalOpen(true)}
                                                    className="text-brand-green border-brand-green/30 hover:bg-brand-green/10"
                                                >
                                                    Revogar Banimento
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

                                    {/* Title row - mobile */}
                                    <div className="md:hidden flex items-center gap-2 py-3">
                                        <Button variant="filled" onClick={onBack} className="w-9 h-9 p-0 flex items-center justify-center shrink-0">
                                            <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                        </Button>
                                        <UserProfileImage
                                            fullName={profile.full_name || "Usuário"}
                                            imageUrl={profile.avatar_url}
                                            className="w-11 h-11 text-base shrink-0"
                                        />
                                        <div className="flex flex-col gap-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h1 className="text-lg font-bold text-brand-dark dark:text-dark-heading truncate">
                                                    {profile.full_name || "Usuário sem nome"}
                                                </h1>
                                                <Badge variant={isBanned ? "red" : "green"}>
                                                    {isBanned ? "Banido" : "Ativo"}
                                                </Badge>
                                            </div>
                                            <span className="text-xs text-brand-inactive-text truncate">
                                                {authUser?.email || profile.phone || "Sem e-mail cadastrado"}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Tabs */}
                                    <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                            <TabsTrigger value="profile">Perfil & Documentos</TabsTrigger>
                                            <TabsTrigger value="partner">Lojas & Parceiro ({stores.length})</TabsTrigger>
                                            <TabsTrigger value="orders">Pedidos ({orders.length})</TabsTrigger>
                                            <TabsTrigger value="returns">Devoluções ({returns.length})</TabsTrigger>
                                            <TabsTrigger value="audit">Auditoria & Punições ({auditEvents.length})</TabsTrigger>
                                        </TabsList>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                                <Tabs value={activeTab} onValueChange={setActiveTab}>
                                    <TabsContent value="profile" className="mt-0">
                                        <FadeIn key="profile">
                                            {/* Banner de Banimento se ativo */}
                                            {isBanned && (
                                                <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-2xl flex items-start gap-3 mb-8">
                                                    <AlertTriangleIcon className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="text-sm font-bold text-red-950 dark:text-red-300">
                                                            Conta Banida da Plataforma
                                                        </h3>
                                                        <p className="text-xs text-red-900/80 dark:text-red-400/80 mt-0.5">
                                                            Motivo registrado: {profile.banned_reason || "Sem justificativa informada."}
                                                        </p>
                                                        {profile.banned_at && (
                                                            <p className="text-[11px] text-red-800 dark:text-red-400 mt-1">
                                                                Banido em {formatDateTime(profile.banned_at)} {profile.banned_until ? `até ${formatDate(profile.banned_until)}` : "(Permanente)"}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                {/* Coluna principal */}
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <FormSection title="Informações de Cadastro" hasSeparator>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                                            <div>
                                                                <span className="text-xs font-semibold text-brand-inactive-text block">Nome Completo</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block">
                                                                    {profile.full_name || "Não informado"}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <span className="text-xs font-semibold text-brand-inactive-text block">E-mail (Auth)</span>
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
                                                                <span className="text-xs font-semibold text-brand-inactive-text block">Data de Nascimento</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block">
                                                                    {profile.birth_date ? formatDate(profile.birth_date) : "Não informada"}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <span className="text-xs font-semibold text-brand-inactive-text block">ID do Usuário</span>
                                                                <span className="font-mono text-xs text-brand-inactive-text mt-0.5 block break-all">
                                                                    {userId}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </FormSection>
                                                </div>

                                                {/* Sidebar */}
                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                        <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                            Segurança & Acessos
                                                        </h3>
                                                        <div className="space-y-3 text-sm">
                                                            <div className="flex justify-between gap-2">
                                                                <span className="text-brand-inactive-text">Último Login</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading text-right">
                                                                    {authUser?.last_sign_in_at ? formatDateTime(authUser.last_sign_in_at) : "Nunca"}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center gap-2">
                                                                <span className="text-brand-inactive-text">E-mail Confirmado</span>
                                                                <Badge variant={authUser?.email_confirmed_at ? "green" : "orange"}>
                                                                    {authUser?.email_confirmed_at ? "Confirmado" : "Pendente"}
                                                                </Badge>
                                                            </div>
                                                            <div className="flex justify-between gap-2">
                                                                <span className="text-brand-inactive-text">Provedor Auth</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading text-right">
                                                                    {formatProviderLabel(authUser?.app_metadata?.provider)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    <TabsContent value="partner" className="mt-0">
                                        <FadeIn key="partner">
                                            {!partner ? (
                                                <div className="py-6">
                                                    <IconPlaceholder
                                                        icon={StoreIcon}
                                                        containerSize="w-16 h-16 mb-2"
                                                        iconSize="w-6 h-6"
                                                        title="Sem cadastro de parceiro"
                                                        subtitle="Este usuário não possui cadastro de parceiro/lojista."
                                                    />
                                                </div>
                                            ) : (
                                                <FormSection title={`Lojas Vinculadas (${stores.length})`} hasSeparator>
                                                    {stores.length === 0 ? (
                                                        <IconPlaceholder
                                                            icon={StoreIcon}
                                                            containerSize="w-14 h-14 mb-2"
                                                            iconSize="w-6 h-6"
                                                            title="Nenhuma loja vinculada"
                                                        />
                                                    ) : (
                                                        <div className="space-y-4">
                                                            {stores.map((s: any) => (
                                                                <ListItem
                                                                    key={s.id}
                                                                    icon={StoreIcon}
                                                                    title={s.name}
                                                                    description={`Risco: ${s.risk_score || 0} pts`}
                                                                    right={
                                                                        <Link
                                                                            href={`/ddt-admin/partners?search=${s.name}`}
                                                                            className="text-xs font-bold text-brand-green hover:underline shrink-0"
                                                                        >
                                                                            Gerenciar loja →
                                                                        </Link>
                                                                    }
                                                                />
                                                            ))}
                                                        </div>
                                                    )}
                                                </FormSection>
                                            )}
                                        </FadeIn>
                                    </TabsContent>

                                    <TabsContent value="orders" className="mt-0">
                                        <FadeIn key="orders">
                                            <FormSection title={`Histórico de Compras (${orders.length})`} hasSeparator>
                                                {orders.length === 0 ? (
                                                    <IconPlaceholder
                                                        icon={ShoppingCartIcon}
                                                        containerSize="w-14 h-14 mb-2"
                                                        iconSize="w-6 h-6"
                                                        title="Nenhum pedido realizado"
                                                        subtitle="Este usuário ainda não realizou compras."
                                                    />
                                                ) : (
                                                    <div className="space-y-4">
                                                        {orders.map((o: any) => (
                                                            <ListItem
                                                                key={o.id}
                                                                icon={ShoppingCartIcon}
                                                                title={`#${o.order_number || o.id.slice(0, 8)}`}
                                                                description={o.stores?.name || undefined}
                                                                right={
                                                                    <div className="flex items-center gap-3 shrink-0">
                                                                        <span className="font-bold text-sm text-brand-green">
                                                                            {formatCurrency(Number(o.total_amount || 0))}
                                                                        </span>
                                                                        <Badge variant={getOrderStatusBadgeVariant(o.situation)}>
                                                                            {getPaymentStatusMeta(o.situation).label}
                                                                        </Badge>
                                                                    </div>
                                                                }
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </FormSection>
                                        </FadeIn>
                                    </TabsContent>

                                    <TabsContent value="returns" className="mt-0">
                                        <FadeIn key="returns">
                                            <FormSection title={`Trocas e Devoluções Solicitadas (${returns.length})`} hasSeparator>
                                                {returns.length === 0 ? (
                                                    <IconPlaceholder
                                                        icon={ReturnIcon}
                                                        containerSize="w-14 h-14 mb-2"
                                                        iconSize="w-6 h-6"
                                                        title="Nenhuma troca ou devolução solicitada"
                                                        subtitle="Este usuário ainda não possui solicitações de pós-venda."
                                                    />
                                                ) : (
                                                    <div className="space-y-4">
                                                        {returns.map((r: any) => (
                                                            <ListItem
                                                                key={r.id}
                                                                icon={ReturnIcon}
                                                                title={`#${r.id.slice(0, 8)}`}
                                                                description={formatRequestTypeLabel(r.request_type)}
                                                                right={
                                                                    <Badge variant={getReturnStatusBadgeVariant(r.status)}>
                                                                        {formatReturnStatusLabel(r.status)}
                                                                    </Badge>
                                                                }
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </FormSection>
                                        </FadeIn>
                                    </TabsContent>

                                    <TabsContent value="audit" className="mt-0">
                                        <FadeIn key="audit">
                                            <FormSection title="Registros de Auditoria & Punições" hasSeparator>
                                                {auditEvents.length === 0 ? (
                                                    <IconPlaceholder
                                                        icon={ShieldIcon}
                                                        containerSize="w-14 h-14 mb-2"
                                                        iconSize="w-6 h-6"
                                                        title="Nenhum evento registrado"
                                                        subtitle="Não há eventos de auditoria ou punições para este usuário."
                                                    />
                                                ) : (
                                                    <div className="space-y-3">
                                                        {auditEvents.map((ev: any) => (
                                                            <div key={ev.id} className="p-3 bg-brand-gray dark:bg-dark-border/30 rounded-xl flex justify-between items-center text-sm">
                                                                <div>
                                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">{ev.action_type}</span>
                                                                    <p className="text-xs text-brand-inactive-text mt-0.5">{ev.reason || "Sem justificativa"}</p>
                                                                </div>
                                                                <span className="text-xs text-brand-inactive-text">{formatDateTime(ev.created_at)}</span>
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
                        className="flex-1 text-brand-green border-brand-green/30 hover:bg-brand-green/10"
                        onClick={() => setUnbanModalOpen(true)}
                    >
                        Revogar Banimento
                    </Button>
                ) : (
                    <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={() => setBanModalOpen(true)}
                    >
                        Banir Usuário
                    </Button>
                )}
            </div>

            {/* Modals de Ação */}
            <DestructiveActionModal
                isOpen={banModalOpen}
                onClose={() => setBanModalOpen(false)}
                onConfirm={handleConfirmBan}
                title="Banir Usuário"
                description="O usuário perderá o acesso à plataforma e suas sessões ativas serão invalidadas."
                entityName={profile.full_name || authUser?.email || userId}
                consequences={[
                    "Invalidação de tokens de autenticação",
                    "Bloqueio de novos logins na plataforma",
                    "Registro obrigatório no Audit Log",
                ]}
                confirmText="Confirmar Banimento"
                isPending={isPending}
            />

            <DestructiveActionModal
                isOpen={unbanModalOpen}
                onClose={() => setUnbanModalOpen(false)}
                onConfirm={handleConfirmUnban}
                title="Revogar Banimento"
                description="O usuário recuperará o acesso e poderá efetuar login novamente."
                entityName={profile.full_name || authUser?.email || userId}
                consequences={[
                    "Desbloqueio imediato da conta",
                    "Registro obrigatório da justificativa no Audit Log",
                ]}
                confirmText="Confirmar Desbloqueio"
                isPending={isPending}
            />
        </>
    )
}

export default AdminUserDetailView