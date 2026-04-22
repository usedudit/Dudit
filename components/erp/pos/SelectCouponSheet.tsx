"use client"

import { useState, useCallback, useEffect } from "react"
import { SearchIcon, PlusIcon, XIcon, TagIcon, CheckCircleIcon } from "@/lib/icons"
import { Button, Input, IconPlaceholder, ThreeDotsLoader } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { listCouponsAction } from "@/app/actions/erp/coupons"
import { formatCurrency } from "@/lib/utils"

interface SelectCouponSheetProps {
  isOpen: boolean
  onClose: () => void
  partnerId: string
  onApplyCoupon: (coupon: { code: string; id: string }) => void
  appliedCouponId?: string | null
  onRemoveCoupon?: () => void
}

type CouponItem = {
  id: string
  code: string
  discount_type: string
  discount_value: number | null
  is_active: boolean
  is_automatic?: boolean
}

const SelectCouponSheet = ({
  isOpen,
  onClose,
  partnerId,
  onApplyCoupon,
  appliedCouponId,
  onRemoveCoupon,
}: SelectCouponSheetProps) => {
  const [search, setSearch] = useState("")
  const [manualCode, setManualCode] = useState("")
  const [coupons, setCoupons] = useState<CouponItem[]>([])
  const [loading, setLoading] = useState(false)
  const isMobile = useMediaQuery("(max-width: 768px)")

  // Fetch coupons when sheet opens
  const fetchCoupons = useCallback(async () => {
    if (!isOpen || !partnerId) return
    setLoading(true)
    try {
      const res = await listCouponsAction(partnerId, {
        isActive: "active",
        limit: 50,
        search: search.trim() || undefined,
      })
      if (res.success) {
        setCoupons(res.data || [])
      }
    } finally {
      setLoading(false)
    }
  }, [isOpen, partnerId, search])

  useEffect(() => {
    fetchCoupons()
  }, [fetchCoupons])

  const formatDiscount = (coupon: CouponItem) => {
    if (coupon.discount_type === "percentage") return `${Number(coupon.discount_value || 0)}% off`
    if (coupon.discount_type === "fixed") return `${formatCurrency(Number(coupon.discount_value || 0))} off`
    return "Frete grátis"
  }

  const content = (
    <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
      <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Selecionar Cupom</h2>
        <Button variant="ghost" onClick={onClose} size="icon">
          <XIcon className="h-5 w-5" />
        </Button>
      </header>

      {/* Manual code input */}
      <div className="z-10 shrink-0 border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <div className="flex gap-2 mb-4">
          <Input
            label=""
            name="manualCouponCode"
            placeholder="Digite o código do cupom..."
            value={manualCode}
            onChange={(e: any) => setManualCode(e.target.value)}
            className="mb-0 flex-1"
          />
          <Button
            className="h-11 px-6 shrink-0"
            disabled={!manualCode.trim()}
            onClick={() => {
              if (manualCode.trim()) {
                onApplyCoupon({ code: manualCode.trim().toUpperCase(), id: "" })
                setManualCode("")
                onClose()
              }
            }}
          >
            Aplicar
          </Button>
        </div>

        <Input
          label=""
          name="couponSearch"
          placeholder="Buscar cupons cadastrados..."
          value={search}
          onChange={(e: any) => setSearch(e.target.value)}
          prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
          className="mb-0"
          variant="full-rounded"
        />
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="py-12 flex justify-center"><ThreeDotsLoader /></div>
        ) : coupons.length > 0 ? (
          <div className="flex flex-col gap-2">
            {coupons.map((coupon) => {
              const isApplied = appliedCouponId === coupon.id
              return (
                <button
                  key={coupon.id}
                  onClick={() => {
                    if (isApplied) {
                      onRemoveCoupon?.()
                    } else {
                      onApplyCoupon({ code: coupon.code, id: coupon.id })
                    }
                    onClose()
                  }}
                  className={`group flex items-center gap-4 rounded-xl border p-3 text-left transition-all ${
                    isApplied
                      ? "border-brand-green bg-green-50/50 dark:bg-green-900/10"
                      : "border-transparent hover:border-brand-border hover:bg-brand-gray/30 dark:hover:border-dark-border dark:hover:bg-dark-border/30"
                  }`}
                >
                  <div className={`flex h-12 w-12 items-center justify-center rounded-full border ${
                    isApplied
                      ? "border-brand-green bg-green-100 text-brand-green dark:bg-green-900/20"
                      : "border-brand-border bg-brand-gray text-brand-inactive-text dark:border-dark-border dark:bg-gray-800"
                  }`}>
                    {isApplied ? <CheckCircleIcon size={20} /> : <TagIcon size={20} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate text-[15px] font-bold leading-tight text-brand-dark transition-colors group-hover:text-brand-primary dark:text-dark-heading">
                        {coupon.code}
                      </h4>
                      {coupon.is_automatic && (
                        <span className="shrink-0 text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                          AUTO
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                      {formatDiscount(coupon)}
                    </p>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full text-brand-inactive-text opacity-0 transition-opacity group-hover:opacity-100">
                    {isApplied ? <XIcon size={18} /> : <PlusIcon size={18} />}
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="py-12">
            <IconPlaceholder
              icon={TagIcon}
              title={search ? "Nenhum cupom encontrado" : "Nenhum cupom disponível"}
              subtitle={search ? "Tente outro código." : "Crie cupons na aba de cupons para usá-los aqui."}
            />
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        {appliedCouponId && (
          <Button
            variant="outline"
            className="h-12 w-full mb-3 text-brand-red border-brand-red hover:bg-red-50"
            onClick={() => {
              onRemoveCoupon?.()
              onClose()
            }}
          >
            Remover cupom aplicado
          </Button>
        )}
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
