"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    ChevronLeftIcon,
    PrinterIcon,
    ShareIcon,
    MailIcon,
    ClockIcon,
    CheckCircle2,
    FileIcon,
    XCircle,
    AlertTriangleIcon,
    ArrowRightIcon,
    UploadIcon,
    EditIcon,
    ThreeDotsIcon
} from '@/lib/icons';
import { Button, Badge, ActionsDropdown, ThreeDotsLoader, FormDropdown, Tooltip, AlertModal, InfoCard } from '@/components/reusable';
import { getQuoteDetailsAction, updateQuoteStatusAction, deleteQuoteAction } from '@/app/actions/erp/quotes';
import { useNotification } from "@/hooks/use-notification";
import CustomerCard from '@/components/reusable/CustomerCard';
import { useSidebar } from "@/lib/sidebar-context";
import { useRouter } from "next/navigation";
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url";
import { formatCurrency, formatDate, formatDayMonth, formatTime } from '@/lib/utils';

interface QuoteDetailProps {
    quoteId: string;
    partnerId: string;
    onBack: () => void;
    onEditQuote?: (quote: any) => void;
    initialQuote?: any;
}



const QuoteDetail = ({ quoteId, partnerId, onBack, onEditQuote, initialQuote }: QuoteDetailProps) => {
    const [isScrolled, setIsScrolled] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [quote, setQuote] = useState<any>(initialQuote || null);
    const [loading, setLoading] = useState(!initialQuote);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const { success: notifySuccess, error: notifyError } = useNotification();
    const router = useRouter();
    const { setHeaderOverride } = useSidebar();

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) {
            setIsScrolled(scrollContainerRef.current.scrollTop > 5);
        }
    }, []);

    // Fetch full details (with items) in background
    useEffect(() => {
        async function load() {
            if (!initialQuote) setLoading(true);
            const res = await getQuoteDetailsAction(quoteId, partnerId);
            if (res.success) {
                setQuote(res.data);
            } else if (!initialQuote) {
                notifyError("Erro", res.error);
                onBack();
            }
            setLoading(false);
        }
        load();
    }, [quoteId, partnerId]);

    const handleStatusChange = async (newStatus: any) => {
        const res = await updateQuoteStatusAction({ quoteId, partnerId, status: newStatus });
        if (res.success) {
            setQuote((prev: any) => ({ ...prev, status: newStatus }));
            notifySuccess("Sucesso", "Status atualizado!");
            router.refresh();
        } else {
            notifyError("Erro", res.error);
        }
    };

    const getStatusInfo = (s: string) => {
        switch (s) {
            case 'sent': return { label: 'Enviado', variant: 'blue' as const, icon: <UploadIcon size={12} />, color: 'bg-blue-500' };
            case 'approved': return { label: 'Aprovado', variant: 'green' as const, icon: <CheckCircle2 size={12} />, color: 'bg-green-500' };
            case 'rejected': return { label: 'Rejeitado', variant: 'red' as const, icon: <XCircle size={12} />, color: 'bg-red-500' };
            case 'expired': return { label: 'Expirado', variant: 'orange' as const, icon: <AlertTriangleIcon size={12} />, color: 'bg-orange-500' };
            case 'draft': return { label: 'Rascunho', variant: 'gray' as const, icon: <FileIcon size={12} />, color: 'bg-gray-400' };
            default: return { label: s, variant: 'gray' as const, icon: <FileIcon size={12} />, color: 'bg-gray-400' };
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

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            const res = await deleteQuoteAction(quoteId);
            if (res.success) {
                notifySuccess("Orçamento excluído", "O orçamento foi removido com sucesso.");
                router.refresh();
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

    if (loading) return <div className="h-full flex items-center justify-center bg-white dark:bg-dark-surface"><ThreeDotsLoader /></div>;
    if (!quote) return null;

    const statusInfo = getStatusInfo(quote.status);
    const subtotal = Number(quote.subtotal || 0);
    const discount = Number(quote.discount_value || 0);
    const shipping = Number(quote.shipping_cost || 0);
    const additional = Number(quote.additional_costs || 0);
    const total = Number(quote.total || 0);

    const formattedIssueDate = quote.issue_date ? formatDate(quote.issue_date) : '—';

    const formattedExpiryDate = quote.expiration_date ? formatDate(quote.expiration_date) : '—';

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

    return (
        <div className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300 relative">
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto no-scrollbar scroll-smooth"
            >
                {/* Sticky Header - Desktop Only title and tabs matching AddProductPage verbatim */}
                <div className={`sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out`}>
                    <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                        {/* Back button — desktop only */}
                        <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                            <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </Button>
                        </div>

                        {/* Title row */}
                        <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                            <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                    {/* Title hidden on mobile, shown on md+ */}
                                    <span className="hidden md:inline truncate">{pageTitle}</span>
                                    <Badge variant={statusInfo.variant}>
                                        {statusInfo.label}
                                    </Badge>
                                </h1>

                                <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                    Criado em {formattedIssueDate} • Válido até {formattedExpiryDate}
                                </div>
                            </div>

                            {/* Desktop action buttons only */}
                            <div className="hidden md:flex items-center gap-3 flex-shrink-0 ml-3">
                                <ActionsDropdown
                                    onPrint={() => { }}
                                    onEmail={() => { }}
                                    onShare={() => { }}
                                    onDelete={() => setShowDeleteModal(true)}
                                    onDuplicate={() => { }}
                                />

                                <Button onClick={() => onEditQuote && onEditQuote(quote)} className="whitespace-nowrap">
                                    <EditIcon className="w-[18px] h-[18px] mr-2" />
                                    Editar orçamento
                                </Button>
                            </div>
                        </div>

                        {/* Tabs space matching AddProductPage */}
                        <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"} pb-4`}>
                        </div>
                    </div>
                </div>

                {/* CONTENT */}
                <div className="max-w-[1300px] mx-auto p-4 md:p-6 pt-6">
                    <div className="grid grid-cols-12 gap-y-8 md:gap-y-0 relative">

                        {/* LEFT COLUMN */}
                        <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">

                            {/* Quote Status Card */}
                            <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden mb-8">
                                <div className={`p-6 border-b text-left ${quote.status === 'approved' ? 'bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-900/20' :
                                    quote.status === 'rejected' ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/20' :
                                        'bg-[#eff6ff] dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/30'
                                    }`}>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className={`font-bold text-lg mb-1 ${quote.status === 'approved' ? 'text-green-900 dark:text-green-100' :
                                                quote.status === 'rejected' ? 'text-red-900 dark:text-red-100' :
                                                    'text-blue-900 dark:text-blue-100'
                                                }`}>
                                                {quote.status === 'approved' ? 'Orçamento Aprovado' :
                                                    quote.status === 'rejected' ? 'Orçamento Recusado' :
                                                        quote.status === 'draft' ? 'Aguardando Revisão' :
                                                            'Aguardando Aprovação'}
                                            </h3>
                                            <p className={`text-sm ${quote.status === 'approved' ? 'text-green-700 dark:text-green-300' :
                                                quote.status === 'rejected' ? 'text-red-700 dark:text-red-300' :
                                                    'text-blue-700 dark:text-blue-300'
                                                }`}>
                                                {quote.status === 'approved' ? 'Esta proposta foi aprovada e já pode ser convertida em pedido.' :
                                                    quote.status === 'rejected' ? 'Esta proposta foi recusada pelo cliente.' :
                                                        'Esta proposta foi enviada ao cliente e aguarda resposta.'}
                                            </p>
                                        </div>
                                        {quote.status !== 'rejected' && quote.status !== 'approved' && (
                                            <Button
                                                variant="default"
                                                className="bg-blue-600 hover:bg-blue-700 text-white border-none h-[38px] text-xs px-6"
                                            >
                                                Converter em Pedido <ArrowRightIcon size={14} className="ml-1" />
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
                            </div>

                            <div className="space-y-0">
                                {quote.items?.map((item: any) => (
                                    <QuoteItem
                                        key={item.id}
                                        image={getR2ImageUrl(item.products?.images?.[0] || item.product?.image, "thumbnail")}
                                        name={item.custom_name || item.products?.name || "Produto sem nome"}
                                        sku={item.products?.sku || "N/A"}
                                        qty={item.quantity}
                                        price={item.unit_price}
                                        total={item.quantity * item.unit_price}
                                    />
                                ))}
                            </div>

                            {/* Financial Summary */}
                            <div className="bg-[#F9FAFB] dark:bg-gray-800/20 rounded-2xl p-6 border border-brand-border dark:border-dark-border">
                                <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading mb-4 border-b border-brand-border dark:border-dark-border pb-3">Resumo Financeiro</h3>
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
                        <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-10 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">

                            {/* Status Management Card */}
                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 relative overflow-hidden transition-colors text-left">
                                <div className="absolute top-0 left-0 w-full h-1 bg-brand-green dark:bg-brand-green/30"></div>
                                <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading mb-4 mt-1">Status do Orçamento</h3>
                                <div className="flex flex-col gap-1.5">
                                    <FormDropdown
                                        value={quote.status}
                                        setValue={handleStatusChange}
                                        options={[
                                            { value: 'draft', label: 'Rascunho' },
                                            { value: 'sent', label: 'Enviado' },
                                            { value: 'approved', label: 'Aprovado' },
                                            { value: 'rejected', label: 'Rejeitado' }
                                        ]}
                                    />
                                </div>
                            </div>

                            <CustomerCard
                                customer={quote.customers}
                                address={quote.customers?.addresses?.find((a: any) => a.address_type === "primary" || a.is_default) || quote.customers?.addresses?.[0]}
                                billingAddress={quote.customers?.addresses?.find((a: any) => a.address_type === "billing")}
                            />

                            {/* Terms/Notes Card using InfoCard */}
                            <InfoCard
                                title="Observações da Proposta"
                                message={<span className="whitespace-pre-wrap">{quote.notes || "Nenhuma observação ou termo adicional vinculado a este orçamento."}</span>}
                                color="gray"
                            />
                        </div>
                    </div>
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

            {/* Mobile Bottom Action Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3">
                <ActionsDropdown
                    onPrint={() => { }}
                    onEmail={() => { }}
                    onShare={() => { }}
                    onDelete={() => setShowDeleteModal(true)}
                    onDuplicate={() => { }}
                    trigger={
                        <Button
                            variant="outline"
                            className="flex-1"
                        >
                            <ThreeDotsIcon className="w-4 h-4 mr-2" />
                            Opções
                        </Button>
                    }
                />
                <Button onClick={() => onEditQuote && onEditQuote(quote)} className="flex-1 whitespace-nowrap">
                    <EditIcon className="w-4 h-4 mr-2" />
                    Editar orçamento
                </Button>
            </div>
        </div>
    );
};

const QuoteItem = ({ image, name, sku, qty, price, total }: any) => (
    <div className="flex items-start gap-4 py-4 border-b border-brand-border dark:border-dark-border last:border-0 hover:bg-brand-gray/20 transition-colors px-2 rounded-xl text-left group">
        <div className="w-16 h-16 rounded-xl bg-brand-gray/50 dark:bg-dark-border/50 border border-brand-border dark:border-dark-border overflow-hidden flex-shrink-0 flex items-center justify-center p-1">
            <img
                src={image}
                className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal rounded-lg transition-transform group-hover:scale-105"
                alt={name}
                onError={(e: any) => { e.target.src = "https://img.dudit.com.br/static/Placeholder.png" }}
            />
        </div>
        <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start mb-1 gap-2">
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

export default QuoteDetail;
