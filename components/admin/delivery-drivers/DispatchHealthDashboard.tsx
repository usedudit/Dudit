"use client"

import React, { useState, useTransition } from "react"
import Link from "next/link"
import { FadeIn } from "@/components/animations/FadeIn"
import { Button, Badge, InfoCard, Input, IconPlaceholder } from "@/components/reusable"
import { ClockIcon, TruckIcon, CheckCircleIcon, ReloadIcon, ChevronLeftIcon } from "@/lib/icons"
import { formatCurrency, formatDateTime } from "@/lib/utils"
import { toast } from "@/hooks/use-notification"
import {
    getDispatchHealthAdminAction,
    type DispatchHealthMetrics,
} from "@/app/actions/admin/delivery-drivers"

interface DispatchHealthDashboardProps {
    initialMetrics: DispatchHealthMetrics | null
}

const OUTCOME_BADGE: Record<string, { label: string; variant: "green" | "orange" | "red" | "gray" | "blue" }> = {
    offered: { label: "Ofertado", variant: "green" },
    no_candidate: { label: "Sem candidato", variant: "gray" },
    no_economically_viable_courier: { label: "Teto econômico", variant: "orange" },
    exhausted: { label: "Exaurido", variant: "red" },
    expired: { label: "Expirado", variant: "gray" },
}

