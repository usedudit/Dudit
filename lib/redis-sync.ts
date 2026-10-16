import { revalidateExploreSearch } from './utils/revalidation'
export {
  isExploreProductPublic,
  isExploreServicePublic,
  isExploreStorePublic,
  serializeExploreItem,
} from './redis-explore-serializer'

export type ItemType = 'produto' | 'servico' | 'loja'

export function getExploreRedisDataKey(type: string, id: string): string {
  return `data:v2:${type}:${id}`
}

export interface SyncItemOptions {
  id: string
  type: ItemType
  data: any
  score?: number
  removeFromRedis?: boolean
  silent?: boolean
  throwOnError?: boolean
}

/** Redis ZSET score: higher marketplace_score ranks first; created_at breaks ties. */
export function computeExploreRedisScore(
  data: { marketplace_score?: number; marketplace_reputation?: number; created_at?: string },
  explicitScore?: number,
): number {
  if (explicitScore !== undefined) return explicitScore
  const rankScore = Number(data.marketplace_score ?? data.marketplace_reputation ?? 0)
  const timePart = new Date(data.created_at || Date.now()).getTime() / 1e15
  return rankScore * 1e6 + timePart
}

/**
 * Utilitário para invalidar o cache do Marketplace / Explorar.
 * Como o marketplace usa PostgreSQL FTS com cache em memória RAM,
 * as antigas gravações de ZSETs e JSONs no Redis foram desativadas para economizar comandos.
 * Apenas revalida as tags de cache do Next.js instantaneamente.
 */
export async function syncToExploreRedis({
  id,
  type,
  silent = false,
  throwOnError = false,
}: SyncItemOptions): Promise<boolean> {
  try {
    await revalidateExploreSearch({ silent })
    return true
  } catch (error) {
    console.error(`[RedisSync] Erro ao revalidar cache do marketplace (${type}:${id}):`, error)
    if (throwOnError) throw error
    return false
  }
}

/**
 * Helper para remover item do marketplace (revalidação de cache)
 */
export async function removeFromExploreRedis(
  id: string,
  type: ItemType,
  silent: boolean = false,
  throwOnError: boolean = false,
): Promise<boolean> {
  return syncToExploreRedis({ id, type, data: {}, removeFromRedis: true, silent, throwOnError })
}

/**
 * Atualiza todos os produtos e serviços de um parceiro.
 * Apenas revalida as tags do Next.js sem onerar o Redis com pipelines pesadas.
 */
export async function syncPartnerItemsToExploreRedis(
  partnerId: string,
  options: { throwOnError?: boolean } = {},
): Promise<void> {
  try {
    await revalidateExploreSearch({ silent: false })
  } catch (error) {
    if (options.throwOnError) throw error
  }
}
