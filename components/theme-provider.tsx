'use client'

import * as React from 'react'
import { useEffect } from 'react'
import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
} from 'next-themes'

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  // Sync theme with localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return

    const storedTheme = localStorage.getItem('theme')
    if (storedTheme) {
      // Set the theme on the html element directly
      document.documentElement.setAttribute('data-theme', storedTheme)
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'theme') {
        document.documentElement.setAttribute('data-theme', event.newValue || 'light')
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  // Sync theme from html element to localStorage on changes
  useEffect(() => {
    if (typeof window === 'undefined') return

    const html = document.documentElement
    const currentTheme = html.getAttribute('data-theme') || 'light'

    localStorage.setItem('theme', currentTheme)

    const observer = new MutationObserver(() => {
      localStorage.setItem('theme', html.getAttribute('data-theme') || 'light')
    })
    observer.observe(html, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      observer.disconnect()
    }
  }, [])

  return <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false} {...props}>{children}</NextThemesProvider>
}