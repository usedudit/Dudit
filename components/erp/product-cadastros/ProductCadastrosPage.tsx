"use client"

import React, { useState, useMemo, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { motion, AnimatePresence } from "framer-motion"
import { useNotification } from "@/hooks/use-notification"
import { PlusIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { Button, IconPlaceholder, Combobox, Input, Checkbox } from "@/components/reusable"
import DefaultModal from "@/components/reusable/DefaultModal"
import AlertModal from "@/components/reusable/AlertModal"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"
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
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"

interface ProductCadastrosPageProps {
    initialMetadata: {
        categories: any[]
        brands: any[]
        locations: any[]
    }
    partnerId: string
    planGate?: { requiredPlanSlug: "crescer" | "escalar"; message: string }
}

export default function ProductCadastrosPage({ initialMetadata, partnerId, planGate }: ProductCadastrosPageProps) {
    const { success, error } = useNotification()
    const router = useRouter()
    const searchParams = useSearchParams()
    const { openPlanUpgrade } = usePlanUpgrade()
    // State
    const [metadata, setMetadata] = useState(initialMetadata)

    // Initialize activeTab from URL parameter 'tab'
    const tabFromUrl = searchParams.get("tab") as any
    const validTabs = ["categories", "subcategories", "brands", "locations"]

    const [activeTab, setActiveTab] = useState<"categories" | "subcategories" | "brands" | "locations">(
        validTabs.includes(tabFromUrl) ? tabFromUrl : "categories"
    )
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [page, setPage] = useState(1)

    const ITEMS_PER_PAGE = 8

    const [modal, setModal] = useState<{
        isOpen: boolean
        mode: "add" | "edit"
        type: "category" | "subcategory" | "brand" | "location"
        item: any
        isSaving: boolean
    }>({
        isOpen: false,
        mode: "add",
        type: "category",
        item: { name: "", is_active: true, parentId: null },
        isSaving: false
    })

    const [deleteModal, setDeleteModal] = useState<{
        isOpen: boolean
        item: any | null
        isDeleting: boolean
        subcategoryCount: number
    }>({ isOpen: false, item: null, isDeleting: false, subcategoryCount: 0 })

    const [nameError, setNameError] = useState(false)
    const isProcessing = modal.isSaving || deleteModal.isDeleting

    React.useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search)
        }, 300)
        return () => clearTimeout(timer)
    }, [search])

    // Handle browser back/forward navigation
    React.useEffect(() => {
        const handlePopState = () => {
            const params = new URLSearchParams(window.location.search)
            const tab = params.get("tab") as any
            if (validTabs.includes(tab)) {
                setActiveTab(tab)
            } else {
                setActiveTab("categories")
            }
            setPage(1)
        }

        window.addEventListener("popstate", handlePopState)
        return () => window.removeEventListener("popstate", handlePopState)
    }, [])

    // Refresh Data
    const refreshData = useCallback(async () => {
        const result = await getProductMetadataAction(partnerId)
        if (result.success && result.data) {
            setMetadata(result.data)
        }
    }, [partnerId])

    // Filtered Data
    const tabItems = useMemo(() => {
        if (activeTab === "categories") return metadata.categories.filter(c => !c.parent_id)
        if (activeTab === "subcategories") return metadata.categories.filter(c => c.parent_id)
        if (activeTab === "brands") return metadata.brands
        if (activeTab === "locations") return metadata.locations
        return []
    }, [activeTab, metadata])

    const filteredItems = useMemo(() => {
        return tabItems.filter(item =>
            item.name.toLowerCase().includes(debouncedSearch.toLowerCase())
        )
    }, [tabItems, debouncedSearch])

    // Pagination
    const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE)
    const paginatedItems = filteredItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

    // Handlers
    const handleTabChange = (tab: "categories" | "subcategories" | "brands" | "locations") => {
        setActiveTab(tab)
        setPage(1)

        if (typeof window !== "undefined") {
            const url = new URL(window.location.href)
            if (tab === "categories") {
                url.searchParams.delete("tab")
            } else {
                url.searchParams.set("tab", tab)
            }
            window.history.pushState(null, "", url.toString())
        }
    }

    const getAddButtonLabel = () => {
        switch (activeTab) {
            case "categories": return "Nova categoria"
            case "subcategories": return "Nova subcategoria"
            case "brands": return "Nova marca"
            case "locations": return "Nova localização"
            default: return "Novo cadastro"
        }
    }

    const handleAdd = () => {

        let type: typeof modal.type = "category"
        if (activeTab === "subcategories") type = "subcategory"
        else if (activeTab === "brands") type = "brand"
        else if (activeTab === "locations") type = "location"

        setModal({
            isOpen: true,
            mode: "add",
            type,
            item: { name: "", is_active: true, parentId: null },
            isSaving: false
        })
        setNameError(false)
    }

    const handleEdit = (item: any) => {
        let type: typeof modal.type = "category"
        if (activeTab === "subcategories") type = "subcategory"
        else if (activeTab === "brands") type = "brand"
        else if (activeTab === "locations") type = "location"

        setModal({
            isOpen: true,
            mode: "edit",
            type,
            item: { ...item, parentId: item.parent_id },
            isSaving: false
        })
        setNameError(false)
    }

    const handleDeleteClick = (item: any) => {
        let subcategoryCount = 0
        if (activeTab === "categories") {
            subcategoryCount = metadata.categories.filter(c => c.parent_id === item.id).length
        }
        setDeleteModal({ isOpen: true, item, isDeleting: false, subcategoryCount })
    }

    const handleSave = async () => {
        const { mode, type, item } = modal
        if (!item.name.trim()) {
            setNameError(true)
            error("O nome é obrigatório", "Por favor, preencha o nome do cadastro.")
            return
        }
        setNameError(false)

        setModal(prev => ({ ...prev, isSaving: true }))
        let result: any
        try {
            if (mode === "add") {
                if (type === "category" || type === "subcategory") {
                    result = await createCategoryAction({ partnerId, name: item.name, parentId: item.parentId })
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
                setDeleteModal({ isOpen: false, item: null, isDeleting: false, subcategoryCount: 0 })
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
        <FadeIn
            className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300"
        >
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; } 
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } 
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 9999px; border: 2px solid #fff; }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border: 2px solid #1f2937; }
                .dark .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

            <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
                {/* Header Section - Exactly like ProductsPage */}
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                Cadastros de Produtos
                            </h1>
                        </div>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Gerencie categorias, marcas e localizações do seu inventário.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button onClick={handleAdd} disabled={!!planGate} className="w-full">
                            <PlusIcon className="w-[18px] h-[18px]" strokeWidth={3} />
                            {getAddButtonLabel()}
                        </Button>

                    </div>
                </div>

                {/* Controls - Exactly like ProductsPage Controls Position */}
                <CadastrosPageControls
                    activeTab={activeTab}
                    setActiveTab={handleTabChange}

                    search={search}
                    onSearchChange={setSearch}
                    onAdd={handleAdd}
                    addDisabled={!!planGate}
                />

                {/* Content Area - Scrollable with exactly same padding and scrollbar behavior */}
                <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-0 px-4 md:px-8">
                    <AnimatePresence mode="wait">
                        {filteredItems.length === 0 ? (
                            <FadeIn
                                key="empty"
                                className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full"
                            >
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc={
                                        planGate
                                            ? "https://img.dudit.com.br/static/mascots/PlanoVender.png"
                                            : debouncedSearch.trim().length > 0
                                                ? "https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                                : "https://img.dudit.com.br/static/mascots/CadastrosProdutos.png"
                                    }
                                    title={planGate ? "Plano necessário" : (debouncedSearch.trim().length > 0 ? "Nenhum item encontrado" : "Nenhum cadastro encontrado")}
                                    subtitle={
                                        planGate
                                            ? planGate.message
                                            : debouncedSearch.trim().length > 0
                                                ? "Ajuste os filtros ou tente outra busca."
                                                : "Adicione um novo cadastro para começar a gerenciar seu inventário."
                                    }
                                    itemButton={
                                        planGate ? {
                                            text: "Ver Plano Crescer",
                                            action: () => openPlanUpgrade("crescer"),
                                        } : undefined
                                    }
                                />
                            </FadeIn>
                        ) : (
                            <FadeIn
                                key="grid"
                                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-8"
                            >
                                {paginatedItems.map((item) => (
                                    <MetadataCard
                                        key={item.id}
                                        item={item}
                                        type={activeTab}
                                        categories={metadata.categories}
                                        onEdit={() => handleEdit(item)}
                                        onDelete={() => handleDeleteClick(item)}
                                    />
                                ))}
                            </FadeIn>
                        )}
                    </AnimatePresence>
                </div>

                {/* Pagination - Identical position */}
                {paginatedItems.length > 0 && (
                    <Pagination
                        currentPage={page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                    />
                )}
            </div>

            {/* Modals */}
            <DefaultModal
                isOpen={modal.isOpen}
                onClose={() => setModal(prev => ({ ...prev, isOpen: false }))}
                title={modal.mode === "add" ? "Novo cadastro" : "Editar cadastro"}
                footer={
                    <div className="flex justify-end gap-3 w-full">
                        <Button variant="outline" onClick={() => setModal(prev => ({ ...prev, isOpen: false }))}>Cancelar</Button>
                        <Button onClick={handleSave} isLoading={modal.isSaving}>Salvar</Button>
                    </div>
                }
            >
                <div className="flex flex-col gap-4 p-4">
                    <Combobox
                        label="Tipo de Cadastro"
                        options={[
                            { value: "category", label: "Categoria" },
                            { value: "subcategory", label: "Subcategoria" },
                            { value: "brand", label: "Marca" },
                            { value: "location", label: "Localização" }
                        ]}
                        value={modal.type}
                        onChange={(val: string) => setModal(prev => ({ ...prev, type: val as any, item: { ...prev.item, parentId: null } }))}
                        disabled={modal.mode === "edit"}
                    />

                    <Input
                        label="Nome"
                        placeholder="Ex: Eletrônicos, Nike, Prateleira A1"
                        value={modal.item.name}
                        onChange={(e) => {
                            setModal(prev => ({ ...prev, item: { ...prev.item, name: e.target.value } }))
                            setNameError(false)
                        }}
                        onKeyDown={(e) => e.key === "Enter" && handleSave()}
                        error={nameError}
                        errorMessage={nameError ? "O nome é obrigatório" : undefined}
                        maxLength={150}
                    />

                    {modal.type === "subcategory" && (
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                Categoria Pai
                            </label>
                            <Combobox
                                placeholder="Selecione a categoria pai..."
                                options={metadata.categories.filter((c: any) => !c.parent_id).map((c: any) => ({ value: c.id, label: c.name }))}
                                value={modal.item.parentId}
                                onChange={(val: string) => setModal(prev => ({ ...prev, item: { ...prev.item, parentId: val } }))}
                            />
                        </div>
                    )}

                    <Checkbox
                        id="is_active"
                        label="Cadastro Ativo"
                        checked={modal.item.is_active}
                        onChange={(checked) => setModal(prev => ({ ...prev, item: { ...prev.item, is_active: checked } }))}
                        className="mt-2"
                    />
                </div>
            </DefaultModal>

            <AlertModal
                isOpen={deleteModal.isOpen}
                onClose={() => setDeleteModal({ isOpen: false, item: null, isDeleting: false, subcategoryCount: 0 })}
                onConfirm={confirmDelete}
                title="Excluir Item"
                description={
                    deleteModal.subcategoryCount > 0
                        ? `Tem certeza que deseja excluir "${deleteModal.item?.name}"? Esta categoria possui ${deleteModal.subcategoryCount} subcategoria(s) que também serão excluídas. Esta ação não pode ser desfeita.`
                        : `Tem certeza que deseja excluir "${deleteModal.item?.name}"? Esta ação não pode ser desfeita.`
                }
                isDestructive
                isLoading={deleteModal.isDeleting}
            />

            <SavingStatusModal isOpen={isProcessing} text={deleteModal.isDeleting ? "Excluindo cadastro..." : "Salvando cadastro..."} />
        </FadeIn>
    )
}
