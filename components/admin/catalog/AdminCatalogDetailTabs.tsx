"use client"

import React, { useState, useTransition } from "react"
import {
    FormSection,
    SidebarCard,
    IconPlaceholder,
    DefaultModal,
    Input,
    Button,
    DropdownItem,
} from "@/components/reusable"
import { ClockIcon, UserIcon, CheckCircleIcon, TrashIcon } from "@/lib/icons"
import { formatDateTime } from "@/lib/utils"
import { toast } from "@/hooks/use-notification"
import { approveModeration, rejectModeration } from "@/app/actions/admin/moderation"
import { AdminStoreCard } from "@/components/admin/AdminStoreCard"

// ─── Aba "Comprador e Loja" ─────────────────────────────────────────────────
// Mesmo layout da aba "parties" do AdminOrderDetailView (grid 12, loja na
// coluna principal, proprietário na sidebar). Itens de catálogo não têm
// comprador - o par aqui é a loja/vendedor + o parceiro dono do item.

export function CatalogPartiesTab({
    store,
    partnerName,
    partnerId,
    itemId,
}: {
    store?: any
    partnerName?: string | null
    partnerId?: string
    itemId: string
}) {
    if (!store && !partnerName) {
        return (
            <IconPlaceholder
                icon={UserIcon}
                containerSize="w-14 h-14 mb-2"
                iconSize="w-6 h-6"
                title="Nenhuma loja vinculada"
                subtitle="Este item não possui uma loja/parceiro associado."
            />
        )
    }

    return (
        <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
            {/* Coluna principal: Loja / Vendedor */}
            <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                {store && <AdminStoreCard store={store} />}
            </div>

            {/* Sidebar: Proprietário */}
            <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                <SidebarCard hasTopStrip hasSeparator title="Proprietário">
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <UserIcon size={14} className="text-brand-inactive-text" />
                            <span className="text-sm text-brand-inactive-text truncate">
                                <strong>{partnerName || "N/A"}</strong>
                            </span>
                        </div>
                        {partnerId && (
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono text-brand-inactive-text opacity-70 break-all">
                                    {partnerId}
                                </span>
                            </div>
                        )}
                    </div>
                </SidebarCard>

                <SidebarCard hasTopStrip title="ID do Item">
                    <p className="text-xs font-mono text-brand-inactive-text break-all">{itemId}</p>
                </SidebarCard>
            </div>
        </div>
    )
}

// ─── Aba "Histórico & Auditoria" ────────────────────────────────────────────
// Mesma estrutura da aba "timeline" do AdminOrderDetailView: evento de criação
// + eventos de admin_audit_logs do item.

