"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge, Button, DefaultModal, Input, MoneyInput } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import { formatInTz } from "@/lib/date"
import { usePartnerTimezone } from "@/lib/store-context"
import { ClockIcon } from "@/lib/icons"

type Props = {
  isOpenCashModalOpen: boolean
  setIsOpenCashModalOpen: (open: boolean) => void
  isOpeningCash: boolean
  openingBalance: number
  setOpeningBalance: (value: number) => void
  openingNotes: string
  setOpeningNotes: (value: string) => void
  onOpenCash: () => Promise<void>
  lastSession?: any | null
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
  lastSession,
}: Props) {
  const tz = usePartnerTimezone()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const timeString = useMemo(() => {
    return formatInTz(now, tz, "dd/MM/yyyy '•' HH:mm:ss")
  }, [now, tz])

  const difference = lastSession ? Number(lastSession.difference_amount || 0) : null
  const hasDifference = difference !== null && Math.abs(difference) > 0.01

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-4 py-8">
      {/* Date/Time */}
      <div className="flex items-center gap-2 text-sm text-brand-inactive-text dark:text-dark-body">
        <ClockIcon className="h-4 w-4" />
        <span>{timeString}</span>
      </div>

      {/* Mascot + Status */}
      <div className="flex flex-col items-center gap-3">
        <img
          src="https://img.dudit.com.br/static/mascots/PDV.png"
          alt="PDV"
          className="h-44 w-44 object-contain"
        />
        <Badge variant="gray">Caixa fechado</Badge>
        <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">Caixa fechado</h1>
        <p className="max-w-sm text-center text-sm text-brand-inactive-text dark:text-dark-body">
          O caixa está fechado. Abra-o para começar a registrar vendas no PDV.
        </p>
      </div>

      {/* Last Session Summary */}
      {lastSession && (
        <div className="w-full max-w-md space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-inactive-text dark:text-dark-body">
            <ClockIcon className="h-4 w-4" />
            Última sessão fechada
          </h2>
          <div className="space-y-3 rounded-xl bg-brand-gray/50 dark:bg-dark-border/30 p-4">
            <div className="flex justify-between">
              <span className="text-xs text-brand-inactive-text dark:text-dark-body">Aberto por</span>
              <span className="text-xs font-medium text-brand-dark dark:text-dark-heading">
                {lastSession.user_name || "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-brand-inactive-text dark:text-dark-body">Fechado em</span>
              <span className="text-xs font-medium text-brand-dark dark:text-dark-heading">
                {lastSession.closed_at ? formatInTz(lastSession.closed_at, tz, "dd/MM/yyyy '•' HH:mm") : "—"}
              </span>
            </div>
            <div className="my-2 border-t border-brand-border dark:border-dark-border" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase text-brand-inactive-text dark:text-dark-body">Troco inicial</p>
                <p className="mt-0.5 text-sm font-bold text-brand-dark dark:text-dark-heading">
                  {formatCurrency(Number(lastSession.initial_amount || 0))}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-brand-inactive-text dark:text-dark-body">Total vendido</p>
                <p className="mt-0.5 text-sm font-bold text-brand-primary">
                  {formatCurrency(Number(lastSession.total_received_amount || 0))}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-brand-inactive-text dark:text-dark-body">Saldo final</p>
                <p className="mt-0.5 text-sm font-bold text-brand-dark dark:text-dark-heading">
                  {formatCurrency(Number(lastSession.closing_amount || lastSession.expected_drawer_total || 0))}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-brand-inactive-text dark:text-dark-body">Diferença</p>
                <p
                  className={`mt-0.5 text-sm font-bold ${hasDifference ? "text-brand-orange" : "text-brand-green"}`}
                >
                  {formatCurrency(difference || 0)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Open Button */}
      <Button
        variant="filled"
        onClick={() => setIsOpenCashModalOpen(true)}
        className="h-12 rounded-full px-10 font-bold text-md"
      >
        Abrir o Caixa
      </Button>

      {/* Modal */}
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
