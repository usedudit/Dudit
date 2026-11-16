"use client"

import { useState, useEffect } from "react"
import { useStore } from "@/lib/store-context"
import Dropdown, { DropdownItem } from "@/components/reusable/Dropdown"
import { StoreModal } from "@/components/erp/stores/StoreModal"
import { useRouter } from "next/navigation"
import { PlusIcon, SettingsIcon, ChevronsUpDown } from "@/lib/icons"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { usePermissions } from "@/lib/permission-context"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { cn } from "@/lib/utils"

const ROLE_LABELS: Record<string, string> = {
    owner: "Proprietário",
    admin: "Administrador",
    manager: "Gestor",
    operator: "Operador",
    delivery: "Entregador",
}

function formatUserRole(role?: string | null): string {
    if (!role) return ""
    return ROLE_LABELS[role.toLowerCase()] || role
}

interface StoreSwitcherProps {
    variant?: "header" | "sidebar"
    className?: string
    showNameAlways?: boolean
    onSelect?: () => void
}

export function StoreSwitcher({
    variant = "header",
    className,
    showNameAlways = false,
    onSelect,
}: StoreSwitcherProps = {}) {
    const { selectedStore, stores, isLoading, selectStore, refreshStores } = useStore()
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [partnerId, setPartnerId] = useState<string>("")
    const router = useRouter()
    const { planSlug, businessInfo } = usePermissions()
    const { openPlanUpgrade } = usePlanUpgrade()

    const isDesapego = normalizeBusinessInfo(businessInfo).mode === "desapego"

    useEffect(() => {
        if (selectedStore?.partner_id) {
            setPartnerId(selectedStore.partner_id)
        }
    }, [selectedStore])

    if (isLoading || !selectedStore) {
        return <div className="w-9 h-9 rounded-lg bg-gray-200 dark:bg-dark-border animate-pulse" />
    }

    const storeLogo = getR2ImageUrl(selectedStore.logo_url || selectedStore.image_url)

    const isSidebar = variant === "sidebar"

    // No modo Desapego, não há filiais/múltiplas lojas e nem gerenciamento de lojas
    if (isDesapego) {
        if (isSidebar) {
            return (
                <div
                    className={cn(
                        "flex items-center gap-2.5 w-full p-2.5 rounded-xl bg-white/5 border border-dark-border select-none",
                        className,
                    )}
                >
                    <img
                        src={storeLogo || "https://img.dudit.com.br/static/Placeholder.png"}
                        alt={selectedStore.name}
                        className="w-8 h-8 rounded-lg object-cover border border-dark-border shrink-0"
                    />
                    <div className="flex flex-col min-w-0 flex-1 text-left">
                        <span className="text-sm font-semibold text-white truncate line-clamp-1">
                            {selectedStore.name}
                        </span>
                        {selectedStore.user_role && (
                            <span className="text-[11px] text-green-400 truncate">
                                {formatUserRole(selectedStore.user_role)}
                            </span>
                        )}
                    </div>
                </div>
            )
        }

        return (
            <div
                className={cn(
                    "flex items-center space-x-2 select-none",
                    className,
                )}
            >
                <img
                    src={storeLogo || "https://img.dudit.com.br/static/Placeholder.png"}
                    alt={selectedStore.name}
                    className="w-8 h-8 rounded-full object-cover"
                />
                <div className={showNameAlways ? "flex flex-col" : "hidden sm:flex flex-col"}>
                    <span className="text-md font-semibold text-brand-dark dark:text-dark-heading line-clamp-1">
                        {selectedStore.name}
                    </span>
                    {selectedStore.user_role && (
                        <span className="text-xs text-brand-green">
                            {formatUserRole(selectedStore.user_role)}
                        </span>
                    )}
                </div>
            </div>
        )
    }

    const handleCreateClick = () => {
        if (!hasMinimumPlan(planSlug, "escalar")) {
            openPlanUpgrade("escalar")
            return
        }
        setIsModalOpen(true)
    }

    const handleManageClick = () => {
        if (!hasMinimumPlan(planSlug, "escalar")) {
            openPlanUpgrade("escalar")
            return
        }
        onSelect?.()
        router.push("/erp/lojas")
    }

    return (
        <>
            <Dropdown
                trigger={
                    isSidebar ? (
                        <div
                            className={cn(
                                "flex items-center justify-between w-full p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-dark-border transition-colors cursor-pointer group",
                                className,
                            )}
                        >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <img
                                    src={storeLogo || "https://img.dudit.com.br/static/Placeholder.png"}
                                    alt={selectedStore.name}
                                    className="w-8 h-8 rounded-lg object-cover border border-dark-border shrink-0"
                                />
                                <div className="flex flex-col min-w-0 flex-1 text-left">
                                    <span className="text-sm font-semibold text-white truncate line-clamp-1">
                                        {selectedStore.name}
                                    </span>
                                    {selectedStore.user_role && (
                                        <span className="text-[11px] text-green-400 truncate">
                                            {formatUserRole(selectedStore.user_role)}
                                        </span>
                                    )}
                                    <span className="text-[11px] text-brand-inactive-text truncate">
                                        Trocar filial / loja
                                    </span>
                                </div>
                            </div>
                            <ChevronsUpDown className="w-4 h-4 text-brand-inactive-text group-hover:text-white shrink-0 transition-colors" />
                        </div>
                    ) : (
                        <div
                            className={cn(
                                "flex items-center space-x-2 cursor-pointer dark:hover:bg-dark-border transition-colors",
                                className,
                            )}
                        >
                            <img
                                src={storeLogo || "https://img.dudit.com.br/static/Placeholder.png"}
                                alt={selectedStore.name}
                                className="w-8 h-8 rounded-full object-cover"
                            />
                            <div className={showNameAlways ? "flex flex-col" : "hidden sm:flex flex-col"}>
                                <span className="text-md font-semibold text-brand-dark dark:text-dark-heading line-clamp-1">
                                    {selectedStore.name}
                                </span>
                                {selectedStore.user_role && (
                                    <span className="text-xs text-brand-green">
                                        {formatUserRole(selectedStore.user_role)}
                                    </span>
                                )}
                            </div>
                        </div>
                    )
                }
                align="left"
                showChevron={false}
                fullWidth={isSidebar}
            >
                {stores.map((store) => {
                    const storeImage = getR2ImageUrl(store.logo_url) || "https://img.dudit.com.br/static/Placeholder.png"

                    return (
                        <DropdownItem
                            key={store.id}
                            onClick={() => {
                                selectStore(store.id)
                                onSelect?.()
                            }}
                            className={selectedStore.id === store.id ? "bg-brand-primary/10" : ""}
                        >
                            <div className="flex items-center gap-3 w-full">
                                <img
                                    src={storeImage || "https://img.dudit.com.br/static/Placeholder.png"}
                                    alt={store.name}
                                    className="w-6 h-6 rounded-full object-cover shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{store.name}</p>
                                    {store.user_role && (
                                        <p className="text-xs text-brand-green truncate">
                                            {formatUserRole(store.user_role)}
                                        </p>
                                    )}
                                </div>
                                {selectedStore.id === store.id && (
                                    <div className="w-2 h-2 rounded-full bg-brand-primary shrink-0" />
                                )}
                            </div>
                        </DropdownItem>
                    )
                })}

                <div className="my-1 border-t border-brand-border dark:border-dark-border" />

                <DropdownItem
                    onClick={handleCreateClick}
                    className="text-brand-primary hover:bg-brand-primary/10 flex items-center gap-2"
                >
                    <PlusIcon className="w-4 h-4" />
                    <span>Novo local</span>
                </DropdownItem>

                <DropdownItem
                    onClick={handleManageClick}
                    className="flex items-center gap-2"
                >
                    <SettingsIcon className="w-4 h-4" />
                    <span>Gerenciar lojas</span>
                </DropdownItem>
            </Dropdown>

            {partnerId && (
                <StoreModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    partnerId={partnerId}
                    onSaved={() => {
                        refreshStores()
                    }}
                />
            )}
        </>
    )
}
