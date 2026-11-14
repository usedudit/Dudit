import "server-only"
import { Redis } from '@upstash/redis'

const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || 'https://build.stub'
const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || 'build-stub-token'

export const redis = new Redis({
  url: kvUrl,
  token: kvToken,
})
