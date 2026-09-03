export interface SearchTelemetryInput {
    query: string
    hasResults: boolean
    resultsCount: number
    citySlug?: string | null
    itemType?: string
}

export interface DemandEventInput {
    type: "whatsapp_click" | "phone_click" | "quote_request" | "appointment_request" | "order_created" | "explicit_demand"
    partnerId?: string | null
    storeId?: string | null
    citySlug?: string | null
    metadata?: Record<string, unknown>
}

export interface ZeroResultTerm {
    term: string
    count: number
    suggestedCategory?: string
}

export interface MarketplaceDemandMetrics {
    totalSearches: number
    searchesWithResults: number
    searchesWithoutResults: number
    contactClicks: number
    appointmentsCount: number
    ordersCount: number
    activeBusinessesCount: number
    businessesWithDemandCount: number
    topZeroResultTerms: ZeroResultTerm[]
    dailyTimeline: Array<{
        date: string
        totalSearches: number
        withResults: number
        withoutResults: number
        contacts: number
    }>
}
