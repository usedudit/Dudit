"use client"

import React, { useState, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useNotification } from "@/hooks/use-notification"
import { PlusIcon } from "@/lib/icons"
import { Button, IconPlaceholder, Combobox, Input, Checkbox, FormTextarea } from "@/components/reusable"
import DefaultModal from "@/components/reusable/DefaultModal"
import AlertModal from "@/components/reusable/AlertModal"
import Pagination from "@/components/reusable/Pagination"

import FinancialCategoryCard from "./FinancialCategoryCard"
import FinancialAccountCard, { type FinanceAccountRow } from "./FinancialAccountCard"
import FinancialCadastrosPageControls, { type FinancialCadastrosTab } from "./FinancialCadastrosPageControls"

import {
    createFinancialCategoryAction,
    updateFinancialCategoryAction,
    deleteFinancialCategoryAction,
    getFinancialCategoriesAction,
} from "@/app/actions/erp/financial-category-metadata"
import {
    createFinanceAccountAction,
    updateFinanceAccountAction,
    deleteFinanceAccountAction,
    getFinanceAccountsAction,
    type FinanceAccountType,
} from "@/app/actions/erp/finance-accounts"

interface FinancialCategoriesPageProps {
    initialCategories: {
        id: string
        name: string
        parent_id: string | null
        is_active: boolean
        created_at: string
    }[]
    initialAccounts: FinanceAccountRow[]
    partnerId: string
}

const ACCOUNT_TYPE_OPTIONS: { value: FinanceAccountType; label: string }[] = [
    { value: "cash", label: "Caixa" },
    { value: "bank", label: "Conta bancária" },
    { value: "wallet", label: "Carteira digital" },
]

function parseMoneyInput(s: string): number {
    const t = s.trim().replace(",", ".")
    if (t === "") return 0
    const n = Number(t)
    return Number.isFinite(n) ? n : 0
}

function parseOptionalMoneyInput(s: string): number | null {
    const t = s.trim().replace(",", ".")
    if (t === "") return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
}

