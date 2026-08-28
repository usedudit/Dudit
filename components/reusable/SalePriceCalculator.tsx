"use client"

import React, { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/reusable/Button"
import { MoneyInput } from "@/components/reusable/Inputs/MoneyInput"
import { Input } from "@/components/reusable/Input"
import DefaultModal from "@/components/reusable/DefaultModal"
import { formatCurrency } from "@/lib/utils/formatters"

interface SalePriceCalculatorProps {
    /** Current cost price value from the form */
    costPrice: number
    /** Current selling price value from the form */
    sellingPrice: number
    /** Callback when user applies the calculated selling price */
    onApply: (costPrice: number, sellingPrice: number) => void
    /** Whether the calculator is disabled (e.g. in details mode) */
    disabled?: boolean
    /** Default profit margin / markup percent configured in sales settings */
    defaultMarginPercent?: number | null
}

export const SalePriceCalculator: React.FC<SalePriceCalculatorProps> = ({
    costPrice: externalCostPrice,
    sellingPrice: externalSellingPrice,
    onApply,
    disabled = false,
    defaultMarginPercent = null,
}) => {
    const [isOpen, setIsOpen] = useState(false)
    const [costPrice, setCostPrice] = useState(externalCostPrice || 0)
    const [markup, setMarkup] = useState("")
    const [calculatedPrice, setCalculatedPrice] = useState(0)

    // Sync with external values when modal opens
    useEffect(() => {
        if (isOpen) {
            setCostPrice(externalCostPrice || 0)
            // If both cost and sell price exist, auto-calculate the markup
            if (externalCostPrice > 0 && externalSellingPrice > 0) {
                const existingMarkup = ((externalSellingPrice - externalCostPrice) / externalCostPrice) * 100
                setMarkup(existingMarkup > 0 ? existingMarkup.toFixed(2).replace(".", ",") : "")
                setCalculatedPrice(externalSellingPrice)
            } else if (defaultMarginPercent !== null && defaultMarginPercent !== undefined && defaultMarginPercent > 0) {
                const defMarkupStr = String(defaultMarginPercent).replace(".", ",")
                setMarkup(defMarkupStr)
                if (externalCostPrice > 0) {
                    setCalculatedPrice(externalCostPrice * (1 + defaultMarginPercent / 100))
                } else {
                    setCalculatedPrice(0)
                }
            } else {
                setMarkup("")
                setCalculatedPrice(0)
            }
        }
    }, [isOpen, externalCostPrice, externalSellingPrice, defaultMarginPercent])

    // Recalculate selling price when cost or markup changes
    useEffect(() => {
        const markupNum = parseFloat(markup.replace(",", ".")) || 0
        if (costPrice > 0 && markupNum > 0) {
            setCalculatedPrice(costPrice * (1 + markupNum / 100))
        } else if (costPrice > 0 && markupNum === 0) {
            setCalculatedPrice(costPrice)
        } else {
            setCalculatedPrice(0)
        }
    }, [costPrice, markup])

    const profitMargin = useMemo(() => {
        if (calculatedPrice <= 0) return 0
        return ((calculatedPrice - costPrice) / calculatedPrice) * 100
    }, [calculatedPrice, costPrice])

    const handleMarkupChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        let val = e.target.value
        // Allow only numbers and comma
        val = val.replace(/[^0-9,]/g, "")
        // Only one comma
        const parts = val.split(",")
        if (parts.length > 2) val = parts[0] + "," + parts.slice(1).join("")
        setMarkup(val)
    }

    const handleApply = () => {
        onApply(costPrice, Math.round(calculatedPrice * 100) / 100)
        setIsOpen(false)
    }

    if (disabled) return null

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                className="text-xs font-bold text-brand-dark dark:text-dark-heading hover:text-brand-green dark:hover:text-brand-green transition-colors mt-1"
            >
                Calcular preço de venda
            </button>

            <DefaultModal
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                title="Calcular preço de venda"
                maxWidth="md"
                footer={
                    <>
                        <Button variant="outline" onClick={() => setIsOpen(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleApply} disabled={calculatedPrice <= 0}>
                            Aplicar
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col gap-4">
                    {/* Preço de Custo */}
                    <MoneyInput
                        label="Preço de custo"
                        value={costPrice}
                        onChange={(val) => setCostPrice(val)}
                    />

                    {/* Markup */}
                    <Input
                        label="Markup (%)"
                        value={markup}
                        onChange={handleMarkupChange}
                        placeholder="0,00"
                        suffix={<span className="text-brand-inactive-text text-sm">%</span>}
                        inputMode="decimal"
                    />
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body -mt-2 flex items-center gap-1.5">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 shrink-0 opacity-70">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                        </svg>
                        Markup é a porcentagem adicionada ao custo para definir o preço final.
                    </p>

                    {/* Divider */}
                    <div className="border-t border-brand-border dark:border-dark-border" />

                    {/* Resultados */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between bg-brand-gray dark:bg-dark-border/30 rounded-xl px-4 py-3">
                            <span className="text-sm text-brand-inactive-text dark:text-dark-body">Preço de venda</span>
                            <span className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                                {formatCurrency(calculatedPrice)}
                            </span>
                        </div>

                        <div className="flex items-center justify-between bg-brand-gray dark:bg-dark-border/30 rounded-xl px-4 py-3">
                            <span className="text-sm text-brand-inactive-text dark:text-dark-body">Margem bruta</span>
                            <div className="flex items-center gap-1.5">
                                <span className={`text-lg font-bold ${profitMargin > 0 ? "text-emerald-600" : "text-brand-dark dark:text-dark-heading"}`}>
                                    {profitMargin.toFixed(2).replace(".", ",")}
                                </span>
                                <span className="text-sm text-brand-inactive-text dark:text-dark-body">%</span>
                            </div>
                        </div>
                    </div>

                    <p className="text-xs text-brand-inactive-text dark:text-dark-body flex items-center gap-1.5">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 shrink-0 opacity-70">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                        </svg>
                        Margem bruta é a porcentagem do preço de venda que representa o ganho antes de descontos, taxas e demais despesas da venda.
                    </p>
                </div>
            </DefaultModal>
        </>
    )
}
