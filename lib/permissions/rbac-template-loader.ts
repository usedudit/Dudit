import "server-only"

import { cache } from "react"
import { getAdminClient } from "@/lib/supabase/admin"
import type { PermissionTemplate } from "@/lib/permissions/rbac-types"

const TEMPLATE_ROLE_ID = "__base_template"
const TEMPLATE_FALLBACK_SOURCE_ROLE = "operator"

function deriveTemplateFromExample(raw: unknown): PermissionTemplate | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const root = raw as Record<string, unknown>
  const out: any = {}

  for (const [k, v] of Object.entries(root)) {
    if (!v || typeof v !== "object" || Array.isArray(v)) continue
    out[k] = {}
    for (const kk of Object.keys(v as Record<string, unknown>)) {
      out[k][kk] = false
    }
  }

  if (Object.keys(out).length === 0) return null
  return out as PermissionTemplate
}

let templateCache: { data: PermissionTemplate; expiresAt: number } | null = null
const TEMPLATE_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Load the canonical RBAC permission template from DB.
 * If missing, derives a template from an existing role record in DB (safe fallback).
 * Uses in-memory cache to prevent repetitive DB queries across requests.
 */
export const getPermissionTemplate = cache(async (): Promise<PermissionTemplate> => {
  if (templateCache && Date.now() < templateCache.expiresAt) {
    return templateCache.data
  }

  const admin = getAdminClient()
  const { data } = await admin
    .from("roles")
    .select("permissions")
    .eq("id", TEMPLATE_ROLE_ID)
    .maybeSingle()

  // Safe fallback: if missing or invalid, normalize against itself (all false)
  // by using the stored template if present; otherwise throw-less deny-all.
  const raw = data?.permissions
  if (raw && typeof raw === "object") {
    const template = raw as PermissionTemplate
    templateCache = { data: template, expiresAt: Date.now() + TEMPLATE_CACHE_TTL_MS }
    return template
  }

  const { data: example } = await admin
    .from("roles")
    .select("permissions")
    .eq("id", TEMPLATE_FALLBACK_SOURCE_ROLE)
    .maybeSingle()

  const derived = deriveTemplateFromExample(example?.permissions)
  if (derived) {
    templateCache = { data: derived, expiresAt: Date.now() + TEMPLATE_CACHE_TTL_MS }
    return derived
  }

  // Safe deny-all fallback: if DB is in an unexpected state, return an empty object
  // which will default-deny in can() due to missing keys.
  const emptyTemplate = {} as PermissionTemplate
  templateCache = { data: emptyTemplate, expiresAt: Date.now() + 10_000 } // 10s fallback
  return emptyTemplate
})

