"use client"

import { useEffect, useRef } from "react"
import { mutate } from "swr"

export const DUDIT_ADDRESS_UPDATED_EVENT = "dudit:address-updated"
export const DUDIT_ACTIVE_ADDRESS_STORAGE_KEY = "dudit_active_address_id"

export interface AddressSyncPayload {
  addressId?: string
  address?: any
  citySlug?: string | null
}

function normalizeCityToSlug(city: string, state: string): string {
  const normCity = city
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
  return `${normCity}-${state.toLowerCase()}`
}

/**
 * Notifica todas as páginas e componentes montados de que o endereço do usuário mudou
 * (novo endereço cadastrado, padrão alterado, ou endereço selecionado para entrega).
 */
export function notifyAddressUpdated(addressId?: string, addressData?: any, citySlug?: string | null) {
  if (typeof window === "undefined") return

  try {
    let resolvedSlug = citySlug
    if (!resolvedSlug && addressData?.city && addressData?.state) {
      resolvedSlug = normalizeCityToSlug(addressData.city, addressData.state)
    }

    if (addressId) {
      try {
        localStorage.setItem(DUDIT_ACTIVE_ADDRESS_STORAGE_KEY, addressId)
      } catch { }
    }

    if (resolvedSlug && resolvedSlug !== "brasil" && !resolvedSlug.startsWith("estado-")) {
      try {
        localStorage.setItem("dudit_city", resolvedSlug)
        document.cookie = `dudit_city=${resolvedSlug}; path=/; max-age=${60 * 60 * 24 * 30}`
      } catch { }
    }

    window.dispatchEvent(
      new CustomEvent<AddressSyncPayload>(DUDIT_ADDRESS_UPDATED_EVENT, {
        detail: { addressId, address: addressData, citySlug: resolvedSlug },
      }),
    )

    // Força revalidação instantânea do SWR da sessão do usuário
    void mutate(
      (key) => typeof key === "string" && key.startsWith("user-session-"),
      undefined,
      { revalidate: true }
    )

    // Notifica listeners de storage na mesma aba
    window.dispatchEvent(new Event("storage"))
  } catch (err) {
    console.warn("Failed to dispatch address update notification:", err)
  }
}

/**
 * Hook para reagir a alterações de endereço em qualquer parte do app
 * (troca de endereço padrão, novo endereço criado em modal, etc).
 */
export function useAddressSync(
  onAddressUpdated: (addressId?: string, payload?: AddressSyncPayload) => void
) {
  const callbackRef = useRef(onAddressUpdated)
  callbackRef.current = onAddressUpdated

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleAddressUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<AddressSyncPayload>
      callbackRef.current(customEvent.detail?.addressId, customEvent.detail)
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
