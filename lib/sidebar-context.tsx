"use client"

import type React from "react"
import { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react"

const SIDEBAR_STATE_KEY = "dudit_sidebar_state"

interface SidebarContextType {
  isExpanded: boolean // Desktop expansion state
  isMobileOpen: boolean // Mobile sheet open state
  toggleSidebar: () => void
  setIsMobileOpen: (open: boolean) => void
  headerOverride: {
    title?: string
    backHref?: string
    onBack?: () => void
    isSubPage?: boolean
  } | null
  setHeaderOverride: (override: SidebarContextType["headerOverride"]) => void
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

export function SidebarProvider({
  children,
  initialExpanded = true,
}: {
  children: React.ReactNode
  initialExpanded?: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [headerOverride, setHeaderOverride] = useState<SidebarContextType["headerOverride"]>(null)

  const toggleSidebar = useCallback(() => {
    setIsExpanded((prev) => {
      const newState = !prev
      // Set cookie path=/ to be available across all routes
      // Max-Age 1 year
      document.cookie = `${SIDEBAR_STATE_KEY}=${newState ? "expanded" : "collapsed"}; path=/; max-age=31536000; SameSite=Lax`
      return newState
    })
  }, [])

  const contextValue = useMemo(() => ({
    isExpanded,
    isMobileOpen,
    toggleSidebar,
    setIsMobileOpen,
    headerOverride,
    setHeaderOverride,
  }), [isExpanded, isMobileOpen, toggleSidebar, headerOverride])

  return (
    <SidebarContext.Provider value={contextValue}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (context === undefined) {
    throw new Error("useSidebar deve ser usado dentro de um SidebarProvider")
  }
  return context
}
