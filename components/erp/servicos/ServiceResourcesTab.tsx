"use client"

import type React from "react"
import { useState } from "react"
import { Button, Input, FormDropdown } from "@/components/reusable"
import { PlusIcon, TrashIcon } from "@/lib/icons"

interface ServiceResourcesTabProps {
    serviceData: any
    handleInputChange: (e: any) => void
    isEditing: boolean
}

export const ServiceResourcesTab: React.FC<ServiceResourcesTabProps> = ({
    serviceData, handleInputChange, isEditing
}) => {
    const resources = serviceData.resources || []

    const addResource = () => {
        const newResources = [...resources, { name: "", quantity: 1, usage_type: "consumed" }]
        handleInputChange({ target: { name: "resources", value: newResources } })
    }

    const updateResource = (index: number, field: string, value: any) => {
        const newResources = [...resources]
        newResources[index] = { ...newResources[index], [field]: value }
        handleInputChange({ target: { name: "resources", value: newResources } })
    }

    const removeResource = (index: number) => {
        const newResources = resources.filter((_: any, i: number) => i !== index)
        handleInputChange({ target: { name: "resources", value: newResources } })
    }

    return (
        <div className="max-w-4xl">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Itens e Recursos Necessários</h3>
                    <p className="text-brand-inactive-text dark:text-dark-body text-sm mt-1">
                        Cadastre os materiais ou equipamentos utilizados na execução deste serviço.
                    </p>
                </div>
                <Button onClick={addResource} disabled={!isEditing} variant="outline" size="sm">
                    <PlusIcon className="w-4 h-4 mr-2" />
                    Adicionar Recurso
                </Button>
            </div>

            <div className="space-y-4">
                {resources.length === 0 ? (
                    <div className="text-center py-10 border border-dashed border-brand-border dark:border-dark-border rounded-xl">
                        <p className="text-brand-inactive-text">Nenhum recurso cadastrado para este serviço.</p>
                    </div>
                ) : (
                    resources.map((resource: any, index: number) => (
                        <div key={index} className="flex flex-col sm:flex-row gap-4 items-start sm:items-center p-4 border border-brand-border dark:border-dark-border rounded-xl bg-gray-50/50 dark:bg-dark-surface/50">
                            <div className="flex-1 w-full">
                                <Input
                                    label="Nome do Item / Produto"
                                    value={resource.name}
                                    onChange={(e) => updateResource(index, "name", e.target.value)}
                                    disabled={!isEditing}
                                    placeholder="Ex: Shampoo, Toalha, Projetor..."
                                />
                            </div>
                            <div className="w-full sm:w-32">
                                <Input
                                    label="Qtd."
                                    type="number"
                                    value={resource.quantity}
                                    onChange={(e) => updateResource(index, "quantity", Number(e.target.value))}
                                    disabled={!isEditing}
                                />
                            </div>
                            <div className="w-full sm:w-48">
                                <FormDropdown
                                    label="Tipo de Uso"
                                    options={[
                                        { value: "consumed", label: "Consumido" },
                                        { value: "returnable", label: "Retornável" },
                                        { value: "reference", label: "Apenas Referência" }
                                    ]}
                                    value={resource.usage_type}
                                    setValue={(v) => updateResource(index, "usage_type", v)}
                                    disabled={!isEditing}
                                />
                            </div>
                            <div className="pt-0 sm:pt-6">
                                <Button
                                    onClick={() => removeResource(index)}
                                    disabled={!isEditing}
                                    className="px-3"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
