"use client"

import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Portal from "@/components/Portal"
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, ListItem } from "@/components/reusable"
import { XIcon, PrinterIcon, DownloadIcon, FileTextIcon, ThreeDotsIcon, EditIcon } from "@/lib/icons"
import Dropdown from "@/components/reusable/Dropdown"
import DropdownItem from "@/components/reusable/DropdownItem"
import { useMediaQuery } from "@/components/erp/hooks"
import { useModalLayer } from "@/lib/modal-stack"
import { useStore } from "@/lib/store-context"
import { getReturnRequestDetailsAction } from "@/app/actions/erp/returns"
import { getPartnerReceiptHeaderAction } from "@/app/actions/erp/receipt"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { downloadPdf } from "@/lib/pdf/download"
import { toast } from "@/hooks/use-notification"
import type { SaleReceiptPartnerHeader } from "@/lib/sales/sale-receipt"
import ReturnReceiptThermalPreview from "./ReturnReceiptThermalPreview"
import ReturnReceiptA4Preview from "./ReturnReceiptA4Preview"

type Format = "thermal" | "thermal-58" | "a4"

export type ReturnPrintModalProps = {
    isOpen: boolean
    onClose: () => void
    returnId: string
    partnerId: string
    storeId?: string
    onEdit?: () => void
}

