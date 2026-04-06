"use client"

import React, { useState, useEffect, useTransition, useRef, useCallback } from "react"
import cn from "classnames"
import { Button, IconPlaceholder, InfoCard, ThreeDotsLoader } from "@/components/reusable"
import { TrashIcon, MailIcon, MoreHorizontalIcon, CheckCircleIcon, ChevronLeftIcon } from "@/lib/icons"
import DefaultModal from "@/components/reusable/DefaultModal"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { getTeamMembers, removeTeamMember, updateTeamMemberRole } from "@/app/actions/erp/team"
import type { TeamMember } from "@/app/actions/erp/team"
import { ROLE_LABELS, ROLE_DESCRIPTIONS, getAllowedInviteRoles } from "@/lib/permissions/partner-roles"
import type { PartnerRole } from "@/lib/permissions/types"
import { FadeIn } from "@/components/animations/FadeIn"

export const TeamSubPage = ({ partnerId, onBack }: { partnerId: string; onBack: () => void }) => {
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
  }, [])

  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<string>("VIEWER")
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
    <FadeIn>
      <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
        <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">
          {/* Sticky Header */}
          <div className={`sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out ${isScrolled ? "py-2 md:py-3 shadow-sm" : "py-4 md:py-8"}`}>
            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6">

              {/* Back button — desktop only */}
              <div className={`absolute -left-12 top-1/2 -translate-y-1/2 h-full hidden xl:flex items-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                  <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                </Button>
              </div>

              {/* Title row */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                  <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                    <span className="truncate">Equipe</span>
                  </h1>

                  <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100 mt-1"}`}>
                    Gerencie os membros da sua equipe e suas permissões de acesso.
                  </div>
                </div>

                {/* Primary Action - Desktop */}
                <div className={`hidden md:flex transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                  <Button onClick={() => setShowInviteModal(true)}>
                    Convidar Membro
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
            {isLoadingMembers ? (
              <div className="flex justify-center p-12">
                <ThreeDotsLoader />
              </div>
            ) : errorMembers ? (
              <InfoCard message={errorMembers} color="red" className="mb-6" />
            ) : teamMembers.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center min-h-[300px] mb-6">
                <IconPlaceholder
                  placeholderType="image"
                  imageSrc="https://img.dudit.com.br/static/mascots/Equipe.png"
                  imageAlt="Sem pedidos"
                  title="Nenhum membro encontrado"
                  subtitle="Você ainda não convidou ninguém para sua equipe."
                  itemButton={{
                    text: "Convidar primeiro membro",
                    action: () => setShowInviteModal(true)
                  }}
                />
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
                            {member.userId === currentUserId ? (
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
                            {currentUserRole === "OWNER" && member.userId !== currentUserId && (
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
                            {member.userId !== currentUserId && (
                              <DropdownMenuItem
                                className="text-red-600 focus:bg-red-50 focus:text-red-700 cursor-pointer"
                                onClick={() => handleRemoveMember(member.userId)}
                              >
                                <TrashIcon className="w-4 h-4 mr-2" /> Remover Membro
                              </DropdownMenuItem>
                            )}
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
          </div>
        </div>

        {/* Mobile Bottom Action Bar */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3">
          <Button
            variant="outline"
            onClick={onBack}
            className="flex-1 h-[48px] font-bold"
          >
            Voltar
          </Button>
          <Button
            onClick={() => setShowInviteModal(true)}
            className="flex-[2] h-[48px] font-bold"
          >
            Convidar Membro
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
    </FadeIn>
  )
}
