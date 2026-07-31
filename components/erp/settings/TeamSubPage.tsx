"use client"

import React, { useState, useEffect, useTransition, useRef, useCallback } from "react"
import { Button, IconPlaceholder, InfoCard, Input, ThreeDotsLoader, Tabs, TabsList, TabsTrigger, TabsContent, Separator, ActionsDropdown, Badge, AlertModal, DropdownItem, ListItem, RadioButton } from "@/components/reusable"
import { MailIcon, CheckCircleIcon, ChevronLeftIcon, PlusIcon, CalendarIcon, UserIcon, MotorbikeIcon, ShieldIcon, CrownIcon, ManagerIcon } from "@/lib/icons"
import DefaultModal from "@/components/reusable/DefaultModal"
import { getTeamMembers, getTeamMemberStatsAction, removeTeamMember, updateTeamMemberRole } from "@/app/actions/erp/team"
import { listStoreMembersAction, addStoreMemberAction, removeStoreMemberAction } from "@/app/actions/erp/store-members"
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
    const [storeMembers, setStoreMembers] = useState<any[]>([])
    const [isLoadingStoreMembers, setIsLoadingStoreMembers] = useState(false)
    const [showAddStoreMemberModal, setShowAddStoreMemberModal] = useState(false)
    const [selectedStoreMemberUserId, setSelectedStoreMemberUserId] = useState<string | null>(null)
    const [memberToDelete, setMemberToDelete] = useState<string | null>(null)
    const [memberStoreMap, setMemberStoreMap] = useState<Record<string, string[]>>({})
    const [inviteToDelete, setInviteToDelete] = useState<string | null>(null)
    const { toast } = useToast()
    const [selectedMemberStats, setSelectedMemberStats] = useState<TeamMemberStats | null>(null)
    const [isLoadingStats, setIsLoadingStats] = useState(false)

    const fetchMembers = async () => {
        setIsLoadingMembers(true)
        setErrorMembers(null)
        const { members, currentUserRole: role, currentUserId: userId, error } = await getTeamMembers()
        if (error) {
            setErrorMembers(error)
        } else {
            setTeamMembers(members || [])
            setCurrentUserRole(role || null)
            setCurrentUserId(userId || null)
        }

        try {
            const { listPartnerInvitations } = await import("@/app/actions/invitations")
            const result = await listPartnerInvitations(partnerId)
            if (result.success && result.invitations) {
                setInvitations(result.invitations)
            }
        } catch (e) { }

        setIsLoadingMembers(false)
    }

    useEffect(() => {
        fetchMembers()
    }, [])

    const fetchStoreMembers = useCallback(async () => {
        if (!selectedStore) return
        setIsLoadingStoreMembers(true)
        try {
            const members = await listStoreMembersAction(selectedStore.id, partnerId)
            setStoreMembers(members)
        } catch {
            setStoreMembers([])
        }
        setIsLoadingStoreMembers(false)
    }, [selectedStore, partnerId])

    useEffect(() => {
        fetchStoreMembers()
    }, [fetchStoreMembers])

    // Load store memberships for all stores to display badges
    useEffect(() => {
        if (!allStores.length) return
        const fetchAllStoreMemberships = async () => {
            const results = await Promise.allSettled(
                allStores.map(store =>
                    listStoreMembersAction(store.id, partnerId)
                        .then(members => ({ storeId: store.id, members }))
                        .catch(() => ({ storeId: store.id, members: [] }))
                )
            )
            const map: Record<string, string[]> = {}
            for (const result of results) {
                if (result.status === "fulfilled") {
                    const { storeId, members } = result.value
                    const store = allStores.find(s => s.id === storeId)
                    const storeName = store?.name || storeId
                    for (const m of members) {
                        if (!map[m.partner_user_id]) map[m.partner_user_id] = []
                        if (!map[m.partner_user_id].includes(storeName)) {
                            map[m.partner_user_id].push(storeName)
                        }
                    }
                }
            }
            setMemberStoreMap(map)
        }
        fetchAllStoreMemberships()
    }, [allStores, partnerId])

    const handleAddStoreMember = async (partnerUserId: string) => {
        if (!selectedStore) return
        const result = await addStoreMemberAction(partnerUserId, selectedStore.id, partnerId, "OPERATOR")
        if (result.success) {
            toast({ title: "Sucesso", description: "Membro adicionado à loja.", variant: "success" })
            fetchStoreMembers()
        } else {
            toast({ title: "Erro", description: result.error || "Erro ao adicionar membro.", variant: "destructive" })
        }
        setShowAddStoreMemberModal(false)
    }

    const handleRemoveStoreMember = async () => {
        if (!selectedStoreMemberUserId || !selectedStore) return
        const result = await removeStoreMemberAction(selectedStoreMemberUserId, selectedStore.id, partnerId)
        if (result.success) {
            toast({ title: "Sucesso", description: "Membro removido da loja.", variant: "success" })
            fetchStoreMembers()
        } else {
            toast({ title: "Erro", description: result.error || "Erro ao remover membro.", variant: "destructive" })
        }
        setSelectedStoreMemberUserId(null)
    }

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

    const handleShowMemberStats = useCallback(async (member: TeamMember) => {
        setIsLoadingStats(true)
        setSelectedMemberStats(null)
        const { stats } = await getTeamMemberStatsAction()
        if (stats) {
            const memberStat = stats.find((s) => s.partnerUserId === member.id)
            setSelectedMemberStats(memberStat || {
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
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6">

                                {/* Back button - desktop only */}
                                <div className={`absolute -left-12 top-3 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                {/* Title row */}
                                <div className="hidden md:flex items-start justify-between">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
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
                        <div className="px-3 md:px-6 md:py-6 max-w-[1300px] mx-auto min-h-[400px]">
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
                                                                    <th className="py-3 px-6 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-center">Lojas</th>
                                                                    <th className="py-3 px-6 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors text-right">Ações</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                                                {teamMembers.map((member) => (
                                                                    <tr key={member.userId} className="group hover:bg-brand-gray/50 dark:hover:bg-dark-border/20 transition-colors cursor-pointer" onClick={() => handleShowMemberStats(member)}>
                                                                        <td className="py-4 px-6">
                                                                            <div className="flex items-center gap-4">
                                                                                <UserProfileImage
                                                                                    fullName={member.fullName || "Usuário"}
                                                                                    className="w-10 h-10 text-[14px]"
                                                                                />
                                                                                <div className="flex flex-col min-w-0">
                                                                                    <div className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                                                                                        <div className="flex items-center gap-2">
                                                                                            {member.fullName || "Usuário"}
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
                                                                            <Badge variant="blue">
                                                                                {ROLE_LABELS[member.role as PartnerRole] || member.role}
                                                                            </Badge>
                                                                        </td>
                                                                        <td className="py-4 px-4 text-center">
                                                                            <div className="flex flex-wrap gap-1 justify-center max-w-[200px]">
                                                                                {(memberStoreMap[member.userId] || []).slice(0, 3).map((s: string) => (
                                                                                    <Badge key={s} variant="gray" icon={null} className="text-[10px] whitespace-nowrap">
                                                                                        {s}
                                                                                    </Badge>
                                                                                ))}
                                                                                {(memberStoreMap[member.userId] || []).length > 3 && (
                                                                                    <Badge variant="gray" icon={null} className="text-[10px]">
                                                                                        +{(memberStoreMap[member.userId] || []).length - 3}
                                                                                    </Badge>
                                                                                )}
                                                                                {(memberStoreMap[member.userId] || []).length === 0 && (
                                                                                    <span className="text-[12px] text-brand-inactive-text">—</span>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-4 px-6 text-right">
                                                                            <ActionsDropdown
                                                                                onDelete={member.userId !== currentUserId ? () => setMemberToDelete(member.userId) : undefined}
                                                                            >
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
                                                                                {currentUserRole && member.userId !== currentUserId && (member.role === "MANAGER" || member.role === "OPERATOR" || member.role === "DELIVERY") && canModifyUser(currentUserRole, member.role as PartnerRole) && (
                                                                                    <DropdownItem
                                                                                        onClick={() => {
                                                                                            setShowAddStoreMemberModal(true)
                                                                                            setSelectedStoreMemberUserId(member.userId)
                                                                                        }}
                                                                                    >
                                                                                        Gerenciar lojas
                                                                                    </DropdownItem>
                                                                                )}
                                                                            </ActionsDropdown>
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
                                                                <div className="py-5 flex items-start justify-between gap-4 cursor-pointer" onClick={() => handleShowMemberStats(member)}>
                                                                    <div className="flex items-start gap-4 min-w-0 flex-1">
                                                                        <UserProfileImage
                                                                            fullName={member.fullName || "Usuário"}
                                                                            className="w-12 h-12 text-[16px] shrink-0"
                                                                        />
                                                                        <div className="flex flex-col min-w-0">
                                                                            <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                                                                {member.fullName || "Usuário"}
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

                                                                        <ActionsDropdown
                                                                            onDelete={member.userId !== currentUserId ? () => setMemberToDelete(member.userId) : undefined}
                                                                        >
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
                                                                        </ActionsDropdown>
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
                                            {invitations.filter(i => !i.used_at && !i.revoked_at && new Date(i.expires_at) > new Date()).length === 0 ? (
                                                <div className="flex flex-col items-center justify-center text-center min-h-[300px]">
                                                    <IconPlaceholder
                                                        placeholderType="image"
                                                        imageSrc="https://img.dudit.com.br/static/mascots/Convites.png"
                                                        imageAlt="Sem convites"
                                                        title="Nenhum convite pendente"
                                                        subtitle="Todos os convites enviados já foram aceitos ou expiraram."
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
                                                                    <th className="py-3 px-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors">Email do Convidado</th>
                                                                    <th className="py-3 px-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors text-center">Data do Convite</th>
                                                                    <th className="py-3 px-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors text-center">Função</th>
                                                                    <th className="py-3 px-6 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors text-right">Ações</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                                                {invitations.filter(i => !i.used_at && !i.revoked_at).map((inv) => (
                                                                    <tr key={inv.id} className="group hover:bg-brand-gray/50 dark:hover:bg-dark-border/20 transition-colors">
                                                                        <td className="py-4 px-6">
                                                                            <div className="flex items-center gap-4">
                                                                                <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border/30 flex items-center justify-center text-brand-inactive-text">
                                                                                    <MailIcon size={20} />
                                                                                </div>
                                                                                <div className="flex flex-col min-w-0">
                                                                                    <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                                                                                        {inv.email}
                                                                                    </span>
                                                                                    <span className="text-[10px] font-bold text-brand-primary uppercase tracking-tighter">
                                                                                        Aguardando aceitação
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-4 px-4 text-center">
                                                                            <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                                                                                {inv.createdAt ? formatDate(inv.createdAt) : "-"}
                                                                            </span>
                                                                        </td>
                                                                        <td className="py-4 px-4 text-center">
                                                                            <Badge variant="gray">
                                                                                {ROLE_LABELS[inv.role as PartnerRole] || inv.role}
                                                                            </Badge>
                                                                        </td>
                                                                        <td className="py-4 px-6 text-right">
                                                                            <ActionsDropdown
                                                                                onDelete={() => setInviteToDelete(inv.id)}
                                                                            />
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    {/* Mobile List */}
                                                    <div className="md:hidden flex flex-col">
                                                        {invitations.filter(i => !i.used_at && !i.revoked_at).map((inv, idx, arr) => (
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
                                                                            <span className="text-[10px] font-bold text-brand-primary uppercase tracking-tighter mb-1">
                                                                                Aguardando aceitação
                                                                            </span>
                                                                            <div className="flex items-center gap-2">
                                                                                <Badge variant="gray">
                                                                                    {ROLE_LABELS[inv.role as PartnerRole] || inv.role}
                                                                                </Badge>
                                                                                <span className="text-[11px] text-brand-inactive-text dark:text-dark-body flex items-center gap-1 font-medium">
                                                                                    <CalendarIcon size={12} /> {inv.createdAt ? formatDate(inv.createdAt) : "-"}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <ActionsDropdown
                                                                        onDelete={() => setInviteToDelete(inv.id)}
                                                                    />
                                                                </div>
                                                                {idx < arr.length - 1 && <Separator className="opacity-50" />}
                                                            </React.Fragment>
                                                        ))}
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
                        }}
                        title="Convidar membro"
                    >
                        {!inviteUrl ? (
                            <form onSubmit={handleInvite} className="space-y-4">
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

                                <div>
                                    <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">Acessos às lojas</label>
                                    <div className="space-y-2 max-h-48 overflow-y-auto border border-brand-border dark:border-dark-border rounded-xl p-3">
                                        {allStores.map((store) => (
                                            <label key={store.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-brand-gray dark:hover:bg-dark-border/30 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={inviteSelectedStores.includes(store.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setInviteSelectedStores(prev => [...prev, store.id])
                                                        } else {
                                                            setInviteSelectedStores(prev => prev.filter(id => id !== store.id))
                                                        }
                                                    }}
                                                    className="w-4 h-4 rounded border-brand-border text-brand-accent focus:ring-brand-accent"
                                                />
                                                <span className="text-sm text-brand-dark dark:text-dark-heading">{store.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <p className="text-xs text-brand-inactive-text mt-1">Se nenhuma for selecionada, será usada a loja atual.</p>
                                </div>

                                {inviteError && <p className="text-sm text-red-500 font-medium">{inviteError}</p>}

                                <Button type="submit" className="w-full h-12" isLoading={isCreating}>
                                    Gerar Link de Convite
                                </Button>
                            </form>
                        ) : (
                            <div className="space-y-6 text-center py-4">
                                <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <CheckCircleIcon size={40} className="text-green-500" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-2">Convite Gerado!</h3>
                                    <p className="text-brand-inactive-text text-sm">
                                        Envie o link abaixo para o membro que deseja convidar.
                                    </p>
                                </div>

                                <div className="p-4 bg-brand-gray dark:bg-gray-800 rounded-xl border border-brand-border dark:border-dark-border flex items-center justify-between gap-4">
                                    <p className="text-xs font-mono text-brand-dark dark:text-dark-heading truncate flex-1 text-left">
                                        {inviteUrl}
                                    </p>
                                    <button
                                        onClick={copyToClipboard}
                                        className="px-4 py-2 bg-brand-dark text-white rounded-lg text-sm font-bold shrink-0 hover:bg-brand-dark/90 transition-all"
                                    >
                                        {copied ? "Copiado!" : "Copiar"}
                                    </button>
                                </div>

                                <p className="text-[10px] text-brand-inactive-text">
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

                    <AlertModal
                        isOpen={!!selectedStoreMemberUserId}
                        onClose={() => setSelectedStoreMemberUserId(null)}
                        title="Remover membro da loja?"
                        description="Este membro perderá o acesso a esta loja. O acesso à equipe do parceiro será mantido."
                        confirmText="Sim, remover"
                        variant="danger"
                        onConfirm={handleRemoveStoreMember}
                    />

                    <DefaultModal
                        isOpen={showAddStoreMemberModal}
                        onClose={() => { setShowAddStoreMemberModal(false); setSelectedStoreMemberUserId(null); }}
                        title={selectedStoreMemberUserId ? "Gerenciar lojas do membro" : "Adicionar membro à loja atual"}
                    >
                        {selectedStoreMemberUserId ? (
                            <div className="space-y-3">
                                <p className="text-sm text-brand-inactive-text mb-3">
                                    Selecione as lojas que este membro pode acessar:
                                </p>
                                {allStores.map((store) => {
                                    const sm = storeMembers.find(s => s.partner_user_id === selectedStoreMemberUserId && s.store_id === store.id)
                                    const hasAccess = !!sm
                                    return (
                                        <label key={store.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-brand-gray dark:hover:bg-dark-border/30 cursor-pointer transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={hasAccess}
                                                onChange={async (e) => {
                                                    if (e.target.checked) {
                                                        const res = await addStoreMemberAction(selectedStoreMemberUserId, store.id, partnerId, "OPERATOR")
                                                        if (res.success) {
                                                            toast({ title: "Sucesso", description: "Acesso adicionado.", variant: "success" })
                                                        } else {
                                                            toast({ title: "Erro", description: res.error || "Erro", variant: "destructive" })
                                                        }
                                                    } else if (sm) {
                                                        const res = await removeStoreMemberAction(sm.id, store.id, partnerId)
                                                        if (res.success) {
                                                            toast({ title: "Sucesso", description: "Acesso removido.", variant: "success" })
                                                        } else {
                                                            toast({ title: "Erro", description: res.error || "Erro", variant: "destructive" })
                                                        }
                                                    }
                                                    fetchStoreMembers()
                                                }}
                                                className="w-4 h-4 rounded border-brand-border text-brand-accent focus:ring-brand-accent"
                                            />
                                            <span className="text-sm text-brand-dark dark:text-dark-heading font-medium">{store.name}</span>
                                        </label>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                                {teamMembers.filter(tm => !storeMembers.some(sm => sm.partner_user_id === tm.id)).length === 0 ? (
                                    <p className="text-sm text-brand-inactive-text text-center py-8">Todos os membros da equipe já têm acesso a esta loja.</p>
                                ) : (
                                    teamMembers
                                        .filter(tm => !storeMembers.some(sm => sm.partner_user_id === tm.id))
                                        .map(tm => (
                                            <div
                                                key={tm.id}
                                                className="flex items-center justify-between p-3 rounded-xl hover:bg-brand-gray dark:hover:bg-dark-border/30 cursor-pointer transition-colors"
                                                onClick={() => handleAddStoreMember(tm.id)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <UserProfileImage fullName={tm.fullName || "Usuário"} className="w-10 h-10 text-[14px]" />
                                                    <div>
                                                        <p className="font-bold text-[14px] text-brand-dark dark:text-dark-heading">{tm.fullName || "Usuário"}</p>
                                                        <p className="text-xs text-brand-inactive-text">{tm.email}</p>
                                                    </div>
                                                </div>
                                                <Badge variant="blue">{ROLE_LABELS[tm.role as PartnerRole] || tm.role}</Badge>
                                            </div>
                                        ))
                                )}
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
        </FadeIn>
    )
}
