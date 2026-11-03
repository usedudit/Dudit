import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { deleteManagedFileFromAllBuckets } from "@/lib/r2/server"

const MAX_BATCH_SIZE = 100
const CONCURRENCY = 5

type CleanupJob = {
  id: string
  object_key: string
  attempt_count: number
}

export type R2CleanupBatchResult = {
  claimed: number
  deleted: number
  failed: number
  persistenceErrors: number
}

/** Drain one claimed batch. Keys are never written to logs or returned to cron callers. */
export async function processR2CleanupBatch(limit = MAX_BATCH_SIZE): Promise<R2CleanupBatchResult> {
  const admin = getAdminClient()
  const safeLimit = Math.min(MAX_BATCH_SIZE, Math.max(1, Math.trunc(limit)))
  const { data, error } = await admin.rpc("claim_r2_object_deletion_jobs", {
    p_limit: safeLimit,
    p_lease_seconds: 300,
  })
  if (error) throw new Error(`R2 cleanup queue claim failed: ${error.message}`)

  const jobs = (Array.isArray(data) ? data : []) as CleanupJob[]
  const result: R2CleanupBatchResult = {
    claimed: jobs.length,
    deleted: 0,
    failed: 0,
    persistenceErrors: 0,
  }

  let cursor = 0
  const workers = Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++]
      try {
        await deleteManagedFileFromAllBuckets(job.object_key)
        const { error: completeError } = await admin.rpc("complete_r2_object_deletion_job", {
          p_job_id: job.id,
        })
        if (completeError) {
          result.persistenceErrors++
          continue
        }
        result.deleted++
      } catch {
        result.failed++
        const { error: failError } = await admin.rpc("fail_r2_object_deletion_job", {
          p_job_id: job.id,
          p_error_code: "r2_delete_failed",
        })
        if (failError) result.persistenceErrors++
      }
    }
  })

  await Promise.all(workers)
  return result
}
