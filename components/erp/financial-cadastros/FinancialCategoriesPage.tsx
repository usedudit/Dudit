"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useDebouncedRefresh } from "@/hooks/use-debounced-refresh"
import { motion, AnimatePresence } from "framer-motion"
import { useNotification } from "@/hooks/use-notification"
import { PlusIcon } from "@/lib/icons"
import { Button, IconPlaceholder, Combobox, Input, Checkbox, FormDropdown, MoneyInput } from "@/components/reusable"
import DefaultModal from "@/components/reusable/DefaultModal"
import AlertModal from "@/components/reusable/AlertModal"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"
import Pagination from "@/components/reusable/Pagination"

import FinancialCategoryCard from "./FinancialCategoryCard"
import FinancialAccountCard, { type FinanceAccountRow } from "./FinancialAccountCard"
import FinancialContactCard from "./FinancialContactCard"
import FinancialCadastrosPageControls, { type FinancialCadastrosTab } from "./FinancialCadastrosPageControls"

import {
    createFinancialCategoryAction,
    updateFinancialCategoryAction,
    deleteFinancialCategoryAction,
    getFinancialCategoriesAction,
    type DreGroupType,
} from "@/app/actions/erp/financial-category-metadata"
import {
    createFinanceAccountAction,
    updateFinanceAccountAction,
    deleteFinanceAccountAction,
    getFinanceAccountsAction,
} from "@/app/actions/erp/finance-accounts"
import { type FinanceAccountType } from "@/lib/finance-utils"
import {
    listAllTransactionContactsAction,
    createTransactionContactAction,
    updateTransactionContactAction,
    deleteTransactionContactAction,
    type TransactionContactRow,
} from "@/app/actions/erp/transaction-contacts"
import { adjustAccountBalanceViaTransactionAction } from "@/app/actions/erp/transactions"
import { formatCurrency } from "@/lib/utils"
import { FadeIn } from "@/components/animations/FadeIn"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"

interface FinancialCategoriesPageProps {
    initialCategories: {
        id: string
        name: string
        parent_id: string | null
        category_type?: "income" | "expense" | null
        dre_group?: DreGroupType | null
        is_active: boolean
        created_at: string
    }[]
    initialAccounts: FinanceAccountRow[]
    partnerId: string
    planGate?: { requiredPlanSlug: "crescer" | "escalar"; message: string }
}

const DRE_GROUP_OPTIONS: { value: DreGroupType; label: string }[] = [
    { value: "receita_bruta", label: "Receita Operacional Bruta" },
    { value: "deducao_receita", label: "Dedução da Receita (Taxas / Devoluções / Impostos)" },
    { value: "custo_direto_cmv", label: "Custos Diretos (CMV / Insumos / Peças)" },
    { value: "despesa_comercial", label: "Despesas com Vendas / Comercial" },
    { value: "despesa_administrativa", label: "Despesas Administrativas e Gerais" },
    { value: "pro_labore", label: "Pró-Labore e Retiradas de Sócios" },
    { value: "despesa_financeira", label: "Despesas Financeiras (Juros / Tarifas)" },
    { value: "receita_financeira", label: "Receitas Financeiras (Rendimentos / Juros)" },
    { value: "nao_operacional", label: "Não Operacional / Extraordinário" },
]

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

