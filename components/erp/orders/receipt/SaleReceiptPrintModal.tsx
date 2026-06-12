"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Portal from "@/components/Portal"
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, FormTextarea } from "@/components/reusable"
import { XIcon, PrinterIcon, DownloadIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import { useStore } from "@/lib/store-context"
import { useNotification } from "@/hooks/use-notification"
import { getPartnerReceiptHeaderAction } from "@/app/actions/erp/receipt"
import {
    DEFAULT_RECEIPT_FOOTER_MESSAGE,
    type SaleReceiptData,
    type SaleReceiptFormat,
} from "@/lib/sales/sale-receipt"
import { applyQuotePreviewTheme } from "@/lib/quotes/quote-preview-theme"
import SaleReceiptThermalPreview from "./SaleReceiptThermalPreview"
import SaleReceiptA4Preview from "./SaleReceiptA4Preview"
import { downloadPdf } from "@/lib/pdf/download"

export type SaleReceiptPrintModalProps = {
    isOpen: boolean
    onClose: () => void
    receiptData: SaleReceiptData | null
}

export default function SaleReceiptPrintModal({ isOpen, onClose, receiptData }: SaleReceiptPrintModalProps) {
    const isMobile = useMediaQuery("(max-width: 1023px)")
    const { selectedStore } = useStore()
    const { info: notifyInfo } = useNotification()
    const printRef = useRef<HTMLDivElement>(null)

    const [isVisible, setIsVisible] = useState(false)
    const [isAnimating, setIsAnimating] = useState(false)
    const [activeTab, setActiveTab] = useState("Opções")
    const [format, setFormat] = useState<SaleReceiptFormat>("thermal")
    const [footerMessage, setFooterMessage] = useState(DEFAULT_RECEIPT_FOOTER_MESSAGE)
    const [showAcknowledgment, setShowAcknowledgment] = useState(true)
    const [hydratedData, setHydratedData] = useState<SaleReceiptData | null>(null)

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true)
            const id = setTimeout(() => setIsAnimating(true), 50)
            setActiveTab("Opções")
            setFooterMessage(DEFAULT_RECEIPT_FOOTER_MESSAGE)
            setShowAcknowledgment(true)
            return () => clearTimeout(id)
        }
        setIsAnimating(false)
        const id = setTimeout(() => setIsVisible(false), 200)
        return () => clearTimeout(id)
    }, [isOpen])

    useEffect(() => {
        if (!isOpen || !receiptData) {
            setHydratedData(null)
            return
        }

        let cancelled = false
        const partnerId = selectedStore?.partner_id
        const withTheme = applyQuotePreviewTheme(receiptData)

        if (!partnerId) {
            setHydratedData(withTheme)
            return
        }

        getPartnerReceiptHeaderAction(partnerId).then((res) => {
            if (cancelled) return
            if (res.success && res.data) {
                setHydratedData(
                    applyQuotePreviewTheme({
                        ...receiptData,
                        partner: res.data,
                        partnerAvatar: receiptData.partnerAvatar || selectedStore?.image_url || undefined,
                    }),
                )
            } else {
                setHydratedData(withTheme)
            }
        })

        return () => {
            cancelled = true
        }
    }, [isOpen, receiptData, selectedStore?.partner_id, selectedStore?.image_url])

    const data = hydratedData

    const handlePrint = useCallback(() => {
        if (!data) return
        window.print()
    }, [data])

    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

    const handleDownloadPdf = useCallback(async () => {
        if (!receiptData) return
        if (isGeneratingPdf) return

        setIsGeneratingPdf(true)
        notifyInfo("Gerando PDF", "Aguarde enquanto geramos o documento...")

        try {
            const queryParams = new URLSearchParams({
                format,
                footerMessage,
                showAcknowledgment: String(showAcknowledgment)
            })

            await downloadPdf(
                `/api/pdf/recibo/${receiptData.orderNumber}?${queryParams.toString()}`,
                `recibo-${receiptData.orderNumber}.pdf`
            )
            notifyInfo("Sucesso", "O PDF foi baixado com sucesso!")
        } catch (error: any) {
            console.error(error)
            notifyInfo("Erro", error.message || "Não foi possível gerar o PDF. Tente novamente.")
        } finally {
            setIsGeneratingPdf(false)
        }
    }, [receiptData, format, footerMessage, showAcknowledgment, notifyInfo, isGeneratingPdf])

    const formatOptions = useMemo(
        () => [
            { id: "thermal" as const, label: "Impressora térmica" },
            { id: "a4" as const, label: "A4 (PDF)" },
        ],
        [],
    )

    if (!isVisible) return null

    return (
        <Portal>
            <style
                dangerouslySetInnerHTML={{
                    __html: `@media print {
                        body * { visibility: hidden !important; }
                        #sale-receipt-print-root, #sale-receipt-print-root * { visibility: visible !important; }
                        #sale-receipt-print-root {
                            position: absolute !important; left: 0 !important; top: 0 !important;
                            width: 100% !important; background: white !important; padding: 0 !important; margin: 0 !important;
                        }
                        .sale-receipt-no-print { display: none !important; }
                        .sale-receipt-thermal-print { width: 80mm !important; max-width: 80mm !important; box-shadow: none !important; }
                    }`,
                }}
            />

            <div className="sale-receipt-no-print fixed inset-0 z-[130] flex flex-col bg-black/60">
                <div
                    className={`relative flex flex-col w-full h-full bg-white dark:bg-dark-background transition-opacity duration-200 ${isAnimating ? "opacity-100" : "opacity-0"
                        }`}
                >
                    {/* Header */}
                    <div className="shrink-0 flex items-center justify-between px-4 md:px-6 py-4 border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                        <h2 className="text-lg md:text-xl font-bold text-brand-dark dark:text-dark-heading">
                            Imprimir recibo
                        </h2>
                        <Button
                            variant="filled"
                            onClick={onClose}
                            className="w-10 h-10 p-0 flex items-center justify-center shrink-0"
                        >
                            <XIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                        </Button>
                    </div>

                    {!data ? (
                        <div className="flex-1 flex items-center justify-center text-brand-inactive-text">
                            Carregando recibo...
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

                            {/* Left — options */}
                            <div
                                className={`w-full lg:w-1/2 flex flex-col border-r border-brand-border dark:border-dark-border overflow-hidden ${activeTab === "Visualização" ? "hidden lg:flex" : "flex"
                                    }`}
                            >
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-6">
                                    <div>
                                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">
                                            Formato de impressão
                                        </p>
                                        <div className="grid grid-cols-2 gap-3">
                                            {formatOptions.map((opt) => (
                                                <button
                                                    key={opt.id}
                                                    type="button"
                                                    onClick={() => setFormat(opt.id)}
                                                    className={`h-12 rounded-xl border text-sm font-bold transition-colors ${format === opt.id
                                                        ? "border-brand-dark dark:border-dark-heading bg-brand-dark dark:bg-dark-heading text-white"
                                                        : "border-brand-border dark:border-dark-border text-brand-dark dark:text-dark-heading hover:bg-brand-gray dark:hover:bg-dark-border/30"
                                                        }`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={showAcknowledgment}
                                                onChange={(e) => setShowAcknowledgment(e.target.checked)}
                                                className="w-4 h-4 rounded border-brand-border"
                                            />
                                            <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                                                Incluir confirmação de recebimento e assinatura
                                            </span>
                                        </label>
                                    </div>

                                    <FormTextarea
                                        name="receiptFooterMessage"
                                        label="Mensagem final do recibo"
                                        value={footerMessage}
                                        onChange={(e) => setFooterMessage(e.target.value)}
                                        rows={2}
                                        placeholder={DEFAULT_RECEIPT_FOOTER_MESSAGE}
                                    />

                                    <div className="hidden lg:flex gap-3 pt-2">
                                        <Button className="flex-1 h-12" onClick={handlePrint} disabled={isGeneratingPdf} leftIcon={<PrinterIcon size={18} />}>
                                            Imprimir
                                        </Button>
                                        <Button variant="outline" className="flex-1 h-12" onClick={handleDownloadPdf} isLoading={isGeneratingPdf} leftIcon={<DownloadIcon size={18} />}>
                                            {format === "a4" ? "Salvar PDF" : "Imprimir"}
                                        </Button>
                                    </div>
                                </div>

                                {/* Mobile footer actions */}
                                <div className="lg:hidden shrink-0 p-4 border-t border-brand-border dark:border-dark-border flex gap-3">
                                    <Button className="flex-1 h-12" onClick={handlePrint} disabled={isGeneratingPdf} leftIcon={<PrinterIcon size={18} />}>
                                        Imprimir
                                    </Button>
                                    <Button variant="outline" className="flex-1 h-12" onClick={handleDownloadPdf} isLoading={isGeneratingPdf} leftIcon={<DownloadIcon size={18} />}>
                                        PDF
                                    </Button>
                                </div>
                            </div>

                            {/* Right — preview */}
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
                                        <PreviewPane
                                            format={format}
                                            data={data}
                                            footerMessage={footerMessage}
                                            showAcknowledgment={showAcknowledgment}
                                        />
                                    </div>
                                </TabsContent>
                            </div>
                        </Tabs>
                    )}
                </div>
            </div>

            {/* Print-only layer */}
            {data && (
                <div id="sale-receipt-print-root" ref={printRef} className="hidden print:block">
                    {format === "thermal" ? (
                        <SaleReceiptThermalPreview
                            data={data}
                            footerMessage={footerMessage}
                            showAcknowledgment={showAcknowledgment}
                            printMode
                        />
                    ) : (
                        <SaleReceiptA4Preview
                            data={data}
                            footerMessage={footerMessage}
                            showAcknowledgment={showAcknowledgment}
                            printMode
                        />
                    )}
                </div>
            )}
        </Portal>
    )
}

function PreviewPane({
    format,
    data,
    footerMessage,
    showAcknowledgment,
}: {
    format: SaleReceiptFormat
    data: SaleReceiptData
    footerMessage: string
    showAcknowledgment: boolean
}) {
    if (format === "thermal") {
        return (
            <SaleReceiptThermalPreview
                data={data}
                footerMessage={footerMessage}
                showAcknowledgment={showAcknowledgment}
            />
        )
    }
    return (
        <div className="w-full h-full min-h-[400px]">
            <SaleReceiptA4Preview data={data} footerMessage={footerMessage} showAcknowledgment={showAcknowledgment} />
        </div>
    )
}
