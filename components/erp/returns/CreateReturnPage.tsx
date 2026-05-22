"use client"

import React, { useState, useMemo, useEffect } from "react"
import {
  Button,
  DatePicker,
  FormDropdown,
  Input,
  MoneyInput,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  CustomerCard,
  IconPlaceholder,
  FormTextarea,
  Badge,
  Checkbox,
} from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { ChevronLeftIcon, SaveIcon, SearchIcon, TrashIcon, AlertCircleIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { searchOrderForReturnAction } from "@/app/actions/erp/returns"
import { ReturnRequest, ReturnItem } from "./types"
import { getReturnStatusMeta } from "./ReturnListRow"

interface CreateReturnPageProps {
  partnerId: string
  mode: "create" | "edit" | "view"
  returnRequest?: ReturnRequest | null
  onBack: () => void
  onSave: (data: Partial<ReturnRequest>) => void
  isSaving: boolean
}

interface ReturnItemState extends Omit<ReturnItem, "reason" | "condition" | "resolution"> {
  maxQuantity: number
  checked: boolean
  reason: ReturnItem["reason"]
  condition: ReturnItem["condition"]
  resolution: ReturnItem["resolution"]
}

export default function CreateReturnPage({
  partnerId,
  mode,
  returnRequest,
  onBack,
  onSave,
  isSaving,
}: CreateReturnPageProps) {
  const [activeTab, setActiveTab] = useState("general")
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  
  // Search state
  const [orderSearchQuery, setOrderSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearchingOrders, setIsSearchingOrders] = useState(false)

  // Form fields state
  const [returnItems, setReturnItems] = useState<ReturnItemState[]>([])
  const [returnDate, setReturnDate] = useState<Date>(new Date())
  const [returnStatus, setReturnStatus] = useState<ReturnRequest["status"]>("pending")
  const [refundType, setRefundType] = useState<ReturnRequest["refundType"]>("pix")
  const [refundValue, setRefundValue] = useState<number>(0)
  const [evidenceImages, setEvidenceImages] = useState<string[]>([])
  const [observations, setObservations] = useState("")

  // Load existing return data for edit/view modes
  useEffect(() => {
    if ((mode === "edit" || mode === "view") && returnRequest) {
      // Setup order info mock
      setSelectedOrder({
        id: returnRequest.orderId,
        order_number: returnRequest.orderNumber,
        customer_name: returnRequest.customerName,
        customer: {
          name: returnRequest.customerName,
          email: returnRequest.customerEmail || "",
          phone: returnRequest.customerPhone || "",
          addresses: returnRequest.customerAddress ? [{ street: returnRequest.customerAddress }] : []
        },
        delivery_address: returnRequest.customerAddress,
      })

      // Setup items checklist
      const items = returnRequest.items.map(item => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        sku: item.sku || "",
        image: item.image || "",
        price: item.price,
        quantity: item.quantity,
        maxQuantity: item.quantity, // cap at quantity saved
        checked: true,
        reason: item.reason,
        condition: item.condition,
        resolution: item.resolution,
      }))
      setReturnItems(items)

      // Setup details
      setReturnDate(new Date(returnRequest.returnDate))
      setReturnStatus(returnRequest.status)
      setRefundType(returnRequest.refundType)
      setRefundValue(returnRequest.refundValue)
      setEvidenceImages(returnRequest.evidenceImages || [])
      setObservations(returnRequest.observations || "")
    }
  }, [mode, returnRequest])

  const handleSearchOrders = async (query: string) => {
    setOrderSearchQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    setIsSearchingOrders(true)
    try {
      const res = await searchOrderForReturnAction(partnerId, query)
      if (res.success && res.data) {
        setSearchResults(res.data)
      } else {
        setSearchResults([])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsSearchingOrders(false)
    }
  }

  // Handle local image file uploading
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          setEvidenceImages(prev => [...prev, reader.result as string])
        }
      }
      reader.readAsDataURL(file)
    })
  }

  const customerAddress = useMemo(() => {
    if (!selectedOrder) return null

    // If order has buyer customer address
    const customerAddr = selectedOrder.customer?.addresses?.[0]
    if (customerAddr) {
      return {
        street: customerAddr.street || "",
        number: customerAddr.number || "",
        complement: customerAddr.complement || "",
        neighborhood: customerAddr.neighborhood || "",
        city: customerAddr.city || "",
        state: customerAddr.state || customerAddr.uf || "",
        zipCode: customerAddr.zip_code || customerAddr.zipCode || "",
      }
    }

    // Fallback to order's delivery_address
    if (selectedOrder.delivery_address) {
      if (typeof selectedOrder.delivery_address === "object") {
        const addr = selectedOrder.delivery_address
        return {
          street: addr.street || addr.logradouro || "",
          number: addr.number || addr.numero || "",
          complement: addr.complement || addr.complemento || "",
          neighborhood: addr.neighborhood || addr.bairro || "",
          city: addr.city || addr.localidade || "",
          state: addr.state || addr.uf || "",
          zipCode: addr.zipCode || addr.zip_code || addr.cep || "",
        }
      }
      return {
        street: selectedOrder.delivery_address,
      }
    }

    return null
  }, [selectedOrder])

  // Automatically calculate refund value based on checked items
  const calculatedRefundValue = useMemo(() => {
    return returnItems
      .filter(item => item.checked)
      .reduce((acc, item) => acc + (item.price * item.quantity), 0)
  }, [returnItems])

  useEffect(() => {
    if (mode === "create") {
      setRefundValue(calculatedRefundValue)
    }
  }, [calculatedRefundValue, mode])

  const handleFormSubmit = () => {
    const checkedItems = returnItems.filter(item => item.checked)
    if (checkedItems.length === 0) return

    onSave({
      orderId: selectedOrder.id,
      orderNumber: selectedOrder.order_number,
      customerId: selectedOrder.buyer_id || "",
      customerName: selectedOrder.customer_name || selectedOrder.customer?.name || "Cliente",
      customerEmail: selectedOrder.customer?.email || "",
      customerPhone: selectedOrder.customer?.phone || "",
      customerAddress: customerAddress ? `${customerAddress.street}, ${customerAddress.number || ""} - ${customerAddress.city || ""}` : "",
      refundType,
      status: returnStatus,
      refundValue,
      returnDate: returnDate.toISOString(),
      observations,
      evidenceImages,
      items: checkedItems.map(item => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        image: item.image,
        price: item.price,
        quantity: item.quantity,
        reason: item.reason,
        condition: item.condition,
        resolution: item.resolution,
      })),
    })
  }

  const isSaveDisabled = isSaving || !selectedOrder || returnItems.filter(item => item.checked).length === 0

  const pageTitle = mode === "create" ? "Nova devolução" : mode === "edit" ? "Editar devolução" : "Detalhes da devolução"

  return (
    <FadeIn className="relative flex h-[calc(100vh-65px)] flex-col overflow-hidden bg-white dark:bg-dark-background">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full w-full flex-col">
        <div className="sticky top-0 z-30 w-full border-b border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface">
          <div className="relative mx-auto max-w-[1300px] px-4 md:px-6 md:pt-4">
            <div className="hidden items-start justify-between md:flex">
              <div className="flex items-start gap-3">
                <Button variant="outline" onClick={onBack} className="h-10 w-10 p-0 flex items-center justify-center">
                  <ChevronLeftIcon className="h-5 w-5 text-brand-inactive-text dark:text-dark-body" />
                </Button>
                <div>
                  <h1 className="text-xl font-bold text-brand-dark dark:text-dark-heading md:text-3xl flex items-center gap-3">
                    {pageTitle}
                    {mode !== "create" && returnRequest && (
                      <Badge variant={getReturnStatusMeta(returnStatus).variant}>
                        {getReturnStatusMeta(returnStatus).label}
                      </Badge>
                    )}
                  </h1>
                  <p className="text-[15px] font-medium text-brand-inactive-text dark:text-dark-body">
                    {mode === "create"
                      ? "Crie uma nova solicitação de devolução vinculada a um pedido."
                      : "Gerencie e atualize a solicitação de devolução de produtos."}
                  </p>
                </div>
              </div>

              <div className="hidden items-center gap-3 md:flex">
                <Button variant="outline" onClick={onBack} disabled={isSaving}>
                  Cancelar
                </Button>
                {mode !== "view" && (
                  <Button onClick={handleFormSubmit} disabled={isSaveDisabled}>
                    <SaveIcon className="mr-2 h-4 w-4" />
                    {isSaving ? "Salvando..." : "Salvar"}
                  </Button>
                )}
              </div>
            </div>

            <div className="w-full md:mt-4">
              <TabsList className="w-full justify-start gap-6 border-b-0 bg-transparent p-0">
                <TabsTrigger value="general">Dados gerais</TabsTrigger>
                <TabsTrigger value="evidence">Evidências</TabsTrigger>
                <TabsTrigger value="observations">Observações</TabsTrigger>
              </TabsList>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8">
          <div className="px-4 py-6 max-w-[1300px] mx-auto min-h-[400px]">
            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
              <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                <TabsContent value="general" className="mt-0">
                  <FadeIn key="general" className="space-y-8">
                    {/* Search / Order Selection */}
                    <section className="space-y-4">
                      <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Pedido Origem</h3>
                      
                      {mode === "create" ? (
                        <div className="relative">
                          <Input
                            label="Buscar Pedido"
                            placeholder="Digite o número do pedido..."
                            value={orderSearchQuery}
                            onChange={(e) => handleSearchOrders(e.target.value)}
                            prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                            className="mb-0"
                          />
                          {isSearchingOrders && (
                            <div className="absolute right-3 top-[38px]">
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand-primary" />
                            </div>
                          )}
                          
                          {/* Search Results */}
                          {searchResults.length > 0 && (
                            <div className="absolute top-[70px] left-0 right-0 z-50 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl shadow-lg max-h-60 overflow-y-auto">
                              {searchResults.map((order) => (
                                <div
                                  key={order.id}
                                  className="p-3 hover:bg-brand-gray dark:hover:bg-dark-border/40 cursor-pointer flex justify-between items-center border-b border-brand-border dark:border-dark-border last:border-0"
                                  onClick={() => {
                                    setSelectedOrder(order)
                                    setSearchResults([])
                                    setOrderSearchQuery("")
                                    // Map order items to returns checklist items
                                    const mappedItems = (order.order_items || []).map((item: any) => ({
                                      id: item.id,
                                      productId: item.product_id || item.products?.sku || item.id,
                                      productName: item.product_name || item.products?.name || "Produto",
                                      sku: item.products?.sku || "",
                                      image: Array.isArray(item.products?.images) && item.products.images[0] ? item.products.images[0] : "",
                                      price: item.product_price || 0,
                                      quantity: item.quantity || 1,
                                      maxQuantity: item.quantity || 1,
                                      checked: false,
                                      reason: "defeito" as const,
                                      condition: "aberto" as const,
                                      resolution: "reembolso" as const,
                                    }))
                                    setReturnItems(mappedItems)
                                  }}
                                >
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">{order.order_number}</span>
                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body truncate">{order.customer_name}</span>
                                  </div>
                                  <span className="font-bold text-sm text-brand-primary shrink-0 ml-2">
                                    {formatCurrency(order.total_amount || 0)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}

                      {selectedOrder && (
                        <div className="rounded-2xl border border-brand-border dark:border-dark-border p-5 bg-brand-gray/20 dark:bg-dark-surface/10 space-y-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-xs text-brand-inactive-text dark:text-dark-body block">Número do Pedido</span>
                              <span className="font-bold text-brand-dark dark:text-dark-heading">{selectedOrder.order_number}</span>
                            </div>
                            <div>
                              <span className="text-xs text-brand-inactive-text dark:text-dark-body block">Canal</span>
                              <span className="font-medium text-brand-dark dark:text-dark-heading capitalize">{selectedOrder.order_source || "-"}</span>
                            </div>
                            <div>
                              <span className="text-xs text-brand-inactive-text dark:text-dark-body block">Total Pedido</span>
                              <span className="font-bold text-brand-primary">{formatCurrency(selectedOrder.total_amount || 0)}</span>
                            </div>
                            <div>
                              <span className="text-xs text-brand-inactive-text dark:text-dark-body block">Situação</span>
                              <span className="font-medium text-brand-dark dark:text-dark-heading capitalize">{selectedOrder.situation || "-"}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </section>

                    {/* Return Item Checklist */}
                    {selectedOrder && (
                      <section className="space-y-4">
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Produtos para Devolução</h3>
                        <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden divide-y divide-brand-border dark:divide-dark-border">
                          {returnItems.map((item, idx) => (
                            <div key={item.id} className="p-4 flex flex-col gap-4 bg-white dark:bg-dark-surface/5">
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  checked={item.checked}
                                  disabled={mode === "view"}
                                  onChange={(checked: boolean) => {
                                    setReturnItems(prev => {
                                      const next = [...prev]
                                      next[idx] = { ...next[idx], checked: !!checked }
                                      return next
                                    })
                                  }}
                                />
                                {item.image ? (
                                  <img
                                    src={item.image}
                                    alt={item.productName}
                                    className="w-12 h-12 object-cover rounded-xl border border-brand-border dark:border-dark-border shrink-0"
                                  />
                                ) : (
                                  <div className="w-12 h-12 rounded-xl bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                    <AlertCircleIcon className="w-5 h-5 text-brand-inactive-text" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="font-bold text-[14px] text-brand-dark dark:text-dark-heading truncate">{item.productName}</p>
                                  <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">
                                    {item.sku ? `SKU: ${item.sku}` : "Sem SKU"} • {formatCurrency(item.price)}
                                  </p>
                                </div>
                                <span className="text-xs font-bold text-brand-inactive-text dark:text-dark-body whitespace-nowrap">
                                  Comprado: {item.maxQuantity}
                                </span>
                              </div>

                              {item.checked && (
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pl-7 animate-fade-in mt-1">
                                  <FormDropdown
                                    label="Motivo"
                                    disabled={mode === "view"}
                                    value={item.reason}
                                    setValue={(val) => {
                                      setReturnItems(prev => {
                                        const next = [...prev]
                                        next[idx] = { ...next[idx], reason: val as any }
                                        return next
                                      })
                                    }}
                                    options={[
                                      { value: "defeito", label: "Defeito" },
                                      { value: "arrependimento", label: "Arrependimento" },
                                      { value: "tamanho_incorreto", label: "Tamanho Incorreto" },
                                      { value: "outro", label: "Outro" }
                                    ]}
                                  />
                                  <FormDropdown
                                    label="Condição"
                                    disabled={mode === "view"}
                                    value={item.condition}
                                    setValue={(val) => {
                                      setReturnItems(prev => {
                                        const next = [...prev]
                                        next[idx] = { ...next[idx], condition: val as any }
                                        return next
                                      })
                                    }}
                                    options={[
                                      { value: "aberto", label: "Aberto" },
                                      { value: "lacrado", label: "Lacrado" },
                                      { value: "danificado", label: "Danificado" }
                                    ]}
                                  />
                                  <FormDropdown
                                    label="Resolução"
                                    disabled={mode === "view"}
                                    value={item.resolution}
                                    setValue={(val) => {
                                      setReturnItems(prev => {
                                        const next = [...prev]
                                        next[idx] = { ...next[idx], resolution: val as any }
                                        return next
                                      })
                                    }}
                                    options={[
                                      { value: "reembolso", label: "Reembolso" },
                                      { value: "troca", label: "Troca" },
                                      { value: "vale_compra", label: "Vale-compra" }
                                    ]}
                                  />
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5">Qtd Devolver</span>
                                    <div className="flex items-center bg-brand-gray dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-lg h-[40px] px-2 w-fit gap-3">
                                      <button
                                        type="button"
                                        disabled={mode === "view" || item.quantity <= 1}
                                        className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-dark-border disabled:opacity-40 text-brand-dark dark:text-dark-heading font-bold"
                                        onClick={() => {
                                          setReturnItems(prev => {
                                            const next = [...prev]
                                            next[idx] = { ...next[idx], quantity: Math.max(1, next[idx].quantity - 1) }
                                            return next
                                          })
                                        }}
                                      >
                                        -
                                      </button>
                                      <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{item.quantity}</span>
                                      <button
                                        type="button"
                                        disabled={mode === "view" || item.quantity >= item.maxQuantity}
                                        className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-dark-border disabled:opacity-40 text-brand-dark dark:text-dark-heading font-bold"
                                        onClick={() => {
                                          setReturnItems(prev => {
                                            const next = [...prev]
                                            next[idx] = { ...next[idx], quantity: Math.min(next[idx].maxQuantity, next[idx].quantity + 1) }
                                            return next
                                          })
                                        }}
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Refund/Exchange status details */}
                    {selectedOrder && (
                      <section className="space-y-6 pt-4 border-t border-brand-border dark:border-dark-border">
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Configurações do Reembolso</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <DatePicker
                            label="Data de Devolução"
                            disabled={mode === "view"}
                            value={returnDate}
                            onChange={(d) => d && setReturnDate(d)}
                          />

                          <FormDropdown
                            label="Status da Devolução"
                            disabled={mode === "view"}
                            value={returnStatus}
                            setValue={(val) => setReturnStatus(val as ReturnRequest["status"])}
                            options={[
                              { value: "pending", label: "Pendente" },
                              { value: "approved", label: "Aprovado" },
                              { value: "rejected", label: "Recusado" }
                            ]}
                          />

                          <FormDropdown
                            label="Forma de Reembolso"
                            disabled={mode === "view"}
                            value={refundType}
                            setValue={(val) => setRefundType(val as ReturnRequest["refundType"])}
                            options={[
                              { value: "pix", label: "Pix" },
                              { value: "credit_card", label: "Cartão de Crédito" },
                              { value: "store_credit", label: "Vale-compra" },
                              { value: "other", label: "Outro" }
                            ]}
                          />

                          <MoneyInput
                            label="Valor Reembolso (R$)"
                            disabled={mode === "view"}
                            value={refundValue}
                            onChange={(val) => setRefundValue(val)}
                          />
                        </div>
                      </section>
                    )}
                  </FadeIn>
                </TabsContent>

                <TabsContent value="evidence" className="mt-0">
                  <FadeIn key="evidence" className="space-y-6">
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Evidências de Retorno</h3>
                    
                    {evidenceImages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center min-h-[350px] border border-dashed border-brand-border dark:border-dark-border rounded-2xl p-8 bg-brand-gray/10">
                        <IconPlaceholder
                          placeholderType="image"
                          imageSrc="https://img.dudit.com.br/static/mascots/SemPedidos.png"
                          imageAlt="Nenhuma evidência por imagem"
                          title="Nenhuma imagem enviada"
                          subtitle={
                            mode === "view" 
                              ? "Nenhuma imagem foi registrada como evidência para esta devolução." 
                              : "Envie fotos do estado do produto ou pacote retornado."
                          }
                          itemButton={
                            mode !== "view" 
                              ? {
                                  text: "Enviar imagem",
                                  type: "file",
                                  accept: "image/*",
                                  onChange: handleImageUpload,
                                } 
                              : undefined
                          }
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                        {evidenceImages.map((src, i) => (
                          <div key={i} className="relative aspect-square rounded-2xl overflow-hidden border border-brand-border dark:border-dark-border group bg-brand-gray">
                            <img src={src} alt={`Evidência ${i + 1}`} className="w-full h-full object-cover" />
                            {mode !== "view" && (
                              <button
                                type="button"
                                className="absolute top-2 right-2 bg-brand-red text-white rounded-full p-2 hover:bg-red-700 shadow-md transition-colors"
                                onClick={() => setEvidenceImages(prev => prev.filter((_, idx) => idx !== i))}
                              >
                                <TrashIcon size={16} />
                              </button>
                            )}
                          </div>
                        ))}
                        
                        {mode !== "view" && (
                          <label className="border-2 border-dashed border-brand-border dark:border-dark-border hover:bg-brand-gray/30 dark:hover:bg-dark-border/20 rounded-2xl flex flex-col items-center justify-center cursor-pointer aspect-square transition-all duration-200">
                            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                            <span className="text-sm font-semibold text-brand-inactive-text dark:text-dark-body">Adicionar Foto</span>
                          </label>
                        )}
                      </div>
                    )}
                  </FadeIn>
                </TabsContent>

                <TabsContent value="observations" className="mt-0">
                  <FadeIn key="observations" className="space-y-6">
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Observações Gerais</h3>
                    <FormTextarea
                      name="observations"
                      label="Observações da Devolução"
                      placeholder="Adicione observações sobre a troca, feedback do cliente ou detalhes internos..."
                      disabled={mode === "view"}
                      value={observations}
                      onChange={(e) => setObservations(e.target.value)}
                      maxLength={1000}
                      showCharacterCount={true}
                    />
                  </FadeIn>
                </TabsContent>
              </div>

              {/* Customer details right column (Sticky Customer Card) */}
              <div className="col-span-12 lg:col-span-4 border-l-0 lg:border-l border-brand-border dark:border-dark-border pl-0 lg:pl-12">
                <div className="sticky top-6">
                  {selectedOrder ? (
                    <CustomerCard
                      customer={{
                        name: selectedOrder.customer_name || selectedOrder.customer?.name || "Cliente",
                        email: selectedOrder.customer?.email || "",
                        phone: selectedOrder.customer?.phone || "",
                      }}
                      address={customerAddress}
                      showMap={true}
                    />
                  ) : (
                    <div className="rounded-2xl border border-dashed border-brand-border dark:border-dark-border p-6 text-sm text-brand-inactive-text dark:text-dark-body text-center bg-brand-gray/10">
                      Selecione um pedido para visualizar os dados do cliente e o mapa de entrega aqui.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Tabs>

      {/* Mobile action bar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-brand-border dark:border-dark-border bg-white dark:bg-dark-background p-4 flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1" disabled={isSaving}>
          Cancelar
        </Button>
        {mode !== "view" && (
          <Button onClick={handleFormSubmit} className="flex-1" disabled={isSaveDisabled}>
            {isSaving ? "Salvando..." : "Salvar"}
          </Button>
        )}
      </div>
    </FadeIn>
  )
}
