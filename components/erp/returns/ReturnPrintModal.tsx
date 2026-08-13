"use client"

import { useCallback, useEffect, useState } from "react"
import Portal from "@/components/Portal"
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/reusable"
import { XIcon, PrinterIcon, DownloadIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import { useStore } from "@/lib/store-context"
import { getReturnRequestDetailsAction } from "@/app/actions/erp/returns"
import { getPartnerReceiptHeaderAction } from "@/app/actions/erp/receipt"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { downloadPdf } from "@/lib/pdf/download"
import type { SaleReceiptPartnerHeader } from "@/lib/sales/sale-receipt"
import ReturnReceiptThermalPreview from "./ReturnReceiptThermalPreview"
import ReturnReceiptA4Preview from "./ReturnReceiptA4Preview"

type Format = "thermal" | "a4"

export type ReturnPrintModalProps = {
    isOpen: boolean
    onClose: () => void
    returnId: string
    partnerId: string
    storeId?: string
}

export default function ReturnPrintModal({ isOpen, onClose, returnId, partnerId, storeId }: ReturnPrintModalProps) {
    const isMobile = useMediaQuery("(max-width: 1023px)")
    const { selectedStore } = useStore()

    const [isVisible, setIsVisible] = useState(false)
    const [isAnimating, setIsAnimating] = useState(false)
    const [activeTab, setActiveTab] = useState("Opções")
    const [format, setFormat] = useState<Format>("thermal")
    const [returnRequest, setReturnRequest] = useState<any>(null)
    const [partnerHeader, setPartnerHeader] = useState<SaleReceiptPartnerHeader>({
        fantasyName: "",
        legalName: "",
        addressLine: "",
        taxIdLine: "",
        phone: "",
    })
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true)
            const id = setTimeout(() => setIsAnimating(true), 50)
            setActiveTab("Opções")
            return () => clearTimeout(id)
        }
        setIsAnimating(false)
        const id = setTimeout(() => setIsVisible(false), 200)
        return () => clearTimeout(id)
    }, [isOpen])

    useEffect(() => {
        if (!isOpen || !returnId || !partnerId) {
            setReturnRequest(null)
            return
        }

        let cancelled = false

        async function load() {
            setLoading(true)
            const [returnRes, headerRes] = await Promise.all([
                getReturnRequestDetailsAction(partnerId, returnId),
                getPartnerReceiptHeaderAction(partnerId, storeId),
            ])
            if (cancelled) return

            if (returnRes.success && returnRes.data) {
                setReturnRequest(returnRes.data)
            }
            if (headerRes.success && headerRes.data) {
                setPartnerHeader(headerRes.data)
            }
            setLoading(false)
        }

        load()
        return () => { cancelled = true }
    }, [isOpen, returnId, partnerId, storeId])

    const handlePrint = useCallback(() => {
        if (!returnId) return
        const params = new URLSearchParams({ format })
        if (isMobile) {
            downloadPdf(`/api/pdf/troca/${returnId}?${params.toString()}`, `troca-${returnId}.pdf`)
                .catch(() => window.open(`/print/troca/${returnId}?${params.toString()}`, "_blank"))
            onClose()
            return
        }
        window.open(`/print/troca/${returnId}?${params.toString()}`, "_blank")
        onClose()
    }, [returnId, format, onClose, isMobile])

    const handleDownloadPdf = useCallback(() => {
        if (!returnId) return
        const params = new URLSearchParams({ format })
        downloadPdf(`/api/pdf/troca/${returnId}?${params.toString()}`, `troca-${returnId}.pdf`)
            .catch(() => {
                window.open(`/print/troca/${returnId}?${params.toString()}`, "_blank")
            })
        onClose()
    }, [returnId, format, onClose])

    const partnerName = selectedStore?.name || partnerHeader.fantasyName || "Estabelecimento"
    const partnerAvatar = selectedStore?.logo_url || selectedStore?.image_url
        ? getR2ImageUrl(selectedStore?.logo_url || selectedStore?.image_url)
        : undefined

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
                            Imprimir comprovante
                        </h2>
                        <Button
                            variant="filled"
                            onClick={onClose}
                            className="w-10 h-10 p-0 flex items-center justify-center shrink-0"
                        >
                            <XIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                        </Button>
                    </div>

                    {loading ? (
                        <div className="flex-1 flex items-center justify-center text-brand-inactive-text">
                            Carregando comprovante...
                        </div>
                    ) : !returnRequest ? (
                        <div className="flex-1 flex items-center justify-center text-brand-red font-bold">
                            Não foi possível carregar o comprovante.
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

                            {/* Left - options */}
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
                                            {([
                                                { id: "thermal", label: "Cupom (Impressora térmica)" },
                                                { id: "a4", label: "A4 (PDF)" },
                                            ] as Array<{ id: Format; label: string }>).map((opt) => (
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

                                    <div className="hidden lg:flex gap-3 pt-2">
                                        <Button className="flex-1 h-12" onClick={handlePrint} leftIcon={<PrinterIcon size={18} />}>
                                            Imprimir
                                        </Button>
                                        <Button variant="outline" className="flex-1 h-12" onClick={handleDownloadPdf} leftIcon={<DownloadIcon size={18} />}>
                                            Salvar PDF
                                        </Button>
                                    </div>
                                </div>

                                {/* Mobile footer actions */}
                                <div className="lg:hidden shrink-0 p-4 border-t border-brand-border dark:border-dark-border flex gap-3">
                                    <Button className="flex-1 h-12" onClick={handlePrint} leftIcon={<PrinterIcon size={18} />}>
                                        Imprimir
                                    </Button>
                                    <Button variant="outline" className="flex-1 h-12" onClick={handleDownloadPdf} leftIcon={<DownloadIcon size={18} />}>
                                        PDF
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
                                        {format === "thermal" ? (
                                            <ReturnReceiptThermalPreview
                                                returnRequest={returnRequest}
                                                partnerHeader={partnerHeader}
                                                partnerName={partnerName}
                                            />
                                        ) : (
                                            <div className="w-full h-full min-h-[400px]">
                                                <ReturnReceiptA4Preview
                                                    returnRequest={returnRequest}
                                                    partnerHeader={partnerHeader}
                                                    partnerName={partnerName}
                                                    partnerAvatar={partnerAvatar}
                                                />
                                            </div>
                                        )}
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