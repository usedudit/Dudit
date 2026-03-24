"use client"

import { useState, useCallback } from "react"

const SIDEBAR_STATE_KEY = "dudit_sidebar_state"

export function useSidebarState(initialExpanded: boolean = true) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded)

  const toggleSidebar = useCallback(() => {
    const newState = !isExpanded
    setIsExpanded(newState)

    // Set cookie path=/ to be available across all routes
    // Max-Age 1 year
    document.cookie = `${SIDEBAR_STATE_KEY}=${newState ? "expanded" : "collapsed"}; path=/; max-age=31536000; SameSite=Lax`
  }, [isExpanded])

  // Hydration mismatch is prevented because the initial state is provided by the server
  // and matched precisely by the client on the first render.
  return {
    isExpanded,
    toggleSidebar,
  }
}
