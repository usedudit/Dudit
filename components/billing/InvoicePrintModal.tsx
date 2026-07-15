"use client"
import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/reusable"
import { PrinterIcon, DownloadIcon, EyeIcon } from "@/lib/icons"
import { Loader2 } from "lucide-react"
import { InvoicePreview } from "./InvoicePreview"
import type { InvoiceData } from "@/lib/billing/types"

interface InvoicePrintModalProps {
    isOpen: boolean
    onClose: () => void
    invoiceData: InvoiceData | null
    invoiceId: string
}

export function InvoicePrintModal({ isOpen, onClose, invoiceData, invoiceId }: InvoicePrintModalProps) {
    const [loading, setLoading] = useState(false)
    const isMobile = useMediaQuery("(max-width: 1023px)")

    const handlePrint = useCallback(async () => {
        if (isMobile) {
            try {
                await downloadPdf(`/api/pdf/invoice/${invoiceId}`, `fatura-${invoiceId}.pdf`)
            } catch {
                window.open(`/print/invoice/${invoiceId}`, "_blank")
            }
        } else {
            window.open(`/print/invoice/${invoiceId}`, "_blank")
        }
    }, [invoiceId, isMobile])

    const handleDownloadPdf = useCallback(async () => {
        setLoading(true)
        try {
            await downloadPdf(`/api/pdf/invoice/${invoiceId}`, `fatura-${invoiceId}.pdf`)
        } catch (err: any) {
            console.error("PDF download error:", err)
        } finally {
            setLoading(false)
        }
    }, [invoiceId])

    useEffect(() => {
        if (!isOpen) return
    }, [isOpen])

    if (!isOpen || !invoiceData) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />
            <div className="relative bg-white dark:bg-dark-surface rounded-2xl w-full max-w-[900px] max-h-[90vh] flex flex-col shadow-2xl">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-dark-heading">Fatura {invoiceData.invoice_number}</h2>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" leftIcon={<PrinterIcon />} onClick={handlePrint}>
                            Imprimir
                        </Button>
                        <Button
                            variant="default"
                            size="sm"
                            leftIcon={loading ? <Loader2 className="animate-spin" /> : <DownloadIcon />}
                            onClick={handleDownloadPdf}
                            disabled={loading}
                        >
                            {loading ? "Gerando..." : "Salvar PDF"}
                        </Button>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-dark-border rounded-full">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                    <InvoicePreview data={invoiceData} />
                </div>
            </div>
        </div>
    )
}

async function downloadPdf(apiPath: string, filename: string): Promise<void> {
    const response = await fetch(apiPath)
    if (!response.ok) {
        let errorMessage = "Erro ao gerar PDF"
        try {
            const errorJson = await response.json()
            errorMessage = errorJson.error || errorJson.details || errorMessage
        } catch { }
        throw new Error(errorMessage)
    }
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
}

function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(false)
    useEffect(() => {
        const mql = window.matchMedia(query)
        setMatches(mql.matches)
        const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
        mql.addEventListener("change", handler)
        return () => mql.removeEventListener("change", handler)
    }, [query])
    return matches
}
