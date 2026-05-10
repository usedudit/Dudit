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
import { 
    SearchIcon, 
    CancelCircleIcon, 
    UserIcon, 
    ClockIcon, 
    AlertTriangleIcon, 
    CheckCircleIcon, 
    AlertCircleIcon,
    MailIcon,
    StoreIcon,
    ShieldIcon,
    InfoIcon
} from "@/lib/icons"
import type { EnforcementUser, CursorPaginatedResult } from "@/lib/admin/types"
import { getUsers, banUser, unbanUser } from "@/app/actions/admin/enforcement"
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
} from "@/components/ui/sheet"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
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
    const [detailUser, setDetailUser] = useState<EnforcementUser | null>(null)
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
                toast.success("Usuário banido com sucesso!")
                setBanTarget(null)
                setBanReason("")
                setBanDuration(7)
                setBanConfirmed(false)
                fetchAllUsers(debouncedSearch || undefined)
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
                fetchAllUsers(debouncedSearch || undefined)
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
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-20 md:pb-6 relative">
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
                            <FadeIn key="list" className="w-full">
                                {/* Mobile/Tablet View */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginated.map((user) => (
                                            <div 
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
                                                    <th className="py-3 px-2 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-wider text-left">Usuário</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-wider text-left">Loja</th>
                                                    <th className="py-3 px-2 w-40 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-wider text-center">Data</th>
                                                    <th className="py-3 px-2 w-32 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-wider text-center">Status</th>
                                                    <th className="py-3 px-2 w-24 pr-6 rounded-r-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-wider text-center">Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginated.map((user) => (
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

                                {/* Pagination (ERP Standard) */}
                                {totalPages > 1 && (
                                    <div className="mt-6">
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
                onBan={setBanTarget}
                onUnban={setUnbanTarget}
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
    onBan: (u: EnforcementUser) => void
    onUnban: (u: EnforcementUser) => void
}

function UserDetailsSheet({ user, isOpen, onClose, onBan, onUnban }: UserDetailsSheetProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")

    if (!user) return null

    const content = (
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar pb-32 md:pb-6">
                {/* Header Profile */}
                <div className="flex flex-col items-center text-center space-y-4">
                    <div className="w-20 h-20 rounded-full bg-brand-green/10 flex items-center justify-center border-2 border-brand-green/20">
                        <UserIcon size={40} className="text-brand-green" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-bold text-brand-dark dark:text-dark-heading leading-tight">
                            {user.full_name || "Sem nome"}
                        </h3>
                        <p className="text-sm font-medium text-brand-inactive-text opacity-70">UID: {user.user_id}</p>
                    </div>
                    {user.banned_at ? (
                        <Badge variant="red" className="px-4 py-1.5 text-xs">USUÁRIO BANIDO</Badge>
                    ) : (
                        <Badge variant="green" className="px-4 py-1.5 text-xs">USUÁRIO ATIVO</Badge>
                    )}
                </div>

                {/* Info Sections */}
                <div className="space-y-6">
                    {/* Contact Info */}
                    <div className="space-y-3">
                        <h4 className="text-[11px] font-bold text-brand-inactive-text uppercase tracking-widest">Informações de Contato</h4>
                        <div className="p-4 bg-brand-gray dark:bg-dark-border/30 rounded-2xl border border-brand-border dark:border-dark-border space-y-4">
                            <div className="flex items-center gap-3">
                                <MailIcon size={18} className="text-brand-inactive-text" />
                                <div className="flex flex-col">
                                    <span className="text-[11px] text-brand-inactive-text font-medium">Email</span>
                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{user.email}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 pt-4 border-t border-brand-border/50 dark:border-dark-border/50">
                                <ClockIcon size={18} className="text-brand-inactive-text" />
                                <div className="flex flex-col">
                                    <span className="text-[11px] text-brand-inactive-text font-medium">Membro desde</span>
                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{new Date(user.created_at).toLocaleDateString("pt-BR")}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Associated Partner */}
                    <div className="space-y-3">
                        <h4 className="text-[11px] font-bold text-brand-inactive-text uppercase tracking-widest">Loja / Parceiro Associado</h4>
                        {user.partner ? (
                            <div className="p-4 bg-brand-gray dark:bg-dark-border/30 rounded-2xl border border-brand-border dark:border-dark-border space-y-4">
                                <div className="flex items-center gap-3">
                                    <StoreIcon size={18} className="text-brand-inactive-text" />
                                    <div className="flex flex-col">
                                        <span className="text-[11px] text-brand-inactive-text font-medium">Nome da Loja</span>
                                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{user.partner.store_name}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 pt-4 border-t border-brand-border/50 dark:border-dark-border/50">
                                    <ShieldIcon size={18} className="text-brand-inactive-text" />
                                    <div className="flex flex-col">
                                        <span className="text-[11px] text-brand-inactive-text font-medium">Status da Loja</span>
                                        <Badge variant={user.partner.is_active ? "green" : "red"}>
                                            {user.partner.is_active ? "Ativa" : "Inativa"}
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 text-sm text-brand-inactive-text bg-brand-gray/50 dark:bg-dark-border/10 rounded-xl border border-dashed border-brand-border italic">
                                Este usuário não possui uma loja associada.
                            </div>
                        )}
                    </div>

                    {/* Ban History Details */}
                    {user.banned_at && (
                        <div className="space-y-3">
                            <h4 className="text-[11px] font-bold text-brand-red uppercase tracking-widest">Detalhes do Banimento</h4>
                            <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-2xl border border-red-100 dark:border-red-900/30 space-y-4">
                                <div className="flex flex-col">
                                    <span className="text-[11px] text-brand-red font-bold">MOTIVO</span>
                                    <p className="text-sm text-brand-dark dark:text-dark-heading italic mt-1">&ldquo;{user.banned_reason || "Sem motivo registrado"}&rdquo;</p>
                                </div>
                                <div className="flex justify-between items-center pt-4 border-t border-red-100 dark:border-red-900/20">
                                    <div className="flex flex-col">
                                        <span className="text-[11px] text-brand-red font-bold">DESDE</span>
                                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{new Date(user.banned_at).toLocaleDateString("pt-BR")}</span>
                                    </div>
                                    <div className="flex flex-col text-right">
                                        <span className="text-[11px] text-brand-red font-bold">ATÉ</span>
                                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                            {user.banned_until ? new Date(user.banned_until).toLocaleDateString("pt-BR") : "Permanente"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Sticky Actions */}
            <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border">
                {user.banned_at ? (
                    <Button 
                        variant="filled" 
                        className="w-full rounded-full h-12 text-[15px] font-bold bg-brand-green hover:bg-brand-green/90" 
                        onClick={() => onUnban(user)}
                    >
                        <CheckCircleIcon size={20} className="mr-2" /> Desbanir Usuário
                    </Button>
                ) : (
                    <Button 
                        variant="filled" 
                        className="w-full rounded-full h-12 text-[15px] font-bold bg-brand-red hover:bg-brand-red/90" 
                        onClick={() => onBan(user)}
                    >
                        <AlertTriangleIcon size={20} className="mr-2" /> Banir Usuário
                    </Button>
                )}
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
        <Sheet open={isOpen} onOpenChange={(v) => !v && onClose()}>
            <SheetContent className="p-0 sm:max-w-md border-0" side="right">
                {content}
            </SheetContent>
        </Sheet>
    )
}
