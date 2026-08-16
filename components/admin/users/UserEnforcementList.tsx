"use client"

import { useState, useTransition, useMemo, useEffect, useCallback } from "react"
import { Button, Badge, IconPlaceholder, ThreeDotsLoader, Pagination } from "@/components/reusable"
import UserEnforcementListRow from "./UserEnforcementListRow"
import UserEnforcementPageControls from "./UserEnforcementPageControls"
import AdminUserDetailView from "./AdminUserDetailView"
import DestructiveActionModal from "@/components/admin/DestructiveActionModal"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { UserIcon, StoreIcon, ExportFileIcon } from "@/lib/icons"
import type { EnforcementUser, CursorPaginatedResult } from "@/lib/admin/types"
import { getUsers, banUser, unbanUser, getAdminUserStats, type AdminUserStats } from "@/app/actions/admin/enforcement"
import { useMediaQuery } from "@/components/erp/hooks"
import { formatDate } from "@/lib/utils"
import { toast } from "@/hooks/use-notification"

interface UserEnforcementListProps {
    initialData: CursorPaginatedResult<EnforcementUser>
    initialStats?: AdminUserStats
}

const UserEnforcementList = ({ initialData, initialStats }: UserEnforcementListProps) => {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const [statusTab, setStatusTab] = useState("all")
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    // Modals
    const [banTarget, setBanTarget] = useState<EnforcementUser | null>(null)
    const [unbanTarget, setUnbanTarget] = useState<EnforcementUser | null>(null)

    // Stats
    const [stats, setStats] = useState<AdminUserStats | undefined>(initialStats)

    // Search state
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 300)
        return () => clearTimeout(t)
    }, [search])

    // Data State
    const [users, setUsers] = useState<EnforcementUser[]>(initialData.data || [])
    const [isLoading, setIsLoading] = useState(false)
    const [page, setPage] = useState(1)
    const itemsPerPage = 12

    const fetchUsers = useCallback(() => {
        setIsLoading(true)
        startTransition(async () => {
            try {
                const [res, statsRes] = await Promise.all([
                    getUsers(null, 100, debouncedSearch, statusTab === "all" ? undefined : statusTab),
                    getAdminUserStats(),
                ])
                setUsers(res.data || [])
                setStats(statsRes)
            } catch (err) {
                console.error("Failed to fetch admin users:", err)
                toast.error("Erro ao carregar usuários")
            } finally {
                setIsLoading(false)
            }
        })
    }, [statusTab, debouncedSearch])

    useEffect(() => {
        fetchUsers()
        setPage(1)
    }, [fetchUsers])

    const handleConfirmBan = (reason: string) => {
        if (!banTarget) return
        startTransition(async () => {
            try {
                const res = await banUser(banTarget.user_id, reason)
                if (res.success) {
                    toast.success("Usuário banido com sucesso!")
                    setBanTarget(null)
                    fetchUsers()
                } else {
                    toast.error(res.error || "Erro ao banir usuário")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    const handleConfirmUnban = (reason: string) => {
        if (!unbanTarget) return
        startTransition(async () => {
            try {
                const res = await unbanUser(unbanTarget.user_id, reason)
                if (res.success) {
                    toast.success("Usuário desbanido com sucesso!")
                    setUnbanTarget(null)
                    fetchUsers()
                } else {
                    toast.error(res.error || "Erro ao desbanir usuário")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    // Pagination
    const totalPages = Math.ceil(users.length / itemsPerPage)
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * itemsPerPage
        return users.slice(start, start + itemsPerPage)
    }, [users, page])

    // If viewing detail of a specific user
    if (selectedUserId) {
        return (
            <AdminUserDetailView
                userId={selectedUserId}
                onBack={() => setSelectedUserId(null)}
                onUserUpdated={fetchUsers}
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
                            Usuários
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Gerencie contas de consumidores e lojistas, permissões e punições.
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
                    search={search}
                    setSearch={setSearch}
                    statusTab={statusTab}
                    setStatusTab={setStatusTab}
                    tabCounts={stats}
                />

                {/* List Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 md:pb-6 relative">
                    <AnimatePresence mode="wait">
                        {paginatedItems.length === 0 && !isLoading ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/SemUsuarios.png"
                                    imageAlt="Nenhum usuário"
                                    title="Nenhum usuário encontrado"
                                    subtitle={search ? "Tente ajustar sua busca." : "Nenhum usuário cadastrado nesta categoria."}
                                    itemButton={search ? {
                                        text: "Limpar Busca",
                                        action: () => setSearch(""),
                                        variant: "outline"
                                    } : undefined}
                                />
                            </FadeIn>
                        ) : isLoading ? (
                            <FadeIn key="loading" className="flex items-center justify-center min-h-[400px]">
                                <ThreeDotsLoader />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full space-y-4">
                                {/* Mobile View (Cards) */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((user) => (
                                        <div
                                            key={user.user_id}
                                            className="py-4 flex flex-col gap-2.5 cursor-pointer active:bg-brand-gray/50 dark:active:bg-dark-border/20 transition-colors"
                                            onClick={() => setSelectedUserId(user.user_id)}
                                        >
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="flex flex-col gap-0.5 min-w-0">
                                                    <span className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                        {user.full_name || "Sem nome"}
                                                    </span>
                                                    <span className="text-xs text-brand-inactive-text truncate">
                                                        {user.email || user.user_id}
                                                    </span>
                                                </div>
                                                <Badge variant={user.banned_at ? "red" : "green"}>
                                                    {user.banned_at ? "Banido" : "Ativo"}
                                                </Badge>
                                            </div>

                                            <div className="flex items-center justify-between text-xs text-brand-inactive-text">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    {user.partner ? (
                                                        <>
                                                            <StoreIcon size={12} className="shrink-0" />
                                                            <span className="truncate">{user.partner.store_name || "Parceiro"}</span>
                                                        </>
                                                    ) : (
                                                        <span>Consumidor</span>
                                                    )}
                                                </div>
                                                <span>{formatDate(user.created_at)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Desktop View: Table */}
                                <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                    <th className="py-3 px-2 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">Usuário</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight">Loja / Parceiro</th>
                                                    <th className="py-3 px-2 w-32 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Cadastro</th>
                                                    <th className="py-3 px-2 w-28 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Status</th>
                                                    <th className="py-3 px-2 w-24 pr-6 rounded-r-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedItems.map((user) => (
                                                    <UserEnforcementListRow
                                                        key={user.user_id}
                                                        user={user}
                                                        isPending={isPending}
                                                        onBan={setBanTarget}
                                                        onUnban={setUnbanTarget}
                                                        onView={(u) => setSelectedUserId(u.user_id)}
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

            {/* Modals de Ação */}
            <DestructiveActionModal
                isOpen={!!banTarget}
                onClose={() => setBanTarget(null)}
                onConfirm={handleConfirmBan}
                title="Banir Usuário"
                description="O usuário perderá o acesso à plataforma e suas sessões ativas serão invalidadas."
                entityName={banTarget?.full_name || banTarget?.email || banTarget?.user_id || ""}
                consequences={[
                    "Invalidação de tokens de autenticação",
                    "Bloqueio de novos logins na plataforma",
                    "Registro obrigatório no Audit Log",
                ]}
                confirmText="Confirmar Banimento"
                isPending={isPending}
            />

            <DestructiveActionModal
                isOpen={!!unbanTarget}
                onClose={() => setUnbanTarget(null)}
                onConfirm={handleConfirmUnban}
                title="Revogar Banimento"
                description="O usuário recuperará o acesso e poderá efetuar login novamente."
                entityName={unbanTarget?.full_name || unbanTarget?.email || unbanTarget?.user_id || ""}
                consequences={[
                    "Desbloqueio imediato da conta",
                    "Registro obrigatório da justificativa no Audit Log",
                ]}
                confirmText="Confirmar Desbloqueio"
                isPending={isPending}
            />
        </FadeIn>
    )
}
export default UserEnforcementList

