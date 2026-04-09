"use client";

import React from "react";
import { Button } from "./Button";
import { TrashIcon } from "@/lib/icons";
import { UserProfileImage } from "@/lib/utils/UserProfileImage";

interface CustomerCardProps {
    customer?: {
        name?: string;
        email?: string;
        phone?: string;
    } | null;
    address?: {
        street?: string;
        number?: string;
        complement?: string;
        neighborhood?: string;
        city?: string;
        state?: string;
        country?: string;
        zipCode?: string;
    } | null;
    billingAddress?: {
        street?: string;
        number?: string;
        complement?: string;
        neighborhood?: string;
        city?: string;
        state?: string;
        country?: string;
        zipCode?: string;
    } | null;
    showMap?: boolean;
    className?: string;
    onRemove?: () => void;
}

const CustomerCard: React.FC<CustomerCardProps> = ({ customer, address, billingAddress, showMap = true, className = "", onRemove }) => {
    const hasAddress = !!address?.street || !!address?.city;
    const hasBillingAddress = !!billingAddress?.street || !!billingAddress?.city;
    const hasContact = !!customer?.email || !!customer?.phone;

    const formatAddress = (addr: any) => {
        if (!addr) return null;
        return [
            `${addr.street || ""}${addr.number ? `, ${addr.number}` : ""}${addr.complement ? ` (${addr.complement})` : ""}`,
            addr.neighborhood,
            `${addr.city || ""}${addr.state ? ` - ${addr.state}` : ""}`,
            addr.zipCode
        ].filter(Boolean).join("\n");
    };

    const formattedAddress = formatAddress(address);
    const formattedBillingAddress = formatAddress(billingAddress);

    return (
        <div className={`bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden transition-colors ${className}`}>
            <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border"></div>

            {/* Top Part: Customer Identity */}
            <div className="p-6 pb-0 text-left">
                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">
                    Cliente
                </h3>

                <div className="flex items-start justify-between mb-6">
                    <div className="flex gap-3 text-left">
                        <div className="relative">
                            <UserProfileImage
                                fullName={customer?.name || "Cliente"}
                                className="w-10 h-10 text-base border border-white dark:border-dark-border"
                            />
                        </div>
                        <div className="min-w-0">
                            <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{customer?.name || "Consumidor Final"}</h4>
                        </div>
                    </div>

                    {onRemove && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="w-8 h-8 text-brand-red hover:bg-red-50 rounded-full"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemove();
                            }}
                        >
                            <TrashIcon size={14} />
                        </Button>
                    )}
                </div>
            </div>

            <div className="border-t border-brand-border dark:border-dark-border w-full"></div>

            {/* Bottom Part: Addresses */}
            <div className="p-6 text-left space-y-6">
                {/* Delivery Address */}
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading">
                            Endereço de Entrega
                        </h3>
                    </div>

                    {hasAddress ? (
                        <>
                            {showMap && (
                                /* Map Placeholder */
                                <div className="w-full h-[120px] bg-brand-gray dark:bg-dark-border rounded-lg relative overflow-hidden mb-4 flex items-center justify-center cursor-pointer group">
                                    <img src="https://img.dudit.com.br/static/MapLarge.png" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Mapa" />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-6 h-6 bg-brand-green rounded-full border-2 border-white flex items-center justify-center text-white">
                                            <div className="w-2 h-2 bg-white rounded-full"></div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="mb-0">
                                <div className="flex justify-between items-start mb-1">
                                    <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate pr-2">{customer?.name || "Endereço Padrão"}</h4>
                                    <a href="#" className="text-xs font-bold text-brand-dark dark:text-dark-heading underline decoration-brand-dark dark:decoration-dark-heading flex-shrink-0">Ver Mapa</a>
                                </div>
                                <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed whitespace-pre-line">
                                    {formattedAddress}
                                </p>
                            </div>
                        </>
                    ) : (
                        <div className="bg-brand-gray/30 dark:bg-dark-border/30 rounded-lg p-4 text-center">
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body italic">
                                Nenhum endereço de entrega cadastrado.
                            </p>
                        </div>
                    )}
                </div>

                {/* Billing Address (Conditional) */}
                {hasBillingAddress && (
                    <div className="pt-6 border-t border-brand-border dark:border-dark-border">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading">
                                Endereço de Cobrança
                            </h3>
                        </div>

                        <div className="mb-0">
                            <div className="flex justify-between items-start mb-1">
                                <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate pr-2">Endereço de Cobrança</h4>
                            </div>
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
                            {customer?.email && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-[#1e40af] dark:text-[#60a5fa] bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/30 truncate w-full">
                                        {customer.email}
                                    </span>
                                </div>
                            )}
                            {customer?.phone && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-[#1e40af] dark:text-[#60a5fa] bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/30 w-fit">
                                        {customer.phone}
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="bg-brand-gray/30 dark:bg-dark-border/30 rounded-lg p-4 text-center">
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body italic">
                                Nenhuma informação de contato disponível.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CustomerCard;
