let cachedCities: string[] | null = null

export async function getCitiesData(): Promise<string[]> {
    if (cachedCities) return cachedCities
    const mod = await import("@/lib/data/cities.json")
    cachedCities = (mod.default || mod) as string[]
    return cachedCities
}
