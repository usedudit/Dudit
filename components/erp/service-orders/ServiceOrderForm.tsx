"use client"

import React, { useState, useCallback } from "react"
import { Button, Input, FormSection, DatePicker, ThreeDotsLoader } from "@/components/reusable"
import { ChevronLeftIcon, SaveIcon } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { FadeIn } from "@/components/animations/FadeIn"
import {
  createServiceOrderAction,
  addServicesToOrderAction,
  addProductsToOrderAction,
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

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ description: "Título é obrigatório" })
      return
    }

    setSaving(true)

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

  const handleSelectCustomer = (customer: any) => {
    setCustomerId(customer.id)
    setCustomerName(customer.name)
    setShowCustomerSheet(false)
  }

  const handleAddService = (svc: any) => {
    setServices((prev) => {
      if (prev.some((s) => (s.service_id || s.id) === svc.id)) return prev
      return [...prev, { ...svc, service_id: svc.id }]
    })
  }

  const handleRemoveService = (id: string) => {
    setServices((prev) => prev.filter((s) => (s.service_id || s.id) !== id))
  }

  const handleAddProduct = (prod: any) => {
    setProducts((prev) => {
      if (prev.some((p) => (p.product_id || p.id) === prod.id)) return prev
      return [...prev, { ...prod, product_id: prod.id }]
    })
  }

  const handleRemoveProduct = (id: string) => {
    setProducts((prev) => prev.filter((p) => (p.product_id || p.id) !== id))
  }

  return (
    <FadeIn>
      <div className="max-w-[800px] mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={onBack} className="p-2 rounded-full hover:bg-brand-gray dark:hover:bg-dark-border transition-colors">
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
            {editData ? "Editar OS" : "Nova Ordem de Serviço"}
          </h1>
        </div>

        <div className="space-y-6">
          {/* Título */}
          <FormSection title="Título">
            <Input
              placeholder="Ex: Manutenção de ar condicionado"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </FormSection>

          {/* Descrição */}
          <FormSection title="Descrição">
            <textarea
              className="w-full min-h-[100px] px-3 py-2 text-sm rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading placeholder:text-brand-inactive-text focus:outline-none focus:ring-2 focus:ring-brand-green resize-y"
              placeholder="Descreva o serviço a ser realizado..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormSection>

          {/* Cliente */}
          <FormSection title="Cliente">
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
          </FormSection>

          {/* Data prevista */}
          <FormSection title="Data prevista de conclusão">
            <DatePicker
              value={expectedDate}
              onChange={setExpectedDate}
              placeholder="Selecionar data"
            />
          </FormSection>

          {/* Observações internas */}
          <FormSection title="Observações internas">
            <textarea
              className="w-full min-h-[80px] px-3 py-2 text-sm rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading placeholder:text-brand-inactive-text focus:outline-none focus:ring-2 focus:ring-brand-green resize-y"
              placeholder="Anotações internas (não visível ao cliente)..."
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
            />
          </FormSection>

          {/* Serviços */}
          <FormSection title="Serviços">
            <div className="space-y-2">
              {services.map((svc: any) => (
                <div key={svc.service_id || svc.id} className="flex items-center justify-between bg-brand-gray dark:bg-dark-border rounded-xl px-4 py-2.5">
                  <div>
                    <p className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">{svc.name || svc.service_name}</p>
                    <p className="text-[11px] text-brand-inactive-text">Qtd: {svc.quantity || 1}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleRemoveService(svc.service_id || svc.id)}>
                    Remover
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setShowServiceSheet(true)}>
                + Adicionar serviço
              </Button>
            </div>
          </FormSection>

          {/* Produtos */}
          <FormSection title="Produtos">
            <div className="space-y-2">
              {products.map((prod: any) => (
                <div key={prod.product_id || prod.id} className="flex items-center justify-between bg-brand-gray dark:bg-dark-border rounded-xl px-4 py-2.5">
                  <div>
                    <p className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">{prod.name || prod.product_name}</p>
                    <p className="text-[11px] text-brand-inactive-text">Qtd: {prod.quantity || 1}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleRemoveProduct(prod.product_id || prod.id)}>
                    Remover
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setShowProductSheet(true)}>
                + Adicionar produto
              </Button>
            </div>
          </FormSection>

          {/* Botão salvar */}
          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} isLoading={saving}>
              <SaveIcon className="w-4 h-4 mr-1" />
              {editData ? "Salvar alterações" : "Criar OS"}
            </Button>
          </div>
        </div>
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
