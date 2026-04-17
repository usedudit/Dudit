"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { ChevronLeftIcon, EditIcon, ThreeDotsIcon } from "@/lib/icons"
import { Button, Badge, ActionsDropdown, ThreeDotsLoader, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/reusable"
import { getTransactionDetailsAction, getTransactionHistoryAction, type TransactionDetailPayload } from "@/app/actions/erp/transactions"
import { TransactionHistoryTab } from "./TransactionHistoryTab"
import { TransactionContactCard } from "./TransactionContactCard"
import { useNotification } from "@/hooks/use-notification"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency } from "@/lib/utils"
import { FadeIn } from "@/components/animations/FadeIn"

interface TransactionDetailViewProps {
    transactionId: string
    partnerId: string
    onBack: () => void
    onEdit: (transactionId: string) => void
}

export default function TransactionDetailView({ transactionId, partnerId, onBack, onEdit }: TransactionDetailViewProps) {
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [detail, setDetail] = useState<TransactionDetailPayload | null>(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState("summary")
    const [historyEntries, setHistoryEntries] = useState<any[]>([])
    const [historyLoading, setHistoryLoading] = useState(false)
    const [historyLoaded, setHistoryLoaded] = useState(false)
    const { error: notifyError } = useNotification()

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) {
            setIsScrolled(scrollContainerRef.current.scrollTop > 5)
        }
    }, [])

    useEffect(() => {
        async function load() {
            setLoading(true)
            const res = await getTransactionDetailsAction(transactionId, partnerId)
            if (res.success) {
                setDetail(res.data)
            } else {
                notifyError("Erro", res.error)
                onBack()
            }
            setLoading(false)
        }
        load()
    }, [transactionId, partnerId, notifyError, onBack])

    useEffect(() => {
        async function loadHistory() {
            if (activeTab !== "history" || historyLoaded) return
            setHistoryLoading(true)
            const res = await getTransactionHistoryAction(transactionId, partnerId)
            if (res.success) {
                setHistoryEntries(res.data || [])
                setHistoryLoaded(true)
            } else {
                notifyError("Erro", res.error)
            }
            setHistoryLoading(false)
        }
        loadHistory()
    }, [activeTab, historyLoaded, transactionId, partnerId, notifyError])

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center bg-white dark:bg-dark-surface min-h-[400px]">
                <ThreeDotsLoader />
            </div>
        )
    }
    if (!detail) return null

    const timelineSteps: Array<{
        label: string
        date: string
        time: string
        active: boolean
        danger?: boolean
    }> = [detail.timeline.step1, detail.timeline.step2]
    const activeCount = timelineSteps.filter((s) => s.active).length
    const progressPct = timelineSteps.length > 1 ? ((Math.max(activeCount, 1) - 1) / (timelineSteps.length - 1)) * 100 : 0

    const subtitleParts: string[] = [detail.paymentMethodSubtitle]
    if (detail.paymentDateSubtitle) {
        subtitleParts.push(`Pago em ${detail.paymentDateSubtitle}`)
    }
    const subtitleLeft = subtitleParts.join(" • ")

    const PaymentRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
        <div className="flex justify-between items-start text-[14px] gap-4">
            <span className="text-brand-inactive-text dark:text-dark-body font-medium">{label}</span>
            <div className="text-right">{value}</div>
        </div>
    )

    return (
        <FadeIn>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-screen bg-white dark:bg-dark-background overflow-hidden relative">
                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-10">
                    <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
                            <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                            </div>

                            <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                    <h1
                                        className={`font-bold transition-all duration-500 ease-in-out flex flex-wrap items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}
                                    >
                                        <span className="hidden md:inline truncate">{detail.headerTitle}</span>
                                        <Badge variant={detail.statusVariant}>{detail.statusLabel}</Badge>
                                        {detail.isRecurring && (
                                            <Badge variant="purple" className="whitespace-nowrap">
                                                Recorrente
                                            </Badge>
                                        )}
                                    </h1>

                                    <div
                                        className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}
                                    >
                                        <span>{subtitleLeft}</span>
                                        <span className="mx-2">•</span>
                                        <span>Criado por {detail.creatorName}</span>
                                    </div>
                                </div>

                                <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                    <ActionsDropdown onPrint={() => window.print()} onShare={() => { }} />
                                    {detail.canEdit && (
                                        <Button onClick={() => onEdit(transactionId)} className="whitespace-nowrap">
                                            <EditIcon className="w-[18px] h-[18px] mr-2" />
                                            Editar
                                        </Button>
                                    )}
                                </div>
                            </div>

                            <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                    <TabsTrigger value="summary">Resumo</TabsTrigger>
                                    <TabsTrigger value="history">Historico</TabsTrigger>
                                </TabsList>
                            </div>
                        </div>
                    </div>

                    <div className="max-w-[1300px] mx-auto p-4 md:p-6 pt-6">
                        <Tabs value={activeTab} onValueChange={setActiveTab}>
                            <TabsContent value="summary" className="mt-0">
                                <div className="grid grid-cols-12 gap-y-8 md:gap-y-0 relative">
                                    <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                        <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden mb-8">
                                            <div className="bg-brand-gray dark:bg-dark-border/50 p-6 border-b border-brand-border dark:border-dark-border">
                                                <div className="flex justify-between items-center flex-wrap gap-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Tipo:</span>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading text-sm">{detail.typeBannerLabel}</span>
                                                    </div>
                                                    <div className="text-sm text-brand-inactive-text dark:text-dark-body font-medium md:text-right">
                                                        Origem: <strong className="text-brand-dark dark:text-dark-heading">{detail.originLabel}</strong>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="bg-white dark:bg-dark-surface px-8 md:px-12 pt-12 pb-12">
                                                <div className="relative px-4">
                                                    <div className="relative h-1.5 w-full bg-gray-100 dark:bg-dark-border/50 rounded-full flex items-center justify-between">
                                                        <div
                                                            className={`absolute left-0 h-full rounded-full transition-all duration-500 ${detail.timeline.step2.danger ? "bg-brand-red" : "bg-brand-dark dark:bg-dark-heading"}`}
                                                            style={{ width: `${progressPct}%` }}
                                                        ></div>

                                                        {timelineSteps.map((step, idx) => (
                                                            <div key={idx} className="relative flex flex-col items-center">
                                                                <div className="absolute bottom-6 whitespace-nowrap flex flex-col items-center">
                                                                    <span
                                                                        className={`text-xs font-medium ${step.active
                                                                            ? step.danger
                                                                                ? "text-brand-red"
                                                                                : "text-brand-dark dark:text-dark-heading"
                                                                            : "text-gray-400 dark:text-dark-body"
                                                                            }`}
                                                                    >
                                                                        {step.label}
                                                                    </span>
                                                                </div>
                                                                <div
                                                                    className={`w-4 h-4 rounded-full border-2 z-10 transition-colors duration-300 flex items-center justify-center ${step.active
                                                                        ? step.danger
                                                                            ? "bg-brand-red border-brand-red"
                                                                            : "bg-brand-dark dark:bg-dark-heading border-brand-dark dark:border-dark-heading"
                                                                        : "bg-white dark:bg-dark-surface border-gray-300 dark:border-dark-border"
                                                                        }`}
                                                                >
                                                                    {step.active && <div className="w-1.5 h-1.5 bg-white dark:bg-dark-surface rounded-full"></div>}
                                                                </div>
                                                                <div className="absolute top-6 whitespace-nowrap flex flex-col items-center">
                                                                    {step.date ? (
                                                                        <div className="flex items-center gap-1 text-xs text-brand-inactive-text">
                                                                            <span>{step.date}</span>
                                                                            {step.time && <span>{step.time}</span>}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="text-xs font-medium text-gray-300 dark:text-dark-body/50">-</div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-8">
                                            <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Itens da Transação</h3>
                                            <div className="space-y-4">
                                                {detail.items.map((item) => (
                                                    <div key={item.id} className="flex items-start gap-4 p-3">
                                                        <div className="w-16 h-16 overflow-hidden shrink-0 rounded-full border border-brand-border dark:border-dark-border">
                                                            <img
                                                                src={item.image ? getR2ImageUrl(item.image, "thumbnail") : "https://img.dudit.com.br/static/Placeholder.png"}
                                                                className="w-full h-full object-cover rounded-xl"
                                                                alt={item.title}
                                                                onError={(e: any) => {
                                                                    e.target.src = "https://img.dudit.com.br/static/Placeholder.png"
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex justify-between items-start mb-1">
                                                                <h4 className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading truncate">{item.title}</h4>
                                                                <span className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading">{formatCurrency(item.lineTotal)}</span>
                                                            </div>
                                                            <div className="text-xs text-brand-inactive-text dark:text-dark-body uppercase mb-2">SKU: {item.sku}</div>
                                                            <div className="flex items-center gap-2 text-xs text-brand-inactive-text dark:text-dark-body">
                                                                <span>
                                                                    {item.quantity} un. • {formatCurrency(item.unitPrice)} / un.
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="mt-8">
                                            <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Detalhes da Transação</h3>
                                            <div className="space-y-3">
                                                <PaymentRow label="Categoria" value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{detail.categoryLine}</span>} />
                                                {detail.subcategoryLine && (
                                                    <PaymentRow
                                                        label="Subcategoria"
                                                        value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{detail.subcategoryLine}</span>}
                                                    />
                                                )}
                                                <PaymentRow
                                                    label="Conta"
                                                    value={
                                                        <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{detail.accountLine || "-"}</span>
                                                    }
                                                />
                                                <PaymentRow
                                                    label="Data de vencimento"
                                                    value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{detail.dueDateLine || "-"}</span>}
                                                />
                                                {detail.paymentDateLine && (
                                                    <PaymentRow
                                                        label="Data de pagamento"
                                                        value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{detail.paymentDateLine}</span>}
                                                    />
                                                )}
                                                {detail.notesLine && (
                                                    <PaymentRow
                                                        label="Observações"
                                                        value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm whitespace-pre-wrap">{detail.notesLine}</span>}
                                                    />
                                                )}
                                                <div className="flex justify-between items-center pt-4 border-t border-brand-border dark:border-dark-border mt-3">
                                                    <span className="font-bold text-lg text-brand-dark dark:text-dark-heading">Total</span>
                                                    <span
                                                        className={`font-bold text-2xl tracking-tight ${detail.ledgerDirection === "in" ? "text-brand-green" : "text-brand-red"}`}
                                                    >
                                                        {detail.ledgerDirection === "in" ? "+ " : "- "}
                                                        {formatCurrency(detail.amount)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                        <TransactionContactCard title={detail.contactCard.title} name={detail.contactCard.name} />
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="history" className="mt-0">
                                <TransactionHistoryTab entries={historyEntries} loading={historyLoading} />
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>

                <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3">
                    <ActionsDropdown
                        onPrint={() => window.print()}
                        onShare={() => { }}
                        trigger={
                            <Button variant="outline" className="flex-1">
                                <ThreeDotsIcon className="w-4 h-4 mr-2" />
                                Opcoes
                            </Button>
                        }
                    />
                    {detail.canEdit && (
                        <Button onClick={() => onEdit(transactionId)} className="flex-1 whitespace-nowrap">
                            <EditIcon className="w-4 h-4 mr-2" />
                            Editar
                        </Button>
                    )}
                </div>
            </Tabs>
        </FadeIn>
    )
}
