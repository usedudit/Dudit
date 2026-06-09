import { NotificationPreferencesPage } from "@/components/notifications/NotificationPreferencesPage"
import { requireUser } from "@/lib/auth/authorization"
import type { NotificationPreference } from "@/lib/notifications/preferences-types"
import { getNotificationPreferencesAction } from "@/app/actions/notification-preferences"

export default async function NotificacoesPage() {
  const user = await requireUser()
  const result = await getNotificationPreferencesAction()
  const preferences: NotificationPreference[] = "data" in result ? (result as { data: NotificationPreference[] }).data : []

  return <NotificationPreferencesPage userId={user.id} initialPreferences={preferences} />
}
