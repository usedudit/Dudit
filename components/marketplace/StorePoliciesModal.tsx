"use client"

import { useEffect, useState } from "react"
import { DefaultModal, Spinner, Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/reusable"
import { getPartnerReturnPolicyPublicAction } from "@/app/actions/marketplace/store-policies"
import { getShippingPayerLabel } from "@/lib/returns/policy"
import type { PartnerReturnPolicy } from "@/lib/returns/policy"

interface StorePoliciesModalProps {
  isOpen: boolean
  onClose: () => void
  partnerId: string
  storeName: string
}

export function StorePoliciesModal({ isOpen, onClose, partnerId, storeName }: StorePoliciesModalProps) {
  const [policy, setPolicy] = useState<PartnerReturnPolicy | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !partnerId) return

    setLoading(true)
    setError(null)

    getPartnerReturnPolicyPublicAction(partnerId)
      .then((res) => {
        if (res.success && res.data?.policy) {
          setPolicy(res.data.policy)
        } else {
          setError("Não foi possível carregar as políticas da loja.")
        }
      })
      .catch(() => {
        setError("Erro ao carregar as políticas da loja.")
      })
      .finally(() => setLoading(false))
  }, [isOpen, partnerId])

  return (
    <DefaultModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Políticas de ${storeName}`}
      maxWidth="3xl"
    >
      <div className="py-2 space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner />
          </div>
        ) : error ? (
          <div className="text-center py-10 text-brand-inactive-text dark:text-dark-body text-sm">{error}</div>
        ) : policy ? (
          <>
            <div className="text-xs text-brand-inactive-text dark:text-dark-body bg-brand-gray/50 dark:bg-dark-border/30 rounded-xl p-4 leading-relaxed">
              As políticas abaixo são de responsabilidade exclusiva do vendedor. A Dudit apenas disponibiliza a plataforma. Consulte nossos Termos de Serviço para mais informações.
            </div>

            <Tabs defaultValue="trocas" className="w-full">
              <TabsList className="px-0">
                <TabsTrigger value="trocas">Política de Trocas</TabsTrigger>
                <TabsTrigger value="informacoes">Informações adicionais</TabsTrigger>
                <TabsTrigger value="observacoes">Observações do vendedor</TabsTrigger>
              </TabsList>

              <TabsContent value="trocas" className="mt-4">
                {policy.fullPolicyText ? (
                  <div className="text-sm text-brand-inactive-text dark:text-dark-body whitespace-pre-line leading-relaxed">
                    {policy.fullPolicyText}
                  </div>
                ) : (
                  <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                    O vendedor não cadastrou uma política de trocas e devoluções.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="informacoes" className="mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <InfoItem label="Prazo de arrependimento (online)" value={`${policy.legalOnlineRegretDays} dias`} />
                  <InfoItem label="Troca por tamanho" value={policy.acceptsSizeExchange ? "Aceita" : "Não aceita"} />
                  <InfoItem label="Troca por cor" value={policy.acceptsColorExchange ? "Aceita" : "Não aceita"} />
                  <InfoItem label="Vale-compra" value={policy.acceptsStoreCredit ? "Aceita" : "Não aceita"} />
                  <InfoItem label="Devolução presencial" value={policy.acceptsInPersonReturn ? "Aceita" : "Não aceita"} />
                  <InfoItem label="Devolução por envio" value={policy.acceptsShippingReturn ? "Aceita" : "Não aceita"} />
                  <InfoItem label="Frete de devolução" value={getShippingPayerLabel(policy.shippingPayer)} />
                  {policy.commercialDeadlineDays > 0 && (
                    <InfoItem label="Prazo comercial" value={`${policy.commercialDeadlineDays} dias`} />
                  )}
                  {policy.additionalWarrantyDays > 0 && (
                    <InfoItem label="Garantia adicional" value={`${policy.additionalWarrantyDays} dias`} />
                  )}
                  {policy.slaResponseDays > 0 && (
                    <InfoItem label="Prazo de resposta (SLA)" value={`${policy.slaResponseDays} dias úteis`} />
                  )}
                </div>
              </TabsContent>

              <TabsContent value="observacoes" className="mt-4">
                {policy.commercialNotes ? (
                  <div className="bg-brand-gray/50 dark:bg-dark-border/30 rounded-xl p-4">
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body whitespace-pre-line">{policy.commercialNotes}</p>
                  </div>
                ) : (
                  <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                    O vendedor não adicionou observações.
                  </p>
                )}
              </TabsContent>
            </Tabs>

            <div className="border-t border-brand-border pt-4">
              <p className="text-xs text-brand-inactive-text dark:text-dark-body leading-relaxed">
                Em caso de divergências ou problemas relacionados a estas políticas, entre em contato diretamente com o vendedor responsável pelo anúncio.
              </p>
            </div>
          </>
        ) : null}
      </div>
    </DefaultModal>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-brand-inactive-text dark:text-dark-body">{label}</span>
      <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">{value}</span>
    </div>
  )
}
