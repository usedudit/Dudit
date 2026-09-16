"use client"

import { useState } from "react"
import {
  ShieldIcon,
  AlertTriangleIcon,
  BellIcon,
  CopyIcon,
  ReloadIcon,
  GlobeIcon,
  TelegramIcon,
  InfoIcon,
  LockIcon,
  ArrowRightIcon,
  XIcon,
} from "@/lib/icons"
import { format } from "date-fns"
import {
  Button,
  Badge,
  Input,
  FormTextarea,
  Checkbox,
  FormSection,
  InfoCard,
  AlertModal,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  DatePicker,
  TimePicker,
} from "@/components/reusable"
import { Switch } from "@/components/reusable/Switch"
import {
  updateMaintenanceModeAdminAction,
  updateGlobalAnnouncementAdminAction,
  sendMaintenanceBroadcastAdminAction,
} from "@/app/actions/admin/system"
import { toDateTimeInputValue } from "@/lib/date"
import type {
  MaintenanceConfig,
  GlobalAnnouncementConfig,
  AnnouncementType,
  SystemSettingsState,
} from "@/lib/system/types"

const combineLocalToISO = (date: string, time: string) => {
  if (!date) return null
  return new Date(`${date}T${time || "00:00"}`).toISOString()
}

interface SystemMaintenancePageProps {
  initialState: SystemSettingsState
}

