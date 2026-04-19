"use client"

import { useEffect, useMemo, useState } from "react"
import { SearchIcon, XIcon, PlusIcon } from "@/lib/icons"
import { Button, Input, CepInput, CustomerCard, Checkbox } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"

type ShippingCustomer = { id: string; name: string }

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

type NewCustomerPayload = {
  name: string
  email: string
  phone: string
  cpf: string
  address: {
    zipCode: string
    street: string
    number: string
    complement: string
    neighborhood: string
    city: string
    state: string
  }
}

interface POSShippingSheetProps {
  isOpen: boolean
  onClose: () => void
  customers: ShippingCustomer[]
  selectedCustomerId?: string
  customerDetails: ShippingCustomerDetails
  currentShippingFee: number
  onSelectCustomer: (customerId: string) => Promise<void> | void
  onCreateCustomer: (payload: NewCustomerPayload) => Promise<void> | void
  onApply: (payload: { shippingFee: number }) => void
  isCreatingCustomer?: boolean
}

export default function POSShippingSheet({
  isOpen,
  onClose,
  customers,
  selectedCustomerId,
  customerDetails,
  currentShippingFee,
  onSelectCustomer,
  onCreateCustomer,
  onApply,
  isCreatingCustomer = false,
}: POSShippingSheetProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [search, setSearch] = useState("")
  const [mode, setMode] = useState<"select" | "create">("select")
  const [shippingInput, setShippingInput] = useState(String(currentShippingFee || 0))
  const [shippingFree, setShippingFree] = useState(currentShippingFee <= 0)

  const [newCustomerName, setNewCustomerName] = useState("")
  const [newCustomerEmail, setNewCustomerEmail] = useState("")
  const [newCustomerPhone, setNewCustomerPhone] = useState("")
  const [newCustomerCpf, setNewCustomerCpf] = useState("")
  const [zipCode, setZipCode] = useState("")
  const [street, setStreet] = useState("")
  const [number, setNumber] = useState("")
  const [complement, setComplement] = useState("")
  const [neighborhood, setNeighborhood] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")

  useEffect(() => {
    if (!isOpen) return
    setShippingInput(String(currentShippingFee || 0))
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

  const filteredCustomers = useMemo(
    () => customers.filter((customer) => customer.name.toLowerCase().includes(search.toLowerCase())),
    [customers, search]
  )

  const handleCreateCustomer = async () => {
    await onCreateCustomer({
      name: newCustomerName.trim(),
      email: newCustomerEmail.trim(),
      phone: newCustomerPhone.trim(),
      cpf: newCustomerCpf.trim(),
      address: { zipCode, street, number, complement, neighborhood, city, state },
    })
  }

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
        <div className="grid grid-cols-2 gap-2">
          <Button variant={mode === "select" ? "default" : "outline"} onClick={() => setMode("select")}>
            Selecionar cliente
          </Button>
          <Button variant={mode === "create" ? "default" : "outline"} onClick={() => setMode("create")}>
            Novo cliente
          </Button>
        </div>

        {mode === "select" ? (
          <div className="space-y-3">
            <Input
              label=""
              name="shippingCustomerSearch"
              placeholder="Buscar cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
              variant="full-rounded"
              className="mb-0"
            />
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {filteredCustomers.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => onSelectCustomer(customer.id)}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left ${
                    selectedCustomerId === customer.id
                      ? "border-brand-primary bg-brand-primary/10"
                      : "border-brand-border bg-white hover:bg-brand-gray/30"
                  }`}
                >
                  <span className="font-bold text-brand-dark">{customer.name}</span>
                  <PlusIcon className="h-4 w-4 text-brand-inactive-text" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Input label="Nome" name="newCustomerName" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} />
            <Input label="Email" name="newCustomerEmail" type="email" value={newCustomerEmail} onChange={(e) => setNewCustomerEmail(e.target.value)} />
            <Input label="CPF" name="newCustomerCpf" value={newCustomerCpf} onChange={(e) => setNewCustomerCpf(e.target.value)} />
            <Input label="Telefone" name="newCustomerPhone" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <CepInput label="CEP" value={zipCode} onChange={setZipCode} onAddressFetched={(addr) => {
                setStreet(addr.street || "")
                setNeighborhood(addr.neighborhood || "")
                setCity(addr.city || "")
                setState(addr.state || "")
              }} />
              <Input label="Endereço" name="newCustomerStreet" value={street} onChange={(e) => setStreet(e.target.value)} />
              <Input label="Número" name="newCustomerNumber" value={number} onChange={(e) => setNumber(e.target.value)} />
              <Input label="Complemento" name="newCustomerComplement" value={complement} onChange={(e) => setComplement(e.target.value)} />
              <Input label="Bairro" name="newCustomerNeighborhood" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
              <Input label="Cidade" name="newCustomerCity" value={city} onChange={(e) => setCity(e.target.value)} />
              <Input label="UF" name="newCustomerState" value={state} onChange={(e) => setState(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handleCreateCustomer} isLoading={isCreatingCustomer}>
              Cadastrar cliente
            </Button>
          </div>
        )}

        <div className="rounded-xl border border-brand-border p-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nome" name="shippingCustomerName" value={customerDetails?.name || ""} readOnly />
            <Input label="Email" name="shippingCustomerEmail" value={customerDetails?.email || ""} readOnly />
            <Input label="CPF" name="shippingCustomerCpf" value={customerDetails?.cpf || ""} readOnly />
          </div>
          <CustomerCard
            customer={{ name: customerDetails?.name || "", email: customerDetails?.email || "", phone: customerDetails?.phone || "" }}
            address={customerDetails?.address || null}
            showMap={false}
            className="mt-3 border-0 shadow-none"
          />
          {!customerDetails?.address?.street && (
            <div className="mt-3 grid grid-cols-2 gap-3">
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
          )}
        </div>

        <Input
          label="Envio personalizado"
          name="customShippingFee"
          type="number"
          value={shippingFree ? 0 : shippingInput}
          onChange={(e) => setShippingInput(e.target.value)}
          prefix={<span>R$</span>}
          suffix={(
            <label className="flex items-center gap-1 text-xs text-brand-dark">
              <Checkbox checked={shippingFree} onChange={() => setShippingFree((prev) => !prev)} name="shippingFree" />
              Sem custo
            </label>
          )}
          readOnly={shippingFree}
        />
      </div>

      <footer className="shrink-0 border-t border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={() => onApply({ shippingFee: shippingFeeValue })}>
            Aplicar envio
          </Button>
        </div>
      </footer>
    </div>
  )

  if (isMobile) {
    return <BottomSheet isOpen={isOpen} onClose={onClose}>{content}</BottomSheet>
  }

  return (
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
  )
}
