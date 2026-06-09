"use client"

import { useState, useCallback } from "react"
import type { NotificationPreference, NotificationPreferenceInput } from "@/lib/notifications/preferences-types"
import { NOTIFICATION_CATEGORIES, NOTIFICATION_LABELS, CATEGORY_LABELS, CATEGORY_DESCRIPTIONS } from "@/lib/notifications/preferences-types"
import type { NotificationType } from "@/lib/notifications/types"
import { updateNotificationPreferencesAction } from "@/app/actions/notification-preferences"
import { Loader2 } from "lucide-react"

interface Props {
  userId: string
  initialPreferences: NotificationPreference[]
}

function getPref(preferences: NotificationPreference[], type: NotificationType): { enabled: boolean; push_enabled: boolean } {
  const p = preferences.find((p) => p.type === type)
  return { enabled: p?.enabled ?? true, push_enabled: p?.push_enabled ?? true }
}

export function NotificationPreferencesPage({ userId, initialPreferences }: Props) {
  const [preferences, setPreferences] = useState<NotificationPreference[]>(initialPreferences)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const toggle = useCallback((type: NotificationType, field: "enabled" | "push_enabled") => {
    setPreferences((prev) => {
      const existing = prev.find((p) => p.type === type)
      if (existing) {
        return prev.map((p) =>
          p.type === type ? { ...p, [field]: !p[field] } : p,
        )
      }
      const defaults = { enabled: true, push_enabled: true }
      return [...prev, { ...defaults, [field]: !defaults[field], id: "", user_id: userId, type, created_at: "", updated_at: "" } as NotificationPreference]
    })
    setSaved(false)
  }, [userId])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaved(false)

    const inputs: NotificationPreferenceInput[] = preferences.map((p) => ({
      type: p.type,
      enabled: p.enabled,
      push_enabled: p.push_enabled,
    }))

    await updateNotificationPreferencesAction(inputs)
    setSaving(false)
    setSaved(true)

    setTimeout(() => setSaved(false), 2000)
  }, [preferences])

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Notificações</h1>
        <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">
          Escolha quais notificações você deseja receber.
        </p>
      </div>

      <div className="space-y-8">
        {(Object.entries(NOTIFICATION_CATEGORIES) as [keyof typeof NOTIFICATION_CATEGORIES, typeof NOTIFICATION_CATEGORIES[keyof typeof NOTIFICATION_CATEGORIES]][]).map(
          ([categoryKey, category]) => (
            <div key={categoryKey}>
              <div className="mb-3">
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
                      className="flex items-center justify-between p-3 bg-white dark:bg-dark-card rounded-lg border border-brand-border dark:border-dark-border"
                    >
                      <div>
                        <p className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                          {NOTIFICATION_LABELS[type]}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs text-brand-inactive-text cursor-pointer">
                          <input
                            type="checkbox"
                            checked={pref.push_enabled}
                            onChange={() => toggle(type, "push_enabled")}
                            className="rounded border-brand-border text-brand-green focus:ring-brand-green/30"
                          />
                          Push
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-brand-inactive-text cursor-pointer">
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

      <div className="mt-8 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-brand-green text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Salvando...
            </span>
          ) : (
            "Salvar preferências"
          )}
        </button>
        {saved && (
          <span className="text-xs text-brand-green font-medium">Preferências salvas!</span>
        )}
      </div>
    </div>
  )
}
