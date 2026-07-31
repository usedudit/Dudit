"use client"

import { useEffect, useState } from "react"
import { XIcon } from "@/lib/icons"
import { Button, CepInput, CustomerCard, Checkbox, MoneyInput, Input, Tabs, TabsContent, TabsList, TabsTrigger, NumberInputWithCheckbox, StateComboBox, InfoCard, Badge } from "@/components/reusable"
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
    image_url?: string | null
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
    storeId?: string | null
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
    storeId,
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
    const [outsideRadiusWarning, setOutsideRadiusWarning] = useState<string | null>(null)

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
        setOutsideRadiusWarning(null)
    }, [isOpen, currentShippingFee])

    useEffect(() => {
        if (!customerDetails?.address) return
        setZipCode(customerDetails.address.zipCode || "")
        setStreet(customerDetails.address.street || "")
        const isNoNumber = customerDetails.address.number === "S/N"
        setNoNumber(isNoNumber)
        setNumber(isNoNumber ? "" : customerDetails.address.number || "")
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

    const isStoreSubsidizedBySettings = (breakdown as any)?.deliveryPayer === "seller"
    const isSubsidized = isCustomShipping ? shippingFree : isStoreSubsidizedBySettings

    const calculatedOriginalFee = Number((breakdown as any)?.originalFee || (breakdown as any)?.baseFee || 0)
    const feeToDisplay = isCustomShipping
        ? Math.max(0, Number(shippingInput || calculatedFee || 0))
        : (calculatedOriginalFee > 0 ? calculatedOriginalFee : calculatedFee)

    useEffect(() => {
        let active = true
        if (!isOpen || !hasSelectedCustomer || !hasStreet) return
        const destinationAddress = `${customerDetails?.address?.street || ""}, ${customerDetails?.address?.number || ""} - ${customerDetails?.address?.neighborhood || ""}, ${customerDetails?.address?.city || ""} - ${customerDetails?.address?.state || ""}, ${customerDetails?.address?.zipCode || ""}`
        setIsQuoteLoading(true)
        setDeliveryError(null)
        setOutsideRadiusWarning(null)
            ; (async () => {
                const quote = await quoteDeliveryFeeAction({
                    partnerId,
                    storeId,
                    destinationAddress,
                    allowOutsideRadius: true,
                })
                if (!active) return
                if (quote.success) {
                    setDistanceKm(Number(quote.distanceKm || 0))
                    setBreakdown(quote.breakdown as Record<string, unknown>)
                    const fee = Number(quote.fee || 0)
                    const origFee = Number((quote.breakdown as any)?.originalFee || fee)
                    setCalculatedFee(origFee || fee)
                    if (!shippingFree) setShippingInput(origFee || fee)
                    setDeliveryError(null)
                    if (quote.isOutsideRadius || (quote.breakdown as any)?.isOutsideRadius) {
                        setOutsideRadiusWarning(
                            quote.outsideRadiusWarning ||
                            (quote.breakdown as any)?.outsideRadiusWarning ||
                            `Endereço fora do raio máximo de entrega da loja (${quote.distanceKm} km / Máximo: ${quote.maxDeliveryKm} km).`
                        )
                    } else {
                        setOutsideRadiusWarning(null)
                    }
                } else {
                    setDeliveryError(quote.error || "Não foi possível calcular o frete.")
                    setOutsideRadiusWarning(null)
                }
                setIsQuoteLoading(false)
            })()
        return () => { active = false }
    }, [
        isOpen,
        hasSelectedCustomer,
        hasStreet,
        partnerId,
        storeId,
        shippingFree,
        activeTab,
        customerDetails?.id,
        customerDetails?.address?.street,
        customerDetails?.address?.zipCode,
    ])

    const content = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Adicionar Envio</h2>
                <Button variant="filled" onClick={onClose} size="icon">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-6">
                {outsideRadiusWarning && (
                    <InfoCard
                        color="orange"
                        title="Atenção: Raio de entrega"
                        message={outsideRadiusWarning}
                    />
                )}
                {deliveryError && (
                    <InfoCard
                        color="red"
                        message={deliveryError}
                    />
                )}
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
                                customer={{ name: customerDetails.name || "", email: customerDetails.email || "", phone: customerDetails.phone || "", image_url: customerDetails.image_url || null }}
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
                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-brand-inactive-text dark:text-dark-body font-semibold">Distância</span>
                                    <span className="font-bold text-brand-dark dark:text-dark-heading">{distanceKm == null ? "-" : `${distanceKm.toFixed(2)} km`}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-brand-inactive-text dark:text-dark-body font-semibold">Taxa base</span>
                                    <span className="font-bold text-brand-dark dark:text-dark-heading">R$ {Number((breakdown as any)?.baseFee || 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-brand-inactive-text dark:text-dark-body font-semibold">Taxa por distância</span>
                                    <span className="font-bold text-brand-dark dark:text-dark-heading">R$ {Number((breakdown as any)?.distanceFee || 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-brand-inactive-text dark:text-dark-body font-semibold">Ajuste por horário</span>
                                    <span className="font-bold text-brand-dark dark:text-dark-heading">R$ {Number((breakdown as any)?.timeAdjustmentTotal || 0).toFixed(2)}</span>
                                </div>

                                <div className="mt-2 border-t border-brand-border pt-2 font-bold dark:border-dark-border flex justify-between items-center">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-brand-inactive-text dark:text-dark-body font-semibold">Taxa do envio</span>
                                        <div className="flex">
                                            <span className="font-bold text-brand-dark dark:text-dark-heading">R$ {feeToDisplay.toFixed(2)}</span>
                                            {isSubsidized && (
                                                <Badge variant="orange" className="ml-2">Subsidiado pela loja</Badge>
                                            )}
                                        </div>
                                    </div>
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
                                        value={shippingInput}
                                        onChange={(value) => setShippingInput(value)}
                                        suffix={(
                                            <label className="flex items-center gap-1 text-xs text-brand-dark dark:text-dark-heading cursor-pointer">
                                                <Checkbox checked={shippingFree} onChange={() => setShippingFree((prev) => !prev)} name="shippingFree" />
                                                Sem custo (subsidiado)
                                            </label>
                                        )}
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
                        onClick={() => {
                            const effectiveDeliveryPayer = isSubsidized ? "seller" : "customer"
                            const effectiveOriginalFee = feeToDisplay
                            const effectiveCustomerFee = effectiveDeliveryPayer === "seller" ? 0 : effectiveOriginalFee

                            onApply({
                                shippingFee: effectiveCustomerFee,
                                distanceKm,
                                breakdown: {
                                    ...breakdown,
                                    deliveryPayer: effectiveDeliveryPayer,
                                    originalFee: effectiveOriginalFee,
                                    deliverySubsidy: effectiveDeliveryPayer === "seller" ? effectiveOriginalFee : 0,
                                },
                            })
                        }}
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
