"use client"

import { useEffect, useState } from "react"
import { XIcon } from "@/lib/icons"
import { Button, CepInput, CustomerCard, Checkbox, MoneyInput, Input } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"

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
  onApply: (payload: { shippingFee: number }) => void
}

export default function POSShippingSheet({
  isOpen,
  onClose,
  selectedCustomerId,
  customerDetails,
  currentShippingFee,
  onCreateAddress,
  onApply,
}: POSShippingSheetProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [shippingInput, setShippingInput] = useState(Number(currentShippingFee || 0))
  const [shippingFree, setShippingFree] = useState(currentShippingFee <= 0)
  const [isAddressSheetOpen, setIsAddressSheetOpen] = useState(false)
  const [isSavingAddress, setIsSavingAddress] = useState(false)

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
    setShippingFree(currentShippingFee <= 0)
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

  const content = (
    <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
      <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Adicionar Envio</h2>
        <Button variant="ghost" onClick={onClose} size="icon">
          <XIcon className="h-5 w-5" />
        </Button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
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
            className="border-brand-border"
          />
        )}

        {hasSelectedCustomer && hasStreet && (
          <MoneyInput
            label="Envio personalizado"
            name="customShippingFee"
            value={shippingFree ? 0 : shippingInput}
            onChange={(value) => setShippingInput(value)}
            suffix={(
              <label className="flex items-center gap-1 text-xs text-brand-dark">
                <Checkbox checked={shippingFree} onChange={() => setShippingFree((prev) => !prev)} name="shippingFree" />
                Sem custo
              </label>
            )}
            readOnly={shippingFree}
          />
        )}

        {hasSelectedCustomer && !hasStreet && (
          <Button className="w-full" onClick={() => setIsAddressSheetOpen(true)}>
            Adicionar endereço
          </Button>
        )}
      </div>

      <footer className="shrink-0 border-t border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="flex-1"
            disabled={!hasSelectedCustomer || !hasStreet}
            onClick={() => onApply({ shippingFee: shippingFeeValue })}
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
            className={`fixed right-4 top-4 bottom-4 w-[520px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`}
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
