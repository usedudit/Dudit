"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { MapPinIcon, TrashIcon, CheckCircleIcon, PlusIcon, EditIcon } from "@/lib/icons"
import { Button, Input, CepInput, StateComboBox } from "@/components/reusable"
import { SectionCard, Feedback, PageHeader, fade, View } from "./profile-shared"
import { createAddressAction, updateAddressAction, deleteAddressAction, setDefaultAddressAction } from "@/app/actions/shared/addresses"
import { useNotification } from "@/hooks/use-notification"

const ADDRESS_TYPE_OPTIONS = [
  { value: "casa", label: "Casa" },
  { value: "trabalho", label: "Trabalho" },
  { value: "outro", label: "Outro" },
]

function formatAddressSummary(addr: any): string {
  if (!addr) return ""
  return [
    addr.street && addr.number ? `${addr.street}, ${addr.number}` : addr.street,
    addr.complement, addr.neighborhood,
    addr.city && addr.state ? `${addr.city} - ${addr.state}` : addr.city || addr.state,
    addr.zip_code,
  ].filter(Boolean).join(", ")
}

function getAddressTypeLabel(type: string | null | undefined): string {
  const found = ADDRESS_TYPE_OPTIONS.find(o => o.value === type)
  return found?.label || "Endereço"
}

interface AddressViewProps {
  navigate: (view: View) => void
  userId: string
  addresses: any[]
  setAddresses: (addrs: any[]) => void
  isLoading: boolean
  setIsLoading: (v: boolean) => void
  error: string | null
  setError: (v: string | null) => void
  success: string | null
  setSuccess: (v: string | null) => void
  clearMessages: () => void
}

const emptyForm = {
  zipCode: "", street: "", number: "", complement: "",
  neighborhood: "", city: "", state: "", addressType: "casa",
}

