import "server-only"
import { cache } from "react"
import { createAdminClient } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/permissions/access"
import { getTodayYmdSaoPaulo } from "@/lib/utils/formatters"

type DbTransaction = {
  id: string
  description: string | null
  category: string | null
  amount: number | string | null
  original_amount: number | string | null
  fee_amount?: number | string | null
  due_date: string | null
  payment_date: string | null
  created_at: string
  status: string | null
  payment_type: string | null
  transaction_type: "income" | "expense" | "transfer" | "adjustment" | "refund" | string
  refund_kind?: "expense_refund" | "revenue_refund" | null
  reference_note?: string | null
  origin?: string | null
  account_id?: string | null
  transaction_contacts?: { name: string | null } | null
  finance_accounts?: { name: string | null } | null
}

type PaymentRow = {
  transaction_id: string
  amount: number | string | null
  base_amount?: number | string | null
  discount_amount?: number | string | null
  interest_amount?: number | string | null
}

export type FinancialOverviewPeriod = "daily" | "weekly" | "monthly"

export type FinancialOverviewData = {
  totals: {
    cash: number
    receivable: number
    payable: number
    projected7: number
    projected30: number
  }
  projection: {
    sevenDays: { inflow: number; outflow: number; net: number }
    thirtyDays: { inflow: number; outflow: number; net: number }
  }
  revenueEvolution: Record<FinancialOverviewPeriod, Array<{ label: string; gross: number; net: number }>>
  revenueDistribution: Array<{ label: string; value: number; percentage: number }>
  latestMovements: Array<{
    id: string
    description: string
    accountName: string
    value: number
    direction: "in" | "out"
    date: string
    status: string
  }>
  dueAccounts: Array<{
    id: string
    description: string
    value: number
    direction: "in" | "out"
    dueDate: string
    dueKind: "overdue" | "today" | "soon"
    daysUntilDue: number
  }>
  cashflow: Record<FinancialOverviewPeriod, Array<{ label: string; entrada: number; saida: number }>>
}


const num = (value: unknown): number => {
  if (value === null || value === undefined || value === "") return 0
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."))
  return Number.isFinite(parsed) ? parsed : 0
}

const money = (value: number): number => Math.round(value * 100) / 100

const isPaidStatus = (status: string | null | undefined) => {
  const s = String(status || "").toLowerCase()
  return ["paid", "pago", "recebido", "confirmed", "confirmado", "efetivado"].includes(s)
}

const isCancelledStatus = (status: string | null | undefined) => String(status || "").toLowerCase().includes("cancel")

const isPendingStatus = (status: string | null | undefined) => !isPaidStatus(status) && !isCancelledStatus(status)

const txDirection = (tx: DbTransaction): "in" | "out" => {
  if (tx.transaction_type === "income") return "in"
  if (tx.transaction_type === "expense") return "out"
  if (tx.transaction_type === "refund" && tx.refund_kind === "revenue_refund") return "out"
  if (tx.transaction_type === "refund" && tx.refund_kind === "expense_refund") return "in"
  return num(tx.amount) >= 0 ? "in" : "out"
}

const txDate = (tx: DbTransaction) => String(tx.payment_date || tx.due_date || tx.created_at).slice(0, 10)

const dateAfterDays = (ymd: string, days: number) => {
  const [y, m, d] = ymd.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0))
  return date.toISOString().slice(0, 10)
}

const daysBetween = (startYmd: string, endYmd: string) => {
  const [sy, sm, sd] = startYmd.split("-").map(Number)
  const [ey, em, ed] = endYmd.split("-").map(Number)
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000)
}

const formatAxisDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  })
}

const weekLabel = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 12))
  const start = new Date(date)
  start.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return formatAxisDate(start.toISOString().slice(0, 10))
}

const monthLabel = (ymd: string) => {
  const [y, m] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, 1, 12)).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
    timeZone: "America/Sao_Paulo",
  })
}

function revenueOrigin(tx: DbTransaction): string {
  const source = `${tx.category || ""} ${tx.description || ""} ${tx.reference_note || ""} ${tx.origin || ""} ${tx.payment_type || ""}`.toLowerCase()
  if (source.includes("servi")) return "Serviços"
  if (source.includes("marketplace") || source.includes("gateway")) return "Marketplace"
  if (source.includes("pdv") || source.includes("sale-tx") || source.includes("pre_sale")) return "PDV"
  if (source.includes("delivery") || source.includes("entrega") || source.includes("frete")) return "Delivery"
  if (source.includes("venda") || source.includes("produto")) return "Produtos"
  return "Outros"
}

