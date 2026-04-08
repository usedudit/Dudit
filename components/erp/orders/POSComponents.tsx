import React from 'react';
import { motion } from 'framer-motion';
import { TrashIcon, ChevronRightIcon } from '@/lib/icons';
import { formatCurrency } from '@/lib/utils';

// Scalloped edge specifically for the receipt bottom
export const ReceiptScallopEdge = () => (
    <div className="absolute -bottom-4 left-0 w-full flex justify-between items-center px-0 overflow-hidden z-20 pointer-events-none">
         {/* Fewer, larger scallops */}
         {Array.from({ length: 12 }).map((_, i) => (
             <div 
                key={i} 
                className="w-10 h-10 bg-white dark:bg-dark-surface rounded-full flex-shrink-0 -ml-3 first:-ml-5"
                style={{ marginTop: '-24px' }}
             ></div>
         ))}
    </div>
);

export const Numpad = ({ onInput, onDelete }: { onInput: (key: string) => void, onDelete: () => void }) => {
    return (
        <div className="w-full max-w-[340px] mx-auto mt-6">
            <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                    <button
                        key={n}
                        onClick={() => onInput(n.toString())}
                        className="h-14 md:h-16 rounded-2xl text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading bg-gray-50 dark:bg-dark-border/30 hover:bg-gray-100 dark:hover:bg-dark-border/50 transition-colors border border-transparent hover:border-brand-border dark:hover:border-dark-border active:scale-95 transform duration-100"
                    >
                        {n}
                    </button>
                ))}
                <button 
                    onClick={() => onInput('.')} 
                    className="h-14 md:h-16 rounded-2xl text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading bg-gray-50 dark:bg-dark-border/30 hover:bg-gray-100 dark:hover:bg-dark-border/50 transition-colors border border-transparent hover:border-brand-border dark:hover:border-dark-border pb-3 active:scale-95 transform duration-100"
                >
                    .
                </button>
                <button 
                    onClick={() => onInput('0')} 
                    className="h-14 md:h-16 rounded-2xl text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading bg-gray-50 dark:bg-dark-border/30 hover:bg-gray-100 dark:hover:bg-dark-border/50 transition-colors border border-transparent hover:border-brand-border dark:hover:border-dark-border active:scale-95 transform duration-100"
                >
                    0
                </button>
                <button
                    onClick={onDelete}
                    className="h-14 md:h-16 rounded-2xl flex items-center justify-center text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors border border-transparent active:scale-95 transform duration-100"
                >
                    <TrashIcon size={24} />
                </button>
            </div>
        </div>
    );
};

export const PaymentMethodCard = ({ icon: Icon, label, onClick }: { icon: any, label: string, onClick: () => void }) => (
    <button 
        onClick={onClick}
        className="flex flex-col items-center justify-center gap-2 md:gap-3 h-28 md:h-32 rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border/20 transition-colors group"
    >
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gray-100 dark:bg-dark-border/50 flex items-center justify-center group-hover:bg-white dark:group-hover:bg-dark-surface transition-colors">
            <Icon size={20} className="text-brand-dark dark:text-dark-heading md:w-6 md:h-6" />
        </div>
        <span className="font-bold text-xs md:text-sm text-brand-dark dark:text-dark-heading">{label}</span>
    </button>
);

export interface SplitPaymentCardProps {
    icon: any;
    label: string;
    amount: string;
    onClick: () => void;
}

