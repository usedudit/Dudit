"use client"

import React, { useState, useCallback, useRef, useEffect } from "react"
import Link from "next/link"
import { Button, Badge, Input, InfoCard, FormSection } from "@/components/reusable"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/reusable"
import { Switch } from "@/components/reusable/Switch"
import { SkeletonLoader } from "@/components/reusable"
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
  connectEvolutionAction,
  disconnectEvolutionAction,
  getEvolutionStatusAction,
  testEvolutionConnectionAction,
  connectEvolutionInstanceAction,
  type WhatsappConnectionView,
  type WhatsappMessageView,
  type WhatsappTemplateView,
} from "@/app/actions/whatsapp"
import { motion, AnimatePresence } from "framer-motion"

// ─── Status labels ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  queued: "Na fila",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  failed: "Falhou",
  failed_permanently: "Falhou",
  connected: "Conectado",
  disconnected: "Desconectado",
  connecting: "Conectando",
  qr_pending: "Aguardando QR",
  error: "Erro",
}

const STATUS_BADGE_MAP: Record<string, "green" | "red" | "gray" | "orange"> = {
  connected: "green",
  disconnected: "gray",
  pending: "orange",
  connecting: "orange",
  qr_pending: "orange",
  error: "red",
  sent: "green",
  delivered: "green",
  read: "green",
  failed: "red",
  failed_permanently: "red",
  queued: "gray",
}

