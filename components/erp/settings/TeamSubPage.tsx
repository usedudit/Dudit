"use client"

import React, { useState, useEffect, useTransition, useRef, useCallback } from "react"
import { Button, IconPlaceholder, InfoCard, Input, ThreeDotsLoader, Tabs, TabsList, TabsTrigger, TabsContent, Separator, ActionsDropdown, Badge, AlertModal, DropdownItem, ListItem, RadioButton, Checkbox, Dropdown, FormDropdown, SavingStatusModal } from "@/components/reusable"
import { MailIcon, CheckCircleIcon, ChevronLeftIcon, PlusIcon, CalendarIcon, UserIcon, MotorbikeIcon, ShieldIcon, CrownIcon, ManagerIcon, CopyIcon, ThreeDotsIcon, TrashIcon, StoreIcon, ChartIcon } from "@/lib/icons"
import DefaultModal from "@/components/reusable/DefaultModal"
import { getTeamMembers, getTeamMemberStatsAction, removeTeamMember, updateTeamMemberRole } from "@/app/actions/erp/team"
import type { TeamMember, TeamMemberStats } from "@/app/actions/erp/team"
import type { PartnerRole } from "@/lib/permissions/types"
import { FadeIn } from "@/components/animations/FadeIn"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { formatDate } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { useStore } from "@/lib/store-context"

const ROLE_LABELS: Record<PartnerRole, string> = {
    OWNER: "Proprietário",
    ADMIN: "Administrador",
    MANAGER: "Gestor",
    OPERATOR: "Operador",
    DELIVERY: "Entregador",
}
const ROLE_DESCRIPTIONS: Record<PartnerRole, string> = {
    OWNER: "Controle absoluto do sistema. Pode excluir loja, transferir propriedade e alterar assinatura.",
    ADMIN: "Acesso operacional completo, exceto plano/assinatura e integrações.",
    MANAGER: "Controla operação. Pode gerir equipe abaixo do próprio cargo.",
    OPERATOR: "Executa o dia a dia: pedidos, agenda e atendimento.",
    DELIVERY: "Atualiza entregas e acompanha rotas/pedidos atribuídos.",
}

const ROLE_ICONS: Record<PartnerRole, React.ReactNode> = {
    OWNER: <CrownIcon />,
    ADMIN: <ShieldIcon />,
    MANAGER: <ManagerIcon />,
    OPERATOR: <UserIcon />,
    DELIVERY: <MotorbikeIcon />,
}

const STORE_ROLE_OPTIONS = [
    { value: "OPERATOR", label: "Operador" },
    { value: "MANAGER", label: "Gestor" },
    { value: "ADMIN", label: "Administrador" },
    { value: "DELIVERY", label: "Entregador" },
]


const ROLE_HIERARCHY: Record<PartnerRole, number> = {
    OWNER: 5,
    ADMIN: 4,
    MANAGER: 3,
    OPERATOR: 2,
    DELIVERY: 1,
}

function canModifyUser(actorRole: PartnerRole, targetRole: PartnerRole): boolean {
    return ROLE_HIERARCHY[actorRole] > ROLE_HIERARCHY[targetRole]
}

function getAllowedInviteRoles(inviterRole: PartnerRole): PartnerRole[] {
    const all: PartnerRole[] = ["OWNER", "ADMIN", "MANAGER", "OPERATOR", "DELIVERY"]
    return all.filter((target) => {
        if (target === "OWNER") return false
        if (inviterRole === "OWNER") return true
        if (inviterRole === "ADMIN") return true
        if (inviterRole === "MANAGER") return target === "OPERATOR" || target === "DELIVERY"
        return false
    })
}

