import { AdminHeader } from "@/components/admin/admin-header"
import AdminAnalyticsDashboard from "@/components/admin/analytics/AdminAnalyticsDashboard"
import {
    getAdminOverviewAnalyticsAction,
    getUserAnalyticsAction,
    getPartnerAnalyticsAction,
    getFeatureUsageAnalyticsAction,
    getMarketplaceDemandAnalyticsAction,
    type OverviewAnalyticsData,
    type UserAnalyticsData,
    type PartnerAnalyticsData,
    type FeatureUsageData,
} from "@/app/actions/admin/analytics"
import type { MarketplaceDemandMetrics } from "@/lib/services/analytics.service"

export const dynamic = "force-dynamic"

export default async function AdminAnalyticsPage() {
    let initialOverview: OverviewAnalyticsData = {
        periodRange: { label: "Últimos 30 dias", start: "", end: "" },
        userStats: { total: 0, newPeriod: 0, activePeriod: 0, retentionRate: 0 },
        partnerStats: { total: 0, newPeriod: 0, activePeriod: 0, withDemand: 0, totalStores: 0 },
        marketplaceStats: {
            totalSearches: 0,
            searchesWithResults: 0,
            searchesWithoutResults: 0,
            zeroResultsRate: 0,
            contactClicks: 0,
            ordersCount: 0,
            appointmentsCount: 0,
        },
        plansStats: { upgrades: 0, downgrades: 0, cancellations: 0 },
        topOpportunities: [],
    }

    let initialUsers: UserAnalyticsData = {
        totalUsers: 0,
        newSignups: 0,
        newSignupsChange: 0,
        activeUsers: 0,
        activeUsersChange: 0,
        retainedUsers: 0,
        retentionRate: 0,
        dailySignupsTimeline: [],
    }

    let initialPartners: PartnerAnalyticsData = {
        totalPartners: 0,
        newPartners: 0,
        newPartnersChange: 0,
        activePartners: 0,
        partnerRetentionRate: 0,
        businessesWithDemand: 0,
        businessesWithDemandRate: 0,
        planUpgrades: 0,
        planDowngrades: 0,
        planCancellations: 0,
        recentPlanChanges: [],
        dailyPartnersTimeline: [],
    }

    let initialFeatures: FeatureUsageData = {
        featuresRanked: [],
        mostUsedFeatures: [],
        leastUsedFeatures: [],
        totalPlatformInteractions: 0,
    }

    let initialDemand: MarketplaceDemandMetrics = {
        totalSearches: 0,
        searchesWithResults: 0,
        searchesWithoutResults: 0,
        contactClicks: 0,
        appointmentsCount: 0,
        ordersCount: 0,
        activeBusinessesCount: 0,
        businessesWithDemandCount: 0,
        topZeroResultTerms: [],
        dailyTimeline: [],
    }

    try {
        const [overviewRes, usersRes, partnersRes, featuresRes, demandRes] = await Promise.all([
            getAdminOverviewAnalyticsAction("30d"),
            getUserAnalyticsAction("30d"),
            getPartnerAnalyticsAction("30d"),
            getFeatureUsageAnalyticsAction("30d"),
            getMarketplaceDemandAnalyticsAction("30d"),
        ])

        initialOverview = overviewRes
        initialUsers = usersRes
        initialPartners = partnersRes
        initialFeatures = featuresRes
        initialDemand = demandRes
    } catch (err) {
        console.error("[ADMIN_ANALYTICS_PAGE] Error fetching analytics data:", err)
    }

    return (
        <>
            <AdminHeader pageTitle="Analytics da Dudit" />
            <AdminAnalyticsDashboard
                initialOverview={initialOverview}
                initialUsers={initialUsers}
                initialPartners={initialPartners}
                initialFeatures={initialFeatures}
                initialDemand={initialDemand}
            />
        </>
    )
}
