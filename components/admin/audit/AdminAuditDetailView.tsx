"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import {
    ChevronLeftIcon,
    ShareIcon,
    UserIcon,
    ArrowRightIcon,
    DatabaseIcon,
} from "@/lib/icons"
import {
    Button,
    Badge,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    FormSection,
} from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatDateTime } from "@/lib/utils"
import type { AuditLogRow } from "@/lib/admin/types"
import { ACTION_TYPE_LABELS, TARGET_TYPE_LABELS, getActionBadge } from "./AuditLogListRow"
import Link from "next/link"
import { toast } from "@/hooks/use-notification"
import { useSidebar } from "@/lib/sidebar-context"

interface AdminAuditDetailViewProps {
    log: AuditLogRow
    onBack: () => void
}

export function AdminAuditDetailView({
    log,
    onBack,
}: AdminAuditDetailViewProps) {
    const [activeTab, setActiveTab] = useState("general")
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

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

    const handleScroll = useCallback(() => {
        setIsScrolled((scrollRef.current?.scrollTop || 0) > 20)
    }, [])

    const handleShare = useCallback(() => {
        navigator.clipboard.writeText(window.location.href)
        toast.success("Link do registro copiado!")
    }, [])

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
                                                <span className="hidden md:inline truncate">Log #{log.id.slice(0, 8)}</span>
                                                {getActionBadge(log.action_type)}
                                            </h1>

                                            <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                                Registrado em {formatDateTime(log.created_at)} • Executor: {log.admin_name || log.admin_email || "Administrador"} • UUID: {log.id}
                                            </div>
                                        </div>

                                        {/* Desktop action buttons */}
                                        <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                            <Button
                                                variant="outline"
                                                onClick={handleShare}
                                                leftIcon={<ShareIcon size={16} />}
                                            >
                                                Compartilhar
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Title row - mobile */}
                                    <div className="md:hidden flex items-center justify-between gap-3 py-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Button variant="filled" onClick={onBack} className="w-9 h-9 p-0 flex items-center justify-center shrink-0">
                                                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                            </Button>
                                            <div className="flex flex-col gap-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h1 className="text-lg font-bold text-brand-dark dark:text-dark-heading truncate">
                                                        Log #{log.id.slice(0, 8)}
                                                    </h1>
                                                    {getActionBadge(log.action_type)}
                                                </div>
                                                <span className="text-xs text-brand-inactive-text truncate">
                                                    {formatDateTime(log.created_at)}
                                                </span>
                                            </div>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleShare}
                                            className="shrink-0"
                                        >
                                            Compartilhar
                                        </Button>
                                    </div>

                                    {/* Tabs */}
                                    <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                            <TabsTrigger value="general">Detalhes do Evento</TabsTrigger>
                                            <TabsTrigger value="payload">Payload & Metadados</TabsTrigger>
                                        </TabsList>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                                <Tabs value={activeTab} onValueChange={setActiveTab}>
                                    {/* Aba 1: Detalhes do Evento */}
                                    <TabsContent value="general" className="mt-0">
                                        <FadeIn key="general">
                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                {/* Coluna principal */}
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <FormSection title="Detalhes da Operação" hasSeparator description="Tipo de ação e justificativa informada pelo executor">
                                                        <div className="space-y-4">
                                                            <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray/20 dark:bg-dark-surface/40">
                                                                <div className="min-w-0">
                                                                    <span className="text-xs text-brand-inactive-text">Ação Realizada</span>
                                                                    <p className="text-base font-bold text-brand-dark dark:text-dark-heading mt-0.5">
                                                                        {ACTION_TYPE_LABELS[log.action_type] || log.action_type}
                                                                    </p>
                                                                    <span className="text-[11px] font-mono text-brand-inactive-text opacity-70">
                                                                        {log.action_type}
                                                                    </span>
                                                                </div>
                                                                {getActionBadge(log.action_type)}
                                                            </div>

                                                            {reason && (
                                                                <div className="p-4 bg-brand-gray/50 dark:bg-dark-border/20 rounded-xl">
                                                                    <span className="text-xs text-brand-inactive-text font-semibold">Motivo / Justificativa</span>
                                                                    <p className="text-sm text-brand-dark dark:text-dark-body mt-1 whitespace-pre-wrap leading-relaxed">
                                                                        {String(reason)}
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </FormSection>

                                                    <FormSection title="Administrador / Executor" hasSeparator description="Identificação de quem realizou a operação">
                                                        <div className="p-4 bg-brand-gray/40 dark:bg-dark-border/10 rounded-xl space-y-2">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-full bg-brand-slate dark:bg-dark-border/50 flex items-center justify-center shrink-0">
                                                                    <UserIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
                                                                </div>
                                                                <div className="flex flex-col min-w-0">
                                                                    <span className="font-bold text-base text-brand-dark dark:text-dark-heading truncate">
                                                                        {log.admin_name || "Administrador"}
                                                                    </span>
                                                                    {log.admin_email && (
                                                                        <span className="text-xs text-brand-inactive-text truncate">
                                                                            {log.admin_email}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="text-xs text-brand-inactive-text pt-1">
                                                                ID do Executor: <span className="font-mono">{log.admin_user_id || "Sistema"}</span>
                                                            </div>
                                                        </div>
                                                    </FormSection>
                                                </div>

                                                {/* Sidebar */}
                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    {/* Card do Alvo */}
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                        <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                            Alvo da Ação
                                                        </h3>
                                                        <div className="space-y-3">
                                                            <div className="flex flex-col min-w-0">
                                                                <span className="text-xs text-brand-inactive-text uppercase tracking-wider font-semibold">
                                                                    {TARGET_TYPE_LABELS[log.target_type] || log.target_type}
                                                                </span>
                                                                <span className="font-bold text-base text-brand-dark dark:text-dark-heading break-all">
                                                                    {log.target_name || log.target_id || "Sistema"}
                                                                </span>
                                                                {log.target_id && (
                                                                    <span className="text-xs text-brand-inactive-text opacity-70 font-mono break-all mt-0.5">
                                                                        ID: {log.target_id}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {targetLink && (
                                                                <div className="pt-3 border-t border-brand-border dark:border-dark-border">
                                                                    <Link
                                                                        href={targetLink}
                                                                        className="text-xs font-bold text-brand-green hover:underline flex items-center gap-1"
                                                                    >
                                                                        Abrir página do item <ArrowRightIcon size={12} />
                                                                    </Link>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Card de Contexto Técnico */}
                                                    {(log.ip_address || log.user_agent) && (
                                                        <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                                Contexto Técnico
                                                            </h3>
                                                            <div className="space-y-2.5 text-xs">
                                                                {log.ip_address && (
                                                                    <div>
                                                                        <span className="text-brand-inactive-text block">Endereço IP</span>
                                                                        <code className="font-mono bg-brand-gray dark:bg-dark-border/30 px-1.5 py-0.5 rounded border border-brand-border dark:border-dark-border text-brand-dark dark:text-dark-heading">
                                                                            {log.ip_address}
                                                                        </code>
                                                                    </div>
                                                                )}
                                                                {log.user_agent && (
                                                                    <div>
                                                                        <span className="text-brand-inactive-text block">Navegador / Dispositivo</span>
                                                                        <p className="text-brand-dark dark:text-dark-heading break-all leading-relaxed mt-0.5">
                                                                            {log.user_agent}
                                                                        </p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Card de Identificadores */}
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                            Identificadores
                                                        </h3>
                                                        <div className="space-y-2 text-xs">
                                                            <div>
                                                                <span className="text-brand-inactive-text block">UUID do Registro</span>
                                                                <span className="font-mono text-brand-dark dark:text-dark-heading select-all break-all">{log.id}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 pt-1">
                                                                <DatabaseIcon size={12} className="text-brand-inactive-text shrink-0" />
                                                                <span className="text-brand-inactive-text">Registro imutável de auditoria</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    {/* Aba 2: Payload & Metadados */}
                                    <TabsContent value="payload" className="mt-0">
                                        <FadeIn key="payload">
                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <FormSection title="Payload & Metadados" hasSeparator description="Dados brutos associados a este evento de auditoria">
                                                        <div className="bg-brand-gray/40 dark:bg-dark-border/20 p-4 rounded-xl overflow-x-auto custom-scrollbar border border-brand-border/60 dark:border-dark-border/40">
                                                            <pre className="text-xs font-mono text-brand-dark dark:text-dark-body whitespace-pre-wrap">
                                                                {JSON.stringify(metadata, null, 2)}
                                                            </pre>
                                                        </div>
                                                    </FormSection>
                                                </div>

                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                        <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                            Resumo do Evento
                                                        </h3>
                                                        <div className="space-y-2.5 text-sm">
                                                            <div className="flex justify-between text-brand-inactive-text items-center gap-3">
                                                                <span>Ação</span>
                                                                <Badge variant="gray">{ACTION_TYPE_LABELS[log.action_type] || log.action_type}</Badge>
                                                            </div>
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Alvo</span>
                                                                <span className="font-semibold text-brand-dark dark:text-dark-heading text-right">
                                                                    {TARGET_TYPE_LABELS[log.target_type] || log.target_type}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Data / Hora</span>
                                                                <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                                                    {formatDateTime(log.created_at)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
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
                <Button variant="outline" className="flex-1" onClick={handleShare} leftIcon={<ShareIcon size={16} />}>
                    Compartilhar
                </Button>
            </div>
        </>
    )
}

export default AdminAuditDetailView
