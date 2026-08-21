"use client"

import React, { useState, useTransition, useEffect, useCallback } from "react"
import { Button, FormSection, Input, FormDropdown, CepInput } from "@/components/reusable"
import { ChevronLeftIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { toast } from "@/hooks/use-notification"
import { createDeliveryDriverInvitationAdminAction } from "@/app/actions/admin/delivery-drivers"
import { useSidebar } from "@/lib/sidebar-context"

interface AdminDeliveryDriverInviteViewProps {
    onBack: () => void
    onSuccess: () => void
}

export function AdminDeliveryDriverInviteView({ onBack, onSuccess }: AdminDeliveryDriverInviteViewProps) {
    const [isPending, startTransition] = useTransition()
    const [form, setForm] = useState({
        email: "",
        fullName: "",
        phone: "",
        zipCode: "",
        street: "",
        number: "",
        complement: "",
        neighborhood: "",
        city: "",
        state: "SP",
        latitude: null as number | null,
        longitude: null as number | null,
        vehicleType: "moto" as "moto" | "carro",
        notes: "",
    })

    let sidebarContext: ReturnType<typeof useSidebar> | null = null
    try {
        sidebarContext = useSidebar()
    } catch { }
    const setHeaderOverride = sidebarContext?.setHeaderOverride

    const handleBack = useCallback(() => onBack(), [onBack])

    useEffect(() => {
        if (!setHeaderOverride) return
        setHeaderOverride({
            title: "Novo Entregador",
            onBack: handleBack,
            isSubPage: true,
        })
        return () => setHeaderOverride(null)
    }, [handleBack, setHeaderOverride])

    const update = (key: keyof typeof form, value: any) => {
        setForm((current) => ({ ...current, [key]: value }))
    }

    const handleAddressFetched = (addr: any) => {
        setForm((prev) => ({
            ...prev,
            street: addr.street || prev.street,
            neighborhood: addr.neighborhood || prev.neighborhood,
            city: addr.city || prev.city,
            state: addr.state || prev.state || "SP",
            latitude: addr.latitude ?? prev.latitude,
            longitude: addr.longitude ?? prev.longitude,
            number: addr.number && addr.number !== "S/N" ? addr.number : prev.number,
            complement: addr.complement || prev.complement,
        }))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()

        if (!form.fullName.trim() || !form.email.trim() || !form.phone.trim() || !form.city.trim() || !form.neighborhood.trim()) {
            toast.error("Por favor, preencha todos os campos obrigatórios (nome, e-mail, telefone, cidade e bairro).")
            return
        }

        startTransition(async () => {
            try {
                const res = await createDeliveryDriverInvitationAdminAction({
                    fullName: form.fullName.trim(),
                    email: form.email.trim(),
                    phone: form.phone.trim(),
                    city: form.city.trim(),
                    neighborhood: form.neighborhood.trim(),
                    zipCode: form.zipCode.trim() || undefined,
                    street: form.street.trim() || undefined,
                    number: form.number.trim() || undefined,
                    complement: form.complement.trim() || undefined,
                    state: form.state.trim() || undefined,
                    latitude: form.latitude,
                    longitude: form.longitude,
                    vehicleType: form.vehicleType,
                    notes: form.notes.trim() || undefined,
                })

                if (res.success) {
                    toast.success(res.emailSent ? "Convite enviado com sucesso por e-mail!" : "Convite gerado com sucesso!")
                    onSuccess()
                } else {
                    toast.error(res.error || "Erro ao criar convite para entregador.")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado ao cadastrar.")
            }
        })
    }

    return (
        <FadeIn className="flex flex-col bg-white dark:bg-dark-background min-h-screen">
            {/* Desktop Header */}
            <div className="hidden md:flex items-center justify-between px-8 py-5 border-b border-brand-border dark:border-dark-border">
                <div className="flex items-center gap-4">
                    <Button
                        variant="filled"
                        onClick={onBack}
                        className="w-10 h-10 p-0 flex items-center justify-center rounded-xl"
                    >
                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                    </Button>
                    <div className="flex flex-col">
                        <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading tracking-tight">
                            Cadastrar Novo Entregador
                        </h1>
                        <p className="text-xs text-brand-inactive-text mt-0.5">
                            Envie um convite de acesso por e-mail para o entregador atuar na plataforma Dudit.
                        </p>
                    </div>
                </div>
            </div>

            <div className="w-full max-w-[1000px] mx-auto px-4 md:px-8 py-6 space-y-6">
                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    <FormSection title="Dados Pessoais & Contato" hasSeparator>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input
                                label="Nome Completo"
                                required
                                value={form.fullName}
                                onChange={(e) => update("fullName", e.target.value)}
                                placeholder="Nome e sobrenome do entregador"
                            />
                            <Input
                                label="E-mail"
                                required
                                type="email"
                                value={form.email}
                                onChange={(e) => update("email", e.target.value)}
                                placeholder="entregador@exemplo.com"
                            />
                            <Input
                                label="Telefone / WhatsApp"
                                required
                                value={form.phone}
                                onChange={(e) => update("phone", e.target.value)}
                                placeholder="(00) 00000-0000"
                            />
                            <div className="flex flex-col">
                                <label className="block text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5">
                                    Tipo de Veículo
                                </label>
                                <FormDropdown
                                    value={form.vehicleType}
                                    setValue={(val) => update("vehicleType", val)}
                                    options={[
                                        { value: "moto", label: "Motocicleta (Moto)" },
                                        { value: "carro", label: "Automóvel (Carro)" },
                                    ]}
                                />
                            </div>
                        </div>
                    </FormSection>

                    <FormSection title="Endereço & Área de Atuação" hasSeparator>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <CepInput
                                    value={form.zipCode}
                                    onChange={(v) => update("zipCode", v)}
                                    onAddressFetched={handleAddressFetched}
                                />
                            </div>
                            <div className="md:col-span-2">
                                <Input
                                    label="Rua / Logradouro"
                                    value={form.street}
                                    onChange={(e) => update("street", e.target.value)}
                                    placeholder="Rua, Avenida, Travessa..."
                                />
                            </div>
                            <Input
                                label="Número"
                                value={form.number}
                                onChange={(e) => update("number", e.target.value)}
                                placeholder="123 ou S/N"
                            />
                            <Input
                                label="Complemento"
                                value={form.complement}
                                onChange={(e) => update("complement", e.target.value)}
                                placeholder="Apto, Bloco, Casa..."
                            />
                            <Input
                                label="Bairro"
                                required
                                value={form.neighborhood}
                                onChange={(e) => update("neighborhood", e.target.value)}
                                placeholder="Ex: Centro"
                            />
                            <div className="grid grid-cols-3 gap-2">
                                <div className="col-span-2">
                                    <Input
                                        label="Cidade"
                                        required
                                        value={form.city}
                                        onChange={(e) => update("city", e.target.value)}
                                        placeholder="Ex: Lucélia"
                                    />
                                </div>
                                <div>
                                    <Input
                                        label="UF"
                                        value={form.state}
                                        onChange={(e) => update("state", e.target.value.toUpperCase().slice(0, 2))}
                                        placeholder="SP"
                                    />
                                </div>
                            </div>
                        </div>
                    </FormSection>

                    <FormSection title="Observações Internas (Opcional)" hasSeparator>
                        <div>
                            <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1.5">
                                Notas Administrativas
                            </label>
                            <textarea
                                value={form.notes}
                                onChange={(e) => update("notes", e.target.value)}
                                placeholder="Informações operacionais, disponibilidade ou restrições..."
                                rows={3}
                                className="w-full px-3 py-2.5 text-sm rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading placeholder:text-brand-inactive-text focus:outline-none focus:ring-2 focus:ring-brand-green/20"
                            />
                        </div>
                    </FormSection>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-brand-border dark:border-dark-border">
                        <Button type="button" variant="outline" onClick={onBack}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isPending} isLoading={isPending}>
                            {isPending ? "Enviando Convite..." : "Enviar Convite"}
                        </Button>
                    </div>
                </form>
            </div>
        </FadeIn>
    )
}

export default AdminDeliveryDriverInviteView
