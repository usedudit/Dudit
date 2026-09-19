"use client"

import DefaultModal from "@/components/reusable/DefaultModal"
import { ListItem, Badge } from "@/components/reusable"
import { AlertCircleIcon, ColumnsIcon, TableIcon } from "@/lib/icons"

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
        <div className="flex flex-col gap-3 pt-2">
          <ListItem
            icon={ColumnsIcon}
            title="Colunas padrão"
            description="Colunas essenciais para análise rápida."
            className="px-4 py-3"
            onClick={() => onConfirm(false)}
          />

          <ListItem
            icon={TableIcon}
            title="Todas as colunas"
            description={
              canExportAllColumns
                ? "Dados completos incluindo informações complementares."
                : "Disponível a partir do plano Crescer."
            }
            right={
              canExportAllColumns ? (
                <Badge variant="blue">Completa</Badge>
              ) : (
                <Badge variant="orange">Plano Crescer+</Badge>
              )
            }
            onClick={canExportAllColumns ? () => onConfirm(true) : undefined}
            className={`px-4 py-3 ${canExportAllColumns ? "" : "opacity-60 cursor-default"}`}
          />
        </div>

        {!canExportAllColumns && (
          <p className="text-sm text-brand-inactive-text dark:text-dark-body text-center pt-2">
            A exportação com todas as colunas está disponível a partir do plano <strong>Crescer</strong>.
          </p>
        )}
      </div>
    </DefaultModal>
  )
}
