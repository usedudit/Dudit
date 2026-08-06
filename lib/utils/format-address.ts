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
    const numStr = num !== null && num !== undefined && String(num).trim() !== "" ? `, ${String(num).trim()}` : ", S/N"
    const compStr = addr.complement ? ` - ${addr.complement}` : ""
    const line1 = `${streetStr}${numStr}${compStr}`.trim().replace(/^,/, "").trim()

    const neighStr = addr.neighborhood || ""
    const cityStr = addr.city || ""
    const stateStr = addr.state || addr.uf || ""
    const line2 = `${neighStr ? `${neighStr} - ` : ""}${cityStr}${stateStr ? `/${stateStr}` : ""}`.trim()

    const lines = [line1, line2].filter(Boolean)
    return lines.length > 0 ? lines.join("\n") : null
}

export function buildFormattedAddress(addr: AddressParts | null | undefined): string {
    if (!addr) return ""
    const streetStr = (addr.street || "").trim()
    if (!streetStr) return ""

    let numStr = addr.number != null ? String(addr.number).trim() : ""
    if (!numStr || numStr === "null" || numStr === "undefined" || numStr === "0") {
        numStr = "S/N"
    }

    const neighStr = (addr.neighborhood || "").trim()
    if (numStr.toLowerCase() === neighStr.toLowerCase() && neighStr !== "") {
        numStr = "S/N"
    }

    const compStr = addr.complement && addr.complement.trim() ? ` (${addr.complement.trim()})` : ""
    const zipStr = addr.zipCode || addr.zip_code || ""

    const parts: string[] = []
    parts.push(`${streetStr}, ${numStr}${compStr}`)
    if (neighStr) parts.push(neighStr)

    const cityStateStr = [addr.city?.trim(), (addr.state || addr.uf)?.trim()].filter(Boolean).join(" - ")
    if (cityStateStr) parts.push(cityStateStr)
    if (zipStr?.trim()) parts.push(zipStr.trim())

    return parts.join(", ")
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
