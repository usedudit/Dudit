import type { Metadata } from "next"
import { getMaintenanceConfig } from "@/lib/services/system-settings.service"
import { MaintenanceView } from "@/components/maintenance/MaintenanceView"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata: Metadata = {
  title: "Plataforma em Manutenção",
  description: "Estamos realizando melhorias programadas na plataforma Dudit. Voltaremos em breve!",
  robots: {
    index: false,
    follow: false,
  },
}

export default async function MaintenancePage() {
  const config = await getMaintenanceConfig()

  return <MaintenanceView initialConfig={config} />
}
