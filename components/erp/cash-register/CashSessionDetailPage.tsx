"use client"

import { useMemo } from "react"
import { Badge, Button } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import Link from "next/link"

function movementTypeLabel(type: string) {
  if (type === "sale") return "Venda"
  if (type === "refund") return "Reembolso"
  if (type === "withdrawal") return "Sangria"
  if (type === "deposit") return "Reforço"
  return type
}

function movementVariant(type: string) {
  if (type === "sale" || type === "deposit") return "green" as const
  if (type === "refund" || type === "withdrawal") return "red" as const
  return "gray" as const
}

export default function CashSessionDetailPage({ details }: { details: { session: any; movements: any[] } }) {
  const totalMovements = useMemo(
    () => (details.movements || []).reduce((acc: number, movement: any) => acc + Number(movement.amount || 0), 0),
    [details.movements]
  )

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold text-brand-dark dark:text-dark-heading">Detalhes do Caixa</h1>
        <Link href="/erp/cash-register">
          <Button variant="outline">Voltar</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-brand-border p-3">
          <p className="text-xs text-brand-inactive-text">Abertura</p>
          <p className="font-bold">{new Date(details.session.opened_at).toLocaleString("pt-BR")}</p>
        </div>
        <div className="rounded-xl border border-brand-border p-3">
          <p className="text-xs text-brand-inactive-text">Fechamento</p>
          <p className="font-bold">{details.session.closed_at ? new Date(details.session.closed_at).toLocaleString("pt-BR") : "-"}</p>
        </div>
        <div className="rounded-xl border border-brand-border p-3">
          <p className="text-xs text-brand-inactive-text">Saldo inicial</p>
          <p className="font-bold">{formatCurrency(Number(details.session.opening_balance || 0))}</p>
        </div>
        <div className="rounded-xl border border-brand-border p-3">
          <p className="text-xs text-brand-inactive-text">Saldo final</p>
          <p className="font-bold">{details.session.closing_balance != null ? formatCurrency(Number(details.session.closing_balance || 0)) : "-"}</p>
        </div>
      </div>

      <div className="rounded-xl border border-brand-border p-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">Movimentações</h2>
          <div className="text-sm font-semibold">{formatCurrency(totalMovements)}</div>
        </div>
        <div className="mt-3 space-y-2">
          {(details.movements || []).map((movement: any) => (
            <div key={movement.id} className="rounded-lg border border-brand-border p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold truncate">{movement.description}</p>
                  <Badge variant={movementVariant(movement.type)}>{movementTypeLabel(movement.type)}</Badge>
                </div>
                <p className="text-sm text-brand-inactive-text">
                  {movement.payment_method_name} • {new Date(movement.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
              <p className={`font-bold ${Number(movement.amount) >= 0 ? "text-brand-green" : "text-brand-red"}`}>
                {formatCurrency(Number(movement.amount || 0))}
              </p>
            </div>
          ))}
          {(details.movements || []).length === 0 && (
            <p className="text-sm text-brand-inactive-text">Sem movimentações nesse caixa.</p>
          )}
        </div>
      </div>
    </div>
  )
}
