"use client"

import { useState } from "react"
import { SearchIcon, PlusIcon, XIcon, TagIcon } from "@/lib/icons"
import { Button, Input, IconPlaceholder } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"

interface SelectCouponSheetProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (coupon: { code: string }) => void
}

const mockCoupons: Array<{ id: string; code: string; description: string }> = []

const SelectCouponSheet = ({ isOpen, onClose, onSelect }: SelectCouponSheetProps) => {
  const [search, setSearch] = useState("")
  const isMobile = useMediaQuery("(max-width: 768px)")

  const filteredCoupons = mockCoupons.filter((coupon) =>
    coupon.code.toLowerCase().includes(search.toLowerCase())
    || coupon.description.toLowerCase().includes(search.toLowerCase()))

  const content = (
    <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
      <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Selecionar Cupom</h2>
        <Button variant="ghost" onClick={onClose} size="icon">
          <XIcon className="h-5 w-5" />
        </Button>
      </header>

      <div className="z-10 shrink-0 border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <Input
          label=""
          name="couponSearch"
          placeholder="Buscar por código ou descrição..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
          className="mb-0"
          variant="full-rounded"
        />
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto p-4">
        {filteredCoupons.length > 0 ? (
          <div className="flex flex-col gap-2">
            {filteredCoupons.map((coupon) => (
              <button
                key={coupon.id}
                onClick={() => {
                  onSelect({ code: coupon.code })
                  onClose()
                }}
                className="group flex items-center gap-4 rounded-xl border border-transparent p-3 text-left transition-all hover:border-brand-border hover:bg-brand-gray/30 dark:hover:border-dark-border dark:hover:bg-dark-border/30"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-brand-border bg-brand-gray text-brand-inactive-text dark:border-dark-border dark:bg-gray-800">
                  <TagIcon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-[15px] font-bold leading-tight text-brand-dark transition-colors group-hover:text-brand-primary dark:text-dark-heading">
                    {coupon.code}
                  </h4>
                  <p className="truncate text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                    {coupon.description}
                  </p>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full text-brand-inactive-text opacity-0 transition-opacity group-hover:opacity-100">
                  <PlusIcon size={18} />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-12">
            <IconPlaceholder
              icon={TagIcon}
              title="Nenhum cupom disponível"
              subtitle="Em breve você verá os cupons cadastrados aqui."
            />
          </div>
        )}
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

export default SelectCouponSheet
