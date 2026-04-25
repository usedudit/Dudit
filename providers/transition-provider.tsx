"use client"

import React, { createContext, useContext, useState, useEffect, useRef } from "react"
import { usePathname } from "next/navigation"

type Direction = "forward" | "back"

interface TransitionContextType {
  direction: Direction
  setDirection: (dir: Direction) => void
}

const TransitionContext = createContext<TransitionContextType | undefined>(undefined)

export function TransitionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [direction, setDirection] = useState<Direction>("forward")
  const prevPathname = useRef<string | null>(pathname)
  const isInternalNavigation = useRef<boolean>(false)

  useEffect(() => {
    // Initialize history stack if it doesn't exist
    if (typeof window !== "undefined") {
      const historyStr = sessionStorage.getItem("ddt_history_stack")
      if (!historyStr) {
        sessionStorage.setItem("ddt_history_stack", JSON.stringify([pathname]))
      }
    }
  }, [])

  useEffect(() => {
    if (!pathname || pathname === prevPathname.current) return

    const history = JSON.parse(sessionStorage.getItem("ddt_history_stack") || "[]")

    // If we didn't manually set the direction (e.g. browser back button)
    if (!isInternalNavigation.current) {
      if (history.length > 1 && history[history.length - 2] === pathname) {
        setDirection("back")
        history.pop()
      } else {
        setDirection("forward")
        history.push(pathname)
      }
      sessionStorage.setItem("ddt_history_stack", JSON.stringify(history))
    }

    prevPathname.current = pathname
    isInternalNavigation.current = false
  }, [pathname])

  const handleSetDirection = (dir: Direction) => {
    setDirection(dir)
    isInternalNavigation.current = true
    
    // Update stack for manual direction
    if (typeof window !== "undefined") {
      const history = JSON.parse(sessionStorage.getItem("ddt_history_stack") || "[]")
      if (dir === "back") {
        history.pop()
      } else if (pathname) {
        history.push(pathname)
      }
      sessionStorage.setItem("ddt_history_stack", JSON.stringify(history))
    }
  }

  return (
    <TransitionContext.Provider value={{ direction, setDirection: handleSetDirection }}>
      {children}
    </TransitionContext.Provider>
  )
}

export function useTransitionDirection() {
  const context = useContext(TransitionContext)
  if (context === undefined) {
    throw new Error("useTransitionDirection must be used within a TransitionProvider")
  }
  return context
}
