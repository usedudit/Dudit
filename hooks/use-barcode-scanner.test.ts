// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { useBarcodeScanner } from "./use-barcode-scanner"

function dispatchKey(key: string, init: KeyboardEventInit = {}) {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }))
}

describe("useBarcodeScanner", () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("captures fast HID scanner bursts followed by Enter", () => {
        const onScan = vi.fn()
        renderHook(() => useBarcodeScanner({ onScan, enabled: true }))

        const code = "7891234567890"
        for (const ch of code) {
            dispatchKey(ch)
            vi.advanceTimersByTime(12)
        }
        dispatchKey("Enter")

        expect(onScan).toHaveBeenCalledTimes(1)
        expect(onScan).toHaveBeenCalledWith(code)
    })

    it("ignores slow human typing", () => {
        const onScan = vi.fn()
        renderHook(() => useBarcodeScanner({ onScan, enabled: true, maxInterKeyDelayMs: 65 }))

        for (const ch of "78912345") {
            dispatchKey(ch)
            vi.advanceTimersByTime(150)
        }
        dispatchKey("Enter")

        expect(onScan).not.toHaveBeenCalled()
    })

    it("ignores scans when an input element is focused", () => {
        const onScan = vi.fn()
        renderHook(() => useBarcodeScanner({ onScan, enabled: true }))

        const input = document.createElement("input")
        document.body.appendChild(input)
        input.focus()

        for (const ch of "7891234567890") {
            dispatchKey(ch)
            vi.advanceTimersByTime(10)
        }
        dispatchKey("Enter")

        expect(onScan).not.toHaveBeenCalled()
        document.body.removeChild(input)
    })

    it("does nothing when disabled", () => {
        const onScan = vi.fn()
        renderHook(() => useBarcodeScanner({ onScan, enabled: false }))

        for (const ch of "7891234567890") {
            dispatchKey(ch)
            vi.advanceTimersByTime(10)
        }
        dispatchKey("Enter")

        expect(onScan).not.toHaveBeenCalled()
    })
})
