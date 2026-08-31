"use client"

import React from "react"
import { DefaultModal, Button, Badge } from "@/components/reusable"
import {
    PhoneIcon,
    WhatsappIcon,
    TruckIcon,
    MapPinIcon,
    CheckCircleIcon,
    UserIcon,
    ClockIcon,
} from "@/lib/icons"
import { formatDateTime } from "@/lib/utils"

export interface DuditPlatformDriver {
    id: string
    fullName: string
    phone?: string | null
    avatarUrl?: string | null
    vehicleType?: string | null
    vehiclePlate?: string | null
    city?: string | null
    totalDeliveries?: number
    status?: string | null
    isPlatformDriver?: boolean
    isPendingAcceptance?: boolean
    acceptedAt?: string | null
    pickedUpAt?: string | null
}

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

    const getStatusBadge = () => {
        if (driver.isPendingAcceptance) {
            return (
                <Badge variant="orange" icon={<ClockIcon size={12} />}>
                    Aguardando Aceite
                </Badge>
            )
        }
        switch (driver.status) {
            case "accepted":
                return (
                    <Badge variant="blue" icon={<ClockIcon size={12} />}>
                        Aceita • A caminho da loja
                    </Badge>
                )
            case "picked_up":
                return (
                    <Badge variant="purple" icon={<TruckIcon size={12} />}>
                        Pedido Coletado na Loja
                    </Badge>
                )
            case "out_for_delivery":
                return (
                    <Badge variant="orange" icon={<TruckIcon size={12} />}>
                        Em Rota de Entrega
                    </Badge>
                )
            case "delivered":
                return (
                    <Badge variant="green" icon={<CheckCircleIcon size={12} />}>
                        Entrega Concluída
                    </Badge>
                )
            default:
                return (
                    <Badge variant="green" icon={<CheckCircleIcon size={12} />}>
                        Entregador Atribuído
                    </Badge>
                )
        }
    }

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            title="Detalhes do Entregador Dudit"
            icon={
                <img
                    src="https://img.dudit.com.br/static/Logo.png"
                    alt="Dudit"
                    className="w-5 h-5 object-contain"
                    onError={(e: any) => { e.currentTarget.style.display = "none" }}
                />
            }
            maxWidth="md"
        >
            <div className="space-y-6 pt-2">
                {/* CABEÇALHO DO MOTORISTA */}
                <div className="flex items-center gap-4 bg-brand-gray/50 dark:bg-dark-border/20 p-4 rounded-2xl border border-brand-border dark:border-dark-border">
                    <div className="w-16 h-16 rounded-full bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border overflow-hidden shrink-0 flex items-center justify-center">
                        {driver.avatarUrl ? (
                            <img
                                src={driver.avatarUrl}
                                alt={driver.fullName}
                                className="w-full h-full object-cover"
                                onError={(e: any) => { e.currentTarget.src = "https://img.dudit.com.br/static/Placeholder.png" }}
                            />
                        ) : (
                            <div className="w-full h-full bg-brand-green/10 flex items-center justify-center text-brand-green font-bold text-xl">
                                {driver.fullName?.charAt(0)?.toUpperCase() || "E"}
                            </div>
                        )}
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-green bg-brand-green/10 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                <img src="https://img.dudit.com.br/static/Logo.png" alt="Dudit" className="w-2.5 h-2.5 object-contain" />
                                Rede Dudit
                            </span>
                        </div>
                        <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading truncate">
                            {driver.fullName || "Entregador Parceiro"}
                        </h3>
                        <div className="mt-1">
                            {getStatusBadge()}
                        </div>
                    </div>
                </div>

                {/* INFORMAÇÕES DE CONTATO E VEÍCULO */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                        <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body block mb-1">
                            Tipo de Veículo
                        </span>
                        <div className="flex items-center gap-1.5 font-bold text-sm text-brand-dark dark:text-dark-heading">
                            <TruckIcon size={14} className="text-brand-green shrink-0" />
                            <span>{driver.vehicleType || "Moto / Veículo"}</span>
                        </div>
                        {driver.vehiclePlate && (
                            <span className="text-[10px] text-brand-inactive-text font-mono mt-0.5 block">
                                Placa: {driver.vehiclePlate}
                            </span>
                        )}
                    </div>

                    <div className="p-3.5 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                        <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body block mb-1">
                            Entregas Realizadas
                        </span>
                        <div className="flex items-center gap-1.5 font-bold text-sm text-brand-dark dark:text-dark-heading">
                            <CheckCircleIcon size={14} className="text-brand-green shrink-0" />
                            <span>{driver.totalDeliveries || 0} concluídas</span>
                        </div>
                    </div>

                    {driver.city && (
                        <div className="p-3.5 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface col-span-2">
                            <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body block mb-1">
                                Região de Atuação
                            </span>
                            <div className="flex items-center gap-1.5 font-bold text-sm text-brand-dark dark:text-dark-heading">
                                <MapPinIcon size={14} className="text-brand-green shrink-0" />
                                <span>{driver.city}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* BOTÕES DE CONTATO DIRETO */}
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

                {/* TIMELINE RÁPIDA DE HORÁRIOS */}
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
        </DefaultModal>
    )
}
