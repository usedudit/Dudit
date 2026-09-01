"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Portal from "@/components/Portal"
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, ListItem } from "@/components/reusable"
import { Switch } from "@/components/reusable/Switch"
import { XIcon, PrinterIcon, DownloadIcon, FileTextIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import { downloadPdf } from "@/lib/pdf/download"
import { toast } from "@/hooks/use-notification"
import { formatDateToBR } from "@/lib/utils"
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

  const [activeTab, setActiveTab] = useState("Opções")
  const [isDownloading, setIsDownloading] = useState(false)

  // Opções de visualização da DRE
  const [showSubItems, setShowSubItems] = useState(true)
  const [showComparison, setShowComparison] = useState(true)
  const [showKpiSummary, setShowKpiSummary] = useState(true)
  const [showSignatures, setShowSignatures] = useState(true)

  useEffect(() => {
    if (isOpen) {
      setActiveTab("Opções")
    }
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
      await downloadPdf(
        `/api/pdf/dre?${params.toString()}`,
        `DRE-${formatDateToBR(startDate)}_a_${formatDateToBR(endDate)}.pdf`
      )
      onClose()
    } catch (error: any) {
      console.error("[DrePrintModal] Error downloading PDF:", error)
      toast.error("Erro ao gerar PDF", error?.message || "Não foi possível gerar o PDF. Tente novamente.")
    } finally {
      setIsDownloading(false)
    }
  }, [
    partnerId,
    storeId,
    startDate,
    endDate,
    regime,
    showSubItems,
    showComparison,
    showKpiSummary,
    showSignatures,
    isDownloading,
    onClose,
  ])

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
  }, [
    partnerId,
    storeId,
    startDate,
    endDate,
    regime,
    showSubItems,
    showComparison,
    showKpiSummary,
    showSignatures,
    isMobile,
    handleDownloadPdf,
    onClose,
  ])

  if (!report && isOpen) return null

  return (
    <Portal>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-[130] flex flex-col bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="relative flex flex-col w-full h-full bg-white dark:bg-dark-background">
          {/* Header oficial Dudit */}
          <div className="shrink-0 flex items-center justify-between px-4 md:px-6 py-4 border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
            <h2 className="text-lg md:text-xl font-bold text-brand-dark dark:text-dark-heading">
              Imprimir DRE
            </h2>
            <Button
              variant="filled"
              onClick={onClose}
              className="w-10 h-10 p-0 flex items-center justify-center shrink-0"
            >
              <XIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
            </Button>
          </div>

          {!report ? (
            <div className="flex-1 flex items-center justify-center text-brand-red font-bold">
              Não foi possível carregar a demonstração contábil.
            </div>
          ) : (
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0"
            >
              {isMobile && (
                <div className="shrink-0 px-4 pt-3 border-b border-brand-border dark:border-dark-border lg:hidden">
                  <TabsList className="bg-transparent p-0 gap-4 w-full justify-start border-b-0">
                    <TabsTrigger value="Opções">Opções</TabsTrigger>
                    <TabsTrigger value="Visualização">Visualização</TabsTrigger>
                  </TabsList>
                </div>
              )}

              {/* Left - options (idêntico ao SaleReceiptPrintModal) */}
              <div
                className={`w-full lg:w-1/2 flex flex-col border-r border-brand-border dark:border-dark-border overflow-hidden ${activeTab === "Visualização" ? "hidden lg:flex" : "flex"
                  }`}
              >
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-6">
                  <div>
                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">
                      Opções do relatório
                    </p>
                    <div className="space-y-3">
                      <ListItem
                        icon={FileTextIcon}
                        title="Subitens detalhados"
                        description="Exibe linhas analíticas de contas, produtos, categorias e custos."
                        onClick={() => setShowSubItems(!showSubItems)}
                        right={
                          <Switch
                            checked={showSubItems}
                            onCheckedChange={(checked: boolean) => setShowSubItems(checked)}
                          />
                        }
                      />
                      <ListItem
                        icon={FileTextIcon}
                        title="Comparativo de período"
                        description="Inclui colunas com o período anterior e variação percentual (AH %)."
                        onClick={() => setShowComparison(!showComparison)}
                        right={
                          <Switch
                            checked={showComparison}
                            onCheckedChange={(checked: boolean) => setShowComparison(checked)}
                          />
                        }
                      />
                      <ListItem
                        icon={FileTextIcon}
                        title="Resumo de margens & KPIs"
                        description="Exibe caixa consolidado com Margem Bruta, Margem EBITDA e Margem Líquida."
                        onClick={() => setShowKpiSummary(!showKpiSummary)}
                        right={
                          <Switch
                            checked={showKpiSummary}
                            onCheckedChange={(checked: boolean) => setShowKpiSummary(checked)}
                          />
                        }
                      />
                      <ListItem
                        icon={FileTextIcon}
                        title="Assinaturas contábeis"
                        description="Campos de assinatura formal do administrador e do contador responsável."
                        onClick={() => setShowSignatures(!showSignatures)}
                        right={
                          <Switch
                            checked={showSignatures}
                            onCheckedChange={(checked: boolean) => setShowSignatures(checked)}
                          />
                        }
                      />
                    </div>
                  </div>

                  {/* Botões Desktop */}
                  <div className="hidden lg:flex gap-3 pt-2">
                    <Button
                      className="flex-1 h-12"
                      onClick={handlePrint}
                      leftIcon={<PrinterIcon size={18} />}
                    >
                      Imprimir
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 h-12"
                      onClick={handleDownloadPdf}
                      disabled={isDownloading}
                      leftIcon={<DownloadIcon size={18} />}
                    >
                      {isDownloading ? "Gerando PDF..." : "Salvar PDF"}
                    </Button>
                  </div>
                </div>

                {/* Botões Mobile */}
                <div className="lg:hidden shrink-0 p-4 border-t border-brand-border dark:border-dark-border flex gap-3">
                  <Button
                    className="flex-1 h-12"
                    onClick={handlePrint}
                    leftIcon={<PrinterIcon size={18} />}
                  >
                    Imprimir
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 h-12"
                    onClick={handleDownloadPdf}
                    disabled={isDownloading}
                    leftIcon={<DownloadIcon size={18} />}
                  >
                    {isDownloading ? "Gerando..." : "PDF"}
                  </Button>
                </div>
              </div>

              {/* Right - preview (idêntico ao SaleReceiptPrintModal) */}
              <div
                className={`w-full lg:w-1/2 bg-brand-gray dark:bg-dark-border/20 flex flex-col min-h-0 overflow-hidden ${activeTab === "Visualização" ? "flex flex-1" : "hidden lg:flex"
                  }`}
              >
                <TabsContent
                  value="Visualização"
                  className="m-0 p-0 h-full flex flex-col flex-1 min-h-0 focus-visible:outline-none"
                  forceMount
                >
                  <div className="flex-1 overflow-auto custom-scrollbar p-4 md:p-6 flex justify-center items-start">
                    <div className="w-[210mm] h-[297mm] shrink-0">
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
                </TabsContent>
              </div>
            </Tabs>
          )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  )
}
