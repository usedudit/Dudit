"use client"

import React, { useState } from "react"
import DefaultModal from "@/components/reusable/DefaultModal"
import { Button } from "@/components/reusable"
import { PlusIcon, EditIcon, TrashIcon } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { saveServiceOrderSpecificationsAction } from "@/app/actions/erp/service-orders"

const SPEC_TEMPLATES: Record<string, { name: string; value: string }[]> = {
  Celular: [
    { name: "IMEI", value: "" },
    { name: "Modelo", value: "" },
    { name: "Marca", value: "" },
    { name: "Cor", value: "" },
    { name: "Armazenamento", value: "" },
    { name: "Ano", value: "" },
  ],
  Veículo: [
    { name: "Chassi", value: "" },
    { name: "Placa", value: "" },
    { name: "Modelo", value: "" },
    { name: "Marca", value: "" },
    { name: "Ano", value: "" },
    { name: "Cor", value: "" },
  ],
  Eletrônico: [
    { name: "Modelo", value: "" },
    { name: "Marca", value: "" },
    { name: "Nº Série", value: "" },
    { name: "Voltagem", value: "" },
  ],
  Eletrodoméstico: [
    { name: "Modelo", value: "" },
    { name: "Marca", value: "" },
    { name: "Nº Série", value: "" },
    { name: "Voltagem", value: "" },
    { name: "Cor", value: "" },
  ],
}

interface SpecificationsTabProps {
  partnerId: string
  serviceOrderId: string
  specifications: { name: string; value: string }[]
  onMutation?: () => void
}

export default function SpecificationsTab({ partnerId, serviceOrderId, specifications, onMutation }: SpecificationsTabProps) {
  const { toast } = useToast()
  const [showModal, setShowModal] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [saving, setSaving] = useState(false)
  const [specs, setSpecs] = useState<{ name: string; value: string }[]>(specifications || [])

  const handleSave = async (newSpecs: { name: string; value: string }[]) => {
    setSaving(true)
    const res = await saveServiceOrderSpecificationsAction(partnerId, serviceOrderId, newSpecs)
    if (res.success) {
      setSpecs(newSpecs)
      setShowModal(false)
      setShowTemplates(false)
      toast({ description: "Especificações salvas" })
      onMutation?.()
    } else {
      toast({ description: res.error || "Erro ao salvar" })
    }
    setSaving(false)
  }

  const handleTemplateSelect = (templateName: string) => {
    const template = SPEC_TEMPLATES[templateName]
    if (!template) return
    setSpecs(template)
    setShowTemplates(true)
  }

  const handleRemoveSpec = (index: number) => {
    const updated = specs.filter((_, i) => i !== index)
    handleSave(updated)
  }

  const handleAddSpec = () => {
    setSpecs([...specs, { name: "", value: "" }])
  }

  const handleSpecChange = (index: number, field: "name" | "value", val: string) => {
    const updated = [...specs]
    updated[index] = { ...updated[index], [field]: val }
    setSpecs(updated)
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="link" onClick={() => { setShowModal(true); setShowTemplates(false) }}>
            <PlusIcon className="w-4 h-4 mr-1" />
            Adicionar Especificação
          </Button>
        </div>

        {specs.length > 0 ? (
          <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead>
                <tr className="bg-brand-gray dark:bg-dark-border/50">
                  <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body">Especificação</th>
                  <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body">Valor</th>
                  <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body w-16"></th>
                </tr>
              </thead>
              <tbody>
                {specs.map((spec, index) => (
                  <tr key={index} className="group hover:bg-brand-gray/20 dark:hover:bg-dark-border/10 transition-colors">
                    <td className="py-3 px-4 border-b border-brand-border dark:border-dark-border font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                      {spec.name}
                    </td>
                    <td className="py-3 px-4 border-b border-brand-border dark:border-dark-border text-[13px] text-brand-dark dark:text-dark-heading">
                      {spec.value}
                    </td>
                    <td className="py-3 px-4 border-b border-brand-border dark:border-dark-border">
                      <button onClick={() => handleRemoveSpec(index)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-brand-gray/50 dark:hover:bg-dark-border rounded-lg">
                        <TrashIcon className="w-4 h-4 text-brand-red" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-brand-inactive-text bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl">
            Nenhuma especificação adicionada
          </div>
        )}

        {specs.length > 0 && (
          <div className="flex justify-end">
            <Button variant="link" onClick={() => { setShowModal(true); setShowTemplates(true) }}>
              <EditIcon className="w-4 h-4 mr-1" />
              Editar Especificações
            </Button>
          </div>
        )}
      </div>

      {showModal && (
        <DefaultModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title="Especificações Técnicas"
          maxWidth="lg"
        >
          <div className="space-y-4">
            {!showTemplates && (
              <div className="flex flex-wrap gap-2">
                <span className="text-sm font-medium text-brand-inactive-text w-full mb-1">Modelos pré-definidos:</span>
                {Object.keys(SPEC_TEMPLATES).map((name) => (
                  <button
                    key={name}
                    onClick={() => handleTemplateSelect(name)}
                    className="text-sm font-bold text-brand-dark dark:text-dark-heading decoration-gray-300 hover:text-brand-green hover:underline px-3 py-1.5 rounded-full bg-brand-gray dark:bg-dark-border/50 hover:bg-brand-gray/70 dark:hover:bg-dark-border transition-colors"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-3">
              {specs.map((spec, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={spec.name}
                      onChange={(e) => handleSpecChange(index, "name", e.target.value)}
                      placeholder="Nome"
                      className="w-full px-3 py-2 text-[13px] rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading focus:outline-none focus:ring-2 focus:ring-brand-green/30"
                    />
                  </div>
                  <div className="flex-[2]">
                    <input
                      type="text"
                      value={spec.value}
                      onChange={(e) => handleSpecChange(index, "value", e.target.value)}
                      placeholder="Valor"
                      className="w-full px-3 py-2 text-[13px] rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading focus:outline-none focus:ring-2 focus:ring-brand-green/30"
                    />
                  </div>
                  <button onClick={() => {
                    const updated = specs.filter((_, i) => i !== index)
                    setSpecs(updated)
                  }} className="p-2 hover:bg-brand-gray/50 dark:hover:bg-dark-border rounded-lg mt-0.5">
                    <TrashIcon className="w-4 h-4 text-brand-red" />
                  </button>
                </div>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={handleAddSpec}>
              <PlusIcon className="w-4 h-4 mr-1" />
              Adicionar linha
            </Button>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-brand-border dark:border-dark-border mt-6">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={() => handleSave(specs)} isLoading={saving}>
              Salvar
            </Button>
          </div>
        </DefaultModal>
      )}
    </>
  )
}
