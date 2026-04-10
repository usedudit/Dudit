"use client"

import React, { useState, useEffect } from 'react';
import QuantitySelector from '@/components/reusable/QuantitySelector';
import { Button, ListItem } from '@/components/reusable';
import Portal from "@/components/Portal";
import BottomSheet from "@/components/BottomSheet";
import { useMediaQuery } from "@/components/erp/hooks";
import { XIcon } from "@/lib/icons";
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url";
import { formatCurrency } from "@/lib/utils";

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
    const isMobile = useMediaQuery("(max-width: 768px)");

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

    const content = (
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface">
            {/* Header */}
            <header className="border-b border-brand-border dark:border-dark-border p-6 flex justify-between items-center bg-white dark:bg-dark-surface z-10 shrink-0">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Selecionar Variações</h2>
                <Button variant="ghost" onClick={onClose} size="icon">
                    <XIcon className="w-5 h-5" />
                </Button>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">

                {/* Product Info */}
                <div className="flex gap-4 mb-8 pt-2">
                    <div className="w-16 h-16 rounded-2xl bg-brand-gray dark:bg-gray-800 shrink-0 overflow-hidden border border-brand-border dark:border-dark-border flex items-center justify-center">
                        <img src={getR2ImageUrl(product.image, "thumbnail")} className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal p-2" alt={product.name} />
                    </div>
                    <div className="flex flex-col justify-center">
                        <h4 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading mb-0.5 leading-snug">{product.name}</h4>
                        <p className="text-[13px] text-brand-inactive-text font-medium uppercase tracking-wide">SKU: {product.sku}</p>
                        <p className="font-bold text-[15px] text-brand-dark dark:text-dark-heading mt-1">
                            {formatCurrency(product.price)}
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
                            description={`SKU: ${variant.sku} • Estoque: ${variant.stock} ${product.unit || 'un'} • ${formatCurrency(variant.price)}`}
                            right={
                                <QuantitySelector
                                    value={variant.qty || 0}
                                    onChange={(val) => handleUpdateQty(idx, val)}
                                    min={0}
                                    max={variant.stock} // Limiting by stock limit
                                    size="md"
                                />
                            }
                        />
                    ))}
                </div>
            </div>

            {/* Footer */}
            <footer className="p-6 border-t border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface shrink-0">
                <Button className="w-full h-12 text-[15px] shadow-sm rounded-full" onClick={handleConfirm}>
                    Confirmar Seleção
                </Button>
            </footer>
        </div>
    );

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose}>
                {content}
            </BottomSheet>
        );
    }

    return (
        <Portal>
            <div
                className={`fixed inset-0 bg-black/50 z-50 transition-opacity ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                onClick={onClose}
            >
                <div
                    className={`fixed right-4 top-4 bottom-4 w-[450px] bg-white dark:bg-dark-surface shadow-2xl rounded-2xl transition-transform duration-300 overflow-hidden ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {content}
                </div>
            </div>
        </Portal>
    );
};

export default SelectVariantSheet;
