export function normalizeSlugForUrl(slug: string): string {
    return slug
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
}

export function buildStoreCitySlug(store: { city?: string | null; state?: string | null }): string {
    const city = store.city || "brasil"
    const state = store.state || ""
    const slug = `${normalizeSlugForUrl(city)}-${state.toLowerCase()}`
    return slug.replace(/-+$/, "")
}
