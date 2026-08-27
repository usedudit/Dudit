"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { DefaultModal, ListItem } from "@/components/reusable"
import { Package, WrenchIcon, ChevronRightIcon } from "@/lib/icons"

interface QuickAnnounceModalProps {
    isOpen: boolean
    onClose: () => void
    userProfile?: any
}

export function QuickAnnounceModal({ isOpen, onClose, userProfile }: QuickAnnounceModalProps) {
    const router = useRouter()

    const handleSelect = (type: "product" | "service") => {
        onClose()
        if (userProfile) {
            if (type === "product") {
                router.push("/erp/produtos?create=true")
            } else {
                router.push("/erp/servicos?create=true")
            }
        } else {
            router.push(`/auth/login?mode=partner&announce=${type}`)
        }
    }

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            title="O que você deseja anunciar?"
            description="Escolha uma opção para começar a vender na Dudit hoje mesmo"
            maxWidth="md"
        >
            <div className="space-y-3 py-1">
                <ListItem
                    icon={Package}
                    title="Produto ou Desapego"
                    description="Venda itens novos, usados, eletrônicos, roupas ou produtos da sua loja"
                    right={<ChevronRightIcon className="text-brand-inactive-text w-5 h-5 shrink-0" />}
                    onClick={() => handleSelect("product")}
                    className="p-4 rounded-2xl border border-brand-border dark:border-dark-border hover:border-brand-green/50 dark:hover:border-brand-green/40 hover:bg-brand-green-light/10 dark:hover:bg-brand-green/5 transition-all cursor-pointer"
                />

                <ListItem
                    icon={WrenchIcon}
                    title="Serviço ou Atendimento"
                    description="Divulgue seus serviços, agendamentos, consultoria, manutenções ou procedimentos"
                    right={<ChevronRightIcon className="text-brand-inactive-text w-5 h-5 shrink-0" />}
                    onClick={() => handleSelect("service")}
                    className="p-4 rounded-2xl border border-brand-border dark:border-dark-border hover:border-brand-green/50 dark:hover:border-brand-green/40 hover:bg-brand-green-light/10 dark:hover:bg-brand-green/5 transition-all cursor-pointer"
                />
            </div>
        </DefaultModal>
    )
}
