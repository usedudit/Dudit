"use client"

import React from 'react';
import { motion } from 'framer-motion';
import QuoteHeader from './QuoteHeader';
import QuotePreview from './QuotePreview';
import { useStore } from '@/lib/store-context';
import { Tabs, TabsContent } from '@/components/reusable';

interface QuoteDetailsProps {
    quote: any;
    onBack: () => void;
    onEdit: () => void;
}

const QuoteDetails = ({ quote, onBack, onEdit }: QuoteDetailsProps) => {
    const { selectedStore } = useStore();

    // Partner info for preview
    const partnerName = selectedStore?.name || 'Sua Loja';
    const partnerAddress = 'Endereço não informado';
    const partnerAvatar = selectedStore?.image_url || '';

    // Financials
    const subtotal = quote.items?.reduce((acc: number, item: any) => acc + (Number(item.unit_price) * item.quantity), 0) || 0;
    const discountValue = quote.discount_type === 'percentage' 
        ? subtotal * (Number(quote.discount_value) / 100) 
        : Number(quote.discount_value || 0);
    
    const shippingNum = Number(quote.shipping_cost || 0);
    const otherCostsNum = Number(quote.additional_costs || 0);
    const tax = subtotal * 0.10; // Following the mock tax from CreateQuote
    const total = Math.max(0, subtotal + tax + shippingNum + otherCostsNum - discountValue);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[60] flex h-screen w-screen bg-white dark:bg-dark-surface transition-colors duration-300 overflow-hidden shadow-2xl"
        >
            {/* LEFT SIDE - SUMMARY (40% Width) */}
            <Tabs defaultValue="Dados Gerais" className="flex flex-col h-full w-full lg:w-2/5 border-r border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                <QuoteHeader
                    isScrolled={false}
                    onBack={onBack}
                    onSave={onEdit}
                    isSaving={false}
                    title={`Orçamento ${quote.quote_number || `#${quote.id.substring(0, 8)}`}`}
                    subtitle="Visualize os detalhes da proposta comercial"
                    saveLabel="Editar"
                />

                <div className="flex-1 overflow-auto">
                    <TabsContent value="Dados Gerais" className="p-8 mt-0 focus-visible:outline-none">
                        <div className="space-y-8">
                            {/* Customer Info */}
                            <section>
                                <h3 className="text-sm font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider mb-4">Cliente</h3>
                                <div className="p-4 rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border/20">
                                    <div className="font-bold text-brand-dark dark:text-dark-heading">{quote.customers?.name || 'Cliente não identificado'}</div>
                                    <div className="text-sm text-brand-inactive-text dark:text-dark-body">{quote.customers?.email}</div>
                                </div>
                            </section>

                            {/* Items Summary */}
                            <section>
                                <h3 className="text-sm font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider mb-4">Itens</h3>
                                <div className="space-y-3">
                                    {quote.items?.map((item: any, idx: number) => (
                                        <div key={idx} className="flex justify-between items-center text-sm">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-brand-dark dark:text-dark-heading">{item.products?.name || item.custom_name}</span>
                                                <span className="text-xs text-brand-inactive-text">{item.quantity} unidades x R$ {Number(item.unit_price).toLocaleString()}</span>
                                            </div>
                                            <div className="font-bold text-brand-dark dark:text-dark-heading">
                                                R$ {(Number(item.unit_price) * item.quantity).toLocaleString()}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {/* Totals */}
                            <section className="pt-6 border-t border-brand-border dark:border-dark-border">
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-brand-inactive-text">Subtotal</span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading">R$ {subtotal.toLocaleString()}</span>
                                    </div>
                                    {discountValue > 0 && (
                                        <div className="flex justify-between text-sm text-brand-red">
                                            <span>Desconto</span>
                                            <span className="font-bold">- R$ {discountValue.toLocaleString()}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-lg pt-2">
                                        <span className="font-bold text-brand-dark dark:text-dark-heading">Total</span>
                                        <span className="font-extrabold text-brand-primary">R$ {total.toLocaleString()}</span>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </TabsContent>

                    <TabsContent value="Observações" className="p-8 mt-0 focus-visible:outline-none">
                        <section>
                            <h3 className="text-sm font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider mb-4">Observações</h3>
                            <div className="p-5 rounded-2xl border border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border/20 min-h-[200px] text-[15px] text-brand-dark dark:text-dark-heading leading-relaxed">
                                {quote.notes || 'Nenhuma observação informada.'}
                            </div>
                        </section>
                    </TabsContent>
                </div>
            </Tabs>

            {/* RIGHT SIDE - PREVIEW (60% Width) */}
            <div className="hidden lg:flex flex-col h-full lg:w-3/5 bg-brand-gray dark:bg-dark-border/20 p-8 overflow-auto no-scrollbar">
                <div className="max-w-[850px] mx-auto w-full">
                    <QuotePreview
                        invoiceNumber={quote.quote_number || `#${quote.id.substring(0, 8)}`}
                        quoteDate={quote.issue_date}
                        expiryDate={quote.expiration_date}
                        selectedCustomer={quote.customers}
                        quoteItems={quote.items?.map((item: any) => ({
                            ...item.products,
                            name: item.products?.name || item.custom_name,
                            price: Number(item.unit_price),
                            qty: item.quantity
                        })) || []}
                        subtotal={subtotal}
                        tax={tax}
                        shippingNum={shippingNum}
                        otherCosts={otherCostsNum}
                        discountValue={discountValue}
                        total={total}
                        note={quote.notes}
                        partnerName={partnerName}
                        partnerAddress={partnerAddress}
                        partnerAvatar={partnerAvatar}
                    />
                </div>
            </div>
        </motion.div>
    );
};

export default QuoteDetails;
