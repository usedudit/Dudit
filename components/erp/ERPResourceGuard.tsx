"use client"

import { usePathname } from "next/navigation"
import { usePermissions } from "@/lib/permission-context"
import { isSystemResourceActive, systemResourceForPath } from "@/lib/system-resources"
import { IconPlaceholder } from "@/components/reusable"

/**
 * Client-side route guard for ERP resources.
 * If the current route is gated by a system resource that was deactivated by
 * the owner (Gerenciar recursos), renders a "no access" screen instead.
 */
export function ERPResourceGuard({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const { businessInfo } = usePermissions()

    if (!pathname) return <>{children}</>

    const resourceId = systemResourceForPath(pathname)
    const active = !resourceId || isSystemResourceActive(businessInfo, resourceId)

    if (active) return <>{children}</>

    return (
        <div className="flex items-center justify-center min-h-[calc(100vh-65px)] p-4 text-center">
            <div className="flex flex-col items-center">
                <IconPlaceholder
                    placeholderType="image"
                    imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
                    imageAlt="Recurso indisponível"
                    title="Recurso indisponível"
                    subtitle="Este recurso está desativado no seu sistema. Fale com o proprietário do negócio para reativá-lo."
                    itemButton={{
                        text: "Voltar para o Início",
                        action: "/erp/inicio"
                    }}
                />
            </div>
        </div>
    )
}