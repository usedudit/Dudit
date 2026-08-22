"use client"

import React, { useState, useEffect, useCallback } from "react"
import Portal from "@/components/Portal"
import { Button, Checkbox } from "@/components/reusable"
import { XIcon, PrinterIcon, DownloadIcon, FileTextIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import { downloadPdf } from "@/lib/pdf/download"
import { toast } from "@/hooks/use-notification"
import type { DreReportData, DreRegime } from "@/lib/services/dre.service"
import { DreA4Preview } from "./DreA4Preview"

export interface DrePrintModalProps {
  isOpen: boolean
  onClose: () => void
  partnerId: string
  storeId?: string
  report: DreReportData | null
  regime: DreRegime
  startDate: string
  endDate: string
  storeName: string
}

export function DrePrintModal({
  isOpen,
  onClose,
  partnerId,
  storeId,
  report,
  regime,
  startDate,
  endDate,
  storeName,
}: DrePrintModalProps) {
  const isMobile = useMediaQuery("(max-width: 1023px)")

  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  // Opções de visualização para impressão
  const [showSubItems, setShowSubItems] = useState(true)
  const [showComparison, setShowComparison] = useState(true)
  const [showKpiSummary, setShowKpiSummary] = useState(true)
  const [showSignatures, setShowSignatures] = useState(true)

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true)
      const id = setTimeout(() => setIsAnimating(true), 50)
      return () => clearTimeout(id)
    }
    setIsAnimating(false)
    const id = setTimeout(() => setIsVisible(false), 200)
    return () => clearTimeout(id)
  }, [isOpen])

  const handleDownloadPdf = useCallback(async () => {
    if (!partnerId || isDownloading) return
    setIsDownloading(true)
    const params = new URLSearchParams({
      partnerId,
      storeId: storeId || "",
      startDate,
      endDate,
      regime,
      showSubItems: String(showSubItems),
      showComparison: String(showComparison),
      showKpiSummary: String(showKpiSummary),
      showSignatures: String(showSignatures),
    })

    try {
      await downloadPdf(`/api/pdf/dre?${params.toString()}`, `DRE-${startDate}_a_${endDate}.pdf`)
      onClose()
    } catch (error: any) {
      console.error("[DrePrintModal] Error downloading PDF via Chromium:", error)
      toast.error("Erro ao gerar PDF", error?.message || "Não foi possível gerar o PDF.")
    } finally {
      setIsDownloading(false)
    }
  }, [partnerId, storeId, startDate, endDate, regime, showSubItems, showComparison, showKpiSummary, showSignatures, isDownloading, onClose])

  const handlePrint = useCallback(() => {
    if (!partnerId) return
    const params = new URLSearchParams({
      partnerId,
      storeId: storeId || "",
      startDate,
      endDate,
      regime,
      showSubItems: String(showSubItems),
      showComparison: String(showComparison),
      showKpiSummary: String(showKpiSummary),
      showSignatures: String(showSignatures),
    })

    if (isMobile) {
      handleDownloadPdf()
      return
    }

    window.open(`/print/dre?${params.toString()}`, "_blank")
    onClose()
  }, [partnerId, storeId, startDate, endDate, regime, showSubItems, showComparison, showKpiSummary, showSignatures, isMobile, handleDownloadPdf, onClose])

  if (!isVisible || !report) return null

  return (
    <Portal>
      <div className="fixed inset-0 z-[130] flex flex-col bg-black/60 backdrop-blur-xs">
        <div
          className={`relative flex flex-col w-full h-full bg-white dark:bg-dark-background transition-opacity duration-200 ${
            isAnimating ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* ── Header do Modal (Idêntico a QuotePrintModal e SaleReceiptPrintModal) ── */}
          <div className="shrink-0 flex items-center justify-between px-4 md:px-8 py-4 border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading">
                <FileTextIcon size={20} className="text-brand-dark dark:text-dark-heading" />
              </div>
              <div>
                <h2 className="text-lg md:text-xl font-bold text-brand-dark dark:text-dark-heading">
                  Imprimir DRE
                </h2>
                <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                  {report.companyInfo?.partnerName} • {startDate} até {endDate} • {regime === "competencia" ? "Competência" : "Caixa"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleDownloadPdf}
                disabled={isDownloading}
                leftIcon={<DownloadIcon size={18} />}
              >
                {isDownloading ? "Gerando PDF..." : "Baixar PDF"}
              </Button>

              <Button
                onClick={handlePrint}
                disabled={isDownloading}
                leftIcon={<PrinterIcon size={18} />}
              >
                Imprimir
              </Button>

              <Button
                variant="filled"
                onClick={onClose}
                className="w-10 h-10 p-0 flex items-center justify-center shrink-0"
              >
                <XIcon size={20} />
              </Button>
            </div>
          </div>

          {/* ── Corpo do Modal: Painel de Opções + Preview A4 ──────────────────── */}
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* Painel Esquerdo: Opções de Impressão */}
            <div className="w-full lg:w-72 shrink-0 p-6 border-b lg:border-b-0 lg:border-r border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface overflow-y-auto space-y-6">
              <div>
                <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-1">
                  Opções do Relatório
                </h3>
                <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                  Personalize as seções exibidas no PDF oficial gerado via Chromium.
                </p>
              </div>

              <div className="space-y-4 pt-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={showSubItems}
                    onCheckedChange={(checked) => setShowSubItems(Boolean(checked))}
                  />
                  <div className="select-none">
                    <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading block">
                      Subitens Detalhados
                    </span>
                    <span className="text-[11px] text-brand-inactive-text dark:text-dark-body block">
                      Exibe linhas analíticas de categorias e contas.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={showComparison}
                    onCheckedChange={(checked) => setShowComparison(Boolean(checked))}
                  />
                  <div className="select-none">
                    <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading block">
                      Comparativo Anterior
                    </span>
                    <span className="text-[11px] text-brand-inactive-text dark:text-dark-body block">
                      Inclui colunas de período anterior e variação %.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={showKpiSummary}
                    onCheckedChange={(checked) => setShowKpiSummary(Boolean(checked))}
                  />
                  <div className="select-none">
                    <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading block">
                      Resumo de Margens & KPIs
                    </span>
                    <span className="text-[11px] text-brand-inactive-text dark:text-dark-body block">
                      Exibe caixa com EBITDA e margens operacionais.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={showSignatures}
                    onCheckedChange={(checked) => setShowSignatures(Boolean(checked))}
                  />
                  <div className="select-none">
                    <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading block">
                      Assinaturas Contábeis
                    </span>
                    <span className="text-[11px] text-brand-inactive-text dark:text-dark-body block">
                      Campos de assinatura do administrador e contador.
                    </span>
                  </div>
                </label>
              </div>

              <div className="pt-4 border-t border-brand-border dark:border-dark-border space-y-2">
                <Button
                  onClick={handleDownloadPdf}
                  disabled={isDownloading}
                  variant="outline"
                  leftIcon={<DownloadIcon size={18} />}
                  className="w-full"
                >
                  {isDownloading ? "Gerando PDF..." : "Baixar PDF"}
                </Button>
                <Button
                  onClick={handlePrint}
                  disabled={isDownloading}
                  leftIcon={<PrinterIcon size={18} />}
                  className="w-full"
                >
                  Imprimir
                </Button>
              </div>
            </div>

            {/* Painel Direito: Preview da Folha A4 */}
            <div className="flex-1 h-full overflow-hidden relative">
              <DreA4Preview
                report={report}
                regime={regime}
                startDate={startDate}
                endDate={endDate}
                storeName={storeName}
                showSubItems={showSubItems}
                showComparison={showComparison}
                showKpiSummary={showKpiSummary}
                showSignatures={showSignatures}
              />
            </div>
          </div>
        </div>
      </div>
    </Portal>
  )
}
