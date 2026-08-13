"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { successResponse, errorResponse } from "@/lib/utils/action-helpers"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { unstable_cache } from "next/cache"
import { TAGS } from "@/lib/utils/revalidation-tags"
import {
    buildPartnerTaxIdLine,
    type SaleReceiptPartnerHeader,
} from "@/lib/sales/sale-receipt"

const getCachedPartnerReceiptHeader = (partnerId: string, storeId?: string) => unstable_cache(
    async () => {
        const supabase = getAdminClient()

        const [{ data: partner, error: partnerError }, storeRes] = await Promise.all([
            supabase
                .from("partners")
                .select("id")
                .eq("id", partnerId)
                .maybeSingle(),
            storeId
                ? supabase
                    .from("stores")
                    .select("id, name, description, cnpj, cpf, crt, contribuinte, inscricao_estadual, ie_isento, inscricao_municipal, phone")
                    .eq("id", storeId)
                    .maybeSingle()
                : supabase
                    .from("stores")
                    .select("id, name, description, cnpj, cpf, crt, contribuinte, inscricao_estadual, ie_isento, inscricao_municipal, phone")
                    .eq("partner_id", partnerId)
                    .order("is_headquarters", { ascending: false })
                    .limit(1)
                    .maybeSingle(),
        ])

        if (partnerError) {
            console.error("[getCachedPartnerReceiptHeader] partner:", partnerError)
            throw new Error("Erro ao buscar dados do estabelecimento")
        }
        if (!partner) throw new Error("Parceiro não encontrado")

        const store = storeRes.data
        const effectiveStoreId = storeId || store?.id

        let addrData: any = null

        // 1. Try store_id address if store ID is available
        if (effectiveStoreId) {
            const { data: sAddr } = await supabase
                .from("addresses")
                .select("street, number, complement, neighborhood, city, state, zip_code")
                .eq("store_id", effectiveStoreId)
                .limit(1)
                .maybeSingle()
            if (sAddr && (sAddr.street || sAddr.city)) {
                addrData = sAddr
            }
        }

        // 2. Try default or any partner address
        if (!addrData && partnerId) {
            const { data: pAddr } = await supabase
                .from("addresses")
                .select("street, number, complement, neighborhood, city, state, zip_code")
                .eq("partner_id", partnerId)
                .order("is_default", { ascending: false })
                .limit(1)
                .maybeSingle()
            if (pAddr && (pAddr.street || pAddr.city)) {
                addrData = pAddr
            }
        }

        // 3. Try any store's address for the partner
        if (!addrData && partnerId) {
            const { data: partnerStores } = await supabase
                .from("stores")
                .select("id")
                .eq("partner_id", partnerId)
            const sIds = (partnerStores || []).map((s: any) => s.id)
            if (sIds.length > 0) {
                const { data: fallbackStoreAddr } = await supabase
                    .from("addresses")
                    .select("street, number, complement, neighborhood, city, state, zip_code")
                    .in("store_id", sIds)
                    .limit(1)
                    .maybeSingle()
                if (fallbackStoreAddr && (fallbackStoreAddr.street || fallbackStoreAddr.city)) {
                    addrData = fallbackStoreAddr
                }
            }
        }

        const addr = addrData || {}
        const streetNumber = [addr.street, addr.number !== null && addr.number !== undefined && String(addr.number).trim() !== "" ? addr.number : null].filter(Boolean).join(", ")
        const neighborhoodCityState = [addr.neighborhood, [addr.city, addr.state].filter(Boolean).join("/")].filter(Boolean).join(" - ")
        const addressLine = [streetNumber, neighborhoodCityState].filter(Boolean).join("\n")

        const header: SaleReceiptPartnerHeader = {
            fantasyName: store?.name || "Estabelecimento",
            legalName: "",
            addressLine: addressLine || "Endereço não informado",
            taxIdLine: buildPartnerTaxIdLine({
                cnpj: store?.cnpj,
                stateRegistration: store?.inscricao_estadual,
                municipalRegistration: store?.inscricao_municipal,
                ieIsento: store?.ie_isento,
            }),
            phone: store?.phone || null,
        }

        return header
    },
    [`partner-receipt-header-${partnerId}-${storeId || "default"}`],
    {
        tags: [TAGS.partner(partnerId), TAGS.addresses("partner", partnerId)],
        revalidate: 3600 // 1 hour TTL
    }
)

export async function getPartnerReceiptHeaderAction(partnerId: string, storeId?: string) {
    try {
        const user = await requireUser()
        if (!user) return errorResponse("Não autenticado")

        await requirePermission(partnerId, "orders", "view")

        const header = await getCachedPartnerReceiptHeader(partnerId, storeId)()
        return successResponse(header)
    } catch (err: any) {
        console.error("[getPartnerReceiptHeaderAction]", err)
        return errorResponse(err?.message || "Erro interno ao buscar dados do recibo")
    }
}
