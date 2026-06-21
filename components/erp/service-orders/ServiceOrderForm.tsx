"use client"

import React, { useState, useCallback, useRef } from "react"
import { Button, Input, FormSection, DatePicker, ThreeDotsLoader, Tabs, TabsList, TabsTrigger, Badge } from "@/components/reusable"
import { ChevronLeftIcon, SaveIcon } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import {
  createServiceOrderAction,
  updateServiceOrderAction,
  addServicesToOrderAction,
  addProductsToOrderAction,
  syncServiceOrderServicesAction,
  syncServiceOrderProductsAction,
} from "@/app/actions/erp/service-orders"
import SelectCustomerSheet from "@/components/erp/clientes/SelectCustomerSheet"
import SelectServiceSheet from "./SelectServiceSheet"
import SelectProductSheet from "./SelectProductSheet"

interface ServiceOrderFormProps {
  partnerId: string
  onBack: () => void
  onSaved: (data?: any) => void
  editData?: any
}

const SidebarCard = ({ children, className = "", hasTopStrip = false }: { children: React.ReactNode; className?: string; hasTopStrip?: boolean }) => (
  <div className={`bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors ${className}`}>
    {hasTopStrip && <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>}
    {children}
  </div>
)

export default function ServiceOrderForm({ partnerId, onBack, onSaved, editData }: ServiceOrderFormProps) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("general")
  const [title, setTitle] = useState(editData?.title || "")
  const [description, setDescription] = useState(editData?.description || "")
  const [internalNotes, setInternalNotes] = useState(editData?.internal_notes || "")
  const [customerId, setCustomerId] = useState(editData?.customer_id || "")
  const [customerName, setCustomerName] = useState(editData?.customer_snapshot?.name || "")
  const [expectedDate, setExpectedDate] = useState(editData?.expected_completion_date || "")
  const [assignedUserId, setAssignedUserId] = useState(editData?.assigned_user_id || "")
  const [services, setServices] = useState<any[]>(editData?.services || [])
  const [products, setProducts] = useState<any[]>(editData?.products || [])
  const [saving, setSaving] = useState(false)
  const [showCustomerSheet, setShowCustomerSheet] = useState(false)
  const [showServiceSheet, setShowServiceSheet] = useState(false)
  const [showProductSheet, setShowProductSheet] = useState(false)

  const [isScrolled, setIsScrolled] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }
  }, [])

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ description: "Título é obrigatório" })
      return
    }

    setSaving(true)

    if (editData) {
      // 1. Update OS details
      const res = await updateServiceOrderAction(partnerId, editData.id, {
        title: title.trim(),
        description: description.trim() || "",
        internal_notes: internalNotes.trim() || "",
        customer_id: customerId || null,
        expected_completion_date: expectedDate || null,
        assigned_user_id: assignedUserId || null,
      })

      if (!res.success) {
        toast({ description: res.error || "Erro ao atualizar OS" })
        setSaving(false)
        return
      }

      // 2. Sync services
      const svcRes = await syncServiceOrderServicesAction(
        partnerId,
        editData.id,
        services.map((s: any) => ({ service_id: s.service_id || s.id, quantity: Number(s.quantity || 1) }))
      )
      if (!svcRes.success) {
        toast({ description: svcRes.error || "Erro ao atualizar serviços" })
      }

      // 3. Sync products
      const prodRes = await syncServiceOrderProductsAction(
        partnerId,
        editData.id,
        products.map((p: any) => ({ product_id: p.product_id || p.id, quantity: Number(p.quantity || 1), variant_id: p.variant_id }))
      )
      if (!prodRes.success) {
        toast({ description: prodRes.error || "Erro ao atualizar produtos" })
      }

      toast({ description: `OS #${editData.order_number} atualizada com sucesso!` })
      onSaved(res.data)
    } else {
      // Create OS (original logic)
      const res = await createServiceOrderAction(partnerId, {
        title: title.trim(),
        description: description.trim() || undefined,
        internal_notes: internalNotes.trim() || undefined,
        customer_id: customerId || undefined,
        expected_completion_date: expectedDate || undefined,
        assigned_user_id: assignedUserId || undefined,
      })

      if (!res.success) {
        toast({ description: res.error || "Erro ao criar OS" })
        setSaving(false)
        return
      }

      const orderId = res.data.id

      // Add services after creation
      if (services.length > 0) {
        const svcRes = await addServicesToOrderAction(
          partnerId,
          orderId,
          services.map((s: any) => ({ service_id: s.service_id || s.id, quantity: s.quantity || 1 }))
        )
        if (!svcRes.success) {
          toast({ description: "OS criada, mas erro ao adicionar serviços" })
        }
      }

      // Add products after creation
      if (products.length > 0) {
        const prodRes = await addProductsToOrderAction(
          partnerId,
          orderId,
          products.map((p: any) => ({ product_id: p.product_id || p.id, quantity: p.quantity || 1, variant_id: p.variant_id }))
        )
        if (!prodRes.success) {
          toast({ description: "OS criada, mas erro ao adicionar produtos" })
        }
      }

      toast({ description: `OS #${res.orderNumber} criada com sucesso!` })
      onSaved(res.data)
    }
    setSaving(false)
  }

  const handleSelectCustomer = (customer: any) => {
    setCustomerId(customer.id)
    setCustomerName(customer.name)
    setShowCustomerSheet(false)
  }

  const handleAddService = (svc: any) => {
    setServices((prev) => {
      if (prev.some((s) => (s.service_id || s.id) === svc.id)) return prev
      return [...prev, { ...svc, service_id: svc.id, quantity: 1 }]
    })
  }

  const handleRemoveService = (id: string) => {
    setServices((prev) => prev.filter((s) => (s.service_id || s.id) !== id))
  }

  const handleAddProduct = (prod: any) => {
    setProducts((prev) => {
      if (prev.some((p) => (p.product_id || p.id) === prod.id)) return prev
      return [...prev, { ...prod, product_id: prod.id, quantity: 1 }]
    })
  }

  const handleRemoveProduct = (id: string) => {
    setProducts((prev) => prev.filter((p) => (p.product_id || p.id) !== id))
  }

  const pageTitle = editData ? `Editar OS #${editData.order_number}` : "Nova Ordem de Serviço"
  const dateCreated = editData
    ? new Date(editData.created_at).toLocaleDateString("pt-BR")
    : ""

  return (
    <FadeIn>
      <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
          <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">
            {/* Sticky Header */}
            <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border transition-all duration-300">
              <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <Button variant="outline" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center rounded-full">
                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                  </Button>
                  <div className="min-w-0 flex flex-col">
                    <h1 className="font-bold text-xl md:text-2xl text-brand-dark dark:text-dark-heading flex items-center gap-3 truncate">
                      {pageTitle}
                      {editData && (
                        <Badge variant="orange" className="text-xs font-normal px-2 py-0.5 whitespace-nowrap">
                          Editando
                        </Badge>
                      )}
                    </h1>
                    <p className="text-brand-inactive-text dark:text-dark-body text-xs md:text-sm font-medium mt-0.5 truncate">
                      {editData ? `Criada em ${dateCreated}` : "Preencha as informações da nova ordem de serviço"}
                    </p>
                  </div>
                </div>

                {/* Desktop Action Buttons */}
                <div className="hidden md:flex items-center gap-3 shrink-0">
                  <Button variant="outline" onClick={onBack} disabled={saving}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSave} disabled={saving} leftIcon={<SaveIcon size={18} />}>
                    {saving ? "Salvando..." : editData ? "Salvar" : "Criar OS"}
                  </Button>
                </div>
              </div>

              {/* Tabs list inside header */}
              <div className="max-w-[1300px] mx-auto px-4 md:px-6">
                <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                  <TabsTrigger value="general">Dados gerais</TabsTrigger>
                  <TabsTrigger value="services">Serviços</TabsTrigger>
                  <TabsTrigger value="products">Produtos</TabsTrigger>
                </TabsList>
              </div>
            </div>

            {/* Tab Content */}
            <div className="px-4 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
              <AnimatePresence mode="wait">
                {activeTab === "general" && (
                  <FadeIn key="general" className="grid grid-cols-12 gap-y-8 md:gap-y-0 w-full">
                    {/* Left Column (Main Form fields) */}
                    <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 space-y-6">
                      <FormSection title="Título">
                        <Input
                          placeholder="Ex: Manutenção de ar condicionado"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                        />
                      </FormSection>

                      <FormSection title="Descrição">
                        <textarea
                          className="w-full min-h-[120px] px-3 py-2 text-sm rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading placeholder:text-brand-inactive-text focus:outline-none focus:ring-2 focus:ring-brand-green resize-y"
                          placeholder="Descreva o serviço a ser realizado..."
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                        />
                      </FormSection>

                      <FormSection title="Observações internas">
                        <textarea
                          className="w-full min-h-[100px] px-3 py-2 text-sm rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading placeholder:text-brand-inactive-text focus:outline-none focus:ring-2 focus:ring-brand-green resize-y"
                          placeholder="Anotações internas (não visíveis ao cliente)..."
                          value={internalNotes}
                          onChange={(e) => setInternalNotes(e.target.value)}
                        />
                      </FormSection>
                    </div>

                    {/* Right Column (Sidebar Card with Client, Dates, etc.) */}
                    <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                      <SidebarCard hasTopStrip>
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Detalhamento</h3>
                        
                        <div className="space-y-5">
                          {/* Cliente */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">Cliente</label>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 cursor-pointer" onClick={() => setShowCustomerSheet(true)}>
                                <Input
                                  placeholder="Selecionar cliente..."
                                  value={customerName}
                                  readOnly
                                  className="cursor-pointer"
                                />
                              </div>
                              {customerId && (
                                <Button variant="ghost" size="sm" onClick={() => { setCustomerId(""); setCustomerName("") }}>
                                  Limpar
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Data prevista */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">Data prevista de conclusão</label>
                            <DatePicker
                              value={expectedDate}
                              onChange={setExpectedDate}
                              placeholder="Selecionar data"
                            />
                          </div>
                        </div>
                      </SidebarCard>
                    </div>
                  </FadeIn>
                )}

                {activeTab === "services" && (
                  <FadeIn key="services" className="space-y-6 max-w-[800px]">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Serviços da OS</h2>
                      <Button variant="outline" size="sm" onClick={() => setShowServiceSheet(true)}>
                        + Adicionar serviço
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {services.length === 0 ? (
                        <div className="p-8 text-center text-sm text-brand-inactive-text border border-dashed border-brand-border dark:border-dark-border rounded-xl">
                          Nenhum serviço adicionado a esta ordem de serviço.
                        </div>
                      ) : (
                        services.map((svc: any) => (
                          <div key={svc.service_id || svc.id} className="flex items-center justify-between bg-brand-gray dark:bg-dark-border rounded-xl px-4 py-3 border border-brand-border dark:border-dark-border">
                            <div>
                              <p className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">{svc.name || svc.service_name}</p>
                              <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">Qtd: {svc.quantity || 1}</p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => handleRemoveService(svc.service_id || svc.id)} className="text-brand-red hover:bg-brand-red/5">
                              Remover
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </FadeIn>
                )}

                {activeTab === "products" && (
                  <FadeIn key="products" className="space-y-6 max-w-[800px]">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Produtos da OS</h2>
                      <Button variant="outline" size="sm" onClick={() => setShowProductSheet(true)}>
                        + Adicionar produto
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {products.length === 0 ? (
                        <div className="p-8 text-center text-sm text-brand-inactive-text border border-dashed border-brand-border dark:border-dark-border rounded-xl">
                          Nenhum produto adicionado a esta ordem de serviço.
                        </div>
                      ) : (
                        products.map((prod: any) => (
                          <div key={prod.product_id || prod.id} className="flex items-center justify-between bg-brand-gray dark:bg-dark-border rounded-xl px-4 py-3 border border-brand-border dark:border-dark-border">
                            <div>
                              <p className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">{prod.name || prod.product_name}</p>
                              <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">Qtd: {prod.quantity || 1}</p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => handleRemoveProduct(prod.product_id || prod.id)} className="text-brand-red hover:bg-brand-red/5">
                              Remover
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </FadeIn>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Mobile Bottom Action Bar */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
            <Button variant="outline" onClick={onBack} disabled={saving} className="flex-1 h-12">
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1 h-12" leftIcon={<SaveIcon size={18} />}>
              {saving ? "Salvando..." : editData ? "Salvar" : "Criar OS"}
            </Button>
          </div>
        </Tabs>
      </div>

      <SelectCustomerSheet
        isOpen={showCustomerSheet}
        onClose={() => setShowCustomerSheet(false)}
        onSelect={handleSelectCustomer}
        partnerId={partnerId}
      />

      <SelectServiceSheet
        open={showServiceSheet}
        onOpenChange={setShowServiceSheet}
        onSelect={handleAddService}
        partnerId={partnerId}
      />

      <SelectProductSheet
        open={showProductSheet}
        onOpenChange={setShowProductSheet}
        onSelect={handleAddProduct}
        partnerId={partnerId}
      />
    </FadeIn>
  )
}
