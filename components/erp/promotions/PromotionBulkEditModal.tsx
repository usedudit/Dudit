"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button, Input, RadioButton, MoneyInput } from "@/components/reusable"
import { DatePicker } from "@/components/reusable/DatePicker"
import DefaultModal from "@/components/reusable/DefaultModal"
import SelectCustomerSheet from "@/components/erp/clientes/SelectCustomerSheet"
import {
    CalendarIcon, Users, TagIcon, ChevronLeftIcon, TrashIcon, UserIcon
} from "@/lib/icons"

interface PromotionBulkEditModalProps {
    isOpen: boolean
    onClose: () => void
    selectedCount: number
    partnerId: string
    scopeData: { customers: any[] }
    onApply: (fields: any) => Promise<void>
}

type EditView = 'menu' | 'validity' | 'scope' | 'limits'

const transition: any = { duration: 0.2, ease: [0.4, 0, 0.2, 1] }
const variantsAnim: any = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0, transition },
    exit: { opacity: 0, x: -20, transition }
}

const BulkActionCard = ({ icon, label, onClick }: { icon: any, label: string, onClick: () => void }) => (
    <div
        onClick={onClick}
        className="flex flex-col items-center justify-center p-6 rounded-2xl border border-brand-border bg-white hover:bg-brand-gray dark:bg-dark-surface dark:border-dark-border dark:hover:bg-dark-border/50 cursor-pointer transition-all gap-3 text-center"
    >
        <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border flex items-center justify-center">
            {React.createElement(icon, { className: "w-6 h-6 text-brand-dark dark:text-dark-heading" })}
        </div>
        <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">{label}</span>
    </div>
)

