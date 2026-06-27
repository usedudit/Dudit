import "server-only"
import { getAdminClient } from "@/lib/supabase/admin"

/**
 * Processes due recurring transactions by calling the RPC.
 * Called exclusively by the cron route - NOT exposed as a server action.
 */
export async function runDueRecurringTransactions(limit = 200) {
  try {
    const admin = getAdminClient()
    const { data, error } = await admin.rpc("process_due_recurring_transactions", { p_limit: limit })
    if (error) throw error
    return { success: true, data: data?.[0] || { processed_count: 0, created_count: 0, deactivated_count: 0 } }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
