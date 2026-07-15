"use client"

import { useCallback, useMemo, useState } from "react"
import { exportERPAction, type ExportERPInput } from "@/app/actions/erp/export"
import { useToast } from "@/hooks/use-toast"

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

export function useErpExport() {
  const { toast } = useToast()
  const [isExporting, setIsExporting] = useState(false)
  const [modalState, setModalState] = useState<{
    isOpen: boolean
    selectedCount: number
    totalCount: number
    selectedIds: string[]
    baseInput: ExportERPInput
  } | null>(null)

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
        setModalState({
          isOpen: true,
          selectedCount,
          totalCount,
          selectedIds: Array.from(selectedIds!),
          baseInput: input,
        })
      } else {
        void doExport(input)
      }
    },
    [doExport],
  )

  const closeModal = useCallback(() => {
    setModalState(null)
  }, [])

  const handleExportSelected = useCallback(() => {
    if (!modalState) return
    const { baseInput, selectedIds } = modalState
    void doExport({
      ...baseInput,
      filters: { ...baseInput.filters, selectedIds },
    })
  }, [modalState, doExport])

  const handleExportAll = useCallback(() => {
    if (!modalState) return
    void doExport(modalState.baseInput)
  }, [modalState, doExport])

  const selectionModal = useMemo(
    () => ({
      isOpen: modalState?.isOpen ?? false,
      selectedCount: modalState?.selectedCount ?? 0,
      totalCount: modalState?.totalCount ?? 0,
    }),
    [modalState],
  )

  return {
    exportData,
    isExporting,
    selectionModal,
    closeSelectionModal: closeModal,
    handleExportSelected,
    handleExportAll,
  }
}
