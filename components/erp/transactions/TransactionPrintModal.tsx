"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Portal from "@/components/Portal"
import { Button, Spinner, Tabs, TabsContent, TabsList, TabsTrigger, ListItem, FormSection } from "@/components/reusable"
import { XIcon, PrinterIcon, DownloadIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import { useModalLayer } from "@/lib/modal-stack"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency } from "@/lib/utils"
import { type TransactionDetailPayload, getTransactionAttachmentsAction } from "@/app/actions/erp/transactions"

export type TransactionPrintModalProps = {
    isOpen: boolean
    onClose: () => void
    transactionId: string
    partnerId: string
    detail?: TransactionDetailPayload | null
}

export default function TransactionPrintModal({ isOpen, onClose, transactionId, partnerId, detail }: TransactionPrintModalProps) {
    const isMobile = useMediaQuery("(max-width: 1023px)")
    const zIndex = useModalLayer(isOpen)
    const [attachments, setAttachments] = useState<any[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!isOpen || !transactionId) return
        loadAttachments()
    }, [isOpen, transactionId])

    const loadAttachments = async () => {
        setLoading(true)
        try {
            const res = await getTransactionAttachmentsAction(transactionId)
            if (res.success) setAttachments(res.data || [])
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const handlePrint = () => {
        window.print()
    }

    const imageAttachments = (attachments || []).filter(att =>
        att.file_type?.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|avif|bmp)$/i.test(att.file_name || "")
    )

    if (!isOpen) return null

    return (
        <Portal>
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 backdrop-blur-sm"
                    style={{ zIndex }}
                >
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className={`w-full bg-white dark:bg-dark-surface flex flex-col ${isMobile ? "h-full max-h-full rounded-t-2xl" : "max-h-[90vh] rounded-2xl"} overflow-hidden`}
                    >
                        <div className="flex items-center justify-between p-4 border-b border-brand-border dark:border-dark-border shrink-0">
                            <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading">
                                Imprimir Transação
                            </h3>
                            <Button variant="ghost" size="sm" onClick={onClose}>
                                <XIcon className="w-5 h-5" />
                            </Button>
                        </div>

                        <div className="p-4 overflow-y-auto flex-1">
                            {detail && (
                                <div className="space-y-4 text-sm">
                                    <FormSection title="Detalhes da Transação">
                                        <div className="space-y-2">
                                                <ListItem
                                                    title="Descrição"
                                                    description={detail.headerTitle}
                                                    className="border-0 bg-transparent px-0"
                                                />
                                            <ListItem
                                                title="Valor"
                                                description={formatCurrency(detail.amount || 0)}
                                                className="border-0 bg-transparent px-0"
                                            />
                                            <ListItem
                                                title="Status"
                                                description={detail.statusLabel || "-"}
                                                className="border-0 bg-transparent px-0"
                                            />
                                            {detail.contactCard?.name && (
                                                <ListItem
                                                    title="Contato"
                                                    description={detail.contactCard.name}
                                                    className="border-0 bg-transparent px-0"
                                                />
                                            )}
                                                {detail.accountLine && (
                                                    <ListItem
                                                        title="Conta"
                                                        description={detail.accountLine}
                                                        className="border-0 bg-transparent px-0"
                                                    />
                                            )}
                                            {detail.categoryLine && (
                                                <ListItem
                                                    title="Categoria"
                                                    description={detail.categoryLine}
                                                    className="border-0 bg-transparent px-0"
                                                />
                                            )}
                                                {detail.dueDateLine && (
                                                    <ListItem
                                                        title="Vencimento"
                                                        description={detail.dueDateLine}
                                                        className="border-0 bg-transparent px-0"
                                                    />
                                            )}
                                                {detail.paymentDateLine && (
                                                    <ListItem
                                                        title="Data de pagamento"
                                                        description={detail.paymentDateLine}
                                                        className="border-0 bg-transparent px-0"
                                                    />
                                            )}
                                        </div>
                                    </FormSection>

                                    {imageAttachments.length > 0 && (
                                        <FormSection title="Imagens">
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                {imageAttachments.map((img) => (
                                                    <img
                                                        key={img.id}
                                                        src={getR2ImageUrl(img.file_key, "medium")}
                                                        alt={img.file_name || "Imagem"}
                                                        className="rounded-lg border border-brand-border dark:border-dark-border object-cover w-full h-24"
                                                        onError={(e: any) => {
                                                            e.target.src = "https://img.dudit.com.br/static/Placeholder.png"
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        </FormSection>
                                    )}

                                    {loading && (
                                        <div className="flex justify-center py-4">
                                            <Spinner className="w-6 h-6 text-brand-primary animate-spin" />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 p-4 border-t border-brand-border dark:border-dark-border shrink-0">
                            <Button onClick={handlePrint} className="flex-1" leftIcon={<PrinterIcon className="w-4 h-4" />}>
                                Imprimir
                            </Button>
                            <Button variant="outline" onClick={onClose} className="flex-1">
                                Fechar
                            </Button>
                        </div>
                    </motion.div>
                </motion.div>
            </AnimatePresence>
        </Portal>
    )
}
