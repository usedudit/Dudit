"use client"

import React from "react"
import { Button, FormDropdown, Checkbox } from "@/components/reusable"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import {
  FileIcon,
  AnalyticsIcon,
  ArrowUpDownIcon,
} from "@/lib/icons"
import type { DreRegime } from "@/lib/services/dre.service"

export type PeriodPreset =
  | "current_month"
  | "last_month"
  | "last_30_days"
  | "current_quarter"
  | "current_year"
  | "custom"

export type DreViewTab = "structure" | "indicators"

interface StoreOption {
  id: string
  name: string
}

interface DrePageControlsProps {
  activeTab: DreViewTab
  setActiveTab: (tab: DreViewTab) => void
  preset: PeriodPreset
  setPreset: (preset: PeriodPreset) => void
  customStartDate: string
  setCustomStartDate: (date: string) => void
  customEndDate: string
  setCustomEndDate: (date: string) => void
  stores: StoreOption[]
  selectedStoreId: string
  setSelectedStoreId: (id: string) => void
  regime: DreRegime
  setRegime: (regime: DreRegime) => void
  comparePrevious: boolean
  setComparePrevious: (compare: boolean) => void
  isAllExpanded: boolean
  onToggleExpandAll: () => void
}

const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: "current_month", label: "Mês Atual" },
  { value: "last_month", label: "Mês Anterior" },
  { value: "last_30_days", label: "Últimos 30 Dias" },
  { value: "current_quarter", label: "Trimestre Atual" },
  { value: "current_year", label: "Ano Completo" },
  { value: "custom", label: "Personalizado..." },
]

export function DrePageControls({
  activeTab,
  setActiveTab,
  preset,
  setPreset,
  customStartDate,
  setCustomStartDate,
  customEndDate,
  setCustomEndDate,
  stores,
  selectedStoreId,
  setSelectedStoreId,
  regime,
  setRegime,
  comparePrevious,
  setComparePrevious,
  isAllExpanded,
  onToggleExpandAll,
}: DrePageControlsProps) {
  const storeOptions = [
    { value: "all", label: "Todas as Lojas (Consolidado)" },
    ...stores.map((s) => ({ value: s.id, label: s.name })),
  ]

  return (
    <>
      {/* ── Tabs de Navegação ────────────────────────────────────────────── */}
      <div className="mb-6 px-4 md:px-8 print:hidden">
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as DreViewTab)}>
          <TabsList className="px-0">
            <TabsTrigger value="structure" icon={FileIcon}>
              Demonstração DRE
            </TabsTrigger>
            <TabsTrigger value="indicators" icon={AnalyticsIcon}>
              Indicadores & Margens
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* ── Barra de Controles e Filtros ─────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6 flex-none px-4 md:px-8 print:hidden">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Seletor de Período */}
          <div className="w-48">
            <FormDropdown
              options={PERIOD_OPTIONS}
              value={preset}
              setValue={(val) => setPreset(val as PeriodPreset)}
            />
          </div>

          {/* Inputs de Data Personalizada */}
          {preset === "custom" && (
            <div className="flex items-center gap-2 bg-brand-gray dark:bg-dark-border/30 p-1.5 rounded-xl border border-brand-border dark:border-dark-border">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="text-xs px-2 py-1 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-lg text-brand-dark dark:text-dark-heading focus:outline-hidden"
              />
              <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium">até</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="text-xs px-2 py-1 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-lg text-brand-dark dark:text-dark-heading focus:outline-hidden"
              />
            </div>
          )}

          {/* Seletor de Loja (se houver mais de uma) */}
          {stores.length > 1 && (
            <div className="w-56">
              <FormDropdown
                options={storeOptions}
                value={selectedStoreId}
                setValue={(val) => setSelectedStoreId(val)}
              />
            </div>
          )}

          {/* Regime Contábil: Competência vs Caixa */}
          <div className="flex items-center bg-brand-gray dark:bg-dark-border/40 p-1 rounded-xl border border-brand-border dark:border-dark-border">
            <button
              type="button"
              onClick={() => setRegime("competencia")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                regime === "competencia"
                  ? "bg-brand-green text-white"
                  : "text-brand-dark dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading"
              }`}
            >
              Competência
            </button>
            <button
              type="button"
              onClick={() => setRegime("caixa")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                regime === "caixa"
                  ? "bg-brand-green text-white"
                  : "text-brand-dark dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading"
              }`}
            >
              Caixa
            </button>
          </div>

          {/* Comparativo Anterior */}
          <div className="flex items-center gap-2 pl-1">
            <Checkbox
              checked={comparePrevious}
              onCheckedChange={(checked) => setComparePrevious(Boolean(checked))}
            />
            <span
              className="text-xs text-brand-dark dark:text-dark-body font-medium select-none cursor-pointer"
              onClick={() => setComparePrevious(!comparePrevious)}
            >
              Comparar anterior
            </span>
          </div>
        </div>

        {/* Direita: Ações */}
        <div className="flex items-center gap-2 self-end md:self-center">
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleExpandAll}
            className="text-xs h-[42px]"
          >
            <ArrowUpDownIcon size={16} className="mr-1.5" />
            {isAllExpanded ? "Recolher tudo" : "Expandir tudo"}
          </Button>
        </div>
      </div>
    </>
  )
}
