"use client"

import { useCallback, useEffect, useState } from "react"
import Portal from "@/components/Portal"
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/reusable"
import { XIcon, PrinterIcon, DownloadIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import { downloadPdf } from "@/lib/pdf/download"
import { toast } from "@/hooks/use-notification"
import { InvoicePreview } from "./InvoicePreview"
import type { InvoiceData } from "@/lib/billing/types"

export type InvoicePrintModalProps = {
    isOpen: boolean
    onClose: () => void
    invoiceData: InvoiceData | null
    invoiceId: string
}

export function InvoicePrintModal({ isOpen, onClose, invoiceData, invoiceId }: InvoicePrintModalProps) {
    const isMobile = useMediaQuery("(max-width: 1023px)")

    const [isVisible, setIsVisible] = useState(false)
    const [isAnimating, setIsAnimating] = useState(false)
    const [activeTab, setActiveTab] = useState("Visualização")
    const [isDownloading, setIsDownloading] = useState(false)

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
        if (!invoiceId) return
        if (isMobile) {
            handleDownloadPdf()
            return
        }
        window.open(`/print/invoice/${invoiceId}`, "_blank")
        onClose()
    }, [invoiceId, onClose, isMobile])

    const handleDownloadPdf = useCallback(async () => {
        if (!invoiceId || isDownloading) return
        setIsDownloading(true)
        try {
            await downloadPdf(`/api/pdf/invoice/${invoiceId}`, `fatura-${invoiceData?.invoice_number || invoiceId}.pdf`)
            onClose()
        } catch (error: any) {
            console.error("[InvoicePrintModal] Error downloading PDF:", error)
            toast.error("Erro ao gerar PDF", error?.message || "Não foi possível gerar o PDF. Tente novamente.")
        } finally {
            setIsDownloading(false)
        }
    }, [invoiceId, isDownloading, onClose, invoiceData])

    if (!isVisible) return null

    return (
        <Portal>
            <div className="fixed inset-0 z-[130] flex flex-col bg-black/60">
                <div
                    className={`relative flex flex-col w-full h-full bg-white dark:bg-dark-background transition-opacity duration-200 ${isAnimating ? "opacity-100" : "opacity-0"
                        }`}
                >
                    {/* Header */}
                    <div className="shrink-0 flex items-center justify-between px-4 md:px-6 py-4 border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                        <h2 className="text-lg md:text-xl font-bold text-brand-dark dark:text-dark-heading">
                            {invoiceId ? `Fatura #${invoiceId.slice(0, 6)}` : "Imprimir fatura"}
                        </h2>
                        <Button
                            variant="filled"
                            onClick={onClose}
                            className="w-10 h-10 p-0 flex items-center justify-center shrink-0"
                        >
                            <XIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                        </Button>
                    </div>

                    {!invoiceData ? (
                        <div className="flex-1 flex items-center justify-center text-brand-red font-bold">
                            Não foi possível carregar a fatura.
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
                                        <TabsTrigger value="Visualização">Visualização</TabsTrigger>
                                    </TabsList>
                                </div>
                            )}

                            {/* Left - options */}
                            <div
                                className={`w-full lg:w-1/2 flex flex-col border-r border-brand-border dark:border-dark-border overflow-hidden ${activeTab === "Visualização" ? "hidden lg:flex" : "flex"
                                    }`}
                            >
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-6">
                                    <p className="text-sm text-brand-inactive-text">
                                        Visualize e imprima a fatura em formato A4.
                                    </p>

                                    <div className="hidden lg:flex gap-3 pt-2">
                                        <Button className="flex-1 h-12" onClick={handlePrint} leftIcon={<PrinterIcon size={18} />}>
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

                                {/* Mobile footer actions */}
                                <div className="lg:hidden shrink-0 p-4 border-t border-brand-border dark:border-dark-border flex gap-3">
                                    <Button className="flex-1 h-12" onClick={handlePrint} leftIcon={<PrinterIcon size={18} />}>
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

                            {/* Right - preview */}
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
                                        <div className="w-full h-full min-h-[400px]">
                                            <InvoicePreview data={invoiceData} invoiceId={invoiceId} />
                                        </div>
                                    </div>
                                </TabsContent>
                            </div>
                        </Tabs>
                    )}
                </div>
            </div>
        </Portal>
    )
}
