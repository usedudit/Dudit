export const SUPERFRETE_BRAND_ICON = "https://img.dudit.com.br/static/icons/brands/Superfrete.png"

const CARRIER_BRAND_ICONS: Array<{ match: RegExp; url: string }> = [
    { match: /correios|\bPAC\b|\bSEDEX\b|Mini Envios/i, url: "https://img.dudit.com.br/static/icons/brands/Correios.png" },
    { match: /jadlog/i, url: "https://img.dudit.com.br/static/icons/brands/Jadlog.png" },
    { match: /loggi/i, url: "https://img.dudit.com.br/static/icons/brands/Loggi.png" },
    { match: /j&t/i, url: "https://img.dudit.com.br/static/icons/brands/J%26T.png" },
]

export function getCarrierBrandIcon(...names: Array<string | null | undefined>): string {
    for (const name of names) {
        if (!name) continue
        const hit = CARRIER_BRAND_ICONS.find((c) => c.match.test(name))
        if (hit) return hit.url
    }
    return SUPERFRETE_BRAND_ICON
}
