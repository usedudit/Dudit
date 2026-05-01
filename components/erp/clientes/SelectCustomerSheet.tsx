"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { SearchIcon, UserIcon, PlusIcon, XIcon } from "@/lib/icons"
import { Button, Input, IconPlaceholder, Badge, EmailInput, PhoneInput, InfoCard } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery, usePickerBucket } from "@/components/erp/hooks"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import {
  fetchPartnerCustomersBucket,
  type PartnerCustomerBucketItem,
} from "@/app/actions/erp/client-loaders"

export type PinnedCustomerSummary = {
  id: string
  name: string
  email?: string | null
  avatar_url?: string | null
}

interface SelectCustomerSheetProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (customer: PartnerCustomerBucketItem | PinnedCustomerSummary) => void
  onCreateCustomer?: (payload: {
    name: string
    email?: string
    phone?: string
  }) => Promise<{
    id: string
    name: string
    email?: string | null
    phone?: string | null
  } | null>
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
  onCreateCustomer,
  partnerId,
  selectedCustomerId,
  pinnedCustomer,
  onRequestRemoveSelected,
  title = "Selecionar Cliente",
}: SelectCustomerSheetProps) => {
  const [appendPulse, setAppendPulse] = useState(false)
  const [isNewCustomerSheetOpen, setIsNewCustomerSheetOpen] = useState(false)
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState("")
  const [newCustomerEmail, setNewCustomerEmail] = useState("")
  const [newCustomerPhone, setNewCustomerPhone] = useState("")
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null)
  const loadMoreLock = useRef(false)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const isMobile = useMediaQuery("(max-width: 768px)")
  const isCloseLocked = isCreatingCustomer
  const handleSafeClose = useCallback(() => {
    if (isCloseLocked) return
    onClose()
  }, [isCloseLocked, onClose])

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
          avatar_url: pinnedCustomer.avatar_url ?? null,
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

  const loadCustomersBucket = useCallback(
    () => fetchPartnerCustomersBucket(partnerId),
    [partnerId]
  )

  const picker = usePickerBucket(loadCustomersBucket, matchesSearch, pickerOptions)

  const pickerRef = useRef(picker)
  pickerRef.current = picker

  useEffect(() => {
    if (!isOpen) return
    void pickerRef.current.loadBucket()
  }, [isOpen])

  useEffect(() => {
    if (isOpen) return
    setIsNewCustomerSheetOpen(false)
    setIsCreatingCustomer(false)
    setNewCustomerName("")
    setNewCustomerEmail("")
    setNewCustomerPhone("")
    setNewCustomerError(null)
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
        <Button variant="ghost" onClick={handleSafeClose} size="icon" disabled={isCloseLocked}>
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
          variant="full-rounded"
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
          <div className="flex flex-col px-2 pb-2">
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
                  className={`group flex items-center gap-4 border-b border-brand-border p-3.5 transition-colors last:border-0 dark:border-dark-border ${isSelected
                    ? "bg-brand-primary/5 dark:bg-brand-primary/10"
                    : "cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-border/40"
                    }`}
                >
                  <UserProfileImage
                    fullName={customer.name || "Cliente"}
                    imageUrl={customer.avatar_url}
                    className="h-12 w-12 shrink-0 text-lg"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-brand-dark dark:text-dark-heading">
                        {customer.name}
                      </span>
                      {isSelected && (
                        <Badge variant="green" className="whitespace-nowrap scale-90 shrink-0">
                          Selecionado
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                      ID #{customer.id ? customer.id.substring(0, 5).toUpperCase() : "-"}
                    </p>
                    <p className="truncate text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                      {customer.email || "Sem e-mail"}
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
        {onCreateCustomer ? (
          <div className="flex items-center gap-3">
            <Button variant="outline" className="h-12 flex-1" onClick={handleSafeClose} disabled={isCloseLocked}>
              Cancelar
            </Button>
            <Button
              className="h-12 flex-1"
              onClick={() => {
                setNewCustomerError(null)
                setIsNewCustomerSheetOpen(true)
              }}
            >
              Novo cliente
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="h-12 w-full" onClick={handleSafeClose} disabled={isCloseLocked}>
            Cancelar
          </Button>
        )}
      </footer>
    </div>
  )

  const newCustomerSheetContent = (
    <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
      <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Novo cliente</h2>
        <Button variant="ghost" onClick={() => { if (!isCloseLocked) setIsNewCustomerSheetOpen(false) }} size="icon" disabled={isCloseLocked}>
          <XIcon className="h-5 w-5" />
        </Button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <Input
          label="Nome"
          name="newCustomerName"
          value={newCustomerName}
          onChange={(e) => setNewCustomerName(e.target.value)}
          placeholder="Nome do cliente"
        />
        <EmailInput
          label="E-mail"
          name="newCustomerEmail"
          value={newCustomerEmail}
          onChange={(e) => setNewCustomerEmail(e.target.value)}
        />
        <PhoneInput
          label="Telefone"
          name="newCustomerPhone"
          value={newCustomerPhone}
          onChange={(e) => setNewCustomerPhone(e.target.value)}
        />
        {newCustomerError && (
          <InfoCard title="Erro ao salvar cliente" message={newCustomerError} color="red" />
        )}
      </div>

      <footer className="shrink-0 border-t border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="flex-1" onClick={() => setIsNewCustomerSheetOpen(false)} disabled={isCloseLocked}>
            Voltar
          </Button>
          <Button
            className="flex-1"
            isLoading={isCreatingCustomer}
            onClick={async () => {
              if (!onCreateCustomer) return
              const name = newCustomerName.trim()
              if (!name) {
                setNewCustomerError("Informe o nome do cliente.")
                return
              }

              setIsCreatingCustomer(true)
              setNewCustomerError(null)
              try {
                const created = await onCreateCustomer({
                  name,
                  email: newCustomerEmail.trim(),
                  phone: newCustomerPhone.trim(),
                })
                if (!created) return

                setNewCustomerName("")
                setNewCustomerEmail("")
                setNewCustomerPhone("")
                setIsNewCustomerSheetOpen(false)
                onSelect(created)
              } catch (error) {
                setNewCustomerError(error instanceof Error ? error.message : "Não foi possível criar o cliente.")
              } finally {
                setIsCreatingCustomer(false)
              }
            }}
          >
            Salvar cliente
          </Button>
        </div>
      </footer>
    </div >
  )

  if (isMobile) {
    return (
      <>
        <BottomSheet isOpen={isOpen} onClose={handleSafeClose}>
          {content}
        </BottomSheet>
        <BottomSheet isOpen={isNewCustomerSheetOpen} onClose={() => { if (!isCloseLocked) setIsNewCustomerSheetOpen(false) }}>
          {newCustomerSheetContent}
        </BottomSheet>
      </>
    )
  }

  return (
    <>
      <Portal>
        <div
          className={`fixed inset-0 z-50 bg-black/50 transition-opacity ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
          onClick={handleSafeClose}
        >
          <div
            className={`fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 dark:bg-dark-surface ${isOpen
              ? isNewCustomerSheetOpen
                ? "-translate-x-10 scale-[0.97] opacity-70"
                : "translate-x-0 opacity-100"
              : "translate-x-[120%] opacity-100"
              }`}
            onClick={(e) => e.stopPropagation()}
          >
            {content}
          </div>
        </div>
      </Portal>
      <Portal>
        <div
          className={`fixed inset-0 z-[60] bg-black/50 transition-opacity duration-300 ${isNewCustomerSheetOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
          onClick={() => { if (!isCloseLocked) setIsNewCustomerSheetOpen(false) }}
        >
          <div
            className={`fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isNewCustomerSheetOpen ? "translate-x-0" : "translate-x-[120%]"}`}
            onClick={(e) => e.stopPropagation()}
          >
            {newCustomerSheetContent}
          </div>
        </div>
      </Portal>
    </>
  )
}

export default SelectCustomerSheet
