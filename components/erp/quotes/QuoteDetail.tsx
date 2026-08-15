"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    ChevronLeftIcon,
    CancelCircleIcon,
    FileIcon,
    ArrowRightIcon,
    EditIcon,
    ThreeDotsIcon,
    TelegramIcon,
    ClockIcon,
    CheckCircleIcon,
} from '@/lib/icons';
import { Button, Badge, ActionsDropdown, ThreeDotsLoader, FormDropdown, AlertModal, DefaultModal, FormSection, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/reusable';
import { getQuoteDetailsAction, updateQuoteStatusAction, deleteQuoteAction, convertQuoteToOrderAction, getQuoteHistoryAction, getPartnerAddressAction, regenerateQuoteApprovalCodeAction } from '@/app/actions/erp/quotes';
import { useCSRFToken } from "@/hooks/use-csrf-token"
import { QuoteHistoryTab } from "./QuoteHistoryTab"
import { type HistoryEntry as QuoteHistoryEntryRow } from "@/components/erp/shared/HistoryTimeline"
import { useNotification } from "@/hooks/use-notification";
import CustomerCard from '@/components/reusable/CustomerCard';
import { useSidebar } from "@/lib/sidebar-context";
import { usePermissions } from "@/lib/permission-context";
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal";
import { getNextPlanTarget, isPlanLimitReachedError } from "@/lib/subscription/limit-upgrade";
import { hasMinimumPlan, PLAN_UPGRADE_MASCOTS } from "@/lib/subscription/plan-tier";
import { useRouter } from "next/navigation";
import { useDebouncedRefresh } from "@/hooks/use-debounced-refresh";
import { formatCurrency, formatDate, formatDayMonth, formatTime, formatQuantityWithUnit, formatUnitPriceWithUnit } from '@/lib/utils';
import { FadeIn } from '@/components/animations/FadeIn';
import { useStore } from '@/lib/store-context';
import QuotePreview from './QuotePreview';
import QuotePrintModal from './QuotePrintModal';
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url";
import { ShareModal } from "@/components/marketplace/ShareModal";

interface QuoteDetailProps {
    quoteId: string;
    partnerId: string;
    onBack: () => void;
    onEditQuote?: (quote: any) => void;
    onDuplicateQuote?: (quote: any) => void;
    initialQuote?: any;
}

const getStatusInfo = (s: string) => {
    switch (s) {
        case 'sent': return { label: 'Enviado', variant: 'blue' as const, icon: <TelegramIcon size={12} />, color: 'bg-blue-500' };
        case 'pending_client': return { label: 'Pendente', variant: 'purple' as const, icon: <ClockIcon size={12} />, color: 'bg-purple-500' };
        case 'viewed': return { label: 'Visualizado', variant: 'cyan' as const, icon: <CheckCircleIcon size={12} />, color: 'bg-teal-500' };
        case 'approved': return { label: 'Aprovado', variant: 'green' as const, icon: undefined, color: 'bg-green-500' };
        case 'rejected': return { label: 'Rejeitado', variant: 'red' as const, icon: undefined, color: 'bg-red-500' };
        case 'expired': return { label: 'Expirado', variant: 'orange' as const, icon: <ClockIcon size={12} />, color: 'bg-orange-500' };
        case 'cancelled': return { label: 'Cancelado', variant: 'gray' as const, icon: <CancelCircleIcon size={12} />, color: 'bg-gray-400' };
        case 'draft': return { label: 'Rascunho', variant: 'gray' as const, icon: <FileIcon size={12} />, color: 'bg-gray-400' };
        default: return { label: s, variant: 'gray' as const, icon: <FileIcon size={12} />, color: 'bg-gray-400' };
    }
};

const formatProductQuantity = (qty: number, unit?: string | null) => {
    return formatQuantityWithUnit(qty, unit);
};

const formatProductUnitPrice = (price: number, unit?: string | null) => {
    return formatUnitPriceWithUnit(price, unit);
};

const QuoteItem = ({ image, name, sku, qty, price, total, unit }: any) => (
    <div className="flex items-start gap-4">
        <div className="w-16 h-16 overflow-hidden shrink-0 rounded-full border border-brand-border dark:border-dark-border">
            <img
                src={image}
                className="w-full h-full object-cover rounded-xl"
                alt={name}
                onError={(e: any) => { e.target.src = "https://img.dudit.com.br/static/Placeholder.png" }}
            />
        </div>
        <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <h4 className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading truncate">{name}</h4>
                </div>
                <span className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading">{formatCurrency(total)}</span>
            </div>
            <div className="text-xs text-brand-inactive-text dark:text-dark-body uppercase mb-2">SKU: {sku}</div>
            <div className="flex items-center gap-2 text-xs mt-1">
                <span className="text-brand-inactive-text">{formatProductQuantity(qty, unit)}</span>
                <span className="text-brand-border dark:text-dark-border">|</span>
                <span className="font-medium text-brand-dark dark:text-dark-heading">{formatProductUnitPrice(price, unit)}</span>
            </div>
        </div>
    </div>
);

const QuoteDetail = ({ quoteId, partnerId, onBack, onEditQuote, onDuplicateQuote, initialQuote }: QuoteDetailProps) => {
    const [isScrolled, setIsScrolled] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [quote, setQuote] = useState<any>(initialQuote || null);
    const [loading, setLoading] = useState(!initialQuote);
    const [isLoadingQuoteItems, setIsLoadingQuoteItems] = useState(Boolean(initialQuote));
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const [isRegeneratingCode, setIsRegeneratingCode] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);
    const lastLoadedQuoteId = useRef<string | null>(null);
    const lastLoadedHistoryQuoteId = useRef<string | null>(null);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [pendingStatus, setPendingStatus] = useState(initialQuote?.status || 'draft');
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
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

    const { selectedStore } = useStore();
    const partnerName = selectedStore?.name || 'Sua Loja';
    const [partnerImage, setPartnerImage] = useState(selectedStore?.image_url || '');
    const [partnerAddress, setPartnerAddress] = useState('Endereço não informado');
    const [partnerPhone, setPartnerPhone] = useState('');

    useEffect(() => {
        if (selectedStore?.image_url) setPartnerImage(selectedStore.image_url);
    }, [selectedStore?.image_url]);

    useEffect(() => {
        if (!partnerImage && partnerId) {
            const fetchPartnerImage = async () => {
                const supabase = (await import("@/lib/supabase/browser-client")).supabaseBrowser;
                const { data } = await supabase.from("stores").select("logo_url").eq("partner_id", partnerId).limit(1).maybeSingle();
                if (data?.logo_url) setPartnerImage(data.logo_url);
            };
            fetchPartnerImage();
        }
    }, [partnerImage, partnerId]);

    const partnerAvatar = partnerImage ? getR2ImageUrl(partnerImage) : '';

    const previewMeta = useMemo(() => {
        const meta = quote?.metadata || {};
        const preview = meta.preview || {};
        return {
            primaryColor: preview.primaryColor || undefined,
            secondaryColor: preview.secondaryColor || undefined,
            quoteTitle: preview.quoteTitle || undefined,
            quoteSubtitle: preview.quoteSubtitle || undefined,
            showDecoration: preview.showDecoration !== false,
        };
    }, [quote?.metadata]);

    const storeId = selectedStore?.id || quote?.store_id;

    useEffect(() => {
        const fetchAddress = async () => {
            if (!partnerId) return;
            const res = await getPartnerAddressAction(partnerId, storeId);
            if (res.success && res.data?.formatted) {
                setPartnerAddress(res.data.formatted);
            }
            // Fetch phone separately
            const supabase = (await import("@/lib/supabase/browser-client")).supabaseBrowser;
            const storeQuery = storeId
                ? supabase.from("stores").select("phone").eq("id", storeId).maybeSingle()
                : supabase.from("stores").select("phone").eq("partner_id", partnerId).limit(1).maybeSingle();
            const { data: store } = await storeQuery;
            if (store?.phone) {
                setPartnerPhone(store.phone);
            }
        };
        fetchAddress();
    }, [partnerId, storeId]);

    const [activeTab, setActiveTab] = useState('Dados Gerais');
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [showPrintModal, setShowPrintModal] = useState(false);

    const handleDownloadPdf = async () => {
        if (!quote) return;
        window.open(`/print/orcamento/${quoteId}`, "_blank");
    };

    const handleBack = useCallback(() => onBack(), [onBack]);

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) {
            setIsScrolled(scrollContainerRef.current.scrollTop > 5);
        }
    }, []);

    useEffect(() => {
        if (lastLoadedQuoteId.current === quoteId) return;
        if (initialQuote && initialQuote.items) {
            setQuote(initialQuote);
            setPendingStatus(initialQuote.status || 'draft');
            setLoading(false);
            setIsLoadingQuoteItems(false);
            lastLoadedQuoteId.current = quoteId;
            return;
        }
        async function load() {
            setIsLoadingQuoteItems(true);
            if (!quote) setLoading(true);

            const detailsRes = await getQuoteDetailsAction(quoteId, partnerId);

            if (detailsRes.success) {
                setQuote(detailsRes.data);
                setPendingStatus(detailsRes.data.status || 'draft');
                lastLoadedQuoteId.current = quoteId;
            } else if (!initialQuote) {
                notifyError("Erro", detailsRes.error);
                onBack();
            }

            setLoading(false);
            setIsLoadingQuoteItems(false);
        }
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quoteId, partnerId]);

    useEffect(() => {
        if (lastLoadedHistoryQuoteId.current === quoteId) return;
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
                lastLoadedHistoryQuoteId.current = quoteId;
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
            lastLoadedHistoryQuoteId.current = null;
            debouncedRefresh();
            router.push(`/erp/pedidos/${d.orderId}`);
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
            lastLoadedHistoryQuoteId.current = null;
            debouncedRefresh();
            setShowStatusModal(false);
        } else {
            notifyError("Erro", res.error);
        }
        setIsUpdatingStatus(false);
    };

    const handleRegenerateCode = async () => {
        if (isRegeneratingCode || !quote) return;
        setIsRegeneratingCode(true);
        try {
            const res = await regenerateQuoteApprovalCodeAction(quoteId, partnerId);
            if (res.success) {
                setQuote((prev: any) => ({
                    ...prev,
                    metadata: {
                        ...(prev.metadata || {}),
                        plain_code: res.data.code
                    }
                }));
                notifySuccess("Código Atualizado", `Novo código de aprovação gerado: ${res.data.code}`);
                lastLoadedHistoryQuoteId.current = null;
                debouncedRefresh();
            } else {
                notifyError("Erro", res.error || "Não foi possível regenerar o código.");
            }
        } catch {
            notifyError("Erro", "Erro ao conectar ao servidor.");
        } finally {
            setIsRegeneratingCode(false);
        }
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

    if (loading) return <div className="flex h-[calc(100vh-65px)] w-full items-center justify-center">
        <ThreeDotsLoader />
    </div>

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

    const mappedPreviewItems = useMemo(() => {
        if (!quote?.items) return [];
        return quote.items.map((item: any) => ({
            name: item.custom_name || item.products?.name || "Produto sem nome",
            qty: item.quantity,
            price: Number(item.unit_price),
            sku: item.products?.sku || "N/A"
        }));
    }, [quote?.items]);

    return (
        <>
            <FadeIn>
                <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                        <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

                            {/* Sticky Header */}
                            <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
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
                                        <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                            <ActionsDropdown
                                                onEdit={() => onEditQuote && onEditQuote(quote)}
                                                onPrint={() => setShowPrintModal(true)}
                                                onShare={() => {
                                                    if (quote?.status === 'draft' || quote?.status === 'pending_client') {
                                                        notifyError("Não é possível compartilhar", "Orçamentos rascunho ou pendentes não podem ser compartilhados.");
                                                        return;
                                                    }
                                                    if (!hasMinimumPlan(planSlug, "crescer")) {
                                                        openPlanUpgrade("crescer");
                                                    } else {
                                                        setShowShareModal(true);
                                                    }
                                                }}
                                                onDelete={() => setShowDeleteModal(true)}
                                                onDuplicate={() => onDuplicateQuote && onDuplicateQuote(quote)}
                                                onStatus={handleOpenStatusModal}
                                            />

                                            <Button onClick={() => onEditQuote && onEditQuote(quote)} className="whitespace-nowrap" leftIcon={<EditIcon size={18} />}>
                                                Editar orçamento
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Tabs Navigation */}
                                    <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                            <TabsTrigger value="Dados Gerais">Dados Gerais</TabsTrigger>
                                            <TabsTrigger value="Visualização">Visualização</TabsTrigger>
                                            <TabsTrigger value="Histórico">Histórico</TabsTrigger>
                                        </TabsList>
                                    </div>
                                </div>
                            </div>

                            {/* CONTENT */}
                            <div className="max-w-[1300px] mx-auto p-4 md:p-6 pt-6">
                                <TabsContent value="Dados Gerais" className="mt-0 focus-visible:outline-none">
                                    <FadeIn className="grid grid-cols-12 gap-y-8 md:gap-y-0 relative">
                                        {/* LEFT COLUMN */}
                                        <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                            {/* Quote Status Card */}
                                            <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden mb-8">
                                                <div className={`p-6 border-b text-left ${quote.converted ? 'bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800' :
                                                    quote.status === 'approved' ? 'bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-900/20' :
                                                        quote.status === 'rejected' ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/20' :
                                                            quote.status === 'draft' ? 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800' :
                                                                quote.status === 'expired' ? 'bg-orange-50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-900/20' :
                                                                    quote.status === 'cancelled' ? 'bg-neutral-50 dark:bg-neutral-900/20 border-neutral-200 dark:border-neutral-800' :
                                                                        'bg-[#eff6ff] dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/30'
                                                    }`}>
                                                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                                                        <div>
                                                            <h3 className={`font-bold text-lg mb-1 ${quote.converted ? 'text-slate-900 dark:text-slate-100' :
                                                                quote.status === 'approved' ? 'text-green-900 dark:text-green-100' :
                                                                    quote.status === 'rejected' ? 'text-red-900 dark:text-red-100' :
                                                                        quote.status === 'draft' ? 'text-gray-900 dark:text-gray-100' :
                                                                            quote.status === 'expired' ? 'text-orange-900 dark:text-orange-100' :
                                                                                quote.status === 'cancelled' ? 'text-neutral-900 dark:text-neutral-100' :
                                                                                    'text-blue-900 dark:text-blue-100'
                                                                }`}>
                                                                {quote.converted ? 'Convertido em pedido' :
                                                                    quote.status === 'approved' ? 'Orçamento Aprovado' :
                                                                        quote.status === 'rejected' ? 'Orçamento Recusado' :
                                                                            quote.status === 'draft' ? 'Rascunho' :
                                                                                quote.status === 'expired' ? 'Orçamento Expirado' :
                                                                                    quote.status === 'cancelled' ? 'Orçamento Cancelado' :
                                                                                        'Aguardando Aprovação'}
                                                            </h3>
                                                            <p className={`text-sm ${quote.converted ? 'text-slate-700 dark:text-slate-300' :
                                                                quote.status === 'approved' ? 'text-green-700 dark:text-green-300' :
                                                                    quote.status === 'rejected' ? 'text-red-700 dark:text-red-300' :
                                                                        quote.status === 'draft' ? 'text-gray-700 dark:text-gray-300' :
                                                                            quote.status === 'expired' ? 'text-orange-700 dark:text-orange-300' :
                                                                                quote.status === 'cancelled' ? 'text-neutral-700 dark:text-neutral-300' :
                                                                                    'text-blue-700 dark:text-blue-300'
                                                                }`}>
                                                                {quote.converted
                                                                    ? "Este orçamento já gerou um pedido no ERP. Use o botão abaixo para abrir a venda."
                                                                    : quote.status === 'approved' ? 'Esta proposta foi aprovada e já pode ser convertida em pedido.' :
                                                                        quote.status === 'rejected' ? 'Esta proposta foi recusada pelo cliente.' :
                                                                            quote.status === 'draft' ? 'Esta proposta está em rascunho e aguarda revisão.' :
                                                                                quote.status === 'expired' ? 'Esta proposta expirou e não pode mais ser convertida em pedido.' :
                                                                                    quote.status === 'cancelled' ? 'Esta proposta foi cancelada.' :
                                                                                        'Esta proposta foi enviada ao cliente e aguarda resposta.'}
                                                            </p>
                                                            {quote.converted && quote.converted_order_id && (
                                                                <Button
                                                                    variant="outline"
                                                                    className="mt-3 h-[36px] text-xs"
                                                                    onClick={() => router.push(`/erp/pedidos/${quote.converted_order_id}`)}
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
                                            <FormSection hasSeparator title="Itens do Orçamento" className='mb-8'>
                                                <div className="space-y-4">
                                                    {isLoadingQuoteItems ? (
                                                        <div className="flex items-center justify-center py-14">
                                                            <ThreeDotsLoader />
                                                        </div>
                                                    ) : (
                                                        quote.items?.map((item: any) => (
                                                            <QuoteItem
                                                                key={item.id}
                                                                image={getR2ImageUrl(item.image || item.products?.images || null, "thumbnail")}
                                                                name={item.custom_name || item.products?.name || "Produto sem nome"}
                                                                sku={item.products?.sku || item.sku || "N/A"}
                                                                qty={item.quantity}
                                                                price={item.unit_price}
                                                                total={item.quantity * item.unit_price}
                                                                unit={item.products?.unit}
                                                            />
                                                        ))
                                                    )}
                                                </div>
                                            </FormSection>

                                            <FormSection hasSeparator title="Resumo do Orçamento">
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
                                                        <span className="text-brand-inactive-text dark:text-dark-body font-medium">Entrega</span>
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
                                            </FormSection>
                                        </div>

                                        {/* RIGHT COLUMN - SIDEBAR */}
                                        <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                            {quote.customers && (
                                                <CustomerCard
                                                    customer={quote.customers}
                                                />
                                            )}

                                            {/* Link de Aprovação do Cliente */}
                                            {hasMinimumPlan(planSlug, "crescer") ? (
                                                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 space-y-4">
                                                    <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                                        Link de Aprovação Online
                                                    </h3>

                                                    <div className="space-y-3">
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                readOnly
                                                                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/quote/${quote.public_token}`}
                                                                className="flex-1 text-xs bg-brand-gray/50 dark:bg-dark-border/30 p-2.5 rounded-xl border border-brand-border dark:border-dark-border outline-none text-brand-inactive-text dark:text-dark-body cursor-default select-all"
                                                            />
                                                            <Button
                                                                variant="outline"
                                                                className="p-2.5 h-auto text-xs shrink-0 rounded-xl"
                                                                onClick={() => {
                                                                    navigator.clipboard.writeText(`${window.location.origin}/quote/${quote.public_token}`);
                                                                    setCopiedLink(true);
                                                                    notifySuccess("Link copiado", "Link do orçamento copiado para a área de transferência.");
                                                                    setTimeout(() => setCopiedLink(false), 2000);
                                                                }}
                                                            >
                                                                {copiedLink ? "Copiado!" : "Copiar"}
                                                            </Button>
                                                        </div>

                                                        <Button
                                                            variant="outline"
                                                            className="w-full text-xs font-semibold justify-center py-2.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/30"
                                                            onClick={() => {
                                                                const text = `Olá! Segue o link para visualizar e aprovar a proposta comercial *${quote.quote_number}*:\n\n${window.location.origin}/quote/${quote.public_token}\n\n*Código de Aprovação:* ${quote.metadata?.plain_code || "Enviado por aqui"}`;
                                                                window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
                                                            }}
                                                        >
                                                            Compartilhar no WhatsApp
                                                        </Button>

                                                        <div className="border-t border-brand-border dark:border-dark-border pt-3 mt-1 flex justify-between items-center">
                                                            <div>
                                                                <span className="text-xs text-brand-inactive-text block">Código de Aprovação</span>
                                                                <span className="text-lg font-bold text-emerald-500 tracking-wider">
                                                                    {quote.metadata?.plain_code || "---"}
                                                                </span>
                                                            </div>

                                                            {quote.status !== "approved" && quote.status !== "rejected" && !quote.converted && (
                                                                <Button
                                                                    variant="outline"
                                                                    className="text-xs py-1 h-[32px] rounded-lg border-brand-border dark:border-dark-border"
                                                                    onClick={handleRegenerateCode}
                                                                    disabled={isRegeneratingCode}
                                                                >
                                                                    {isRegeneratingCode ? "Gerando..." : "Novo Código"}
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 space-y-4">
                                                    <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                                        Link de Aprovação Online
                                                    </h3>
                                                    <div className="flex flex-col items-center text-center py-4">
                                                        <img src={PLAN_UPGRADE_MASCOTS.crescer} alt="Crescer" className="w-16 h-16 mb-3" />
                                                        <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading mb-1">Disponível nos planos Crescer e Escalar</p>
                                                        <p className="text-xs text-brand-inactive-text mb-4">Compartilhe o orçamento online e receba aprovação dos clientes em tempo real.</p>
                                                        <Button onClick={() => openPlanUpgrade("crescer")} className="h-9">
                                                            Fazer upgrade
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Painel de Auditoria e Visualização */}
                                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 space-y-4">
                                                <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading">
                                                    Logs e Estatísticas
                                                </h3>

                                                <div className="space-y-3 text-xs text-brand-dark dark:text-dark-body">
                                                    <div className="flex justify-between py-1 border-b border-brand-gray dark:border-dark-border/20">
                                                        <span className="text-brand-inactive-text">Visualizações:</span>
                                                        <span className="font-semibold">{quote.total_views || 0}</span>
                                                    </div>
                                                    {quote.first_viewed_at && (
                                                        <div className="flex justify-between py-1 border-b border-brand-gray dark:border-dark-border/20">
                                                            <span className="text-brand-inactive-text">Primeira Visualização:</span>
                                                            <span className="font-semibold">{formatDate(quote.first_viewed_at)} às {formatTime(new Date(quote.first_viewed_at))}</span>
                                                        </div>
                                                    )}
                                                    {quote.last_viewed_at && (
                                                        <div className="flex justify-between py-1 border-b border-brand-gray dark:border-dark-border/20">
                                                            <span className="text-brand-inactive-text">Última Visualização:</span>
                                                            <span className="font-semibold">{formatDate(quote.last_viewed_at)} às {formatTime(new Date(quote.last_viewed_at))}</span>
                                                        </div>
                                                    )}

                                                    {/* Approval Details */}
                                                    {quote.status === "approved" && (
                                                        <div className="mt-3 bg-emerald-50 dark:bg-emerald-950/10 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/20 space-y-2">
                                                            <div className="font-bold text-emerald-800 dark:text-emerald-300">Detalhes da Aprovação:</div>
                                                            <div>Aprovador: <span className="font-semibold">{quote.approver_name || "Cliente"}</span></div>
                                                            <div>Data: <span className="font-semibold">{quote.approved_at ? formatDate(quote.approved_at) : "-"}</span></div>
                                                            <div>Método: <span className="font-semibold">{quote.approval_method === "code" ? "Código 4-dígitos" : "Cliente Autenticado"}</span></div>
                                                        </div>
                                                    )}

                                                    {/* Rejection Details */}
                                                    {quote.status === "rejected" && (
                                                        <div className="mt-3 bg-red-50 dark:bg-red-950/10 p-3 rounded-xl border border-red-100 dark:border-red-900/20 space-y-2">
                                                            <div className="font-bold text-red-800 dark:text-red-300">Detalhes da Recusa:</div>
                                                            <div>Recusado por: <span className="font-semibold">{quote.approver_name || "Cliente"}</span></div>
                                                            <div>Data: <span className="font-semibold">{quote.rejected_at ? formatDate(quote.rejected_at) : "-"}</span></div>
                                                            {quote.rejection_reason && (
                                                                <div>Motivo: <span className="font-semibold text-red-600 dark:text-red-400 italic">"{quote.rejection_reason}"</span></div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

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
                                        </div>
                                    </FadeIn>
                                </TabsContent>

                                <TabsContent value="Visualização" className="mt-0 focus-visible:outline-none h-full">
                                    <FadeIn className="w-full h-[calc(100vh-220px)] bg-brand-gray dark:bg-dark-border/20 rounded-2xl overflow-hidden">
                                        <QuotePreview
                                            invoiceNumber={quote.quote_number || ""}
                                            quoteDate={quote.issue_date || ""}
                                            expiryDate={quote.expiration_date || ""}
                                            selectedCustomer={quote.customers}
                                            quoteItems={mappedPreviewItems}
                                            subtotal={subtotal}
                                            shippingNum={shipping}
                                            otherCosts={additional}
                                            discountValue={discount}
                                            total={total}
                                            note={quote.notes || undefined}
                                            primaryColor={previewMeta.primaryColor}
                                            secondaryColor={previewMeta.secondaryColor}
                                            quoteTitle={previewMeta.quoteTitle}
                                            quoteSubtitle={previewMeta.quoteSubtitle}
                                            partnerName={partnerName}
                                            partnerAddress={partnerAddress}
                                            partnerPhone={partnerPhone}
                                            partnerAvatar={partnerAvatar}
                                            showDecoration={previewMeta.showDecoration}
                                            salespersonName={quote.user_profiles?.full_name || undefined}
                                        />
                                    </FadeIn>
                                </TabsContent>

                                <TabsContent value="Histórico" className="mt-0 focus-visible:outline-none">
                                    <div className="max-w-[800px]">
                                        <QuoteHistoryTab entries={historyEntries} loading={historyLoading} />
                                    </div>
                                </TabsContent>
                            </div>
                        </div>

                        {/* Mobile Bottom Action Bar */}
                        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3 shadow-lg">
                            <ActionsDropdown
                                onEdit={() => onEditQuote && onEditQuote(quote)}
                                onPrint={() => setShowPrintModal(true)}
                                onShare={() => {
                                    if (quote?.status === 'draft' || quote?.status === 'pending_client') {
                                        notifyError("Não é possível compartilhar", "Orçamentos rascunho ou pendentes não podem ser compartilhados.");
                                        return;
                                    }
                                    if (!hasMinimumPlan(planSlug, "crescer")) {
                                        openPlanUpgrade("crescer");
                                    } else {
                                        setShowShareModal(true);
                                    }
                                }}
                                onDelete={() => setShowDeleteModal(true)}
                                onDuplicate={() => onDuplicateQuote && onDuplicateQuote(quote)}
                                onStatus={handleOpenStatusModal}
                                trigger={
                                    <Button variant="outline" className="flex-1" leftIcon={<ThreeDotsIcon size={18} />}>
                                        Opções
                                    </Button>
                                }
                            />
                            {canConvertToOrder && (
                                <Button
                                    variant="default"
                                    className="flex-1 whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white border-none"
                                    disabled={isConverting}
                                    onClick={handleConvertClick}
                                    leftIcon={<ArrowRightIcon size={18} />}
                                >
                                    {isConverting ? "…" : "Converter"}
                                </Button>
                            )}
                            <Button onClick={() => onEditQuote && onEditQuote(quote)} className="flex-1 whitespace-nowrap" leftIcon={<EditIcon size={18} />}>
                                Editar
                            </Button>
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
                                        { value: 'pending_client', label: 'Pendente do Cliente' },
                                        { value: 'viewed', label: 'Visualizado' },
                                        { value: 'approved', label: 'Aprovado' },
                                        { value: 'rejected', label: 'Rejeitado' },
                                        { value: 'expired', label: 'Expirado' },
                                        { value: 'cancelled', label: 'Cancelado' }
                                    ]}
                                />
                            </div>
                        </DefaultModal>

                        <ShareModal
                            isOpen={showShareModal}
                            onClose={() => setShowShareModal(false)}
                            url={typeof window !== "undefined" ? `${window.location.origin}/quote/${quote.public_token || quoteId}` : ""}
                            title={`Orçamento ${quote.quote_number || quoteId}`}
                            shareMessage={`Confira a proposta comercial de ${partnerName}`}
                            label="Link do orçamento"
                        />
                    </Tabs>
                </div>
            </FadeIn>

            {showPrintModal && (
                <QuotePrintModal
                    isOpen={showPrintModal}
                    onClose={() => setShowPrintModal(false)}
                    quoteId={quoteId}
                    partnerId={partnerId}
                />
            )}
        </>
    );
};

export default QuoteDetail;
