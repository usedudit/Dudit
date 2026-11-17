"use client"

import React from "react"
import { FadeIn } from "@/components/animations/FadeIn"
import { Button, DatePicker, FormDropdown, FormSection, InfoCard, Input, SidebarCard, TimePicker } from "@/components/reusable"
import { usePermissions } from "@/lib/permission-context"
import { CepInput } from "@/components/reusable/Inputs/CepInput"
import { StateComboBox } from "@/components/reusable/Inputs/StateComboBox"
import { NumberInputWithCheckbox } from "@/components/reusable/Inputs/NumberInputWithCheckbox"
import { getDeliveryStatusMeta } from "@/lib/orders/status"
import { formatDeliveryDaysRange } from "@/lib/utils/formatters"
import { formatCurrency } from "@/lib/utils"
import { getCarrierBrandIcon } from "@/lib/utils/carrier-brand"
import { TruckIcon } from "@/lib/icons"

const formatDateString = (dateStr: string) => {
    if (!dateStr) return "-"
    const parts = dateStr.split("-")
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
    return dateStr
}

interface AddressTabProps {
    cep: string
    street: string
    number: string
    complement: string
    neighborhood: string
    city: string
    uf: string
    noNumber: boolean
    deliveryMethod: "delivery" | "pickup"
    deliveryStatus: string
    selectedDeliveryPersonId: string
    deliveryDate: string
    deliveryTime: string
    deliveryPeopleOptions: Array<{ value: string; label: string }>
    onOpenDeliveryDriverSheet?: () => void
    setDeliveryStatus: (val: string) => void
    setSelectedDeliveryPersonId: (val: string) => void
    setDeliveryDate: (val: string) => void
    setDeliveryTime: (val: string) => void
    deliveryStatusOptions: Array<{ value: string; label: string }>
    setCep: (val: string) => void
    setStreet: (val: string) => void
    setNumber: (val: string) => void
    setComplement: (val: string) => void
    setNeighborhood: (val: string) => void
    setCity: (val: string) => void
    setUf: (val: string) => void
    setNoNumber: (val: boolean) => void
    isMarketplaceOrder?: boolean
    originalDeliveryStatus?: string
    isMarketplaceLocked?: boolean
    isPaidOrder?: boolean
    isCarrierDelivery?: boolean
    deliveryBreakdown?: Record<string, any> | null
    existingCarrierShipment?: Record<string, any> | null
    onOpenCarrierShippingSheet?: () => void
    role?: string
    /** Painel admin: libera endereço/entrega mesmo após entrega/pagamento. */
    adminContext?: boolean
}

