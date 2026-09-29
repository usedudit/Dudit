"use client"

import React, { useMemo, useState, useEffect } from "react"
import { SearchIcon, PlusIcon, XIcon, CheckCircleIcon, BoxIcon } from "@/lib/icons"
import { Badge, Button, Input, IconPlaceholder } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { useModalLayer } from "@/lib/modal-stack"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency } from "@/lib/utils/formatters"

const Div = (props: any) => React.createElement("div", props)
const Header = (props: any) => React.createElement("header", props)
const Footer = (props: any) => React.createElement("footer", props)
const H2 = (props: any) => React.createElement("h2", props)
const Span = (props: any) => React.createElement("span", props)
const P = (props: any) => React.createElement("p", props)
const Img = (props: any) => React.createElement("img", props)
import type { ScopeItem } from "@/lib/types/coupon"

const PLACEHOLDER_IMAGE = "https://Img.dudit.com.br/static/Placeholder.png"

interface SelectCouponServicesSheetProps {
  isOpen: boolean
  onClose: () => void
  services: ScopeItem[]
  selectedIds: string[]
  onSave: (ids: string[]) => void
  isLoading?: boolean
}

function ServiceRowSkeleton() {
  return (
    <Div className="flex animate-pulse items-center gap-4 border-b border-brand-border p-3.5 last:border-0 dark:border-dark-border">
      <Div className="h-12 w-12 shrink-0 rounded-full bg-gray-100 dark:bg-dark-border" />
      <Div className="min-w-0 flex-1 space-y-2">
        <Div className="h-4 w-2/3 rounded bg-gray-100 dark:bg-dark-border" />
        <Div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-dark-border" />
      </Div>
    </Div>
  )
}

export default function SelectCouponServicesSheet({
  isOpen,
  onClose,
  services,
  selectedIds,
  onSave,
  isLoading = false,
}: SelectCouponServicesSheetProps) {
  const [search, setSearch] = useState("")
  const [tempSelected, setTempSelected] = useState<Set<string>>(new Set())
  const isMobile = useMediaQuery("(max-width: 1023px)")

  // z-index dinâmico: esta sheet abre acima de tudo que já estava aberto.
  const zIndex = useModalLayer(isOpen)

  useEffect(() => {
    if (isOpen) {
      setTempSelected(new Set(selectedIds))
      setSearch("")
    }
  }, [isOpen, selectedIds])

  const filteredServices = useMemo(() => {
    const term = search.trim().toLowerCase()
    const sorted = [...services].sort((a, b) => {
      const aInactive = a.isActive === false ? 1 : 0
      const bInactive = b.isActive === false ? 1 : 0
      if (aInactive !== bInactive) return aInactive - bInactive
      return a.name.localeCompare(b.name)
    })

    if (!term) return sorted

    return sorted.filter((item) => {
      return (
        item.name.toLowerCase().includes(term) ||
        String(item.category || "").toLowerCase().includes(term) ||
        String(item.sku || "").toLowerCase().includes(term)
      )
    })
  }, [services, search])

  const toggleService = (id: string) => {
    setTempSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = () => {
    onSave(Array.from(tempSelected))
    onClose()
  }

  const content = (
    <Div className="flex h-full flex-col bg-white dark:bg-dark-surface">
      <Header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <H2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Selecionar Serviços</H2>
        <Button variant="filled" onClick={onClose} size="icon" className="hidden lg:flex">
          <XIcon className="h-5 w-5" />
        </Button>
      </Header>

      <Div className="z-10 shrink-0 border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <Input
          label=""
          name="couponServiceSearch"
          placeholder="Buscar por nome, categoria ou SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
          className="mb-0"
          variant="full-rounded"
        />
      </Div>

      <Div className="custom-scrollbar flex-1 overflow-y-auto p-0">
        {isLoading ? (
          <Div className="flex flex-col">
            {Array.from({ length: 8 }).map((_, i) => (
              <ServiceRowSkeleton key={i} />
            ))}
          </Div>
        ) : filteredServices.length > 0 ? (
          <Div className="flex flex-col px-2 pb-2">
            {filteredServices.map((service) => {
              const disabled = service.isActive === false
              const isSelected = tempSelected.has(service.id)
              const imageUrl = getR2ImageUrl(service.image || null, "thumbnail") || PLACEHOLDER_IMAGE

              return (
                <Div
                  key={service.id}
                  role={disabled ? undefined : "button"}
                  tabIndex={disabled ? undefined : 0}
                  onClick={disabled ? undefined : () => toggleService(service.id)}
                  onKeyDown={
                    disabled
                      ? undefined
                      : (e: React.KeyboardEvent) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          toggleService(service.id)
                        }
                      }
                  }
                  className={`group flex items-center gap-4 border-b border-brand-border p-3.5 transition-colors last:border-0 dark:border-dark-border ${disabled
                    ? "cursor-not-allowed opacity-55"
                    : isSelected
                      ? "bg-brand-primary/5 dark:bg-brand-primary/10"
                      : "cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-border/40"
                    }`}
                >
                  <Img
                    src={imageUrl}
                    alt={service.name}
                    className={`h-12 w-12 shrink-0 rounded-full border border-brand-border dark:border-dark-border ${service.image ? "object-cover" : "object-contain"}`}
                  />
                  <Div className="min-w-0 flex-1">
                    <Div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Span className="truncate text-sm font-bold text-brand-dark dark:text-dark-heading">
                        {service.name}
                      </Span>
                      <Badge variant={service.isActive === false ? "gray" : "green"} className="whitespace-nowrap scale-90 shrink-0">
                        {service.isActive === false ? "Inativo" : "Ativo"}
                      </Badge>
                      {isSelected && (
                        <Badge variant="green" className="whitespace-nowrap scale-90 shrink-0">
                          Selecionado
                        </Badge>
                      )}
                    </Div>
                    <P className="truncate text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                      {service.price != null ? formatCurrency(service.price) : "Sem valor"}
                    </P>
                  </Div>
                  <Div className="flex shrink-0 items-center gap-2">
                    {!disabled && isSelected ? (
                      <Div className="flex h-8 w-8 items-center justify-center text-brand-green">
                        <CheckCircleIcon size={18} />
                      </Div>
                    ) : !disabled ? (
                      <Div className="flex h-8 w-8 items-center justify-center text-brand-inactive-text opacity-0 transition-opacity group-hover:opacity-100">
                        <PlusIcon size={18} />
                      </Div>
                    ) : null}
                  </Div>
                </Div>
              )
            })}
          </Div>
        ) : (
          <Div className="px-4 py-12">
            <IconPlaceholder
              icon={BoxIcon}
              title="Nenhum serviço encontrado"
              subtitle="Tente outro termo de busca."
            />
          </Div>
        )}
      </Div>

      <Footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
        <div className="flex items-center gap-4">
          <Button variant="outline" className="h-12 flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="h-12 flex-1" onClick={handleSave}>
            Salvar ({tempSelected.size})
          </Button>
        </div>
      </Footer>
    </Div>
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
      <Div
        className={`fixed inset-0 z-[80] bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        style={{ zIndex }}
        onClick={onClose}
      >
        <Div
          className={`fixed right-4 top-4 bottom-4 z-[81] w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`}
          style={{ zIndex: zIndex ? zIndex + 1 : undefined }}
          onClick={(e: { stopPropagation: () => any }) => e.stopPropagation()}
        >
          {content}
        </Div>
      </Div>
    </Portal>
  )
}
