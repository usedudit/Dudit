"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { getDefaultTimezone } from "./tz"

type TimezoneContextType = {
  timezone: string
}

const TimezoneContext = createContext<TimezoneContextType>({ timezone: getDefaultTimezone() })

export function TimezoneProvider({
  children,
  timezone: propTimezone,
}: {
  children: ReactNode
  timezone?: string
}) {
  const [timezone, setTimezone] = useState(propTimezone || getDefaultTimezone())

  useEffect(() => {
    if (propTimezone) {
      setTimezone(propTimezone)
      return
    }
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (detected) setTimezone(detected)
    } catch {
      // fallback already set as default
    }
  }, [propTimezone])

  return (
    <TimezoneContext.Provider value={{ timezone }}>
      {children}
    </TimezoneContext.Provider>
  )
}

export function useTimezone(): string {
  return useContext(TimezoneContext).timezone
}
