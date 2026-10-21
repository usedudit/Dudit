"use client"

import { useEffect, useState } from "react"
import DefaultModal from "@/components/reusable/DefaultModal"
import { ListItem, Badge, Button, RadioButton } from "@/components/reusable"
import { Switch } from "@/components/reusable/Switch"
import { ColumnsIcon, FileTextIcon, TableIcon } from "@/lib/icons"
import type { ErpExportFormat } from "@/lib/erp/export/types"

type ColumnSet = "standard" | "all"

interface ExportColumnSelectionModalProps {
  isOpen: boolean
  canExportAllColumns: boolean
  supportDetail?: boolean
  defaultFormat?: ErpExportFormat
  defaultDetail?: boolean
  onConfirm: (includeAllColumns: boolean, format: ErpExportFormat, detail: boolean) => void
  onClose: () => void
}

export default function ExportColumnSelectionModal({
  isOpen,
  canExportAllColumns,
  supportDetail = false,
  defaultFormat = "xlsx",
  defaultDetail = false,
  onConfirm,
  onClose,
}: ExportColumnSelectionModalProps) {
  const [format, setFormat] = useState<ErpExportFormat>(defaultFormat)
  const [columns, setColumns] = useState<ColumnSet>("standard")
  const [detail, setDetail] = useState(defaultDetail)
  const [visible, setVisible] = useState(isOpen)

  useEffect(() => {
    if (isOpen) {
      setVisible(true)
      setFormat(defaultFormat)
      setColumns("standard")
      setDetail(defaultDetail)
    } else {
      setVisible(false)
    }
  }, [isOpen, defaultFormat, defaultDetail])

  const handleConfirm = () => {
    onConfirm(columns === "all", format, detail)
  }

  if (!visible) return null

  const handleClose = () => {
    setVisible(false)
    onClose()
  }

  const allDisabled = !canExportAllColumns

  return (
    <DefaultModal isOpen={visible} onClose={handleClose} title="Exportar dados" maxWidth="md">
      <div className="flex flex-col gap-5 pb-2">
        {supportDetail && (
          <div className="flex items-center justify-between rounded-xl border border-brand-border dark:border-dark-border bg-gray-50 dark:bg-dark-border/30 p-3 pr-4">
            <div className="flex flex-col">
              <p className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                Exportar detalhado
              </p>
              <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                Gera um registro por item do pedido (produtos, SKUs, valores unitários).
              </p>
            </div>
            <Switch checked={detail} onCheckedChange={setDetail} />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-brand-inactive-text dark:text-dark-body">
            Formato do arquivo
          </p>
          <div className="flex flex-col gap-3">
            <ListItem
              icon={TableIcon}
              title="Excel (.xlsx)"
              description="Planilha formatada com filtros, totais e números prontos para somar."
              className="px-4 py-3"
              right={<RadioButton checked={format === "xlsx"} name={""} value={""} onChange={() => setFormat("xlsx")} />}
            />
            <ListItem
              icon={FileTextIcon}
              title="CSV (.csv)"
              description="Texto separado por ponto e vírgula, compatível com o Excel brasileiro."
              className="px-4 py-3"
              right={<RadioButton checked={format === "csv"} name={""} value={""} onChange={() => setFormat("csv")} />}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-brand-inactive-text dark:text-dark-body">
            Colunas
          </p>
          <div className="flex flex-col gap-3">
            <ListItem
              icon={ColumnsIcon}
              title="Colunas padrão"
              description="Colunas essenciais para análise rápida."
              className="px-4 py-3"
              right={<RadioButton checked={columns === "standard"} name={""} value={""} onChange={() => setColumns("standard")} />}
            />
            <ListItem
              icon={TableIcon}
              title="Todas as colunas"
              description={
                canExportAllColumns
                  ? "Dados completos incluindo informações complementares."
                  : "Disponível a partir do plano Crescer."
              }
              right={allDisabled ? <Badge variant="orange">Plano Crescer+</Badge> : <RadioButton checked={columns === "all"} name={""} value={""} onChange={() => setColumns("all")} />}
              onClick={allDisabled ? undefined : () => setColumns("all")}
              className={`px-4 py-3 ${allDisabled ? "opacity-60 cursor-default" : ""}`}
            />
          </div>
        </div>

        {!canExportAllColumns && (
          <p className="text-sm text-brand-inactive-text dark:text-dark-body text-center pt-2">
            A exportação com todas as colunas está disponível a partir do plano <strong>Crescer</strong>.
          </p>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-brand-border dark:border-dark-border">
        <Button variant="outline" size="sm" onClick={handleClose}>
          Cancelar
        </Button>
        <Button size="sm" onClick={handleConfirm} leftIcon={<TableIcon size={16} />}>
          Exportar
        </Button>
      </div>
    </DefaultModal>
  )
}
