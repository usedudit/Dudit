"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { successResponse, errorResponse } from "@/lib/utils/action-helpers"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { unstable_cache } from "next/cache"
import { TAGS } from "@/lib/utils/revalidation-tags"
import {
    buildPartnerTaxIdLine,
    type SaleReceiptPartnerHeader,
} from "@/lib/sales/sale-receipt"

const getCachedPartnerReceiptHeader = (partnerId: string) => unstable_cache(
    async () => {
        const supabase = await getSupabaseServerClient()

        const [{ data: partner, error: partnerError }, { data: address, error: addressError }] =
            await Promise.all([
                supabase
                    .from("partners")
                    .select(
                        "store_name, store_description, cnpj, inscricao_estadual, inscricao_municipal, ie_isento",
                    )
                    .eq("id", partnerId)
                    .maybeSingle(),
                supabase
                    .from("addresses")
                    .select("street, number, complement, neighborhood, city, state, zip_code")
                    .eq("partner_id", partnerId)
                    .eq("is_default", true)
                    .maybeSingle(),
            ])

        if (partnerError) {
            console.error("[getCachedPartnerReceiptHeader] partner:", partnerError)
            throw new Error("Erro ao buscar dados do estabelecimento")
        }
        if (!partner) throw new Error("Parceiro não encontrado")

        const addr = address || {}
        const addressParts = [
            [addr.street, addr.number].filter(Boolean).join(" "),
            addr.neighborhood,
            [addr.city, addr.state].filter(Boolean).join("/"),
            addr.zip_code ? `CEP: ${addr.zip_code}` : null,
        ].filter(Boolean)

        const header: SaleReceiptPartnerHeader = {
            fantasyName: partner.store_name || "Estabelecimento",
            legalName: partner.store_description || partner.store_name || "Estabelecimento",
            addressLine: addressParts.join(", ") || "Endereço não informado",
            taxIdLine: buildPartnerTaxIdLine({
                cnpj: partner.cnpj,
                stateRegistration: partner.inscricao_estadual,
                municipalRegistration: partner.inscricao_municipal,
                ieIsento: partner.ie_isento,
            }),
        }

        if (addressError) {
            console.warn("[getCachedPartnerReceiptHeader] address:", addressError)
        }

        return header
    },
    [`partner-receipt-header-${partnerId}`],
    {
        tags: [TAGS.partner(partnerId), TAGS.addresses("partner", partnerId)],
        revalidate: 3600 // 1 hour TTL
    }
)

export async function getPartnerReceiptHeaderAction(partnerId: string) {
    try {
        const user = await requireUser()
        if (!user) return errorResponse("Não autenticado")

        await requirePermission(partnerId, "orders", "view")

        const header = await getCachedPartnerReceiptHeader(partnerId)()
        return successResponse(header)
    } catch (err: any) {
        console.error("[getPartnerReceiptHeaderAction]", err)
        return errorResponse(err?.message || "Erro interno ao buscar dados do recibo")
    }
}
