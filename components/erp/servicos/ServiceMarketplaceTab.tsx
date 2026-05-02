"use client"

import type React from "react"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Input, FormDropdown, Checkbox, Button, Accordion, IconPlaceholder, RichTextEditor, TagsInput } from "@/components/reusable"
import { PlusIcon, XIcon, StoreIcon, LinkIcon, ArrowUpDownIcon, TrashIcon } from "@/lib/icons"

interface ServiceMarketplaceTabProps {
    serviceData: any
    handleInputChange: (e: any) => void
    isEditing: boolean
}

export const ServiceMarketplaceTab: React.FC<ServiceMarketplaceTabProps> = ({
    serviceData, handleInputChange, isEditing
}) => {
    // --- Helper para simular evento nativo ---
    const manualChange = (name: string, value: any) => {
        handleInputChange({
            target: { name, value }
        })
    }

    const technicalDetails = Array.isArray(serviceData?.technical_details) ? serviceData.technical_details : []
    const tags = Array.isArray(serviceData?.tags) ? serviceData.tags : []

    // --- Lógica dos Atributos (Ficha Técnica) ---
    const addAttribute = () => {
        const newAttributes = [...technicalDetails, { id: Date.now(), name: "", value: "" }]
        manualChange("technical_details", newAttributes)
    }

    const removeAttribute = (id: number) => {
        const newAttributes = technicalDetails.filter((attr: any) => attr.id !== id)
        manualChange("technical_details", newAttributes)
    }

    const updateAttribute = (id: number, field: string, newValue: string) => {
        const newAttributes = technicalDetails.map((attr: any) =>
            attr.id === id ? { ...attr, [field]: newValue } : attr
        )
        manualChange("technical_details", newAttributes)
    }

    return (
        <div className="grid grid-cols-12 gap-y-8 md:gap-y-0 animate-fade-in">
            {/* --- COLUNA ESQUERDA (Principal) --- */}
            <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                <div>
                    <h3 className="text-lg font-bold mb-5 text-brand-dark dark:text-dark-heading flex items-center gap-2">
                        <StoreIcon className="w-5 h-5" /> Vitrine e Marketplace
                    </h3>
                    <p className="text-brand-inactive-text dark:text-dark-body text-sm mt-1 mb-6">
                        Configure como seu serviço será exibido para seus clientes no seu site/catálogo online.
                    </p>

                    <div className="space-y-6">
                        <RichTextEditor
                            label="Descrição Detalhada"
                            value={serviceData?.description || ""}
                            onChange={(val) => manualChange("description", val)}
                            disabled={!isEditing}
                        />
                        <Input
                            label="Vídeo do Serviço"
                            name="video_url"
                            value={serviceData?.video_url || ""}
                            onChange={handleInputChange}
                            disabled={!isEditing}
                            placeholder="Cole o link do vídeo (YouTube, Vimeo...)"
                            suffix={<LinkIcon className="w-5 h-5 text-brand-inactive-text" />}
                        />
                    </div>
                </div>

                {/* --- FICHA TÉCNICA (ATRIBUTOS) --- */}
                <div className="mt-8">
                    <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                    <Accordion title="Ficha técnica" defaultOpen={false} triggerClass="text-lg font-bold text-brand-dark dark:text-dark-heading text-left">
                        <div className="pt-2">
                            {technicalDetails.length === 0 ? (
                                <div className="flex flex-col items-center justify-center text-center py-8">
                                    <IconPlaceholder
                                        icon={ArrowUpDownIcon}
                                        title="Nenhum atributo técnico"
                                        subtitle="Adicione características do seu serviço."
                                        itemButton={{
                                            text: "Adicionar atributo",
                                            action: addAttribute,
                                            variant: "outline",
                                            className: `h-9 text-sm ${!isEditing ? "opacity-50 pointer-events-none" : ""}`
                                        }}
                                    />
                                </div>
                            ) : (
                                <>
                                    <div className="w-full overflow-hidden rounded-t-xl bg-brand-gray dark:bg-dark-border/50">
                                        <div className="flex">
                                            <div className="flex-1 py-3 px-4 relative">
                                                <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body">Atributo</span>
                                            </div>
                                            <div className="flex-1 py-3 px-4 relative">
                                                <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body pl-4">Valor</span>
                                            </div>
                                            <div className="w-[60px] py-3 px-4 relative">
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mb-6 rounded-b-xl p-4 bg-white dark:bg-dark-surface">
                                        <AnimatePresence initial={false}>
                                            {technicalDetails.map((attr: any) => (
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
                                                            name={`attr-name-${attr.id}`}
                                                            placeholder="Nome (ex: Equipamento)"
                                                            value={attr.name || ""}
                                                            onChange={(e) => updateAttribute(attr.id, "name", e.target.value)}
                                                            disabled={!isEditing}
                                                            className="mb-0"
                                                        />
                                                    </div>
                                                    <div className="flex-1">
                                                        <Input
                                                            label=""
                                                            name={`attr-val-${attr.id}`}
                                                            placeholder="Valor (ex: Incluso)"
                                                            value={attr.value || ""}
                                                            onChange={(e) => updateAttribute(attr.id, "value", e.target.value)}
                                                            disabled={!isEditing}
                                                            className="mb-0"
                                                        />
                                                    </div>
                                                    <div className="h-[40px] mt-1.5 flex items-center justify-center">
                                                        <Button
                                                            type="button"
                                                            variant="outlinered"
                                                            className="w-[40px] h-[40px] p-0 flex items-center justify-center"
                                                            onClick={() => removeAttribute(attr.id)}
                                                            disabled={!isEditing}
                                                        >
                                                            <TrashIcon className="w-4 h-4 pointer-events-none" />
                                                        </Button>
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    </div>

                                    <Button
                                        type="button"
                                        variant="link"
                                        onClick={addAttribute}
                                        disabled={!isEditing}
                                    >
                                        + Adicionar atributo
                                    </Button>
                                </>
                            )}
                        </div>
                    </Accordion>
                </div>
            </div>

            {/* --- COLUNA DIREITA (SIDEBAR) --- */}
            <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                {/* Card de Configurações */}
                <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                    <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>
                    <h3 className="text-lg font-bold mb-6 mt-2 text-brand-dark dark:text-dark-heading">Configurações</h3>

                    <div className="space-y-5">
                        <FormDropdown
                            label="Destacar Serviço"
                            options={[
                                { value: "true", label: "Sim" },
                                { value: "false", label: "Não" },
                            ]}
                            value={String(serviceData?.highlight_service || "false")}
                            setValue={(v) => manualChange("highlight_service", v === "true")}
                            disabled={!isEditing}
                            width="w-full"
                        />

                        <FormDropdown
                            label="Tipo de Serviço"
                            options={[
                                { value: "in_person", label: "Presencial" },
                                { value: "online", label: "Online (Remoto)" },
                                { value: "hybrid", label: "Híbrido" }
                            ]}
                            value={serviceData?.service_type || 'in_person'}
                            setValue={(v) => manualChange("service_type", v)}
                            disabled={!isEditing}
                            width="w-full"
                        />

                        {/* Garantia is a string input in the current implementation, but user said "igual é la pra aba de marketplace de cadastrar novo produto". Let's match product's warranty fields. I'll need to store warranty_value and warranty_period in serviceData. Or just use the existing warranty field for now, but formatted nicely? No, user explicitly said "igual de produtos". Let's add warranty_value and warranty_period inputs, saving to a single JSON or just multiple fields. Wait, the schema has `warranty` text. Let's assume warranty holds a string like "X Meses". For now, we will bind to warranty_value and warranty_period, but how do we save it?
                        Actually, `services` table has `warranty (text)`. I'll just use the text field but present it as two inputs, or just one text input like before. But the user said "igual é la pra produtos". Let's see how Product does it. It uses `warranty_value` and `warranty_period`. We can just store them as `warranty_value` and `warranty_period` in the serviceData object, and map them to `warranty` on save, or let the backend save them into the `warranty` field if it's text. Let's just use the two fields and we can concat them on submit or backend. */}
                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                label="Garantia"
                                name="warranty_value"
                                value={serviceData?.warranty_value || ""}
                                onChange={handleInputChange}
                                disabled={!isEditing}
                                type="number"
                                placeholder="0"
                                className="w-full"
                            />
                            <FormDropdown
                                label="Período"
                                options={[
                                    { value: "Dias", label: "Dias" },
                                    { value: "Meses", label: "Meses" },
                                    { value: "Anos", label: "Anos" },
                                ]}
                                value={serviceData?.warranty_period || "Meses"}
                                setValue={(v) => manualChange("warranty_period", v)}
                                disabled={!isEditing}
                                width="w-full"
                            />
                        </div>
                    </div>
                </div>

                {/* Card de Tags */}
                <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                    <h3 className="text-lg font-bold mb-4 text-brand-dark dark:text-dark-heading">Tags e Buscas</h3>
                    <p className="text-sm text-brand-inactive-text mb-4">
                        Adicione palavras-chave para ajudar os clientes a encontrarem este serviço na busca.
                    </p>
                    <TagsInput
                        tags={tags}
                        onChange={(t) => manualChange("tags", t)}
                        disabled={!isEditing}
                        placeholder="Adicionar tag..."
                    />
                </div>
            </div>
        </div>
    )
}
