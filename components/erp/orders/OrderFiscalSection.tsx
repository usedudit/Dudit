"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertModal, Badge, Button, FormSection, InfoCard, Input } from "@/components/reusable"
import { toast } from "@/hooks/use-notification"
import {
  getOrderFiscalStatusAction,
  recordNfeOverrideAction,
  saveOrderNfeAction,
  type OrderFiscalStatus,
} from "@/app/actions/erp/order-fiscal"

interface OrderFiscalSectionProps {
  orderId: string
}

/**
 * Documento fiscal do pedido.
 *
 * A Dudit não emite NF-e/NFS-e: o vendedor emite por fora e informa o número
 * aqui. Comprador PF não tem obrigação (MEI pode usar a DASN-Simei; nano é
 * dispensado). Comprador PJ exige nota antes do envio — mas o envio pode ser
 * liberado com registro, para não travar a operação.
 */
export function OrderFiscalSection({ orderId }: OrderFiscalSectionProps) {
  const [status, setStatus] = useState<OrderFiscalStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [number, setNumber] = useState("")
  const [series, setSeries] = useState("")
  const [accessKey, setAccessKey] = useState("")

  const load = useCallback(async () => {
    try {
      const res = await getOrderFiscalStatusAction({ orderId })
      if (res.success && res.data) {
        setStatus(res.data)
        setNumber(res.data.nfeNumber || "")
        setSeries(res.data.nfeSeries || "")
        setAccessKey(res.data.nfeAccessKey || "")
        setEditing(!res.data.nfeNumber)
      }
    } catch {
      // silencioso: seção complementar
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = async () => {
    if (!number.trim()) {
      toast.error("Informe o número da nota fiscal.")
      return
    }
    setSaving(true)
    try {
      const res = await saveOrderNfeAction({
        orderId,
        nfeNumber: number,
        nfeSeries: series || null,
        nfeAccessKey: accessKey || null,
      })
      if (!res.success) {
        toast.error(res.error || "Erro ao salvar a nota fiscal.")
        return
      }
      toast.success("Nota fiscal registrada no pedido.")
      setEditing(false)
      await load()
    } catch {
      toast.error("Erro ao salvar a nota fiscal.")
    } finally {
      setSaving(false)
    }
  }

  const handleOverride = async () => {
    setSaving(true)
    try {
      const res = await recordNfeOverrideAction({ orderId })
      if (!res.success) {
        toast.error(res.error || "Erro ao registrar a liberação.")
        return
      }
      toast.warning("Envio liberado sem nota", "O registro ficou salvo no pedido.")
      setOverrideOpen(false)
      await load()
    } catch {
      toast.error("Erro ao registrar a liberação.")
    } finally {
      setSaving(false)
    }
  }

  if (loading || !status?.requiresNfe) return null

  const hasNfe = Boolean(status.nfeNumber)

  return (
    <FormSection title="Documento fiscal">
      {hasNfe && !editing ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Badge variant="green">NF-e informada</Badge>
              <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                Nº {status.nfeNumber}
                {status.nfeSeries ? ` · série ${status.nfeSeries}` : ""}
              </span>
            </div>
            <Button type="button" variant="outline" onClick={() => setEditing(true)}>
              Editar
            </Button>
          </div>
          {status.nfeIssuedAt && (
            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
              Emissão registrada em {new Date(status.nfeIssuedAt).toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <InfoCard
            color={status.overrideAt ? "red" : "orange"}
            title="NF-e obrigatória para cliente PJ"
            message={
              status.overrideAt
                ? `Este pedido foi liberado sem nota em ${new Date(status.overrideAt).toLocaleDateString("pt-BR")}. Informe o número assim que emitir.`
                : "O comprador é pessoa jurídica. Emita a nota no seu sistema e informe o número abaixo antes do envio."
            }
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Número da NF-e"
              placeholder="Ex.: 123"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              maxLength={30}
            />
            <Input
              label="Série"
              placeholder="Ex.: 1"
              value={series}
              onChange={(e) => setSeries(e.target.value)}
              maxLength={10}
            />
            <Input
              label="Chave de acesso (opcional)"
              placeholder="44 dígitos"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value.replace(/\D/g, "").slice(0, 44))}
              maxLength={44}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={handleSave} isLoading={saving}>
              Salvar nota fiscal
            </Button>
            {hasNfe && (
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            )}
            {!hasNfe && (
              <button
                type="button"
                className="text-xs font-bold text-brand-inactive-text dark:text-dark-body hover:underline"
                onClick={() => setOverrideOpen(true)}
              >
                Enviar sem informar a nota
              </button>
            )}
          </div>
        </div>
      )}

      <AlertModal
        isOpen={overrideOpen}
        onClose={() => {
          if (!saving) setOverrideOpen(false)
        }}
        onConfirm={handleOverride}
        title="Enviar sem nota fiscal"
        message="O comprador é pessoa jurídica e a NF-e é obrigatória. Se continuar, o pedido fica marcado como enviado sem nota e o registro fica salvo. Emita e informe o número assim que possível."
        confirmText="Liberar mesmo assim"
        cancelText="Voltar"
        variant="danger"
        isLoading={saving}
      />
    </FormSection>
  )
}
