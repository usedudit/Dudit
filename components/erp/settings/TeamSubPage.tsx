"use client"

import React, { useState, useEffect, useTransition } from "react"
import cn from "classnames"
import Link from "next/link"
import { Button, InfoCard } from "@/components/reusable"
import { CadastrosIcon, TrashIcon, MailIcon, MoreHorizontalIcon, CheckCircleIcon } from "@/lib/icons"
import DefaultModal from "@/components/reusable/DefaultModal"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { getTeamMembers, removeTeamMember, updateTeamMemberRole } from "@/app/actions/erp/team"
import type { TeamMember } from "@/app/actions/erp/team"
import { ROLE_LABELS, ROLE_DESCRIPTIONS, getAllowedInviteRoles } from "@/lib/permissions/partner-roles"
import type { PartnerRole } from "@/lib/permissions/types"
import { SubPageHeader } from "./SettingsCard"

export const TeamSubPage = ({ partnerId, onBack }: { partnerId: string; onBack: () => void }) => {
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<string>("VIEWER")
  const [isCreating, setIsCreating] = useState(false)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [currentUserRole, setCurrentUserRole] = useState<PartnerRole | null>(null)
  const [invitations, setInvitations] = useState<any[]>([])
  const [isLoadingMembers, setIsLoadingMembers] = useState(true)
  const [errorMembers, setErrorMembers] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const fetchMembers = async () => {
    setIsLoadingMembers(true)
    setErrorMembers(null)
    const { members, currentUserRole: role, error } = await getTeamMembers()
    if (error) {
      setErrorMembers(error)
    } else {
      setTeamMembers(members || [])
      setCurrentUserRole(role || null)
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

  const handleRemoveMember = async (userId: string) => {
    if (!confirm("Tem certeza que deseja remover este membro da equipe?")) return

    startTransition(async () => {
      const result = await removeTeamMember(userId)
      if (result.error) {
        alert(result.error)
      } else {
        fetchMembers()
      }
    })
  }

  const handleUpdateRole = async (userId: string, newRole: PartnerRole) => {
    startTransition(async () => {
      const result = await updateTeamMemberRole(userId, newRole)
      if (result.error) {
        alert(result.error)
      } else {
        fetchMembers()
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
    <div>
      <div className="flex justify-between items-center mb-6">
        <SubPageHeader
          title="Equipe e Acessos"
          description="Gerencie os membros da sua equipe e suas permissões de acesso."
          onBack={onBack}
        />
        <Button
          type="button"
          className="flex items-center gap-2"
          onClick={() => setShowInviteModal(true)}
        >
          <CadastrosIcon size={16} />
          Convidar
        </Button>
      </div>

      {isLoadingMembers ? (
        <div className="flex justify-center p-12">
          <span className="text-brand-inactive-text">Carregando membros...</span>
        </div>
      ) : errorMembers ? (
        <InfoCard message={errorMembers} color="red" className="mb-6" />
      ) : teamMembers.length === 0 ? (
        <div className="border border-brand-border dark:border-dark-border rounded-xl p-12 flex flex-col items-center justify-center text-center min-h-[300px] bg-white dark:bg-dark-surface mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-brand-slate dark:bg-gray-800 flex items-center justify-center">
            <CadastrosIcon size={28} className="text-brand-dark dark:text-dark-heading" />
          </div>
          <p className="text-brand-dark dark:text-dark-heading text-lg font-bold mb-1">
            Nenhum membro encontrado
          </p>
          <p className="text-brand-inactive-text dark:text-dark-body mb-6">
            Você ainda não convidou ninguém para sua equipe.
          </p>
          <Button onClick={() => setShowInviteModal(true)}>Convidar primeiro membro</Button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4">
            {teamMembers.map((member) => (
              <div
                key={member.userId}
                className="flex items-center justify-between p-4 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-brand-slate dark:bg-gray-800 flex items-center justify-center font-bold text-brand-dark dark:text-dark-heading">
                    {member.fullName?.[0]?.toUpperCase() || "U"}
                  </div>
                  <div>
                    <p className="font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                      {member.fullName}
                      {member.userId === currentUserRole ? (
                        <span className="text-[10px] bg-brand-slate dark:bg-gray-800 px-1.5 py-0.5 rounded text-brand-dark dark:text-dark-heading">VOCÊ</span>
                      ) : null}
                    </p>
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">{member.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs font-bold text-brand-inactive-text uppercase tracking-wider mb-0.5">FUNÇÃO</p>
                    <p className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                      {ROLE_LABELS[member.role as PartnerRole] || member.role}
                    </p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50" disabled={isPending}>
                        <MoreHorizontalIcon size={18} className="text-brand-inactive-text hover:text-brand-dark" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {currentUserRole === "OWNER" && member.userId !== currentUserRole && (
                        <>
                          {(Object.keys(ROLE_LABELS) as PartnerRole[]).map((role) => (
                            <DropdownMenuItem
                              key={role}
                              onClick={() => handleUpdateRole(member.userId, role)}
                              className={member.role === role ? "bg-brand-slate font-bold" : ""}
                            >
                              Alterar para {ROLE_LABELS[role]}
                            </DropdownMenuItem>
                          ))}
                          <div className="h-px bg-gray-100 my-1" />
                        </>
                      )}
                      <DropdownMenuItem
                        className="text-red-600 focus:bg-red-50 focus:text-red-700 cursor-pointer"
                        onClick={() => handleRemoveMember(member.userId)}
                      >
                        <TrashIcon className="w-4 h-4 mr-2" /> Remover Membro
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>

          {invitations.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Convites Pendentes</h3>
              <div className="grid grid-cols-1 gap-4">
                {invitations.filter(i => i.status === "PENDING").map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between p-4 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface opacity-90">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-gray-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400">
                        <MailIcon size={18} />
                      </div>
                      <div>
                        <p className="font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                          {inv.email}
                          <span className="text-[10px] bg-brand-slate dark:bg-gray-800 px-1.5 py-0.5 rounded text-brand-dark dark:text-dark-heading uppercase tracking-tighter">PENDENTE</span>
                        </p>
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">Função: {ROLE_LABELS[inv.role as PartnerRole]}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
        title="Convidar Membro"
      >
        {!inviteUrl ? (
          <form onSubmit={handleInvite} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">Email do convidado</label>
              <input
                type="email"
                required
                className="w-full px-4 py-2 rounded-xl border border-brand-border dark:border-dark-border bg-brand-slate/50 dark:bg-gray-800 dark:text-dark-heading focus:ring-2 focus:ring-brand-dark/20 transition-all outline-none"
                placeholder="exemplo@email.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">Função</label>
              <div className="space-y-2">
                {allowedInviteRoles.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setInviteRole(role)}
                    className={cn(
                      "w-full p-3 rounded-xl border text-left transition-all",
                      inviteRole === role
                        ? "border-brand-dark bg-brand-dark text-white ring-4 ring-brand-dark/10"
                        : "border-brand-border dark:border-dark-border text-brand-inactive-text hover:border-brand-dark/30",
                    )}
                  >
                    <p className="font-bold text-sm">{ROLE_LABELS[role]}</p>
                    <p className="text-xs opacity-70 leading-tight">{ROLE_DESCRIPTIONS[role]}</p>
                  </button>
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

            <div className="p-4 bg-brand-slate dark:bg-gray-800 rounded-xl border border-brand-border dark:border-dark-border flex items-center justify-between gap-4">
              <p className="text-xs font-mono text-brand-dark dark:text-dark-heading truncate flex-1 text-left">
                {inviteUrl}
              </p>
              <button
                onClick={copyToClipboard}
                className="px-4 py-2 bg-brand-dark text-white rounded-lg text-sm font-bold flex-shrink-0 hover:bg-brand-dark/90 transition-all"
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
    </div>
  )
}
