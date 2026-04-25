"use server"

import { getAllUserPartnerAccess } from "@/lib/auth/partner-context"

/** Returns true if the current user has at least one ERP (owner or invited). */
export async function getUserHasAnyPartnerAccess(): Promise<boolean> {
  const access = await getAllUserPartnerAccess()
  return access.length > 0
}