function displayStatus(status: string | null | undefined, direction: "in" | "out", dueDate?: string | null) {
  if (isPaidStatus(status)) return direction === "in" ? "Recebido" : "Pago"
  if (isCancelledStatus(status)) return "Cancelado"
  if (dueDate && dueDate < getTodayYmdSaoPaulo()) return "Atrasado"
  return "Pendente"
}

function buildPaidByTransaction(payments: PaymentRow[]) {
  const map = new Map<string, { base: number; cash: number; discount: number }>()
  for (const row of payments) {
    const current = map.get(row.transaction_id) || { base: 0, cash: 0, discount: 0 }
    current.base += num(row.base_amount ?? row.amount)
    current.cash += num(row.amount)
    current.discount += num(row.discount_amount)
    map.set(row.transaction_id, current)
  }
  return map
}

function outstandingAmount(tx: DbTransaction, paidByTransaction: Map<string, { base: number }>) {
  const paidBase = paidByTransaction.get(tx.id)?.base || 0
  return money(Math.max(0, Math.abs(num(tx.amount)) - paidBase))
}

function buildRevenueEvolution(transactions: DbTransaction[], paidByTransaction: Map<string, { discount: number }>) {
  const paidIncome = transactions.filter((tx) => isPaidStatus(tx.status) && txDirection(tx) === "in" && tx.transaction_type === "income")
  const build = (period: FinancialOverviewPeriod) => {
    const buckets = new Map<string, { label: string; gross: number; net: number }>()
    for (const tx of paidIncome) {
      const ymd = txDate(tx)
      const key = period === "daily" ? ymd : period === "weekly" ? weekLabel(ymd) : ymd.slice(0, 7)
      const label = period === "daily" ? formatAxisDate(ymd) : period === "weekly" ? `Sem. ${weekLabel(ymd)}` : monthLabel(ymd)
      const current = buckets.get(key) || { label, gross: 0, net: 0 }
      const gross = Math.abs(num(tx.original_amount ?? tx.amount))
      const fees = Math.abs(num(tx.fee_amount))
      const discounts = paidByTransaction.get(tx.id)?.discount || 0
      current.gross += gross
      current.net += Math.max(0, Math.abs(num(tx.amount)) - fees - discounts)
      buckets.set(key, current)
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([, value]) => ({ ...value, gross: money(value.gross), net: money(value.net) }))
  }

  return {
    daily: build("daily"),
    weekly: build("weekly"),
    monthly: build("monthly"),
  }
}

function buildCashflow(transactions: DbTransaction[]) {
  const paidTxs = transactions.filter((tx) => isPaidStatus(tx.status))
  const build = (period: FinancialOverviewPeriod) => {
    const buckets = new Map<string, { label: string; entrada: number; saida: number }>()
    for (const tx of paidTxs) {
      const ymd = txDate(tx)
      const key = period === "daily" ? ymd : period === "weekly" ? weekLabel(ymd) : ymd.slice(0, 7)
      const label = period === "daily" ? formatAxisDate(ymd) : period === "weekly" ? `Sem. ${weekLabel(ymd)}` : monthLabel(ymd)
      const current = buckets.get(key) || { label, entrada: 0, saida: 0 }
      const amount = Math.abs(num(tx.amount))
      if (txDirection(tx) === "in") {
        current.entrada += amount
      } else {
        current.saida += amount
      }
      buckets.set(key, current)
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([, value]) => ({ ...value, entrada: money(value.entrada), saida: money(value.saida) }))
  }

  return {
    daily: build("daily"),
    weekly: build("weekly"),
    monthly: build("monthly"),
  }
}

