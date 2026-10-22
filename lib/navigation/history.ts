/**
 * URL state helpers.
 *
 * Never pass `window.history.state` to pushState/replaceState. That object
 * contains Next.js internals (`__NA` / `__PRIVATE_NEXTJS_INTERNALS_TREE`) and
 * the patched History API short-circuits when it sees them, so the App Router
 * never learns about the URL change. The next navigation or router.refresh()
 * then rewrites the address bar with the stale canonical URL, dropping query
 * params or reverting to the previous route.
 *
 * Passing `null` lets Next.js copy its internal state onto the new entry and
 * dispatch ACTION_RESTORE, keeping usePathname/useSearchParams/canonicalUrl in
 * sync without an RSC roundtrip.
 */

export type HistoryMode = "push" | "replace"

function resolveRelative(url: string): string | null {
  if (typeof window === "undefined") return null
  const target = new URL(url, window.location.href)
  const relative = `${target.pathname}${target.search}${target.hash}`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (relative === current) return null
  return relative
}

export function pushUrl(url: string): void {
  const relative = resolveRelative(url)
  if (relative === null) return
  window.history.pushState(null, "", relative)
}

export function replaceUrl(url: string): void {
  const relative = resolveRelative(url)
  if (relative === null) return
  window.history.replaceState(null, "", relative)
}

export function updateUrl(url: string, mode: HistoryMode = "push"): void {
  if (mode === "replace") replaceUrl(url)
  else pushUrl(url)
}
