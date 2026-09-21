import "server-only"

import { cache } from "react"
import type { User } from "@supabase/supabase-js"
import { requireUser } from "@/lib/auth/authorization"
import { getCurrentPartnerContext, type PartnerContext } from "@/lib/auth/partner-context"

/**
 * Canonical read context for ERP route rendering.
 *
 * This does not replace mutation authorization. Server Actions must continue
 * using their require* access checks. React cache() only deduplicates this
 * resolution inside the current request and never shares it between users.
 */
export const getErpRequestContext = cache(async (
  resolvedUser?: User | any,
): Promise<PartnerContext | null> => {
  const user = await requireUser(resolvedUser)
  const context = await getCurrentPartnerContext(user)
  if (!context) return null
  return context
})
