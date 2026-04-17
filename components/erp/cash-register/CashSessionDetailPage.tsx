"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Badge, Button, DefaultModal, Input, MoneyInput } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import {
  closeCashSessionAction,
  createCashMovementAction,
  getCashSessionCloseSummaryAction,
  getCashSessionDetailsAction,
  reverseCashMovementAction,
} from "@/app/actions/erp/cash-register"
import { useNotification } from "@/hooks/use-notification"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import Dropdown from "@/components/reusable/Dropdown"
import DropdownItem from "@/components/reusable/DropdownItem"
import { ThreeDotsIcon } from "@/lib/icons"

type DetailPayload = {
  session: any
  movements: any[]
  operators: { open_name: string; close_name: string | null }
  drawer: {
    initial: number
    cashSales: number
    deposits: number
    withdrawals: number
    refunds: number
    total: number
  }
  summaryByPaymentMethod: Array<{
    paymentMethodId: string | null
    label: string
    calculated: number
    counted: number | null
    difference: number | null
  }>
  totals: {
    initial: number
    totalCashSales: number
    totalWithdrawals: number
    totalDeposits: number
    totalRefunds: number
    calculatedDrawerTotal: number
    informedDrawerTotal: number | null
    difference: number | null
  }
  adjustmentMovementCount: number
}

function formatShortDateTime(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).replace(",", " às")
  } catch {
    return iso
  }
}

function formatLongDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

