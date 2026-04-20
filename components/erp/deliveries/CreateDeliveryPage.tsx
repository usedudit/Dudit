"use client"

import { useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Button, Input, Tabs, TabsList, TabsTrigger, TabsContent, FormDropdown } from "@/components/reusable"
import { ChevronLeftIcon, SaveIcon, SearchIcon } from "@/lib/icons"
import { usePickerBucket } from "@/components/erp/hooks"
import { fetchDeliveryOrderBucketAction, fetchDeliveryPeopleBucketAction, createERPDeliveryAction } from "@/app/actions/erp/deliveries"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"
import { getDeliveryStatusMeta, getPaymentStatusMeta } from "@/lib/orders/status"

type DeliveryPerson = { id: string; userId?: string; fullName: string }

export default function CreateDeliveryPage({
  partnerId,
  onBack,
  onSuccess,
}: {
  partnerId: string
  onBack: () => void
  onSuccess: () => void
}) {
  const [activeTab, setActiveTab] = useState("Geral")
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [selectedDeliveryPersonId, setSelectedDeliveryPersonId] = useState<string>("")
  const [status, setStatus] = useState("preparing")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [notes, setNotes] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isOrderSearchOpen, setIsOrderSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const [deliveryPeople, setDeliveryPeople] = useState<DeliveryPerson[]>([])

  const orderPicker = usePickerBucket(
    () => fetchDeliveryOrderBucketAction(partnerId),
    (order, q) =>
      String(order.displayId || "").toLowerCase().includes(q) ||
      String(order.customer?.name || "").toLowerCase().includes(q),
    { pageSize: 8 }
  )

  const selectedOrder = useMemo(
    () => orderPicker.filtered.find((o) => o.id === selectedOrderId) || null,
    [orderPicker.filtered, selectedOrderId]
  )

  const loadDeliveryPeople = async () => {
    if (deliveryPeople.length > 0) return
    const list = await fetchDeliveryPeopleBucketAction(partnerId)
    setDeliveryPeople(list as DeliveryPerson[])
  }

  const selectedStatusMeta = getDeliveryStatusMeta(status)
  const paymentMeta = getPaymentStatusMeta(selectedOrder?.status)

  const handleSave = async () => {
    if (!selectedOrder) return
    if (!date || !time) return

    setIsSaving(true)
    const startedAt = new Date(`${date}T${time}:00`).toISOString()
    const res = await createERPDeliveryAction({
      partnerId,
      orderId: selectedOrder.id,
      deliveryPersonId: selectedDeliveryPersonId || null,
      status: status as any,
      startedAt,
      notes,
    })
    setIsSaving(false)
    if (res.success) onSuccess()
  }

  return (
    <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden relative">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
        <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border">
          <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
            <div className="hidden md:flex items-start justify-between">
              <div className="flex items-start gap-3">
                <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0"><ChevronLeftIcon className="w-5 h-5" /></Button>
                <div>
                  <h1 className="font-bold text-xl md:text-3xl text-brand-dark dark:text-dark-heading">Nova Entrega</h1>
                  <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">Entrega vinculada ao pedido completo.</p>
                </div>
              </div>
              <div className="hidden md:flex items-center gap-3">
                <Button variant="outline" onClick={onBack} disabled={isSaving}>Cancelar</Button>
                <Button onClick={handleSave} disabled={isSaving || !selectedOrder || !date || !time}>
                  <SaveIcon className="w-4 h-4 mr-2" /> {isSaving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
            <div className="w-full md:mt-4">
              <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                <TabsTrigger value="Geral" className="px-0 pb-3">Dados gerais</TabsTrigger>
                <TabsTrigger value="Observações" className="px-0 pb-3">Observações</TabsTrigger>
              </TabsList>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 max-w-[1300px] mx-auto w-full pb-24 md:pb-8">
          <TabsContent value="Geral" className="mt-0">
            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
              <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 space-y-8">
                <section>
                  <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Detalhes do Pedido</h3>
                  <div ref={searchRef} className="relative">
                    <Input
                      placeholder="Pesquisar ID do pedido..."
                      value={orderPicker.searchQuery}
                      onChange={(e) => { orderPicker.setSearchQuery(e.target.value); setIsOrderSearchOpen(true) }}
                      onFocus={() => { setIsOrderSearchOpen(true); void orderPicker.loadBucket() }}
                      prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                      label=""
                    />
                    {isOrderSearchOpen && orderPicker.searchQuery.trim() && (
                      <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="absolute z-50 top-full left-0 right-0 mt-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl overflow-hidden max-h-72 overflow-y-auto shadow-xl">
                        {orderPicker.displayed.map((order) => (
                          <button
                            key={order.id}
                            type="button"
                            className="w-full text-left p-3.5 border-b border-brand-border dark:border-dark-border last:border-0 hover:bg-gray-50 dark:hover:bg-dark-border"
                            onClick={() => {
                              setSelectedOrderId(order.id)
                              orderPicker.setSearchQuery(order.displayId)
                              setIsOrderSearchOpen(false)
                            }}
                          >
                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{order.displayId}</div>
                            <div className="text-xs text-brand-inactive-text">{order.customer?.name || "Cliente"} • {formatCurrency(order.totalAmount || 0)}</div>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </div>
                </section>

                {selectedOrder && (
                  <>
                    <div className="h-px bg-brand-border dark:bg-dark-border w-full" />
                    <section className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Pedido" value={selectedOrder.displayId} onChange={() => { }} disabled />
                        <Input label="Total do Pedido" value={formatCurrency(selectedOrder.totalAmount || 0)} onChange={() => { }} disabled />
                        <Input label="Data do Pedido" value={selectedOrder.orderDate ? formatDate(selectedOrder.orderDate) : "-"} onChange={() => { }} disabled />
                        <Input label="Status de Pagamento" value={paymentMeta.label} onChange={() => { }} disabled />
                        <Input label="Status da Entrega (pedido)" value={getDeliveryStatusMeta(selectedOrder.deliveryStatus).label} onChange={() => { }} disabled />
                        <Input label="Valor de Envio" value={formatCurrency(selectedOrder.shippingFee || 0)} onChange={() => { }} disabled />
                      </div>
                      <div className="rounded-2xl border border-brand-border dark:border-dark-border p-4">
                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{selectedOrder.customer?.name || "Cliente"}</p>
                        <p className="text-sm text-brand-inactive-text">{selectedOrder.address || "Sem endereço"}</p>
                      </div>
                    </section>

                    <div className="h-px bg-brand-border dark:bg-dark-border w-full" />
                    <section>
                      <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Informações da Entrega</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormDropdown
                          label="Carrier / Entregador"
                          value={selectedDeliveryPersonId || "none"}
                          setValue={(v) => setSelectedDeliveryPersonId(v === "none" ? "" : v)}
                          options={[{ value: "none", label: "Sem entregador (não atribuído)" }, ...deliveryPeople.map((p) => ({ value: p.id, label: p.fullName }))]}
                          onFocus={() => { void loadDeliveryPeople() }}
                        />
                        <FormDropdown
                          label="Status"
                          value={status}
                          setValue={setStatus}
                          options={[
                            { value: "not_sent", label: "Não enviado" },
                            { value: "preparing", label: "Preparando" },
                            { value: "sent", label: "Enviado" },
                            { value: "delivered", label: "Entregue" },
                            { value: "pickup_available", label: "Disponível para retirada" },
                            { value: "delivery_failed", label: "Entrega não realizada" },
                            { value: "cancelled", label: "Cancelado" },
                          ]}
                        />
                        <Input label="Data de saída" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                        <Input label="Horário de saída" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                      </div>
                      <div className="mt-4 rounded-lg border border-brand-border dark:border-dark-border p-3">
                        <span className="text-sm font-medium text-brand-inactive-text">Status selecionado: </span>
                        <Badge variant={selectedStatusMeta.variant}>{selectedStatusMeta.label}</Badge>
                      </div>
                    </section>

                    <div className="h-px bg-brand-border dark:bg-dark-border w-full" />
                    <section>
                      <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Itens para enviar</h3>
                      <div className="space-y-3">
                        {(selectedOrder.items || []).length === 0 ? (
                          <div className="text-sm text-brand-inactive-text">A entrega considera o pedido completo (itens não editáveis nesta etapa).</div>
                        ) : (
                          selectedOrder.items.map((item: any) => (
                            <div key={item.id} className="flex items-center gap-3 py-3 border-b border-brand-border dark:border-dark-border">
                              <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border" />
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{item.product_name || "Item"}</p>
                                <p className="text-xs text-brand-inactive-text">{item.sku || "SKU não informado"}</p>
                              </div>
                              <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">x{item.quantity || 0}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </section>
                  </>
                )}
              </div>
              <div className="hidden lg:block col-span-12 lg:col-span-4 border-l border-brand-border dark:border-dark-border pl-12">
                <div className="rounded-2xl border border-brand-border dark:border-dark-border p-5">
                  <h4 className="font-bold text-brand-dark dark:text-dark-heading mb-2">Resumo</h4>
                  <p className="text-sm text-brand-inactive-text">Pedido: {selectedOrder?.displayId || "-"}</p>
                  <p className="text-sm text-brand-inactive-text">Cliente: {selectedOrder?.customer?.name || "-"}</p>
                  <p className="text-sm text-brand-inactive-text">Saída: {date && time ? formatDateTime(new Date(`${date}T${time}:00`)) : "-"}</p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="Observações" className="mt-0">
            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Observações</h3>
            <div className="bg-brand-gray dark:bg-dark-border/30 rounded-2xl border border-brand-border dark:border-dark-border p-5 h-[350px]">
              <textarea
                className="w-full h-full bg-transparent border-none text-[15px] text-brand-dark dark:text-dark-heading focus:outline-none resize-none placeholder:text-brand-inactive-text"
                placeholder="Observações internas da entrega..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </TabsContent>
        </div>
      </Tabs>

      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3">
        <Button variant="outline" onClick={onBack} disabled={isSaving} className="flex-1 h-[48px]">Cancelar</Button>
        <Button onClick={handleSave} disabled={isSaving || !selectedOrder || !date || !time} className="flex-1 h-[48px]">
          <SaveIcon className="w-4 h-4 mr-2" /> {isSaving ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </div>
  )
}
