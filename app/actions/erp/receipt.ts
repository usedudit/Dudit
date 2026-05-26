"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { successResponse, errorResponse } from "@/lib/utils/action-helpers"
import { requireUser, requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import {
    buildPartnerTaxIdLine,
    type SaleReceiptPartnerHeader,
} from "@/lib/sales/sale-receipt"
import { decryptCPF } from "@/lib/crypto"

export async function getPartnerReceiptHeaderAction(partnerId: string) {
    try {
        const user = await requireUser()
        if (!user) return errorResponse("Não autenticado")

        await requirePartnerAccessWithPermission(partnerId, "orders", "view")

        const supabase = await getSupabaseServerClient()

        const [{ data: partner, error: partnerError }, { data: address, error: addressError }] =
            await Promise.all([
                supabase
                    .from("partners")
                    .select(
                        "store_name, store_description, cnpj, cpf_encrypted, inscricao_estadual, inscricao_municipal, ie_isento",
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
            console.error("[getPartnerReceiptHeaderAction] partner:", partnerError)
            return errorResponse("Erro ao buscar dados do estabelecimento")
        }
        if (!partner) return errorResponse("Parceiro não encontrado")

        const addr = address || {}
        const addressParts = [
            [addr.street, addr.number].filter(Boolean).join(" "),
            addr.neighborhood,
            [addr.city, addr.state].filter(Boolean).join("/"),
            addr.zip_code ? `CEP: ${addr.zip_code}` : null,
        ].filter(Boolean)

        let decryptedCpf: string | null = null
        if (partner.cpf_encrypted) {
            try {
                decryptedCpf = await decryptCPF(partner.cpf_encrypted)
            } catch (e) {
                console.error("[getPartnerReceiptHeaderAction] Error decrypting CPF:", e)
            }
        }

        const header: SaleReceiptPartnerHeader = {
            fantasyName: partner.store_name || "Estabelecimento",
            legalName: partner.store_description || partner.store_name || "Estabelecimento",
            addressLine: addressParts.join(", ") || "Endereço não informado",
            taxIdLine: buildPartnerTaxIdLine({
                cnpj: partner.cnpj,
                cpf: decryptedCpf,
                stateRegistration: partner.inscricao_estadual,
                municipalRegistration: partner.inscricao_municipal,
                ieIsento: partner.ie_isento,
            }),
        }

        if (addressError) {
            console.warn("[getPartnerReceiptHeaderAction] address:", addressError)
        }

        return successResponse(header)
    } catch (err) {
        console.error("[getPartnerReceiptHeaderAction]", err)
        return errorResponse("Erro interno ao buscar dados do recibo")
    }
}
