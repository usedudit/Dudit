"use client"

import { useEffect, useRef, useState } from "react"
import { XIcon, TruckIcon } from "@/lib/icons"
import { Button, CepInput, CustomerCard, Checkbox, MoneyInput, Input, Tabs, TabsContent, TabsList, TabsTrigger, NumberInputWithCheckbox, StateComboBox, InfoCard } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { quoteDeliveryFeeAction } from "@/app/actions/shared/delivery"
import { quoteCarrierFreightAction, type CarrierFreightOption } from "@/app/actions/marketplace/carrier-shipping"
import { formatCurrency, formatDeliveryDaysRange } from "@/lib/utils"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import AlertModal from "@/components/reusable/AlertModal"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"
import { useModalLayer } from "@/lib/modal-stack"

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
        latitude?: number | null
        longitude?: number | null
    } | null
} | null

export type ShippingAddress = {
    zipCode?: string
    street?: string
    number?: string
    complement?: string
    neighborhood?: string
    city?: string
    state?: string
    country?: string
    latitude?: number | null
    longitude?: number | null
} | null

interface POSShippingSheetProps {
    isOpen: boolean
    onClose: () => void
    selectedCustomerId?: string
    customerDetails: ShippingCustomerDetails
    currentShippingFee: number
    partnerId: string
    storeId?: string | null
    deliveryAddress?: ShippingAddress
    orderSubtotal?: number
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
            latitude?: number | null
            longitude?: number | null
        }
    }) => Promise<void> | void
    onApply: (payload: {
        shippingFee: number
        distanceKm?: number | null
        breakdown?: Record<string, unknown> | null
        deliveryAddress?: ShippingAddress
    }) => void
}

