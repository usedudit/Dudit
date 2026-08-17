"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

export function useUnsavedChanges(isDirty: boolean) {
  const router = useRouter()
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | (() => void) | null>(null)
  const isNavigatingRef = useRef(false)

  // Use a ref for isDirty to avoid resetting listeners when isDirty changes
  const isDirtyRef = useRef(isDirty)
  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isNavigatingRef.current) return
      if (isDirtyRef.current) {
        e.preventDefault()
        e.returnValue = ""
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [])

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (!isDirtyRef.current) return
      if (isNavigatingRef.current) return

      const target = event.target as HTMLElement | null
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null
      if (!anchor) return
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return

      const hrefAttr = anchor.getAttribute("href")
      if (!hrefAttr || hrefAttr.startsWith("#")) return

      const destination = new URL(anchor.href, window.location.href)
      const current = new URL(window.location.href)
      if (destination.origin !== current.origin) return
      if (
        destination.pathname === current.pathname &&
        destination.search === current.search &&
        destination.hash === current.hash
      ) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setPendingNavigation(`${destination.pathname}${destination.search}${destination.hash}`)
      setShowConfirmDialog(true)
    }

    document.addEventListener("click", handleDocumentClick, true)
    return () => {
      document.removeEventListener("click", handleDocumentClick, true)
    }
  }, [])

  const confirmNavigation = useCallback(() => {
    isNavigatingRef.current = true
    setShowConfirmDialog(false)
    if (pendingNavigation) {
      if (typeof pendingNavigation === "function") {
        pendingNavigation()
      } else {
        router.push(pendingNavigation)
      }
    } else {
      router.back()
    }
  }, [pendingNavigation, router])

  const cancelNavigation = useCallback(() => {
    setShowConfirmDialog(false)
    setPendingNavigation(null)
  }, [])

  // Memoized to keep a stable identity. A new function every render would
  // make callers' useCallback(handleBack) unstable, causing effects like
  // setHeaderOverride to re-run every render -> React error #185 (infinite loop).
  const handleNavigation = useCallback((path?: string | (() => void)) => {
    if (isDirtyRef.current) {
      setPendingNavigation(() => path || null)
      setShowConfirmDialog(true)
      return false
    }
    isNavigatingRef.current = true
    if (path) {
      if (typeof path === "function") {
        path()
      } else {
        router.push(path)
      }
    } else {
      router.back()
    }
    return true
  }, [router])

  return {
    showConfirmDialog,
    confirmNavigation,
    cancelNavigation,
    handleNavigation,
  }
}

