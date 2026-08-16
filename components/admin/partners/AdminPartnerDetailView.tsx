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
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { getAdminPartnerDetail, suspendPartner, unsuspendPartner } from "@/app/actions/admin/enforcement"
import DestructiveActionModal from "@/components/admin/DestructiveActionModal"
import Link from "next/link"
import { toast } from "@/hooks/use-notification"

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

    // Modals
    const [suspendModalOpen, setSuspendModalOpen] = useState(false)
    const [unsuspendModalOpen, setUnsuspendModalOpen] = useState(false)

    const handleScroll = useCallback(() => {
        setIsScrolled((scrollRef.current?.scrollTop || 0) > 20)
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
                <IconPlaceholder
                    icon={StoreIcon}
                    containerSize="w-16 h-16 mb-2"
                    iconSize="w-6 h-6"
                    title="Loja não encontrada"
                    subtitle="A loja pode ter sido removida ou o link está incorreto."
                    itemButton={{
                        text: "Voltar para lista",
                        action: onBack,
                        variant: "outline",
                    }}
                />
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
                                                <span className="hidden md:inline truncate">{store.name}</span>
                                                <Badge variant={isSuspended ? "red" : "green"}>
                                                    {isSuspended ? "Suspensa" : "Ativa"}
                                                </Badge>
                                                <Badge variant={store.risk_score >= 50 ? "red" : store.risk_score >= 25 ? "orange" : "gray"}>
                                                    Risco: {store.risk_score || 0} pts
                                                </Badge>
                                            </h1>

                                            <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                                Responsável: {ownerProfile?.full_name || "Lojista"} • {ownerProfile?.email || "Sem e-mail"}
                                            </div>
                                        </div>

                                        {/* Desktop action buttons */}
                                        <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                            {isSuspended ? (
                                                <Button
                                                    variant="outline"
                                                    onClick={() => setUnsuspendModalOpen(true)}
                                                    className="text-brand-green border-brand-green/30 hover:bg-brand-green/10"
                                                >
                                                    Reativar Loja
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant="destructive"
                                                    onClick={() => setSuspendModalOpen(true)}
                                                >
                                                    Suspender Loja
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Title row - mobile */}
                                    <div className="md:hidden flex items-center gap-2 py-3">
                                        <Button variant="filled" onClick={onBack} className="w-9 h-9 p-0 flex items-center justify-center shrink-0">
                                            <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                        </Button>
                                        <div className="w-11 h-11 rounded-xl bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center overflow-hidden shrink-0">
                                            {store.logo_url ? (
                                                <img src={getR2ImageUrl(store.logo_url)} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <StoreIcon className="w-6 h-6 text-brand-inactive-text" />
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h1 className="text-lg font-bold text-brand-dark dark:text-dark-heading truncate">
                                                    {store.name}
                                                </h1>
                                                <Badge variant={isSuspended ? "red" : "green"}>
                                                    {isSuspended ? "Suspensa" : "Ativa"}
                                                </Badge>
                                            </div>
                                            <span className="text-xs text-brand-inactive-text truncate">
                                                {ownerProfile?.full_name || "Lojista"} • {ownerProfile?.email || "Sem e-mail"}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Tabs */}
                                    <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                            <TabsTrigger value="general">Dados da Loja</TabsTrigger>
                                            <TabsTrigger value="products">Produtos ({productsCount})</TabsTrigger>
                                            <TabsTrigger value="orders">Pedidos ({ordersCount})</TabsTrigger>
                                            <TabsTrigger value="returns">Devoluções ({returnsCount})</TabsTrigger>
                                            <TabsTrigger value="audit">Auditoria & Risco ({auditEvents.length})</TabsTrigger>
                                        </TabsList>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                                <Tabs value={activeTab} onValueChange={setActiveTab}>
                                    <TabsContent value="general" className="mt-0">
                                        <FadeIn key="general">
                                            {isSuspended && (
                                                <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-2xl flex items-start gap-3 mb-8">
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

                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                {/* Coluna principal */}
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <FormSection title="Informações Cadastrais" hasSeparator>
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
                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                        <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                            Proprietário / Titular
                                                        </h3>
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
                                        </FadeIn>
                                    </TabsContent>

                                    <TabsContent value="products" className="mt-0">
                                        <FadeIn key="products">
                                            <FormSection title={`Produtos Recentes (${productsCount} total)`} hasSeparator>
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
                                                        {recentProducts.map((p: any) => (
                                                            <ListItem
                                                                key={p.id}
                                                                left={
                                                                    <div className="w-12 h-12 rounded-lg bg-brand-gray dark:bg-dark-border/30 flex items-center justify-center overflow-hidden shrink-0">
                                                                        {p.image_url ? (
                                                                            <img src={getR2ImageUrl(p.image_url)} alt="" className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <IconPlaceholder
                                                                                icon={PackageIcon}
                                                                                containerSize="w-12 h-12"
                                                                                iconSize="w-5 h-5"
                                                                            />
                                                                        )}
                                                                    </div>
                                                                }
                                                                title={p.name}
                                                                right={
                                                                    <span className="font-bold text-sm text-brand-green shrink-0">
                                                                        {formatCurrency(Number(p.price || 0))}
                                                                    </span>
                                                                }
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </FormSection>
                                        </FadeIn>
                                    </TabsContent>

                                    <TabsContent value="orders" className="mt-0">
                                        <FadeIn key="orders">
                                            <FormSection title={`Vendas Recentes (${ordersCount} total)`} hasSeparator>
                                                {recentOrders.length === 0 ? (
                                                    <IconPlaceholder
                                                        icon={ShoppingCartIcon}
                                                        containerSize="w-14 h-14 mb-2"
                                                        iconSize="w-6 h-6"
                                                        title="Nenhuma venda registrada"
                                                        subtitle="Esta loja ainda não possui vendas."
                                                    />
                                                ) : (
                                                    <div className="space-y-4">
                                                        {recentOrders.map((o: any) => (
                                                            <ListItem
                                                                key={o.id}
                                                                icon={ShoppingCartIcon}
                                                                title={`#${o.order_number || o.id.slice(0, 8)}`}
                                                                description={o.customer_name}
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
                                            <FormSection title={`Devoluções e Trocas (${returnsCount} total)`} hasSeparator>
                                                {recentReturns.length === 0 ? (
                                                    <IconPlaceholder
                                                        icon={ReturnIcon}
                                                        containerSize="w-14 h-14 mb-2"
                                                        iconSize="w-6 h-6"
                                                        title="Nenhuma solicitação de pós-venda"
                                                        subtitle="Esta loja ainda não possui devoluções ou trocas."
                                                    />
                                                ) : (
                                                    <div className="space-y-4">
                                                        {recentReturns.map((r: any) => (
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
                                            <FormSection title="Eventos de Auditoria & Moderação" hasSeparator>
                                                {auditEvents.length === 0 ? (
                                                    <IconPlaceholder
                                                        icon={ClockIcon}
                                                        containerSize="w-14 h-14 mb-2"
                                                        iconSize="w-6 h-6"
                                                        title="Nenhum evento registrado"
                                                        subtitle="Não há eventos de auditoria ou moderação para esta loja."
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
                {isSuspended ? (
                    <Button
                        variant="outline"
                        className="flex-1 text-brand-green border-brand-green/30 hover:bg-brand-green/10"
                        onClick={() => setUnsuspendModalOpen(true)}
                    >
                        Reativar Loja
                    </Button>
                ) : (
                    <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={() => setSuspendModalOpen(true)}
                    >
                        Suspender Loja
                    </Button>
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
        </>
    )
}

export default AdminPartnerDetailView