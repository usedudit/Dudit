"use client"

import Link, { type LinkProps } from "next/link"
import { useRouter } from "next/navigation"
import type { MouseEvent, ReactNode, TouchEvent } from "react"
import { useCallback, useEffect, useRef } from "react"

type IntentPrefetchLinkProps = Omit<LinkProps, "href"> & {
  href: string
  children: ReactNode
  className?: string
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
  onMouseEnter?: (event: MouseEvent<HTMLAnchorElement>) => void
  onMouseLeave?: (event: MouseEvent<HTMLAnchorElement>) => void
  onTouchStart?: (event: TouchEvent<HTMLAnchorElement>) => void
}

/** Prefetches data-heavy routes only when the user shows navigation intent. */
export function IntentPrefetchLink({
  children,
  href,
  onMouseEnter,
  onMouseLeave,
  onTouchStart,
  ...props
}: IntentPrefetchLinkProps) {
  const router = useRouter()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prefetchedRef = useRef(false)

  const prefetch = useCallback(() => {
    if (prefetchedRef.current) return
    prefetchedRef.current = true
    void router.prefetch(href)
  }, [href, router])

  useEffect(() => {
    prefetchedRef.current = false
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [href])

  const handleMouseEnter = (event: MouseEvent<HTMLAnchorElement>) => {
    onMouseEnter?.(event)
    if (event.defaultPrevented) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(prefetch, 120)
  }

  const handleMouseLeave = (event: MouseEvent<HTMLAnchorElement>) => {
    onMouseLeave?.(event)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const handleTouchStart = (event: TouchEvent<HTMLAnchorElement>) => {
    onTouchStart?.(event)
    if (!event.defaultPrevented) prefetch()
  }

  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
    >
      {children}
    </Link>
  )
}
