"use client"

import { useRouter } from "next/navigation"
import AdminModerationDetailView from "@/components/admin/moderation/AdminModerationDetailView"
import type { ModerationItem } from "@/lib/admin/types"

interface Props {
    item: ModerationItem
}

export default function AdminModerationDetailClientWrapper({ item }: Props) {
    const router = useRouter()

    return (
        <AdminModerationDetailView
            item={item}
            onBack={() => router.push("/ddt-admin/moderation")}
        />
    )
}
