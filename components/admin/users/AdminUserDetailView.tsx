"use client"

import React, { useState, useEffect, useTransition } from "react"
import {
    ChevronLeftIcon,
    UserIcon,
    StoreIcon,
    ShoppingCartIcon,
    ReturnIcon,
    ClockIcon,
    AlertTriangleIcon,
    CheckCircleIcon,
    CancelCircleIcon,
    ShareIcon,
    KeyIcon,
    MailIcon,
    PhoneIcon,
    FileTextIcon,
    CalendarIcon,
    LockIcon,
    ShieldIcon,
} from "@/lib/icons"
import {
    Button,
    Badge,
    Tabs,
    TabsList,
    TabsTrigger,
    ThreeDotsLoader,
} from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { getAdminUserDetail, banUser, unbanUser } from "@/app/actions/admin/enforcement"
import DestructiveActionModal from "@/components/admin/DestructiveActionModal"
import Link from "next/link"
import { toast } from "@/hooks/use-notification"

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
    const [isPending, startTransition] = useTransition()

    // Modals
    const [banModalOpen, setBanModalOpen] = useState(false)
    const [unbanModalOpen, setUnbanModalOpen] = useState(false)

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20)
        }
        window.addEventListener("scroll", handleScroll)
        return () => window.removeEventListener("scroll", handleScroll)
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
                <p className="text-base font-bold text-brand-dark dark:text-dark-heading">Usuário não encontrado</p>
                <Button variant="outline" onClick={onBack} className="mt-4">
                    Voltar para lista
                </Button>
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
        <FadeIn className="flex flex-col w-full min-h-screen bg-white dark:bg-dark-background">
            {/* Sticky Header */}
            <div className={`sticky top-0 z-20 bg-white/95 dark:bg-dark-surface/95 backdrop-blur-md border-b border-brand-border dark:border-dark-border transition-all duration-300 ${isScrolled ? "shadow-sm py-3 px-4 md:px-8" : "py-4 px-4 md:px-8"}`}>
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onBack}
                            className="p-2 -ml-2 text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading rounded-full"
                        >
                            <ChevronLeftIcon className="w-5 h-5" />
                        </Button>

                        <div className="flex items-center gap-3">
                            <UserProfileImage
                                fullName={profile.full_name || "Usuário"}
                                imageUrl={profile.avatar_url}
                                className="w-11 h-11 text-base shrink-0"
                            />
                            <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h1 className="text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading tracking-tight truncate">
                                        {profile.full_name || "Usuário sem nome"}
                                    </h1>
                                    <Badge variant={isBanned ? "red" : "green"}>
                                        {isBanned ? "Banido" : "Ativo"}
                                    </Badge>
                                    {partner && (
                                        <Badge variant="blue">Lojista / Parceiro</Badge>
                                    )}
                                </div>
                                <span className="text-xs text-brand-inactive-text mt-0.5 truncate">
                                    {authUser?.email || profile.phone || "Sem e-mail cadastrado"} • Cadastrado em {formatDate(profile.created_at)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-auto">
                        {isBanned ? (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setUnbanModalOpen(true)}
                                className="text-brand-green border-brand-green/30 hover:bg-brand-green/10"
                            >
                                Revogar Banimento
                            </Button>
                        ) : (
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setBanModalOpen(true)}
                            >
                                Banir Usuário
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                navigator.clipboard.writeText(window.location.href)
                                toast.success("Link do perfil copiado!")
                            }}
                            leftIcon={<ShareIcon size={16} />}
                        >
                            Compartilhar
                        </Button>
                    </div>
                </div>

                {/* Sub-Tabs */}
                <div className="max-w-7xl mx-auto mt-4">
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                            <TabsTrigger value="profile" icon={UserIcon}>
                                Perfil & Documentos
                            </TabsTrigger>
                            <TabsTrigger value="partner" icon={StoreIcon}>
                                Lojas & Parceiro ({stores.length})
                            </TabsTrigger>
                            <TabsTrigger value="orders" icon={ShoppingCartIcon}>
                                Pedidos ({orders.length})
                            </TabsTrigger>
                            <TabsTrigger value="returns" icon={ReturnIcon}>
                                Devoluções ({returns.length})
                            </TabsTrigger>
                            <TabsTrigger value="audit" icon={ClockIcon}>
                                Auditoria & Punições ({auditEvents.length})
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
            </div>

            {/* Content Body */}
            <div className="max-w-7xl mx-auto w-full p-4 md:p-8 space-y-6">
                {/* Banner de Banimento se ativo */}
                {isBanned && (
                    <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-2xl flex items-start gap-3">
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

                {activeTab === "profile" && (
                    <div className="grid grid-cols-12 gap-6">
                        {/* Dados Pessoais */}
                        <div className="col-span-12 lg:col-span-8 space-y-6">
                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                                <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading pb-3 border-b border-brand-border dark:border-dark-border">
                                    Informações de Cadastro
                                </h2>

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
                            </div>
                        </div>

                        {/* Segurança & Sessões */}
                        <div className="col-span-12 lg:col-span-4 space-y-6">
                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                                <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading pb-3 border-b border-brand-border dark:border-dark-border">
                                    Segurança & Acessos
                                </h2>

                                <div className="space-y-3 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-brand-inactive-text">Último Login</span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                                            {authUser?.last_sign_in_at ? formatDateTime(authUser.last_sign_in_at) : "Nunca"}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-brand-inactive-text">E-mail Confirmado</span>
                                        <Badge variant={authUser?.email_confirmed_at ? "green" : "orange"}>
                                            {authUser?.email_confirmed_at ? "Confirmado" : "Pendente"}
                                        </Badge>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-brand-inactive-text">Provedor Auth</span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                                            {authUser?.app_metadata?.provider || "email"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "partner" && (
                    <div className="space-y-6">
                        {!partner ? (
                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-8 text-center">
                                <p className="text-sm text-brand-inactive-text">Este usuário não possui cadastro de parceiro/lojista.</p>
                            </div>
                        ) : (
                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                                <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading pb-3 border-b border-brand-border dark:border-dark-border">
                                    Lojas Vinculadas ({stores.length})
                                </h2>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {stores.map((s: any) => (
                                        <div key={s.id} className="p-4 rounded-xl border border-brand-border dark:border-dark-border flex justify-between items-center">
                                            <div>
                                                <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading">{s.name}</h3>
                                                <span className="text-xs text-brand-inactive-text">Risco: {s.risk_score || 0} pts</span>
                                            </div>
                                            <Link
                                                href={`/ddt-admin/partners?search=${s.name}`}
                                                className="text-xs font-bold text-brand-green hover:underline"
                                            >
                                                Gerenciar loja →
                                            </Link>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "orders" && (
                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                        <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading pb-3 border-b border-brand-border dark:border-dark-border">
                            Histórico de Compras ({orders.length})
                        </h2>

                        {orders.length === 0 ? (
                            <p className="text-sm text-brand-inactive-text py-4 text-center">Nenhum pedido realizado.</p>
                        ) : (
                            <div className="divide-y divide-brand-border dark:divide-dark-border">
                                {orders.map((o: any) => (
                                    <div key={o.id} className="py-3 flex justify-between items-center">
                                        <div>
                                            <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">#{o.order_number || o.id.slice(0, 8)}</span>
                                            <span className="text-xs text-brand-inactive-text ml-2">{o.stores?.name}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-bold text-sm text-brand-green">{formatCurrency(Number(o.total_amount || 0))}</span>
                                            <Badge variant={o.situation === "paid" ? "green" : "orange"}>{o.situation}</Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "returns" && (
                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                        <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading pb-3 border-b border-brand-border dark:border-dark-border">
                            Trocas e Devoluções Solicitadas ({returns.length})
                        </h2>

                        {returns.length === 0 ? (
                            <p className="text-sm text-brand-inactive-text py-4 text-center">Nenhuma troca ou devolução solicitada.</p>
                        ) : (
                            <div className="divide-y divide-brand-border dark:divide-dark-border">
                                {returns.map((r: any) => (
                                    <div key={r.id} className="py-3 flex justify-between items-center">
                                        <div>
                                            <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">#{r.id.slice(0, 8)}</span>
                                            <span className="text-xs text-brand-inactive-text ml-2 capitalize">{r.request_type}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Badge variant={r.status === "APPROVED" ? "green" : "orange"}>{r.status}</Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "audit" && (
                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                        <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading pb-3 border-b border-brand-border dark:border-dark-border">
                            Registros de Auditoria & Punições
                        </h2>

                        {auditEvents.length === 0 ? (
                            <p className="text-sm text-brand-inactive-text py-4 text-center">Nenhum evento registrado.</p>
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
                    </div>
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
        </FadeIn>
    )
}

export default AdminUserDetailView
