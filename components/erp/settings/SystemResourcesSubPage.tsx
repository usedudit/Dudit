"use client"

import React, { useCallback } from "react"
import { Button, FormSection, AlertModal, SavingStatusModal, DefaultModal, InfoCard, ThreeDotsLoader } from "@/components/reusable"
import { Switch } from "@/components/reusable/Switch"
import { FadeIn } from "@/components/animations/FadeIn"
import { AlertTriangleIcon, ChevronLeftIcon, SaveIcon } from "@/lib/icons"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { planStarIconForTarget, usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { toast } from "@/hooks/use-notification"
import {
    getSystemResourcesImpactAction,
    pauseAllActiveSubscriptionsAction,
    updateSystemResourcesAction,
} from "@/app/actions/erp/system-resources"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import {
    SYSTEM_RESOURCES,
    SYSTEM_RESOURCE_MODULE_LABELS,
    resolveActiveResources,
    getAvailableResourcesForMode,
    type SystemResourceId,
    type SystemResourceModule,
} from "@/lib/system-resources"

interface SystemResourcesSubPageProps {
    businessInfo: {
        mode?: string
        activeResources?: string[]
        resourcesVersion?: number
    }
    planSlug: string
    onBack: () => void
}

const RESOURCE_OFF_IMPACT: Partial<Record<SystemResourceId, string>> = {
    orders: "O checkout da Dudit será desativado. Novos pedidos e pagamentos online passam a ser combinados pelo WhatsApp.",
    quotes: "Solicitações de orçamento deixam a Dudit e passam a ser feitas pelo WhatsApp.",
    returns: "As devoluções deixam o fluxo da Dudit e passam a ser combinadas pelo WhatsApp.",
    appointments: "Novos agendamentos deixam a Dudit e passam a ser feitos pelo WhatsApp.",
    deliveries: "Entregas pela Dudit ficam indisponíveis. Pedidos com entrega passam a ser combinados pelo WhatsApp; retirada continua no checkout.",
    coupons: "Cupons deixam de ser listados, validados e aplicados no checkout.",
    campaigns: "Campanhas e promoções deixam de ser aplicadas nos preços do marketplace.",
    recurringPlans: "Novos planos recorrentes deixam de ser vendidos pela Dudit.",
    recurringSubscriptions: "Novas assinaturas deixam de ser vendidas pela Dudit.",
    products: "Produtos continuam visíveis, mas novas assinaturas que usam produtos deixam de ser vendidas pela Dudit.",
    services: "Serviços continuam visíveis, mas novas assinaturas/agendamentos pela Dudit ficam bloqueados.",
}

const HARD_BLOCK_RESOURCES: SystemResourceId[] = ["orders", "recurringSubscriptions"]

export function SystemResourcesSubPage({ businessInfo, planSlug, onBack }: SystemResourcesSubPageProps) {
    const { openPlanUpgrade } = usePlanUpgrade()
    const initialResources = React.useMemo(() => resolveActiveResources(businessInfo), [businessInfo])
    const [selected, setSelected] = React.useState<SystemResourceId[]>(initialResources)
    const [saving, setSaving] = React.useState(false)
    const [isScrolled, setIsScrolled] = React.useState(false)
    const [impactOpen, setImpactOpen] = React.useState(false)
    const [impactLoading, setImpactLoading] = React.useState(false)
    const [impact, setImpact] = React.useState<{ activeSubscriptions: number; activePlans: number } | null>(null)
    const [pausingAll, setPausingAll] = React.useState(false)
    const scrollContainerRef = React.useRef<HTMLDivElement>(null)

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const selectedSet = React.useMemo(() => new Set(selected), [selected])
    const hasChanges = React.useMemo(() => {
        if (selected.length !== initialResources.length) return true
        return selected.some((id) => !initialResources.includes(id))
    }, [initialResources, selected])

    const { showConfirmDialog, confirmNavigation, cancelNavigation, handleNavigation } = useUnsavedChanges(hasChanges)

    const groupedResources = React.useMemo(() => {
        const allowedIds = new Set(getAvailableResourcesForMode(businessInfo?.mode))
        return SYSTEM_RESOURCES
            .filter((r) => r.id !== "team" && allowedIds.has(r.id))
            .reduce((acc, resource) => {
                if (!acc[resource.module]) acc[resource.module] = []
                acc[resource.module].push(resource)
                return acc
            }, {} as Record<SystemResourceModule, typeof SYSTEM_RESOURCES>)
    }, [businessInfo?.mode])

    const isResourceLocked = (_resourceId: SystemResourceId): boolean => {
        return false
    }

    const isDesapego = businessInfo?.mode === "desapego"

    const toggleResource = (resourceId: SystemResourceId, checked: boolean) => {
        const resource = SYSTEM_RESOURCES.find((r) => r.id === resourceId)
        if (resource?.minimumPlan && checked && !hasMinimumPlan(planSlug, resource.minimumPlan)) {
            openPlanUpgrade(resource.minimumPlan)
            return
        }

        if (isDesapego && !checked) {
            const willHaveAnyActive = selected.some((id) => id !== resourceId && (id === "products" || id === "services"))
            if (!willHaveAnyActive) {
                toast.warning("Pelo menos um recurso obrigatório", "No modo desapego, pelo menos um recurso (produtos ou serviços) deve permanecer ativo.")
                return
            }
        }

        setSelected((current) => {
            if (checked) return Array.from(new Set([...current, resourceId]))
            return current.filter((id) => id !== resourceId)
        })
    }

    const turnedOffResources = React.useMemo(
        () => initialResources.filter((id) => !selectedSet.has(id)),
        [initialResources, selectedSet],
    )
    const hardBlockedBySubscriptions = React.useMemo(
        () => turnedOffResources.some((id) => HARD_BLOCK_RESOURCES.includes(id)),
        [turnedOffResources],
    )
    const activeSubscriptions = impact?.activeSubscriptions ?? 0
    const saveBlockedBySubscriptions = Boolean(impact) && hardBlockedBySubscriptions && activeSubscriptions > 0

    const performSave = async () => {
        setSaving(true)
        try {
            const result = await updateSystemResourcesAction(selected)
            if (!result.success) {
                toast.error(result.error || "Não foi possível salvar os recursos.")
                return
            }
            toast.success("Recursos atualizados", "A página será recarregada para atualizar o menu.")
            window.location.reload()
        } catch {
            toast.error("Erro inesperado ao salvar os recursos.")
        } finally {
            setSaving(false)
        }
    }

    const openImpactModal = async () => {
        setImpactOpen(true)
        setImpactLoading(true)
        try {
            const result = await getSystemResourcesImpactAction()
            if (!result.success) {
                toast.error(result.error || "Não foi possível verificar o impacto.")
                setImpact({ activeSubscriptions: 0, activePlans: 0 })
                return
            }
            setImpact({
                activeSubscriptions: result.activeSubscriptions,
                activePlans: result.activePlans,
            })
        } catch {
            toast.error("Erro inesperado ao verificar o impacto.")
            setImpact({ activeSubscriptions: 0, activePlans: 0 })
        } finally {
            setImpactLoading(false)
        }
    }

    const handleSave = async () => {
        if (turnedOffResources.length === 0) {
            await performSave()
            return
        }
        setImpact(null)
        await openImpactModal()
    }

    const handlePauseAllSubscriptions = async () => {
        setPausingAll(true)
        try {
            const result = await pauseAllActiveSubscriptionsAction()
            if (!result.success) {
                toast.error(result.error || "Não foi possível pausar as assinaturas.")
                return
            }
            setImpact((current) => ({
                activeSubscriptions: 0,
                activePlans: current?.activePlans ?? 0,
            }))
            toast.success(
                "Assinaturas pausadas",
                `${result.paused} assinatura(s) pausada(s).${result.failed > 0 ? ` ${result.failed} falharam.` : ""}`,
            )
        } catch {
            toast.error("Erro inesperado ao pausar as assinaturas.")
        } finally {
            setPausingAll(false)
        }
    }

    const handleConfirmImpact = async () => {
        if (saveBlockedBySubscriptions) return
        setImpactOpen(false)
        await performSave()
    }

    const handleBack = useCallback(() => {
        handleNavigation(onBack)
    }, [handleNavigation, onBack])

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

                    {/* Sticky Header */}
                    <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface transition-all duration-500 ease-in-out">
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6">

                            {/* Back button - desktop only */}
                            <div className={`absolute -left-12 top-3 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                            </div>

                            {/* Title row */}
                            <div className="hidden md:flex items-start justify-between">
                                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                    <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                        <span className="truncate">Gerenciar recursos</span>
                                    </h1>

                                    <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                        Ative somente os módulos que irão aparecer no seu sistema
                                    </div>
                                </div>

                                {/* Desktop action buttons */}
                                <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                    <Button onClick={handleSave} isLoading={saving} disabled={!hasChanges || saving} leftIcon={<SaveIcon className="w-4 h-4" />}>
                                        Salvar
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content Body */}
                    <div className="px-3 md:px-6 py-6 max-w-[980px] mx-auto min-h-[400px]">
                        <div className="space-y-10">
                            {(Object.keys(groupedResources) as SystemResourceModule[]).map((module, idx) => (
                                <FormSection key={module} title={SYSTEM_RESOURCE_MODULE_LABELS[module]} hasSeparator={idx > 0}>
                                    <div className="divide-y divide-brand-border dark:divide-dark-border">
                                        {groupedResources[module].map((resource) => {
                                            const checked = selectedSet.has(resource.id)
                                            const locked = isResourceLocked(resource.id)
                                            const requiredPlan = resource.minimumPlan
                                            const isPlanBlocked = requiredPlan ? !hasMinimumPlan(planSlug, requiredPlan) : false
                                            const star = requiredPlan ? planStarIconForTarget(requiredPlan) : null

                                            return (
                                                <div
                                                    key={resource.id}
                                                    className="flex items-center justify-between gap-4 py-4 px-0"
                                                >
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className="font-bold text-brand-dark dark:text-dark-heading">{resource.label}</p>
                                                            {isPlanBlocked && requiredPlan ? (
                                                                <span className="inline-flex items-center gap-1 rounded-full border border-brand-yellow/30 bg-brand-yellow/10 px-2 py-0.5 text-[11px] font-bold text-brand-dark dark:text-dark-heading">
                                                                    {star ? <img src={star} alt="" className="w-3.5 h-3.5 object-contain" /> : null}
                                                                    Plano {requiredPlan === "crescer" ? "Crescer" : "Escalar"}
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                        <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                            {resource.description}
                                                        </p>
                                                    </div>
                                                    {locked ? (
                                                        <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body shrink-0">Sempre ativo</span>
                                                    ) : (
                                                        <Switch
                                                            checked={checked}
                                                            disabled={isPlanBlocked && checked}
                                                            onCheckedChange={(value: boolean) => toggleResource(resource.id, value)}
                                                        />
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </FormSection>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile Bottom Action Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                <Button
                    variant="outline"
                    onClick={handleBack}
                    className="flex-1 h-12"
                    disabled={saving}
                >
                    Voltar
                </Button>
                <Button
                    onClick={handleSave}
                    className="flex-1 h-12"
                    disabled={!hasChanges || saving}
                    isLoading={saving}
                >
                    Salvar
                </Button>
            </div>

            {showConfirmDialog && (
                <AlertModal
                    isOpen={showConfirmDialog}
                    onClose={cancelNavigation}
                    onConfirm={confirmNavigation}
                    title="Sair sem salvar?"
                    description="Você tem alterações nos recursos que ainda não foram salvas."
                    confirmText="Sair sem salvar"
                    cancelText="Continuar editando"
                    variant="warning"
                />
            )}

            <DefaultModal
                isOpen={impactOpen}
                onClose={() => {
                    if (!saving && !pausingAll) setImpactOpen(false)
                }}
                title="Antes de desativar recursos"
                description="Revise o impacto das alterações antes de salvar."
                icon={<AlertTriangleIcon className="w-6 h-6 text-brand-yellow" />}
                maxWidth="lg"
                footer={
                    <div className="flex flex-col-reverse sm:flex-row gap-3 w-full sm:justify-end">
                        <Button
                            variant="outline"
                            onClick={() => setImpactOpen(false)}
                            disabled={saving || pausingAll}
                            className="sm:w-auto w-full"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleConfirmImpact}
                            isLoading={saving}
                            disabled={impactLoading || pausingAll || saveBlockedBySubscriptions}
                            className="sm:w-auto w-full"
                        >
                            Desativar e salvar
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="space-y-3">
                        {turnedOffResources.map((resourceId) => {
                            const resource = SYSTEM_RESOURCES.find((r) => r.id === resourceId)
                            return (
                                <div
                                    key={resourceId}
                                    className="border-b border-brand-border dark:border-dark-border pb-2"
                                >
                                    <p className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                        {resource?.label || resourceId}
                                    </p>
                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">
                                        {RESOURCE_OFF_IMPACT[resourceId] || "Este recurso deixará de aparecer no sistema."}
                                    </p>
                                </div>
                            )
                        })}
                    </div>

                    {impactLoading ? (
                        <ThreeDotsLoader />
                    ) : impact ? (
                        <InfoCard
                            title={activeSubscriptions > 0 ? `${activeSubscriptions} assinatura(s) ativa(s)` : ""}
                            message={activeSubscriptions > 0 ? saveBlockedBySubscriptions
                                ? "Pedidos e Assinaturas recorrentes sustentam as assinaturas ativas. Pause todas as assinaturas para continuar."
                                : "Assinaturas existentes continuam cobrando normalmente (são contratos). Novas vendas seguem as regras acima."
                                : "Nenhuma assinatura ativa"}
                            color="orange"
                            bottomElement={
                                activeSubscriptions > 0 && (
                                    <Button
                                        variant="link"
                                        onClick={handlePauseAllSubscriptions}
                                        isLoading={pausingAll}
                                        disabled={pausingAll || saving}
                                    >
                                        Pausar todas as assinaturas ativas
                                    </Button>
                                )
                            }
                        />
                    ) : null}
                </div>
            </DefaultModal>

            <SavingStatusModal isOpen={saving} text="Salvando recursos..." />
        </FadeIn>
    )
}
