"use client"

import { formatBrazilPhone } from "@/lib/utils/phone-utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { QUOTE_PREVIEW_PRIMARY_COLOR, QUOTE_PREVIEW_SECONDARY_COLOR } from "@/lib/quotes/quote-preview-theme"
import type { SaleReceiptPartnerHeader } from "@/lib/sales/sale-receipt"

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
}

export function ReceiptStoreHeaderA4({
    partnerName,
    partnerAvatar,
    primaryColor,
    secondaryColor,
    title,
    subtitle,
    printMode = false,
}: ReceiptStoreHeaderA4Props) {
    const resolvedPrimary = primaryColor || QUOTE_PREVIEW_PRIMARY_COLOR
    const resolvedSecondary = secondaryColor || QUOTE_PREVIEW_SECONDARY_COLOR

    return (
        <div
            className="px-8 py-8 relative overflow-hidden flex flex-col justify-between h-[160px] shrink-0"
            style={{ backgroundColor: resolvedPrimary }}
        >
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
}

export function ReceiptA4StoreData({
    partnerHeader,
    partnerName,
    customerName,
    customerPhone,
    customerAddress,
}: ReceiptA4StoreDataProps) {
    return (
        <div className="px-8 pb-6">
            <div className="grid grid-cols-2 gap-8">
                <div>
                    <h3 className="font-bold text-sm text-brand-dark mb-3">Dados da empresa</h3>
                    <div className="text-xs text-gray-600 space-y-1">
                        <p className="font-bold text-brand-dark">{partnerHeader.fantasyName || partnerName}</p>
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
}

export function ReceiptA4Footer({ primaryColor, printMode = false }: ReceiptA4FooterProps) {
    const resolvedPrimary = primaryColor || QUOTE_PREVIEW_PRIMARY_COLOR
    return (
        <div
            className="text-white/80 px-8 py-2 text-[10px] flex justify-end items-center absolute bottom-0 w-full h-[40px]"
            style={{ backgroundColor: resolvedPrimary }}
        >
            <span>Criado via Dudit - dudit.com.br</span>
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