import { AdminHeader } from "@/components/admin/admin-header"
import { getAdminRole } from "@/lib/auth/admin-authorization"
import { getComplianceDeletionLogs } from "@/app/actions/admin/compliance"
import ComplianceLogsView from "@/components/admin/compliance/ComplianceLogsView"

export const dynamic = "force-dynamic"

export default async function AdminCompliancePage() {
  const admin = await getAdminRole()

  if (!admin || admin.role !== "super_admin") {
    return (
      <>
        <AdminHeader pageTitle="Contas Excluídas (Compliance)" />
        <div className="p-6 max-w-2xl mx-auto">
          <div className="rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-6 text-center">
            <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading mb-1">
              Acesso restrito a Super Admin
            </h2>
            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
              A consulta de registros de compliance e dados de contas excluídas exige permissão de Super Administrador.
            </p>
          </div>
        </div>
      </>
    )
  }

  const initial = await getComplianceDeletionLogs({ page: 1, limit: 20 })

  return (
    <>
      <AdminHeader pageTitle="Contas Excluídas (Compliance & KYC)" />
      <ComplianceLogsView initialData={initial} />
    </>
  )
}
