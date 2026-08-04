"use client"

import React, { useMemo } from 'react';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { formatAddressParts } from '@/lib/utils/format-address';
import { UserProfileImage } from '@/lib/utils/UserProfileImage';
import { r2PublicConfig } from "@/lib/r2/r2-public";

const CDN_URL = r2PublicConfig.cdnUrl || "https://img.dudit.com.br";
const buildImageUrl = (key: string) => key.startsWith("http") ? key : `${CDN_URL}/${key}`;

interface OSPreviewProps {
    invoiceNumber: string;
    orderDate: string;
    expectedCompletionDate?: string;
    selectedCustomer: any;
    services: any[];
    products: any[];
    totalServiceAmount: number;
    totalProductAmount: number;
    totalAmount: number;
    description?: string;
    diagnosis?: string;
    signatureImageKey?: string | null;
    signedAt?: string | null;
    primaryColor?: string;
    secondaryColor?: string;
    partnerName?: string;
    partnerAddress?: string;
    partnerPhone?: string;
    partnerAvatar?: string;
    printMode?: boolean;
    showDecoration?: boolean;
    showCustomerContact?: boolean;
    salespersonName?: string;
}

const DEFAULT_PRIMARY = "#003229";
const DEFAULT_SECONDARY = "#d4f995";

