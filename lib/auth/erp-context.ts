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
  // Keep the no-argument path identical to pages that call
  // getCurrentPartnerContext() directly. React cache keys include arguments,
  // so passing the resolved user here created a second context resolution in
  // the ERP layout/page request.
  const context = resolvedUser
    ? await getCurrentPartnerContext(user)
    : await getCurrentPartnerContext()
  if (!context) return null
  return context
})
