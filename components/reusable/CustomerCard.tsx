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
        [key: string]: any;
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
        zip_code?: string;
        [key: string]: any;
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
        zip_code?: string;
        [key: string]: any;
    } | null;
    showMap?: boolean;
    className?: string;
    onRemove?: () => void;
    chrome?: "default" | "minimal";
}

/** Normalize an address-like object so that both snake_case DB fields and
 *  camelCase props are accessible under a single canonical shape. */
const normalizeAddress = (addr: any): { street?: string; number?: string; complement?: string; neighborhood?: string; city?: string; state?: string; country?: string; zipCode?: string } | null => {
    if (!addr) return null;
    const normalized = {
        street: addr.street || addr.address_street || undefined,
        number: addr.number || addr.address_number || undefined,
        complement: addr.complement || addr.address_complement || undefined,
        neighborhood: addr.neighborhood || addr.address_neighborhood || addr.bairro || undefined,
        city: addr.city || addr.address_city || addr.cidade || undefined,
        state: addr.state || addr.uf || addr.address_state || addr.address_uf || undefined,
        country: addr.country || addr.address_country || undefined,
        zipCode: addr.zipCode || addr.zip_code || addr.address_zip_code || addr.cep || undefined,
    };
    // Only return if there's at least one meaningful field
    if (normalized.street || normalized.city || normalized.zipCode) return normalized;
    return null;
};

const CustomerCard: React.FC<CustomerCardProps> = ({ customer, address, billingAddress, showMap = true, className = "", onRemove, chrome = "default" }) => {
    // 1. Resolve address: explicit prop > customer.addresses array > flat fields on customer
    const resolveAddress = (): ReturnType<typeof normalizeAddress> => {
        // If an explicit address prop was given, normalize and use it
        if (address) return normalizeAddress(address);
        if (!customer) return null;

        // Try customer.addresses array (from Supabase joins like `addresses(*)`)
        const addrArray = (customer as any).addresses;
        if (Array.isArray(addrArray) && addrArray.length > 0) {
            const primary = addrArray.find((a: any) => a.address_type === "primary" || a.is_default) || addrArray[0];
            const norm = normalizeAddress(primary);
            if (norm) return norm;
        }

        // Try flat address_* fields on the customer object itself (legacy snapshots)
        const fromFlat = normalizeAddress({
            address_street: (customer as any).address_street,
            address_number: (customer as any).address_number,
            address_complement: (customer as any).address_complement,
            address_neighborhood: (customer as any).address_neighborhood,
            address_city: (customer as any).address_city,
            address_state: (customer as any).address_state,
            address_uf: (customer as any).address_uf,
            address_zip_code: (customer as any).address_zip_code,
        });
        if (fromFlat) return fromFlat;

        // Try plain fields directly on customer (some snapshots use street, city directly)
        return normalizeAddress(customer);
    };

    const resolveBillingAddress = (): ReturnType<typeof normalizeAddress> => {
        if (billingAddress) return normalizeAddress(billingAddress);
        if (!customer) return null;
        const addrArray = (customer as any).addresses;
        if (Array.isArray(addrArray)) {
            const billing = addrArray.find((a: any) => a.address_type === "billing");
            if (billing) return normalizeAddress(billing);
        }
        return null;
    };

    // 2. Resolve contact info: check multiple possible field names
    const resolvedEmail = customer?.email || (customer as any)?.contact_email || (customer as any)?.buyer_email || "";
    const resolvedPhone = customer?.phone || (customer as any)?.contact_phone || (customer as any)?.phone_fixed || (customer as any)?.phoneFixed || "";

    const addressToUse = resolveAddress();
    const resolvedBillingAddress = resolveBillingAddress();

    const hasAddress = !!addressToUse?.street || !!addressToUse?.city || !!addressToUse?.zipCode;
    const hasBillingAddress = !!resolvedBillingAddress?.street || !!resolvedBillingAddress?.city;
    const hasContact = !!resolvedEmail || !!resolvedPhone;

    const formatAddress = (addr: any) => {
        if (!addr) return null;

        const streetLine = addr.street
            ? `${addr.street}${addr.number ? `, ${addr.number}` : ""} - ${addr.neighborhood || "Bairro não informado"}`
            : null;

        const cityLine = (addr.city || addr.state || addr.uf)
            ? `${addr.city || ""}${(addr.state || addr.uf) ? ` - ${addr.state || addr.uf}` : ""}`
            : null;

        const zipLine = addr.zipCode || addr.zip_code;

        return [streetLine, cityLine, zipLine]
            .filter(Boolean)
            .join("\n");
    };

    const formattedAddress = formatAddress(addressToUse);
    const formattedBillingAddress = formatAddress(resolvedBillingAddress);

    const chromeClass =
        chrome === "minimal"
            ? "border-0"
            : "rounded-2xl border border-brand-border dark:border-dark-border"

    const fullAddress = addressToUse
        ? `${addressToUse.street || ""}, ${addressToUse.number || ""}, ${addressToUse.neighborhood || ""}, ${addressToUse.city || ""} - ${addressToUse.state || ""}, ${addressToUse.zipCode || ""}`
        : "";

    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;

    return (
        <div className={`bg-white dark:bg-dark-surface ${chromeClass} relative overflow-hidden transition-colors ${className}`}>
            {chrome !== "minimal" && (
                <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border"></div>
            )}

            {/* Top Part: Customer Identity */}
            <div className={chrome === "minimal" ? "text-left" : "p-6 pb-0 text-left"}>
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
                        <div className="min-w-0 flex flex-col justify-center">
                            <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{customer?.name || "Consumidor Final"}</h4>
                            {(customer as any)?.id && (
                                <p className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body leading-none mt-0.5">
                                    ID #{(customer as any).id.substring(0, 5).toUpperCase()}
                                </p>
                            )}
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
            <div className={chrome === "minimal" ? "mt-6 p-0 text-left" : "p-6 text-left space-y-6"}>
                {/* Delivery Address */}
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading">
                            Endereço
                        </h3>
                    </div>

                    {hasAddress ? (
                        <>
                            {showMap && (
                                /* Map Placeholder */
                                <div className="w-full h-[120px] bg-brand-gray dark:bg-dark-border rounded-lg relative overflow-hidden mb-4 flex items-center justify-center cursor-pointer group" onClick={() => window.open(mapsUrl, '_blank')}>
                                    <img src="https://img.dudit.com.br/static/MapLarge.png" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Mapa" />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-6 h-6 bg-brand-green rounded-full border-2 border-white flex items-center justify-center text-white z-10 transition-transform group-hover:scale-110">
                                            <div className="w-2 h-2 bg-white rounded-full"></div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="mb-0">
                                <div className="flex justify-between items-start mb-1">
                                    <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate pr-2">{customer?.name || "Endereço Padrão"}</h4>
                                    <a href={mapsUrl} target="_blank" className="text-xs font-bold text-brand-dark dark:text-dark-heading underline decoration-brand-dark dark:decoration-dark-heading shrink-0">Ver Mapa</a>
                                </div>
                                <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed whitespace-pre-line">
                                    {formattedAddress}
                                </p>
                            </div>
                        </>
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
                            {resolvedEmail && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-[#1e40af] dark:text-[#60a5fa] bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/30 truncate w-full">
                                        {resolvedEmail}
                                    </span>
                                </div>
                            )}
                            {resolvedPhone && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-[#1e40af] dark:text-[#60a5fa] bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/30 truncate w-full">
                                        {resolvedPhone}
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
    );
};

export default CustomerCard;
