"use client"

import React, { useState } from "react"
import {
    TruckIcon,
    MotorbikeIcon,
    InfoIcon,
    WhatsappIcon,
    PhoneIcon,
    CheckCircleIcon,
    ClockIcon,
    AlertCircleIcon,
    BlockedIcon,
} from "@/lib/icons"
import { FormSection, ListItem, Badge, Button, DefaultModal } from "@/components/reusable"
import BottomSheet from "@/components/BottomSheet"
import { formatDayMonth, formatTime, formatDateTime, formatFullDate } from "@/lib/utils"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import DuditDriverDetailsModal from "@/components/erp/deliveries/DuditDriverDetailsModal"
import { DuditPlatformDriver } from "@/components/erp/deliveries/types"

export interface DeliveryTimelineStep {
    label: string
    active: boolean
    date?: string
    time?: string
    subLabel?: string
}

export function getDeliveryTimelineSteps(
    deliveryStatus: string,
    isPickup: boolean,
    isPaid: boolean,
    orderCreatedAt: string | Date,
    orderUpdatedAt?: string | Date
): DeliveryTimelineStep[] {
    const baseDate = formatDayMonth(orderCreatedAt || new Date())
    const baseTime = formatTime(orderCreatedAt || new Date())

    const isCancelled = deliveryStatus === "cancelled"
    const cancelledAt = orderUpdatedAt || orderCreatedAt
    const cancelledDate = formatDayMonth(cancelledAt || new Date())
    const cancelledTime = formatTime(cancelledAt || new Date())

    const fmtActive = (condition: boolean) => {
        if (!condition) return { date: undefined as string | undefined, time: undefined as string | undefined }
        const when = orderUpdatedAt || orderCreatedAt
        return { date: formatDayMonth(when || new Date()), time: formatTime(when || new Date()) }
    }

    const paymentMeta = fmtActive(isPaid)
    const preparingMeta = fmtActive(isPaid && ["preparing", "sent", "delivered", "pickup_available", "delivery_failed"].includes(deliveryStatus))
    const sentMeta = fmtActive(isPaid && ["sent", "delivered", "delivery_failed", "pickup_available"].includes(deliveryStatus))
    const deliveredMeta = fmtActive(isPaid && ["delivered", "pickup_available", "delivery_failed"].includes(deliveryStatus))

    if (isCancelled) {
        return [
            { label: "Pedido Realizado", date: baseDate, time: baseTime, active: true },
            { label: isPaid ? "Pago" : "Aguardando pagamento", date: baseDate, time: baseTime, active: true },
            { label: "Cancelado", date: cancelledDate, time: cancelledTime, active: true },
        ]
    }

    if (isPickup) {
        let finalLabel = "Retirado"
        if (deliveryStatus === "delivery_failed") finalLabel = "Retirada não realizada"

        return [
            { label: "Pedido Realizado", date: baseDate, time: baseTime, active: true },
            {
                label: isPaid ? "Pago" : "Aguardando pagamento",
                date: isPaid ? paymentMeta.date : baseDate,
                time: isPaid ? paymentMeta.time : baseTime,
                active: true,
            },
            {
                label: "Em preparação",
                date: preparingMeta.date,
                time: preparingMeta.time,
                active: isPaid && ["preparing", "sent", "delivered", "pickup_available", "delivery_failed"].includes(deliveryStatus),
            },
            {
                label: "Pronto para retirada",
                date: sentMeta.date,
                time: sentMeta.time,
                active: isPaid && ["sent", "delivered", "delivery_failed", "pickup_available"].includes(deliveryStatus),
            },
            {
                label: finalLabel,
                date: deliveredMeta.date,
                time: deliveredMeta.time,
                active: isPaid && ["delivered", "pickup_available", "delivery_failed"].includes(deliveryStatus),
            },
        ]
    }

    let finalLabel = "Entregue"
    if (deliveryStatus === "delivery_failed") finalLabel = "Falha na entrega"

    return [
        { label: "Pedido Realizado", date: baseDate, time: baseTime, active: true },
        {
            label: isPaid ? "Pago" : "Aguardando pagamento",
            date: isPaid ? paymentMeta.date : baseDate,
            time: isPaid ? paymentMeta.time : baseTime,
            active: true,
        },
        {
            label: "Em preparação",
            date: preparingMeta.date,
            time: preparingMeta.time,
            active: isPaid && ["preparing", "sent", "delivered", "pickup_available", "delivery_failed"].includes(deliveryStatus),
        },
        {
            label: "Saiu para entrega",
            date: sentMeta.date,
            time: sentMeta.time,
            active: isPaid && ["sent", "delivered", "delivery_failed", "pickup_available"].includes(deliveryStatus),
        },
        {
            label: finalLabel,
            date: deliveredMeta.date,
            time: deliveredMeta.time,
            active: isPaid && ["delivered", "pickup_available", "delivery_failed"].includes(deliveryStatus),
        },
    ]
}

