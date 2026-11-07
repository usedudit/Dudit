"use client"

import React from "react"
import { StoreIcon } from "@/lib/icons"
import { IconPlaceholder, SidebarCard } from "@/components/reusable"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import Link from "next/link"

interface AdminStoreCardProps {
    store: {
        logo_url?: string | null
        name?: string | null
        risk_score?: number | null
        phone?: string | null
        id?: string | null
        cnpj?: string | null
        [key: string]: any
    }
    fallbackStoreId?: string | null
    linkToPartner?: boolean
}

export function AdminStoreCard({ store, fallbackStoreId, linkToPartner = true }: AdminStoreCardProps) {
    const storeId = store.id || fallbackStoreId

    return (
        <SidebarCard hasTopStrip hasSeparator title="Dados da Loja">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border/50 border border-brand-border dark:border-dark-border flex items-center justify-center overflow-hidden shrink-0">
                    {store.logo_url ? (
                        <img src={getR2ImageUrl(store.logo_url)} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <IconPlaceholder
                            icon={StoreIcon}
                            containerSize="w-12 h-12"
                            iconSize="w-6 h-6"
                        />
                    )}
                </div>
                <div className="min-w-0">
                    <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading truncate">
                        {store.name || "Loja Parceira"}
                    </h3>
                    <span className="text-xs text-brand-inactive-text">
                        Pontuação de Risco: <strong>{store.risk_score || 0} pts</strong>
                    </span>
                </div>
            </div>

            <div className="space-y-2 text-sm">
                {store.phone && (
                    <div className="flex justify-between">
                        <span className="text-brand-inactive-text">Telefone</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading">{store.phone}</span>
                    </div>
                )}
                {store.cnpj && (
                    <div className="flex justify-between">
                        <span className="text-brand-inactive-text">CNPJ</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading">{store.cnpj}</span>
                    </div>
                )}
                {storeId && (
                    <div className="flex justify-between text-xs">
                        <span className="text-brand-inactive-text">ID da Loja</span>
                        <span className="font-mono text-brand-dark dark:text-dark-heading">{storeId.slice(0, 8)}...</span>
                    </div>
                )}
                {storeId && linkToPartner && (
                    <div className="pt-2">
                        <Link
                            href={`/ddt-admin/stores?view=${storeId}`}
                            className="text-xs font-bold text-brand-green hover:underline"
                        >
                            Ver ficha completa da loja →
                        </Link>
                    </div>
                )}
            </div>
        </SidebarCard>
    )
}
