"use client"

import { useEffect, useRef } from "react"

export interface UseBarcodeScannerOptions {
    /** Callback invoked when a complete barcode scan is detected */
    onScan: (barcode: string) => void
    /** Enable/disable the global listener (e.g. disable while modals are open) */
    enabled?: boolean
    /** Minimum character length to consider a valid barcode (default: 4) */
    minLength?: number
    /** Maximum delay in ms between consecutive characters from a hardware scanner (default: 65) */
    maxInterKeyDelayMs?: number
}

function isEditableElement(el: Element | null): boolean {
    if (!el) return false
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        return true
    }
    if (el instanceof HTMLElement && el.isContentEditable) {
        return true
    }
    return false
}

/**
 * Global listener for physical USB / Bluetooth HID barcode scanners ("bipadores").
 *
 * Hardware scanners emulate a keyboard, firing characters rapidly (<50ms apart)
 * followed by `Enter`. This hook captures that burst anywhere on the page without
 * requiring an input field to be focused, while safely ignoring normal human typing
 * and leaving editable inputs untouched.
 */
export function useBarcodeScanner({
    onScan,
    enabled = true,
    minLength = 4,
    maxInterKeyDelayMs = 65,
}: UseBarcodeScannerOptions) {
    const onScanRef = useRef(onScan)
    onScanRef.current = onScan

    useEffect(() => {
        if (!enabled) return

        let buffer = ""
        let lastKeyTime = 0
        let resetTimer: ReturnType<typeof setTimeout> | null = null

        const clearBuffer = () => {
            buffer = ""
            lastKeyTime = 0
            if (resetTimer) {
                clearTimeout(resetTimer)
                resetTimer = null
            }
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore modifier combinations (Ctrl+C, Alt+Tab, etc.)
            if (e.ctrlKey || e.metaKey || e.altKey) {
                clearBuffer()
                return
            }

            // Do not intercept when user is typing inside an input/textarea/select
            // (The search input itself already handles Enter directly.)
            if (isEditableElement(document.activeElement)) {
                clearBuffer()
                return
            }

            const now = performance.now()

            if (e.key === "Enter") {
                const elapsed = now - lastKeyTime
                if (buffer.length >= minLength && elapsed <= maxInterKeyDelayMs * 2.5) {
                    e.preventDefault()
                    e.stopPropagation()
                    const scanned = buffer.trim()
                    clearBuffer()
                    if (scanned) {
                        onScanRef.current(scanned)
                    }
                    return
                }
                clearBuffer()
                return
            }

            // Ignore non-printable keys (Shift, CapsLock, F1-F12, Arrows, etc.)
            if (e.key.length !== 1) {
                return
            }

            // If too much time passed since the previous character, start a fresh buffer
            if (lastKeyTime > 0 && now - lastKeyTime > maxInterKeyDelayMs) {
                buffer = ""
            }

            buffer += e.key
            lastKeyTime = now

            if (resetTimer) {
                clearTimeout(resetTimer)
            }
            resetTimer = setTimeout(() => {
                buffer = ""
                lastKeyTime = 0
                resetTimer = null
            }, maxInterKeyDelayMs * 4)
        }

        window.addEventListener("keydown", handleKeyDown, true)
        return () => {
            window.removeEventListener("keydown", handleKeyDown, true)
            clearBuffer()
        }
    }, [enabled, minLength, maxInterKeyDelayMs])
}
