/**
 * Canonical allow-list of report reasons (denúncias).
 *
 * Stored on `reports.reason_code`. The legacy free-text `reports.reason`
 * remains for backwards-compatibility (and we keep populating it with the
 * label so existing admin queries / audit metadata don't break).
 */

export type ReportReasonCode =
    | "scam_or_fraud"
    | "inappropriate_content"
    | "copyright_violation"
    | "counterfeit"
    | "spam_or_misleading"
    | "harassment_or_hate"
    | "illegal_or_dangerous"
    | "fake_listing"
    | "return_sla_violation"
    | "return_denied_unfairly"
    | "seller_abuse"
    | "return_abuse"
    | "other"

export const REPORT_REASON_LABELS: Record<ReportReasonCode, string> = {
    scam_or_fraud: "Golpe / fraude",
    inappropriate_content: "Conteúdo inapropriado",
    copyright_violation: "Violação de direitos autorais",
    counterfeit: "Produto falsificado",
    spam_or_misleading: "Spam ou enganoso",
    harassment_or_hate: "Assédio / discurso de ódio",
    illegal_or_dangerous: "Item ilegal ou perigoso",
    fake_listing: "Anúncio falso / inexistente",
    return_sla_violation: "Prazo de resposta expirado (troca/devolução)",
    return_denied_unfairly: "Recusa indevida de troca/devolução",
    seller_abuse: "Abuso do vendedor",
    return_abuse: "Abuso na solicitação de devolução",
    other: "Outro motivo",
}

export const REPORT_REASON_CODES: ReportReasonCode[] = Object.keys(
    REPORT_REASON_LABELS
) as ReportReasonCode[]

export function isValidReasonCode(code: unknown): code is ReportReasonCode {
    return typeof code === "string" && code in REPORT_REASON_LABELS
}

export function getReasonLabel(code: string | null | undefined): string {
    if (!code) return ""
    return REPORT_REASON_LABELS[code as ReportReasonCode] || code
}

/**
 * Severity weight used by the admin UI to order/badge reports.
 * It is NOT used to apply risk_score automatically (that stays a fixed
 * +5 by validation, controlled by `validate_report` RPC).
 */
export const REPORT_REASON_SEVERITY: Record<ReportReasonCode, "low" | "normal" | "high"> = {
    scam_or_fraud: "high",
    illegal_or_dangerous: "high",
    counterfeit: "high",
    harassment_or_hate: "high",
    copyright_violation: "normal",
    inappropriate_content: "normal",
    fake_listing: "normal",
    return_sla_violation: "high",
    return_denied_unfairly: "high",
    seller_abuse: "high",
    return_abuse: "normal",
    spam_or_misleading: "low",
    other: "low",
}

export function getReasonSeverity(code: string | null | undefined): "low" | "normal" | "high" {
    if (!code) return "low"
    return REPORT_REASON_SEVERITY[code as ReportReasonCode] || "low"
}
