"use client"

import React, { useState, useEffect, useTransition } from "react"
import {
    ChevronLeftIcon,
    StoreIcon,
    UserIcon,
    PackageIcon,
    ShoppingCartIcon,
    ReturnIcon,
    ClockIcon,
    AlertTriangleIcon,
    CheckCircleIcon,
    CancelCircleIcon,
    ShareIcon,
    ShieldIcon,
    PhoneIcon,
    MapPinIcon,
    MoneyIcon,
    CalendarIcon,
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
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { getAdminPartnerDetail, suspendPartner, unsuspendPartner } from "@/app/actions/admin/enforcement"
import DestructiveActionModal from "@/components/admin/DestructiveActionModal"
import Link from "next/link"
import { toast } from "@/hooks/use-notification"

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
    const [isPending, startTransition] = useTransition()

    // Modals
    const [suspendModalOpen, setSuspendModalOpen] = useState(false)
    const [unsuspendModalOpen, setUnsuspendModalOpen] = useState(false)

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20)
        }
        window.addEventListener("scroll", handleScroll)
        return () => window.removeEventListener("scroll", handleScroll)
    }, [])

    const loadDetail = async () => {
        try {
            const data = await getAdminPartnerDetail(storeId)
            if (data) setDetail(data)
        } catch (err) {
            console.error("Error fetching partner detail:", err)
            toast.error("Erro ao carregar dados do parceiro")
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        loadDetail()
    }, [storeId])

    if (isLoading && !detail) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <ThreeDotsLoader />
            </div>
        )
    }

    if (!detail || !detail.store) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
                <p className="text-base font-bold text-brand-dark dark:text-dark-heading">Loja não encontrada</p>
                <Button variant="outline" onClick={onBack} className="mt-4">
                    Voltar para lista
                </Button>
            </div>
        )
    }

    const { store, partner, ownerProfile, productsCount, recentProducts, ordersCount, recentOrders, returnsCount, recentReturns, auditEvents } = detail
    const isSuspended = !!store.suspended_at || !store.is_active

    const handleConfirmSuspend = (reason: string) => {
        if (!store.partner_id) return
        startTransition(async () => {
            try {
                const res = await suspendPartner(store.partner_id, reason)
                if (res.success) {
                    toast.success("Loja suspensa com sucesso")
                    setSuspendModalOpen(false)
                    loadDetail()
                    onPartnerUpdated?.()
                } else {
                    toast.error(res.error || "Erro ao suspender loja")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    const handleConfirmUnsuspend = (reason: string) => {
        if (!store.partner_id) return
        startTransition(async () => {
            try {
                const res = await unsuspendPartner(store.partner_id, reason)
                if (res.success) {
                    toast.success("Suspensão revogada com sucesso")
                    setUnsuspendModalOpen(false)
                    loadDetail()
                    onPartnerUpdated?.()
                } else {
                    toast.error(res.error || "Erro ao reativar loja")
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
                            <div className="w-12 h-12 rounded-xl bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center overflow-hidden shrink-0">
                                {store.logo_url ? (
                                    <img src={getR2ImageUrl(store.logo_url)} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <StoreIcon className="w-6 h-6 text-brand-inactive-text" />
                                )}
                            </div>
                            <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h1 className="text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading tracking-tight truncate">
                                        {store.name}
                                    </h1>
                                    <Badge variant={isSuspended ? "red" : "green"}>
                                        {isSuspended ? "Suspensa" : "Ativa"}
                                    </Badge>
                                    <Badge variant={store.risk_score >= 50 ? "red" : store.risk_score >= 25 ? "orange" : "gray"}>
                                        Risco: {store.risk_score || 0} pts
                                    </Badge>
                                </div>
                                <span className="text-xs text-brand-inactive-text mt-0.5 truncate">
                                    Responsável: {ownerProfile?.full_name || "Lojista"} • {ownerProfile?.email || "Sem e-mail"}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-auto">
                        {isSuspended ? (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setUnsuspendModalOpen(true)}
                                className="text-brand-green border-brand-green/30 hover:bg-brand-green/10"
                            >
                                Reativar Loja
                            </Button>
                        ) : (
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setSuspendModalOpen(true)}
                            >
                                Suspender Loja
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                navigator.clipboard.writeText(window.location.href)
                                toast.success("Link da loja copiado!")
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
                            <TabsTrigger value="general" icon={StoreIcon}>
                                Dados da Loja
                            </TabsTrigger>
                            <TabsTrigger value="products" icon={PackageIcon}>
                                Produtos ({productsCount})
                            </TabsTrigger>
                            <TabsTrigger value="orders" icon={ShoppingCartIcon}>
                                Pedidos ({ordersCount})
                            </TabsTrigger>
                            <TabsTrigger value="returns" icon={ReturnIcon}>
                                Devoluções ({returnsCount})
                            </TabsTrigger>
                            <TabsTrigger value="audit" icon={ClockIcon}>
                                Auditoria & Risco ({auditEvents.length})
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
            </div>

            {/* Content Body */}
            <div className="max-w-7xl mx-auto w-full p-4 md:p-8 space-y-6">
                {isSuspended && (
                    <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-2xl flex items-start gap-3">
                        <AlertTriangleIcon className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-bold text-red-950 dark:text-red-300">
                                Loja Suspensa Administrativamente
                            </h3>
                            <p className="text-xs text-red-900/80 dark:text-red-400/80 mt-0.5">
                                Motivo: {store.suspended_reason || "Sem motivo especificado."}
                            </p>
                        </div>
                    </div>
                )}

                {activeTab === "general" && (
                    <div className="grid grid-cols-12 gap-6">
                        {/* Informações da Loja */}
                        <div className="col-span-12 lg:col-span-8 space-y-6">
                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                                <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading pb-3 border-b border-brand-border dark:border-dark-border">
                                    Informações Cadastrais
                                </h2>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-xs font-semibold text-brand-inactive-text block">Nome Comercial</span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block">{store.name}</span>
                                    </div>
                                    <div>
                                        <span className="text-xs font-semibold text-brand-inactive-text block">Tipo de Pessoa</span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block uppercase">
                                            {store.person_type || "PJ"}
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
                                    <div className="sm:col-span-2">
                                        <span className="text-xs font-semibold text-brand-inactive-text block">Descrição</span>
                                        <p className="text-sm text-brand-dark dark:text-dark-heading mt-0.5">
                                            {store.description || "Sem descrição informada."}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Proprietário */}
                        <div className="col-span-12 lg:col-span-4 space-y-6">
                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                                <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading pb-3 border-b border-brand-border dark:border-dark-border">
                                    Proprietário / Titular
                                </h2>

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
                                    <div className="pt-2">
                                        <Link
                                            href={`/ddt-admin/users?search=${partner.user_id}`}
                                            className="text-xs font-bold text-brand-green hover:underline"
                                        >
                                            Ver perfil do usuário titular →
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "products" && (
                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                        <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading pb-3 border-b border-brand-border dark:border-dark-border">
                            Produtos Recentes ({productsCount} total)
                        </h2>

                        {recentProducts.length === 0 ? (
                            <p className="text-sm text-brand-inactive-text py-4 text-center">Nenhum produto cadastrado.</p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                {recentProducts.map((p: any) => (
                                    <div key={p.id} className="p-3.5 rounded-xl border border-brand-border dark:border-dark-border flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-lg bg-brand-gray dark:bg-dark-border/30 flex items-center justify-center overflow-hidden shrink-0">
                                            {p.image_url ? (
                                                <img src={getR2ImageUrl(p.image_url)} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <PackageIcon className="w-5 h-5 text-brand-inactive-text" />
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h3 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{p.name}</h3>
                                            <span className="font-bold text-xs text-brand-green">{formatCurrency(Number(p.price || 0))}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "orders" && (
                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                        <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading pb-3 border-b border-brand-border dark:border-dark-border">
                            Vendas Recentes ({ordersCount} total)
                        </h2>

                        {recentOrders.length === 0 ? (
                            <p className="text-sm text-brand-inactive-text py-4 text-center">Nenhuma venda registrada.</p>
                        ) : (
                            <div className="divide-y divide-brand-border dark:divide-dark-border">
                                {recentOrders.map((o: any) => (
                                    <div key={o.id} className="py-3 flex justify-between items-center">
                                        <div>
                                            <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">#{o.order_number || o.id.slice(0, 8)}</span>
                                            <span className="text-xs text-brand-inactive-text ml-2">{o.customer_name}</span>
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
                            Devoluções e Trocas ({returnsCount} total)
                        </h2>

                        {recentReturns.length === 0 ? (
                            <p className="text-sm text-brand-inactive-text py-4 text-center">Nenhuma solicitação de pós-venda.</p>
                        ) : (
                            <div className="divide-y divide-brand-border dark:divide-dark-border">
                                {recentReturns.map((r: any) => (
                                    <div key={r.id} className="py-3 flex justify-between items-center">
                                        <div>
                                            <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">#{r.id.slice(0, 8)}</span>
                                            <span className="text-xs text-brand-inactive-text ml-2 capitalize">{r.request_type}</span>
                                        </div>
                                        <Badge variant={r.status === "approved" || r.status === "APPROVED" ? "green" : "orange"}>{r.status}</Badge>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "audit" && (
                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                        <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading pb-3 border-b border-brand-border dark:border-dark-border">
                            Eventos de Auditoria & Moderação
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
                isOpen={suspendModalOpen}
                onClose={() => setSuspendModalOpen(false)}
                onConfirm={handleConfirmSuspend}
                title="Suspender Loja"
                description="A loja será desativada do marketplace e todos os seus anúncios ficarão ocultos."
                entityName={store.name}
                consequences={[
                    "Ocultação imediata dos produtos no catálogo",
                    "Bloqueio de novas vendas",
                    "Registro no Audit Log",
                ]}
                confirmText="Confirmar Suspensão"
                isPending={isPending}
            />

            <DestructiveActionModal
                isOpen={unsuspendModalOpen}
                onClose={() => setUnsuspendModalOpen(false)}
                onConfirm={handleConfirmUnsuspend}
                title="Reativar Loja"
                description="A loja e seus produtos voltarão a ficar visíveis no marketplace."
                entityName={store.name}
                consequences={[
                    "Reativação do perfil da loja",
                    "Desbloqueio de vendas",
                ]}
                confirmText="Confirmar Reativação"
                isPending={isPending}
            />
        </FadeIn>
    )
}

export default AdminPartnerDetailView
