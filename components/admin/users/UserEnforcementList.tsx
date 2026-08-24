"use client"

import { useState, useTransition, useMemo, useCallback } from "react"
import { Button, Badge, IconPlaceholder, Pagination, AlertModal } from "@/components/reusable"
import UserEnforcementListRow from "./UserEnforcementListRow"
import UserEnforcementPageControls from "./UserEnforcementPageControls"
import AdminUserDetailView from "./AdminUserDetailView"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { UserIcon, StoreIcon, ExportFileIcon } from "@/lib/icons"
import type { EnforcementUser, CursorPaginatedResult } from "@/lib/admin/types"
import { getUsers, banUser, unbanUser, getAdminUserStats, type AdminUserStats } from "@/app/actions/admin/enforcement"
import { useMediaQuery } from "@/components/erp/hooks"
import { formatDate } from "@/lib/utils"
import { toast } from "@/hooks/use-notification"
import { useEntityState } from "@/hooks/use-entity-state"

type SortKey = "name" | "email" | "store" | "date" | "status"
type SortDirection = "asc" | "desc"

interface UserEnforcementListProps {
    initialData: CursorPaginatedResult<EnforcementUser>
    initialStats?: AdminUserStats
}

const ITEMS_PER_PAGE = 8

export default function UserEnforcementList({ initialData, initialStats }: UserEnforcementListProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()

    const [statusTab, setStatusTab] = useState("all")
    const [isPending, startTransition] = useTransition()

    // Modals
    const [banTarget, setBanTarget] = useState<EnforcementUser | null>(null)
    const [unbanTarget, setUnbanTarget] = useState<EnforcementUser | null>(null)
    const [actionReason, setActionReason] = useState("")

    // Stats
    const [stats, setStats] = useState<AdminUserStats | undefined>(initialStats)

    // Search state
    const [search, setSearch] = useState("")

    // Sorting state
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
        key: "date",
        direction: "desc",
    })

    // Data State (initialized from SSR)
    const [users, setUsers] = useState<EnforcementUser[]>(initialData?.data || [])
    const [page, setPage] = useState(1)

    const handleSort = (key: SortKey) => {
        setSortConfig((prev) => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === "asc" ? "desc" : "asc" }
            }
            return { key, direction: "desc" }
        })
    }

    const refreshUsers = useCallback(() => {
        startTransition(async () => {
            try {
                const [res, statsRes] = await Promise.all([
                    getUsers(null, 100),
                    getAdminUserStats(),
                ])
                setUsers(res.data || [])
                setStats(statsRes)
            } catch (err) {
                console.error("Failed to refresh admin users:", err)
            }
        })
    }, [])

    const handleConfirmBan = () => {
        if (!banTarget) return
        startTransition(async () => {
            try {
                const res = await banUser(banTarget.user_id, actionReason || "Violação dos termos de uso")
                if (res.success) {
                    toast.success(`Usuário banido com sucesso! ${res.caseId ? `Protocolo: ${res.caseId}` : ""}`)
                    setBanTarget(null)
                    setActionReason("")
                    refreshUsers()
                } else {
                    toast.error(res.error || "Erro ao banir usuário")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    const handleConfirmUnban = () => {
        if (!unbanTarget) return
        startTransition(async () => {
            try {
                const res = await unbanUser(unbanTarget.user_id, actionReason || "Revisão administrativa")
                if (res.success) {
                    toast.success("Usuário desbanido com sucesso!")
                    setUnbanTarget(null)
                    setActionReason("")
                    refreshUsers()
                } else {
                    toast.error(res.error || "Erro ao desbanir usuário")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    // Instant in-memory filtering (0ms)
    const filteredUsers = useMemo(() => {
        const term = search.trim().toLowerCase()

        let result = users.filter((u) => {
            // Tab filter
            const isBanned = !!u.banned_at
            if (statusTab === "active" && isBanned) return false
            if (statusTab === "banned" && !isBanned) return false

            // Search filter
            if (term) {
                const name = String(u.full_name || "").toLowerCase()
                const email = String(u.email || "").toLowerCase()
                const store = String(u.partner?.store_name || "").toLowerCase()
                const id = String(u.user_id || "").toLowerCase()

                if (!name.includes(term) && !email.includes(term) && !store.includes(term) && !id.includes(term)) {
                    return false
                }
            }

            return true
        })

        // In-memory sorting
        if (sortConfig) {
            result = [...result].sort((a, b) => {
                let aVal: any = ""
                let bVal: any = ""
                switch (sortConfig.key) {
                    case "name":
                        aVal = (a.full_name || "").toLowerCase()
                        bVal = (b.full_name || "").toLowerCase()
                        break
                    case "email":
                        aVal = (a.email || "").toLowerCase()
                        bVal = (b.email || "").toLowerCase()
                        break
                    case "store":
                        aVal = (a.partner?.store_name || "").toLowerCase()
                        bVal = (b.partner?.store_name || "").toLowerCase()
                        break
                    case "date":
                        aVal = new Date(a.created_at).getTime()
                        bVal = new Date(b.created_at).getTime()
                        break
                    case "status":
                        aVal = a.banned_at ? "banned" : "active"
                        bVal = b.banned_at ? "banned" : "active"
                        break
                }
                if (aVal === bVal) return 0
                const cmp = aVal < bVal ? -1 : 1
                return sortConfig.direction === "asc" ? cmp : -cmp
            })
        }

        return result
    }, [users, statusTab, search, sortConfig])

    // Pagination (Strict 8 items)
    const totalPages = Math.max(1, Math.ceil(filteredUsers.length / ITEMS_PER_PAGE))
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return filteredUsers.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredUsers, page])

    // Reset to page 1 on filter/tab/search change
    useMemo(() => {
        setPage(1)
    }, [statusTab, search])

    // If viewing detail of a specific user via URL (?view=id)
    if (entityState.isOpen && entityState.action === "view" && entityState.entityId) {
        return (
            <AdminUserDetailView
                userId={entityState.entityId}
                onBack={closeEntity}
                onUserUpdated={refreshUsers}
            />
        )
    }

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
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
                {/* Desktop Header */}
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            Usuários & Moderação
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Gerencie contas de compradores, histórico de infrações, banimentos e permissões.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            onClick={() => toast.success("Exportação iniciada em segundo plano")}
                            leftIcon={<ExportFileIcon size={18} />}
                        >
                            Exportar
                        </Button>
                    </div>
                </div>

                {/* Page Controls */}
                <UserEnforcementPageControls
                    statusTab={statusTab}
                    setStatusTab={setStatusTab}
                    search={search}
                    setSearch={setSearch}
                    tabCounts={stats}
                />

                {/* List Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 md:pb-6 relative">
                    <AnimatePresence mode="wait">
                        {paginatedItems.length === 0 ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/SemPedidos.png"
                                    imageAlt="Nenhum usuário"
                                    title="Nenhum usuário encontrado"
                                    subtitle={search || statusTab !== "all" ? "Tente ajustar seus filtros de busca." : "Nenhum usuário cadastrado nesta categoria."}
                                    itemButton={search || statusTab !== "all" ? {
                                        text: "Limpar Filtros",
                                        action: () => {
                                            setSearch("")
                                            setStatusTab("all")
                                        },
                                        variant: "outline",
                                    } : undefined}
                                />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full space-y-4">
                                {/* Mobile View (Cards) */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((user) => {
                                        const isBanned = !!user.banned_at
                                        const storesCount = user.stores_count || user.partner?.stores_count || (user.partner ? 1 : 0)
                                        return (
                                            <div
                                                key={user.user_id}
                                                className="py-4 flex flex-col gap-2.5 cursor-pointer active:bg-brand-gray/50 dark:active:bg-dark-border/20 transition-colors"
                                                onClick={() => openEntity("view", user.user_id)}
                                            >
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="flex flex-col gap-0.5 min-w-0">
                                                        <span className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                            {user.full_name || "Usuário"}
                                                        </span>
                                                        <span className="text-xs text-brand-inactive-text truncate">
                                                            {user.email || user.user_id}
                                                        </span>
                                                    </div>
                                                    <Badge variant={isBanned ? "red" : "green"}>
                                                        {isBanned ? "Banido" : "Ativo"}
                                                    </Badge>
                                                </div>

                                                <div className="flex items-center justify-between text-xs text-brand-inactive-text">
                                                    <span>
                                                        {storesCount > 0 ? (storesCount === 1 ? "1 loja vinculada" : `${storesCount} lojas vinculadas`) : "Nenhuma loja"}
                                                    </span>
                                                    <span>{formatDate(user.created_at)}</span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Desktop View: Table */}
                                <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[900px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50 select-none">
                                                    <th
                                                        onClick={() => handleSort("name")}
                                                        className="py-3 px-2 pl-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Usuário {sortConfig?.key === "name" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("store")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Lojas Vinculadas {sortConfig?.key === "store" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("date")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors text-center"
                                                    >
                                                        Cadastro {sortConfig?.key === "date" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("status")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors text-center"
                                                    >
                                                        Status {sortConfig?.key === "status" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th className="py-3 px-2 pr-6 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                        Ações
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedItems.map((user) => (
                                                    <UserEnforcementListRow
                                                        key={user.user_id}
                                                        user={user}
                                                        isPending={isPending}
                                                        onView={() => openEntity("view", user.user_id)}
                                                        onBan={() => setBanTarget(user)}
                                                        onUnban={() => setUnbanTarget(user)}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="pt-4">
                                        <Pagination
                                            currentPage={page}
                                            totalPages={totalPages}
                                            onPageChange={setPage}
                                        />
                                    </div>
                                )}
                            </FadeIn>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Modal: Banir Usuário */}
            <AlertModal
                isOpen={!!banTarget}
                onClose={() => {
                    setBanTarget(null)
                    setActionReason("")
                }}
                onConfirm={handleConfirmBan}
                title="Banir Usuário"
                description={`Tem certeza que deseja banir a conta de ${banTarget?.full_name || banTarget?.email}? O usuário perderá acesso imediato à plataforma.`}
                confirmText="Banir Conta"
                variant="danger"
            />

            {/* Modal: Desbanir Usuário */}
            <AlertModal
                isOpen={!!unbanTarget}
                onClose={() => {
                    setUnbanTarget(null)
                    setActionReason("")
                }}
                onConfirm={handleConfirmUnban}
                title="Desbanir Usuário"
                description={`Deseja restabelecer o acesso de ${unbanTarget?.full_name || unbanTarget?.email}? O usuário poderá voltar a comprar e acessar a plataforma.`}
                confirmText="Desbanir Conta"
                variant="success"
            />
        </FadeIn>
    )
}
