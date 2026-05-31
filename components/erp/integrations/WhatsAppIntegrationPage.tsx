"use client"

import React, { useState, useCallback } from "react"
import Link from "next/link"
import { Button, Badge } from "@/components/reusable"
import { Switch } from "@/components/reusable/Switch"
import { FadeIn } from "@/components/animations/FadeIn"
import { ChevronLeftIcon, CheckCircleIcon } from "@/lib/icons"
import { toast } from "@/hooks/use-notification"
import { WhatsappConnectButton } from "@/components/erp/integrations/WhatsappConnectButton"
import {
  disconnectWhatsappAction,
  toggleWhatsappActiveAction,
  sendWhatsappTestMessageAction,
  resendWhatsappMessageAction,
  getWhatsappIntegrationAction,
  syncWhatsappTemplatesAction,
  type WhatsappConnectionView,
  type WhatsappMessageView,
  type WhatsappTemplateView,
} from "@/app/actions/whatsapp"

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-brand-border dark:border-dark-border rounded-xl p-5 bg-white dark:bg-dark-surface">
      <h2 className="font-bold text-brand-dark dark:text-dark-heading mb-4">{title}</h2>
      {children}
    </div>
  )
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  queued: "Na fila",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  failed: "Falhou",
  connected: "Conectado",
  disconnected: "Desconectado",
  error: "Erro",
}

const TEMPLATE_STATUS_LABELS: Record<string, string> = {
  APPROVED: "Aprovado",
  PENDING: "Pendente",
  REJECTED: "Rejeitado",
  PAUSED: "Pausado",
  DISABLED: "Desativado",
}

