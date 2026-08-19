"use client"

import React, { useEffect } from "react"
import {
    ChevronLeftIcon,
    ShieldIcon,
    UserIcon,
    ArrowRightIcon,
    DatabaseIcon,
} from "@/lib/icons"
import {
    Button,
    Badge,
    FormSection,
} from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatDate, formatDateTime } from "@/lib/utils"
import type { AuditLogRow } from "@/lib/admin/types"
import { ACTION_TYPE_LABELS, TARGET_TYPE_LABELS, getActionBadge } from "./AuditLogListRow"
import Link from "next/link"
import { useSidebar } from "@/lib/sidebar-context"

interface AdminAuditDetailViewProps {
    log: AuditLogRow
    onBack: () => void
}

export function AdminAuditDetailView({
    log,
    onBack,
}: AdminAuditDetailViewProps) {
    let sidebarContext: ReturnType<typeof useSidebar> | null = null
    try {
        sidebarContext = useSidebar()
    } catch { }
    const setHeaderOverride = sidebarContext?.setHeaderOverride

    useEffect(() => {
        if (!setHeaderOverride) return
        setHeaderOverride({
            title: `Log #${log.id.slice(0, 8)}`,
            onBack,
            isSubPage: true,
        })
        return () => setHeaderOverride(null)
    }, [setHeaderOverride, onBack, log])

    const getTargetLink = () => {
        if (!log.target_id) return null
        if (log.target_type === "partner" || log.target_type === "store") {
            return `/ddt-admin/partners?view=${log.target_id}`
        }
        if (log.target_type === "user") {
            return `/ddt-admin/users?view=${log.target_id}`
        }
        if (log.target_type === "order") {
            return `/ddt-admin/orders?view=${log.target_id}`
        }
        if (log.target_type === "return_request") {
            return `/ddt-admin/returns?view=${log.target_id}`
        }
        if (log.target_type === "delivery_driver") {
            return `/ddt-admin/entregadores?view=${log.target_id}`
        }
        return null
    }

    const targetLink = getTargetLink()
    const metadata = log.metadata || {}
    const reason = (metadata as any).reason || (metadata as any).action || (metadata as any).resolution_reason

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background">
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
                        <div className="flex items-center gap-2.5">
                            <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading font-mono">
                                Registro #{log.id.slice(0, 8)}
                            </h1>
                            {getActionBadge(log.action_type)}
                        </div>
                        <span className="text-xs text-brand-inactive-text mt-0.5">
                            Registrado em {formatDateTime(log.created_at)}
                        </span>
                    </div>
                </div>

                <Button variant="outline" size="sm" onClick={onBack}>
                    Voltar
                </Button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 max-w-[1200px] mx-auto w-full">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Coluna 1: Executor & Alvo */}
                    <div className="space-y-6">
                        <FormSection
                            title="Administrador / Executor"
                            description="Identificação de quem realizou a operação"
                        >
                            <div className="p-4 bg-brand-gray/40 dark:bg-dark-border/10 rounded-xl space-y-2">
                                <div className="flex flex-col min-w-0">
                                    <span className="font-bold text-base text-brand-dark dark:text-dark-heading">
                                        {log.admin_name || "Administrador"}
                                    </span>
                                    <span className="text-xs text-brand-inactive-text font-mono">
                                        ID: {log.admin_user_id || "Sistema"}
                                    </span>
                                </div>
                                {log.admin_email && (
                                    <div className="text-xs text-brand-inactive-text pt-1">
                                        Email: <span className="font-medium text-brand-dark dark:text-dark-heading">{log.admin_email}</span>
                                    </div>
                                )}
                                {log.ip_address && (
                                    <div className="text-xs text-brand-inactive-text">
                                        IP: <code className="font-mono bg-white dark:bg-dark-surface px-1.5 py-0.5 rounded border border-brand-border dark:border-dark-border">{log.ip_address}</code>
                                    </div>
                                )}
                                {log.user_agent && (
                                    <div className="text-[11px] text-brand-inactive-text opacity-70 truncate pt-1">
                                        Navegador: {log.user_agent}
                                    </div>
                                )}
                            </div>
                        </FormSection>

                        <FormSection
                            title="Alvo da Ação"
                            description={`Tipo: ${TARGET_TYPE_LABELS[log.target_type] || log.target_type}`}
                        >
                            <div className="p-4 bg-brand-gray/40 dark:bg-dark-border/10 rounded-xl space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-xs text-brand-inactive-text uppercase tracking-wider font-semibold">
                                            {TARGET_TYPE_LABELS[log.target_type] || log.target_type}
                                        </span>
                                        <span className="font-bold text-base text-brand-dark dark:text-dark-heading truncate">
                                            {log.target_name || log.target_id || "Sistema"}
                                        </span>
                                        {log.target_id && (
                                            <span className="text-xs text-brand-inactive-text opacity-70 font-mono">
                                                ID: {log.target_id}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {targetLink && (
                                    <div className="pt-2 border-t border-brand-border dark:border-dark-border">
                                        <Link
                                            href={targetLink}
                                            className="text-xs font-semibold text-brand-dark dark:text-dark-heading hover:underline flex items-center gap-1"
                                        >
                                            Abrir página do item <ArrowRightIcon size={12} />
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </FormSection>
                    </div>

                    {/* Coluna 2: Ação & Metadados */}
                    <div className="space-y-6">
                        <FormSection
                            title="Detalhes da Operação"
                            description="Tipo de ação e justificativa informada"
                        >
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <span className="text-xs text-brand-inactive-text">Ação Realizada</span>
                                        <p className="text-base font-bold text-brand-dark dark:text-dark-heading mt-0.5">
                                            {ACTION_TYPE_LABELS[log.action_type] || log.action_type}
                                        </p>
                                    </div>
                                    {getActionBadge(log.action_type)}
                                </div>

                                {reason && (
                                    <div className="p-3.5 bg-brand-gray/50 dark:bg-dark-border/20 rounded-xl">
                                        <span className="text-xs text-brand-inactive-text font-semibold">Motivo / Justificativa</span>
                                        <p className="text-sm text-brand-dark dark:text-dark-body mt-1 whitespace-pre-wrap leading-relaxed">
                                            {String(reason)}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </FormSection>

                        <FormSection
                            title="Payload & Metadados"
                            description="Dados brutos associados a este evento"
                        >
                            <div className="bg-brand-gray/40 dark:bg-dark-border/20 p-4 rounded-xl overflow-x-auto custom-scrollbar border border-brand-border/60 dark:border-dark-border/40">
                                <pre className="text-xs font-mono text-brand-dark dark:text-dark-body whitespace-pre-wrap">
                                    {JSON.stringify(metadata, null, 2)}
                                </pre>
                            </div>
                        </FormSection>
                    </div>
                </div>
            </div>
        </FadeIn>
    )
}
