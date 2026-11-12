"use client"

import {
  Badge,
  DatePicker,
  FormDropdown,
  FormSection,
  InfoCard,
  Input,
  MoneyInput,
} from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import type { RevenueLimitStatus } from "@/app/actions/erp/fiscal-entity"
import {
  REVENUE_LIMIT_STATUS_META,
  TAX_PROFILE_META,
  TAX_PROFILES,
  getDefaultAnnualLimit,
  type TaxProfile,
} from "@/lib/fiscal-entity"

export interface FiscalProfileFormValue {
  taxProfile: TaxProfile
  cnaePrimary: string
  /** CNAEs secundários separados por vírgula (formato de input). */
  cnaeSecondary: string
  annualRevenueLimit: number
  openingDate: string
}

interface FiscalProfileSectionProps {
  value: FiscalProfileFormValue
  status: RevenueLimitStatus | null
  onChange: (patch: Partial<FiscalProfileFormValue>) => void
  onTaxProfileChange: (profile: TaxProfile) => void
  loading?: boolean
  /** Quantidade de lojas que compartilham a mesma identidade fiscal. */
  sharedStoreCount?: number
  /** Documento (CNPJ) já informado na aba Geral. */
  hasDocument?: boolean
}

const PROFILE_OPTIONS = TAX_PROFILES.map((profile) => ({
  value: profile,
  label: TAX_PROFILE_META[profile].label,
}))

function formatPercent(value: number) {
  return `${Math.min(999, Math.round(value))}%`
}

/**
 * Perfil fiscal + limite de faturamento.
 *
 * Componente controlado: todo o estado vem do formulário de Dados do Negócio e
 * é persistido pelo botão Salvar principal (nada de salvar por conta própria).
 * O CNPJ/CPF não aparece aqui — ele é informado na aba Geral e o lookup do
 * CNPJ preenche CNAE, CRT, IE e data de abertura.
 */
