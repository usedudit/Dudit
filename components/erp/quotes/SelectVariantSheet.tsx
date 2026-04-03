"use client"

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XIcon } from '@/lib/icons';
import QuantitySelector from '@/components/reusable/QuantitySelector';
import { Button, ListItem } from '@/components/reusable';

interface Variant {
    id: string | number;
    name: string;
    sku: string;
    price: number;
    stock: number;
    qty?: number;
    image?: string;
}

interface ProductWithVariants {
    id: string | number;
    name: string;
    sku: string;
    price: number;
    image: string;
    unit?: string;
    variants: Variant[];
}

interface SelectVariantSheetProps {
    isOpen: boolean;
    onClose: () => void;
    product: ProductWithVariants | null;
    onConfirm: (variants: Variant[]) => void;
}

const SelectVariantSheet = ({ isOpen, onClose, product, onConfirm }: SelectVariantSheetProps) => {
    const [localVariants, setLocalVariants] = useState<Variant[]>([]);

    useEffect(() => {
        if (product && isOpen) {
            // Initialize variants with 0 qty if not present, or clone existing
            const vars = product.variants.map(v => ({
                ...v,
                qty: v.qty || 0
            }));
            setLocalVariants(vars);
        }
    }, [product, isOpen]);

    const handleUpdateQty = (index: number, val: number) => {
        const newVars = [...localVariants];
        newVars[index].qty = val;
        setLocalVariants(newVars);
    };

    const handleConfirm = () => {
        onConfirm(localVariants);
        onClose();
    };

    if (!product) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[80] flex justify-end">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        className="relative w-full md:w-[500px] h-full bg-white dark:bg-dark-surface shadow-2xl flex flex-col overflow-hidden border-l border-brand-border dark:border-dark-border"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface z-10">
                            <h2 className="text-[17px] font-bold text-brand-dark dark:text-dark-heading">Selecionar Variações</h2>
                            <button onClick={onClose} className="text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors">
                                <XIcon size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">

                            {/* Product Info */}
                            <div className="flex gap-4 mb-8 pt-2">
                                <div className="w-16 h-16 rounded-2xl bg-brand-gray dark:bg-gray-800 flex-shrink-0 overflow-hidden border border-brand-border dark:border-dark-border flex items-center justify-center">
                                    <img src={product.image} className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal p-2" alt={product.name} />
                                </div>
                                <div className="flex flex-col justify-center">
                                    <h4 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading mb-0.5 leading-snug">{product.name}</h4>
                                    <p className="text-[13px] text-brand-inactive-text font-medium uppercase tracking-wide">SKU: {product.sku}</p>
                                    <p className="font-bold text-[15px] text-brand-dark dark:text-dark-heading mt-1">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.price)}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between mb-4 px-1">
                                <h3 className="text-[15px] font-bold text-brand-dark dark:text-dark-heading">Opções Disponíveis</h3>
                                <span className="text-xs font-bold text-brand-inactive-text bg-brand-gray dark:bg-dark-border/50 px-2 py-1 rounded-md">
                                    {localVariants.length} opções
                                </span>
                            </div>

                            <div className="flex flex-col gap-3">
                                {localVariants.map((variant, idx) => (
                                    <ListItem
                                        key={idx}
                                        title={variant.name}
                                        description={`SKU: ${variant.sku} • Estoque: ${variant.stock} ${product.unit || 'un'} • ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(variant.price)}`}
                                        right={
                                            <QuantitySelector
                                                value={variant.qty || 0}
                                                onChange={(val) => handleUpdateQty(idx, val)}
                                                min={0}
                                                max={variant.stock} // Limiting by stock limit
                                                size="sm"
                                            />
                                        }
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="p-6 border-t border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                            <Button className="w-full h-12 text-[15px] shadow-sm" onClick={handleConfirm}>
                                Confirmar Seleção
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default SelectVariantSheet;
