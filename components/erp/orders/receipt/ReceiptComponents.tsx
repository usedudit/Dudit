"use client"

import { type ReactNode } from "react"
import { formatBrazilPhone } from "@/lib/utils/phone-utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { QUOTE_PREVIEW_PRIMARY_COLOR, QUOTE_PREVIEW_SECONDARY_COLOR } from "@/lib/quotes/quote-preview-theme"
import type { SaleReceiptPartnerHeader } from "@/lib/sales/sale-receipt"

export const A4_PAGE_WIDTH_MM = 210
export const A4_PAGE_HEIGHT_MM = 297
export const A4_PAGE_WIDTH_CLASS = `${A4_PAGE_WIDTH_MM}mm`
export const A4_PAGE_HEIGHT_CLASS = `${A4_PAGE_HEIGHT_MM}mm`

type ReceiptA4DocumentProps = {
    children: ReactNode
    printMode?: boolean
    /** Classe extra aplicada no wrapper de impressão (ex: "sale-receipt-a4-print", "dre-a4-print"). */
    printClassName?: string
    /** Classe extra para a página A4. */
    pageClassName?: string
}

/**
 * Wrapper externo + área de preview de um documento A4.
 * Padroniza tamanho exato da folha, background cinza no modo de preview
 * e a classe de impressão do documento.
 */
export function ReceiptA4Document({
    children,
    printMode = false,
    printClassName = "receipt-a4-print",
    pageClassName,
}: ReceiptA4DocumentProps) {
    return (
        <div
            className={`flex flex-col w-full h-full bg-white dark:bg-dark-surface relative overflow-hidden ${
                printMode
                    ? printClassName
                    : "md:border-l border-brand-border dark:border-dark-border"
            }`}
        >
            <div
                className={
                    printMode
                        ? "w-full flex flex-col items-center p-0"
                        : "flex-1 overflow-auto custom-scrollbar p-4 md:p-12 flex flex-col items-start lg:items-center pt-12 space-y-8 absolute top-4 right-4 bottom-4 left-4 bg-[#e5e7eb] dark:bg-dark-surface/50 rounded-2xl border border-brand-border dark:border-dark-border"
                }
            >
                {children}
            </div>
        </div>
    )
}

type ReceiptA4PageProps = {
    children: ReactNode
    printMode?: boolean
    /** Classe extra para a página (ex: "dre-a4-print-page"). */
    className?: string
}

/**
 * Uma única página A4 (210mm x 297mm). Usada para cada página de
 * documentos multi-página. Header no início, corpo flex-1 e footer fixo no fim.
 */
export function ReceiptA4Page({ children, printMode = false, className = "" }: ReceiptA4PageProps) {
    return (
        <div
            className={`w-[${A4_PAGE_WIDTH_CLASS}] min-w-[${A4_PAGE_WIDTH_CLASS}] shrink-0 bg-white text-[#113833] overflow-hidden relative font-sans h-[${A4_PAGE_HEIGHT_CLASS}] flex flex-col ${
                printMode ? "pdf-print-page" : "shadow-md rounded-sm"
            } ${className}`.trim()}
        >
            {children}
        </div>
    )
}

export function DashedLine({ className = "my-1.5" }: { className?: string }) {
    return (
        <div
            className={`w-full border-t border-dashed ${className}`}
            style={{ borderColor: "#000000" }}
        />
    )
}

export function ReceiptRow({ left, right, bold, className = "" }: { left: string; right: string; bold?: boolean; className?: string }) {
    return (
        <div
            className={`flex justify-between items-baseline gap-2 text-[10.5px] leading-tight ${bold ? "font-bold" : "font-medium"
                } ${className}`}
            style={{ color: "#000000" }}
        >
            <span className="shrink-0">{left}</span>
            <span className="text-right shrink-0">{right}</span>
        </div>
    )
}

type ReceiptStoreHeaderA4Props = {
    partnerName: string
    partnerAvatar?: string
    primaryColor?: string
    secondaryColor?: string
    title: string
    subtitle?: string
    printMode?: boolean
    showDecoration?: boolean
}

