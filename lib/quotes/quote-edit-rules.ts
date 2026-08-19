/**
 * Regras de edição de orçamentos por status (ERP).
 * Status no banco: minúsculas (draft, sent, approved, rejected, expired, cancelled).
 */

/** Nome exibido quando não há cliente vinculado ao orçamento. */
export const QUOTE_DEFAULT_CUSTOMER_LABEL = "Consumidor final"

export type QuoteStatusLower = "draft" | "sent" | "pending_client" | "viewed" | "approved" | "rejected" | "expired" | "cancelled" | "converted_to_order"

const VALID: QuoteStatusLower[] = ["draft", "sent", "pending_client", "viewed", "approved", "rejected", "expired", "cancelled", "converted_to_order"]

export function normalizeQuoteStatus(status: string | null | undefined): QuoteStatusLower | "unknown" {
    const s = String(status || "").toLowerCase().trim()
    if (VALID.includes(s as QuoteStatusLower)) return s as QuoteStatusLower
    return "unknown"
}

export function canEditFinancialFields(status: string): boolean {
    return normalizeQuoteStatus(status) === "draft"
}

/** Campos “leves”: observações ao cliente, validade, observações internas (não itens/preços/cliente). */
export function canEditLightFields(status: string): boolean {
    const s = normalizeQuoteStatus(status)
    return s === "draft" || s === "sent" || s === "pending_client" || s === "viewed"
}

export function canEditAnything(status: string): boolean {
    return normalizeQuoteStatus(status) === "draft"
}

/** Apenas observações internas (e metadados futuros). */
export function canEditInternalNotesOnly(status: string): boolean {
    const s = normalizeQuoteStatus(status)
    return s === "approved" || s === "rejected" || s === "expired" || s === "cancelled" || s === "converted_to_order"
}

export const MSG_LOCKED = "Este orçamento não pode ser alterado no status atual."
export const MSG_SENT_FINANCIAL =
    "Com o orçamento enviado, não é possível alterar itens, preços, cliente ou dados financeiros. Reabra como rascunho para editar tudo, ou altere apenas observações, validade ou notas internas."
export const MSG_APPROVED_FINANCIAL =
    "Orçamento aprovado: só observações internas podem ser alteradas. Para mudar valores ou itens, duplique o orçamento."
export const MSG_REJECTED_EXPIRED_CANCELLED =
    "Neste status o orçamento está bloqueado; apenas observações internas podem ser alteradas."

export interface QuoteEditCaps {
    canEditItems: boolean
    canEditCustomer: boolean
    canEditIssueDate: boolean
    canEditDiscountShipping: boolean
    canEditProposalNotes: boolean
    canEditExpirationDate: boolean
    canEditInternalNotes: boolean
    /** Aparência do PDF (cores, título): tratado como metadado; permitido em rascunho, enviado e aprovado. */
    canEditLightFields: boolean
    canChangeStatus: boolean
    /** Exibir CTA “Reabrir” (sent → draft). */
    showReopenCta: boolean
    /** Exibir CTA “Duplicar” (approved, etc.). */
    showDuplicateCta: boolean
    /** Mensagem curta para banner quando há bloqueio parcial. */
    bannerMessage: string | null
}

export function getQuoteEditCaps(status: string, converted: boolean, isMarketplaceOrigin: boolean = false): QuoteEditCaps {
    const s = normalizeQuoteStatus(status)

    if (converted || s === "converted_to_order") {
        return {
            canEditItems: false,
            canEditCustomer: false,
            canEditIssueDate: false,
            canEditDiscountShipping: false,
            canEditProposalNotes: false,
            canEditExpirationDate: false,
            canEditInternalNotes: false,
            canEditLightFields: false,
            canChangeStatus: false,
            showReopenCta: false,
            showDuplicateCta: true,
            bannerMessage: "Este orçamento já foi convertido em pedido e não pode ser editado.",
        }
    }

    if (s === "draft") {
        return {
            canEditItems: true,
            canEditCustomer: !isMarketplaceOrigin,
            canEditIssueDate: true,
            canEditDiscountShipping: true,
            canEditProposalNotes: true,
            canEditExpirationDate: true,
            canEditInternalNotes: true,
            canEditLightFields: true,
            canChangeStatus: true,
            showReopenCta: false,
            showDuplicateCta: false,
            bannerMessage: null,
        }
    }

    if (s === "sent" || s === "pending_client" || s === "viewed") {
        return {
            canEditItems: false,
            canEditCustomer: false,
            canEditIssueDate: false,
            canEditDiscountShipping: false,
            canEditProposalNotes: true,
            canEditExpirationDate: true,
            canEditInternalNotes: true,
            canEditLightFields: true,
            canChangeStatus: true,
            showReopenCta: true,
            showDuplicateCta: false,
            bannerMessage: MSG_SENT_FINANCIAL,
        }
    }

    if (s === "approved") {
        return {
            canEditItems: false,
            canEditCustomer: false,
            canEditIssueDate: false,
            canEditDiscountShipping: false,
            canEditProposalNotes: false,
            canEditExpirationDate: false,
            canEditInternalNotes: true,
            canEditLightFields: true,
            canChangeStatus: true,
            showReopenCta: false,
            showDuplicateCta: true,
            bannerMessage: MSG_APPROVED_FINANCIAL,
        }
    }

    if (s === "rejected" || s === "expired" || s === "cancelled") {
        return {
            canEditItems: false,
            canEditCustomer: false,
            canEditIssueDate: false,
            canEditDiscountShipping: false,
            canEditProposalNotes: false,
            canEditExpirationDate: false,
            canEditInternalNotes: true,
            canEditLightFields: false,
            canChangeStatus: true,
            showReopenCta: false,
            showDuplicateCta: true,
            bannerMessage: MSG_REJECTED_EXPIRED_CANCELLED,
        }
    }

    return {
        canEditItems: false,
        canEditCustomer: false,
        canEditIssueDate: false,
        canEditDiscountShipping: false,
        canEditProposalNotes: false,
        canEditExpirationDate: false,
        canEditInternalNotes: false,
        canEditLightFields: false,
        canChangeStatus: false,
        showReopenCta: false,
        showDuplicateCta: true,
        bannerMessage: MSG_LOCKED,
    }
}
