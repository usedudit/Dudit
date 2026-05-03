"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button, FormDropdown, Input, Separator, ThreeDotsLoader, IconPlaceholder } from "@/components/reusable"
import { ChevronLeftIcon, TruckIcon, Users, SaveIcon, UserIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { listEmployeeCommissionsAction, upsertEmployeeCommissionAction, type CommissionSettingsRow } from "@/app/actions/erp/commissions"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { useToast } from "@/hooks/use-toast"
import React from "react"

const sellerOptions = [
    { value: "none", label: "Sem comissão" },
    { value: "percentage_sale", label: "Percentual por venda (%)" },
    { value: "fixed_per_sale", label: "Valor fixo por venda" },
]

const deliveryOptions = [
    { value: "fixed_per_delivery", label: "Valor fixo por entrega" },
    { value: "percentage_delivery_fee", label: "Percentual da taxa de entrega (%)" },
]

export function CommissionsSubPage({ partnerId, onBack }: { partnerId: string; onBack: () => void }) {
    const [loading, setLoading] = useState(true)
    const [savingAll, setSavingAll] = useState(false)
    const [savingId, setSavingId] = useState<string | null>(null)
    const [rows, setRows] = useState<CommissionSettingsRow[]>([])
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const { toast } = useToast()

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const handleSaveRow = async (row: CommissionSettingsRow) => {
        setSavingId(row.partnerUserId)
        try {
            const result = await upsertEmployeeCommissionAction({
                partnerId,
                partnerUserId: row.partnerUserId,
                role: row.commissionRole,
                commissionType: row.commissionType,
                value: row.value,
                metadata: row.metadata || {},
            })
            if (result.success) {
                toast({ title: "Sucesso", description: `Comissão de ${row.name} salva.` })
            } else {
                toast({ title: "Erro", description: result.error || "Erro ao salvar comissão.", variant: "destructive" })
            }
        } catch (e) {
            toast({ title: "Erro", description: "Erro inesperado ao salvar.", variant: "destructive" })
        } finally {
            setSavingId(null)
        }
    }

    const handleSaveAll = async () => {
        setSavingAll(true)
        try {
            const promises = rows.map(row => upsertEmployeeCommissionAction({
                partnerId,
                partnerUserId: row.partnerUserId,
                role: row.commissionRole,
                commissionType: row.commissionType,
                value: row.value,
                metadata: row.metadata || {},
            }))
            await Promise.all(promises)
            toast({ title: "Sucesso", description: "Todas as comissões foram salvas." })
        } catch (e) {
            toast({ title: "Erro", description: "Algumas comissões não puderam ser salvas.", variant: "destructive" })
        } finally {
            setSavingAll(false)
        }
    }

    async function load() {
        setLoading(true)
        const result = await listEmployeeCommissionsAction(partnerId)
        if (result.success) setRows(result.items)
        setLoading(false)
    }

    useEffect(() => {
        void load()
    }, [partnerId])

    const sortedRows = useMemo(() => {
        return [...rows].sort((a, b) => {
            if (a.commissionRole === b.commissionRole) return a.name.localeCompare(b.name)
            return a.commissionRole === "seller" ? -1 : 1
        })
    }, [rows])

    if (loading) return <FadeIn className="p-6">Carregando comissões...</FadeIn>

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh - 65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

                    {/* Sticky Header */}
                    <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface transition-all duration-500 ease-in-out">
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6">

                            {/* Back button - desktop only */}
                            <div className={`absolute -left-12 top-3 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                            </div>

                            {/* Title row */}
                            <div className="hidden md:flex items-start justify-between">
                                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                    <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                        <span className="truncate">Comissões</span>
                                    </h1>

                                    <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100 mt-1"}`}>
                                        Defina as regras de comissionamento para sua equipe de vendas e entregas.
                                    </div>
                                </div>

                                {/* Primary Action - Desktop */}
                                <div className={`hidden md:flex transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button
                                        leftIcon={<SaveIcon size={18} />}
                                        onClick={handleSaveAll}
                                        isLoading={savingAll}
                                    >
                                        Salvar Alterações
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="px-4 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                        {loading ? (
                            <div className="flex justify-center p-12">
                                <ThreeDotsLoader />
                            </div>
                        ) : sortedRows.length === 0 ? (
                            <div className="flex flex-col items-center justify-center text-center min-h-[300px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/Comissoes.png"
                                    imageAlt="Sem membros"
                                    title="Nenhuma configuração de comissão"
                                    subtitle="Adicione membros à sua equipe para configurar suas comissões."
                                />
                            </div>
                        ) : (
                            <>
                                {/* Desktop Table */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="w-full text-left border-separate border-spacing-0">
                                        <thead>
                                            <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                <th className="py-3 px-6 rounded-l-lg text-[13px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">Membro</th>
                                                <th className="py-3 px-4 text-[13px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">Tipo de Comissão</th>
                                                <th className="py-3 px-4 text-[13px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider text-center">Valor</th>
                                                <th className="py-3 px-6 rounded-r-lg text-[13px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider text-right">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                            {sortedRows.map((row) => {
                                                const isSeller = row.commissionRole === "seller"
                                                const options = isSeller ? sellerOptions : deliveryOptions
                                                const valueLabel = row.commissionType.includes("percentage") ? "Percentual (%)" : "Fixo (R$)"

                                                return (
                                                    <tr key={`${row.partnerUserId}:${row.commissionRole}`} className="group hover:bg-brand-gray/50 dark:hover:bg-dark-border/20 transition-colors">
                                                        <td className="py-4 px-6">
                                                            <div className="flex items-center gap-4">
                                                                <UserProfileImage
                                                                    fullName={row.name || "Usuário"}
                                                                    className="w-10 h-10 text-[14px]"
                                                                />
                                                                <div className="flex flex-col min-w-0">
                                                                    <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                                                                        {row.name}
                                                                    </span>
                                                                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body flex items-center gap-1">
                                                                        {isSeller ? <Users size={12} /> : <TruckIcon size={12} />}
                                                                        {row.roleLabel}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="py-4 px-4">
                                                            <div className="max-w-[200px]">
                                                                <FormDropdown
                                                                    value={row.commissionType}
                                                                    setValue={(value) => {
                                                                        setRows((prev) =>
                                                                            prev.map((item) =>
                                                                                item.partnerUserId === row.partnerUserId && item.commissionRole === row.commissionRole
                                                                                    ? { ...item, commissionType: value as any, value: value === "none" ? 0 : item.value }
                                                                                    : item,
                                                                            ),
                                                                        )
                                                                    }}
                                                                    options={options}
                                                                    className="h-9 text-xs"
                                                                />
                                                            </div>
                                                        </td>
                                                        <td className="py-4 px-4">
                                                            <div className="max-w-[120px] mx-auto">
                                                                <Input
                                                                    value={String(row.value)}
                                                                    onChange={(e) => {
                                                                        const next = e.target.value
                                                                        setRows((prev) =>
                                                                            prev.map((item) =>
                                                                                item.partnerUserId === row.partnerUserId && item.commissionRole === row.commissionRole
                                                                                    ? { ...item, value: Number(next || 0) }
                                                                                    : item,
                                                                            ),
                                                                        )
                                                                    }}
                                                                    disabled={row.commissionType === "none"}
                                                                    className="h-9 text-center font-bold text-sm"
                                                                    placeholder="0.00"
                                                                />
                                                                <p className="text-[10px] text-center text-brand-inactive-text mt-1 uppercase font-bold">{valueLabel}</p>
                                                            </div>
                                                        </td>
                                                        <td className="py-4 px-6 text-right">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => handleSaveRow(row)}
                                                                isLoading={savingId === row.partnerUserId}
                                                                className="h-8 text-xs font-bold"
                                                            >
                                                                Salvar
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile List */}
                                <div className="md:hidden flex flex-col">
                                    {sortedRows.map((row, idx) => {
                                        const isSeller = row.commissionRole === "seller"
                                        const options = isSeller ? sellerOptions : deliveryOptions
                                        const valueLabel = row.commissionType.includes("percentage") ? "Percentual (%)" : "Fixo (R$)"

                                        return (
                                            <React.Fragment key={`${row.partnerUserId}:${row.commissionRole}`}>
                                                <div className="py-6 space-y-4">
                                                    <div className="flex items-center gap-4">
                                                        <UserProfileImage
                                                            fullName={row.name || "Usuário"}
                                                            className="w-12 h-12 text-[16px]"
                                                        />
                                                        <div className="flex flex-col min-w-0">
                                                            <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                                                                {row.name}
                                                            </h3>
                                                            <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium flex items-center gap-1">
                                                                {isSeller ? <Users size={14} /> : <TruckIcon size={14} />}
                                                                {row.roleLabel}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="col-span-2">
                                                            <FormDropdown
                                                                label="Tipo de comissão"
                                                                value={row.commissionType}
                                                                setValue={(value) => {
                                                                    setRows((prev) =>
                                                                        prev.map((item) =>
                                                                            item.partnerUserId === row.partnerUserId && item.commissionRole === row.commissionRole
                                                                                ? { ...item, commissionType: value as any, value: value === "none" ? 0 : item.value }
                                                                                : item,
                                                                        ),
                                                                    )
                                                                }}
                                                                options={options}
                                                            />
                                                        </div>
                                                        <Input
                                                            label={valueLabel}
                                                            value={String(row.value)}
                                                            onChange={(e) => {
                                                                const next = e.target.value
                                                                setRows((prev) =>
                                                                    prev.map((item) =>
                                                                        item.partnerUserId === row.partnerUserId && item.commissionRole === row.commissionRole
                                                                            ? { ...item, value: Number(next || 0) }
                                                                            : item,
                                                                    ),
                                                                )
                                                            }}
                                                            disabled={row.commissionType === "none"}
                                                            className="font-bold"
                                                        />
                                                        <div className="flex items-end">
                                                            <Button
                                                                className="w-full h-11"
                                                                onClick={() => handleSaveRow(row)}
                                                                isLoading={savingId === row.partnerUserId}
                                                            >
                                                                Salvar
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                                {idx < sortedRows.length - 1 && <Separator className="opacity-50" />}
                                            </React.Fragment>
                                        )
                                    })}
                                </div>
                            </>
                        )}
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
                            onClick={handleSaveAll}
                            isLoading={savingAll}
                            className="flex-1 h-[48px] font-bold"
                            leftIcon={<SaveIcon size={18} />}
                        >
                            Salvar Tudo
                        </Button>
                    </div>
                </div>
            </div>
        </FadeIn>
    )
}
