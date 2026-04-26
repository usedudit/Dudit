"use client"

import { useEffect, useState } from "react"
import { XIcon } from "@/lib/icons"
import { Button, CepInput, CustomerCard, Checkbox, MoneyInput, Input, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { quoteDeliveryFeeAction } from "@/app/actions/shared/delivery"

type ShippingCustomerDetails = {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  cpf?: string | null
  address?: {
    zipCode?: string
    street?: string
    number?: string
    complement?: string
    neighborhood?: string
    city?: string
    state?: string
    country?: string
  } | null
} | null

interface POSShippingSheetProps {
  isOpen: boolean
  onClose: () => void
  selectedCustomerId?: string
  customerDetails: ShippingCustomerDetails
  currentShippingFee: number
  partnerId: string
  onCreateAddress: (payload: {
    customerId: string
    address: {
      zipCode: string
      street: string
      number: string
      complement: string
      neighborhood: string
      city: string
      state: string
    }
  }) => Promise<void> | void
  onApply: (payload: { shippingFee: number; distanceKm?: number | null; breakdown?: Record<string, unknown> | null }) => void
}

export default function POSShippingSheet({
  isOpen,
  onClose,
  selectedCustomerId,
  customerDetails,
  currentShippingFee,
  partnerId,
  onCreateAddress,
  onApply,
}: POSShippingSheetProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [shippingInput, setShippingInput] = useState(Number(currentShippingFee || 0))
  const [shippingFree, setShippingFree] = useState(currentShippingFee <= 0)
  const [isAddressSheetOpen, setIsAddressSheetOpen] = useState(false)
  const [isSavingAddress, setIsSavingAddress] = useState(false)
  const [activeTab, setActiveTab] = useState("cliente")
  const [distanceKm, setDistanceKm] = useState<number | null>(null)
  const [breakdown, setBreakdown] = useState<Record<string, unknown> | null>(null)
  const [isQuoteLoading, setIsQuoteLoading] = useState(false)

  const [zipCode, setZipCode] = useState("")
  const [street, setStreet] = useState("")
  const [number, setNumber] = useState("")
  const [complement, setComplement] = useState("")
  const [neighborhood, setNeighborhood] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")

  useEffect(() => {
    if (!isOpen) return
    setShippingInput(Number(currentShippingFee || 0))
    // Keep auto-quote enabled on open; "Sem custo" should be an explicit user choice.
    setShippingFree(false)
  }, [isOpen, currentShippingFee])

  useEffect(() => {
    if (!customerDetails?.address) return
    setZipCode(customerDetails.address.zipCode || "")
    setStreet(customerDetails.address.street || "")
    setNumber(customerDetails.address.number || "")
    setComplement(customerDetails.address.complement || "")
    setNeighborhood(customerDetails.address.neighborhood || "")
    setCity(customerDetails.address.city || "")
    setState(customerDetails.address.state || "")
  }, [customerDetails?.id])

  const hasSelectedCustomer = !!selectedCustomerId
  const hasStreet = !!customerDetails?.address?.street?.trim()
  const shippingFeeValue = shippingFree ? 0 : Math.max(0, Number(shippingInput || 0))

  useEffect(() => {
    let active = true
    if (!isOpen || !hasSelectedCustomer || !hasStreet) return
    const destinationAddress = `${customerDetails?.address?.street || ""}, ${customerDetails?.address?.number || ""} - ${customerDetails?.address?.neighborhood || ""}, ${customerDetails?.address?.city || ""} - ${customerDetails?.address?.state || ""}, ${customerDetails?.address?.zipCode || ""}`
    setIsQuoteLoading(true)
    const timer = setTimeout(async () => {
      const quote = await quoteDeliveryFeeAction({
        partnerId,
        destinationAddress,
      })
      if (!active) return
      if (quote.success) {
        setDistanceKm(Number(quote.distanceKm || 0))
        setBreakdown(quote.breakdown as Record<string, unknown>)
        if (!shippingFree) setShippingInput(Number(quote.fee || 0))
      }
      setIsQuoteLoading(false)
    }, 250)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [isOpen, hasSelectedCustomer, hasStreet, customerDetails?.id, customerDetails?.address?.street, customerDetails?.address?.number, customerDetails?.address?.city, customerDetails?.address?.state, customerDetails?.address?.zipCode, customerDetails?.address?.neighborhood, partnerId, shippingFree])

  const content = (
    <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
      <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Adicionar Envio</h2>
        <Button variant="ghost" onClick={onClose} size="icon">
          <XIcon className="h-5 w-5" />
        </Button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="cliente">Cliente</TabsTrigger>
            <TabsTrigger value="valores">Valores</TabsTrigger>
          </TabsList>
          <TabsContent value="cliente" className="mt-4 space-y-4">
        {!hasSelectedCustomer && (
          <p className="text-sm text-brand-inactive-text">
            Selecione um cliente no PDV para configurar o envio.
          </p>
        )}

        {hasSelectedCustomer && customerDetails && (
          <CustomerCard
            customer={{ name: customerDetails.name || "", email: customerDetails.email || "", phone: customerDetails.phone || "" }}
            address={customerDetails.address || null}
            showMap={hasStreet}
            chrome="minimal"
            className="shadow-none"
          />
        )}

        {hasSelectedCustomer && hasStreet && (
          <div className="mt-6">
            <div className="border-t border-brand-border dark:border-dark-border mb-6 w-full"></div>

            <MoneyInput
              label="Envio personalizado"
              name="customShippingFee"
              value={shippingFree ? 0 : shippingInput}
              onChange={(value) => setShippingInput(value)}
              suffix={(
                <label className="flex items-center gap-1 text-xs text-brand-dark dark:text-dark-heading">
                  <Checkbox checked={shippingFree} onChange={() => setShippingFree((prev) => !prev)} name="shippingFree" />
                  Sem custo
                </label>
              )}
              readOnly={shippingFree}
            />
          </div>
        )}

        {hasSelectedCustomer && !hasStreet && (
          <Button className="w-full" onClick={() => setIsAddressSheetOpen(true)}>
            Adicionar endereço
          </Button>
        )}
          </TabsContent>
          <TabsContent value="valores" className="mt-4 space-y-4">
            <div className="rounded-xl border border-brand-border p-4 text-sm dark:border-dark-border">
              <div className="flex justify-between"><span>Distância</span><span>{distanceKm == null ? "-" : `${distanceKm.toFixed(2)} km`}</span></div>
              <div className="flex justify-between"><span>Taxa base</span><span>R$ {Number((breakdown as any)?.baseFee || 0).toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Taxa por distância</span><span>R$ {Number((breakdown as any)?.distanceFee || 0).toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Ajuste por horário</span><span>R$ {Number((breakdown as any)?.timeAdjustmentTotal || 0).toFixed(2)}</span></div>
              <div className="mt-2 border-t border-brand-border pt-2 font-bold dark:border-dark-border flex justify-between">
                <span>Taxa final</span><span>R$ {Number(shippingFeeValue || 0).toFixed(2)}</span>
              </div>
              {isQuoteLoading && <p className="mt-2 text-xs text-brand-inactive-text">Recalculando valores...</p>}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <footer className="shrink-0 border-t border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="flex-1"
            disabled={!hasSelectedCustomer || !hasStreet}
            onClick={() => onApply({ shippingFee: shippingFeeValue, distanceKm, breakdown })}
          >
            Aplicar envio
          </Button>
        </div>
      </footer>
    </div>
  )

  const addressSheetContent = (
    <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
      <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Cadastrar Endereço</h2>
        <Button variant="ghost" onClick={() => setIsAddressSheetOpen(false)} size="icon">
          <XIcon className="h-5 w-5" />
        </Button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <Input label="Cliente" name="addressCustomerName" value={customerDetails?.name || ""} readOnly />
        <div className="grid grid-cols-2 gap-3">
          <CepInput label="CEP" value={zipCode} onChange={setZipCode} onAddressFetched={(addr) => {
            setStreet(addr.street || "")
            setNeighborhood(addr.neighborhood || "")
            setCity(addr.city || "")
            setState(addr.state || "")
          }} />
          <Input label="Endereço" name="shippingStreet" value={street} onChange={(e) => setStreet(e.target.value)} />
          <Input label="Número" name="shippingNumber" value={number} onChange={(e) => setNumber(e.target.value)} />
          <Input label="Complemento" name="shippingComplement" value={complement} onChange={(e) => setComplement(e.target.value)} />
          <Input label="Bairro" name="shippingNeighborhood" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
          <Input label="Cidade" name="shippingCity" value={city} onChange={(e) => setCity(e.target.value)} />
          <Input label="UF" name="shippingState" value={state} onChange={(e) => setState(e.target.value)} />
        </div>
      </div>

      <footer className="shrink-0 border-t border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="flex-1" onClick={() => setIsAddressSheetOpen(false)}>
            Cancelar
          </Button>
          <Button
            className="flex-1"
            isLoading={isSavingAddress}
            onClick={async () => {
              if (!customerDetails?.id) return
              setIsSavingAddress(true)
              try {
                await onCreateAddress({
                  customerId: customerDetails.id,
                  address: { zipCode, street, number, complement, neighborhood, city, state },
                })
                setIsAddressSheetOpen(false)
              } finally {
                setIsSavingAddress(false)
              }
            }}
          >
            Salvar endereço
          </Button>
        </div>
      </footer>
    </div>
  )

  if (isMobile) {
    return (
      <>
        <BottomSheet isOpen={isOpen} onClose={onClose}>{content}</BottomSheet>
        <BottomSheet isOpen={isAddressSheetOpen} onClose={() => setIsAddressSheetOpen(false)}>
          {addressSheetContent}
        </BottomSheet>
      </>
    )
  }

  return (
    <>
      <Portal>
        <div
          className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
          onClick={onClose}
        >
          <div
            className={`fixed right-4 top-4 bottom-4 w-[520px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 dark:bg-dark-surface ${isOpen
              ? isAddressSheetOpen
                ? "-translate-x-10 scale-[0.97] opacity-70"
                : "translate-x-0 opacity-100"
              : "translate-x-[120%] opacity-100"
              }`}
            onClick={(e) => e.stopPropagation()}
          >
            {content}
          </div>
        </div>
      </Portal>
      <Portal>
        <div
          className={`fixed inset-0 z-[60] bg-black/50 transition-opacity duration-300 ${isAddressSheetOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
          onClick={() => setIsAddressSheetOpen(false)}
        >
          <div
            className={`fixed right-4 top-4 bottom-4 w-[520px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isAddressSheetOpen ? "translate-x-0" : "translate-x-[120%]"}`}
            onClick={(e) => e.stopPropagation()}
          >
            {addressSheetContent}
          </div>
        </div>
      </Portal>
    </>
  )
}
