import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth/authorization"
import { getAllUserStoreAccess, type StoreAccessRecord } from "@/lib/auth/partner-context"
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

    const storeAccess = await getAllUserStoreAccess()

    // If no access at all, redirect to partner registration
    if (storeAccess.length === 0) {
        redirect("/auth/login?mode=partner")
    }

    // Check if user has their own partner account (owns stores)
    const hasOwnStore = storeAccess.some(a => a.isOwn)

    // Check if user has access to any store that isn't theirs
    const hasNonOwnAccess = storeAccess.some(a => !a.isOwn)

    // Only auto-redirect if the user has a single store that belongs to them
    if (storeAccess.length === 1 && !hasNonOwnAccess) {
        redirect("/erp/inicio")
    }

    // Sort: own stores first, then others
    const sortedAccess = [
        ...storeAccess.filter(a => a.isOwn),
        ...storeAccess.filter(a => !a.isOwn),
    ]

    // Multiple stores - show selection screen
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
                            Você tem acesso a uma ou mais lojas. Escolha qual deseja acessar.
                        </p>
                    </div>

                    {/* Store Cards */}
                    <div className="flex flex-col gap-3">
                        {sortedAccess.map((access, index) => {
                            const isOwn = access.isOwn
                            const roleLabel = ROLE_LABELS[roleIdToPartnerRole(access.roleId)] || access.roleId

                            return (
                                <form key={access.storeId} action={selectErpAction}>
                                    <input type="hidden" name="partnerId" value={access.partnerId} />
                                    <input type="hidden" name="storeId" value={access.storeId} />
                                    <button
                                        type="submit"
                                        className="w-full text-left block bg-transparent p-0 border-0 cursor-pointer focus:outline-none"
                                    >
                                        <ListItem
                                            className={`px-6 py-5 gap-4 ${isOwn ? "ring-2 ring-brand-primary/20 bg-brand-primary/5" : ""}`}
                                            icon={StoreIcon}
                                            title={
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="truncate">{access.storeName}</span>
                                                    {isOwn ? (
                                                        <p className="text-xs font-bold text-brand-green">Sua loja · Matriz</p>
                                                    ) : (
                                                        <p className="text-xs font-bold text-brand-inactive-text">{roleLabel}</p>
                                                    )}
                                                </div>
                                            }
                                            description={
                                                isOwn
                                                    ? `${access.partnerName} - você pode alternar entre matriz e filiais depois de entrar`
                                                    : access.ownerName
                                                        ? `${access.partnerName} · Proprietário: ${access.ownerName}`
                                                        : access.partnerName
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

                    {/* Create Partner Account Button - only show if user doesn't have their own store */}
                    {!hasOwnStore && (
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
