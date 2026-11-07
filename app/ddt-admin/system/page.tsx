import type { Metadata } from "next"
import { AdminHeader } from "@/components/admin/admin-header"
import { requireAdminScope } from "@/lib/auth/admin-authorization"
import { getMaintenanceConfig, getGlobalAnnouncementConfig } from "@/lib/services/system-settings.service"
import { SystemMaintenancePage } from "@/components/admin/system/SystemMaintenancePage"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata: Metadata = {
  title: "Sistema & Manutenção | Painel DDT",
}

export default async function AdminSystemPage() {
  await requireAdminScope("system_settings", "admin")

  const [maintenance, announcement] = await Promise.all([
    getMaintenanceConfig(),
    getGlobalAnnouncementConfig(),
  ])

  return (
    <>
      <AdminHeader pageTitle="Sistema & Manutenção" />
      <SystemMaintenancePage
        initialState={{
          maintenance,
          announcement,
        }}
      />
    </>
  )
}
