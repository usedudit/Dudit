"use client"

import React, { useMemo, useState, useEffect } from "react"
import { SearchIcon, PlusIcon, XIcon, CheckCircleIcon, ServiceIcon } from "@/lib/icons"
import { Badge, Button, Input, IconPlaceholder, ThreeDotsLoader } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency } from "@/lib/utils/formatters"
import { getERPServicesPageAction } from "@/app/actions/erp/servicos"

interface ServiceItem {
    id: string
    name: string
    image?: string | null
    images?: string[] | null
    price?: number
    is_active?: boolean
}

interface SelectVideoServiceSheetProps {
    isOpen: boolean
    onClose: () => void
    partnerId: string
    selectedId: string | null
    onSave: (id: string | null, name?: string) => void
}

export default function SelectVideoServiceSheet({
    isOpen,
    onClose,
    partnerId,
    selectedId,
    onSave,
}: SelectVideoServiceSheetProps) {
    const [search, setSearch] = useState("")
    const [tempSelected, setTempSelected] = useState<string | null>(null)
    const [services, setServices] = useState<ServiceItem[]>([])
    const [loading, setLoading] = useState(false)
    const isMobile = useMediaQuery("(max-width: 1023px)")

    useEffect(() => {
        if (isOpen) {
            setTempSelected(selectedId)
            setSearch("")
            setLoading(true)
            getERPServicesPageAction(partnerId, { cursor: null, limit: 200 })
                .then((res) => {
                    if (res.success) setServices(res.items || [])
                })
                .finally(() => setLoading(false))
        }
    }, [isOpen, partnerId, selectedId])

    const filteredServices = useMemo(() => {
        const term = search.trim().toLowerCase()
        const sorted = [...services].sort((a, b) => {
            const aInactive = a.is_active === false ? 1 : 0
            const bInactive = b.is_active === false ? 1 : 0
            if (aInactive !== bInactive) return aInactive - bInactive
            return a.name.localeCompare(b.name)
        })
        if (!term) return sorted
        return sorted.filter((item) => item.name.toLowerCase().includes(term))
    }, [services, search])

    const selectedService = tempSelected ? services.find((s) => s.id === tempSelected) : null

    const handleSave = () => {
        onSave(tempSelected, selectedService?.name)
        onClose()
    }

    const content = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Selecionar Serviço</h2>
                <Button variant="filled" onClick={onClose} size="icon" className="hidden lg:flex">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            <div className="z-10 shrink-0 border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <Input
                    label=""
                    name="serviceSearch"
                    placeholder="Buscar por nome..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                    className="mb-0"
                    variant="full-rounded"
                />
            </div>

            <div className="custom-scrollbar flex-1 overflow-y-auto p-0">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <ThreeDotsLoader />
                    </div>
                ) : filteredServices.length > 0 ? (
                    <div className="flex flex-col px-2 pb-2">
                        {filteredServices.map((service) => {
                            const disabled = service.is_active === false
                            const isSelected = tempSelected === service.id
                            const imageUrl = (service.images?.[0] || service.image)
                                ? getR2ImageUrl(service.images?.[0] || service.image!, "thumbnail")
                                : "https://img.dudit.com.br/static/Placeholder.png"

                            return (
                                <div
                                    key={service.id}
                                    role={disabled ? undefined : "button"}
                                    tabIndex={disabled ? undefined : 0}
                                    onClick={disabled ? undefined : () => setTempSelected(service.id)}
                                    onKeyDown={
                                        disabled ? undefined : (e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault()
                                                setTempSelected(service.id)
                                            }
                                        }
                                    }
                                    className={`group flex items-center gap-4 border-b border-brand-border p-3.5 transition-colors last:border-0 dark:border-dark-border ${disabled ? "cursor-not-allowed opacity-55" : isSelected ? "bg-brand-primary/5 dark:bg-brand-primary/10" : "cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-border/40"}`}
                                >
                                    <img
                                        src={imageUrl}
                                        alt={service.name}
                                        className={`h-12 w-12 shrink-0 rounded-full border border-brand-border dark:border-dark-border object-cover`}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <span className="truncate text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                {service.name}
                                            </span>
                                            <Badge variant={service.is_active === false ? "gray" : "green"} className="whitespace-nowrap scale-90 shrink-0">
                                                {service.is_active === false ? "Inativo" : "Ativo"}
                                            </Badge>
                                        </div>
                                        <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                            {service.price != null ? formatCurrency(service.price) : "Sem valor"}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        {!disabled && isSelected ? (
                                            <div className="flex h-8 w-8 items-center justify-center text-brand-green">
                                                <CheckCircleIcon size={18} />
                                            </div>
                                        ) : !disabled ? (
                                            <div className="flex h-8 w-8 items-center justify-center text-brand-inactive-text opacity-0 transition-opacity group-hover:opacity-100">
                                                <PlusIcon size={18} />
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <div className="px-4 py-12">
                        <IconPlaceholder
                            icon={ServiceIcon}
                            title="Nenhum serviço encontrado"
                            subtitle="Tente outro termo de busca."
                        />
                    </div>
                )}
            </div>

            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center gap-4">
                    <Button variant="outline" className="h-12 flex-1" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button className="h-12 flex-1" onClick={handleSave}>
                        {tempSelected ? "Selecionar" : "Limpar seleção"}
                    </Button>
                </div>
            </footer>
        </div>
    )

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose}>
                {content}
            </BottomSheet>
        )
    }

    return (
        <Portal>
            <div
                className={`fixed inset-0 z-[80] bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
                onClick={onClose}
            >
                <div
                    className={`fixed right-4 top-4 bottom-4 z-[81] w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {content}
                </div>
            </div>
        </Portal>
    )
}
