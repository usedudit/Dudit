"use client"

import React, { useState, useTransition, useCallback, useEffect } from "react"
import { Button, Badge, Input, Pagination, IconPlaceholder } from "@/components/reusable"
import AlertModal from "@/components/reusable/AlertModal"
import DefaultModal from "@/components/reusable/DefaultModal"
import StepUpModal from "@/components/admin/StepUpModal"
import UserEnforcementListRow from "./UserEnforcementListRow"
import UserEnforcementPageControls from "./UserEnforcementPageControls"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
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


// ─── Main Component ─────────────────────────────────────────────────────────

interface UserEnforcementListProps {
    initialData: CursorPaginatedResult<EnforcementUser>
}

const UserEnforcementList = ({ initialData }: UserEnforcementListProps) => {
    const [allUsers, setAllUsers] = useState<EnforcementUser[]>(initialData.data)
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [page, setPage] = useState(1)
    const [statusTab, setStatusTab] = useState("all")
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

    // Filter by status
    const filteredByStatus = allUsers.filter(user => {
        if (statusTab === "active") return !user.banned_at
        if (statusTab === "banned") return !!user.banned_at
        return true
    })

    // Reset page when filter changes
    useEffect(() => {
        setPage(1)
    }, [statusTab])

    // Client-side pagination
    const totalPages = Math.ceil(filteredByStatus.length / itemsPerPage)
    const paginated = filteredByStatus.slice((page - 1) * itemsPerPage, page * itemsPerPage)

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
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
            <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">

                {/* Header Title/Subtitle (ERP Standard) */}
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            Controle de Usuários
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Monitore a atividade e gerencie bans de usuários em todo o ecossistema Dudit.
                        </p>
                    </div>
                </div>

                {/* Page Controls (Standardized) */}
                <UserEnforcementPageControls
                    search={search}
                    setSearch={setSearch}
                    statusTab={statusTab}
                    setStatusTab={setStatusTab}
                />

                {/* Users List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-20 md:pb-6">
                    <AnimatePresence mode="wait">
                        {paginated.length === 0 ? (
                            <FadeIn key="empty" className="w-full">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                    imageAlt="Nenhum usuário"
                                    title="Nenhum usuário encontrado"
                                    subtitle={search ? "Tente ajustar sua busca." : "Nenhum usuário cadastrado no sistema."}
                                    itemButton={search ? {
                                        text: "Limpar Busca",
                                        action: () => setSearch(""),
                                        variant: "outline"
                                    } : undefined}
                                />
                            </FadeIn>
                        ) : (
                            <div className="w-full">
                                {/* Table header (Desktop Only) */}
                                <div className="hidden md:grid grid-cols-[1fr_120px_160px_100px] gap-4 py-3 px-6 bg-brand-gray/50 dark:bg-dark-border/30 rounded-lg mb-2">
                                    <span className="text-[12px] font-bold text-brand-inactive-text uppercase tracking-wider">Usuário</span>
                                    <span className="text-[12px] font-bold text-brand-inactive-text uppercase tracking-wider text-center">Status</span>
                                    <span className="text-[12px] font-bold text-brand-inactive-text uppercase tracking-wider text-center">Data</span>
                                    <span className="text-[12px] font-bold text-brand-inactive-text uppercase tracking-wider text-center">Ações</span>
                                </div>

                                {/* List Rows */}
                                <div className="flex flex-col">
                                    {paginated.map((user) => (
                                        <UserEnforcementListRow
                                            key={user.user_id}
                                            user={user}
                                            isPending={isPending}
                                            onUnban={setUnbanTarget}
                                            onBan={setBanTarget}
                                        />
                                    ))}
                                </div>

                                {/* Pagination (ERP Standard) */}
                                {totalPages > 1 && (
                                    <div className="mt-6 flex justify-center">
                                        <Pagination
                                            currentPage={page}
                                            totalPages={totalPages}
                                            onPageChange={setPage}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>


            {/* Ban Modal - uses DefaultModal with form */}
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

            {/* Unban Modal - uses AlertModal */}
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
        </FadeIn>
    )
}

export default UserEnforcementList
