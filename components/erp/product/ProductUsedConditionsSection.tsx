"use client"

import React from "react"
import { Input, FormDropdown, Checkbox, FormSection, Badge } from "@/components/reusable"
import { TagIcon, MapPinIcon, CalendarIcon, CheckCircleIcon } from "@/lib/icons"

interface ProductUsedConditionsSectionProps {
    condition: string
    onConditionChange: (condition: string) => void
    acceptsOffers: boolean
    onAcceptsOffersChange: (val: boolean) => void
    acceptsTrades: boolean
    onAcceptsTradesChange: (val: boolean) => void
    itemsIncluded: string
    onItemsIncludedChange: (val: string) => void
    pickupNeighborhood: string
    onPickupNeighborhoodChange: (val: string) => void
    expiryDate: string | null
    onExpiryDateChange: (val: string | null) => void
    isEditing: boolean
}

export const CONDITION_OPTIONS = [
    { value: "Novo", label: "Novo (Lacrado / Sem uso)" },
    { value: "Usado - Como novo", label: "Usado - Como novo (Perfeito estado, sem marcas)" },
    { value: "Usado - Bom", label: "Usado - Bom estado (Pequenas marcas normais)" },
    { value: "Usado - Marcas de uso", label: "Usado - Com marcas visíveis de uso" },
    { value: "Recondicionado", label: "Recondicionado / Revisado" },
    { value: "Para conserto / peças", label: "Para conserto / Retirada de peças" },
]

export const ProductUsedConditionsSection: React.FC<ProductUsedConditionsSectionProps> = ({
    condition = "Novo",
    onConditionChange,
    acceptsOffers = false,
    onAcceptsOffersChange,
    acceptsTrades = false,
    onAcceptsTradesChange,
    itemsIncluded = "",
    onItemsIncludedChange,
    pickupNeighborhood = "",
    onPickupNeighborhoodChange,
    expiryDate = null,
    onExpiryDateChange,
    isEditing,
}) => {
    // ── MODO READ-ONLY ──────────────────────────────────────────
    if (!isEditing) {
        return (
            <div className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-2 items-center mb-3">
                    <Badge variant={condition === "Novo" ? "green" : "orange"}>
                        {condition || "Novo"}
                    </Badge>

                    {acceptsOffers && (
                        <Badge variant="blue" className="flex items-center gap-1">
                            🤝 Aceita Ofertas
                        </Badge>
                    )}

                    {acceptsTrades && (
                        <Badge variant="purple" className="flex items-center gap-1">
                            🔄 Aceita Trocas
                        </Badge>
                    )}

                    {expiryDate && (
                        <Badge variant="red" className="flex items-center gap-1">
                            ⏳ Validade: {new Date(expiryDate).toLocaleDateString("pt-BR")}
                        </Badge>
                    )}
                </div>

                {itemsIncluded && (
                    <div className="p-3 rounded-xl bg-brand-gray/30 dark:bg-dark-border/20 border border-brand-border dark:border-dark-border">
                        <span className="text-xs text-brand-inactive-text block mb-1">Acompanha:</span>
                        <p className="text-brand-dark dark:text-dark-heading font-medium">{itemsIncluded}</p>
                    </div>
                )}

                {pickupNeighborhood && (
                    <div className="flex items-center gap-2 text-brand-dark dark:text-dark-heading">
                        <MapPinIcon size={16} className="text-brand-primary" />
                        <span>Retirada em: <strong>{pickupNeighborhood}</strong></span>
                    </div>
                )}
            </div>
        )
    }

    // ── MODO EDIÇÃO ─────────────────────────────────────────────
    return (
        <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormDropdown
                    label="Condição do Item"
                    options={CONDITION_OPTIONS}
                    value={condition || "Novo"}
                    setValue={onConditionChange}
                    disabled={!isEditing}
                    width="w-full"
                />

                <Input
                    label="Ponto / Bairro de Retirada (Opcional)"
                    name="pickup_neighborhood"
                    value={pickupNeighborhood || ""}
                    onChange={(e) => onPickupNeighborhoodChange(e.target.value)}
                    placeholder="Ex: Centro / Próximo à Estação"
                    disabled={!isEditing}
                    className="w-full"
                />
            </div>

            <div className="flex flex-wrap items-center gap-6 py-1">
                <Checkbox
                    checked={acceptsOffers}
                    label="Aceita proposta de preço (negociação)"
                    onChange={onAcceptsOffersChange}
                    name="accepts_offers"
                    disabled={!isEditing}
                />

                <Checkbox
                    checked={acceptsTrades}
                    label="Aceita troca por outro item"
                    onChange={onAcceptsTradesChange}
                    name="accepts_trades"
                    disabled={!isEditing}
                />
            </div>

            <Input
                label="O que acompanha o produto? (Acessórios, caixa, manuais)"
                name="items_included"
                value={itemsIncluded || ""}
                onChange={(e) => onItemsIncludedChange(e.target.value)}
                placeholder="Ex: Acompanha caixa original, cabo USB e capa de proteção"
                disabled={!isEditing}
                className="w-full"
            />

            <div className="pt-2 border-t border-brand-border/60 dark:border-dark-border/40">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                    <div>
                        <label className="text-sm font-medium text-brand-dark dark:text-dark-heading block mb-1">
                            Data de Validade (Opcional / Queima de Estoque)
                        </label>
                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                            Útil para mercadinhos, farmácias ou confeitarias destacarem produtos próximos da validade.
                        </p>
                    </div>
                    <Input
                        label=""
                        name="expiry_date"
                        type="date"
                        value={expiryDate ? expiryDate.split("T")[0] : ""}
                        onChange={(e) => onExpiryDateChange(e.target.value ? e.target.value : null)}
                        disabled={!isEditing}
                        className="w-full"
                    />
                </div>
            </div>
        </div>
    )
}