export function SystemMaintenancePage({ initialState }: SystemMaintenancePageProps) {
  const [maintenance, setMaintenance] = useState<MaintenanceConfig>(initialState.maintenance)
  const [isSavingMaintenance, setIsSavingMaintenance] = useState(false)
  const [maintenanceFeedback, setMaintenanceFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [pendingMaintenanceToggle, setPendingMaintenanceToggle] = useState<boolean | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)

  const [announcement, setAnnouncement] = useState<GlobalAnnouncementConfig>(initialState.announcement)
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false)
  const [announcementFeedback, setAnnouncementFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null)

  const [broadcastTitle, setBroadcastTitle] = useState("Aviso de Manutenção Programada")
  const [broadcastMessage, setBroadcastMessage] = useState("A plataforma Dudit passará por uma rápida manutenção hoje. Voltaremos em breve com novidades!")
  const [broadcastAudience, setBroadcastAudience] = useState<"all" | "partners" | "customers">("all")
  const [broadcastSendPush, setBroadcastSendPush] = useState(true)
  const [broadcastSendInApp, setBroadcastSendInApp] = useState(true)
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false)
  const [broadcastFeedback, setBroadcastFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null)
  const [showBroadcastConfirm, setShowBroadcastConfirm] = useState(false)

  const [copiedHtml, setCopiedHtml] = useState(false)

  const handleToggleMaintenance = (enabled: boolean) => {
    setPendingMaintenanceToggle(enabled)
    setShowConfirmModal(true)
  }

  const confirmMaintenanceToggle = async () => {
    if (pendingMaintenanceToggle === null) return
    setShowConfirmModal(false)
    setIsSavingMaintenance(true)
    setMaintenanceFeedback(null)

    try {
      const updated = { ...maintenance, enabled: pendingMaintenanceToggle }
      const res = await updateMaintenanceModeAdminAction(updated)
      if (res.success && res.config) {
        setMaintenance(res.config)
        setMaintenanceFeedback({
          type: "success",
          msg: pendingMaintenanceToggle
            ? "Modo Manutenção ATIVADO com sucesso. Usuários comuns agora recebem status 503."
            : "Modo Manutenção DESATIVADO. Acesso público restaurado!",
        })
      } else {
        setMaintenanceFeedback({ type: "error", msg: res.error || "Falha ao atualizar manutenção." })
      }
    } catch {
      setMaintenanceFeedback({ type: "error", msg: "Erro ao comunicar com o servidor." })
    } finally {
      setIsSavingMaintenance(false)
      setPendingMaintenanceToggle(null)
    }
  }

  const handleSaveMaintenanceConfig = async () => {
    setIsSavingMaintenance(true)
    setMaintenanceFeedback(null)

    try {
      const res = await updateMaintenanceModeAdminAction(maintenance)
      if (res.success && res.config) {
        setMaintenance(res.config)
        setMaintenanceFeedback({ type: "success", msg: "Configurações de manutenção salvas com sucesso!" })
      } else {
        setMaintenanceFeedback({ type: "error", msg: res.error || "Erro ao salvar configurações." })
      }
    } catch {
      setMaintenanceFeedback({ type: "error", msg: "Erro de comunicação com o servidor." })
    } finally {
      setIsSavingMaintenance(false)
    }
  }

  const handleGenerateBypassToken = () => {
    const randomHex = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10)
    setMaintenance((prev) => ({ ...prev, bypass_token: `dudit_${randomHex}` }))
  }

  const handleCopyBypassLink = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://dudit.com.br"
    const bypassUrl = `${origin}/?maint_bypass=${encodeURIComponent(maintenance.bypass_token)}`
    navigator.clipboard.writeText(bypassUrl)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 3000)
  }

  const handleSaveAnnouncement = async () => {
    setIsSavingAnnouncement(true)
    setAnnouncementFeedback(null)

    try {
      const res = await updateGlobalAnnouncementAdminAction(announcement)
      if (res.success && res.config) {
        setAnnouncement(res.config)
        setAnnouncementFeedback({ type: "success", msg: "Banner de aviso global atualizado com sucesso!" })
      } else {
        setAnnouncementFeedback({ type: "error", msg: res.error || "Erro ao salvar aviso global." })
      }
    } catch {
      setAnnouncementFeedback({ type: "error", msg: "Erro ao comunicar com o servidor." })
    } finally {
      setIsSavingAnnouncement(false)
    }
  }

  const handleSendBroadcast = async () => {
    setShowBroadcastConfirm(false)
    setIsSendingBroadcast(true)
    setBroadcastFeedback(null)

    try {
      const res = await sendMaintenanceBroadcastAdminAction({
        title: broadcastTitle,
        message: broadcastMessage,
        targetAudience: broadcastAudience,
        sendPush: broadcastSendPush,
        sendInApp: broadcastSendInApp,
        estimatedEnd: maintenance.estimated_end,
      })

      if (res.success) {
        setBroadcastFeedback({
          type: "success",
          msg: `Disparo realizado com sucesso! ${res.sentCount || 0} notificações no app e ${res.pushCount || 0} push notifications enviadas.`,
        })
      } else {
        setBroadcastFeedback({ type: "error", msg: res.error || "Erro ao disparar notificações." })
      }
    } catch {
      setBroadcastFeedback({ type: "error", msg: "Erro de comunicação ao disparar notificações." })
    } finally {
      setIsSendingBroadcast(false)
    }
  }

  const cloudflareHtmlSnippet = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Plataforma em Manutenção | Dudit</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin:0; background:#071311; color:#f4f4f5; font-family:-apple-system,BlinkMacSystemFont,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; text-align:center; padding:20px; }
    .card { max-width:540px; background:#111c1a; border:1px solid #005645; padding:40px; border-radius:24px; box-shadow:0 20px 40px rgba(0,0,0,0.5); }
    h1 { color:#10b981; font-size:28px; margin-bottom:12px; }
    p { color:#a1a1aa; font-size:16px; line-height:1.6; }
    .badge { display:inline-block; background:rgba(245,158,11,0.15); color:#fbbf24; border:1px solid rgba(245,158,11,0.3); padding:6px 14px; border-radius:999px; font-weight:700; font-size:12px; text-transform:uppercase; margin-bottom:20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Manutenção Programada</div>
    <h1>Dudit está em atualização</h1>
    <p>Estamos realizando melhorias na infraestrutura para você. Voltaremos em alguns minutos!</p>
  </div>
</body>
</html>`

  const handleCopyCloudflareHtml = () => {
    navigator.clipboard.writeText(cloudflareHtmlSnippet)
    setCopiedHtml(true)
    setTimeout(() => setCopiedHtml(false), 3000)
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-brand-border dark:border-dark-border pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[28px] sm:text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
              Sistema & Modo Manutenção
            </h1>
            <Badge variant={maintenance.enabled ? "red" : "green"}>
              {maintenance.enabled ? "Manutenção Ativa" : "Sistema Online"}
            </Badge>
          </div>
          <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium mt-1">
            Controle de bloqueio 503, avisos globais no topo do site e disparos de notificações prévias.
          </p>
        </div>
      </div>

      {/* Tabs for the 4 Cards */}
      <Tabs defaultValue="maintenance">
        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
          <TabsTrigger value="maintenance" icon={ShieldIcon}>Modo Manutenção</TabsTrigger>
          <TabsTrigger value="announcement" icon={BellIcon}>Banner Global</TabsTrigger>
          <TabsTrigger value="broadcast" icon={TelegramIcon}>Disparo em Massa</TabsTrigger>
          <TabsTrigger value="cloudflare" icon={GlobeIcon}>Contingência</TabsTrigger>
        </TabsList>

        {/* ========================================================================= */}
        {/* TAB 1: MODO MANUTENÇÃO GERAL */}
        {/* ========================================================================= */}
        <TabsContent value="maintenance">
          <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
            <div className="p-6 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-3 rounded-xl border ${maintenance.enabled
                      ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400"
                      : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900/30 text-green-600 dark:text-green-400"
                      }`}
                  >
                    <ShieldIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Trava Geral (Modo Manutenção)</h2>
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                      Bloqueia todas as rotas públicas com status HTTP 503 (protegendo SEO).
                    </p>
                  </div>
                </div>

                <Switch
                  checked={maintenance.enabled}
                  onCheckedChange={handleToggleMaintenance}
                  disabled={isSavingMaintenance}
                />
              </div>

              {maintenanceFeedback && (
                <InfoCard
                  color={maintenanceFeedback.type === "success" ? "green" : "red"}
                  message={maintenanceFeedback.msg}
                />
              )}

              <FormSection title="Configurações de Manutenção" hasSeparator>
                <FormTextarea
                  label="Mensagem Pública na Tela de Manutenção"
                  name="maintenance_message"
                  value={maintenance.message}
                  onChange={(e) => setMaintenance({ ...maintenance, message: e.target.value })}
                  placeholder="Ex: Estamos realizando melhorias programadas..."
                  rows={3}
                />

                {(() => {
                    const localISO = maintenance.estimated_end
                      ? toDateTimeInputValue(maintenance.estimated_end)
                      : null
                    const datePart = localISO ? localISO.slice(0, 10) : ""
                    const timePart = localISO ? localISO.slice(11, 16) : ""
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <DatePicker
                          label="Data de Retorno"
                          value={datePart}
                          onChange={(date: Date | undefined) => {
                            const iso = combineLocalToISO(
                              date ? format(date, "yyyy-MM-dd") : "",
                              timePart || "12:00"
                            )
                            setMaintenance({ ...maintenance, estimated_end: iso })
                          }}
                        />
                        <TimePicker
                          label="Horário de Retorno"
                          value={timePart}
                          onChange={(time: string) => {
                            const iso = combineLocalToISO(datePart, time || "00:00")
                            setMaintenance({ ...maintenance, estimated_end: iso })
                          }}
                        />
                      </div>
                    )
                  })()}

                {/* Bypass Settings */}
                <div className="p-4 bg-brand-gray dark:bg-dark-background border border-brand-border dark:border-dark-border rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <Checkbox
                      label="Permitir Bypass de Administradores"
                      checked={maintenance.allow_admin_bypass}
                      onCheckedChange={(v) =>
                        setMaintenance({ ...maintenance, allow_admin_bypass: Boolean(v) })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleGenerateBypassToken}
                    >
                      <ReloadIcon className="w-3 h-3" /> Gerar nova chave
                    </Button>
                  </div>

                  <Input
                    name="bypass_token"
                    value={maintenance.bypass_token}
                    onChange={(e) =>
                      setMaintenance({ ...maintenance, bypass_token: e.target.value })
                    }
                    placeholder="Token secreto de bypass"
                    prefix={<LockIcon className="w-4 h-4" />}
                    suffix={
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyBypassLink}
                        className="h-7 px-2 text-xs"
                      >
                        <CopyIcon className="w-3 h-3" />
                        {copiedLink ? "Copiado!" : "Copiar Link"}
                      </Button>
                    }
                  />
                  <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                    Com este link você ou desenvolvedores podem testar o site sem desativar a manutenção geral.
                  </p>
                </div>
              </FormSection>
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-brand-border dark:border-dark-border bg-brand-gray/50 dark:bg-dark-background/50">
              <a
                href="/manutencao"
                target="_blank"
                rel="noreferrer"
                className="text-sm text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading flex items-center gap-1.5 transition"
              >
                <GlobeIcon className="w-3.5 h-3.5" />
                Visualizar tela 503
              </a>

              <Button
                onClick={handleSaveMaintenanceConfig}
                disabled={isSavingMaintenance}
                isLoading={isSavingMaintenance}
              >
                Salvar Configurações
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ========================================================================= */}
        {/* TAB 2: BANNER DE AVISO GLOBAL (TOPO) */}
        {/* ========================================================================= */}
        <TabsContent value="announcement">
          <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
            <div className="p-6 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-3 rounded-xl border ${announcement.active
                      ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-900/30 text-yellow-600 dark:text-yellow-400"
                      : "bg-gray-100 dark:bg-dark-border border-gray-200 dark:border-dark-border text-gray-400 dark:text-dark-body"
                      }`}
                  >
                    <BellIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Banner de Aviso Global</h2>
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                      Exibe um banner fixado no topo de todas as páginas da Dudit para alertar com antecedência.
                    </p>
                  </div>
                </div>

                <Switch
                  checked={announcement.active}
                  onCheckedChange={() =>
                    setAnnouncement((prev) => ({ ...prev, active: !prev.active }))
                  }
                  disabled={isSavingAnnouncement}
                />
              </div>

              {announcementFeedback && (
                <InfoCard
                  color={announcementFeedback.type === "success" ? "green" : "red"}
                  message={announcementFeedback.msg}
                />
              )}

              {/* Live Preview of the Banner */}
              <div className="space-y-2">
                <span className="text-xs uppercase font-bold text-brand-inactive-text dark:text-dark-body tracking-wider">
                  Pré-visualização em tempo real (como o usuário verá):
                </span>
                <div
                  className={`p-3 rounded-xl border text-sm flex items-center justify-between gap-3 ${announcement.type === "urgent"
                    ? "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-100"
                    : announcement.type === "warning"
                      ? "bg-yellow-50 dark:bg-[#181408] border-yellow-200 dark:border-yellow-500/40 text-yellow-700 dark:text-yellow-100"
                      : "bg-green-50 dark:bg-[#061814] border-green-200 dark:border-green-500/40 text-green-700 dark:text-green-100"
                    }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="p-1 rounded-md bg-white/50 dark:bg-white/10 shrink-0">
                      {announcement.type === "urgent" ? (
                        <ShieldIcon className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                      ) : announcement.type === "warning" ? (
                        <AlertTriangleIcon className="w-3.5 h-3.5 text-yellow-500 dark:text-yellow-400" />
                      ) : (
                        <InfoIcon className="w-3.5 h-3.5 text-green-500 dark:text-green-400" />
                      )}
                    </span>
                    <div className="truncate">
                      <strong className="mr-1.5">{announcement.title || "Aviso"}:</strong>
                      <span>{announcement.message || "Escreva a mensagem do anúncio..."}</span>
                      {announcement.link_url && (
                        <span className="underline ml-1.5 font-bold cursor-pointer inline-flex items-center gap-0.5">
                          {announcement.link_text || "Saiba mais"} <ArrowRightIcon className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                  </div>
                  {announcement.closable && (
                    <span className="p-1 text-gray-400 dark:text-dark-body shrink-0">
                      <XIcon className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              </div>

              <FormSection title="Configurações do Banner" hasSeparator>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(["warning", "info", "urgent"] as AnnouncementType[]).map((type) => (
                    <Button
                      key={type}
                      variant={announcement.type === type ? "default" : "outline"}
                      onClick={() => setAnnouncement({ ...announcement, type })}
                      className="justify-center"
                    >
                      {type === "warning" ? "Alerta (Amarelo)" : type === "urgent" ? "Urgente (Vermelho)" : "Informativo (Verde)"}
                    </Button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Título do Aviso"
                    name="announcement_title"
                    value={announcement.title}
                    onChange={(e) => setAnnouncement({ ...announcement, title: e.target.value })}
                    placeholder="Ex: Manutenção Programada"
                  />
                  <Input
                    label="Expiração Automática (opcional)"
                    name="announcement_expires"
                    type="datetime-local"
                    value={announcement.expires_at ? announcement.expires_at.slice(0, 16) : ""}
                    onChange={(e) =>
                      setAnnouncement({
                        ...announcement,
                        expires_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                      })
                    }
                  />
                </div>

                <FormTextarea
                  label="Mensagem do Banner"
                  name="announcement_message"
                  value={announcement.message}
                  onChange={(e) => setAnnouncement({ ...announcement, message: e.target.value })}
                  placeholder="Ex: Estaremos em manutenção hoje das 23:00 às 01:00..."
                  rows={2}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Link de Ação (URL Opcional)"
                    name="announcement_link_url"
                    value={announcement.link_url || ""}
                    onChange={(e) => setAnnouncement({ ...announcement, link_url: e.target.value || null })}
                    placeholder="Ex: /institucional/ajuda"
                  />
                  <Input
                    label="Texto do Botão / Link"
                    name="announcement_link_text"
                    value={announcement.link_text || ""}
                    onChange={(e) => setAnnouncement({ ...announcement, link_text: e.target.value || null })}
                    placeholder="Ex: Ver detalhes"
                  />
                </div>

                <Checkbox
                  label="Permitir que o usuário feche com o botão X (salva no dispositivo do usuário)"
                  checked={announcement.closable}
                  onCheckedChange={(v) => setAnnouncement({ ...announcement, closable: Boolean(v) })}
                />
              </FormSection>
            </div>

            <div className="flex items-center justify-end px-6 py-4 border-t border-brand-border dark:border-dark-border bg-brand-gray/50 dark:bg-dark-background/50">
              <Button
                onClick={handleSaveAnnouncement}
                disabled={isSavingAnnouncement}
                isLoading={isSavingAnnouncement}
              >
                Salvar Banner Global
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ========================================================================= */}
        {/* TAB 3: DISPARO DE NOTIFICAÇÕES (PUSH & IN-APP) */}
        {/* ========================================================================= */}
        <TabsContent value="broadcast">
          <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/30 text-blue-600 dark:text-blue-400">
                  <TelegramIcon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Disparar Aviso em Massa</h2>
                  <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                    Envie um alerta na Central de Notificações e via Push Notification para preparar seus clientes e parceiros.
                  </p>
                </div>
              </div>

              {broadcastFeedback && (
                <InfoCard
                  color={broadcastFeedback.type === "success" ? "green" : "red"}
                  message={broadcastFeedback.msg}
                />
              )}

              <FormSection title="Configurações do Disparo" hasSeparator>
                <div>
                  <label className="block text-sm font-medium text-brand-dark dark:text-dark-heading mb-2">
                    Público-Alvo
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "all", label: "Todos" },
                      { id: "partners", label: "Apenas Parceiros" },
                      { id: "customers", label: "Apenas Clientes" },
                    ].map((aud) => (
                      <Button
                        key={aud.id}
                        variant={broadcastAudience === aud.id ? "default" : "outline"}
                        onClick={() => setBroadcastAudience(aud.id as any)}
                        className="justify-center"
                      >
                        {aud.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <Input
                  label="Título da Notificação"
                  name="broadcast_title"
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  placeholder="Ex: Manutenção Programada Hoje"
                />

                <FormTextarea
                  label="Mensagem do Comunicado"
                  name="broadcast_message"
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  placeholder="Ex: Olá! Hoje às 23:00 faremos uma manutenção programada..."
                  rows={3}
                />

                <div className="flex items-center gap-6 pt-1">
                  <Checkbox
                    label="Central do App (Sininho)"
                    checked={broadcastSendInApp}
                    onCheckedChange={(v) => setBroadcastSendInApp(Boolean(v))}
                  />
                  <Checkbox
                    label="Push Notification (FCM)"
                    checked={broadcastSendPush}
                    onCheckedChange={(v) => setBroadcastSendPush(Boolean(v))}
                  />
                </div>
              </FormSection>
            </div>

            <div className="flex items-center justify-end px-6 py-4 border-t border-brand-border dark:border-dark-border bg-brand-gray/50 dark:bg-dark-background/50">
              <Button
                onClick={() => setShowBroadcastConfirm(true)}
                disabled={isSendingBroadcast || !broadcastTitle || !broadcastMessage}
                isLoading={isSendingBroadcast}
                leftIcon={<TelegramIcon className="w-4 h-4" />}
              >
                Disparar Aviso em Massa
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ========================================================================= */}
        {/* TAB 4: GUIA DE CONTINGÊNCIA CLOUDFLARE */}
        {/* ========================================================================= */}
        <TabsContent value="cloudflare">
          <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-900/30 text-orange-600 dark:text-orange-400">
                  <GlobeIcon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Plano de Contingência (Cloudflare Edge)</h2>
                  <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                    Se precisar desligar a Railway ou o Banco Supabase totalmente, use a página estática na borda.
                  </p>
                </div>
              </div>

              <FormSection title="Instruções" hasSeparator>
                <div className="space-y-3 text-sm text-brand-dark dark:text-dark-body leading-relaxed">
                  <p>
                    <strong>Quando usar o Cloudflare?</strong> Se você for rodar uma migração de banco pesada ou se o container da Railway precisar ser parado completamente.
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-brand-inactive-text dark:text-dark-body pl-1">
                    <li>Acesse o painel do seu domínio no <strong className="text-brand-dark dark:text-dark-heading">Cloudflare</strong>.</li>
                    <li>Vá em <strong className="text-brand-dark dark:text-dark-heading">Custom Pages</strong> ou crie um <strong className="text-brand-dark dark:text-dark-heading">Cloudflare Worker</strong> simples.</li>
                    <li>Cole o HTML estático abaixo para responder com status 503 sem encostar na Railway:</li>
                  </ol>
                </div>

                <div className="relative mt-2">
                  <pre className="p-3 bg-brand-gray dark:bg-dark-background border border-brand-border dark:border-dark-border rounded-xl text-xs font-mono text-brand-inactive-text dark:text-dark-body overflow-x-auto max-h-32">
                    {cloudflareHtmlSnippet}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyCloudflareHtml}
                    className="absolute top-2 right-2"
                    leftIcon={<CopyIcon className="w-3 h-3" />}
                  >
                    {copiedHtml ? "Copiado!" : "Copiar HTML"}
                  </Button>
                </div>
              </FormSection>

              <InfoCard
                color="orange"
                message={
                  <>
                    Para manutenções rotineiras, o <strong>Modo Manutenção (Aba 1)</strong> é suficiente e muito mais prático.
                  </>
                }
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Confirmation Modal for Maintenance Toggle */}
      <AlertModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={confirmMaintenanceToggle}
        title={pendingMaintenanceToggle ? "Ativar Modo Manutenção?" : "Desativar Modo Manutenção?"}
        description={
          pendingMaintenanceToggle
            ? "Todos os visitantes serão redirecionados para a tela 503. Apenas administradores com bypass terão acesso."
            : "A plataforma voltará a ficar pública e acessível para todos os clientes imediatamente."
        }
        variant={pendingMaintenanceToggle ? "danger" : "success"}
        confirmText={pendingMaintenanceToggle ? "Sim, Ativar Bloqueio" : "Sim, Reabrir Plataforma"}
      />

      {/* Confirmation Modal for Broadcast */}
      <AlertModal
        isOpen={showBroadcastConfirm}
        onClose={() => setShowBroadcastConfirm(false)}
        onConfirm={handleSendBroadcast}
        title="Confirmar Disparo em Massa"
        description={`Você está prestes a enviar este comunicado para os usuários selecionados (${broadcastAudience}).`}
        variant="info"
        confirmText="Confirmar e Enviar"
      />
    </div>
  )
}
