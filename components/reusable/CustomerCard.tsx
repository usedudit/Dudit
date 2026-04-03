"use client";

import React from "react";

interface CustomerCardProps {
    customer?: {
        name?: string;
        email?: string;
        phone?: string;
    } | null;
    address?: {
        street?: string;
        city?: string;
        state?: string;
        country?: string;
        zipCode?: string;
    } | null;
    showMap?: boolean;
    className?: string;
}

const CustomerCard: React.FC<CustomerCardProps> = ({ customer, address, showMap = true, className = "" }) => {
    const hasAddress = !!address?.street || !!address?.city;
    const hasContact = !!customer?.email || !!customer?.phone;

    return (
        <div className={`bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden transition-colors ${className}`}>
            <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border"></div>
            
            {/* Top Part: Customer Identity */}
            <div className="p-6 pb-0">
                <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading mb-4 mt-1 text-left">
                    Cliente
                </h3>
                
                <div className="flex items-start justify-between mb-6">
                    <div className="flex gap-3 text-left">
                        <div className="relative">
                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-gray-800 flex items-center justify-center text-lg font-bold text-brand-dark dark:text-dark-heading border border-white dark:border-dark-border overflow-hidden text-brand-inactive-text">
                                {customer?.name?.charAt(0) || 'C'}
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white dark:border-dark-surface rounded-full"></div>
                        </div>
                        <div className="min-w-0">
                            <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading uppercase truncate">{customer?.name || "Consumidor Final"}</h4>
                            <span className="text-xs text-brand-inactive-text dark:text-dark-body">Cliente Ativo</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="border-t border-brand-border dark:border-dark-border w-full"></div>
            
            {/* Bottom Part: Shipping Address */}
            <div className="p-6 text-left">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading">
                        Endereço de Entrega
                    </h3>
                </div>

                {hasAddress && showMap ? (
                    <>
                        {/* Map Placeholder */}
                        <div className="w-full h-24 bg-blue-50 dark:bg-gray-800 rounded-lg mb-4 overflow-hidden relative border border-blue-100 dark:border-gray-700 group cursor-pointer">
                            <img src="https://img.dudit.com.br/static/maps/MapSample.png" className="w-full h-full object-cover opacity-60" alt="Map" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-6 h-6 bg-brand-green rounded-full border-2 border-white flex items-center justify-center text-white">
                                    <div className="w-2 h-2 bg-white rounded-full"></div>
                                </div>
                            </div>
                        </div>

                        <div className="mb-0">
                            <div className="flex justify-between items-start mb-1">
                                <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate pr-2">{customer?.name || "Endereço Padrão"}</h4>
                                <a href="#" className="text-xs font-bold text-brand-dark dark:text-dark-heading underline decoration-brand-dark dark:decoration-dark-heading flex-shrink-0">Ver Mapa</a>
                            </div>
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed whitespace-pre-line">
                                {address?.street ? `${address.street}, ${address.city}\n${address.state || ""}, ${address.country || ""}` : "Endereço vinculado ao cadastro\ndo cliente para esta proposta."}
                            </p>
                        </div>
                    </>
                ) : (
                    <div className="bg-brand-gray/30 dark:bg-dark-border/30 rounded-lg p-4 text-center">
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body italic">
                            Nenhum endereço cadastrado para este cliente.
                        </p>
                    </div>
                )}
                
                <div className="mt-4 pt-4 border-t border-brand-border dark:border-dark-border">
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