export const getFinancialOverviewData = cache(async (partnerId: string): Promise<{ success: true; data: FinancialOverviewData } | { success: false; error: string }> => {
  try {
    await requirePermission(partnerId, "financial", "view")
    const supabase = createAdminClient()
    const today = getTodayYmdSaoPaulo()
    const next30 = dateAfterDays(today, 30)
    const since = dateAfterDays(today, -370)

    const accountsPromise = supabase
      .from("finance_accounts")
      .select("id, current_balance, initial_balance, is_active")
      .eq("partner_id", partnerId)
      .eq("is_active", true)

    const transactionsPromise = supabase
      .from("transactions")
      .select(`
        id, description, category, amount, original_amount, fee_amount, due_date, payment_date, created_at, status, payment_type,
        transaction_type, refund_kind, reference_note, origin, account_id,
        transaction_contacts(name),
        finance_accounts!transactions_account_id_fkey(name)
      `)
      .eq("partner_id", partnerId)
      .or(`status.eq.pending,payment_date.gte.${since},due_date.gte.${today},created_at.gte.${since}`)
      .order("created_at", { ascending: false })
      .limit(5000)

    const [accountsResult, transactionsResult] = await Promise.all([accountsPromise, transactionsPromise])
    if (accountsResult.error) throw accountsResult.error
    if (transactionsResult.error) throw transactionsResult.error

    const transactions = (transactionsResult.data || []) as unknown as DbTransaction[]
    const paymentIds = transactions.map((tx) => tx.id)
    const paymentsResult = paymentIds.length > 0
      ? await supabase
        .from("transaction_payments")
        .select("transaction_id, amount, base_amount, discount_amount, interest_amount")
        .eq("partner_id", partnerId)
        .in("transaction_id", paymentIds)
      : { data: [], error: null }
    if (paymentsResult.error) throw paymentsResult.error

    const paidByTransaction = buildPaidByTransaction((paymentsResult.data || []) as PaymentRow[])
    const cash = money((accountsResult.data || []).reduce((acc: number, account: any) => acc + num(account.current_balance ?? account.initial_balance), 0))

    let receivable = 0
    let payable = 0
    let inflow7 = 0
    let outflow7 = 0
    let inflow30 = 0
    let outflow30 = 0

    for (const tx of transactions) {
      if (!isPendingStatus(tx.status)) continue
      const direction = txDirection(tx)
      const open = outstandingAmount(tx, paidByTransaction)
      if (open <= 0) continue
      if (direction === "in") receivable += open
      if (direction === "out") payable += open

      const due = String(tx.due_date || "").slice(0, 10)
      if (!due || due < today || due > next30) continue
      if (direction === "in") inflow30 += open
      if (direction === "out") outflow30 += open
      if (daysBetween(today, due) <= 7) {
        if (direction === "in") inflow7 += open
        if (direction === "out") outflow7 += open
      }
    }

    const paidIncome = transactions.filter((tx) => isPaidStatus(tx.status) && txDirection(tx) === "in" && tx.transaction_type === "income")
    const distributionMap = new Map<string, number>()
    for (const tx of paidIncome) {
      const label = revenueOrigin(tx)
      distributionMap.set(label, (distributionMap.get(label) || 0) + Math.abs(num(tx.amount)))
    }
    const distributionTotal = Array.from(distributionMap.values()).reduce((acc, value) => acc + value, 0)
    const revenueDistribution = Array.from(distributionMap.entries())
      .map(([label, value]) => ({
        label,
        value: money(value),
        percentage: distributionTotal > 0 ? Math.round((value / distributionTotal) * 1000) / 10 : 0,
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)

    const latestMovements = transactions
      .filter((tx) => !isCancelledStatus(tx.status))
      .slice(0, 8)
      .map((tx) => {
        const direction = txDirection(tx)
        return {
          id: tx.id,
          description: tx.description || "Movimentação",
          accountName: tx.finance_accounts?.name || "Conta não informada",
          value: money(Math.abs(num(tx.amount))),
          direction,
          date: txDate(tx),
          status: displayStatus(tx.status, direction, tx.due_date),
        }
      })

    const dueAccounts = transactions
      .filter((tx) => isPendingStatus(tx.status) && tx.due_date)
      .map((tx) => {
        const dueDate = String(tx.due_date).slice(0, 10)
        const days = daysBetween(today, dueDate)
        const direction = txDirection(tx)
        return {
          id: tx.id,
          description: tx.description || "Conta",
          value: outstandingAmount(tx, paidByTransaction),
          direction,
          dueDate,
          dueKind: days < 0 ? "overdue" as const : days === 0 ? "today" as const : "soon" as const,
          daysUntilDue: days,
        }
      })
      .filter((item) => item.value > 0 && item.daysUntilDue <= 7)
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
      .slice(0, 8)

    return {
      success: true,
      data: {
        totals: {
          cash,
          receivable: money(receivable),
          payable: money(payable),
          projected7: money(inflow7 - outflow7),
          projected30: money(inflow30 - outflow30),
        },
        projection: {
          sevenDays: { inflow: money(inflow7), outflow: money(outflow7), net: money(inflow7 - outflow7) },
          thirtyDays: { inflow: money(inflow30), outflow: money(outflow30), net: money(inflow30 - outflow30) },
        },
        revenueEvolution: buildRevenueEvolution(transactions, paidByTransaction),
        revenueDistribution,
        latestMovements,
        dueAccounts,
        cashflow: buildCashflow(transactions),
      },
    }
  } catch (error: any) {
    console.error("[financial-overview] error:", error)
    return { success: false, error: error?.message || "Erro ao carregar visão geral financeira." }
  }
})
