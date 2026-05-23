"use client"

import { useMemo, useRef, useState, useCallback } from "react"
import { AnimatePresence } from "framer-motion"
import { toast } from "@/hooks/use-notification"

import { FadeIn } from "@/components/animations/FadeIn"
import { usePickerBucket } from "@/components/erp/hooks"
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
} from "@/components/reusable"
import {
    createERPDeliveryAction,
    fetchDeliveryOrderBucketAction,
    fetchDeliveryPeopleBucketAction,
} from "@/app/actions/erp/deliveries"
import {
    CalendarIcon,
    ChevronLeftIcon,
    SaveIcon,
    SearchIcon,
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
}: {
    partnerId: string
    onBack: () => void
    onSuccess: () => void
}) {
    const [activeTab, setActiveTab] = useState("Cliente")
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
    const [selectedDeliveryPersonId, setSelectedDeliveryPersonId] = useState<string>("")
    const [status, setStatus] = useState("preparing")
    const [date, setDate] = useState("")
    const [time, setTime] = useState("")
    const [notes, setNotes] = useState("")
    const [isSaving, setIsSaving] = useState(false)
    const [isOrderSearchOpen, setIsOrderSearchOpen] = useState(false)

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

    const selectedOrder = useMemo(
        () => orderPicker.filtered.find((order) => order.id === selectedOrderId) || null,
        [orderPicker.filtered, selectedOrderId]
    )

    const selectedStatusMeta = getDeliveryStatusMeta(status)
    const paymentMeta = getPaymentStatusMeta(selectedOrder?.status)
    const deliveryMeta = getDeliveryStatusMeta(selectedOrder?.deliveryStatus)

    const customerAddress = useMemo(
        () => buildCustomerAddress(selectedOrder?.address),
        [selectedOrder?.address]
    )

    const loadDeliveryPeople = async () => {
        if (deliveryPeople.length > 0) return
        const list = await fetchDeliveryPeopleBucketAction(partnerId)
        setDeliveryPeople(list as DeliveryPerson[])
    }

    const handleSave = async () => {
        if (!selectedOrder || !date || !time) return

        setIsSaving(true)
        try {
            const startedAt = new Date(`${date}T${time}:00`).toISOString()
            const response = await createERPDeliveryAction({
                partnerId,
                orderIds: [selectedOrder.id],
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
                                        Vincule a entrega a um pedido e acompanhe os dados principais antes de salvar.
                                    </p>
                                </div>
                            </div>

                            <div className="hidden items-center gap-3 md:flex">
                                <Button variant="outline" onClick={handleBack} disabled={isSaving}>
                                    Cancelar
                                </Button>
                                <Button onClick={handleSave} disabled={isSaving || !selectedOrder || !date || !time}>
                                    <SaveIcon className="mr-2 h-4 w-4" />
                                    {isSaving ? "Salvando..." : "Salvar"}
                                </Button>
                            </div>
                        </div>

                        <div className="w-full md:mt-4">
                            <TabsList className="w-full justify-start gap-6 border-b-0 bg-transparent p-0">
                                <TabsTrigger value="Cliente" className="px-0 pb-3">
                                    Cliente
                                </TabsTrigger>
                                <TabsTrigger value="Valores" className="px-0 pb-3">
                                    Valores
                                </TabsTrigger>
                                <TabsTrigger value="Observacoes" className="px-0 pb-3">
                                    Observacoes
                                </TabsTrigger>
                            </TabsList>
                        </div>
                    </div>
                </div>

                <div className="mx-auto flex-1 w-full max-w-[1300px] overflow-y-auto px-4 py-6 pb-24 md:px-6 md:pb-8">
                    <AnimatePresence mode="wait">
                        <FadeIn key={activeTab}>
                            <TabsContent value="Cliente" className="mt-0">
                                <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                    <div className="col-span-12 space-y-8 lg:col-span-8 lg:pr-12">
                                        <section className="space-y-4">
                                            <div ref={searchRef} className="relative">
                                                <Input
                                                    placeholder="Pesquise pelo ID do pedido..."
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

                                                            return (
                                                                <button
                                                                    key={order.id}
                                                                    type="button"
                                                                    className="w-full border-b border-brand-border p-3 text-left transition-colors last:border-0 hover:bg-gray-50 dark:border-dark-border dark:hover:bg-dark-border"
                                                                    onClick={() => {
                                                                        setSelectedOrderId(order.id)
                                                                        orderPicker.setSearchQuery(order.displayId)
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
                                                                        </div>
                                                                    </div>
                                                                </button>
                                                            )
                                                        })}
                                                    </FadeIn>
                                                )}
                                            </div>

                                            {selectedOrder && (
                                                <div className="overflow-hidden rounded-2xl border border-brand-border dark:border-dark-border">
                                                    <div className="border-b border-brand-border bg-brand-gray p-6 dark:border-dark-border dark:bg-dark-border/50">
                                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                                                    Pedido:
                                                                </span>
                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                    {selectedOrder.displayId}
                                                                </span>
                                                            </div>

                                                            <div className="text-sm font-medium text-brand-inactive-text dark:text-dark-body md:text-right">
                                                                Cliente:{" "}
                                                                <strong className="text-brand-dark dark:text-dark-heading">
                                                                    {selectedOrder.customer?.name || "Cliente"}
                                                                </strong>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="bg-white dark:bg-dark-surface">
                                                        <div className="grid grid-cols-1 divide-y divide-brand-border dark:divide-dark-border md:grid-cols-4 md:divide-x md:divide-y-0">
                                                            <div className="p-5">
                                                                <div className="mb-3 flex items-center gap-2 text-brand-inactive-text dark:text-dark-body">
                                                                    <CalendarIcon className="h-4 w-4" />
                                                                    <span className="text-xs font-bold uppercase tracking-[0.14em]">
                                                                        Data
                                                                    </span>
                                                                </div>
                                                                <p className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                                                    {selectedOrder.orderDate ? formatDate(selectedOrder.orderDate) : "-"}
                                                                </p>
                                                            </div>

                                                            <div className="p-5">
                                                                <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-brand-inactive-text dark:text-dark-body">
                                                                    Pagamento
                                                                </p>
                                                                <Badge variant={paymentMeta.variant}>{paymentMeta.label}</Badge>
                                                            </div>

                                                            <div className="p-5">
                                                                <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-brand-inactive-text dark:text-dark-body">
                                                                    Entrega
                                                                </p>
                                                                <Badge variant={deliveryMeta.variant}>{deliveryMeta.label}</Badge>
                                                            </div>

                                                            <div className="p-5">
                                                                <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-brand-inactive-text dark:text-dark-body">
                                                                    Total
                                                                </p>
                                                                <p className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                                                    {formatCurrency(selectedOrder.totalAmount || 0)}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </section>

                                        {selectedOrder && (
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
                                                                { value: "not_sent", label: "Nao enviado" },
                                                                { value: "preparing", label: "Preparando" },
                                                                { value: "sent", label: "Enviado" },
                                                                { value: "delivered", label: "Entregue" },
                                                                { value: "pickup_available", label: "Disponivel para retirada" },
                                                                { value: "delivery_failed", label: "Entrega não realizada" },
                                                                { value: "cancelled", label: "Cancelado" },
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
                                                        Itens do Pedido
                                                    </h3>
                                                    <div className="overflow-hidden rounded-2xl border border-brand-border dark:border-dark-border">
                                                        {(selectedOrder.items || []).length === 0 ? (
                                                            <div className="p-5 text-sm text-brand-inactive-text">
                                                                A entrega considera o pedido completo. Nenhum item detalhado foi retornado para este pedido.
                                                            </div>
                                                        ) : (
                                                            selectedOrder.items?.map((item) => {
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
                                                            name: selectedOrder.customer?.name || "Cliente",
                                                            email: selectedOrder.customer?.email || "",
                                                            phone: selectedOrder.customer?.phone || "",
                                                        }}
                                                        address={customerAddress}
                                                        showMap={false}
                                                    />
                                                </section>
                                            </>
                                        )}
                                    </div>

                                    <div className="col-span-12 hidden border-l border-brand-border pl-12 dark:border-dark-border lg:block lg:col-span-4">
                                        {selectedOrder ? (
                                            <CustomerCard
                                                customer={{
                                                    name: selectedOrder.customer?.name || "Cliente",
                                                    email: selectedOrder.customer?.email || "",
                                                    phone: selectedOrder.customer?.phone || "",
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

                            <TabsContent value="Valores" className="mt-0">
                                <div className="max-w-2xl space-y-4">
                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Valores da Entrega</h3>
                                    <div className="rounded-2xl border border-brand-border p-5 dark:border-dark-border">
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between"><span>Distância</span><span>{selectedOrder?.distanceKm == null ? "-" : `${Number(selectedOrder.distanceKm).toFixed(2)} km`}</span></div>
                                            <div className="flex justify-between"><span>Taxa base</span><span>{formatCurrency(Number(selectedOrder?.deliveryBreakdown?.baseFee || selectedOrder?.deliveryFee || 0))}</span></div>
                                            <div className="flex justify-between"><span>Taxa distância</span><span>{formatCurrency(Number(selectedOrder?.deliveryBreakdown?.distanceFee || 0))}</span></div>
                                            <div className="flex justify-between"><span>Ajuste horário</span><span>{formatCurrency(Number(selectedOrder?.deliveryBreakdown?.timeAdjustmentTotal || 0))}</span></div>
                                            <div className="flex justify-between border-t border-brand-border pt-2 font-bold dark:border-dark-border"><span>Taxa final</span><span>{formatCurrency(Number(selectedOrder?.deliveryFee || selectedOrder?.shippingFee || 0))}</span></div>
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="Observacoes" className="mt-0">
                                <h3 className="mb-4 text-lg font-bold text-brand-dark dark:text-dark-heading">
                                    Observacoes
                                </h3>
                                <div className="h-[350px] rounded-2xl border border-brand-border bg-brand-gray p-5 dark:border-dark-border dark:bg-dark-border/30">
                                    <textarea
                                        className="h-full w-full resize-none border-none bg-transparent text-[15px] text-brand-dark placeholder:text-brand-inactive-text focus:outline-none dark:text-dark-heading"
                                        placeholder="Observacoes internas da entrega..."
                                        value={notes}
                                        onChange={(event) => setNotes(event.target.value)}
                                    />
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
                <Button onClick={handleSave} disabled={isSaving || !selectedOrder || !date || !time} className="h-[48px] flex-1">
                    <SaveIcon className="mr-2 h-4 w-4" />
                    {isSaving ? "Salvando..." : "Salvar"}
                </Button>
            </div>
        </FadeIn>
    )
}
