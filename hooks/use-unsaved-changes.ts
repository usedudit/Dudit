"use client"

import { useEffect, useRef, useState } from "react"
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

  useEffect(() => {
    const originalPushState = window.history.pushState
    const originalReplaceState = window.history.replaceState

    const shouldBlockHistoryNavigation = (url?: string | URL | null) => {
      if (!isDirtyRef.current || !url || isNavigatingRef.current) return false

      const current = new URL(window.location.href)
      const destination = new URL(String(url), current.href)
      if (destination.origin !== current.origin) return false
      if (destination.pathname === current.pathname) return false

      setPendingNavigation(`${destination.pathname}${destination.search}${destination.hash}`)
      setShowConfirmDialog(true)
      return true
    }

    window.history.pushState = function pushState(
      data: any,
      unused: string,
      url?: string | URL | null
    ) {
      if (shouldBlockHistoryNavigation(url)) return
      return originalPushState.call(this, data, unused, url)
    }

    window.history.replaceState = function replaceState(
      data: any,
      unused: string,
      url?: string | URL | null
    ) {
      if (shouldBlockHistoryNavigation(url)) return
      return originalReplaceState.call(this, data, unused, url)
    }

    return () => {
      window.history.pushState = originalPushState
      window.history.replaceState = originalReplaceState
    }
  }, [])

  const confirmNavigation = () => {
    isNavigatingRef.current = true
    setShowConfirmDialog(false)
    if (pendingNavigation) {
      if (typeof pendingNavigation === "function") {
        pendingNavigation()
      } else {
        window.location.assign(pendingNavigation)
      }
    } else {
      router.back()
    }
  }

  const cancelNavigation = () => {
    setShowConfirmDialog(false)
    setPendingNavigation(null)
  }

  const handleNavigation = (path?: string | (() => void)) => {
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
  }

  return {
    showConfirmDialog,
    confirmNavigation,
    cancelNavigation,
    handleNavigation,
  }
}

