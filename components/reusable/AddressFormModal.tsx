"use client"

import { useEffect, useState } from "react"
import {
    Button,
    CepInput,
    Checkbox,
    DefaultModal,
    InfoCard,
    Input,
    NumberInputWithCheckbox,
    StateComboBox,
} from "@/components/reusable"
import { createAddressAction, updateAddressAction } from "@/app/actions/shared/addresses"
import { fetchCSRFTokenSingleton } from "@/hooks/use-csrf-token"
import { notifyAddressUpdated } from "@/lib/utils/address-sync"

export const ADDRESS_TYPE_OPTIONS = [
    { value: "casa", label: "Casa" },
    { value: "trabalho", label: "Trabalho" },
    { value: "outro", label: "Outro" },
] as const

export type AddressEntityType = "user" | "partner" | "supplier" | "customer" | "store"

export interface AddressFormData {
    zipCode: string
    street: string
    number: string
    complement: string
    neighborhood: string
    city: string
    state: string
    noNumber: boolean
    addressType: string
    isDefault: boolean
    latitude: number | null
    longitude: number | null
}

export const EMPTY_ADDRESS_FORM: AddressFormData = {
    zipCode: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    noNumber: false,
    addressType: "casa",
    isDefault: false,
    latitude: null,
    longitude: null,
}

export function addressToFormData(address: any): AddressFormData {
    const isNoNumber = address?.number === "S/N"
    return {
        zipCode: address?.zip_code || "",
        street: address?.street || "",
        number: isNoNumber ? "" : address?.number || "",
        complement: address?.complement || "",
        neighborhood: address?.neighborhood || "",
        city: address?.city || "",
        state: address?.state || "",
        noNumber: isNoNumber,
        addressType: address?.address_type || "casa",
        isDefault: Boolean(address?.is_default),
        latitude: address?.latitude ?? null,
        longitude: address?.longitude ?? null,
    }
}

export interface AddressFormModalProps {
    isOpen: boolean
    onClose: () => void
    entityId: string
    entityType?: AddressEntityType
    /** Quando informado, o modal entra em modo edição. */
    address?: any | null
    /** Marca o endereço como padrão automaticamente quando é o primeiro do usuário. */
    isFirstAddress?: boolean
    /** Sobrescreve o título padrão ("Adicionar endereço" / "Editar endereço"). */
    title?: string
    /** Chamado após salvar com sucesso. O modal não fecha sozinho. */
    onSaved?: (
        address: any,
        meta: { isEdit: boolean; citySlug?: string | null },
    ) => void | Promise<void>
    /** Token CSRF já carregado pela página, para evitar uma requisição extra. */
    csrfToken?: string
}

