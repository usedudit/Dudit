"use client"

import { useMemo } from 'react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { formatAddressParts } from '@/lib/utils/format-address';
import { QUOTE_DEFAULT_CUSTOMER_LABEL } from "@/lib/quotes/quote-edit-rules";
import { QUOTE_PREVIEW_PRIMARY_COLOR, QUOTE_PREVIEW_SECONDARY_COLOR } from "@/lib/quotes/quote-preview-theme";
import type { SaleReceiptPartnerHeader } from "@/lib/sales/sale-receipt";
import {
    ReceiptA4Document,
    ReceiptA4Page,
    ReceiptStoreHeaderA4,
    ReceiptA4StoreData,
    ReceiptA4Footer,
} from "@/components/erp/orders/receipt/ReceiptComponents";

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
    partnerPhone?: string;
    partnerAvatar?: string;
    printMode?: boolean;
    showDecoration?: boolean;
    showCustomerContact?: boolean;
    salespersonName?: string;
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
    primaryColor,
    secondaryColor,
    quoteTitle = 'Orçamento',
    quoteSubtitle,
    partnerName = 'Parceiro',
    partnerAddress = 'Endereço não cadastrado',
    partnerPhone,
    partnerAvatar,
    printMode = false,
    showDecoration = true,
    showCustomerContact = true,
    salespersonName
}: QuotePreviewProps) => {
    const resolvedPrimary = primaryColor || QUOTE_PREVIEW_PRIMARY_COLOR;
    const resolvedSecondary = secondaryColor || QUOTE_PREVIEW_SECONDARY_COLOR;

    const partnerAddressFormatted = useMemo(() => {
        if (!partnerAddress) return "";
        const lines = partnerAddress.split('\n').filter(line => line.trim() && !line.trim().startsWith('CEP:'));
        return lines.slice(0, 2).join('\n');
    }, [partnerAddress]);

    const customerAddressText = useMemo(() => {
        if (!selectedCustomer) return null;

        const addresses = selectedCustomer.addresses;
        if (addresses && addresses.length > 0) {
            const primaryAddr = addresses.find((a: any) => a.address_type === "primary" || a.is_default) || addresses[0];
            return formatAddressParts(primaryAddr);
        }

        const street = selectedCustomer.address_street || selectedCustomer.street;
        const number = selectedCustomer.address_number || selectedCustomer.number;
        const complement = selectedCustomer.address_complement || selectedCustomer.complement;
        const neighborhood = selectedCustomer.address_neighborhood || selectedCustomer.neighborhood;
        const city = selectedCustomer.address_city || selectedCustomer.city;
        const state = selectedCustomer.address_state || selectedCustomer.address_uf || selectedCustomer.state || selectedCustomer.uf;
        const zipCode = selectedCustomer.address_zip_code || selectedCustomer.zipCode || selectedCustomer.zip_code;

        if (street || city || zipCode) {
            return formatAddressParts({ street, number, complement, neighborhood, city, state, zip_code: zipCode });
        }

        return null;
    }, [selectedCustomer]);

    const partnerHeader: SaleReceiptPartnerHeader = useMemo(
        () => ({
            fantasyName: partnerName,
            legalName: partnerName,
            addressLine: partnerAddressFormatted || "",
            taxIdLine: "",
            phone: partnerPhone ?? null,
        }),
        [partnerName, partnerAddressFormatted, partnerPhone]
    );

    // Pagination Logic
    const pages = useMemo(() => {
        const ROW_HEIGHT = 40;
        const TOTALS_SECTION_HEIGHT = 150;
        const NOTE_HEIGHT = note ? 80 : 0;
        const FOOTER_HEIGHT = 40;

        const P1_FIXED_CONTENT_HEIGHT = 449;
        const P1_TOTAL_AVAILABLE_HEIGHT = 1123;
        const P1_AVAILABLE_FOR_ROWS_AND_TOTALS = P1_TOTAL_AVAILABLE_HEIGHT - P1_FIXED_CONTENT_HEIGHT - FOOTER_HEIGHT;

        const PN_FIXED_CONTENT_HEIGHT = 246;
        const PN_AVAILABLE_FOR_ROWS_AND_TOTALS = P1_TOTAL_AVAILABLE_HEIGHT - PN_FIXED_CONTENT_HEIGHT - FOOTER_HEIGHT;

        const chunks: { items: typeof quoteItems; hasTotals: boolean; type: string }[] = [];
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
        <ReceiptA4Document printMode={printMode} printClassName="quote-a4-print">
            {pages.map((page, pageIndex) => (
                <ReceiptA4Page key={pageIndex} printMode={printMode}>
                    <ReceiptStoreHeaderA4
                        partnerName={partnerName}
                        partnerAvatar={partnerAvatar}
                        primaryColor={resolvedPrimary}
                        secondaryColor={resolvedSecondary}
                        title={quoteTitle}
                        subtitle={quoteSubtitle || `Proposta comercial #${invoiceNumber}`}
                        showDecoration={showDecoration}
                    />

                    <div className={`flex-1 flex flex-col ${page.type !== 'first' ? 'pt-8' : ''}`}>
                        {page.type === 'first' && (
                            <>
                                {/* Order info grid */}
                                <div className="px-8 py-6">
                                    <div className="grid grid-cols-4 gap-4 border-b border-gray-100 pb-6 w-full">
                                        <div className="flex flex-col">
                                            <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">Número</span>
                                            <span className="font-bold text-sm text-brand-dark">{invoiceNumber}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">Emissão</span>
                                            <span className="font-bold text-sm text-brand-dark">{formatDate(quoteDate)}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">Validade</span>
                                            <span className="font-bold text-sm text-brand-dark">{formatDate(expiryDate)}</span>
                                        </div>
                                        {salespersonName && (
                                            <div className="flex flex-col">
                                                <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">Responsável</span>
                                                <span className="font-bold text-sm text-brand-dark">{salespersonName}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <ReceiptA4StoreData
                                    partnerHeader={partnerHeader}
                                    partnerName={partnerName}
                                    customerName={selectedCustomer?.name || QUOTE_DEFAULT_CUSTOMER_LABEL}
                                    customerPhone={showCustomerContact ? selectedCustomer?.phone : null}
                                    customerAddress={customerAddressText}
                                />
                            </>
                        )}

                        <div className="px-8 pb-4">
                            <table className="w-full text-left border-separate border-spacing-0">
                                <thead>
                                    <tr className="bg-brand-gray/40">
                                        <th className="py-2.5 pl-6 pr-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider rounded-tl-xl border-b border-gray-100">Item</th>
                                        <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider rounded-tl-xl border-b border-gray-100 text-center">Qtd</th>
                                        <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider rounded-tl-xl border-b border-gray-100 text-right">Preço</th>
                                        <th className="py-2.5 pl-4 pr-6 text-[11px] font-bold text-gray-400 uppercase tracking-wider rounded-tr-xl border-b border-gray-100 text-right">Total</th>
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
                                    <div className="w-full bg-brand-gray/40 p-6 rounded-lg text-black">
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
                                                <span className="font-bold text-brand-green">-{formatCurrency(discountValue)}</span>
                                            </div>
                                        )}

                                        <div className="border-t border-gray-200 my-3"></div>

                                        <div className="flex justify-between items-center">
                                            <span className="font-bold text-sm">Total</span>
                                            <div className="text-white px-3 py-1.5 rounded text-sm font-bold shadow-sm" style={{ backgroundColor: resolvedPrimary }}>
                                                {formatCurrency(total)}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {note && (
                                    <div className="px-8 pb-12">
                                        <div className="w-full">
                                            <h4 className="font-bold text-xs mb-1.5 text-black">Observações</h4>
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

                    <ReceiptA4Footer primaryColor={resolvedPrimary} />
                </ReceiptA4Page>
            ))}
        </ReceiptA4Document>
    );
};

export default QuotePreview;
