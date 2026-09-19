"use client"

import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Portal from "@/components/Portal"
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, ListItem, RadioButton } from "@/components/reusable"
import { XIcon, PrinterIcon, DownloadIcon, FileTextIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import { useStore } from "@/lib/store-context"
import { getPartnerAddressAction, getQuoteDetailsAction } from "@/app/actions/erp/quotes"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { downloadPdf } from "@/lib/pdf/download"
import { toast } from "@/hooks/use-notification"
import QuotePreview from "./QuotePreview"
import QuoteThermalPreview from "./QuoteThermalPreview"

export type QuotePrintFormat = "thermal" | "thermal-58" | "a4"

export type QuotePrintModalProps = {
    isOpen: boolean
    onClose: () => void
    quoteId: string
    partnerId: string
}

export default function QuotePrintModal({ isOpen, onClose, quoteId, partnerId }: QuotePrintModalProps) {
    const isMobile = useMediaQuery("(max-width: 1023px)")
    const { selectedStore } = useStore()

    const [activeTab, setActiveTab] = useState("Visualização")
    const [format, setFormat] = useState<QuotePrintFormat>("a4")
    const [loading, setLoading] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)
    const [quoteData, setQuoteData] = useState<any>(null)

    useEffect(() => {
        if (!isOpen || !quoteId || !partnerId) {
            setQuoteData(null)
            return
        }

        let cancelled = false

        async function load() {
            setLoading(true)
            const supabase = (await import("@/lib/supabase/browser-client")).supabaseBrowser
            const storeId = selectedStore?.id

            const [quoteDetailsRes, storeRes, addressRes] = await Promise.all([
                getQuoteDetailsAction(quoteId, partnerId),
                storeId
                    ? supabase.from("stores").select("name, logo_url, phone").eq("id", storeId).maybeSingle()
                    : supabase.from("stores").select("name, logo_url, phone").eq("partner_id", partnerId).order("is_headquarters", { ascending: false }).limit(1).maybeSingle(),
                getPartnerAddressAction(partnerId, storeId),
            ])

            if (cancelled || !quoteDetailsRes?.success || !quoteDetailsRes.data) {
                setLoading(false)
                return
            }

            const quoteDetails = quoteDetailsRes.data

            const partnerName = storeRes.data?.name || "Parceiro"
            const rawAvatar = storeRes.data?.logo_url || selectedStore?.logo_url || undefined
            const partnerAvatar = rawAvatar ? getR2ImageUrl(rawAvatar) : undefined
            const partnerAddress = (addressRes.success && addressRes.data?.formatted) || undefined
            const partnerPhone = storeRes.data?.phone || undefined

            const formattedItems = (quoteDetails.items || []).map((item: any) => ({
                name: item.custom_name || item.products?.name || "Produto sem nome",
                qty: item.quantity,
                price: item.unit_price,
            }))

            const meta = quoteDetails.metadata || {}
            const preview = meta.preview || {}

            setQuoteData({
                invoiceNumber: quoteDetails.quote_number || "",
                quoteDate: quoteDetails.issue_date || "",
                expiryDate: quoteDetails.expiration_date || "",
                selectedCustomer: quoteDetails.customers,
                quoteItems: formattedItems,
                subtotal: Number(quoteDetails.subtotal || 0),
                shippingNum: Number(quoteDetails.shipping_cost || 0),
                otherCosts: Number(quoteDetails.additional_costs || 0),
                discountValue: Number(quoteDetails.discount_value || 0),
                total: Number(quoteDetails.total || 0),
                note: quoteDetails.notes || undefined,
                partnerName,
                partnerAddress,
                partnerPhone,
                partnerAvatar,
                primaryColor: preview.primaryColor || undefined,
                secondaryColor: preview.secondaryColor || undefined,
                quoteTitle: preview.quoteTitle || undefined,
                quoteSubtitle: preview.quoteSubtitle || undefined,
                showDecoration: preview.showDecoration !== false,
                salespersonName: quoteDetails.user_profiles?.full_name || undefined,
            })
            setLoading(false)
        }

        load()
        return () => { cancelled = true }
    }, [isOpen, quoteId, partnerId, selectedStore?.image_url])

    const handleDownloadPdf = useCallback(async () => {
        if (!quoteId || isDownloading) return
        setIsDownloading(true)
        const params = new URLSearchParams({ format })
        try {
            await downloadPdf(`/api/pdf/orcamento/${quoteId}?${params.toString()}`, `orcamento-${quoteData.invoiceNumber || quoteId}.pdf`)
            onClose()
        } catch (error: any) {
            console.error("[QuotePrintModal] Error downloading PDF:", error)
            toast.error("Erro ao gerar PDF", error?.message || "Não foi possível gerar o PDF. Tente novamente.")
        } finally {
            setIsDownloading(false)
        }
    }, [quoteId, format, isDownloading, onClose])

    const handlePrint = useCallback(() => {
        if (!quoteId) return
        if (isMobile) {
            handleDownloadPdf()
            return
        }
        const params = new URLSearchParams({ format })
        window.open(`/print/orcamento/${quoteId}?${params.toString()}`, "_blank")
        onClose()
    }, [quoteId, format, onClose, isMobile, handleDownloadPdf])

    if (!quoteData && !loading && isOpen) return null

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
                            {/* Header */}
                            <div className="shrink-0 flex items-center justify-between px-4 md:px-6 py-4 border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                                <h2 className="text-lg md:text-xl font-bold text-brand-dark dark:text-dark-heading">
                                    Imprimir orçamento
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
                                    Carregando orçamento...
                                </div>
                            ) : !quoteData ? (
                                <div className="flex-1 flex items-center justify-center text-brand-red font-bold">
                                    Não foi possível carregar o orçamento.
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
                                                        className="px-4 py-3 gap-4"
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
                                                        className="px-4 py-3 gap-4"
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
                                                        className="px-4 py-3 gap-4"
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
                                                <div className="w-full h-full min-h-[400px]">
                                                    {format === "thermal" || format === "thermal-58" ? (
                                                        <div className="flex justify-center">
                                                            <QuoteThermalPreview
                                                                invoiceNumber={quoteData.invoiceNumber}
                                                                quoteDate={quoteData.quoteDate}
                                                                expiryDate={quoteData.expiryDate}
                                                                selectedCustomer={quoteData.selectedCustomer}
                                                                quoteItems={quoteData.quoteItems}
                                                                subtotal={quoteData.subtotal}
                                                                shippingNum={quoteData.shippingNum}
                                                                otherCosts={quoteData.otherCosts}
                                                                discountValue={quoteData.discountValue}
                                                                total={quoteData.total}
                                                                note={quoteData.note}
                                                                partnerName={quoteData.partnerName}
                                                                partnerAddress={quoteData.partnerAddress}
                                                                partnerPhone={quoteData.partnerPhone}
                                                                partnerAvatar={quoteData.partnerAvatar}
                                                                primaryColor={quoteData.primaryColor}
                                                                secondaryColor={quoteData.secondaryColor}
                                                                quoteTitle={quoteData.quoteTitle}
                                                                quoteSubtitle={quoteData.quoteSubtitle}
                                                                showDecoration={quoteData.showDecoration}
                                                                salespersonName={quoteData.salespersonName}
                                                                thermalWidth={format === "thermal-58" ? "58mm" : "80mm"}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <QuotePreview
                                                            invoiceNumber={quoteData.invoiceNumber}
                                                            quoteDate={quoteData.quoteDate}
                                                            expiryDate={quoteData.expiryDate}
                                                            selectedCustomer={quoteData.selectedCustomer}
                                                            quoteItems={quoteData.quoteItems}
                                                            subtotal={quoteData.subtotal}
                                                            shippingNum={quoteData.shippingNum}
                                                            otherCosts={quoteData.otherCosts}
                                                            discountValue={quoteData.discountValue}
                                                            total={quoteData.total}
                                                            note={quoteData.note}
                                                            partnerName={quoteData.partnerName}
                                                            partnerAddress={quoteData.partnerAddress}
                                                            partnerPhone={quoteData.partnerPhone}
                                                            partnerAvatar={quoteData.partnerAvatar}
                                                            primaryColor={quoteData.primaryColor}
                                                            secondaryColor={quoteData.secondaryColor}
                                                            quoteTitle={quoteData.quoteTitle}
                                                            quoteSubtitle={quoteData.quoteSubtitle}
                                                            showDecoration={quoteData.showDecoration}
                                                            salespersonName={quoteData.salespersonName}
                                                        />
                                                    )}
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
