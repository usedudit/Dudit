"use client"

import { type ReactNode } from "react"
import { formatBrazilPhone } from "@/lib/utils/phone-utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { QUOTE_PREVIEW_PRIMARY_COLOR, QUOTE_PREVIEW_SECONDARY_COLOR } from "@/lib/quotes/quote-preview-theme"
import {
    DEFAULT_RECEIPT_ACKNOWLEDGMENT,
    type SaleReceiptPartnerHeader,
} from "@/lib/sales/sale-receipt"

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
                        : "flex-1 overflow-auto custom-scrollbar p-4 md:p-12 flex flex-col items-center pt-12 space-y-8 absolute top-4 right-4 bottom-4 left-4 bg-[#e5e7eb] dark:bg-dark-surface/50 rounded-2xl border border-brand-border dark:border-dark-border"
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
            className={`w-[210mm] min-w-[210mm] max-w-[210mm] h-[297mm] min-h-[297mm] shrink-0 bg-white text-[#113833] overflow-hidden relative font-sans flex flex-col ${
                printMode ? "pdf-print-page" : "shadow-md rounded-sm"
            } ${className}`.trim()}
            style={{ width: "210mm", minWidth: "210mm", maxWidth: "210mm", height: "297mm", minHeight: "297mm" }}
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

type ReceiptRowProps = {
    left: string
    right: string
    bold?: boolean
    className?: string
    leftClassName?: string
    rightClassName?: string
}

export function ReceiptRow({
    left,
    right,
    bold,
    className = "",
    leftClassName = "",
    rightClassName = "",
}: ReceiptRowProps) {
    return (
        <div
            className={`flex justify-between items-baseline gap-2 text-[10.5px] leading-tight ${bold ? "font-bold" : "font-medium"
                } ${className}`}
            style={{ color: "#000000" }}
        >
            <span className={`shrink-0 max-w-[55%] break-words ${leftClassName}`.trim()}>{left}</span>
            <span className={`text-right min-w-0 break-words ${rightClassName}`.trim()}>{right}</span>
        </div>
    )
}

/* -------------------------------------------------------------------------- */
/*                     Componentes padrão de recibo térmico                    */
/* -------------------------------------------------------------------------- */

type ReceiptThermalShellProps = {
    children: ReactNode
    printMode?: boolean
    thermalWidth?: "80mm" | "58mm"
    className?: string
}

/**
 * Estrutura base de todos os recibos térmicos (80mm / 58mm).
 * Centraliza largura, fonte, cores e reset de estilos de impressão para que
 * todos os documentos tenham exatamente o mesmo formato.
 */
export function ReceiptThermalShell({
    children,
    printMode = false,
    thermalWidth = "80mm",
    className = "",
}: ReceiptThermalShellProps) {
    return (
        <div
            className={`thermal-receipt-root mx-auto break-inside-avoid ${printMode ? "sale-receipt-thermal-print" : ""
                } ${className}`.trim()}
            style={{
                width: printMode ? thermalWidth : (thermalWidth === "58mm" ? "220px" : "320px"),
                maxWidth: "100%",
                boxSizing: "border-box",
                color: "#000000",
                backgroundColor: "#ffffff",
                fontFamily: "Consolas, 'Courier New', Monaco, monospace",
                fontWeight: 500,
                lineHeight: "1.35",
                fontSize: "10.5px",
                WebkitFontSmoothing: "antialiased",
                MozOsxFontSmoothing: "grayscale",
            }}
        >
            <style
                dangerouslySetInnerHTML={{
                    __html: `
                        .thermal-receipt-root,
                        .thermal-receipt-root * {
                            color: #000000 !important;
                            border-color: #000000 !important;
                            -webkit-text-fill-color: #000000 !important;
                            text-shadow: none !important;
                            box-sizing: border-box !important;
                        }
                    `,
                }}
            />
            <div className="px-3 py-3" style={{ backgroundColor: "#ffffff" }}>
                {children}
            </div>
        </div>
    )
}

export function ReceiptThermalTitle({ children }: { children: ReactNode }) {
    return (
        <p className="text-[12px] font-bold text-center uppercase tracking-wide mb-1.5" style={{ color: "#000000" }}>
            {children}
        </p>
    )
}

export function ReceiptThermalSectionTitle({ children }: { children: ReactNode }) {
    return (
        <p className="font-bold text-[9.5px] uppercase mb-0.5" style={{ color: "#000000" }}>
            {children}
        </p>
    )
}

type ReceiptThermalColumn = {
    label: string
    align?: "left" | "right"
}

export function ReceiptThermalItemsHeader({ columns }: { columns: ReceiptThermalColumn[] }) {
    const template = columns.map((_, index) => (index === 0 ? "minmax(0,1fr)" : "auto")).join(" ")
    return (
        <div
            className="grid gap-x-1.5 text-[9.5px] font-bold uppercase"
            style={{ gridTemplateColumns: template, color: "#000000" }}
        >
            {columns.map((column, index) => (
                <span
                    key={`${column.label}-${index}`}
                    className={column.align === "right" ? "text-right whitespace-nowrap" : "min-w-0"}
                >
                    {column.label}
                </span>
            ))}
        </div>
    )
}

export function ReceiptThermalNotes({ text }: { text?: string | null }) {
    if (!text) return null
    return (
        <div style={{ color: "#000000" }}>
            <ReceiptThermalSectionTitle>Observações:</ReceiptThermalSectionTitle>
            <p className="text-[9.5px] leading-tight whitespace-pre-line mt-0.5 font-medium" style={{ color: "#000000" }}>
                {text}
            </p>
        </div>
    )
}

type ReceiptThermalSignatureProps = {
    show?: boolean
    acknowledgment?: string
    label?: string
}

export function ReceiptThermalSignature({
    show = true,
    acknowledgment = DEFAULT_RECEIPT_ACKNOWLEDGMENT,
    label = "Assinatura do cliente",
}: ReceiptThermalSignatureProps) {
    if (!show) return null
    return (
        <>
            <DashedLine className="my-2" />
            <p className="text-[9.5px] text-center leading-relaxed px-1 font-medium" style={{ color: "#000000" }}>
                {acknowledgment}
            </p>
            <div className="mt-6 border-b border-dashed w-3/4 mx-auto" style={{ borderColor: "#000000" }} />
            <p className="text-[9.5px] font-bold text-center uppercase tracking-wide mt-1" style={{ color: "#000000" }}>
                {label}
            </p>
        </>
    )
}

export function ReceiptThermalFooter({ message }: { message?: string | null }) {
    return (
        <>
            <DashedLine className="my-2" />
            {message ? (
                <p className="text-[10.5px] font-bold text-center uppercase tracking-wide" style={{ color: "#000000" }}>
                    {message}
                </p>
            ) : null}
            <p
                className={`text-center font-bold uppercase tracking-wide ${message ? "text-[9px] mt-0.5" : "text-[10.5px]"}`}
                style={{ color: "#000000" }}
            >
                Criado via Dudit - dudit.com.br
            </p>
        </>
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
    partnerAvatar?: string
}

export function ReceiptThermalStoreHeader({ partnerHeader, partnerName, printMode = false, partnerAvatar }: ReceiptThermalStoreHeaderProps) {
    return (
        <div className="text-center mb-1.5" style={{ color: "#000000" }}>
            {partnerAvatar ? (
                <div className="flex justify-center mb-1">
                    <img
                        src={partnerAvatar}
                        alt={partnerHeader.fantasyName || partnerName}
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                    />
                </div>
            ) : null}
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