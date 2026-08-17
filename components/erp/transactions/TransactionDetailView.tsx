"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { ChevronLeftIcon, EditIcon, ThreeDotsIcon } from "@/lib/icons"
import { Button, Badge, ActionsDropdown, ThreeDotsLoader, Tabs, TabsContent, TabsList, TabsTrigger, CustomerCard, InfoCard, FormSection } from "@/components/reusable"
import { getTransactionHistoryAction, type TransactionDetailPayload } from "@/app/actions/erp/transactions"
import { TransactionHistoryTab } from "./TransactionHistoryTab"
import { TransactionContactCard } from "./TransactionContactCard"
import { TransactionGoalCard } from "./TransactionGoalCard"
import { useNotification } from "@/hooks/use-notification"
import { useSidebar } from "@/lib/sidebar-context"
import { GenericAttachmentsTab } from "../shared/GenericAttachmentsTab"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency, formatQuantityWithUnit, formatUnitPriceWithUnit } from "@/lib/utils"
import { FadeIn } from "@/components/animations/FadeIn"
import { ERPDetailLoading } from "@/components/erp/shared/ERPDetailLoading"
import InstallmentParcelsTable, { type InstallmentParcelRow } from "./InstallmentParcelsTable"
import { ListItem } from "@/components/reusable"
import { AdjustIcon, ArrowRightIcon, BankIcon, CashierIcon, DigitalWalletIcon, MoneyIcon, ReturnIcon, ShoppingCartIcon, RepeatIcon, TrendingUpIcon } from "@/lib/icons"
import BottomSheet from "@/components/BottomSheet"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"

interface TransactionDetailViewProps {
    transactionId: string
    partnerId: string
    onBack: () => void
    onEdit: (transactionId: string) => void
    initialDetail?: TransactionDetailPayload | null
    loading?: boolean
    onEditInstallment?: (id: string) => void
    onPayInstallment?: (id: string) => void
}

