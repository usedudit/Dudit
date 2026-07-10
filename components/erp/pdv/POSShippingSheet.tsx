"use client"

import { useEffect, useState } from "react"
import { XIcon } from "@/lib/icons"
import { Button, CepInput, CustomerCard, Checkbox, MoneyInput, Input, Tabs, TabsContent, TabsList, TabsTrigger, NumberInputWithCheckbox, StateComboBox, InfoCard } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { quoteDeliveryFeeAction } from "@/app/actions/shared/delivery"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import AlertModal from "@/components/reusable/AlertModal"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"

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
  const [isCustomShipping, setIsCustomShipping] = useState(false)
  const [calculatedFee, setCalculatedFee] = useState(0)
  const [isAddressSheetOpen, setIsAddressSheetOpen] = useState(false)
  const [isSavingAddress, setIsSavingAddress] = useState(false)
  const [activeTab, setActiveTab] = useState("cliente")
  const [distanceKm, setDistanceKm] = useState<number | null>(null)
  const [breakdown, setBreakdown] = useState<Record<string, unknown> | null>(null)
  const [isQuoteLoading, setIsQuoteLoading] = useState(false)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)

  const [zipCode, setZipCode] = useState("")
  const [street, setStreet] = useState("")
  const [number, setNumber] = useState("")
  const [noNumber, setNoNumber] = useState(false)
  const [complement, setComplement] = useState("")
  const [neighborhood, setNeighborhood] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")

  useEffect(() => {
    if (!isOpen) return
    setShippingInput(Number(currentShippingFee || 0))
    setShippingFree(false)
    setIsCustomShipping(false)
    setCalculatedFee(0)
    setDeliveryError(null)
  }, [isOpen, currentShippingFee])

  useEffect(() => {
    if (!customerDetails?.address) return
    setZipCode(customerDetails.address.zipCode || "")
    setStreet(customerDetails.address.street || "")
    const isNoNumber = customerDetails.address.number === "S/N"
    setNumber(isNoNumber ? "" : customerDetails.address.number || "")
    setNoNumber(isNoNumber)
    setComplement(customerDetails.address.complement || "")
    setNeighborhood(customerDetails.address.neighborhood || "")
    setCity(customerDetails.address.city || "")
    setState(customerDetails.address.state || "")
  }, [customerDetails?.id])

  const isDirty =
    zipCode !== (customerDetails?.address?.zipCode || "") ||
    street !== (customerDetails?.address?.street || "") ||
    (noNumber ? "S/N" : number) !== (customerDetails?.address?.number || "") ||
    complement !== (customerDetails?.address?.complement || "") ||
    neighborhood !== (customerDetails?.address?.neighborhood || "") ||
    city !== (customerDetails?.address?.city || "") ||
    state !== (customerDetails?.address?.state || "")

  const { showConfirmDialog, confirmNavigation, cancelNavigation } = useUnsavedChanges(isDirty && isAddressSheetOpen)
  const [showAlertModal, setShowAlertModal] = useState(false)

  const handleCloseAddressSheet = () => {
    if (isDirty) {
      setShowAlertModal(true)
    } else {
      setIsAddressSheetOpen(false)
    }
  }

  const confirmCloseAddressSheet = () => {
    setShowAlertModal(false)
    setIsAddressSheetOpen(false)
  }

  const hasSelectedCustomer = !!selectedCustomerId
  const hasStreet = !!customerDetails?.address?.street?.trim()
  const shippingFeeValue = isCustomShipping
    ? (shippingFree ? 0 : Math.max(0, Number(shippingInput || 0)))
    : calculatedFee

  useEffect(() => {
    let active = true
    if (!isOpen || !hasSelectedCustomer || !hasStreet) return
    const destinationAddress = `${customerDetails?.address?.street || ""}, ${customerDetails?.address?.number || ""} - ${customerDetails?.address?.neighborhood || ""}, ${customerDetails?.address?.city || ""} - ${customerDetails?.address?.state || ""}, ${customerDetails?.address?.zipCode || ""}`
    setIsQuoteLoading(true)
    setDeliveryError(null)
    ;(async () => {
      const quote = await quoteDeliveryFeeAction({
        partnerId,
        destinationAddress,
      })
      if (!active) return
      if (quote.success) {
        setDistanceKm(Number(quote.distanceKm || 0))
        setBreakdown(quote.breakdown as Record<string, unknown>)
        const fee = Number(quote.fee || 0)
        setCalculatedFee(fee)
        if (!shippingFree) setShippingInput(fee)
        setDeliveryError(null)
      } else {
        setDeliveryError(quote.error || "Não foi possível calcular o frete.")
      }
      setIsQuoteLoading(false)
    })()
    return () => { active = false }
  }, [isOpen, hasSelectedCustomer, hasStreet, customerDetails?.id, customerDetails?.address?.street, customerDetails?.address?.number, customerDetails?.address?.city, customerDetails?.address?.state, customerDetails?.address?.zipCode, customerDetails?.address?.neighborhood, partnerId, shippingFree])

  const content = (
    <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
      <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Adicionar Envio</h2>
        <Button variant="filled" onClick={onClose} size="icon">
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

            {hasSelectedCustomer && !hasStreet && (
              <Button className="w-full" onClick={() => setIsAddressSheetOpen(true)}>
                Adicionar endereço
              </Button>
            )}
          </TabsContent>
          <TabsContent value="valores" className="mt-4 space-y-4">
            {deliveryError ? (
              <InfoCard
                color="red"
                title="Entrega indisponível"
                message={deliveryError}
              />
            ) : (
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
            )}

            {hasSelectedCustomer && hasStreet && (
              <div className="mt-4 pt-4 border-t border-brand-border dark:border-dark-border space-y-4">
                <label className="flex items-center gap-2 text-sm font-medium text-brand-dark dark:text-dark-heading cursor-pointer">
                  <Checkbox checked={isCustomShipping} onChange={() => setIsCustomShipping((prev) => !prev)} name="isCustomShipping" />
                  Envio personalizado
                </label>

                {isCustomShipping && (
                  <MoneyInput
                    label="Valor do Envio"
                    name="customShippingFee"
                    value={shippingFree ? 0 : shippingInput}
                    onChange={(value) => setShippingInput(value)}
                    suffix={(
                      <label className="flex items-center gap-1 text-xs text-brand-dark dark:text-dark-heading cursor-pointer">
                        <Checkbox checked={shippingFree} onChange={() => setShippingFree((prev) => !prev)} name="shippingFree" />
                        Sem custo
                      </label>
                    )}
                    readOnly={shippingFree}
                  />
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
        <div className="flex items-center gap-4">
          <Button variant="outline" className="h-12 flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="h-12 flex-1"
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
        <Button variant="filled" onClick={handleCloseAddressSheet} size="icon">
          <XIcon className="h-5 w-5" />
        </Button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <Input label="Cliente" name="addressCustomerName" value={customerDetails?.name || ""} readOnly />
        <div className="grid grid-cols-2 gap-3">
          <CepInput value={zipCode} onChange={setZipCode} onAddressFetched={(addr) => {
            setStreet(addr.street || "")
            setNeighborhood(addr.neighborhood || "")
            setCity(addr.city || "")
            setState(addr.state || "")
            setNumber(addr.number || "")
            setNoNumber(addr.number === "S/N")
          }} />
          <Input label="Rua/Avenida" name="shippingStreet" placeholder="Rua, Avenida, etc." value={street} onChange={(e) => setStreet(e.target.value)} />
          <NumberInputWithCheckbox
            label="Número"
            number={number}
            noNumber={noNumber}
            onNumberChange={setNumber}
            onNoNumberChange={(checked) => {
              setNoNumber(checked)
              setNumber(checked ? "S/N" : "")
            }}
            placeholder="123"
          />
          <Input label="Complemento" name="shippingComplement" placeholder="Apto, Bloco, etc." value={complement} onChange={(e) => setComplement(e.target.value)} />
          <Input label="Bairro" name="shippingNeighborhood" placeholder="Nome do bairro" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
          <Input label="Cidade" name="shippingCity" placeholder="Nome da cidade" value={city} onChange={(e) => setCity(e.target.value)} />
          <StateComboBox value={state} onChange={setState} />
        </div>
      </div>

      <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
        <div className="flex items-center gap-4">
          <Button variant="outline" className="h-12 flex-1" onClick={handleCloseAddressSheet}>
            Cancelar
          </Button>
          <Button
            className="h-12 flex-1"
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
        <BottomSheet isOpen={isAddressSheetOpen} onClose={handleCloseAddressSheet}>
          {addressSheetContent}
        </BottomSheet>
        <SavingStatusModal isOpen={isSavingAddress} text="Salvando endereço..." />
        <AlertModal
          isOpen={showAlertModal}
          onClose={() => setShowAlertModal(false)}
          onConfirm={confirmCloseAddressSheet}
          title="Sair sem salvar?"
          description="Você tem alterações no endereço que ainda não foram salvas."
          confirmText="Sair sem salvar"
          cancelText="Continuar editando"
          variant="warning"
        />
        {showConfirmDialog && (
          <AlertModal
            isOpen={showConfirmDialog}
            onClose={cancelNavigation}
            onConfirm={confirmNavigation}
            title="Sair sem salvar?"
            description="Você tem alterações no endereço que ainda não foram salvas."
            confirmText="Sair sem salvar"
            cancelText="Continuar editando"
            variant="warning"
          />
        )}
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
          onClick={handleCloseAddressSheet}
        >
          <div
            className={`fixed right-4 top-4 bottom-4 w-[520px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isAddressSheetOpen ? "translate-x-0" : "translate-x-[120%]"}`}
            onClick={(e) => e.stopPropagation()}
          >
            {addressSheetContent}
          </div>
        </div>
      </Portal>

      <SavingStatusModal isOpen={isSavingAddress} text="Salvando endereço..." />
      <AlertModal
        isOpen={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        onConfirm={confirmCloseAddressSheet}
        title="Sair sem salvar?"
        description="Você tem alterações no endereço que ainda não foram salvas."
        confirmText="Sair sem salvar"
        cancelText="Continuar editando"
        variant="warning"
      />
      {showConfirmDialog && (
        <AlertModal
          isOpen={showConfirmDialog}
          onClose={cancelNavigation}
          onConfirm={confirmNavigation}
          title="Sair sem salvar?"
          description="Você tem alterações no endereço que ainda não foram salvas."
          confirmText="Sair sem salvar"
          cancelText="Continuar editando"
          variant="warning"
        />
      )}
    </>
  )
}
