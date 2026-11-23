"use client"

import { useMemo, useRef, useState, useCallback, useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { toast } from "@/hooks/use-notification"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { useSidebar } from "@/lib/sidebar-context"
import { UnsavedChangesDialog } from "@/components/reusable/UnsavedChangesDialog"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"

import { FadeIn } from "@/components/animations/FadeIn"
import { parseAddressString } from "../orders/CreateOrder"
import { useMediaQuery, usePickerBucket } from "@/components/erp/hooks"
import { useModalLayer } from "@/lib/modal-stack"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import {
    Badge,
    Button,
    DatePicker,
    FormDropdown,
    SidebarCard,
    Input,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    TimePicker,
    InfoCard,
    AlertModal,
    FormTextarea,
    ThreeDotsLoader,
    DefaultModal,
    Tooltip,
} from "@/components/reusable"
import {
    createERPDeliveryAction,
    updateERPDeliveryAction,
    getERPDeliveryDetailsAction,
    fetchDeliveryOrderBucketAction,
    fetchDeliveryOrdersByIdsAction,
    fetchDeliveryPeopleBucketAction,
    getERPDeliveryPlanAccessAction,
    unassignDuditDriverAction,
} from "@/app/actions/erp/deliveries"
import { assignPlatformDriverToDeliveryAction } from "@/app/actions/erp/delivery-driver-assignments"
import DuditDriverDetailsModal from "./DuditDriverDetailsModal"
import DeliveryOrderDetailSheet from "./DeliveryOrderDetailSheet"
import {
    ChevronLeftIcon,
    SaveIcon,
    SearchIcon,
    TrashIcon,
    TruckIcon,
    MoneyIcon,
} from "@/lib/icons"
import { getDeliveryStatusMeta, getPaymentStatusMeta } from "@/lib/orders/status"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency, formatDate } from "@/lib/utils"
import DeliveryDriverPickerSheet from "@/components/erp/deliveries/DeliveryDriverPickerSheet"

type DeliveryPerson = { id: string; userId?: string; fullName: string; source?: "legacy" | "platform"; vehicleType?: string }

type OrderPickerItem = {
    id: string
    displayId: string
    orderNumber?: string | null
    totalAmount: number
    orderDate?: string | null
    status: string
    paymentStatus?: string | null
    paymentMethod?: string | null
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

function getInitialDateTime() {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, "0")
    const mm = String(now.getMinutes()).padStart(2, "0")
    return {
        date: toLocalDateInput(now),
        time: `${hh}:${mm}`,
    }
}

