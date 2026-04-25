"use client"

import React from "react"
import { FadeIn } from "@/components/animations/FadeIn"
import { Badge, DatePicker, FormDropdown, Input, TimePicker } from "@/components/reusable"
import { CepInput } from "@/components/reusable/Inputs/CepInput"
import { StateComboBox } from "@/components/reusable/Inputs/StateComboBox"
import { NumberInputWithCheckbox } from "@/components/reusable/Inputs/NumberInputWithCheckbox"
import { getDeliveryStatusMeta } from "@/lib/orders/status"

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
}) => {
    const selectedStatusMeta = getDeliveryStatusMeta(deliveryMethod === "pickup" ? "delivered" : deliveryStatus)

    return (
        <FadeIn>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 flex flex-col gap-8">
                    <section>
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">EndereÃ§o de Entrega</h3>
                        <div className="space-y-4">
                            <CepInput
                                label="CEP"
                                placeholder="00000-000"
                                value={cep}
                                onChange={setCep}
                                name="cep"
                                onAddressFetched={(data) => {
                                    setStreet(data.street)
                                    setNeighborhood(data.neighborhood)
                                    setCity(data.city)
                                    setUf(data.state || "SP")
                                }}
                            />
                            <Input label="Logradouro" placeholder="Rua, Avenida, etc." value={street} onChange={(e: any) => setStreet(e.target.value)} />

                            <div className="grid grid-cols-2 gap-3 flex-row items-center pt-1.5 pb-1.5">
                                <NumberInputWithCheckbox
                                    label="NÃºmero"
                                    number={number}
                                    noNumber={noNumber}
                                    onNumberChange={(val) => setNumber(val)}
                                    onNoNumberChange={(checked) => {
                                        setNoNumber(checked)
                                        if (checked) setNumber("")
                                    }}
                                />
                                <Input label="Complemento" placeholder="Apto, Bloco, etc." value={complement} onChange={(e: any) => setComplement(e.target.value)} />
                            </div>
                            <Input label="Bairro" placeholder="Nome do bairro" value={neighborhood} onChange={(e: any) => setNeighborhood(e.target.value)} />

                            <div className="grid grid-cols-2 gap-3 items-end">
                                <Input label="Cidade" placeholder="Nome da cidade" value={city} onChange={(e: any) => setCity(e.target.value)} />
                                <StateComboBox
                                    label="Estado"
                                    value={uf}
                                    onChange={setUf}
                                    className="w-full"
                                />
                            </div>
                        </div>
                    </section>
                </div>

                <div className="lg:col-span-4 flex flex-col gap-8 lg:border-l lg:border-brand-border lg:pl-12 dark:lg:border-dark-border">
                    <section>
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">InformaÃ§Ãµes da Entrega</h3>
                        <div className="grid grid-cols-1 gap-4">
                            <FormDropdown
                                label="Carrier / Entregador"
                                value={selectedDeliveryPersonId || "none"}
                                setValue={(val: any) => setSelectedDeliveryPersonId(val === "none" ? "" : val)}
                                options={[{ value: "none", label: "Sem entregador (nÃ£o atribuÃ­do)" }, ...deliveryPeopleOptions]}
                            />
                            <FormDropdown
                                label="Status"
                                value={deliveryMethod === "pickup" ? "delivered" : deliveryStatus}
                                setValue={(val: any) => setDeliveryStatus(val)}
                                options={deliveryStatusOptions}
                                disabled={deliveryMethod === "pickup"}
                            />
                            <DatePicker
                                label="Data de saÃ­da"
                                value={deliveryDate}
                                onChange={(value) => setDeliveryDate(value instanceof Date ? value.toISOString().slice(0, 10) : String(value || ""))}
                                placeholder="Selecione a data"
                            />
                            <TimePicker
                                label="HorÃ¡rio de saÃ­da"
                                value={deliveryTime}
                                onChange={setDeliveryTime}
                                placeholder="Selecione o horÃ¡rio"
                            />
                        </div>

                        <div className="mt-4 rounded-2xl border border-brand-border p-4 dark:border-dark-border">
                            <span className="mr-2 text-sm font-medium text-brand-inactive-text">Status selecionado:</span>
                            <Badge variant={selectedStatusMeta.variant}>{selectedStatusMeta.label}</Badge>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Resumo do EndereÃ§o</h3>
                        <div className="rounded-2xl border border-brand-border p-5 dark:border-dark-border">
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                {street ? `${street}, ${noNumber ? "S/N" : number || "S/N"}` : "EndereÃ§o nÃ£o informado"}
                            </p>
                            <p className="mt-2 whitespace-pre-line text-sm text-brand-inactive-text dark:text-dark-body">
                                {street
                                    ? `${neighborhood}\n${city} - ${uf}\n${cep || ""}`.trim()
                                    : "Preencha o endereÃ§o de entrega para gerar a entrega automaticamente."}
                            </p>
                        </div>
                    </section>
                </div>
            </div>
        </FadeIn>
    )
}
