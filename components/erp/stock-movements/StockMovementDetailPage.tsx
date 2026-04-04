"use client"

import React, { useState } from 'react';
import {
    DownloadIcon,
    ArrowRightIcon,
    UserIcon,
    ThreeDotsIcon,
    RotateIcon,
    ChevronLeftIcon
} from '@/lib/icons';
import { Button, ThreeDotsLoader, ActionsDropdown, AlertModal, Input } from '@/components/reusable';
import { Badge } from '@/components/reusable/Badge';
import { useNotification } from '@/hooks/use-notification';
import { getR2ImageUrl } from '@/lib/utils/get-r2-image-url';
import { motion } from 'framer-motion';
import { undoStockMovementAction } from '@/app/actions/erp/stock-movements';

interface StockMovement {
    id: string;
    displayId?: string;
    date: string;
    product: {
        name: string;
        sku: string;
        image: string;
        category: string;
        previousStock: number;
        currentStock: number;
    };
    type: 'in' | 'out';
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
    const { info } = useNotification();

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
                onBack(); // Volta para a listagem para ver o novo registro
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
            <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-8 px-4 md:px-8">
                <ThreeDotsLoader key="loading" />
            </div>
        );
    }

    const data = movement;
    const isIn = data.type === 'in';

    return (
        <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-300">

            <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

                {/* Sticky Header */}
                <div className={`sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border transition-all duration-300 ${isScrolled ? "py-2" : "py-4 md:py-6"}`}>
                    <div className="max-w-[1400px] mx-auto relative px-4 md:px-8">

                        {/* Back button — desktop only (XL style) */}
                        <div className={`absolute -left-4 top-1/2 -translate-y-1/2 hidden xl:flex transition-all duration-300 ${isScrolled ? "scale-90" : "scale-100"}`}>
                            <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center shadow-sm">
                                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </Button>
                        </div>

                        {/* Header Content */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 overflow-hidden min-w-0">
                                {/* Back Button — mobile and md */}
                                <div className="xl:hidden">
                                    <Button
                                        variant="filled"
                                        onClick={onBack}
                                        className="w-10 h-10 p-0 flex items-center justify-center shadow-sm"
                                    >
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                {/* Title column */}
                                <div className="flex flex-col gap-0.5 overflow-hidden min-w-0">
                                    <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-300 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                        <span className="truncate">{data.reason}</span>
                                        <Badge
                                            variant={isIn ? "green" : "red"}
                                            className="w-fit whitespace-nowrap hidden sm:inline-flex"
                                        >
                                            {isIn ? "Entrada" : "Saída"}
                                        </Badge>
                                    </h1>

                                    {/* Metadata - Hide on scroll or same as Product Page */}
                                    <div className={`overflow-hidden transition-all duration-300 ${isScrolled ? 'max-h-0 opacity-0' : 'max-h-20 opacity-100 mt-0.5'}`}>
                                        <div className="flex flex-wrap items-center gap-2 text-[14px] md:text-[15px] text-brand-inactive-text dark:text-dark-body font-medium">
                                            <span>SKU {data.product.sku}</span>
                                            <span className="text-gray-300 dark:text-gray-600">•</span>
                                            <span>{data.date}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Desktop Actions */}
                            <div className="hidden md:flex items-center gap-3 flex-shrink-0 ml-3">
                                <Button variant="outline" className="h-[42px] px-6" onClick={() => { /* PDF Logic */ }}>
                                    <DownloadIcon className="w-4 h-4 mr-2" /> PDF
                                </Button>
                                
                                <ActionsDropdown
                                    onUndo={() => setIsUndoModalOpen(true)}
                                    className="w-[42px] h-[42px]"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="max-w-[1400px] mx-auto p-4 md:p-8 pt-6">
                    <div className="grid grid-cols-12 gap-y-8 xl:gap-y-0">

                        {/* LEFT COLUMN - MAIN INFO */}
                        <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">

                            {/* Movement Details Card */}
                            <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden mb-8 shadow-sm">
                                {/* Top: Info (Gray) */}
                                <div className="bg-brand-gray dark:bg-dark-border/30 p-6 border-b border-brand-border dark:border-dark-border">
                                    <div className="flex justify-between items-center">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs uppercase tracking-wider font-bold text-brand-inactive-text dark:text-dark-body">Resumo da Operação</span>
                                            <div className="flex items-center gap-1.5 font-bold text-brand-dark dark:text-dark-heading text-[16px]">
                                                {isIn ? "Entrada Manual" : "Saída Manual"}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs uppercase tracking-wider font-bold text-brand-inactive-text dark:text-dark-body">Quantidade</span><br />
                                            <strong className={`font-bold text-2xl ${isIn ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{isIn ? '+' : '-'}{data.quantity}</strong>
                                        </div>
                                    </div>
                                </div>

                                {/* Bottom: Product Info (White) */}
                                <div className="bg-white dark:bg-dark-surface p-6">
                                    <div className="flex flex-col md:flex-row md:items-center gap-6">
                                        <div className="flex items-start gap-5 flex-1">
                                            <div className="w-20 h-20 rounded-full border border-brand-border dark:border-dark-border overflow-hidden flex-shrink-0 bg-brand-gray dark:bg-dark-border/20">
                                                <img
                                                    src={getR2ImageUrl(data.product.image, "thumbnail") || "https://img.dudit.com.br/static/Placeholder.png"}
                                                    className="w-full h-full object-cover rounded-full mix-blend-multiply dark:mix-blend-normal"
                                                    alt={data.product.name}
                                                />
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-lg text-brand-dark dark:text-dark-heading truncate mb-1">{data.product.name}</h4>
                                                
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="gray" className="text-[11px] uppercase tracking-wider font-bold px-1.5">{data.product.sku}</Badge>
                                                    <span className="text-gray-300 dark:text-gray-600">•</span>
                                                    <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">{data.product.category}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Desktop Divider */}
                                        <div className="hidden md:block w-px h-12 bg-brand-border dark:bg-dark-border mx-2"></div>
                                        {/* Mobile Divider */}
                                        <div className="md:hidden w-full h-px bg-brand-border dark:bg-dark-border"></div>

                                        <div className="flex items-center justify-between md:justify-start gap-4 md:gap-8 min-w-fit px-2 md:px-0">
                                            <div className="text-center md:text-left">
                                                <div className="text-[10px] uppercase tracking-wider font-bold text-brand-inactive-text dark:text-dark-body mb-0.5">Estoque Anterior</div>
                                                <div className="text-[15px] font-bold text-brand-dark dark:text-dark-heading">{data.product.previousStock} un</div>
                                            </div>

                                            <div className="flex items-center justify-center text-gray-300 dark:text-gray-600">
                                                <ArrowRightIcon size={18} />
                                            </div>

                                            <div className="text-center md:text-left">
                                                <div className="text-[10px] uppercase tracking-wider font-bold text-brand-inactive-text dark:text-dark-body mb-0.5">Estoque Pós-Mov.</div>
                                                <div className="text-[15px] font-bold text-brand-green">{data.product.currentStock} un</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>

                        {/* RIGHT COLUMN - SIDEBAR */}
                        <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-l-0 xl:border-l border-brand-border dark:border-dark-border space-y-8">
                            
                            {/* Additional Info Section - User Card */}
                            <div>
                                <h3 className="text-[13px] font-bold uppercase tracking-wider text-brand-dark dark:text-dark-heading mb-4">Informações Adicionais</h3>
                                <div className="flex items-center gap-3 p-4 rounded-2xl bg-brand-gray/50 dark:bg-dark-border/20 border border-brand-border dark:border-dark-border">
                                    <div className="w-12 h-12 rounded-full bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border flex items-center justify-center flex-shrink-0">
                                        <UserIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body">Registrado por</span>
                                        <span className="text-[15px] font-bold text-brand-dark dark:text-dark-heading truncate">{data.user}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Notes Section */}
                            {data.notes && (
                                <div>
                                    <h3 className="text-[13px] font-bold uppercase tracking-wider text-brand-dark dark:text-dark-heading mb-4">Observações</h3>
                                    <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border italic text-sm text-brand-dark dark:text-dark-body leading-relaxed">
                                        "{data.notes}"
                                    </div>
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
