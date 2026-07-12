import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth/authorization"
import { getAllUserPartnerAccess } from "@/lib/auth/partner-context"
import type { PartnerRole } from "@/lib/permissions/types"
import type { RoleId } from "@/lib/permissions/rbac-types"
import { selectErpAction } from "./actions"
import Link from "next/link"
import { Button, ListItem, Badge } from "@/components/reusable"
import { PlusIcon, StoreIcon } from "@/lib/icons"

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
    const hasOwnPartner = partnerAccess.some(a => a.roleId === "owner")

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
            <header className="lg:flex flex-col w-full sticky top-0 z-50 shadow-md">
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
                                            icon={StoreIcon}
                                            title={
                                                <div className="flex items-center gap-2">
                                                    <span className="truncate">{access.storeName} |</span>
                                                    <p className="text-xs font-bold text-brand-inactive-text">{ROLE_LABELS[roleIdToPartnerRole(access.roleId)] || access.roleId}</p>

                                                    {isOwn && (
                                                        <p className="text-xs font-bold text-brand-green">Seu negócio</p>
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
