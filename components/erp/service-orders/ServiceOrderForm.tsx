"use client"

import React, { useState, useCallback, useRef } from "react"
import { Button, Input, FormSection, DatePicker, ThreeDotsLoader, Tabs, TabsList, TabsTrigger, Badge, IconPlaceholder } from "@/components/reusable"
import CustomerCard from "@/components/reusable/CustomerCard"
import Pagination from "@/components/reusable/Pagination"
import { ChevronLeftIcon, SaveIcon, PlusIcon, TrashIcon, WrenchIcon, PackageIcon, UserIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
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



export default function ServiceOrderForm({ partnerId, onBack, onSaved, editData }: ServiceOrderFormProps) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("general")
  const [title, setTitle] = useState(editData?.title || "")
  const [description, setDescription] = useState(editData?.description || "")
  const [internalNotes, setInternalNotes] = useState(editData?.internal_notes || "")
  const [customerId, setCustomerId] = useState(editData?.customer_id || "")
  const [customerName, setCustomerName] = useState(editData?.customer_snapshot?.name || "")
  const [selectedCustomer, setSelectedCustomer] = useState<any>(editData?.customer_snapshot || null)
  const [expectedDate, setExpectedDate] = useState(editData?.expected_completion_date || "")
  const [assignedUserId, setAssignedUserId] = useState(editData?.assigned_user_id || "")
  const [services, setServices] = useState<any[]>(editData?.services || [])
  const [products, setProducts] = useState<any[]>(editData?.products || [])
  const [saving, setSaving] = useState(false)
  const [showCustomerSheet, setShowCustomerSheet] = useState(false)
  const [showServiceSheet, setShowServiceSheet] = useState(false)
  const [showProductSheet, setShowProductSheet] = useState(false)

  const [servicesPage, setServicesPage] = useState(1)
  const servicesItemsPerPage = 5
  const totalServicesPages = Math.ceil(services.length / servicesItemsPerPage)
  const paginatedServices = services.slice((servicesPage - 1) * servicesItemsPerPage, servicesPage * servicesItemsPerPage)

  const [productsPage, setProductsPage] = useState(1)
  const productsItemsPerPage = 5
  const totalProductsPages = Math.ceil(products.length / productsItemsPerPage)
  const paginatedProducts = products.slice((productsPage - 1) * productsItemsPerPage, productsPage * productsItemsPerPage)

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
    setSelectedCustomer(customer)
    setShowCustomerSheet(false)
  }

  const handleAddService = (svc: any) => {
    setServices((prev) => {
      if (prev.some((s) => (s.service_id || s.id) === svc.id)) return prev
      setServicesPage(1)
      return [...prev, { ...svc, service_id: svc.id, quantity: 1 }]
    })
  }

  const handleRemoveService = (id: string) => {
    setServices((prev) => {
      const next = prev.filter((s) => (s.service_id || s.id) !== id)
      const nextTotalPages = Math.ceil(next.length / servicesItemsPerPage)
      if (servicesPage > nextTotalPages && nextTotalPages > 0) {
        setServicesPage(nextTotalPages)
      }
      return next
    })
  }

  const handleAddProduct = (prod: any) => {
    setProducts((prev) => {
      if (prev.some((p) => (p.product_id || p.id) === prod.id)) return prev
      setProductsPage(1)
      return [...prev, { ...prod, product_id: prod.id, quantity: 1 }]
    })
  }

  const handleRemoveProduct = (id: string) => {
    setProducts((prev) => {
      const next = prev.filter((p) => (p.product_id || p.id) !== id)
      const nextTotalPages = Math.ceil(next.length / productsItemsPerPage)
      if (productsPage > nextTotalPages && nextTotalPages > 0) {
        setProductsPage(nextTotalPages)
      }
      return next
    })
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
                
                {/* Back button - desktop/wide only (standard ERP style) */}
                <div className={`absolute -left-12 top-5 h-full hidden xl:flex justify-center transition-all duration-300`}>
                  <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center rounded-full">
                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                  </Button>
                </div>

                <div className="flex items-center gap-4 min-w-0">
                  {/* Inline back button for smaller screens */}
                  <Button variant="outline" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center rounded-full xl:hidden shrink-0">
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
                  <TabsTrigger value="notes">Observações</TabsTrigger>
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

                      <FormSection title="Data prevista de conclusão">
                        <DatePicker
                          value={expectedDate}
                          onChange={setExpectedDate}
                          placeholder="Selecionar data"
                        />
                      </FormSection>
                    </div>

                    {/* Right Column (Sidebar Card with Client Card) */}
                    <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                      <div>
                        {selectedCustomer ? (
                          <CustomerCard
                            customer={selectedCustomer}
                            onRemove={() => {
                              setCustomerId("")
                              setCustomerName("")
                              setSelectedCustomer(null)
                            }}
                          />
                        ) : (
                          <div
                            className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-8 flex flex-col items-center justify-center text-center relative overflow-hidden mb-6 cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-border/40 transition-colors"
                            onClick={() => setShowCustomerSheet(true)}
                          >
                            <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border"></div>
                            <IconPlaceholder
                              icon={UserIcon}
                              title="Nenhum cliente selecionado"
                              subtitle="Selecione um cliente para vincular à ordem de serviço."
                              itemButton={{
                                text: "Selecionar Cliente",
                                action: () => setShowCustomerSheet(true),
                                variant: "outline",
                                className: "rounded-full px-8"
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </FadeIn>
                )}

                {activeTab === "notes" && (
                  <FadeIn key="notes" className="space-y-6 w-full max-w-[800px]">
                    <FormSection title="Observações internas">
                      <textarea
                        className="w-full min-h-[150px] px-3 py-2 text-sm rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading placeholder:text-brand-inactive-text focus:outline-none focus:ring-2 focus:ring-brand-green resize-y"
                        placeholder="Anotações internas (não visíveis ao cliente)..."
                        value={internalNotes}
                        onChange={(e) => setInternalNotes(e.target.value)}
                      />
                    </FormSection>
                  </FadeIn>
                )}

                {activeTab === "services" && (
                  <FadeIn key="services" className="space-y-6 w-full">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Serviços da OS</h2>
                      <Button variant="link" onClick={() => setShowServiceSheet(true)} className="gap-2 h-auto py-0 text-brand-primary">
                        <PlusIcon size={14} strokeWidth={3} />
                        Adicionar serviço
                      </Button>
                    </div>

                    {services.length === 0 ? (
                      <div className="w-full flex flex-col items-center justify-center py-12">
                        <IconPlaceholder
                          icon={WrenchIcon}
                          title="Nenhum serviço adicionado"
                          subtitle="Adicione serviços para vincular a esta ordem de serviço."
                          itemButton={{
                            text: "Adicionar serviço",
                            action: () => setShowServiceSheet(true),
                            variant: "outline",
                          }}
                        />
                      </div>
                    ) : (
                      <>
                        {/* --- SERVICES TABLE (Desktop) --- */}
                        <div className="hidden md:block w-full overflow-x-auto pb-4 custom-scrollbar mb-4">
                          <table className="w-full text-left border-separate border-spacing-0">
                            <thead>
                              <tr className="bg-brand-gray dark:bg-dark-border/50">
                                <th className="py-3 pl-6 pr-4 text-[13px] font-medium text-gray-500 dark:text-dark-body rounded-l-lg">Serviço</th>
                                <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body w-44">Preço Unit.</th>
                                <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-36">Qtd.</th>
                                <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-right w-36">Total</th>
                                <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-24 rounded-r-lg">Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paginatedServices.map((svc: any) => {
                                const unitPrice = svc.price || svc.service_price || 0
                                const qty = svc.quantity || 1
                                return (
                                  <tr key={svc.service_id || svc.id} className="group hover:bg-brand-gray/20 dark:hover:bg-dark-border/10 transition-colors">
                                    <td className="py-4 pl-6 pr-4 border-b border-brand-border dark:border-dark-border">
                                      <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                          <WrenchIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                        </div>
                                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
                                          {svc.name || svc.service_name}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-left font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                      {formatCurrency(unitPrice)}
                                    </td>
                                    <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-center font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                      {qty}
                                    </td>
                                    <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-right font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                      {formatCurrency(unitPrice * qty)}
                                    </td>
                                    <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                      <div className="flex justify-center">
                                        <button
                                          onClick={() => handleRemoveService(svc.service_id || svc.id)}
                                          className="w-8 h-8 flex items-center justify-center rounded-full text-brand-red hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                                        >
                                          <TrashIcon size={14} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* --- SERVICES LIST (Mobile) --- */}
                        <div className="md:hidden flex flex-col gap-4 mb-4">
                          {paginatedServices.map((svc: any) => {
                            const unitPrice = svc.price || svc.service_price || 0
                            const qty = svc.quantity || 1
                            return (
                              <div key={svc.service_id || svc.id} className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-4">
                                <div className="flex items-start gap-4">
                                  <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                    <WrenchIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                  </div>
                                  <div className="flex-1 min-w-0 text-left">
                                    <div className="font-bold text-[14px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
                                      {svc.name || svc.service_name}
                                    </div>
                                    <div className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate mb-2">
                                      Qtd: {qty} • Unit: {formatCurrency(unitPrice)}
                                    </div>
                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                      Total: {formatCurrency(unitPrice * qty)}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleRemoveService(svc.service_id || svc.id)}
                                    className="w-8 h-8 flex items-center justify-center rounded-full text-brand-red hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                                  >
                                    <TrashIcon size={14} />
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        {/* Pagination */}
                        <Pagination
                          currentPage={servicesPage}
                          totalPages={totalServicesPages}
                          onPageChange={setServicesPage}
                        />
                      </>
                    )}
                  </FadeIn>
                )}

                {activeTab === "products" && (
                  <FadeIn key="products" className="space-y-6 w-full">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Produtos da OS</h2>
                      <Button variant="link" onClick={() => setShowProductSheet(true)} className="gap-2 h-auto py-0 text-brand-primary">
                        <PlusIcon size={14} strokeWidth={3} />
                        Adicionar produto
                      </Button>
                    </div>

                    {products.length === 0 ? (
                      <div className="w-full flex flex-col items-center justify-center py-12">
                        <IconPlaceholder
                          icon={PackageIcon}
                          title="Nenhum produto adicionado"
                          subtitle="Adicione produtos para vincular a esta ordem de serviço."
                          itemButton={{
                            text: "Adicionar produto",
                            action: () => setShowProductSheet(true),
                            variant: "outline",
                          }}
                        />
                      </div>
                    ) : (
                      <>
                        {/* --- PRODUCTS TABLE (Desktop) --- */}
                        <div className="hidden md:block w-full overflow-x-auto pb-4 custom-scrollbar mb-4">
                          <table className="w-full text-left border-separate border-spacing-0">
                            <thead>
                              <tr className="bg-brand-gray dark:bg-dark-border/50">
                                <th className="py-3 pl-6 pr-4 text-[13px] font-medium text-gray-500 dark:text-dark-body rounded-l-lg">Produto</th>
                                <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body w-44">Preço Unit.</th>
                                <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-36">Qtd.</th>
                                <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-right w-36">Total</th>
                                <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-24 rounded-r-lg">Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paginatedProducts.map((prod: any) => {
                                const unitPrice = prod.price || prod.unit_price || 0
                                const qty = prod.quantity || 1
                                return (
                                  <tr key={prod.product_id || prod.id} className="group hover:bg-brand-gray/20 dark:hover:bg-dark-border/10 transition-colors">
                                    <td className="py-4 pl-6 pr-4 border-b border-brand-border dark:border-dark-border">
                                      <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                          <PackageIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                        </div>
                                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
                                          {prod.name || prod.product_name}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-left font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                      {formatCurrency(unitPrice)}
                                    </td>
                                    <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-center font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                                      {qty}
                                    </td>
                                    <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-right font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                      {formatCurrency(unitPrice * qty)}
                                    </td>
                                    <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                      <div className="flex justify-center">
                                        <button
                                          onClick={() => handleRemoveProduct(prod.product_id || prod.id)}
                                          className="w-8 h-8 flex items-center justify-center rounded-full text-brand-red hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                                        >
                                          <TrashIcon size={14} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* --- PRODUCTS LIST (Mobile) --- */}
                        <div className="md:hidden flex flex-col gap-4 mb-4">
                          {paginatedProducts.map((prod: any) => {
                            const unitPrice = prod.price || prod.unit_price || 0
                            const qty = prod.quantity || 1
                            return (
                              <div key={prod.product_id || prod.id} className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-4">
                                <div className="flex items-start gap-4">
                                  <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                    <PackageIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                  </div>
                                  <div className="flex-1 min-w-0 text-left">
                                    <div className="font-bold text-[14px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
                                      {prod.name || prod.product_name}
                                    </div>
                                    <div className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate mb-2">
                                      Qtd: {qty} • Unit: {formatCurrency(unitPrice)}
                                    </div>
                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                      Total: {formatCurrency(unitPrice * qty)}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleRemoveProduct(prod.product_id || prod.id)}
                                    className="w-8 h-8 flex items-center justify-center rounded-full text-brand-red hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                                  >
                                    <TrashIcon size={14} />
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        {/* Pagination */}
                        <Pagination
                          currentPage={productsPage}
                          totalPages={totalProductsPages}
                          onPageChange={setProductsPage}
                        />
                      </>
                    )}
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
