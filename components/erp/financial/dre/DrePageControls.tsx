"use client"

import React from "react"
import { Button, FormDropdown, Checkbox } from "@/components/reusable"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import {
  CalendarIcon,
  ExportFileIcon,
  PrinterIcon,
  ArrowUpDownIcon,
  FileIcon,
  AnalyticsIcon,
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
  onExportCsv: () => void
  onExportPdf: () => void
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
  onExportCsv,
  onExportPdf,
}: DrePageControlsProps) {
  const storeOptions = [
    { value: "all", label: "Todas as Unidades (Consolidado)" },
    ...stores.map((s) => ({ value: s.id, label: s.name })),
  ]

  return (
    <div className="w-full space-y-4 print:hidden">
      {/* ── Tabs de Navegação do Módulo ────────────────────────────────────── */}
      <div className="flex items-center justify-between">
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

      {/* ── Barra de Controles e Filtros do DRE ────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border p-3.5 md:p-4 rounded-2xl shadow-2xs">
        {/* Esquerda: Filtros de Período, Loja, Regime */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Seletor de Período */}
          <div className="w-44 md:w-48">
            <FormDropdown
              options={PERIOD_OPTIONS}
              value={preset}
              setValue={(val) => setPreset(val as PeriodPreset)}
            />
          </div>

          {/* Inputs de Data Personalizada */}
          {preset === "custom" && (
            <div className="flex items-center gap-1.5 bg-brand-gray/10 dark:bg-dark-border/20 p-1 rounded-xl border border-brand-border dark:border-dark-border">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="text-xs px-2 py-1 bg-white dark:bg-dark-card border border-brand-border dark:border-dark-border rounded-lg text-brand-dark dark:text-dark-heading focus:outline-hidden focus:ring-1 focus:ring-brand-primary"
              />
              <span className="text-xs text-brand-inactive-text dark:text-dark-muted font-medium">até</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="text-xs px-2 py-1 bg-white dark:bg-dark-card border border-brand-border dark:border-dark-border rounded-lg text-brand-dark dark:text-dark-heading focus:outline-hidden focus:ring-1 focus:ring-brand-primary"
              />
            </div>
          )}

          {/* Seletor de Loja (se houver mais de uma) */}
          {stores.length > 1 && (
            <div className="w-52 md:w-60">
              <FormDropdown
                options={storeOptions}
                value={selectedStoreId}
                setValue={(val) => setSelectedStoreId(val)}
              />
            </div>
          )}

          {/* Regime Contábil: Competência vs Caixa */}
          <div className="flex items-center bg-brand-gray/20 dark:bg-dark-border/40 p-1 rounded-xl border border-brand-border dark:border-dark-border">
            <button
              type="button"
              onClick={() => setRegime("competencia")}
              title="Fato Gerador: vendas e despesas reconhecidas na data de emissão/vencimento"
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                regime === "competencia"
                  ? "bg-brand-primary text-white shadow-2xs"
                  : "text-brand-dark/70 dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading"
              }`}
            >
              Competência
            </button>
            <button
              type="button"
              onClick={() => setRegime("caixa")}
              title="Fluxo Financeiro: receitas e despesas reconhecidas na data do efetivo pagamento"
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                regime === "caixa"
                  ? "bg-brand-primary text-white shadow-2xs"
                  : "text-brand-dark/70 dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading"
              }`}
            >
              Caixa
            </button>
          </div>

          {/* Comparativo com Período Anterior */}
          <div className="flex items-center gap-2 pl-1.5">
            <Checkbox
              checked={comparePrevious}
              onCheckedChange={(checked) => setComparePrevious(Boolean(checked))}
            />
            <span className="text-xs text-brand-dark/80 dark:text-dark-body font-medium select-none cursor-pointer" onClick={() => setComparePrevious(!comparePrevious)}>
              Comparar anterior
            </span>
          </div>
        </div>

        {/* Direita: Ações (Recolher, CSV, PDF) */}
        <div className="flex items-center gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-brand-border/40 dark:border-dark-border/40">
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleExpandAll}
            className="text-xs h-9"
          >
            <ArrowUpDownIcon className="w-3.5 h-3.5 mr-1.5" />
            {isAllExpanded ? "Recolher tudo" : "Expandir tudo"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onExportCsv}
            className="text-xs h-9"
          >
            <ExportFileIcon className="w-3.5 h-3.5 mr-1.5" />
            Exportar CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onExportPdf}
            className="text-xs h-9"
          >
            <PrinterIcon className="w-3.5 h-3.5 mr-1.5" />
            Imprimir / PDF
          </Button>
        </div>
      </div>
    </div>
  )
}
