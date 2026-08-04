"use client"

import { useCallback, useMemo, useState } from "react"
import { exportERPAction, type ExportERPInput } from "@/app/actions/erp/export"
import { useToast } from "@/hooks/use-toast"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"

function downloadBase64File(base64: string, filename: string, mimeType: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export interface UseErpExportOptions {
  selectedIds?: Set<string>
  totalCount?: number
}

interface ColumnSelectionModalState {
  isOpen: boolean
  baseInput: ExportERPInput
  selectedCount: number
  totalCount: number
  selectedIds: string[]
  onConfirm: (includeAllColumns: boolean) => void
}

interface SelectionModalState {
  isOpen: boolean
  selectedCount: number
  totalCount: number
  selectedIds: string[]
  baseInput: ExportERPInput
}

export function useErpExport(planSlug: string = "free") {
  const { toast } = useToast()
  const [isExporting, setIsExporting] = useState(false)
  const [selectionModalState, setSelectionModalState] = useState<SelectionModalState | null>(null)
  const [columnSelectionModalState, setColumnSelectionModalState] = useState<ColumnSelectionModalState | null>(null)

  const canExportAllColumns = hasMinimumPlan(planSlug, "crescer")

  const doExport = useCallback(
    async (input: ExportERPInput) => {
      if (isExporting) return
      setIsExporting(true)
      try {
        const res = await exportERPAction(input)
        if (!res.success) {
          toast({
            title: "Exportação",
            description: res.error || "Não foi possível exportar.",
            variant: "destructive",
          })
          return
        }
        downloadBase64File(res.base64, res.filename, res.mimeType)
        toast({
          title: "Exportação concluída",
          description: `${res.rowCount} registro(s) exportado(s).`,
        })
      } catch (e) {
        console.error("[Export] Erro inesperado no cliente:", e)
        toast({
          title: "Exportação",
          description: "Erro inesperado ao exportar.",
          variant: "destructive",
        })
      } finally {
        setIsExporting(false)
      }
    },
    [isExporting, toast],
  )

  const exportData = useCallback(
    (input: ExportERPInput, opts?: UseErpExportOptions) => {
      const selectedIds = opts?.selectedIds
      const totalCount = opts?.totalCount ?? 0
      const selectedCount = selectedIds?.size ?? 0

      if (selectedCount > 0 && selectedCount < totalCount) {
        setColumnSelectionModalState({
          isOpen: true,
          baseInput: input,
          selectedCount,
          totalCount,
          selectedIds: Array.from(selectedIds!),
          onConfirm: (includeAllColumns: boolean) => {
            setColumnSelectionModalState(null)
            const inputWithColumns = {
              ...input,
              filters: { ...input.filters, includeAllColumns },
            }
            setSelectionModalState({
              isOpen: true,
              selectedCount,
              totalCount,
              selectedIds: Array.from(selectedIds!),
              baseInput: inputWithColumns,
            })
          },
        })
      } else {
        setColumnSelectionModalState({
          isOpen: true,
          baseInput: input,
          selectedCount,
          totalCount,
          selectedIds: Array.from(selectedIds || []),
          onConfirm: (includeAllColumns: boolean) => {
            setColumnSelectionModalState(null)
            void doExport({
              ...input,
              filters: { ...input.filters, includeAllColumns },
            })
          },
        })
      }
    },
    [doExport],
  )

  const closeColumnSelectionModal = useCallback(() => {
    setColumnSelectionModalState(null)
  }, [])

  const handleColumnConfirm = useCallback(
    (includeAllColumns: boolean) => {
      if (!columnSelectionModalState) return
      const { onConfirm } = columnSelectionModalState
      onConfirm(includeAllColumns)
    },
    [columnSelectionModalState],
  )

  const closeSelectionModal = useCallback(() => {
    setSelectionModalState(null)
  }, [])

  const handleExportSelected = useCallback(() => {
    if (!selectionModalState) return
    const { baseInput, selectedIds } = selectionModalState
    void doExport({
      ...baseInput,
      filters: { ...baseInput.filters, selectedIds },
    })
  }, [selectionModalState, doExport])

  const handleExportAll = useCallback(() => {
    if (!selectionModalState) return
    void doExport(selectionModalState.baseInput)
  }, [selectionModalState, doExport])

  const columnSelectionModal = useMemo(
    () => ({
      isOpen: columnSelectionModalState?.isOpen ?? false,
      canExportAllColumns,
    }),
    [columnSelectionModalState, canExportAllColumns],
  )

  const selectionModal = useMemo(
    () => ({
      isOpen: selectionModalState?.isOpen ?? false,
      selectedCount: selectionModalState?.selectedCount ?? 0,
      totalCount: selectionModalState?.totalCount ?? 0,
    }),
    [selectionModalState],
  )

  return {
    exportData,
    isExporting,
    columnSelectionModal,
    closeColumnSelectionModal,
    handleColumnConfirm,
    selectionModal,
    closeSelectionModal,
    handleExportSelected,
    handleExportAll,
  }
}
