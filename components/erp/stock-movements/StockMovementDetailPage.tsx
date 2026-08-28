"use client"

import { useState, useCallback, useRef, useEffect } from 'react';
import {
    DownloadIcon,
    ArrowRightIcon,
    ReloadIcon,
    ChevronLeftIcon,
    FileTextIcon,
    PinIcon,
    LinkIcon
} from '@/lib/icons';
import { Button, ThreeDotsLoader, AlertModal, InfoCard, Badge, Input, DefaultModal } from '@/components/reusable';
import { FadeIn } from '@/components/animations/FadeIn';
import { useNotification } from '@/hooks/use-notification';
import { useSidebar } from "@/lib/sidebar-context"
import { getR2ImageUrl } from '@/lib/utils/get-r2-image-url';
import { formatQuantityWithUnit } from '@/lib/utils/formatters';
import { undoStockMovementAction } from '@/app/actions/erp/stock-movements';
import { GenericAttachmentsTab } from '@/components/erp/shared/GenericAttachmentsTab';
import { FormSection, ListItem, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/reusable';
import { AnimatePresence } from 'framer-motion';

interface MovementItemData {
    id: string;
    product: {
        name: string;
        sku: string;
        image: string;
        category: string;
        previousStock: number;
        currentStock: number;
        unit?: string | null;
    };
    quantity: number;
    type: string;
}

interface StockMovement {
    id: string;
    displayId?: string;
    date: string;
    items?: MovementItemData[];
    product?: {
        name: string;
        sku: string;
        image: string;
        category: string;
        previousStock: number;
        currentStock: number;
    };
    type: string;
    quantity: number;
    reason: string;
    user: string;
    notes?: string;
    referenceName?: string;
    orderId?: string;
    isReversed?: boolean;
    reversedAt?: string | null;
    reversalMovementId?: string | null;
}

interface StockMovementDetailProps {
    onBack: () => void;
    movement: StockMovement | null;
    isLoading?: boolean;
    partnerId: string;
}

const StockMovementDetailPage = ({ onBack, movement, isLoading, partnerId }: StockMovementDetailProps) => {
    const [isScrolled, setIsScrolled] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState('details');

    const handleBack = useCallback(() => onBack(), [onBack]);

    const { setHeaderOverride } = useSidebar();

    useEffect(() => {
        const displayId = movement?.displayId
        const title = displayId ? displayId.slice(0, 8) : "Movimentação de estoque"
        setHeaderOverride({
            title,
            onBack: handleBack,
            isSubPage: true
        })
        return () => setHeaderOverride(null)
    }, [movement, handleBack, setHeaderOverride])

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5);
    }, []);

    const [isUndoModalOpen, setIsUndoModalOpen] = useState(false);
    const [undoReason, setUndoReason] = useState('');
    const [isUndoing, setIsUndoing] = useState(false);
    const [showSummaryModal, setShowSummaryModal] = useState(false);
    const { success: notifySuccess, error: notifyError } = useNotification();

    const handleUndo = async () => {
        if (!movement?.id) return;
        setIsUndoing(true);
        try {
            const res = await undoStockMovementAction(movement.id, undoReason);
            if (res.success) {
                notifySuccess('Movimentação desfeita com sucesso!');
                onBack();
            } else {
                notifyError(res.error || 'Erro ao desfazer movimentação.');
            }
        } catch (err) {
            notifyError('Erro de conexão.');
        } finally {
            setIsUndoing(false);
            setIsUndoModalOpen(false);
        }
    };

    if (isLoading || !movement) {
        return (
            <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
                <ThreeDotsLoader key="loading" />
            </div>
        );
    }

    const data = movement;
    const isIn = data.type === 'in';

    const rawReason = data.reason;
    let reason = rawReason;
    if (rawReason) {
        const upperRaw = rawReason.trim().toUpperCase();
        if (upperRaw === 'SALE_OUT') {
            reason = 'Saída por Venda (Troca)';
        } else if (upperRaw === 'RETURN_IN') {
            reason = 'Entrada por Devolução';
        }
    }

    let notes = data.notes || '';
    if (notes.startsWith('Replacement products - source request ')) {
        const uuidPart = notes.substring('Replacement products - source request '.length);
        const codePart = uuidPart.length >= 6 ? `DVL-${uuidPart.substring(0, 6).toUpperCase()}` : uuidPart;
        notes = `Produtos de reposição - solicitação ${codePart}`;
    } else if (notes.startsWith('Customer return - source request ')) {
        const uuidPart = notes.substring('Customer return - source request '.length);
        const codePart = uuidPart.length >= 6 ? `DVL-${uuidPart.substring(0, 6).toUpperCase()}` : uuidPart;
        notes = `Devolução do cliente - solicitação ${codePart}`;
    } else {
        const regex = /solicitação ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
        const match = notes.match(regex);
        if (match && match[1]) {
            const uuid = match[1];
            const code = `DVL-${uuid.substring(0, 6).toUpperCase()}`;
            notes = notes.replace(uuid, code);
        }
    }

    const displayItems: MovementItemData[] = data.items && data.items.length > 0
        ? data.items
        : data.product
            ? [{
                id: data.id + '-legacy',
                product: data.product,
                quantity: data.quantity,
                type: data.type,
            }]
            : [];

    const movementTitle = data.displayId ? data.displayId.slice(0, 8) : `Mov. ${data.id.slice(0, 8)}`;
    const hasNotes = notes && notes.trim().length > 0;

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

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
                                <div className="hidden md:flex items-start justify-between">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span>{movementTitle}</span>
                                            <Badge
                                                variant={data.type === "in" ? "green" : data.type === "out" ? "red" : "blue"}
                                                className="whitespace-nowrap scale-90 shrink-0"
                                            >
                                                {data.type === "in" ? "Entrada" : data.type === "out" ? "Saída" : "Ajuste"}
                                            </Badge>
                                            {data.isReversed && (
                                                <Badge
                                                    variant="gray"
                                                    className="whitespace-nowrap scale-90 shrink-0"
                                                >
                                                    Desfeita
                                                </Badge>
                                            )}
                                        </h1>

                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            <div className="flex items-center gap-2">
                                                <span>{data.date}</span>
                                                <span className="text-brand-inactive-text dark:text-dark-body opacity-50">•</span>
                                                <span>Registrado por <strong className="font-semibold text-brand-dark dark:text-dark-heading">{data.user}</strong></span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        {!data.isReversed && (
                                            <Button
                                                variant="outline"
                                                className="h-[42px]"
                                                onClick={() => setIsUndoModalOpen(true)}
                                                leftIcon={<ReloadIcon size={18} />}
                                            >
                                                Desfazer
                                            </Button>
                                        )}

                                        <Button className="h-[42px]" onClick={() => { /* PDF Logic */ }} leftIcon={<DownloadIcon size={18} />}>
                                            PDF
                                        </Button>
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="details">Dados gerais</TabsTrigger>
                                        <TabsTrigger value="attachments">Anexos</TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        {/* Content Body */}
                        <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            <AnimatePresence mode="wait">
                                <TabsContent value="details" className="mt-0">
                                    <FadeIn key="details">
                                        {/* Desktop View */}
                                        <div className="hidden xl:block">
                                            <div className={hasNotes ? "grid grid-cols-12 gap-y-8 gap-x-8 relative" : "space-y-8"}>
                                                {/* MAIN COLUMN */}
                                                <div className={hasNotes ? "col-span-12 xl:col-span-8 pr-0 xl:pr-12" : ""}>

                                                    {/* Movement Details Card */}
                                                    <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden mb-8">
                                                        {/* Bottom: Product Items (White) */}
                                                        <div className="bg-white dark:bg-dark-surface">
                                                            {displayItems.map((item, index) => {
                                                                const delta = item.product.currentStock - item.product.previousStock;
                                                                const lineIn = data.type === 'adjustment' ? delta > 0 : item.type === 'in';
                                                                const lineOut = data.type === 'adjustment' ? delta < 0 : item.type === 'out';
                                                                const deltaFormatted = data.type === 'adjustment'
                                                                    ? (delta > 0 ? `+${delta}` : `${delta}`)
                                                                    : (lineIn ? `+${item.quantity}` : `-${item.quantity}`);
                                                                const deltaColorClass = lineIn
                                                                    ? 'text-brand-green'
                                                                    : lineOut
                                                                        ? 'text-brand-red'
                                                                        : 'text-brand-dark dark:text-dark-heading';

                                                                return (
                                                                    <div key={item.id}>
                                                                        {index > 0 && (
                                                                            <div className="h-px bg-brand-border dark:bg-dark-border mx-6" />
                                                                        )}
                                                                        <div className="p-6">
                                                                            <div className="flex flex-col md:flex-row md:items-center gap-6">
                                                                                <div className="flex items-start gap-5 flex-1">
                                                                                    <div className="w-14 h-14 rounded-full border border-brand-border dark:border-dark-border overflow-hidden shrink-0 bg-brand-gray dark:bg-dark-border/20">
                                                                                        <img
                                                                                            src={getR2ImageUrl(item.product.image, "thumbnail") || "https://img.dudit.com.br/static/Placeholder.png"}
                                                                                            className="w-full h-full object-cover rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border"
                                                                                            alt={item.product.name}
                                                                                        />
                                                                                    </div>

                                                                                    <div className="flex-1 min-w-0">
                                                                                        <h4 className="font-bold text-lg text-brand-dark dark:text-dark-heading truncate">{item.product.name}</h4>

                                                                                        <div className="flex items-center gap-2">
                                                                                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">{item.product.sku}</span>
                                                                                            <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                                                                                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">{item.product.category}</span>
                                                                                            <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                                                                                            <span className={`text-sm font-bold ${deltaColorClass}`}>
                                                                                                {deltaFormatted}
                                                                                            </span>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>

                                                                                {/* Desktop Divider */}
                                                                                <div className="hidden md:block w-px h-12 bg-brand-border dark:bg-dark-border mx-2"></div>
                                                                                {/* Mobile Divider */}
                                                                                <div className="md:hidden w-full h-px bg-brand-border dark:bg-dark-border"></div>

                                                                                <div className="flex items-center justify-between md:justify-start gap-4 md:gap-8 min-w-fit px-2 md:px-0">
                                                                                    <div className="text-center md:text-left">
                                                                                        <div className="text-sm font-medium text-brand-inactive-text dark:text-dark-body mb-0.5">Estoque Anterior</div>
                                                                                        <div className="text-md font-bold text-brand-dark dark:text-dark-heading">{formatQuantityWithUnit(item.product.previousStock, item.product.unit)}</div>
                                                                                    </div>

                                                                                    <div className="flex items-center justify-center text-brand-inactive-text dark:text-dark-body">
                                                                                        <ArrowRightIcon size={18} />
                                                                                    </div>

                                                                                    <div className="text-center md:text-left">
                                                                                        <div className="text-sm font-medium text-brand-inactive-text dark:text-dark-body mb-0.5">Estoque Pós-Mov.</div>
                                                                                        <div className={`text-md font-bold ${deltaColorClass}`}>{formatQuantityWithUnit(item.product.currentStock, item.product.unit)}</div>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    {/* Resumo da Operação - BELOW Items (like XML import sidebar) */}
                                                    <FormSection title="Resumo da Operação" hasSeparator>
                                                        <div className={hasNotes ? "grid md:grid-cols-2 gap-4" : "grid md:grid-cols-4 gap-4"}>
                                                            <ListItem
                                                                icon={PinIcon}
                                                                title="Motivo"
                                                                description={reason || "-"}
                                                                className="px-4 py-3 gap-4"
                                                            />
                                                            {data.referenceName && (
                                                                <ListItem
                                                                    icon={LinkIcon}
                                                                    title="Referência"
                                                                    description={data.referenceName}
                                                                    className="px-4 py-3 gap-4"
                                                                />
                                                            )}
                                                        </div>
                                                    </FormSection>

                                                </div >

                                                {/* RIGHT COLUMN - SIDEBAR (only when notes exist) */}
                                                {
                                                    hasNotes && (
                                                        <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-l border-brand-border dark:border-dark-border space-y-8">
                                                            <div>
                                                                <InfoCard
                                                                    color="orange"
                                                                    message={
                                                                        <div className="flex flex-col">
                                                                            <span className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body">Observações</span>
                                                                            <span className="text-[15px] font-bold text-brand-dark dark:text-dark-heading truncate">{notes}</span>
                                                                        </div>
                                                                    }
                                                                />
                                                            </div>
                                                        </div>
                                                    )
                                                }
                                            </div >
                                        </div >

                                        {/* Mobile/Tablet View */}
                                        < div className="xl:hidden space-y-6" >
                                            {/* Summary List Item at the top (like XML import page) */}
                                            <ListItem
                                                icon={FileTextIcon}
                                                title={`${displayItems.length} ${displayItems.length === 1 ? 'item' : 'itens'}`}
                                                description={`${isIn ? 'Entrada' : 'Saída'} • ${reason || "-"}`}
                                                showChevron={true}
                                                onClick={() => setShowSummaryModal(true)}
                                                className="border-0 bg-transparent px-0 hover:bg-transparent"
                                            />

                                            {/* Items Cards for Mobile */}
                                            < div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden" >
                                                {
                                                    displayItems.map((item, index) => {
                                                        const delta = item.product.currentStock - item.product.previousStock;
                                                        const lineIn = data.type === 'adjustment' ? delta > 0 : item.type === 'in';
                                                        const lineOut = data.type === 'adjustment' ? delta < 0 : item.type === 'out';
                                                        const deltaFormatted = data.type === 'adjustment'
                                                            ? (delta > 0 ? `+${delta}` : `${delta}`)
                                                            : (lineIn ? `+${item.quantity}` : `-${item.quantity}`);
                                                        const deltaColorClass = lineIn
                                                            ? 'text-brand-green'
                                                            : lineOut
                                                                ? 'text-brand-red'
                                                                : 'text-brand-dark dark:text-dark-heading';

                                                        return (
                                                            <div key={item.id}>
                                                                {index > 0 && (
                                                                    <div className="h-px bg-brand-border dark:bg-dark-border mx-6" />
                                                                )}
                                                                <div className="p-4 md:p-6">
                                                                    <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
                                                                        <div className="flex items-start gap-4 md:gap-5 flex-1">
                                                                            <div className="w-12 h-12 md:w-14 md:h-14 rounded-full border border-brand-border dark:border-dark-border overflow-hidden shrink-0 bg-brand-gray dark:bg-dark-border/20">
                                                                                <img
                                                                                    src={getR2ImageUrl(item.product.image, "thumbnail") || "https://img.dudit.com.br/static/Placeholder.png"}
                                                                                    className="w-full h-full object-cover rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border"
                                                                                    alt={item.product.name}
                                                                                />
                                                                            </div>

                                                                            <div className="flex-1 min-w-0">
                                                                                <h4 className="font-bold text-lg text-brand-dark dark:text-dark-heading truncate">{item.product.name}</h4>

                                                                                <div className="flex items-center gap-2">
                                                                                    <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">{item.product.sku}</span>
                                                                                    <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                                                                                    <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">{item.product.category}</span>
                                                                                    <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                                                                                    <span className={`text-sm font-bold ${deltaColorClass}`}>
                                                                                        {deltaFormatted}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        <div className="flex flex-col md:flex-row items-center md:items-center justify-between md:justify-start gap-4 md:gap-8 min-w-fit px-2 md:px-0 w-full">
                                                                            <div className="text-center md:text-left flex-1">
                                                                                <div className="text-sm font-medium text-brand-inactive-text dark:text-dark-body mb-0.5">Estoque Anterior</div>
                                                                                <div className="text-md font-bold text-brand-dark dark:text-dark-heading">{formatQuantityWithUnit(item.product.previousStock, item.product.unit)}</div>
                                                                            </div>

                                                                            <div className="flex items-center justify-center text-brand-inactive-text dark:text-dark-body w-full md:w-auto">
                                                                                <ArrowRightIcon size={18} />
                                                                            </div>

                                                                            <div className="text-center md:text-left flex-1">
                                                                                <div className="text-sm font-medium text-brand-inactive-text dark:text-dark-body mb-0.5">Estoque Pós-Mov.</div>
                                                                                <div className={`text-md font-bold ${deltaColorClass}`}>{formatQuantityWithUnit(item.product.currentStock, item.product.unit)}</div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                }
                                            </div >

                                            {/* Operation Summary below items (like XML import page sidebar) */}
                                            <FormSection title="Resumo da Operação" hasSeparator>
                                                <div className="space-y-4">
                                                    <ListItem
                                                        icon={PinIcon}
                                                        title="Motivo"
                                                        description={reason || "-"}
                                                        className="px-4 py-3 gap-4"
                                                    />
                                                    {data.referenceName && (
                                                        <ListItem
                                                            icon={LinkIcon}
                                                            title="Referência"
                                                            description={data.referenceName}
                                                            className="px-4 py-3 gap-4"
                                                        />
                                                    )}
                                                </div>
                                            </FormSection >

                                            {/* Notes Mobile */}
                                            {
                                                notes && (
                                                    <InfoCard
                                                        color="orange"
                                                        message={
                                                            <div className="flex flex-col">
                                                                <span className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body">Observações</span>
                                                                <span className="text-[15px] font-bold text-brand-dark dark:text-dark-heading truncate">{notes}</span>
                                                            </div>
                                                        }
                                                    />
                                                )
                                            }
                                        </div >
                                    </FadeIn >
                                </TabsContent >

                                {/* Anexos */}
                                <TabsContent value="attachments" className="mt-0" >
                                    <FadeIn key="attachments">
                                        <GenericAttachmentsTab
                                            entityId={movement.id}
                                            partnerId={partnerId}
                                            entityType="stock_movement"
                                            title="Anexos da Movimentação"
                                            subtitle="Gerencie comprovantes, fotos ou notas fiscais desta movimentação."
                                        />
                                    </FadeIn>
                                </TabsContent >
                            </AnimatePresence>
                        </div>
                    </div>
                </Tabs>

                {/* Mobile Action Bar */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3" >
                    {!data.isReversed && (
                        <Button
                            variant="outline"
                            className="flex-1 h-12"
                            onClick={() => setIsUndoModalOpen(true)}
                            leftIcon={<ReloadIcon size={18} />}
                        >
                            Desfazer
                        </Button>
                    )}
                    <Button
                        className="flex-1 h-12"
                        leftIcon={<DownloadIcon size={18} />}
                    >
                        PDF
                    </Button>
                </div >

                <AlertModal
                    isOpen={isUndoModalOpen}
                    onClose={() => setIsUndoModalOpen(false)}
                    onConfirm={handleUndo}
                    title="Desfazer movimentação?"
                    message={
                        <div className="flex flex-col gap-4 mt-2 text-left">
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">Esta ação criará uma movimentação inversa para estornar o estoque. Deseja continuar?</p>
                            <Input
                                label="Motivo do estorno (opcional)"
                                placeholder="Ex: Erro de preenchimento"
                                value={undoReason}
                                onChange={(e) => setUndoReason(e.target.value)}
                            />
                        </div>
                    }
                    confirmText={isUndoing ? "Desfazendo..." : "Desfazer"}
                    variant="warning"
                    isLoading={isUndoing}
                />
            </div>

            {/* Mobile/Tablet: Summary modal */}
            <DefaultModal isOpen={showSummaryModal} onClose={() => setShowSummaryModal(false)} title="Resumo da Operação">
                <div className="space-y-4 text-sm">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-brand-inactive-text dark:text-dark-body">Total de Itens</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading">{displayItems.length}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-brand-inactive-text dark:text-dark-body">Tipo de Movimentação</span>
                        <span className={`font-bold ${data.type === 'in' ? 'text-brand-green' : data.type === 'out' ? 'text-brand-red' : 'text-blue-600 dark:text-blue-400'}`}>{data.type === 'in' ? 'Entrada' : data.type === 'out' ? 'Saída' : 'Ajuste'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-brand-inactive-text dark:text-dark-body">Motivo</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading text-right max-w-[200px] truncate">{reason || "-"}</span>
                    </div>
                    {data.referenceName && (
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-brand-inactive-text dark:text-dark-body">Referência</span>
                            <span className="font-bold text-brand-dark dark:text-dark-heading text-right max-w-[200px] truncate">{data.referenceName}</span>
                        </div>
                    )}
                    <div className="pt-2 border-t border-brand-border dark:border-dark-border">
                        <span className="text-xs text-brand-inactive-text dark:text-dark-body block mb-2">Itens da Movimentação</span>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                            {displayItems.map((item, index) => {
                                const lineIn = item.type === 'in';
                                return (
                                    <div key={item.id} className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2">
                                            <span className="text-brand-dark dark:text-dark-heading font-medium truncate max-w-[150px]">{item.product.name}</span>
                                            <span className="text-brand-inactive-text">({item.product.sku})</span>
                                        </div>
                                        <span className={`font-bold ${lineIn ? 'text-brand-green' : 'text-brand-red'}`}>{lineIn ? '+' : '-'}{item.quantity}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </DefaultModal>
        </FadeIn >
    );
};

export default StockMovementDetailPage;