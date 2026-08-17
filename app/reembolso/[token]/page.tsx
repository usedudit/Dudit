import { notFound } from "next/navigation"
import { getPublicRefundDetailsAction } from "@/app/actions/billing/refunds"
import { PublicRefundPortal } from "@/components/public/PublicRefundPortal"
import type { Metadata } from "next"

interface PageProps {
    params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { token } = await params
    return {
        title: "Acompanhamento de Reembolso | Dudit",
        description: "Portal público de acompanhamento de solicitação de reembolso de assinatura.",
        robots: { index: false, follow: false },
    }
}

export default async function PublicRefundPage({ params }: PageProps) {
    const { token } = await params

    const res = await getPublicRefundDetailsAction(token)
    if (!res.success || !res.refund) {
        notFound()
    }

    return <PublicRefundPortal refund={res.refund} />
}
