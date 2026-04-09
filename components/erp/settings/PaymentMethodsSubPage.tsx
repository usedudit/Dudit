"use client"

import React, { useState, useEffect, useCallback, useTransition, useRef } from "react"
import { motion } from "framer-motion"
import { Button, Input as FormInput, Checkbox as FormCheckbox, Badge, Spinner, DefaultModal, ActionsDropdown, FormDropdown, MoneyInput, AlertModal, IconPlaceholder } from "@/components/reusable"
import { SearchIcon, PlusIcon, ThreeDotsIcon, CreditCardIcon, MoneyIcon, QRCodeIcon, ChevronLeftIcon } from "@/lib/icons"
import { createPaymentMethodAction, updatePaymentMethodAction, deletePaymentMethodAction } from "@/app/actions/payment-methods"
import { useNotification } from "@/hooks/use-notification"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency } from "@/lib/utils"

interface PaymentMethodsSubPageProps {
  partner: any
  paymentMethods: any[]
  onBack: () => void
}

export function PaymentMethodsSubPage({ partner, paymentMethods, onBack }: PaymentMethodsSubPageProps) {
  const { success: notifySuccess, error: notifyError } = useNotification()
  const [isPending, startTransition] = useTransition()
  const [methods, setMethods] = useState<any[]>(paymentMethods || [])
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [filteredMethods, setFilteredMethods] = useState<any[]>(paymentMethods || [])

  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [editingPayment, setEditingPayment] = useState<any | null>(null)
  const [isSavingPayment, setIsSavingPayment] = useState(false)

  const [isTogglingStatus, setIsTogglingStatus] = useState<Set<string>>(new Set())
  const [isDeletingMethod, setIsDeletingMethod] = useState<Set<string>>(new Set())
  const [methodToDelete, setMethodToDelete] = useState<any>(null)

  const [isScrolled, setIsScrolled] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

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

  const handleSavePaymentMethod = async (data: any) => {
    startTransition(async () => {
      setIsSavingPayment(true)
      try {
        if (editingPayment && editingPayment.id) {
          const res = await updatePaymentMethodAction(editingPayment.id, {
            name: data.name,
            isActive: data.isActive,
            cardBrand: data.cardBrand,
            maxInstallments: data.maxInstallments,
            feeType: data.feeType,
            percentageRate: data.percentageRate,
            fixedAmount: data.fixedAmount,
            receivingDays: data.receivingDays,
            discountPercent: data.discountPercent
          })
          if (res.success) {
            const updatedMethod = {
              ...editingPayment,
              ...data,
              is_active: data.isActive,
              payment_type: data.paymentType // Ensure correct mapping
            }
            setMethods(prev => prev.map(m => m.id === editingPayment.id ? updatedMethod : m))
            notifySuccess("Método atualizado!")
            setPaymentModalOpen(false)
          } else notifyError(res.error || "Erro ao atualizar")
        } else {
          const res = await createPaymentMethodAction({
            partnerId: partner.id,
            ...data
          })
          if (res.success) {
            setMethods(prev => [...prev, res.method])
            notifySuccess("Método adicionado!")
            setPaymentModalOpen(false)
          } else notifyError(res.error || "Erro ao adicionar")
        }
      } catch {
        notifyError("Erro ao salvar método")
      } finally {
        setIsSavingPayment(false)
      }
    })
  }

  const handleDeletePaymentMethod = async (id: string) => {
    setIsDeletingMethod(prev => new Set(prev).add(id))
    setMethodToDelete(null)
    try {
      const res = await deletePaymentMethodAction(id)
      if (res.success) {
        setMethods(prev => prev.filter(m => m.id !== id))
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
    setMethods(prev => prev.map(m => m.id === method.id ? { ...m, is_active: checked } : m))
    setIsTogglingStatus(prev => new Set(prev).add(method.id))

    try {
      const res = await updatePaymentMethodAction(method.id, { isActive: checked })
      if (!res.success) {
        setMethods(prev => prev.map(m => m.id === method.id ? { ...m, is_active: originalStatus } : m))
        notifyError(res.error || "Erro ao alterar status")
      } else {
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
      case "dinheiro": return <MoneyIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
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
          <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border flex-shrink-0 flex items-center justify-center border border-gray-100 dark:border-gray-700">
            {getPaymentIcon(method.payment_type)}
          </div>
          <div className="flex flex-col text-left">
            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5">
              {method.name}
            </span>
            <div className="flex items-center gap-1.5">
              {method.card_brand && (
                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body uppercase">
                  {method.card_brand.replace("_", " ")}
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
            {method.percentage_rate ? `${method.percentage_rate}%` : "-"}
          </span>
          {method.fixed_amount > 0 && (
            <span className="text-[11px] text-brand-inactive-text dark:text-dark-body">
              + {formatCurrency(method.fixed_amount)}
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
        <div className="w-14 h-14 rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border flex-shrink-0 flex items-center justify-center">
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
              <div className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${method.is_active ? "bg-brand-green" : "bg-brand-red"}`}></div>
            )}
          </div>

          <div className="text-xs font-medium text-brand-inactive-text dark:text-dark-body uppercase">
            {method.payment_type?.replace("_", " ") || ""} {method.card_brand ? `• ${method.card_brand.replace("_", " ")}` : ""}
          </div>

          <div className="flex items-end justify-between gap-2 mt-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                Taxa: {method.percentage_rate ? `${method.percentage_rate}%` : "0%"}
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

              {/* Back button — desktop only */}
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
                <div className="hidden md:flex items-center gap-3 flex-shrink-0 ml-3">
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
        <DefaultModal
          isOpen={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          title={editingPayment ? "Editar Método" : "Novo Método"}
        >
          <div className="space-y-6 pt-2 pb-2">
            <FormInput
              label="Nome de exibição"
              placeholder="Ex: Cartão de Crédito Visa"
              value={editingPayment?.name || ""}
              onChange={(e: any) => setEditingPayment((prev: any) => ({ ...prev, name: e.target.value }))}
            />

            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-8">
                <FormDropdown
                  label="Tipo de pagamento"
                  options={[
                    { value: "dinheiro", label: "Dinheiro" },
                    { value: "pix", label: "Pix" },
                    { value: "credito", label: "C. Crédito" },
                    { value: "debito", label: "C. Débito" },
                  ]}
                  value={editingPayment?.payment_type || "credito"}
                  setValue={(val) => setEditingPayment((prev: any) => ({ ...prev, payment_type: val }))}
                />
              </div>
              <div className="col-span-4">
                <MoneyInput
                  label="Desconto (%)"
                  value={editingPayment?.discount_percent || 0}
                  onChange={(val: number) => setEditingPayment((prev: any) => ({ ...prev, discount_percent: val }))}
                />
              </div>
            </div>

            {(editingPayment?.payment_type === "credito" || editingPayment?.payment_type === "debito") && (
              <div className="grid grid-cols-2 gap-4">
                <FormDropdown
                  label="Bandeira"
                  options={[
                    { value: "visa", label: "Visa" },
                    { value: "mastercard", label: "Mastercard" },
                    { value: "elo", label: "Elo" },
                    { value: "hipercard", label: "Hipercard" },
                    { value: "amex", label: "Amex" },
                    { value: "other", label: "Outra" },
                  ]}
                  value={editingPayment?.card_brand || "visa"}
                  setValue={(val) => setEditingPayment((prev: any) => ({ ...prev, card_brand: val }))}
                />
                {editingPayment?.payment_type === "credito" && (
                  <FormInput
                    label="Parcelas máx."
                    type="number"
                    value={editingPayment?.max_installments || 1}
                    onChange={(e: any) => setEditingPayment((prev: any) => ({ ...prev, max_installments: parseInt(e.target.value) }))}
                  />
                )}
              </div>
            )}

            <div className="bg-brand-gray/30 dark:bg-dark-border/10 rounded-xl p-5 border border-brand-border dark:border-dark-border">
              <h4 className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider mb-4">Taxas da Operadora</h4>
              <div className="grid grid-cols-2 gap-4">
                <MoneyInput
                  label="Taxa (%)"
                  value={editingPayment?.percentage_rate || 0}
                  onChange={(val: number) => setEditingPayment((prev: any) => ({ ...prev, percentage_rate: val }))}
                />
                <MoneyInput
                  label="Fixa (R$)"
                  value={editingPayment?.fixed_amount || 0}
                  onChange={(val: number) => setEditingPayment((prev: any) => ({ ...prev, fixed_amount: val }))}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-2">
              <Button
                className="w-full h-12 text-base font-bold bg-brand-green hover:bg-brand-green/90 text-white rounded-full shadow-lg shadow-brand-green/20"
                onClick={() => handleSavePaymentMethod({
                  name: editingPayment?.name || "",
                  paymentType: editingPayment?.payment_type || "credito",
                  cardBrand: editingPayment?.card_brand,
                  maxInstallments: editingPayment?.max_installments,
                  feeType: "both",
                  percentageRate: editingPayment?.percentage_rate || 0,
                  fixedAmount: editingPayment?.fixed_amount || 0,
                  receivingDays: editingPayment?.receiving_days || 0,
                  discountPercent: editingPayment?.discount_percent || 0,
                  isActive: editingPayment?.is_active ?? true
                })}
                disabled={isSavingPayment}
              >
                {isSavingPayment ? "Salvando..." : "Salvar"}
              </Button>
              <Button
                variant="outline"
                className="w-full h-12 text-base font-bold bg-transparent border-brand-border dark:border-dark-border text-brand-inactive-text dark:text-dark-body rounded-full"
                onClick={() => setPaymentModalOpen(false)}
                disabled={isSavingPayment}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </DefaultModal>

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
