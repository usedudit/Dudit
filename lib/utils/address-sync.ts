"use client"

import { useEffect, useCallback } from "react"

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
  const handler = useCallback(
    (e: Event) => {
      const customEvent = e as CustomEvent<{ addressId?: string }>
      onAddressUpdated(customEvent.detail?.addressId)
    },
    [onAddressUpdated],
  )

  useEffect(() => {
    if (typeof window === "undefined") return

    window.addEventListener(DUDIT_ADDRESS_UPDATED_EVENT, handler)
    window.addEventListener("storage", (e) => {
      if (e.key === DUDIT_ACTIVE_ADDRESS_STORAGE_KEY) {
        onAddressUpdated(e.newValue || undefined)
      }
    })

    return () => {
      window.removeEventListener(DUDIT_ADDRESS_UPDATED_EVENT, handler)
    }
  }, [handler, onAddressUpdated])
}