export const AddressView = ({
  navigate, userId, addresses, setAddresses,
  isLoading, setIsLoading, error, setError, success, setSuccess, clearMessages,
}: AddressViewProps) => {
  const { success: notifySuccess, error: notifyError } = useNotification()
  const [editingId, setEditingId] = useState<string | null>(null) // null = not editing, "new" = creating
  const [form, setForm] = useState({ ...emptyForm })

  const startCreate = () => {
    clearMessages()
    setForm({ ...emptyForm })
    setEditingId("new")
  }

  const startEdit = (addr: any) => {
    clearMessages()
    setForm({
      zipCode: addr.zip_code || "",
      street: addr.street || "",
      number: addr.number || "",
      complement: addr.complement || "",
      neighborhood: addr.neighborhood || "",
      city: addr.city || "",
      state: addr.state || "",
      addressType: addr.address_type || "casa",
    })
    setEditingId(addr.id)
  }

  const cancel = () => {
    clearMessages()
    setEditingId(null)
  }

  const getCSRF = async () => {
    const { getCSRFToken } = await import("@/lib/utils/fetch-with-csrf")
    return getCSRFToken()
  }

  const handleSave = async () => {
    const { zipCode, street, number, neighborhood, city, state, addressType } = form
    if (!zipCode || !street || !number || !neighborhood || !city || !state) {
      setError("Preencha todos os campos obrigatórios")
      return
    }

    setIsLoading(true)
    clearMessages()

    try {
      const token = await getCSRF()

      if (editingId === "new") {
        const result = await createAddressAction({
          entityId: userId,
          entityType: "user",
          zipCode, street, number,
          complement: form.complement,
          neighborhood, city, state,
          isDefault: addresses.length === 0,
          addressType,
          csrf_token: token,
        })
        if (result.error) {
          setError(result.error)
          notifyError("Erro", result.error)
        } else {
          setAddresses([...(result.address?.is_default ? addresses.map((a: any) => ({ ...a, is_default: false })) : addresses), result.address])
          notifySuccess("Sucesso", "Endereço adicionado!")
          setEditingId(null)
        }
      } else {
        const result = await updateAddressAction({
          addressId: editingId!,
          entityId: userId,
          entityType: "user",
          zipCode, street, number,
          complement: form.complement,
          neighborhood, city, state,
          addressType,
          csrf_token: token,
        })
        if (result.error) {
          setError(result.error)
          notifyError("Erro", result.error)
        } else {
          setAddresses(addresses.map((a: any) => a.id === editingId ? result.address : a))
          notifySuccess("Sucesso", "Endereço atualizado!")
          setEditingId(null)
        }
      }
    } catch {
      setError("Erro de segurança. Tente novamente.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (addrId: string) => {
    setIsLoading(true)
    clearMessages()
    try {
      const token = await getCSRF()
      const result = await deleteAddressAction(addrId, "user", userId, token)
      if (result.error) {
        setError(result.error)
        notifyError("Erro", result.error)
      } else {
        setAddresses(addresses.filter((a: any) => a.id !== addrId))
        notifySuccess("Sucesso", "Endereço removido!")
        if (editingId === addrId) setEditingId(null)
      }
    } catch {
      setError("Erro ao excluir endereço.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSetDefault = async (addrId: string) => {
    setIsLoading(true)
    clearMessages()
    try {
      const token = await getCSRF()
      const result = await setDefaultAddressAction(addrId, "user", userId, token)
      if (result.error) {
        setError(result.error)
      } else {
        setAddresses(addresses.map((a: any) => ({ ...a, is_default: a.id === addrId })))
        notifySuccess("Sucesso", "Endereço padrão atualizado!")
      }
    } catch {
      setError("Erro ao definir endereço padrão.")
    } finally {
      setIsLoading(false)
    }
  }

  const renderForm = () => (
    <motion.div key="form" {...fade} className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        {ADDRESS_TYPE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setForm(f => ({ ...f, addressType: opt.value }))}
            className={`px-4 py-1.5 rounded-full text-[13px] font-medium border transition-all ${form.addressType === opt.value
              ? "bg-brand-green text-white border-brand-green"
              : "bg-white text-brand-inactive-text border-gray-200 hover:border-gray-300"
              }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <CepInput
        label="CEP"
        id="zipCode"
        name="zipCode"
        value={form.zipCode}
        onChange={val => setForm(f => ({ ...f, zipCode: val }))}
        onAddressFetched={addr => {
          setForm(f => ({
            ...f,
            street: addr.street || f.street,
            neighborhood: addr.neighborhood || f.neighborhood,
            city: addr.city || f.city,
            state: addr.state || f.state,
          }))
        }}
      />
      <Input label="Rua" id="street" name="street" value={form.street}
        onChange={e => setForm(f => ({ ...f, street: e.target.value }))} />
      <div className="grid grid-cols-2 gap-4">
        <Input label="Número" id="number" name="number" value={form.number}
          onChange={e => setForm(f => ({ ...f, number: e.target.value }))} />
        <Input label="Complemento" id="complement" name="complement" value={form.complement}
          onChange={e => setForm(f => ({ ...f, complement: e.target.value }))} />
      </div>
      <Input label="Bairro" id="neighborhood" name="neighborhood" value={form.neighborhood}
        onChange={e => setForm(f => ({ ...f, neighborhood: e.target.value }))} />
      <div className="grid grid-cols-2 gap-4">
        <Input label="Cidade" id="city" name="city" value={form.city}
          onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
        <StateComboBox value={form.state} onChange={v => setForm(f => ({ ...f, state: v }))} className="w-full" />
      </div>
      <Feedback error={error} success={success} />
      <div className="flex gap-2">
        <Button type="button" onClick={handleSave} disabled={isLoading}>
          {isLoading ? "Salvando..." : editingId === "new" ? "Adicionar" : "Salvar"}
        </Button>
        <Button type="button" variant="outline" onClick={cancel}>Cancelar</Button>
      </div>
    </motion.div>
  )

  return (
    <motion.div key="address" {...fade} className="max-w-[800px] mx-auto space-y-6">
      <PageHeader title="Endereços" subtitle="Gerencie seus endereços de entrega." onBack={() => navigate("main")} />

      <SectionCard title="Meus endereços">
        {/* Address list */}
        {addresses.length === 0 && editingId !== "new" && (
          <p className="text-brand-inactive-text text-sm py-4">Nenhum endereço cadastrado.</p>
        )}

        <div className="space-y-3">
          {addresses.map((addr: any) => (
            editingId === addr.id ? (
              <div key={addr.id}>
                {renderForm()}
              </div>
            ) : (
              <div key={addr.id} className="flex items-start gap-3 p-4 rounded-xl border border-gray-100 bg-brand-gray/30 hover:border-gray-200 transition-colors group">
                <div className="w-10 h-10 rounded-full bg-white border border-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                  <MapPinIcon size={18} className="text-brand-green" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[13px] font-semibold text-brand-dark">{getAddressTypeLabel(addr.address_type)}</span>
                    {addr.is_default && (
                      <span className="text-[10px] font-bold text-brand-green bg-brand-green/10 px-2 py-0.5 rounded-full">Padrão</span>
                    )}
                  </div>
                  <p className="text-[13px] text-brand-inactive-text leading-relaxed truncate">{formatAddressSummary(addr)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!addr.is_default && (
                    <button onClick={() => handleSetDefault(addr.id)} title="Definir como padrão" disabled={isLoading}
                      className="p-1.5 rounded-lg hover:bg-brand-green/10 text-brand-inactive-text hover:text-brand-green transition-colors">
                      <CheckCircleIcon size={16} />
                    </button>
                  )}
                  <button onClick={() => startEdit(addr)} title="Editar" disabled={isLoading}
                    className="p-1.5 rounded-lg hover:bg-blue-50 text-brand-inactive-text hover:text-blue-500 transition-colors">
                    <EditIcon size={16} />
                  </button>
                  <button onClick={() => handleDelete(addr.id)} title="Excluir" disabled={isLoading}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-brand-inactive-text hover:text-red-500 transition-colors">
                    <TrashIcon size={16} />
                  </button>
                </div>
              </div>
            )
          ))}
        </div>

        {/* Add button or new form */}
        <AnimatePresence mode="wait">
          {editingId === "new" ? (
            <div className="mt-4">{renderForm()}</div>
          ) : (
            addresses.length < 5 && editingId === null && (
              <motion.button
                {...fade}
                onClick={startCreate}
                disabled={isLoading}
                className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-200 text-brand-inactive-text hover:border-brand-green hover:text-brand-green transition-all text-[14px] font-medium"
              >
                <PlusIcon size={18} />
                Adicionar endereço ({addresses.length}/5)
              </motion.button>
            )
          )}
        </AnimatePresence>
      </SectionCard>
    </motion.div>
  )
}
