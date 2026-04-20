"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { SearchIcon, PlusIcon, XIcon, ClockIcon } from "@/lib/icons"
import { Button, Input, IconPlaceholder } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery, usePickerBucket } from "@/components/erp/hooks"
import {
  fetchPartnerTeamMembersBucket,
  type PartnerTeamMemberBucketItem,
} from "@/app/actions/erp/client-loaders"

function SellerRowSkeleton() {
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

interface SelectSellerSheetProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (seller: PartnerTeamMemberBucketItem) => void
}

const SelectSellerSheet = ({ isOpen, onClose, onSelect }: SelectSellerSheetProps) => {
  const [appendPulse, setAppendPulse] = useState(false)
  const loadMoreLock = useRef(false)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const isMobile = useMediaQuery("(max-width: 768px)")

  const matchesSearch = useCallback((member: PartnerTeamMemberBucketItem, q: string) => {
    return (
      (member.fullName || "").toLowerCase().includes(q) ||
      member.email.toLowerCase().includes(q) ||
      (member.role || "").toLowerCase().includes(q)
    )
  }, [])

  const picker = usePickerBucket(fetchPartnerTeamMembersBucket, matchesSearch, { pageSize: 8 })

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
        <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Selecionar Vendedor</h2>
        <Button variant="ghost" onClick={onClose} size="icon">
          <XIcon className="h-5 w-5" />
        </Button>
      </header>

      <div className="z-10 shrink-0 border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <Input
          label=""
          name="sellerSearch"
          placeholder="Buscar por nome, email ou função..."
          value={picker.searchQuery}
          onChange={(e) => picker.setSearchQuery(e.target.value)}
          prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
          className="mb-0"
          variant="full-rounded"
        />
      </div>

      <div ref={listScrollRef} className="custom-scrollbar flex-1 overflow-y-auto p-0">
        {picker.isLoadingBucket ? (
          <div className="flex flex-col">
            {Array.from({ length: 8 }).map((_, i) => (
              <SellerRowSkeleton key={i} />
            ))}
          </div>
        ) : picker.displayed.length > 0 ? (
          <div className="flex flex-col px-2 pb-2 pt-1">
            {picker.displayed.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => {
                  onSelect(member)
                  onClose()
                }}
                className="group flex w-full items-center gap-4 border-b border-brand-border p-3.5 text-left transition-colors last:border-0 hover:bg-gray-50 dark:border-dark-border dark:hover:bg-dark-border/40"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-brand-border bg-brand-gray text-lg font-bold text-brand-inactive-text dark:border-dark-border dark:bg-gray-800">
                  {(member.fullName || member.email || "?").charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-brand-dark dark:text-dark-heading">
                    {member.fullName || member.email || "Membro"}
                  </div>
                  <p className="truncate text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                    {member.role || "Equipe"}
                  </p>
                </div>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center text-brand-inactive-text opacity-0 transition-opacity group-hover:opacity-100">
                  <PlusIcon size={18} />
                </div>
              </button>
            ))}

            {appendPulse && picker.hasMore && (
              <div className="flex flex-col border-t border-brand-border/50 pt-1 dark:border-dark-border/50">
                <SellerRowSkeleton />
                <SellerRowSkeleton />
              </div>
            )}

            {picker.hasMore && (
              <div ref={sentinelRef} className="h-3 w-full shrink-0" aria-hidden />
            )}
          </div>
        ) : showEmpty ? (
          <div className="px-4 py-12">
            <IconPlaceholder icon={ClockIcon} title="Nenhum vendedor encontrado" subtitle="Tente outro termo de busca." />
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
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
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

export default SelectSellerSheet
