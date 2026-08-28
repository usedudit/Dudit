"use client"

import { useRouter } from "next/navigation"
import AdminRefundDetailView from "@/components/admin/refunds/AdminRefundDetailView"

interface Props {
    detail: any
}

export default function AdminRefundDetailClientWrapper({ detail }: Props) {
    const router = useRouter()

    return (
        <AdminRefundDetailView
            detail={detail}
            onBack={() => router.push("/ddt-admin/billing/reembolsos")}
        />
    )
}
