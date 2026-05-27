"use client"

import { useMemo, useRef, useState, useCallback, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { toast } from "@/hooks/use-notification"

import { FadeIn } from "@/components/animations/FadeIn"
import { usePickerBucket } from "@/components/erp/hooks"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import {
    Badge,
    Button,
    CustomerCard,
    DatePicker,
    FormDropdown,
    Input,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    TimePicker,
    InfoCard,
} from "@/components/reusable"
import {
    createERPDeliveryAction,
    fetchDeliveryOrderBucketAction,
    fetchDeliveryPeopleBucketAction,
    getERPDeliveryPlanAccessAction,
} from "@/app/actions/erp/deliveries"
import {
    CalendarIcon,
    ChevronLeftIcon,
    SaveIcon,
    SearchIcon,
    TrashIcon,
} from "@/lib/icons"
import { getDeliveryStatusMeta, getPaymentStatusMeta } from "@/lib/orders/status"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency, formatDate } from "@/lib/utils"

type DeliveryPerson = { id: string; userId?: string; fullName: string }

type OrderPickerItem = {
    id: string
    displayId: string
    totalAmount: number
    orderDate?: string | null
    status: string
    deliveryStatus: string
    shippingFee: number
    deliveryFee?: number
    distanceKm?: number | null
    deliveryBreakdown?: Record<string, any> | null
    customer?: { id: string | null; name: string; email?: string | null; phone?: string | null } | null
    address?: string
    items?: Array<{
        id: string
        product_name?: string | null
        quantity?: number | null
        products?: {
            sku?: string | null
            images?: string[] | string | null
        } | null
    }>
}

