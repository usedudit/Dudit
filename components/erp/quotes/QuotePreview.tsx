"use client"

import React, { useMemo } from 'react';
import { formatCurrency, formatDate } from '@/lib/utils';

interface QuotePreviewProps {
    invoiceNumber: string;
    quoteDate: string;
    expiryDate: string;
    selectedCustomer: any;
    quoteItems: any[];
    subtotal: number;
    shippingNum: number;
    otherCosts: number;
    discountValue: number;
    total: number;
    note?: string;
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
        const ROW_HEIGHT = 85;
        const TOTALS_SECTION_HEIGHT = 180;
        const NOTE_HEIGHT = note ? 40 : 0;

        const P1_FIXED_CONTENT_HEIGHT = 570;
        const P1_TOTAL_AVAILABLE_HEIGHT = 1050;
        const P1_AVAILABLE_FOR_ROWS_AND_TOTALS = P1_TOTAL_AVAILABLE_HEIGHT - P1_FIXED_CONTENT_HEIGHT;

        const PN_FIXED_CONTENT_HEIGHT = 300;
        const PN_AVAILABLE_FOR_ROWS_AND_TOTALS = P1_TOTAL_AVAILABLE_HEIGHT - PN_FIXED_CONTENT_HEIGHT;

        const chunks = [];
        let remainingItems = [...quoteItems];

        const requiredHeightAllOnP1 = (remainingItems.length * ROW_HEIGHT) + TOTALS_SECTION_HEIGHT + NOTE_HEIGHT;

        if (requiredHeightAllOnP1 <= P1_AVAILABLE_FOR_ROWS_AND_TOTALS) {
            chunks.push({ items: remainingItems, hasTotals: true, type: 'first' });
            return chunks;
        }

        const maxItemsP1 = Math.floor(P1_AVAILABLE_FOR_ROWS_AND_TOTALS / ROW_HEIGHT);
        const itemsP1 = remainingItems.slice(0, maxItemsP1);
        remainingItems = remainingItems.slice(maxItemsP1);
        chunks.push({ items: itemsP1, hasTotals: false, type: 'first' });

        while (remainingItems.length > 0) {
            const requiredHeightOnPn = (remainingItems.length * ROW_HEIGHT) + TOTALS_SECTION_HEIGHT + NOTE_HEIGHT;

            if (requiredHeightOnPn <= PN_AVAILABLE_FOR_ROWS_AND_TOTALS) {
                chunks.push({ items: remainingItems, hasTotals: true, type: 'middle' });
                remainingItems = [];
            } else {
                const maxItemsPn = Math.floor(PN_AVAILABLE_FOR_ROWS_AND_TOTALS / ROW_HEIGHT);
                const itemsPn = remainingItems.slice(0, maxItemsPn);
                remainingItems = remainingItems.slice(maxItemsPn);
                chunks.push({ items: itemsPn, hasTotals: false, type: 'middle' });
            }
        }

        if (chunks.length > 0 && !chunks[chunks.length - 1].hasTotals) {
            chunks.push({ items: [], hasTotals: true, type: 'middle' });
        }

        if (chunks.length === 0) {
            chunks.push({ items: [], hasTotals: true, type: 'first' });
        }