export default function PromotionBulkEditModal({
    isOpen,
    onClose,
    selectedCount,
    partnerId,
    scopeData,
    onApply
}: PromotionBulkEditModalProps) {
    const [view, setView] = useState<EditView>('menu')
    const [isApplying, setIsApplying] = useState(false)

    // Form states
    const [startsAt, setStartsAt] = useState("")
    const [endsAt, setEndsAt] = useState("")
    const [customerScope, setCustomerScope] = useState<"all" | "specific">("all")
    const [customerIds, setCustomerIds] = useState<string[]>([])
    const [priority, setPriority] = useState("")
    const [minSpendAmount, setMinSpendAmount] = useState("")
    const [usageLimit, setUsageLimit] = useState("")
    const [usageLimitPerCustomer, setUsageLimitPerCustomer] = useState("")

    // Selector sheets
    const [isCustomersSheetOpen, setIsCustomersSheetOpen] = useState(false)
    const [custSearch, setCustSearch] = useState("")

    useEffect(() => {
        if (!isOpen) {
            setTimeout(() => {
                setView('menu')
                setStartsAt("")
                setEndsAt("")
                setCustomerScope("all")
                setCustomerIds([])
                setPriority("")
                setMinSpendAmount("")
                setUsageLimit("")
                setUsageLimitPerCustomer("")
            }, 300)
        }
    }, [isOpen])

    const handleApply = async () => {
        setIsApplying(true)
        try {
            const fields: any = {}
            if (view === 'validity') {
                fields.startsAt = startsAt ? new Date(startsAt).toISOString() : null
                fields.endsAt = endsAt ? new Date(endsAt).toISOString() : null
            } else if (view === 'scope') {
                fields.customerScope = customerScope
                fields.customerIds = customerScope === 'specific' ? customerIds : []
            } else if (view === 'limits') {
                if (priority !== "") fields.priority = parseInt(priority)
                if (minSpendAmount !== "") fields.minSpendAmount = minSpendAmount === "" ? null : parseFloat(minSpendAmount)
                if (usageLimit !== "") fields.usageLimit = usageLimit === "" ? null : parseInt(usageLimit)
                if (usageLimitPerCustomer !== "") fields.usageLimitPerCustomer = usageLimitPerCustomer === "" ? null : parseInt(usageLimitPerCustomer)
            }

            await onApply(fields)
            onClose()
        } catch (error) {
            console.error(error)
        } finally {
            setIsApplying(false)
        }
    }

    const selectedCustomers = scopeData.customers.filter((c: any) => customerIds.includes(c.id))
    const searchedCustomers = custSearch.trim()
        ? selectedCustomers.filter((c: any) =>
            c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
            String(c.email || "").toLowerCase().includes(custSearch.toLowerCase())
        )
        : selectedCustomers

    const renderContent = () => {
        switch (view) {
            case 'menu':
                return (
                    <div className="grid grid-cols-3 gap-4 pt-2">
                        <BulkActionCard icon={CalendarIcon} label="Alterar Vigência" onClick={() => setView('validity')} />
                        <BulkActionCard icon={Users} label="Alterar Público" onClick={() => setView('scope')} />
                        <BulkActionCard icon={TagIcon} label="Alterar Limitações" onClick={() => setView('limits')} />
                    </div>
                )
            case 'validity':
                return (
                    <div className="space-y-5 pt-2 max-w-md mx-auto">
                        <DatePicker
                            label="Início da Vigência"
                            value={startsAt}
                            onChange={(d) => setStartsAt(d ? d.toISOString() : "")}
                        />
                        <DatePicker
                            label="Fim da Vigência"
                            value={endsAt}
                            onChange={(d) => setEndsAt(d ? d.toISOString() : "")}
                        />
                    </div>
                )
            case 'scope':
                return (
                    <div className="space-y-5 pt-2">
                        <div className="flex flex-col gap-3">
                            <RadioButton
                                checked={customerScope === 'all'}
                                onChange={() => setCustomerScope('all')}
                                label="Todos os Clientes"
                                name="customerScope"
                                value="all"
                            />
                            <RadioButton
                                checked={customerScope === 'specific'}
                                onChange={() => setCustomerScope('specific')}
                                label="Clientes Específicos"
                                name="customerScope"
                                value="specific"
                            />
                        </div>

                        {customerScope === 'specific' && (
                            <div className="space-y-4 pt-2">
                                <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
                                    <div className="w-full sm:w-72">
                                        <Input
                                            name="custSearch"
                                            placeholder="Buscar nos selecionados..."
                                            value={custSearch}
                                            onChange={(e) => setCustSearch(e.target.value)}
                                            className="mb-0 h-[38px]"
                                            variant="full-rounded"
                                            label=""
                                        />
                                    </div>
                                    <Button variant="outline" type="button" onClick={() => setIsCustomersSheetOpen(true)} className="h-[38px] text-xs font-semibold">
                                        Selecionar Clientes
                                    </Button>
                                </div>

                                {searchedCustomers.length > 0 ? (
                                    <div className="border border-brand-border dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface divide-y divide-brand-border dark:divide-dark-border max-h-[220px] overflow-y-auto custom-scrollbar">
                                        {searchedCustomers.map((cust: any) => (
                                            <div key={cust.id} className="flex items-center justify-between gap-3 p-3">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-8 h-8 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                        <UserIcon size={16} className="text-brand-inactive-text" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{cust.name}</p>
                                                        {cust.email && <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">{cust.email}</p>}
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    onClick={() => setCustomerIds(customerIds.filter((id: string) => id !== cust.id))}
                                                    className="text-red-500 hover:text-red-600 hover:bg-red-50 border-0 h-8 w-8 shrink-0"
                                                >
                                                    <TrashIcon size={16} />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 border border-dashed border-brand-border dark:border-dark-border rounded-xl bg-gray-50/50 dark:bg-dark-surface/30">
                                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhum cliente selecionado.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        <SelectCustomerSheet
                            isOpen={isCustomersSheetOpen}
                            onClose={() => setIsCustomersSheetOpen(false)}
                            partnerId={partnerId}
                            selectedCustomerIds={customerIds}
                            onSelect={(customer) => {
                                if (customerIds.includes(customer.id)) {
                                    setCustomerIds(customerIds.filter((cId) => cId !== customer.id))
                                } else {
                                    setCustomerIds([...customerIds, customer.id])
                                }
                            }}
                        />
                    </div>
                )
            case 'limits':
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        <Input
                            label="Prioridade de Execução"
                            name="priority"
                            type="number"
                            placeholder="Manter atual"
                            value={priority}
                            onChange={(e) => setPriority(e.target.value)}
                        />
                        <MoneyInput
                            label="Mínimo de Compra (R$)"
                            name="minSpendAmount"
                            placeholder="Manter atual"
                            value={minSpendAmount}
                            onChange={(val) => setMinSpendAmount(val === 0 ? "" : String(val))}
                        />
                        <Input
                            label="Limite Global de Usos"
                            name="usageLimit"
                            type="number"
                            placeholder="Manter atual"
                            value={usageLimit}
                            onChange={(e) => setUsageLimit(e.target.value)}
                        />
                        <Input
                            label="Limite de Usos por Cliente"
                            name="usageLimitPerCustomer"
                            type="number"
                            placeholder="Manter atual"
                            value={usageLimitPerCustomer}
                            onChange={(e) => setUsageLimitPerCustomer(e.target.value)}
                        />
                    </div>
                )
            default:
                return null
        }
    }

    const viewTitle = view === 'menu' ? 'Ações em Massa' :
        view === 'validity' ? 'Alterar Vigência' :
        view === 'scope' ? 'Alterar Público' : 'Alterar Limitações'

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            title={viewTitle}
            leftAction={view !== 'menu' ? (
                <Button variant="filled" className="h-10 w-10 p-0 flex items-center justify-center shrink-0" onClick={() => setView('menu')}>
                    <ChevronLeftIcon className="w-6 h-6" />
                </Button>
            ) : undefined}
        >
            <div className="flex flex-col h-full">
                <div className="flex-1 min-h-[250px] relative">
                    <AnimatePresence mode="wait">
                        <motion.div key={view} variants={variantsAnim} initial="initial" animate="animate" exit="exit">
                            {renderContent()}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {view !== 'menu' && (
                    <footer className="shrink-0 border-t border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface mt-6">
                        <div className="flex items-center gap-3">
                            <Button variant="outline" className="h-12 flex-1" onClick={onClose} disabled={isApplying}>Cancelar</Button>
                            <Button className="h-12 flex-1" onClick={handleApply} disabled={isApplying}>
                                {isApplying ? 'Aplicando...' : `Aplicar em ${selectedCount}`}
                            </Button>
                        </div>
                    </footer>
                )}
            </div>
        </DefaultModal>
    )
}
