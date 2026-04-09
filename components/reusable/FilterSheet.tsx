"use client"

import React, { useState, useEffect } from "react"
import { Button, Checkbox, Input } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { Accordion } from "./Accordion"
import { useMediaQuery } from "@/components/erp/hooks"
import { XIcon } from "@/lib/icons"

// --- Tipos de Configuração do Filtro ---

export type FilterType = "checkbox-list" | "range"

export interface FilterSectionConfig {
  id: string
  title: string
  type: FilterType
  options?: string[] // Para checkbox-list
  rangeConfig?: {    // Para range (preço/estoque)
    minKey: string
    maxKey: string
    minPlaceholder?: string
    maxPlaceholder?: string
  }
}

interface FilterSheetProps {
  isOpen: boolean
  onClose: () => void
  sections: FilterSectionConfig[] // Nova prop de configuração dinâmica
  filters: Record<string, any>    // Estado dos filtros (genérico)
  setFilters: (filters: any) => void
  onClear: () => void
}

const FilterSheet: React.FC<FilterSheetProps> = ({
  isOpen,
  onClose,
  sections,
  filters,
  setFilters,
  onClear,
}) => {
  const [localFilters, setLocalFilters] = useState<Record<string, any>>(filters)
  const isMobile = useMediaQuery("(max-width: 768px)")

  // Sincroniza estado local ao abrir
  useEffect(() => {
    if (isOpen) setLocalFilters(filters)
  }, [isOpen, filters])

  // Handler para listas (checkbox)
  const toggleList = (key: string, val: string) => {
    const current = (localFilters[key] as string[]) || []
    const updated = current.includes(val)
      ? current.filter((x) => x !== val)
      : [...current, val]

    setLocalFilters((prev) => ({ ...prev, [key]: updated }))
  }

  // Handler para limpar uma lista específica
  const clearList = (key: string) => {
    setLocalFilters((prev) => ({ ...prev, [key]: [] }))
  }

  // Handler para Ranges (Preço/Estoque)
  const updateRange = (parentKey: string, field: "min" | "max", value: string) => {
    const currentRange = localFilters[parentKey] || { min: "", max: "" }
    setLocalFilters((prev) => ({
      ...prev,
      [parentKey]: { ...currentRange, [field]: value },
    }))
  }

  const content = (
    <div className="flex flex-col h-full bg-white dark:bg-dark-surface">
      <header className="border-b border-brand-border dark:border-dark-border p-6 flex justify-between items-center">
        <h2 className="text-xl font-bold dark:text-dark-heading">Filtros</h2>
        <Button variant="ghost" onClick={onClose} size="icon">
          <XIcon className="w-5 h-5" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-2">
        {sections.map((section) => {
          // Renderização de Range (Min/Max)
          if (section.type === "range" && section.rangeConfig) {
            const { minKey, maxKey } = section.rangeConfig
            // O valor deve estar estruturado no objeto filters como { [id]: { min: "", max: "" } }
            const rangeValue = localFilters[section.id] || { min: "", max: "" }

            return (
              <Accordion key={section.id} title={section.title} defaultOpen>
                <div className="flex items-center gap-3">
                  <Input
                    name={minKey}
                    placeholder={section.rangeConfig.minPlaceholder || "Min"}
                    type="number"
                    value={rangeValue.min || ""}
                    onChange={(e) => updateRange(section.id, "min", e.target.value)}
                    className="h-9 text-sm"
                    label=""
                  />
                  <span className="text-gray-400">-</span>
                  <Input
                    name={maxKey}
                    placeholder={section.rangeConfig.maxPlaceholder || "Max"}
                    type="number"
                    value={rangeValue.max || ""}
                    onChange={(e) => updateRange(section.id, "max", e.target.value)}
                    className="h-9 text-sm"
                    label=""
                  />
                </div>
              </Accordion>
            )
          }

          // Renderização de Checkbox List
          if (section.type === "checkbox-list" && section.options) {
            const selectedValues = (localFilters[section.id] as string[]) || []
            const isAllSelected = selectedValues.length === 0

            return (
              <Accordion key={section.id} title={section.title} defaultOpen>
                {/* Opção "Todos" */}
                <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-border cursor-pointer transition-colors">
                  <Checkbox
                    checked={isAllSelected}
                    onChange={() => clearList(section.id)}
                  />
                  <span className="text-sm dark:text-dark-heading font-medium">Todos</span>
                </label>

                {/* Opções Individuais */}
                {section.options.map((option) => (
                  <label
                    key={option}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-border cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={selectedValues.includes(option)}
                      onChange={() => toggleList(section.id, option)}
                    />
                    <span className="text-sm dark:text-dark-heading">{option}</span>
                  </label>
                ))}
              </Accordion>
            )
          }

          return null
        })}
      </div>

      <footer className="border-t border-brand-border dark:border-dark-border p-6 flex gap-3">
        <Button
          variant="outline"
          onClick={() => {
            onClear()
            onClose()
          }}
          className="flex-1 rounded-full"
        >
          Limpar
        </Button>
        <Button
          onClick={() => {
            setFilters(localFilters)
            onClose()
          }}
          className="flex-1 rounded-full"
        >
          Aplicar
        </Button>
      </footer>
    </div>
  )

  if (isMobile) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose}>
        {content}
      </BottomSheet>
    )
  }

  return (
    <Portal>
      <div
        className={`fixed inset-0 bg-black/50 z-50 transition-opacity ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      >
        <div
          className={`fixed right-4 top-4 bottom-4 w-96 bg-white dark:bg-dark-surface shadow-2xl rounded-2xl transition-transform duration-300 overflow-hidden ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    </Portal>
  )
}

export default FilterSheet
