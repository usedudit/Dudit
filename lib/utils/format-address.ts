export type AddressParts = {
    street?: string | null;
    number?: string | number | null;
    complement?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    uf?: string | null;
    zip_code?: string | null;
    zipCode?: string | null;
}

export function formatAddressParts(addr: AddressParts | null | undefined): string | null {
    if (!addr) return null

    const streetStr = addr.street || ""
    const num = addr.number
    const numStr = num !== null && num !== undefined && String(num).trim() !== "" ? `, ${String(num).trim()}` : ""
    const compStr = addr.complement ? ` - ${addr.complement}` : ""
    const line1 = `${streetStr}${numStr}${compStr}`.trim().replace(/^,/, "").trim()

    const neighStr = addr.neighborhood || ""
    const cityStr = addr.city || ""
    const stateStr = addr.state || addr.uf || ""
    const line2 = `${neighStr ? `${neighStr} - ` : ""}${cityStr}${stateStr ? `/${stateStr}` : ""}`.trim()

    const lines = [line1, line2].filter(Boolean)
    return lines.length > 0 ? lines.join("\n") : null
}

const CEP_LINE_REGEX = /^CEP\s*[:\-]?\s*\d{5}-?\d{3}$/i
const CEP_SEGMENT_REGEX = /(,\s*)?CEP\s*[:\-]?\s*\d{5}-?\d{3}/gi
const CEP_TRAILING_REGEX = /,\s*\d{5}-?\d{3}$/

export function stripCep(raw: string): string {
    if (!raw) return raw
    return raw
        .replace(CEP_SEGMENT_REGEX, "")
        .replace(CEP_TRAILING_REGEX, "")
        .replace(/\s{2,}/g, " ")
        .trim()
}

export function formatAddressBlock(raw: string | null | undefined, maxLines = 2): string {
    const lines = (raw || "")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !CEP_LINE_REGEX.test(l))
    return lines.slice(0, maxLines).join("\n")
}
