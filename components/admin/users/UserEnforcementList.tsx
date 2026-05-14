"use client"

import { useState, useTransition, useRef, useCallback, useMemo, useEffect } from "react"
import { Button, Badge, Input, IconPlaceholder, ThreeDotsLoader } from "@/components/reusable"
import AlertModal from "@/components/reusable/AlertModal"
import DefaultModal from "@/components/reusable/DefaultModal"
import StepUpModal from "@/components/admin/StepUpModal"
import UserEnforcementListRow from "./UserEnforcementListRow"
import UserEnforcementPageControls from "./UserEnforcementPageControls"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { UserIcon, ClockIcon, AlertTriangleIcon, CheckCircleIcon, MailIcon, StoreIcon, ShieldIcon, XIcon } from "@/lib/icons"
import type { EnforcementUser, CursorPaginatedResult } from "@/lib/admin/types"
import { getUsers, banUser, unbanUser } from "@/app/actions/admin/enforcement"
import BottomSheet from "@/components/BottomSheet"
import Portal from "@/components/Portal"
import { useMediaQuery } from "@/components/erp/hooks"
import { useEntityPage } from "@/hooks/use-entity-page"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { toast } from "sonner"

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
    const isMobile = useMediaQuery("(max-width: 768px)")
    const observerTarget = useRef<HTMLDivElement>(null)
    const [statusTab, setStatusTab] = useState("all")
    const [banTarget, setBanTarget] = useState<EnforcementUser | null>(null)
    const [unbanTarget, setUnbanTarget] = useState<EnforcementUser | null>(null)
    const [banReason, setBanReason] = useState("")
    const [banDuration, setBanDuration] = useState<number | null>(7)
    const [banConfirmed, setBanConfirmed] = useState(false)
    const [showStepUp, setShowStepUp] = useState(false)
    const [detailUser, setDetailUser] = useState<EnforcementUser | null>(null)
    const [isPending, startTransition] = useTransition()

    // Search state
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 300)
        return () => clearTimeout(t)
    }, [search])

    // ─── Entity Page ──────────────────────────────────────────────────────────
    const entityPage = useEntityPage<EnforcementUser & { id: string }, any, string>({
        entityType: 'admin-users',
        partnerId: 'admin',
        queryKey: ['admin', 'users', statusTab, debouncedSearch],
        initialItems: (debouncedSearch === "" && statusTab === "all") ? initialData.data.map(u => ({ ...u, id: u.user_id })) : [],
        initialNextCursor: (debouncedSearch === "" && statusTab === "all") ? initialData.nextCursor : null,
        initialHasMore: (debouncedSearch === "" && statusTab === "all") ? initialData.hasMore : true,
        fetchPageFn: async ({ cursor }) => {
            const res = await getUsers(cursor, 40, debouncedSearch, statusTab)
            return {
                items: res.data.map(u => ({ ...u, id: u.user_id })),
                nextCursor: res.nextCursor,
                hasMore: res.hasMore
            }
        },
        dedupeKey: (u) => u.user_id || u.id,
        getDetailFn: async () => null,
    })

    const {
        items: rawUsers, hasNextPage, isFetchingNextPage, isListLoading, fetchNextPage, afterMutation
    } = entityPage

    // Pagination
    const [page, setPage] = useState(1)
    const itemsPerPage = 8
    const totalPages = Math.ceil(rawUsers.length / itemsPerPage)
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * itemsPerPage
        return rawUsers.slice(start, start + itemsPerPage)
    }, [rawUsers, page])

    // Reset page when filters change
    useMemo(() => { setPage(1) }, [debouncedSearch, statusTab])

    const handleBan = () => {
        if (!banTarget) return
        if (!banReason.trim() || banReason.trim().length < 5) return
        if (!banConfirmed) return
        setShowStepUp(true)
    }

    const handleBanWithToken = (token: string) => {
        if (!banTarget) return
        setShowStepUp(false)
        startTransition(async () => {
            const result = await banUser(banTarget.user_id, banReason, banDuration, token)
            if (result.success) {
                toast.success("Usuário banido com sucesso!")
                setBanTarget(null)
                setBanReason("")
                setBanDuration(7)
                setBanConfirmed(false)
                afterMutation(banTarget.user_id)
            } else {
                toast.error(result.error || "Erro ao banir usuário")
            }
        })
    }

    const handleUnban = () => {
        if (!unbanTarget) return
        startTransition(async () => {
            const result = await unbanUser(unbanTarget.user_id, "Desbanido pelo admin")
            if (result.success) {
                toast.success("Usuário desbanido com sucesso!")
                setUnbanTarget(null)
                afterMutation(unbanTarget.user_id)
            } else {
                toast.error(result.error || "Erro ao desbanir usuário")
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

                {/* List Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 md:pb-6 relative">
                    <AnimatePresence mode="wait">
                        {paginatedItems.length === 0 && !isListLoading ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[500px]">
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
                        ) : isListLoading ? (
                            <FadeIn key="loading" className="flex items-center justify-center min-h-[500px]">
                                <ThreeDotsLoader />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full">
                                {/* Mobile/Tablet View */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((user) => (
                                        <div
                                            key={user.user_id}
                                            className="py-5 flex flex-col gap-3 cursor-pointer"
                                            onClick={() => setDetailUser(user)}
                                        >
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-10 h-10 rounded-full bg-brand-green/10 dark:bg-brand-green/5 flex items-center justify-center shrink-0 border border-brand-green/20 dark:border-brand-green/10">
                                                        <span className="text-[13px] font-bold text-brand-green">
                                                            {user.full_name ? user.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : "?"}
                                                        </span>
                                                    </div>
                                                    <div className="min-w-0 flex flex-col">
                                                        <span className="font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                                                            {user.full_name || "Sem nome"}
                                                        </span>
                                                        <span className="text-xs font-medium text-brand-inactive-text">
                                                            {user.partner?.store_name}
                                                        </span>
                                                    </div>
                                                </div>
                                                {user.banned_at ? (
                                                    <Badge variant="red">Banido</Badge>
                                                ) : (
                                                    <Badge variant="green">Ativo</Badge>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2 mt-1">
                                                <div className="flex gap-2 flex-1 action-btn" onClick={e => e.stopPropagation()}>
                                                    {user.banned_at ? (
                                                        <Button variant="outline" size="sm" onClick={() => setUnbanTarget(user)} className="flex-1 text-xs h-9">Desbanir</Button>
                                                    ) : (
                                                        <Button variant="outline" size="sm" onClick={() => setBanTarget(user)} className="flex-1 text-xs h-9">Banir</Button>
                                                    )}
                                                </div>
                                                <span className="text-xs text-brand-inactive-text ml-auto">
                                                    {new Date(user.created_at).toLocaleDateString("pt-BR")}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Desktop Table View */}
                                <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                    <th className="py-3 px-3 text-[13px] rounded-l-lg font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-left cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors text-left">Usuário</th>
                                                    <th className="py-3 px-3 text-[13px] rounded-l-lg font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-left cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors text-left">Loja</th>
                                                    <th className="py-3 px-3 text-[13px] rounded-l-lg font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-left cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors text-center">Data</th>
                                                    <th className="py-3 px-3 text-[13px] rounded-l-lg font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-left cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors text-center">Status</th>
                                                    <th className="py-3 px-3 text-[13px] rounded-l-lg font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-left cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors text-center">Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedItems.map((user) => (
                                                    <UserEnforcementListRow
                                                        key={user.user_id}
                                                        user={user}
                                                        isPending={isPending}
                                                        onUnban={setUnbanTarget}
                                                        onBan={setBanTarget}
                                                        onView={setDetailUser}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </FadeIn>
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

            {/* Detail Sheet */}
            <UserDetailsSheet
                user={detailUser}
                isOpen={!!detailUser}
                onClose={() => setDetailUser(null)}
            />
        </FadeIn>
    )
}

export default UserEnforcementList

// ─── Detail Sheet Sub-component ──────────────────────────────────────────────

interface UserDetailsSheetProps {
    user: EnforcementUser | null
    isOpen: boolean
    onClose: () => void
}

function UserDetailsSheet({ user, isOpen, onClose }: UserDetailsSheetProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    if (!user) return null

    const content = (
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface">
            {/* Header */}
            <header className="border-b border-brand-border dark:border-dark-border p-6 flex justify-between items-center">
                <h2 className="text-xl font-bold dark:text-dark-heading">Detalhes do Usuário</h2>
                <Button variant="filled" onClick={onClose} size="icon">
                    <XIcon className="w-5 h-5" />
                </Button>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                {/* Header Info */}
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-brand-green/10 flex items-center justify-center border border-brand-green/20">
                        <span className="text-xl font-bold text-brand-green">
                            {user.full_name ? user.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : "?"}
                        </span>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading leading-tight">
                            {user.full_name || "Sem nome"}
                        </h3>
                        <p className="text-sm text-brand-inactive-text mt-1">{user.email}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    <div className="p-4 bg-brand-gray dark:bg-dark-border/30 rounded-2xl border border-brand-border dark:border-dark-border space-y-4">
                        <div className="flex items-start gap-3">
                            <ClockIcon className="w-5 h-5 text-brand-inactive-text mt-0.5" />
                            <div>
                                <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body block">Membro desde</span>
                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                    {new Date(user.created_at).toLocaleDateString("pt-BR", { day: '2-digit', month: 'long', year: 'numeric' })}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 pt-4 border-t border-brand-border/50 dark:border-dark-border/50">
                            <ShieldIcon className="w-5 h-5 text-brand-inactive-text mt-0.5" />
                            <div>
                                <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body block">Status Atual</span>
                                {user.banned_at ? (
                                    <div className="space-y-1">
                                        <Badge variant="red">Banido</Badge>
                                        <p className="text-xs text-red-600 font-medium mt-1">
                                            Motivo: {user.banned_reason || "Não informado"}
                                        </p>
                                        {user.banned_until && (
                                            <p className="text-[10px] text-brand-inactive-text">
                                                Expira em: {new Date(user.banned_until).toLocaleDateString("pt-BR")}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <Badge variant="green">Ativo</Badge>
                                )}
                            </div>
                        </div>

                        {user.partner && (
                            <div className="flex items-start gap-3 pt-4 border-t border-brand-border/50 dark:border-dark-border/50">
                                <StoreIcon className="w-5 h-5 text-brand-inactive-text mt-0.5" />
                                <div>
                                    <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body block">Loja Vinculada</span>
                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{user.partner.store_name}</span>
                                    <span className="text-[10px] text-brand-inactive-text block opacity-70">ID: {user.partner.id}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-3">
                    <h4 className="text-[13px] font-bold text-brand-inactive-text dark:text-dark-body">Identificação</h4>
                    <div className="bg-brand-gray dark:bg-dark-background border border-brand-border dark:border-dark-border rounded-xl p-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-brand-inactive-text font-medium">User ID</span>
                            <code className="text-xs font-bold text-brand-dark dark:text-dark-heading">{user.user_id}</code>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose}>
                {content}
            </BottomSheet>
        )
    }

    return (
        <Portal>
            <div
                className={`fixed inset-0 z-50 bg-black/50 transition-opacity ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
                onClick={onClose}
            >
                <div
                    className={`fixed right-4 top-4 bottom-4 w-96 overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {content}
                </div>
            </div>
        </Portal>
    )
}