const TEMPLATE_STATUS_LABELS: Record<string, string> = {
  APPROVED: "Aprovado",
  PENDING: "Pendente",
  REJECTED: "Rejeitado",
  PAUSED: "Pausado",
  DISABLED: "Desativado",
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function WhatsAppIntegrationPage({
  initialConnection,
  initialMessages,
  initialTemplates,
  initialAllConnections,
}: {
  initialConnection: WhatsappConnectionView | null
  initialMessages: WhatsappMessageView[]
  initialTemplates: WhatsappTemplateView[]
  initialAllConnections?: WhatsappConnectionView[]
}) {
  const [connection, setConnection] = useState(initialConnection)
  const [allConnections, setAllConnections] = useState(initialAllConnections || [])
  const [messages, setMessages] = useState(initialMessages)
  const [templates, setTemplates] = useState(initialTemplates)
  const [isLoading, setIsLoading] = useState(false)
  const [testPhone, setTestPhone] = useState("")

  // Evolution-specific state
  const [evoApiUrl, setEvoApiUrl] = useState("")
  const [evoApiKey, setEvoApiKey] = useState("")
  const [evoInstanceName, setEvoInstanceName] = useState("")
  const [evoStatus, setEvoStatus] = useState<string>("disconnected")
  const [evoQrCode, setEvoQrCode] = useState<string | null>(null)
  const [evoPhoneNumber, setEvoPhoneNumber] = useState<string | null>(null)
  const [evoTestPhone, setEvoTestPhone] = useState("")
  const [evoWebhookUrl, setEvoWebhookUrl] = useState<string | null>(null)
  const [evoWebhookSecret, setEvoWebhookSecret] = useState<string | null>(null)
  const [evoIsLoading, setEvoIsLoading] = useState(false)
  const [evoShowSecret, setEvoShowSecret] = useState(false)

  // Header scroll
  const [isScrolled, setIsScrolled] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
  }, [])

  // Resolve Evolution connection from allConnections
  const evoConnection = allConnections.find((c) => c.provider === "evolution")
  const metaConnection = allConnections.find((c) => c.provider === "meta")

  // ─── Refresh ─────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    const res = await getWhatsappIntegrationAction()
    if (res.success && res.data) {
      setConnection(res.data.connection)
      setAllConnections(res.data.allConnections || [])
      setMessages(res.data.messages)
      setTemplates(res.data.templates)
    }
  }, [])

  // Initialize Evolution state from existing connection
  useEffect(() => {
    if (evoConnection) {
      setEvoStatus(evoConnection.status)
      setEvoPhoneNumber(evoConnection.phoneNumber)
      setEvoWebhookUrl(evoConnection.webhookUrl)
      if (evoConnection.apiUrl && !evoApiUrl) setEvoApiUrl(evoConnection.apiUrl)
      if (evoConnection.instanceName && !evoInstanceName) setEvoInstanceName(evoConnection.instanceName)
    }
  }, [evoConnection])

  // Polling for connection status when qr_pending or connecting to improve UX
  useEffect(() => {
    if (evoStatus !== "qr_pending" && evoStatus !== "connecting") return

    const startTime = Date.now()
    const interval = setInterval(async () => {
      // Stop polling after 5 minutes of inactivity to save resources
      if (Date.now() - startTime > 5 * 60 * 1000) {
        clearInterval(interval)
        setEvoStatus("disconnected")
        setEvoQrCode(null)
        toast.error("Tempo limite de pareamento atingido. Atualize e gere um novo QR Code.")
        return
      }

      const res = await getEvolutionStatusAction()
      if (res.success && res.data) {
        setEvoStatus(res.data.status)
        setEvoQrCode(res.data.qrCode)
        setEvoPhoneNumber(res.data.phoneNumber)
        if (res.data.status === "connected") {
          toast.success("Instância conectada com sucesso!")
          await refresh()
        }
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [evoStatus, refresh])





  // ─── Meta actions ────────────────────────────────────────────────────

  const handleDisconnect = async () => {
    if (!confirm("Desconectar integração WhatsApp (Meta)?")) return
    setIsLoading(true)
    try {
      const res = await disconnectWhatsappAction("meta")
      if (!res.success) { toast.error(res.error); return }
      toast.success("Integração Meta desconectada")
      await refresh()
    } finally { setIsLoading(false) }
  }

  const handleToggle = async (active: boolean) => {
    const res = await toggleWhatsappActiveAction(active, "meta")
    if (!res.success) { toast.error(res.error); return }
    toast.success(active ? "Automação ativada" : "Automação pausada")
    await refresh()
  }

  const handleSyncTemplates = async () => {
    setIsLoading(true)
    try {
      const res = await syncWhatsappTemplatesAction()
      if (!res.success) { toast.error(res.error); return }
      toast.success(`${res.data.synced} modelo(s) sincronizado(s)`)
      await refresh()
    } finally { setIsLoading(false) }
  }

  const handleTest = async () => {
    if (!testPhone.trim()) { toast.error("Informe um telefone para teste"); return }
    setIsLoading(true)
    try {
      const res = await sendWhatsappTestMessageAction(testPhone.trim())
      if (!res.success) { toast.error(res.error); return }
      toast.success("Mensagem de teste enviada")
      await refresh()
    } finally { setIsLoading(false) }
  }

  const handleResend = async (messageId: string) => {
    const res = await resendWhatsappMessageAction(messageId)
    if (!res.success) { toast.error(res.error); return }
    toast.success("Reenvio solicitado")
    await refresh()
  }

  // ─── Evolution actions ───────────────────────────────────────────────

  const handleEvoConnect = async () => {
    if (!evoApiUrl.trim() || !evoApiKey.trim() || !evoInstanceName.trim()) {
      toast.error("Preencha todos os campos da Evolution API")
      return
    }
    setEvoIsLoading(true)
    try {
      const res = await connectEvolutionAction({
        apiUrl: evoApiUrl.trim(),
        apiKey: evoApiKey.trim(),
        instanceName: evoInstanceName.trim(),
      })
      if (!res.success) { toast.error(res.error); return }
      toast.success("Conexão Evolution salva com sucesso")
      setEvoWebhookUrl(res.data.webhookUrl)
      setEvoWebhookSecret(res.data.webhookSecret)
      await refresh()
      // Try to connect the instance to get QR code
      await handleEvoConnectInstance()
    } finally { setEvoIsLoading(false) }
  }

  const handleEvoConnectInstance = async () => {
    setEvoIsLoading(true)
    try {
      const res = await connectEvolutionInstanceAction()
      if (!res.success) { toast.error(res.error); return }
      setEvoStatus(res.data.status)
      setEvoQrCode(res.data.qrCode)
      if (res.data.status === "connected") {
        toast.success("Instância conectada!")
        await refresh()
      }
    } finally { setEvoIsLoading(false) }
  }

  const handleEvoDisconnect = async () => {
    if (!confirm("Desconectar integração Evolution API?")) return
    setEvoIsLoading(true)
    try {
      const res = await disconnectEvolutionAction()
      if (!res.success) { toast.error(res.error); return }
      toast.success("Evolution desconectada")
      setEvoStatus("disconnected")
      setEvoQrCode(null)
      setEvoPhoneNumber(null)
      setEvoWebhookUrl(null)
      setEvoWebhookSecret(null)
      await refresh()
    } finally { setEvoIsLoading(false) }
  }

  const handleEvoRefreshStatus = async () => {
    setEvoIsLoading(true)
    try {
      const res = await getEvolutionStatusAction()
      if (!res.success) { toast.error(res.error); return }
      setEvoStatus(res.data.status)
      setEvoQrCode(res.data.qrCode)
      setEvoPhoneNumber(res.data.phoneNumber)
      if (res.data.status === "connected") {
        toast.success("Instância conectada!")
        await refresh()
      }
    } finally { setEvoIsLoading(false) }
  }

  const handleEvoTest = async () => {
    if (!evoTestPhone.trim()) { toast.error("Informe um telefone para teste"); return }
    setEvoIsLoading(true)
    try {
      const res = await testEvolutionConnectionAction(evoTestPhone.trim())
      if (!res.success) { toast.error(res.error); return }
      toast.success("Mensagem de teste enviada via Evolution")
      await refresh()
    } finally { setEvoIsLoading(false) }
  }

  const isMetaConnected = metaConnection?.hasToken && metaConnection?.status === "connected"
  const isEvoConnected = evoConnection?.status === "connected"

  return (
    <FadeIn className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

        {/* Sticky Header */}
        <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface transition-all duration-500 ease-in-out">
          <div className="max-w-[1300px] mx-auto relative px-4 md:px-6">
            {/* Back button - desktop only */}
            <div className={`absolute -left-12 top-3 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
              <Link href="/erp/settings?tab=integracoes">
                <Button variant="filled" className="w-10 h-10 p-0 flex items-center justify-center">
                  <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                </Button>
              </Link>
            </div>

            <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
              <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                  <span className="hidden md:inline truncate">WhatsApp Business</span>
                  {(isMetaConnected || isEvoConnected) && (
                    <Badge variant="green">
                      <CheckCircleIcon size={12} className="mr-1" />
                      Ativo
                    </Badge>
                  )}
                </h1>
                <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                  Automação transacional e lembretes com WhatsApp
                </div>
              </div>
            </div>

            {/* Mobile header */}
            <div className="flex md:hidden items-center gap-3 py-3">
              <Link href="/erp/settings?tab=integracoes" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover">
                <ChevronLeftIcon size={20} />
              </Link>
              <div className="flex-1 min-w-0">
                <h1 className="font-bold text-lg text-brand-dark dark:text-dark-heading truncate">WhatsApp Business</h1>
              </div>
              {(isMetaConnected || isEvoConnected) && (
                <Badge variant="green">Ativo</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">

          <Tabs defaultValue="evolution">
            <TabsList className="mb-6">
              <TabsTrigger value="evolution">
                <span className="flex items-center gap-2">
                  Evolution API
                  {isEvoConnected && (
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  )}
                </span>
              </TabsTrigger>
              <TabsTrigger value="meta">
                <span className="flex items-center gap-2">
                  WhatsApp Cloud API (Meta)
                  {isMetaConnected && (
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  )}
                </span>
              </TabsTrigger>
            </TabsList>

            {/* ─── Evolution Tab ──────────────────────────────────────────── */}
            <TabsContent value="evolution">
              <AnimatePresence mode="wait">
                <motion.div
                  key="evolution"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  {/* Connection Configuration */}
                  <div className="border border-brand-border dark:border-dark-border rounded-2xl p-5 bg-white dark:bg-dark-surface transition-all">
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#25D366] flex items-center justify-center text-white font-bold text-sm shrink-0">
                          EV
                        </div>
                        <div>
                          <h2 className="font-bold text-brand-dark dark:text-dark-heading">Evolution API</h2>
                          <p className="text-xs text-brand-inactive-text dark:text-dark-body">Conecte via Evolution API</p>
                        </div>
                      </div>
                      <Badge variant={STATUS_BADGE_MAP[evoStatus] || "gray"}>
                        {STATUS_LABELS[evoStatus] || evoStatus}
                      </Badge>
                    </div>

                    {/* Fields */}
                    {(!evoConnection || evoStatus === "disconnected" || evoStatus === "error") && (
                      <div className="space-y-4">
                        <Input
                          label="URL da Evolution API"
                          placeholder="https://evolution.seudominio.com"
                          value={evoApiUrl}
                          onChange={(e) => setEvoApiUrl(e.target.value)}
                          disabled={evoIsLoading}
                        />
                        <Input
                          label="API Key"
                          placeholder="Sua API Key da Evolution"
                          type="password"
                          value={evoApiKey}
                          onChange={(e) => setEvoApiKey(e.target.value)}
                          disabled={evoIsLoading}
                        />
                        <Input
                          label="Nome da Instância"
                          placeholder="nome-da-instancia"
                          value={evoInstanceName}
                          onChange={(e) => setEvoInstanceName(e.target.value)}
                          disabled={evoIsLoading}
                        />
                        <Button
                          onClick={handleEvoConnect}
                          disabled={evoIsLoading || !evoApiUrl || !evoApiKey || !evoInstanceName}
                          className="w-full h-[46px]"
                        >
                          {evoIsLoading ? "Conectando..." : "Conectar Evolution"}
                        </Button>
                      </div>
                    )}

                    {/* Connected / QR Pending state */}
                    {evoConnection && evoStatus !== "disconnected" && evoStatus !== "error" && (
                      <div className="space-y-4">
                        {/* Status info */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <span className="text-xs text-brand-inactive-text dark:text-dark-body block mb-1">Instância</span>
                            <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">{evoConnection.instanceName || "—"}</span>
                          </div>
                          <div>
                            <span className="text-xs text-brand-inactive-text dark:text-dark-body block mb-1">Telefone</span>
                            <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">{evoPhoneNumber || evoConnection.phoneNumber || "—"}</span>
                          </div>
                          <div>
                            <span className="text-xs text-brand-inactive-text dark:text-dark-body block mb-1">URL da API</span>
                            <span className="text-sm font-medium text-brand-dark dark:text-dark-heading truncate block">{evoConnection.apiUrl || "—"}</span>
                          </div>
                          <div>
                            <span className="text-xs text-brand-inactive-text dark:text-dark-body block mb-1">Status</span>
                            <Badge variant={STATUS_BADGE_MAP[evoStatus] || "gray"}>
                              {STATUS_LABELS[evoStatus] || evoStatus}
                            </Badge>
                          </div>
                        </div>

                        {/* QR Code */}
                        {evoQrCode && evoStatus === "qr_pending" && (
                          <div className="bg-brand-gray dark:bg-dark-border/30 rounded-2xl p-6 flex flex-col items-center gap-4">
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body text-center">
                              Escaneie o QR Code com o WhatsApp para conectar
                            </p>
                            <div className="bg-white p-4 rounded-xl">
                              <img
                                src={evoQrCode.startsWith("data:") ? evoQrCode : `data:image/png;base64,${evoQrCode}`}
                                alt="QR Code"
                                className="w-64 h-64 object-contain"
                              />
                            </div>
                            <Button variant="outline" onClick={handleEvoRefreshStatus} disabled={evoIsLoading}>
                              Atualizar status
                            </Button>
                          </div>
                        )}

                        {/* Webhook info (shown after connect) */}
                        {(evoWebhookUrl || evoConnection.webhookUrl) && (
                          <div className="bg-brand-gray dark:bg-dark-border/30 rounded-xl p-4 space-y-3">
                            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading">Configuração do Webhook</h3>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                              Configure esta URL e secret no painel da Evolution API para receber eventos em tempo real.
                            </p>
                            <div>
                              <span className="text-xs text-brand-inactive-text dark:text-dark-body block mb-1">URL do Webhook</span>
                              <div className="flex items-center gap-2">
                                <code className="text-xs bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-lg px-3 py-2 flex-1 truncate">
                                  {evoWebhookUrl || evoConnection.webhookUrl}
                                </code>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    navigator.clipboard.writeText(evoWebhookUrl || evoConnection.webhookUrl || "")
                                    toast.success("URL copiada")
                                  }}
                                >
                                  Copiar
                                </Button>
                              </div>
                            </div>
                            {evoWebhookSecret && (
                              <div>
                                <span className="text-xs text-brand-inactive-text dark:text-dark-body block mb-1">Webhook Secret</span>
                                <div className="flex items-center gap-2">
                                  <code className="text-xs bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-lg px-3 py-2 flex-1 truncate">
                                    {evoShowSecret ? evoWebhookSecret : "••••••••••••••••"}
                                  </code>
                                  <Button variant="outline" size="sm" onClick={() => setEvoShowSecret(!evoShowSecret)}>
                                    {evoShowSecret ? "Ocultar" : "Mostrar"}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      navigator.clipboard.writeText(evoWebhookSecret)
                                      toast.success("Secret copiado")
                                    }}
                                  >
                                    Copiar
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Actions */}
                        <hr className="border-brand-border dark:border-dark-border" />

                        <div className="space-y-3">
                          {evoStatus !== "connected" && evoStatus !== "qr_pending" && (
                            <Button
                              variant="outline"
                              onClick={handleEvoConnectInstance}
                              disabled={evoIsLoading}
                              className="w-full h-[42px]"
                            >
                              {evoIsLoading ? "Conectando..." : "Gerar QR Code"}
                            </Button>
                          )}

                          {evoStatus === "connected" && (
                            <div>
                              <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">Testar envio</h3>
                              <div className="flex gap-2">
                                <Input
                                  placeholder="Telefone para teste (com DDD)"
                                  value={evoTestPhone}
                                  onChange={(e) => setEvoTestPhone(e.target.value)}
                                  disabled={evoIsLoading}
                                />
                                <Button variant="outline" onClick={handleEvoTest} disabled={evoIsLoading || !evoTestPhone.trim()}>
                                  Testar
                                </Button>
                              </div>
                            </div>
                          )}

                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={handleEvoRefreshStatus}
                              disabled={evoIsLoading}
                              className="flex-1 h-[42px]"
                            >
                              Atualizar status
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={handleEvoDisconnect}
                              disabled={evoIsLoading}
                              className="flex-1 h-[42px]"
                            >
                              Desconectar
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>
            </TabsContent>

            {/* ─── Meta Tab ───────────────────────────────────────────────── */}
            <TabsContent value="meta">
              <AnimatePresence mode="wait">
                <motion.div
                  key="meta"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  {/* Connection Card */}
                  <div className="border border-brand-border dark:border-dark-border rounded-2xl p-5 bg-white dark:bg-dark-surface transition-all">
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#25D366] flex items-center justify-center text-white font-bold text-sm shrink-0">
                          WA
                        </div>
                        <div>
                          <h2 className="font-bold text-brand-dark dark:text-dark-heading">WhatsApp Cloud API</h2>
                          <p className="text-xs text-brand-inactive-text dark:text-dark-body">API Oficial da Meta</p>
                        </div>
                      </div>
                      <Badge variant={isMetaConnected ? "green" : "gray"}>
                        {isMetaConnected ? "Conectado" : "Desconectado"}
                      </Badge>
                    </div>

                    <p className="text-sm text-brand-inactive-text dark:text-dark-body mb-4 leading-relaxed">
                      Conecte o número oficial do seu negócio com um clique. Você será redirecionado para autorizar na Meta — sem precisar copiar tokens ou configurar webhooks.
                    </p>

                    {!isMetaConnected ? (
                      <WhatsappConnectButton onSuccess={refresh} className="w-full" />
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {metaConnection?.wabaName && (
                            <div>
                              <span className="text-xs text-brand-inactive-text dark:text-dark-body block mb-1">Conta WhatsApp</span>
                              <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">{metaConnection.wabaName}</span>
                            </div>
                          )}
                          {metaConnection?.phoneNumber && (
                            <div>
                              <span className="text-xs text-brand-inactive-text dark:text-dark-body block mb-1">Número</span>
                              <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">{metaConnection.phoneNumber}</span>
                            </div>
                          )}
                          {metaConnection?.lastSyncedAt && (
                            <div>
                              <span className="text-xs text-brand-inactive-text dark:text-dark-body block mb-1">Última sincronização</span>
                              <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                                {new Date(metaConnection.lastSyncedAt).toLocaleString("pt-BR")}
                              </span>
                            </div>
                          )}
                        </div>

                        <hr className="border-brand-border dark:border-dark-border" />

                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">Automação ativa</span>
                          <Switch checked={metaConnection?.isActive || false} onCheckedChange={handleToggle} />
                        </div>

                        <div>
                          <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">Testar envio</h3>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Telefone para teste (com DDD)"
                              value={testPhone}
                              onChange={(e) => setTestPhone(e.target.value)}
                              disabled={isLoading}
                            />
                            <Button variant="outline" onClick={handleTest} disabled={isLoading || !testPhone.trim()}>
                              Testar
                            </Button>
                          </div>
                        </div>

                        <Button variant="destructive" onClick={handleDisconnect} disabled={isLoading} className="w-full h-[42px]">
                          Desconectar
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Templates */}
                  {isMetaConnected && (
                    <div className="border border-brand-border dark:border-dark-border rounded-2xl p-5 bg-white dark:bg-dark-surface transition-all">
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <div>
                          <h2 className="font-bold text-brand-dark dark:text-dark-heading">Modelos de mensagem</h2>
                          <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">
                            Modelos aprovados na sua conta Meta.
                          </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={handleSyncTemplates} disabled={isLoading}>
                          Sincronizar
                        </Button>
                      </div>
                      {templates.length === 0 ? (
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhum modelo sincronizado ainda.</p>
                      ) : (
                        <ul className="divide-y divide-brand-border dark:divide-dark-border">
                          {templates.map((t) => (
                            <li key={t.id} className="py-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="font-medium text-sm text-brand-dark dark:text-dark-heading">{t.templateName}</p>
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body">
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
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </TabsContent>
          </Tabs>

          {/* ─── Message History (shared across providers) ───────────────── */}
          <div className="border border-brand-border dark:border-dark-border rounded-2xl p-5 bg-white dark:bg-dark-surface transition-all mt-6">
            <h2 className="font-bold text-brand-dark dark:text-dark-heading mb-4">Histórico de mensagens</h2>
            {messages.length === 0 ? (
              <p className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhuma mensagem enviada ainda.</p>
            ) : (
              <ul className="divide-y divide-brand-border dark:divide-dark-border">
                {messages.map((msg) => (
                  <li
                    key={msg.id}
                    className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-brand-dark dark:text-dark-heading">{msg.phoneNumber}</p>
                      <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                        {msg.templateName || msg.messageType} · {new Date(msg.createdAt).toLocaleString("pt-BR")}
                      </p>
                      {msg.errorMessage && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{msg.errorMessage}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={
                          msg.status === "failed" || msg.status === "failed_permanently"
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
          </div>
        </div>
      </div>
    </FadeIn>
  )
}
