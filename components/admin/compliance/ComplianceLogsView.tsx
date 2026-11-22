"use client"

import React, { useState, useCallback } from "react"
import {
  Search,
  ShieldAlert,
  Copy,
  Check,
  Eye,
  Lock,
  RefreshCw,
  Building2,
  Link2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { Badge, Button, InfoCard, Input } from "@/components/reusable"
import DefaultModal from "@/components/reusable/DefaultModal"
import StepUpModal from "@/components/admin/StepUpModal"
import {
  getComplianceDeletionLogs,
  revealComplianceLogPiiAction,
  type ComplianceDeletionEntry,
  type ComplianceRevealedPii,
} from "@/app/actions/admin/compliance"

interface ComplianceLogsViewProps {
  initialData: {
    data: ComplianceDeletionEntry[]
    total: number
    page: number
    limit: number
  }
}

const PROVIDER_LABELS: Record<string, string> = {
  mercadopago: "Mercado Pago",
  superfrete: "SuperFrete",
  tiny: "Tiny ERP",
  bling: "Bling",
}

const PROVIDER_OPTIONS = [
  { value: "all", label: "Todas integrações" },
  { value: "mercadopago", label: "Mercado Pago" },
  { value: "superfrete", label: "SuperFrete" },
  { value: "tiny", label: "Tiny ERP" },
  { value: "bling", label: "Bling ERP" },
]

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`
}

export default function ComplianceLogsView({ initialData }: ComplianceLogsViewProps) {
  const [rows, setRows] = useState<ComplianceDeletionEntry[]>(initialData.data)
  const [total, setTotal] = useState<number>(initialData.total)
  const [page, setPage] = useState<number>(initialData.page)
  const [limit] = useState<number>(initialData.limit)

  const [search, setSearch] = useState("")
  const [provider, setProvider] = useState("all")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Detail & Break-glass modal state
  const [selected, setSelected] = useState<ComplianceDeletionEntry | null>(null)
  const [revealedPii, setRevealedPii] = useState<ComplianceRevealedPii | null>(null)
  const [revealReason, setRevealReason] = useState("")
  const [revealError, setRevealError] = useState<string | null>(null)
  const [isStepUpOpen, setIsStepUpOpen] = useState(false)
  const [isRevealing, setIsRevealing] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const fetchLogs = useCallback(
    async (nextPage: number, nextSearch = search, nextProvider = provider) => {
      setLoading(true)
      setError(null)
      try {
        const res = await getComplianceDeletionLogs({
          search: nextSearch || undefined,
          provider: nextProvider,
          page: nextPage,
          limit,
        })
        setRows(res.data)
        setTotal(res.total)
        setPage(res.page)
      } catch (err: any) {
        setError(err?.message || "Erro ao carregar registros.")
      } finally {
        setLoading(false)
      }
    },
    [search, provider, limit]
  )

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchLogs(1, search, provider)
  }

  const handleProviderChange = (nextProvider: string) => {
    setProvider(nextProvider)
    fetchLogs(1, search, nextProvider)
  }

  const openDetail = (entry: ComplianceDeletionEntry) => {
    setSelected(entry)
    setRevealedPii(null)
    setRevealReason("")
    setRevealError(null)
  }

  const closeDetail = () => {
    setSelected(null)
    setRevealedPii(null)
    setRevealReason("")
    setRevealError(null)
  }

  const handleStartReveal = () => {
    if (revealReason.trim().length < 5) {
      setRevealError("Informe o motivo da consulta (mínimo 5 caracteres) antes de autenticar.")
      return
    }
    setRevealError(null)
    setIsStepUpOpen(true)
  }

  const handleStepUpAuthenticated = async (token: string) => {
    setIsStepUpOpen(false)
    if (!selected) return

    setIsRevealing(true)
    setRevealError(null)
    try {
      const res = await revealComplianceLogPiiAction({
        complianceLogId: selected.id,
        reason: revealReason.trim(),
        stepUpToken: token,
      })
      if (res.success) {
        setRevealedPii(res.pii)
      } else {
        setRevealError(res.error)
      }
    } catch (err: any) {
      setRevealError(err?.message || "Erro ao revelar dados sensíveis.")
    } finally {
      setIsRevealing(false)
    }
  }

  const copyValue = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1500)
    } catch {
      // Ignore clipboard failure
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* Info banner */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-xs md:text-sm text-brand-dark dark:text-dark-body space-y-1">
          <p className="font-semibold text-brand-dark dark:text-dark-heading">
            Cofre de Compliance & Antifraude (LGPD Art. 16 — Retenção de 5 anos)
          </p>
          <p className="opacity-80">
            Exibe identificadores externos (Mercado Pago, SuperFrete, Tiny) preservados mesmo quando o usuário desconecta antes de excluir a conta. Dados pessoais criptografados exigem justificativa + confirmação de senha e geram registro imutável em Auditoria.
          </p>
        </div>
      </div>

      {/* Filters */}
      <form
        onSubmit={handleSearchSubmit}
        className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl p-4"
      >
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-brand-inactive-text absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              setSearch(e.target.value)
            }
            placeholder="Buscar por e-mail exato, MP User ID, SuperFrete ID, Partner ID ou IP..."
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value)}
            className="h-10 rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-background px-3 text-sm text-brand-dark dark:text-dark-heading outline-none"
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <Button type="submit" disabled={loading}>
            Buscar
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSearch("")
              setProvider("all")
              fetchLogs(1, "", "all")
            }}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </form>

      {error && <InfoCard message={error} color="red" />}

      {/* Table */}
      <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-brand-border dark:border-dark-border bg-brand-gray/50 dark:bg-dark-background/60 text-left text-xs uppercase tracking-wider text-brand-inactive-text">
                <th className="py-3 px-4">Excluída em</th>
                <th className="py-3 px-4">Conta / Lojas</th>
                <th className="py-3 px-4">Integrações (IDs Externos)</th>
                <th className="py-3 px-4">IP / País</th>
                <th className="py-3 px-4">Motivo</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-brand-inactive-text">
                    {loading
                      ? "Carregando registros..."
                      : "Nenhum registro de conta excluída encontrado para esse filtro."}
                  </td>
                </tr>
              ) : (
                rows.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => openDetail(entry)}
                    className="border-b border-brand-border dark:border-dark-border hover:bg-brand-gray/40 dark:hover:bg-dark-border/10 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-medium text-brand-dark dark:text-dark-heading">
                        {formatDateTime(entry.deleted_at)}
                      </div>
                      <div className="text-[11px] text-brand-inactive-text font-mono">
                        {entry.id.slice(0, 8)}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-medium text-brand-dark dark:text-dark-heading">
                        {entry.email_masked || "E-mail (hash legado)"}
                      </div>
                      {entry.partner_id && (
                        <div className="text-[11px] text-brand-inactive-text font-mono">
                          Partner: {entry.partner_id.slice(0, 8)}...
                        </div>
                      )}
                      {entry.stores.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {entry.stores.map((s) => (
                            <span
                              key={s.store_id}
                              className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-brand-gray dark:bg-dark-background text-brand-dark dark:text-dark-body"
                            >
                              <Building2 className="w-3 h-3 opacity-60" />
                              {s.name || "Loja"}
                              {s.document_masked ? ` (${s.document_masked})` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      {entry.integrations.length === 0 ? (
                        <span className="text-xs text-brand-inactive-text">Nenhuma registrada</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {entry.integrations.map((intg, idx) => (
                            <div
                              key={`${intg.provider_slug}-${intg.account_id || idx}`}
                              className="flex items-center gap-1.5 flex-wrap"
                            >
                              <Badge
                                variant={
                                  intg.provider_slug === "mercadopago"
                                    ? "blue"
                                    : intg.provider_slug === "superfrete"
                                    ? "green"
                                    : "gray"
                                }
                              >
                                {PROVIDER_LABELS[intg.provider_slug] || intg.provider_slug}
                              </Badge>
                              {intg.account_id && (
                                <span className="text-xs font-mono text-brand-dark dark:text-dark-heading">
                                  ID: {intg.account_id}
                                </span>
                              )}
                              {intg.status_at_deletion === "disconnected" && (
                                <span className="text-[10px] text-amber-600 dark:text-amber-400">
                                  (desconectada antes)
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="text-xs font-mono text-brand-dark dark:text-dark-heading">
                        {entry.request_ip || "—"}
                      </div>
                      <div className="text-[11px] text-brand-inactive-text">
                        {entry.request_country || "—"}
                      </div>
                    </td>

                    <td className="py-3 px-4 max-w-[220px]">
                      <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">
                        {entry.deletion_reason || "—"}
                      </p>
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation()
                          openDetail(entry)
                        }}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Detalhes
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-brand-border dark:border-dark-border text-xs text-brand-inactive-text">
          <span>
            Total: <strong className="text-brand-dark dark:text-dark-heading">{total}</strong>{" "}
            registro(s) • Página {page} de {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || loading}
              onClick={() => fetchLogs(page - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages || loading}
              onClick={() => fetchLogs(page + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Detail & Break-Glass Modal */}
      <DefaultModal
        isOpen={Boolean(selected)}
        onClose={closeDetail}
        title="Detalhes de Compliance — Conta Excluída"
        maxWidth="2xl"
        footer={
          <Button variant="outline" onClick={closeDetail}>
            Fechar
          </Button>
        }
      >
        {selected && (
          <div className="space-y-5 text-sm">
            {/* Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-brand-gray/40 dark:bg-dark-background border border-brand-border dark:border-dark-border">
              <div>
                <div className="text-[11px] uppercase text-brand-inactive-text">Excluída em</div>
                <div className="font-medium text-brand-dark dark:text-dark-heading">
                  {formatDateTime(selected.deleted_at)}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-brand-inactive-text">IP / País</div>
                <div className="font-mono text-xs text-brand-dark dark:text-dark-heading">
                  {selected.request_ip || "—"} ({selected.request_country || "—"})
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-brand-inactive-text">Partner ID</div>
                <div className="font-mono text-xs text-brand-dark dark:text-dark-heading break-all">
                  {selected.partner_id || "Sem loja (comprador)"}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-brand-inactive-text">
                  Assinatura MP (Plataforma)
                </div>
                <div className="font-mono text-xs text-brand-dark dark:text-dark-heading break-all">
                  {selected.mp_subscription_id || "—"}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-[11px] uppercase text-brand-inactive-text">
                  Motivo informado
                </div>
                <div className="text-xs text-brand-dark dark:text-dark-heading">
                  {selected.deletion_reason || "Não informado"}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-[11px] uppercase text-brand-inactive-text">User-Agent</div>
                <div className="text-[11px] font-mono text-brand-inactive-text break-all">
                  {selected.user_agent || "—"}
                </div>
              </div>
            </div>

            {/* External Integrations Snapshot */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-semibold text-brand-dark dark:text-dark-heading">
                <Link2 className="w-4 h-4" />
                Integrações Vinculadas (Atuais + Histórico)
              </div>
              {selected.integrations.length === 0 ? (
                <p className="text-xs text-brand-inactive-text">
                  Nenhuma integração externa registrada para esta conta.
                </p>
              ) : (
                <div className="space-y-2">
                  {selected.integrations.map((intg, idx) => {
                    const revealedMatch = revealedPii?.integrations[idx]
                    const copyIdKey = `intg-id-${idx}`
                    return (
                      <div
                        key={`${intg.provider_slug}-${intg.account_id || idx}`}
                        className="rounded-lg border border-brand-border dark:border-dark-border p-3 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                intg.provider_slug === "mercadopago"
                                  ? "blue"
                                  : intg.provider_slug === "superfrete"
                                  ? "green"
                                  : "gray"
                              }
                            >
                              {PROVIDER_LABELS[intg.provider_slug] || intg.provider_slug}
                            </Badge>
                            <span className="text-xs text-brand-inactive-text">
                              {intg.status_at_deletion === "connected"
                                ? "Conectada na exclusão"
                                : "Desconectada antes da exclusão"}
                            </span>
                          </div>
                          {intg.account_label && (
                            <span className="text-xs font-medium text-brand-dark dark:text-dark-heading">
                              {intg.account_label}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="text-brand-inactive-text">Account ID:</span>
                            <span className="font-mono font-semibold text-brand-dark dark:text-dark-heading">
                              {intg.account_id || "—"}
                            </span>
                            {intg.account_id && (
                              <button
                                type="button"
                                onClick={() => copyValue(copyIdKey, intg.account_id!)}
                                className="p-1 rounded hover:bg-brand-gray dark:hover:bg-dark-border/30 text-brand-inactive-text"
                                title="Copiar ID"
                              >
                                {copiedKey === copyIdKey ? (
                                  <Check className="w-3.5 h-3.5 text-brand-green" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                          </div>

                          <div>
                            <span className="text-brand-inactive-text">E-mail integração: </span>
                            <span className="font-mono text-brand-dark dark:text-dark-heading">
                              {revealedMatch?.account_email || intg.account_email_masked || "—"}
                            </span>
                          </div>

                          <div>
                            <span className="text-brand-inactive-text">Conectada: </span>
                            <span>{formatDateTime(intg.connected_at)}</span>
                          </div>
                          <div>
                            <span className="text-brand-inactive-text">Desconectada: </span>
                            <span>{formatDateTime(intg.disconnected_at)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Partner Stores Snapshot */}
            {selected.stores.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-semibold text-brand-dark dark:text-dark-heading">
                  <Building2 className="w-4 h-4" />
                  Lojas e Documentos Fiscais
                </div>
                <div className="space-y-2">
                  {selected.stores.map((s, idx) => {
                    const revealedStore = revealedPii?.stores[idx]
                    return (
                      <div
                        key={s.store_id}
                        className="rounded-lg border border-brand-border dark:border-dark-border p-3 flex items-center justify-between flex-wrap gap-2 text-xs"
                      >
                        <div>
                          <div className="font-semibold text-brand-dark dark:text-dark-heading">
                            {s.name || "Loja sem nome"}
                          </div>
                          <div className="text-[11px] font-mono text-brand-inactive-text">
                            ID: {s.store_id}
                          </div>
                        </div>
                        <div className="font-mono text-brand-dark dark:text-dark-heading">
                          {s.document_type ? `${s.document_type.toUpperCase()}: ` : ""}
                          {revealedStore?.document || s.document_masked || "Sem documento"}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Break-glass PII Reveal Section */}
            <div className="rounded-xl border border-brand-red/30 bg-brand-red/5 p-4 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-brand-dark dark:text-dark-heading">
                <Lock className="w-4 h-4 text-brand-red" />
                Dados Pessoais Criptografados (Break-Glass)
              </div>

              {revealedPii ? (
                <div className="space-y-2 text-xs bg-white dark:bg-dark-surface rounded-lg p-3 border border-brand-border dark:border-dark-border">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-brand-inactive-text">E-mail da conta: </span>
                      <strong className="font-mono text-brand-dark dark:text-dark-heading">
                        {revealedPii.email || "Não armazenado (registro legado)"}
                      </strong>
                    </div>
                    {revealedPii.email && (
                      <button
                        type="button"
                        onClick={() => copyValue("pii-email", revealedPii.email!)}
                        className="p-1 rounded hover:bg-brand-gray dark:hover:bg-dark-border/30"
                      >
                        {copiedKey === "pii-email" ? (
                          <Check className="w-3.5 h-3.5 text-brand-green" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                  <div>
                    <span className="text-brand-inactive-text">Nome completo: </span>
                    <strong className="text-brand-dark dark:text-dark-heading">
                      {revealedPii.full_name || "Não armazenado"}
                    </strong>
                  </div>
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 pt-1">
                    Esta consulta foi registrada em <code>admin_audit_logs</code> com sua identificação e justificativa.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                    E-mail mascarado: <strong>{selected.email_masked || "—"}</strong>. Para descriptografar e-mail, nome completo, e-mails de integração e CPF/CNPJ das lojas, informe o motivo e confirme sua senha.
                  </p>

                  {!selected.has_encrypted_email &&
                  !selected.has_encrypted_name &&
                  !selected.integrations.some((i) => i.has_encrypted_email) &&
                  !selected.stores.some((s) => s.has_encrypted_document) ? (
                    <p className="text-xs text-brand-inactive-text italic">
                      Este é um registro legado anterior à retenção criptografada — apenas o hash SHA-256 e metadados básicos estão disponíveis.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <Input
                        value={revealReason}
                        onChange={(
                          e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
                        ) => setRevealReason(e.target.value)}
                        placeholder="Justificativa obrigatória (ex.: Ofício MP / chargeback pedido #1234)"
                      />
                      {revealError && <InfoCard message={revealError} color="red" />}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleStartReveal}
                        disabled={isRevealing}
                      >
                        <Eye className="w-4 h-4 mr-1.5" />
                        {isRevealing ? "Descriptografando..." : "Revelar Dados Sensíveis"}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </DefaultModal>

      <StepUpModal
        isOpen={isStepUpOpen}
        onClose={() => setIsStepUpOpen(false)}
        onAuthenticated={handleStepUpAuthenticated}
        title="Confirmar Acesso a Dados Sensíveis"
        description="A descriptografia de dados de compliance exige reautenticação e será registrada nos logs de auditoria."
      />
    </div>
  )
}
