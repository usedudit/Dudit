"use client"

import { useEffect, useLayoutEffect, useRef } from "react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect

interface FitTextProps {
    children: ReactNode
    className?: string
    textClassName?: string
    minSize?: number
}

export function FitText({ children, className, textClassName, minSize = 9 }: FitTextProps) {
    const containerRef = useRef<HTMLSpanElement>(null)
    const textRef = useRef<HTMLSpanElement>(null)
    const measureRef = useRef<HTMLSpanElement>(null)
    const fitKeyRef = useRef("")
    const visitedRef = useRef(new Set<string>())

    useIsomorphicLayoutEffect(() => {
        const container = containerRef.current
        const text = textRef.current
        const measure = measureRef.current
        if (!container || !text || !measure) return

        const content = typeof children === "string" || typeof children === "number" ? String(children) : ""

        const setEllipsis = (on: boolean) => {
            container.style.overflow = on ? "hidden" : ""
            container.style.textOverflow = on ? "ellipsis" : ""
            if (on) {
                container.title = content || text.textContent || ""
            } else {
                container.removeAttribute("title")
            }
        }

        const fit = () => {
            const available = container.clientWidth
            const natural = measure.offsetWidth
            if (!available || !natural) return

            const fitKey = `${content}:${available}`
            if (fitKeyRef.current !== fitKey) {
                fitKeyRef.current = fitKey
                visitedRef.current.clear()
            }

            if (natural <= available) {
                text.style.fontSize = ""
                setEllipsis(false)
                return
            }

            const base = Number.parseFloat(window.getComputedStyle(measure).fontSize)
            if (!base) return

            const needed = Math.floor((available / natural) * base)
            const fallback = needed < minSize
            const target = fallback ? Math.min(minSize, base) : needed
            const current = Number.parseFloat(text.style.fontSize) || base

            if (target !== current) {
                if (visitedRef.current.has(`${current}->${target}`)) {
                    setEllipsis(text.offsetWidth > available + 0.5)
                    return
                }
                visitedRef.current.add(`${current}->${target}`)
                text.style.fontSize = `${target}px`
            }

            setEllipsis(text.offsetWidth > available + 0.5)
        }

        fit()

        if (typeof ResizeObserver !== "undefined") {
            const observer = new ResizeObserver(fit)
            observer.observe(container)
            if (document.fonts) {
                document.fonts.ready.then(fit).catch(() => {})
            }
            return () => observer.disconnect()
        }

        window.addEventListener("resize", fit)
        return () => window.removeEventListener("resize", fit)
    }, [children, minSize])

    return (
        <span ref={containerRef} className={cn("relative block min-w-0", className)}>
            <span ref={textRef} className={cn("whitespace-nowrap", textClassName)}>
                {children}
            </span>
            <span
                ref={measureRef}
                aria-hidden="true"
                className={cn("invisible absolute top-0 left-[-9999px] w-max whitespace-nowrap", textClassName)}
            >
                {children}
            </span>
        </span>
    )
}