export function FiscalProfileSection({
  value,
  status,
  onChange,
  onTaxProfileChange,
  loading,
  sharedStoreCount,
  hasDocument = true,
}: FiscalProfileSectionProps) {
  const meta = TAX_PROFILE_META[value.taxProfile]
  const snapshot = status?.snapshot
  const currentYear = new Date().getFullYear()
  const defaultLimit = getDefaultAnnualLimit(value.taxProfile, currentYear)
  const customLimit =
    meta.hasRevenueLimit &&
    defaultLimit != null &&
    value.annualRevenueLimit > 0 &&
    value.annualRevenueLimit !== defaultLimit

  if (loading) {
    return (
      <FormSection title="Perfil fiscal e limite de faturamento">
        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
          Carregando dados fiscais...
        </p>
      </FormSection>
    )
  }

  const tone = snapshot ? REVENUE_LIMIT_STATUS_META[snapshot.status].tone : "gray"
  const barColor =
    tone === "red"
      ? "bg-brand-red"
      : tone === "orange"
        ? "bg-orange-500"
        : tone === "green"
          ? "bg-brand-green"
          : "bg-gray-400"

  return (
    <FormSection title="Perfil fiscal e limite de faturamento">
      <div className="space-y-5">
        <InfoCard
          color="blue"
          title="Enquadramento e limite anual"
          message="A Dudit não emite nota fiscal. Aqui você informa como o negócio está enquadrado para calcular o limite de faturamento e avisar antes de estourar."
        />

        <FormDropdown
          label="Perfil tributário"
          value={value.taxProfile}
          setValue={(v) => onTaxProfileChange(v as TaxProfile)}
          options={PROFILE_OPTIONS}
          dataField="taxProfile"
        />

        <p className="text-xs text-brand-inactive-text dark:text-dark-body -mt-2">
          {meta.description}
        </p>

        {meta.requiresCnpj && !hasDocument && (
          <InfoCard
            color="red"
            title="Informe o CNPJ"
            message="Preencha o CNPJ na aba Geral. Sem ele a loja não pode ser publicada e não é possível emitir nota fiscal para clientes PJ."
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Input
            label="CNAE principal"
            placeholder="0000-0/00"
            value={value.cnaePrimary}
            onChange={(e) => onChange({ cnaePrimary: e.target.value })}
            maxLength={12}
          />
          <Input
            label="CNAEs secundários"
            placeholder="Separados por vírgula"
            value={value.cnaeSecondary}
            onChange={(e) => onChange({ cnaeSecondary: e.target.value })}
          />
        </div>
        <p className="text-xs text-brand-inactive-text dark:text-dark-body -mt-2">
          Preenchidos automaticamente ao consultar o CNPJ na aba Geral.
        </p>

        {meta.hasRevenueLimit && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <MoneyInput
                  label="Limite anual de faturamento"
                  value={value.annualRevenueLimit}
                  onChange={(v) => onChange({ annualRevenueLimit: v })}
                />
                <p className="mt-1.5 text-xs text-brand-inactive-text dark:text-dark-body">
                  {value.taxProfile === "mei"
                    ? `Padrão ${currentYear}: ${formatCurrency(defaultLimit ?? 0)}.`
                    : `Padrão ${currentYear}: ${formatCurrency(defaultLimit ?? 0)} (50% do limite do MEI de ${formatCurrency(getDefaultAnnualLimit("mei", currentYear) ?? 0)}).`}
                </p>
              </div>
              {value.taxProfile === "mei" && (
                <div>
                  <DatePicker
                    label="Data de abertura do CNPJ"
                    value={value.openingDate}
                    onChange={(e) => onChange({ openingDate: e.target.value })}
                  />
                  <p className="mt-1.5 text-xs text-brand-inactive-text dark:text-dark-body">
                    Usada para calcular o limite proporcional no primeiro ano.
                  </p>
                </div>
              )}
            </div>

            {snapshot && snapshot.limit != null && (
              <div className="rounded-xl border border-brand-border dark:border-dark-border p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                      {formatCurrency(snapshot.revenue)} de {formatCurrency(snapshot.limit)}
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                      Faturamento bruto de {status?.year} · {formatPercent(snapshot.percentage)} do limite
                      {(sharedStoreCount ?? 0) > 1
                        ? ` · somando ${sharedStoreCount} lojas`
                        : ""}
                    </p>
                  </div>
                  <Badge variant={tone === "gray" ? "gray" : tone}>
                    {REVENUE_LIMIT_STATUS_META[snapshot.status].label}
                  </Badge>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-brand-gray dark:bg-dark-border">
                  <div
                    className={`h-full rounded-full transition-all ${barColor}`}
                    style={{ width: `${Math.min(100, snapshot.percentage)}%` }}
                  />
                </div>

                <div
                  className={`grid grid-cols-1 gap-3 text-xs ${value.taxProfile === "mei" ? "sm:grid-cols-3" : "sm:grid-cols-2"
                    }`}
                >
                  <div>
                    <p className="text-brand-inactive-text dark:text-dark-body">Restante até o limite</p>
                    <p className="font-bold text-brand-dark dark:text-dark-heading">
                      {formatCurrency(snapshot.remaining ?? 0)}
                    </p>
                  </div>
                  {value.taxProfile === "mei" && (
                    <div>
                      <p className="text-brand-inactive-text dark:text-dark-body">Margem de tolerância (20%)</p>
                      <p className="font-bold text-brand-dark dark:text-dark-heading">
                        {formatCurrency(snapshot.toleranceRemaining ?? 0)}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-brand-inactive-text dark:text-dark-body">Projeção de fechamento</p>
                    <p className="font-bold text-brand-dark dark:text-dark-heading">
                      {snapshot.projectedAnnual != null
                        ? formatCurrency(snapshot.projectedAnnual)
                        : "—"}
                    </p>
                  </div>
                </div>

                {snapshot.projectedBreachDate && (
                  <p className="text-xs text-brand-orange">
                    Mantendo o ritmo atual, o limite é atingido em{" "}
                    {new Date(`${snapshot.projectedBreachDate}T00:00:00`).toLocaleDateString("pt-BR")}.
                  </p>
                )}

                {snapshot.status === "tolerancia" && (
                  <p className="text-xs text-brand-red">
                    Você passou do limite, mas está dentro dos 20% de tolerância. O excesso é tributado
                    pelo DAS complementar; acima de 20% há desenquadramento retroativo.
                  </p>
                )}

                {snapshot.status === "excedido" && (
                  <p className="text-xs text-brand-red">
                    {value.taxProfile === "mei"
                      ? "Limite e tolerância ultrapassados. Procure um contador: o desenquadramento pode ser retroativo ao início do ano."
                      : "Limite do nanoempreendedor ultrapassado. A partir daí o negócio deixa de ser nano e passa a exigir CNPJ técnico e documento fiscal. Procure um contador para fazer a transição."}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {!meta.hasRevenueLimit && value.taxProfile !== "nao_informado" && (
          <InfoCard
            color="gray"
            title="Sem limite anual monitorado"
            message="Para este perfil não há teto de faturamento. O monitor fica disponível apenas para MEI e nanoempreendedor."
          />
        )}

        {meta.hasRevenueLimit && (
          <p className="text-xs text-brand-inactive-text dark:text-dark-body">
            {customLimit ? "Limite personalizado em uso." : "Usando o limite padrão do ano."}
          </p>
        )}
      </div>
    </FormSection>
  )
}