export default function POSShippingSheet({
    isOpen,
    onClose,
    selectedCustomerId,
    customerDetails,
    currentShippingFee,
    partnerId,
    storeId,
    deliveryAddress,
    orderSubtotal,
    onCreateAddress,
    onApply,
}: POSShippingSheetProps) {
    const isMobile = useMediaQuery("(max-width: 1023px)")

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

    const [carrierOptions, setCarrierOptions] = useState<CarrierFreightOption[]>([])
    const [carrierLoading, setCarrierLoading] = useState(false)
    const [carrierError, setCarrierError] = useState<string | null>(null)
    const [selectedCarrierServiceId, setSelectedCarrierServiceId] = useState<number | null>(null)
    const carrierFetchedCepRef = useRef<string | null>(null)
    const carrierFetchIdRef = useRef(0)

    const [zipCode, setZipCode] = useState("")
    const [street, setStreet] = useState("")
    const [number, setNumber] = useState("")
    const [noNumber, setNoNumber] = useState(false)
    const [complement, setComplement] = useState("")
    const [neighborhood, setNeighborhood] = useState("")
    const [city, setCity] = useState("")
    const [state, setState] = useState("")
    const [latitude, setLatitude] = useState<number | null>(null)
    const [longitude, setLongitude] = useState<number | null>(null)

    const [useOrderAddress, setUseOrderAddress] = useState(false)

    // z-index dinâmico: cada sheet abre acima de tudo que já estava aberto.
    const zIndex = useModalLayer(isOpen)
    const addressZIndex = useModalLayer(isAddressSheetOpen)

    const hasOrderAddress = !!(deliveryAddress && (deliveryAddress.street || deliveryAddress.zipCode))
    const activeAddress = (useOrderAddress && hasOrderAddress) ? deliveryAddress : customerDetails?.address
    const activeHasStreet = !!activeAddress?.street?.trim()

    useEffect(() => {
        if (!isOpen) return
        setShippingInput(Number(currentShippingFee || 0))
        setShippingFree(false)
        setIsCustomShipping(false)
        setCalculatedFee(Number(currentShippingFee || 0))
        setDeliveryError(null)
        setOutsideRadiusWarning(null)
        setCarrierOptions([])
        setCarrierLoading(false)
        setCarrierError(null)
        setSelectedCarrierServiceId(null)
        carrierFetchedCepRef.current = null
        carrierFetchIdRef.current++
        if (hasOrderAddress) setUseOrderAddress(true)
    }, [isOpen, currentShippingFee, hasOrderAddress])

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
        setLatitude(typeof customerDetails.address.latitude === "number" ? customerDetails.address.latitude : null)
        setLongitude(typeof customerDetails.address.longitude === "number" ? customerDetails.address.longitude : null)
    }, [
        customerDetails?.id,
        customerDetails?.address?.zipCode,
        customerDetails?.address?.street,
        customerDetails?.address?.number,
        customerDetails?.address?.complement,
        customerDetails?.address?.neighborhood,
        customerDetails?.address?.city,
        customerDetails?.address?.state,
        customerDetails?.address?.latitude,
        customerDetails?.address?.longitude,
    ])

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
    const isFreeByThreshold = Boolean((breakdown as any)?.isFreeByThreshold)
    const freeDeliveryThreshold = Number((breakdown as any)?.freeDeliveryThreshold || 0)
    const orderSubtotalNumber = Number(orderSubtotal || 0)

    // A seção de transportadora só vale quando o frete próprio não cobre
    // (fora do raio ou erro de cotação).
    const carrierSectionVisible = Boolean(outsideRadiusWarning || deliveryError)
    const effectiveCarrierOption = carrierSectionVisible && carrierOptions.length > 0
        ? (carrierOptions.find((o) => o.serviceId === selectedCarrierServiceId) || carrierOptions[0])
        : null
    const useCarrier = carrierSectionVisible && !isCustomShipping && Boolean(effectiveCarrierOption)

    const feeToDisplay = isCustomShipping
        ? Math.max(0, Number(shippingInput || calculatedFee || 0))
        : (useCarrier && effectiveCarrierOption
            ? effectiveCarrierOption.price
            : calculatedFee)

    const isFreeShipping = feeToDisplay <= 0 && (isSubsidized || isFreeByThreshold)
    const isWithinRadius = !carrierSectionVisible
    const isOwnDeliveryActive = isWithinRadius && !useCarrier && !isCustomShipping
    const showFreeShippingThreshold =
        isOwnDeliveryActive && freeDeliveryThreshold > 0 && orderSubtotalNumber > 0

    const shippingFreeRef = useRef(shippingFree)
    useEffect(() => {
        shippingFreeRef.current = shippingFree
    }, [shippingFree])

    // Coordenadas já conhecidas do endereço ativo (cliente/pedido). Quando
    // presentes, evitam a geocodificação no servidor (a parte mais lenta da
    // cotação de frete próprio - API externa com retries).
    const activeCoords = (activeAddress?.latitude != null && activeAddress?.longitude != null)
        ? { lat: Number(activeAddress.latitude), lng: Number(activeAddress.longitude) }
        : null

    useEffect(() => {
        let active = true
        if (!isOpen || !hasSelectedCustomer || !activeHasStreet) return
        const destinationAddress = `${activeAddress?.street || ""}, ${activeAddress?.number || ""} - ${activeAddress?.neighborhood || ""}, ${activeAddress?.city || ""} - ${activeAddress?.state || ""}, ${activeAddress?.zipCode || ""}`
        setIsQuoteLoading(true)
        setDeliveryError(null)
        setOutsideRadiusWarning(null)
        // Debounce: evita disparar a cotação a cada tecla/atualização de estado.
        const timer = setTimeout(() => {
            ; (async () => {
                const quote = await quoteDeliveryFeeAction({
                    partnerId,
                    storeId,
                    destinationAddress,
                    destinationCoords: activeCoords,
                    orderSubtotal,
                    allowOutsideRadius: true,
                })
                if (!active) return
                if (quote.success) {
                    setDistanceKm(Number(quote.distanceKm || 0))
                    setBreakdown(quote.breakdown as Record<string, unknown>)
                    const fee = Number(quote.fee || 0)
                    setCalculatedFee(fee)
                    if (!shippingFreeRef.current) setShippingInput(fee)
                    setDeliveryError(null)
                    if (quote.isOutsideRadius || (quote.breakdown as any)?.isOutsideRadius) {
                        setOutsideRadiusWarning(
                            quote.outsideRadiusWarning ||
                            (quote.breakdown as any)?.outsideRadiusWarning ||
                            `Endereço fora do raio de entrega (${quote.distanceKm} km / Máximo: ${quote.maxDeliveryKm} km).`
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
        }, 120)
        return () => { active = false; clearTimeout(timer) }
    }, [
        isOpen,
        hasSelectedCustomer,
        activeHasStreet,
        partnerId,
        storeId,
        useOrderAddress,
        customerDetails?.id,
        customerDetails?.address?.street,
        customerDetails?.address?.zipCode,
        customerDetails?.address?.latitude,
        customerDetails?.address?.longitude,
        deliveryAddress?.street,
        deliveryAddress?.zipCode,
        orderSubtotal,
    ])

    // Transportadora cotada em PARALELO com o frete próprio assim que o CEP é
    // conhecido. Antes, a cotação só começava depois do frete próprio resolver
    // e sinalizar "fora do raio" (serial) - o tempo total era a soma das duas
    // chamadas (a da SuperFrete é a mais lenta). Com o prefetch paralelo, quando
    // o aviso "fora do raio" aparece as opções já estão prontas. Resultados não
    // usados (dentro do raio) são descartados na UI e ficam no cache em memória.
    const destinationCep = String(activeAddress?.zipCode || "").replace(/\D/g, "")
    useEffect(() => {
        if (!isOpen || !hasSelectedCustomer || !activeHasStreet) return
        if (carrierFetchedCepRef.current === destinationCep && !carrierError) return
        carrierFetchedCepRef.current = destinationCep
        const fetchId = ++carrierFetchIdRef.current

        setCarrierOptions([])
        setSelectedCarrierServiceId(null)
        if (destinationCep.length === 8) {
            setCarrierLoading(true)
            setCarrierError(null)
            quoteCarrierFreightAction({ partnerId, toPostalCode: destinationCep })
                .then((res) => {
                    if (carrierFetchIdRef.current !== fetchId) return
                    if (res.success && res.options.length > 0) {
                        setCarrierOptions(res.options)
                        setCarrierError(null)
                    } else {
                        setCarrierError(!res.success ? res.error : "Nenhuma transportadora disponível para este CEP.")
                    }
                })
                .catch(() => {
                    if (carrierFetchIdRef.current !== fetchId) return
                    setCarrierError("Não foi possível calcular o frete da transportadora.")
                })
                .finally(() => {
                    if (carrierFetchIdRef.current !== fetchId) return
                    setCarrierLoading(false)
                })
        } else {
            setCarrierLoading(false)
            setCarrierError("Informe o CEP para cotar a transportadora.")
        }
    }, [isOpen, hasSelectedCustomer, activeHasStreet, destinationCep, partnerId])

    const content = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Adicionar Envio</h2>
                <Button variant="filled" onClick={onClose} size="icon" className="hidden lg:flex">
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

                        {hasSelectedCustomer && hasOrderAddress && (
                            <div className="flex flex-col gap-1">
                                <Checkbox
                                    label="Usar endereço de entrega do pedido"
                                    checked={useOrderAddress}
                                    onChange={setUseOrderAddress}
                                    name="useOrderAddress"
                                />
                                <p className="text-xs text-brand-inactive-text">
                                    Quando ativado, o frete é calculado pelo endereço definido na aba de Entrega, que pode ser diferente do endereço do cliente.
                                </p>
                            </div>
                        )}

                        {hasSelectedCustomer && customerDetails && (
                            <CustomerCard
                                customer={{ name: customerDetails.name || "", email: customerDetails.email || "", phone: customerDetails.phone || "", image_url: customerDetails.image_url || null }}
                                address={activeAddress || null}
                                showMap={activeHasStreet}
                                chrome="minimal"
                                className="shadow-none"
                            />
                        )}

                        {hasSelectedCustomer && !useOrderAddress && !hasStreet && (
                            <Button className="w-full" onClick={() => setIsAddressSheetOpen(true)}>
                                Adicionar endereço
                            </Button>
                        )}
                    </TabsContent>
                    <TabsContent value="valores" className="mt-4 space-y-4">
                        {outsideRadiusWarning && (
                            <InfoCard
                                color="orange"
                                title="Atenção: Raio de entrega"
                                message={outsideRadiusWarning}
                            />
                        )}
                        {carrierSectionVisible && (
                            <div className="space-y-2">
                                {carrierLoading && (
                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                        Calculando opções de transporte...
                                    </p>
                                )}
                                {!carrierLoading && carrierError && (
                                    <p className="text-xs text-brand-red">{carrierError}</p>
                                )}
                                {!carrierLoading && !carrierError && carrierOptions.map((opt) => {
                                    const isSelected = !isCustomShipping && (effectiveCarrierOption?.serviceId === opt.serviceId)
                                    return (
                                        <button
                                            key={opt.serviceId}
                                            type="button"
                                            onClick={() => setSelectedCarrierServiceId(opt.serviceId)}
                                            className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${isSelected
                                                ? "border-brand-green bg-green-50/40 dark:bg-green-900/10"
                                                : "border-brand-border dark:border-dark-border hover:border-brand-green/60 dark:hover:border-brand-green/40"
                                                }`}
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                    {[opt.companyName, opt.serviceName].filter(Boolean).join(" - ")}
                                                </span>
                                                <span className="block text-xs text-brand-inactive-text dark:text-dark-body">
                                                    {formatDeliveryDaysRange(opt.deliveryMinDays, opt.deliveryMaxDays)}
                                                </span>
                                            </span>
                                            <span className="shrink-0 text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                {formatCurrency(opt.price)}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                        {deliveryError ? (
                            <InfoCard
                                color="red"
                                title="Entrega indisponível"
                                message={deliveryError}
                            />
                        ) : (
                            <div className="space-y-3">
                                {showFreeShippingThreshold && !isFreeByThreshold && (() => {
                                    const diff = Math.max(0, freeDeliveryThreshold - orderSubtotalNumber)
                                    const pct = Math.min(100, (orderSubtotalNumber / freeDeliveryThreshold) * 100)
                                    return (
                                        <div className="flex items-center gap-3 p-3 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                                            <div className="w-8 h-8 rounded-full bg-brand-green/10 flex items-center justify-center shrink-0">
                                                <TruckIcon className="h-4 w-4 text-brand-green" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Frete Grátis</p>
                                                <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                    Falta <strong className="text-brand-green">{formatCurrency(diff)}</strong> para entrega grátis
                                                </p>
                                                <div className="w-full bg-brand-gray dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-1.5">
                                                    <div className="bg-brand-green h-full rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })()}

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

                                <div className="flex items-center justify-between gap-2 text-sm mt-2 pt-2 border-t border-brand-border dark:border-dark-border">
                                    <span className="text-brand-inactive-text dark:text-dark-body font-semibold">Taxa do envio</span>
                                    <div className="flex items-center justify-end gap-1.5">
                                        {isFreeShipping ? (
                                            <>
                                                <s className="text-sm line-through text-brand-inactive-text dark:text-dark-body font-normal">{formatCurrency(calculatedOriginalFee)} | </s>
                                                <span className="text-sm font-bold text-brand-green">Grátis</span>
                                            </>
                                        ) : (
                                            <span className="font-bold text-brand-dark dark:text-dark-heading">R$ {feeToDisplay.toFixed(2)}</span>
                                        )}
                                    </div>
                                </div>
                                {isSubsidized && !isFreeShipping && (
                                    <p className="text-xs text-brand-orange">Subsidiado pela loja</p>
                                )}

                                {isQuoteLoading && <p className="mt-2 text-xs text-brand-inactive-text">Recalculando valores...</p>}
                            </div>
                        )}

                        {hasSelectedCustomer && activeHasStreet && (
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
                                                Sem custo
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
                        disabled={!hasSelectedCustomer || !activeHasStreet}
                        onClick={() => {
                            const carrier = useCarrier ? effectiveCarrierOption : null
                            const effectiveDeliveryPayer = carrier
                                ? "customer"
                                : (isSubsidized ? "seller" : "customer")
                            // Preserva a taxa original (antes do desconto de frete
                            // grátis/subsídio) para o "riscado" no detalhe do pedido.
                            const effectiveOriginalFee = calculatedOriginalFee > 0 ? calculatedOriginalFee : feeToDisplay
                            const effectiveCustomerFee = effectiveDeliveryPayer === "seller" ? 0 : feeToDisplay

                            onApply({
                                shippingFee: effectiveCustomerFee,
                                distanceKm,
                                breakdown: carrier
                                    ? {
                                        ...breakdown,
                                        source: "superfrete",
                                        carrier: "SuperFrete",
                                        serviceId: carrier.serviceId,
                                        serviceName: carrier.serviceName,
                                        companyName: carrier.companyName,
                                        deliveryMinDays: carrier.deliveryMinDays,
                                        deliveryMaxDays: carrier.deliveryMaxDays,
                                        toPostalCode: String(activeAddress?.zipCode || "").replace(/\D/g, ""),
                                        originalFee: carrier.price,
                                        deliveryPayer: "customer",
                                        deliverySubsidy: 0,
                                    }
                                    : {
                                        ...breakdown,
                                        deliveryPayer: effectiveDeliveryPayer,
                                        originalFee: effectiveOriginalFee,
                                        deliverySubsidy: effectiveDeliveryPayer === "seller" ? effectiveOriginalFee : 0,
                                    },
                                deliveryAddress: activeAddress || null,
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
                <Button variant="filled" onClick={handleCloseAddressSheet} size="icon" className="hidden lg:flex">
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
                        setLatitude(typeof addr.latitude === "number" ? addr.latitude : null)
                        setLongitude(typeof addr.longitude === "number" ? addr.longitude : null)
                        if (addr.number) {
                            if (addr.number === "S/N") {
                                setNoNumber(true)
                                setNumber("")
                            } else {
                                setNoNumber(false)
                                setNumber(addr.number)
                            }
                        }
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
                                    address: { zipCode, street, number, complement, neighborhood, city, state, latitude, longitude },
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
                    style={{ zIndex }}
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
                    style={{ zIndex: addressZIndex }}
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