export function CatalogTimelineTab({
    events,
    createdAt,
}: {
    events?: any[] | null
    createdAt?: string | null
}) {
    const auditEvents = Array.isArray(events) ? events : []

    if (auditEvents.length === 0) {
        return (
            <FormSection title="Histórico de Auditoria e Eventos" hasSeparator>
                <IconPlaceholder
                    icon={ClockIcon}
                    containerSize="w-14 h-14 mb-2"
                    iconSize="w-6 h-6"
                    title="Nenhum evento registrado"
                    subtitle="Este item ainda não possui eventos de auditoria."
                />
            </FormSection>
        )
    }

    return (
        <FormSection title="Histórico de Auditoria e Eventos" hasSeparator>
            <div className="space-y-4">
                {createdAt && (
                    <div className="flex items-start gap-3 border-l-2 border-brand-green pl-4 py-1">
                        <div className="flex-1">
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Item Criado</p>
                            <p className="text-xs text-brand-inactive-text">{formatDateTime(createdAt)}</p>
                        </div>
                    </div>
                )}

                {auditEvents.map((ev: any) => (
                    <div
                        key={ev.id}
                        className="flex items-start gap-3 border-l-2 border-brand-border dark:border-dark-border pl-4 py-1"
                    >
                        <div className="flex-1">
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                {ev.action_type || "Ação Administrativa"}
                            </p>
                            <p className="text-xs text-brand-inactive-text">
                                {formatDateTime(ev.created_at)}
                                {ev.admin_name ? ` • por ${ev.admin_name}` : ""}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </FormSection>
    )
}

// ─── Ações de moderação no ActionsDropdown ──────────────────────────────────
// Retorna os DropdownItems (para dentro do ActionsDropdown do form ERP) e os
// modais (renderizados na raiz do detail client). Só aparece para
// produto/serviço com status que exige moderação.

interface CatalogModerationConfig {
    itemId: string
    type: "product" | "service"
    moderationStatus?: string | null
    onDone?: () => void
}

const NEEDS_MODERATION_STATUSES = ["pending_moderation", "flagged", "needs_images", "in_review", "pending"]

export function useCatalogModeration({ itemId, type, moderationStatus, onDone }: CatalogModerationConfig) {
    const [showApproveModal, setShowApproveModal] = useState(false)
    const [showRejectModal, setShowRejectModal] = useState(false)
    const [rejectReason, setRejectReason] = useState("")
    const [isPending, startTransition] = useTransition()

    const typeLabel = type === "product" ? "Produto" : "Serviço"
    const needsModeration = NEEDS_MODERATION_STATUSES.includes(String(moderationStatus || ""))

    const handleApprove = () => {
        startTransition(async () => {
            const result = await approveModeration(itemId, type)
            if (result.success) {
                toast.success(`${typeLabel} aprovado com sucesso!`)
                setShowApproveModal(false)
                onDone?.()
            } else {
                toast.error(result.error || `Erro ao aprovar ${typeLabel.toLowerCase()}`)
            }
        })
    }

    const handleReject = () => {
        if (rejectReason.trim().length < 5) {
            toast.error("O motivo deve ter pelo menos 5 caracteres")
            return
        }
        startTransition(async () => {
            const result = await rejectModeration(itemId, rejectReason.trim(), type)
            if (result.success) {
                toast.success(`${typeLabel} rejeitado com sucesso!`)
                setShowRejectModal(false)
                setRejectReason("")
                onDone?.()
            } else {
                toast.error(result.error || `Erro ao rejeitar ${typeLabel.toLowerCase()}`)
            }
        })
    }

    const dropdownItems = needsModeration ? (
        <>
            <DropdownItem onClick={() => setShowApproveModal(true)} disabled={isPending} className="text-brand-green">
                <CheckCircleIcon size={16} /> Aprovar {typeLabel}
            </DropdownItem>
            <DropdownItem onClick={() => setShowRejectModal(true)} disabled={isPending} className="text-brand-red">
                <TrashIcon size={16} /> Rejeitar {typeLabel}
            </DropdownItem>
        </>
    ) : null

    const modals = (
        <>
            <DefaultModal
                isOpen={showApproveModal}
                onClose={() => setShowApproveModal(false)}
                title={`Aprovar ${typeLabel}`}
                maxWidth="sm"
                footer={
                    <>
                        <Button variant="outline" onClick={() => setShowApproveModal(false)} disabled={isPending}>
                            Cancelar
                        </Button>
                        <Button onClick={handleApprove} isLoading={isPending}>
                            Confirmar Aprovação
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col items-center text-center gap-4 py-4">
                    <div className="w-16 h-16 rounded-full bg-brand-green/10 flex items-center justify-center text-brand-green">
                        <CheckCircleIcon size={32} />
                    </div>
                    <div>
                        <p className="text-brand-dark dark:text-dark-heading font-bold text-lg">
                            Confirmar aprovação?
                        </p>
                        <p className="text-brand-inactive-text dark:text-dark-body text-sm mt-1">
                            O {typeLabel.toLowerCase()} ficará visível imediatamente na vitrine.
                        </p>
                    </div>
                </div>
            </DefaultModal>

            <DefaultModal
                isOpen={showRejectModal}
                onClose={() => {
                    setShowRejectModal(false)
                    setRejectReason("")
                }}
                title={`Rejeitar ${typeLabel}`}
                maxWidth="md"
                footer={
                    <>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowRejectModal(false)
                                setRejectReason("")
                            }}
                            disabled={isPending}
                        >
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={rejectReason.trim().length < 5 || isPending}
                            onClick={handleReject}
                            isLoading={isPending}
                        >
                            Confirmar Rejeição
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                        O item será removido da fila e o parceiro receberá o motivo da rejeição.
                    </p>
                    <Input
                        name="catalog-reject-reason"
                        label="Motivo da rejeição"
                        placeholder="Explique detalhadamente o motivo da rejeição..."
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        multiline
                        rows={3}
                        required
                    />
                </div>
            </DefaultModal>
        </>
    )

    return { dropdownItems, modals }
}
