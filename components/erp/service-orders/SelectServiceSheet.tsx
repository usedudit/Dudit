"use client"

import React, { useState, useEffect, useMemo } from "react"
import DefaultModal from "@/components/reusable/DefaultModal"
import { Input, Button, ThreeDotsLoader } from "@/components/reusable"
import { SearchIcon, WrenchIcon } from "@/lib/icons"
import { getERPServicesPageAction } from "@/app/actions/erp/servicos"
import { formatCurrency } from "@/lib/utils"

interface SelectServiceSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (service: any) => void
  partnerId: string
  storeId?: string | null
}

export default function SelectServiceSheet({ open, onOpenChange, onSelect, partnerId, storeId }: SelectServiceSheetProps) {
  const [services, setServices] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (!open) return
    setLoading(true)
    getERPServicesPageAction(partnerId, { cursor: null, limit: 200, storeId: storeId || undefined })
      .then((res) => {
        if (res.success) setServices(res.items || [])
      })
      .finally(() => setLoading(false))
  }, [open, partnerId, storeId])

  const filtered = useMemo(() => {
    const term = search.toLowerCase()
    if (!term) return services
    return services.filter((s: any) =>
      s.name?.toLowerCase().includes(term) || s.sku?.toLowerCase().includes(term)
    )
  }, [services, search])

  return (
    <DefaultModal isOpen={open} onClose={() => onOpenChange(false)} title="Selecionar Serviço" maxWidth="lg">
      <div className="space-y-4">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-inactive-text" />
          <Input
            placeholder="Buscar serviço..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <ThreeDotsLoader />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-brand-inactive-text text-center py-8">Nenhum serviço encontrado</p>
        ) : (
          <div className="max-h-[400px] overflow-y-auto space-y-1">
            {filtered.map((svc: any) => (
              <button
                key={svc.id}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-brand-gray dark:hover:bg-dark-border transition-colors text-left"
                onClick={() => {
                  onSelect(svc)
                  onOpenChange(false)
                }}
              >
                <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center">
                  <WrenchIcon className="w-5 h-5 text-brand-inactive-text" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-brand-dark dark:text-dark-heading truncate">{svc.name}</p>
                  {svc.sku && <p className="text-[11px] text-brand-inactive-text">{svc.sku}</p>}
                </div>
                <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading shrink-0">
                  {formatCurrency(svc.price || 0)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </DefaultModal>
  )
}
