"use client"

import React, { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { FadeIn } from "@/components/animations/FadeIn"
import { Button, Badge, IconPlaceholder } from "@/components/reusable"
import { toast } from "@/hooks/use-notification"
import { setMyDeliveryAvailabilityAction } from "@/app/actions/delivery-drivers"
import {
    DRIVER_AVAILABILITY_EVENT,
    DRIVER_LOCATION_EVENT,
    type DriverLocationBeaconState,
    type DriverPositionQuality,
} from "./DriverLocationBeacon"
import {
    TruckIcon,
    CheckCircleIcon,
    ClockIcon,
    ArrowRightIcon,
    Package,
    ReloadIcon,
} from "@/lib/icons"
import { formatCurrency, formatDate } from "@/lib/utils"
import DeliveryAssignmentListRow, {
    type DeliveryAssignmentItem,
    statusConfig,
} from "./DeliveryAssignmentListRow"

interface DeliveryDashboardProps {
    dashboard: {
        pending?: number
        in_progress?: number
        completed?: number
        availability?: "available" | "offline" | "occupied" | string
        position_quality?: DriverPositionQuality
        location_source?: string | null
        located_at?: string | null
    } | null
    deliveries: DeliveryAssignmentItem[]
}

export default function DeliveryDashboard({ dashboard, deliveries = [] }: DeliveryDashboardProps) {
    const [availability, setAvailability] = useState<string>(
        String(dashboard?.availability || "offline")
    )
    const [positionQuality, setPositionQuality] = useState<DriverPositionQuality>(
        dashboard?.position_quality || "unknown"
    )
    const [saving, setSaving] = useState(false)
    const [recentTab, setRecentTab] = useState<"all" | "pending" | "in_progress" | "completed">("all")

    useEffect(() => {
        const handleLoc = (event: Event) => {
            const detail = (event as CustomEvent<DriverLocationBeaconState>).detail
            if (detail?.quality) {
                setPositionQuality(detail.quality)
            }
        }
        const handleAvail = (event: Event) => {
            const detail = (event as CustomEvent<{ status: string }>).detail
            if (detail?.status) {
                setAvailability(detail.status)
            }
        }
        window.addEventListener(DRIVER_LOCATION_EVENT, handleLoc)
        window.addEventListener(DRIVER_AVAILABILITY_EVENT, handleAvail)
        return () => {
            window.removeEventListener(DRIVER_LOCATION_EVENT, handleLoc)
            window.removeEventListener(DRIVER_AVAILABILITY_EVENT, handleAvail)
        }
    }, [])

    const changeAvailability = async (value: "available" | "offline") => {
        setSaving(true)
        const result = await setMyDeliveryAvailabilityAction(value)
        setSaving(false)
        if (!result.success) {
            toast.error(result.error || "Não foi possível atualizar a disponibilidade.")
            return
        }
        setAvailability(value)
        window.dispatchEvent(new CustomEvent(DRIVER_AVAILABILITY_EVENT, { detail: { status: value } }))
        toast.success(value === "available" ? "Você está online para receber entregas!" : "Você está offline.")
    }

    const filteredDeliveries = useMemo(() => {
        return deliveries.filter((item) => {
            if (recentTab === "pending") return ["assigned", "accepted"].includes(item.status)
            if (recentTab === "in_progress") return ["picked_up", "out_for_delivery"].includes(item.status)
            if (recentTab === "completed") return item.status === "delivered"
            return true
        })
    }, [deliveries, recentTab])

    const isAvailable = availability === "available"
    const isOccupied = availability === "occupied"

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
            <div className="mx-auto w-full pt-4 px-4 md:px-8 pb-12 flex flex-col gap-6">
                {/* DESKTOP HEADER */}
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                    <div className="flex flex-col gap-1">
                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            Portal do Entregador
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Acompanhe seus indicadores, disponibilidade e entregas em tempo real.
                        </p>
                    </div>

                    {/* AVAILABILITY STATUS CONTROLLER */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 rounded-2xl border border-brand-border bg-white p-1.5 shadow-xs dark:border-dark-border dark:bg-dark-surface">
                            <div className="flex items-center gap-2 pl-2.5 pr-1">
                                <span
                                    className={`h-2.5 w-2.5 rounded-full ${
                                        isOccupied
                                            ? "bg-amber-500 animate-pulse"
                                            : isAvailable
                                            ? "bg-emerald-500 animate-pulse"
                                            : "bg-gray-400"
                                    }`}
                                />
                                <span className="text-xs font-bold text-brand-dark dark:text-dark-heading">
                                    {isOccupied ? "Ocupado" : isAvailable ? "Disponível" : "Offline"}
                                </span>
                            </div>

                            <select
                                value={isOccupied ? "available" : availability}
                                onChange={(e) => changeAvailability(e.target.value as "available" | "offline")}
                                disabled={saving || isOccupied}
                                className="rounded-xl border border-brand-border bg-brand-gray px-3 py-1.5 text-xs font-semibold text-brand-dark outline-none transition dark:border-dark-border dark:bg-dark-border dark:text-dark-heading cursor-pointer disabled:opacity-50"
                            >
                                <option value="available">Ficar Disponível</option>
                                <option value="offline">Ficar Offline</option>
                            </select>
                        </div>

                        <Button
                            variant="outline"
                            onClick={() => window.location.reload()}
                            className="hidden sm:inline-flex"
                            leftIcon={<ReloadIcon size={15} />}
                        >
                            Atualizar
                        </Button>
                    </div>
                </div>

                {/* KPI METRIC CARDS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* CARD 1: PENDENTES */}
                    <div className="flex flex-col justify-between rounded-2xl border border-brand-border bg-white p-5 shadow-xs transition hover:shadow-md dark:border-dark-border dark:bg-dark-surface">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text">
                                Pendentes
                            </span>
                            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                                <ClockIcon size={18} />
                            </div>
                        </div>
                        <div className="mt-4">
                            <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading">
                                {dashboard?.pending || 0}
                            </p>
                            <p className="text-xs text-brand-inactive-text mt-1">Aguardando início</p>
                        </div>
                    </div>

                    {/* CARD 2: EM ANDAMENTO */}
                    <div className="flex flex-col justify-between rounded-2xl border border-brand-border bg-white p-5 shadow-xs transition hover:shadow-md dark:border-dark-border dark:bg-dark-surface">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text">
                                Em Andamento
                            </span>
                            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                                <TruckIcon size={18} />
                            </div>
                        </div>
                        <div className="mt-4">
                            <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading">
                                {dashboard?.in_progress || 0}
                            </p>
                            <p className="text-xs text-brand-inactive-text mt-1">Em rota de entrega</p>
                        </div>
                    </div>

                    {/* CARD 3: CONCLUÍDAS */}
                    <div className="flex flex-col justify-between rounded-2xl border border-brand-border bg-white p-5 shadow-xs transition hover:shadow-md dark:border-dark-border dark:bg-dark-surface">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text">
                                Concluídas
                            </span>
                            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                                <CheckCircleIcon size={18} />
                            </div>
                        </div>
                        <div className="mt-4">
                            <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading">
                                {dashboard?.completed || 0}
                            </p>
                            <p className="text-xs text-brand-inactive-text mt-1">Entregas finalizadas</p>
                        </div>
                    </div>

                    {/* CARD 4: STATUS OPERACIONAL */}
                    <div className="flex flex-col justify-between rounded-2xl border border-brand-border bg-white p-5 shadow-xs transition hover:shadow-md dark:border-dark-border dark:bg-dark-surface">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text">
                                Status Operacional
                            </span>
                            <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                                <Package size={18} />
                            </div>
                        </div>
                        <div className="mt-4">
                            <p className="text-2xl font-bold text-brand-dark dark:text-dark-heading truncate">
                                {isOccupied ? "Ocupado" : isAvailable ? "Disponível" : "Offline"}
                            </p>
                            <p className="text-xs text-brand-inactive-text mt-1">
                                {isAvailable
                                    ? "Pronto para novos pedidos"
                                    : isOccupied
                                    ? "Realizando rota ativa"
                                    : "Indisponível para rotas"}
                            </p>
                            <div className="mt-2">
                                <Badge
                                    variant={
                                        positionQuality === "live"
                                            ? "green"
                                            : positionQuality === "address"
                                            ? "orange"
                                            : "gray"
                                    }
                                >
                                    {positionQuality === "live"
                                        ? "GPS ao vivo"
                                        : positionQuality === "address"
                                        ? "Posição por endereço"
                                        : "Sem sinal de GPS"}
                                </Badge>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RECENT DELIVERIES SECTION */}
                <section className="rounded-2xl border border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface shadow-xs overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-brand-border px-5 py-4 dark:border-dark-border">
                        <div>
                            <h2 className="font-bold text-lg text-brand-dark dark:text-dark-heading">
                                Últimas Entregas Atribuídas
                            </h2>
                            <p className="text-xs text-brand-inactive-text mt-0.5">
                                Visualize rapidamente suas entregas recentes e seus status.
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* MINI TABS */}
                            <div className="flex items-center bg-brand-gray dark:bg-dark-border/40 p-1 rounded-xl text-xs font-semibold">
                                <button
                                    onClick={() => setRecentTab("all")}
                                    className={`px-3 py-1 rounded-lg transition-colors ${
                                        recentTab === "all"
                                            ? "bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading shadow-xs"
                                            : "text-brand-inactive-text hover:text-brand-dark"
                                    }`}
                                >
                                    Todas
                                </button>
                                <button
                                    onClick={() => setRecentTab("pending")}
                                    className={`px-3 py-1 rounded-lg transition-colors ${
                                        recentTab === "pending"
                                            ? "bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading shadow-xs"
                                            : "text-brand-inactive-text hover:text-brand-dark"
                                    }`}
                                >
                                    Pendentes
                                </button>
                                <button
                                    onClick={() => setRecentTab("in_progress")}
                                    className={`px-3 py-1 rounded-lg transition-colors ${
                                        recentTab === "in_progress"
                                            ? "bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading shadow-xs"
                                            : "text-brand-inactive-text hover:text-brand-dark"
                                    }`}
                                >
                                    Em Rota
                                </button>
                                <button
                                    onClick={() => setRecentTab("completed")}
                                    className={`px-3 py-1 rounded-lg transition-colors ${
                                        recentTab === "completed"
                                            ? "bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading shadow-xs"
                                            : "text-brand-inactive-text hover:text-brand-dark"
                                    }`}
                                >
                                    Concluídas
                                </button>
                            </div>

                            <Link href="/entregadores/entregas">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    rightIcon={<ArrowRightIcon size={14} />}
                                    className="text-xs h-8"
                                >
                                    Ver todas
                                </Button>
                            </Link>
                        </div>
                    </div>

                    {deliveries.length === 0 ? (
                        <div className="py-12">
                            <IconPlaceholder
                                placeholderType="image"
                                imageSrc="https://img.dudit.com.br/static/mascots/Logistica.png"
                                imageAlt="Sem entregas recentes"
                                title="Nenhuma entrega atribuída"
                                subtitle="Assim que novos pedidos forem designados a você, eles aparecerão aqui."
                            />
                        </div>
                    ) : filteredDeliveries.length === 0 ? (
                        <div className="p-8 text-center text-sm text-brand-inactive-text">
                            Nenhuma entrega nesta categoria.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[700px]">
                                <thead>
                                    <tr className="bg-brand-gray/60 dark:bg-dark-border/30 border-b border-brand-border dark:border-dark-border text-xs font-semibold text-brand-inactive-text">
                                        <th className="py-3 px-3 pl-6">Pedido</th>
                                        <th className="py-3 px-3">Loja</th>
                                        <th className="py-3 px-3">Cliente</th>
                                        <th className="py-3 px-3">Endereço</th>
                                        <th className="py-3 px-3">Valores</th>
                                        <th className="py-3 px-3 text-center">Status</th>
                                        <th className="py-3 px-3 pr-6 text-center">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredDeliveries.slice(0, 6).map((item) => (
                                        <DeliveryAssignmentListRow key={item.assignment_id} assignment={item} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>
        </FadeIn>
    )
}