export default function ReturnPrintModal({ isOpen, onClose, returnId, partnerId, storeId, onEdit }: ReturnPrintModalProps) {
    const isMobile = useMediaQuery("(max-width: 1023px)")
    // z-index dinâmico: este modal abre acima de tudo que já estava aberto.
    const zIndex = useModalLayer(isOpen)
    const { selectedStore } = useStore()

    const [activeTab, setActiveTab] = useState("Opções")
    const [format, setFormat] = useState<Format>("thermal")
    const [isDownloading, setIsDownloading] = useState(false)
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
            setActiveTab("Opções")
        }
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
        if (isMobile) {
            handleDownloadPdf()
            return
        }
        const params = new URLSearchParams({ format })
        window.open(`/print/troca/${returnId}?${params.toString()}`, "_blank")
        onClose()
    }, [returnId, format, onClose, isMobile])

    const handleDownloadPdf = useCallback(async () => {
        if (!returnId || isDownloading) return
        setIsDownloading(true)
        const params = new URLSearchParams({ format })
        try {
            await downloadPdf(`/api/pdf/troca/${returnId}?${params.toString()}`, `troca-${returnRequest?.orderNumber || returnId}.pdf`)
            onClose()
        } catch (error: any) {
            console.error("[ReturnPrintModal] Error downloading PDF:", error)
            toast.error("Erro ao gerar PDF", error?.message || "Não foi possível gerar o PDF. Tente novamente.")
        } finally {
            setIsDownloading(false)
        }
    }, [returnId, format, isDownloading, onClose, returnRequest])

    const partnerName = selectedStore?.name || partnerHeader.fantasyName || "Estabelecimento"
    const partnerAvatar = selectedStore?.logo_url || selectedStore?.image_url
        ? getR2ImageUrl(selectedStore?.logo_url || selectedStore?.image_url)
        : undefined

    if (!returnRequest && !loading && isOpen) return null

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
                                                    <div className="space-y-3">
                                                        <ListItem
                                                            icon={PrinterIcon}
                                                            title="Cupom de troca (Impressora térmica)"
                                                            description="Formato em 80mm para comprovante rápido de devolução/troca no balcão."
                                                            onClick={() => setFormat("thermal")}
                                                            className={`transition-all px-4 py-3 gap-4 ${format === "thermal"
                                                                ? "border-brand-dark dark:border-dark-heading ring-2 ring-brand-dark/10 dark:ring-white/10"
                                                                : "opacity-80 hover:opacity-100"
                                                                }`}
                                                            right={
                                                                <div
                                                                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${format === "thermal"
                                                                        ? "border-brand-dark bg-brand-dark dark:border-dark-heading dark:bg-dark-heading"
                                                                        : "border-brand-border dark:border-dark-border"
                                                                        }`}
                                                                >
                                                                    {format === "thermal" && <div className="w-2 h-2 rounded-full bg-white" />}
                                                                </div>
                                                            }
                                                        />
                                                        <ListItem
                                                            icon={PrinterIcon}
                                                            title="Impressora térmica (58mm)"
                                                            description="Bobina estreita de 58mm, comprovante compacto ideal para balcão e impressoras portáteis."
                                                            onClick={() => setFormat("thermal-58")}
                                                            className={`transition-all px-4 py-3 gap-4 ${format === "thermal-58"
                                                                ? "border-brand-dark dark:border-dark-heading ring-2 ring-brand-dark/10 dark:ring-white/10"
                                                                : "opacity-80 hover:opacity-100"
                                                                }`}
                                                            right={
                                                                <div
                                                                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${format === "thermal-58"
                                                                        ? "border-brand-dark bg-brand-dark dark:border-dark-heading dark:bg-dark-heading"
                                                                        : "border-brand-border dark:border-dark-border"
                                                                        }`}
                                                                >
                                                                    {format === "thermal-58" && <div className="w-2 h-2 rounded-full bg-white" />}
                                                                </div>
                                                            }
                                                        />
                                                        <ListItem
                                                            icon={FileTextIcon}
                                                            title="Documento A4 (PDF)"
                                                            description="Formato folha A4 com comprovante completo e termo assinado de troca."
                                                            onClick={() => setFormat("a4")}
                                                            className={`transition-all px-4 py-3 gap-4 ${format === "a4"
                                                                ? "border-brand-dark dark:border-dark-heading ring-2 ring-brand-dark/10 dark:ring-white/10"
                                                                : "opacity-80 hover:opacity-100"
                                                                }`}
                                                            right={
                                                                <div
                                                                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${format === "a4"
                                                                        ? "border-brand-dark bg-brand-dark dark:border-dark-heading dark:bg-dark-heading"
                                                                        : "border-brand-border dark:border-dark-border"
                                                                        }`}
                                                                >
                                                                    {format === "a4" && <div className="w-2 h-2 rounded-full bg-white" />}
                                                                </div>
                                                            }
                                                        />
                                                    </div>
                                                </div>

                                            <div className="hidden lg:flex gap-3 pt-2">
                                                <Button className="flex-1 h-12" onClick={onEdit} leftIcon={<EditIcon size={18} />}>
                                                    Editar
                                                </Button>
                                                <Dropdown
                                                    trigger={
                                                        <Button variant="outline" className="flex-1 h-12">
                                                            <ThreeDotsIcon size={18} />
                                                        </Button>
                                                    }
                                                    align="right"
                                                    showChevron={false}
                                                >
                                                    <DropdownItem onClick={handlePrint}>
                                                        <PrinterIcon size={14} /> Imprimir
                                                    </DropdownItem>
                                                    <DropdownItem onClick={handleDownloadPdf} disabled={isDownloading}>
                                                        <DownloadIcon size={14} /> {isDownloading ? "Gerando PDF..." : "Salvar PDF"}
                                                    </DropdownItem>
                                                </Dropdown>
                                            </div>
                                        </div>

                                        {/* Mobile footer actions */}
                                        <div className="lg:hidden shrink-0 p-4 border-t border-brand-border dark:border-dark-border flex gap-3">
                                            <Button className="flex-1 h-12" onClick={onEdit} leftIcon={<EditIcon size={18} />}>
                                                Editar
                                            </Button>
                                            <Dropdown
                                                trigger={
                                                    <Button variant="outline" className="flex-1 h-12">
                                                        <ThreeDotsIcon size={18} />
                                                    </Button>
                                                }
                                                align="right"
                                                showChevron={false}
                                            >
                                                <DropdownItem onClick={handlePrint}>
                                                    <PrinterIcon size={14} /> Imprimir
                                                </DropdownItem>
                                                <DropdownItem onClick={handleDownloadPdf} disabled={isDownloading}>
                                                    <DownloadIcon size={14} /> {isDownloading ? "Gerando..." : "PDF"}
                                                </DropdownItem>
                                            </Dropdown>
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
                                                {format === "thermal" || format === "thermal-58" ? (
                                                    <ReturnReceiptThermalPreview
                                                        returnRequest={returnRequest}
                                                        partnerHeader={partnerHeader}
                                                        partnerName={partnerName}
                                                        thermalWidth={format === "thermal-58" ? "58mm" : "80mm"}
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
                    </motion.div>
                )}
            </AnimatePresence>
        </Portal>
    )
}