"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Checkbox, Button, IconPlaceholder } from "@/components/reusable"
import { PlusIcon, TrashIcon, TagIcon } from "@/lib/icons"

interface ProductSuppliersTabProps {
    productData?: any
    isEditing: boolean
}

export const ProductSuppliersTab: React.FC<ProductSuppliersTabProps> = ({
    productData,
    isEditing,
}) => {
    // Lógica de estado movida da GeneralTab para cá
    const [suppliersList, setSuppliersList] = useState([
        { id: 1, name: 'Apple Store Official', location: 'Cupertino, CA', logo: 'bg-gray-900 text-white' },
        { id: 2, name: 'Global Electronics Ltd', location: 'Shenzhen, China', logo: 'bg-blue-600 text-white' },
    ])

    const addSupplier = () => setSuppliersList([...suppliersList, { id: Date.now(), name: 'Novo Fornecedor', location: 'Localização...', logo: 'bg-gray-400 text-white' }])
    const removeSupplier = (id: number) => setSuppliersList(suppliersList.filter(s => s.id !== id))

    return (
        <>
            {suppliersList.length === 0 ? (
                // ESTADO VAZIO (Sem fornecedores)
                <div className="space-y-6">
                    <div className="flex flex-col items-center justify-center text-center py-12 bg-white dark:bg-dark-surface">

                        <div className="space-y-6">
                            <div className="flex flex-col items-center justify-center text-center py-12 bg-white dark:bg-dark-surface">
                                <IconPlaceholder
                                    icon={TagIcon}
                                    title="Não há fornecedores"
                                    subtitle="Você pode vincular fornecedores a este produto para gerenciar reposições."
                                    itemButton={{
                                        text: "Adicionar fornecedor",
                                        action: addSupplier,
                                        variant: "outline",
                                        className: !isEditing ? "opacity-50 pointer-events-none" : ""
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                // TABELA DE FORNECEDORES (Com fornecedores)
                <div className="max-w-[1300px] mx-auto">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Fornecedores Vinculados</h3>
                    </div>

                    <div className="w-full overflow-hidden mb-6 bg-white dark:bg-dark-surface">
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-left border-separate border-spacing-0 min-w-[800px]">
                                <thead>
                                    <tr className="bg-brand-slate dark:bg-dark-surface transition-colors">
                                        <th className="py-2 px-4 w-12 pl-6 rounded-l-xl border-b border-brand-border dark:border-dark-border">
                                            <Checkbox checked={false} onChange={() => { }} name="allSup" disabled={!isEditing} />
                                        </th>
                                        <th className="py-2 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body relative border-b border-brand-border dark:border-dark-border">
                                            <div className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-px bg-gray-300 dark:bg-gray-700"></div>
                                            Nome do Fornecedor
                                        </th>
                                        <th className="py-2 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body relative border-b border-brand-border dark:border-dark-border">
                                            <div className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-px bg-gray-300 dark:bg-gray-700"></div>
                                            Localização
                                        </th>
                                        <th className="py-2 px-4 w-24 relative text-center text-[13px] font-medium text-brand-inactive-text dark:text-dark-body rounded-r-xl border-b border-brand-border dark:border-dark-border">
                                            <div className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-px bg-gray-300 dark:bg-gray-700"></div>
                                            Ações
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="relative">
                                    <AnimatePresence initial={false}>
                                        {suppliersList.map((supplier) => (
                                            <motion.tr
                                                key={supplier.id}
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: "auto" }}
                                                exit={{ opacity: 0, height: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="group hover:bg-brand-gray dark:hover:bg-gray-900/50 transition-colors"
                                            >
                                                <td className="p-4 pl-6 border-b border-brand-border dark:border-dark-border">
                                                    <Checkbox checked={false} onChange={() => { }} name={`sup-${supplier.id}`} disabled={!isEditing} />
                                                </td>
                                                <td className="p-4 border-b border-brand-border dark:border-dark-border">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${supplier.logo}`}>
                                                            {supplier.name.charAt(0)}
                                                        </div>
                                                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                                            {supplier.name}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-4 border-b border-brand-border dark:border-dark-border">
                                                    <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                                        {supplier.location}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-center border-b border-brand-border dark:border-dark-border">
                                                    <div className="flex justify-center items-center">
                                                        <Button
                                                            variant="outline"
                                                            className="w-8 h-8 rounded-full p-0 flex items-center justify-center border-none hover:bg-red-50 dark:hover:bg-red-900/20"
                                                            onClick={() => removeSupplier(supplier.id)}
                                                            disabled={!isEditing}
                                                        >
                                                            <TrashIcon size={16} className="text-brand-inactive-text hover:text-brand-red transition-colors" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </AnimatePresence>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <Button
                        variant="ghost"
                        className="text-sm font-bold text-brand-dark dark:text-dark-heading underline decoration-gray-300 dark:decoration-gray-600 underline-offset-4 hover:bg-transparent px-0 flex items-center"
                        onClick={addSupplier}
                        disabled={!isEditing}
                    >
                        <PlusIcon className="w-4 h-4 mr-2" /> Adicionar fornecedor
                    </Button>
                </div>
            )}
        </>
    )
}
