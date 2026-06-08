/**
 * Client-safe ranking helpers for marketplace list ordering and seller diversity.
 */

export type RankableItem = {
  id: string
  partner_id?: string
  partners?: { id?: string } | null
  marketplace_score?: number
  rating?: number
  created_at?: string
  _searchRank?: number
}

/** Freshness boost: 0-7d +25%, 8-30d +10%, 30+d normal */
export function freshnessFactor(createdAt: string | undefined | null): number {
  if (!createdAt) return 1
  const ageMs = Date.now() - new Date(createdAt).getTime()
  const days = ageMs / (1000 * 60 * 60 * 24)
  if (days <= 7) return 1.25
  if (days <= 30) return 1.1
  return 1
}

/** Homepage trending: 40% recent activity, 20% views, 15% favorites, 15% freshness, 10% rating */
export function calcTrendingScore(item: {
  sales_last_30_days?: number
  bookings_last_30_days?: number
  signups_last_30_days?: number
  views_count?: number
  views_last_30_days?: number
  favorites_count?: number
  rating?: number
  created_at?: string
  itemType?: string
}): number {
  const recent =
    Number(item.sales_last_30_days || 0) ||
    Number(item.bookings_last_30_days || 0) ||
    Number(item.signups_last_30_days || 0)

  const views = Number(item.views_last_30_days ?? item.views_count ?? 0)
  const favorites = Number(item.favorites_count ?? 0)
  const rating = Number(item.rating ?? 0)
  const fresh = freshnessFactor(item.created_at)

  return (
    0.4 * Math.min(recent, 100) / 100 +
    0.2 * Math.min(views, 1000) / 1000 +
    0.15 * Math.min(favorites, 50) / 50 +
    0.15 * (fresh > 1 ? 1 : fresh > 1.05 ? 0.6 : 0.3) +
    0.1 * Math.min(rating, 5) / 5
  ) * fresh
}

/** Category browse: 50% popularity, 20% relevance placeholder, 15% freshness, 10% rating, 5% seller rep */
export function calcCategoryBrowseScore(
  item: RankableItem & { marketplace_score?: number; seller_reputation?: number },
): number {
  const popularity = Number(item.marketplace_score ?? 0)
  const rating = Number(item.rating ?? 0)
  const sellerRep = Number(item.seller_reputation ?? 0)
  const fresh = freshnessFactor(item.created_at)

  return (
    0.5 * Math.min(popularity, 1) +
    0.2 * 0.5 + // category relevance applied client-side when filtering
    0.15 * (fresh > 1 ? 1 : 0.5) +
    0.1 * Math.min(rating, 5) / 5 +
    0.05 * Math.min(sellerRep, 1)
  ) * fresh
}

function getPartnerId(item: RankableItem): string | null {
  if (item.partner_id) return item.partner_id
  const p = item.partners
  if (p && typeof p === "object" && "id" in p) return p.id || null
  return null
}

/**
 * Lightweight seller diversity: avoid more than 2 consecutive items from same seller.
 * O(n) single pass — swaps in a different-seller item when needed.
 */
export function applySellerDiversity<T extends RankableItem>(items: T[], maxConsecutive = 2): T[] {
  if (items.length <= maxConsecutive) return items

  const result: T[] = []
  const deferred: T[] = []

  for (const item of items) {
    const pid = getPartnerId(item)
    if (!pid) {
      result.push(item)
      continue
    }

    let consecutive = 0
    for (let i = result.length - 1; i >= 0; i--) {
      if (getPartnerId(result[i]) === pid) consecutive++
      else break
    }

    if (consecutive >= maxConsecutive) {
      const swapIdx = deferred.findIndex((d) => getPartnerId(d) !== pid)
      if (swapIdx >= 0) {
        const swap = deferred.splice(swapIdx, 1)[0]
        result.push(swap)
        deferred.push(item)
      } else {
        deferred.push(item)
      }
    } else {
      result.push(item)
    }
  }

  return [...result, ...deferred]
}

export function sortByTrendingScore<T extends Parameters<typeof calcTrendingScore>[0]>(items: T[]): T[] {
  return [...items].sort((a, b) => calcTrendingScore(b) - calcTrendingScore(a))
}