export default function CashSessionDetailPage({
  partnerId,
  details: initialDetails,
}: {
  partnerId: string
  details: DetailPayload
}) {
  const { success: notifySuccess, error: notifyError } = useNotification()
  const [details, setDetails] = useState<DetailPayload>(initialDetails)
  const [tab, setTab] = useState<"geral" | "mov" | "dev">("geral")
  const session = details.session
  const isOpen = session.status === "open"

  const [closeOpen, setCloseOpen] = useState(false)
  const [closeSummary, setCloseSummary] = useState<any>(null)
  const [countedByPm, setCountedByPm] = useState<Record<string, string>>({})
  const [closingNotes, setClosingNotes] = useState("")
  const [isClosing, setIsClosing] = useState(false)

  const [movModal, setMovModal] = useState<null | "withdrawal" | "deposit">(null)
  const [movAmount, setMovAmount] = useState(0)
  const [movDesc, setMovDesc] = useState("")

  const sangriasReforcos = useMemo(
    () =>
      (details.movements || []).filter((m) => m.type === "withdrawal" || m.type === "deposit"),
    [details.movements],
  )

  const refresh = useCallback(async () => {
    const res = await getCashSessionDetailsAction(partnerId, session.id)
    if (res.success) setDetails(res.data as DetailPayload)
  }, [partnerId, session.id])

  useEffect(() => {
    setDetails(initialDetails)
  }, [initialDetails])

  useEffect(() => {
    if (!isOpen || !closeOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        document.getElementById("cash-close-submit")?.click()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, closeOpen])

  const openCloseModal = async () => {
    const sum = await getCashSessionCloseSummaryAction(partnerId, session.id)
    if (!sum.success) {
      notifyError(sum.error || "Não foi possível carregar o resumo.")
      return
    }
    setCloseSummary(sum.data)
    const init: Record<string, string> = {}
    const rows = sum.data.groupedByMethod || []
    if (rows.length === 0) {
      init.__total__ = String(Number(sum.data.expectedDrawerTotal || 0).toFixed(2))
    } else {
      for (const row of rows) {
        const key = row.paymentMethodId || "__none__"
        init[key] = String(Number(row.calculated ?? 0).toFixed(2))
      }
    }
    setCountedByPm(init)
    setCloseOpen(true)
  }

  const handleClose = async () => {
    setIsClosing(true)
    try {
      const countedByMethod = Object.entries(countedByPm).map(([key, val]) => ({
        paymentMethodId: key === "__none__" || key === "__total__" ? null : key,
        amount: Number(String(val).replace(",", ".")) || 0,
      }))
      const res = await closeCashSessionAction({
        partnerId,
        cashSessionId: session.id,
        countedByMethod,
        notes: closingNotes,
      })
      if (!res.success) {
        notifyError(res.error || "Falha ao fechar.")
        return
      }
      notifySuccess("Caixa fechado.")
      setCloseOpen(false)
      await refresh()
    } finally {
      setIsClosing(false)
    }
  }

  const handleMovement = async () => {
    if (!movModal) return
    const res = await createCashMovementAction({
      partnerId,
      cashSessionId: session.id,
      type: movModal,
      amount: movAmount,
      description: movDesc,
    })
    if (!res.success) {
      notifyError(res.error || "Falha ao registrar.")
      return
    }
    notifySuccess(movModal === "withdrawal" ? "Sangria registrada." : "Reforço registrado.")
    setMovModal(null)
    setMovAmount(0)
    setMovDesc("")
    await refresh()
  }

  const handleReverse = async (movementId: string) => {
    const res = await reverseCashMovementAction({ partnerId, movementId })
    if (!res.success) {
      notifyError(res.error || "Não foi possível estornar.")
      return
    }
    notifySuccess("Movimentação estornada.")
    await refresh()
  }

  const tabClass = (t: typeof tab) =>
    `pb-2 text-sm font-semibold border-b-2 transition-colors ${
      tab === t ? "text-brand-dark border-brand-dark" : "text-brand-inactive-text border-transparent"
    }`

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">Caixa</h1>
        <Link href="/erp/cash-register">
          <Button variant="outline">Voltar</Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-6 border-b border-brand-border">
        <button type="button" className={tabClass("geral")} onClick={() => setTab("geral")}>
          dados gerais
        </button>
        <button type="button" className={tabClass("mov")} onClick={() => setTab("mov")}>
          sangrias e reforços
          <span className="ml-1 text-xs font-normal text-brand-inactive-text">
            {String(sangriasReforcos.length).padStart(2, "0")}
          </span>
        </button>
        <button type="button" className={tabClass("dev")} onClick={() => setTab("dev")}>
          devoluções
        </button>
      </div>

      {tab === "geral" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                isOpen ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${isOpen ? "bg-emerald-600" : "bg-rose-600"}`} />
              {isOpen ? "caixa aberto" : "caixa fechado"}
            </span>
            <span className="text-sm text-brand-inactive-text">
              {isOpen
                ? `Caixa aberto em ${formatLongDateTime(session.opened_at)}`
                : session.closed_at
                  ? `Caixa fechado em ${formatLongDateTime(session.closed_at)}`
                  : ""}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
            <div>
              <p className="text-xs text-brand-inactive-text mb-1">Abertura</p>
              <p className="font-semibold text-brand-dark">{formatLongDateTime(session.opened_at)}</p>
            </div>
            <div>
              <p className="text-xs text-brand-inactive-text mb-1">Operador de abertura</p>
              <p className="font-semibold text-brand-dark">{details.operators.open_name}</p>
            </div>
            <div>
              <p className="text-xs text-brand-inactive-text mb-1">Troco inicial</p>
              <p className="font-semibold text-brand-dark">{formatCurrency(details.totals.initial)}</p>
            </div>

            {!isOpen && (
              <>
                <div>
                  <p className="text-xs text-brand-inactive-text mb-1">Operador de fechamento</p>
                  <p className="font-semibold text-brand-dark">{details.operators.close_name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-brand-inactive-text mb-1">Valor informado (contagem)</p>
                  <p className="font-semibold text-brand-dark">
                    {details.totals.informedDrawerTotal != null
                      ? formatCurrency(details.totals.informedDrawerTotal)
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-brand-inactive-text mb-1">Diferença do caixa</p>
                  <p className="font-semibold text-brand-dark">
                    {details.totals.difference != null ? formatCurrency(details.totals.difference) : "—"}
                  </p>
                </div>
              </>
            )}

            <div>
              <p className="text-xs text-brand-inactive-text mb-1">Vendas (dinheiro no caixa)</p>
              <p className="font-semibold text-brand-dark">{formatCurrency(details.totals.totalCashSales)}</p>
            </div>
            <div>
              <p className="text-xs text-brand-inactive-text mb-1">Sangrias</p>
              <p className="font-semibold text-brand-dark">{formatCurrency(details.totals.totalWithdrawals)}</p>
            </div>
            <div>
              <p className="text-xs text-brand-inactive-text mb-1">Reforços</p>
              <p className="font-semibold text-brand-dark">{formatCurrency(details.totals.totalDeposits)}</p>
            </div>

            <div>
              <p className="text-xs text-brand-inactive-text mb-1">Saldo calculado (gaveta)</p>
              <p className="font-semibold text-brand-dark">{formatCurrency(details.totals.calculatedDrawerTotal)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <button
              type="button"
              className="text-brand-primary font-medium hover:underline"
              onClick={() => notifyError("Reimpressão em breve.")}
            >
              {isOpen ? "reimprimir cupom de abertura" : "reimprimir cupom de fechamento"}
            </button>
            <Link href="/erp/transactions" className="text-brand-primary font-medium hover:underline">
              ver relatório de movimentação do caixa
            </Link>
          </div>

          <div>
            <h2 className="text-sm font-bold text-brand-dark mb-2">Resumo por forma de recebimento</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Forma de recebimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  {!isOpen && <TableHead className="text-right">Valor informado</TableHead>}
                  {!isOpen && <TableHead className="text-right">Diferença</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(details.summaryByPaymentMethod || []).map((row) => (
                  <TableRow key={row.paymentMethodId || row.label}>
                    <TableCell>{row.label}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(row.calculated)}</TableCell>
                    {!isOpen && (
                      <TableCell className="text-right">
                        {row.counted != null ? formatCurrency(row.counted) : "—"}
                      </TableCell>
                    )}
                    {!isOpen && (
                      <TableCell className="text-right">
                        {row.difference != null ? formatCurrency(row.difference) : "—"}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {(details.summaryByPaymentMethod || []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isOpen ? 2 : 4} className="text-brand-inactive-text text-sm">
                      Sem vendas em dinheiro nesta sessão.
                    </TableCell>
                  </TableRow>
                )}
                <TableRow>
                  <TableCell className="font-bold">Total</TableCell>
                  <TableCell className="text-right font-bold">
                    {formatCurrency(
                      (details.summaryByPaymentMethod || []).reduce((a, r) => a + r.calculated, 0),
                    )}
                  </TableCell>
                  {!isOpen && (
                    <TableCell className="text-right font-bold">
                      {(details.summaryByPaymentMethod || []).some((r) => r.counted != null)
                        ? formatCurrency(
                            (details.summaryByPaymentMethod || []).reduce(
                              (a, r) => a + (r.counted != null ? r.counted : 0),
                              0,
                            ),
                          )
                        : "—"}
                    </TableCell>
                  )}
                  {!isOpen && (
                    <TableCell className="text-right font-bold">
                      {(details.summaryByPaymentMethod || []).some((r) => r.difference != null)
                        ? formatCurrency(
                            (details.summaryByPaymentMethod || []).reduce(
                              (a, r) => a + (r.difference != null ? r.difference : 0),
                              0,
                            ),
                          )
                        : "—"}
                    </TableCell>
                  )}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {tab === "mov" && (
        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Observação</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sangriasReforcos.map((m) => {
                const reversed = !!m.reversed_at
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      {!reversed && isOpen && (m.type === "withdrawal" || m.type === "deposit") ? (
                        <Dropdown
                          trigger={
                            <button
                              type="button"
                              className="p-1 rounded-md border border-brand-border text-brand-dark"
                              aria-label="Ações"
                            >
                              <ThreeDotsIcon size={16} />
                            </button>
                          }
                          showChevron={false}
                          width="w-44"
                        >
                          <DropdownItem onClick={() => handleReverse(m.id)}>Estornar (cancelar)</DropdownItem>
                        </Dropdown>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.type === "deposit" ? "green" : "red"}>
                        {m.type === "deposit" ? "reforço" : "sangria"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                        <span className={`h-2 w-2 rounded-full ${reversed ? "bg-gray-400" : "bg-emerald-600"}`} />
                        {reversed ? "estornado" : "lançado"}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{formatShortDateTime(m.created_at)}</TableCell>
                    <TableCell className="text-sm max-w-[140px] truncate">{m.creator_name || "—"}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{m.description}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(Number(m.amount || 0))}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          {sangriasReforcos.length === 0 && (
            <p className="text-sm text-brand-inactive-text">Nenhuma sangria ou reforço registrado.</p>
          )}

          {isOpen && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setMovModal("withdrawal")}>
                + lançar nova sangria
              </Button>
              <Button variant="outline" onClick={() => setMovModal("deposit")}>
                + lançar novo reforço
              </Button>
            </div>
          )}
        </div>
      )}

      {tab === "dev" && (
        <p className="text-sm text-brand-inactive-text">Módulo de devoluções será integrado em seguida.</p>
      )}

      {isOpen && (
        <div className="fixed bottom-6 left-6 z-20">
          <Button variant="outline" className="shadow-lg flex flex-col items-start h-auto py-3 px-4" onClick={openCloseModal}>
            <span className="flex items-center gap-2 font-semibold">fechar caixa</span>
            <span className="text-[10px] text-brand-inactive-text font-normal mt-1">CTRL+ENTER</span>
          </Button>
        </div>
      )}

      <DefaultModal isOpen={closeOpen} onClose={() => setCloseOpen(false)} title="Fechar caixa">
        <div className="space-y-4">
          {closeSummary && (
            <div className="rounded-lg border border-brand-border p-3 text-sm">
              <p className="text-brand-inactive-text">Saldo calculado (gaveta)</p>
              <p className="text-xl font-bold">{formatCurrency(Number(closeSummary.expectedDrawerTotal || 0))}</p>
            </div>
          )}
          {(closeSummary?.groupedByMethod || []).length === 0 ? (
            <MoneyInput
              label="Valor contado na gaveta (total)"
              value={Number(countedByPm.__total__ ?? closeSummary?.expectedDrawerTotal ?? 0)}
              onChange={(v) => setCountedByPm((prev) => ({ ...prev, __total__: String(v) }))}
            />
          ) : (
            (closeSummary?.groupedByMethod || []).map((row: any) => {
              const key = row.paymentMethodId || "__none__"
              return (
                <MoneyInput
                  key={key}
                  label={`Contado — ${row.label}`}
                  value={Number(countedByPm[key] ?? row.calculated ?? 0)}
                  onChange={(v) => setCountedByPm((prev) => ({ ...prev, [key]: String(v) }))}
                />
              )
            })
          )}
          <Input label="Observações" value={closingNotes} onChange={(e: any) => setClosingNotes(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCloseOpen(false)}>
              Cancelar
            </Button>
            <Button id="cash-close-submit" onClick={handleClose} isLoading={isClosing}>
              Confirmar fechamento
            </Button>
          </div>
        </div>
      </DefaultModal>

      <DefaultModal
        isOpen={movModal !== null}
        onClose={() => setMovModal(null)}
        title={movModal === "withdrawal" ? "Registrar sangria" : "Registrar reforço"}
      >
        <div className="space-y-3">
          <MoneyInput label="Valor" value={movAmount} onChange={setMovAmount} />
          <Input label="Descrição" value={movDesc} onChange={(e: any) => setMovDesc(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMovModal(null)}>
              Cancelar
            </Button>
            <Button onClick={handleMovement}>Salvar</Button>
          </div>
        </div>
      </DefaultModal>
    </div>
  )
}
