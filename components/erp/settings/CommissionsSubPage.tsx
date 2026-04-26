"use client"

import { useEffect, useMemo, useState } from "react"
import { Button, FormDropdown, Input, ListItem } from "@/components/reusable"
import { ChevronLeftIcon, MoneyIcon, TruckIcon, Users } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { listEmployeeCommissionsAction, upsertEmployeeCommissionAction, type CommissionSettingsRow } from "@/app/actions/erp/commissions"

const sellerOptions = [
  { value: "none", label: "Sem comissão" },
  { value: "percentage_sale", label: "Percentual por venda (%)" },
  { value: "fixed_per_sale", label: "Valor fixo por venda" },
]

const deliveryOptions = [
  { value: "fixed_per_delivery", label: "Valor fixo por entrega" },
  { value: "percentage_delivery_fee", label: "Percentual da taxa de entrega (%)" },
]

export function CommissionsSubPage({ partnerId, onBack }: { partnerId: string; onBack: () => void }) {
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [rows, setRows] = useState<CommissionSettingsRow[]>([])

  async function load() {
    setLoading(true)
    const result = await listEmployeeCommissionsAction(partnerId)
    if (result.success) setRows(result.items)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [partnerId])

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (a.commissionRole === b.commissionRole) return a.name.localeCompare(b.name)
      return a.commissionRole === "seller" ? -1 : 1
    })
  }, [rows])

  if (loading) return <FadeIn className="p-6">Carregando comissões...</FadeIn>

  return (
    <FadeIn className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
      <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border">
        <div className="max-w-[1300px] mx-auto px-4 md:px-6 py-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0">
              <ChevronLeftIcon className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl md:text-3xl font-bold text-brand-dark dark:text-dark-heading">Comissões</h1>
              <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                Configure comissão para vendedores e entregadores.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1300px] mx-auto w-full px-4 md:px-6 py-6 overflow-y-auto space-y-4">
        {sortedRows.map((row) => {
          const isSeller = row.commissionRole === "seller"
          const options = isSeller ? sellerOptions : deliveryOptions
          const valueLabel = row.commissionType.includes("percentage") ? "Valor (%)" : "Valor (R$)"
          return (
            <div key={`${row.partnerUserId}:${row.commissionRole}`} className="rounded-2xl border border-brand-border dark:border-dark-border p-4 space-y-3">
              <ListItem
                icon={isSeller ? Users : TruckIcon}
                title={row.name}
                description={`Função: ${row.roleLabel}`}
                className="border-0 p-0 hover:border-transparent cursor-default"
                right={isSeller ? <MoneyIcon className="w-5 h-5 text-brand-dark" /> : undefined}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <FormDropdown
                  label="Tipo de comissão"
                  value={row.commissionType}
                  setValue={(value) => {
                    setRows((prev) =>
                      prev.map((item) =>
                        item.partnerUserId === row.partnerUserId && item.commissionRole === row.commissionRole
                          ? { ...item, commissionType: value as any, value: value === "none" ? 0 : item.value }
                          : item,
                      ),
                    )
                  }}
                  options={options}
                />
                <Input
                  label={valueLabel}
                  value={String(row.value)}
                  onChange={(e) => {
                    const next = e.target.value
                    setRows((prev) =>
                      prev.map((item) =>
                        item.partnerUserId === row.partnerUserId && item.commissionRole === row.commissionRole
                          ? { ...item, value: Number(next || 0) }
                          : item,
                      ),
                    )
                  }}
                  disabled={row.commissionType === "none"}
                />
                <div className="flex items-end">
                  <Button
                    className="w-full"
                    disabled={savingId === row.partnerUserId}
                    onClick={async () => {
                      setSavingId(row.partnerUserId)
                      await upsertEmployeeCommissionAction({
                        partnerId,
                        partnerUserId: row.partnerUserId,
                        role: row.commissionRole,
                        commissionType: row.commissionType,
                        value: row.value,
                        metadata: row.metadata || {},
                      })
                      setSavingId(null)
                    }}
                  >
                    {savingId === row.partnerUserId ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </FadeIn>
  )
}
