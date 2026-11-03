import "dotenv/config"
import { HeadObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3"
import { createClient } from "@supabase/supabase-js"
import { isKeyPrivate } from "../lib/r2/config"

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const accountId = required("CLOUDFLARE_ACCOUNT_ID")
const accessKeyId = required("CLOUDFLARE_R2_ACCESS_KEY_ID")
const secretAccessKey = required("CLOUDFLARE_R2_SECRET_ACCESS_KEY")
const buckets = [...new Set([
  required("CLOUDFLARE_R2_BUCKET"),
  required("CLOUDFLARE_R2_PRIVATE_BUCKET"),
])]
if (buckets.length !== 2) throw new Error("Public and private R2 buckets must be different")

const supabase = createClient(
  required("NEXT_PUBLIC_SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
)
const s3 = new S3Client({
  region: "auto",
  credentials: { accessKeyId, secretAccessKey },
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
})

const counts = Object.fromEntries(buckets.map((bucket) => [bucket, {
  scanned: 0,
  managed: 0,
  referenced: 0,
  orphanCandidates: 0,
  recentUnreferenced: 0,
  unmanagedPreserved: 0,
}])) as Record<string, {
  scanned: number
  managed: number
  referenced: number
  orphanCandidates: number
  recentUnreferenced: number
  unmanagedPreserved: number
}>

async function classifyKeys(keys: string[], bucket: string, lastModifiedAt: Map<string, number>) {
  const { data, error } = await supabase.rpc("classify_r2_reconciliation_keys", {
    p_keys: keys,
  })
  if (error) throw new Error(`Reconciliation query failed for bucket ${bucket}: ${error.message}`)

  const rows = (Array.isArray(data) ? data : []) as Array<{
    object_key: string
    is_referenced: boolean
  }>
  counts[bucket].managed += rows.length
  counts[bucket].unmanagedPreserved += Math.max(0, keys.length - rows.length)
  const minAgeTimestamp = Date.now() - 30 * 24 * 60 * 60 * 1000
  for (const row of rows) {
    if (row.is_referenced) counts[bucket].referenced += 1
    else if ((lastModifiedAt.get(row.object_key) || Date.now()) <= minAgeTimestamp) {
      counts[bucket].orphanCandidates += 1
    } else {
      counts[bucket].recentUnreferenced += 1
    }
  }
}

try {
  for (const bucket of buckets) {
    let continuationToken: string | undefined
    let pendingKeys: string[] = []
    let pendingModifiedAt = new Map<string, number>()

    do {
      const page = await s3.send(new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      }))
      for (const object of page.Contents || []) {
        if (!object.Key) continue
        counts[bucket].scanned += 1
        pendingKeys.push(object.Key)
        pendingModifiedAt.set(object.Key, object.LastModified?.getTime() || Date.now())
        if (pendingKeys.length >= 200) {
          await classifyKeys(pendingKeys, bucket, pendingModifiedAt)
          pendingKeys = []
          pendingModifiedAt = new Map<string, number>()
        }
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (continuationToken)

    if (pendingKeys.length) await classifyKeys(pendingKeys, bucket, pendingModifiedAt)
  }

  const report: Record<string, unknown> = { mode: "dry-run", buckets: counts }
  if (process.argv.includes("--check-db-references")) {
    const referenced = {
      scanned: 0,
      missingFromBothBuckets: 0,
      onlyInUnexpectedBucket: 0,
      duplicatedAcrossBuckets: 0,
      verificationFailures: 0,
    }
    let afterKey: string | null = null
    let hasMore = true

    while (hasMore) {
      const { data, error } = await supabase.rpc("list_r2_referenced_managed_keys", {
        p_after_key: afterKey,
        p_limit: 500,
      })
      if (error) throw new Error(`Referenced-object query failed: ${error.message}`)
      const rows = (Array.isArray(data) ? data : []) as Array<{ object_key: string }>
      if (!rows.length) break
      afterKey = rows[rows.length - 1].object_key
      referenced.scanned += rows.length

      let cursor = 0
      const workers = Array.from({ length: 8 }, async () => {
        while (cursor < rows.length) {
          const key = rows[cursor++].object_key
          const expectedBucket = isKeyPrivate(key) ? buckets[1] : buckets[0]
          const otherBucket = expectedBucket === buckets[0] ? buckets[1] : buckets[0]
          const results = await Promise.all([expectedBucket, otherBucket].map(async (bucket) => {
            try {
              await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
              return { bucket, exists: true, failed: false }
            } catch (error: any) {
              const status = error?.$metadata?.httpStatusCode
              const name = error?.name
              if (status === 404 || name === "NotFound" || name === "NoSuchKey") {
                return { bucket, exists: false, failed: false }
              }
              return { bucket, exists: false, failed: true }
            }
          }))

          if (results.some((result) => result.failed)) {
            referenced.verificationFailures += 1
          } else if (!results.some((result) => result.exists)) {
            referenced.missingFromBothBuckets += 1
          } else if (!results.find((result) => result.bucket === expectedBucket)?.exists) {
            referenced.onlyInUnexpectedBucket += 1
          } else if (results.find((result) => result.bucket === otherBucket)?.exists) {
            referenced.duplicatedAcrossBuckets += 1
          }
        }
      })
      await Promise.all(workers)
      hasMore = rows.length === 500
    }
    report.databaseReferences = referenced
  }

  console.log(JSON.stringify(report, null, 2))
  console.log("No objects were deleted or queued by this report.")
} finally {
  s3.destroy()
}
