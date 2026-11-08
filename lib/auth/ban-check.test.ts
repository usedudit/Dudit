import { describe, it, expect, vi, beforeEach } from "vitest"
import { getBannedUserProfile, checkAndClearExpiredBan } from "./ban-check"

// Mock getAdminClient
const mockMaybeSingle = vi.fn()
const mockUpdate = vi.fn()
const mockEq = vi.fn()

const mockFrom = vi.fn().mockImplementation((table: string) => {
    return {
        select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                maybeSingle: mockMaybeSingle,
            }),
        }),
        update: vi.fn().mockImplementation((payload: any) => ({
            eq: mockEq.mockResolvedValue({ error: null }),
        })),
    }
})

vi.mock("@/lib/supabase/admin", () => ({
    getAdminClient: () => ({
        from: mockFrom,
    }),
}))

describe("ban-check", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("returns null when user is not banned", async () => {
        mockMaybeSingle.mockResolvedValue({
            data: {
                user_id: "user-1",
                full_name: "Test User",
                banned_at: null,
                banned_until: null,
                banned_reason: null,
                banned_case_id: null,
            },
            error: null,
        })

        const result = await getBannedUserProfile("user-1")
        expect(result).toBeNull()

        const isBanned = await checkAndClearExpiredBan("user-1")
        expect(isBanned).toBe(false)
    })

    it("returns banned profile when user is permanently banned", async () => {
        mockMaybeSingle.mockResolvedValue({
            data: {
                user_id: "user-2",
                full_name: "Banned User",
                banned_at: "2026-11-01T10:00:00Z",
                banned_until: null,
                banned_reason: "Violação de regras",
                banned_case_id: "CAS-123456",
            },
            error: null,
        })

        const result = await getBannedUserProfile("user-2")
        expect(result).not.toBeNull()
        expect(result?.user_id).toBe("user-2")
        expect(result?.banned_case_id).toBe("CAS-123456")
        expect(result?.banned_reason).toBe("Violação de regras")
        expect(result?.banned_until).toBeNull()

        const isBanned = await checkAndClearExpiredBan("user-2")
        expect(isBanned).toBe(true)
    })

    it("returns banned profile when temporary ban is still active", async () => {
        const futureDate = new Date(Date.now() + 86400000).toISOString()
        mockMaybeSingle.mockResolvedValue({
            data: {
                user_id: "user-3",
                full_name: "Temp Banned",
                banned_at: "2026-11-01T10:00:00Z",
                banned_until: futureDate,
                banned_reason: "Spam",
                banned_case_id: "CAS-999999",
            },
            error: null,
        })

        const result = await getBannedUserProfile("user-3")
        expect(result).not.toBeNull()
        expect(result?.banned_until).toBe(futureDate)

        const isBanned = await checkAndClearExpiredBan("user-3")
        expect(isBanned).toBe(true)
    })

    it("auto-clears expired ban and returns null", async () => {
        const pastDate = new Date(Date.now() - 86400000).toISOString()
        mockMaybeSingle.mockResolvedValue({
            data: {
                user_id: "user-4",
                full_name: "Expired Ban User",
                banned_at: "2026-10-01T10:00:00Z",
                banned_until: pastDate,
                banned_reason: "Suspended",
                banned_case_id: "CAS-777777",
            },
            error: null,
        })

        const result = await getBannedUserProfile("user-4")
        expect(result).toBeNull()

        const isBanned = await checkAndClearExpiredBan("user-4")
        expect(isBanned).toBe(false)
    })
})

