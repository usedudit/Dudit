"use client"

import React, { useState, useTransition, useCallback, useEffect } from "react"
import { Button, Badge, Input, Pagination } from "@/components/reusable"
import AlertModal from "@/components/reusable/AlertModal"
import DefaultModal from "@/components/reusable/DefaultModal"
import StepUpModal from "@/components/admin/StepUpModal"
import { SearchIcon, CancelCircleIcon, UserIcon, ClockIcon, AlertTriangleIcon, CheckCircleIcon, AlertCircleIcon } from "@/lib/icons"
import type { EnforcementUser, CursorPaginatedResult } from "@/lib/admin/types"
import { getUsers, banUser, unbanUser } from "@/app/actions/admin/enforcement"

// ─── Duration selector ──────────────────────────────────────────────────────

function DurationSelect({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
    return (
        <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-brand-dark dark:text-dark-body">Duração do ban</label>
            <select
                value={value === null ? "permanent" : String(value)}
                onChange={e => {
                    const val = e.target.value
                    onChange(val === "permanent" ? null : parseInt(val))
                }}
                className="w-full h-[42px] px-4 rounded-lg border border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border/30 text-sm text-brand-dark dark:text-dark-heading focus:outline-none focus:border-brand-dark dark:focus:border-dark-body focus:bg-white dark:focus:bg-dark-surface transition-colors"
            >
                <option value="1">1 dia</option>
                <option value="3">3 dias</option>
                <option value="7">7 dias</option>
                <option value="14">14 dias</option>
                <option value="30">30 dias</option>
                <option value="90">90 dias</option>
                <option value="permanent">Permanente</option>
            </select>
        </div>
    )
}

// ─── User Status Badge using reusable Badge ─────────────────────────────────

function UserStatusBadge({ user }: { user: EnforcementUser }) {
    if (user.banned_at) {
        const isPermanent = !user.banned_until
        const isExpired = user.banned_until && new Date(user.banned_until) < new Date()
        if (isExpired) {
            return <Badge variant="orange">Ban expirado</Badge>
        }
        return <Badge variant="red">{isPermanent ? "Banido" : "Banido (temporário)"}</Badge>
    }
    return <Badge variant="green">Ativo</Badge>
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface UserEnforcementListProps {
    initialData: CursorPaginatedResult<EnforcementUser>
}

const UserEnforcementList = ({ initialData }: UserEnforcementListProps) => {
    const [allUsers, setAllUsers] = useState<EnforcementUser[]>(initialData.data)
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [page, setPage] = useState(1)
    const [banTarget, setBanTarget] = useState<EnforcementUser | null>(null)
    const [unbanTarget, setUnbanTarget] = useState<EnforcementUser | null>(null)
    const [banReason, setBanReason] = useState("")
    const [banDuration, setBanDuration] = useState<number | null>(7)
    const [banConfirmed, setBanConfirmed] = useState(false)
    const [showStepUp, setShowStepUp] = useState(false)
    const [isPending, startTransition] = useTransition()

    const itemsPerPage = 20

    // Debounced search
    useEffect(() => {
        const timeout = setTimeout(() => setDebouncedSearch(search), 400)
        return () => clearTimeout(timeout)
    }, [search])

    // Fetch all users (no cursor-based, fetch large batch for client-side pagination)
    const fetchAllUsers = useCallback((searchTerm?: string) => {
        startTransition(async () => {
            const result = await getUsers(null, 200, searchTerm || undefined)
            setAllUsers(result.data)
            setPage(1)
        })
    }, [])

    useEffect(() => {
        fetchAllUsers(debouncedSearch || undefined)
    }, [debouncedSearch, fetchAllUsers])

    // Client-side pagination
    const totalPages = Math.ceil(allUsers.length / itemsPerPage)
    const paginated = allUsers.slice((page - 1) * itemsPerPage, page * itemsPerPage)

    const handleBan = () => {
        if (!banTarget) return
        if (!banReason.trim() || banReason.trim().length < 5) return
        if (!banConfirmed) return
        // Instead of banning directly, show step-up modal first
        setShowStepUp(true)
    }

    const handleBanWithToken = (token: string) => {
        if (!banTarget) return
        setShowStepUp(false)
        startTransition(async () => {
            const result = await banUser(banTarget.user_id, banReason, banDuration, token)
            if (result.success) {
                setBanTarget(null)
                setBanReason("")
                setBanDuration(7)
                setBanConfirmed(false)
                fetchAllUsers(debouncedSearch || undefined)
            }
        })
    }

    const handleUnban = () => {
        if (!unbanTarget) return
        startTransition(async () => {
            const result = await unbanUser(unbanTarget.user_id, "Desbanido pelo admin")
            if (result.success) {
                setUnbanTarget(null)
                fetchAllUsers(debouncedSearch || undefined)
            }
        })
    }

    return (
        <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
            {/* Search bar — matches ERP style */}
            <div className="flex items-center gap-3 mb-6 px-4 md:px-8">
                <div className="max-w-[220px]">
                    <Input
                        name="search"
                        placeholder="Buscar..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        prefix={
                            <SearchIcon
                                size={18}
                                className="text-brand-inactive-text shrink-0"
                            />
                        }
                    />
                </div>
            </div>

            {/* Users list */}
            <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-20 md:pb-0">
                {paginated.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[400px] text-center">
                        <UserIcon className="w-12 h-12 text-brand-inactive-text dark:text-dark-body mb-3" />
                        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-2">Nenhum usuário encontrado</h3>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px]">
                            {search ? "Tente ajustar sua busca." : "Nenhum usuário cadastrado no sistema."}
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Table header */}
                        <div className="hidden md:grid grid-cols-[1fr_120px_160px_100px] gap-4 py-3 px-6 bg-brand-gray dark:bg-dark-border/50 rounded-lg mb-1">
                            <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body">Usuário</span>
                            <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Status</span>
                            <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Criado em</span>
                            <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Ações</span>
                        </div>

                        {/* Users rows */}
                        {paginated.map((user) => (
                            <div
                                key={user.user_id}
                                className="grid grid-cols-1 md:grid-cols-[1fr_120px_160px_100px] gap-2 md:gap-4 items-center py-3 px-4 md:px-6 border-b border-brand-border dark:border-dark-border hover:bg-brand-gray/30 dark:hover:bg-dark-border/20 transition-colors"
                            >
                                {/* User info */}
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-full bg-brand-green/10 flex items-center justify-center shrink-0">
                                        <span className="text-sm font-bold text-brand-green">
                                            {user.full_name ? user.full_name.charAt(0).toUpperCase() : "?"}
                                        </span>
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-semibold text-brand-dark dark:text-dark-heading truncate">
                                            {user.full_name || "Sem nome"}
                                        </h3>
                                        {user.partner && (
                                            <span className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                Loja: {user.partner.store_name}
                                            </span>
                                        )}
                                        {user.banned_at && user.banned_reason && (
                                            <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1 mt-0.5">
                                                <AlertTriangleIcon className="w-3 h-3 shrink-0" />
                                                <span className="truncate">{user.banned_reason}</span>
                                                {user.banned_until && (
                                                    <span className="shrink-0 ml-1">(até {new Date(user.banned_until).toLocaleDateString("pt-BR")})</span>
                                                )}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Status */}
                                <div className="flex justify-center">
                                    <UserStatusBadge user={user} />
                                </div>

                                {/* Created at */}
                                <div className="flex items-center justify-center gap-1 text-xs text-brand-inactive-text dark:text-dark-body">
                                    <ClockIcon className="w-3 h-3" />
                                    {new Date(user.created_at).toLocaleDateString("pt-BR")}
                                </div>

                                {/* Actions */}
                                <div className="flex justify-center gap-2">
                                    {user.banned_at ? (
                                        <Button
                                            variant="outline"
                                            onClick={() => setUnbanTarget(user)}
                                            disabled={isPending}
                                            className="h-8 px-3 text-xs"
                                        >
                                            <CheckCircleIcon className="w-3.5 h-3.5 mr-1" />
                                            Desbanir
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            onClick={() => setBanTarget(user)}
                                            disabled={isPending}
                                            className="h-8 px-3 text-xs text-brand-red hover:text-brand-red"
                                        >
                                            <AlertCircleIcon className="w-3.5 h-3.5 mr-1" />
                                            Banir
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </>
                )}
            </div>

            {/* Pagination — reusable component same as ERP */}
            {totalPages > 1 && (
                <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
            )}

            {/* Ban Modal — uses DefaultModal with form */}
            <DefaultModal
                isOpen={!!banTarget}
                onClose={() => { setBanTarget(null); setBanReason(""); setBanDuration(7); setBanConfirmed(false) }}
                title="Banir usuário"
                maxWidth="md"
                footer={
                    <>
                        <Button variant="outline" onClick={() => { setBanTarget(null); setBanReason(""); setBanDuration(7); setBanConfirmed(false) }}>
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleBan}
                            disabled={!banConfirmed || !banReason.trim() || banReason.trim().length < 5 || isPending}
                        >
                            {isPending ? "Banindo..." : "Banir usuário"}
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col gap-4">
                    {banTarget && (
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                            Banir &quot;{banTarget.full_name}&quot; do sistema.
                        </p>
                    )}

                    <DurationSelect value={banDuration} onChange={setBanDuration} />

                    <Input
                        name="ban-reason"
                        label="Motivo"
                        placeholder="Motivo do ban (mínimo 5 caracteres)..."
                        value={banReason}
                        onChange={e => setBanReason(e.target.value)}
                        required
                        multiline
                        rows={3}
                    />

                    <label className="flex items-start gap-3 p-3 rounded-lg border border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10 cursor-pointer">
                        <input type="checkbox" checked={banConfirmed} onChange={e => setBanConfirmed(e.target.checked)} className="mt-1 w-4 h-4 text-red-600 rounded" />
                        <span className="text-sm text-red-800 dark:text-red-300 font-medium">
                            Confirmo que entendo as consequências desta ação
                        </span>
                    </label>
                </div>
            </DefaultModal>

            {/* Unban Modal — uses AlertModal */}
            <AlertModal
                isOpen={!!unbanTarget}
                onClose={() => setUnbanTarget(null)}
                onConfirm={handleUnban}
                title="Desbanir usuário"
                message={`Remover ban de "${unbanTarget?.full_name || ""}". O usuário poderá acessar o sistema novamente. Ação será registrada nos audit logs.`}
                confirmText="Desbanir"
                variant="warning"
            />

            {/* Step-Up Auth Modal */}
            <StepUpModal
                isOpen={showStepUp}
                onClose={() => setShowStepUp(false)}
                onAuthenticated={handleBanWithToken}
            />
        </div>
    )
}

export default UserEnforcementList
