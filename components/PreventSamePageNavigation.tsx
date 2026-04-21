"use client"

import { useEffect } from "react"

export function PreventSamePageNavigation() {
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement
            const anchor = target.closest("a")

            // Skip if not a local link or has special attributes
            if (!anchor || !anchor.href || anchor.hasAttribute("download") || anchor.target === "_blank") return

            try {
                const targetUrl = new URL(anchor.href)
                const currentUrl = new URL(window.location.href)

                // Only block if it's EXACTLY the same URL (origin + path + search + hash)
                if (
                    targetUrl.origin === currentUrl.origin &&
                    targetUrl.pathname === currentUrl.pathname &&
                    targetUrl.search === currentUrl.search &&
                    targetUrl.hash === currentUrl.hash
                ) {
                    // It's the same page. In ERP, we want to trigger a reset event instead of a full reload/navigation
                    // which might cause the unmount/remount flickering reported by the user.
                    e.preventDefault()
                    e.stopPropagation()
                    window.dispatchEvent(new CustomEvent('erp-sidebar-reset'))
                }
            } catch (error) {
                // Ignore invalid URLs
            }
        }

        document.addEventListener("click", handleClick, { capture: true })
        return () => {
            document.removeEventListener("click", handleClick, { capture: true })
        }
    }, [])

    return null
}