export default function DispatchHealthDashboard({ initialMetrics }: DispatchHealthDashboardProps) {
    const [metrics, setMetrics] = useState<DispatchHealthMetrics | null>(initialMetrics)
    const [days, setDays] = useState<number>(initialMetrics?.days || 14)
    const [city, setCity] = useState<string>(initialMetrics?.city || "")
    const [isPending, startTransition] = useTransition()

    const reload = (nextDays = days, nextCity = city) => {
        startTransition(async () => {
            const res = await getDispatchHealthAdminAction({ days: nextDays, city: nextCity || null })
            if (res.success) {
                setMetrics(res.data)
            } else {
                toast.error(res.error || "Não foi possível atualizar os indicadores.")
            }
        })
    }

    const s = metrics?.summary
    const total = s?.total_requests || 0
    const acceptRate = total > 0 ? Math.round(((s?.accepted_count || 0) / total) * 100) : 0
    const tier0Rate = (s?.accepted_count || 0) > 0
        ? Math.round(((s?.accepted_tier0_count || 0) / (s?.accepted_count || 1)) * 100)
        : 0
    const exhaustedRate = total > 0 ? Math.round(((s?.exhausted_count || 0) / total) * 100) : 0
    const dimsCoverage = total > 0 ? Math.round(((s?.dimensions_complete_count || 0) / total) * 100) : 0
    const density = metrics?.density_readiness

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background">
            <div className="mx-auto w-full max-w-[1400px] px-4 md:px-8 py-6 space-y-6">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <Link href="/ddt-admin/entregadores">
                                <Button variant="filled" size="icon" className="w-8 h-8">
                                    <ChevronLeftIcon className="w-4 h-4" />
                                </Button>
                            </Link>
                            <h1 className="text-2xl md:text-3xl font-bold text-brand-dark dark:text-dark-heading">
                                Saúde do Despacho
                            </h1>
                        </div>
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                            Funil de solicitações, tempo até aceite, cobertura de dimensões e telemetria dos tiers.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {[7, 14, 30].map((d) => (
                            <Button
                                key={d}
                                variant={days === d ? "default" : "outline"}
                                size="sm"
                                onClick={() => {
                                    setDays(d)
                                    reload(d, city)
                                }}
                                disabled={isPending}
                            >
                                {d} dias
                            </Button>
                        ))}
                        <div className="w-48">
                            <Input
                                name="city_filter"
                                placeholder="Filtrar por cidade..."
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                            />
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => reload(days, city)}
                            disabled={isPending}
                            isLoading={isPending}
                            leftIcon={<ReloadIcon size={14} />}
                        >
                            Atualizar
                        </Button>
                    </div>
                </div>

                {/* Density readiness banner (§4.4) */}
                {density && (
                    <InfoCard
                        color={density.ready_for_directed_mode ? "green" : "blue"}
                        title={
                            density.ready_for_directed_mode
                                ? "Rede pronta para ativar oferta dirigida (mode='directed')"
                                : "Modo atual: quadro aberto com escada de raio (board-first)"
                        }
                        message={`Nos últimos ${days} dias, ${density.pct_meeting_density}% dos despachos avaliados (${density.meeting_density_4km}/${density.evaluated_dispatches}) tiveram 4 ou mais entregadores elegíveis em até 4 km. Critério para oferta dirigida: >= 80% por 2 semanas seguidas.`}
                    />
                )}

                {/* KPI cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="rounded-2xl border border-brand-border bg-white p-5 dark:border-dark-border dark:bg-dark-surface">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text">
                                Tempo até Aceite (p50 / p90)
                            </span>
                            <ClockIcon size={18} className="text-brand-green" />
                        </div>
                        <p className="mt-3 text-2xl font-bold text-brand-dark dark:text-dark-heading">
                            {s?.p50_accept_min != null ? `${s.p50_accept_min} min` : "—"}
                            <span className="text-sm font-medium text-brand-inactive-text ml-2">
                                / {s?.p90_accept_min != null ? `${s.p90_accept_min} min` : "—"}
                            </span>
                        </p>
                        <p className="text-xs text-brand-inactive-text mt-1">
                            Meta Fase 2: ≤ 3 min · Espera na loja p50: {s?.p50_store_wait_min != null ? `${s.p50_store_wait_min} min` : "—"}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-brand-border bg-white p-5 dark:border-dark-border dark:bg-dark-surface">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text">
                                Aceite & Tier 0
                            </span>
                            <CheckCircleIcon size={18} className="text-brand-green" />
                        </div>
                        <p className="mt-3 text-2xl font-bold text-brand-dark dark:text-dark-heading">
                            {acceptRate}%
                            <span className="text-sm font-medium text-brand-inactive-text ml-2">
                                ({s?.accepted_count || 0}/{total})
                            </span>
                        </p>
                        <p className="text-xs text-brand-inactive-text mt-1">
                            No Tier 0: {tier0Rate}% · Cancel. pós-aceite: {s?.post_accept_cancelled_count || 0}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-brand-border bg-white p-5 dark:border-dark-border dark:bg-dark-surface">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text">
                                Sem Entregador / Teto R$/km
                            </span>
                            <TruckIcon size={18} className="text-brand-orange" />
                        </div>
                        <p className="mt-3 text-2xl font-bold text-brand-dark dark:text-dark-heading">
                            {exhaustedRate}%
                            <span className="text-sm font-medium text-brand-inactive-text ml-2">
                                ({s?.exhausted_count || 0} pedidos)
                            </span>
                        </p>
                        <p className="text-xs text-brand-inactive-text mt-1">
                            Barrados por teto econômico: {s?.economic_cap_blocked_count || 0}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-brand-border bg-white p-5 dark:border-dark-border dark:bg-dark-surface">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text">
                                Cobertura de Dimensões
                            </span>
                            <Badge variant={dimsCoverage >= 60 ? "green" : "orange"}>{dimsCoverage}%</Badge>
                        </div>
                        <p className="mt-3 text-2xl font-bold text-brand-dark dark:text-dark-heading">
                            {s?.dimensions_complete_count || 0} / {total}
                        </p>
                        <p className="text-xs text-brand-inactive-text mt-1">
                            Km médio até coleta: {s?.avg_pickup_km != null ? `${s.avg_pickup_km} km` : "—"} · Taxa média: {s?.avg_delivery_fee != null ? formatCurrency(s.avg_delivery_fee) : "—"}
                        </p>
                    </div>
                </div>

                {/* Daily Funnel Table */}
                <section className="rounded-2xl border border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface overflow-hidden">
                    <div className="px-5 py-4 border-b border-brand-border dark:border-dark-border">
                        <h2 className="font-bold text-base text-brand-dark dark:text-dark-heading">Funil Diário</h2>
                    </div>
                    {!metrics?.daily_funnel?.length ? (
                        <div className="py-10">
                            <IconPlaceholder
                                title="Sem solicitações no período"
                                subtitle="Os dados do funil aparecerão assim que houver entregas solicitadas para a rede Dudit."
                            />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-sm">
                                <thead>
                                    <tr className="bg-brand-gray/60 dark:bg-dark-border/30 border-b border-brand-border dark:border-dark-border text-xs font-semibold text-brand-inactive-text">
                                        <th className="py-3 px-5">Data</th>
                                        <th className="py-3 px-4">Solicitações</th>
                                        <th className="py-3 px-4">Aceitos</th>
                                        <th className="py-3 px-4">Exauridos</th>
                                        <th className="py-3 px-5">Tempo p50 até aceite</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                    {metrics.daily_funnel.map((row) => (
                                        <tr key={row.day}>
                                            <td className="py-3 px-5 font-mono text-xs font-semibold">{row.day}</td>
                                            <td className="py-3 px-4">{row.requests}</td>
                                            <td className="py-3 px-4 font-semibold text-emerald-600 dark:text-emerald-400">{row.accepted}</td>
                                            <td className="py-3 px-4">{row.exhausted}</td>
                                            <td className="py-3 px-5">{row.p50_accept_min != null ? `${row.p50_accept_min} min` : "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                {/* Recent Dispatch Events */}
                <section className="rounded-2xl border border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface overflow-hidden">
                    <div className="px-5 py-4 border-b border-brand-border dark:border-dark-border">
                        <h2 className="font-bold text-base text-brand-dark dark:text-dark-heading">
                            Telemetria Recente de Despacho (últimos 25 eventos)
                        </h2>
                    </div>
                    {!metrics?.recent_events?.length ? (
                        <div className="p-6 text-sm text-brand-inactive-text">
                            Nenhum evento registrado em `delivery_dispatch_events` neste período.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-sm">
                                <thead>
                                    <tr className="bg-brand-gray/60 dark:bg-dark-border/30 border-b border-brand-border dark:border-dark-border text-xs font-semibold text-brand-inactive-text">
                                        <th className="py-3 px-5">Horário</th>
                                        <th className="py-3 px-3">Tier</th>
                                        <th className="py-3 px-3">Resultado</th>
                                        <th className="py-3 px-3">Candidatos / Elegíveis / Ofertas</th>
                                        <th className="py-3 px-3">Raio Efetivo / Teto R$/km</th>
                                        <th className="py-3 px-5">Taxa Sugerida</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                    {metrics.recent_events.map((ev) => {
                                        const badgeMeta = OUTCOME_BADGE[ev.outcome] || { label: ev.outcome, variant: "gray" as const }
                                        return (
                                            <tr key={ev.id}>
                                                <td className="py-3 px-5 text-xs text-brand-inactive-text whitespace-nowrap">
                                                    {formatDateTime(ev.created_at)}
                                                </td>
                                                <td className="py-3 px-3 font-mono font-bold">T{ev.tier}</td>
                                                <td className="py-3 px-3">
                                                    <Badge variant={badgeMeta.variant}>{badgeMeta.label}</Badge>
                                                </td>
                                                <td className="py-3 px-3 font-mono text-xs">
                                                    {ev.candidates} / {ev.eligible} / {ev.offers_created}
                                                </td>
                                                <td className="py-3 px-3 text-xs">
                                                    {ev.effective_max_km != null ? `${ev.effective_max_km} km` : "—"}
                                                    {ev.economic_cap_km != null ? ` (teto ${ev.economic_cap_km} km)` : ""}
                                                </td>
                                                <td className="py-3 px-5 font-mono text-xs">
                                                    {ev.suggested_fee != null ? formatCurrency(ev.suggested_fee) : "—"}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>
        </FadeIn>
    )
}
