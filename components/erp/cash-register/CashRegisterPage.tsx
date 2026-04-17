"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Badge, Button, DefaultModal, Input, MoneyInput, Pagination } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import {
  closeCashSessionAction,
  createCashMovementAction,
  getCashSessionCloseSummaryAction,
  getCashSessionsHistoryAction,
  openCashSessionAction,
} from "@/app/actions/erp/cash-register"
import { useNotification } from "@/hooks/use-notification"

type SessionItem = {
  id: string
  opened_by_user_id: string
  user_name: string
  opened_at: string
  closed_at: string | null
  initial_amount: number
  closing_amount: number | null
  status: "open" | "closed"
  expected_drawer_total?: number
}

const ITEMS_PER_PAGE = 8

export default function CashRegisterPage({
  partnerId,
  initialHistory,
  initialActiveSession,
}: {
  partnerId: string
  initialHistory: SessionItem[]
  initialActiveSession: any | null
}) {
  const { success: notifySuccess, error: notifyError } = useNotification()

  const [history, setHistory] = useState<SessionItem[]>(initialHistory || [])
  const [activeSession, setActiveSession] = useState<any | null>(initialActiveSession || null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("all")
  const [page, setPage] = useState(1)

  const [openModal, setOpenModal] = useState(false)
  const [closeModal, setCloseModal] = useState(false)
  const [movementModal, setMovementModal] = useState<null | "withdrawal" | "deposit">(null)

  const [openingBalance, setOpeningBalance] = useState(0)
  const [openingNotes, setOpeningNotes] = useState("")
  const [closingNotes, setClosingNotes] = useState("")
  const [movementAmount, setMovementAmount] = useState(0)
  const [movementDescription, setMovementDescription] = useState("")
  const [closeSummary, setCloseSummary] = useState<any | null>(null)
  const [countedByPm, setCountedByPm] = useState<Record<string, string>>({})

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (history || []).filter((session) => {
      const statusMatch = statusFilter === "all" || session.status === statusFilter
      const searchMatch =
        !term ||
        session.user_name?.toLowerCase().includes(term) ||
        session.id.toLowerCase().includes(term)
      return statusMatch && searchMatch
    })
  }, [history, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  const refreshHistory = async () => {
    const result = await getCashSessionsHistoryAction(partnerId)
    if (result.success) setHistory(result.data as SessionItem[])
  }

  const handleOpenSession = async () => {
    if (openingBalance < 0) {
      notifyError("Saldo inicial inválido.")
      return
    }
    const result = await openCashSessionAction({
      partnerId,
      initialAmount: openingBalance,
      notes: openingNotes,
    })
    if (!result.success) {
      notifyError(result.error || "Não foi possível abrir o caixa.")
      return
    }
    notifySuccess("Caixa aberto com sucesso.")
    setActiveSession(result.data)
    setOpenModal(false)
    setOpeningBalance(0)
    setOpeningNotes("")
    await refreshHistory()
  }

  const openCloseModal = async () => {
    if (!activeSession?.id) {
      notifyError("Nenhum caixa aberto.")
      return
    }
    const summary = await getCashSessionCloseSummaryAction(partnerId, activeSession.id)
    if (!summary.success) {
      notifyError(summary.error || "Não foi possível carregar o resumo de fechamento.")
      return
    }
    const rows = summary.data.groupedByMethod || []
    const init: Record<string, string> = {}
    if (rows.length === 0) {
      init.__total__ = String(Number(summary.data.expectedDrawerTotal || 0).toFixed(2))
    } else {
      for (const row of rows) {
        const key = row.paymentMethodId || "__none__"
        init[key] = String(Number(row.calculated ?? row.total ?? 0).toFixed(2))
      }
    }
    setCountedByPm(init)
    setCloseSummary(summary.data)
    setCloseModal(true)
  }

  const handleCloseSession = async () => {
    if (!activeSession?.id) return
    const countedByMethod = Object.entries(countedByPm).map(([key, val]) => ({
      paymentMethodId: key === "__none__" || key === "__total__" ? null : key,
      amount: Number(String(val).replace(",", ".")) || 0,
    }))
    const result = await closeCashSessionAction({
      partnerId,
      cashSessionId: activeSession.id,
      notes: closingNotes,
      countedByMethod,
    })
    if (!result.success) {
      notifyError(result.error || "Não foi possível fechar o caixa.")
      return
    }
    notifySuccess("Caixa fechado com sucesso.")
    setActiveSession(null)
    setCloseModal(false)
    setCloseSummary(null)
    setCountedByPm({})
    setClosingNotes("")
    await refreshHistory()
  }

  const handleMovement = async () => {
    if (!movementModal) return
    if (movementAmount <= 0) {
      notifyError("Informe um valor válido.")
      return
    }
    if (!movementDescription.trim()) {
      notifyError("Informe a descrição.")
      return
    }
    const result = await createCashMovementAction({
      partnerId,
      cashSessionId: activeSession?.id,
      type: movementModal,
      amount: movementAmount,
      description: movementDescription,
    })
    if (!result.success) {
      notifyError(result.error || "Não foi possível registrar a movimentação.")
      return
    }
    notifySuccess(movementModal === "withdrawal" ? "Sangria registrada." : "Reforço registrado.")
    setMovementModal(null)
    setMovementAmount(0)
    setMovementDescription("")
    await refreshHistory()
  }

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="rounded-2xl border border-brand-border p-4 bg-white">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-brand-dark">Controle de Caixa</h1>
            <p className="text-sm text-brand-inactive-text">Abertura, fechamento e auditoria de sessões do PDV.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!activeSession?.id ? (
              <Button onClick={() => setOpenModal(true)}>Abrir Caixa</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setMovementModal("withdrawal")}>Sangria</Button>
                <Button variant="outline" onClick={() => setMovementModal("deposit")}>Reforço</Button>
                <Button onClick={openCloseModal}>Fechar Caixa</Button>
              </>
            )}
          </div>
        </div>
        {activeSession?.id && (
          <div className="mt-3 rounded-xl border border-brand-border p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-brand-inactive-text">Caixa aberto</p>
              <p className="font-semibold">Aberto em {new Date(activeSession.opened_at).toLocaleString("pt-BR")}</p>
            </div>
            <Badge variant="green">Aberto</Badge>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-brand-border p-4 bg-white flex flex-col md:flex-row gap-3">
        <Input label="" placeholder="Buscar por operador ou sessão..." value={search} onChange={(e: any) => setSearch(e.target.value)} className="mb-0" />
        <div className="flex gap-2">
          <Button variant={statusFilter === "all" ? "filled" : "outline"} onClick={() => setStatusFilter("all")}>Todos</Button>
          <Button variant={statusFilter === "open" ? "filled" : "outline"} onClick={() => setStatusFilter("open")}>Abertos</Button>
          <Button variant={statusFilter === "closed" ? "filled" : "outline"} onClick={() => setStatusFilter("closed")}>Fechados</Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto rounded-2xl border border-brand-border bg-white p-3 space-y-3">
        {paginated.map((session) => (
          <div key={session.id} className="rounded-xl border border-brand-border p-3">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <p className="font-bold text-brand-dark">Sessão {session.id.slice(0, 8).toUpperCase()}</p>
                <p className="text-sm text-brand-inactive-text">{session.user_name}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={session.status === "open" ? "green" : "gray"}>
                  {session.status === "open" ? "Aberto" : "Fechado"}
                </Badge>
                <Link href={`/erp/cash-register/${session.id}`}>
                  <Button variant="outline">Detalhes</Button>
                </Link>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-5 gap-2 text-sm">
              <span>Abertura: {new Date(session.opened_at).toLocaleString("pt-BR")}</span>
              <span>Fechamento: {session.closed_at ? new Date(session.closed_at).toLocaleString("pt-BR") : "-"}</span>
              <span>Inicial: {formatCurrency(Number(session.initial_amount || 0))}</span>
              <span>Final: {session.closing_amount != null ? formatCurrency(Number(session.closing_amount || 0)) : "-"}</span>
              <span>Saldo esperado (gaveta): {formatCurrency(Number(session.expected_drawer_total || 0))}</span>
            </div>
          </div>
        ))}
        {paginated.length === 0 && (
          <p className="text-sm text-brand-inactive-text">Nenhuma sessão encontrada.</p>
        )}
      </div>

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />

      <DefaultModal isOpen={openModal} onClose={() => setOpenModal(false)} title="Abrir caixa">
        <div className="space-y-3">
          <MoneyInput label="Troco inicial" value={openingBalance} onChange={setOpeningBalance} />
          <Input label="Observações" value={openingNotes} onChange={(e: any) => setOpeningNotes(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpenModal(false)}>Cancelar</Button>
            <Button onClick={handleOpenSession}>Confirmar abertura</Button>
          </div>
        </div>
      </DefaultModal>

      <DefaultModal isOpen={closeModal} onClose={() => setCloseModal(false)} title="Fechar caixa">
        <div className="space-y-3">
          {closeSummary && (
            <>
              <div className="rounded-lg border border-brand-border p-3">
                <p className="text-sm text-brand-inactive-text">Saldo calculado (gaveta)</p>
                <p className="text-xl font-bold">{formatCurrency(Number(closeSummary.expectedDrawerTotal || 0))}</p>
              </div>
              <div className="space-y-1">
                {(closeSummary.groupedByMethod || []).map((row: any) => (
                  <div key={row.paymentMethodId || row.label} className="flex items-center justify-between text-sm">
                    <span>{row.label} (calculado)</span>
                    <span className="font-semibold">{formatCurrency(Number(row.calculated ?? row.total ?? 0))}</span>
                  </div>
                ))}
              </div>
              {(closeSummary.groupedByMethod || []).length === 0 ? (
                <MoneyInput
                  label="Valor contado na gaveta (total)"
                  value={Number(countedByPm.__total__ ?? closeSummary.expectedDrawerTotal ?? 0)}
                  onChange={(v) => setCountedByPm((prev) => ({ ...prev, __total__: String(v) }))}
                />
              ) : (
                (closeSummary.groupedByMethod || []).map((row: any) => {
                  const key = row.paymentMethodId || "__none__"
                  return (
                    <MoneyInput
                      key={key}
                      label={`Contado — ${row.label}`}
                      value={Number(countedByPm[key] ?? row.calculated ?? row.total ?? 0)}
                      onChange={(v) => setCountedByPm((prev) => ({ ...prev, [key]: String(v) }))}
                    />
                  )
                })
              )}
            </>
          )}
          <Input label="Observações de fechamento" value={closingNotes} onChange={(e: any) => setClosingNotes(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCloseModal(false)}>Cancelar</Button>
            <Button onClick={handleCloseSession}>Confirmar fechamento</Button>
          </div>
        </div>
      </DefaultModal>

      <DefaultModal
        isOpen={movementModal !== null}
        onClose={() => setMovementModal(null)}
        title={movementModal === "withdrawal" ? "Registrar sangria" : "Registrar reforço"}
      >
        <div className="space-y-3">
          <MoneyInput label="Valor" value={movementAmount} onChange={setMovementAmount} />
          <Input label="Descrição" value={movementDescription} onChange={(e: any) => setMovementDescription(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMovementModal(null)}>Cancelar</Button>
            <Button onClick={handleMovement}>Salvar</Button>
          </div>
        </div>
      </DefaultModal>
    </div>
  )
}
