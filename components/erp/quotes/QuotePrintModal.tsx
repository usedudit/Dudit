"use client"

import { useCallback, useEffect, useState } from "react"
import Portal from "@/components/Portal"
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/reusable"
import { XIcon, PrinterIcon, DownloadIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import { useStore } from "@/lib/store-context"
import { getPartnerAddressAction, getQuoteDetailsAction } from "@/app/actions/erp/quotes"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { downloadPdf } from "@/lib/pdf/download"
import QuotePreview from "./QuotePreview"

export type QuotePrintModalProps = {
    isOpen: boolean
    onClose: () => void
    quoteId: string
    partnerId: string
}

export default function QuotePrintModal({ isOpen, onClose, quoteId, partnerId }: QuotePrintModalProps) {
    const isMobile = useMediaQuery("(max-width: 1023px)")
    const { selectedStore } = useStore()

    const [isVisible, setIsVisible] = useState(false)
    const [isAnimating, setIsAnimating] = useState(false)
    const [activeTab, setActiveTab] = useState("Visualização")
    const [loading, setLoading] = useState(false)
    const [quoteData, setQuoteData] = useState<any>(null)

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

    useEffect(() => {
        if (!isOpen || !quoteId || !partnerId) {
            setQuoteData(null)
            return
        }

        let cancelled = false

        async function load() {
            setLoading(true)
            const supabase = (await import("@/lib/supabase/browser-client")).supabaseBrowser

            const [quoteDetailsRes, partnerRes, storeRes, addressRes] = await Promise.all([
                getQuoteDetailsAction(quoteId, partnerId),
                supabase.from("partners").select("store_name, store_image_url").eq("id", partnerId).maybeSingle(),
                supabase.from("stores").select("name, logo_url").eq("partner_id", partnerId).limit(1).maybeSingle(),
                getPartnerAddressAction(partnerId),
            ])

            if (cancelled || !quoteDetailsRes?.success || !quoteDetailsRes.data) {
                setLoading(false)
                return
            }

            const quoteDetails = quoteDetailsRes.data

            const partnerName = storeRes.data?.name || partnerRes.data?.store_name || "Parceiro"
            const rawAvatar = storeRes.data?.image_url || partnerRes.data?.store_image_url || selectedStore?.image_url || undefined
            const partnerAvatar = rawAvatar ? getR2ImageUrl(rawAvatar) : undefined
            const partnerAddress = addressRes.success && addressRes.data ? addressRes.data.formatted : undefined

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

    const handlePrint = useCallback(() => {
        if (!quoteId) return
        if (isMobile) {
            downloadPdf(`/api/pdf/orcamento/${quoteId}`, `orcamento-${quoteId}.pdf`)
                .catch(() => window.open(`/print/orcamento/${quoteId}`, "_blank"))
            onClose()
            return
        }
        window.open(`/print/orcamento/${quoteId}`, "_blank")
        onClose()
    }, [quoteId, onClose, isMobile])

    const handleDownloadPdf = useCallback(() => {
        if (!quoteId) return
        downloadPdf(`/api/pdf/orcamento/${quoteId}`, `orcamento-${quoteId}.pdf`)
            .catch(() => {
                window.open(`/print/orcamento/${quoteId}`, "_blank")
            })
        onClose()
    }, [quoteId, onClose])

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

                            {/* Left - options (simplificado, sem opções extras) */}
                            <div
                                className={`w-full lg:w-1/2 flex flex-col border-r border-brand-border dark:border-dark-border overflow-hidden ${activeTab === "Visualização" ? "hidden lg:flex" : "flex"
                                    }`}
                            >
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-6">
                                    <p className="text-sm text-brand-inactive-text">
                                        Visualize e imprima o orçamento em formato A4.
                                    </p>

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
                                        <div className="w-full h-full min-h-[400px]">
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
                                                partnerAvatar={quoteData.partnerAvatar}
                                                primaryColor={quoteData.primaryColor}
                                                secondaryColor={quoteData.secondaryColor}
                                                quoteTitle={quoteData.quoteTitle}
                                                quoteSubtitle={quoteData.quoteSubtitle}
                                                showDecoration={quoteData.showDecoration}
                                                salespersonName={quoteData.salespersonName}
                                            />
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
