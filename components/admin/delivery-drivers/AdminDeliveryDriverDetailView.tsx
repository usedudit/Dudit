"use client"

import React, { useState, useEffect, useRef, useCallback, useTransition } from "react"
import {
    ChevronLeftIcon,
    TruckIcon,
    StoreIcon,
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
    ListItem,
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
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

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

    const handleScroll = useCallback(() => {
        setIsScrolled((scrollRef.current?.scrollTop || 0) > 20)
    }, [])

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

    const ToggleActionButton = ({ full }: { full?: boolean }) => (
        driver.is_active ? (
            <Button
                variant="destructive"
                onClick={() => setToggleModalOpen(true)}
                className={full ? "flex-1" : ""}
            >
                Desativar Entregador
            </Button>
        ) : (
            <Button
                variant="outline"
                onClick={() => setToggleModalOpen(true)}
                className={`text-brand-green border-brand-green/30 hover:bg-brand-green/10 ${full ? "flex-1" : ""}`}
            >
                Ativar Entregador
            </Button>
        )
    )

    return (
        <>
            <FadeIn>
                <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
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
                                                <span className="hidden md:inline truncate">{profile.full_name || "Entregador"}</span>
                                                <Badge variant={driver.is_active ? "green" : "red"}>
                                                    {driver.is_active ? "Ativo" : "Inativo"}
                                                </Badge>
                                                <Badge variant={driver.availability_status === "available" ? "blue" : "gray"}>
                                                    {driver.availability_status === "available" ? "Disponível" : "Offline"}
                                                </Badge>
                                                <Badge variant="purple">
                                                    {driver.vehicle_type === "moto" ? "Motocicleta" : "Automóvel"}
                                                </Badge>
                                            </h1>

                                            <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                                Cadastrado em {formatDate(driver.created_at)} • {driver.city || "Cidade não informada"} • UUID: {driver.user_id}
                                            </div>
                                        </div>

                                        {/* Desktop action buttons */}
                                        <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                            <ToggleActionButton />
                                        </div>
                                    </div>

                                    {/* Tabs */}
                                    <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                            <TabsTrigger value="general">Dados & Métricas</TabsTrigger>
                                            <TabsTrigger
                                                value="history"
                                                badge={<TabCountBadge count={assignments.length} variant="gray" />}
                                            >
                                                Histórico de Entregas
                                            </TabsTrigger>
                                        </TabsList>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                                <Tabs value={activeTab} onValueChange={setActiveTab}>
                                    {/* Aba 1: Dados & Métricas */}
                                    <TabsContent value="general" className="mt-0">
                                        <FadeIn key="general">
                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                {/* Coluna principal: Informações Cadastrais */}
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <FormSection title="Informações do Entregador" hasSeparator>
                                                        <ListItem
                                                            left={
                                                                <UserProfileImage
                                                                    fullName={profile.full_name || "Entregador"}
                                                                    imageUrl={profile.avatar_url}
                                                                    className="w-12 h-12 text-lg shrink-0"
                                                                />
                                                            }
                                                            title={profile.full_name || "Entregador"}
                                                            description={`Cadastrado em ${formatDate(driver.created_at)}`}
                                                        />

                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                                            <div>
                                                                <span className="text-xs font-semibold text-brand-inactive-text block">Telefone / WhatsApp</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block">
                                                                    {profile.phone || "Não informado"}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <span className="text-xs font-semibold text-brand-inactive-text block">E-mail</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 break-all">
                                                                    {driver.email || "Não informado"}
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
                                                            <div className="sm:col-span-2">
                                                                <span className="text-xs font-semibold text-brand-inactive-text block">Endereço de Atuação</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading mt-0.5 block">
                                                                    {driver.street
                                                                        ? `${driver.street}, ${driver.number || "S/N"}${driver.complement ? ` - ${driver.complement}` : ""} - ${driver.neighborhood}, ${driver.city} - ${driver.state || "SP"}`
                                                                        : `${driver.neighborhood || "-"}, ${driver.city || "-"}${driver.state ? ` - ${driver.state}` : ""}`}
                                                                </span>
                                                                {driver.zip_code && (
                                                                    <span className="text-xs text-brand-inactive-text block mt-0.5">
                                                                        CEP: {driver.zip_code}
                                                                    </span>
                                                                )}
                                                                {driver.latitude && driver.longitude && (
                                                                    <a
                                                                        href={`https://www.google.com/maps/search/?api=1&query=${driver.latitude},${driver.longitude}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="inline-flex items-center gap-1 text-xs text-brand-primary hover:underline mt-1 font-medium"
                                                                    >
                                                                        Ver coordenadas no Google Maps ({Number(driver.latitude).toFixed(5)}, {Number(driver.longitude).toFixed(5)})
                                                                    </a>
                                                                )}
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

                                                {/* Sidebar */}
                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    {/* Card de Desempenho */}
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                        <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                            Desempenho
                                                        </h3>
                                                        <div className="space-y-2.5 text-sm">
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Entregas concluídas</span>
                                                                <span className="font-semibold text-brand-green">{metrics.completed}</span>
                                                            </div>
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Total de atribuições</span>
                                                                <span className="font-semibold text-brand-dark dark:text-dark-heading">{metrics.total}</span>
                                                            </div>
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Taxa de sucesso</span>
                                                                <span className="font-semibold text-blue-600 dark:text-blue-400">{metrics.successRate}%</span>
                                                            </div>
                                                            <div className="pt-3 border-t border-brand-border dark:border-dark-border flex justify-between items-center">
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">Falhas / Cancelamentos</span>
                                                                <span className="font-bold text-red-600 dark:text-red-400">{metrics.failed}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Card de Lojas Vinculadas */}
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
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

                                                    {/* Card de Identificadores */}
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                            Identificadores
                                                        </h3>
                                                        <div className="space-y-2 text-xs">
                                                            <div>
                                                                <span className="text-brand-inactive-text block">UUID do Entregador</span>
                                                                <span className="font-mono text-brand-dark dark:text-dark-heading select-all break-all">{driver.user_id}</span>
                                                            </div>
                                                        </div>
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
                                                        <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                                            <div className="overflow-x-auto pb-4 custom-scrollbar">
                                                                <table className="w-full text-left border-separate border-spacing-0 min-w-[900px]">
                                                                    <thead>
                                                                        <tr className="bg-brand-gray dark:bg-dark-border/50 select-none">
                                                                            <th className="py-3 px-2 pl-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">
                                                                                Pedido
                                                                            </th>
                                                                            <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">
                                                                                Loja
                                                                            </th>
                                                                            <th className="py-3 px-2 w-36 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                                                Taxa de Entrega
                                                                            </th>
                                                                            <th className="py-3 px-2 w-40 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                                                Data
                                                                            </th>
                                                                            <th className="py-3 px-2 w-32 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                                                Status
                                                                            </th>
                                                                            <th className="py-3 px-2 w-32 pr-6 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                                                Ações
                                                                            </th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {paginatedAssignments.map((a: any) => (
                                                                            <tr key={a.id} className="bg-white dark:bg-dark-background hover:bg-brand-gray dark:hover:bg-dark-border/10 transition-colors">
                                                                                <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border text-left">
                                                                                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading font-mono">
                                                                                        #{String(a.order_id).slice(0, 8)}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                                                                                    <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                                                                        {a.partner_name || "Loja Parceira"}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                                                                                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                                                                        {formatCurrency(Number(a.delivery_fee || 0))}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                                                                                    <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                                                                                        {formatDateTime(a.assigned_at)}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                                                                                    <div className="flex justify-center">
                                                                                        <Badge variant={a.status === "delivered" ? "green" : a.status === "failed" ? "red" : "blue"}>
                                                                                            {a.status === "delivered" ? "Entregue" : a.status === "failed" ? "Falhou" : a.status === "out_for_delivery" ? "Em rota" : a.status}
                                                                                        </Badge>
                                                                                    </div>
                                                                                </td>
                                                                                <td className="p-2 pr-6 border-b border-brand-border dark:border-dark-border text-center">
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
                        </div>
                    </Tabs>
                </div>
            </FadeIn>

            {/* Mobile bottom bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                <ToggleActionButton full />
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
        </>
    )
}

export default AdminDeliveryDriverDetailView
