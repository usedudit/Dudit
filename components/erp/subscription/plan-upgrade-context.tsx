"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { Button } from "@/components/reusable"
import { XIcon } from "@/lib/icons"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils"
import {
  listPlansAction,
  getSubscriptionStatusAction,
  createSubscriptionAction,
  upgradeSubscriptionAction,
} from "@/app/actions/subscriptions"
import { buildFeaturesDisplay } from "@/lib/subscription/feature-labels"
import { PLAN_UPGRADE_ICONS, PLAN_UPGRADE_MASCOTS, type PlanTierSlug } from "@/lib/subscription/plan-tier"
import { Input as FormInput } from "@/components/reusable/Input"
import { Loader2 } from "lucide-react"

type UpgradeTarget = PlanTierSlug

interface PlanUpgradeContextValue {
  openPlanUpgrade: (target: UpgradeTarget) => void
}

const PlanUpgradeContext = createContext<PlanUpgradeContextValue | null>(null)

const HERO_COPY: Record<UpgradeTarget, { title: string; kicker: string }> = {
  free: { title: "", kicker: "" },
  vendedor: {
    title: "Desbloqueie o Vendedor",
    kicker: "Leve sua operação para o próximo nível",
  },
  crescer: {
    title: "Desbloqueie o Crescer",
    kicker: "Escala, logística e finanças avançadas",
  },
  profissional: {
    title: "Desbloqueie o Profissional",
    kicker: "Tudo que sua loja precisa para crescer sem teto",
  },
}

