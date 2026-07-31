"use client"

import { useMemo, useRef, useState, useCallback, useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { toast } from "@/hooks/use-notification"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { UnsavedChangesDialog } from "@/components/reusable/UnsavedChangesDialog"

import { FadeIn } from "@/components/animations/FadeIn"
import { useMediaQuery, usePickerBucket } from "@/components/erp/hooks"
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
    AlertModal,
    FormTextarea,
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
    InfoIcon,
    XIcon,
} from "@/lib/icons"
import { getDeliveryStatusMeta, getPaymentStatusMeta } from "@/lib/orders/status"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency, formatDate, formatDateTime, formatQuantityWithUnit, formatUnitPriceWithUnit } from "@/lib/utils"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"

type DeliveryPerson = { id: string; userId?: string; fullName: string }

type OrderPickerItem = {
    id: string
    displayId: string
    orderNumber?: string | null
    totalAmount: number
    orderDate?: string | null
    status: string
    deliveryStatus: string
    shippingFee: number
    deliveryFee?: number
    distanceKm?: number | null
    deliveryBreakdown?: Record<string, any> | null
    customer?: { id: string | null; name: string; email?: string | null; phone?: string | null; image_url?: string | null } | null
    customerAddress?: {
        street?: string
        number?: string
        complement?: string
        neighborhood?: string
        city?: string
        state?: string
        zipCode?: string
    } | null
    address?: string
    orderSource?: string | null
    items?: Array<{
        id: string
        product_name?: string | null
        product_price?: number | null
        subtotal?: number | null
        quantity?: number | null
        products?: {
            sku?: string | null
            images?: string[] | string | null
        } | null
    }>
    alreadyInActiveDelivery?: boolean
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

const SidebarCard = ({
    children,
    hasTopStrip = true,
}: {
    children: React.ReactNode
    hasTopStrip?: boolean
}) => (
    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden text-left">
        {hasTopStrip && <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-heading rounded-t-2xl" />}
        {children}
    </div>
)

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
    const isMobile = useMediaQuery("(max-width: 768px)")

    const [activeTab, setActiveTab] = useState("Pedidos")
    const [step, setStep] = useState<1 | 2>(1)
    const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([])
    const [selectedDeliveryPersonId, setSelectedDeliveryPersonId] = useState<string>("")
    const [status, setStatus] = useState("pending")
    const [date, setDate] = useState("")
    const [time, setTime] = useState("")
    const [notes, setNotes] = useState("")
    const [isSaving, setIsSaving] = useState(false)
    const [isOrderSearchOpen, setIsOrderSearchOpen] = useState(false)
    const [planAccess, setPlanAccess] = useState<{ allowed: boolean; maxOrders: number; planSlug: string; message?: string | null } | null>(null)
    const [infoOrder, setInfoOrder] = useState<OrderPickerItem | null>(null)
    const [activeOrder, setActiveOrder] = useState<OrderPickerItem | null>(null)

    useEffect(() => {
        if (infoOrder) {
            setActiveOrder(infoOrder)
        }
    }, [infoOrder])

    const [orderToRemove, setOrderToRemove] = useState<string | null>(null)

    const isDirty = useMemo(() => {
        if (isSaving) return false
        return selectedOrderIds.length > 0 || !!selectedDeliveryPersonId || !!date || !!time || !!notes
    }, [selectedOrderIds, selectedDeliveryPersonId, date, time, notes, isSaving])

    const { showConfirmDialog, confirmNavigation, cancelNavigation, handleNavigation } = useUnsavedChanges(isDirty)

    const handleBack = useCallback(() => handleNavigation(onBack), [handleNavigation, onBack])
    const searchRef = useRef<HTMLDivElement>(null)
    const [deliveryPeople, setDeliveryPeople] = useState<DeliveryPerson[]>([])
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const orderPicker = usePickerBucket<OrderPickerItem>(
        () => fetchDeliveryOrderBucketAction(partnerId) as Promise<OrderPickerItem[]>,
        (order, q) =>
            String(order.displayId || "").toLowerCase().includes(q) ||
            String(order.orderNumber || "").toLowerCase().includes(q) ||
            String(order.customer?.name || "").toLowerCase().includes(q),
        { pageSize: 10 }
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

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsOrderSearchOpen(false)
            }
        }

        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const selectedOrders = useMemo(() => {
        const byId = new Map((orderPicker.bucket || []).map((o) => [o.id, o]))
        return selectedOrderIds.map((id) => byId.get(id)).filter(Boolean) as OrderPickerItem[]
    }, [orderPicker.bucket, selectedOrderIds])

    const allItems = useMemo(() => {
        return selectedOrders.flatMap((order) =>
            (order.items || []).map((item) => ({
                ...item,
                orderDisplayId: order.displayId,
            }))
        )
    }, [selectedOrders])

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
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                {/* Back button - desktop only */}
                                <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                {/* Title row */}
                                <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            {/* Title hidden on mobile, shown on md+ */}
                                            <span className="hidden md:inline truncate">Nova entrega</span>
                                        </h1>

                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            Selecione pedidos, atribua um entregador e defina a saída.
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        <Button variant="outline" onClick={handleBack} disabled={isSaving}>
                                            Cancelar
                                        </Button>
                                        <Button onClick={handleSave} disabled={isSaving || selectedOrderIds.length === 0 || !date || !time || isBlocked} leftIcon={<SaveIcon size={18} />}>
                                            {isSaving ? "Salvando..." : "Salvar"}
                                        </Button>
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="Pedidos" onClick={() => setStep(1)}>
                                            1. Pedidos
                                        </TabsTrigger>
                                        <TabsTrigger value="Observacoes" onClick={() => setStep(2)}>
                                            2. Observações
                                        </TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        <div className="mx-auto flex-1 w-full max-w-[1300px] px-4 py-6 pb-24 md:px-6 md:pb-8">
                            <AnimatePresence mode="wait">
                                <TabsContent value="Pedidos" className="mt-0">
                                    <FadeIn key={activeTab}>
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
                                                        <AnimatePresence>
                                                            {isOrderSearchOpen && orderPicker.searchQuery.trim() && (
                                                                <motion.div
                                                                    initial={{ opacity: 0, y: 5 }}
                                                                    animate={{ opacity: 1, y: 0 }}
                                                                    exit={{ opacity: 0, y: 5 }}
                                                                    className="absolute z-[9999] top-full left-0 right-0 mt-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl max-h-72 overflow-y-auto shadow-xl custom-scrollbar"
                                                                    onScroll={(e) => {
                                                                        const target = e.currentTarget
                                                                        if (target.scrollHeight - target.scrollTop - target.clientHeight < 20) {
                                                                            orderPicker.loadMore()
                                                                        }
                                                                    }}
                                                                >
                                                                    {orderPicker.displayed.length > 0 ? (
                                                                        orderPicker.displayed.map((order) => {
                                                                            const searchPaymentMeta = getPaymentStatusMeta(order.status)
                                                                            const searchDeliveryMeta = getDeliveryStatusMeta(order.deliveryStatus)
                                                                            const isSelected = selectedOrderIds.includes(order.id)
                                                                            const isAlreadyInActiveDelivery = order.alreadyInActiveDelivery
                                                                            const isDelivered = order.deliveryStatus === "delivered"
                                                                            const isDisabled = (!isSelected && !canAddMore) || isAlreadyInActiveDelivery || isDelivered

                                                                            return (
                                                                                <div
                                                                                    key={order.id}
                                                                                    className={`flex items-center gap-4 p-3.5 border-b border-brand-border dark:border-dark-border last:border-0 transition-colors ${isDisabled ? "opacity-40 cursor-default" : "hover:bg-gray-50 dark:hover:bg-dark-border cursor-pointer"}`}
                                                                                    onClick={() => {
                                                                                        if (!isDisabled) {
                                                                                            toggleOrder(order.id)
                                                                                            orderPicker.setSearchQuery(String(order.displayId || ""))
                                                                                            setIsOrderSearchOpen(false)
                                                                                        }
                                                                                    }}
                                                                                >
                                                                                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border/50 overflow-hidden shrink-0 border border-brand-border dark:border-dark-border">
                                                                                        <img
                                                                                            src={getOrderPreviewImage(order)}
                                                                                            alt={String(order.displayId || "")}
                                                                                            className="h-full w-full object-cover rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border"
                                                                                        />
                                                                                    </div>

                                                                                    <div className="min-w-0 flex-1">
                                                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                                                                            {order.displayId}
                                                                                        </div>
                                                                                        <div className="text-[11px] font-medium text-brand-inactive-text mt-0.5 tracking-wider uppercase truncate">
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
                                                                                            <span className="text-[10px] font-bold text-brand-green uppercase">Selecionado</span>
                                                                                        ) : isAlreadyInActiveDelivery ? (
                                                                                            <span className="text-[10px] font-bold text-brand-red uppercase">Já em entrega ativa</span>
                                                                                        ) : isDelivered ? (
                                                                                            <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Já entregue</span>
                                                                                        ) : null}
                                                                                    </div>
                                                                                </div>
                                                                            )
                                                                        })
                                                                    ) : (
                                                                        <div className="p-8 text-center text-sm text-brand-inactive-text">
                                                                            Nenhum pedido encontrado.
                                                                        </div>
                                                                    )}
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
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
                                                                                className="p-2 text-brand-inactive-text hover:text-brand-dark transition-colors"
                                                                                onClick={() => setInfoOrder(order)}
                                                                                title="Informações do pedido"
                                                                            >
                                                                                <InfoIcon className="w-4 h-4" />
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                className="p-2 text-brand-inactive-text hover:text-brand-red transition-colors"
                                                                                onClick={() => setOrderToRemove(order.id)}
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

                                                {selectedOrders.length > 0 && (
                                                    <>
                                                        <div className="h-px w-full bg-brand-border dark:bg-dark-border lg:hidden" />

                                                        <section className="lg:hidden">
                                                            <h3 className="mb-4 text-lg font-bold text-brand-dark dark:text-dark-heading">
                                                                Informações da Entrega
                                                            </h3>
                                                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                                                <FormDropdown
                                                                    label="Entregador"
                                                                    value={selectedDeliveryPersonId || "none"}
                                                                    setValue={(value) => setSelectedDeliveryPersonId(value === "none" ? "" : value)}
                                                                    options={[
                                                                        { value: "none", label: "Entrega própria" },
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
                                                        </section>


                                                    </>
                                                )}
                                            </div>

                                            <div className="col-span-12 hidden border-l border-brand-border pl-12 dark:border-dark-border lg:block lg:col-span-4">
                                                <SidebarCard>
                                                    <h3 className="mb-4 text-lg font-bold text-brand-dark dark:text-dark-heading">
                                                        Informações da Entrega
                                                    </h3>
                                                    <div className="grid grid-cols-1 gap-4">
                                                        <FormDropdown
                                                            label="Entregador"
                                                            value={selectedDeliveryPersonId || "none"}
                                                            setValue={(value) => setSelectedDeliveryPersonId(value === "none" ? "" : value)}
                                                            options={[
                                                                { value: "none", label: "Entrega própria" },
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
                                                </SidebarCard>
                                            </div>
                                        </div>
                                    </FadeIn>
                                </TabsContent>

                                <TabsContent value="Entregador" className="mt-0">
                                    <FadeIn key={activeTab}>
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
                                    </FadeIn>
                                </TabsContent>

                                <TabsContent value="Saida" className="mt-0">
                                    <FadeIn key={activeTab}>
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
                                    </FadeIn>
                                </TabsContent>

                                <TabsContent value="Observacoes" className="mt-0">
                                    <FadeIn key={activeTab}>
                                        <FormTextarea
                                            label="Observações"
                                            placeholder="Observações internas da entrega..."
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            name="notes"
                                            maxLength={500}
                                            showCharacterCount
                                        />

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
                                    </FadeIn>
                                </TabsContent>
                            </AnimatePresence>
                        </div>

                        {/* Mobile Bottom Action Bar */}
                        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                            <Button variant="outline" className="flex-1" onClick={handleBack} disabled={isSaving}>
                                Cancelar
                            </Button>
                            <Button onClick={handleSave} className="flex-1" disabled={isSaving || selectedOrderIds.length === 0 || !date || !time || isBlocked} leftIcon={<SaveIcon size={18} />}>
                                {isSaving ? "Salvando..." : "Salvar"}
                            </Button>
                        </div>
                    </div>
                </Tabs >
            </div >

            <UnsavedChangesDialog
                open={showConfirmDialog}
                onConfirm={confirmNavigation}
                onCancel={cancelNavigation}
                description="Você tem alterações na entrega que ainda não foram salvas."
            />

            {(() => {
                const isOpen = !!infoOrder;
                const handleClose = () => setInfoOrder(null);

                if (!activeOrder) return null;

                const sheetContent = (
                    <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
                        <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                            <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Detalhes do Pedido</h2>
                            <Button variant="filled" onClick={handleClose} size="icon">
                                <XIcon className="h-5 w-5" />
                            </Button>
                        </header>

                        <Tabs defaultValue="dados_gerais" className="flex flex-col flex-1 overflow-hidden">
                            <div className="px-6 border-b border-brand-border dark:border-dark-border shrink-0">
                                <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0 h-12">
                                    <TabsTrigger value="dados_gerais">
                                        Dados Gerais
                                    </TabsTrigger>
                                    <TabsTrigger value="itens">
                                        Itens do Pedido
                                    </TabsTrigger>
                                </TabsList>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                <TabsContent value="dados_gerais" className="mt-0 space-y-6">
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Valor Total</span>
                                            <span className="font-bold text-brand-dark dark:text-dark-heading text-lg">
                                                {formatCurrency(activeOrder.totalAmount || 0)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Data e Hora</span>
                                            <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                {activeOrder.orderDate ? formatDateTime(activeOrder.orderDate) : "-"}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Canal de Venda</span>
                                            <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                {activeOrder.orderSource || "Manual"}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="border-t border-brand-border dark:border-dark-border w-full" />

                                    <CustomerCard
                                        customer={{
                                            ...(activeOrder.customer || {}),
                                            name: activeOrder.customer?.name || "Cliente",
                                            email: activeOrder.customer?.email || "",
                                            phone: activeOrder.customer?.phone || "",
                                        }}
                                        address={activeOrder.customerAddress || buildCustomerAddress(activeOrder.address)}
                                        showMap={false}
                                        chrome="minimal"
                                    />
                                </TabsContent>

                                <TabsContent value="itens" className="mt-0">
                                    {(() => {
                                        const filteredItems = (activeOrder.items || []).filter((item: any) => {
                                            const pType = String(item.products?.product_type || "").toLowerCase()
                                            return pType !== "serviço" && pType !== "servico" && pType !== "service"
                                        })
                                        if (filteredItems.length === 0) {
                                            return (
                                                <div className="p-5 text-sm text-brand-inactive-text border border-brand-border dark:border-dark-border rounded-2xl">
                                                    Nenhum item detalhado foi retornado para o pedido selecionado.
                                                </div>
                                            )
                                        }
                                        return (
                                            <div className="space-y-4">
                                                {filteredItems.map((item: any) => {
                                                    const itemImage = getR2ImageUrl(item.products?.images || item.image || null, "thumbnail")
                                                    const itemSku = item.products?.sku || item.sku || "N/A"
                                                    const itemPrice = Number(item.product_price || item.price || 0)
                                                    const itemSubtotal = Number(item.subtotal || itemPrice * Number(item.quantity || 0))

                                                    return (
                                                        <div key={item.id} className="flex items-start gap-4">
                                                            <div className="w-12 h-12 overflow-hidden shrink-0 rounded-full border border-brand-border dark:border-dark-border">
                                                                <img
                                                                    src={itemImage}
                                                                    className="w-full h-full object-cover rounded-xl"
                                                                    alt={item.product_name || "Produto sem nome"}
                                                                    onError={(e: any) => { e.currentTarget.src = "https://img.dudit.com.br/static/Placeholder.png" }}
                                                                />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex justify-between items-start mb-0.5">
                                                                    <h4 className="font-bold text-[14px] text-brand-dark dark:text-dark-heading truncate">
                                                                        {item.product_name || "Produto sem nome"}
                                                                    </h4>
                                                                    <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading">
                                                                        {formatCurrency(itemSubtotal)}
                                                                    </span>
                                                                </div>
                                                                <div className="text-[10px] text-brand-inactive-text dark:text-dark-body uppercase mb-1">
                                                                    SKU: {itemSku}
                                                                </div>
                                                                <div className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                                                                    {formatQuantityWithUnit(item.quantity, item.unit)} • {formatUnitPriceWithUnit(itemPrice, item.unit)}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )
                                    })()}
                                </TabsContent>
                            </div>
                        </Tabs>

                        <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                            <Button type="button" variant="outline" className="w-full h-12" onClick={handleClose}>
                                Fechar
                            </Button>
                        </footer>
                    </div>
                );

                return isMobile ? (
                    <BottomSheet isOpen={isOpen} onClose={handleClose}>
                        {sheetContent}
                    </BottomSheet>
                ) : (
                    <Portal>
                        <div
                            className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
                            onClick={handleClose}
                        >
                            <div
                                className={`fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0 opacity-100" : "translate-x-[120%] opacity-0"}`}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {sheetContent}
                            </div>
                        </div>
                    </Portal>
                );
            })()}

            <AlertModal
                isOpen={!!orderToRemove}
                title="Remover pedido?"
                description="Tem certeza que deseja remover este pedido da entrega?"
                confirmText="Remover"
                cancelText="Cancelar"
                onClose={() => setOrderToRemove(null)}
                onConfirm={() => {
                    if (orderToRemove) {
                        toggleOrder(orderToRemove)
                        setOrderToRemove(null)
                    }
                }}
                variant="danger"
                isDestructive
            />
        </FadeIn >
    )
}