interface DeliveryStatusTimelineProps {
    deliveryStatus: string
    isPickup: boolean
    isPaid: boolean
    orderCreatedAt: string | Date
    orderUpdatedAt?: string | Date
}

export const DeliveryStatusTimeline: React.FC<DeliveryStatusTimelineProps> = ({
    deliveryStatus,
    isPickup,
    isPaid,
    orderCreatedAt,
    orderUpdatedAt,
}) => {
    const [isStepsSheetOpen, setIsStepsSheetOpen] = useState(false)

    const steps = getDeliveryTimelineSteps(
        deliveryStatus,
        isPickup,
        isPaid,
        orderCreatedAt,
        orderUpdatedAt
    )

    const isFailed = deliveryStatus === "delivery_failed"
    const activeCount = steps.filter((s) => s.active).length

    const currentStep =
        steps.filter((s) => s.active).reverse()[0] || steps[0]

    return (
        <>
            <div className="space-y-6">
                <FormSection title="Status da Entrega">
                    <div className="hidden lg:block">
                        <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden">
                            <div className="bg-brand-gray dark:bg-dark-border/50 p-6 border-b border-brand-border dark:border-dark-border">
                                <div className="flex items-center gap-1.5 text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                                    <span>{isPickup ? "Retirada" : "Entrega"}</span>
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                    <span className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                                        {currentStep.label}
                                    </span>
                                    <Badge variant={isFailed ? "red" : activeCount === steps.length ? "green" : "gray"}>
                                        {isFailed
                                            ? "Falha na entrega"
                                            : activeCount === steps.length
                                              ? "Concluído"
                                              : "Em andamento"}
                                    </Badge>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-dark-surface px-12 pt-12 pb-12">
                                <div className="relative px-4">
                                    <div className="relative h-1.5 w-full bg-gray-100 dark:bg-dark-border/50 rounded-full flex items-center justify-between">
                                        <div
                                            className={`absolute left-0 h-full rounded-full transition-all duration-500 ${
                                                isFailed ? "bg-brand-red" : "bg-brand-dark dark:bg-dark-heading"
                                            }`}
                                            style={{
                                                width: `${
                                                    steps.length <= 1
                                                        ? 0
                                                        : ((activeCount - 1) / (steps.length - 1)) * 100
                                                }%`,
                                            }}
                                        ></div>

                                        {steps.map((step, idx) => {
                                            const isLastFailed = isFailed && idx === steps.length - 1
                                            return (
                                                <div
                                                    key={idx}
                                                    className="relative flex flex-col items-center"
                                                >
                                                    <div className="absolute bottom-6 whitespace-nowrap flex flex-col items-center">
                                                        <span
                                                            className={`text-xs font-medium ${
                                                                step.active
                                                                    ? isLastFailed
                                                                        ? "text-brand-red"
                                                                        : "text-brand-dark dark:text-dark-heading"
                                                                    : "text-gray-400 dark:text-dark-body"
                                                            }`}
                                                        >
                                                            {step.label}
                                                        </span>
                                                    </div>
                                                    <div
                                                        className={`w-4 h-4 rounded-full border-2 z-10 transition-colors duration-300 flex items-center justify-center ${
                                                            step.active
                                                                ? isLastFailed
                                                                    ? "bg-brand-red border-brand-red"
                                                                    : "bg-brand-dark dark:bg-dark-heading border-brand-dark dark:border-dark-heading"
                                                                : "bg-white dark:bg-dark-surface border-gray-300 dark:border-dark-border"
                                                        }`}
                                                    >
                                                        {step.active && (
                                                            <div
                                                                className={`w-1.5 h-1.5 rounded-full ${
                                                                    isLastFailed
                                                                        ? "bg-white"
                                                                        : "bg-white dark:bg-dark-surface"
                                                                }`}
                                                            ></div>
                                                        )}
                                                    </div>
                                                    <div className="absolute top-6 whitespace-nowrap flex flex-col items-center">
                                                        {step.date ? (
                                                            <div className="flex items-center gap-1 text-xs text-brand-inactive-text">
                                                                <span>{step.date}</span>
                                                                {step.time && <span>{step.time}</span>}
                                                            </div>
                                                        ) : (
                                                            <div className="text-xs font-medium text-gray-300 dark:text-dark-body/50">
                                                                -
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="lg:hidden">
                        <ListItem
                            title={currentStep.label}
                            description={
                                currentStep.date
                                    ? `${currentStep.date} às ${currentStep.time}`
                                    : undefined
                            }
                            className="border-0 bg-transparent px-0 hover:bg-transparent"
                            showChevron={true}
                            onClick={() => setIsStepsSheetOpen(true)}
                            left={
                                <div
                                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                                        isFailed
                                            ? "bg-brand-red/10 text-brand-red"
                                            : "bg-brand-dark/10 dark:bg-dark-border/50 text-brand-dark dark:text-dark-heading"
                                    }`}
                                >
                                    <div
                                        className={`w-2.5 h-2.5 rounded-full ${
                                            isFailed
                                                ? "bg-brand-red"
                                                : "bg-brand-dark dark:bg-dark-heading"
                                        }`}
                                    />
                                </div>
                            }
                        />
                    </div>
                </FormSection>
            </div>

            <BottomSheet
                isOpen={isStepsSheetOpen}
                onClose={() => setIsStepsSheetOpen(false)}
                title={isPickup ? "Status da Retirada" : "Status da Entrega"}
            >
                <div className="space-y-0 my-4 px-2">
                    {steps.map((step, idx) => {
                        const isLastFailed = isFailed && idx === steps.length - 1
                        return (
                            <div
                                key={idx}
                                className="relative pl-6 pb-6 border-l-2 border-brand-border dark:border-dark-border last:border-l-transparent"
                            >
                                <div
                                    className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 z-10 transition-colors duration-300 flex items-center justify-center ${
                                        step.active
                                            ? isLastFailed
                                                ? "bg-brand-red border-brand-red"
                                                : "bg-brand-dark dark:bg-dark-heading border-brand-dark dark:border-dark-heading"
                                            : "bg-white dark:bg-dark-surface border-gray-300 dark:border-dark-border"
                                    }`}
                                >
                                    {step.active && (
                                        <div className="w-1.5 h-1.5 bg-white dark:bg-dark-surface rounded-full"></div>
                                    )}
                                </div>
                                <div className="flex flex-col text-left">
                                    <span
                                        className={`text-sm font-semibold ${
                                            step.active
                                                ? isLastFailed
                                                    ? "text-brand-red"
                                                    : "text-brand-dark dark:text-dark-heading"
                                                : "text-gray-400 dark:text-dark-body"
                                        }`}
                                    >
                                        {step.label}
                                    </span>
                                    {step.date ? (
                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                            {step.date} às {step.time}
                                        </span>
                                    ) : (
                                        <span className="text-xs text-gray-300 dark:text-dark-body/50 mt-0.5">
                                            -
                                        </span>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </BottomSheet>
        </>
    )
}

export interface DeliveryDriverInfo {
    type: "platform" | "store" | "none"
    name: string
    avatarUrl?: string | null
    isPlatformDriver?: boolean
    totalDeliveries?: number
    vehicleType?: string | null
    driverStatus?: string | null
    phone?: string | null
    platformDriverData?: DuditPlatformDriver | null
}

interface DeliveryDriverSectionProps {
    driverInfo: DeliveryDriverInfo | null
    deliveryStatus: string
    formatCurrency: (value: number) => string
}

export const DeliveryDriverSection: React.FC<DeliveryDriverSectionProps> = ({
    driverInfo,
    deliveryStatus,
    formatCurrency,
}) => {
    const [isDuditDriverModalOpen, setIsDuditDriverModalOpen] = useState(false)

    if (!driverInfo || driverInfo.type === "none") {
        return (
            <FormSection title="Entregador">
                <ListItem
                    icon={<MotorbikeIcon />}
                    title="Entrega própria"
                    description="Ainda não há um entregador atribuído a este pedido."
                    className="px-4 py-3"
                />
            </FormSection>
        )
    }

    if (driverInfo.type === "platform") {
        const driver = driverInfo.platformDriverData
        if (!driver) {
            return (
                <FormSection title="Entregador">
                    <div className="flex items-center gap-4">
                        <UserProfileImage
                            fullName={driverInfo.name}
                            imageUrl={driverInfo.avatarUrl}
                            className="w-10 h-10"
                        />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-md font-bold text-brand-dark dark:text-dark-heading truncate">
                                    Entregador da rede dudit - {driverInfo.name}
                                </span>
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/20 dark:text-brand-primary">
                                    Dudit
                                </span>
                            </div>
                            <div className="text-sm text-brand-inactive-text dark:text-dark-body mt-0.5 flex items-center gap-1.5 flex-wrap">
                                {driverInfo.totalDeliveries && driverInfo.totalDeliveries > 0 ? (
                                    <span>{driverInfo.totalDeliveries} entregas realizadas</span>
                                ) : (
                                    <span>Entregador Parceiro</span>
                                )}
                                {driverInfo.vehicleType && <span>• {driverInfo.vehicleType}</span>}
                            </div>
                        </div>
                    </div>
                </FormSection>
            )
        }

        return (
            <>
                <FormSection title="Entregador">
                    <ListItem
                        title={
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-brand-dark dark:text-dark-heading">
                                    Entregador da rede dudit - {driver.fullName || "Entregador"}
                                </span>
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/20 dark:text-brand-primary">
                                    Dudit
                                </span>
                            </div>
                        }
                        description={
                            <div className="flex items-center gap-1.5 flex-wrap text-sm text-brand-inactive-text dark:text-dark-body mt-0.5">
                                {driverInfo.totalDeliveries && driverInfo.totalDeliveries > 0 ? (
                                    <span>{driverInfo.totalDeliveries} entregas realizadas</span>
                                ) : (
                                    <span>Entregador Parceiro</span>
                                )}
                                {driverInfo.vehicleType && <span>• {driverInfo.vehicleType}</span>}
                            </div>
                        }
                        left={
                            <UserProfileImage
                                fullName={driver.fullName || "Entregador"}
                                imageUrl={driver.avatarUrl}
                                className="w-10 h-10"
                            />
                        }
                        right={
                            driverInfo.phone &&
                            ["sent", "out_for_delivery", "assigned", "accepted"].includes(
                                driverInfo.driverStatus || deliveryStatus
                            ) ? (
                                <a
                                    href={`https://wa.me/55${String(driverInfo.phone).replace(/\D/g, "")}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 p-2 rounded-xl border border-brand-border dark:border-dark-border hover:bg-brand-surface dark:hover:bg-dark-surface transition-colors flex items-center gap-1.5 text-xs font-semibold text-brand-dark dark:text-dark-heading"
                                    title="Conversar no WhatsApp"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <WhatsappIcon size={16} className="text-[#25D366]" />
                                </a>
                            ) : null
                        }
                        showChevron={true}
                        className="cursor-pointer"
                        onClick={() => setIsDuditDriverModalOpen(true)}
                    />

                    <DefaultModal
                        isOpen={isDuditDriverModalOpen}
                        onClose={() => setIsDuditDriverModalOpen(false)}
                        title="Detalhes do Entregador"
                        maxWidth="md"
                    >
                        <DuditDriverDetailsModal
                            isOpen={isDuditDriverModalOpen}
                            onClose={() => setIsDuditDriverModalOpen(false)}
                            driver={driver!}
                        />
                    </DefaultModal>
                </FormSection>
            </>
        )
    }

    // Store driver
    return (
        <FormSection title="Entregador">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border/30 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border shrink-0 text-brand-inactive-text dark:text-dark-body">
                    <MotorbikeIcon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                    <span className="text-md font-bold text-brand-dark dark:text-dark-heading truncate block">
                        Entregador da loja - {driverInfo.name}
                    </span>
                    <span className="text-sm text-brand-inactive-text dark:text-dark-body">
                        Entregador próprio do estabelecimento
                    </span>
                </div>
                {driverInfo.phone &&
                ["sent", "out_for_delivery"].includes(deliveryStatus) ? (
                    <a
                        href={`https://wa.me/55${String(driverInfo.phone).replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 p-2 rounded-xl border border-brand-border dark:border-dark-border hover:bg-brand-surface dark:hover:bg-dark-surface transition-colors flex items-center gap-1.5 text-xs font-semibold text-brand-dark dark:text-dark-heading"
                        title="Conversar no WhatsApp"
                    >
                        <WhatsappIcon size={16} className="text-[#25D366]" />
                    </a>
                ) : null}
            </div>
        </FormSection>
    )
}

interface DeliverySummarySectionProps {
    order: any
    driverInfo: DeliveryDriverInfo | null
    formatCurrency: (value: number) => string
    formatPartnerAddress?: (addresses: any) => string
    deliveryNumber?: number | string | null
}

const DetailRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex justify-between items-center text-sm gap-4 py-2.5 border-b border-brand-border/40 dark:border-dark-border/40 last:border-0">
        <span className="text-brand-inactive-text dark:text-dark-body font-medium">{label}</span>
        <div className="text-right font-semibold text-brand-dark dark:text-dark-heading">{value}</div>
    </div>
)

export const DeliverySummarySection: React.FC<DeliverySummarySectionProps> = ({
    order,
    driverInfo,
    formatCurrency,
    formatPartnerAddress,
    deliveryNumber,
}) => {
    const isPickup = order.delivery_type === "pickup"
    const store = Array.isArray(order.stores) ? order.stores[0] : order.stores
    const distanceKm = order.delivery_driver?.distanceKm ?? order.delivery_breakdown?.distanceKm
    const estimatedHours = order.delivery_driver?.estimatedHours

    const getFulfillmentType = () => {
        if (isPickup) return "Retirada"
        if (driverInfo?.type === "platform") return "Entregador da Rede Dudit"
        return "Entrega própria"
    }

    return (
        <FormSection title="Resumo da Entrega" hasSeparator>
            <div className="space-y-3">
                <DetailRow label="Tipo de entrega" value={getFulfillmentType()} />
                {order.delivery_address && !isPickup && (
                    <DetailRow
                        label="Endereço"
                        value={
                            <span className="text-sm truncate inline-block max-w-[200px]">
                                {order.delivery_address}
                            </span>
                        }
                    />
                )}
                {deliveryNumber && (
                    <DetailRow label="Nº Entrega" value={`#${deliveryNumber}`} />
                )}
                {Number(order.delivery_fee || 0) > 0 && (
                    <DetailRow label="Taxa de entrega" value={formatCurrency(order.delivery_fee)} />
                )}
                {estimatedHours != null && estimatedHours > 0 && (
                    <DetailRow label="Tempo estimado" value={`${estimatedHours} h`} />
                )}
                {distanceKm != null && (
                    <DetailRow label="Distância" value={`${distanceKm} km`} />
                )}
                {isPickup && store?.addresses && formatPartnerAddress && (
                    <DetailRow
                        label="Local de retirada"
                        value={
                            <span className="text-sm truncate inline-block max-w-[200px]">
                                {formatPartnerAddress(store.addresses)}
                            </span>
                        }
                    />
                )}
            </div>
        </FormSection>
    )
}
