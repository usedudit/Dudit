"use client"

import React, { useState } from 'react';
import {
    ChevronLeftIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    CheckCircleIcon,
    DownloadIcon,
    ArrowRightIcon
} from '@/lib/icons';
import { Button, InfoCard } from '@/components/reusable';
import { Badge } from '@/components/reusable/Badge';
import { useNotification } from '@/hooks/use-notification';
import { getR2ImageUrl } from '@/lib/utils/get-r2-image-url';

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

    if (isLoading || !movement) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-white dark:bg-dark-surface">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-green"></div>
                <p className="mt-4 text-brand-inactive-text dark:text-dark-body">Carregando detalhes...</p>
            </div>
        );
    }

    const data = movement;
    const isIn = data.type === 'in';

    return (
        <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-300">

            <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

                {/* Sticky Header */}
                <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border transition-all duration-300">
                    <div className="max-w-[1400px] mx-auto relative px-4 md:px-8 py-4 md:py-6">

                        {/* Header Content */}
                        <div className="flex items-start justify-between">
                            <div className="flex items-start gap-4 overflow-hidden min-w-0">
                                {/* Back Button */}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={onBack}
                                    className="w-10 h-10 p-0 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-dark-border flex-shrink-0 mt-1"
                                >
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>

                                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                    <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-300 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                        <span className="truncate">{data.displayId || data.id}</span>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {isIn ? (
                                                <Badge variant="green" className="flex items-center"><ChevronDownIcon /> Entrada</Badge>
                                            ) : (
                                                <Badge variant="red" className="flex items-center"><ChevronUpIcon /> Saída</Badge>
                                            )}
                                            <Badge variant="gray" className="flex items-center">
                                                <CheckCircleIcon className="text-brand-green" /> Concluído
                                            </Badge>
                                        </div>
                                    </h1>

                                    {/* Metadata - Hide on scroll for smaller text */}
                                    <div className={`overflow-hidden transition-all duration-300 ${isScrolled ? 'max-h-0 opacity-0' : 'max-h-20 opacity-100 mt-1'}`}>
                                        <div className="flex flex-wrap items-center gap-2 text-[15px] text-brand-inactive-text dark:text-dark-body font-medium">
                                            <span className="flex items-center gap-1">Data: {data.date}</span>
                                            <span className="text-gray-300 dark:text-gray-600 mx-1">•</span>
                                            <span className="flex items-center gap-1">{data.user}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Desktop Actions */}
                            <div className="hidden md:flex items-center gap-3 flex-shrink-0 ml-3">
                                <Button
                                    className="px-6 h-[42px] flex items-center gap-2 whitespace-nowrap bg-brand-green hover:bg-brand-green/90 text-white border-none"
                                >
                                    <DownloadIcon className="w-4.5 h-4.5" />
                                    Exportar PDF
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="max-w-[1400px] mx-auto p-4 md:p-8 pt-6">
                    <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">

                        {/* LEFT COLUMN - MAIN INFO */}
                        <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">

                            {/* Movement Details Card */}
                            <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden mb-8">
                                {/* Top: Info (Gray) */}
                                <div className="bg-brand-gray dark:bg-dark-border/50 p-6 border-b border-brand-border dark:border-dark-border">
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-sm text-brand-inactive-text dark:text-dark-body font-bold text-[10px]">Motivo da Movimentação</span>
                                            <div className="flex items-center gap-1.5 font-bold text-brand-dark dark:text-dark-heading text-[15px]">
                                                {data.reason}
                                            </div>
                                        </div>
                                        <div className="text-sm text-brand-inactive-text dark:text-dark-body text-right">
                                            <span className="font-bold text-[10px]">Quantidade</span><br />
                                            <strong className={`font-bold text-lg ${isIn ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{isIn ? '+' : '-'}{data.quantity}</strong>
                                        </div>
                                    </div>
                                </div>

                                {/* Bottom: Product Info (White) */}
                                <div className="bg-white dark:bg-dark-surface p-6">
                                    <div className="flex flex-col md:flex-row md:items-center gap-6">
                                        <div className="flex items-start gap-4 flex-1">
                                            <div className="w-20 h-20 rounded-full border border-brand-border dark:border-dark-border overflow-hidden flex-shrink-0 bg-brand-gray dark:bg-dark-border/20">
                                                <img
                                                    src={getR2ImageUrl(data.product.image, "thumbnail") || "https://img.dudit.com.br/static/Placeholder.png"}
                                                    className="w-full h-full object-cover rounded-full mix-blend-multiply dark:mix-blend-normal"
                                                    alt={data.product.name}
                                                />
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start mb-1">
                                                    <h4 className="font-bold text-lg text-brand-dark dark:text-dark-heading truncate pr-4">{data.product.name}</h4>
                                                </div>

                                                <div className="flex items-center gap-2 mt-2">
                                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{data.product.sku}</div>
                                                    <span className="text-gray-300 dark:text-gray-600">•</span>
                                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{data.product.category}</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Separator for mobile, Divider for desktop */}
                                        <div className="w-full h-px md:w-px md:h-12 bg-brand-border dark:bg-dark-border flex-shrink-0 md:mx-2"></div>

                                        <div className="flex items-center justify-between md:justify-start gap-4 md:gap-6 min-w-fit">
                                            <div>
                                                <div className="text-[10px] font-bold text-brand-inactive-text dark:text-dark-body mb-1">Anterior</div>
                                                <div className="text-sm font-medium text-brand-dark dark:text-dark-heading">{data.product.previousStock} un</div>
                                            </div>

                                            <div className="flex items-center justify-center text-brand-inactive-text mt-4">
                                                <ArrowRightIcon size={16} />
                                            </div>

                                            <div>
                                                <div className="text-[10px] font-bold text-brand-inactive-text dark:text-dark-body mb-1">Atual</div>
                                                <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{data.product.currentStock} un</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>

                        {/* RIGHT COLUMN - SIDEBAR */}
                        <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-l-0 xl:border-l border-brand-border dark:border-dark-border mt-8 xl:mt-0 space-y-6">

                            {/* Notes Section */}
                            {data.notes && (
                                <InfoCard
                                    color="gray"
                                    title="Observações"
                                    message={data.notes}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile Action Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3">
                <Button
                    className="flex-1 h-[48px] font-bold bg-brand-green hover:bg-brand-green/90 text-white border-none"
                >
                    <DownloadIcon className="w-4 h-4 mr-2" />
                    Exportar PDF
                </Button>
            </div>
        </div>
    );
};

export default StockMovementDetailPage;
