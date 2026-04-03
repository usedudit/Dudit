"use client"

import React, { useMemo } from 'react';

interface QuotePreviewProps {
    invoiceNumber: string;
    quoteDate: string;
    expiryDate: string;
    selectedCustomer: any;
    quoteItems: any[];
    subtotal: number;
    tax: number;
    shippingNum: number;
    otherCosts: number;
    discountValue: number;
    total: number;
    note?: string; // Added note prop
    primaryColor?: string;
    secondaryColor?: string;
    quoteTitle?: string;
    quoteSubtitle?: string;
    partnerName?: string;
    partnerAddress?: string;
    partnerAvatar?: string;
}

const QuotePreview = ({
    invoiceNumber,
    quoteDate,
    expiryDate,
    selectedCustomer,
    quoteItems,
    subtotal,
    tax,
    shippingNum,
    otherCosts,
    discountValue,
    total,
    note,
    primaryColor = '#003d32',
    secondaryColor = '#059669',
    quoteTitle = 'ORÇAMENTO',
    quoteSubtitle,
    partnerName = 'Parceiro',
    partnerAddress = 'Endereço não cadastrado',
    partnerAvatar
}: QuotePreviewProps) => {

    // Advanced Pagination Logic
    const pages = useMemo(() => {
        // Pixel heights based on styling
        const ROW_HEIGHT = 85; // Increased to match new ListItem styling height + gap
        const TOTALS_SECTION_HEIGHT = 180; // Height of totals box (reduced since tax is gone)
        const NOTE_HEIGHT = note ? 40 : 0; // Estimated height for note if present

        // Page 1 has Header + Meta + Address + Table Header + Bottom Bar (40px) + Padding
        const P1_FIXED_CONTENT_HEIGHT = 570;
        const P1_TOTAL_AVAILABLE_HEIGHT = 1050;
        const P1_AVAILABLE_FOR_ROWS_AND_TOTALS = P1_TOTAL_AVAILABLE_HEIGHT - P1_FIXED_CONTENT_HEIGHT;

        // Page N has Header (160) + Table Head (40) + Bottom (40) + Padding = ~300px used
        const PN_FIXED_CONTENT_HEIGHT = 300;
        const PN_AVAILABLE_FOR_ROWS_AND_TOTALS = P1_TOTAL_AVAILABLE_HEIGHT - PN_FIXED_CONTENT_HEIGHT;

        const chunks = [];
        let remainingItems = [...quoteItems];

        // --- PAGE 1 CALCULATION ---

        // 1. Calculate required height for ALL items + totals on Page 1
        const requiredHeightAllOnP1 = (remainingItems.length * ROW_HEIGHT) + TOTALS_SECTION_HEIGHT + NOTE_HEIGHT;

        // STRICT CHECK: If it fits, put it all on Page 1
        if (requiredHeightAllOnP1 <= P1_AVAILABLE_FOR_ROWS_AND_TOTALS) {
            chunks.push({ items: remainingItems, hasTotals: true, type: 'first' });
            return chunks;
        }

        // 2. If it doesn't fit, fill Page 1 with MAX items possible
        // We do NOT reserve space for totals here because they won't fit anyway.
        // We fill P1 with items only.
        const maxItemsP1 = Math.floor(P1_AVAILABLE_FOR_ROWS_AND_TOTALS / ROW_HEIGHT);

        const itemsP1 = remainingItems.slice(0, maxItemsP1);
        remainingItems = remainingItems.slice(maxItemsP1);
        chunks.push({ items: itemsP1, hasTotals: false, type: 'first' });

        // --- SUBSEQUENT PAGES CALCULATION ---

        while (remainingItems.length > 0) {
            // Check if remaining items + totals fit on this new page
            const requiredHeightOnPn = (remainingItems.length * ROW_HEIGHT) + TOTALS_SECTION_HEIGHT + NOTE_HEIGHT;

            if (requiredHeightOnPn <= PN_AVAILABLE_FOR_ROWS_AND_TOTALS) {
                // Fits! Put everything remaining here + totals
                chunks.push({ items: remainingItems, hasTotals: true, type: 'middle' });
                remainingItems = []; // Done
            } else {
                // Doesn't fit, fill this page with items only
                const maxItemsPn = Math.floor(PN_AVAILABLE_FOR_ROWS_AND_TOTALS / ROW_HEIGHT);
                const itemsPn = remainingItems.slice(0, maxItemsPn);
                remainingItems = remainingItems.slice(maxItemsPn);
                chunks.push({ items: itemsPn, hasTotals: false, type: 'middle' });
            }
        }

        // Edge Case: If we finished items but the last chunk didn't have totals (because it was full of items),
        // we need a separate page just for totals.
        if (chunks.length > 0 && !chunks[chunks.length - 1].hasTotals) {
            chunks.push({ items: [], hasTotals: true, type: 'middle' });
        }

        // If no items at all initially (empty state)
        if (chunks.length === 0) {
            chunks.push({ items: [], hasTotals: true, type: 'first' });
        }

        return chunks;
    }, [quoteItems, note]);

    return (
        <div className="hidden xl:flex flex-col w-1/2 h-full bg-white dark:bg-dark-surface relative border-l border-brand-border dark:border-dark-border">
            <div className="absolute top-4 right-4 bottom-4 left-4 bg-[#e5e7eb] dark:bg-dark-surface/50 rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden flex flex-col shadow-sm">

                {/* Preview Content Scrollable */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-12 flex flex-col items-center pt-12 space-y-8">

                    {pages.map((page, pageIndex) => {
                        return (
                            <div key={pageIndex} className="w-full max-w-[650px] bg-white text-[#113833] shadow-md overflow-hidden relative font-sans rounded-sm min-h-[1050px] flex flex-col">

                                {/* 1. Header - Dynamic Colors */}
                                <div
                                    className="px-8 py-8 relative overflow-hidden flex flex-col justify-between h-[160px] flex-shrink-0"
                                    style={{ backgroundColor: primaryColor }}
                                >
                                    {/* Abstract Shapes (Pills) */}
                                    <div className="absolute -top-12 right-6 flex gap-3 opacity-90 rotate-180">
                                        <div className="flex flex-col gap-3">
                                            <div className="w-14 h-24 rounded-full" style={{ backgroundColor: secondaryColor }}></div>
                                            <div className="w-14 h-24 rounded-full" style={{ backgroundColor: secondaryColor }}></div>
                                            <div className="w-14 h-24 rounded-full" style={{ backgroundColor: secondaryColor }}></div>
                                        </div>
                                        <div className="flex flex-col gap-3 -mt-12">
                                            <div className="w-14 h-24 rounded-full" style={{ backgroundColor: secondaryColor }}></div>
                                            <div className="w-14 h-24 rounded-full" style={{ backgroundColor: secondaryColor }}></div>
                                            <div className="w-14 h-24 rounded-full" style={{ backgroundColor: secondaryColor }}></div>
                                        </div>
                                    </div>

                                    <div className="relative z-10 mt-2">
                                        <div className="flex items-center gap-3 mb-6">
                                            {partnerAvatar ? (
                                                <div className="w-8 h-8 rounded-full overflow-hidden bg-white flex-shrink-0">
                                                    <img src={partnerAvatar} className="w-full h-full object-cover" alt="Logo do Parceiro" />
                                                </div>
                                            ) : (
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white text-[15px] font-bold text-black flex-shrink-0">
                                                    {partnerName.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <span className="text-white font-bold text-sm tracking-wide">{partnerName.toUpperCase()}</span>
                                        </div>

                                        <div>
                                            <h1 className="text-3xl font-medium text-white tracking-wide leading-none">{quoteTitle}</h1>
                                            <p className="text-white/60 text-[10px] tracking-widest font-light mt-1 uppercase">
                                                {quoteSubtitle || `Proposta Comercial #${invoiceNumber}`}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Content Container */}
                                <div className={`flex-1 flex flex-col ${page.type !== 'first' ? 'pt-8' : ''}`}>

                                    {/* 2. Meta Data & Addresses (Only on Page 1) */}
                                    {page.type === 'first' && (
                                        <>
                                            {/* Meta Data Grid */}
                                            <div className="px-8 py-6">
                                                <div className="grid grid-cols-4 gap-4 border-b border-gray-100 pb-6 w-full">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Tipo</span>
                                                        <span className="font-bold text-sm text-black">Fatura Financeira</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Data</span>
                                                        <span className="font-bold text-sm text-black">{new Date(quoteDate).toLocaleDateString('pt-BR')}</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Número</span>
                                                        <span className="font-bold text-sm text-black">{invoiceNumber}</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Vencimento</span>
                                                        <span className="font-bold text-sm text-black">{new Date(expiryDate).toLocaleDateString('pt-BR')}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Addresses */}
                                            <div className="px-8 pb-6">
                                                <div className="grid grid-cols-2 gap-8">
                                                    <div>
                                                        <h3 className="font-bold text-sm text-black mb-3">Emitente</h3>
                                                        <div className="text-xs text-gray-600 space-y-1">
                                                            <p className="font-bold uppercase text-black">{partnerName}</p>
                                                            <p className="whitespace-pre-wrap">{partnerAddress}</p>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-sm text-black mb-3">Destinatário</h3>
                                                        {selectedCustomer ? (
                                                            <div className="text-xs text-gray-600 space-y-1">
                                                                <p className="font-bold text-black">{selectedCustomer.name}</p>
                                                                <p>{selectedCustomer.email}</p>
                                                                <p>{selectedCustomer.phone || "(XX) XXXXX-XXXX"}</p>
                                                            </div>
                                                        ) : (
                                                            <p className="text-xs text-gray-400">Nenhum cliente selecionado</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* 4. List Items */}
                                    <div className="px-8 pb-4 space-y-3">
                                        <h3 className="font-bold text-sm text-black mb-3">Itens da Proposta</h3>
                                        {page.items.map((item, idx) => (
                                            <div key={idx} className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 bg-white">
                                                {/* Left side: Avatar/Image if available */}
                                                <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 flex-shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold text-gray-400">
                                                    {item.image && item.image.length > 5 ? (
                                                        <img src={item.image} className="w-full h-full object-cover mix-blend-multiply" alt={item.name} />
                                                    ) : (
                                                        <span className="uppercase">{item.name?.charAt(0) || 'P'}</span>
                                                    )}
                                                </div>

                                                {/* Middle side: Titles */}
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="text-sm font-bold text-black truncate">{item.name || 'Novo Item'}</h3>
                                                    <p className="text-xs text-gray-500 leading-tight truncate mt-0.5">
                                                        {item.sku ? `SKU: ${item.sku} • ` : ''}{item.qty} un • {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price)}
                                                    </p>
                                                </div>

                                                {/* Right side: Total Price */}
                                                <div className="text-right flex-shrink-0">
                                                    <p className="font-bold text-[15px] text-black">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.qty * item.price)}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* 5. Total & Note (Only if hasTotals is true) */}
                                    {page.hasTotals && (
                                        <div className="mt-8">
                                            {/* Totals Section */}
                                            <div className="px-8 pb-6 flex justify-start">
                                                <div className="w-full bg-[#f8f9fa] p-6 rounded-lg text-black">
                                                    <div className="flex justify-between items-center text-xs mb-2">
                                                        <span className="text-gray-500 font-medium">Subtotal</span>
                                                        <span className="font-bold">
                                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal)}
                                                        </span>
                                                    </div>

                                                    {shippingNum > 0 && (
                                                        <div className="flex justify-between items-center text-xs mb-2">
                                                            <span className="text-gray-500 font-medium">Frete</span>
                                                            <span className="font-bold">
                                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(shippingNum)}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {otherCosts > 0 && (
                                                        <div className="flex justify-between items-center text-xs mb-2">
                                                            <span className="text-gray-500 font-medium">Outros Custos</span>
                                                            <span className="font-bold">
                                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(otherCosts)}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {discountValue > 0 && (
                                                        <div className="flex justify-between items-center text-xs mb-2">
                                                            <span className="text-gray-500 font-medium">Desconto</span>
                                                            <span className="font-bold text-red-500">
                                                                -{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(discountValue)}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className="border-t border-gray-200 my-3"></div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-bold text-sm">Total</span>
                                                        <div className="text-white px-3 py-1.5 rounded text-sm font-bold shadow-sm" style={{ backgroundColor: primaryColor }}>
                                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Notes Section - Conditional */}
                                            {note && (
                                                <div className="px-8 pb-12">
                                                    <div className="w-full bg-[#f8f9fa] p-4 rounded-lg">
                                                        <h4 className="font-bold text-xs mb-1.5 text-black">Observações da Proposta</h4>
                                                        <p className="text-[11px] text-gray-500 leading-relaxed whitespace-pre-wrap">
                                                            {note}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Push footer down if no totals on this page */}
                                    {!page.hasTotals && <div className="mt-auto"></div>}

                                </div>

                                {/* 7. Bottom Bar (Fixed at bottom of every page) */}
                                <div
                                    className="text-white/80 px-8 py-2 text-[10px] flex justify-end items-center absolute bottom-0 w-full h-[40px]"
                                    style={{ backgroundColor: primaryColor }}
                                >
                                    <span>Criado via Dudit - www.dudit.com.br</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div >
    );
};

export default QuotePreview;
