"use client"

import React from "react"
import { Button } from "@/components/reusable"
import { Switch } from "@/components/reusable/Switch"
import { FadeIn } from "@/components/animations/FadeIn"
import { ChevronLeftIcon, SaveIcon } from "@/lib/icons"
import { cn } from "@/lib/utils"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { planStarIconForTarget } from "@/components/erp/subscription/PlanUpgradeModal"
import { toast } from "@/hooks/use-notification"
import { updateSystemResourcesAction } from "@/app/actions/erp/system-resources"
import {
  SYSTEM_RESOURCES,
  SYSTEM_RESOURCE_MODULE_LABELS,
  resolveActiveResources,
  type SystemResourceId,
  type SystemResourceModule,
} from "@/lib/system-resources"

interface SystemResourcesSubPageProps {
  businessInfo: {
    sells?: string[]
    activeResources?: string[]
  }
  planSlug: string
  onBack: () => void
}

export function SystemResourcesSubPage({ businessInfo, planSlug, onBack }: SystemResourcesSubPageProps) {
  const initialResources = React.useMemo(() => resolveActiveResources(businessInfo), [businessInfo])
  const [selected, setSelected] = React.useState<SystemResourceId[]>(initialResources)
  const [saving, setSaving] = React.useState(false)

  const selectedSet = React.useMemo(() => new Set(selected), [selected])
  const hasChanges = React.useMemo(() => {
    if (selected.length !== initialResources.length) return true
    return selected.some((id) => !initialResources.includes(id))
  }, [initialResources, selected])

  const groupedResources = React.useMemo(() => {
    return SYSTEM_RESOURCES.reduce((acc, resource) => {
      if (!acc[resource.module]) acc[resource.module] = []
      acc[resource.module].push(resource)
      return acc
    }, {} as Record<SystemResourceModule, typeof SYSTEM_RESOURCES>)
  }, [])

  const toggleResource = (resourceId: SystemResourceId, checked: boolean) => {
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
        toast.error(result.error || "Nao foi possivel salvar os recursos.")
        return
      }
      toast.success("Recursos atualizados", "A pagina sera recarregada para atualizar o menu.")
      window.location.reload()
    } catch {
      toast.error("Erro inesperado ao salvar os recursos.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <FadeIn>
      <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
        <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border">
          <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 py-6 flex items-center justify-between gap-4">
            <div className="absolute -left-12 top-7 h-full hidden xl:flex justify-center">
              <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
              </Button>
            </div>

            <div className="flex flex-col gap-1 overflow-hidden min-w-0">
              <h1 className="text-xl md:text-3xl font-bold text-brand-dark dark:text-dark-heading truncate">
                Gerenciar recursos
              </h1>
              <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                Ative somente os modulos que aparecem no menu do ERP.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={onBack}>
                Voltar
              </Button>
              <Button onClick={handleSave} isLoading={saving} disabled={!hasChanges || saving} leftIcon={<SaveIcon className="w-4 h-4" />}>
                Salvar
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-3 md:px-6 py-6">
          <div className="max-w-[980px] mx-auto">
            <div className="mb-6 rounded-lg border border-brand-border dark:border-dark-border bg-brand-gray/50 dark:bg-dark-surface p-4">
              <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Ativar recursos</p>
              <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">
                Recursos ativados aparecem no menu. Recursos desativados somem para deixar a operacao mais limpa.
              </p>
            </div>

            <div className="space-y-6">
              {(Object.keys(groupedResources) as SystemResourceModule[]).map((module) => (
                <section key={module} className="space-y-3">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text dark:text-dark-body">
                    {SYSTEM_RESOURCE_MODULE_LABELS[module]}
                  </h2>
                  <div className="rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface overflow-hidden">
                    {groupedResources[module].map((resource, index) => {
                      const checked = selectedSet.has(resource.id)
                      const requiredPlan = resource.minimumPlan
                      const isPlanBlocked = requiredPlan ? !hasMinimumPlan(planSlug, requiredPlan) : false
                      const star = requiredPlan ? planStarIconForTarget(requiredPlan) : null

                      return (
                        <div
                          key={resource.id}
                          className={cn(
                            "flex items-center justify-between gap-4 p-4",
                            index > 0 && "border-t border-brand-border dark:border-dark-border",
                          )}
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
                          <Switch checked={checked} onCheckedChange={(value: boolean) => toggleResource(resource.id, value)} />
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>
    </FadeIn>
  )
}
