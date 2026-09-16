"use client"

import React, { useCallback } from "react"
import { Button, FormSection, AlertModal } from "@/components/reusable"
import { Switch } from "@/components/reusable/Switch"
import { FadeIn } from "@/components/animations/FadeIn"
import { ChevronLeftIcon, SaveIcon } from "@/lib/icons"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { planStarIconForTarget, usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { toast } from "@/hooks/use-notification"
import { updateSystemResourcesAction } from "@/app/actions/erp/system-resources"
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

export function SystemResourcesSubPage({ businessInfo, planSlug, onBack }: SystemResourcesSubPageProps) {
    const { openPlanUpgrade } = usePlanUpgrade()
    const initialResources = React.useMemo(() => resolveActiveResources(businessInfo), [businessInfo])
    const [selected, setSelected] = React.useState<SystemResourceId[]>(initialResources)
    const [saving, setSaving] = React.useState(false)
    const [isScrolled, setIsScrolled] = React.useState(false)
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

    const handleSave = async () => {
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
        </FadeIn>
    )
}