function toLocalDateInput(value: Date | string | undefined) {
    if (!value) return ""

    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return ""

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

function buildCustomerAddress(address?: string) {
    if (!address) return null
    return {
        street: address,
    }
}

function getOrderPreviewImage(order?: OrderPickerItem | null) {
    const firstItemImage = order?.items?.find((item) => item?.products?.images)?.products?.images
    return getR2ImageUrl(firstItemImage || null, "thumb")
}

export default function CreateDeliveryPage({
    partnerId,
    onBack,
    onSuccess,
    initialOrderIds,
}: {
    partnerId: string
    onBack: () => void
    onSuccess: () => void
    initialOrderIds?: string[]
}) {
    const { openPlanUpgrade } = usePlanUpgrade()

    const [activeTab, setActiveTab] = useState("Pedidos")
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
    const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([])
    const [selectedDeliveryPersonId, setSelectedDeliveryPersonId] = useState<string>("")
    const [status, setStatus] = useState("pending")
    const [date, setDate] = useState("")
    const [time, setTime] = useState("")
    const [notes, setNotes] = useState("")
    const [isSaving, setIsSaving] = useState(false)
    const [isOrderSearchOpen, setIsOrderSearchOpen] = useState(false)
    const [planAccess, setPlanAccess] = useState<{ allowed: boolean; maxOrders: number; planSlug: string; message?: string | null } | null>(null)

    const handleBack = useCallback(() => onBack(), [onBack])
    const searchRef = useRef<HTMLDivElement>(null)
    const [deliveryPeople, setDeliveryPeople] = useState<DeliveryPerson[]>([])

    const orderPicker = usePickerBucket<OrderPickerItem>(
        () => fetchDeliveryOrderBucketAction(partnerId) as Promise<OrderPickerItem[]>,
        (order, q) =>
            String(order.displayId || "").toLowerCase().includes(q) ||
            String(order.customer?.name || "").toLowerCase().includes(q),
        { pageSize: 8 }
    )

    useEffect(() => {
        if (!initialOrderIds || initialOrderIds.length === 0) return
        setSelectedOrderIds(Array.from(new Set(initialOrderIds)).filter(Boolean))
        // Best effort: load bucket so selected items can render quickly
        void orderPicker.loadBucket()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [partnerId])

    useEffect(() => {
        let mounted = true
        const run = async () => {
            const res = await getERPDeliveryPlanAccessAction(partnerId)
            if (!mounted) return
            if (res.success) {
                setPlanAccess({
                    allowed: res.allowed,
                    maxOrders: Number(res.maxOrders || 0),
                    planSlug: String(res.planSlug || "free"),
                    message: res.message,
                })
            } else {
                setPlanAccess(null)
            }
        }
        run()
        return () => { mounted = false }
    }, [partnerId])

    const selectedOrders = useMemo(() => {
        const byId = new Map(orderPicker.filtered.map((o) => [o.id, o]))
        return selectedOrderIds.map((id) => byId.get(id)).filter(Boolean) as OrderPickerItem[]
    }, [orderPicker.filtered, selectedOrderIds])

    const primaryOrder = selectedOrders[0] || null

    const selectedStatusMeta = getDeliveryStatusMeta(status)
    const paymentMeta = getPaymentStatusMeta(primaryOrder?.status)
    const deliveryMeta = getDeliveryStatusMeta(primaryOrder?.deliveryStatus)

    const customerAddress = useMemo(
        () => buildCustomerAddress(primaryOrder?.address),
        [primaryOrder?.address]
    )

    const loadDeliveryPeople = async () => {
        if (deliveryPeople.length > 0) return
        const list = await fetchDeliveryPeopleBucketAction(partnerId)
        setDeliveryPeople(list as DeliveryPerson[])
    }

    const handleSave = async () => {
        if (selectedOrderIds.length === 0 || !date || !time) return

        setIsSaving(true)
        try {
            const startedAt = new Date(`${date}T${time}:00`).toISOString()
            const response = await createERPDeliveryAction({
                partnerId,
                orderIds: selectedOrderIds,
                deliveryPersonId: selectedDeliveryPersonId || null,
                status: status as any,
                startedAt,
                notes,
            })
            if (response.success) {
                toast.success("Entrega criada com sucesso!")
                onSuccess()
            } else {
                toast.error(response.error || "Erro ao criar entrega.")
            }
        } catch (err: any) {
            toast.error(err?.message || "Erro inesperado ao criar entrega.")
        } finally {
            setIsSaving(false)
        }
    }

    const maxOrders = planAccess?.allowed ? (planAccess?.maxOrders ?? 1) : 0
    const isBlocked = planAccess?.allowed === false
    const canAddMore = maxOrders <= 0 ? true : selectedOrderIds.length < maxOrders

    const toggleOrder = (orderId: string) => {
        setSelectedOrderIds((prev) => {
            const exists = prev.includes(orderId)
            if (exists) return prev.filter((id) => id !== orderId)
            if (!canAddMore) return prev
            return [...prev, orderId]
        })
    }

    return (
        <FadeIn className="relative flex h-[calc(100vh-65px)] flex-col overflow-hidden bg-white dark:bg-dark-background">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full w-full flex-col">
                <div className="sticky top-0 z-30 w-full border-b border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface">
                    <div className="relative mx-auto max-w-[1300px] px-4 md:px-6 md:pt-4">
                        <div className="hidden items-start justify-between md:flex">
                            <div className="flex items-start gap-3">
                                <Button variant="filled" onClick={handleBack} className="h-10 w-10 p-0">
                                    <ChevronLeftIcon className="h-5 w-5" />
                                </Button>
                                <div>
                                    <h1 className="text-xl font-bold text-brand-dark dark:text-dark-heading md:text-3xl">
                                        Nova entrega
                                    </h1>
                                    <p className="text-[15px] font-medium text-brand-inactive-text dark:text-dark-body">
                                        Selecione pedidos, atribua um entregador e defina a saída.
                                    </p>
                                </div>
                            </div>

                            <div className="hidden items-center gap-3 md:flex">
                                <Button variant="outline" onClick={handleBack} disabled={isSaving}>
                                    Cancelar
                                </Button>
                                <Button onClick={handleSave} disabled={isSaving || selectedOrderIds.length === 0 || !date || !time || isBlocked}>
                                    <SaveIcon className="mr-2 h-4 w-4" />
                                    {isSaving ? "Salvando..." : "Salvar"}
                                </Button>
                            </div>
                        </div>

                        <div className="w-full md:mt-4">
                            <TabsList className="w-full justify-start gap-6 border-b-0 bg-transparent p-0">
                                <TabsTrigger value="Pedidos" className="px-0 pb-3" onClick={() => setStep(1)}>
                                    1. Pedidos
                                </TabsTrigger>
                                <TabsTrigger value="Entregador" className="px-0 pb-3" onClick={() => setStep(2)}>
                                    2. Entregador
                                </TabsTrigger>
                                <TabsTrigger value="Saida" className="px-0 pb-3" onClick={() => setStep(3)}>
                                    3. Saída
                                </TabsTrigger>
                                <TabsTrigger value="Revisao" className="px-0 pb-3" onClick={() => setStep(4)}>
                                    4. Revisão
                                </TabsTrigger>
                            </TabsList>
                        </div>
                    </div>
                </div>

                <div className="mx-auto flex-1 w-full max-w-[1300px] overflow-y-auto px-4 py-6 pb-24 md:px-6 md:pb-8">
                    <AnimatePresence mode="wait">
                        <FadeIn key={activeTab}>
                            <TabsContent value="Pedidos" className="mt-0">
                                <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                    <div className="col-span-12 space-y-8 lg:col-span-8 lg:pr-12">
                                        {isBlocked ? (
                                            <InfoCard
                                                color="yellow"
                                                title="Plano necessário"
                                                message={planAccess?.message || "Seu plano atual não possui acesso ao módulo de entregas."}
                                            />
                                        ) : planAccess?.message ? (
                                            <InfoCard
                                                color="blue"
                                                title="Limite do plano"
                                                message={planAccess.message}
                                                className="mb-4"
                                            />
                                        ) : null}

                                        <section className="space-y-4">
                                            <div ref={searchRef} className="relative">
                                                <Input
                                                    placeholder="Pesquise pelo ID do pedido ou cliente..."
                                                    value={orderPicker.searchQuery}
                                                    onChange={(event) => {
                                                        orderPicker.setSearchQuery(event.target.value)
                                                        setIsOrderSearchOpen(true)
                                                    }}
                                                    onFocus={() => {
                                                        setIsOrderSearchOpen(true)
                                                        void orderPicker.loadBucket()
                                                    }}
                                                    prefix={<SearchIcon size={18} className="shrink-0 text-brand-inactive-text" />}
                                                    label=""
                                                    variant="full-rounded"
                                                />

                                                {isOrderSearchOpen && orderPicker.searchQuery.trim() && (
                                                    <FadeIn className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-y-auto overflow-hidden rounded-2xl border border-brand-border bg-white shadow-xl dark:border-dark-border dark:bg-dark-surface">
                                                        {orderPicker.displayed.map((order) => {
                                                            const searchPaymentMeta = getPaymentStatusMeta(order.status)
                                                            const searchDeliveryMeta = getDeliveryStatusMeta(order.deliveryStatus)
                                                            const isSelected = selectedOrderIds.includes(order.id)
                                                            const isDisabled = !isSelected && !canAddMore

                                                            return (
                                                                <button
                                                                    key={order.id}
                                                                    type="button"
                                                                    disabled={isDisabled}
                                                                    className={`w-full border-b border-brand-border p-3 text-left transition-colors last:border-0 dark:border-dark-border ${isDisabled ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50 dark:hover:bg-dark-border"}`}
                                                                    onClick={() => {
                                                                        toggleOrder(order.id)
                                                                        orderPicker.setSearchQuery(order.displayId || "")
                                                                        setIsOrderSearchOpen(false)
                                                                    }}
                                                                >
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-brand-border bg-brand-gray dark:border-dark-border dark:bg-dark-border/40">
                                                                            <img
                                                                                src={getOrderPreviewImage(order)}
                                                                                alt={order.displayId}
                                                                                className="h-full w-full object-cover"
                                                                            />
                                                                        </div>

                                                                        <div className="min-w-0 flex-1">
                                                                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                                {order.displayId}
                                                                            </div>
                                                                            <div className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                                                                {order.customer?.name || "Cliente"} • {order.orderDate ? formatDate(order.orderDate) : "-"}
                                                                            </div>
                                                                        </div>

                                                                        <div className="flex shrink-0 flex-col items-end gap-1">
                                                                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                                {formatCurrency(order.totalAmount || 0)}
                                                                            </div>
                                                                            <div className="flex items-center gap-1">
                                                                                <Badge variant={searchPaymentMeta.variant} className="scale-90 whitespace-nowrap">
                                                                                    {searchPaymentMeta.label}
                                                                                </Badge>
                                                                                <Badge variant={searchDeliveryMeta.variant} className="scale-90 whitespace-nowrap">
                                                                                    {searchDeliveryMeta.label}
                                                                                </Badge>
                                                                            </div>
                                                                            {isSelected ? (
                                                                                <span className="text-[11px] font-bold text-brand-green">Selecionado</span>
                                                                            ) : null}
                                                                        </div>
                                                                    </div>
                                                                </button>
                                                            )
                                                        })}
                                                    </FadeIn>
                                                )}
                                            </div>

                                            {selectedOrders.length > 0 ? (
                                                <div className="overflow-hidden rounded-2xl border border-brand-border dark:border-dark-border">
                                                    <div className="border-b border-brand-border bg-brand-gray p-6 dark:border-dark-border dark:bg-dark-border/50">
                                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                                                    Pedidos selecionados:
                                                                </span>
                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                    {selectedOrders.length}
                                                                </span>
                                                                {maxOrders === 1 ? (
                                                                    <span className="text-xs font-medium text-brand-inactive-text">
                                                                        (limite do plano)
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="bg-white dark:bg-dark-surface divide-y divide-brand-border dark:divide-dark-border">
                                                        {selectedOrders.map((order) => (
                                                            <div key={order.id} className="p-4 flex items-center justify-between gap-4">
                                                                <div className="min-w-0">
                                                                    <p className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                                        {order.displayId}
                                                                    </p>
                                                                    <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                                                        {order.customer?.name || "Cliente"} • {order.orderDate ? formatDate(order.orderDate) : "-"}
                                                                    </p>
                                                                </div>
                                                                <div className="flex items-center gap-2 shrink-0">
                                                                    <Badge variant={getPaymentStatusMeta(order.status).variant}>
                                                                        {getPaymentStatusMeta(order.status).label}
                                                                    </Badge>
                                                                    <Badge variant={getDeliveryStatusMeta(order.deliveryStatus).variant}>
                                                                        {getDeliveryStatusMeta(order.deliveryStatus).label}
                                                                    </Badge>
                                                                    <button
                                                                        type="button"
                                                                        className="p-2 text-brand-inactive-text hover:text-brand-red transition-colors"
                                                                        onClick={() => toggleOrder(order.id)}
                                                                        title="Remover"
                                                                    >
                                                                        <TrashIcon className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : null}
                                        </section>

                                        {primaryOrder && (
                                            <>
                                                <div className="h-px w-full bg-brand-border dark:bg-dark-border" />

                                                <section>
                                                    <h3 className="mb-4 text-lg font-bold text-brand-dark dark:text-dark-heading">
                                                        Informacoes da Entrega
                                                    </h3>
                                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                                        <FormDropdown
                                                            label="Carrier / Entregador"
                                                            value={selectedDeliveryPersonId || "none"}
                                                            setValue={(value) => setSelectedDeliveryPersonId(value === "none" ? "" : value)}
                                                            options={[
                                                                { value: "none", label: "Sem entregador (não atribuido)" },
                                                                ...deliveryPeople.map((person) => ({
                                                                    value: person.id,
                                                                    label: person.fullName,
                                                                })),
                                                            ]}
                                                            onFocus={() => {
                                                                void loadDeliveryPeople()
                                                            }}
                                                        />

                                                        <FormDropdown
                                                            label="Status"
                                                            value={status}
                                                            setValue={setStatus}
                                                            options={[
                                                                { value: "pending", label: "Pendente" },
                                                                { value: "preparing", label: "Em preparação" },
                                                                { value: "sent", label: "Saiu para entrega" },
                                                                { value: "delivered", label: "Concluída" },
                                                                { value: "cancelled", label: "Cancelada" },
                                                            ]}
                                                        />

                                                        <DatePicker
                                                            label="Data de saida"
                                                            value={date}
                                                            onChange={(nextDate) => setDate(toLocalDateInput(nextDate))}
                                                            placeholder="Selecione a data"
                                                        />

                                                        <TimePicker
                                                            label="Horario de saida"
                                                            value={time}
                                                            onChange={setTime}
                                                            placeholder="Selecione o horario"
                                                        />
                                                    </div>

                                                    <div className="mt-4 rounded-2xl border border-brand-border p-4 dark:border-dark-border">
                                                        <span className="mr-2 text-sm font-medium text-brand-inactive-text">
                                                            Status selecionado:
                                                        </span>
                                                        <Badge variant={selectedStatusMeta.variant}>{selectedStatusMeta.label}</Badge>
                                                    </div>
                                                </section>

                                                <div className="h-px w-full bg-brand-border dark:bg-dark-border" />

                                                <section>
                                                    <h3 className="mb-4 text-lg font-bold text-brand-dark dark:text-dark-heading">
                                                        Itens do Pedido (visualização do primeiro)
                                                    </h3>
                                                    <div className="overflow-hidden rounded-2xl border border-brand-border dark:border-dark-border">
                                                        {(primaryOrder.items || []).length === 0 ? (
                                                            <div className="p-5 text-sm text-brand-inactive-text">
                                                                A entrega considera o pedido completo. Nenhum item detalhado foi retornado para este pedido.
                                                            </div>
                                                        ) : (
                                                            primaryOrder.items?.map((item) => {
                                                                const itemImage = getR2ImageUrl(item.products?.images || null, "thumb")

                                                                return (
                                                                    <div
                                                                        key={item.id}
                                                                        className="flex items-center gap-4 border-b border-brand-border p-4 last:border-0 dark:border-dark-border"
                                                                    >
                                                                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-brand-gray dark:bg-dark-border/40">
                                                                            <img
                                                                                src={itemImage}
                                                                                alt={item.product_name || "Item"}
                                                                                className="h-full w-full object-cover"
                                                                            />
                                                                        </div>

                                                                        <div className="min-w-0 flex-1">
                                                                            <p className="truncate text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                                {item.product_name || "Item"}
                                                                            </p>
                                                                            <p className="text-xs text-brand-inactive-text">
                                                                                {item.products?.sku || "SKU não informado"}
                                                                            </p>
                                                                        </div>

                                                                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                            x{item.quantity || 0}
                                                                        </span>
                                                                    </div>
                                                                )
                                                            })
                                                        )}
                                                    </div>
                                                </section>

                                                <section className="lg:hidden">
                                                    <CustomerCard
                                                        customer={{
                                                            name: primaryOrder.customer?.name || "Cliente",
                                                            email: primaryOrder.customer?.email || "",
                                                            phone: primaryOrder.customer?.phone || "",
                                                        }}
                                                        address={customerAddress}
                                                        showMap={false}
                                                    />
                                                </section>
                                            </>
                                        )}
                                    </div>

                                    <div className="col-span-12 hidden border-l border-brand-border pl-12 dark:border-dark-border lg:block lg:col-span-4">
                                        {primaryOrder ? (
                                            <CustomerCard
                                                customer={{
                                                    name: primaryOrder.customer?.name || "Cliente",
                                                    email: primaryOrder.customer?.email || "",
                                                    phone: primaryOrder.customer?.phone || "",
                                                }}
                                                address={customerAddress}
                                                showMap={false}
                                                className="sticky top-6"
                                            />
                                        ) : (
                                            <div className="rounded-2xl border border-dashed border-brand-border p-5 text-sm text-brand-inactive-text dark:border-dark-border">
                                                Selecione um pedido para ver os dados do cliente aqui.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="Entregador" className="mt-0">
                                <div className="max-w-2xl space-y-4">
                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Entregador</h3>
                                    <FormDropdown
                                        label="Entregador"
                                        value={selectedDeliveryPersonId || "none"}
                                        setValue={(value) => setSelectedDeliveryPersonId(value === "none" ? "" : value)}
                                        options={[
                                            { value: "none", label: "Sem entregador (não atribuído)" },
                                            ...deliveryPeople.map((person) => ({ value: person.id, label: person.fullName })),
                                        ]}
                                        onFocus={() => { void loadDeliveryPeople() }}
                                    />
                                </div>
                            </TabsContent>

                            <TabsContent value="Saida" className="mt-0">
                                <div className="max-w-2xl space-y-4">
                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Saída</h3>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        <DatePicker
                                            label="Data de saída"
                                            value={date}
                                            onChange={(nextDate) => setDate(toLocalDateInput(nextDate))}
                                            placeholder="Selecione a data"
                                        />
                                        <TimePicker
                                            label="Horário de saída"
                                            value={time}
                                            onChange={setTime}
                                            placeholder="Selecione o horário"
                                        />
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="Revisao" className="mt-0">
                                <h3 className="mb-4 text-lg font-bold text-brand-dark dark:text-dark-heading">
                                    Revisão
                                </h3>
                                <div className="space-y-4 max-w-2xl">
                                    <div className="rounded-2xl border border-brand-border p-4 dark:border-dark-border">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-brand-inactive-text">Pedidos</span>
                                            <span className="font-bold text-brand-dark dark:text-dark-heading">{selectedOrderIds.length}</span>
                                        </div>
                                        <div className="flex justify-between text-sm mt-2">
                                            <span className="text-brand-inactive-text">Entregador</span>
                                            <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                {selectedDeliveryPersonId ? "Atribuído" : "Não atribuído"}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-sm mt-2">
                                            <span className="text-brand-inactive-text">Saída</span>
                                            <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                {date && time ? `${date} ${time}` : "-"}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-sm mt-2">
                                            <span className="text-brand-inactive-text">Status inicial</span>
                                            <span className="font-bold text-brand-dark dark:text-dark-heading">{selectedStatusMeta.label}</span>
                                        </div>
                                    </div>

                                    <div className="h-[280px] rounded-2xl border border-brand-border bg-brand-gray p-5 dark:border-dark-border dark:bg-dark-border/30">
                                        <textarea
                                            className="h-full w-full resize-none border-none bg-transparent text-[15px] text-brand-dark placeholder:text-brand-inactive-text focus:outline-none dark:text-dark-heading"
                                            placeholder="Observações internas da entrega..."
                                            value={notes}
                                            onChange={(event) => setNotes(event.target.value)}
                                        />
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <Button
                                            onClick={() => {
                                                if (isBlocked) {
                                                    openPlanUpgrade("crescer")
                                                    return
                                                }
                                                void handleSave()
                                            }}
                                            disabled={isSaving || selectedOrderIds.length === 0 || !date || !time}
                                        >
                                            <SaveIcon className="mr-2 h-4 w-4" />
                                            {isSaving ? "Salvando..." : "Criar entrega"}
                                        </Button>
                                        {isBlocked ? (
                                            <Button variant="outline" onClick={() => openPlanUpgrade("crescer")}>
                                                Ver plano
                                            </Button>
                                        ) : null}
                                    </div>
                                </div>
                            </TabsContent>
                        </FadeIn>
                    </AnimatePresence>
                </div>
            </Tabs>

            <div className="fixed bottom-0 left-0 right-0 z-40 flex gap-3 border-t border-gray-200 bg-white px-4 py-3 dark:border-dark-border dark:bg-dark-surface md:hidden">
                <Button variant="outline" onClick={handleBack} disabled={isSaving} className="h-[48px] flex-1">
                    Cancelar
                </Button>
                <Button onClick={handleSave} disabled={isSaving || selectedOrderIds.length === 0 || !date || !time || isBlocked} className="h-[48px] flex-1">
                    <SaveIcon className="mr-2 h-4 w-4" />
                    {isSaving ? "Salvando..." : "Salvar"}
                </Button>
            </div>
        </FadeIn>
    )
}
