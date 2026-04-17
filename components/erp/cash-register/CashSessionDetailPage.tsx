"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Badge, Button, DefaultModal, InfoCard, Input, ListItem, MoneyInput, Tabs, TabsContent, TabsList, TabsTrigger, ThreeDotsLoader } from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency } from "@/lib/utils"
import { closeCashSessionAction, createCashMovementAction, getCashSessionCloseSummaryAction, getCashSessionDetailsAction, reverseCashMovementAction } from "@/app/actions/erp/cash-register"
import { useNotification } from "@/hooks/use-notification"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import Dropdown from "@/components/reusable/Dropdown"
import DropdownItem from "@/components/reusable/DropdownItem"
import { AdjustIcon, ArrowUpIcon, ChevronLeftIcon, ThreeDotsIcon } from "@/lib/icons"

type DetailPayload = {
  session: any
  movements: any[]
  operators: { open_name: string; close_name: string | null }
  drawer: { initial: number; cashSales: number; deposits: number; withdrawals: number; refunds: number; total: number }
  summaryByPaymentMethod: Array<{ paymentMethodId: string | null; label: string; calculated: number; counted: number | null; difference: number | null }>
  totals: { initial: number; totalCashSales: number; totalWithdrawals: number; totalDeposits: number; totalRefunds: number; calculatedDrawerTotal: number; informedDrawerTotal: number | null; difference: number | null }
  adjustmentMovementCount: number
}

const formatShortDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", " as")
  } catch { return iso }
}

const formatLongDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
  } catch { return iso }
}

const getDifferenceTone = (value: number | null) => value == null ? "text-brand-dark dark:text-dark-heading" : value > 0 ? "text-brand-green" : value < 0 ? "text-brand-red" : "text-brand-dark dark:text-dark-heading"

