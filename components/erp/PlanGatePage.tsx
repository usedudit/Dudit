"use client"

import { useEffect } from "react"
import { IconPlaceholder } from "@/components/reusable"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { trackEvent } from "@/lib/analytics"

interface PlanGatePageProps {
  title: string
  subtitle: string
  requiredPlan: "crescer" | "escalar"
}

export function PlanGatePage({ title, subtitle, requiredPlan }: PlanGatePageProps) {
  const { openPlanUpgrade } = usePlanUpgrade()

  useEffect(() => {
    trackEvent("feature_paywall_viewed", {
      title,
      required_plan: requiredPlan,
    })
  }, [title, requiredPlan])

  return (
    <div className="flex flex-col items-center justify-center text-center min-h-[400px] px-4 py-10">
      <IconPlaceholder
        placeholderType="image"
        imageSrc="https://img.dudit.com.br/static/mascots/PlanoVender.png"
        imageAlt="Recurso bloqueado"
        title={title}
        subtitle={subtitle}
        itemButton={{
          text: "Fazer upgrade",
          action: () => {
            trackEvent("plan_upgrade_clicked", {
              title,
              required_plan: requiredPlan,
            })
            openPlanUpgrade(requiredPlan)
          },
        }}
      />
    </div>
  )
}
