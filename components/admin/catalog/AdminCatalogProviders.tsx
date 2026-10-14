"use client"

import type { ReactNode } from "react"
import { PermissionProvider } from "@/lib/permission-context"
import { ROUTE_PERMISSION_PRESETS } from "@/lib/permissions/route-permissions"
import { StoreProvider } from "@/lib/store-context"
import { ProductMetadataProvider } from "@/lib/product-metadata-context"
import { getAdminCatalogMetadata } from "@/app/actions/admin/catalog"

interface AdminCatalogProvidersProps {
    partnerId: string
    businessInfo?: unknown
    initialStores?: any[]
    children: ReactNode
}

/**
 * Stack de providers que os forms do ERP esperam (Permission/Store/ProductMetadata),
 * montada para o admin agir como superusuário sobre o catálogo do vendedor.
 * Sem impersonation: as mutações passam pelas actions admin (service role + audit).
 */
export function AdminCatalogProviders({
    partnerId,
    businessInfo,
    initialStores = [],
    children,
}: AdminCatalogProvidersProps) {
    return (
        <PermissionProvider
            role="OWNER"
            routePermissions={ROUTE_PERMISSION_PRESETS.OWNER}
            partnerId={partnerId}
            businessInfo={businessInfo ?? {}}
            planSlug="escalar"
        >
            <StoreProvider partnerId={partnerId} initialStores={initialStores}>
                <ProductMetadataProvider loadAction={getAdminCatalogMetadata}>
                    {children}
                </ProductMetadataProvider>
            </StoreProvider>
        </PermissionProvider>
    )
}
