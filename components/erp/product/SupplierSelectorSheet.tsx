"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { SearchIcon, UserIcon, PlusIcon, XIcon } from "@/lib/icons"
import { Button, Input, IconPlaceholder, Spinner } from "@/components/reusable"
import { formatBrazilPhone } from "@/lib/utils/phone-utils"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { searchSuppliersAction } from "@/app/actions/erp/products"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"

interface SupplierResult {
  id: string
  name: string
  email: string | null
  phone: string | null
  cnpj: string | null
  cpf: string | null
  image_url: string | null
}

interface SupplierSelectorSheetProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (supplier: SupplierResult) => void
  partnerId: string
  selectedSupplierIds?: string[]
}

export function SupplierSelectorSheet({
  isOpen,
  onClose,
  onSelect,
  partnerId,
  selectedSupplierIds = [],
}: SupplierSelectorSheetProps) {
  const isMobile = useMediaQuery("(max-width: 1023px)")
  const [search, setSearch] = useState("")
  const [suppliers, setSuppliers] = useState<SupplierResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<SupplierResult | null>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const fetchSuppliers = useCallback(async (term: string) => {
    setLoading(true)
    const res = await searchSuppliersAction(partnerId, term)
    if (!res.error) setSuppliers(res.suppliers || [])
    setLoading(false)
  }, [partnerId])

  useEffect(() => {
    if (!isOpen) { setSearch(""); setSelected(null); return }
    fetchSuppliers("")
  }, [isOpen, fetchSuppliers])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.value
    setSearch(v)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => fetchSuppliers(v), 300)
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return suppliers
    const term = search.toLowerCase()
    return suppliers.filter(
      (s) =>
        !selectedSupplierIds.includes(s.id) &&
        (s.name.toLowerCase().includes(term) ||
          s.email?.toLowerCase().includes(term) ||
          s.cnpj?.includes(search) ||
          s.cpf?.includes(search))
    )
  }, [suppliers, search, selectedSupplierIds])

  const handleConfirm = () => {
    if (!selected) return
    onSelect(selected)
    onClose()
  }

  const content = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-brand-border dark:border-dark-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Selecionar Fornecedor</h2>
          <button onClick={onClose} className="hidden lg:flex p-1 hover:bg-brand-gray dark:hover:bg-dark-border rounded-lg">
            <XIcon size={20} className="text-brand-inactive-text" />
          </button>
        </div>
        <Input
          placeholder="Buscar fornecedor..."
          value={search}
          onChange={handleSearchChange}
          prefix={<SearchIcon size={18} />}
          autoFocus
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size={24} />
          </div>
        ) : filtered.length === 0 ? (
          <IconPlaceholder
            icon={UserIcon}
            title="Nenhum fornecedor encontrado"
            subtitle="Tente alterar o termo de busca."
          />
        ) : (
          <div>
            {filtered.map((supplier) => {
              const isSelected = selected?.id === supplier.id
              return (
                <button
                  key={supplier.id}
                  onClick={() => setSelected(isSelected ? null : supplier)}
                  className={`w-full flex items-center gap-3 p-3.5 border-b border-brand-border dark:border-dark-border last:border-0 hover:bg-brand-gray dark:hover:bg-dark-border/50 transition-colors text-left ${
                    isSelected ? "bg-brand-green/5 dark:bg-brand-green/10" : ""
                  }`}
                >
                  <UserProfileImage
                    fullName={supplier.name || "Fornecedor"}
                    imageUrl={supplier.image_url || (supplier as any).imageUrl || (supplier as any).avatar_url}
                    className="w-10 h-10 shrink-0 text-sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{supplier.name}</p>
                    {supplier.phone ? (
                      <p className="text-xs text-brand-inactive-text truncate">
                        {formatBrazilPhone(supplier.phone) || supplier.phone}
                      </p>
                    ) : null}
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-brand-green flex items-center justify-center">
                      <span className="text-white text-xs font-bold">✓</span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-brand-border dark:border-dark-border">
        <Button onClick={handleConfirm} disabled={!selected} className="w-full">
          {selected ? `Vincular ${selected.name}` : "Selecione um fornecedor"}
        </Button>
      </div>
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
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={onClose} />
          <div className="relative bg-white dark:bg-dark-surface rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden">
            {content}
          </div>
        </div>
      )}
    </Portal>
  )
}
