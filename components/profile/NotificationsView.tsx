"use client"

import { useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import { ChevronLeftIcon } from "@/lib/icons"
import { Button, InfoCard, SkeletonLoader, IconPlaceholder } from "@/components/reusable"
import { getNotificationPreferencesAction, updateNotificationPreferencesAction } from "@/app/actions/notification-preferences"
import { fade, View } from "./profile-shared"
import type { NotificationPreference, NotificationPreferenceInput } from "@/lib/notifications/preferences-types"
import { NOTIFICATION_CATEGORIES, NOTIFICATION_LABELS, CATEGORY_LABELS, CATEGORY_DESCRIPTIONS } from "@/lib/notifications/preferences-types"
import type { NotificationType } from "@/lib/notifications/types"
import { useNotification } from "@/hooks/use-notification"

interface NotificationsViewProps {
  navigate: (view: View) => void
}

function getPref(preferences: NotificationPreference[], type: NotificationType): { enabled: boolean; push_enabled: boolean } {
  const p = preferences.find((p) => p.type === type)
  return { enabled: p?.enabled ?? true, push_enabled: p?.push_enabled ?? true }
}

export function NotificationsView({ navigate }: NotificationsViewProps) {
  const [preferences, setPreferences] = useState<NotificationPreference[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { success: notifySuccess, error: notifyError } = useNotification()

  const fetchPreferences = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await getNotificationPreferencesAction()
      if (res.success && res.data) {
        setPreferences(res.data)
      } else {
        setError("error" in res ? res.error || "Erro ao carregar preferências" : "Erro ao carregar preferências")
      }
    } catch {
      setError("Erro interno ao buscar preferências.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPreferences()
  }, [fetchPreferences])

  const toggle = useCallback((type: NotificationType, field: "enabled" | "push_enabled") => {
    setPreferences((prev) => {
      const existing = prev.find((p) => p.type === type)
      if (existing) {
        return prev.map((p) =>
          p.type === type ? { ...p, [field]: !p[field] } : p,
        )
      }
      const defaults = { enabled: true, push_enabled: true }
      return [...prev, { ...defaults, [field]: !defaults[field], id: "", user_id: "", type, created_at: "", updated_at: "" } as NotificationPreference]
    })
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const inputs: NotificationPreferenceInput[] = preferences.map((p) => ({
        type: p.type,
        enabled: p.enabled,
        push_enabled: p.push_enabled,
      }))
      const res = await updateNotificationPreferencesAction(inputs)
      if (res.success) {
        notifySuccess("Preferências salvas", "Suas preferências de notificação foram atualizadas.")
      } else {
        notifyError("Erro ao salvar", "error" in res ? res.error || "Ocorreu um erro." : "Ocorreu um erro.")
      }
    } catch {
      notifyError("Erro inesperado", "Não foi possível salvar as preferências.")
    } finally {
      setSaving(false)
    }
  }, [preferences, notifySuccess, notifyError])

  return (
    <motion.div key="notifications-view" {...fade} className="w-full">
      {/* Header */}
      <div className="hidden lg:flex mb-8 items-center gap-4">
        <Button
          variant="filled"
          onClick={() => navigate("main")}
          className="w-10 h-10 p-0 flex items-center justify-center shrink-0"
        >
          <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
            Notificações
          </h1>
          <p className="text-md text-brand-inactive-text mt-1">
            Escolha quais notificações você deseja receber.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="p-6 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl space-y-4 animate-pulse">
              <SkeletonLoader height={20} width="40%" />
              <SkeletonLoader height={16} width="60%" />
            </div>
          ))}
        </div>
      ) : error ? (
        <InfoCard message={error} color="red" />
      ) : (
        <div className="space-y-8">
          {(Object.entries(NOTIFICATION_CATEGORIES) as [keyof typeof NOTIFICATION_CATEGORIES, typeof NOTIFICATION_CATEGORIES[keyof typeof NOTIFICATION_CATEGORIES]][]).map(
            ([categoryKey, category]) => (
              <div key={categoryKey}>
                <div className="mb-3 px-1">
                  <h2 className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                    {CATEGORY_LABELS[categoryKey]}
                  </h2>
                  <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                    {CATEGORY_DESCRIPTIONS[categoryKey]}
                  </p>
                </div>

                <div className="space-y-2">
                  {category.types.map((type) => {
                    const pref = getPref(preferences, type)
                    return (
                      <div
                        key={type}
                        className="flex items-center justify-between p-3 bg-white dark:bg-dark-surface rounded-lg border border-brand-border dark:border-dark-border"
                      >
                        <p className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                          {NOTIFICATION_LABELS[type]}
                        </p>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1.5 text-xs text-brand-inactive-text cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={pref.push_enabled}
                              onChange={() => toggle(type, "push_enabled")}
                              className="rounded border-brand-border text-brand-green focus:ring-brand-green/30"
                            />
                            Push
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-brand-inactive-text cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={pref.enabled}
                              onChange={() => toggle(type, "enabled")}
                              className="rounded border-brand-border text-brand-green focus:ring-brand-green/30"
                            />
                            In-app
                          </label>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {!isLoading && !error && (
        <div className="mt-8">
          <Button onClick={handleSave} isLoading={saving}>
            {saving ? "Salvando..." : "Salvar preferências"}
          </Button>
        </div>
      )}
    </motion.div>
  )
}
