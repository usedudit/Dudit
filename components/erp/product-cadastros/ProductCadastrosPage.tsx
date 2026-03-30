"use client"

import React, { useState, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useNotification } from "@/hooks/use-notification"
import { Button, IconPlaceholder, Combobox, Input } from "@/components/reusable"
import DefaultModal from "@/components/reusable/DefaultModal"
import AlertModal from "@/components/reusable/AlertModal"
import Pagination from "@/components/reusable/Pagination"

// Components
import MetadataCard from "./MetadataCard"
import CadastrosPageControls from "./CadastrosPageControls"

// Actions
import {
    createCategoryAction, updateCategoryAction, deleteCategoryAction,
    createBrandAction, updateBrandAction, deleteBrandAction,
    createLocationAction, updateLocationAction, deleteLocationAction,
    getProductMetadataAction
} from "@/app/actions/erp/product-metadata"

interface ProductCadastrosPageProps {
    initialMetadata: {
        categories: any[]
        brands: any[]
        locations: any[]
    }
    partnerId: string
}

export default function ProductCadastrosPage({ initialMetadata, partnerId }: ProductCadastrosPageProps) {
    const { success, error } = useNotification()

    // State
    const [metadata, setMetadata] = useState(initialMetadata)
    const [activeTab, setActiveTab] = useState<"categories" | "subcategories" | "brands" | "locations">("categories")
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all")
    const [page, setPage] = useState(1)
    const itemsPerPage = 8

    // Modal State
    const [modal, setModal] = useState<{
        isOpen: boolean
        mode: "add" | "edit"
        type: "category" | "subcategory" | "brand" | "location"
        item: any | null
        isSaving: boolean
    }>({
        isOpen: false,
        mode: "add",
        type: "category",
        item: null,
        isSaving: false
    })

    const [deleteModal, setDeleteModal] = useState<{
        isOpen: boolean
        item: any | null
        isDeleting: boolean
    }>({ isOpen: false, item: null, isDeleting: false })

    // Refresh Data
    const refreshData = useCallback(async () => {
        const result = await getProductMetadataAction(partnerId)
        if (result.success && result.data) {
            setMetadata(result.data)
        }
    }, [partnerId])

    // Filtering Logic
    const filteredData = useMemo(() => {
        let source: any[] = []
        if (activeTab === "categories") source = metadata.categories.filter(c => !c.parent_id)
        else if (activeTab === "subcategories") {
            source = metadata.categories.filter(c => c.parent_id).map(c => ({
                ...c,
                parent_name: metadata.categories.find(p => p.id === c.parent_id)?.name
            }))
        }
        else if (activeTab === "brands") source = metadata.brands
        else if (activeTab === "locations") source = metadata.locations

        return source.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase())
            const matchesStatus = statusFilter === "all" ||
                (statusFilter === "active" && item.is_active) ||
                (statusFilter === "inactive" && !item.is_active)
            return matchesSearch && matchesStatus
        })
    }, [metadata, activeTab, search, statusFilter])

    const totalPages = Math.ceil(filteredData.length / itemsPerPage)
    const paginatedData = filteredData.slice((page - 1) * itemsPerPage, page * itemsPerPage)

    // Handlers
    const handleAdd = () => {
        const typeMap: Record<string, "category" | "subcategory" | "brand" | "location"> = {
            categories: "category",
            subcategories: "subcategory",
            brands: "brand",
            locations: "location"
        }
        setModal({
            isOpen: true,
            mode: "add",
            type: typeMap[activeTab],
            item: { name: "", is_active: true, parent_id: "" },
            isSaving: false
        })
    }

    const handleEdit = (item: any) => {
        const typeMap: Record<string, "category" | "subcategory" | "brand" | "location"> = {
            categories: "category",
            subcategories: "subcategory",
            brands: "brand",
            locations: "location"
        }
        setModal({
            isOpen: true,
            mode: "edit",
            type: typeMap[activeTab],
            item: { ...item, parentId: item.parent_id || "" },
            isSaving: false
        })
    }

    const handleDeleteClick = (item: any) => {
        setDeleteModal({ isOpen: true, item, isDeleting: false })
    }

    const handleSave = async () => {
        const { mode, type, item } = modal
        if (!item.name.trim()) {
            error("O nome é obrigatório", "Por favor, preencha o nome do cadastro.")
            return
        }

        setModal(prev => ({ ...prev, isSaving: true }))
        let result: any

        try {
            if (mode === "add") {
                if (type === "category" || type === "subcategory") {
                    result = await createCategoryAction({ partnerId, name: item.name, parentId: type === "subcategory" ? item.parentId : null })
                } else if (type === "brand") {
                    result = await createBrandAction({ partnerId, name: item.name })
                } else if (type === "location") {
                    result = await createLocationAction({ partnerId, name: item.name })
                }
            } else {
                const updateData = { name: item.name, isActive: item.is_active, parentId: item.parentId }
                if (type === "category" || type === "subcategory") result = await updateCategoryAction(item.id, partnerId, updateData)
                else if (type === "brand") result = await updateBrandAction(item.id, partnerId, updateData)
                else if (type === "location") result = await updateLocationAction(item.id, partnerId, updateData)
            }

            if (result.success) {
                success("Cadastro salvo com sucesso!")
                refreshData()
                setModal(prev => ({ ...prev, isOpen: false }))
            } else {
                error(result.error || "Erro ao salvar")
            }
        } catch (err) {
            error("Erro ao processar solicitação")
        } finally {
            setModal(prev => ({ ...prev, isSaving: false }))
        }
    }

    const confirmDelete = async () => {
        const { item } = deleteModal
        if (!item) return

        setDeleteModal(prev => ({ ...prev, isDeleting: true }))
        let result: any
        try {
            if (activeTab === "categories" || activeTab === "subcategories") result = await deleteCategoryAction(item.id, partnerId)
            else if (activeTab === "brands") result = await deleteBrandAction(item.id, partnerId)
            else if (activeTab === "locations") result = await deleteLocationAction(item.id, partnerId)

            if (result.success) {
                success("Item excluído com sucesso!")
                refreshData()
                setDeleteModal({ isOpen: false, item: null, isDeleting: false })
            } else {
                error(result.error || "Erro ao excluir")
                setDeleteModal(prev => ({ ...prev, isDeleting: false }))
            }
        } catch (err) {
            error("Erro ao processar exclusão")
            setDeleteModal(prev => ({ ...prev, isDeleting: false }))
        }
    }

    return (
        <div className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
            <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
                {/* Header Section */}
                <div className="flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            Cadastros de Produtos
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Gerencie categorias, marcas e localizações dos seus produtos.
                        </p>
                    </div>
                </div>

                <CadastrosPageControls
                    activeTab={activeTab}
                    setActiveTab={(t) => { setActiveTab(t); setPage(1); }}
                    search={search}
                    onSearchChange={setSearch}
                    onAdd={handleAdd}
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                />

                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24">
                    <AnimatePresence mode="wait">
                        {filteredData.length === 0 ? (
                            <motion.div
                                key="empty"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex flex-col items-center justify-center py-20"
                            >
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                    title="Nenhum item encontrado"
                                    subtitle="Tente ajustar seus filtros ou termos de busca."
                                    itemButton={search || statusFilter !== 'all' ? {
                                        text: "Limpar Filtros",
                                        action: () => { setSearch(""); setStatusFilter("all"); }
                                    } : {
                                        text: "Adicionar Primeiro Item",
                                        action: handleAdd
                                    }}
                                />
                            </motion.div>
                        ) : (
                            <motion.div
                                key={`${activeTab}-grid`}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                            >
                                {paginatedData.map(item => (
                                    <MetadataCard
                                        key={item.id}
                                        item={item}
                                        type={activeTab === 'subcategories' ? 'subcategory' : activeTab === 'categories' ? 'category' : activeTab === 'brands' ? 'brand' : 'location'}
                                        onEdit={handleEdit}
                                        onDelete={handleDeleteClick}
                                    />
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {totalPages > 1 && (
                        <div className="mt-12 mb-8">
                            <Pagination
                                currentPage={page}
                                totalPages={totalPages}
                                onPageChange={setPage}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
            <DefaultModal
                isOpen={modal.isOpen}
                onClose={() => setModal(prev => ({ ...prev, isOpen: false }))}
                title={`${modal.mode === 'add' ? 'Adicionar' : 'Editar'} ${modal.type === 'category' ? 'Categoria' :
                    modal.type === 'subcategory' ? 'Subcategoria' :
                        modal.type === 'brand' ? 'Marca' : 'Localização'
                    }`}
                maxWidth="md"
            >
                <div className="space-y-6 pt-4 pb-2">
                    {modal.type === "subcategory" && (
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">Categoria Pai</label>
                            <Combobox
                                options={metadata.categories.filter(c => !c.parent_id).map(c => ({ value: c.id, label: c.name }))}
                                value={modal.item?.parentId || ""}
                                onChange={(v: string) => setModal(prev => ({ ...prev, item: { ...prev.item, parentId: v } }))}
                                width="w-full"
                            />
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">Nome</label>
                        <Input
                            placeholder="Digite o nome..."
                            value={modal.item?.name || ""}
                            onChange={(e: any) => setModal(prev => ({ ...prev, item: { ...prev.item, name: e.target.value } }))}
                            onKeyDown={(e: any) => e.key === 'Enter' && handleSave()}
                            autoFocus
                        />
                    </div>

                    {modal.mode === "edit" && (
                        <div className="flex items-center justify-between p-4 bg-brand-gray dark:bg-dark-border/30 rounded-xl">
                            <div className="flex flex-col">
                                <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">Status do Item</span>
                                <span className="text-[12px] text-brand-inactive-text dark:text-dark-body">Defina se este item estará disponível para seleção.</span>
                            </div>
                            <div
                                className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors duration-300 ${modal.item?.is_active ? 'bg-brand-green' : 'bg-gray-300 dark:bg-gray-700'}`}
                                onClick={() => setModal(prev => ({ ...prev, item: { ...prev.item, is_active: !prev.item.is_active } }))}
                            >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300 ${modal.item?.is_active ? 'left-7' : 'left-1'}`} />
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-brand-border dark:border-dark-border">
                        <Button variant="outline" onClick={() => setModal(prev => ({ ...prev, isOpen: false }))}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={modal.isSaving || !modal.item?.name?.trim()}>
                            {modal.isSaving ? "Salvando..." : "Salvar"}
                        </Button>
                    </div>
                </div>
            </DefaultModal>

            <AlertModal
                isOpen={deleteModal.isOpen}
                onClose={() => setDeleteModal({ isOpen: false, item: null, isDeleting: false })}
                onConfirm={confirmDelete}
                title="Excluir Permanentemente"
                description={`Tem certeza que deseja excluir "${deleteModal.item?.name}"? Esta ação não pode ser desfeita.`}
                isDestructive
                isLoading={deleteModal.isDeleting}
            />
        </div>
    )
}
