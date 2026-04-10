"use client"

import React, { useMemo, useRef, useState, useCallback } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useRouter } from "next/navigation"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Button,
  Input,
  Combobox,
  IconPlaceholder,
  FormTextarea,
} from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { SaveIcon, ChevronLeftIcon, ChevronDownIcon, ChevronUpIcon, UserIcon } from "@/lib/icons"
import { useNotification } from "@/hooks/use-notification"
import SelectCustomerSheet from "@/components/erp/clientes/SelectCustomerSheet"
import { createManualTransactionAction } from "@/app/actions/erp/transactions"

type CategoryItem = { id: string; name: string; parent_id: string | null }
type AccountItem = { id: string; name: string; type: string; is_active: boolean }

interface CreateTransactionPageProps {
  partnerId: string
  categories: CategoryItem[]
  accounts: AccountItem[]
}

type ContactType = "customer" | "supplier" | "service" | "employee" | "partner" | "other"

export default function CreateTransactionPage({ partnerId, categories, accounts }: CreateTransactionPageProps) {
  const router = useRouter()
  const { success, error } = useNotification()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isScrolled, setIsScrolled] = useState(false)
  const [activeTab, setActiveTab] = useState("general")
  const [isSaving, setIsSaving] = useState(false)
  const [isCustomerSheetOpen, setIsCustomerSheetOpen] = useState(false)

  const [transactionType, setTransactionType] = useState<"income" | "expense">("income")
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined)
  const [subcategoryId, setSubcategoryId] = useState<string | undefined>(undefined)
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10))
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [competencyDate, setCompetencyDate] = useState(new Date().toISOString().slice(0, 10))
  const [status, setStatus] = useState<"pending" | "paid">("pending")
  const [accountId, setAccountId] = useState<string | undefined>(undefined)
  const [paymentType, setPaymentType] = useState<string>("Pix")
  const [contactType, setContactType] = useState<ContactType>("customer")
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const [notes, setNotes] = useState("")

  const parentCategories = useMemo(() => categories.filter((c) => !c.parent_id), [categories])
  const childCategories = useMemo(() => {
    if (!categoryId) return []
    return categories.filter((c) => c.parent_id === categoryId)
  }, [categories, categoryId])
  const selectedCategoryName = useMemo(() => parentCategories.find((c) => c.id === categoryId)?.name || "Outros", [parentCategories, categoryId])

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
  }, [])

  const parseCurrency = (v: string) => {
    const normalized = v.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")
    const n = Number(normalized)
    return Number.isFinite(n) ? n : 0
  }

  const handleSave = async () => {
    if (!description.trim()) return error("Descrição obrigatória")
    const numericAmount = parseCurrency(amount)
    if (!(numericAmount > 0)) return error("Valor inválido")
    if (contactType === "customer" && !selectedCustomer?.id) return error("Selecione um cliente")

    setIsSaving(true)
    try {
      const res = await createManualTransactionAction({
        partnerId,
        transactionType,
        amount: numericAmount,
        description,
        category: selectedCategoryName,
        categoryId: categoryId || null,
        subcategoryId: subcategoryId || null,
        accountId: accountId || null,
        contactId: contactType === "customer" ? selectedCustomer?.id || null : null,
        contactType,
        paymentType,
        dueDate,
        paymentDate: status === "paid" ? paymentDate : null,
        transactionDate: competencyDate,
        status,
        notes: notes || null,
        origin: "manual",
      })

      if (!res.success) return error(res.error || "Erro ao salvar transação")
      success("Transação criada com sucesso!")
      router.push("/erp/financial/transactions")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <FadeIn>
      <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden relative transition-colors duration-300">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
          <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">
            <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border transition-all duration-300">
              <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
                <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-300 ${isScrolled ? "scale-90" : "scale-100"}`}>
                  <Button variant="filled" onClick={() => router.back()} className="w-10 h-10 p-0 flex items-center justify-center">
                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                  </Button>
                </div>

                <div className="hidden md:flex items-start justify-between">
                  <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                    <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-300 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                      Nova Transação
                    </h1>
                    <div className={`text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                      Registre receitas ou despesas financeiras
                    </div>
                  </div>

                  <div className="hidden md:flex items-center gap-3 shrink-0 ml-3 mb-4">
                    <Button variant="outline" onClick={() => router.back()} disabled={isSaving}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={isSaving}>
                      <SaveIcon className="w-4.5 h-4.5 mr-2" />
                      {isSaving ? "Salvando..." : "Salvar Lançamento"}
                    </Button>
                  </div>
                </div>

                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                  <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                    <TabsTrigger value="general" className="px-0 pb-3">Dados Gerais</TabsTrigger>
                    <TabsTrigger value="attachments" className="px-0 pb-3">Anexos</TabsTrigger>
                    <TabsTrigger value="notes" className="px-0 pb-3">Observações</TabsTrigger>
                  </TabsList>
                </div>
              </div>
            </div>

            <div className="px-4 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
              <div className="grid grid-cols-12 gap-y-10 lg:gap-x-12">
                <div className={activeTab === "general" ? "col-span-12 lg:col-span-8 pr-0 lg:pr-12" : "col-span-12"}>
                  <AnimatePresence mode="wait">
                    <TabsContent value="general" className="mt-0">
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-10">
                        <section>
                          <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Tipo de Transação</h3>
                          <div className="flex flex-col md:flex-row gap-4">
                            <button
                              onClick={() => setTransactionType("income")}
                              className={`flex-1 flex items-center justify-between p-5 rounded-2xl transition-all border ${transactionType === "income" ? "bg-green-50/50 dark:bg-green-900/10 border-brand-green" : "bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border border-brand-border dark:border-dark-border"}`}
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-full border border-brand-border dark:border-dark-border flex items-center justify-center ${transactionType === "income" ? "bg-brand-green text-white" : "bg-brand-gray dark:bg-dark-border/50 text-brand-inactive-text"}`}>
                                  <ChevronDownIcon size={22} strokeWidth={2.5} />
                                </div>
                                <div className="text-left">
                                  <span className={`font-bold text-[15px] ${transactionType === "income" ? "text-brand-green" : "text-brand-dark dark:text-dark-heading"}`}>Receita</span>
                                </div>
                              </div>
                            </button>
                            <button
                              onClick={() => setTransactionType("expense")}
                              className={`flex-1 flex items-center justify-between p-5 rounded-2xl transition-all border ${transactionType === "expense" ? "bg-red-50/50 dark:bg-red-900/10 border-brand-red" : "bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border border-brand-border dark:border-dark-border"}`}
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-full border border-brand-border dark:border-dark-border flex items-center justify-center ${transactionType === "expense" ? "bg-brand-red text-white" : "bg-brand-gray dark:bg-dark-border/50 text-brand-inactive-text"}`}>
                                  <ChevronUpIcon size={22} strokeWidth={2.5} />
                                </div>
                                <div className="text-left">
                                  <span className={`font-bold text-[15px] ${transactionType === "expense" ? "text-brand-red" : "text-brand-dark dark:text-dark-heading"}`}>Despesa</span>
                                </div>
                              </div>
                            </button>
                          </div>
                        </section>

                        <div className="h-px bg-brand-border dark:bg-dark-border w-full" />

                        <section className="space-y-4">
                          <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Detalhes do Lançamento</h3>
                          <Input label="Valor" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="R$ 0,00" />
                          <Input label="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Venda de serviço" />
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Combobox
                              label="Categoria"
                              options={parentCategories.map((c) => ({ value: c.id, label: c.name }))}
                              value={categoryId}
                              onChange={(v: string) => {
                                setCategoryId(v)
                                setSubcategoryId(undefined)
                              }}
                            />
                            <Combobox
                              label="Subcategoria"
                              options={childCategories.map((c) => ({ value: c.id, label: c.name }))}
                              value={subcategoryId}
                              onChange={(v: string) => setSubcategoryId(v)}
                              placeholder="Selecione"
                            />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input type="date" label="Data de Vencimento" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                            <Input type="date" label="Data do Pagamento" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                          </div>
                          <Input type="date" label="Competência" value={competencyDate} onChange={(e) => setCompetencyDate(e.target.value)} />
                        </section>
                      </motion.div>
                    </TabsContent>

                    <TabsContent value="notes" className="mt-0">
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Observações</h3>
                        <FormTextarea
                          name="transaction_notes"
                          label="Observações internas"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          rows={8}
                        />
                      </motion.div>
                    </TabsContent>

                    <TabsContent value="attachments" className="mt-0">
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <IconPlaceholder
                          icon={UserIcon}
                          title="Anexos em breve"
                          subtitle="Você poderá anexar comprovantes nesta aba."
                        />
                      </motion.div>
                    </TabsContent>
                  </AnimatePresence>
                </div>

                {activeTab === "general" && (
                  <div className="hidden lg:block col-span-12 lg:col-span-4 border-l border-brand-border dark:border-dark-border pl-12 space-y-8">
                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                      <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4 mt-2">Status & Conta</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Situação</label>
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            <Button variant={status === "paid" ? "default" : "outline"} onClick={() => setStatus("paid")}>Recebido</Button>
                            <Button variant={status === "pending" ? "default" : "outline"} onClick={() => setStatus("pending")}>Pendente</Button>
                          </div>
                        </div>
                        <Combobox
                          label="Conta Bancária / Caixa"
                          options={accounts.filter(a => a.is_active).map((a) => ({ value: a.id, label: a.name }))}
                          value={accountId}
                          onChange={(v: string) => setAccountId(v)}
                        />
                        <Combobox
                          label="Forma de Pagamento"
                          options={[
                            { value: "Pix", label: "Pix" },
                            { value: "Boleto", label: "Boleto" },
                            { value: "Cartão", label: "Cartão" },
                            { value: "Dinheiro", label: "Dinheiro" },
                          ]}
                          value={paymentType}
                          onChange={(v: string) => setPaymentType(v)}
                        />
                      </div>
                    </div>

                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                      <Combobox
                        label="Tipo de Contato"
                        options={[
                          { value: "customer", label: "Cliente" },
                          { value: "supplier", label: "Fornecedor" },
                          { value: "service", label: "Serviço" },
                          { value: "employee", label: "Funcionário" },
                          { value: "partner", label: "Parceiro" },
                          { value: "other", label: "Outro" },
                        ]}
                        value={contactType}
                        onChange={(v: string) => setContactType(v as ContactType)}
                      />

                      {contactType === "customer" ? (
                        <div className="mt-4">
                          {selectedCustomer ? (
                            <div className="rounded-2xl border border-brand-border dark:border-dark-border p-4">
                              <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{selectedCustomer.name}</div>
                              <div className="text-xs text-brand-inactive-text">{selectedCustomer.email || "Sem email"}</div>
                              <Button variant="outline" className="mt-3" onClick={() => setIsCustomerSheetOpen(true)}>
                                Trocar Cliente
                              </Button>
                            </div>
                          ) : (
                            <IconPlaceholder
                              icon={UserIcon}
                              title="Nenhum cliente selecionado"
                              subtitle="Selecione um cliente para vincular."
                              itemButton={{ text: "Selecionar Cliente", action: () => setIsCustomerSheetOpen(true), variant: "outline" }}
                            />
                          )}
                        </div>
                      ) : (
                        <div className="mt-4">
                          <Input label={`Selecionar ${contactType}`} placeholder="Em breve (sheet dedicada)" disabled />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
            <Button variant="outline" onClick={() => router.back()} disabled={isSaving} className="flex-1 h-[48px]">Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving} className="flex-1 h-[48px]">
              <SaveIcon className="w-4 h-4 mr-2" />
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </Tabs>

        <SelectCustomerSheet
          isOpen={isCustomerSheetOpen}
          onClose={() => setIsCustomerSheetOpen(false)}
          onSelect={(customer) => setSelectedCustomer(customer)}
          partnerId={partnerId}
        />
      </div>
    </FadeIn>
  )
}