export function ReceiptStoreHeaderA4({
    partnerName,
    partnerAvatar,
    primaryColor,
    secondaryColor,
    title,
    subtitle,
    printMode = false,
    showDecoration = true,
}: ReceiptStoreHeaderA4Props) {
    const resolvedPrimary = primaryColor || QUOTE_PREVIEW_PRIMARY_COLOR
    const resolvedSecondary = secondaryColor || QUOTE_PREVIEW_SECONDARY_COLOR

    return (
        <div
            className="px-8 py-8 relative overflow-hidden flex flex-col justify-between h-[160px] shrink-0"
            style={{ backgroundColor: resolvedPrimary }}
        >
            {showDecoration && (
                <div className="absolute -top-12 right-6 flex gap-3 opacity-90 rotate-180 pointer-events-none">
                    <div className="flex flex-col gap-3">
                        {[0, 1, 2].map((i) => (
                            <div
                                key={i}
                                className="w-14 h-24 rounded-full"
                                style={{ backgroundColor: resolvedSecondary }}
                            />
                        ))}
                    </div>
                    <div className="flex flex-col gap-3 -mt-12">
                        {[0, 1, 2].map((i) => (
                            <div
                                key={`b-${i}`}
                                className="w-14 h-24 rounded-full"
                                style={{ backgroundColor: resolvedSecondary }}
                            />
                        ))}
                    </div>
                </div>
            )}

            <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                    {partnerAvatar && !partnerAvatar.includes("Placeholder.png") ? (
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-white shrink-0">
                            <img src={getR2ImageUrl(partnerAvatar)} className="w-full h-full object-cover" alt="Logo" />
                        </div>
                    ) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white text-[15px] font-bold text-black shrink-0">
                            {partnerName.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <span className="text-white font-bold text-sm">{partnerName}</span>
                </div>
                <div>
                    <h1 className="text-2xl font-medium text-white">{title}</h1>
                    {subtitle && (
                        <p className="text-white/80 text-xs tracking-widest font-light mt-1">
                            {subtitle}
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}

type ReceiptA4StoreDataProps = {
    partnerHeader: SaleReceiptPartnerHeader
    partnerName: string
    customerName?: string
    customerPhone?: string | null
    customerAddress?: string | null
    partnerEmail?: string | null
    customerEmail?: string | null
}

export function ReceiptA4StoreData({
    partnerHeader,
    partnerName,
    customerName,
    customerPhone,
    customerAddress,
    partnerEmail,
    customerEmail,
}: ReceiptA4StoreDataProps) {
    return (
        <div className="px-8 pb-6">
            <div className="grid grid-cols-2 gap-8">
                <div>
                    <h3 className="font-bold text-sm text-brand-dark mb-3">Dados da empresa</h3>
                    <div className="text-xs text-gray-600 space-y-1">
                        <p className="font-bold text-brand-dark">{partnerHeader.fantasyName || partnerName}</p>
                        {partnerEmail && <p className="break-all">{partnerEmail}</p>}
                        {partnerHeader.phone && <p>{formatBrazilPhone(partnerHeader.phone)}</p>}
                        {partnerHeader.addressLine && (
                            <p className="whitespace-pre-line">{partnerHeader.addressLine}</p>
                        )}
                        {partnerHeader.taxIdLine ? (
                            <p>{partnerHeader.taxIdLine}</p>
                        ) : null}
                    </div>
                </div>
                {customerName && (
                    <div>
                        <h3 className="font-bold text-sm text-brand-dark mb-3">Dados do cliente</h3>
                        <div className="text-xs text-gray-600 space-y-1">
                            <p className="font-bold text-brand-dark">{customerName}</p>
                            {customerEmail && <p className="break-all">{customerEmail}</p>}
                            {customerPhone && <p>{formatBrazilPhone(customerPhone)}</p>}
                            {customerAddress && (
                                <p className="whitespace-pre-line">{customerAddress}</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

type ReceiptA4FooterProps = {
    primaryColor?: string
    printMode?: boolean
    /** Mensagem exibida à direita do rodapé. */
    message?: string
}

export function ReceiptA4Footer({ primaryColor, message, printMode = false }: ReceiptA4FooterProps) {
    const resolvedPrimary = primaryColor || QUOTE_PREVIEW_PRIMARY_COLOR
    return (
        <div
            className="text-white/80 px-8 py-2 text-[10px] flex justify-end items-center w-full h-[40px] shrink-0"
            style={{ backgroundColor: resolvedPrimary }}
        >
            <span>{message ?? "Criado via Dudit - dudit.com.br"}</span>
        </div>
    )
}

type ReceiptThermalStoreHeaderProps = {
    partnerHeader: SaleReceiptPartnerHeader
    partnerName: string
    printMode?: boolean
}

export function ReceiptThermalStoreHeader({ partnerHeader, partnerName, printMode = false }: ReceiptThermalStoreHeaderProps) {
    return (
        <div className="text-center mb-1.5" style={{ color: "#000000" }}>
            {partnerHeader.legalName && partnerHeader.legalName !== partnerHeader.fantasyName ? (
                <p className="text-[9.5px] leading-tight font-medium" style={{ color: "#000000" }}>
                    {partnerHeader.legalName}
                </p>
            ) : null}
            <p className="font-bold text-[13.5px] uppercase tracking-tight leading-tight" style={{ color: "#000000" }}>
                {partnerHeader.fantasyName || partnerName}
            </p>
            {partnerHeader.phone ? (
                <p className="text-[9.5px] mt-0.5 leading-tight font-medium" style={{ color: "#000000" }}>
                    {formatBrazilPhone(partnerHeader.phone)}
                </p>
            ) : null}
            {partnerHeader.addressLine ? (
                <p className="text-[9.5px] mt-0.5 leading-tight whitespace-pre-line font-medium" style={{ color: "#000000" }}>
                    {partnerHeader.addressLine}
                </p>
            ) : null}
            {partnerHeader.taxIdLine ? (
                <p className="text-[9.5px] mt-0.5 leading-tight font-medium" style={{ color: "#000000" }}>
                    {partnerHeader.taxIdLine}
                </p>
            ) : null}
        </div>
    )
}