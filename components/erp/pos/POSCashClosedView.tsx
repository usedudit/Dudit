"use client"

import { Button, DefaultModal, IconPlaceholder, Input, MoneyInput } from "@/components/reusable"

type Props = {
  isOpenCashModalOpen: boolean
  setIsOpenCashModalOpen: (open: boolean) => void
  isOpeningCash: boolean
  openingBalance: number
  setOpeningBalance: (value: number) => void
  openingNotes: string
  setOpeningNotes: (value: string) => void
  onOpenCash: () => Promise<void>
}

export default function POSCashClosedView({
  isOpenCashModalOpen,
  setIsOpenCashModalOpen,
  isOpeningCash,
  openingBalance,
  setOpeningBalance,
  openingNotes,
  setOpeningNotes,
  onOpenCash,
}: Props) {
  return (
    <div className="flex h-full items-center justify-center bg-white">
      <IconPlaceholder
        imageSrc="https://img.dudit.com.br/static/mascots/PDV.png"
        title="Abrir Caixa"
        itemButton={{
          text: "Abrir o Caixa",
          action: () => setIsOpenCashModalOpen(true),
          variant: "filled",
          className: "h-12 px-10 rounded-full font-bold text-md",
        }}
      />
      <DefaultModal
        isOpen={isOpenCashModalOpen}
        onClose={() => setIsOpenCashModalOpen(false)}
        title="Abrir caixa"
        footer={
          <div className="flex w-full items-center gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setIsOpenCashModalOpen(false)}
              disabled={isOpeningCash}
            >
              Cancelar
            </Button>
            <Button className="flex-1" onClick={onOpenCash} isLoading={isOpeningCash}>
              Confirmar abertura
            </Button>
          </div>
        }
      >
        <div className="space-y-4 pt-2">
          <MoneyInput
            label="Saldo inicial em dinheiro"
            value={openingBalance}
            onChange={setOpeningBalance}
          />
          <Input
            label="Observações"
            value={openingNotes}
            onChange={(e: any) => setOpeningNotes(e.target.value)}
          />
        </div>
      </DefaultModal>
    </div>
  )
}
