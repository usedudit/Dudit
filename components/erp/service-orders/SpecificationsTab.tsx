"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Input, Button, Accordion, IconPlaceholder, DefaultModal, ListItem, Badge } from "@/components/reusable"
import { TrashIcon, PlusIcon, ArrowUpDownIcon, PhoneIcon, MonitorIcon, TruckIcon, HomeIcon, SettingsIcon } from "@/lib/icons"
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
  serviceOrderId?: string
  specifications?: { name: string; value: string }[]
  isEditing?: boolean
  onSave?: (specs: { name: string; value: string }[]) => Promise<void>
}

export default function SpecificationsTab({
  partnerId,
  serviceOrderId,
  specifications = [],
  isEditing = false,
  onSave,
}: SpecificationsTabProps) {
  const { toast } = useToast()
  const [localSpecs, setLocalSpecs] = useState<{ id: number; name: string; value: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [templateSpecs, setTemplateSpecs] = useState<{ name: string; value: string }[]>([])

  useEffect(() => {
    setLocalSpecs((specifications || []).map((s, i) => ({ ...s, id: i + Date.now() })))
  }, [specifications])

  const addAttribute = () => {
    if (localSpecs.length >= 25) return
    setLocalSpecs([...localSpecs, { id: Date.now(), name: "", value: "" }])
  }

  const removeAttribute = (id: number) => {
    setLocalSpecs(localSpecs.filter((a) => a.id !== id))
  }

  const updateAttribute = (id: number, field: "name" | "value", newValue: string) => {
    setLocalSpecs(localSpecs.map((a) => (a.id === id ? { ...a, [field]: newValue } : a)))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const cleanSpecs = localSpecs.map(({ id, ...rest }) => rest)
      if (onSave) {
        await onSave(cleanSpecs)
      } else if (serviceOrderId) {
        const res = await saveServiceOrderSpecificationsAction(partnerId, serviceOrderId, cleanSpecs)
        if (!res.success) throw new Error(res.error)
      }
      toast({ description: "Especificações salvas" })
    } catch (err: any) {
      toast({ description: err.message || "Erro ao salvar especificações" })
    } finally {
      setSaving(false)
    }
  }

  const applyTemplate = () => {
    const merged = templateSpecs.map((s, i) => ({ id: Date.now() + i, ...s }))
    const existing = localSpecs.filter((s) => s.name && s.name.trim())
    setLocalSpecs([...existing, ...merged])
    setShowTemplateModal(false)
    setSelectedTemplate(null)
  }

  const isSpecsEmpty = localSpecs.length === 0 || localSpecs.every((s) => !s.name && !s.value)

  return (
    <div className="space-y-4">
      {/* Template Selector */}
      {isEditing && (
        <div className="pb-2">
          <Button variant="outline" size="sm" onClick={() => { setShowTemplateModal(true); setSelectedTemplate(null) }}>
            <PlusIcon className="w-4 h-4 mr-1" />
            Modelo pré-definido
          </Button>
        </div>
      )}

      {isSpecsEmpty && !isEditing ? (
        <div className="p-8 text-center text-sm text-brand-inactive-text bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl">
          Nenhuma especificação
        </div>
      ) : isSpecsEmpty ? (
        <div className="flex flex-col items-center justify-center text-center py-8">
          <IconPlaceholder
            icon={ArrowUpDownIcon}
            title="Nenhuma especificação"
            subtitle="Adicione características como IMEI, modelo, marca, cor."
            itemButton={{
              text: "Adicionar atributo",
              action: addAttribute,
              variant: "outline",
            }}
          />
        </div>
      ) : (
        <>
          <div className="w-full overflow-hidden rounded-t-lg rounded-b-lg bg-brand-gray dark:bg-dark-border/50">
            <div className="flex">
              <div className="flex-1 py-3 px-4">
                <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body">Especificação</span>
              </div>
              <div className="flex-1 py-3 px-4">
                <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body pl-4">Valor</span>
              </div>
              {isEditing && <div className="w-[60px] py-3 px-4" />}
            </div>
          </div>

          <div className="mb-6 rounded-b-xl p-4 bg-white dark:bg-dark-surface max-h-[300px] overflow-y-auto custom-scrollbar">
            <AnimatePresence initial={false}>
              {localSpecs.map((attr) => (
                <motion.div
                  key={attr.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex gap-4 mb-3 last:mb-0"
                >
                  <div className="flex-1">
                    <Input
                      label=""
                      name={`spec-name-${attr.id}`}
                      placeholder="Nome (ex: IMEI)"
                      value={attr.name || ""}
                      onChange={(e) => updateAttribute(attr.id, "name", e.target.value)}
                      disabled={!isEditing}
                      className="mb-0"
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      label=""
                      name={`spec-val-${attr.id}`}
                      placeholder="Valor (ex: 123456789)"
                      value={attr.value || ""}
                      onChange={(e) => updateAttribute(attr.id, "value", e.target.value)}
                      disabled={!isEditing}
                      className="mb-0"
                    />
                  </div>
                  {isEditing && (
                    <div className="h-[40px] mt-1.5 flex items-center justify-center">
                      <Button
                        type="button"
                        variant="outlinered"
                        className="w-[40px] h-[40px] p-0 flex items-center justify-center"
                        onClick={() => removeAttribute(attr.id)}
                      >
                        <TrashIcon className="w-4 h-4 pointer-events-none" />
                      </Button>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {isEditing && (
            <div className="flex items-center justify-between">
              <Button type="button" variant="link" onClick={addAttribute}>
                + Adicionar atributo
              </Button>
              <Button onClick={handleSave} isLoading={saving}>
                Salvar
              </Button>
            </div>
          )}
        </>
      )}

      {/* Template Preview Modal */}
      {showTemplateModal && selectedTemplate && (
        <DefaultModal
          isOpen={showTemplateModal}
          onClose={() => { setShowTemplateModal(false); setSelectedTemplate(null) }}
          title={`Modelo: ${selectedTemplate}`}
          maxWidth="lg"
        >
          <button
            onClick={() => setSelectedTemplate(null)}
            className="text-xs font-semibold text-brand-inactive-text hover:text-brand-dark mb-3 flex items-center gap-1"
          >
            ← Voltar para modelos
          </button>
          <div className="space-y-3 py-2">
            {templateSpecs.map((spec, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <div className="flex-1">
                  <input
                    type="text"
                    value={spec.name}
                    onChange={(e) => {
                      const next = [...templateSpecs]
                      next[idx] = { ...next[idx], name: e.target.value }
                      setTemplateSpecs(next)
                    }}
                    placeholder="Nome"
                    className="w-full px-3 py-2 text-[13px] rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading focus:outline-none focus:ring-2 focus:ring-brand-green/30"
                  />
                </div>
                <div className="flex-[2]">
                  <input
                    type="text"
                    value={spec.value}
                    onChange={(e) => {
                      const next = [...templateSpecs]
                      next[idx] = { ...next[idx], value: e.target.value }
                      setTemplateSpecs(next)
                    }}
                    placeholder="Valor"
                    className="w-full px-3 py-2 text-[13px] rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading focus:outline-none focus:ring-2 focus:ring-brand-green/30"
                  />
                </div>
                <button
                  onClick={() => {
                    setTemplateSpecs(templateSpecs.filter((_, i) => i !== idx))
                  }}
                  className="p-2 hover:bg-brand-gray/50 dark:hover:bg-dark-border rounded-lg mt-0.5"
                >
                  <TrashIcon className="w-4 h-4 text-brand-red" />
                </button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setTemplateSpecs([...templateSpecs, { name: "", value: "" }])}>
              <PlusIcon className="w-4 h-4 mr-1" />
              Adicionar linha
            </Button>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-brand-border dark:border-dark-border mt-6">
            <Button variant="outline" onClick={() => { setShowTemplateModal(false); setSelectedTemplate(null) }}>
              Cancelar
            </Button>
            <Button onClick={applyTemplate}>
              Aplicar modelo
            </Button>
          </div>
        </DefaultModal>
      )}

      {/* Template Selection Modal */}
      {showTemplateModal && !selectedTemplate && (
        <DefaultModal
          isOpen={showTemplateModal}
          onClose={() => setShowTemplateModal(false)}
          title="Escolher modelo"
          maxWidth="sm"
        >
          <div className="space-y-2 py-2">
            {Object.keys(SPEC_TEMPLATES).map((name) => {
              const iconMap: Record<string, React.ComponentType<any>> = {
                Celular: PhoneIcon,
                Veículo: TruckIcon,
                Eletrônico: MonitorIcon,
                Eletrodoméstico: HomeIcon,
              }
              const descMap: Record<string, string> = {
                Celular: "IMEI, modelo, marca, cor, armazenamento, ano",
                Veículo: "Chassi, placa, modelo, marca, ano, cor",
                Eletrônico: "Modelo, marca, nº série, voltagem",
                Eletrodoméstico: "Modelo, marca, nº série, voltagem, cor",
              }
              return (
                <ListItem
                  key={name}
                  icon={iconMap[name] || SettingsIcon}
                  title={name}
                  description={descMap[name] || ""}
                  className="px-4 py-3 gap-4"
                  showChevron={true}
                  onClick={() => {
                    setSelectedTemplate(name)
                    setTemplateSpecs(SPEC_TEMPLATES[name].map((s) => ({ ...s })))
                  }}
                />
              )
            })}
          </div>
        </DefaultModal>
      )}
    </div>
  )
}