function PlanUpgradeModalInner({
  target,
  isOpen,
  onClose,
}: {
  target: UpgradeTarget | null
  isOpen: boolean
  onClose: () => void
}) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [anim, setAnim] = useState(false)
  const [visible, setVisible] = useState(false)

  const [plans, setPlans] = useState<any[]>([])
  const [subData, setSubData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [billingEmail, setBillingEmail] = useState("")
  const [emailError, setEmailError] = useState("")

  useEffect(() => {
    if (isOpen) {
      setVisible(true)
      const id = setTimeout(() => setAnim(true), 50)
      return () => clearTimeout(id)
    }
    setAnim(false)
    const id = setTimeout(() => setVisible(false), 200)
    return () => clearTimeout(id)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !target || target === "free") return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [plansRes, statusRes] = await Promise.all([listPlansAction(), getSubscriptionStatusAction()])
        if (cancelled) return
        if (plansRes.success && plansRes.data) {
          setPlans([...plansRes.data].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)))
        }
        if (statusRes.success && statusRes.data) {
          setSubData(statusRes.data)
          if (statusRes.data.subscription?.billing_email) {
            setBillingEmail(statusRes.data.subscription.billing_email)
          }
        }
      } catch {
        toast.error("Não foi possível carregar os planos.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, target])

  const targetPlan = useMemo(() => {
    if (!target || !plans.length) return null
    return plans.find((p) => p.slug === target) || null
  }, [plans, target])

  const featureLines = useMemo(() => {
    if (!targetPlan) return []
    const feats = (targetPlan.features_json || []) as string[]
    return buildFeaturesDisplay(feats, targetPlan.slug, plans)
  }, [targetPlan, plans])

  const handleSubscribe = async () => {
    if (!targetPlan) return
    const email = billingEmail.trim().toLowerCase()
    if (!email || !email.includes("@") || !email.includes(".")) {
      setEmailError("Por favor, informe um email válido.")
      return
    }
    setEmailError("")
    setActionLoading(true)
    try {
      const hasActiveSub =
        subData?.subscription &&
        ["active", "trialing", "past_due"].includes(subData.subscription.status) &&
        subData?.plan?.slug !== "free"

      const result = hasActiveSub
        ? await upgradeSubscriptionAction(targetPlan.id)
        : await createSubscriptionAction(targetPlan.id, email)

      if (!result.success) {
        toast.error(result.error)
        return
      }
      const data = result.data as { initPoint?: string; message?: string }
      if (data?.initPoint) {
        toast.success("Redirecionando para o pagamento...")
        window.location.href = data.initPoint
        return
      }
      toast.success(data?.message || "Plano atualizado!")
      onClose()
    } catch {
      toast.error("Erro inesperado. Tente novamente.")
    } finally {
      setActionLoading(false)
    }
  }

  if (!visible || !target || target === "free") return null

  const hero = HERO_COPY[target]
  const mascot = PLAN_UPGRADE_MASCOTS[target as "vendedor" | "crescer"] || PLAN_UPGRADE_MASCOTS.vendedor
  const isVendedorOrCrescer = target === "vendedor" || target === "crescer"

  const leftPanel = (
    <div className="flex flex-col h-full bg-white dark:bg-dark-surface p-8 md:p-10 overflow-y-auto">
      <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-2">
        {targetPlan ? `Plano ${targetPlan.name}` : "Upgrade de plano"}
      </h2>
      <p className="text-sm text-brand-inactive-text dark:text-dark-body mb-6">
        Para usar este recurso, ative o plano <strong className="text-brand-dark dark:text-dark-heading">{targetPlan?.name || target}</strong>.
        {targetPlan?.price != null && (
          <>
            {" "}
            A partir de <strong className="text-brand-dark dark:text-dark-heading">{formatCurrency(Number(targetPlan.price))}</strong>/mês.
          </>
        )}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-brand-inactive-text py-8">
          <Loader2 className="w-5 h-5 animate-spin" />
          Carregando detalhes…
        </div>
      ) : (
        <>
          <p className="text-xs font-bold uppercase text-brand-green mb-3">O que está incluso</p>
          <ul className="space-y-3 mb-8">
            {featureLines.slice(0, 12).map((line) => (
              <li key={line} className="flex gap-3 text-sm text-brand-dark dark:text-dark-heading">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brand-dark text-white text-xs font-bold">✓</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <div className="mt-auto space-y-3">
            <label className="text-xs font-medium text-brand-inactive-text">Email de faturamento</label>
            <FormInput
              label=""
              type="email"
              value={billingEmail}
              onChange={(e) => setBillingEmail(e.target.value)}
              placeholder="voce@empresa.com.br"
              className="w-full"
            />
            {emailError ? <p className="text-xs text-red-600">{emailError}</p> : null}
            <p className="text-xs text-brand-inactive-text">
              Mesmo fluxo da página Minha Assinatura: você será redirecionado ao Mercado Pago quando necessário.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
              <Button variant="outline" className="flex-1 rounded-full" onClick={onClose} disabled={actionLoading}>
                Agora não
              </Button>
              <Button className="flex-1 rounded-full bg-brand-primary hover:bg-brand-primary/90 text-white" onClick={handleSubscribe} disabled={actionLoading || loading}>
                {actionLoading ? "Processando…" : "Assinar plano"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )

  const rightPanel = (
    <div className="relative flex flex-col items-center justify-between bg-[#0f172a] text-white p-8 min-h-[280px] md:min-h-0 md:w-[46%] shrink-0">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        aria-label="Fechar"
      >
        <XIcon className="w-5 h-5 text-white" />
      </button>
      <div className="text-center pt-6 md:pt-10 px-2">
        <p className="text-xs uppercase tracking-wider text-white/60 mb-2">{hero.kicker}</p>
        <h3 className="text-xl md:text-2xl font-bold leading-tight">{hero.title}</h3>
      </div>
      {isVendedorOrCrescer && (
        <div className="flex-1 flex items-center justify-center py-6 w-full max-w-[220px] md:max-w-[280px]">
          <img src={mascot} alt="" className="w-full h-auto object-contain drop-shadow-lg" />
        </div>
      )}
    </div>
  )

  if (isMobile) {
    return (
      <BottomSheet isOpen={anim} onClose={onClose}>
        <div className="flex flex-col gap-4 pt-2 pb-6 max-h-[85vh] overflow-y-auto">
          <div className="rounded-2xl overflow-hidden border border-brand-border dark:border-dark-border">
            <div className="max-h-[200px] overflow-hidden bg-[#0f172a] flex flex-col items-center px-6 pt-8 pb-4 relative">
              <button type="button" onClick={onClose} className="absolute top-3 right-3 p-2 rounded-full bg-white/10" aria-label="Fechar">
                <XIcon className="w-4 h-4 text-white" />
              </button>
              <p className="text-[11px] uppercase tracking-wider text-white/60 mb-1">{hero.kicker}</p>
              <h3 className="text-lg font-bold text-center text-white">{hero.title}</h3>
              {isVendedorOrCrescer && (
                <img src={mascot} alt="" className="w-40 h-auto object-contain mt-3" />
              )}
            </div>
          </div>
          {leftPanel}
        </div>
      </BottomSheet>
    )
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
        <div className={`fixed inset-0 bg-black/60 transition-opacity duration-200 ${anim ? "opacity-100" : "opacity-0"}`} onClick={onClose} />
        <div
          className={`relative z-10 flex w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl transition-all duration-200 ease-out bg-white dark:bg-dark-surface ${
            anim ? "scale-100 opacity-100" : "scale-95 opacity-0"
          }`}
        >
          <div className="flex flex-col md:flex-row w-full min-h-[480px]">{leftPanel}{rightPanel}</div>
        </div>
      </div>
    </Portal>
  )
}

export function PlanUpgradeProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<UpgradeTarget | null>(null)
  const [open, setOpen] = useState(false)

  const openPlanUpgrade = useCallback((t: UpgradeTarget) => {
    if (t === "free") return
    setTarget(t)
    setOpen(true)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setTimeout(() => setTarget(null), 220)
  }, [])

  const value = useMemo(() => ({ openPlanUpgrade }), [openPlanUpgrade])

  return (
    <PlanUpgradeContext.Provider value={value}>
      {children}
      <PlanUpgradeModalInner target={target} isOpen={open} onClose={close} />
    </PlanUpgradeContext.Provider>
  )
}

export function usePlanUpgrade(): PlanUpgradeContextValue {
  const ctx = useContext(PlanUpgradeContext)
  if (!ctx) {
    return { openPlanUpgrade: () => {} }
  }
  return ctx
}

/** Star icon URL for sidebar / tabs (vendedor vs crescer). */
export function planStarIconForTarget(target: UpgradeTarget): string | null {
  if (target === "vendedor") return PLAN_UPGRADE_ICONS.vendedor
  if (target === "crescer") return PLAN_UPGRADE_ICONS.crescer
  return null
}
