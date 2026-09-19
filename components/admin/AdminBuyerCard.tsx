"use client"

import React from "react"
import { EditIcon } from "@/lib/icons"
import { Button, Badge, FormSection, ListItem } from "@/components/reusable"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import Link from "next/link"

interface AdminBuyerCardProps {
    buyer: {
        full_name?: string | null
        avatar_url?: string | null
        email?: string | null
        phone?: string | null
        cpf?: string | null
        risk_score?: number | null
        [key: string]: any
    }
    buyerId?: string | null
    customerName?: string | null
    onAdjustRisk?: () => void
}

export function AdminBuyerCard({ buyer, buyerId, customerName, onAdjustRisk }: AdminBuyerCardProps) {
    const displayName = customerName || buyer.full_name || "Consumidor"

    return (
        <FormSection title="Dados do Comprador" hasSeparator>
            <div className="flex items-center justify-between mb-4">
                <ListItem
                    left={
                        <UserProfileImage
                            fullName={customerName || buyer.full_name || "Cliente"}
                            imageUrl={buyer.avatar_url}
                            className="w-12 h-12 text-lg shrink-0"
                        />
                    }
                    title={displayName}
                    description={buyer.email || "Sem e-mail cadastrado"}
                    className="border-0 bg-transparent px-0 hover:bg-transparent"
                />
                <div className="flex items-center gap-2">
                    <Badge variant={(buyer.risk_score || 0) >= 50 ? "red" : (buyer.risk_score || 0) >= 25 ? "orange" : "gray"}>
                        Risco: {buyer.risk_score || 0} pts
                    </Badge>
                    {buyerId && onAdjustRisk && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onAdjustRisk}
                            leftIcon={<EditIcon size={14} />}
                        >
                            Ajustar Risco
                        </Button>
                    )}
                </div>
            </div>

            <div className="space-y-2 text-sm pt-2">
                {buyer.phone && (
                    <div className="flex justify-between">
                        <span className="text-brand-inactive-text">Telefone</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading">{buyer.phone}</span>
                    </div>
                )}
                {buyer.cpf && (
                    <div className="flex justify-between">
                        <span className="text-brand-inactive-text">CPF</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading">{buyer.cpf}</span>
                    </div>
                )}
                {buyerId && (
                    <div className="pt-2 flex items-center justify-between">
                        <span className="text-brand-inactive-text text-xs">ID do Usuário</span>
                        <span className="font-mono text-xs text-brand-dark dark:text-dark-heading">{buyerId}</span>
                    </div>
                )}
                {buyerId && (
                    <div className="pt-2">
                        <Link
                            href={`/ddt-admin/users?view=${buyerId}`}
                            className="text-xs font-bold text-brand-green hover:underline"
                        >
                            Ver ficha completa do usuário no Admin →
                        </Link>
                    </div>
                )}
            </div>
        </FormSection>
    )
}
