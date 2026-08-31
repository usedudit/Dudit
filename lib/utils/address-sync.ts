"use client"

import { useEffect, useRef } from "react"

export const DUDIT_ADDRESS_UPDATED_EVENT = "dudit:address-updated"
export const DUDIT_ACTIVE_ADDRESS_STORAGE_KEY = "dudit_active_address_id"

/**
 * Notifica todas as páginas e componentes montados de que o endereço do usuário mudou
 * (novo endereço cadastrado, padrão alterado, ou endereço excluído).
 */
export function notifyAddressUpdated(addressId?: string) {
  if (typeof window === "undefined") return

  try {
    if (addressId) {
      localStorage.setItem(DUDIT_ACTIVE_ADDRESS_STORAGE_KEY, addressId)
    }
    window.dispatchEvent(
      new CustomEvent(DUDIT_ADDRESS_UPDATED_EVENT, {
        detail: { addressId },
      }),
    )
  } catch (err) {
    console.warn("Failed to dispatch address update notification:", err)
  }
}

/**
 * Hook para reagir a alterações de endereço em qualquer parte do app
 * (troca de endereço padrão, novo endereço criado em modal, etc).
 */
export function useAddressSync(onAddressUpdated: (addressId?: string) => void) {
  const callbackRef = useRef(onAddressUpdated)
  callbackRef.current = onAddressUpdated

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleAddressUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ addressId?: string }>
      callbackRef.current(customEvent.detail?.addressId)
    }
    const handleStorage = (e: StorageEvent) => {
      if (e.key === DUDIT_ACTIVE_ADDRESS_STORAGE_KEY) {
        callbackRef.current(e.newValue || undefined)
      }
    }

    window.addEventListener(DUDIT_ADDRESS_UPDATED_EVENT, handleAddressUpdated)
    window.addEventListener("storage", handleStorage)

    return () => {
      window.removeEventListener(DUDIT_ADDRESS_UPDATED_EVENT, handleAddressUpdated)
      window.removeEventListener("storage", handleStorage)
    }
  }, [])
}
