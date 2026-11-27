"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { MapPinIcon, TrashIcon, CheckCircleIcon, EditIcon, HomeIcon, BriefcaseIcon, PlusIcon } from "@/lib/icons"
import { Button, AlertModal, ActionsDropdown, DropdownItem, IconPlaceholder } from "@/components/reusable"
import { AddressFormModal } from "@/components/reusable/AddressFormModal"
import { PageHeader, fade, View } from "./profile-shared"
import { deleteAddressAction, setDefaultAddressAction } from "@/app/actions/shared/addresses"
import { useNotification } from "@/hooks/use-notification"
import { notifyAddressUpdated } from "@/lib/utils/address-sync"

const ADDRESS_TYPE_OPTIONS = [
    { value: "casa", label: "Casa" },
    { value: "trabalho", label: "Trabalho" },
    { value: "outro", label: "Outro" },
]

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

export const AddressView = ({
    navigate, userId, addresses, setAddresses,
    setIsLoading, setError, clearMessages,
}: AddressViewProps) => {
    const { success: notifySuccess, error: notifyError } = useNotification()
    const router = useRouter()
    const [isFormOpen, setIsFormOpen] = useState(false)
    const [editingAddress, setEditingAddress] = useState<any | null>(null)
    const [addressToDelete, setAddressToDelete] = useState<any | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const sortedAddresses = useMemo(() => {
        return [...addresses].sort((a, b) => {
            if (a.is_default && !b.is_default) return -1
            if (!a.is_default && b.is_default) return 1
            return 0
        })
    }, [addresses])

    const startCreate = () => {
        clearMessages()
        setEditingAddress(null)
        setIsFormOpen(true)
    }

    const startEdit = (addr: any) => {
        clearMessages()
        setEditingAddress(addr)
        setIsFormOpen(true)
    }

    const cancel = () => {
        clearMessages()
        setIsFormOpen(false)
        setEditingAddress(null)
    }

    const getCSRF = async () => {
        const { getCSRFToken } = await import("@/lib/utils/fetch-with-csrf")
        return getCSRFToken()
    }

    const handleAddressSaved = async (savedAddress: any, { isEdit }: { isEdit: boolean }) => {
        if (isEdit) {
            setAddresses(addresses.map((a: any) => a.id === savedAddress.id ? savedAddress : a))
            notifySuccess("Sucesso", "Endereço atualizado!")
        } else {
            setAddresses([
                ...(savedAddress?.is_default ? addresses.map((a: any) => ({ ...a, is_default: false })) : addresses),
                savedAddress,
            ])
            notifySuccess("Sucesso", "Endereço adicionado!")
        }
        setIsFormOpen(false)
        setEditingAddress(null)
        router.refresh()
    }

    const handleDelete = (addr: any) => {
        setAddressToDelete(addr)
    }

    const confirmDelete = async () => {
        if (!addressToDelete) return
        setIsDeleting(true)
        clearMessages()
        try {
            const token = await getCSRF()
            const result = await deleteAddressAction(addressToDelete.id, "user", userId, token)
            if (result.error) {
                setError(result.error)
                notifyError("Erro", result.error)
            } else {
                setAddresses(addresses.filter((a: any) => a.id !== addressToDelete.id))
                notifySuccess("Sucesso", "Endereço removido!")
                if (editingAddress?.id === addressToDelete.id) {
                    setIsFormOpen(false)
                    setEditingAddress(null)
                }
                notifyAddressUpdated()
                router.refresh()
            }
        } catch {
            setError("Erro ao excluir endereço.")
        } finally {
            setIsDeleting(false)
            setAddressToDelete(null)
        }
    }

    const cancelDelete = () => {
        setAddressToDelete(null)
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
                const targetAddr = result.address || addresses.find((a: any) => a.id === addrId)
                notifyAddressUpdated(addrId, targetAddr, result.citySlug)
                router.refresh()
            }
        } catch {
            setError("Erro ao definir endereço padrão.")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <motion.div key="address" {...fade} className="w-full pb-24 lg:pb-0">
            <PageHeader
                title="Endereços"
                subtitle="Gerencie seus endereços de entrega."
                onBack={() => navigate("main")}
                hideMobileAction
                action={addresses.length < 5 ? (
                    <Button onClick={startCreate} leftIcon={<PlusIcon size={18} />} variant="default">
                        Novo endereço
                    </Button>
                ) : undefined}
            />

            {/* Address list */}
            {sortedAddresses.length === 0 && (
                <IconPlaceholder
                    icon={MapPinIcon}
                    title="Nenhum endereço cadastrado"
                    subtitle="Adicione um endereço clicando no botão + abaixo."
                    buttons={sortedAddresses.length < 5 ? [
                        { text: "Adicionar endereço", action: startCreate }
                    ] : undefined}
                />
            )}

            {sortedAddresses.length > 0 && (
                <div className="pb-20 lg:pb-0 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sortedAddresses.map((addr: any) => (
                        <div
                            key={addr.id}
                            className={`p-5 rounded-2xl border bg-white dark:bg-dark-surface transition-all flex flex-col justify-between ${addr.is_default
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
                                    <ActionsDropdown
                                        onEdit={() => startEdit(addr)}
                                        onDelete={() => handleDelete(addr)}
                                    >
                                        {!addr.is_default && (
                                            <DropdownItem onClick={() => handleSetDefault(addr.id)}>
                                                <CheckCircleIcon size={18} />
                                                Tornar padrão
                                            </DropdownItem>
                                        )}
                                    </ActionsDropdown>
                                </div>
                            </div>

                            {/* Body: Address Details and Map Image */}
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0 text-[13px] text-brand-inactive-text dark:text-dark-body leading-relaxed">
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
                                        alt="Mapa"
                                        className="w-14 h-14 object-cover rounded-xl border border-brand-border dark:border-dark-border"
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal único de criação/edição de endereço */}
            <AddressFormModal
                isOpen={isFormOpen}
                onClose={cancel}
                entityId={userId}
                address={editingAddress}
                isFirstAddress={addresses.length === 0}
                onSaved={handleAddressSaved}
            />

            {/* Delete Confirmation Modal */}
            <AlertModal
                isOpen={!!addressToDelete}
                onClose={cancelDelete}
                title="Excluir endereço?"
                description={`Tem certeza que deseja excluir o endereço "${addressToDelete?.street}, ${addressToDelete?.number} - ${addressToDelete?.neighborhood}, ${addressToDelete?.city} - ${addressToDelete?.state}"? Esta ação não pode ser desfeita.`}
                confirmText="Sim, excluir"
                cancelText="Cancelar"
                variant="danger"
                onConfirm={confirmDelete}
                isLoading={isDeleting}
            />

            {/* Tablet/Mobile Bottom Menu */}
            {addresses.length < 5 && (
                <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] flex items-center justify-center shadow-lg">
                    <Button
                        onClick={startCreate}
                        leftIcon={<PlusIcon size={18} />}
                        variant="default"
                        className="w-full sm:max-w-md flex items-center justify-center gap-2 font-semibold text-sm h-11"
                    >
                        Novo endereço
                    </Button>
                </div>
            )}
        </motion.div>
    )
}
