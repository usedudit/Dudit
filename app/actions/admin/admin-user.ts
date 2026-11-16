"use server"

import { getAdminRole } from "@/lib/auth/admin-authorization"
import type { AdminRole } from "@/lib/admin/types"

export interface CurrentAdminRoleResult {
    role: AdminRole
    email: string
}

export async function getCurrentAdminRoleAction(): Promise<CurrentAdminRoleResult | null> {
    try {
        const adminUser = await getAdminRole()
        if (!adminUser) return null
        return {
            role: adminUser.role,
            email: adminUser.email,
        }
    } catch {
        return null
    }
}
