import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth/authorization"
import { getAllUserPartnerAccess } from "@/lib/auth/partner-context"
import type { PartnerRole } from "@/lib/permissions/types"
import type { RoleId } from "@/lib/permissions/rbac-types"
import { selectErpAction } from "./actions"
import { getPartnerStatus } from "@/lib/data/partner"
import Link from "next/link"
import { Button, ListItem, Badge } from "@/components/reusable"
import { PlusIcon } from "@/lib/icons"

const ROLE_LABELS: Record<PartnerRole, string> = {
    OWNER: "Proprietário",
    ADMIN: "Administrador",
    MANAGER: "Gestor",
    OPERATOR: "Operador",
    DELIVERY: "Entregador",
}

function roleIdToPartnerRole(roleId: RoleId | string | null | undefined): PartnerRole {
    const upper = String(roleId || "delivery").toUpperCase()
    return (upper === "OWNER" || upper === "ADMIN" || upper === "MANAGER" || upper === "OPERATOR" || upper === "DELIVERY")
        ? (upper as PartnerRole)
        : ("DELIVERY" as PartnerRole)
}

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

    // Check if user has access to any ERP that isn't theirs
    const hasNonOwnAccess = partnerAccess.some(a => a.roleId !== "owner")

    // Only auto-redirect if the user has a single ERP that belongs to them
    if (partnerAccess.length === 1 && !hasNonOwnAccess) {
        redirect("/erp/dashboard")
    }

    // Sort: own ERPs first, then others
    const sortedAccess = [
        ...partnerAccess.filter(a => a.roleId === "owner"),
        ...partnerAccess.filter(a => a.roleId !== "owner"),
    ]

    // Multiple ERPs - show selection screen
    return (
        <div className="flex flex-col min-h-screen bg-gray-50">
            <header className="lg:flex flex-col w-full bg-brand-dark sticky top-0 z-50 shadow-md">
                <div className="w-full h-[68px] flex items-center justify-center max-w-[1400px] px-2 mx-auto gap-4">
                    <a href="/" className="cursor-pointer shrink-0 z-[110] pt-1">
                        <img
                            src="https://img.dudit.com.br/static/Logo.png"
                            alt="Dudit"
                            width={140}
                            height={40}
                            className="h-10 w-auto object-contain"
                        />
                    </a>
                </div>
            </header>

            <main className="flex-1 flex flex-col justify-center items-center px-4 py-12 md:py-16">
                <div className="w-full max-w-lg flex flex-col gap-6">
                    <div className="text-center mb-4">
                        <h1 className="text-2xl font-bold text-brand-dark mb-2">
                            Que bom te ver por aqui!
                        </h1>
                        <p className="text-brand-dark text-sm">
                            Você tem acesso a um ou mais negócios. Escolha qual deseja acessar.
                        </p>
                    </div>

                    {/* ERP Cards */}
                    <div className="flex flex-col gap-3">
                        {sortedAccess.map((access, index) => {
                            const isOwn = access.roleId === "owner"

                            return (
                                <form key={access.partnerId} action={selectErpAction}>
                                    <input type="hidden" name="partnerId" value={access.partnerId} />
                                    <button
                                        type="submit"
                                        className="w-full text-left block bg-transparent p-0 border-0 cursor-pointer focus:outline-none"
                                    >
                                        <ListItem
                                            className={`px-6 py-5 gap-4 ${isOwn ? "ring-2 ring-brand-primary/20 bg-brand-primary/5" : ""}`}
                                            left={
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isOwn ? "bg-brand-primary" : "bg-[#022C2B]"}`}>
                                                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
                                                    </svg>
                                                </div>
                                            }
                                            title={
                                                <div className="flex items-center gap-2">
                                                    <span className="truncate">{access.storeName}</span>
                                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0" />
                                                    <Badge variant="green" icon={null}>
                                                        {ROLE_LABELS[roleIdToPartnerRole(access.roleId)] || access.roleId}
                                                    </Badge>
                                                    {isOwn && (
                                                        <Badge variant="green" icon={null}>
                                                            Seu negócio
                                                        </Badge>
                                                    )}
                                                </div>
                                            }
                                            description={
                                                !isOwn && access.ownerName
                                                    ? `Proprietário: ${access.ownerName}`
                                                    : undefined
                                            }
                                            showChevron={true}
                                        />
                                    </button>
                                    {isOwn && index < sortedAccess.length - 1 && (
                                        <div className="my-2 border-b border-gray-200" />
                                    )}
                                </form>
                            )
                        })}
                    </div>

                    {/* Create Partner Account Button - only show if user doesn't have their own partner */}
                    {!hasOwnPartner && (
                        <div className="mt-6 text-center">
                            <Button
                                asChild
                                leftIcon={<PlusIcon size={18} />}
                            >
                                <Link href="/auth/login?mode=partner">
                                    Criar minha conta de parceiro
                                </Link>
                            </Button>
                        </div>
                    )}
                </div>
            </main>

            <footer className="w-full h-[68px] py-6 border-t border-white/10 bg-brand-dark">
                <div className="max-w-[1400px] mx-auto px-6 flex flex-col md:flex-row justify-center items-center">
                    <p className="text-white text-xs sm:text-sm font-medium tracking-tight">
                        © {new Date().getFullYear()} Dudit Tecnologia Ltda. Todos os direitos reservados.
                    </p>
                </div>
            </footer>
        </div>
    )
}
