/**
 * Address parsing and formatting utilities
 */

export interface ParsedAddress {
    street: string
    number: string
    complement: string
    neighborhood: string
    city: string
    state: string
    zipCode: string
}

export function parseAddressString(addressStr: string): ParsedAddress | null {
    if (!addressStr) return null

    let raw = addressStr
    let zipCode = ""
    const zipMatch = raw.match(/\d{5}-?\d{3}/)
    if (zipMatch) {
        zipCode = zipMatch[0]
        raw = raw.replace(zipCode, "")
    }

    // clean up separators at ends
    raw = raw.trim().replace(/(^[,\-\s]+)|([,\-\s]+$)/g, "")

    const parts = raw.split(",").map(p => p.trim()).filter(Boolean)
    if (parts.length === 0) return null

    const street = parts[0] || ""
    let number = ""
    let complement = ""
    let neighborhood = ""
    let city = ""
    let state = "SP"

    // Identify city - state (usually the last part of parts)
    let cityStateIndex = -1
    for (let i = parts.length - 1; i >= 1; i--) {
        if (parts[i].includes("-")) {
            const dashParts = parts[i].split("-").map(p => p.trim())
            // Check if second part looks like a state (2 letters)
            if (dashParts[dashParts.length - 1].length === 2) {
                state = dashParts[dashParts.length - 1].toUpperCase()
                city = dashParts.slice(0, -1).join("-").trim()
                cityStateIndex = i
                break
            }
        }
    }

    if (cityStateIndex === -1 && parts.length >= 2) {
        city = parts[parts.length - 1]
        cityStateIndex = parts.length - 1
    }

    const middleParts = parts.slice(1, cityStateIndex > -1 ? cityStateIndex : undefined)

    if (middleParts.length === 1) {
        const part = middleParts[0]
        const parenMatch = part.match(/\(([^)]+)\)/)
        if (parenMatch) {
            complement = parenMatch[1].trim()
            number = part.replace(/\([^)]+\)/, "").trim()
        } else if (part.includes("-")) {
            const dashParts = part.split("-").map(p => p.trim())
            number = dashParts[0]
            neighborhood = dashParts.slice(1).join("-").trim()
        } else {
            // Check if part looks like house number (digits, S/N, km, etc.)
            const isNumberLike = /^\d+|^s\/n|^sn/i.test(part)
            if (isNumberLike) {
                number = part
            } else {
                neighborhood = part
                number = "S/N"
            }
        }
    } else if (middleParts.length >= 2) {
        const numPart = middleParts[0]
        const parenMatch = numPart.match(/\(([^)]+)\)/)
        if (parenMatch) {
            complement = parenMatch[1].trim()
            number = numPart.replace(/\([^)]+\)/, "").trim()
        } else {
            number = numPart
        }

        const neighborhoodPart = middleParts[1]
        if (neighborhoodPart.includes("-")) {
            const dashParts = neighborhoodPart.split("-").map(p => p.trim())
            if (!complement) {
                complement = dashParts[0]
                neighborhood = dashParts.slice(1).join("-").trim()
            } else {
                neighborhood = neighborhoodPart
            }
        } else {
            neighborhood = neighborhoodPart
        }
    }

    if (!number || number.trim() === "" || number.toLowerCase() === neighborhood.toLowerCase()) {
        number = "S/N"
    }

    return {
        street,
        number,
        complement,
        neighborhood,
        city,
        state,
        zipCode,
    }
}

/**
 * Returns a privacy-safe location string (e.g. "Vila Rancharia — Lucélia/SP")
 * masking sensitive fields (street, number, apartment, zip code) before delivery acceptance.
 */
export function getMaskedDeliveryLocation(addressStr: string | null | undefined): string {
    if (!addressStr || typeof addressStr !== "string") return "Região local"
    const cleaned = addressStr.trim()
    if (!cleaned) return "Região local"

    const parsed = parseAddressString(cleaned)
    if (parsed) {
        const neighborhood = parsed.neighborhood?.trim()
        const city = parsed.city?.trim()
        const state = parsed.state?.trim()

        if (neighborhood && city && neighborhood.toLowerCase() !== city.toLowerCase()) {
            return `${neighborhood} — ${city}${state ? `/${state}` : ""}`
        }
        if (neighborhood) return neighborhood
        if (city) return `${city}${state ? `/${state}` : ""}`
    }

    // Fallback: se não conseguiu separar certinho por vírgulas, tenta extrair Cidade - UF ou Bairro
    const dashMatch = cleaned.match(/([^,\-]+)\s*-\s*([A-Za-z]{2})/i)
    if (dashMatch) {
        return `${dashMatch[1].trim()} — ${dashMatch[2].toUpperCase()}`
    }

    return "Região local"
}

