import { Suspense } from "react"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getTeamMembers } from "@/app/actions/erp/team"
import { ROLE_LABELS } from "@/lib/permissions/partner-roles"
import type { PartnerRole } from "@/lib/permissions/types"

const ROLE_COLORS: Record<PartnerRole, string> = {
    OWNER: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    ADMIN: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    MANAGER: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    OPERATOR: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    DELIVERY: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
}

export default async function TeamPage() {
    // Layout already guarantees auth + valid context
    await getCurrentPartnerContext()

    return (
        <>
            <ERPPageHeader title="Equipe e Acessos" />
            <FadeIn className="p-4">
                <Suspense fallback={<div className="p-4">Carregando equipe...</div>}>
                    <TeamList />
                </Suspense>
            </FadeIn>
        </>
    )
}

import { InfoCard } from "@/components/reusable"
import TeamMemberGridCard from "@/components/erp/settings/team/TeamMemberGridCard"
import { canModifyUser } from "@/lib/permissions/partner-roles"

async function TeamList() {
    const { members, error, currentUserRole } = await getTeamMembers()

    if (error) {
        return (
            <InfoCard message={`Erro ao carregar equipe: ${error}`} color="red" />
        )
    }

    if (members.length === 0) {
        return (
            <div className="rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-8 text-center">
                <p className="text-gray-500 dark:text-gray-400 text-sm">Nenhum membro encontrado.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-5 shadow-sm transition-all duration-300">
                    <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading tracking-tight">{members.length}</p>
                    <p className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body mt-1 uppercase tracking-wider">Total de membros</p>
                </div>
                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-5 shadow-sm transition-all duration-300">
                    <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading tracking-tight">{members.filter(m => m.role === "ADMIN" || m.role === "OWNER").length}</p>
                    <p className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body mt-1 uppercase tracking-wider">Administradores</p>
                </div>
                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-5 shadow-sm transition-all duration-300">
                    <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading tracking-tight">{members.filter(m => m.role === "MANAGER").length}</p>
                    <p className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body mt-1 uppercase tracking-wider">Gestores</p>
                </div>
                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-5 shadow-sm transition-all duration-300">
                    <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading tracking-tight">{members.filter(m => m.role === "OPERATOR" || m.role === "DELIVERY").length}</p>
                    <p className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body mt-1 uppercase tracking-wider">Operadores / Entregadores</p>
                </div>
            </div>

            {/* Member Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {members.map((member) => (
                    <TeamMemberGridCard
                        key={member.id}
                        member={member}
                        roleColors={ROLE_COLORS}
                        canModify={currentUserRole ? canModifyUser(currentUserRole, member.role) : false}
                    />
                ))}
            </div>
        </div>
    )
}
