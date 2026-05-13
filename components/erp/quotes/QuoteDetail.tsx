"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    ChevronLeftIcon,
    CancelCircleIcon,
    FileIcon,
    AlertTriangleIcon,
    ArrowRightIcon,
    UploadIcon,
    EditIcon,
    ThreeDotsIcon,
    TelegramIcon,
    ClockIcon,
    CheckCircleIcon
} from '@/lib/icons';
import { Button, Badge, ActionsDropdown, ThreeDotsLoader, FormDropdown, Tooltip, AlertModal, InfoCard, DefaultModal, DropdownItem } from '@/components/reusable';
import { getQuoteDetailsAction, updateQuoteStatusAction, deleteQuoteAction, convertQuoteToOrderAction, getQuoteHistoryAction } from '@/app/actions/erp/quotes';
import { useCSRFToken } from "@/hooks/use-csrf-token"
import { QuoteHistoryTab } from "./QuoteHistoryTab"
import { type HistoryEntry as QuoteHistoryEntryRow } from "@/components/erp/shared/HistoryTimeline"
import { useNotification } from "@/hooks/use-notification";
import CustomerCard from '@/components/reusable/CustomerCard';
import { useSidebar } from "@/lib/sidebar-context";
import { usePermissions } from "@/lib/permission-context";
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal";
import { getNextPlanTarget, isPlanLimitReachedError } from "@/lib/subscription/limit-upgrade";
import { useRouter } from "next/navigation";
import { useDebouncedRefresh } from "@/hooks/use-debounced-refresh";
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url";
import { formatCurrency, formatDate, formatDayMonth, formatTime } from '@/lib/utils';
import { FadeIn } from '@/components/animations/FadeIn';

interface QuoteDetailProps {
    quoteId: string;
    partnerId: string;
    onBack: () => void;
    onEditQuote?: (quote: any) => void;
    initialQuote?: any;
}

const getStatusInfo = (s: string) => {
    switch (s) {
        case 'sent': return { label: 'Enviado', variant: 'blue' as const, icon: <TelegramIcon size={12} />, color: 'bg-blue-500' };
        case 'approved': return { label: 'Aprovado', variant: 'green' as const, icon: undefined, color: 'bg-green-500' };
        case 'rejected': return { label: 'Rejeitado', variant: 'red' as const, icon: undefined, color: 'bg-red-500' };
        case 'expired': return { label: 'Expirado', variant: 'orange' as const, icon: <ClockIcon size={12} />, color: 'bg-orange-500' };
        case 'draft': return { label: 'Rascunho', variant: 'gray' as const, icon: <FileIcon size={12} />, color: 'bg-gray-400' };
        default: return { label: s, variant: 'gray' as const, icon: <FileIcon size={12} />, color: 'bg-gray-400' };
    }
};

const QuoteItem = ({ image, name, sku, qty, price, total }: any) => (
    <div className="flex items-start gap-4 p-4 border-b border-brand-border dark:border-dark-border last:border-0 hover:bg-brand-gray/20 dark:hover:bg-dark-border/10 transition-colors">
        <div className="w-16 h-16 overflow-hidden shrink-0 rounded-full border border-brand-border dark:border-dark-border">
            <img
                src={image}
                className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal rounded-lg transition-transform"
                alt={name}
                onError={(e: any) => { e.target.src = "https://img.dudit.com.br/static/Placeholder.png" }}
            />
        </div>
        <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start mb-1">
                <h4 className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading truncate">{name}</h4>
                <span className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading">{formatCurrency(total)}</span>
            </div>
            <div className="text-xs text-brand-inactive-text dark:text-dark-body uppercase mb-2">{sku}</div>
            <div className="flex items-center gap-2 text-xs text-brand-inactive-text dark:text-dark-body">
                <span>{qty} un. • {formatCurrency(price)} / un.</span>
            </div>
        </div>
    </div>
);

