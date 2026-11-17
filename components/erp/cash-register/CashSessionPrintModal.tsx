"use client"

import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Portal from "@/components/Portal"
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, ListItem, RadioButton } from "@/components/reusable"
import { XIcon, PrinterIcon, DownloadIcon, FileTextIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import { useModalLayer } from "@/lib/modal-stack"
import { useStore } from "@/lib/store-context"
import { getCashSessionDetailsAction } from "@/app/actions/erp/cash-register"
import { getPartnerReceiptHeaderAction } from "@/app/actions/erp/receipt"
import type { SaleReceiptPartnerHeader, SaleReceiptFormat } from "@/lib/sales/sale-receipt"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { downloadPdf } from "@/lib/pdf/download"
import { toast } from "@/hooks/use-notification"
import CashSessionCouponPreview from "./CashSessionCouponPreview"
import {
    buildCashSessionCouponData,
    type CashSessionCouponData,
} from "@/lib/cash-register/cash-session-coupon"
import CashSessionA4Preview from "./CashSessionA4Preview"

export type CashSessionPrintModalProps = {
    isOpen: boolean
    onClose: () => void
    sessionId: string
    partnerId: string
}

type CashSessionPrintPayload = {
    data: CashSessionCouponData
    partnerHeader: SaleReceiptPartnerHeader
    partnerAvatar?: string
    couponType: "opening" | "closing"
}

export default function CashSessionPrintModal({ isOpen, onClose, sessionId, partnerId }: CashSessionPrintModalProps) {
    const isMobile = useMediaQuery("(max-width: 1023px)")
    const { selectedStore } = useStore()

    // z-index dinâmico: este modal abre acima de tudo que já estava aberto.
    const zIndex = useModalLayer(isOpen)

    const [activeTab, setActiveTab] = useState("Opções")
    const [format, setFormat] = useState<SaleReceiptFormat>("thermal")
    const [data, setData] = useState<CashSessionPrintPayload | null>(null)
    const [loading, setLoading] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setActiveTab("Opções")
        }
    }, [isOpen])

    useEffect(() => {
        if (!isOpen || !sessionId || !partnerId) {
            setData(null)
            return
        }

        let cancelled = false

        async function load() {
            setLoading(true)

            const detailsRes = await getCashSessionDetailsAction(partnerId, sessionId)
            if (cancelled) return

            if (!detailsRes.success || !detailsRes.data) {
                setLoading(false)
                return
            }

            const details = detailsRes.data
            const storeId = details.session.store_id || undefined
            const headerRes = await getPartnerReceiptHeaderAction(partnerId, storeId)
            if (cancelled) return

            const partnerHeader: SaleReceiptPartnerHeader = headerRes.success && headerRes.data ? headerRes.data : {
                fantasyName: "",
                legalName: "",
                addressLine: "",
                taxIdLine: "",
            }

            const partnerAvatar = selectedStore?.logo_url || selectedStore?.image_url
                ? getR2ImageUrl(selectedStore?.logo_url || selectedStore?.image_url)
                : undefined

            setData({
                data: buildCashSessionCouponData(details, partnerHeader),
                partnerHeader,
                partnerAvatar,
                couponType: details.session.status === "open" ? "opening" : "closing",
            })
            setLoading(false)
        }

        load()
        return () => { cancelled = true }
    }, [isOpen, sessionId, partnerId, selectedStore?.partner_id, selectedStore?.logo_url, selectedStore?.image_url])

    const handleDownloadPdf = useCallback(async () => {
        if (!sessionId || isDownloading) return
        setIsDownloading(true)
        const params = new URLSearchParams({
            format,
            type: data?.couponType || "closing",
        })
        try {
            await downloadPdf(`/api/pdf/caixa/${sessionId}?${params.toString()}`, `cupom-caixa-${sessionId.slice(0, 8)}.pdf`)
            onClose()
        } catch (error: any) {
            console.error("[CashSessionPrintModal] Error downloading PDF:", error)
            toast.error("Erro ao gerar PDF", error?.message || "Não foi possível gerar o PDF. Tente novamente.")
        } finally {
            setIsDownloading(false)
        }
    }, [sessionId, format, isDownloading, onClose, data])

    const handlePrint = useCallback(() => {
        if (!sessionId) return
        const params = new URLSearchParams({
            format,
            type: data?.couponType || "closing",
        })
        if (isMobile) {
            handleDownloadPdf()
            return
        }
        window.open(`/print/caixa/${sessionId}?${params.toString()}`, "_blank")
        onClose()
    }, [sessionId, format, onClose, isMobile, handleDownloadPdf, data])

    if (!data && !loading && isOpen) return null

    return (
        <Portal>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        className="fixed inset-0 z-[130] flex flex-col bg-black/60"
                        style={{ zIndex }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <div className="relative flex flex-col w-full h-full bg-white dark:bg-dark-background">
                            {/* Header */}
                            <div className="shrink-0 flex items-center justify-between px-4 md:px-6 py-4 border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                                <h2 className="text-lg md:text-xl font-bold text-brand-dark dark:text-dark-heading">
                                    Imprimir cupom de caixa
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
                                    Carregando cupom...
                                </div>
                            ) : !data ? (
                                <div className="flex-1 flex items-center justify-center text-brand-red font-bold">
                                    Não foi possível carregar o cupom.
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
                                                <div className="space-y-3">
                                                    <ListItem
                                                        icon={PrinterIcon}
                                                        title="Impressora térmica (80mm)"
                                                        description="Formato em bobina contínua, ideal para impressoras térmicas e comprovante rápido de balcão."
                                                        onClick={() => setFormat("thermal")}
                                                        className="px-4 py-3"
                                                        right={
                                                            <RadioButton
                                                                name={"format"}
                                                                value={"thermal"}
                                                                checked={format === "thermal"}
                                                                onChange={() => setFormat("thermal")}
                                                            />
                                                        }
                                                    />
                                                    <ListItem
                                                        icon={PrinterIcon}
                                                        title="Impressora térmica (58mm)"
                                                        description="Bobina estreita de 58mm, comprovante compacto ideal para balcão e impressoras portáteis."
                                                        onClick={() => setFormat("thermal-58")}
                                                        className="px-4 py-3"
                                                        right={
                                                            <RadioButton
                                                                name={"format"}
                                                                value={"thermal-58"}
                                                                checked={format === "thermal-58"}
                                                                onChange={() => setFormat("thermal-58")}
                                                            />
                                                        }
                                                    />
                                                    <ListItem
                                                        icon={FileTextIcon}
                                                        title="Documento A4 (PDF)"
                                                        description="Formato folha inteira A4, ideal para impressão comum, arquivamento e envio em PDF."
                                                        onClick={() => setFormat("a4")}
                                                        className="px-4 py-3"
                                                        right={
                                                            <RadioButton
                                                                name={"format"}
                                                                value={"a4"}
                                                                checked={format === "a4"}
                                                                onChange={() => setFormat("a4")}
                                                            />
                                                        }
                                                    />
                                                </div>
                                            </div>

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
                                                <PreviewPane format={format} payload={data} />
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

function PreviewPane({
    format,
    payload,
}: {
    format: SaleReceiptFormat
    payload: CashSessionPrintPayload
}) {
    if (format === "thermal" || format === "thermal-58") {
        const thermalWidth: "80mm" | "58mm" = format === "thermal-58" ? "58mm" : "80mm"
        return (
            <CashSessionCouponPreview
                data={payload.data}
                type={payload.couponType}
                thermalWidth={thermalWidth}
            />
        )
    }
    return (
        <div className="w-full h-full min-h-[400px]">
            <CashSessionA4Preview
                data={payload.data}
                partnerHeader={payload.partnerHeader}
                partnerAvatar={payload.partnerAvatar}
                type={payload.couponType}
            />
        </div>
    )
}
