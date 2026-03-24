"use client"

import { useState, useEffect } from "react"
import { useStore } from "@/lib/store-context"
import Dropdown, { DropdownItem } from "@/components/reusable/Dropdown"
import { NewStoreModal } from "./store-switcher-modal"
import { PlusIcon } from "@/lib/icons"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

export function StoreSwitcher() {
  const { selectedStore, stores, isLoading, selectStore, refreshStores } = useStore()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [partnerId, setPartnerId] = useState<string>("")

  useEffect(() => {
    if (selectedStore?.partner_id) {
      setPartnerId(selectedStore.partner_id)
    }
  }, [selectedStore])

  if (isLoading || !selectedStore) {
    return <div className="w-9 h-9 rounded-lg bg-gray-200 dark:bg-dark-border animate-pulse" />
  }

  const storeLogo = getR2ImageUrl(selectedStore.image_url)

  return (
    <>
      <Dropdown
        trigger={
          <div className="flex items-center space-x-2 cursor-pointer dark:hover:bg-dark-border transition-colors">
            <img
              src={storeLogo || "https://img.dudit.com.br/static/Placeholder.png"}
              alt={selectedStore.name}
              className="w-8 h-8 rounded-full object-cover"
            />
            <div className="hidden sm:flex flex-col">
              <span className="text-md font-semibold text-brand-dark dark:text-dark-heading line-clamp-1">
                {selectedStore.name}
              </span>
            </div>
          </div>
        }
        align="left"
        showChevron={false}
      >
        {stores.map((store) => {
          const storeImage = getR2ImageUrl(store.image_url) || "/local-grocery-store.png"

          return (
            <DropdownItem
              key={store.id}
              onClick={() => selectStore(store.id)}
              className={selectedStore.id === store.id ? "bg-brand-primary/10" : ""}
            >
              <div className="flex items-center gap-3 w-full">
                <img
                  src={storeImage || "https://img.dudit.com.br/static/Placeholder.png"}
                  alt={store.name}
                  className="w-6 h-6 rounded-md object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{store.name}</p>
                </div>
                {selectedStore.id === store.id && (
                  <div className="w-2 h-2 rounded-full bg-brand-primary flex-shrink-0" />
                )}
              </div>
            </DropdownItem>
          )
        })}

        <div className="my-1 border-t border-brand-border dark:border-dark-border" />

        <DropdownItem
          onClick={() => setIsModalOpen(true)}
          className="text-brand-primary hover:bg-brand-primary/10 flex items-center gap-2"
        >
          <PlusIcon className="w-4 h-4" />
          <span>Novo Local</span>
        </DropdownItem>
      </Dropdown>

      <NewStoreModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        partnerId={partnerId}
        onStoreCreated={() => {
          refreshStores()
        }}
      />
    </>
  )
}