        return chunks;
    }, [quoteItems, note]);

    return (
        <div className="flex flex-col w-full h-full bg-white dark:bg-dark-surface relative border-l border-brand-border dark:border-dark-border overflow-hidden">
            <div className="absolute top-4 right-4 bottom-4 left-4 bg-[#e5e7eb] dark:bg-dark-surface/50 rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden flex flex-col shadow-sm">

                <div className="flex-1 overflow-y-auto custom-scrollbar p-12 flex flex-col items-center pt-12 space-y-8">

                    {pages.map((page, pageIndex) => (
                        <div key={pageIndex} className="w-full max-w-[650px] bg-white text-[#113833] shadow-md overflow-hidden relative font-sans rounded-sm min-h-[1050px] flex flex-col">

                            <div
                                className="px-8 py-8 relative overflow-hidden flex flex-col justify-between h-[160px] flex-shrink-0"
                                style={{ backgroundColor: primaryColor }}
                            >
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
                                                <img src={partnerAvatar} className="w-full h-full object-cover" alt="Logo" />
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

                            <div className={`flex-1 flex flex-col ${page.type !== 'first' ? 'pt-8' : ''}`}>

                                {page.type === 'first' && (
                                    <>
                                        <div className="px-8 py-6">
                                            <div className="grid grid-cols-4 gap-4 border-b border-gray-100 pb-6 w-full">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Tipo</span>
                                                    <span className="font-bold text-sm text-black">Fatura Financeira</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Data</span>
                                                    <span className="font-bold text-sm text-black">{formatDate(quoteDate)}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Número</span>
                                                    <span className="font-bold text-sm text-black">{invoiceNumber}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Vencimento</span>
                                                    <span className="font-bold text-sm text-black">{formatDate(expiryDate)}</span>
                                                </div>
                                            </div>
                                        </div>

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
                                                            {selectedCustomer.phone && <p>{selectedCustomer.phone}</p>}
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs text-gray-400">Nenhum cliente selecionado</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                <div className="px-8 pb-4">
                                    <table className="w-full text-left border-separate border-spacing-0">
                                        <thead>
                                            <tr className="bg-brand-gray/40">
                                                <th className="py-2.5 pl-6 pr-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider rounded-tl-xl border-b border-gray-100">Item</th>
                                                <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-center w-24 border-b border-gray-100">Qtd</th>
                                                <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-right w-28 border-b border-gray-100">Preço</th>
                                                <th className="py-2.5 pl-4 pr-6 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-right w-32 rounded-tr-xl border-b border-gray-100">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {page.items.map((item, idx) => (
                                                <tr key={idx} className="bg-white">
                                                    <td className="py-2 pl-6 pr-4 border-b border-gray-50">
                                                        <span className="font-bold text-[13px] text-black block truncate max-w-[250px]">
                                                            {item.name || 'Produto sem nome'}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-4 border-b border-gray-50 text-center">
                                                        <span className="text-[13px] font-medium text-gray-600">
                                                            {item.qty}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-4 border-b border-gray-50 text-right">
                                                        <span className="text-[13px] font-medium text-gray-600">
                                                            {formatCurrency(item.price).replace('R$', '$')}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 pl-4 pr-6 border-b border-gray-50 text-right">
                                                        <span className="text-[13px] font-bold text-black">
                                                            {formatCurrency(item.price * item.qty).replace('R$', '$')}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {page.hasTotals && (
                                    <div className="mt-8">
                                        <div className="px-8 pb-6 flex justify-start">
                                            <div className="w-full bg-[#f8f9fa] p-6 rounded-lg text-black">
                                                <div className="flex justify-between items-center text-xs mb-2">
                                                    <span className="text-gray-500 font-medium">Subtotal</span>
                                                    <span className="font-bold">
                                                        {formatCurrency(subtotal)}
                                                    </span>
                                                </div>

                                                {shippingNum > 0 && (
                                                    <div className="flex justify-between items-center text-xs mb-2">
                                                        <span className="text-gray-500 font-medium">Frete</span>
                                                        <span className="font-bold">
                                                            {formatCurrency(shippingNum)}
                                                        </span>
                                                    </div>
                                                )}
                                                {otherCosts > 0 && (
                                                    <div className="flex justify-between items-center text-xs mb-2">
                                                        <span className="text-gray-500 font-medium">Outros Custos</span>
                                                        <span className="font-bold">
                                                            {formatCurrency(otherCosts)}
                                                        </span>
                                                    </div>
                                                )}
                                                {discountValue > 0 && (
                                                    <div className="flex justify-between items-center text-xs mb-2">
                                                        <span className="text-gray-500 font-medium">Desconto</span>
                                                        <span className="font-bold text-brand-red">
                                                            -{formatCurrency(discountValue)}
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="border-t border-gray-200 my-3"></div>
                                                <div className="flex justify-between items-center">
                                                    <span className="font-bold text-sm">Total</span>
                                                    <div className="text-white px-3 py-1.5 rounded text-sm font-bold shadow-sm" style={{ backgroundColor: primaryColor }}>
                                                        {formatCurrency(total)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

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

                                {!page.hasTotals && <div className="mt-auto"></div>}

                            </div>

                            <div
                                className="text-white/80 px-8 py-2 text-[10px] flex justify-end items-center absolute bottom-0 w-full h-[40px]"
                                style={{ backgroundColor: primaryColor }}
                            >
                                <span>Criado via Dudit - www.dudit.com.br</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default QuotePreview;
