"use client"

import { useEffect, useState } from "react"
import DefaultModal from "@/components/reusable/DefaultModal"
import { ListItem, Badge } from "@/components/reusable"
import { AlertCircleIcon, CheckIcon, ColumnsIcon, FileTextIcon, TableIcon } from "@/lib/icons"
import type { ErpExportFormat } from "@/lib/erp/export/types"

interface ExportColumnSelectionModalProps {
  isOpen: boolean
  canExportAllColumns: boolean
  defaultFormat?: ErpExportFormat
  onConfirm: (includeAllColumns: boolean, format: ErpExportFormat) => void
  onClose: () => void
}

export default function ExportColumnSelectionModal({
  isOpen,
  canExportAllColumns,
  defaultFormat = "xlsx",
  onConfirm,
  onClose,
}: ExportColumnSelectionModalProps) {
  const [format, setFormat] = useState<ErpExportFormat>(defaultFormat)

  useEffect(() => {
    if (isOpen) setFormat(defaultFormat)
  }, [isOpen, defaultFormat])

  return (
    <DefaultModal isOpen={isOpen} onClose={onClose} title="Exportar dados" maxWidth="md">
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-inactive-text dark:text-dark-body">
            Formato do arquivo
          </p>
          <div className="flex flex-col gap-3">
            <ListItem
              icon={TableIcon}
              title="Excel (.xlsx)"
              description="Planilha formatada com filtros, totais e números prontos para somar."
              className="px-4 py-3"
              right={format === "xlsx" ? <CheckIcon className="h-5 w-5 text-brand-green" /> : undefined}
              onClick={() => setFormat("xlsx")}
            />
            <ListItem
              icon={FileTextIcon}
              title="CSV (.csv)"
              description="Texto separado por ponto e vírgula, compatível com o Excel brasileiro."
              className="px-4 py-3"
              right={format === "csv" ? <CheckIcon className="h-5 w-5 text-brand-green" /> : undefined}
              onClick={() => setFormat("csv")}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-inactive-text dark:text-dark-body">
            Colunas
          </p>
          <div className="flex flex-col gap-3">
            <ListItem
              icon={ColumnsIcon}
              title="Colunas padrão"
              description="Colunas essenciais para análise rápida."
              className="px-4 py-3"
              onClick={() => onConfirm(false, format)}
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
              onClick={canExportAllColumns ? () => onConfirm(true, format) : undefined}
              className={`px-4 py-3 ${canExportAllColumns ? "" : "opacity-60 cursor-default"}`}
            />
          </div>
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
