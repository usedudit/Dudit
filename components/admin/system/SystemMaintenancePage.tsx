"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import {
  ShieldIcon,
  ShieldAlertIcon,
  AlertTriangleIcon,
  BellIcon,
  CheckCircleIcon,
  CopyIcon,
  RefreshIcon,
  GlobeIcon,
  SendIcon,
  InfoIcon,
  LockIcon,
  CalendarIcon,
  SlidersIcon,
  ArrowRightIcon,
  XIcon,
} from "@/lib/icons"
import {
  updateMaintenanceModeAdminAction,
  updateGlobalAnnouncementAdminAction,
  sendMaintenanceBroadcastAdminAction,
} from "@/app/actions/admin/system"
import type {
  MaintenanceConfig,
  GlobalAnnouncementConfig,
  AnnouncementType,
  SystemSettingsState,
} from "@/lib/system/types"

interface SystemMaintenancePageProps {
  initialState: SystemSettingsState
}

export function SystemMaintenancePage({ initialState }: SystemMaintenancePageProps) {
  // ─── Maintenance Mode State ───────────────────────────────────────────────
  const [maintenance, setMaintenance] = useState<MaintenanceConfig>(initialState.maintenance)
  const [isSavingMaintenance, setIsSavingMaintenance] = useState(false)
  const [maintenanceFeedback, setMaintenanceFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [pendingMaintenanceToggle, setPendingMaintenanceToggle] = useState<boolean | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)

  // ─── Global Announcement State ────────────────────────────────────────────
  const [announcement, setAnnouncement] = useState<GlobalAnnouncementConfig>(initialState.announcement)
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false)
  const [announcementFeedback, setAnnouncementFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null)

  // ─── Broadcast Notifications State ────────────────────────────────────────
  const [broadcastTitle, setBroadcastTitle] = useState("Aviso de Manutenção Programada")
  const [broadcastMessage, setBroadcastMessage] = useState("A plataforma Dudit passará por uma rápida manutenção hoje. Voltaremos em breve com novidades!")
  const [broadcastAudience, setBroadcastAudience] = useState<"all" | "partners" | "customers">("all")
  const [broadcastSendPush, setBroadcastSendPush] = useState(true)
  const [broadcastSendInApp, setBroadcastSendInApp] = useState(true)
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false)
  const [broadcastFeedback, setBroadcastFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null)
  const [showBroadcastConfirm, setShowBroadcastConfirm] = useState(false)

  // ─── Cloudflare Snippet ───────────────────────────────────────────────────
  const [copiedHtml, setCopiedHtml] = useState(false)

  // Handlers for Maintenance
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

  // Handlers for Announcement
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

  // Handlers for Broadcast
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Sistema & Modo Manutenção
            </h1>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                maintenance.enabled
                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse"
                  : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              }`}
            >
              {maintenance.enabled ? "Manutenção Ativa" : "Sistema Online"}
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Controle de bloqueio 503, avisos globais no topo do site e disparos de notificações prévias.
          </p>
        </div>
      </div>

      {/* Grid of Main Management Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ========================================================================= */}
        {/* CARD 1: MODO MANUTENÇÃO GERAL */}
        {/* ========================================================================= */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm flex flex-col justify-between space-y-6">
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`p-3 rounded-xl border ${
                    maintenance.enabled
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                      : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  }`}
                >
                  <ShieldIcon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Trava Geral (Modo Manutenção)</h2>
                  <p className="text-xs text-zinc-400">
                    Bloqueia todas as rotas públicas com status HTTP 503 (protegendo SEO).
                  </p>
                </div>
              </div>

              {/* Master Switch */}
              <button
                type="button"
                onClick={() => handleToggleMaintenance(!maintenance.enabled)}
                disabled={isSavingMaintenance}
                className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  maintenance.enabled ? "bg-rose-600" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    maintenance.enabled ? "translate-x-7" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {maintenanceFeedback && (
              <div
                className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 border ${
                  maintenanceFeedback.type === "success"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                }`}
              >
                {maintenanceFeedback.type === "success" ? (
                  <CheckCircleIcon className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangleIcon className="w-4 h-4 shrink-0" />
                )}
                <span>{maintenanceFeedback.msg}</span>
              </div>
            )}

            {/* Maintenance Configuration Form */}
            <div className="space-y-4 pt-2 border-t border-zinc-800/80 text-sm">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Mensagem Pública na Tela de Manutenção
                </label>
                <textarea
                  rows={3}
                  value={maintenance.message}
                  onChange={(e) => setMaintenance({ ...maintenance, message: e.target.value })}
                  placeholder="Ex: Estamos realizando melhorias programadas..."
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-400 text-xs focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5 text-emerald-400" />
                  Previsão Estimada de Retorno (opcional, gera contador)
                </label>
                <input
                  type="datetime-local"
                  value={maintenance.estimated_end ? maintenance.estimated_end.slice(0, 16) : ""}
                  onChange={(e) =>
                    setMaintenance({
                      ...maintenance,
                      estimated_end: e.target.value ? new Date(e.target.value).toISOString() : null,
                    })
                  }
                  className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              {/* Bypass Settings */}
              <div className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-semibold text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={maintenance.allow_admin_bypass}
                      onChange={(e) =>
                        setMaintenance({ ...maintenance, allow_admin_bypass: e.target.checked })
                      }
                      className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
                    />
                    Permitir Bypass de Administradores
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateBypassToken}
                    className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <RefreshIcon className="w-3 h-3" /> Gerar nova chave
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={maintenance.bypass_token}
                      onChange={(e) =>
                        setMaintenance({ ...maintenance, bypass_token: e.target.value })
                      }
                      placeholder="Token secreto de bypass"
                      className="w-full pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-700/60 rounded-lg text-zinc-200 text-xs font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <LockIcon className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyBypassLink}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                  >
                    <CopyIcon className="w-3.5 h-3.5" />
                    {copiedLink ? "Link Copiado!" : "Copiar Link de Teste"}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Com este link você ou desenvolvedores podem testar o site sem desativar a manutenção geral.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
            <a
              href="/manutencao"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition"
            >
              <GlobeIcon className="w-3.5 h-3.5" />
              Visualizar tela 503
            </a>

            <button
              type="button"
              onClick={handleSaveMaintenanceConfig}
              disabled={isSavingMaintenance}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition cursor-pointer"
            >
              {isSavingMaintenance ? "Salvando..." : "Salvar Configurações"}
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CARD 2: BANNER DE AVISO GLOBAL (TOPO) */}
        {/* ========================================================================= */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm flex flex-col justify-between space-y-6">
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`p-3 rounded-xl border ${
                    announcement.active
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                      : "bg-zinc-800 border-zinc-700 text-zinc-400"
                  }`}
                >
                  <BellIcon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Banner de Aviso Global</h2>
                  <p className="text-xs text-zinc-400">
                    Exibe um banner fixado no topo de todas as páginas da Dudit para alertar com antecedência.
                  </p>
                </div>
              </div>

              {/* Banner Toggle Switch */}
              <button
                type="button"
                onClick={() =>
                  setAnnouncement((prev) => ({ ...prev, active: !prev.active }))
                }
                disabled={isSavingAnnouncement}
                className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  announcement.active ? "bg-emerald-600" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    announcement.active ? "translate-x-7" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {announcementFeedback && (
              <div
                className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 border ${
                  announcementFeedback.type === "success"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                }`}
              >
                {announcementFeedback.type === "success" ? (
                  <CheckCircleIcon className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangleIcon className="w-4 h-4 shrink-0" />
                )}
                <span>{announcementFeedback.msg}</span>
              </div>
            )}

            {/* Live Preview of the Banner */}
            <div className="space-y-2">
              <span className="text-[11px] uppercase font-bold text-zinc-400 tracking-wider">
                Pré-visualização em tempo real (como o usuário verá):
              </span>
              <div
                className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                  announcement.type === "urgent"
                    ? "bg-rose-950/80 border-rose-800 text-rose-100"
                    : announcement.type === "warning"
                    ? "bg-[#181408] border-amber-500/40 text-amber-100"
                    : "bg-[#061814] border-emerald-500/40 text-emerald-100"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="p-1 rounded-md bg-white/10 shrink-0">
                    {announcement.type === "urgent" ? (
                      <ShieldAlertIcon className="w-3.5 h-3.5 text-rose-400" />
                    ) : announcement.type === "warning" ? (
                      <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <InfoIcon className="w-3.5 h-3.5 text-emerald-400" />
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
                  <span className="p-1 text-zinc-400 shrink-0">
                    <XIcon className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>
            </div>

            {/* Banner Form */}
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(["warning", "info", "urgent"] as AnnouncementType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setAnnouncement({ ...announcement, type })}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold capitalize transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      announcement.type === type
                        ? type === "warning"
                          ? "bg-amber-500/20 border-amber-500 text-amber-300"
                          : type === "urgent"
                          ? "bg-rose-500/20 border-rose-500 text-rose-300"
                          : "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    {type === "warning" ? "Alerta (Amarelo)" : type === "urgent" ? "Urgente (Vermelho)" : "Informativo (Verde)"}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Título do Aviso
                  </label>
                  <input
                    type="text"
                    value={announcement.title}
                    onChange={(e) => setAnnouncement({ ...announcement, title: e.target.value })}
                    placeholder="Ex: Manutenção Programada"
                    className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Expiração Automática (opcional)
                  </label>
                  <input
                    type="datetime-local"
                    value={announcement.expires_at ? announcement.expires_at.slice(0, 16) : ""}
                    onChange={(e) =>
                      setAnnouncement({
                        ...announcement,
                        expires_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                      })
                    }
                    className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Mensagem do Banner
                </label>
                <textarea
                  rows={2}
                  value={announcement.message}
                  onChange={(e) => setAnnouncement({ ...announcement, message: e.target.value })}
                  placeholder="Ex: Estaremos em manutenção hoje das 23:00 às 01:00..."
                  className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Link de Ação (URL Opcional)
                  </label>
                  <input
                    type="text"
                    value={announcement.link_url || ""}
                    onChange={(e) => setAnnouncement({ ...announcement, link_url: e.target.value || null })}
                    placeholder="Ex: /institucional/ajuda"
                    className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Texto do Botão / Link
                  </label>
                  <input
                    type="text"
                    value={announcement.link_text || ""}
                    onChange={(e) => setAnnouncement({ ...announcement, link_text: e.target.value || null })}
                    placeholder="Ex: Ver detalhes"
                    className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={announcement.closable}
                  onChange={(e) => setAnnouncement({ ...announcement, closable: e.target.checked })}
                  className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
                />
                Permitir que o usuário feche com o botão X (salva no dispositivo do usuário)
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={handleSaveAnnouncement}
              disabled={isSavingAnnouncement}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition cursor-pointer"
            >
              {isSavingAnnouncement ? "Salvando..." : "Salvar Banner Global"}
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: Disparo de Notificações & Guia Cloudflare */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ========================================================================= */}
        {/* CARD 3: DISPARO DE NOTIFICAÇÕES (PUSH & IN-APP) */}
        {/* ========================================================================= */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400">
              <SendIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Disparar Aviso em Massa</h2>
              <p className="text-xs text-zinc-400">
                Envie um alerta na Central de Notificações e via Push Notification para preparar seus clientes e parceiros.
              </p>
            </div>
          </div>

          {broadcastFeedback && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 border ${
                broadcastFeedback.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-300"
              }`}
            >
              {broadcastFeedback.type === "success" ? (
                <CheckCircleIcon className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangleIcon className="w-4 h-4 shrink-0" />
              )}
              <span>{broadcastFeedback.msg}</span>
            </div>
          )}

          <div className="space-y-4 text-sm">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Público-Alvo
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "all", label: "Todos" },
                  { id: "partners", label: "Apenas Parceiros" },
                  { id: "customers", label: "Apenas Clientes" },
                ].map((aud) => (
                  <button
                    key={aud.id}
                    type="button"
                    onClick={() => setBroadcastAudience(aud.id as any)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer ${
                      broadcastAudience === aud.id
                        ? "bg-teal-500/20 border-teal-500 text-teal-300"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    {aud.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Título da Notificação
              </label>
              <input
                type="text"
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                placeholder="Ex: Manutenção Programada Hoje"
                className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Mensagem do Comunicado
              </label>
              <textarea
                rows={3}
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                placeholder="Ex: Olá! Hoje às 23:00 faremos uma manutenção programada..."
                className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="flex items-center gap-6 pt-1">
              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={broadcastSendInApp}
                  onChange={(e) => setBroadcastSendInApp(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-teal-500 focus:ring-teal-500"
                />
                Central do App (Sininho)
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={broadcastSendPush}
                  onChange={(e) => setBroadcastSendPush(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-teal-500 focus:ring-teal-500"
                />
                Push Notification (FCM)
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={() => setShowBroadcastConfirm(true)}
              disabled={isSendingBroadcast || !broadcastTitle || !broadcastMessage}
              className="px-5 py-2.5 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-zinc-950 font-bold text-xs rounded-xl shadow-lg shadow-teal-500/20 transition cursor-pointer flex items-center gap-2"
            >
              <SendIcon className="w-4 h-4 text-zinc-950" />
              {isSendingBroadcast ? "Disparando..." : "Disparar Aviso em Massa"}
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CARD 4: GUIA DE CONTINGÊNCIA CLOUDFLARE */}
        {/* ========================================================================= */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400">
              <GlobeIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Plano de Contingência (Cloudflare Edge)</h2>
              <p className="text-xs text-zinc-400">
                Se precisar desligar a Railway ou o Banco Supabase totalmente, use a página estática na borda.
              </p>
            </div>
          </div>

          <div className="space-y-3 text-xs text-zinc-300 leading-relaxed">
            <p>
              <strong className="text-white">Quando usar o Cloudflare?</strong> Se você for rodar uma migração de banco pesada ou se o container da Railway precisar ser parado completamente.
            </p>
            <ol className="list-decimal list-inside space-y-2 text-zinc-400 pl-1">
              <li>Acesse o painel do seu domínio no <strong className="text-zinc-200">Cloudflare</strong>.</li>
              <li>Vá em <strong className="text-zinc-200">Custom Pages</strong> ou crie um <strong className="text-zinc-200">Cloudflare Worker</strong> simples.</li>
              <li>Cole o HTML estático abaixo para responder com status 503 sem encostar na Railway:</li>
            </ol>

            <div className="relative mt-2">
              <pre className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-[10px] font-mono text-zinc-400 overflow-x-auto max-h-32">
                {cloudflareHtmlSnippet}
              </pre>
              <button
                type="button"
                onClick={handleCopyCloudflareHtml}
                className="absolute top-2 right-2 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md text-[11px] font-semibold flex items-center gap-1 shadow transition cursor-pointer"
              >
                <CopyIcon className="w-3 h-3" />
                {copiedHtml ? "Copiado!" : "Copiar HTML"}
              </button>
            </div>
          </div>

          <div className="p-3.5 bg-orange-500/10 border border-orange-500/20 rounded-xl text-orange-300 text-xs flex items-center gap-2">
            <InfoIcon className="w-4 h-4 shrink-0 text-orange-400" />
            <span>
              Para manutenções rotineiras, o <strong>Modo Manutenção (Card 1)</strong> é suficiente e muito mais prático.
            </span>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Maintenance Toggle */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-xl ${
                  pendingMaintenanceToggle
                    ? "bg-rose-500/10 border border-rose-500/30 text-rose-400"
                    : "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                }`}
              >
                <AlertTriangleIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {pendingMaintenanceToggle ? "Ativar Modo Manutenção?" : "Desativar Modo Manutenção?"}
                </h3>
                <p className="text-xs text-zinc-400">
                  {pendingMaintenanceToggle
                    ? "Todos os visitantes serão redirecionados para a tela 503. Apenas administradores com bypass terão acesso."
                    : "A plataforma voltará a ficar pública e acessível para todos os clientes imediatamente."}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmMaintenanceToggle}
                className={`px-5 py-2.5 text-xs font-bold rounded-xl shadow-lg transition cursor-pointer ${
                  pendingMaintenanceToggle
                    ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20"
                    : "bg-emerald-500 hover:bg-emerald-600 text-zinc-950 shadow-emerald-500/20"
                }`}
              >
                {pendingMaintenanceToggle ? "Sim, Ativar Bloqueio" : "Sim, Reabrir Plataforma"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Confirmation Modal for Broadcast */}
      {showBroadcastConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400">
                <SendIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Confirmar Disparo em Massa</h3>
                <p className="text-xs text-zinc-400">
                  Você está prestes a enviar este comunicado para os usuários selecionados ({broadcastAudience}).
                </p>
              </div>
            </div>

            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 text-xs space-y-1">
              <p className="font-bold text-white">{broadcastTitle}</p>
              <p className="text-zinc-400">{broadcastMessage}</p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setShowBroadcastConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSendBroadcast}
                className="px-5 py-2.5 bg-teal-500 hover:bg-teal-600 text-zinc-950 font-bold text-xs rounded-xl shadow-lg shadow-teal-500/20 transition cursor-pointer"
              >
                Confirmar e Enviar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