export default function TransactionDetailView({ transactionId, partnerId, onBack, onEdit, initialDetail, loading: externalLoading, onEditInstallment, onPayInstallment }: TransactionDetailViewProps) {
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    // Render whatever the parent provides (starts with partial, updates to full)
    const [detail, setDetail] = useState<TransactionDetailPayload | null>(initialDetail || null)
    const [loading, setLoading] = useState(!initialDetail)
    const [activeTab, setActiveTab] = useState("summary")
    const [historyEntries, setHistoryEntries] = useState<any[]>([])
    const [historyLoading, setHistoryLoading] = useState(false)
    const [historyLoaded, setHistoryLoaded] = useState(false)
    const [isContactSheetOpen, setIsContactSheetOpen] = useState(false)
    const { error: notifyError } = useNotification()

    const handleBack = useCallback(() => onBack(), [onBack])

    const { setHeaderOverride } = useSidebar()

    useEffect(() => {
        setHeaderOverride({
            title: detail?.headerTitle || "Detalhes da transação",
            onBack: handleBack,
            isSubPage: true
        })
        return () => setHeaderOverride(null)
    }, [detail?.headerTitle, handleBack, setHeaderOverride])

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) {
            setIsScrolled(scrollContainerRef.current.scrollTop > 5)
        }
    }, [])

    // Reactively sync with parent cache updates
    // Parent (useEntityPage) provides partial data instantly, then full data when background fetch completes
    useEffect(() => {
        if (initialDetail) {
            setDetail(initialDetail)
            setLoading(false)
        }
    }, [initialDetail])

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
        return <ERPDetailLoading key="loading-tx-view" />
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
        subtitleParts.push(`${detail.transactionType === "refund" ? "Reembolsado" : "Pago"} em ${detail.paymentDateSubtitle}`)
    }
    const subtitleLeft = subtitleParts.join(" • ")

    const PaymentRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
        <div className="flex justify-between items-start text-[14px] gap-4">
            <span className="text-brand-inactive-text dark:text-dark-body font-medium">{label}</span>
            <div className="text-right">{value}</div>
        </div>
    )

    const transferAccountTypeLabel = (type?: string | null) => {
        if (type === "bank") return "Conta bancária"
        if (type === "wallet") return "Carteira digital"
        return "Caixa"
    }

    const transferAccountIcon = (type?: string | null) => {
        if (type === "bank") return <BankIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
        if (type === "wallet") return <DigitalWalletIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
        return <CashierIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
    }

    const manualEntryIcon =
        detail.transactionType === "income"
            ? MoneyIcon
            : detail.transactionType === "expense"
                ? ArrowRightIcon
                : detail.transactionType === "refund"
                    ? ReturnIcon
                    : AdjustIcon

    const isCancelled = String(detail.statusLabel || "").toLowerCase().includes("cancel")

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                {/* Back button - desktop only */}
                                <div className={`absolute -left-12 top-7 h-full hidden lg:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                {/* Title row */}
                                <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span className="hidden md:inline truncate">{detail.headerTitle}</span>
                                            <Badge variant={detail.statusVariant}>{detail.statusLabel}</Badge>
                                            {detail.isRecurring && (
                                                <Badge variant="purple" className="whitespace-nowrap">
                                                    Recorrente
                                                </Badge>
                                            )}
                                        </h1>

                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            <span>{subtitleLeft}</span>
                                            <span className="mx-2">•</span>
                                            <span>Criado por {detail.creatorName}</span>
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        <ActionsDropdown onPrint={() => window.print()} onShare={() => { }} />
                                        {detail.canEdit && (
                                            <Button onClick={() => onEdit(transactionId)} className="whitespace-nowrap" leftIcon={<EditIcon size={18} />}>
                                                Editar
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="summary">Resumo</TabsTrigger>
                                        <TabsTrigger value="attachments">Anexos</TabsTrigger>
                                        <TabsTrigger value="history">Histórico</TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        {/* Tab Content */}
                        <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            <Tabs value={activeTab} onValueChange={setActiveTab}>
                                <TabsContent value="summary" className="mt-0">
                                    <div className="grid grid-cols-12 gap-y-8 md:gap-y-0 relative">
                                        <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                                            {/* Mobile Contact Section at the top */}
                                            {detail.contactCard && (detail.contactCard.name || detail.contactCard.title) && (
                                                <div className="lg:hidden mb-6">
                                                    <FormSection title="" className="mt-0">
                                                        <ListItem
                                                            left={
                                                                <UserProfileImage
                                                                    fullName={detail.contactCard.name || detail.contactCard.title || "Contato"}
                                                                    className="w-10 h-10 text-base"
                                                                />
                                                            }
                                                            title={
                                                                detail.contactCard.isCustomer
                                                                    ? (detail.contactCard.name || "Consumidor Final")
                                                                    : (detail.contactCard.name || "-")
                                                            }
                                                            description={
                                                                detail.contactCard.isCustomer
                                                                    ? (detail.contactCard.email || "Sem e-mail cadastrado")
                                                                    : detail.contactCard.title
                                                            }
                                                            className="border-0 bg-transparent px-0 hover:bg-transparent"
                                                            showChevron={true}
                                                            onClick={() => setIsContactSheetOpen(true)}
                                                        />
                                                    </FormSection>
                                                </div>
                                            )}
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

                                            <FormSection title={detail.installmentBreakdown?.length ? "Parcelas da transação" : "Itens da Transação"} hasSeparator>
                                                <div className="space-y-4">
                                                    {detail.installmentBreakdown?.length ? (
                                                        <InstallmentParcelsTable
                                                            rows={
                                                                detail.installmentBreakdown.map(
                                                                    (row): InstallmentParcelRow => ({
                                                                        id: row.id,
                                                                        installmentNumber: row.installmentNumber,
                                                                        totalCount: row.totalCount,
                                                                        status: row.status,
                                                                        originalAmount: row.originalAmount,
                                                                        paidAmount: row.paidAmount,
                                                                        interestAmount: row.interestAmount,
                                                                        discountAmount: row.discountAmount,
                                                                        dueDate: row.dueDate,
                                                                        finalizationDate: row.paymentDate,
                                                                        paymentType: row.paymentType,
                                                                        reason: detail.categoryLine,
                                                                        reference: detail.headerTitle,
                                                                        remainingAmount: row.remainingAmount,
                                                                    }),
                                                                )
                                                            }
                                                        />
                                                    ) : detail.transactionDetailKind === "transfer" && detail.transferAccounts ? (
                                                        <div className="space-y-3">
                                                            <div className="flex items-center gap-3">
                                                                <ListItem
                                                                    className="border-0 px-0 py-0 rounded-none bg-transparent hover:border-transparent hover:bg-transparent flex-1 cursor-default"
                                                                    icon={<div className="w-5 h-5">{transferAccountIcon(detail.transferAccounts.from?.type)}</div>}
                                                                    title={detail.transferAccounts.from?.name || "Conta de origem"}
                                                                    description={transferAccountTypeLabel(detail.transferAccounts.from?.type)}
                                                                    right={
                                                                        <span className="font-bold text-sm text-brand-red shrink-0">
                                                                            - {formatCurrency(detail.transferAccounts.amount)}
                                                                        </span>
                                                                    }
                                                                />
                                                                <div className="h-10 border-r border-brand-border dark:border-dark-border" />
                                                                <ListItem
                                                                    className="border-0 px-0 py-0 rounded-none bg-transparent hover:border-transparent hover:bg-transparent flex-1 cursor-default"
                                                                    icon={<div className="w-5 h-5">{transferAccountIcon(detail.transferAccounts.to?.type)}</div>}
                                                                    title={detail.transferAccounts.to?.name || "Conta de destino"}
                                                                    description={transferAccountTypeLabel(detail.transferAccounts.to?.type)}
                                                                    right={
                                                                        <span className="font-bold text-sm text-brand-green shrink-0">
                                                                            + {formatCurrency(detail.transferAccounts.amount)}
                                                                        </span>
                                                                    }
                                                                />
                                                            </div>
                                                        </div>
                                                    ) : (detail.transactionType === "refund" || detail.categoryLine === "Reembolso" || detail.categoryLine === "Refund" || detail.categoryLine === "Crédito em loja" || detail.categoryLine === "Store Credit Liability" || detail.categoryLine.toLowerCase().includes("comiss") || detail.isRecurring || detail.categoryLine === "Vendas") ? (
                                                        <ListItem
                                                            className="border-0 px-0 py-2 rounded-none bg-transparent hover:border-transparent hover:bg-transparent cursor-default"
                                                            icon={(() => {
                                                                if (detail.transactionType === "refund" || detail.categoryLine === "Reembolso" || detail.categoryLine === "Refund") return ReturnIcon;
                                                                if (detail.categoryLine === "Crédito em loja" || detail.categoryLine === "Store Credit Liability") return DigitalWalletIcon;
                                                                if (detail.categoryLine.toLowerCase().includes("comiss")) return TrendingUpIcon;
                                                                if (detail.isRecurring) return RepeatIcon;
                                                                return ShoppingCartIcon;
                                                            })()}
                                                            title={detail.headerTitle || "Transação"}
                                                            description={detail.originSource || "Sistema"}
                                                            right={
                                                                <span className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading shrink-0">
                                                                    {formatCurrency(detail.amount)}
                                                                </span>
                                                            }
                                                        />
                                                    ) : detail.transactionDetailKind === "manual_entry" ? (
                                                        detail.items.map((item) => (
                                                            <ListItem
                                                                className="border-0 px-0 py-2 rounded-none bg-transparent hover:border-transparent hover:bg-transparent cursor-default"
                                                                key={item.id}
                                                                icon={manualEntryIcon}
                                                                title={item.sku || item.title}
                                                                right={
                                                                    <span className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading shrink-0">
                                                                        {formatCurrency(item.lineTotal)}
                                                                    </span>
                                                                }
                                                            />
                                                        ))
                                                    ) : (
                                                        detail.items.map((item) => (
                                                            <div key={item.id} className="flex items-start gap-4">
                                                                {!detail.transactionItemsCompact && (
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
                                                                )}
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex justify-between items-start mb-1 gap-3">
                                                                        <h4 className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading truncate">{item.title}</h4>
                                                                        <span className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading shrink-0">
                                                                            {formatCurrency(item.lineTotal)}
                                                                        </span>
                                                                    </div>
                                                                    {!detail.transactionItemsCompact && (
                                                                        <>
                                                                            <div className="text-xs text-brand-inactive-text dark:text-dark-body uppercase mb-2">SKU: {item.sku}</div>
                                                                            <div className="flex items-center gap-2 text-xs text-brand-inactive-text dark:text-dark-body">
                                                                                <span>
                                                                                    {formatQuantityWithUnit(item.quantity, (item as any).unit || (item as any).product?.unit)} • {formatUnitPriceWithUnit(item.unitPrice, (item as any).unit || (item as any).product?.unit)}
                                                                                </span>
                                                                            </div>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </FormSection>

                                            <FormSection title="Detalhes da Transação" hasSeparator>
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
                                                    {detail.paymentMethodSubtitle && (
                                                        <PaymentRow
                                                            label="Meio de pagamento"
                                                            value={
                                                                <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                                                    {detail.paymentMethodSubtitle}
                                                                </span>
                                                            }
                                                        />
                                                    )}
                                                    {detail.showDueDateRow && (
                                                        <PaymentRow
                                                            label="Data de vencimento"
                                                            value={
                                                                <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                                                    {detail.dueDateLine || "-"}
                                                                </span>
                                                            }
                                                        />
                                                    )}
                                                    {detail.paymentDateLine && (
                                                        <PaymentRow
                                                            label={detail.paymentDateRowLabel || "Data de pagamento"}
                                                            value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{detail.paymentDateLine}</span>}
                                                        />
                                                    )}
                                                    {detail.goalBonusDetails && (
                                                        <>
                                                            <PaymentRow
                                                                label="Meta"
                                                                value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{detail.goalBonusDetails.goalName}</span>}
                                                            />
                                                            <PaymentRow
                                                                label="Pago para"
                                                                value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{detail.goalBonusDetails.paidToUserNames.join(", ") || "-"}</span>}
                                                            />
                                                            {detail.goalBonusDetails.achievedAt && (
                                                                <PaymentRow
                                                                    label="Meta batida em"
                                                                    value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{detail.goalBonusDetails.achievedAt}</span>}
                                                                />
                                                            )}
                                                        </>
                                                    )}
                                                    {detail.notesLine && (
                                                        <PaymentRow
                                                            label="Observações"
                                                            value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm whitespace-pre-wrap">{detail.notesLine}</span>}
                                                        />
                                                    )}
                                                    {(() => {
                                                        const isSinglePayment = !detail.installmentBreakdown?.length && !detail.isRecurring;
                                                        const hasFeesOrDiscount = !!((detail.interestAmount && detail.interestAmount > 0) || (detail.discountAmount && detail.discountAmount > 0));
                                                        if (!isSinglePayment || !hasFeesOrDiscount) return null;
                                                        return (
                                                            <>
                                                                {detail.originalAmount !== null && detail.originalAmount !== undefined && detail.originalAmount > 0 && (
                                                                    <PaymentRow
                                                                        label="Valor original"
                                                                        value={<span className="text-brand-inactive-text dark:text-dark-body font-bold text-sm">{formatCurrency(detail.originalAmount)}</span>}
                                                                    />
                                                                )}
                                                                {detail.interestAmount !== null && detail.interestAmount !== undefined && detail.interestAmount > 0 && (
                                                                    <PaymentRow
                                                                        label="Juros / Taxas"
                                                                        value={<span className="text-brand-red font-bold text-sm">+ {formatCurrency(detail.interestAmount)}</span>}
                                                                    />
                                                                )}
                                                                {detail.discountAmount !== null && detail.discountAmount !== undefined && detail.discountAmount > 0 && (
                                                                    <PaymentRow
                                                                        label="Desconto"
                                                                        value={<span className="text-brand-green font-bold text-sm">- {formatCurrency(detail.discountAmount)}</span>}
                                                                    />
                                                                )}
                                                            </>
                                                        );
                                                    })()}
                                                    {(() => {
                                                        const isPaid = String(detail.statusLabel || "").toLowerCase() === "pago" || String(detail.statusLabel || "").toLowerCase() === "recebido" || detail.timeline.step2.active;

                                                        return (
                                                            <div className="flex justify-between items-center pt-4 border-t border-brand-border dark:border-dark-border mt-3">
                                                                <span className="font-bold text-lg text-brand-dark dark:text-dark-heading">
                                                                    {isPaid ? "Total pago" : "Total"}
                                                                </span>
                                                                <span
                                                                    className={`font-bold text-2xl tracking-tight ${detail.ledgerDirection === "in" ? "text-brand-green" : "text-brand-red"}`}
                                                                >
                                                                    {detail.ledgerDirection === "in" ? "+ " : "- "}
                                                                    {formatCurrency(detail.amount)}
                                                                </span>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </FormSection>
                                        </div>

                                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 space-y-6 border-0 lg:border-l border-brand-border dark:border-dark-border">
                                            {isCancelled && (
                                                <InfoCard
                                                    title="Transação cancelada"
                                                    message={detail.notesLine || "Esta transação foi cancelada."}
                                                    color="orange"
                                                />
                                            )}
                                            {detail.goalBonusDetails ? (
                                                <TransactionGoalCard
                                                    goalName={detail.goalBonusDetails.goalName}
                                                    paidTo={detail.goalBonusDetails.paidToUserNames}
                                                    achievedAt={detail.goalBonusDetails.achievedAt}
                                                    amount={detail.amount}
                                                />
                                            ) : detail.contactCard.isCustomer ? (
                                                <div className="hidden lg:block">
                                                    <CustomerCard
                                                        customer={{
                                                            id: detail.contactCard.id ?? undefined,
                                                            name: detail.contactCard.name,
                                                            email: detail.contactCard.email ?? undefined,
                                                            phone: detail.contactCard.phone ?? undefined,
                                                            image_url: detail.contactCard.image_url ?? undefined,
                                                        }}
                                                        address={detail.contactCard.address || undefined}
                                                        billingAddress={detail.contactCard.billingAddress || undefined}
                                                        showMap={false}
                                                    />
                                                </div>
                                            ) : (
                                                <div className="hidden lg:block">
                                                    <TransactionContactCard
                                                        title={detail.contactCard.title}
                                                        name={detail.contactCard.name}
                                                        email={detail.contactCard.email ?? undefined}
                                                        phone={detail.contactCard.phone ?? undefined}
                                                        imageUrl={detail.contactCard.image_url ?? undefined}
                                                        address={detail.contactCard.address || undefined}
                                                        billingAddress={detail.contactCard.billingAddress || undefined}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="attachments" className="mt-0">
                                    <GenericAttachmentsTab
                                        entityId={transactionId}
                                        partnerId={partnerId}
                                        entityType="transaction"
                                        title="Comprovantes e Anexos"
                                        subtitle="Visualize os comprovantes, faturas ou contratos desta transação."
                                        isEditing={false}
                                        readOnly={true}
                                    />
                                </TabsContent>

                                <TabsContent value="history" className="mt-0">
                                    <TransactionHistoryTab entries={historyEntries} loading={historyLoading} />
                                </TabsContent>
                            </Tabs>
                        </div>
                    </div>

                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                        <ActionsDropdown
                            onPrint={() => window.print()}
                            onShare={() => { }}
                            trigger={
                                <Button variant="outline" className="flex-1" leftIcon={<ThreeDotsIcon size={18} />}>
                                    Opções
                                </Button>
                            }
                        />
                        {detail.canEdit && (
                            <Button onClick={() => onEdit(transactionId)} className="flex-1 whitespace-nowrap" leftIcon={<EditIcon size={18} />}>
                                Editar
                            </Button>
                        )}
                    </div>
                </Tabs>
                <BottomSheet
                    isOpen={isContactSheetOpen}
                    onClose={() => setIsContactSheetOpen(false)}
                    title={detail.contactCard?.isCustomer ? "Detalhes do Cliente" : "Detalhes do Contato"}
                >
                    <div className="pt-2">
                        {detail.contactCard?.isCustomer ? (
                            <CustomerCard
                                customer={{
                                    id: detail.contactCard?.id ?? undefined,
                                    name: detail.contactCard.name,
                                    email: detail.contactCard.email ?? undefined,
                                    phone: detail.contactCard.phone ?? undefined,
                                    image_url: detail.contactCard.image_url ?? undefined,
                                }}
                                address={detail.contactCard?.address || undefined}
                                billingAddress={detail.contactCard?.billingAddress || undefined}
                                showMap={false}
                            />
                        ) : (
                            <TransactionContactCard
                                title={detail.contactCard?.title || "Contato"}
                                name={detail.contactCard?.name || "-"}
                                email={detail.contactCard?.email ?? undefined}
                                phone={detail.contactCard?.phone ?? undefined}
                                imageUrl={detail.contactCard?.image_url ?? undefined}
                                address={detail.contactCard?.address || undefined}
                                billingAddress={detail.contactCard?.billingAddress || undefined}
                            />
                        )}
                    </div>
                </BottomSheet>
            </div>
        </FadeIn>
    )
}