export function AddressFormModal({
    isOpen,
    onClose,
    entityId,
    entityType = "user",
    address = null,
    isFirstAddress = false,
    title,
    onSaved,
    csrfToken,
}: AddressFormModalProps) {
    const isEdit = Boolean(address?.id)
    const [form, setForm] = useState<AddressFormData>({ ...EMPTY_ADDRESS_FORM })
    const [error, setError] = useState<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [loadingCep, setLoadingCep] = useState(false)

    useEffect(() => {
        if (!isOpen) return
        setForm(address ? addressToFormData(address) : { ...EMPTY_ADDRESS_FORM, isDefault: isFirstAddress })
        setError(null)
        setLoadingCep(false)
        setIsSaving(false)
    }, [isOpen, address, isFirstAddress])

    const defaultLocked = isFirstAddress && !isEdit
    const isDefaultChecked = form.isDefault || defaultLocked

    const handleSave = async () => {
        const zipCode = form.zipCode.trim()
        const street = form.street.trim()
        const neighborhood = form.neighborhood.trim()
        const city = form.city.trim()
        const state = form.state.trim()
        const finalNumber = form.noNumber ? "S/N" : form.number.trim()

        if (!zipCode || !street || !finalNumber || !neighborhood || !city || !state) {
            setError("Preencha todos os campos obrigatórios do endereço.")
            return
        }

        setIsSaving(true)
        setError(null)

        try {
            const token = csrfToken || (await fetchCSRFTokenSingleton()) || ""
            const payload = {
                entityId,
                entityType,
                zipCode,
                street,
                number: finalNumber,
                complement: form.complement.trim(),
                neighborhood,
                city,
                state,
                isDefault: isDefaultChecked,
                addressType: form.addressType,
                latitude: form.latitude ?? null,
                longitude: form.longitude ?? null,
                csrf_token: token,
            }

            const result = isEdit
                ? await updateAddressAction({ ...payload, addressId: address.id })
                : await createAddressAction(payload)

            if (result.error) {
                setError(result.error)
                return
            }

            const savedAddress = result.address
            const citySlug = (result as any)?.citySlug ?? null
            notifyAddressUpdated(savedAddress?.id, savedAddress, citySlug)
            await onSaved?.(savedAddress, { isEdit, citySlug })
        } catch {
            setError("Erro ao salvar endereço. Tente novamente.")
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            title={title || (isEdit ? "Editar endereço" : "Adicionar endereço")}
            maxWidth="xl"
            footer={
                <>
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} isLoading={isSaving} disabled={loadingCep}>
                        {isEdit ? "Salvar alterações" : "Adicionar endereço"}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 mb-2 pb-2 border-b border-brand-border dark:border-dark-border">
                    {ADDRESS_TYPE_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => setForm(f => ({ ...f, addressType: opt.value }))}
                            className={`px-4 py-1.5 rounded-full text-[13px] font-medium border transition-all ${form.addressType === opt.value
                                ? "bg-brand-green text-white border-brand-green"
                                : "bg-white text-brand-inactive-text dark:bg-dark-surface dark:text-dark-body border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-dark-border/60"
                                }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                <CepInput
                    id="address-form-cep"
                    name="zipCode"
                    value={form.zipCode}
                    onChange={val => {
                        setForm(f => ({ ...f, zipCode: val }))
                        if (error) setError(null)
                    }}
                    onAddressFetched={addr => {
                        setForm(f => ({
                            ...f,
                            street: addr.street || f.street,
                            number: addr.number || f.number,
                            noNumber: addr.number ? addr.number === "S/N" : f.noNumber,
                            neighborhood: addr.neighborhood || f.neighborhood,
                            city: addr.city || f.city,
                            state: addr.state || f.state,
                            latitude: addr.latitude ?? f.latitude,
                            longitude: addr.longitude ?? f.longitude,
                        }))
                        setError(null)
                    }}
                    onLoadingChange={setLoadingCep}
                />

                <Input
                    label="Rua/Avenida"
                    id="address-form-street"
                    name="street"
                    placeholder="Rua, Avenida, etc."
                    value={form.street}
                    onChange={e => setForm(f => ({ ...f, street: e.target.value }))}
                />

                <div className="grid grid-cols-2 gap-4">
                    <NumberInputWithCheckbox
                        label="Número"
                        number={form.number}
                        noNumber={form.noNumber}
                        onNumberChange={val => setForm(f => ({ ...f, number: val }))}
                        onNoNumberChange={checked => setForm(f => ({ ...f, noNumber: checked, number: checked ? "S/N" : "" }))}
                        placeholder="123"
                    />
                    <Input
                        label="Complemento"
                        id="address-form-complement"
                        name="complement"
                        placeholder="Apto, Bloco, etc."
                        value={form.complement}
                        onChange={e => setForm(f => ({ ...f, complement: e.target.value }))}
                    />
                </div>

                <Input
                    label="Bairro"
                    id="address-form-neighborhood"
                    name="neighborhood"
                    placeholder="Nome do bairro"
                    value={form.neighborhood}
                    onChange={e => setForm(f => ({ ...f, neighborhood: e.target.value }))}
                />

                <div className="grid grid-cols-2 gap-4">
                    <Input
                        label="Cidade"
                        id="address-form-city"
                        name="city"
                        placeholder="Nome da cidade"
                        value={form.city}
                        onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    />
                    <StateComboBox
                        value={form.state}
                        onChange={val => setForm(f => ({ ...f, state: val }))}
                        className="w-full"
                    />
                </div>

                <Checkbox
                    id="address-form-default"
                    name="isDefault"
                    label="Definir como endereço padrão (reflete no ERP de todas as lojas)"
                    checked={isDefaultChecked}
                    disabled={defaultLocked}
                    onChange={checked => setForm(f => ({ ...f, isDefault: checked }))}
                />

                {error && <InfoCard message={error} color="red" />}
            </div>
        </DefaultModal>
    )
}

export default AddressFormModal
