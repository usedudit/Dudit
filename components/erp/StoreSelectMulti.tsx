"use client"

import React from "react"
import { StoreIcon, GlobeIcon, ShieldIcon, CheckCircleIcon } from "@/lib/icons"
import { DefaultModal, Button, Checkbox, Badge } from "@/components/reusable"

export type StoreOption = {
  id: string
  name: string
}

export type StoreSelectMultiProps = {
  stores: StoreOption[]
  selectedStoreIds: string[] | null // null = todas as lojas (herdado por padrao)
  onChange: (selectedStoreIds: string[] | null) => void
  disabled?: boolean
  className?: string
}

/**
 * Componente inline para selecao de visibilidade de lojas em cadastros e formas de pagamento.
 * Utiliza o padrao de design da aplicacao (tokens brand-*, dark:* e icones de @/lib/icons).
 */
export function StoreSelectMulti({
  stores,
  selectedStoreIds,
  onChange,
  disabled = false,
  className = "",
}: StoreSelectMultiProps) {
  const isAllStores = selectedStoreIds === null || selectedStoreIds.length === 0

  const handleToggleAll = () => {
    if (!isAllStores) {
      onChange(null) // Reset to all stores
    }
  }

  const handleToggleStore = (storeId: string) => {
    let current = selectedStoreIds === null ? [] : [...selectedStoreIds]
    if (current.includes(storeId)) {
      current = current.filter((id) => id !== storeId)
      if (current.length === 0) {
        onChange(null)
        return
      }
    } else {
      current.push(storeId)
    }
    onChange(current)
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-brand-dark dark:text-dark-heading flex items-center gap-2">
          <StoreIcon className="w-4 h-4 text-brand-green" />
          Visibilidade por Loja / Filial
        </label>
        <Badge variant={isAllStores ? "green" : "orange"}>
          {isAllStores ? "Todas as Lojas" : `${selectedStoreIds?.length || 0} de ${stores.length} selecionada(s)`}
        </Badge>
      </div>

      <div className="border border-brand-border dark:border-dark-border rounded-xl p-3.5 bg-brand-gray/30 dark:bg-dark-surface/50 space-y-3 transition-all">
        {/* Toggle para TODAS as Lojas */}
        <button
          type="button"
          disabled={disabled}
          onClick={handleToggleAll}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            isAllStores
              ? "bg-brand-green text-white shadow-sm ring-2 ring-brand-green/20"
              : "bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading hover:bg-gray-50 dark:hover:bg-dark-border border border-brand-border dark:border-dark-border"
          } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <div className="flex items-center gap-2.5">
            <GlobeIcon className={`w-4 h-4 ${isAllStores ? "text-white" : "text-brand-green"}`} />
            <span>Disponível em TODAS as Lojas (Herdado por Padrão)</span>
          </div>
          {isAllStores && <CheckCircleIcon className="w-4 h-4 text-white" />}
        </button>

        {/* Lista de Lojas individuais */}
        {stores.length > 0 && (
          <div className="pt-2 border-t border-brand-border/60 dark:border-dark-border/60 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {stores.map((s) => {
              const isChecked = !isAllStores && selectedStoreIds.includes(s.id)
              return (
                <div
                  key={s.id}
                  onClick={() => !disabled && handleToggleStore(s.id)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm select-none transition-all ${
                    isChecked
                      ? "border-brand-green bg-brand-green/10 dark:bg-brand-green/15 text-brand-dark dark:text-white font-semibold shadow-xs"
                      : "border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading hover:border-brand-green/40"
                  } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <Checkbox
                    checked={isChecked}
                    onChange={() => handleToggleStore(s.id)}
                    disabled={disabled}
                  />
                  <span className="truncate">{s.name}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-xs text-brand-inactive-text dark:text-dark-body">
        <ShieldIcon className="w-3.5 h-3.5 text-brand-green shrink-0" />
        <span>
          {isAllStores
            ? "Este cadastro ficará disponível automaticamente em todas as filiais (atuais e futuras)."
            : `Este cadastro será visível exclusivamente na(s) ${selectedStoreIds?.length} loja(s) marcada(s).`}
        </span>
      </div>
    </div>
  )
}

export type StoreSelectModalProps = {
  isOpen: boolean
  onClose: () => void
  stores: StoreOption[]
  selectedStoreIds: string[] | null
  onSave: (selectedStoreIds: string[] | null) => void
  title?: string
  disabled?: boolean
}

/**
 * Componente Modal (wrapper com DefaultModal) para edicao de visibilidade de lojas em dialogs.
 */
export function StoreSelectModal({
  isOpen,
  onClose,
  stores,
  selectedStoreIds,
  onSave,
  title = "Visibilidade por Loja / Filial",
  disabled = false,
}: StoreSelectModalProps) {
  const [tempSelected, setTempSelected] = React.useState<string[] | null>(selectedStoreIds)

  React.useEffect(() => {
    setTempSelected(selectedStoreIds)
  }, [selectedStoreIds, isOpen])

  const handleConfirm = () => {
    onSave(tempSelected)
    onClose()
  }

  return (
    <DefaultModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="md"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="default" onClick={handleConfirm} disabled={disabled}>
            Salvar Visibilidade
          </Button>
        </div>
      }
    >
      <div className="py-2">
        <StoreSelectMulti
          stores={stores}
          selectedStoreIds={tempSelected}
          onChange={setTempSelected}
          disabled={disabled}
        />
      </div>
    </DefaultModal>
  )
}
