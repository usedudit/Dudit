"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { motion } from "framer-motion"
import { Button, Input as FormInput, Checkbox as FormCheckbox, Badge, Spinner, ActionsDropdown, AlertModal, IconPlaceholder } from "@/components/reusable"
import { SearchIcon, PlusIcon, ThreeDotsIcon, CreditCardIcon, MoneyIcon, QRCodeIcon, ChevronLeftIcon } from "@/lib/icons"
import { getPaymentMethodsAction, updatePaymentMethodAction, deletePaymentMethodAction } from "@/app/actions/payment-methods"
import { useNotification } from "@/hooks/use-notification"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency } from "@/lib/utils"
import { PaymentMethodDialog } from "@/components/erp/payment-method-dialog"

const PAYMENT_METHODS_VERSION_PREFIX = "payment-methods-version:"
const PAYMENT_METHODS_UPDATED_EVENT = "payment-methods-updated"

interface PaymentMethodsSubPageProps {
    partner: any
    paymentMethods: any[]
    onBack: () => void
}

export function PaymentMethodsSubPage({ partner, paymentMethods, onBack }: PaymentMethodsSubPageProps) {
    const { success: notifySuccess, error: notifyError } = useNotification()
    const [methods, setMethods] = useState<any[]>(paymentMethods || [])
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [filteredMethods, setFilteredMethods] = useState<any[]>(paymentMethods || [])

    const [paymentModalOpen, setPaymentModalOpen] = useState(false)
    const [editingPayment, setEditingPayment] = useState<any | null>(null)

    const [isTogglingStatus, setIsTogglingStatus] = useState<Set<string>>(new Set())
    const [isDeletingMethod, setIsDeletingMethod] = useState<Set<string>>(new Set())
    const [methodToDelete, setMethodToDelete] = useState<any>(null)

    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const notifyPaymentMethodsChanged = useCallback((nextMethods: any[]) => {
        if (typeof window === "undefined") return
        const signature = JSON.stringify(
            (nextMethods || []).map((method) => ({
                id: method.id,
                name: method.name,
                type: method.type,
                is_active: method.is_active,
                updated_at: method.updated_at || null,
            }))
        )
        window.localStorage.setItem(`${PAYMENT_METHODS_VERSION_PREFIX}${partner.id}`, signature)
        window.dispatchEvent(new CustomEvent(PAYMENT_METHODS_UPDATED_EVENT))
    }, [partner.id])

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearch(search), 300)
        return () => clearTimeout(handler)
    }, [search])

    useEffect(() => {
        if (!debouncedSearch) {
            setFilteredMethods(methods)
            return
        }
        const term = debouncedSearch.toLowerCase()
        setFilteredMethods(methods.filter(m =>
            m.name?.toLowerCase().includes(term) ||
            m.payment_type?.toLowerCase().includes(term) ||
            m.card_brand?.toLowerCase().includes(term)
        ))
    }, [debouncedSearch, methods])

    const handleDeletePaymentMethod = async (id: string) => {
        setIsDeletingMethod(prev => new Set(prev).add(id))
        setMethodToDelete(null)
        try {
            const res = await deletePaymentMethodAction(id)
            if (res.success) {
                const nextMethods = methods.filter(m => m.id !== id)
                setMethods(nextMethods)
                notifyPaymentMethodsChanged(nextMethods)
                notifySuccess("Método removido com sucesso!")
            } else {
                notifyError(res.error || "Erro ao remover método")
            }
        } catch {
            notifyError("Erro inesperado ao remover o método de pagamento")
        } finally {
            setIsDeletingMethod(prev => {
                const next = new Set(prev)
                next.delete(id)
                return next
            })
        }
    }

    const togglePaymentStatus = async (method: any, checked: boolean) => {
        const originalStatus = method.is_active
        const optimisticMethods = methods.map(m => m.id === method.id ? { ...m, is_active: checked } : m)
        setMethods(optimisticMethods)
        setIsTogglingStatus(prev => new Set(prev).add(method.id))

        try {
            const res = await updatePaymentMethodAction(method.id, { isActive: checked })
            if (!res.success) {
                setMethods(prev => prev.map(m => m.id === method.id ? { ...m, is_active: originalStatus } : m))
                notifyError(res.error || "Erro ao alterar status")
            } else {
                notifyPaymentMethodsChanged(optimisticMethods)
                notifySuccess(`Método ${checked ? 'ativado' : 'desativado'} com sucesso!`)
            }
        } catch {
            setMethods(prev => prev.map(m => m.id === method.id ? { ...m, is_active: originalStatus } : m))
            notifyError("Erro inesperado ao alterar status")
        } finally {
            setIsTogglingStatus(prev => {
                const next = new Set(prev)
                next.delete(method.id)
                return next
            })
        }
    }

    const getPaymentIcon = (type: string) => {
        switch (type) {
            case "pix": return <QRCodeIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
            case "dinheiro":
            case "cash":
                return <MoneyIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
            default: return <CreditCardIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
        }
    }

    const PaymentRow = ({ method, onToggleStatus, onEdit, onDelete }: any) => (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="group hover:bg-brand-gray dark:hover:bg-dark-border/20 transition-colors bg-white dark:bg-dark-background border-b border-brand-border dark:border-dark-border"
        >
            <td className="p-3 pl-6 w-12">
                <FormCheckbox checked={false} onChange={() => { }} />
            </td>
            <td className="p-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-gray-100 dark:border-gray-700">
                        {getPaymentIcon(method.payment_type)}
                    </div>
                    <div className="flex flex-col text-left">
                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5">
                            {method.name}
                        </span>
                        <div className="flex items-center gap-1.5">
                            {method.card_brand && (
                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body uppercase">
                                    {method.card_brand.split(";").map((b: string) => b.trim().replace("_", " ")).join(", ")}
                                </span>
                            )}
                            {method.card_brand && method.max_installments && <span className="text-[10px] text-brand-border dark:text-dark-border">•</span>}
                            {method.max_installments && (
                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                    Até {method.max_installments}x
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </td>
            <td className="p-3">
                <Badge variant="gray" className="capitalize text-[11px] px-2 py-0.5">{method.payment_type?.replace("_", " ") || ""}</Badge>
            </td>
            <td className="p-3">
                <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                    {method.discount_percent ? `${method.discount_percent}%` : "-"}
                </span>
            </td>
            <td className="p-3">
                <div className="flex flex-col">
                    <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                        {(method.fee_percent ?? method.percentage_rate) ? `${method.fee_percent ?? method.percentage_rate}%` : "-"}
                    </span>
                    {(method.fee_fixed ?? method.fixed_amount) > 0 && (
                        <span className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                            + {formatCurrency(method.fee_fixed ?? method.fixed_amount)}
                        </span>
                    )}
                </div>
            </td>
            <td className="p-3 text-center">
                <div className="flex justify-center">
                    {isTogglingStatus.has(method.id) ? (
                        <Spinner size={16} className="text-brand-dark dark:text-dark-heading" />
                    ) : (
                        <FormCheckbox
                            checked={method.is_active}
                            onChange={(checked) => onToggleStatus(method, checked)}
                        />
                    )}
                </div>
            </td>
            <td className="p-3 text-center">
                <div className="flex justify-center">
                    {isDeletingMethod.has(method.id) ? (
                        <Spinner size={16} className="text-brand-red" />
                    ) : (
                        <ActionsDropdown
                            onEdit={() => onEdit(method)}
                            onDelete={() => setMethodToDelete(method)}
                            trigger={
                                <Button variant="outline" size="icon" className="w-[36px] h-[36px] p-0 flex items-center justify-center bg-transparent border-opacity-40">
                                    <ThreeDotsIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-heading" />
                                </Button>
                            }
                        />
                    )}
                </div>
            </td>
        </motion.tr>
    )

    const PaymentMobileItem = ({ method, onToggleStatus, onEdit, onDelete }: any) => (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-5 border-b border-brand-border dark:border-dark-border last:border-0 cursor-pointer"
            onClick={() => onEdit(method)}
        >
            <div className="flex items-start gap-4 h-auto px-4">
                <div className="w-14 h-14 rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border shrink-0 flex items-center justify-center">
                    {getPaymentIcon(method.payment_type)}
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                    <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                            {method.name}
                        </h3>
                        {isTogglingStatus.has(method.id) || isDeletingMethod.has(method.id) ? (
                            <Spinner size={12} className="mt-1" />
                        ) : (
                            <div className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${method.is_active ? "bg-brand-green" : "bg-brand-red"}`}></div>
                        )}
                    </div>

                    <div className="text-xs font-medium text-brand-inactive-text dark:text-dark-body uppercase">
                        {method.payment_type?.replace("_", " ") || ""} {method.card_brand ? `• ${method.card_brand.split(";").map((b: string) => b.trim().replace("_", " ")).join(", ")}` : ""}
                    </div>

                    <div className="flex items-end justify-between gap-2 mt-0.5">
                        <div className="flex items-center gap-2">
                            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                Taxa: {(method.fee_percent ?? method.percentage_rate) ? `${method.fee_percent ?? method.percentage_rate}%` : "0%"}
                            </span>
                            <span className="text-brand-inactive-text dark:text-dark-border">•</span>
                            <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                Desc: {method.discount_percent ? `${method.discount_percent}%` : "0%"}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    )

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">
                    {/* Sticky Header */}
                    <div className={`sticky top-0 z-30 w-full bg-white dark:bg-dark-surface transition-all duration-500 ease-in-out ${isScrolled ? "py-2 md:py-3 shadow-sm" : ""}`}>
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6">

                            {/* Back button - desktop only */}
                            <div className={`absolute -left-12 top-1/2 -translate-y-1/2 h-full hidden xl:flex items-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                            </div>

                            {/* Title row */}
                            <div className="flex items-start justify-between py-6">
                                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                    <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                        <span className="truncate">Formas de Pagamento</span>
                                        <Badge variant="gray" className="text-sm font-normal h-fit whitespace-nowrap px-2 py-0.5 ml-2">
                                            {methods.length}
                                        </Badge>
                                    </h1>

                                    <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                        Gerencie os métodos de pagamentos aceitos em sua loja
                                    </div>
                                </div>

                                {/* Desktop action buttons */}
                                <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                    <Button onClick={() => { setEditingPayment(null); setPaymentModalOpen(true) }}>
                                        <PlusIcon className="w-5 h-5 mr-2" />
                                        Novo Método
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content Body */}
                    <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                        {/* Search & Filter Row */}
                        <div className="flex flex-col md:flex-row mb-6">
                            <FormInput
                                name="searchPayment"
                                placeholder="Buscar método..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="h-[42px] flex-1"
                                variant="full-rounded"
                                label=""
                                prefix={<SearchIcon className="w-4 h-4 text-brand-inactive-text" />}
                            />
                            <div className="flex gap-2">
                                <Button variant="outline" className="md:hidden flex-1" onClick={() => { setEditingPayment(null); setPaymentModalOpen(true) }}>
                                    <PlusIcon className="w-4 h-4 mr-2" /> Novo
                                </Button>
                            </div>
                        </div>

                        <div className="w-full bg-white dark:bg-dark-surface rounded-xl relative border border-brand-border dark:border-dark-border overflow-hidden">
                            {/* Table - Desktop */}
                            <div className="hidden md:block overflow-x-auto no-scrollbar">
                                {filteredMethods.length > 0 ? (
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-brand-border dark:border-dark-border bg-brand-gray/50 dark:bg-dark-border/10">
                                                <th className="p-4 pl-8 w-12"><FormCheckbox checked={false} onChange={() => { }} /></th>
                                                <th className="p-4 text-xs font-bold text-brand-inactive-text uppercase tracking-wider">Método</th>
                                                <th className="p-4 text-xs font-bold text-brand-inactive-text uppercase tracking-wider">Tipo</th>
                                                <th className="p-4 text-xs font-bold text-brand-inactive-text uppercase tracking-wider">Desconto</th>
                                                <th className="p-4 text-xs font-bold text-brand-inactive-text uppercase tracking-wider">Taxas</th>
                                                <th className="p-4 text-xs font-bold text-brand-inactive-text uppercase tracking-wider text-center">Status</th>
                                                <th className="p-4 text-xs font-bold text-brand-inactive-text uppercase tracking-wider text-center">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredMethods.map((method) => (
                                                <PaymentRow
                                                    key={method.id}
                                                    method={method}
                                                    onToggleStatus={togglePaymentStatus}
                                                    onEdit={(m: any) => { setEditingPayment(m); setPaymentModalOpen(true) }}
                                                    onDelete={handleDeletePaymentMethod}
                                                />
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="py-20 flex flex-col items-center justify-center text-center">
                                        <IconPlaceholder
                                            icon={CreditCardIcon}
                                            title={search ? "Nenhum resultado encontrado" : "Nenhum método cadastrado"}
                                            subtitle={search ? "Tente buscar por outro termo ou limpe o filtro." : "Adicione métodos de pagamento como Pix, Dinheiro ou Cartões para começar a vender."}
                                            itemButton={!search ? {
                                                text: "Adicionar Primeiro Método",
                                                action: () => setPaymentModalOpen(true),
                                                variant: "outline"
                                            } : undefined}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* List - Mobile */}
                            <div className="md:hidden">
                                {filteredMethods.length > 0 ? (
                                    <div className="divide-y divide-brand-border dark:divide-dark-border">
                                        {filteredMethods.map((method) => (
                                            <PaymentMobileItem
                                                key={method.id}
                                                method={method}
                                                onToggleStatus={togglePaymentStatus}
                                                onEdit={(m: any) => { setEditingPayment(m); setPaymentModalOpen(true) }}
                                                onDelete={handleDeletePaymentMethod}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-12 flex flex-col items-center justify-center text-center">
                                        <IconPlaceholder
                                            icon={CreditCardIcon}
                                            title={search ? "Nada encontrado" : "Vazio"}
                                            subtitle={search ? "Busque novamente." : "Comece agora."}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Payment Modal */}
                <PaymentMethodDialog
                    open={paymentModalOpen}
                    onClose={async (shouldReload?: boolean) => {
                        setPaymentModalOpen(false)
                        if (shouldReload) {
                            const result = await getPaymentMethodsAction(partner.id)
                            if (result.methods) {
                                setMethods(result.methods)
                                notifyPaymentMethodsChanged(result.methods)
                            }
                        }
                    }}
                    partnerId={partner.id}
                    editingMethod={editingPayment}
                />

                <AlertModal
                    isOpen={!!methodToDelete}
                    onClose={() => setMethodToDelete(null)}
                    title="Excluir Método?"
                    description={`Tem certeza que deseja excluir o método "${methodToDelete?.name}"? Esta ação não pode ser desfeita.`}
                    confirmText="Sim, Excluir"
                    cancelText="Cancelar"
                    onConfirm={() => handleDeletePaymentMethod(methodToDelete.id)}
                    isDestructive
                    isLoading={isDeletingMethod.has(methodToDelete?.id)}
                />
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
                        onClick={() => { setEditingPayment(null); setPaymentModalOpen(true) }}
                        className="flex-1 h-[48px] font-bold"
                    >
                        Novo Método
                    </Button>
                </div>
            </div>
        </FadeIn>
    )
}
