"use client"

import React, { useState, useEffect } from "react"
import { DefaultModal, Button, Input, FormTextarea, PhoneInput, Spinner, ListItem } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import { CheckCircleIcon, MapPinIcon, ClockIcon, ArrowRightIcon, FileIcon } from "@/lib/icons"
import { useNotification } from "@/hooks/use-notification"
import { requestMarketplaceQuoteAction } from "@/app/actions/marketplace/quotes"

interface RequestQuoteModalProps {
    isOpen: boolean
    onClose: () => void
    service: {
        id: string
        name: string
        price?: number | null
        price_type?: string | null
        partner_id: string
        store_id?: string | null
        fulfillment_modes?: string[] | null
    }
    partner: {
        id?: string
        store_name?: string
        store_avatar?: string
        phone?: string
        city?: string
        state?: string
    }
    userProfile?: {
        full_name?: string | null
        phone?: string | null
    } | null
    onSuccess?: (quoteData: any) => void
}

export function RequestQuoteModal({
    isOpen,
    onClose,
    service,
    partner,
    userProfile,
    onSuccess,
}: RequestQuoteModalProps) {
    const { success: notifySuccess, error: notifyError } = useNotification()

    const [description, setDescription] = useState("")
    const [fulfillmentMode, setFulfillmentMode] = useState<string>("at_partner")
    const [preferredDate, setPreferredDate] = useState("")
    const [phone, setPhone] = useState("")
    const [serviceLocation, setServiceLocation] = useState("")
    const [additionalNotes, setAdditionalNotes] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setIsSuccess(false)
        }
    }, [isOpen])

    // Pre-fill phone on open
    useEffect(() => {
        if (isOpen && userProfile?.phone && !phone) {
            setPhone(userProfile.phone)
        }
    }, [isOpen, userProfile?.phone])

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        let v = e.target.value.replace(/\D/g, "")
        if (v.length > 11) v = v.slice(0, 11)
        if (v.length > 10) {
            v = v.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3")
        } else if (v.length > 6) {
            v = v.replace(/^(\d{2})(\d{4})(\d{0,4})$/, "($1) $2-$3")
        } else if (v.length > 2) {
            v = v.replace(/^(\d{2})(\d{0,5})$/, "($1) $2")
        } else if (v.length > 0) {
            v = v.replace(/^(\d*)$/, "($1")
        }
        setPhone(v)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!description.trim() || description.trim().length < 5) {
            notifyError("Atenção", "Por favor, descreva o que você precisa no serviço (mínimo 5 caracteres).")
            return
        }

        const rawPhone = phone.replace(/\D/g, "")
        if (!rawPhone || rawPhone.length < 10) {
            notifyError("Atenção", "Informe um telefone/WhatsApp válido com DDD.")
            return
        }

        setIsSubmitting(true)
        try {
            const res = await requestMarketplaceQuoteAction({
                serviceId: service.id,
                partnerId: service.partner_id,
                storeId: service.store_id || null,
                description: description.trim(),
                preferredDate: preferredDate.trim() || null,
                phone: rawPhone,
                serviceLocation: fulfillmentMode === "at_customer" ? serviceLocation.trim() || null : null,
                additionalNotes: additionalNotes.trim() || null,
            })

            if (res.success && res.data) {
                setIsSuccess(true)
                notifySuccess("Sucesso!", "Sua solicitação de orçamento foi enviada.")
                if (onSuccess) {
                    onSuccess(res.data)
                }
            } else {
                notifyError("Erro ao solicitar", (res as any).error || "Não foi possível enviar a solicitação. Tente novamente.")
            }
        } catch (err: any) {
            console.error("Error requesting quote:", err)
            notifyError("Erro inesperado", "Ocorreu um erro ao enviar sua solicitação. Tente novamente.")
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleClose = () => {
        if (!isSubmitting) {
            setIsSuccess(false)
            setDescription("")
            setPreferredDate("")
            setServiceLocation("")
            setAdditionalNotes("")
            onClose()
        }
    }

    const startingPrice = typeof service.price === "number" ? service.price : 0
    const modes = service.fulfillment_modes && service.fulfillment_modes.length > 0
        ? service.fulfillment_modes
        : ["at_partner"]

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={handleClose}
            title={isSuccess ? "Solicitação Enviada!" : "Solicitar Orçamento"}
            maxWidth="lg"
            footer={
                <div className="flex items-center justify-end gap-2.5">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleClose}
                        disabled={isSubmitting}
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="submit"
                        disabled={isSubmitting || !description.trim() || !phone.trim()}
                        className="min-w-[170px]"
                    >
                        {isSubmitting ? (
                            <span className="flex items-center gap-2">
                                <Spinner />
                                Enviando...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                Enviar Solicitação
                            </span>
                        )}
                    </Button>
                </div>
            }
        >
            {isSuccess ? (
                <div className="flex flex-col items-center justify-center text-center py-6 px-2 space-y-4">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                        <CheckCircleIcon size={36} />
                    </div>
                    <div className="space-y-1.5">
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                            Solicitação enviada com sucesso!
                        </h3>
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body max-w-sm">
                            O prestador <strong className="text-brand-dark dark:text-dark-heading">{partner.store_name || "responsável"}</strong> recebeu seu pedido e preparará uma proposta personalizada.
                        </p>
                    </div>
                    <div className="bg-brand-gray/40 dark:bg-dark-border/40 rounded-xl p-3.5 text-xs text-brand-inactive-text dark:text-dark-body max-w-sm text-left">
                        <span className="font-semibold text-brand-dark dark:text-dark-heading block mb-1">
                            🔔 O que acontece agora?
                        </span>
                        Assim que o orçamento estiver pronto com os valores, você receberá uma notificação aqui no sistema para visualizar a proposta completa e aprovar.
                    </div>
                    <Button onClick={handleClose} className="w-full mt-2">
                        Entendi, fechar
                    </Button>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Service info banner */}
                    <ListItem
                        icon={FileIcon}
                        title={`${service.name} - A partir de ${formatCurrency(startingPrice)}`}
                        description={partner.store_name || "Prestador Dudit"}
                    />

                    {/* Description field */}
                    <div>
                        <FormTextarea
                            label="O que você precisa?"
                            name="description"
                            value={description}
                            onChange={(e: any) => setDescription(e.target.value)}
                            placeholder="Descreva os detalhes do serviço que você precisa, medidas, ambiente, modelo ou necessidades específicas..."
                            rows={4}
                            required
                        />
                        <span className="text-[11px] text-brand-inactive-text dark:text-dark-body mt-1 block">
                            Quanto mais detalhes você fornecer, mais precisa será a proposta do prestador.
                        </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Phone / WhatsApp */}
                        <div>
                            <PhoneInput
                                label="WhatsApp para contato"
                                name="phone"
                                value={phone}
                                onChange={handlePhoneChange}
                                required
                            />
                        </div>

                        {/* Preferred date / timeframe */}
                        <div>
                            <Input
                                label="Prazo / Data desejada"
                                name="preferredDate"
                                value={preferredDate}
                                onChange={(e: any) => setPreferredDate(e.target.value)}
                                placeholder="Ex: Próxima semana, até 25/10..."
                            />
                        </div>
                    </div>

                    {/* Fulfillment mode selection if multiple available */}
                    {modes.length > 1 && (
                        <div>
                            <label className="block text-xs font-bold text-brand-dark dark:text-dark-heading mb-1.5">
                                Local de Realização
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {modes.includes("at_partner") && (
                                    <button
                                        type="button"
                                        onClick={() => setFulfillmentMode("at_partner")}
                                        className={`p-3 rounded-xl border text-left text-xs transition-all flex items-center gap-2.5 ${fulfillmentMode === "at_partner"
                                            ? "border-brand-green bg-brand-green/5 text-brand-dark dark:text-dark-heading font-semibold"
                                            : "border-brand-border dark:border-dark-border text-brand-inactive-text dark:text-dark-body hover:border-brand-border/80"
                                            }`}
                                    >
                                        <MapPinIcon size={16} className={fulfillmentMode === "at_partner" ? "text-brand-green" : ""} />
                                        <span>No estabelecimento do prestador</span>
                                    </button>
                                )}
                                {modes.includes("at_customer") && (
                                    <button
                                        type="button"
                                        onClick={() => setFulfillmentMode("at_customer")}
                                        className={`p-3 rounded-xl border text-left text-xs transition-all flex items-center gap-2.5 ${fulfillmentMode === "at_customer"
                                            ? "border-brand-green bg-brand-green/5 text-brand-dark dark:text-dark-heading font-semibold"
                                            : "border-brand-border dark:border-dark-border text-brand-inactive-text dark:text-dark-body hover:border-brand-border/80"
                                            }`}
                                    >
                                        <ClockIcon size={16} className={fulfillmentMode === "at_customer" ? "text-brand-green" : ""} />
                                        <span>Em domicílio / Meu endereço</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Address if at_customer */}
                    {fulfillmentMode === "at_customer" && (
                        <div>
                            <Input
                                label="Endereço do local do serviço"
                                name="serviceLocation"
                                value={serviceLocation}
                                onChange={(e: any) => setServiceLocation(e.target.value)}
                                placeholder="Bairro, Rua, Número, Cidade..."
                            />
                        </div>
                    )}

                    {/* Additional Notes */}
                    <div>
                        <Input
                            label="Observações adicionais"
                            name="additionalNotes"
                            value={additionalNotes}
                            maxLength={200}
                            onChange={(e: any) => setAdditionalNotes(e.target.value)}
                            placeholder="Horário preferido para contato, restrições, etc."
                        />
                    </div>
                </form>
            )}
        </DefaultModal>
    )
}
