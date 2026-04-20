"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { SearchIcon, UserIcon, PlusIcon, XIcon } from "@/lib/icons"
import { Button, Input, IconPlaceholder, Badge } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery, usePickerBucket } from "@/components/erp/hooks"
import {
  fetchPartnerCustomersBucket,
  type PartnerCustomerBucketItem,
} from "@/app/actions/erp/client-loaders"

export type PinnedCustomerSummary = {
  id: string
  name: string
  email?: string | null
}

interface SelectCustomerSheetProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (customer: PartnerCustomerBucketItem | PinnedCustomerSummary) => void
  partnerId: string
  selectedCustomerId?: string
  pinnedCustomer?: PinnedCustomerSummary | null
  onRequestRemoveSelected?: () => void
  title?: string
}

function CustomerRowSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-4 border-b border-brand-border p-3.5 last:border-0 dark:border-dark-border">
      <div className="h-12 w-12 shrink-0 rounded-full bg-gray-100 dark:bg-dark-border" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-2/3 rounded bg-gray-100 dark:bg-dark-border" />
        <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-dark-border" />
      </div>
    </div>
  )
}

const SelectCustomerSheet = ({
  isOpen,
  onClose,
  onSelect,
  partnerId: _partnerId,
  selectedCustomerId,
  pinnedCustomer,
  onRequestRemoveSelected,
  title = "Selecionar Cliente",
}: SelectCustomerSheetProps) => {
  const [appendPulse, setAppendPulse] = useState(false)
  const loadMoreLock = useRef(false)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const isMobile = useMediaQuery("(max-width: 768px)")

  const matchesSearch = useCallback((item: PartnerCustomerBucketItem, q: string) => {
    return (
      (item.name || "").toLowerCase().includes(q) ||
      (item.email || "").toLowerCase().includes(q) ||
      (item.phone || "").toLowerCase().includes(q)
    )
  }, [])

  const postFilter = useCallback(
    (items: PartnerCustomerBucketItem[]) => {
      if (!selectedCustomerId || !pinnedCustomer) return items
      const rest = items.filter((c) => c.id !== selectedCustomerId)
      const inList = items.find((c) => c.id === selectedCustomerId)
      const head: PartnerCustomerBucketItem =
        inList ?? {
          id: pinnedCustomer.id,
          name: pinnedCustomer.name,
          email: pinnedCustomer.email ?? null,
          phone: null,
        }
      return [head, ...rest]
    },
    [selectedCustomerId, pinnedCustomer]
  )

  const pickerOptions = useMemo(
    () => ({
      pageSize: 8,
      postFilter,
      resetPagingKey: `${selectedCustomerId ?? ""}-${pinnedCustomer?.id ?? ""}`,
    }),
    [postFilter, selectedCustomerId, pinnedCustomer?.id]
  )

  const picker = usePickerBucket(fetchPartnerCustomersBucket, matchesSearch, pickerOptions)

  const pickerRef = useRef(picker)
  pickerRef.current = picker

  useEffect(() => {
    if (!isOpen) return
    void pickerRef.current.loadBucket()
  }, [isOpen])

  useEffect(() => {
    const root = listScrollRef.current
    const target = sentinelRef.current
    if (!isOpen || !root || !target || !picker.hasMore) return

    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || loadMoreLock.current) return
        loadMoreLock.current = true
        setAppendPulse(true)
        picker.loadMore()
        window.setTimeout(() => setAppendPulse(false), 200)
        window.setTimeout(() => {
          loadMoreLock.current = false
        }, 120)
      },
      { root, rootMargin: "100px", threshold: 0 }
    )
    obs.observe(target)
    return () => obs.disconnect()
  }, [isOpen, picker.hasMore, picker.loadMore, picker.displayed.length, picker.filtered.length])

  const showEmpty =
    !picker.isLoadingBucket &&
    picker.isLoaded &&
    picker.displayed.length === 0 &&
    picker.filtered.length === 0

  const content = (
    <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
      <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{title}</h2>
        <Button variant="ghost" onClick={onClose} size="icon">
          <XIcon className="h-5 w-5" />
        </Button>
      </header>

      <div className="z-10 shrink-0 border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <Input
          label=""
          name="customerSearch"
          placeholder="Buscar por nome, email ou telefone..."
          value={picker.searchQuery}
          onChange={(e) => picker.setSearchQuery(e.target.value)}
          prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
          className="mb-0"
        />
      </div>

      <div
        ref={listScrollRef}
        className="custom-scrollbar flex-1 overflow-y-auto p-0"
      >
        {picker.isLoadingBucket ? (
          <div className="flex flex-col">
            {Array.from({ length: 8 }).map((_, i) => (
              <CustomerRowSkeleton key={i} />
            ))}
          </div>
        ) : picker.displayed.length > 0 ? (
          <div className="flex flex-col px-2 pb-2 pt-1">
            {picker.displayed.map((customer) => {
              const isSelected = selectedCustomerId === customer.id
              return (
                <div
                  key={customer.id}
                  role={isSelected ? undefined : "button"}
                  tabIndex={isSelected ? undefined : 0}
                  onClick={!isSelected ? () => onSelect(customer) : undefined}
                  onKeyDown={
                    !isSelected
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            onSelect(customer)
                          }
                        }
                      : undefined
                  }
                  className={`group flex items-center gap-4 border-b border-brand-border p-3.5 transition-colors last:border-0 dark:border-dark-border ${
                    isSelected
                      ? "bg-brand-primary/5 dark:bg-brand-primary/10"
                      : "cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-border/40"
                  }`}
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-brand-border bg-brand-gray text-lg font-bold text-brand-inactive-text dark:border-dark-border dark:bg-gray-800">
                    {(customer.name || "?").charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-brand-dark dark:text-dark-heading">
                        {customer.name}
                      </span>
                      {isSelected && (
                        <Badge variant="green" className="shrink-0">
                          Selecionado
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-wide text-brand-inactive-text dark:text-dark-body">
                      {customer.email || "Sem email"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isSelected && onRequestRemoveSelected ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          onRequestRemoveSelected()
                        }}
                      >
                        Remover
                      </Button>
                    ) : !isSelected ? (
                      <div className="flex h-8 w-8 items-center justify-center text-brand-inactive-text opacity-0 transition-opacity group-hover:opacity-100">
                        <PlusIcon size={18} />
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}

            {appendPulse && picker.hasMore && (
              <div className="flex flex-col border-t border-brand-border/50 pt-1 dark:border-dark-border/50">
                <CustomerRowSkeleton />
                <CustomerRowSkeleton />
              </div>
            )}

            {picker.hasMore && (
              <div ref={sentinelRef} className="h-3 w-full shrink-0" aria-hidden />
            )}
          </div>
        ) : showEmpty ? (
          <div className="px-4 py-12">
            <IconPlaceholder
              icon={UserIcon}
              title="Nenhum cliente encontrado"
              subtitle="Tente outro termo de busca ou cadastre um novo cliente."
            />
          </div>
        ) : null}
      </div>

      <footer className="shrink-0 border-t border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <Button variant="outline" className="h-12 w-full" onClick={onClose}>
          Cancelar
        </Button>
      </footer>
    </div>
  )

  if (isMobile) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose}>
        {content}
      </BottomSheet>
    )
  }

  return (
    <Portal>
      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      >
        <div
          className={`fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    </Portal>
  )
}

export default SelectCustomerSheet
