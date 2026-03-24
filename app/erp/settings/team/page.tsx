import { Suspense } from "react"
import { ERPHeader } from "@/components/erp/erp-header"
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
    VIEWER: "bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-400",
}

export default async function TeamPage() {
    // Layout already guarantees auth + valid context
    await getCurrentPartnerContext()

    return (
        <>
            <ERPHeader pageTitle="Equipe e Acessos" />
            <FadeIn className="p-4">
                <Suspense fallback={<div className="p-4">Carregando equipe...</div>}>
                    <TeamList />
                </Suspense>
            </FadeIn>
        </>
    )
}

import { InfoCard } from "@/components/reusable"

async function TeamList() {
    const { members, error } = await getTeamMembers()

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
        <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{members.length}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total de membros</p>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{members.filter(m => m.role === "ADMIN" || m.role === "OWNER").length}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Administradores</p>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{members.filter(m => m.role === "MANAGER").length}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Gerentes</p>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{members.filter(m => m.role === "OPERATOR" || m.role === "DELIVERY" || m.role === "VIEWER").length}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Atendentes / Entregadores / Visualizadores</p>
                </div>
            </div>

            {/* Member List */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white">Membros do ERP</h2>
                </div>

                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {members.map((member) => (
                        <div key={member.id} className="px-6 py-4 flex items-center gap-4">
                            {/* Avatar */}
                            <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                {member.avatarUrl ? (
                                    <img src={member.avatarUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-sm font-bold text-gray-500 dark:text-gray-400">
                                        {(member.fullName || member.email || "?").charAt(0).toUpperCase()}
                                    </span>
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                        {member.fullName || "Sem nome"}
                                    </p>
                                    {member.isOwner && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                            DONO
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                    {member.email}
                                </p>
                            </div>

                            {/* Role Badge */}
                            <span className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full flex-shrink-0 ${ROLE_COLORS[member.role]}`}>
                                {ROLE_LABELS[member.role] || member.role}
                            </span>

                            {/* Join Date */}
                            <span className="text-xs text-gray-400 dark:text-gray-500 hidden md:block flex-shrink-0">
                                {new Date(member.createdAt).toLocaleDateString("pt-BR")}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
