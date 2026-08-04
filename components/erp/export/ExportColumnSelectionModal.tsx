"use client"

import { Button } from "@/components/reusable"
import DefaultModal from "@/components/reusable/DefaultModal"
import { AlertCircleIcon } from "@/lib/icons"

interface ExportColumnSelectionModalProps {
  isOpen: boolean
  canExportAllColumns: boolean
  onConfirm: (includeAllColumns: boolean) => void
  onClose: () => void
}

export default function ExportColumnSelectionModal({
  isOpen,
  canExportAllColumns,
  onConfirm,
  onClose,
}: ExportColumnSelectionModalProps) {
  return (
    <DefaultModal
      isOpen={isOpen}
      onClose={onClose}
      title="Exportar dados"
      maxWidth="md"
    >
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex items-start gap-3 p-3 bg-brand-muted dark:bg-dark-muted rounded-lg">
          <AlertCircleIcon size={20} className="text-brand-warning shrink-0 mt-0.5" />
          <p className="text-brand-body dark:text-dark-body text-sm">
            Escolha quais colunas deseja incluir na exportação:
          </p>
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <Button
            onClick={() => onConfirm(false)}
            className="w-full"
          >
            <div className="flex items-center justify-between">
              <span>Colunas padrão</span>
              <span className="text-xs text-brand-muted">Essenciais</span>
            </div>
          </Button>
          <Button
            variant={canExportAllColumns ? "outline" : "outline"}
            onClick={() => canExportAllColumns && onConfirm(true)}
            className="w-full"
            disabled={!canExportAllColumns}
          >
            <div className="flex items-center justify-between">
              <span>Todas as colunas</span>
              <span className="text-xs text-brand-muted">
                {canExportAllColumns ? "Completa" : "Plano Crescer+"}
              </span>
            </div>
          </Button>
        </div>

        {!canExportAllColumns && (
          <p className="text-xs text-brand-inactive-text dark:text-dark-muted text-center pt-2">
            A exportação com todas as colunas está disponível a partir do plano <strong>Crescer</strong>.
          </p>
        )}
      </div>
    </DefaultModal>
  )
}