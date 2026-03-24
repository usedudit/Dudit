"use client"

import { useEffect } from "react"

export function PreventSamePageNavigation() {
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement
            const anchor = target.closest("a")

            if (anchor && anchor.href && !anchor.hasAttribute("download") && anchor.target !== "_blank") {
                try {
                    const targetUrl = new URL(anchor.href)
                    const currentUrl = new URL(window.location.href)

                    if (
                        targetUrl.origin === currentUrl.origin &&
                        targetUrl.pathname === currentUrl.pathname &&
                        targetUrl.search === currentUrl.search &&
                        targetUrl.hash === currentUrl.hash
                    ) {
                        // Prevent navigation if it's the exact same page
                        e.preventDefault()
                        e.stopPropagation()
                    }
                } catch (error) {
                    // Ignore invalid URLs
                }
            }
        }

        // Use 'capture' to intercept before React/Next.js
        document.addEventListener("click", handleClick, { capture: true })

        return () => {
            document.removeEventListener("click", handleClick, { capture: true })
        }
    }, [])

    return null
}
