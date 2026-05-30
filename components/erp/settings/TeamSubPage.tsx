"use client"

import React, { useState, useEffect, useTransition, useRef, useCallback } from "react"
import cn from "classnames"
import { Button, IconPlaceholder, InfoCard, Input, ThreeDotsLoader, Tabs, TabsList, TabsTrigger, TabsContent, Separator, ActionsDropdown, Badge, AlertModal, DropdownItem, ListItem, RadioButton } from "@/components/reusable"
import { MailIcon, CheckCircleIcon, ChevronLeftIcon, PlusIcon, CalendarIcon, UserIcon } from "@/lib/icons"
import DefaultModal from "@/components/reusable/DefaultModal"
import { getTeamMembers, removeTeamMember, updateTeamMemberRole } from "@/app/actions/erp/team"
import type { TeamMember } from "@/app/actions/erp/team"
import type { PartnerRole } from "@/lib/permissions/types"
import { FadeIn } from "@/components/animations/FadeIn"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { formatDate } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

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

export const TeamSubPage = ({ partnerId, onBack }: { partnerId: string; onBack: () => void }) => {
    const [showInviteModal, setShowInviteModal] = useState(false)
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const handleBack = useCallback(() => onBack(), [onBack])

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const [inviteEmail, setInviteEmail] = useState("")
    const [inviteRole, setInviteRole] = useState<string>("OPERATOR")
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
    const [activeTab, setActiveTab] = useState<"members" | "invites">("members")
    const [memberToDelete, setMemberToDelete] = useState<string | null>(null)
    const [inviteToDelete, setInviteToDelete] = useState<string | null>(null)
    const { toast } = useToast()

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

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsCreating(true)
        setInviteError(null)
        setInviteUrl(null)

        try {
            const { createInvitation } = await import("@/app/actions/invitations")
            const result = await createInvitation({
                partnerId,
                email: inviteEmail,
                role: inviteRole as PartnerRole,
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
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
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

                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            Gerencie os membros da sua equipe e suas permissões de acesso.
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className={`hidden md:flex transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                        <Button leftIcon={<PlusIcon size={18} />} onClick={() => setShowInviteModal(true)}>
                                            Convidar membro
                                        </Button>
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
                        </div>

                        <div className="px-3 md:px-6 lg:py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            {isLoadingMembers ? (
                                <div className="flex justify-center p-12">
                                    <ThreeDotsLoader />
                                </div>
                            ) : errorMembers ? (
                                <InfoCard message={errorMembers} color="red" className="mb-6" />
                            ) : (
                                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
                                    <TabsList>
                                        <TabsTrigger value="members">
                                            Equipe ({teamMembers.length})
                                        </TabsTrigger>
                                        <TabsTrigger value="invites">
                                            Convites ({invitations.filter(i => !i.used_at && !i.revoked_at).length})
                                        </TabsTrigger>
                                    </TabsList>

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
                                                        itemButton={{
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
                                                                    <th className="py-3 px-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors">Membro</th>
                                                                    <th className="py-3 px-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors text-center">Data de Entrada</th>
                                                                    <th className="py-3 px-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors text-center">Função</th>
                                                                    <th className="py-3 px-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors text-right">Ações</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                                                {teamMembers.map((member) => (
                                                                    <tr key={member.userId} className="group hover:bg-brand-gray/50 dark:hover:bg-dark-border/20 transition-colors">
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
                                                                <div className="py-5 flex items-start justify-between gap-4">
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
                                                        itemButton={{
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
                                </Tabs>
                            )}
                        </div>
                    </div>

                    {/* Mobile Bottom Action Bar */}
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                        <Button
                            variant="outline"
                            onClick={handleBack}
                            className="flex-1 h-[48px] font-bold"
                        >
                            Voltar
                        </Button>
                        <Button
                            onClick={() => setShowInviteModal(true)}
                            className="flex-1 h-[48px] font-bold"
                        >
                            Convidar membro
                        </Button>
                    </div>

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
                                            />
                                        ))}
                                    </div>
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
                </Tabs>
            </div>
        </FadeIn>
    )
}
