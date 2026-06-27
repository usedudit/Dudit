"use client"

import { Button } from "@/components/reusable"
import DefaultModal from "@/components/reusable/DefaultModal"

interface ExportSelectionModalProps {
  isOpen: boolean
  selectedCount: number
  totalCount: number
  onExportSelected: () => void
  onExportAll: () => void
  onClose: () => void
}

export default function ExportSelectionModal({
  isOpen,
  selectedCount,
  totalCount,
  onExportSelected,
  onExportAll,
  onClose,
}: ExportSelectionModalProps) {
  return (
    <DefaultModal
      isOpen={isOpen}
      onClose={onClose}
      title="Exportar dados"
      maxWidth="md"
    >
      <div className="flex flex-col gap-4 pb-2">
        <p className="text-brand-inactive-text dark:text-dark-body text-sm">
          Você selecionou <strong>{selectedCount}</strong> de <strong>{totalCount}</strong>{" "}
          {totalCount === 1 ? "item" : "itens"}. Deseja exportar apenas os selecionados ou
          todos os itens da lista atual?
        </p>

        <div className="flex flex-col gap-3 pt-2">
          <Button
            onClick={onExportSelected}
            className="w-full"
          >
            Exportar selecionados ({selectedCount})
          </Button>
          <Button
            variant="outline"
            onClick={onExportAll}
            className="w-full"
          >
            Exportar todos ({totalCount})
          </Button>
        </div>
      </div>
    </DefaultModal>
  )
}
