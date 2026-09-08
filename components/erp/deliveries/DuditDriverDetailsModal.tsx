"use client"

import React from "react"
import { ListItem } from "@/components/reusable"
import {
    PhoneIcon,
    WhatsappIcon,
    TruckIcon,
} from "@/lib/icons"
import { formatDateTime } from "@/lib/utils"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import type { DuditPlatformDriver } from "./types"

interface DuditDriverDetailsModalProps {
    isOpen: boolean
    onClose: () => void
    driver: DuditPlatformDriver | null
    deliveryNumber?: number | string | null
}

export default function DuditDriverDetailsModal({
    isOpen,
    onClose,
    driver,
    deliveryNumber,
}: DuditDriverDetailsModalProps) {
    if (!driver) return null

    const cleanedPhone = driver.phone ? String(driver.phone).replace(/\D/g, "") : ""
    const whatsappUrl = cleanedPhone ? `https://wa.me/55${cleanedPhone}` : null

    return (
        <div className="space-y-6 pt-2">
            <ListItem
                icon={TruckIcon}
                title={
                    <div>
                        <p className="font-bold text-sm text-brand-dark dark:text-dark-heading">{driver.fullName || "Entregador Parceiro"}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                            <TruckIcon className="w-3 h-3 text-brand-green" />
                            <span className="text-xs text-brand-green font-medium">Rede Dudit</span>
                        </div>
                    </div>
                }
                left={
                    <UserProfileImage
                        fullName={driver.fullName || "Entregador"}
                        imageUrl={driver.avatarUrl}
                        className="w-12 h-12"
                    />
                }
                className="border-0 bg-transparent px-0"
            />

            {driver.phone && (
                <div className="space-y-2">
                    <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading">
                        Contato Direto com o Entregador:
                    </span>
                    <div className="grid grid-cols-2 gap-3">
                        <a
                            href={`tel:${driver.phone}`}
                            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-brand-gray dark:hover:bg-dark-border/40 font-bold text-xs text-brand-dark dark:text-dark-heading transition-colors"
                        >
                            <PhoneIcon size={14} className="text-brand-green" />
                            Ligar ({driver.phone})
                        </a>

                        {whatsappUrl && (
                            <a
                                href={whatsappUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors"
                            >
                                <WhatsappIcon size={14} />
                                Abrir WhatsApp
                            </a>
                        )}
                    </div>
                </div>
            )}

            {(driver.acceptedAt || driver.pickedUpAt) && (
                <div className="p-3.5 rounded-xl bg-brand-gray/40 dark:bg-dark-border/10 border border-brand-border dark:border-dark-border space-y-1.5 text-xs text-brand-dark dark:text-dark-heading">
                    {driver.acceptedAt && (
                        <div className="flex items-center justify-between">
                            <span className="text-brand-inactive-text dark:text-dark-body">Oferta aceita em:</span>
                            <span className="font-semibold">{formatDateTime(driver.acceptedAt)}</span>
                        </div>
                    )}
                    {driver.pickedUpAt && (
                        <div className="flex items-center justify-between">
                            <span className="text-brand-inactive-text dark:text-dark-body">Retirado na loja em:</span>
                            <span className="font-semibold">{formatDateTime(driver.pickedUpAt)}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