export default function FinancialCategoriesPage({
    initialCategories,
    initialAccounts,
    partnerId,
}: FinancialCategoriesPageProps) {
    const { success, error } = useNotification()

    const [categories, setCategories] = useState(initialCategories)
    const [accounts, setAccounts] = useState<FinanceAccountRow[]>(initialAccounts)
    const [activeTab, setActiveTab] = useState<FinancialCadastrosTab>("categories")
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const ITEMS_PER_PAGE = 8

    const [modal, setModal] = useState<{
        isOpen: boolean
        mode: "add" | "edit"
        type: "category" | "subcategory"
        item: {
            id?: string
            name: string
            is_active: boolean
            parentId: string | null
        }
        isSaving: boolean
    }>({
        isOpen: false,
        mode: "add",
        type: "category",
        item: { name: "", is_active: true, parentId: null },
        isSaving: false,
    })

    const [accountModal, setAccountModal] = useState<{
        isOpen: boolean
        mode: "add" | "edit"
        item: {
            id?: string
            name: string
            type: FinanceAccountType
            description: string
            initialBalanceStr: string
            currentBalanceStr: string
            is_active: boolean
        }
        isSaving: boolean
    }>({
        isOpen: false,
        mode: "add",
        item: {
            name: "",
            type: "cash",
            description: "",
            initialBalanceStr: "0",
            currentBalanceStr: "",
            is_active: true,
        },
        isSaving: false,
    })

    const [deleteModal, setDeleteModal] = useState<{
        isOpen: boolean
        item: { id: string; name: string; kind: "category" | "account" } | null
        isDeleting: boolean
    }>({ isOpen: false, item: null, isDeleting: false })

    const [nameError, setNameError] = useState(false)
    const [accountNameError, setAccountNameError] = useState(false)

    const refreshData = useCallback(async () => {
        const [catsRes, accRes] = await Promise.all([
            getFinancialCategoriesAction(partnerId),
            getFinanceAccountsAction(partnerId),
        ])
        if (catsRes.success && catsRes.data) setCategories(catsRes.data.categories)
        if (accRes.success && accRes.data) setAccounts(accRes.data.accounts as FinanceAccountRow[])
    }, [partnerId])

    const filteredCategoryItems = useMemo(() => {
        const items =
            activeTab === "categories"
                ? categories.filter((c) => !c.parent_id)
                : categories.filter((c) => c.parent_id)

        return items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
    }, [activeTab, categories, search])

    const filteredAccounts = useMemo(() => {
        const q = search.toLowerCase()
        return accounts.filter((a) => {
            const typeLabel = ACCOUNT_TYPE_OPTIONS.find((o) => o.value === a.type)?.label ?? a.type
            return (
                a.name.toLowerCase().includes(q) ||
                (a.description && a.description.toLowerCase().includes(q)) ||
                typeLabel.toLowerCase().includes(q)
            )
        })
    }, [accounts, search])

    const filteredItems =
        activeTab === "accounts" ? filteredAccounts : filteredCategoryItems

    const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE)
    const paginatedItems = filteredItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

    const handleAdd = () => {
        if (activeTab === "accounts") {
            setAccountModal({
                isOpen: true,
                mode: "add",
                item: {
                    name: "",
                    type: "cash",
                    description: "",
                    initialBalanceStr: "0",
                    currentBalanceStr: "",
                    is_active: true,
                },
                isSaving: false,
            })
            setAccountNameError(false)
            return
        }

        const type = activeTab === "subcategories" ? "subcategory" : "category"
        setModal({
            isOpen: true,
            mode: "add",
            type,
            item: { name: "", is_active: true, parentId: null },
            isSaving: false,
        })
        setNameError(false)
    }

    const handleEditCategory = (item: (typeof categories)[0]) => {
        const type = item.parent_id ? "subcategory" : "category"
        setModal({
            isOpen: true,
            mode: "edit",
            type,
            item: { id: item.id, name: item.name, is_active: item.is_active, parentId: item.parent_id },
            isSaving: false,
        })
        setNameError(false)
    }

    const handleEditAccount = (item: FinanceAccountRow) => {
        setAccountModal({
            isOpen: true,
            mode: "edit",
            item: {
                id: item.id,
                name: item.name,
                type: item.type as FinanceAccountType,
                description: item.description ?? "",
                initialBalanceStr: String(item.initial_balance ?? "0"),
                currentBalanceStr:
                    item.current_balance === null || item.current_balance === undefined
                        ? ""
                        : String(item.current_balance),
                is_active: item.is_active,
            },
            isSaving: false,
        })
        setAccountNameError(false)
    }

    const handleDeleteCategory = (item: (typeof categories)[0]) => {
        setDeleteModal({
            isOpen: true,
            item: { id: item.id, name: item.name, kind: "category" },
            isDeleting: false,
        })
    }

    const handleDeleteAccount = (item: FinanceAccountRow) => {
        setDeleteModal({
            isOpen: true,
            item: { id: item.id, name: item.name, kind: "account" },
            isDeleting: false,
        })
    }

    const handleSaveCategory = async () => {
        const { mode, type, item } = modal
        if (!item.name.trim()) {
            setNameError(true)
            error("O nome é obrigatório", "Por favor, preencha o nome do cadastro.")
            return
        }
        setNameError(false)

        setModal((prev) => ({ ...prev, isSaving: true }))
        try {
            let result: { success: boolean; error?: string }
            if (mode === "add") {
                result = await createFinancialCategoryAction({
                    partnerId,
                    name: item.name,
                    parentId: type === "subcategory" ? item.parentId : null,
                })
            } else {
                if (!item.id) {
                    setModal((prev) => ({ ...prev, isSaving: false }))
                    return
                }
                result = await updateFinancialCategoryAction(item.id, partnerId, {
                    name: item.name,
                    isActive: item.is_active,
                    parentId: type === "subcategory" ? item.parentId : null,
                })
            }

            if (result.success) {
                success("Cadastro salvo com sucesso!")
                refreshData()
                setModal((prev) => ({ ...prev, isOpen: false }))
            } else {
                error(result.error || "Erro ao salvar")
            }
        } catch {
            error("Erro ao processar solicitação")
        } finally {
            setModal((prev) => ({ ...prev, isSaving: false }))
        }
    }

    const handleSaveAccount = async () => {
        const { mode, item } = accountModal
        if (!item.name.trim()) {
            setAccountNameError(true)
            error("O nome é obrigatório", "Por favor, preencha o nome da conta.")
            return
        }
        setAccountNameError(false)

        const initialBal = parseMoneyInput(item.initialBalanceStr)
        const currentBal = parseOptionalMoneyInput(item.currentBalanceStr)

        setAccountModal((prev) => ({ ...prev, isSaving: true }))
        try {
            let result: { success: boolean; error?: string }
            if (mode === "add") {
                result = await createFinanceAccountAction({
                    partnerId,
                    name: item.name,
                    type: item.type,
                    description: item.description || null,
                    initialBalance: initialBal,
                    currentBalance: currentBal,
                })
            } else {
                if (!item.id) {
                    setAccountModal((prev) => ({ ...prev, isSaving: false }))
                    return
                }
                result = await updateFinanceAccountAction(item.id, partnerId, {
                    name: item.name,
                    type: item.type,
                    description: item.description || null,
                    initialBalance: initialBal,
                    currentBalance: currentBal,
                    isActive: item.is_active,
                })
            }

            if (result.success) {
                success("Cadastro salvo com sucesso!")
                refreshData()
                setAccountModal((prev) => ({ ...prev, isOpen: false }))
            } else {
                error(result.error || "Erro ao salvar")
            }
        } catch {
            error("Erro ao processar solicitação")
        } finally {
            setAccountModal((prev) => ({ ...prev, isSaving: false }))
        }
    }

    const confirmDelete = async () => {
        const { item } = deleteModal
        if (!item) return

        setDeleteModal((prev) => ({ ...prev, isDeleting: true }))
        try {
            const result =
                item.kind === "category"
                    ? await deleteFinancialCategoryAction(item.id, partnerId)
                    : await deleteFinanceAccountAction(item.id, partnerId)
            if (result.success) {
                success("Item excluído com sucesso!")
                refreshData()
                setDeleteModal({ isOpen: false, item: null, isDeleting: false })
            } else {
                error(result.error || "Erro ao excluir")
                setDeleteModal((prev) => ({ ...prev, isDeleting: false }))
            }
        } catch {
            error("Erro ao processar exclusão")
            setDeleteModal((prev) => ({ ...prev, isDeleting: false }))
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
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
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                Cadastros financeiros
                            </h1>
                        </div>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Categorias, subcategorias e contas (caixa, bancos e carteiras digitais).
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button onClick={handleAdd} className="w-full">
                            <PlusIcon className="w-[18px] h-[18px]" strokeWidth={3} />
                            Novo Cadastro
                        </Button>
                    </div>
                </div>

                <FinancialCadastrosPageControls
                    activeTab={activeTab}
                    setActiveTab={(tab) => {
                        setActiveTab(tab)
                        setPage(1)
                    }}
                    search={search}
                    onSearchChange={setSearch}
                    onAdd={handleAdd}
                />

                <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-0 px-4 md:px-8">
                    <AnimatePresence mode="wait">
                        {filteredItems.length === 0 ? (
                            <motion.div
                                key={`empty-${activeTab}`}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.4, ease: "easeOut" }}
                                className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full"
                            >
                                <IconPlaceholder
                                    placeholderType="image"
                                    title="Nenhum item encontrado"
                                    subtitle="Ajuste os filtros ou adicione um novo cadastro."
                                    imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                />
                            </motion.div>
                        ) : activeTab === "accounts" ? (
                            <motion.div
                                key="grid-accounts"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-8"
                            >
                                {(paginatedItems as FinanceAccountRow[]).map((item) => (
                                    <FinancialAccountCard
                                        key={item.id}
                                        item={item}
                                        onEdit={() => handleEditAccount(item)}
                                        onDelete={() => handleDeleteAccount(item)}
                                    />
                                ))}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="grid-categories"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-8"
                            >
                                {(paginatedItems as (typeof categories)[0][]).map((item) => (
                                    <FinancialCategoryCard
                                        key={item.id}
                                        item={item}
                                        type={activeTab}
                                        categories={categories}
                                        onEdit={() => handleEditCategory(item)}
                                        onDelete={() => handleDeleteCategory(item)}
                                    />
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {paginatedItems.length > 0 && (
                    <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
                )}
            </div>

            <DefaultModal
                isOpen={modal.isOpen}
                onClose={() => setModal((prev) => ({ ...prev, isOpen: false }))}
                title={modal.mode === "add" ? "Novo Cadastro" : "Editar Cadastro"}
                footer={
                    <div className="flex justify-end gap-3 w-full">
                        <Button variant="outline" onClick={() => setModal((prev) => ({ ...prev, isOpen: false }))}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSaveCategory} isLoading={modal.isSaving}>
                            Salvar
                        </Button>
                    </div>
                }
            >
                <div className="flex flex-col gap-4 p-4">
                    <Combobox
                        label="Tipo de Cadastro"
                        options={[
                            { value: "category", label: "Categoria" },
                            { value: "subcategory", label: "Subcategoria" },
                        ]}
                        value={modal.type}
                        onChange={(val: string) =>
                            setModal((prev) => ({
                                ...prev,
                                type: val as "category" | "subcategory",
                                item: { ...prev.item, parentId: null },
                            }))
                        }
                        disabled={modal.mode === "edit"}
                    />

                    <Input
                        label="Nome"
                        placeholder="Ex: Aluguel, Marketing, Despesas fixas, Energia"
                        value={modal.item.name}
                        onChange={(e) => {
                            setModal((prev) => ({ ...prev, item: { ...prev.item, name: e.target.value } }))
                            setNameError(false)
                        }}
                        onKeyDown={(e) => e.key === "Enter" && handleSaveCategory()}
                        error={nameError}
                        errorMessage={nameError ? "O nome é obrigatório" : undefined}
                    />

                    {modal.type === "subcategory" && (
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                Categoria Pai
                            </label>
                            <Combobox
                                placeholder="Selecione a categoria pai..."
                                options={categories
                                    .filter((c) => !c.parent_id)
                                    .map((c) => ({ value: c.id, label: c.name }))}
                                value={modal.item.parentId ?? undefined}
                                onChange={(val: string) =>
                                    setModal((prev) => ({ ...prev, item: { ...prev.item, parentId: val || null } }))
                                }
                            />
                        </div>
                    )}

                    <Checkbox
                        id="financial_is_active"
                        label="Cadastro Ativo"
                        checked={modal.item.is_active}
                        onChange={(checked) =>
                            setModal((prev) => ({ ...prev, item: { ...prev.item, is_active: checked } }))
                        }
                        className="mt-2"
                    />
                </div>
            </DefaultModal>

            <DefaultModal
                isOpen={accountModal.isOpen}
                onClose={() => setAccountModal((prev) => ({ ...prev, isOpen: false }))}
                title={accountModal.mode === "add" ? "Nova conta" : "Editar conta"}
                footer={
                    <div className="flex justify-end gap-3 w-full">
                        <Button
                            variant="outline"
                            onClick={() => setAccountModal((prev) => ({ ...prev, isOpen: false }))}
                        >
                            Cancelar
                        </Button>
                        <Button onClick={handleSaveAccount} isLoading={accountModal.isSaving}>
                            Salvar
                        </Button>
                    </div>
                }
            >
                <div className="flex flex-col gap-4 p-4">
                    <Input
                        label="Nome"
                        placeholder="Ex: Caixa loja, Nubank, Banco Itaú"
                        value={accountModal.item.name}
                        onChange={(e) => {
                            setAccountModal((prev) => ({
                                ...prev,
                                item: { ...prev.item, name: e.target.value },
                            }))
                            setAccountNameError(false)
                        }}
                        error={accountNameError}
                        errorMessage={accountNameError ? "O nome é obrigatório" : undefined}
                    />

                    <Combobox
                        label="Tipo"
                        options={ACCOUNT_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                        value={accountModal.item.type}
                        onChange={(val: string) =>
                            setAccountModal((prev) => ({
                                ...prev,
                                item: { ...prev.item, type: val as FinanceAccountType },
                            }))
                        }
                    />

                    <FormTextarea
                        name="finance_account_description"
                        label="Descrição (opcional)"
                        value={accountModal.item.description}
                        onChange={(e) =>
                            setAccountModal((prev) => ({
                                ...prev,
                                item: { ...prev.item, description: e.target.value },
                            }))
                        }
                        rows={3}
                    />

                    <Input
                        label="Saldo inicial"
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={accountModal.item.initialBalanceStr}
                        onChange={(e) =>
                            setAccountModal((prev) => ({
                                ...prev,
                                item: { ...prev.item, initialBalanceStr: e.target.value },
                            }))
                        }
                    />

                    <Input
                        label="Saldo atual (opcional)"
                        type="text"
                        inputMode="decimal"
                        placeholder="Deixe vazio se não quiser informar"
                        value={accountModal.item.currentBalanceStr}
                        onChange={(e) =>
                            setAccountModal((prev) => ({
                                ...prev,
                                item: { ...prev.item, currentBalanceStr: e.target.value },
                            }))
                        }
                    />

                    <Checkbox
                        id="finance_account_is_active"
                        label="Cadastro Ativo"
                        checked={accountModal.item.is_active}
                        onChange={(checked) =>
                            setAccountModal((prev) => ({
                                ...prev,
                                item: { ...prev.item, is_active: checked },
                            }))
                        }
                        className="mt-2"
                    />
                </div>
            </DefaultModal>

            <AlertModal
                isOpen={deleteModal.isOpen}
                onClose={() => setDeleteModal({ isOpen: false, item: null, isDeleting: false })}
                onConfirm={confirmDelete}
                title="Excluir Item"
                description={`Tem certeza que deseja excluir "${deleteModal.item?.name}"? Esta ação não pode ser desfeita.`}
                isDestructive
                isLoading={deleteModal.isDeleting}
            />
        </motion.div>
    )
}
