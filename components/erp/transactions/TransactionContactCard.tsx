"use client"

import React from "react"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { formatAddressParts } from "@/lib/utils/format-address"
import { formatBrazilPhone } from "@/lib/utils/phone-utils"

interface TransactionContactCardProps {
    title: string
    name: string
    email?: string | null
    phone?: string | null
    imageUrl?: string | null
    address?: {
        street?: string
        number?: string
        complement?: string
        neighborhood?: string
        city?: string
        state?: string
        zipCode?: string
    } | null
    billingAddress?: {
        street?: string
        number?: string
        complement?: string
        neighborhood?: string
        city?: string
        state?: string
        zipCode?: string
    } | null
    className?: string
}

/**
 * Contact card for non-customer transaction contacts.
 * Same chrome and sections as CustomerCard (accent bar, border, padding,
 * avatar size, address and contact sections).
 */
export function TransactionContactCard({ title, name, email, phone, imageUrl, address, billingAddress, className = "" }: TransactionContactCardProps) {
    const hasAddress = !!address?.street || !!address?.number || !!address?.complement || !!address?.neighborhood || !!address?.city || !!address?.state || !!address?.zipCode
    const hasBillingAddress = !!billingAddress?.street || !!billingAddress?.number || !!billingAddress?.neighborhood || !!billingAddress?.city || !!billingAddress?.state || !!billingAddress?.zipCode
    const hasContact = !!email || !!phone

    const formatAddress = (addr: any) => {
        if (!addr) return null
        const base = formatAddressParts(addr)
        const lines = base ? base.split("\n") : []
        if (addr.zipCode && addr.zipCode.trim()) {
            lines.push(`CEP ${addr.zipCode.trim()}`)
        }
        return lines.length > 0 ? lines.join("\n") : null
    }

    const formattedAddress = formatAddress(address)
    const formattedBillingAddress = formatAddress(billingAddress)

    return (
        <div className={`bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden transition-colors ${className}`}>
            <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border"></div>

            <div className="p-6 pb-0 text-left">
                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">{title}</h3>

                <div className="flex items-start justify-between mb-6">
                    <div className="flex gap-3 text-left min-w-0">
                        <div className="relative shrink-0">
                            <UserProfileImage fullName={name || title} imageUrl={imageUrl || null} className="w-10 h-10 text-base border border-white dark:border-dark-border" />
                        </div>
                        <div className="min-w-0 flex flex-col justify-center">
                            <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{name || "-"}</h4>
                        </div>
                    </div>
                </div>
            </div>

            <div className="border-t border-brand-border dark:border-dark-border w-full"></div>

            <div className="p-6 text-left space-y-6">
                {/* Address */}
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading">Endereço</h3>
                    </div>

                    {hasAddress ? (
                        <div className="mb-0">
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed whitespace-pre-line">
                                {formattedAddress}
                            </p>
                        </div>
                    ) : (
                        <div className="bg-brand-gray/30 dark:bg-dark-border/30 rounded-lg p-4 text-center">
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                                Nenhum endereço cadastrado.
                            </p>
                        </div>
                    )}
                </div>

                {/* Billing Address (Conditional) */}
                {hasBillingAddress && (
                    <div className="pt-6 border-t border-brand-border dark:border-dark-border">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading">Endereço de Cobrança</h3>
                        </div>
                        <div className="mb-0">
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed whitespace-pre-line">
                                {formattedBillingAddress}
                            </p>
                        </div>
                    </div>
                )}

                {/* Contact Info */}
                <div className="pt-6 border-t border-brand-border dark:border-dark-border">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading">Informações de Contato</h3>
                    </div>

                    {hasContact ? (
                        <div className="space-y-3">
                            {email && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-[#1e40af] dark:text-[#60a5fa] bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/30 truncate w-full">
                                        {email}
                                    </span>
                                </div>
                            )}
                            {phone && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-[#1e40af] dark:text-[#60a5fa] bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/30 truncate w-full">
                                        {formatBrazilPhone(phone)}
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="bg-brand-gray/30 dark:bg-dark-border/30 rounded-lg p-4 text-center">
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                                Nenhuma informação de contato disponível.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
