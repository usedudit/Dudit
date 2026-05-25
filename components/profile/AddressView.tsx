"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { MapPinIcon, TrashIcon, CheckCircleIcon, PlusIcon, EditIcon, HomeIcon, BriefcaseIcon, ThreeDotsIcon } from "@/lib/icons"
import { Button, Input, CepInput, StateComboBox, NumberInputWithCheckbox, DefaultModal, Dropdown, DropdownItem } from "@/components/reusable"
import { Feedback, PageHeader, fade, View } from "./profile-shared"
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

function getAddressTypeIcon(type: string | null | undefined) {
  switch (type) {
    case "casa":
      return <HomeIcon size={18} className="text-brand-dark dark:text-dark-heading" />
    case "trabalho":
      return <BriefcaseIcon size={18} className="text-brand-dark dark:text-dark-heading" />
    default:
      return <MapPinIcon size={18} className="text-brand-dark dark:text-dark-heading" />
  }
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
  neighborhood: "", city: "", state: "", addressType: "casa", noNumber: false,
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
    const isNoNumber = addr.number === "S/N"
    setForm({
      zipCode: addr.zip_code || "",
      street: addr.street || "",
      number: isNoNumber ? "" : addr.number || "",
      complement: addr.complement || "",
      neighborhood: addr.neighborhood || "",
      city: addr.city || "",
      state: addr.state || "",
      addressType: addr.address_type || "casa",
      noNumber: isNoNumber,
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
    const { zipCode, street, number, neighborhood, city, state, addressType, noNumber } = form
    const finalNumber = noNumber ? "S/N" : number
    if (!zipCode || !street || !finalNumber || !neighborhood || !city || !state) {
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
          zipCode, street, number: finalNumber,
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
          zipCode, street, number: finalNumber,
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
      <Input label="Rua/Avenida" id="street" name="street" placeholder="Rua, Avenida, etc." value={form.street}
        onChange={e => setForm(f => ({ ...f, street: e.target.value }))} />
      <div className="grid grid-cols-2 gap-4">
        <NumberInputWithCheckbox
          label="Número"
          number={form.number}
          noNumber={form.noNumber}
          onNumberChange={val => setForm(f => ({ ...f, number: val }))}
          onNoNumberChange={checked => setForm(f => ({ ...f, noNumber: checked, number: checked ? "S/N" : "" }))}
          placeholder="123"
        />
        <Input label="Complemento" id="complement" name="complement" placeholder="Apto, Bloco, etc." value={form.complement}
          onChange={e => setForm(f => ({ ...f, complement: e.target.value }))} />
      </div>
      <Input label="Bairro" id="neighborhood" name="neighborhood" placeholder="Nome do bairro" value={form.neighborhood}
        onChange={e => setForm(f => ({ ...f, neighborhood: e.target.value }))} />
      <div className="grid grid-cols-2 gap-4">
        <Input label="Cidade" id="city" name="city" placeholder="Nome da cidade" value={form.city}
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

      {/* Address list */}
      {addresses.length === 0 && (
        <p className="text-brand-inactive-text text-sm py-8 text-center">Nenhum endereço cadastrado.</p>
      )}

      {addresses.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addresses.map((addr: any) => (
            <div
              key={addr.id}
              className={`p-5 rounded-2xl border bg-white dark:bg-dark-surface transition-all flex flex-col justify-between ${
                addr.is_default
                  ? "border-brand-green ring-1 ring-brand-green/30"
                  : "border-brand-border dark:border-dark-border hover:border-brand-dark/20 dark:hover:border-white/20"
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {getAddressTypeIcon(addr.address_type)}
                  <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                    {getAddressTypeLabel(addr.address_type)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {addr.is_default && (
                    <CheckCircleIcon size={18} className="text-brand-green" />
                  )}
                  <Dropdown
                    trigger={
                      <button
                        type="button"
                        className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                      >
                        <ThreeDotsIcon size={18} />
                      </button>
                    }
                    align="right"
                    showChevron={false}
                    fullWidth={false}
                    width="w-44"
                  >
                    {!addr.is_default && (
                      <DropdownItem onClick={() => handleSetDefault(addr.id)}>
                        <CheckCircleIcon size={14} className="text-brand-inactive-text mr-1" />
                        Tornar padrão
                      </DropdownItem>
                    )}
                    <DropdownItem onClick={() => startEdit(addr)}>
                      <EditIcon size={14} className="text-brand-inactive-text mr-1" />
                      Editar
                    </DropdownItem>
                    <DropdownItem
                      onClick={() => handleDelete(addr.id)}
                      className="text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                    >
                      <TrashIcon size={14} className="text-red-500 mr-1" />
                      Excluir
                    </DropdownItem>
                  </Dropdown>
                </div>
              </div>

              {/* Body: Address Details and Map Image */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 text-[13px] text-brand-inactive-text leading-relaxed">
                  <p>
                    {addr.street && addr.number ? `${addr.street}, ${addr.number}` : addr.street}
                    {addr.complement && ` - ${addr.complement}`}
                  </p>
                  <p>{addr.neighborhood}</p>
                  <p>
                    {addr.city && addr.state ? `${addr.city} - ${addr.state}` : addr.city || addr.state}
                  </p>
                  <p>{addr.zip_code}</p>
                </div>
                <div className="shrink-0">
                  <img
                    src="https://img.dudit.com.br/static/Map.png"
                    alt="Mapa do local"
                    className="w-14 h-14 object-cover rounded-xl border border-brand-border dark:border-dark-border"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add button */}
      {addresses.length < 5 && (
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={startCreate}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2"
          >
            <PlusIcon size={18} />
            Adicionar endereço ({addresses.length}/5)
          </Button>
        </div>
      )}

      {/* Modal containing the address form */}
      <DefaultModal
        isOpen={editingId !== null}
        onClose={cancel}
        title={editingId === "new" ? "Adicionar endereço" : "Editar endereço"}
        maxWidth="xl"
      >
        {editingId !== null && renderForm()}
      </DefaultModal>
    </motion.div>
  )
}
