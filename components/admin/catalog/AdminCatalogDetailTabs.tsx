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
import { HistoryTimeline, type HistoryEntry } from "@/components/erp/shared/HistoryTimeline"
import { useAdminActionModal } from "../AdminActionModal"

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

export function CatalogTimelineTab({
    events,
    createdAt,
}: {
    events?: HistoryEntry[] | null
    createdAt?: string | null
}) {
    const auditEvents = Array.isArray(events) ? events : []

    return (
        <FormSection title="Histórico de Auditoria e Eventos" hasSeparator>
            <HistoryTimeline
                entries={auditEvents}
                emptyMessage="Este item ainda não possui eventos de auditoria."
            />
        </FormSection>
    )
}

// ─── Ações de moderação no ActionsDropdown ──────────────────────────────────
// Retorna os DropdownItems (para dentro do ActionsDropdown do form ERP) e o
// modal de ação admin (renderizado na raiz do detail client). Só aparece para
// produto/serviço com status que exige moderação.

interface CatalogModerationConfig {
    itemId: string
    type: "product" | "service"
    moderationStatus?: string | null
    onDone?: () => void
}

const NEEDS_MODERATION_STATUSES = ["pending_moderation", "flagged", "needs_images", "in_review", "pending"]

export function useCatalogModeration({ itemId, type, moderationStatus, onDone }: CatalogModerationConfig) {
    const { modal: actionModal, runAction } = useAdminActionModal()

    const typeLabel = type === "product" ? "Produto" : "Serviço"
    const needsModeration = NEEDS_MODERATION_STATUSES.includes(String(moderationStatus || ""))

    const handleApprove = async () => {
        await runAction({
            title: `Aprovar ${typeLabel}`,
            description: `O ${typeLabel.toLowerCase()} ficará visível imediatamente na vitrine.`,
            changedFields: ["Status de moderação: Aprovado"],
            force: true,
            confirmLabel: "Aprovar",
            notifyLabel: "Enviar notificação ao vendedor pelo Dudit",
            runner: async (payload) => {
                const result = await approveModeration(itemId, type, {
                    reason: payload.reason || null,
                    riskScore: payload.riskScore,
                    notifySeller: payload.notifySeller,
                })
                if (result.success) {
                    toast.success(`${typeLabel} aprovado com sucesso!`)
                    onDone?.()
                    return { success: true }
                }
                return { success: false, error: result.error }
            },
        })
    }

    const handleReject = async () => {
        await runAction({
            title: `Rejeitar ${typeLabel}`,
            description: `O ${typeLabel.toLowerCase()} será rejeitado e não aparecerá na vitrine.`,
            changedFields: ["Status de moderação: Rejeitado"],
            requireReason: true,
            confirmLabel: "Rejeitar",
            notifyLabel: "Enviar notificação ao vendedor pelo Dudit",
            runner: async (payload) => {
                const result = await rejectModeration(itemId, payload.reason, type, {
                    reason: payload.reason,
                    riskScore: payload.riskScore,
                    notifySeller: payload.notifySeller,
                })
                if (result.success) {
                    toast.success(`${typeLabel} rejeitado com sucesso!`)
                    onDone?.()
                    return { success: true }
                }
                return { success: false, error: result.error }
            },
        })
    }

    const dropdownItems = needsModeration ? (
        <>
            <DropdownItem onClick={handleApprove} className="text-brand-green">
                <CheckCircleIcon size={16} /> Aprovar {typeLabel}
            </DropdownItem>
            <DropdownItem onClick={handleReject} className="text-brand-red">
                <TrashIcon size={16} /> Rejeitar {typeLabel}
            </DropdownItem>
        </>
    ) : null

    return { dropdownItems, modals: actionModal }
}