export default function CashSessionDetailPage({ partnerId, details: initialDetails, isLoading, onBack }: { partnerId: string; details: DetailPayload | null; isLoading?: boolean; onBack?: () => void }) {
  const { success: notifySuccess, error: notifyError } = useNotification()
  const [details, setDetails] = useState<DetailPayload | null>(initialDetails)
  const [activeTab, setActiveTab] = useState<"summary" | "movements" | "returns">("summary")
  const session = details?.session
  const isOpen = session?.status === "open"
  const [isScrolled, setIsScrolled] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [closeOpen, setCloseOpen] = useState(false)
  const [closeSummary, setCloseSummary] = useState<any>(null)
  const [countedByPm, setCountedByPm] = useState<Record<string, string>>({})
  const [closingNotes, setClosingNotes] = useState("")
  const [isClosing, setIsClosing] = useState(false)
  const [movModal, setMovModal] = useState<null | "withdrawal" | "deposit">(null)
  const [movAmount, setMovAmount] = useState(0)
  const [movDesc, setMovDesc] = useState("")

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
  }, [])

  const sangriasReforcos = useMemo(() => (details?.movements || []).filter((m) => m.type === "withdrawal" || m.type === "deposit"), [details])
  const paymentMethodTotal = useMemo(() => (details?.summaryByPaymentMethod || []).reduce((acc, row) => acc + Number(row.calculated || 0), 0), [details])
  const countedTotal = useMemo(() => {
    if (!details) return null
    const rows = details.summaryByPaymentMethod || []
    if (!rows.some((row) => row.counted != null)) return null
    return rows.reduce((acc, row) => acc + Number(row.counted || 0), 0)
  }, [details])
  const differenceTotal = useMemo(() => {
    if (!details) return null
    const rows = details.summaryByPaymentMethod || []
    if (!rows.some((row) => row.difference != null)) return null
    return rows.reduce((acc, row) => acc + Number(row.difference || 0), 0)
  }, [details])

  const refresh = useCallback(async () => {
    if (!session?.id) return
    const res = await getCashSessionDetailsAction(partnerId, session.id)
    if (res.success) setDetails(res.data as DetailPayload)
  }, [partnerId, session?.id])

  useEffect(() => setDetails(initialDetails), [initialDetails])

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

  if (isLoading || !details || !session) return <div className="h-full flex items-center justify-center bg-white dark:bg-dark-surface min-h-[400px]"><ThreeDotsLoader /></div>

  const openCloseModal = async () => {
    const sum = await getCashSessionCloseSummaryAction(partnerId, session.id)
    if (!sum.success) return notifyError(sum.error || "Nao foi possivel carregar o resumo.")
    setCloseSummary(sum.data)
    const init: Record<string, string> = {}
    const rows = sum.data.groupedByMethod || []
    if (rows.length === 0) init.__total__ = String(Number(sum.data.expectedDrawerTotal || 0).toFixed(2))
    else for (const row of rows) init[row.paymentMethodId || "__none__"] = String(Number(row.calculated ?? 0).toFixed(2))
    setCountedByPm(init)
    setCloseOpen(true)
  }

  const handleClose = async () => {
    setIsClosing(true)
    try {
      const countedByMethod = Object.entries(countedByPm).map(([key, val]) => ({ paymentMethodId: key === "__none__" || key === "__total__" ? null : key, amount: Number(String(val).replace(",", ".")) || 0 }))
      const res = await closeCashSessionAction({ partnerId, cashSessionId: session.id, countedByMethod, notes: closingNotes })
      if (!res.success) return notifyError(res.error || "Falha ao fechar.")
      notifySuccess("Caixa fechado.")
      setCloseOpen(false)
      await refresh()
    } finally { setIsClosing(false) }
  }

  const handleMovement = async () => {
    if (!movModal) return
    const res = await createCashMovementAction({ partnerId, cashSessionId: session.id, type: movModal, amount: movAmount, description: movDesc })
    if (!res.success) return notifyError(res.error || "Falha ao registrar.")
    notifySuccess(movModal === "withdrawal" ? "Sangria registrada." : "Reforco registrado.")
    setMovModal(null); setMovAmount(0); setMovDesc(""); await refresh()
  }

  const handleReverse = async (movementId: string) => {
    const res = await reverseCashMovementAction({ partnerId, movementId })
    if (!res.success) return notifyError(res.error || "Nao foi possivel estornar.")
    notifySuccess("Movimentacao estornada.")
    await refresh()
  }

  return (
    <FadeIn>
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="flex flex-col h-screen bg-white dark:bg-dark-background overflow-hidden relative">
        <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-10 custom-scrollbar">
          <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
              {onBack && <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}><Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center"><ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" /></Button></div>}
              <div className="hidden md:flex items-start justify-between">
                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                  <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}><span className="truncate">Caixa {session.id.slice(0, 8).toUpperCase()}</span><Badge variant={isOpen ? "green" : "gray"}>{isOpen ? "Aberto" : "Fechado"}</Badge></h1>
                  <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>Aberto em {formatLongDateTime(session.opened_at)} - {details.operators.open_name}</div>
                </div>
                <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">{isOpen && <Button variant="outline" onClick={() => setMovModal("withdrawal")}>Nova sangria</Button>}{isOpen && <Button variant="outline" onClick={() => setMovModal("deposit")}>Novo reforco</Button>}{isOpen && <Button onClick={openCloseModal} className="whitespace-nowrap">Fechar caixa</Button>}</div>
              </div>
              <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"} pt-4 md:pt-0 flex items-center`}>
                {onBack && <div className="md:hidden mr-4"><button onClick={onBack} className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-50 dark:bg-dark-border text-brand-dark dark:text-dark-heading border border-gray-200 dark:border-dark-border"><ChevronLeftIcon className="w-4 h-4" /></button></div>}
                <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                  <TabsTrigger value="summary">Resumo</TabsTrigger>
                  <TabsTrigger value="movements" badge={<span className="text-xs text-brand-inactive-text">{String(sangriasReforcos.length).padStart(2, "0")}</span>}>Sangrias e reforcos</TabsTrigger>
                  <TabsTrigger value="returns">Devolucoes</TabsTrigger>
                </TabsList>
              </div>
            </div>
          </div>
          <div className="max-w-[1300px] mx-auto p-4 md:p-6 pt-6">
            <TabsContent value="summary" className="mt-0">
              <div className="grid grid-cols-12 gap-y-8 md:gap-y-0 relative">
                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                  <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden mb-8">
                    <div className="bg-brand-gray dark:bg-dark-border/50 p-6 border-b border-brand-border dark:border-dark-border">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Operador da abertura:</span>
                          <div className="flex items-center gap-1.5 font-bold text-brand-dark dark:text-dark-heading text-sm">{details.operators.open_name}</div>
                        </div>
                        <div className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Status atual: <strong className="text-brand-dark dark:text-dark-heading">{isOpen ? "Caixa aberto" : "Caixa fechado"}</strong></div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-gray-200 dark:divide-dark-border bg-white dark:bg-dark-surface">
                      <div className="p-6 flex flex-col justify-center"><span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mb-1.5">Troco inicial</span><div className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(details.totals.initial)}</div></div>
                      <div className="p-6 flex flex-col justify-center"><span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mb-1.5">Vendas em dinheiro</span><div className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(details.totals.totalCashSales)}</div></div>
                      <div className="p-6 flex flex-col justify-center"><span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mb-1.5">Sangrias</span><div className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(details.totals.totalWithdrawals)}</div></div>
                      <div className="p-6 flex flex-col justify-center"><span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mb-1.5">Reforcos</span><div className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(details.totals.totalDeposits)}</div></div>
                    </div>
                  </div>

                  <div className="mt-8">
                    <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Resumo por forma de recebimento</h3>
                    <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-brand-gray dark:bg-dark-border/50">
                            <TableHead>Forma de recebimento</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                            {!isOpen && <TableHead className="text-right">Valor informado</TableHead>}
                            {!isOpen && <TableHead className="text-right">Diferenca</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(details.summaryByPaymentMethod || []).map((row) => (
                            <TableRow key={row.paymentMethodId || row.label}>
                              <TableCell className="font-medium text-brand-dark dark:text-dark-heading">{row.label}</TableCell>
                              <TableCell className="text-right font-semibold">{formatCurrency(row.calculated)}</TableCell>
                              {!isOpen && <TableCell className="text-right">{row.counted != null ? formatCurrency(row.counted) : "-"}</TableCell>}
                              {!isOpen && <TableCell className={`text-right font-semibold ${getDifferenceTone(row.difference)}`}>{row.difference != null ? formatCurrency(row.difference) : "-"}</TableCell>}
                            </TableRow>
                          ))}
                          {(details.summaryByPaymentMethod || []).length === 0 && <TableRow><TableCell colSpan={isOpen ? 2 : 4} className="text-brand-inactive-text text-sm py-8">Sem vendas em dinheiro nesta sessao.</TableCell></TableRow>}
                          <TableRow>
                            <TableCell className="font-bold">Total</TableCell>
                            <TableCell className="text-right font-bold">{formatCurrency(paymentMethodTotal)}</TableCell>
                            {!isOpen && <TableCell className="text-right font-bold">{countedTotal != null ? formatCurrency(countedTotal) : "-"}</TableCell>}
                            {!isOpen && <TableCell className={`text-right font-bold ${getDifferenceTone(differenceTotal)}`}>{differenceTotal != null ? formatCurrency(differenceTotal) : "-"}</TableCell>}
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>

                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-10 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">
                  <InfoCard title={isOpen ? "Caixa em operacao" : "Caixa encerrado"} message={isOpen ? `Sessao aberta em ${formatLongDateTime(session.opened_at)} por ${details.operators.open_name}.` : `Sessao encerrada em ${session.closed_at ? formatLongDateTime(session.closed_at) : "-"} por ${details.operators.close_name || "Nao informado"}.`} color={isOpen ? "green" : "orange"} />
                  {!isOpen && details.totals.difference != null && <InfoCard title="Conferencia do fechamento" message={`Valor informado: ${details.totals.informedDrawerTotal != null ? formatCurrency(details.totals.informedDrawerTotal) : "-"}\nDiferenca final: ${formatCurrency(details.totals.difference)}`} color={details.totals.difference === 0 ? "green" : "orange"} />}
                  <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden">
                    <div className="p-5 border-b border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border/30"><h3 className="font-bold text-brand-dark dark:text-dark-heading">Dados da sessao</h3></div>
                    <div className="p-5 space-y-4 bg-white dark:bg-dark-surface">
                      <div className="flex justify-between items-start gap-4 text-[14px]"><span className="text-brand-inactive-text dark:text-dark-body font-medium">Abertura</span><span className="text-right font-bold text-brand-dark dark:text-dark-heading">{formatLongDateTime(session.opened_at)}</span></div>
                      {!isOpen && <div className="flex justify-between items-start gap-4 text-[14px]"><span className="text-brand-inactive-text dark:text-dark-body font-medium">Fechamento</span><span className="text-right font-bold text-brand-dark dark:text-dark-heading">{session.closed_at ? formatLongDateTime(session.closed_at) : "-"}</span></div>}
                      <div className="flex justify-between items-start gap-4 text-[14px]"><span className="text-brand-inactive-text dark:text-dark-body font-medium">Saldo calculado</span><span className="text-right font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(details.totals.calculatedDrawerTotal)}</span></div>
                      <div className="flex justify-between items-start gap-4 text-[14px]"><span className="text-brand-inactive-text dark:text-dark-body font-medium">Devolucoes</span><span className="text-right font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(details.totals.totalRefunds)}</span></div>
                      <div className="pt-3 border-t border-brand-border dark:border-dark-border space-y-3">
                        <button type="button" className="text-left text-sm font-semibold text-brand-dark dark:text-dark-heading hover:underline" onClick={() => notifyError("Reimpressao em breve.")}>{isOpen ? "Reimprimir cupom de abertura" : "Reimprimir cupom de fechamento"}</button>
                        <Link href="/erp/transactions" className="block text-sm font-semibold text-brand-dark dark:text-dark-heading hover:underline">Ver relatorio de movimentacao do caixa</Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="movements" className="mt-0">
              <div className="grid grid-cols-12 gap-y-8 md:gap-y-0 relative">
                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                  <div className="space-y-3">
                    {sangriasReforcos.map((m) => {
                      const reversed = !!m.reversed_at
                      const isDeposit = m.type === "deposit"
                      return <ListItem key={m.id} icon={isDeposit ? ArrowUpIcon : AdjustIcon} title={isDeposit ? "Reforco no caixa" : "Sangria do caixa"} description={`${formatShortDateTime(m.created_at)} - ${m.creator_name || "Sem responsavel"}${m.description ? ` - ${m.description}` : ""}`} className="px-4 py-4 gap-4" titleClassName="text-[15px]" descriptionClassName="text-[13px]" right={<div className="flex items-center gap-3 ml-3 shrink-0"><div className="hidden sm:flex flex-col items-end"><Badge variant={reversed ? "gray" : isDeposit ? "green" : "red"}>{reversed ? "Estornado" : isDeposit ? "Reforco" : "Sangria"}</Badge><span className={`mt-2 text-sm font-bold ${isDeposit ? "text-brand-green" : "text-brand-dark dark:text-dark-heading"}`}>{formatCurrency(Number(m.amount || 0))}</span></div>{isOpen && !reversed ? <Dropdown trigger={<button type="button" className="p-2 rounded-full border border-brand-border dark:border-dark-border text-brand-dark dark:text-dark-heading" aria-label="Acoes"><ThreeDotsIcon size={16} /></button>} showChevron={false} width="w-44"><DropdownItem onClick={() => handleReverse(m.id)}>Estornar</DropdownItem></Dropdown> : <div className="hidden sm:flex items-center justify-center w-10" />}</div>} />
                    })}
                  </div>
                  {sangriasReforcos.length === 0 && <div className="border border-dashed border-brand-border dark:border-dark-border rounded-2xl p-8 text-sm text-brand-inactive-text dark:text-dark-body">Nenhuma sangria ou reforco registrado nesta sessao.</div>}
                </div>
                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-10 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">
                  <InfoCard title="Movimentacoes de ajuste" message={`${String(sangriasReforcos.length).padStart(2, "0")} registro(s) de sangria e reforco nesta sessao.`} color="orange" />
                  <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden">
                    <div className="p-5 border-b border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border/30"><h3 className="font-bold text-brand-dark dark:text-dark-heading">Conferencia rapida</h3></div>
                    <div className="p-5 space-y-4 bg-white dark:bg-dark-surface">
                      <div className="flex justify-between items-start gap-4 text-[14px]"><span className="text-brand-inactive-text dark:text-dark-body font-medium">Total em sangrias</span><span className="text-right font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(details.totals.totalWithdrawals)}</span></div>
                      <div className="flex justify-between items-start gap-4 text-[14px]"><span className="text-brand-inactive-text dark:text-dark-body font-medium">Total em reforcos</span><span className="text-right font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(details.totals.totalDeposits)}</span></div>
                      <div className="flex justify-between items-start gap-4 text-[14px]"><span className="text-brand-inactive-text dark:text-dark-body font-medium">Saldo calculado</span><span className="text-right font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(details.totals.calculatedDrawerTotal)}</span></div>
                    </div>
                  </div>
                  {isOpen && <div className="flex flex-col gap-3"><Button variant="outline" onClick={() => setMovModal("withdrawal")}>Lancar nova sangria</Button><Button variant="outline" onClick={() => setMovModal("deposit")}>Lancar novo reforco</Button></div>}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="returns" className="mt-0">
              <div className="grid grid-cols-12 gap-y-8 md:gap-y-0 relative">
                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                  <div className="border border-dashed border-brand-border dark:border-dark-border rounded-2xl p-8 text-sm text-brand-inactive-text dark:text-dark-body">Modulo de devolucoes sera integrado em seguida.</div>
                </div>
                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-10 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">
                  <InfoCard title="Devolucoes" message="A estrutura visual desta aba ja foi alinhada com as outras paginas de detalhes. Falta apenas conectar o modulo." color="orange" />
                </div>
              </div>
            </TabsContent>
          </div>
        </div>

        {isOpen && <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3"><Button variant="outline" className="flex-1" onClick={() => setMovModal("withdrawal")}>Sangria</Button><Button variant="outline" className="flex-1" onClick={() => setMovModal("deposit")}>Reforco</Button><Button className="flex-1" onClick={openCloseModal}>Fechar</Button></div>}

        <DefaultModal isOpen={closeOpen} onClose={() => setCloseOpen(false)} title="Fechar caixa">
          <div className="space-y-4">
            {closeSummary && <div className="rounded-xl border border-brand-border dark:border-dark-border p-4 text-sm"><p className="text-brand-inactive-text dark:text-dark-body">Saldo calculado (gaveta)</p><p className="text-xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(Number(closeSummary.expectedDrawerTotal || 0))}</p></div>}
            {(closeSummary?.groupedByMethod || []).length === 0 ? <MoneyInput label="Valor contado na gaveta (total)" value={Number(countedByPm.__total__ ?? closeSummary?.expectedDrawerTotal ?? 0)} onChange={(v) => setCountedByPm((prev) => ({ ...prev, __total__: String(v) }))} /> : (closeSummary?.groupedByMethod || []).map((row: any) => {
              const key = row.paymentMethodId || "__none__"
              return <MoneyInput key={key} label={`Contado - ${row.label}`} value={Number(countedByPm[key] ?? row.calculated ?? 0)} onChange={(v) => setCountedByPm((prev) => ({ ...prev, [key]: String(v) }))} />
            })}
            <Input label="Observacoes" value={closingNotes} onChange={(e: any) => setClosingNotes(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCloseOpen(false)}>Cancelar</Button>
              <Button id="cash-close-submit" onClick={handleClose} isLoading={isClosing}>Confirmar fechamento</Button>
            </div>
          </div>
        </DefaultModal>

        <DefaultModal isOpen={movModal !== null} onClose={() => setMovModal(null)} title={movModal === "withdrawal" ? "Registrar sangria" : "Registrar reforco"}>
          <div className="space-y-3">
            <MoneyInput label="Valor" value={movAmount} onChange={setMovAmount} />
            <Input label="Descricao" value={movDesc} onChange={(e: any) => setMovDesc(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMovModal(null)}>Cancelar</Button>
              <Button onClick={handleMovement}>Salvar</Button>
            </div>
          </div>
        </DefaultModal>
      </Tabs>
    </FadeIn>
  )
}