export function WhatsAppIntegrationPage({
  initialConnection,
  initialMessages,
  initialTemplates,
}: {
  initialConnection: WhatsappConnectionView | null
  initialMessages: WhatsappMessageView[]
  initialTemplates: WhatsappTemplateView[]
}) {
  const [connection, setConnection] = useState(initialConnection)
  const [messages, setMessages] = useState(initialMessages)
  const [templates, setTemplates] = useState(initialTemplates)
  const [isLoading, setIsLoading] = useState(false)
  const [testPhone, setTestPhone] = useState("")

  const refresh = useCallback(async () => {
    const res = await getWhatsappIntegrationAction()
    if (res.success) {
      setConnection(res.data.connection)
      setMessages(res.data.messages)
      setTemplates(res.data.templates)
    }
  }, [])

  const handleDisconnect = async () => {
    if (!confirm("Desconectar integração WhatsApp?")) return
    setIsLoading(true)
    try {
      const res = await disconnectWhatsappAction("meta")
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success("Integração desconectada")
      await refresh()
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggle = async (active: boolean) => {
    const res = await toggleWhatsappActiveAction(active, "meta")
    if (!res.success) {
      toast.error(res.error)
      return
    }
    toast.success(active ? "Automação ativada" : "Automação pausada")
    await refresh()
  }

  const handleSyncTemplates = async () => {
    setIsLoading(true)
    try {
      const res = await syncWhatsappTemplatesAction()
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success(`${res.data.synced} modelo(s) sincronizado(s)`)
      await refresh()
    } finally {
      setIsLoading(false)
    }
  }

  const handleTest = async () => {
    if (!testPhone.trim()) {
      toast.error("Informe um telefone para teste")
      return
    }
    setIsLoading(true)
    try {
      const res = await sendWhatsappTestMessageAction(testPhone.trim())
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success("Mensagem de teste enviada")
      await refresh()
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async (messageId: string) => {
    const res = await resendWhatsappMessageAction(messageId)
    if (!res.success) {
      toast.error(res.error)
      return
    }
    toast.success("Reenvio solicitado")
    await refresh()
  }

  const isConnected = connection?.hasToken && connection.status === "connected"

  return (
    <FadeIn className="flex flex-col h-full bg-brand-background dark:bg-dark-background">
      <div className="sticky top-0 z-10 bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border px-4 py-3 flex items-center gap-3">
        <Link href="/erp/settings?tab=integracoes" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover">
          <ChevronLeftIcon size={20} />
        </Link>
        <div>
          <h1 className="font-bold text-lg text-brand-dark dark:text-dark-heading">WhatsApp Business</h1>
          <p className="text-sm text-brand-inactive-text dark:text-dark-body">
            Automação transacional e lembretes com WhatsApp
          </p>
        </div>
        {isConnected && connection?.isActive && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircleIcon size={12} />
            Ativo
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 max-w-3xl mx-auto w-full">
        <SectionCard title="Conexão">
          <p className="text-sm text-brand-inactive-text mb-4">
            Conecte o número oficial do seu negócio com um clique. Você será redirecionado para autorizar na Meta — sem
            precisar copiar tokens ou configurar webhooks.
          </p>

          {!isConnected ? (
            <WhatsappConnectButton onSuccess={refresh} className="w-full" />
          ) : (
            <div className="space-y-4">
              <div className="text-sm space-y-1">
                <p>
                  <span className="text-brand-inactive-text">Status:</span>{" "}
                  {STATUS_LABELS[connection.status] || connection.status}
                </p>
                {connection.wabaName && (
                  <p>
                    <span className="text-brand-inactive-text">Conta WhatsApp:</span> {connection.wabaName}
                  </p>
                )}
                {connection.phoneNumber && (
                  <p>
                    <span className="text-brand-inactive-text">Número:</span> {connection.phoneNumber}
                  </p>
                )}
                {connection.lastSyncedAt && (
                  <p>
                    <span className="text-brand-inactive-text">Última sincronização:</span>{" "}
                    {new Date(connection.lastSyncedAt).toLocaleString("pt-BR")}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between py-2 border-t border-brand-border dark:border-dark-border">
                <span className="text-sm font-medium">Automação ativa</span>
                <Switch checked={connection.isActive} onCheckedChange={handleToggle} />
              </div>

              <div className="flex gap-2">
                <input
                  placeholder="Telefone para teste (com DDD)"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="flex-1 border border-brand-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <Button variant="outline" onClick={handleTest} disabled={isLoading}>
                  Testar
                </Button>
              </div>

              <Button variant="destructive" onClick={handleDisconnect} disabled={isLoading} className="w-full">
                Desconectar
              </Button>
            </div>
          )}
        </SectionCard>

        {isConnected && (
          <SectionCard title="Modelos de mensagem">
            <div className="flex items-center justify-between gap-3 mb-4">
              <p className="text-sm text-brand-inactive-text">
                Modelos aprovados na sua conta Meta. As automações do Dudit usam nomes específicos — confira se estão
                listados e aprovados.
              </p>
              <Button variant="outline" size="sm" onClick={handleSyncTemplates} disabled={isLoading}>
                Sincronizar
              </Button>
            </div>
            {templates.length === 0 ? (
              <p className="text-sm text-brand-inactive-text">Nenhum modelo sincronizado ainda.</p>
            ) : (
              <ul className="divide-y divide-brand-border dark:divide-dark-border">
                {templates.map((t) => (
                  <li key={t.id} className="py-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-sm">{t.templateName}</p>
                      <p className="text-xs text-brand-inactive-text">
                        {t.language} · {t.category}
                      </p>
                    </div>
                    <Badge
                      variant={
                        t.approvalStatus === "APPROVED" ? "green" : t.approvalStatus === "REJECTED" ? "red" : "gray"
                      }
                    >
                      {TEMPLATE_STATUS_LABELS[t.approvalStatus || ""] || t.approvalStatus || "—"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        )}

        <SectionCard title="Histórico de mensagens">
          {messages.length === 0 ? (
            <p className="text-sm text-brand-inactive-text">Nenhuma mensagem enviada ainda.</p>
          ) : (
            <ul className="divide-y divide-brand-border dark:divide-dark-border">
              {messages.map((msg) => (
                <li
                  key={msg.id}
                  className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-sm">{msg.phoneNumber}</p>
                    <p className="text-xs text-brand-inactive-text">
                      {msg.templateName || msg.messageType} ·{" "}
                      {new Date(msg.createdAt).toLocaleString("pt-BR")}
                    </p>
                    {msg.errorMessage && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">{msg.errorMessage}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        msg.status === "failed"
                          ? "red"
                          : msg.status === "delivered" || msg.status === "read"
                            ? "green"
                            : "gray"
                      }
                    >
                      {STATUS_LABELS[msg.status] || msg.status}
                    </Badge>
                    {msg.status === "failed" && (
                      <Button size="sm" variant="outline" onClick={() => handleResend(msg.id)}>
                        Reenviar
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </FadeIn>
  )
}
