"use client"

import { useState } from "react"
import { XIcon } from "@/lib/icons"
import { Button, Input, MoneyInput } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"

type QuickProductPayload = {
  name: string
  price: number
  stockQuantity: number
}

interface POSQuickProductSheetProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (payload: QuickProductPayload) => Promise<void> | void
  isCreating?: boolean
}

export default function POSQuickProductSheet({
  isOpen,
  onClose,
  onCreate,
  isCreating = false,
}: POSQuickProductSheetProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [name, setName] = useState("")
  const [price, setPrice] = useState(0)
  const [stockQuantity, setStockQuantity] = useState(0)

  const handleCreate = async () => {
    await onCreate({ name: name.trim(), price, stockQuantity })
  }

  const content = (
    <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
      <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Criar Produto</h2>
        <Button variant="filled" onClick={onClose} size="icon">
          <XIcon className="h-5 w-5" />
        </Button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <Input
          label="Nome do produto"
          name="quickProductName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Camiseta Básica"
        />
        <MoneyInput
          label="Preço de venda"
          value={price}
          onChange={(value: number) => setPrice(value)}
        />
        <Input
          label="Estoque"
          name="quickProductStock"
          type="number"
          min={0}
          value={stockQuantity}
          onChange={(e) => setStockQuantity(Math.max(0, Number(e.target.value || 0)))}
        />
      </div>

      <footer className="shrink-0 border-t border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={isCreating}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={handleCreate} isLoading={isCreating}>
            Criar e adicionar
          </Button>
        </div>
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
