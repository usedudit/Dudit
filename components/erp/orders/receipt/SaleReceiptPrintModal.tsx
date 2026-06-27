"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Portal from "@/components/Portal"
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, FormTextarea } from "@/components/reusable"
import { XIcon, PrinterIcon, DownloadIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import { useStore } from "@/lib/store-context"
import { getOrderDetailsAction } from "@/app/actions/erp/orders"
import { getPartnerReceiptHeaderAction } from "@/app/actions/erp/receipt"
import {
    DEFAULT_RECEIPT_FOOTER_MESSAGE,
    type SaleReceiptData,
    type SaleReceiptFormat,
    buildSaleReceiptFromOrder,
} from "@/lib/sales/sale-receipt"
import { applyQuotePreviewTheme } from "@/lib/quotes/quote-preview-theme"
import { downloadPdf } from "@/lib/pdf/download"
import SaleReceiptThermalPreview from "./SaleReceiptThermalPreview"
import SaleReceiptA4Preview from "./SaleReceiptA4Preview"

export type SaleReceiptPrintModalProps = {
    isOpen: boolean
    onClose: () => void
    orderId: string
}

export default function SaleReceiptPrintModal({ isOpen, onClose, orderId }: SaleReceiptPrintModalProps) {
    const isMobile = useMediaQuery("(max-width: 1023px)")
    const { selectedStore } = useStore()

    const [isVisible, setIsVisible] = useState(false)
    const [isAnimating, setIsAnimating] = useState(false)
    const [activeTab, setActiveTab] = useState("Opções")
    const [format, setFormat] = useState<SaleReceiptFormat>("thermal")
    const [footerMessage, setFooterMessage] = useState(DEFAULT_RECEIPT_FOOTER_MESSAGE)
    const [showAcknowledgment, setShowAcknowledgment] = useState(true)
    const [data, setData] = useState<SaleReceiptData | null>(null)
    const [loading, setLoading] = useState(false)

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
        if (!isOpen || !orderId) {
            setData(null)
            return
        }

        let cancelled = false

        async function load() {
            setLoading(true)
            const partnerId = selectedStore?.partner_id
            if (!partnerId) {
                setLoading(false)
                return
            }

            const [orderRes, headerRes] = await Promise.all([
                getOrderDetailsAction(orderId, partnerId),
                getPartnerReceiptHeaderAction(partnerId),
            ])

            if (cancelled) return

            if (!orderRes.success || !orderRes.data) {
                setLoading(false)
                return
            }

            const partnerHeader = headerRes.success && headerRes.data ? headerRes.data : {
                fantasyName: "",
                legalName: "",
                addressLine: "",
                taxIdLine: "",
            }

            const partnerAvatar = selectedStore?.image_url || undefined
            const order = orderRes.data

            const receiptData = buildSaleReceiptFromOrder(order, partnerHeader, {
                partnerAvatar: partnerAvatar ? (partnerAvatar.startsWith("http") ? partnerAvatar : undefined) : undefined,
                sellerName: order.seller_name || undefined,
                primaryColor: order.primary_color || undefined,
                secondaryColor: order.secondary_color || undefined,
            })

            setData(applyQuotePreviewTheme(receiptData))
            setLoading(false)
        }

        load()
        return () => { cancelled = true }
    }, [isOpen, orderId, selectedStore?.partner_id, selectedStore?.image_url])

    const handlePrint = useCallback(() => {
        if (!orderId) return
        const params = new URLSearchParams({
            format,
            footerMessage,
            showAcknowledgment: String(showAcknowledgment),
        })
        if (isMobile) {
            downloadPdf(`/api/pdf/recibo/${orderId}?${params.toString()}`, `recibo-${orderId}.pdf`)
                .catch(() => window.open(`/print/recibo/${orderId}?${params.toString()}`, "_blank"))
            onClose()
            return
        }
        window.open(`/print/recibo/${orderId}?${params.toString()}`, "_blank")
        onClose()
    }, [orderId, format, footerMessage, showAcknowledgment, onClose, isMobile])

    const handleDownloadPdf = useCallback(() => {
        if (!orderId) return
        const params = new URLSearchParams({
            format,
            footerMessage,
            showAcknowledgment: String(showAcknowledgment),
        })
        downloadPdf(`/api/pdf/recibo/${orderId}?${params.toString()}`, `recibo-${orderId}.pdf`)
            .catch(() => {
                window.open(`/print/recibo/${orderId}?${params.toString()}`, "_blank")
            })
        onClose()
    }, [orderId, format, footerMessage, showAcknowledgment, onClose])

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
            <div className="fixed inset-0 z-[130] flex flex-col bg-black/60">
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

                    {loading ? (
                        <div className="flex-1 flex items-center justify-center text-brand-inactive-text">
                            Carregando recibo...
                        </div>
                    ) : !data ? (
                        <div className="flex-1 flex items-center justify-center text-brand-red font-bold">
                            Não foi possível carregar o recibo.
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
                                        <Button className="flex-1 h-12" onClick={handlePrint} leftIcon={<PrinterIcon size={18} />}>
                                            Imprimir
                                        </Button>
                                        <Button variant="outline" className="flex-1 h-12" onClick={handleDownloadPdf} leftIcon={<DownloadIcon size={18} />}>
                                            {format === "a4" ? "Salvar PDF" : "Salvar PDF"}
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