function accountCurrentNum(item: FinanceAccountRow): number {
    const v = item.current_balance
    if (v === null || v === undefined) return 0
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

function normalizeName(value: string) {
    return value.trim().replace(/\s+/g, " ").toLowerCase()
}

type FinContactModalType = "service" | "partner" | "other"

export default function FinancialCategoriesPage({
    initialCategories,
    initialAccounts,
    partnerId,
    planGate,
}: FinancialCategoriesPageProps) {
    const { success, error } = useNotification()
    const { openPlanUpgrade } = usePlanUpgrade()
    const router = useRouter()
    const debouncedRefresh = useDebouncedRefresh()

    const [categories, setCategories] = useState(initialCategories)
    const [accounts, setAccounts] = useState<FinanceAccountRow[]>(initialAccounts)
    const [activeTab, setActiveTab] = useState<FinancialCadastrosTab>("categories")
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
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
            categoryType: "income" | "expense"
            dreGroup?: DreGroupType | null
        }
        isSaving: boolean
    }>({
        isOpen: false,
        mode: "add",
        type: "category",
        item: { name: "", is_active: true, parentId: null, categoryType: "income", dreGroup: "receita_bruta" },
        isSaving: false,
    })

    const [accountModal, setAccountModal] = useState<{
        isOpen: boolean
        mode: "add" | "edit"
        item: {
            id?: string
            name: string
            type: FinanceAccountType
            initialBalanceStr: string
            is_active: boolean
            is_default: boolean
        }
        isSaving: boolean
    }>({
        isOpen: false,
        mode: "add",
        item: {
            name: "",
            type: "cash",
            initialBalanceStr: "0",
            is_active: true,
            is_default: false,
        },
        isSaving: false,
    })

    const [contacts, setContacts] = useState<TransactionContactRow[]>([])

    const [contactModal, setContactModal] = useState<{
        isOpen: boolean
        mode: "add" | "edit"
        id: string | null
        type: FinContactModalType
        name: string
        saving: boolean
    }>({
        isOpen: false,
        mode: "add",
        id: null,
        type: "service",
        name: "",
        saving: false,
    })

    const [deleteContactModal, setDeleteContactModal] = useState<{
        isOpen: boolean
        contact: Pick<TransactionContactRow, "id" | "name"> | null
        deleting: boolean
    }>({ isOpen: false, contact: null, deleting: false })

    const [adjustBalanceModal, setAdjustBalanceModal] = useState<{
        open: boolean
        account: FinanceAccountRow | null
        newBalance: number
        saving: boolean
    }>({ open: false, account: null, newBalance: 0, saving: false })

    const [deleteModal, setDeleteModal] = useState<{
        isOpen: boolean
        item: { id: string; name: string; kind: "category" | "account" } | null
        isDeleting: boolean
    }>({ isOpen: false, item: null, isDeleting: false })

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search)
        }, 300)
        return () => clearTimeout(timer)
    }, [search])

    const [nameError, setNameError] = useState(false)
    const [accountNameError, setAccountNameError] = useState(false)
    const isProcessing =
        modal.isSaving ||
        accountModal.isSaving ||
        contactModal.saving ||
        adjustBalanceModal.saving ||
        deleteModal.isDeleting

    const refreshData = useCallback(async () => {
        const [catsRes, accRes] = await Promise.all([
            getFinancialCategoriesAction(partnerId),
            getFinanceAccountsAction(partnerId),
        ])
        if (catsRes.success && catsRes.data) setCategories(catsRes.data.categories)
        if (accRes.success && accRes.data) setAccounts(accRes.data.accounts as FinanceAccountRow[])
    }, [partnerId])

    useEffect(() => {
        if (activeTab !== "contacts") return
            ; (async () => {
                const res = await listAllTransactionContactsAction(partnerId)
                if (res.success) setContacts(res.data)
            })()
    }, [activeTab, partnerId])

    const tabCategoryItems = useMemo(() => {
        return activeTab === "categories"
            ? categories.filter((c) => !c.parent_id)
            : categories.filter((c) => c.parent_id)
    }, [activeTab, categories])

    const filteredCategoryItems = useMemo(() => {
        return tabCategoryItems.filter((item) => item.name.toLowerCase().includes(debouncedSearch.toLowerCase()))
    }, [tabCategoryItems, debouncedSearch])

    const filteredAccounts = useMemo(() => {
        const q = debouncedSearch.toLowerCase()
        return accounts.filter((a) => {
            const typeLabel = ACCOUNT_TYPE_OPTIONS.find((o) => o.value === a.type)?.label ?? a.type
            return (
                a.name.toLowerCase().includes(q) ||
                typeLabel.toLowerCase().includes(q)
            )
        })
    }, [accounts, debouncedSearch])

    const filteredContacts = useMemo(() => {
        const q = debouncedSearch.toLowerCase()
        return contacts.filter(
            (c) =>
                c.name.toLowerCase().includes(q) ||
                c.type.toLowerCase().includes(q) ||
                (c.description && c.description.toLowerCase().includes(q)),
        )
    }, [contacts, debouncedSearch])

    const filteredItems =
        activeTab === "accounts"
            ? filteredAccounts
            : activeTab === "contacts"
                ? filteredContacts
                : filteredCategoryItems

    const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE)
    const paginatedItems = filteredItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

    const handleAdd = () => {
        if (activeTab === "contacts") {
            setContactModal({
                isOpen: true,
                mode: "add",
                id: null,
                type: "service",
                name: "",
                saving: false,
            })
            return
        }
        if (activeTab === "accounts") {
            setAccountModal({
                isOpen: true,
                mode: "add",
                item: {
                    name: "",
                    type: "cash",
                    initialBalanceStr: "0",
                    is_active: true,
                    is_default: !accounts.some(
                        (acc) =>
                            acc.type === "cash" &&
                            (!acc.integration_source || acc.integration_source !== "mercadopago"),
                    ),
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
            item: { name: "", is_active: true, parentId: null, categoryType: "income", dreGroup: "receita_bruta" },
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
            item: {
                id: item.id,
                name: item.name,
                is_active: item.is_active,
                parentId: item.parent_id,
                categoryType: (item.category_type as "income" | "expense" | null) || "income",
                dreGroup: item.dre_group || null,
            },
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
                initialBalanceStr: String(item.initial_balance ?? "0"),
                is_active: item.is_active,
                is_default: Boolean(item.is_default),
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
        const categoryNameKey = normalizeName(item.name)
        const duplicatedCategory = categories.some((c) => {
            if (mode === "edit" && item.id && c.id === item.id) return false
            return normalizeName(c.name) === categoryNameKey
        })
        if (duplicatedCategory) {
            error("Já existe uma categoria/subcategoria com esse nome.")
            return
        }

        setModal((prev) => ({ ...prev, isSaving: true }))
        try {
            let result: { success: boolean; error?: string }
            if (mode === "add") {
                result = await createFinancialCategoryAction({
                    partnerId,
                    name: item.name,
                    parentId: type === "subcategory" ? item.parentId : null,
                    categoryType: type === "subcategory" ? undefined : item.categoryType,
                    dreGroup: item.dreGroup,
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
                    categoryType: type === "subcategory" ? undefined : item.categoryType,
                    dreGroup: item.dreGroup,
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
        const accountNameKey = normalizeName(item.name)
        const duplicatedAccount = accounts.some((a) => {
            if (mode === "edit" && item.id && a.id === item.id) return false
            return normalizeName(a.name) === accountNameKey
        })
        if (duplicatedAccount) {
            error("Já existe uma conta com esse nome.")
            return
        }

        const initialBal = parseMoneyInput(item.initialBalanceStr)

        setAccountModal((prev) => ({ ...prev, isSaving: true }))
        try {
            let result: { success: boolean; error?: string }
            if (mode === "add") {
                result = await createFinanceAccountAction({
                    partnerId,
                    name: item.name,
                    type: item.type,
                    initialBalance: initialBal,
                    isDefault: item.is_default,
                })
            } else {
                if (!item.id) {
                    setAccountModal((prev) => ({ ...prev, isSaving: false }))
                    return
                }
                result = await updateFinanceAccountAction(item.id, partnerId, {
                    name: item.name,
                    type: item.type,
                    initialBalance: initialBal,
                    isActive: item.is_active,
                    isDefault: item.is_default,
                })
            }

            if (result.success) {
                success("Cadastro salvo com sucesso!")
                refreshData()
                debouncedRefresh()
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

    const handleSaveContact = async () => {
        if (!contactModal.name.trim()) {
            error("O nome é obrigatório")
            return
        }
        const contactNameKey = normalizeName(contactModal.name)
        const duplicatedContact = contacts.some(
            (c) =>
                normalizeName(c.name) === contactNameKey &&
                c.type === contactModal.type &&
                c.id !== contactModal.id,
        )
        if (duplicatedContact) {
            error("Já existe um contato com esse nome para esse tipo.")
            return
        }
        setContactModal((prev) => ({ ...prev, saving: true }))
        try {
            let result
            if (contactModal.mode === "edit" && contactModal.id) {
                result = await updateTransactionContactAction({
                    partnerId,
                    id: contactModal.id,
                    name: contactModal.name.trim(),
                    type: contactModal.type,
                })
            } else {
                result = await createTransactionContactAction({
                    partnerId,
                    name: contactModal.name.trim(),
                    type: contactModal.type,
                })
            }
            if (result.success) {
                success(contactModal.mode === "edit" ? "Contato atualizado com sucesso!" : "Contato criado com sucesso!")
                setContactModal({
                    isOpen: false,
                    mode: "add",
                    id: null,
                    type: "service",
                    name: "",
                    saving: false,
                })
                const list = await listAllTransactionContactsAction(partnerId)
                if (list.success) setContacts(list.data)
            } else {
                error(result.error || "Erro ao salvar")
            }
        } catch {
            error("Erro ao processar solicitação")
        } finally {
            setContactModal((prev) => ({ ...prev, saving: false }))
        }
    }

    const confirmDeleteContact = async () => {
        const { contact } = deleteContactModal
        if (!contact) return

        setDeleteContactModal((prev) => ({ ...prev, deleting: true }))
        try {
            const result = await deleteTransactionContactAction(partnerId, contact.id)
            if (result.success) {
                success("Contato excluído com sucesso!")
                setDeleteContactModal({ isOpen: false, contact: null, deleting: false })
                const list = await listAllTransactionContactsAction(partnerId)
                if (list.success) setContacts(list.data)
            } else {
                error(result.error || "Erro ao excluir")
            }
        } catch {
            error("Erro ao processar solicitação")
        } finally {
            setDeleteContactModal((prev) => ({ ...prev, deleting: false }))
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
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                Cadastros financeiros
                            </h1>
                        </div>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Categorias, subcategorias, contas e contatos financeiros.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button onClick={handleAdd} disabled={!!planGate} className="w-full" leftIcon={<PlusIcon size={18} />}>
                            Novo cadastro
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
                    addDisabled={!!planGate}
                />

                <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-0 px-4 md:px-8">
                    <AnimatePresence mode="wait">
                        {filteredItems.length === 0 ? (
                            <FadeIn
                                key={`empty-${activeTab}`}
                                className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full"
                            >
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc={
                                        planGate
                                            ? "https://img.dudit.com.br/static/mascots/PlanoVender.png"
                                            : debouncedSearch.trim().length > 0
                                                ? "https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                                : "https://img.dudit.com.br/static/mascots/CadastrosFinanceiros.png"
                                    }
                                    title={planGate ? "Plano necessário" : (debouncedSearch.trim().length > 0 ? "Nenhum item encontrado" : "Nenhum cadastro realizado")}
                                    subtitle={
                                        planGate
                                            ? planGate.message
                                            : debouncedSearch.trim().length > 0
                                                ? "Ajuste os filtros ou tente outra busca."
                                                : "Adicione um novo cadastro financeiro para começar a organizar suas finanças."
                                    }
                                    itemButton={
                                        planGate ? {
                                            text: "Ver Plano Crescer",
                                            action: () => openPlanUpgrade("crescer"),
                                        } : undefined
                                    }
                                />
                            </FadeIn>
                        ) : activeTab === "accounts" ? (
                            <FadeIn
                                key="grid-accounts"
                                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-8"
                            >
                                {(paginatedItems as FinanceAccountRow[]).map((item) => (
                                    <FinancialAccountCard
                                        key={item.id}
                                        item={item}
                                        onEdit={() => handleEditAccount(item)}
                                        onDelete={() => handleDeleteAccount(item)}
                                        onAdjustBalance={() =>
                                            setAdjustBalanceModal({
                                                open: true,
                                                account: item,
                                                newBalance: accountCurrentNum(item),
                                                saving: false,
                                            })
                                        }
                                    />
                                ))}
                            </FadeIn>
                        ) : activeTab === "contacts" ? (
                            <FadeIn
                                key="grid-contacts"
                                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-8"
                            >
                                {(paginatedItems as TransactionContactRow[]).map((item) => (
                                    <FinancialContactCard
                                        key={item.id}
                                        item={item}
                                        onClick={() => { }}
                                        onEdit={() =>
                                            setContactModal({
                                                isOpen: true,
                                                mode: "edit",
                                                id: item.id,
                                                type: item.type as FinContactModalType,
                                                name: item.name,
                                                saving: false,
                                            })
                                        }
                                        onDelete={() => setDeleteContactModal({ isOpen: true, contact: { id: item.id, name: item.name }, deleting: false })}
                                    />
                                ))}
                            </FadeIn>
                        ) : (
                            <FadeIn
                                key="grid-categories"
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
                            </FadeIn>
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
                title={modal.mode === "add" ? "Novo cadastro" : "Editar cadastro"}
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
                                item: { ...prev.item, parentId: null, categoryType: "income" },
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
                        maxLength={150}
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

                    {modal.type === "category" && (
                        <>
                            <FormDropdown
                                label="Tipo da categoria"
                                options={[
                                    { value: "income", label: "Receita" },
                                    { value: "expense", label: "Despesa" },
                                ]}
                                value={modal.item.categoryType}
                                setValue={(v) =>
                                    setModal((prev) => ({
                                        ...prev,
                                        item: {
                                            ...prev.item,
                                            categoryType: v as "income" | "expense",
                                            dreGroup: v === "income" ? "receita_bruta" : "despesa_administrativa",
                                        },
                                    }))
                                }
                            />

                            <FormDropdown
                                label="Classificação no DRE"
                                options={DRE_GROUP_OPTIONS.filter((opt) =>
                                    modal.item.categoryType === "income"
                                        ? ["receita_bruta", "receita_financeira", "nao_operacional"].includes(opt.value)
                                        : [
                                              "deducao_receita",
                                              "custo_direto_cmv",
                                              "despesa_comercial",
                                              "despesa_administrativa",
                                              "pro_labore",
                                              "despesa_financeira",
                                              "nao_operacional",
                                          ].includes(opt.value),
                                )}
                                value={modal.item.dreGroup || (modal.item.categoryType === "income" ? "receita_bruta" : "despesa_administrativa")}
                                setValue={(v) =>
                                    setModal((prev) => ({
                                        ...prev,
                                        item: { ...prev.item, dreGroup: v as DreGroupType },
                                    }))
                                }
                            />
                        </>
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
                        maxLength={150}
                    />

                    <Combobox
                        label="Tipo"
                        options={ACCOUNT_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                        value={accountModal.item.type}
                        onChange={(val: string) => {
                            const nextType = val as FinanceAccountType
                            setAccountModal((prev) => ({
                                ...prev,
                                item: {
                                    ...prev.item,
                                    type: nextType,
                                    is_default:
                                        prev.mode === "add"
                                            ? !accounts.some(
                                                (acc) =>
                                                    acc.type === nextType &&
                                                    (!acc.integration_source || acc.integration_source !== "mercadopago"),
                                            )
                                            : prev.item.is_default,
                                },
                            }))
                        }}
                    />

                    <MoneyInput
                        label="Saldo inicial"
                        value={accountModal.item.initialBalanceStr}
                        onChange={(val) =>
                            setAccountModal((prev) => ({
                                ...prev,
                                item: { ...prev.item, initialBalanceStr: String(val) },
                            }))
                        }
                    />

                    {accountModal.mode === "edit" && accountModal.item.id ? (
                        <Input
                            label="Saldo atual"
                            readOnly
                            disabled
                            value={(() => {
                                const a = accounts.find((x) => x.id === accountModal.item.id)
                                return a ? formatCurrency(accountCurrentNum(a)) : "-"
                            })()}
                        />
                    ) : (
                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                            O saldo inicial aberto será registrado como transação de ajuste. Para alterar o saldo depois,
                            use &quot;Ajustar saldo&quot; no menu da conta.
                        </p>
                    )}

                    <Checkbox
                        id="finance_account_is_default"
                        label="Conta padrão deste tipo (caixa, banco ou carteira)"
                        checked={accountModal.item.is_default}
                        disabled={accountModal.item.id ? accounts.find((acc) => acc.id === accountModal.item.id)?.integration_source === "mercadopago" : false}
                        onChange={(checked) =>
                            setAccountModal((prev) => ({
                                ...prev,
                                item: { ...prev.item, is_default: checked },
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

            <DefaultModal
                isOpen={contactModal.isOpen}
                onClose={() =>
                    setContactModal({
                        isOpen: false,
                        mode: "add",
                        id: null,
                        type: "service",
                        name: "",
                        saving: false,
                    })
                }
                title={contactModal.mode === "edit" ? "Editar contato financeiro" : "Novo contato financeiro"}
                maxWidth="md"
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button
                            variant="outline"
                            onClick={() =>
                                setContactModal({
                                    isOpen: false,
                                    mode: "add",
                                    id: null,
                                    type: "service",
                                    name: "",
                                    saving: false,
                                })
                            }
                        >
                            Cancelar
                        </Button>
                        <Button onClick={handleSaveContact} isLoading={contactModal.saving}>
                            Salvar
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4 p-4">
                    <FormDropdown
                        label="Tipo do contato"
                        options={[
                            { value: "service", label: "Serviço" },
                            { value: "partner", label: "Parceiro" },
                            { value: "other", label: "Outro" },
                        ]}
                        value={contactModal.type}
                        setValue={(v) =>
                            setContactModal((prev) => ({ ...prev, type: v as FinContactModalType }))
                        }
                    />
                    <Input
                        label="Nome"
                        value={contactModal.name}
                        onChange={(e) => setContactModal((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Nome exibido nas transações"
                        maxLength={150}
                    />
                </div>
            </DefaultModal>

            <AlertModal
                isOpen={deleteContactModal.isOpen}
                onClose={() => setDeleteContactModal({ isOpen: false, contact: null, deleting: false })}
                onConfirm={confirmDeleteContact}
                title="Excluir contato?"
                message={`O contato "${deleteContactModal.contact?.name}" será excluído. Lançamentos financeiros anteriores continuarão com o nome registrado.`}
                confirmText="Excluir"
                isLoading={deleteContactModal.deleting}
            />

            <DefaultModal
                isOpen={adjustBalanceModal.open}
                onClose={() => setAdjustBalanceModal({ open: false, account: null, newBalance: 0, saving: false })}
                title="Ajustar saldo"
                maxWidth="md"
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button
                            variant="outline"
                            onClick={() =>
                                setAdjustBalanceModal({ open: false, account: null, newBalance: 0, saving: false })
                            }
                        >
                            Cancelar
                        </Button>
                        <Button
                            isLoading={adjustBalanceModal.saving}
                            onClick={async () => {
                                const acc = adjustBalanceModal.account
                                if (!acc) return
                                setAdjustBalanceModal((p) => ({ ...p, saving: true }))
                                try {
                                    const res = await adjustAccountBalanceViaTransactionAction({
                                        partnerId,
                                        accountId: acc.id,
                                        newBalance: adjustBalanceModal.newBalance,
                                        description: `Ajuste de saldo - ${acc.name}`,
                                    })
                                    if (!res.success) {
                                        error(res.error || "Erro ao ajustar saldo")
                                        return
                                    }
                                    success("Saldo atualizado.")
                                    setAdjustBalanceModal({ open: false, account: null, newBalance: 0, saving: false })
                                    await refreshData()
                                    debouncedRefresh()
                                } finally {
                                    setAdjustBalanceModal((p) => ({ ...p, saving: false }))
                                }
                            }}
                        >
                            Salvar
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4 p-4">
                    {adjustBalanceModal.account ? (
                        <>
                            <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                {adjustBalanceModal.account.name}
                            </p>
                            <Input
                                label="Saldo atual"
                                readOnly
                                disabled
                                value={formatCurrency(accountCurrentNum(adjustBalanceModal.account))}
                            />
                            <MoneyInput
                                label="Novo saldo"
                                value={adjustBalanceModal.newBalance}
                                onChange={(n) => setAdjustBalanceModal((p) => ({ ...p, newBalance: n }))}
                            />
                        </>
                    ) : null}
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

            <SavingStatusModal
                isOpen={isProcessing}
                text={deleteModal.isDeleting
                    ? "Excluindo cadastro financeiro..."
                    : adjustBalanceModal.saving
                        ? "Ajustando saldo..."
                        : contactModal.saving
                            ? "Salvando contato financeiro..."
                            : accountModal.isSaving
                                ? "Salvando conta financeira..."
                                : "Salvando categoria financeira..."}
            />
        </FadeIn>
    )
}
