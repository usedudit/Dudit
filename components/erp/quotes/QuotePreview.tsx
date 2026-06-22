"use client"

import { useMemo } from 'react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { QUOTE_DEFAULT_CUSTOMER_LABEL } from "@/lib/quotes/quote-edit-rules";
import { QUOTE_PREVIEW_PRIMARY_COLOR, QUOTE_PREVIEW_SECONDARY_COLOR, getThemeColorsByAvatarColor } from "@/lib/quotes/quote-preview-theme";
import { UserProfileImage } from '@/lib/utils/UserProfileImage';
import { getAvatarColor } from '@/lib/utils/avatar';

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
    printMode?: boolean;
    showDecoration?: boolean;
    showCustomerContact?: boolean;
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
    primaryColor = QUOTE_PREVIEW_PRIMARY_COLOR,
    secondaryColor = QUOTE_PREVIEW_SECONDARY_COLOR,
    quoteTitle = 'Orçamento',
    quoteSubtitle,
    partnerName = 'Parceiro',
    partnerAddress = 'Endereço não cadastrado',
    partnerAvatar,
    printMode = false,
    showDecoration = true,
    showCustomerContact = true
}: QuotePreviewProps) => {

    const resolvedColors = useMemo(() => {
        const avatarColor = getAvatarColor(partnerName);
        const mapped = getThemeColorsByAvatarColor(avatarColor);
        return {
            primary: primaryColor === QUOTE_PREVIEW_PRIMARY_COLOR ? mapped.primary : primaryColor,
            secondary: secondaryColor === QUOTE_PREVIEW_SECONDARY_COLOR ? mapped.secondary : secondaryColor
        };
    }, [partnerName, primaryColor, secondaryColor]);

    const customerAddressText = useMemo(() => {
        if (!selectedCustomer) return null;

        const formatAddr = (addr: {
            street?: string | null;
            number?: string | number | null;
            complement?: string | null;
            neighborhood?: string | null;
            city?: string | null;
            state?: string | null;
            uf?: string | null;
            zip_code?: string | null;
            zipCode?: string | null;
        }) => {
            const streetStr = addr.street || "";
            const numStr = addr.number ? `, ${addr.number}` : "";
            const compStr = addr.complement ? ` - ${addr.complement}` : "";
            const line1 = `${streetStr}${numStr}${compStr}`.trim().replace(/^,/, "").trim();

            const neighStr = addr.neighborhood || "";
            const cityStr = addr.city || "";
            const stateStr = addr.state || addr.uf || "";
            const line2 = `${neighStr ? `${neighStr} - ` : ""}${cityStr}${stateStr ? `/${stateStr}` : ""}`.trim();

            const zipStr = addr.zip_code || addr.zipCode || "";
            const line3 = zipStr ? `CEP: ${zipStr}` : "";

            return [line1, line2, line3].filter(Boolean).join("\n");
        };

        const addresses = selectedCustomer.addresses;
        if (addresses && addresses.length > 0) {
            const primaryAddr = addresses.find((a: any) => a.address_type === "primary" || a.is_default) || addresses[0];
            return formatAddr(primaryAddr);
        }

        const street = selectedCustomer.address_street || selectedCustomer.street;
        const number = selectedCustomer.address_number || selectedCustomer.number;
        const complement = selectedCustomer.address_complement || selectedCustomer.complement;
        const neighborhood = selectedCustomer.address_neighborhood || selectedCustomer.neighborhood;
        const city = selectedCustomer.address_city || selectedCustomer.city;
        const state = selectedCustomer.address_state || selectedCustomer.address_uf || selectedCustomer.state || selectedCustomer.uf;
        const zipCode = selectedCustomer.address_zip_code || selectedCustomer.zipCode || selectedCustomer.zip_code;

        if (street || city || zipCode) {
            return formatAddr({ street, number, complement, neighborhood, city, state, zip_code: zipCode });
        }

        return null;
    }, [selectedCustomer]);

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

        const chunks: { items: any[]; hasTotals: boolean; type: string }[] = [];
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
        <div className={`flex flex-col w-full h-full bg-white dark:bg-dark-surface relative overflow-hidden ${printMode ? "quote-a4-print" : "border-l border-brand-border dark:border-dark-border"}`}>
            <div className={printMode ? "w-full p-0" : "absolute top-4 right-4 bottom-4 left-4 bg-[#e5e7eb] dark:bg-dark-surface/50 rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden flex flex-col shadow-sm"}>
                <div className={printMode ? "w-full flex flex-col items-center p-0" : "flex-1 overflow-auto custom-scrollbar p-4 md:p-12 flex flex-col items-start lg:items-center pt-12 space-y-8"}>
                    {pages.map((page, pageIndex) => (
                        <div
                            key={pageIndex}
                            className={`w-[650px] min-w-[650px] shrink-0 bg-white text-[#113833] overflow-hidden relative font-sans min-h-[1050px] flex flex-col ${printMode ? "pdf-print-page" : "shadow-md rounded-sm"}`}
                        >
                            {/* ✅ HEADER — relative z-10 agora está DENTRO desta div */}
                            <div
                                className="px-8 py-8 relative overflow-hidden flex flex-col justify-between h-[160px] shrink-0"
                                style={{ backgroundColor: resolvedColors.primary }}
                            >
                                {showDecoration && (
                                    <div className="absolute -top-12 right-6 flex gap-3 opacity-90 rotate-180">
                                        <div className="flex flex-col gap-3">
                                            <div className="w-14 h-24 rounded-full" style={{ backgroundColor: resolvedColors.secondary }}></div>
                                            <div className="w-14 h-24 rounded-full" style={{ backgroundColor: resolvedColors.secondary }}></div>
                                            <div className="w-14 h-24 rounded-full" style={{ backgroundColor: resolvedColors.secondary }}></div>
                                        </div>
                                        <div className="flex flex-col gap-3 -mt-12">
                                            <div className="w-14 h-24 rounded-full" style={{ backgroundColor: resolvedColors.secondary }}></div>
                                            <div className="w-14 h-24 rounded-full" style={{ backgroundColor: resolvedColors.secondary }}></div>
                                            <div className="w-14 h-24 rounded-full" style={{ backgroundColor: resolvedColors.secondary }}></div>
                                        </div>
                                    </div>
                                )}

                                {/* Nome do parceiro + título do orçamento */}
                                <div className="relative z-10">
                                    <div className="flex items-center gap-3 mb-6">
                                        <UserProfileImage
                                            fullName={partnerName}
                                            imageUrl={partnerAvatar && !partnerAvatar.includes("Placeholder.png") ? partnerAvatar : null}
                                            className="w-8 h-8 shrink-0 text-[13px] font-bold"
                                            style={{ backgroundColor: resolvedColors.secondary }}
                                        />
                                        <span className="text-white font-bold text-sm">{partnerName}</span>
                                    </div>

                                    <div>
                                        <h1 className="text-3xl font-medium text-white">{quoteTitle}</h1>
                                        <p className="text-white/80 text-xs tracking-widest font-light mt-1">
                                            {quoteSubtitle || `Proposta comercial #${invoiceNumber}`}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            {/* FIM DO HEADER */}

                            <div className={`flex-1 flex flex-col ${page.type !== 'first' ? 'pt-8' : ''}`}>

                                {page.type === 'first' && (
                                    <>
                                        <div className="px-8 py-6">
                                            <div className="grid grid-cols-3 gap-4 border-b border-brand-border pb-6 w-full">
                                                <div className="flex flex-col">
                                                    <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">Número</span>
                                                    <span className="font-bold text-sm text-brand-dark">{invoiceNumber}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">Data</span>
                                                    <span className="font-bold text-sm text-brand-dark">{formatDate(quoteDate)}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">Vencimento</span>
                                                    <span className="font-bold text-sm text-brand-dark">{formatDate(expiryDate)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="px-8 pb-6">
                                            <div className="grid grid-cols-2 gap-8">
                                                <div>
                                                    <h3 className="font-bold text-sm text-brand-dark mb-3">Emitente</h3>
                                                    <div className="text-xs text-gray-600 space-y-1">
                                                        <p className="font-bold text-brand-dark">{partnerName}</p>
                                                        <p className="whitespace-pre-wrap">{partnerAddress}</p>
                                                    </div>
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-sm text-brand-dark mb-3">Destinatário</h3>
                                                    {selectedCustomer ? (
                                                        <div className="text-xs text-gray-600 space-y-1">
                                                            <p className="font-bold text-brand-dark">{selectedCustomer.name}</p>
                                                            {showCustomerContact && selectedCustomer.email && <p>{selectedCustomer.email}</p>}
                                                            {showCustomerContact && selectedCustomer.phone && <p>{selectedCustomer.phone}</p>}
                                                            {customerAddressText && <p className="whitespace-pre-wrap">{customerAddressText}</p>}
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-gray-600 space-y-1">
                                                            <p className="font-bold text-black">{QUOTE_DEFAULT_CUSTOMER_LABEL}</p>
                                                        </div>
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
                                                <th className="py-2.5 pl-6 pr-4 text-[11px] font-bold text-gray-400 tracking-wider rounded-tl-xl border-b border-gray-100">Item</th>
                                                <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 tracking-wider text-center w-24 border-b border-gray-100">Qtd</th>
                                                <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 tracking-wider text-right w-28 border-b border-gray-100">Preço</th>
                                                <th className="py-2.5 pl-4 pr-6 text-[11px] font-bold text-gray-400 tracking-wider text-right w-32 rounded-tr-xl border-b border-gray-100">Total</th>
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
                                                            {formatCurrency(item.price)}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 pl-4 pr-6 border-b border-gray-50 text-right">
                                                        <span className="text-[13px] font-bold text-black">
                                                            {formatCurrency(item.price * item.qty)}
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
                                                    <span className="font-bold">{formatCurrency(subtotal)}</span>
                                                </div>

                                                {shippingNum > 0 && (
                                                    <div className="flex justify-between items-center text-xs mb-2">
                                                        <span className="text-gray-500 font-medium">Entrega</span>
                                                        <span className="font-bold">{formatCurrency(shippingNum)}</span>
                                                    </div>
                                                )}
                                                {otherCosts > 0 && (
                                                    <div className="flex justify-between items-center text-xs mb-2">
                                                        <span className="text-gray-500 font-medium">Outros Custos</span>
                                                        <span className="font-bold">{formatCurrency(otherCosts)}</span>
                                                    </div>
                                                )}
                                                {discountValue > 0 && (
                                                    <div className="flex justify-between items-center text-xs mb-2">
                                                        <span className="text-gray-500 font-medium">Desconto</span>
                                                        <span className="font-bold text-brand-red">-{formatCurrency(discountValue)}</span>
                                                    </div>
                                                )}

                                                <div className="border-t border-gray-200 my-3"></div>

                                                <div className="flex justify-between items-center">
                                                    <span className="font-bold text-sm">Total</span>
                                                    <div className="text-white px-3 py-1.5 rounded text-sm font-bold shadow-sm" style={{ backgroundColor: resolvedColors.primary }}>
                                                        {formatCurrency(total)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {note && (
                                            <div className="px-8 pb-12">
                                                <div className="w-full">
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

                            {/* Footer */}
                            <div
                                className="text-white/80 px-8 py-2 text-[10px] flex justify-end items-center absolute bottom-0 w-full h-[40px]"
                                style={{ backgroundColor: resolvedColors.primary }}
                            >
                                <span>Criado via Dudit - dudit.com.br</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default QuotePreview;