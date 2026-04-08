"use client"

import React from "react"
import { FadeIn } from "@/components/animations/FadeIn"
import { Input } from "@/components/reusable"
import { CepInput } from "@/components/reusable/Inputs/CepInput"
import { StateComboBox } from "@/components/reusable/Inputs/StateComboBox"
import { NumberInputWithCheckbox } from "@/components/reusable/Inputs/NumberInputWithCheckbox"

interface AddressTabProps {
    cep: string
    street: string
    number: string
    complement: string
    neighborhood: string
    city: string
    uf: string
    noNumber: boolean
    selectedCustomer: any
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
    cep, street, number, complement, neighborhood, city, uf, noNumber, selectedCustomer,
    setCep, setStreet, setNumber, setComplement, setNeighborhood, setCity, setUf, setNoNumber
}) => {
    return (
        <FadeIn>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 flex flex-col gap-8">
                    <section>
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Endereço de Entrega</h3>
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
                                    label="Número"
                                    value={number}
                                    number={number}
                                    noNumber={noNumber}
                                    onNumberChange={(e: any) => setNumber(e.target.value)}
                                    onNoNumberChange={checked => { setNoNumber(checked); if (checked) setNumber(""); }}
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

                <div className="lg:col-span-4 flex flex-col gap-8">
                    <div className="bg-white dark:bg-dark-surface p-0 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden flex flex-col shadow-sm">
                        <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border font-bold" />

                        <div className="p-6 pb-0">
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Cliente</h3>
                            <div className="flex items-start justify-between mb-6">
                                <div className="flex gap-3 text-left">
                                    <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border flex items-center justify-center text-lg font-bold text-brand-dark dark:text-dark-heading border border-white dark:border-dark-border overflow-hidden text-brand-inactive-text">
                                        {selectedCustomer?.name?.charAt(0) || 'C'}
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{selectedCustomer?.name || "Consumidor Final"}</h4>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-brand-border dark:border-dark-border w-full"></div>

                        <div className="p-6">
                            <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading mb-4">Endereço Principal</h3>

                            <div className="w-full h-[120px] bg-brand-gray dark:bg-dark-border rounded-lg relative overflow-hidden mb-4 flex items-center justify-center cursor-pointer group" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${street}, ${noNumber ? 'S/N' : number}, ${neighborhood}, ${city} - ${uf}, ${cep}`)}`, '_blank')}>
                                <img alt="Mapa" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" src="https://img.dudit.com.br/static/maps/MapLarge.png" onError={(e) => { e.currentTarget.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" fill="rgb(229,231,235)"><rect width="100%" height="100%"/></svg>' }} />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-6 h-6 bg-brand-dark rounded-full border-2 border-white flex items-center justify-center text-white">
                                        <div className="w-2 h-2 bg-white rounded-full"></div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-start justify-between">
                                <div className="flex flex-col flex-1 truncate pr-4">
                                    <h4 className="font-bold text-brand-dark dark:text-dark-heading text-[13px] mb-1.5 truncate">{selectedCustomer?.name || "Endereço Padrão"}</h4>
                                    <p className="text-brand-inactive-text text-[13px] leading-snug truncate whitespace-pre-line">
                                        {street ? `${street}, ${noNumber ? 'S/N' : number}\n${neighborhood}, ${city} - ${uf}` : 'Endereço vinculado ao cadastro\ndo cliente para esta proposta.'}
                                    </p>
                                    {cep && <p className="text-brand-inactive-text text-[13px] leading-snug mt-1">{cep}</p>}
                                </div>
                                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${street}, ${noNumber ? 'S/N' : number}, ${neighborhood}, ${city} - ${uf}, ${cep}`)}`} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold text-brand-dark dark:text-dark-heading underline decoration-brand-dark/20 dark:decoration-dark-heading/20 hover:decoration-brand-dark whitespace-nowrap pt-1">Ver no mapa</a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </FadeIn>
    )
}
