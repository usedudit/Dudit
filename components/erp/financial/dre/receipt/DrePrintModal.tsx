"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import Portal from "@/components/Portal"
import { Button, Checkbox } from "@/components/reusable"
import { XIcon, PrinterIcon, FileTextIcon } from "@/lib/icons"
import type { DreReportData, DreRegime } from "@/lib/services/dre.service"
import { DreA4Preview } from "./DreA4Preview"

export interface DrePrintModalProps {
  isOpen: boolean
  onClose: () => void
  report: DreReportData | null
  regime: DreRegime
  startDate: string
  endDate: string
  storeName: string
}

export function DrePrintModal({
  isOpen,
  onClose,
  report,
  regime,
  startDate,
  endDate,
  storeName,
}: DrePrintModalProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  // Opções de visualização para impressão
  const [showSubItems, setShowSubItems] = useState(true)
  const [showComparison, setShowComparison] = useState(true)
  const [showKpiSummary, setShowKpiSummary] = useState(true)
  const [showSignatures, setShowSignatures] = useState(true)

  const printIframeRef = useRef<HTMLIFrameElement>(null)

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

  const handlePrint = useCallback(() => {
    // Coleta os estilos da página atual para replicar com perfeição dentro do iframe
    const styleSheets = Array.from(document.querySelectorAll("link[rel='stylesheet'], style"))
      .map((el) => el.outerHTML)
      .join("\n")

    const printContainer = document.getElementById("dre-a4-preview-container")
    if (!printContainer) {
      window.print()
      return
    }

    const contentHtml = printContainer.innerHTML

    const iframe = printIframeRef.current
    if (!iframe) {
      window.print()
      return
    }

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
    if (!iframeDoc) {
      window.print()
      return
    }

    iframeDoc.open()
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>DRE - ${startDate} a ${endDate}</title>
          ${styleSheets}
          <style>
            @page {
              size: A4 portrait;
              margin: 8mm 0;
            }
            body {
              background: #ffffff !important;
              color: #113833 !important;
              margin: 0 !important;
              padding: 0 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .dre-a4-print {
              width: 100% !important;
              display: flex !important;
              justify-content: center !important;
            }
          </style>
        </head>
        <body>
          <div class="dre-a4-print">
            ${contentHtml}
          </div>
          <script>
            window.onload = function() {
              window.focus();
              window.print();
            };
          </script>
        </body>
      </html>
    `)
    iframeDoc.close()
  }, [startDate, endDate])

  if (!isVisible || !report) return null

  return (
    <Portal>
      <div className="fixed inset-0 z-[130] flex flex-col bg-black/60 backdrop-blur-xs">
        <div
          className={`relative flex flex-col w-full h-full bg-white dark:bg-dark-background transition-opacity duration-200 ${
            isAnimating ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* ── Header do Modal ──────────────────────────────────────────────── */}
          <div className="shrink-0 flex items-center justify-between px-4 md:px-8 py-4 border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading">
                <FileTextIcon size={20} className="text-brand-dark dark:text-dark-heading" />
              </div>
              <div>
                <h2 className="text-lg md:text-xl font-bold text-brand-dark dark:text-dark-heading">
                  Impressão & PDF da DRE (Padrão A4)
                </h2>
                <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                  {report.companyInfo?.partnerName} • {startDate} até {endDate} • {regime === "competencia" ? "Competência" : "Caixa"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handlePrint}
                leftIcon={<PrinterIcon size={18} />}
                className="font-bold"
              >
                Imprimir / Salvar PDF
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
                  Personalize o que será exibido no documento antes de imprimir ou salvar como PDF.
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
                      Exibe linhas analíticas de contas e categorias.
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

              <div className="pt-4 border-t border-brand-border dark:border-dark-border">
                <Button
                  onClick={handlePrint}
                  leftIcon={<PrinterIcon size={18} />}
                  className="w-full"
                >
                  Imprimir Agora
                </Button>
              </div>
            </div>

            {/* Painel Direito: Preview da Folha A4 */}
            <div className="flex-1 h-full overflow-hidden relative">
              <div id="dre-a4-preview-container" className="h-full">
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
      </div>

      {/* Iframe invisível para impressão isolada */}
      <iframe
        ref={printIframeRef}
        style={{ display: "none", position: "absolute", width: 0, height: 0, border: "none" }}
        title="DRE Print Frame"
      />
    </Portal>
  )
}