function buildCustomerAddress(address?: string) {
    if (!address) return null
    return parseAddressString(address)
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
    initialPrefillOrders,
    editDeliveryId,
}: {
    partnerId: string
    onBack: () => void
    onSuccess: () => void
    initialOrderIds?: string[]
    initialPrefillOrders?: OrderPickerItem[]
    editDeliveryId?: string
}) {
    const { openPlanUpgrade } = usePlanUpgrade()

    const initialDateTime = useMemo(() => getInitialDateTime(), [])

    const [activeTab, setActiveTab] = useState("Pedidos")
    const [step, setStep] = useState<1 | 2>(1)
    const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>(() =>
        !editDeliveryId && initialOrderIds && initialOrderIds.length > 0
            ? Array.from(new Set(initialOrderIds)).filter(Boolean)
            : [],
    )
    const [prefilledOrders, setPrefilledOrders] = useState<OrderPickerItem[]>(() => initialPrefillOrders || [])
    const [selectedDeliveryPersonId, setSelectedDeliveryPersonId] = useState<string>("")
    const [status, setStatus] = useState("pending")
    const [date, setDate] = useState(initialDateTime.date)
    const [time, setTime] = useState(initialDateTime.time)
    const [notes, setNotes] = useState("")
    const [isSaving, setIsSaving] = useState(false)
    const [hasSaved, setHasSaved] = useState(false)
    const [isLoadingDelivery, setIsLoadingDelivery] = useState(!!editDeliveryId)
    const [deliveryNumber, setDeliveryNumber] = useState<number | null>(null)
    const initialLoadedRef = useRef<any>(null)
    const [isOrderSearchOpen, setIsOrderSearchOpen] = useState(false)
    const [planAccess, setPlanAccess] = useState<{ allowed: boolean; maxOrders: number; planSlug: string; message?: string | null } | null>(null)
    const [infoOrder, setInfoOrder] = useState<OrderPickerItem | null>(null)
    const [orderToRemove, setOrderToRemove] = useState<string | null>(null)

    const showDispatchDateTime = ["sent", "delivered", "cancelled", "delivery_failed"].includes(status)

    const initialOrderIdsKey = useMemo(
        () =>
            !editDeliveryId && initialOrderIds && initialOrderIds.length > 0
                ? Array.from(new Set(initialOrderIds)).filter(Boolean).sort().join(",")
                : "",
        [editDeliveryId, initialOrderIds],
    )

    const isDirty = useMemo(() => {
        if (isSaving || isLoadingDelivery || hasSaved) return false
        if (editDeliveryId && initialLoadedRef.current) {
            const init = initialLoadedRef.current
            const sameOrders = selectedOrderIds.length === init.orderIds.length && selectedOrderIds.every((id) => init.orderIds.includes(id))
            return !sameOrders || selectedDeliveryPersonId !== init.deliveryPersonId || status !== init.status || date !== init.date || time !== init.time || notes !== init.notes
        }
        const currentOrderIdsKey = [...selectedOrderIds].sort().join(",")
        const ordersChangedFromPrefill = initialOrderIdsKey
            ? currentOrderIdsKey !== initialOrderIdsKey
            : selectedOrderIds.length > 0
        return ordersChangedFromPrefill || !!selectedDeliveryPersonId || !!notes || status !== "pending"
    }, [selectedOrderIds, initialOrderIdsKey, selectedDeliveryPersonId, status, date, time, notes, isSaving, isLoadingDelivery, hasSaved, editDeliveryId])

    const { showConfirmDialog, confirmNavigation, cancelNavigation, handleNavigation, allowNavigation } = useUnsavedChanges(isDirty)

    const handleBack = useCallback(() => handleNavigation(onBack), [handleNavigation, onBack])
    const handleConfirmExit = useCallback(() => {
        allowNavigation()
        confirmNavigation()
    }, [allowNavigation, confirmNavigation])
    const searchRef = useRef<HTMLDivElement>(null)
    const [deliveryPeople, setDeliveryPeople] = useState<DeliveryPerson[]>([])
    const [platformDriver, setPlatformDriver] = useState<any>(null)
    const initialPlatformDriverRef = useRef<any>(null)
    const [isDuditDriverDetailsOpen, setIsDuditDriverDetailsOpen] = useState(false)
    const [unassignModal, setUnassignModal] = useState<{
        isOpen: boolean
        pendingPersonId: string | null
        isConfirmed: boolean
        reason: string
        isSubmitting: boolean
    }>({
        isOpen: false,
        pendingPersonId: null,
        isConfirmed: false,
        reason: "",
        isSubmitting: false,
    })
    const [isDriverSheetOpen, setIsDriverSheetOpen] = useState(false)
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const pageTitle = editDeliveryId
        ? (deliveryNumber ? `Editar entrega #${deliveryNumber}` : "Editar entrega")
        : "Nova entrega"

    const { setHeaderOverride } = useSidebar()

    useEffect(() => {
        setHeaderOverride({
            title: pageTitle,
            onBack: handleBack,
            isSubPage: true
        })
        return () => setHeaderOverride(null)
    }, [pageTitle, handleBack, setHeaderOverride])

    const orderPicker = usePickerBucket<OrderPickerItem>(
        () => fetchDeliveryOrderBucketAction(partnerId, editDeliveryId) as Promise<OrderPickerItem[]>,
        (order, q) =>
            String(order.displayId || "").toLowerCase().includes(q) ||
            String(order.orderNumber || "").toLowerCase().includes(q) ||
            String(order.customer?.name || "").toLowerCase().includes(q),
        { pageSize: 10 }
    )

    useEffect(() => {
        if (editDeliveryId) {
            let mounted = true
            const run = async () => {
                setIsLoadingDelivery(true)
                void orderPicker.loadBucket()
                try {
                    const res = await getERPDeliveryDetailsAction(editDeliveryId, partnerId)
                    if (!mounted) return
                    if (!res.success || !res.data) {
                        toast.error(res.error || "Erro ao carregar dados da entrega para edição.")
                        onBack()
                        return
                    }
                    const del = res.data
                    const orderIds = (del.delivery_orders || []).map((l: any) => l.order_id || l.orders?.id).filter(Boolean)
                    setSelectedOrderIds(orderIds)
                    if (del.platform_driver) {
                        setPlatformDriver(del.platform_driver)
                        initialPlatformDriverRef.current = del.platform_driver
                    }
                    const resolvedPersonId = del.platform_driver
                        ? (del.platform_driver.id !== "dudit_network" && !del.platform_driver.isPendingAcceptance
                            ? `platform:${del.platform_driver.id}`
                            : (del.delivery_person_id === "none" ? "" : (del.delivery_person_id || "platform:dudit_network")))
                        : (del.delivery_person_id === "none" ? "" : (del.delivery_person_id || ""))
                    setSelectedDeliveryPersonId(resolvedPersonId)
                    setStatus(del.status || "pending")
                    const startedDate = del.started_at || del.departure_time || del.created_at
                    let initialDate = initialDateTime.date
                    let initialTime = initialDateTime.time
                    if (startedDate) {
                        initialDate = toLocalDateInput(startedDate)
                        const d = new Date(startedDate)
                        if (!isNaN(d.getTime())) {
                            const hh = String(d.getHours()).padStart(2, "0")
                            const mm = String(d.getMinutes()).padStart(2, "0")
                            initialTime = `${hh}:${mm}`
                        }
                    }
                    setDate(initialDate)
                    setTime(initialTime)
                    setNotes(del.notes || "")
                    setDeliveryNumber(del.delivery_number || null)
                    initialLoadedRef.current = {
                        orderIds,
                        deliveryPersonId: resolvedPersonId,
                        status: del.status || "pending",
                        date: initialDate,
                        time: initialTime,
                        notes: del.notes || "",
                    }
                } catch (err: any) {
                    toast.error(err?.message || "Erro ao carregar entrega.")
                    onBack()
                } finally {
                    if (mounted) setIsLoadingDelivery(false)
                }
            }
            run()
            return () => { mounted = false }
        } else if (initialOrderIds && initialOrderIds.length > 0) {
            const uniqueIds = Array.from(new Set(initialOrderIds)).filter(Boolean)
            setSelectedOrderIds(uniqueIds)
            const alreadyHaveIds = new Set(prefilledOrders.map((o) => o.id))
            const missingIds = uniqueIds.filter((id) => !alreadyHaveIds.has(id))
            if (missingIds.length > 0) {
                let alive = true
                fetchDeliveryOrdersByIdsAction(partnerId, missingIds)
                    .then((fetched) => {
                        if (!alive || !Array.isArray(fetched) || fetched.length === 0) return
                        setPrefilledOrders((prev) => {
                            const map = new Map(prev.map((o) => [o.id, o]))
                            for (const item of fetched as OrderPickerItem[]) {
                                map.set(item.id, item)
                            }
                            return Array.from(map.values())
                        })
                    })
                    .catch(() => {})
                return () => { alive = false }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editDeliveryId, partnerId, initialOrderIds])

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
        const byId = new Map<string, OrderPickerItem>()
        for (const o of prefilledOrders) byId.set(o.id, o)
        for (const o of orderPicker.bucket || []) byId.set(o.id, o)
        return selectedOrderIds.map((id) => byId.get(id)).filter(Boolean) as OrderPickerItem[]
    }, [orderPicker.bucket, prefilledOrders, selectedOrderIds])

    const allItems = useMemo(() => {
        return selectedOrders.flatMap((order) =>
            (order.items || []).map((item) => ({
                ...item,
                orderDisplayId: order.displayId,
            }))
        )
    }, [selectedOrders])

    const primaryOrder = selectedOrders[0] || null

    const customerAddress = useMemo(
        () => buildCustomerAddress(primaryOrder?.address),
        [primaryOrder?.address]
    )

    const loadDeliveryPeople = useCallback(async () => {
        try {
            const people = await fetchDeliveryPeopleBucketAction(partnerId)
            if (people && Array.isArray(people)) {
                setDeliveryPeople(people as DeliveryPerson[])
            }
        } catch (err) {
            console.error("Erro ao carregar entregadores:", err)
        }
    }, [partnerId])

    useEffect(() => {
        void loadDeliveryPeople()
    }, [loadDeliveryPeople])

    const deliveryPeopleOptions = useMemo(() => {
        const baseOptions = [
            { value: "none", label: "Entrega própria" },
            ...deliveryPeople.map((person) => ({
                value: person.id,
                label: `${person.source === "platform" ? "Dudit · " : ""}${person.fullName}${person.vehicleType ? ` (${person.vehicleType})` : ""}`,
            })),
        ]

        if (platformDriver && !platformDriver.isPendingAcceptance && platformDriver.id !== "dudit_network") {
            const driverName = platformDriver.fullName || "Entregador Dudit"
            const vehicleType = platformDriver.vehicleType ? ` (${platformDriver.vehicleType})` : ""
            const optVal = `platform:${platformDriver.id}`
            if (!baseOptions.some(opt => opt.value === optVal)) {
                baseOptions.push({
                    value: optVal,
                    label: `Dudit · ${driverName}${vehicleType}`,
                })
            }
        } else if (selectedDeliveryPersonId === "platform:dudit_network" || platformDriver?.id === "dudit_network" || platformDriver?.isPendingAcceptance) {
            if (!baseOptions.some(opt => opt.value === "platform:dudit_network")) {
                baseOptions.push({
                    value: "platform:dudit_network",
                    label: "Dudit · Rede de Entregadores (Aguardando aceite)",
                })
            }
        } else if (selectedDeliveryPersonId?.startsWith("platform:")) {
            if (!baseOptions.some(opt => opt.value === selectedDeliveryPersonId)) {
                baseOptions.push({
                    value: selectedDeliveryPersonId,
                    label: "Dudit · Entregador Parceiro",
                })
            }
        }
        return baseOptions
    }, [deliveryPeople, selectedDeliveryPersonId, platformDriver])

    const handleDriverSelectionChange = (newPersonId: string) => {
        const targetId = newPersonId === "none" ? "" : newPersonId
        const activeDriver = initialPlatformDriverRef.current
        const isAcceptedPlatformDriver = activeDriver && !activeDriver.isPendingAcceptance && activeDriver.id !== "dudit_network"
        const isChangingAway = isAcceptedPlatformDriver && targetId !== `platform:${activeDriver.id}`

        if (isChangingAway) {
            setUnassignModal({
                isOpen: true,
                pendingPersonId: targetId,
                isConfirmed: false,
                reason: "",
                isSubmitting: false,
            })
            return
        }

        setSelectedDeliveryPersonId(targetId)
    }

    const handleConfirmUnassign = async () => {
        if (!unassignModal.isConfirmed || !unassignModal.reason.trim() || !editDeliveryId) return
        setUnassignModal(prev => ({ ...prev, isSubmitting: true }))
        try {
            const res = await unassignDuditDriverAction({
                partnerId,
                deliveryId: editDeliveryId,
                reason: unassignModal.reason.trim(),
                notifyDriver: true,
            })
            if (!res.success) {
                toast.error(res.error || "Não foi possível desatribuir o entregador.")
                setUnassignModal(prev => ({ ...prev, isSubmitting: false }))
                return
            }

            toast.success("Entregador desatribuído com sucesso.")
            initialPlatformDriverRef.current = null
            setPlatformDriver(null)
            setSelectedDeliveryPersonId(unassignModal.pendingPersonId || "")
            setUnassignModal({
                isOpen: false,
                pendingPersonId: null,
                isConfirmed: false,
                reason: "",
                isSubmitting: false,
            })
        } catch (err: any) {
            toast.error(err?.message || "Erro ao desatribuir entregador.")
            setUnassignModal(prev => ({ ...prev, isSubmitting: false }))
        }
    }

    const handleSave = async () => {
        if (selectedOrderIds.length === 0) return
        if (showDispatchDateTime && (!date || !time)) return

        setIsSaving(true)
        let savedSuccessfully = false
        try {
            const startedAt = showDispatchDateTime && date && time
                ? new Date(`${date}T${time}:00`).toISOString()
                : undefined
            const isPlatformDriver = selectedDeliveryPersonId.startsWith("platform:")
            const platformDriverId = isPlatformDriver ? selectedDeliveryPersonId.slice("platform:".length) : null
            const legacyDeliveryPersonId = isPlatformDriver ? null : (selectedDeliveryPersonId || null)
            let response
            if (editDeliveryId) {
                response = await updateERPDeliveryAction({
                    partnerId,
                    deliveryId: editDeliveryId,
                    orderIds: selectedOrderIds,
                    deliveryPersonId: legacyDeliveryPersonId,
                    platformDriverId,
                    status: status as any,
                    startedAt,
                    notes,
                })
            } else {
                response = await createERPDeliveryAction({
                    partnerId,
                    orderIds: selectedOrderIds,
                    deliveryPersonId: legacyDeliveryPersonId,
                    platformDriverId,
                    status: status as any,
                    startedAt,
                    notes,
                })
            }

            if (response.success) {
                if (platformDriverId) {
                    const assignmentResult = await assignPlatformDriverToDeliveryAction({
                        partnerId,
                        deliveryId: editDeliveryId || response.deliveryId,
                        orderIds: selectedOrderIds,
                        driverId: platformDriverId,
                        notes,
                    })
                    if (!assignmentResult.success) {
                        toast.error(assignmentResult.error)
                        return
                    }
                }
                savedSuccessfully = true
                allowNavigation()
                setHasSaved(true)
                toast.success(editDeliveryId ? "Entrega atualizada com sucesso!" : "Entrega criada com sucesso!")
                onSuccess()
            } else {
                toast.error(response.error || (editDeliveryId ? "Erro ao atualizar entrega." : "Erro ao criar entrega."))
            }
        } catch (err: any) {
            toast.error(err?.message || "Erro inesperado ao salvar entrega.")
        } finally {
            if (!savedSuccessfully) {
                setIsSaving(false)
            }
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

    if (isLoadingDelivery) {
        return (
            <div className="flex items-center justify-center h-full min-h-[200px] w-full">
                <ThreeDotsLoader />
            </div>
        )
    }

    return (
        <FadeIn className="h-full">
            <div className="flex flex-col h-full bg-white dark:bg-dark-background overflow-hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto custom-scrollbar w-full relative pb-20 md:pb-0">

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
                                            <span className="hidden md:inline truncate">{pageTitle}</span>
                                        </h1>

                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            {editDeliveryId ? "Altere os pedidos, atribua um entregador e defina a saída." : "Selecione pedidos, atribua um entregador e defina a saída."}
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        <Button variant="outline" onClick={handleBack} disabled={isSaving}>
                                            Cancelar
                                        </Button>
                                        <Button onClick={handleSave} disabled={isSaving || selectedOrderIds.length === 0 || (showDispatchDateTime && (!date || !time)) || isBlocked} leftIcon={<SaveIcon size={18} />}>
                                            {isSaving ? "Salvando..." : "Salvar"}
                                        </Button>
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="Pedidos" onClick={() => setStep(1)}>
                                            Pedidos
                                        </TabsTrigger>
                                        <TabsTrigger value="Observacoes" onClick={() => setStep(2)}>
                                            Observações
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
                                                                                            <Badge variant={searchPaymentMeta.variant} icon={<MoneyIcon />} className="scale-90 whitespace-nowrap">
                                                                                                {searchPaymentMeta.label}
                                                                                            </Badge>
                                                                                            <Badge variant={searchDeliveryMeta.variant} icon={<TruckIcon />} className="scale-90 whitespace-nowrap">
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
                                                                {selectedOrders.map((order) => {
                                                                    const orderPaymentMeta = getPaymentStatusMeta(order.status)
                                                                    const orderDeliveryMeta = getDeliveryStatusMeta(order.deliveryStatus)
                                                                    return (
                                                                        <div
                                                                            key={order.id}
                                                                            className="p-4 flex items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-dark-border/40 cursor-pointer transition-colors"
                                                                            onClick={() => setInfoOrder(order)}
                                                                        >
                                                                            <div className="min-w-0">
                                                                                <p className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                                                    {order.displayId}
                                                                                </p>
                                                                                <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                                                                    {order.customer?.name || "Cliente"} • {formatCurrency(order.totalAmount || 0)}
                                                                                </p>
                                                                            </div>
                                                                            <div className="flex items-center gap-2 shrink-0">
                                                                                <Tooltip text={orderPaymentMeta.label}>
                                                                                    <span className="inline-flex">
                                                                                        <span className="hidden lg:inline-flex">
                                                                                            <Badge variant={orderPaymentMeta.variant} icon={<MoneyIcon />}>
                                                                                                {orderPaymentMeta.label}
                                                                                            </Badge>
                                                                                        </span>
                                                                                        <span className="lg:hidden inline-flex">
                                                                                            <Badge variant={orderPaymentMeta.variant} icon={<MoneyIcon />} />
                                                                                        </span>
                                                                                    </span>
                                                                                </Tooltip>
                                                                                <Tooltip text={orderDeliveryMeta.label}>
                                                                                    <span className="inline-flex">
                                                                                        <span className="hidden lg:inline-flex">
                                                                                            <Badge variant={orderDeliveryMeta.variant} icon={<TruckIcon />}>
                                                                                                {orderDeliveryMeta.label}
                                                                                            </Badge>
                                                                                        </span>
                                                                                        <span className="lg:hidden inline-flex">
                                                                                            <Badge variant={orderDeliveryMeta.variant} icon={<TruckIcon />} />
                                                                                        </span>
                                                                                    </span>
                                                                                </Tooltip>
                                                                                <Button
                                                                                    variant="ghostred"
                                                                                    className="w-9 h-9"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation()
                                                                                        setOrderToRemove(order.id)
                                                                                    }}
                                                                                    title="Remover"
                                                                                >
                                                                                    <TrashIcon className="w-4 h-4" />
                                                                                </Button>
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                })}
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
                                                                    setValue={handleDriverSelectionChange}
                                                                    options={deliveryPeopleOptions}
                                                                    onFocus={() => {
                                                                        void loadDeliveryPeople()
                                                                    }}
                                                                    actionItem={{
                                                                        label: "Entregadores Dudit",
                                                                        icon: <TruckIcon size={16} />,
                                                                        onClick: () => setIsDriverSheetOpen(true),
                                                                    }}
                                                                />

                                                                {platformDriver && !platformDriver.isPendingAcceptance && (
                                                                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-brand-gray/50 dark:bg-dark-border/20 border border-brand-border dark:border-dark-border">
                                                                        <div className="flex items-center gap-2 min-w-0">
                                                                            <img src="https://img.dudit.com.br/static/Icon.png" alt="Dudit" className="w-3.5 h-3.5 object-contain shrink-0" />
                                                                            <span className="text-xs font-bold text-brand-dark dark:text-dark-heading truncate">{platformDriver.fullName}</span>
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setIsDuditDriverDetailsOpen(true)}
                                                                            className="text-[11px] font-bold text-brand-green hover:underline shrink-0"
                                                                        >
                                                                            Ver detalhes
                                                                        </button>
                                                                    </div>
                                                                )}

                                                                <FormDropdown
                                                                    label="Status"
                                                                    value={status}
                                                                    setValue={setStatus}
                                                                    options={[
                                                                        { value: "pending", label: "Não enviado" },
                                                                        { value: "preparing", label: "Em preparação" },
                                                                        { value: "sent", label: "Enviado" },
                                                                        { value: "delivered", label: "Entregue" },
                                                                        { value: "cancelled", label: "Cancelada" },
                                                                    ]}
                                                                />

                                                                {showDispatchDateTime && (
                                                                    <>
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
                                                                    </>
                                                                )}
                                                            </div>
                                                        </section>


                                                    </>
                                                )}
                                            </div>

                                            <div className="col-span-12 hidden border-l border-brand-border pl-12 dark:border-dark-border lg:block lg:col-span-4">
                                                <SidebarCard hasSeparator hasTopStrip title="Informações da Entrega">
                                                    <div className="grid grid-cols-1 gap-4">
                                                        <FormDropdown
                                                            label="Entregador"
                                                            value={selectedDeliveryPersonId || "none"}
                                                            setValue={handleDriverSelectionChange}
                                                            options={deliveryPeopleOptions}
                                                            onFocus={() => {
                                                                void loadDeliveryPeople()
                                                            }}
                                                            actionItem={{
                                                                label: "Entregadores Dudit",
                                                                icon: <TruckIcon size={16} />,
                                                                onClick: () => setIsDriverSheetOpen(true),
                                                            }}
                                                        />

                                                        {platformDriver && !platformDriver.isPendingAcceptance && (
                                                            <div className="flex items-center justify-between p-2.5 rounded-xl bg-brand-gray/50 dark:bg-dark-border/20 border border-brand-border dark:border-dark-border">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <img src="https://img.dudit.com.br/static/Icon.png" alt="Dudit" className="w-3.5 h-3.5 object-contain shrink-0" />
                                                                    <span className="text-xs font-bold text-brand-dark dark:text-dark-heading truncate">{platformDriver.fullName}</span>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setIsDuditDriverDetailsOpen(true)}
                                                                    className="text-[11px] font-bold text-brand-green hover:underline shrink-0"
                                                                >
                                                                    Ver detalhes
                                                                </button>
                                                            </div>
                                                        )}

                                                        <FormDropdown
                                                            label="Status"
                                                            value={status}
                                                            setValue={setStatus}
                                                            options={[
                                                                { value: "pending", label: "Não enviado" },
                                                                { value: "preparing", label: "Em preparação" },
                                                                { value: "sent", label: "Enviado" },
                                                                { value: "delivered", label: "Entregue" },
                                                                { value: "cancelled", label: "Cancelada" },
                                                            ]}
                                                        />

                                                        {showDispatchDateTime && (
                                                            <>
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
                                                            </>
                                                        )}
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
                                                setValue={handleDriverSelectionChange}
                                                options={deliveryPeopleOptions}
                                                onFocus={() => { void loadDeliveryPeople() }}
                                                actionItem={{
                                                    label: "Entregadores Dudit",
                                                    icon: <TruckIcon size={16} />,
                                                    onClick: () => setIsDriverSheetOpen(true),
                                                }}
                                            />
                                        </div>
                                    </FadeIn>
                                </TabsContent>

                                <TabsContent value="Saida" className="mt-0">
                                    <FadeIn key={activeTab}>
                                        <div className="max-w-2xl space-y-4">
                                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Saída</h3>
                                            {showDispatchDateTime ? (
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
                                            ) : (
                                                <InfoCard
                                                    color="gray"
                                                    message="A data e o horário de saída são preenchidos apenas quando o status for Enviado, Entregue ou Cancelada."
                                                />
                                            )}
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
                                    </FadeIn>
                                </TabsContent>
                            </AnimatePresence>
                        </div>

                        {/* Mobile Bottom Action Bar */}
                        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                            <Button variant="outline" className="flex-1" onClick={handleBack} disabled={isSaving}>
                                Cancelar
                            </Button>
                            <Button onClick={handleSave} className="flex-1" disabled={isSaving || selectedOrderIds.length === 0 || (showDispatchDateTime && (!date || !time)) || isBlocked} leftIcon={<SaveIcon size={18} />}>
                                {isSaving ? "Salvando..." : "Salvar"}
                            </Button>
                        </div>
                    </div>
                </Tabs >
            </div >

            <SavingStatusModal isOpen={isSaving} text={editDeliveryId ? "Salvando entrega..." : "Criando entrega..."} />

            <UnsavedChangesDialog
                open={showConfirmDialog}
                onConfirm={handleConfirmExit}
                onCancel={cancelNavigation}
                description="Você tem alterações na entrega que ainda não foram salvas."
            />

            <DeliveryOrderDetailSheet
                isOpen={!!infoOrder}
                onClose={() => setInfoOrder(null)}
                order={infoOrder}
            />

            <DeliveryDriverPickerSheet
                isOpen={isDriverSheetOpen}
                onClose={() => setIsDriverSheetOpen(false)}
                partnerId={partnerId}
                deliveryId={editDeliveryId || undefined}
                orderId={selectedOrderIds[0] || undefined}
                orderIds={selectedOrderIds}
                destinationAddress={customerAddress ? `${customerAddress.street}, ${customerAddress.number || "S/N"} - ${customerAddress.neighborhood}, ${customerAddress.city}` : undefined}
                deliveryFee={selectedOrders.reduce((sum, o) => sum + Number(o.deliveryFee || o.shippingFee || 0), 0)}
                onDeliveryRequested={() => {
                    setPlatformDriver({ id: "dudit_network", fullName: "Rede de Entregadores Dudit", isPlatformDriver: true })
                    setSelectedDeliveryPersonId("platform:dudit_network")
                }}
                onSelect={(driverId: string, driver?: any) => {
                    if (driver) setPlatformDriver(driver)
                    setSelectedDeliveryPersonId(driverId)
                }}
            />

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

            <DefaultModal
                isOpen={isDuditDriverDetailsOpen}
                onClose={() => setIsDuditDriverDetailsOpen(false)}
                title="Detalhes do Entregador"
                maxWidth="md"
            >
                <DuditDriverDetailsModal isOpen={isDuditDriverDetailsOpen} onClose={() => setIsDuditDriverDetailsOpen(false)} driver={platformDriver} deliveryNumber={deliveryNumber} />
            </DefaultModal>

            <AlertModal
                isOpen={unassignModal.isOpen}
                onClose={() => setUnassignModal(prev => ({ ...prev, isOpen: false, isSubmitting: false }))}
                onConfirm={handleConfirmUnassign}
                title="Atenção: Desatribuir Entregador Dudit"
                message={
                    <div className="space-y-4 text-left">
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                            O entregador Dudit <strong className="text-brand-dark dark:text-dark-heading">{initialPlatformDriverRef.current?.fullName || "Parceiro"}</strong> já aceitou esta corrida e pode estar a caminho do estabelecimento.
                        </p>
                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                            Para trocar ou remover o entregador, confirme que está ciente e informe a justificativa abaixo. O entregador receberá esta mensagem via notificação.
                        </p>
                        <div className="space-y-2 pt-1">
                            <FormTextarea
                                label="Motivo da desatribuição (obrigatório)"
                                placeholder="Ex: Pedido cancelado pelo cliente, alteração no horário de preparo, etc."
                                value={unassignModal.reason}
                                onChange={(e: any) => setUnassignModal(prev => ({ ...prev, reason: e.target.value }))}
                                rows={3}
                            />
                        </div>
                        <label className="flex items-start gap-2.5 pt-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={unassignModal.isConfirmed}
                                onChange={(e) => setUnassignModal(prev => ({ ...prev, isConfirmed: e.target.checked }))}
                                className="mt-0.5 h-4 w-4 rounded border-brand-border text-brand-green focus:ring-brand-green"
                            />
                            <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading">
                                Estou ciente e confirmo a desatribuição deste entregador.
                            </span>
                        </label>
                    </div>
                }
                confirmText="Confirmar e Desatribuir"
                cancelText="Voltar"
                disabled={!unassignModal.isConfirmed || !unassignModal.reason.trim() || unassignModal.isSubmitting}
                isLoading={unassignModal.isSubmitting}
                variant="danger"
                isDestructive
            />
        </FadeIn >
    )
}

