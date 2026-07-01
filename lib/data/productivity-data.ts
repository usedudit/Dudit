import "server-only"
import { cache } from "react"
import {
  getProductivityOverviewAction,
  getProductivityRankingAction,
  getProductivityChartsAction,
  getSellersCommissionOverviewAction,
  getSellerCommissionHistoryAction,
} from "@/app/actions/erp/produtividade"

export const getProductivityOverviewData = cache(
  async (partnerId: string) => {
    return getProductivityOverviewAction(partnerId)
  },
)

export const getProductivityRankingData = cache(
  async (partnerId: string, period?: { startDate?: string; endDate?: string }) => {
    return getProductivityRankingAction(partnerId, period)
  },
)

export const getProductivityChartsData = cache(
  async (partnerId: string) => {
    return getProductivityChartsAction(partnerId)
  },
)

export const getCommissionOverviewData = cache(
  async (partnerId: string) => {
    return getSellersCommissionOverviewAction(partnerId)
  },
)

export const getCommissionHistoryData = cache(
  async (partnerId: string, sellerPartnerUserId: string) => {
    return getSellerCommissionHistoryAction(partnerId, sellerPartnerUserId)
  },
)
