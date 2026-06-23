"use client"

import React, { useEffect } from "react"
import { Button, IconPlaceholder } from "@/components/reusable"
import { TagIcon } from "@/lib/icons"
import Link from "next/link"
import { LABEL_PRESETS } from "@/lib/labels/presets"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"

interface LabelsPageClientProps {
  isFree: boolean
}

export default function LabelsPageClient({ isFree }: LabelsPageClientProps) {
  const { openPlanUpgrade } = usePlanUpgrade()

  useEffect(() => {
    if (isFree) {
      openPlanUpgrade("crescer")
    }
  }, [isFree, openPlanUpgrade])

  if (isFree) {
    return (
      <div className="min-h-svh p-6 flex flex-col items-center justify-center">
        <IconPlaceholder
          icon={TagIcon}
          title="Plano necessário"
          subtitle="A geração de etiquetas está disponível nos planos Crescer e Escalar."
          itemButton={{
            text: "Fazer upgrade",
            action: () => openPlanUpgrade("crescer")
          }}
        />
      </div>
    )
  }

  return (
    <div className="min-h-svh p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Geração de Etiquetas</h1>
            <p className="text-muted-foreground">Crie e imprima etiquetas de produtos com código de barras</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/erp/dashboard" prefetch={false}>Voltar</Link>
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="p-6 border rounded-lg hover:bg-accent cursor-pointer">
            <Link href="/erp/labels/generate" prefetch={false} className="space-y-2 block h-full">
              <h3 className="font-semibold text-lg">Gerar Etiquetas</h3>
              <p className="text-sm text-muted-foreground">
                Selecione produtos e gere etiquetas com código de barras para impressão
              </p>
              <div className="pt-2">
                <Button variant="outline" size="sm">
                  Começar →
                </Button>
              </div>
            </Link>
          </div>

          <div className="p-6 border rounded-lg hover:bg-accent">
            <h3 className="font-semibold text-lg">Modelos Pimaco</h3>
            <ul className="text-sm text-muted-foreground mt-2 space-y-1">
              {LABEL_PRESETS.map((p) => (
                <li key={p.id}>✓ {p.name} — {p.description}</li>
              ))}
              <li>✓ Customizado</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
