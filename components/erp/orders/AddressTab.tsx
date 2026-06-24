"use client"

import React from "react"
import { FadeIn } from "@/components/animations/FadeIn"
import { Badge, DatePicker, FormDropdown, Input, TimePicker } from "@/components/reusable"
import { CepInput } from "@/components/reusable/Inputs/CepInput"
import { StateComboBox } from "@/components/reusable/Inputs/StateComboBox"
import { NumberInputWithCheckbox } from "@/components/reusable/Inputs/NumberInputWithCheckbox"
import { getDeliveryStatusMeta } from "@/lib/orders/status"

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
    role?: string
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
    role = "OPERATOR",
}) => {
    const selectedStatusMeta = getDeliveryStatusMeta(deliveryMethod === "pickup" ? "delivered" : deliveryStatus)

    const isAddressLocked = isPaidOrder || role === 'DELIVERY'
    const isDeliveryLocked = originalDeliveryStatus === 'delivered' || role === 'DELIVERY'

    const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
        <div className="flex justify-between items-start text-[14px] gap-4">
            <span className="text-brand-inactive-text dark:text-dark-body font-medium">{label}</span>
            <div className="text-right font-bold text-brand-dark dark:text-dark-heading">{value}</div>
        </div>
    )

    return (
        <FadeIn>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 flex flex-col gap-8">
                    <section>
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Endereço de Entrega</h3>
                        {isPaidOrder ? (
                            <div className="space-y-4 rounded-2xl border border-brand-border p-6 dark:border-dark-border bg-white dark:bg-dark-surface">
                                <InfoRow label="CEP" value={cep || "-"} />
                                <InfoRow label="Rua/Avenida" value={street || "-"} />
                                <InfoRow label="Número" value={noNumber ? "S/N" : (number || "-")} />
                                {complement && <InfoRow label="Complemento" value={complement} />}
                                <InfoRow label="Bairro" value={neighborhood || "-"} />
                                <InfoRow label="Cidade" value={city || "-"} />
                                <InfoRow label="Estado" value={uf || "-"} />
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
                                        setNoNumber(data.number === "S/N")
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
                    </section>
                </div>

                <div className="lg:col-span-4 flex flex-col gap-8 lg:border-l lg:border-brand-border lg:pl-12 dark:lg:border-dark-border">
                    <section>
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Informações da Entrega</h3>
                        {isPaidOrder ? (
                            <div className="space-y-4 rounded-2xl border border-brand-border p-6 dark:border-dark-border bg-white dark:bg-dark-surface">
                                <InfoRow label="Entregador" value={deliveryPeopleOptions.find(opt => opt.value === selectedDeliveryPersonId)?.label || "Sem entregador (não atribuído)"} />
                                <InfoRow label="Status" value={selectedStatusMeta.label} />
                                <InfoRow label="Data de saída" value={formatDateString(deliveryDate)} />
                                <InfoRow label="Horário de saída" value={deliveryTime || "-"} />
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4">
                                <FormDropdown
                                    label="Entregador"
                                    value={selectedDeliveryPersonId || "none"}
                                    setValue={(val: any) => setSelectedDeliveryPersonId(val === "none" ? "" : val)}
                                    options={[{ value: "none", label: "Sem entregador (não atribuído)" }, ...deliveryPeopleOptions]}
                                    disabled={isDeliveryLocked}
                                />
                                <FormDropdown
                                    label="Status"
                                    value={deliveryMethod === "pickup" ? "delivered" : deliveryStatus}
                                    setValue={(val: any) => setDeliveryStatus(val)}
                                    options={deliveryStatusOptions}
                                    disabled={deliveryMethod === "pickup" || isDeliveryLocked}
                                />
                                <DatePicker
                                    label="Data de saída"
                                    value={deliveryDate}
                                    onChange={(value) => setDeliveryDate(value instanceof Date ? value.toISOString().slice(0, 10) : String(value || ""))}
                                    placeholder="Selecione a data"
                                    disabled={isDeliveryLocked}
                                />
                                <TimePicker
                                    label="Horário de saída"
                                    value={deliveryTime}
                                    onChange={setDeliveryTime}
                                    placeholder="Selecione o horário"
                                    disabled={isDeliveryLocked}
                                />
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </FadeIn>
    )
}