export const TeamSubPage = ({ partnerId, onBack, teamPlanBlocked = false }: { partnerId: string; onBack: () => void; teamPlanBlocked?: boolean }) => {
    const [showInviteModal, setShowInviteModal] = useState(false)
    const [inviteModalTab, setInviteModalTab] = useState<"dados_gerais" | "acesso_lojas">("dados_gerais")
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const handleBack = useCallback(() => onBack(), [onBack])

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const [inviteEmail, setInviteEmail] = useState("")
    const [inviteRole, setInviteRole] = useState<string>("OPERATOR")
    const [inviteSelectedStores, setInviteSelectedStores] = useState<string[]>([])
    const { stores: allStores, selectedStore } = useStore()
    const [isCreating, setIsCreating] = useState(false)
    const [inviteUrl, setInviteUrl] = useState<string | null>(null)
    const [inviteError, setInviteError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
    const [currentUserRole, setCurrentUserRole] = useState<PartnerRole | null>(null)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [invitations, setInvitations] = useState<any[]>([])
    const [isLoadingMembers, setIsLoadingMembers] = useState(true)
    const [errorMembers, setErrorMembers] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()
    const [activeTab, setActiveTab] = useState<"members" | "invites" | "store">("members")
    const [inviteFilter, setInviteFilter] = useState<"pending" | "accepted" | "all">("all")
    const [memberToDelete, setMemberToDelete] = useState<string | null>(null)
    const [inviteToDelete, setInviteToDelete] = useState<string | null>(null)
    const [inviteToShare, setInviteToShare] = useState<any | null>(null)
    const [showInviteLinkModal, setShowInviteLinkModal] = useState(false)
    const [inviteLinkCopied, setInviteLinkCopied] = useState(false)
    const { toast } = useToast()
    const [selectedMemberStats, setSelectedMemberStats] = useState<TeamMemberStats | null>(null)
    const [isLoadingStats, setIsLoadingStats] = useState(false)

    // Store access modal state (2 tabs: access / all)
    const [selectedStoreMember, setSelectedStoreMember] = useState<TeamMember | null>(null)
    const [modalStoreTab, setModalStoreTab] = useState<"access" | "all">("access")
    const [storeAccessState, setStoreAccessState] = useState<Record<string, { enabled: boolean; role: PartnerRole }>>({})
    const [isSavingStoreAccess, setIsSavingStoreAccess] = useState(false)
    const [isLoadingUserStores, setIsLoadingUserStores] = useState(false)

    const handleOpenStoreModal = async (member: TeamMember) => {
        setSelectedStoreMember(member)
        setModalStoreTab("access")
        setIsLoadingUserStores(true)
        try {
            const { listUserStoresAction } = await import("@/app/actions/erp/store-members")
            const userStores = await listUserStoresAction(member.id, partnerId)
            const initialState: Record<string, { enabled: boolean; role: PartnerRole }> = {}
            for (const store of allStores) {
                const existing = userStores.find((us) => us.store_id === store.id)
                initialState[store.id] = {
                    enabled: !!existing,
                    role: (existing?.role as PartnerRole) || member.role || "OPERATOR",
                }
            }
            setStoreAccessState(initialState)
        } catch {
            toast({ title: "Erro", description: "Erro ao carregar lojas do membro.", variant: "destructive" })
        } finally {
            setIsLoadingUserStores(false)
        }
    }

    const handleSaveStoreAccess = async () => {
        if (!selectedStoreMember) return
        setIsSavingStoreAccess(true)
        try {
            const { saveMemberStoreAccessAction } = await import("@/app/actions/erp/store-members")
            const storeAccesses = Object.entries(storeAccessState)
                .filter(([_, data]) => data.enabled)
                .map(([storeId, data]) => ({ storeId, role: data.role }))

            const res = await saveMemberStoreAccessAction({
                partnerUserId: selectedStoreMember.id,
                partnerId,
                storeAccesses,
            })

            if (res.success) {
                toast({ title: "Sucesso", description: "Acessos às lojas salvos com sucesso!", variant: "success" })
                setSelectedStoreMember(null)
                fetchMembers()
            } else {
                toast({ title: "Erro", description: res.error || "Erro ao salvar acessos.", variant: "destructive" })
            }
        } catch {
            toast({ title: "Erro", description: "Erro ao salvar acessos.", variant: "destructive" })
        } finally {
            setIsSavingStoreAccess(false)
        }
    }

    const fetchMembers = async () => {
        setIsLoadingMembers(true)
        setErrorMembers(null)

        const [{ members, currentUserRole: role, currentUserId: userId, error }, invitationsRes] = await Promise.all([
            getTeamMembers(),
            import("@/app/actions/invitations")
                .then((m) => m.listPartnerInvitations(partnerId))
                .catch(() => ({ success: false as const, invitations: [] as any[] })),
        ])

        if (error) {
            setErrorMembers(error)
        } else {
            setTeamMembers(members || [])
            setCurrentUserRole(role || null)
            setCurrentUserId(userId || null)
        }

        if (invitationsRes.success && invitationsRes.invitations) {
            setInvitations(invitationsRes.invitations)
        }

        setIsLoadingMembers(false)
    }

    useEffect(() => {
        fetchMembers()
    }, [])

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsCreating(true)
        setInviteError(null)
        setInviteUrl(null)

        const targetStores = inviteSelectedStores.length > 0
            ? inviteSelectedStores
            : selectedStore ? [selectedStore.id] : []

        try {
            const { createInvitation } = await import("@/app/actions/invitations")
            const result = await createInvitation({
                partnerId,
                email: inviteEmail,
                role: inviteRole as PartnerRole,
                storeIds: targetStores,
            })

            if (result.success && result.inviteUrl) {
                setInviteUrl(result.inviteUrl)
                fetchMembers()
            } else {
                setInviteError(result.error || "Erro ao criar convite")
            }
        } catch (err) {
            setInviteError("Erro inesperado ao criar convite")
        } finally {
            setIsCreating(false)
        }
    }

    const handleRemoveMember = async () => {
        if (!memberToDelete) return

        startTransition(async () => {
            const result = await removeTeamMember(memberToDelete)
            if (result.error) {
                toast({ title: "Erro", description: result.error, variant: "destructive" })
            } else {
                toast({ title: "Sucesso", description: "Membro removido da equipe.", variant: "success" })
                fetchMembers()
            }
            setMemberToDelete(null)
        })
    }

    const handleUpdateRole = async (userId: string, newRole: PartnerRole) => {
        startTransition(async () => {
            const result = await updateTeamMemberRole(userId, newRole)
            if (result.error) {
                toast({ title: "Erro", description: result.error, variant: "destructive" })
            } else {
                toast({ title: "Sucesso", description: "Função atualizada com sucesso.", variant: "success" })
                fetchMembers()
            }
        })
    }

    const handleRevokeInvitation = async () => {
        if (!inviteToDelete) return
        startTransition(async () => {
            try {
                const { revokeInvitation } = await import("@/app/actions/invitations")
                const result = await revokeInvitation({ invitationId: inviteToDelete, partnerId })
                if (result.success) {
                    toast({ title: "Sucesso", description: "Convite revogado com sucesso." })
                    fetchMembers()
                } else {
                    toast({ title: "Erro", description: result.error || "Erro ao revogar convite.", variant: "destructive" })
                }
            } catch (e) {
                toast({ title: "Erro", description: "Erro ao revogar convite.", variant: "destructive" })
            } finally {
                setInviteToDelete(null)
            }
        })
    }

    const handleShowInviteLink = (inv: any) => {
        setInviteToShare(inv)
        setInviteLinkCopied(false)
        setShowInviteLinkModal(true)
    }

    const copyInviteLinkToClipboard = () => {
        const link = inviteToShare?.share_url
        if (link) {
            navigator.clipboard.writeText(link)
            setInviteLinkCopied(true)
            setTimeout(() => setInviteLinkCopied(false), 2000)
        }
    }

    const handleShowMemberStats = useCallback(async (member: TeamMember) => {
        setIsLoadingStats(true)
        setSelectedMemberStats(null)
        const { stats } = await getTeamMemberStatsAction(member.id)
        if (stats && stats.length > 0) {
            setSelectedMemberStats(stats[0])
        } else {
            setSelectedMemberStats({
                partnerUserId: member.id,
                fullName: member.fullName,
                avatarUrl: member.avatarUrl,
                saleCount: 0,
                totalSalesValue: 0,
                totalCommissionValue: 0,
                lastSaleDate: null,
            })
        }
        setIsLoadingStats(false)
    }, [])

    const copyToClipboard = () => {
        if (inviteUrl) {
            navigator.clipboard.writeText(inviteUrl)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    const allowedInviteRoles = currentUserRole ? getAllowedInviteRoles(currentUserRole) : []

    return (
        <FadeIn className="h-full">
            <div className="flex flex-col h-full bg-white dark:bg-dark-background overflow-hidden">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto custom-scrollbar w-full relative pb-20 md:pb-0">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                {/* Back button - desktop only */}
                                <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                {/* Title row */}
                                <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span className="truncate">Equipe</span>
                                        </h1>

                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            Gerencie os membros da sua equipe e suas permissões de acesso.
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        {!teamPlanBlocked && (
                                            <Button leftIcon={<PlusIcon size={18} />} onClick={() => setShowInviteModal(true)}>
                                                Convidar membro
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="members">
                                            Equipe ({teamMembers.length})
                                        </TabsTrigger>
                                        <TabsTrigger value="invites">
                                            Convites ({invitations.filter(i => !i.used_at && !i.revoked_at).length})
                                        </TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        {/* Content Body */}
                        <div className="px-3 md:px-6 max-w-[1300px] mx-auto min-h-[400px]">
                            {isLoadingMembers ? (
                                <div className="flex justify-center p-12">
                                    <ThreeDotsLoader />
                                </div>
                            ) : errorMembers ? (
                                <InfoCard message={errorMembers} color="red" className="mb-6" />
                            ) : (
                                <div>
                                    <TabsContent value="members" className="mt-6">
                                        <FadeIn>
                                            {teamMembers.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center text-center min-h-[300px]">
                                                    <IconPlaceholder
                                                        placeholderType="image"
                                                        imageSrc="https://img.dudit.com.br/static/mascots/Equipe.png"
                                                        imageAlt="Sem membros"
                                                        title="Nenhum membro encontrado"
                                                        subtitle="Você ainda não convidou ninguém para sua equipe."
                                                        itemButton={teamPlanBlocked ? undefined : {
                                                            text: "Convidar primeiro membro",
                                                            action: () => setShowInviteModal(true)
                                                        }}
                                                    />
                                                </div>
                                            ) : (
                                                <>
                                                    {/* Desktop Table */}
                                                    <div className="hidden md:block overflow-x-auto">
                                                        <table className="w-full text-left border-separate border-spacing-0">
                                                            <thead>
                                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                    <th className="py-3 px-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors">Nome</th>
                                                                    <th className="py-3 px-6 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors text-center">Data de Entrada</th>
                                                                    <th className="py-3 px-6 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors text-center">Função</th>
                                                                    <th className="py-3 px-6 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors text-right">Ações</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                                                {teamMembers.map((member) => (
                                                                    <tr key={member.userId} className="group hover:bg-brand-gray/50 dark:hover:bg-dark-border/20 transition-colors">
                                                                        <td className="py-4 px-6">
                                                                            <div className="flex items-center gap-4">
                                                                                <UserProfileImage
                                                                                    fullName={member.fullName || "Membro"}
                                                                                    className="w-10 h-10 text-[14px]"
                                                                                />
                                                                                <div className="flex flex-col min-w-0">
                                                                                    <div className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                                                                                        <div className="flex items-center gap-2">
                                                                                            {member.fullName || "Membro"}
                                                                                            {member.userId === currentUserId && (
                                                                                                <Badge variant="gray" icon={null} className="whitespace-nowrap scale-90 shrink-0">Você</Badge>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                                                                        {member.email}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-4 px-4 text-center">
                                                                            <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                                                                                {member.createdAt ? formatDate(member.createdAt) : "-"}
                                                                            </span>
                                                                        </td>
                                                                        <td className="py-4 px-4 text-center">
                                                                            <Badge variant="blue" icon={null}>
                                                                                {ROLE_LABELS[member.role as PartnerRole] || member.role}
                                                                            </Badge>
                                                                        </td>
                                                                        <td className="py-4 px-6 text-right">
                                                                            <Dropdown
                                                                                trigger={
                                                                                    <Button variant="outline" className="w-[40px] h-[40px] p-0 flex items-center justify-center">
                                                                                        <ThreeDotsIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-heading" />
                                                                                    </Button>
                                                                                }
                                                                                align="right"
                                                                                showChevron={false}
                                                                                fullWidth={false}
                                                                            >
                                                                                <DropdownItem
                                                                                    onClick={() => handleShowMemberStats(member)}
                                                                                >
                                                                                    <ChartIcon size={16} /> Ver detalhes
                                                                                </DropdownItem>
                                                                                {(currentUserRole === "OWNER" || currentUserRole === "ADMIN") && !member.isOwner && (
                                                                                    <DropdownItem
                                                                                        onClick={() => handleOpenStoreModal(member)}
                                                                                    >
                                                                                        <StoreIcon size={16} /> Gerenciar lojas
                                                                                    </DropdownItem>
                                                                                )}
                                                                                {currentUserRole && member.userId !== currentUserId && (
                                                                                    getAllowedInviteRoles(currentUserRole)
                                                                                        .filter((role) => canModifyUser(currentUserRole, member.role as PartnerRole) && role !== member.role)
                                                                                        .map((role) => (
                                                                                            <DropdownItem
                                                                                                key={role}
                                                                                                onClick={() => handleUpdateRole(member.userId, role)}
                                                                                            >
                                                                                                <UserIcon size={16} /> Alterar para {ROLE_LABELS[role]}
                                                                                            </DropdownItem>
                                                                                        ))
                                                                                )}
                                                                                {member.userId !== currentUserId && (
                                                                                    <DropdownItem
                                                                                        onClick={() => setMemberToDelete(member.userId)}
                                                                                        className="text-brand-red dark:text-brand-red"
                                                                                    >
                                                                                        <TrashIcon size={16} /> Remover
                                                                                    </DropdownItem>
                                                                                )}
                                                                            </Dropdown>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    {/* Mobile List */}
                                                    <div className="md:hidden flex flex-col">
                                                        {teamMembers.map((member, idx) => (
                                                            <React.Fragment key={member.userId}>
                                                                <div className="py-5 flex items-start justify-between gap-4">
                                                                    <div className="flex items-start gap-4 min-w-0 flex-1">
                                                                        <UserProfileImage
                                                                            fullName={member.fullName || "Membro"}
                                                                            className="w-12 h-12 text-[16px] shrink-0"
                                                                        />
                                                                        <div className="flex flex-col min-w-0">
                                                                            <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                                                                {member.fullName || "Membro"}
                                                                                {member.userId === currentUserId && (
                                                                                    <Badge variant="gray" icon={null} className="ml-2 whitespace-nowrap scale-90 shrink-0">Você</Badge>
                                                                                )}
                                                                            </h3>
                                                                            <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium truncate">
                                                                                {member.email}
                                                                            </span>
                                                                            <span className="text-[12px] text-brand-inactive-text dark:text-dark-body flex items-center gap-1.5 font-medium mt-1">
                                                                                <CalendarIcon size={12} className="opacity-70" /> {member.createdAt ? formatDate(member.createdAt) : "-"}
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex flex-col items-end gap-3 shrink-0">
                                                                        <Badge variant="blue">
                                                                            {ROLE_LABELS[member.role as PartnerRole] || member.role}
                                                                        </Badge>

                                                                        <Dropdown
                                                                            trigger={
                                                                                <Button variant="outline" className="w-[40px] h-[40px] p-0 flex items-center justify-center">
                                                                                    <ThreeDotsIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-heading" />
                                                                                </Button>
                                                                            }
                                                                            align="right"
                                                                            showChevron={false}
                                                                            fullWidth={false}
                                                                        >
                                                                            <DropdownItem
                                                                                onClick={() => handleShowMemberStats(member)}
                                                                            >
                                                                                <ChartIcon size={16} /> Ver detalhes
                                                                            </DropdownItem>
                                                                            {(currentUserRole === "OWNER" || currentUserRole === "ADMIN") && !member.isOwner && (
                                                                                <DropdownItem
                                                                                    onClick={() => handleOpenStoreModal(member)}
                                                                                >
                                                                                    <StoreIcon size={16} /> Gerenciar lojas
                                                                                </DropdownItem>
                                                                            )}
                                                                            {currentUserRole && member.userId !== currentUserId && (
                                                                                getAllowedInviteRoles(currentUserRole)
                                                                                    .filter((role) => canModifyUser(currentUserRole, member.role as PartnerRole) && role !== member.role)
                                                                                    .map((role) => (
                                                                                        <DropdownItem
                                                                                            key={role}
                                                                                            onClick={() => handleUpdateRole(member.userId, role)}
                                                                                        >
                                                                                            <UserIcon size={16} /> Alterar para {ROLE_LABELS[role]}
                                                                                        </DropdownItem>
                                                                                    ))
                                                                            )}
                                                                            {member.userId !== currentUserId && (
                                                                                <DropdownItem
                                                                                    onClick={() => setMemberToDelete(member.userId)}
                                                                                    className="text-brand-red dark:text-brand-red"
                                                                                >
                                                                                    <TrashIcon size={16} /> Remover
                                                                                </DropdownItem>
                                                                            )}
                                                                        </Dropdown>
                                                                    </div>
                                                                </div>
                                                                {idx < teamMembers.length - 1 && <Separator className="opacity-50" />}
                                                            </React.Fragment>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </FadeIn>
                                    </TabsContent>

                                    <TabsContent value="invites" className="mt-6">
                                        <FadeIn>
                                            {/* Sub-filters for invitations */}
                                            <div className="flex items-center gap-2 mb-6">
                                                <Button
                                                    variant={inviteFilter === "pending" ? "filled" : "outline"}
                                                    onClick={() => setInviteFilter("pending")}
                                                    className="h-8 text-xs px-3"
                                                >
                                                    Pendentes ({invitations.filter(i => !i.used_at && !i.revoked_at && new Date(i.expires_at) > new Date()).length})
                                                </Button>
                                                <Button
                                                    variant={inviteFilter === "accepted" ? "filled" : "outline"}
                                                    onClick={() => setInviteFilter("accepted")}
                                                    className="h-8 text-xs px-3"
                                                >
                                                    Aceitos ({invitations.filter(i => !!i.used_at).length})
                                                </Button>
                                                <Button
                                                    variant={inviteFilter === "all" ? "filled" : "outline"}
                                                    onClick={() => setInviteFilter("all")}
                                                    className="h-8 text-xs px-3"
                                                >
                                                    Todos ({invitations.length})
                                                </Button>
                                            </div>

                                            {invitations.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center text-center min-h-[300px]">
                                                    <IconPlaceholder
                                                        placeholderType="image"
                                                        imageSrc="https://img.dudit.com.br/static/mascots/Convites.png"
                                                        imageAlt="Sem convites"
                                                        title="Nenhum convite encontrado"
                                                        subtitle="Você ainda não enviou nenhum convite para membros da equipe."
                                                        itemButton={teamPlanBlocked ? undefined : {
                                                            text: "Enviar novo convite",
                                                            action: () => setShowInviteModal(true)
                                                        }}
                                                    />
                                                </div>
                                            ) : (
                                                <>
                                                    {/* Desktop Table */}
                                                    <div className="hidden md:block overflow-x-auto">
                                                        <table className="w-full text-left border-separate border-spacing-0">
                                                            <thead>
                                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                    <th className="py-3 px-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 select-none">Email do Convidado</th>
                                                                    <th className="py-3 px-6 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 select-none text-center">Data do Convite</th>
                                                                    <th className="py-3 px-6 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 select-none text-center">Função</th>
                                                                    <th className="py-3 px-6 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 select-none text-center">Status / Aceite</th>
                                                                    <th className="py-3 px-6 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 select-none text-right">Ações</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                                                {invitations
                                                                    .filter(i => {
                                                                        if (inviteFilter === "pending") return !i.used_at && !i.revoked_at && new Date(i.expires_at) > new Date()
                                                                        if (inviteFilter === "accepted") return !!i.used_at
                                                                        return true
                                                                    })
                                                                    .map((inv) => {
                                                                        const isAccepted = !!inv.used_at
                                                                        const isRevoked = !!inv.revoked_at
                                                                        const isExpired = !isAccepted && !isRevoked && new Date(inv.expires_at) <= new Date()
                                                                        const isPending = !isAccepted && !isRevoked && !isExpired
                                                                        const sentDate = inv.created_at || inv.createdAt
                                                                        const usedDate = inv.used_at

                                                                        return (
                                                                            <tr key={inv.id} className="group hover:bg-brand-gray/50 dark:hover:bg-dark-border/20 transition-colors">
                                                                                <td className="py-4 px-6">
                                                                                    <div className="flex items-center gap-4">
                                                                                        <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                                                            <MailIcon size={20} />
                                                                                        </div>
                                                                                        <div className="flex flex-col min-w-0">
                                                                                            <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                                                                                                {inv.email}
                                                                                            </span>
                                                                                            {inv.used_by_name && (
                                                                                                <span className="text-xs text-brand-inactive-text dark:text-dark-body truncate">
                                                                                                    Aceito por: {inv.used_by_name}
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                </td>
                                                                                <td className="py-4 px-4 text-center">
                                                                                    <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                                                                                        {sentDate ? formatDate(sentDate) : "-"}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="py-4 px-4 text-center">
                                                                                    <Badge variant="gray" icon={null}>
                                                                                        {ROLE_LABELS[inv.role as PartnerRole] || inv.role}
                                                                                    </Badge>
                                                                                </td>
                                                                                <td className="py-4 px-4 text-center">
                                                                                    {isAccepted ? (
                                                                                        <div className="flex flex-col items-center">
                                                                                            <Badge variant="green" icon={null}>Aceito</Badge>
                                                                                            {usedDate && (
                                                                                                <span className="text-[11px] text-brand-inactive-text mt-0.5">
                                                                                                    em {formatDate(usedDate)}
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                    ) : isRevoked ? (
                                                                                        <Badge variant="red" icon={null}>Revogado</Badge>
                                                                                    ) : isExpired ? (
                                                                                        <Badge variant="gray" icon={null}>Expirado</Badge>
                                                                                    ) : (
                                                                                        <Badge variant="blue" icon={null}>Pendente</Badge>
                                                                                    )}
                                                                                </td>
                                                                                <td className="py-4 px-6 text-right">
                                                                                    {isPending && (
                                                                                        <ActionsDropdown
                                                                                            onDelete={() => setInviteToDelete(inv.id)}
                                                                                            onCopy={() => handleShowInviteLink(inv)}
                                                                                        />
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        )
                                                                    })}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    {/* Mobile List */}
                                                    <div className="md:hidden flex flex-col">
                                                        {invitations
                                                            .filter(i => {
                                                                if (inviteFilter === "pending") return !i.used_at && !i.revoked_at && new Date(i.expires_at) > new Date()
                                                                if (inviteFilter === "accepted") return !!i.used_at
                                                                return true
                                                            })
                                                            .map((inv, idx, arr) => {
                                                                const isAccepted = !!inv.used_at
                                                                const isRevoked = !!inv.revoked_at
                                                                const isExpired = !isAccepted && !isRevoked && new Date(inv.expires_at) <= new Date()
                                                                const isPending = !isAccepted && !isRevoked && !isExpired
                                                                const sentDate = inv.created_at || inv.createdAt
                                                                const usedDate = inv.used_at

                                                                return (
                                                                    <React.Fragment key={inv.id}>
                                                                        <div className="py-5 flex items-center justify-between gap-4">
                                                                            <div className="flex items-center gap-4 min-w-0">
                                                                                <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border/30 flex items-center justify-center text-brand-inactive-text shrink-0">
                                                                                    <MailIcon size={24} />
                                                                                </div>
                                                                                <div className="flex flex-col min-w-0">
                                                                                    <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                                                                        {inv.email}
                                                                                    </h3>
                                                                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                                                        <Badge variant="gray">
                                                                                            {ROLE_LABELS[inv.role as PartnerRole] || inv.role}
                                                                                        </Badge>
                                                                                        {isAccepted ? (
                                                                                            <Badge variant="green">Aceito</Badge>
                                                                                        ) : isRevoked ? (
                                                                                            <Badge variant="red">Revogado</Badge>
                                                                                        ) : isExpired ? (
                                                                                            <Badge variant="gray">Expirado</Badge>
                                                                                        ) : (
                                                                                            <Badge variant="blue">Pendente</Badge>
                                                                                        )}
                                                                                    </div>
                                                                                    <span className="text-[11px] text-brand-inactive-text dark:text-dark-body flex items-center gap-1 font-medium mt-1">
                                                                                        <CalendarIcon size={12} /> Enviado em: {sentDate ? formatDate(sentDate) : "-"}
                                                                                    </span>
                                                                                    {isAccepted && usedDate && (
                                                                                        <span className="text-[11px] text-brand-green flex items-center gap-1 font-medium mt-0.5">
                                                                                            <CheckCircleIcon size={12} /> Aceito em: {formatDate(usedDate)}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            {isPending && (
                                                                                <ActionsDropdown
                                                                                    onDelete={() => setInviteToDelete(inv.id)}
                                                                                    onCopy={() => handleShowInviteLink(inv)}
                                                                                />
                                                                            )}
                                                                        </div>
                                                                        {idx < arr.length - 1 && <Separator className="opacity-50" />}
                                                                    </React.Fragment>
                                                                )
                                                            })}
                                                    </div>
                                                </>
                                            )}
                                        </FadeIn>
                                    </TabsContent>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mobile Bottom Action Bar */}
                    {!teamPlanBlocked && (
                        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:dark-border px-4 py-3 flex gap-3">
                            <Button
                                onClick={() => setShowInviteModal(true)}
                                className="flex-1 h-12"
                            >
                                Convidar membro
                            </Button>
                        </div>
                    )}

                    <DefaultModal
                        isOpen={showInviteModal}
                        onClose={() => {
                            setShowInviteModal(false)
                            setInviteEmail("")
                            setInviteUrl(null)
                            setInviteError(null)
                            setInviteModalTab("dados_gerais")
                        }}
                        title="Convidar membro"
                    >
                        {!inviteUrl ? (
                            <form onSubmit={handleInvite} className="space-y-0">
                                <Tabs value={inviteModalTab} onValueChange={(v) => setInviteModalTab(v as any)} className="w-full">
                                    <TabsList className="w-full justify-start gap-6 bg-transparent p-0 border-b border-brand-border dark:border-dark-border">
                                        <TabsTrigger value="dados_gerais" className="px-0 pb-3 text-sm">
                                            Dados gerais
                                        </TabsTrigger>
                                        <TabsTrigger value="acesso_lojas" className="px-0 pb-3 text-sm">
                                            Acesso às lojas
                                        </TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="dados_gerais" className="mt-5 space-y-5">
                                        <div>
                                            <Input
                                                label="Email do convidado"
                                                type="email"
                                                required
                                                placeholder="exemplo@email.com"
                                                value={inviteEmail}
                                                onChange={(e) => setInviteEmail(e.target.value)}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">Função</label>
                                            <div className="space-y-2">
                                                {allowedInviteRoles.map((role) => (
                                                    <ListItem
                                                        key={role}
                                                        icon={ROLE_ICONS[role]}
                                                        title={ROLE_LABELS[role]}
                                                        description={ROLE_DESCRIPTIONS[role]}
                                                        onClick={() => setInviteRole(role)}
                                                        right={
                                                            <RadioButton
                                                                name="inviteRole"
                                                                value={role}
                                                                checked={inviteRole === role}
                                                                onChange={() => setInviteRole(role)}
                                                            />
                                                        }
                                                        className="px-4 py-3 gap-4"
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="acesso_lojas" className="mt-5">
                                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                            {allStores.map((store) => {
                                                const isSelected = inviteSelectedStores.includes(store.id)
                                                const locationParts = [store.city, store.state].filter(Boolean)
                                                const locationText = locationParts.length > 0 ? locationParts.join("/") : ""
                                                const addressParts = [
                                                    store.street,
                                                    store.number && store.number !== "S/N" ? store.number : store.number === "S/N" ? "S/N" : null,
                                                ].filter(Boolean)
                                                const addressText = addressParts.length > 0 ? addressParts.join(", ") : ""

                                                return (
                                                    <ListItem
                                                        key={store.id}
                                                        icon={StoreIcon as any}
                                                        title={store.name}
                                                        description={
                                                            <div className="flex flex-col">
                                                                {locationText && (
                                                                    <span className="text-xs lg:text-sm text-brand-inactive-text dark:text-dark-body">{locationText}</span>
                                                                )}
                                                                {addressText && (
                                                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">{addressText}</span>
                                                                )}
                                                            </div>
                                                        }
                                                        right={
                                                            <Checkbox
                                                                checked={isSelected}
                                                                onChange={(checked) => {
                                                                    if (checked) {
                                                                        setInviteSelectedStores(prev => [...prev, store.id])
                                                                    } else {
                                                                        setInviteSelectedStores(prev => prev.filter(id => id !== store.id))
                                                                    }
                                                                }}
                                                            />
                                                        }
                                                        className="px-4 py-3"
                                                    />
                                                )
                                            })}
                                        </div>
                                        <p className="text-xs text-brand-inactive-text mt-3">Se nenhuma for selecionada, será usada a loja atual.</p>
                                    </TabsContent>
                                </Tabs>

                                {inviteError && <p className="text-sm text-red-500 font-medium mt-4">{inviteError}</p>}

                                <div className="flex justify-end gap-3 pt-5 mt-5 border-t border-brand-border dark:border-dark-border">
                                    <Button type="submit" className="h-12 px-6" isLoading={isCreating}>
                                        Gerar Link de Convite
                                    </Button>
                                </div>
                            </form>
                        ) : (
                            <div className="space-y-6 text-center py-4">
                                <IconPlaceholder
                                    icon={CheckCircleIcon}
                                    title="Convite Gerado!"
                                    subtitle="Envie o link abaixo para o membro que deseja convidar."
                                />

                                {/* Copy Field */}
                                <div className="flex gap-2 w-full mb-6">
                                    <Input
                                        readOnly
                                        value={inviteUrl}
                                    />
                                    <Button
                                        variant="outline"
                                        onClick={copyToClipboard}
                                        className="gap-2 shrink-0 h-[42px] w-[42px]"
                                    >
                                        {copied ? <CheckCircleIcon size={16} className="text-brand-green" /> : <CopyIcon size={16} />}
                                    </Button>
                                </div>

                                <p className="text-sm text-brand-inactive-text">
                                    Este link expira em 7 dias ou após o primeiro uso.
                                </p>
                            </div>
                        )}
                    </DefaultModal>

                    <AlertModal
                        isOpen={!!memberToDelete}
                        onClose={() => setMemberToDelete(null)}
                        title="Remover Membro?"
                        description="Tem certeza que deseja remover este membro da sua equipe? Ele perderá o acesso imediatamente."
                        confirmText="Sim, remover"
                        variant="danger"
                        onConfirm={handleRemoveMember}
                        isLoading={isPending}
                    />
                    <AlertModal
                        isOpen={!!inviteToDelete}
                        onClose={() => setInviteToDelete(null)}
                        title="Revogar Convite?"
                        description="Tem certeza que deseja revogar este convite? O link deixará de funcionar imediatamente."
                        confirmText="Sim, revogar"
                        variant="danger"
                        onConfirm={handleRevokeInvitation}
                        isLoading={isPending}
                    />

                    {/* Gerenciar Lojas Modal (2 Tabs: Lojas com Acesso / Todas as Lojas) */}
                    <DefaultModal
                        isOpen={!!selectedStoreMember}
                        onClose={() => setSelectedStoreMember(null)}
                        title={`Gerenciar Lojas - ${selectedStoreMember?.fullName || selectedStoreMember?.email || "Membro"}`}
                    >
                        {isLoadingUserStores ? (
                            <div className="flex justify-center py-12">
                                <ThreeDotsLoader />
                            </div>
                        ) : selectedStoreMember && (
                            <div className="space-y-5">
                                <Tabs value={modalStoreTab} onValueChange={(v) => setModalStoreTab(v as any)} className="w-full">
                                    <TabsList className="w-full justify-start gap-6 px-0">
                                        <TabsTrigger value="access">
                                            Lojas com acesso ({Object.values(storeAccessState).filter(s => s.enabled).length})
                                        </TabsTrigger>
                                        <TabsTrigger value="all">
                                            Todas as lojas ({allStores.length})
                                        </TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="access" className="mt-4">
                                        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                                            {Object.values(storeAccessState).filter(s => s.enabled).length === 0 ? (
                                                <div className="text-center py-8">
                                                    <IconPlaceholder
                                                        icon={StoreIcon}
                                                        title="Nenhuma loja com acesso individual"
                                                        subtitle="Alterne para a aba 'Todas as lojas' para conceder acesso às lojas da empresa."
                                                    />
                                                </div>
                                            ) : (
                                                allStores
                                                    .filter(store => storeAccessState[store.id]?.enabled)
                                                    .map((store) => {
                                                        const state = storeAccessState[store.id]
                                                        return (
                                                            <ListItem
                                                                key={store.id}
                                                                left={
                                                                    <div className="w-9 h-9 rounded-lg bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-sm shrink-0">
                                                                        {store.name.charAt(0).toUpperCase()}
                                                                    </div>
                                                                }
                                                                title={store.name}
                                                                description={ROLE_LABELS[state.role] || state.role}
                                                                right={
                                                                    <Button
                                                                        variant="outlinered"
                                                                        onClick={() => setStoreAccessState(prev => ({
                                                                            ...prev,
                                                                            [store.id]: { ...prev[store.id], enabled: false }
                                                                        }))}
                                                                        className="h-8 text-xs"
                                                                    >
                                                                        Remover acesso
                                                                    </Button>
                                                                }
                                                                className="px-4 py-3"
                                                            />
                                                        )
                                                    })
                                            )}
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="all" className="mt-4">
                                        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                                            {allStores.map((store) => {
                                                const state = storeAccessState[store.id] || { enabled: false, role: "OPERATOR" }
                                                return (
                                                    <ListItem
                                                        key={store.id}
                                                        left={
                                                            <Checkbox
                                                                checked={state.enabled}
                                                                onChange={() => setStoreAccessState(prev => ({
                                                                    ...prev,
                                                                    [store.id]: { ...prev[store.id], enabled: !prev[store.id]?.enabled }
                                                                }))}
                                                            />
                                                        }
                                                        title={store.name}
                                                        description="Loja da empresa"
                                                        right={
                                                            state.enabled ? (
                                                                <div className="w-36 shrink-0">
                                                                    <FormDropdown
                                                                        options={STORE_ROLE_OPTIONS}
                                                                        value={state.role}
                                                                        setValue={(role) => setStoreAccessState(prev => ({
                                                                            ...prev,
                                                                            [store.id]: { ...prev[store.id], role: role as PartnerRole }
                                                                        }))}
                                                                    />
                                                                </div>
                                                            ) : undefined
                                                        }
                                                        className="px-4 py-3"
                                                    />
                                                )
                                            })}
                                        </div>
                                    </TabsContent>
                                </Tabs>

                                {/* Footer Actions */}
                                <div className="flex justify-end gap-3 pt-3 border-t border-brand-border dark:border-dark-border">
                                    <Button variant="outline" onClick={() => setSelectedStoreMember(null)}>
                                        Cancelar
                                    </Button>
                                    <Button onClick={handleSaveStoreAccess} isLoading={isSavingStoreAccess}>
                                        Salvar Acessos
                                    </Button>
                                </div>
                            </div>
                        )}
                    </DefaultModal>

                    {/* Invite Link Modal */}
                    <DefaultModal
                        isOpen={showInviteLinkModal}
                        onClose={() => {
                            setShowInviteLinkModal(false)
                            setInviteToShare(null)
                            setInviteLinkCopied(false)
                        }}
                        title="Link do Convite"
                    >
                        {inviteToShare?.share_url ? (
                            <div className="space-y-6 text-center py-4">
                                <IconPlaceholder
                                    icon={CheckCircleIcon}
                                    title="Convite Ativo!"
                                    subtitle="Envie o link abaixo para o membro que deseja convidar. O link continua válido - nada foi invalidado."
                                />

                                {/* Copy Field */}
                                <div className="flex gap-2 w-full mb-6">
                                    <Input
                                        readOnly
                                        value={inviteToShare.share_url}
                                    />
                                    <Button
                                        variant="outline"
                                        onClick={copyInviteLinkToClipboard}
                                        className="gap-2 shrink-0 h-[42px] w-[42px]"
                                    >
                                        {inviteLinkCopied ? <CheckCircleIcon size={16} className="text-brand-green" /> : <CopyIcon size={16} />}
                                    </Button>
                                </div>

                                <p className="text-sm text-brand-inactive-text">
                                    Este link expira em 7 dias ou após o primeiro uso.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4 text-center py-4">
                                <IconPlaceholder
                                    title="Link indisponível"
                                    subtitle="Este convite foi criado antes do recurso de link salvo. Revogue este convite e envie um novo para gerar o link."
                                />
                            </div>
                        )}
                    </DefaultModal>

                    {/* Member Stats Modal */}
                    <DefaultModal
                        isOpen={!!selectedMemberStats}
                        onClose={() => setSelectedMemberStats(null)}
                        title={selectedMemberStats?.fullName || "Membro"}
                    >
                        {isLoadingStats ? (
                            <div className="flex justify-center py-12">
                                <ThreeDotsLoader />
                            </div>
                        ) : selectedMemberStats && (
                            <div className="space-y-4 py-2">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-brand-gray dark:bg-dark-border/30 rounded-xl p-4">
                                        <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body uppercase tracking-wide mb-1">Vendas</p>
                                        <p className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{selectedMemberStats.saleCount}</p>
                                    </div>
                                    <div className="bg-brand-gray dark:bg-dark-border/30 rounded-xl p-4">
                                        <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body uppercase tracking-wide mb-1">Total vendido</p>
                                        <p className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(selectedMemberStats.totalSalesValue)}
                                        </p>
                                    </div>
                                    <div className="bg-brand-gray dark:bg-dark-border/30 rounded-xl p-4">
                                        <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body uppercase tracking-wide mb-1">Comissões</p>
                                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(selectedMemberStats.totalCommissionValue)}
                                        </p>
                                    </div>
                                    <div className="bg-brand-gray dark:bg-dark-border/30 rounded-xl p-4">
                                        <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body uppercase tracking-wide mb-1">Última venda</p>
                                        <p className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                                            {selectedMemberStats.lastSaleDate ? formatDate(selectedMemberStats.lastSaleDate) : "Nenhuma"}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </DefaultModal>
                </Tabs>
            </div>

            <SavingStatusModal isOpen={isCreating || isPending || isSavingStoreAccess} text="Salvando configurações..." />
        </FadeIn>
    )
}