const OSPreview = ({
    invoiceNumber,
    orderDate,
    expectedCompletionDate,
    selectedCustomer,
    services = [],
    products = [],
    totalServiceAmount,
    totalProductAmount,
    totalAmount,
    description,
    diagnosis,
    signatureImageKey,
    signedAt,
    primaryColor = DEFAULT_PRIMARY,
    secondaryColor = DEFAULT_SECONDARY,
    partnerName = 'Parceiro',
    partnerAddress = 'Endereço não cadastrado',
    partnerPhone,
    partnerAvatar,
    printMode = false,
    showDecoration = true,
    showCustomerContact = true,
    salespersonName
}: OSPreviewProps) => {

    const resolvedColors = useMemo(() => {
        return {
            primary: primaryColor,
            secondary: secondaryColor
        };
    }, [primaryColor, secondaryColor]);

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

    const partnerAddressFormatted = useMemo(() => {
        if (!partnerAddress) return "";
        const lines = partnerAddress.split('\n').filter(line => line.trim() && !line.trim().startsWith('CEP:'));
        return lines.slice(0, 2).join('\n');
    }, [partnerAddress]);

    // Build the visual rows representing either Services or Products
    const items = useMemo(() => {
        const rows: { type: 'service' | 'product'; name: string; qty: number; price: number; total: number }[] = [];

        services.forEach(svc => {
            rows.push({
                type: 'service',
                name: svc.service_name || 'Serviço sem nome',
                qty: Number(svc.quantity || 1),
                price: Number(svc.service_price || 0),
                total: Number(svc.total_price || 0)
            });
        });

        products.forEach(prod => {
            rows.push({
                type: 'product',
                name: prod.product_name || 'Produto sem nome',
                qty: Number(prod.quantity || 1),
                price: Number(prod.unit_price || 0),
                total: Number(prod.total_price || 0)
            });
        });

        return rows;
    }, [services, products]);

    // Advanced Pagination Logic modeled after QuotePreview
    const pages = useMemo(() => {
        const ROW_HEIGHT = 40;
        const TOTALS_SECTION_HEIGHT = 150;
        const NOTES_SECTION_HEIGHT = (description || diagnosis || signatureImageKey) ? 120 : 0;

        const P1_FIXED_CONTENT_HEIGHT = 449;
        const P1_TOTAL_AVAILABLE_HEIGHT = 1123;
        const P1_AVAILABLE_FOR_ROWS_AND_TOTALS = P1_TOTAL_AVAILABLE_HEIGHT - P1_FIXED_CONTENT_HEIGHT;

        const PN_FIXED_CONTENT_HEIGHT = 246;
        const PN_AVAILABLE_FOR_ROWS_AND_TOTALS = P1_TOTAL_AVAILABLE_HEIGHT - PN_FIXED_CONTENT_HEIGHT;

        const chunks: { items: any[]; hasTotals: boolean; type: string }[] = [];
        let remainingItems = [...items];

        const requiredHeightAllOnP1 = (remainingItems.length * ROW_HEIGHT) + TOTALS_SECTION_HEIGHT + NOTES_SECTION_HEIGHT;

        if (requiredHeightAllOnP1 <= P1_AVAILABLE_FOR_ROWS_AND_TOTALS) {
            chunks.push({ items: remainingItems, hasTotals: true, type: 'first' });
            return chunks;
        }

        const maxItemsP1 = Math.floor(P1_AVAILABLE_FOR_ROWS_AND_TOTALS / ROW_HEIGHT);
        const itemsP1 = remainingItems.slice(0, maxItemsP1);
        remainingItems = remainingItems.slice(maxItemsP1);
        chunks.push({ items: itemsP1, hasTotals: false, type: 'first' });

        while (remainingItems.length > 0) {
            const requiredHeightOnPn = (remainingItems.length * ROW_HEIGHT) + TOTALS_SECTION_HEIGHT + NOTES_SECTION_HEIGHT;

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
    }, [items, description, diagnosis, signatureImageKey]);

    return (
        <div className={`flex flex-col w-full h-full bg-white dark:bg-dark-surface relative overflow-hidden ${printMode ? "quote-a4-print" : "border-l border-brand-border dark:border-dark-border"}`}>
            <div className={printMode ? "w-full p-0" : "absolute top-4 right-4 bottom-4 left-4 bg-[#e5e7eb] dark:bg-dark-surface/50 rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden flex flex-col shadow-sm"}>
                <div className={printMode ? "w-full flex flex-col items-center p-0" : "flex-1 overflow-auto custom-scrollbar p-4 md:p-12 flex flex-col items-start lg:items-center pt-12 space-y-8"}>
                    {pages.map((page, pageIndex) => (
                        <div
                            key={pageIndex}
                            className={`w-[210mm] min-w-[210mm] shrink-0 bg-white text-[#113833] overflow-hidden relative font-sans min-h-[297mm] flex flex-col ${printMode ? "pdf-print-page" : "shadow-md rounded-sm"}`}
                        >
                            {/* HEADER */}
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

                                <div className="relative z-10">
                                    <div className="flex items-center gap-3 mb-6">
                                        <UserProfileImage
                                            fullName={partnerName}
                                            imageUrl={partnerAvatar && !partnerAvatar.includes("Placeholder.png") ? partnerAvatar : null}
                                            className="w-8 h-8 shrink-0 text-[13px] font-bold"
                                            style={{ backgroundColor: resolvedColors.secondary }}
                                        />
                                        <span className="text-white font-bold text-md">{partnerName}</span>
                                    </div>

                                    <div>
                                        <h1 className="text-2xl font-medium text-white">Ordem de Serviço</h1>
                                        <p className="text-white/80 text-xs tracking-widest font-light mt-1">
                                            Ordem de serviço #{invoiceNumber}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className={`flex-1 flex flex-col ${page.type !== 'first' ? 'pt-8' : ''}`}>
                                {page.type === 'first' && (
                                    <>
                                        <div className="px-8 py-6">
                                            <div className="grid grid-cols-4 gap-4 border-b border-brand-border pb-6 w-full">
                                                <div className="flex flex-col">
                                                    <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">Número</span>
                                                    <span className="font-bold text-sm text-brand-dark">{invoiceNumber}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">Emissão</span>
                                                    <span className="font-bold text-sm text-brand-dark">{formatDateTime(orderDate)}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">Previsão</span>
                                                    <span className="font-bold text-sm text-brand-dark">{expectedCompletionDate ? formatDateTime(expectedCompletionDate) : "-"}</span>
                                                </div>
                                                {salespersonName && (
                                                    <div className="flex flex-col">
                                                        <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">Responsável</span>
                                                        <span className="font-bold text-sm text-brand-dark">{salespersonName}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="px-8 pb-6">
                                            <div className="grid grid-cols-2 gap-8">
                                                <div>
                                                    <h3 className="font-bold text-sm text-brand-dark mb-3">Emitente</h3>
                                                    <div className="text-xs text-gray-600 space-y-1">
                                                        <p className="font-bold text-brand-dark">{partnerName}</p>
                                                        {partnerPhone && <p>{partnerPhone}</p>}
                                                        <p className="whitespace-pre-wrap">{partnerAddressFormatted}</p>
                                                    </div>
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-sm text-brand-dark mb-3">Destinatário</h3>
                                                    {selectedCustomer ? (
                                                        <div className="text-xs text-gray-600 space-y-1">
                                                            <p className="font-bold text-brand-dark">{selectedCustomer.name}</p>
                                                            {showCustomerContact && selectedCustomer.phone && <p>{selectedCustomer.phone}</p>}
                                                            {customerAddressText && <p className="whitespace-pre-wrap">{customerAddressText}</p>}
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-gray-600 space-y-1">
                                                            <p className="font-bold text-black">Consumidor final</p>
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
                                                <th className="py-2.5 pl-6 pr-4 text-[11px] font-bold text-gray-400 tracking-wider rounded-tl-xl border-b border-gray-100">Descrição do Item</th>
                                                <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 tracking-wider text-center w-16 border-b border-gray-100">Tipo</th>
                                                <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 tracking-wider text-center w-16 border-b border-gray-100">Qtd</th>
                                                <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 tracking-wider text-right w-24 border-b border-gray-100">Preço</th>
                                                <th className="py-2.5 pl-4 pr-6 text-[11px] font-bold text-gray-400 tracking-wider text-right w-28 rounded-tr-xl border-b border-gray-100">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {page.items.map((item, idx) => (
                                                <tr key={idx} className="bg-white">
                                                    <td className="py-2 pl-6 pr-4 border-b border-gray-50">
                                                        <span className="font-bold text-[13px] text-black block truncate max-w-[200px]">
                                                            {item.name}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-4 border-b border-gray-50 text-center">
                                                        <span className="text-[11px] font-semibold text-gray-500 uppercase">
                                                            {item.type === 'service' ? 'Serviço' : 'Produto'}
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
                                                            {formatCurrency(item.total)}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {page.hasTotals && (
                                    <div className="mt-auto">
                                        <div className="px-8 pb-6 flex justify-start">
                                            <div className="w-full bg-brand-gray/40 p-6 rounded-lg text-black">
                                                {totalServiceAmount > 0 && (
                                                    <div className="flex justify-between items-center text-xs mb-2">
                                                        <span className="text-gray-500 font-medium">Total de Serviços</span>
                                                        <span className="font-bold">{formatCurrency(totalServiceAmount)}</span>
                                                    </div>
                                                )}
                                                {totalProductAmount > 0 && (
                                                    <div className="flex justify-between items-center text-xs mb-2">
                                                        <span className="text-gray-500 font-medium">Total de Produtos</span>
                                                        <span className="font-bold">{formatCurrency(totalProductAmount)}</span>
                                                    </div>
                                                )}

                                                <div className="border-t border-gray-200 my-3"></div>

                                                <div className="flex justify-between items-center">
                                                    <span className="font-bold text-sm">Valor Total Geral</span>
                                                    <div className="text-white px-3 py-1.5 rounded text-sm font-bold shadow-sm" style={{ backgroundColor: resolvedColors.primary }}>
                                                        {formatCurrency(totalAmount)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {(description || diagnosis) && (
                                            <div className="px-8 pb-6">
                                                <div className="w-full border-t border-brand-border pt-6">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                        {description && (
                                                            <div>
                                                                <h4 className="font-bold text-xs mb-1.5 text-black">Observações</h4>
                                                                <p className="text-[11px] text-gray-500 leading-relaxed whitespace-pre-wrap max-h-[140px] overflow-y-auto">
                                                                    {description}
                                                                </p>
                                                            </div>
                                                        )}
                                                        {diagnosis && (
                                                            <div>
                                                                <h4 className="font-bold text-xs mb-1.5 text-black">Diagnóstico</h4>
                                                                <p className="text-[11px] text-gray-500 leading-relaxed whitespace-pre-wrap max-h-[140px] overflow-y-auto">
                                                                    {diagnosis}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {signatureImageKey && (
                                            <div className="px-8 pb-12">
                                                <div className="w-full border-t border-brand-border pt-6">
                                                    <div className="flex flex-col items-start">
                                                        <h4 className="font-bold text-xs mb-2 text-black">Assinatura do Cliente</h4>
                                                        <img
                                                            src={buildImageUrl(signatureImageKey)}
                                                            alt="Assinatura"
                                                            className="max-h-[80px] object-contain border border-gray-200 rounded p-1 bg-white"
                                                        />
                                                        {signedAt && (
                                                            <span className="text-[9px] text-gray-400 mt-1">
                                                                Assinado em {new Date(signedAt).toLocaleDateString("pt-BR")} às {new Date(signedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {!description && !diagnosis && !signatureImageKey && (
                                            <div className="px-8 pb-12">
                                                <div className="w-full border-t border-brand-border pt-6">
                                                    <div className="flex items-center justify-center text-gray-400 text-xs italic">
                                                        Aguardando Assinatura do Cliente
                                                    </div>
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

export default OSPreview;
