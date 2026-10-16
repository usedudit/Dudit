"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Input, MoneyInput, Button, Checkbox, Badge, IconPlaceholder, AlertModal } from "@/components/reusable"
import { PlusIcon, TrashIcon, ChevronDownIcon } from "@/lib/icons"
import type { ProductAddonGroup, ProductAddonOption } from "@/lib/types/product"
import { formatCurrency } from "@/lib/utils"

const MAX_OPTIONS_PER_GROUP = 20
const MAX_NAME_LENGTH = 50

interface ProductAddonsSectionProps {
    addonGroups: ProductAddonGroup[]
    onChange: (groups: ProductAddonGroup[]) => void
    isEditing: boolean
}

export const ProductAddonsSection: React.FC<ProductAddonsSectionProps> = ({
    addonGroups = [],
    onChange,
    isEditing,
}) => {
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
    const [groupToDelete, setGroupToDelete] = useState<ProductAddonGroup | null>(null)

    const toggleGroup = (groupId: string) => {
        setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }))
    }

    const addGroup = () => {
        const newGroup: ProductAddonGroup = {
            id: `addon_grp_${Date.now()}`,
            name: "",
            required: false,
            min_quantity: 0,
            max_quantity: 1,
            options: [
                {
                    id: `opt_${Date.now()}_1`,
                    name: "",
                    price: 0,
                    is_available: true,
                },
            ],
        }
        const updated = [...(addonGroups || []), newGroup]
        onChange(updated)
        setExpandedGroups((prev) => ({ ...prev, [newGroup.id]: true }))
    }

    const removeGroup = (groupId: string) => {
        const group = (addonGroups || []).find((g) => g.id === groupId)
        if (group) setGroupToDelete(group)
    }

    const confirmRemoveGroup = () => {
        const group = groupToDelete
        setGroupToDelete(null)
        if (group) onChange((addonGroups || []).filter((g) => g.id !== group.id))
    }

    const updateGroup = (groupId: string, field: keyof ProductAddonGroup, value: any) => {
        onChange(
            (addonGroups || []).map((g) => {
                if (g.id !== groupId) return g
                const updated = { ...g, [field]: value }
                // Regra: se for obrigatório e min for 0, ajusta min para 1
                if (field === "required" && value === true && updated.min_quantity === 0) {
                    updated.min_quantity = 1
                }
                return updated
            })
        )
    }

    const addOptionToGroup = (groupId: string) => {
        const group = (addonGroups || []).find((g) => g.id === groupId)
        if (!group || group.options.length >= MAX_OPTIONS_PER_GROUP) return
        const newOption: ProductAddonOption = {
            id: `opt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            name: "",
            price: 0,
            is_available: true,
        }
        onChange(
            (addonGroups || []).map((g) => {
                if (g.id !== groupId) return g
                return { ...g, options: [...g.options, newOption] }
            })
        )
    }

    const removeOptionFromGroup = (groupId: string, optionId: string) => {
        onChange(
            (addonGroups || []).map((g) => {
                if (g.id !== groupId) return g
                return { ...g, options: g.options.filter((o) => o.id !== optionId) }
            })
        )
    }

    const updateOptionInGroup = (
        groupId: string,
        optionId: string,
        field: keyof ProductAddonOption,
        value: any
    ) => {
        onChange(
            (addonGroups || []).map((g) => {
                if (g.id !== groupId) return g
                return {
                    ...g,
                    options: g.options.map((o) => (o.id === optionId ? { ...o, [field]: value } : o)),
                }
            })
        )
    }

    // ── MODO READ-ONLY ──────────────────────────────────────────
    if (!isEditing) {
        if (!addonGroups || addonGroups.length === 0) {
            return (
                <p className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhum complemento adicionado</p>
            )
        }

        return (
            <div className="space-y-4">
                {addonGroups.map((group) => (
                    <div
                        key={group.id}
                        className="p-4 rounded-2xl border border-brand-border dark:border-dark-border bg-brand-gray/30 dark:bg-dark-border/20"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-brand-dark dark:text-dark-heading text-sm md:text-base">
                                    {group.name || "Grupo sem nome"}
                                </span>
                                {group.required ? (
                                    <Badge variant="orange" className="text-xs">
                                        Obrigatório (Mín: {group.min_quantity})
                                    </Badge>
                                ) : (
                                    <Badge variant="gray" className="text-xs">
                                        Opcional (Até {group.max_quantity})
                                    </Badge>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                            {group.options.map((opt) => (
                                <div
                                    key={opt.id}
                                    className="flex justify-between items-center px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border text-sm"
                                >
                                    <span className="text-brand-dark dark:text-dark-heading font-medium">
                                        {opt.name || "Opção"}
                                    </span>
                                    <span className="text-brand-primary dark:text-brand-primary font-semibold">
                                        {opt.price > 0 ? `+ ${formatCurrency(opt.price)}` : "Grátis"}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    // ── MODO EDIÇÃO ─────────────────────────────────────────────
    return (
        <div className="space-y-6">
            {!addonGroups || addonGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center">
                    <IconPlaceholder
                        icon={PlusIcon}
                        title="Nenhum complemento adicionado"
                        subtitle="Exemplo: Escolha o Molho, Ponto da Carne, Borda Recheada ou Adicionais Extras."
                        itemButton={{
                            text: "Criar primeiro grupo",
                            action: addGroup,
                            variant: "outline",
                        }}
                    />
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-brand-inactive-text dark:text-dark-body">
                            Grupos de Complementos
                        </h3>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={addGroup}
                            leftIcon={<PlusIcon className="w-4 h-4" />}
                            className="text-xs h-8"
                        >
                            Adicionar grupo
                        </Button>
                    </div>
                    <AnimatePresence initial={false}>
                        {addonGroups.map((group) => {
                            const isExpanded = expandedGroups[group.id] ?? true

                            return (
                                <motion.div
                                    key={group.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden bg-white dark:bg-dark-surface shadow-2xs"
                                >
                                    {/* Cabeçalho do Grupo */}
                                    <div className="p-4 bg-brand-gray dark:bg-dark-border/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
                                        <div className="flex-1 flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={() => toggleGroup(group.id)}
                                                className="p-1 rounded-lg hover:bg-brand-gray dark:hover:bg-dark-border text-brand-inactive-text"
                                            >
                                                <ChevronDownIcon
                                                    size={18}
                                                    className={`transition-transform duration-200 ${isExpanded ? "" : "-rotate-90"}`}
                                                />
                                            </button>
                                            <div className="flex-1">
                                                <Input
                                                    label=""
                                                    name={`grp-name-${group.id}`}
                                                    placeholder="Nome do grupo (ex: Escolha o Molho, Adicionais)"
                                                    value={group.name}
                                                    onChange={(e) => updateGroup(group.id, "name", e.target.value.slice(0, MAX_NAME_LENGTH))}
                                                    className="mb-0 font-medium"
                                                    maxLength={MAX_NAME_LENGTH}
                                                    showCharacterCount
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 justify-between md:justify-end">
                                            <Checkbox
                                                checked={group.required}
                                                label="Obrigatório"
                                                onChange={(checked) => updateGroup(group.id, "required", checked)}
                                                name={`grp-req-${group.id}`}
                                            />

                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-brand-inactive-text whitespace-nowrap">
                                                    Máx:
                                                </span>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="50"
                                                    value={group.max_quantity || 1}
                                                    onChange={(e) =>
                                                        updateGroup(group.id, "max_quantity", Math.max(1, Number(e.target.value) || 1))
                                                    }
                                                    className="w-14 h-8 text-center text-xs font-semibold rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface"
                                                />
                                            </div>

                                            <Button
                                                type="button"
                                                variant="outlinered"
                                                onClick={() => removeGroup(group.id)}
                                                className="w-8 h-8 p-0 flex items-center justify-center shrink-0"
                                                title="Remover grupo"
                                            >
                                                <TrashIcon className="w-4 h-4 pointer-events-none" />
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Opções do Grupo */}
                                    {isExpanded && (
                                        <div className="p-4 space-y-3">
                                            <div className="text-sm font-semibold text-brand-inactive-text dark:text-dark-body mb-2">
                                                Opções / Itens do Grupo
                                                <span className={`ml-2 text-xs ${group.options.length >= MAX_OPTIONS_PER_GROUP ? "text-brand-red" : "text-brand-inactive-text"}`}>
                                                    ({group.options.length}/{MAX_OPTIONS_PER_GROUP})
                                                </span>
                                            </div>

                                            <AnimatePresence initial={false}>
                                                {group.options.map((opt) => (
                                                    <motion.div
                                                        key={opt.id}
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        className="flex items-center gap-3"
                                                    >
                                                        <div className="flex-1">
                                                            <Input
                                                                label=""
                                                                name={`opt-name-${opt.id}`}
                                                                placeholder="Nome da opção (ex: Molho Especial, Bacon Extra)"
                                                                value={opt.name}
                                                                onChange={(e) =>
                                                                    updateOptionInGroup(group.id, opt.id, "name", e.target.value.slice(0, MAX_NAME_LENGTH))
                                                                }
                                                                maxLength={MAX_NAME_LENGTH}
                                                                showCharacterCount
                                                            />
                                                        </div>

                                                        <div className="w-32 sm:w-36">
                                                            <MoneyInput
                                                                label=""
                                                                name={`opt-price-${opt.id}`}
                                                                value={opt.price || ""}
                                                                onChange={(val) =>
                                                                    updateOptionInGroup(group.id, opt.id, "price", val || 0)
                                                                }
                                                            />
                                                        </div>

                                                        <Button
                                                            type="button"
                                                            variant="outlinered"
                                                            onClick={() => removeOptionFromGroup(group.id, opt.id)}
                                                            className="w-8 h-8 p-0 flex items-center justify-center shrink-0"
                                                            title="Remover opção"
                                                        >
                                                            <TrashIcon className="w-3.5 h-3.5 pointer-events-none" />
                                                        </Button>
                                                    </motion.div>
                                                ))}
                                            </AnimatePresence>

                                            <Button
                                                type="button"
                                                variant="link"
                                                onClick={() => addOptionToGroup(group.id)}
                                                leftIcon={<PlusIcon className="w-3.5 h-3.5" />}
                                                className="text-xs mt-2"
                                                disabled={group.options.length >= MAX_OPTIONS_PER_GROUP}
                                            >
                                                Adicionar item a este grupo
                                            </Button>
                                        </div>
                                    )}
                                </motion.div>
                            )
                        })}
                    </AnimatePresence>
                </div>
            )}

            {groupToDelete && (
                <AlertModal
                    title="Remover grupo?"
                    message={`O grupo "${groupToDelete.name || "sem nome"}" será removido permanentemente, junto com todas as suas opções.`}
                    isOpen={true}
                    onClose={() => setGroupToDelete(null)}
                    onConfirm={confirmRemoveGroup}
                    confirmText="Remover"
                    cancelText="Cancelar"
                    variant="danger"
                    isDestructive
                />
            )}
        </div>
    )
}
