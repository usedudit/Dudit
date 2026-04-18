"use client"

import React, { useState } from 'react';
import {
    DownloadIcon,
    ArrowRightIcon,
    RotateIcon,
    ChevronLeftIcon
} from '@/lib/icons';
import { Button, ThreeDotsLoader, AlertModal, Input, InfoCard } from '@/components/reusable';
import { Badge } from '@/components/reusable/Badge';
import { useNotification } from '@/hooks/use-notification';
import { getR2ImageUrl } from '@/lib/utils/get-r2-image-url';
import { undoStockMovementAction } from '@/app/actions/erp/stock-movements';

interface MovementItemData {
    id: string;
    product: {
        name: string;
        sku: string;
        image: string;
        category: string;
        previousStock: number;
        currentStock: number;
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
}

interface StockMovementDetailProps {
    onBack: () => void;
    movement: StockMovement | null;
    isLoading?: boolean;
}

const StockMovementDetailPage = ({ onBack, movement, isLoading }: StockMovementDetailProps) => {
    const [isScrolled, setIsScrolled] = useState(false);
    const scrollContainerRef = React.useRef<HTMLDivElement>(null);

    const handleScroll = React.useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5);
    }, []);

    const [isUndoModalOpen, setIsUndoModalOpen] = useState(false);
    const [undoReason, setUndoReason] = useState('');
    const [isUndoing, setIsUndoing] = useState(false);
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

    return (
        <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
            <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth custom-scrollbar">

                {/* Sticky Header */}
                <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                    <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                        {/* Back button - desktop only */}
                        <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                            <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </Button>
                        </div>

                        {/* Title row */}
                        <div className="hidden md:flex items-start justify-between mb-4">
                            <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                    <span className="truncate">{data.displayId}</span>
                                    <Badge
                                        variant={isIn ? "green" : "red"}
                                        className="whitespace-nowrap scale-90 shrink-0"
                                    >
                                        {isIn ? "Entrada" : "Saída"}
                                    </Badge>
                                </h1>

                                <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                    <div className="flex items-center gap-2">
                                        <span>{data.date}</span>
                                        <span className="text-brand-inactive-text dark:text-dark-body opacity-50">•</span>
                                        <span>Registrado por <strong className="font-semibold text-brand-dark dark:text-dark-heading">{data.user}</strong></span>
                                    </div>
                                </div>
                            </div>

                            {/* Desktop Actions */}
                            <div className="flex items-center gap-3 shrink-0 ml-3">
                                <Button
                                    variant="outline"
                                    className="h-[42px] px-6"
                                    onClick={() => setIsUndoModalOpen(true)}
                                >
                                    <RotateIcon className="w-4 h-4 mr-2" /> Desfazer
                                </Button>

                                <Button className="h-[42px] px-6" onClick={() => { /* PDF Logic */ }}>
                                    <DownloadIcon className="w-4 h-4 mr-2" /> PDF
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="max-w-[1300px] mx-auto p-4 md:p-8 pt-6">
                    <div className="grid grid-cols-12 gap-y-8 xl:gap-y-0">

                        {/* LEFT COLUMN - MAIN INFO */}
                        <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">

                            {/* Movement Details Card */}
                            <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden mb-8">
                                {/* Top: Info (Gray) */}
                                <div className="bg-brand-gray dark:bg-dark-border/30 p-6 border-b border-brand-border dark:border-dark-border">
                                    <div className="flex justify-between items-center">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body mb-0.5">Resumo da Operação</span>
                                            <div className="flex items-center gap-1.5 font-bold text-brand-dark dark:text-dark-heading text-[16px]">
                                                {isIn ? "Entrada Manual" : "Saída Manual"}
                                                <span className="text-[13px] font-medium text-brand-inactive-text ml-2">
                                                    {displayItems.length} {displayItems.length === 1 ? 'item' : 'itens'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Bottom: Product Items (White) */}
                                <div className="bg-white dark:bg-dark-surface">
                                    {displayItems.map((item, index) => {
                                        const lineIn = item.type === 'in';
                                        return (
                                            <div key={item.id}>
                                                {index > 0 && (
                                                    <div className="h-px bg-brand-border dark:bg-dark-border mx-6" />
                                                )}
                                                <div className="p-6">
                                                    <div className="flex flex-col md:flex-row md:items-center gap-6">
                                                        <div className="flex items-start gap-5 flex-1">
                                                            <div className="w-12 h-12 rounded-full border border-brand-border dark:border-dark-border overflow-hidden shrink-0 bg-brand-gray dark:bg-dark-border/20">
                                                                <img
                                                                    src={getR2ImageUrl(item.product.image, "thumbnail") || "https://img.dudit.com.br/static/Placeholder.png"}
                                                                    className="w-full h-full object-cover rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border"
                                                                    alt={item.product.name}
                                                                />
                                                            </div>

                                                            <div className="flex-1 min-w-0">
                                                                <h4 className="font-bold text-lg text-brand-dark dark:text-dark-heading truncate mb-1">{item.product.name}</h4>

                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">{item.product.sku}</span>
                                                                    <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                                                                    <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">{item.product.category}</span>
                                                                    <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                                                                    <span className={`text-sm font-bold ${lineIn ? 'text-brand-green' : 'text-brand-red'}`}>
                                                                        {lineIn ? '+' : '-'}{item.quantity}
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
                                                                <div className="text-md font-bold text-brand-dark dark:text-dark-heading">{item.product.previousStock} un</div>
                                                            </div>

                                                            <div className="flex items-center justify-center text-brand-inactive-text dark:text-dark-body">
                                                                <ArrowRightIcon size={18} />
                                                            </div>

                                                            <div className="text-center md:text-left">
                                                                <div className="text-sm font-medium text-brand-inactive-text dark:text-dark-body mb-0.5">Estoque Pós-Mov.</div>
                                                                <div className={`text-md font-bold ${lineIn ? 'text-brand-green' : 'text-brand-red'}`}>{item.product.currentStock} un</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                        </div>

                        {/* RIGHT COLUMN - SIDEBAR */}
                        <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-l-0 xl:border-l border-brand-border dark:border-dark-border space-y-8">

                            {/* Additional Info - InfoCard */}
                            <div>
                                <InfoCard
                                    color="gray"
                                    message={
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body">Motivo</span>
                                            <span className="text-[15px] font-bold text-brand-dark dark:text-dark-heading truncate">{data.reason || "-"}</span>
                                        </div>
                                    }
                                />
                            </div>

                            {/* Notes Section */}
                            {data.notes && (
                                <div>
                                    <InfoCard
                                        color="orange"
                                        message={
                                            <div className="flex flex-col">
                                                <span className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body">Observações</span>
                                                <span className="text-[15px] font-bold text-brand-dark dark:text-dark-heading truncate">{data.notes}</span>
                                            </div>
                                        }
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile Action Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3">
                <Button
                    variant="outline"
                    className="flex-1 h-[48px]"
                    onClick={() => setIsUndoModalOpen(true)}
                >
                    <RotateIcon className="w-4 h-4 mr-2" />
                    Desfazer
                </Button>
                <Button
                    className="flex-1 h-[48px]"
                >
                    <DownloadIcon className="w-4 h-4 mr-2" />
                    PDF
                </Button>
            </div>

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
    );
};

export default StockMovementDetailPage;
