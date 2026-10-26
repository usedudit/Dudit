"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Badge,
  Button,
  CpfCnpjInput,
  FormDropdown,
  FormSection,
  InfoCard,
  Input,
  MoneyInput,
} from "@/components/reusable"
import { toast } from "@/hooks/use-notification"
import { formatCurrency } from "@/lib/utils"
import {
  getFiscalProfileAction,
  getRevenueLimitStatusAction,
  saveFiscalProfileAction,
  type FiscalEntityDto,
  type RevenueLimitStatus,
} from "@/app/actions/erp/fiscal-entity"
import {
  REVENUE_LIMIT_STATUS_META,
  TAX_PROFILE_META,
  TAX_PROFILES,
  getDefaultAnnualLimit,
  type TaxProfile,
} from "@/lib/fiscal-entity"

interface FiscalProfileSectionProps {
  storeId: string
  onSaved?: (data: FiscalEntityDto) => void
}

const PROFILE_OPTIONS = TAX_PROFILES.map((profile) => ({
  value: profile,
  label: TAX_PROFILE_META[profile].label,
}))

function formatPercent(value: number) {
  return `${Math.min(999, Math.round(value))}%`
}

export function FiscalProfileSection({ storeId, onSaved }: FiscalProfileSectionProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entity, setEntity] = useState<FiscalEntityDto | null>(null)
  const [status, setStatus] = useState<RevenueLimitStatus | null>(null)

  const [profile, setProfile] = useState<TaxProfile>("nao_informado")
  const [document, setDocument] = useState("")
  const [cnae, setCnae] = useState("")
  const [cnaeSecondary, setCnaeSecondary] = useState("")
  const [limit, setLimit] = useState(0)
  const [openingDate, setOpeningDate] = useState("")

  const applyEntity = useCallback((data: FiscalEntityDto) => {
    setEntity(data)
    setProfile(data.taxProfile)
    setDocument(data.document || "")
    setCnae(data.cnaePrimary || "")
    setCnaeSecondary((data.cnaeSecondary || []).join(", "))
    setLimit(Number(data.annualRevenueLimit || 0))
    setOpeningDate(data.openingDate ? data.openingDate.slice(0, 10) : "")
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [profileRes, statusRes] = await Promise.all([
        getFiscalProfileAction({ storeId }),
        getRevenueLimitStatusAction({ storeId }),
      ])
      if (profileRes.success && profileRes.data) applyEntity(profileRes.data)
      if (statusRes.success && statusRes.data) setStatus(statusRes.data)
    } catch {
      toast.error("Erro ao carregar os dados fiscais.")
    } finally {
      setLoading(false)
    }
  }, [storeId, applyEntity])

  useEffect(() => {
    load()
  }, [load])

  const meta = TAX_PROFILE_META[profile]
  const snapshot = status?.snapshot

  const customLimit = useMemo(() => {
    if (!meta.hasRevenueLimit) return false
    const defaultLimit = getDefaultAnnualLimit(profile, new Date().getFullYear())
    return defaultLimit != null && limit > 0 && limit !== defaultLimit
  }, [meta.hasRevenueLimit, profile, limit])

  const handleProfileChange = (next: TaxProfile) => {
    setProfile(next)
    // Ao trocar de enquadramento, parte do limite padrão do novo perfil para
    // não salvar um teto incompatível (ex.: nano com limite de MEI).
    setLimit(getDefaultAnnualLimit(next, new Date().getFullYear()) ?? 0)

    // MEI/PF contribuinte exigem CNPJ; nano/não informado não podem ter CNPJ.
    // Limpa o documento quando o tipo atual deixa de ser aceito, para o
    // usuário não ficar preso em um erro de validação ao trocar de perfil.
    const digits = document.replace(/\D/g, "")
    if (TAX_PROFILE_META[next].requiresCnpj && digits.length === 11) setDocument("")
    if (!TAX_PROFILE_META[next].requiresCnpj && digits.length === 14) setDocument("")
  }

  const handleLookupCnae = async () => {
    const digits = document.replace(/\D/g, "")
    if (digits.length !== 14) {
      toast.error("Informe o CNPJ para buscar o CNAE.")
      return
    }
    try {
      const res = await fetch(`/api/cnpj?cnpj=${digits}`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || "Não foi possível consultar o CNPJ.")
        return
      }
      if (data.cnae_fiscal) {
        setCnae(String(data.cnae_fiscal))
        toast.success("CNAE preenchido a partir do CNPJ.")
      } else {
        toast.warning("O CNPJ não retornou CNAE. Informe manualmente.")
      }
    } catch {
      toast.error("Erro ao consultar o CNPJ.")
    }
  }

  const handleSave = async () => {
    if (meta.requiresCnpj && document.replace(/\D/g, "").length !== 14) {
      toast.error("Informe um CNPJ válido para este perfil.")
      return
    }

    setSaving(true)
    try {
      const res = await saveFiscalProfileAction({
        storeId,
        taxProfile: profile,
        document: document || null,
        cnaePrimary: cnae || null,
        cnaeSecondary: cnaeSecondary
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        annualRevenueLimit: meta.hasRevenueLimit && limit > 0 ? limit : null,
        openingDate: profile === "mei" ? openingDate || null : null,
      })

      if (!res.success || !res.data) {
        toast.error(res.error || "Erro ao salvar o perfil fiscal.")
        return
      }

      applyEntity(res.data)
      const statusRes = await getRevenueLimitStatusAction({ storeId })
      if (statusRes.success && statusRes.data) setStatus(statusRes.data)
      toast.success("Perfil fiscal atualizado.")
      onSaved?.(res.data)
    } catch {
      toast.error("Erro ao salvar o perfil fiscal.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <FormSection hasSeparator title="Perfil fiscal e limite de faturamento">
        <p className="text-sm text-brand-inactive-text dark:text-dark-body">Carregando dados fiscais...</p>
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
    <FormSection hasSeparator title="Perfil fiscal e limite de faturamento">
      <div className="space-y-5">
        <InfoCard
          color="blue"
          title="Enquadramento e limite anual"
          message="O Dudit não emite nota fiscal. Aqui você informa como o negócio está enquadrado para calcular o limite de faturamento e avisar antes de estourar."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FormDropdown
            label="Perfil tributário"
            value={profile}
            setValue={(v) => handleProfileChange(v as TaxProfile)}
            options={PROFILE_OPTIONS}
            dataField="taxProfile"
          />

          <div className="flex flex-col gap-1.5">
            <CpfCnpjInput
              label={meta.requiresCnpj ? "CNPJ" : "CNPJ ou CPF (opcional)"}
              placeholder={meta.requiresCnpj ? "00.000.000/0000-00" : "Documento do negócio"}
              value={document}
              onChange={(e) => setDocument((e.target as HTMLInputElement).value)}
              dataField="taxDocument"
            />
          </div>
        </div>

        <p className="text-xs text-brand-inactive-text dark:text-dark-body -mt-2">
          {meta.description}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label="CNAE principal"
                placeholder="0000-0/00"
                value={cnae}
                onChange={(e) => setCnae(e.target.value)}
                maxLength={12}
              />
            </div>
            <Button type="button" variant="outline" onClick={handleLookupCnae}>
              Buscar
            </Button>
          </div>

          <Input
            label="CNAEs secundários"
            placeholder="Separados por vírgula"
            value={cnaeSecondary}
            onChange={(e) => setCnaeSecondary(e.target.value)}
          />
        </div>

        {meta.hasRevenueLimit && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <MoneyInput
                  label="Limite anual de faturamento"
                  value={limit}
                  onChange={setLimit}
                />
                <p className="mt-1.5 text-xs text-brand-inactive-text dark:text-dark-body">
                  {(() => {
                    const currentYear = new Date().getFullYear()
                    const defaultLimit = getDefaultAnnualLimit(profile, currentYear)
                    if (profile === "mei") {
                      return `Padrão ${currentYear}: ${formatCurrency(defaultLimit ?? 0)}.`
                    }
                    const meiLimit = getDefaultAnnualLimit("mei", currentYear) ?? 0
                    return `Padrão ${currentYear}: ${formatCurrency(defaultLimit ?? 0)} (50% do limite do MEI de ${formatCurrency(meiLimit)}).`
                  })()}
                </p>
              </div>
              {profile === "mei" && (
                <div>
                  <Input
                    type="date"
                    label="Data de abertura do CNPJ"
                    value={openingDate}
                    onChange={(e) => setOpeningDate(e.target.value)}
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
                      {entity && entity.sharedStoreIds.length > 1
                        ? ` · somando ${entity.sharedStoreIds.length} lojas`
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
                  className={`grid grid-cols-1 gap-3 text-xs ${
                    profile === "mei" ? "sm:grid-cols-3" : "sm:grid-cols-2"
                  }`}
                >
                  <div>
                    <p className="text-brand-inactive-text dark:text-dark-body">Restante até o limite</p>
                    <p className="font-bold text-brand-dark dark:text-dark-heading">
                      {formatCurrency(snapshot.remaining ?? 0)}
                    </p>
                  </div>
                  {profile === "mei" && (
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
                  <p className="text-xs text-orange-600 dark:text-orange-400">
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
                    {profile === "mei"
                      ? "Limite e tolerância ultrapassados. Procure um contador: o desenquadramento pode ser retroativo ao início do ano."
                      : "Limite do nanoempreendedor ultrapassado. A partir daí o negócio deixa de ser nano e passa a exigir CNPJ técnico e documento fiscal. Procure um contador para fazer a transição."}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {!meta.hasRevenueLimit && profile !== "nao_informado" && (
          <InfoCard
            color="gray"
            title="Sem limite anual monitorado"
            message="Para este perfil não há teto de faturamento. O monitor fica disponível apenas para MEI e nanoempreendedor."
          />
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-brand-inactive-text dark:text-dark-body">
            {customLimit ? "Limite personalizado em uso." : "Usando o limite padrão do ano."}
          </p>
          <Button type="button" onClick={handleSave} isLoading={saving}>
            Salvar perfil fiscal
          </Button>
        </div>
      </div>
    </FormSection>
  )
}
