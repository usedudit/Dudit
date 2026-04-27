import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth/authorization"
import { getAllUserPartnerAccess } from "@/lib/auth/partner-context"
import { ROLE_LABELS } from "@/lib/permissions/partner-roles"
import type { PartnerRole } from "@/lib/permissions/types"
import { selectErpAction } from "./actions"
import { getPartnerStatus } from "@/lib/data/partner"
import Link from "next/link"

export default async function SelectErpPage() {
    const user = await requireUser()

    const partnerAccess = await getAllUserPartnerAccess()

    // If no access at all, redirect to partner registration
    if (partnerAccess.length === 0) {
        redirect("/auth/login?mode=partner")
    }

    // Check if user has their own partner account
    const ownPartner = await getPartnerStatus(user.id)
    const hasOwnPartner = !!ownPartner

    // If only one ERP and user owns an ERP, redirect directly.
    // Invited-only users must explicitly select.
    if (partnerAccess.length === 1 && hasOwnPartner) {
        redirect("/erp/dashboard")
    }

    // Multiple ERPs - show selection screen
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
            <div className="w-full max-w-lg">
                {/* Header */}
                <div className="text-center mb-8">
                    <Link href="/" prefetch={false}>
                        <img
                            src="https://img.dudit.com.br/static/Logo.png"
                            alt="Dudit"
                            width={120}
                            height={36}
                            className="h-9 w-auto mx-auto mb-6 hover:opacity-80 transition-opacity"
                        />
                    </Link>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        Selecione o ERP
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                        Você tem acesso a múltiplos ERPs. Escolha qual deseja acessar.
                    </p>
                </div>

                {/* ERP Cards */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
                    {partnerAccess.map((access, index) => (
                        <form key={access.partnerId} action={selectErpAction}>
                            <input type="hidden" name="partnerId" value={access.partnerId} />
                            <button
                                type="submit"
                                className={`
                                    w-full text-left px-6 py-5 flex items-center gap-4
                                    hover:bg-gray-50 dark:hover:bg-gray-800/50
                                    active:bg-gray-100 dark:active:bg-gray-800
                                    transition-colors duration-150 cursor-pointer
                                    ${index > 0 ? "border-t border-gray-100 dark:border-gray-800" : ""}
                                `}
                            >
                                {/* Store Icon */}
                                <div className="w-12 h-12 rounded-xl bg-[#022C2B] flex items-center justify-center shrink-0">
                                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
                                    </svg>
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">
                                        {access.storeName}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                                            {ROLE_LABELS[access.role as PartnerRole] || access.role}
                                        </span>
                                        {access.ownerName && (
                                            <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                                                Proprietário: {access.ownerName}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Arrow */}
                                <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                </svg>
                            </button>
                        </form>
                    ))}
                </div>

                {/* Create Partner Account Button - only show if user doesn't have their own partner */}
                {!hasOwnPartner && (
                    <div className="mt-6 text-center">
                        <Link
                            href="/auth/login?mode=partner"
                            prefetch={false}
                            className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-[#022C2B] bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            Criar minha conta de parceiro
                        </Link>
                    </div>
                )}

                {/* Footer */}
                <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">
                    © {new Date().getFullYear()} Dudit Inc.
                </p>
            </div>
        </div>
    )
}
