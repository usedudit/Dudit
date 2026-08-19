"use client"

import React, { useState, useEffect, useCallback, useTransition } from "react"
import {
    ChevronLeftIcon,
    TruckIcon,
    PackageIcon,
    ClockIcon,
    StoreIcon,
    UserIcon,
    MailIcon,
    PhoneIcon,
    MapPinIcon,
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
    AlertModal,
} from "@/components/reusable"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"
import {
    getDeliveryDriverAdminAction,
    updateDeliveryDriverAdminAction,
} from "@/app/actions/admin/delivery-drivers"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import Link from "next/link"
import { toast } from "@/hooks/use-notification"
import { useSidebar } from "@/lib/sidebar-context"

interface AdminDeliveryDriverDetailViewProps {
    driverId: string
    onBack: () => void
    onDriverUpdated?: () => void
}

const ITEMS_PER_PAGE = 8

export function AdminDeliveryDriverDetailView({
    driverId,
    onBack,
    onDriverUpdated,
}: AdminDeliveryDriverDetailViewProps) {
    const [driver, setDriver] = useState<any | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [activeTab, setActiveTab] = useState("general")
    const [historyPage, setHistoryPage] = useState(1)
    const [isPending, startTransition] = useTransition()

    // Modals
    const [toggleModalOpen, setToggleModalOpen] = useState(false)

    let sidebarContext: ReturnType<typeof useSidebar> | null = null
    try {
        sidebarContext = useSidebar()
    } catch { }
    const setHeaderOverride = sidebarContext?.setHeaderOverride

    const handleBack = useCallback(() => onBack(), [onBack])

    const driverName = driver?.profile?.full_name || "Entregador"

    useEffect(() => {
        if (!setHeaderOverride) return
        setHeaderOverride({
            title: `Entregador: ${driverName}`,
            onBack: handleBack,
            isSubPage: true,
        })
        return () => setHeaderOverride(null)
    }, [driverName, handleBack, setHeaderOverride])

    const fetchDetail = useCallback(async () => {
        try {
            const res = await getDeliveryDriverAdminAction(driverId)
            if (res.success && res.driver) {
                setDriver(res.driver)
            } else {
                toast.error(res.error || "Erro ao carregar detalhes do entregador")
            }
        } catch (err) {
            console.error("Error fetching driver detail:", err)
            toast.error("Erro inesperado ao carregar entregador")
        } finally {
            setIsLoading(false)
        }
    }, [driverId])

    useEffect(() => {
        fetchDetail()
    }, [fetchDetail])

    const handleToggleStatus = () => {
        if (!driver) return
        startTransition(async () => {
            try {
                const res = await updateDeliveryDriverAdminAction({
                    driverId: driver.user_id,
                    city: driver.city,
                    neighborhood: driver.neighborhood,
                    vehicleType: driver.vehicle_type,
                    isActive: !driver.is_active,
                    notes: driver.notes || undefined,
                })
                if (res.success) {
                    toast.success(driver.is_active ? "Entregador desativado com sucesso." : "Entregador ativado com sucesso.")
                    setToggleModalOpen(false)
                    fetchDetail()
                    onDriverUpdated?.()
                } else {
                    toast.error(res.error || "Erro ao alterar status.")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado.")
            }
        })
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <ThreeDotsLoader />
            </div>
        )
    }

    if (!driver) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
                <IconPlaceholder
                    icon={TruckIcon}
                    title="Entregador não encontrado"
                    subtitle="O cadastro pode ter sido removido ou o ID está incorreto."
                    itemButton={{
                        text: "Voltar para lista",
                        action: onBack,
                        variant: "outline",
                    }}
                />
            </div>
        )
    }

    const profile = driver.profile || {}
    const assignments: any[] = driver.assignments || []
    const partners: any[] = driver.partners || []
    const metrics = driver.metrics || { total: 0, completed: 0, failed: 0, successRate: 0 }

    // Pagination for delivery assignments
    const paginatedAssignments = assignments.slice((historyPage - 1) * ITEMS_PER_PAGE, historyPage * ITEMS_PER_PAGE)
    const totalHistoryPages = Math.ceil(assignments.length / ITEMS_PER_PAGE) || 1

    return (
        <FadeIn className="flex flex-col bg-white dark:bg-dark-background min-h-screen">
            {/* Header Desktop */}
            <div className="hidden md:flex items-center justify-between px-8 py-5 border-b border-brand-border dark:border-dark-border">
                <div className="flex items-center gap-4">
                    <Button
                        variant="filled"
                        onClick={onBack}
                        className="w-10 h-10 p-0 flex items-center justify-center rounded-xl"
                    >
                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                    </Button>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading tracking-tight truncate">
                                {profile.full_name || "Entregador"}
                            </h1>
                            <Badge variant={driver.is_active ? "green" : "red"}>
                                {driver.is_active ? "Ativo" : "Inativo"}
                            </Badge>
                            <Badge variant={driver.availability_status === "available" ? "blue" : "gray"}>
                                {driver.availability_status === "available" ? "Disponível" : "Offline"}
                            </Badge>
                            <Badge variant="purple" className="capitalize">
                                {driver.vehicle_type === "moto" ? "Motocicleta" : "Automóvel"}
                            </Badge>
                        </div>
                        <p className="text-xs text-brand-inactive-text mt-0.5">
                            {driver.email || "Sem e-mail cadastrado"} • ID: <span className="font-mono">{driver.user_id}</span>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    {driver.is_active ? (
                        <Button
                            variant="destructive"
                            onClick={() => setToggleModalOpen(true)}
                        >
                            Desativar Entregador
                        </Button>
                    ) : (
                        <Button
                            variant="outline"
                            onClick={() => setToggleModalOpen(true)}
                            className="text-brand-green border-brand-green/30 hover:bg-brand-green/10"
                        >
                            Ativar Entregador
                        </Button>
                    )}
                </div>
            </div>

            <div className="w-full max-w-[1200px] mx-auto px-4 md:px-8 py-6 space-y-6">
                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <div className="mb-6">
                        <TabsList className="px-0">
                            <TabsTrigger value="general" icon={UserIcon}>
                                Dados Cadastrais & Métricas
                            </TabsTrigger>
                            <TabsTrigger
                                value="history"
                                icon={TruckIcon}
                                badge={<TabCountBadge count={assignments.length} variant="gray" />}
                            >
                                Histórico de Entregas
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    {/* Aba 1: Dados & Métricas */}
                    <TabsContent value="general" className="mt-0">
                        <FadeIn key="general" className="space-y-6">
                            {/* Cards de Métricas */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <div className="p-4 bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border">
                                    <span className="text-xs text-brand-inactive-text font-medium">Entregas Concluídas</span>
                                    <p className="text-2xl font-bold text-brand-green mt-1">{metrics.completed}</p>
                                </div>
                                <div className="p-4 bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border">
                                    <span className="text-xs text-brand-inactive-text font-medium">Total de Atribuições</span>
                                    <p className="text-2xl font-bold text-brand-dark dark:text-dark-heading mt-1">{metrics.total}</p>
                                </div>
                                <div className="p-4 bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border">
                                    <span className="text-xs text-brand-inactive-text font-medium">Taxa de Sucesso</span>
                                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{metrics.successRate}%</p>
                                </div>
                                <div className="p-4 bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border">
                                    <span className="text-xs text-brand-inactive-text font-medium">Falhas / Cancelamentos</span>
                                    <p className="text-2xl font-bold text-brand-red mt-1">{metrics.failed}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                {/* Coluna principal: Informações Cadastrais */}
                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                    <FormSection title="Informações do Entregador" hasSeparator>
                                        <div className="flex items-center gap-4 mb-6">
                                            <UserProfileImage
                                                fullName={profile.full_name || "Entregador"}
                                                imageUrl={profile.avatar_url}
                                                className="w-16 h-16 text-2xl shrink-0"
                                            />
                                            <div className="flex flex-col min-w-0">
                                                <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading truncate">
                                                    {profile.full_name || "Entregador"}
                                                </h3>
                                                <span className="text-xs text-brand-inactive-text">
                                                    Cadastrado em {formatDate(driver.created_at)}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <span className="text-xs font-semibold text-brand-inactive-text block">Telefone / WhatsApp</span>
                                                <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block">
                                                    {profile.phone || "Não informado"}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-xs font-semibold text-brand-inactive-text block">E-mail</span>
                                                <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block">
                                                    {driver.email || "Não informado"}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-xs font-semibold text-brand-inactive-text block">Cidade</span>
                                                <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block">
                                                    {driver.city}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-xs font-semibold text-brand-inactive-text block">Bairro</span>
                                                <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block">
                                                    {driver.neighborhood}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-xs font-semibold text-brand-inactive-text block">Veículo</span>
                                                <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block capitalize">
                                                    {driver.vehicle_type === "moto" ? "Motocicleta" : "Automóvel"}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-xs font-semibold text-brand-inactive-text block">Disponibilidade</span>
                                                <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block capitalize">
                                                    {driver.availability_status === "available" ? "Disponível para corridas" : "Offline"}
                                                </span>
                                            </div>
                                            {driver.terms_accepted_at && (
                                                <div>
                                                    <span className="text-xs font-semibold text-brand-inactive-text block">Termos de Uso</span>
                                                    <span className="text-xs text-brand-dark dark:text-dark-heading mt-0.5 block">
                                                        Aceito em {formatDateTime(driver.terms_accepted_at)}
                                                    </span>
                                                </div>
                                            )}
                                            {driver.notes && (
                                                <div className="sm:col-span-2">
                                                    <span className="text-xs font-semibold text-brand-inactive-text block">Observações</span>
                                                    <p className="text-sm text-brand-dark dark:text-dark-heading mt-0.5 p-3 rounded-xl bg-brand-gray/30 dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                                                        {driver.notes}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </FormSection>
                                </div>

                                {/* Sidebar: Lojas Parceiras Vinculadas */}
                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border space-y-6">
                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden transition-colors">
                                        <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>
                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                            Lojas Vinculadas ({partners.length})
                                        </h3>
                                        {partners.length === 0 ? (
                                            <p className="text-xs text-brand-inactive-text">
                                                Entregador autônomo da plataforma (atende a todas as lojas da região sem vínculos exclusivos).
                                            </p>
                                        ) : (
                                            <div className="space-y-3">
                                                {partners.map((partner: any) => (
                                                    <div key={partner.id} className="p-3 rounded-xl border border-brand-border dark:border-dark-border flex items-center justify-between">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <StoreIcon size={16} className="text-brand-inactive-text shrink-0" />
                                                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                                                {partner.partner_name || "Loja Parceira"}
                                                            </span>
                                                        </div>
                                                        <Badge variant={partner.is_active ? "green" : "gray"}>
                                                            {partner.is_active ? "Ativo" : "Inativo"}
                                                        </Badge>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </FadeIn>
                    </TabsContent>

                    {/* Aba 2: Histórico de Entregas */}
                    <TabsContent value="history" className="mt-0">
                        <FadeIn key="history">
                            <FormSection title={`Histórico de Entregas (${assignments.length})`} hasSeparator>
                                {assignments.length === 0 ? (
                                    <div className="py-12">
                                        <IconPlaceholder
                                            icon={TruckIcon}
                                            title="Nenhuma entrega registrada"
                                            subtitle="Este entregador ainda não realizou corridas pela plataforma."
                                        />
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {/* Desktop Table */}
                                        <div className="hidden md:block overflow-hidden rounded-2xl border border-brand-border dark:border-dark-border">
                                            <table className="w-full text-left text-sm">
                                                <thead className="bg-brand-gray/80 dark:bg-dark-border/40 text-brand-inactive-text font-medium border-b border-brand-border dark:border-dark-border">
                                                    <tr>
                                                        <th className="py-3 px-4">Pedido</th>
                                                        <th className="py-3 px-4">Loja</th>
                                                        <th className="py-3 px-4">Taxa de Entrega</th>
                                                        <th className="py-3 px-4">Data</th>
                                                        <th className="py-3 px-4 text-center">Status</th>
                                                        <th className="py-3 px-4 text-right">Ações</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-brand-border/60 dark:divide-dark-border/40">
                                                    {paginatedAssignments.map((a: any) => (
                                                        <tr key={a.id} className="hover:bg-brand-gray/30 dark:hover:bg-dark-border/20 transition-colors">
                                                            <td className="py-3 px-4 font-mono font-bold text-brand-dark dark:text-dark-heading">
                                                                #{String(a.order_id).slice(0, 8)}
                                                            </td>
                                                            <td className="py-3 px-4 text-brand-dark dark:text-dark-heading font-medium">
                                                                {a.partner_name || "Loja Parceira"}
                                                            </td>
                                                            <td className="py-3 px-4 font-bold text-brand-dark dark:text-dark-heading">
                                                                {formatCurrency(Number(a.delivery_fee || 0))}
                                                            </td>
                                                            <td className="py-3 px-4 text-xs text-brand-inactive-text">
                                                                {formatDateTime(a.assigned_at)}
                                                            </td>
                                                            <td className="py-3 px-4 text-center">
                                                                <Badge variant={a.status === "delivered" ? "green" : a.status === "failed" ? "red" : "blue"}>
                                                                    {a.status === "delivered" ? "Entregue" : a.status === "failed" ? "Falhou" : a.status === "out_for_delivery" ? "Em rota" : a.status}
                                                                </Badge>
                                                            </td>
                                                            <td className="py-3 px-4 text-right">
                                                                <Link
                                                                    href={`/ddt-admin/orders?view=${a.order_id}`}
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

                                        {/* Mobile Cards */}
                                        <div className="md:hidden space-y-3">
                                            {paginatedAssignments.map((a: any) => (
                                                <div key={a.id} className="p-4 rounded-xl border border-brand-border dark:border-dark-border space-y-2">
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex flex-col">
                                                            <span className="font-mono font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                                Pedido #{String(a.order_id).slice(0, 8)}
                                                            </span>
                                                            <span className="text-xs text-brand-inactive-text">
                                                                {a.partner_name}
                                                            </span>
                                                        </div>
                                                        <Badge variant={a.status === "delivered" ? "green" : a.status === "failed" ? "red" : "blue"}>
                                                            {a.status === "delivered" ? "Entregue" : a.status === "failed" ? "Falhou" : a.status}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex items-center justify-between text-xs pt-2 border-t border-brand-border dark:border-dark-border">
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(Number(a.delivery_fee || 0))}</span>
                                                        <Link href={`/ddt-admin/orders?view=${a.order_id}`} className="font-bold text-brand-green">
                                                            Ver Pedido →
                                                        </Link>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Pagination */}
                                        {totalHistoryPages > 1 && (
                                            <div className="pt-4">
                                                <Pagination
                                                    currentPage={historyPage}
                                                    totalPages={totalHistoryPages}
                                                    onPageChange={setHistoryPage}
                                                    inline
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </FormSection>
                        </FadeIn>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Modal: Ativar/Desativar */}
            <AlertModal
                isOpen={toggleModalOpen}
                onClose={() => setToggleModalOpen(false)}
                onConfirm={handleToggleStatus}
                title={driver.is_active ? "Desativar Entregador" : "Ativar Entregador"}
                description={
                    driver.is_active
                        ? `Tem certeza que deseja desativar o cadastro de ${profile.full_name || driver.email}? O entregador não receberá novas corridas e ficará offline.`
                        : `Deseja reativar o acesso de ${profile.full_name || driver.email}?`
                }
                confirmText={driver.is_active ? "Desativar" : "Ativar"}
                variant={driver.is_active ? "danger" : "success"}
            />
        </FadeIn>
    )
}

export default AdminDeliveryDriverDetailView