export const SplitPaymentCard: React.FC<SplitPaymentCardProps> = ({ icon: Icon, label, amount, onClick }) => (
    <div 
        className="flex items-center gap-3 p-4 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border/20 cursor-pointer transition-colors group"
        onClick={onClick}
    >
        <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-dark-border/50 flex items-center justify-center flex-shrink-0 group-hover:bg-white dark:group-hover:bg-dark-surface">
            <Icon size={18} className="text-brand-dark dark:text-dark-heading" />
        </div>
        <div className="flex-1">
            <span className="font-bold text-sm text-brand-dark dark:text-dark-heading block mb-0.5">{label}</span>
            <span className="text-xs text-brand-inactive-text">Toque para editar</span>
        </div>
        <div className="text-right">
             <span className="font-bold text-sm text-brand-dark dark:text-dark-heading block">{amount}</span>
        </div>
        <ChevronRightIcon size={16} className="text-brand-inactive-text" />
    </div>
);

export const ReceiptContent = ({ cart, subTotal, shippingFee = 0, otherCosts = 0, discountAmount = 0, total, itemCount, customerName }: any) => (
    <div className="bg-[#F8F9FA] dark:bg-dark-surface/50 rounded-t-2xl p-6 pb-12 flex flex-col relative h-full border border-brand-border dark:border-dark-border border-b-0">
        {/* Receipt Header */}
        <div className="mb-6 flex justify-between items-center">
            <h3 className="text-[15px] font-bold text-brand-dark dark:text-dark-heading">Detalhes da Transação</h3>
            <div className="text-xs text-gray-500 dark:text-gray-400">#{Math.floor(Math.random() * 10000)}</div>
        </div>

        {/* Customer Info in Receipt (Optional, but looks good) */}
        {customerName && (
             <div className="mb-6 pb-4 border-b border-dashed border-gray-300 dark:border-gray-700">
                <span className="text-xs text-brand-inactive-text uppercase font-bold tracking-wider block mb-1">Cliente</span>
                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{customerName}</span>
             </div>
        )}
        
        {/* Items List - Scrollable */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 mb-4 space-y-4">
            {cart.map((item: any, idx: number) => (
                <div key={idx} className="flex flex-col w-full">
                    <div className="flex justify-between items-start mb-1 w-full">
                        <span className="font-medium text-brand-dark dark:text-dark-heading text-[14px] leading-snug max-w-[85%]">
                            {item.name}
                        </span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading text-sm whitespace-nowrap ml-2">
                            {item.quantity}x
                        </span>
                    </div>
                    <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                        {formatCurrency(item.unitPrice * item.quantity)}
                    </span>
                </div>
            ))}
        </div>

        {/* Summary Footer */}
        <div className="mt-auto pt-4 border-t border-dashed border-gray-300 dark:border-gray-700">
            <div className="space-y-2 mb-6">
                <div className="flex justify-between items-center text-[14px]">
                    <span className="text-gray-500 dark:text-gray-400 font-medium">Itens ({itemCount})</span>
                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                        {formatCurrency(subTotal)}
                    </span>
                </div>

                {discountAmount > 0 && (
                    <div className="flex justify-between items-center text-[14px]">
                        <span className="text-gray-500 dark:text-gray-400 font-medium">Desconto</span>
                        <span className="font-bold text-brand-red">
                            -{formatCurrency(discountAmount)}
                        </span>
                    </div>
                )}

                {shippingFee > 0 && (
                    <div className="flex justify-between items-center text-[14px]">
                        <span className="text-gray-500 dark:text-gray-400 font-medium">Frete</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                            {formatCurrency(shippingFee)}
                        </span>
                    </div>
                )}

                {otherCosts > 0 && (
                    <div className="flex justify-between items-center text-[14px]">
                        <span className="text-gray-500 dark:text-gray-400 font-medium">Outros Custos</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                            {formatCurrency(otherCosts)}
                        </span>
                    </div>
                )}
            </div>
            
            <div className="flex justify-between items-center">
                <span className="font-bold text-lg text-brand-dark dark:text-dark-heading">Total</span>
                <span className="font-black text-2xl text-brand-dark dark:text-dark-heading tracking-tight">
                    {formatCurrency(total)}
                </span>
            </div>
        </div>

        {/* Bottom Scallop Edge */}
        <ReceiptScallopEdge />
    </div>
);