export const AddressTab: React.FC<AddressTabProps> = ({
    cep,
    street,
    number,
    complement,
    neighborhood,
    city,
    uf,
    noNumber,
    deliveryMethod,
    deliveryStatus,
    selectedDeliveryPersonId,
    deliveryDate,
    deliveryTime,
    deliveryPeopleOptions,
    onOpenDeliveryDriverSheet,
    setDeliveryStatus,
    setSelectedDeliveryPersonId,
    setDeliveryDate,
    setDeliveryTime,
    deliveryStatusOptions,
    setCep,
    setStreet,
    setNumber,
    setComplement,
    setNeighborhood,
    setCity,
    setUf,
    setNoNumber,
    isMarketplaceOrder = false,
    originalDeliveryStatus = 'not_sent',
    isMarketplaceLocked = false,
    isPaidOrder = false,
    isCarrierDelivery = false,
    deliveryBreakdown = null,
    existingCarrierShipment = null,
    onOpenCarrierShippingSheet,
    role = "OPERATOR",
    adminContext = false,
}) => {
    const { canRbac } = usePermissions()
    const selectedStatusMeta = getDeliveryStatusMeta(deliveryStatus)
    const showDispatchFields = deliveryMethod === "pickup"
        || ["sent", "delivered", "delivery_failed"].includes(deliveryStatus)
    const carrier = (deliveryBreakdown || {}) as Record<string, any>
    const carrierName = [carrier.companyName, carrier.serviceName].filter(Boolean).join(" - ")
        || carrier.carrier
        || "Transportadora"
    const carrierFee = Number(carrier.originalFee ?? carrier.deliveryFee ?? 0)
    const carrierTrackingUrl = String(existingCarrierShipment?.tracking_url || "")
    const carrierTrackingNumber = String(existingCarrierShipment?.tracking_number || "")
    const canReQuoteCarrier = isCarrierDelivery && !isPaidOrder && !existingCarrierShipment && Boolean(onOpenCarrierShippingSheet)
    // Com etiqueta já gerada, o endereço não pode mais mudar: a etiqueta
    // impressa aponta para o endereço original.
    const isAddressReadOnly = isPaidOrder || (isCarrierDelivery && Boolean(existingCarrierShipment))

    const isAddressLocked = isAddressReadOnly || !canRbac("orders.edit")
    const isDeliveryLocked =
        (!adminContext && originalDeliveryStatus === 'delivered') || !canRbac("orders.edit")

    const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
        <div className="flex justify-between items-center text-sm gap-4 py-2.5 border-b border-brand-border/40 dark:border-dark-border/40 last:border-0">
            <span className="text-brand-inactive-text dark:text-dark-body font-medium">{label}</span>
            <div className="text-right font-semibold text-brand-dark dark:text-dark-heading">{value}</div>
        </div>
    )

    const InfoField = ({ label, value }: { label: string; value: React.ReactNode }) => (
        <div className="flex flex-col gap-1">
            <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">{label}</span>
            <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">{value}</span>
        </div>
    )

    return (
        <FadeIn>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 flex flex-col gap-8">
                    <FormSection title="Endereço de Entrega">
                        {isAddressReadOnly ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <InfoField label="CEP" value={cep || "-"} />
                                <InfoField label="Rua/Avenida" value={street || "-"} />
                                <InfoField label="Número" value={noNumber ? "S/N" : (number || "-")} />
                                {complement && <InfoField label="Complemento" value={complement} />}
                                <InfoField label="Bairro" value={neighborhood || "-"} />
                                <InfoField label="Cidade" value={city || "-"} />
                                <InfoField label="Estado" value={uf || "-"} />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <CepInput
                                    value={cep}
                                    onChange={setCep}
                                    name="cep"
                                    onAddressFetched={(data) => {
                                        setStreet(data.street)
                                        setNeighborhood(data.neighborhood)
                                        setCity(data.city)
                                        setUf(data.state || "SP")
                                        if (data.number) {
                                            if (data.number === "S/N") {
                                                setNoNumber(true)
                                                setNumber("")
                                            } else {
                                                setNoNumber(false)
                                                setNumber(data.number)
                                            }
                                        }
                                    }}
                                    disabled={isAddressLocked}
                                />
                                <Input label="Rua/Avenida" placeholder="Rua, Avenida, etc." disabled={isAddressLocked} value={street} onChange={(e: any) => setStreet(e.target.value)} />

                                <div className="grid grid-cols-2 gap-3 flex-row items-center pt-1.5 pb-1.5">
                                    <NumberInputWithCheckbox
                                        label="Número"
                                        number={number}
                                        noNumber={noNumber}
                                        onNumberChange={(val) => setNumber(val)}
                                        onNoNumberChange={(checked) => {
                                            setNoNumber(checked)
                                            if (checked) setNumber("")
                                        }}
                                        disabled={isAddressLocked}
                                        placeholder="123"
                                    />
                                    <Input label="Complemento" placeholder="Apto, Bloco, etc." disabled={isAddressLocked} value={complement} onChange={(e: any) => setComplement(e.target.value)} />
                                </div>
                                <Input label="Bairro" placeholder="Nome do bairro" disabled={isAddressLocked} value={neighborhood} onChange={(e: any) => setNeighborhood(e.target.value)} />

                                <div className="grid grid-cols-2 gap-3 items-end">
                                    <Input label="Cidade" placeholder="Nome da cidade" disabled={isAddressLocked} value={city} onChange={(e: any) => setCity(e.target.value)} />
                                    <StateComboBox
                                        value={uf}
                                        onChange={setUf}
                                        className="w-full"
                                        disabled={isAddressLocked}
                                    />
                                </div>
                            </div>
                        )}
                    </FormSection>
                </div>

                <div className="lg:col-span-4 flex flex-col gap-8 lg:border-l lg:border-brand-border lg:pl-12 dark:lg:border-dark-border">
                    {isCarrierDelivery && !existingCarrierShipment && (
                        <InfoCard
                            color="orange"
                            message="Ao alterar o endereço, refaça a cotação da transportadora para atualizar o frete."
                        />
                    )}
                    <SidebarCard hasSeparator hasTopStrip title="Informações da Entrega">
                        {isCarrierDelivery ? (
                            <div>
                                <div className="flex items-center gap-3 pb-4 border-b border-brand-border/40 dark:border-dark-border/40">
                                    <img
                                        src={getCarrierBrandIcon(carrier.companyName, carrier.serviceName, existingCarrierShipment?.carrier, carrier.carrier)}
                                        alt={carrierName}
                                        className="h-8 w-8 rounded object-contain"
                                    />
                                    <div className="flex flex-col">
                                        <span className="font-bold text-brand-dark dark:text-dark-heading">{carrierName}</span>
                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body">
                                            {formatDeliveryDaysRange(carrier.deliveryMinDays, carrier.deliveryMaxDays)}
                                        </span>
                                    </div>
                                </div>
                                <InfoRow label="Valor" value={formatCurrency(carrierFee)} />
                                {carrierTrackingNumber && carrierTrackingUrl && (
                                    <InfoRow
                                        label="Rastreio"
                                        value={
                                            <a
                                                href={carrierTrackingUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-xs font-bold text-brand-dark underline dark:text-dark-heading"
                                            >
                                                {carrierTrackingNumber}
                                            </a>
                                        }
                                    />
                                )}
                                {canReQuoteCarrier && (
                                    <Button className="w-full mt-4" onClick={onOpenCarrierShippingSheet}>
                                        Recalcular frete
                                    </Button>
                                )}
                            </div>
                        ) : isPaidOrder ? (
                            <div>
                                <InfoRow label="Entregador" value={deliveryPeopleOptions.find(opt => opt.value === selectedDeliveryPersonId)?.label || "Entrega própria"} />
                                <InfoRow label="Status" value={selectedStatusMeta.label} />
                                {showDispatchFields && (
                                    <>
                                        <InfoRow label="Data de saída" value={formatDateString(deliveryDate)} />
                                        <InfoRow label="Horário de saída" value={deliveryTime || "-"} />
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4">
                                <FormDropdown
                                    label="Entregador"
                                    value={selectedDeliveryPersonId || "none"}
                                    setValue={(val: any) => setSelectedDeliveryPersonId(val === "none" ? "" : val)}
                                    options={[{ value: "none", label: "Entrega própria" }, ...deliveryPeopleOptions]}
                                    actionItem={onOpenDeliveryDriverSheet ? {
                                        label: "Entregadores Dudit",
                                        icon: <TruckIcon size={16} />,
                                        onClick: onOpenDeliveryDriverSheet,
                                    } : undefined}
                                    disabled={isDeliveryLocked}
                                />
                                <FormDropdown
                                    label="Status"
                                    value={deliveryStatus}
                                    setValue={(val: any) => setDeliveryStatus(val)}
                                    options={deliveryStatusOptions}
                                    disabled={isDeliveryLocked}
                                />
                                {showDispatchFields && (
                                    <>
                                        <DatePicker
                                            label="Data de saída"
                                            dataField="deliveryDate"
                                            value={deliveryDate}
                                            onChange={(value) => setDeliveryDate(value instanceof Date ? value.toISOString().slice(0, 10) : String(value || ""))}
                                            placeholder="Selecione a data"
                                            disabled={isDeliveryLocked}
                                        />
                                        <TimePicker
                                            label="Horário de saída"
                                            dataField="deliveryTime"
                                            value={deliveryTime}
                                            onChange={setDeliveryTime}
                                            placeholder="Selecione o horário"
                                            disabled={isDeliveryLocked}
                                        />
                                    </>
                                )}
                            </div>
                        )}
                    </SidebarCard>
                </div>
            </div>
        </FadeIn>
    )
}
