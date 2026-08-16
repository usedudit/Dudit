"use client"

import { useRouter } from "next/navigation"
import AdminReturnDetailView from "@/components/admin/returns/AdminReturnDetailView"

interface Props {
    detail: any
}

export default function AdminReturnDetailClientWrapper({ detail }: Props) {
    const router = useRouter()

    return (
        <AdminReturnDetailView
            detail={detail}
            onBack={() => router.push("/ddt-admin/returns")}
        />
    )
}
