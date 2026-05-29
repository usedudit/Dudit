"use client"

import React, { useState, useCallback } from "react"
import Link from "next/link"
import { Button, Badge } from "@/components/reusable"
import { Switch } from "@/components/reusable/Switch"
import { FadeIn } from "@/components/animations/FadeIn"
import { ChevronLeftIcon, CheckCircleIcon } from "@/lib/icons"
import { toast } from "@/hooks/use-notification"
import {
  connectWhatsappAction,
  disconnectWhatsappAction,
  toggleWhatsappActiveAction,
  sendWhatsappTestMessageAction,
  resendWhatsappMessageAction,
  getWhatsappIntegrationAction,
  type WhatsappConnectionView,
  type WhatsappMessageView,
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

export function WhatsAppIntegrationPage({
  partnerId,
  initialConnection,
  initialMessages,
}: {
  partnerId: string
  initialConnection: WhatsappConnectionView | null
  initialMessages: WhatsappMessageView[]
}) {
  const [connection, setConnection] = useState(initialConnection)
  const [messages, setMessages] = useState(initialMessages)
  const [isLoading, setIsLoading] = useState(false)
  const [accessToken, setAccessToken] = useState("")
  const [phoneNumberId, setPhoneNumberId] = useState(connection?.phoneNumberId || "")
  const [businessAccountId, setBusinessAccountId] = useState(connection?.businessAccountId || "")
  const [phoneNumber, setPhoneNumber] = useState(connection?.phoneNumber || "")
  const [testPhone, setTestPhone] = useState("")
  const [provider, setProvider] = useState<"meta" | "evolution" | "twilio">("meta")

  const refresh = useCallback(async () => {
    const res = await getWhatsappIntegrationAction()
    if (res.success) {
      setConnection(res.data.connection)
      setMessages(res.data.messages)
    }
  }, [])

  const handleConnect = async () => {
    setIsLoading(true)
    try {
      const res = await connectWhatsappAction({
        provider,
        accessToken,
        phoneNumberId,
        businessAccountId: businessAccountId || undefined,
        phoneNumber: phoneNumber || undefined,
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success("WhatsApp conectado com sucesso")
      setAccessToken("")
      await refresh()
    } finally {
      setIsLoading(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm("Desconectar integração WhatsApp?")) return
    setIsLoading(true)
    try {
      const res = await disconnectWhatsappAction(provider)
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
    const res = await toggleWhatsappActiveAction(active, provider)
    if (!res.success) {
      toast.error(res.error)
      return
    }
    toast.success(active ? "Automação ativada" : "Automação pausada")
    await refresh()
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
            Automação transacional e lembretes com whatsapp
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
        <SectionCard title="Provedor">
          <p className="text-sm text-brand-inactive-text mb-4">
            Conecte o número oficial do seu negócio via WhatsApp Cloud API (Meta). Evolution API e Twilio em breve.
          </p>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as typeof provider)}
            className="w-full border border-brand-border dark:border-dark-border rounded-lg px-3 py-2 bg-white dark:bg-dark-surface text-sm mb-4"
            disabled={isConnected}
          >
            <option value="meta">WhatsApp Cloud API (Meta)</option>
            <option value="evolution" disabled>Evolution API (em breve)</option>
            <option value="twilio" disabled>Twilio WhatsApp (em breve)</option>
          </select>

          {!isConnected ? (
            <div className="space-y-3">
              <input
                type="password"
                placeholder="Token de acesso permanente"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                className="w-full border border-brand-border dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface"
              />
              <input
                placeholder="Phone Number ID"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                className="w-full border border-brand-border dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface"
              />
              <input
                placeholder="Business Account ID (opcional)"
                value={businessAccountId}
                onChange={(e) => setBusinessAccountId(e.target.value)}
                className="w-full border border-brand-border dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface"
              />
              <input
                placeholder="Número exibido (opcional)"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full border border-brand-border dark:border-dark-border rounded-lg px-3 py-2 text-sm bg-white dark:bg-dark-surface"
              />
              <Button onClick={handleConnect} disabled={isLoading} className="w-full">
                Conectar WhatsApp
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm space-y-1">
                <p>
                  <span className="text-brand-inactive-text">Status:</span>{" "}
                  {STATUS_LABELS[connection.status] || connection.status}
                </p>
                {connection.phoneNumber && (
                  <p>
                    <span className="text-brand-inactive-text">Número:</span> {connection.phoneNumber}
                  </p>
                )}
                <p>
                  <span className="text-brand-inactive-text">Phone Number ID:</span> {connection.phoneNumberId}
                </p>
              </div>

              <div className="flex items-center justify-between py-2 border-t border-brand-border dark:border-dark-border">
                <span className="text-sm font-medium">Automação ativa</span>
                <Switch checked={connection.isActive} onCheckedChange={handleToggle} />
              </div>

              <div className="rounded-lg bg-gray-50 dark:bg-dark-hover p-3 text-xs break-all">
                <p className="font-semibold mb-1">URL do Webhook</p>
                <p className="text-brand-inactive-text">{connection.webhookUrl}</p>
                {connection.webhookVerifyToken && (
                  <>
                    <p className="font-semibold mt-2 mb-1">Verify Token</p>
                    <p className="font-mono">{connection.webhookVerifyToken}</p>
                  </>
                )}
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