const QuoteDetail = ({ quoteId, partnerId, onBack, onEditQuote, initialQuote }: QuoteDetailProps) => {
    const [isScrolled, setIsScrolled] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [quote, setQuote] = useState<any>(initialQuote || null);
    const [loading, setLoading] = useState(!initialQuote);
    const [isLoadingQuoteItems, setIsLoadingQuoteItems] = useState(Boolean(initialQuote));
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [pendingStatus, setPendingStatus] = useState(initialQuote?.status || 'draft');
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showUnapprovedConvertModal, setShowUnapprovedConvertModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isConverting, setIsConverting] = useState(false);
    const [historyEntries, setHistoryEntries] = useState<QuoteHistoryEntryRow[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const csrfToken = useCSRFToken();
    const { success: notifySuccess, error: notifyError } = useNotification();
    const { planSlug } = usePermissions();
    const { openPlanUpgrade } = usePlanUpgrade();
    const router = useRouter();
    const debouncedRefresh = useDebouncedRefresh();
    const { setHeaderOverride } = useSidebar();

    const handleBack = useCallback(() => onBack(), [onBack]);

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) {
            setIsScrolled(scrollContainerRef.current.scrollTop > 5);
        }
    }, []);

    useEffect(() => {
        if (initialQuote && initialQuote.items) {
            setQuote(initialQuote);
            setPendingStatus(initialQuote.status || 'draft');
            setLoading(false);
            setIsLoadingQuoteItems(false);
            return;
        }
        async function load() {
            setIsLoadingQuoteItems(true);
            if (!initialQuote) setLoading(true);
            const res = await getQuoteDetailsAction(quoteId, partnerId);
            if (res.success) {
                setQuote(res.data);
                setPendingStatus(res.data.status || 'draft');
            } else if (!initialQuote) {
                notifyError("Erro", res.error);
                onBack();
            }
            setLoading(false);
            setIsLoadingQuoteItems(false);
        }
        load();
    }, [quoteId, partnerId, initialQuote, notifyError, onBack]);

    useEffect(() => {
        let cancelled = false;
        async function loadHistory() {
            setHistoryLoading(true);
            const res = await getQuoteHistoryAction(quoteId, partnerId);
            if (!cancelled && res.success && res.data) {
                setHistoryEntries(
                    (res.data as any[]).map((e) => ({
                        id: e.id,
                        actor_name: e.actor_name,
                        change_lines: e.change_lines,
                        created_at: e.created_at,
                    }))
                );
            }
            if (!cancelled) setHistoryLoading(false);
        }
        loadHistory();
        return () => { cancelled = true; };
    }, [quoteId, partnerId]);

    const runConvert = async (acknowledgeUnapprovedConversion: boolean) => {
        setIsConverting(true);
        try {
            const res = await convertQuoteToOrderAction({
                quoteId,
                partnerId,
                csrf_token: csrfToken || undefined,
                acknowledgeUnapprovedConversion,
            });
            if (!res.success) {
                const errorMsg = res.error || "Erro desconhecido";
                if (isPlanLimitReachedError(errorMsg)) {
                    const target = getNextPlanTarget(planSlug)
                    if (target) openPlanUpgrade(target)
                    return;
                }
                notifyError("Não foi possível converter", errorMsg);
                return;
            }
            const d = res.data as { orderId: string; orderNumber?: string | null; alreadyConverted?: boolean };
            notifySuccess(
                d.alreadyConverted ? "Pedido já existente" : "Pedido criado",
                d.alreadyConverted
                    ? "Este orçamento já havia sido convertido. Abrindo o pedido."
                    : `Venda ${d.orderNumber || d.orderId} criada com sucesso.`
            );
            setQuote((prev: any) =>
                prev ? { ...prev, converted: true, converted_order_id: d.orderId } : prev
            );
            debouncedRefresh();
            router.push(`/erp/orders/${d.orderId}`);
        } catch {
            notifyError("Erro", "Falha de conexão ao converter o orçamento.");
        } finally {
            setIsConverting(false);
            setShowUnapprovedConvertModal(false);
        }
    };

    const handleConvertClick = () => {
        if (!quote || quote.converted) return;
        if (quote.status === "sent") {
            setShowUnapprovedConvertModal(true);
            return;
        }
        void runConvert(false);
    };

    const handleOpenStatusModal = () => {
        if (quote?.converted) return;
        setPendingStatus(quote?.status || 'draft');
        setShowStatusModal(true);
    };

    const handleStatusChange = async (nextStatus?: string) => {
        const statusToSave = nextStatus || pendingStatus;
        if (!statusToSave || statusToSave === quote?.status) {
            setShowStatusModal(false);
            return;
        }

        setIsUpdatingStatus(true);
        const res = await updateQuoteStatusAction({ quoteId, partnerId, status: statusToSave });
        if (res.success) {
            setQuote((prev: any) => ({ ...prev, status: statusToSave }));
            setPendingStatus(statusToSave);
            notifySuccess("Sucesso", "Status atualizado!");
            debouncedRefresh();
            setShowStatusModal(false);
        } else {
            notifyError("Erro", res.error);
        }
        setIsUpdatingStatus(false);
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            const res = await deleteQuoteAction(quoteId);
            if (res.success) {
                notifySuccess("Orçamento excluído", "O orçamento foi removido com sucesso.");
                debouncedRefresh();
                onBack();
            } else {
                notifyError("Erro ao excluir", "Não foi possível remover o orçamento.");
            }
        } catch (error) {
            notifyError("Erro fatal", "Erro de conexão ao excluir orçamento.");
        } finally {
            setIsDeleting(false);
            setShowDeleteModal(false);
        }
    };

    const pageTitle = quote ? `Orçamento ${quote.quote_number || `#${quote.id.substring(0, 8)}`}` : "Carregando Orçamento...";

    useEffect(() => {
        setHeaderOverride({
            title: pageTitle,
            onBack: onBack,
            isSubPage: true
        });
        return () => setHeaderOverride(null);
    }, [pageTitle, onBack, setHeaderOverride]);

    if (loading) return <div className="h-full flex items-center justify-center bg-white dark:bg-dark-surface"><ThreeDotsLoader /></div>;
    if (!quote) return null;

    const statusInfo = getStatusInfo(quote.status);
    const subtotal = Number(quote.subtotal || 0);
    const discount = Number(quote.discount_value || 0);
    const shipping = Number(quote.shipping_cost || 0);
    const additional = Number(quote.additional_costs || 0);
    const total = Number(quote.total || 0);

    const formattedIssueDate = quote.issue_date ? formatDate(quote.issue_date) : '-';
    const formattedExpiryDate = quote.expiration_date ? formatDate(quote.expiration_date) : '-';

    const getTimelineSteps = (status: string) => {
        const baseDateObj = quote.created_at ? new Date(quote.created_at) : (quote.issue_date ? new Date(quote.issue_date + 'T12:00:00') : new Date());
        const baseDate = formatDayMonth(baseDateObj);
        const baseTime = formatTime(baseDateObj);

        const steps = [
            { label: 'Criado', date: baseDate, time: baseTime, active: true },
            { label: 'Enviado', date: '', time: '', active: ['sent', 'approved', 'rejected'].includes(status) },
            { label: 'Aprovação', date: '', time: '', active: ['approved', 'rejected'].includes(status) }
        ];

        if (status !== 'draft') {
            steps[1].date = baseDate;
        }

        if (status === 'approved') {
            steps[2].label = 'Aprovado';
        } else if (status === 'rejected') {
            steps[2].label = 'Recusado';
        }

        if (['approved', 'rejected'].includes(status)) {
            const updatedDateObj = quote.updated_at ? new Date(quote.updated_at) : new Date();
            steps[2].date = formatDayMonth(updatedDateObj);
            steps[2].time = formatTime(updatedDateObj);
        }

        return steps;
    };

    const timelineSteps = getTimelineSteps(quote.status);

    const canConvertToOrder =
        (quote.status === "approved" || quote.status === "sent")
        && !quote.converted
        && quote.status !== "expired";

    return (
        <FadeIn className="h-full">
            <div className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300 relative">
                <div
                    ref={scrollContainerRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-y-auto no-scrollbar scroll-smooth"
                >
                    {/* Sticky Header */}
                    <div className={`sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out`}>
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
                            {/* Back button - desktop only */}
                            <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                            </div>

                            {/* Title row */}
                            <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                    <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                        <span className="hidden md:inline truncate">{pageTitle}</span>
                                        <Badge variant={statusInfo.variant} icon={statusInfo.icon}>
                                            {statusInfo.label}
                                        </Badge>
                                    </h1>
                                    <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                        Criado em {formattedIssueDate} • Válido até {formattedExpiryDate}
                                    </div>
                                </div>

                                {/* Desktop action buttons */}
                                <div className="hidden md:flex items-center gap-3 shrink-0 ml-3 pb-4">
                                    <ActionsDropdown
                                        onPrint={() => { }}
                                        onEmail={() => { }}
                                        onShare={() => { }}
                                        onDelete={() => setShowDeleteModal(true)}
                                        onDuplicate={() => { }}
                                    >
                                        {!quote.converted && (
                                            <DropdownItem onClick={handleOpenStatusModal}>
                                                <CheckCircleIcon className="w-4 h-4" /> Alterar status
                                            </DropdownItem>
                                        )}
                                    </ActionsDropdown>

                                    <Button onClick={() => onEditQuote && onEditQuote(quote)} className="whitespace-nowrap">
                                        <EditIcon className="w-[18px] h-[18px] mr-2" />
                                        Editar orçamento
                                    </Button>
                                </div>
                            </div>
                            <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}></div>
                        </div>
                    </div>

                    {/* CONTENT */}
                    <div className="max-w-[1300px] mx-auto p-4 md:p-6 pt-6">
                        <div className="grid grid-cols-12 gap-y-8 md:gap-y-0 relative">
                            {/* LEFT COLUMN */}
                            <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                {/* Quote Status Card */}
                                <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden mb-8">
                                    <div className={`p-6 border-b text-left ${quote.converted ? 'bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800' :
                                        quote.status === 'approved' ? 'bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-900/20' :
                                            quote.status === 'rejected' ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/20' :
                                                'bg-[#eff6ff] dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/30'
                                        }`}>
                                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                                            <div>
                                                <h3 className={`font-bold text-lg mb-1 ${quote.converted ? 'text-slate-900 dark:text-slate-100' :
                                                    quote.status === 'approved' ? 'text-green-900 dark:text-green-100' :
                                                        quote.status === 'rejected' ? 'text-red-900 dark:text-red-100' :
                                                            'text-blue-900 dark:text-blue-100'
                                                    }`}>
                                                    {quote.converted ? 'Convertido em pedido' :
                                                        quote.status === 'approved' ? 'Orçamento Aprovado' :
                                                            quote.status === 'rejected' ? 'Orçamento Recusado' :
                                                                quote.status === 'draft' ? 'Aguardando Revisão' :
                                                                    'Aguardando Aprovação'}
                                                </h3>
                                                <p className={`text-sm ${quote.converted ? 'text-slate-700 dark:text-slate-300' :
                                                    quote.status === 'approved' ? 'text-green-700 dark:text-green-300' :
                                                        quote.status === 'rejected' ? 'text-red-700 dark:text-red-300' :
                                                            'text-blue-700 dark:text-blue-300'
                                                    }`}>
                                                    {quote.converted
                                                        ? "Este orçamento já gerou um pedido no ERP. Use o botão abaixo para abrir a venda."
                                                        : quote.status === 'approved' ? 'Esta proposta foi aprovada e já pode ser convertida em pedido.' :
                                                            quote.status === 'rejected' ? 'Esta proposta foi recusada pelo cliente.' :
                                                                'Esta proposta foi enviada ao cliente e aguarda resposta.'}
                                                </p>
                                                {quote.converted && quote.converted_order_id && (
                                                    <Button
                                                        variant="outline"
                                                        className="mt-3 h-[36px] text-xs"
                                                        onClick={() => router.push(`/erp/orders/${quote.converted_order_id}`)}
                                                    >
                                                        Abrir pedido <ArrowRightIcon size={14} className="ml-1" />
                                                    </Button>
                                                )}
                                            </div>
                                            {canConvertToOrder && (
                                                <Button
                                                    variant="default"
                                                    className="bg-blue-600 hover:bg-blue-700 text-white border-none h-[38px] text-xs px-6 shrink-0"
                                                    disabled={isConverting}
                                                    onClick={handleConvertClick}
                                                >
                                                    {isConverting ? "Convertendo…" : "Converter em Pedido"} <ArrowRightIcon size={14} className="ml-1" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="bg-white dark:bg-dark-surface px-12 pt-12 pb-12">
                                        <div className="relative px-4">
                                            <div className="relative h-1.5 w-full bg-gray-100 dark:bg-dark-border/50 rounded-full flex items-center justify-between">
                                                <div
                                                    className={`absolute left-0 h-full rounded-full transition-all duration-500 ${quote.status === 'rejected' ? 'bg-brand-red' : 'bg-brand-dark dark:bg-dark-heading'}`}
                                                    style={{ width: `${(timelineSteps.filter(s => s.active).length - 1) * 50}%` }}
                                                ></div>

                                                {timelineSteps.map((step, idx) => (
                                                    <div key={idx} className="relative flex flex-col items-center">
                                                        <div className="absolute bottom-6 whitespace-nowrap flex flex-col items-center">
                                                            <span className={`text-xs font-medium ${step.active ? (quote.status === 'rejected' && idx === 2 ? 'text-brand-red' : 'text-brand-dark dark:text-dark-heading') : 'text-gray-400 dark:text-dark-body'}`}>
                                                                {step.label}
                                                            </span>
                                                        </div>
                                                        <div className={`w-4 h-4 rounded-full border-2 z-10 transition-colors duration-300 flex items-center justify-center ${step.active ? (quote.status === 'rejected' && idx === 2 ? 'bg-brand-red border-red-500' : 'bg-brand-dark dark:bg-dark-heading border-brand-dark dark:border-dark-heading') : 'bg-white dark:bg-dark-surface border-gray-300 dark:border-dark-border'}`}>
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

                                {/* Items List */}
                                <div className="mt-8">
                                    <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Itens da Proposta</h3>
                                    <div className="space-y-0">
                                        {isLoadingQuoteItems ? (
                                            <div className="flex items-center justify-center py-14">
                                                <ThreeDotsLoader />
                                            </div>
                                        ) : (
                                            quote.items?.map((item: any) => (
                                                <QuoteItem
                                                    key={item.id}
                                                    image={getR2ImageUrl(item.products?.images?.[0] || item.product?.image, "thumbnail")}
                                                    name={item.custom_name || item.products?.name || "Produto sem nome"}
                                                    sku={item.products?.sku || "N/A"}
                                                    qty={item.quantity}
                                                    price={item.unit_price}
                                                    total={item.quantity * item.unit_price}
                                                />
                                            ))
                                        )}
                                    </div>
                                </div>

                                <div className="mt-8">
                                    <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Resumo Financeiro</h3>
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center text-[14px]">
                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Subtotal ({quote.items?.length || 0} itens)</span>
                                            <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(subtotal)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[14px]">
                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Desconto</span>
                                            <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(discount)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[14px]">
                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Frete</span>
                                            <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(shipping)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[14px]">
                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Outros Custos</span>
                                            <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(additional)}</span>
                                        </div>
                                        <div className="flex justify-between items-center pt-4 border-t border-brand-border dark:border-dark-border mt-3">
                                            <span className="font-bold text-base md:text-lg text-brand-dark dark:text-dark-heading">Total do Orçamento</span>
                                            <span className="font-bold text-xl md:text-2xl text-brand-dark dark:text-dark-heading tracking-tight text-right">{formatCurrency(total)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT COLUMN - SIDEBAR */}
                            <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                {quote.customers && (
                                    <CustomerCard
                                        customer={quote.customers}
                                    />
                                )}
                                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6">
                                    <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading mb-4">Informações Adicionais</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <span className="text-xs text-brand-inactive-text block mb-1">Vendedor</span>
                                            <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">{quote.user_profiles?.full_name || 'N/A'}</span>
                                        </div>
                                        {quote.internal_notes && (
                                            <div>
                                                <span className="text-xs text-brand-inactive-text block mb-1">Observações Internas</span>
                                                <p className="text-sm text-brand-dark dark:text-dark-heading bg-brand-gray/50 dark:bg-dark-border/30 p-3 rounded-xl">{quote.internal_notes}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <QuoteHistoryTab entries={historyEntries} loading={historyLoading} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mobile Bottom Action Bar */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3 shadow-lg">
                    <ActionsDropdown
                        onPrint={() => { }}
                        onEmail={() => { }}
                        onShare={() => { }}
                        onDelete={() => setShowDeleteModal(true)}
                        onDuplicate={() => { }}
                        trigger={
                            <Button variant="outline" className="flex-1">
                                <ThreeDotsIcon className="w-4 h-4 mr-2" /> Opções
                            </Button>
                        }
                    >
                        {!quote.converted && (
                            <DropdownItem onClick={handleOpenStatusModal}>
                                <CheckCircleIcon className="w-4 h-4" /> Alterar status
                            </DropdownItem>
                        )}
                    </ActionsDropdown>
                    {canConvertToOrder && (
                        <Button
                            variant="default"
                            className="flex-1 whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white border-none"
                            disabled={isConverting}
                            onClick={handleConvertClick}
                        >
                            <ArrowRightIcon className="w-4 h-4 mr-2" />
                            {isConverting ? "…" : "Converter"}
                        </Button>
                    )}
                    <Button onClick={() => onEditQuote && onEditQuote(quote)} className="flex-1 whitespace-nowrap">
                        <EditIcon className="w-4 h-4 mr-2" /> Editar
                    </Button>
                </div>
            </div>

            <AlertModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirm={handleDelete}
                title="Excluir Orçamento"
                description={`Você tem certeza que deseja excluir o orçamento #${quote.quote_number}? Esta ação não pode ser desfeita.`}
                confirmText="Excluir"
                cancelText="Cancelar"
                variant="danger"
                isLoading={isDeleting}
            />

            <AlertModal
                isOpen={showUnapprovedConvertModal}
                onClose={() => setShowUnapprovedConvertModal(false)}
                onConfirm={() => void runConvert(true)}
                title="Converter sem aprovação formal?"
                description="Este orçamento está apenas como Enviado, não como Aprovado. Tem certeza de que deseja gerar o pedido assim mesmo?"
                confirmText="Sim, converter"
                cancelText="Cancelar"
                variant="warning"
                isLoading={isConverting}
            />

            <DefaultModal
                isOpen={showStatusModal}
                onClose={() => !isUpdatingStatus && setShowStatusModal(false)}
                title="Alterar status do orçamento"
                maxWidth="md"
                footer={
                    <div className="flex justify-end gap-3 w-full">
                        <Button variant="outline" onClick={() => setShowStatusModal(false)} disabled={isUpdatingStatus}>Cancelar</Button>
                        <Button onClick={() => void handleStatusChange()} isLoading={isUpdatingStatus} disabled={pendingStatus === quote.status}>Salvar</Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">Selecione o novo status para este orçamento.</p>
                    <FormDropdown
                        label="Status"
                        value={pendingStatus}
                        setValue={setPendingStatus}
                        options={[
                            { value: 'draft', label: 'Rascunho' },
                            { value: 'sent', label: 'Enviado' },
                            { value: 'approved', label: 'Aprovado' },
                            { value: 'rejected', label: 'Rejeitado' }
                        ]}
                    />
                </div>
            </DefaultModal>
        </FadeIn>
    );
};

export default QuoteDetail;
