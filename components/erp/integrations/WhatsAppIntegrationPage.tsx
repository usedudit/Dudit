"use client"

import React, { useState, useCallback, useRef, useEffect } from "react"
import Link from "next/link"
import { Button, Badge, Input, InfoCard, FormSection, ListItem, IconPlaceholder } from "@/components/reusable"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/reusable"
import { Switch } from "@/components/reusable/Switch"
import { FadeIn } from "@/components/animations/FadeIn"
import { ChevronLeftIcon, CheckCircleIcon, QRCodeIcon } from "@/lib/icons"
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
  isEvolutionConfiguredAction,
  resetEvolutionPairingStatusAction,
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

  // Evolution-specific state (simplified - no manual config)
  const [evoStatus, setEvoStatus] = useState<string>("disconnected")
  const [evoQrCode, setEvoQrCode] = useState<string | null>(null)
  const [evoPhoneNumber, setEvoPhoneNumber] = useState<string | null>(null)
  const [evoTestPhone, setEvoTestPhone] = useState("")
  const [evoIsLoading, setEvoIsLoading] = useState(false)
  const [evoConfigured, setEvoConfigured] = useState<boolean | null>(null)

  // Keep track of latest evoStatus in a ref for unmount cleanup
  const evoStatusRef = useRef(evoStatus)
  useEffect(() => {
    evoStatusRef.current = evoStatus
  }, [evoStatus])

  // Cleanup pairing status when component unmounts if it is still pairing
  useEffect(() => {
    return () => {
      if (evoStatusRef.current === "qr_pending" || evoStatusRef.current === "connecting") {
        resetEvolutionPairingStatusAction().catch((err) => {
          console.error("Failed to reset Evolution pairing status on unmount:", err)
        })
      }
    }
  }, [])

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

  // Check if Evolution is configured on mount
  useEffect(() => {
    isEvolutionConfiguredAction().then((res) => {
      if (res.success && res.data) {
        setEvoConfigured(res.data.configured)
      }
    })
  }, [])

  // Initialize Evolution state from existing connection
  useEffect(() => {
    if (evoConnection) {
      // Prevent database status from overriding the local "connected" state
      // unless the database connection is actually disconnected or error.
      if (evoStatus !== "connected" || evoConnection.status === "disconnected" || evoConnection.status === "error") {
        setEvoStatus(evoConnection.status)
      }
      setEvoPhoneNumber(evoConnection.phoneNumber)
    }
  }, [evoConnection, evoStatus])

  // Polling for connection status when qr_pending or connecting
  useEffect(() => {
    if (evoStatus !== "qr_pending" && evoStatus !== "connecting") return

    const startTime = Date.now()
    const interval = setInterval(async () => {
      if (Date.now() - startTime > 5 * 60 * 1000) {
        clearInterval(interval)
        setEvoStatus("disconnected")
        setEvoQrCode(null)
        toast.error("Tempo limite de pareamento atingido. Gere um novo QR Code.")
        return
      }

      const res = await getEvolutionStatusAction()
      if (res.success && res.data) {
        setEvoStatus(res.data.status)
        if (res.data.status === "connected") {
          setEvoQrCode(null)
        } else if (res.data.qrCode) {
          setEvoQrCode(res.data.qrCode)
        }
        setEvoPhoneNumber(res.data.phoneNumber)
        if (res.data.status === "connected") {
          toast.success("WhatsApp conectado com sucesso!")
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

  // ─── Evolution actions (simplified - zero config) ───────────────────

  const handleEvoConnect = async () => {
    setEvoIsLoading(true)
    try {
      const res = await connectEvolutionAction()
      if (!res.success) { toast.error(res.error); return }
      setEvoStatus(res.data.status)
      setEvoQrCode(res.data.qrCode)
      if (res.data.status === "connected") {
        toast.success("WhatsApp conectado com sucesso!")
      }
      await refresh()
    } finally { setEvoIsLoading(false) }
  }

  const handleCancelEvoConnect = async () => {
    setEvoIsLoading(true)
    try {
      const res = await resetEvolutionPairingStatusAction()
      if (res.success) {
        setEvoStatus("disconnected")
        setEvoQrCode(null)
        toast.success("Conexão cancelada.")
        await refresh()
      } else {
        toast.error(res.error)
      }
    } finally {
      setEvoIsLoading(false)
    }
  }

  const handleEvoDisconnect = async () => {
    if (!confirm("Desconectar WhatsApp (Evolution)?")) return
    setEvoIsLoading(true)
    try {
      const res = await disconnectEvolutionAction()
      if (!res.success) { toast.error(res.error); return }
      toast.success("WhatsApp desconectado")
      setEvoStatus("disconnected")
      setEvoQrCode(null)
      setEvoPhoneNumber(null)
      await refresh()
    } finally { setEvoIsLoading(false) }
  }

  const handleEvoRefreshStatus = async () => {
    setEvoIsLoading(true)
    try {
      const res = await getEvolutionStatusAction()
      if (!res.success) { toast.error(res.error); return }
      setEvoStatus(res.data.status)
      if (res.data.status === "connected") {
        setEvoQrCode(null)
      } else if (res.data.qrCode) {
        setEvoQrCode(res.data.qrCode)
      }
      setEvoPhoneNumber(res.data.phoneNumber)
      if (res.data.status === "connected") {
        toast.success("WhatsApp conectado!")
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
                  {/* Not configured */}
                  {evoConfigured === false && (
                    <div className="border border-brand-border dark:border-dark-border rounded-2xl p-5 bg-white dark:bg-dark-surface transition-all">
                      <InfoCard
                        color="orange"
                        message={<>Integração Evolution API não disponível. As variáveis de ambiente <strong>EVOLUTION_API_URL</strong> e <strong>EVOLUTION_API_KEY</strong> não estão configuradas no servidor.</>}
                      />
                    </div>
                  )}

                  {/* Loading config check */}
                  {evoConfigured === null && (
                    <div className="border border-brand-border dark:border-dark-border rounded-2xl p-5 bg-white dark:bg-dark-surface transition-all flex items-center justify-center py-8">
                      <div className="w-6 h-6 border-2 border-brand-border border-t-brand-dark rounded-full animate-spin" />
                    </div>
                  )}

                  {evoConfigured === true && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">

                      {/* Left Column - FormSection with borderless ListItem */}
                      <div className="border border-brand-border dark:border-dark-border rounded-2xl p-6 bg-white dark:bg-dark-surface transition-all">
                        <FormSection title="Integração Evolution">
                          <ListItem
                            className="border-none bg-transparent hover:border-none p-0 cursor-default pointer-events-none"
                            icon={
                              <div className="w-12 h-12 rounded-full bg-[#25D366]/10 flex items-center justify-center text-[#25D366] font-bold shrink-0">
                                WA
                              </div>
                            }
                            title={
                              evoStatus === "connected"
                                ? (evoPhoneNumber || evoConnection?.phoneNumber || "WhatsApp Conectado")
                                : "Sem conexão ativa"
                            }
                            description={
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-brand-inactive-text dark:text-dark-body">Status:</span>
                                <Badge variant={STATUS_BADGE_MAP[evoStatus] || "gray"}>
                                  {STATUS_LABELS[evoStatus] || evoStatus}
                                </Badge>
                              </div>
                            }
                          />
                        </FormSection>
                      </div>

                      {/* Right Column - Dynamic IconPlaceholder, QR code, and buttons */}
                      <div className="border border-brand-border dark:border-dark-border rounded-2xl p-6 bg-white dark:bg-dark-surface transition-all flex flex-col items-center justify-center min-h-[300px]">

                        {/* 1. Connected State */}
                        {evoStatus === "connected" && (
                          <div className="flex flex-col items-center gap-6 w-full">
                            <IconPlaceholder
                              icon={CheckCircleIcon}
                              title="WhatsApp Conectado"
                              subtitle={`Seu WhatsApp (${evoPhoneNumber || evoConnection?.phoneNumber || ""}) está pareado e pronto para o envio de mensagens.`}
                            />

                            <div className="w-full max-w-sm border border-brand-border dark:border-dark-border rounded-2xl p-5 bg-brand-gray/30 dark:bg-dark-surface/50">
                              <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">Testar envio de mensagem</h3>
                              <div className="flex gap-2 mb-4">
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
                              <Button variant="destructive" onClick={handleEvoDisconnect} disabled={evoIsLoading} className="w-full h-[42px]">
                                Desconectar WhatsApp
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* 2. Disconnected / Error State */}
                        {(evoStatus === "disconnected" || evoStatus === "error") && !evoQrCode && (
                          <IconPlaceholder
                            icon={QRCodeIcon}
                            title="WhatsApp Desconectado"
                            subtitle="Conecte seu WhatsApp para habilitar o envio de notificações e lembretes."
                            buttons={[
                              {
                                text: evoIsLoading ? "Conectando..." : "Conectar WhatsApp",
                                action: handleEvoConnect,
                                disabled: evoIsLoading,
                                className: "w-full max-w-xs h-[46px]"
                              }
                            ]}
                          />
                        )}

                        {/* 3. Connecting / QR Pending / Pairing State */}
                        {((evoStatus === "qr_pending" || evoStatus === "connecting") || evoQrCode) && evoStatus !== "connected" && (
                          <div className="flex flex-col items-center justify-center text-center w-full">
                            <IconPlaceholder
                              icon={QRCodeIcon}
                              title="Escaneie o QR Code"
                              subtitle="Abra o WhatsApp > Aparelhos Conectados > Conectar um Aparelho"
                            />
                            {evoQrCode ? (
                              <div className="mt-6 bg-white p-4 rounded-2xl border border-brand-border dark:border-dark-border shadow-sm">
                                <img
                                  src={evoQrCode.startsWith("data:") ? evoQrCode : `data:image/png;base64,${evoQrCode}`}
                                  alt="QR Code"
                                  className="w-64 h-64 object-contain mx-auto"
                                />
                              </div>
                            ) : (
                              <div className="mt-8 flex flex-col items-center justify-center gap-3 py-10">
                                <div className="w-8 h-8 border-2 border-brand-border border-t-brand-dark rounded-full animate-spin" />
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body">Gerando QR Code...</p>
                              </div>
                            )}
                            <div className="flex gap-3 mt-6 w-full max-w-xs justify-center">
                              <Button variant="outline" onClick={handleCancelEvoConnect} disabled={evoIsLoading} className="flex-1 h-[42px]">
                                Cancelar
                              </Button>
                              <Button variant="outline" onClick={handleEvoConnect} disabled={evoIsLoading} className="flex-1 h-[42px]">
                                Regerar QR
                              </Button>
                            </div>
                          </div>
                        )}

                      </div>
                    </div>
                  )}
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
                      Conecte o número oficial do seu negócio com um clique. Você será redirecionado para autorizar na Meta - sem precisar copiar tokens ou configurar webhooks.
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
                                {TEMPLATE_STATUS_LABELS[t.approvalStatus || ""] || t.approvalStatus || "-"}
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

        </div>
      </div>
    </FadeIn>
  )
}
