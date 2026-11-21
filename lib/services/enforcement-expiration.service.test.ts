import { describe, it, expect, vi, beforeEach } from "vitest"
import {
    isEnforcementExpired,
    clearExpiredUserBan,
    clearExpiredPartnerEnforcement,
    clearExpiredStoreSuspension,
    expireAllExpiredEnforcements,
} from "./enforcement-expiration.service"

vi.mock("@/lib/utils/revalidation", () => ({
    revalidateUserAccess: vi.fn().mockResolvedValue(undefined),
    safeRevalidateTag: vi.fn().mockResolvedValue(undefined),
    safeRevalidatePath: vi.fn().mockResolvedValue(undefined),
}))

describe("enforcement-expiration.service", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe("isEnforcementExpired", () => {
        const nowMs = Date.parse("2026-11-20T15:00:00.000Z")

        it("returns false for null/undefined/invalid dates", () => {
            expect(isEnforcementExpired(null, nowMs)).toBe(false)
            expect(isEnforcementExpired(undefined, nowMs)).toBe(false)
            expect(isEnforcementExpired("not-a-date", nowMs)).toBe(false)
        })

        it("returns true when until is before or equal to now", () => {
            expect(isEnforcementExpired("2026-11-20T14:59:59.000Z", nowMs)).toBe(true)
            expect(isEnforcementExpired("2026-11-20T15:00:00.000Z", nowMs)).toBe(true)
        })

        it("returns false when until is in the future", () => {
            expect(isEnforcementExpired("2026-11-20T15:00:01.000Z", nowMs)).toBe(false)
        })
    })

    describe("clearExpiredUserBan", () => {
        it("clears all ban columns including banned_case_id when expired", async () => {
            const updatePayloads: any[] = []
            const mockSupabase = {
                from: vi.fn(() => ({
                    update: vi.fn((payload: any) => {
                        updatePayloads.push(payload)
                        return {
                            eq: vi.fn().mockReturnValue({
                                not: vi.fn().mockReturnValue({
                                    not: vi.fn().mockReturnValue({
                                        lte: vi.fn().mockReturnValue({
                                            select: vi.fn().mockResolvedValue({
                                                data: [{ user_id: "user-1" }],
                                                error: null,
                                            }),
                                        }),
                                    }),
                                }),
                            }),
                        }
                    }),
                })),
            }

            const cleared = await clearExpiredUserBan("user-1", mockSupabase, new Date("2026-11-20T15:00:00Z"))
            expect(cleared).toBe(true)
            expect(updatePayloads[0]).toEqual({
                banned_at: null,
                banned_until: null,
                banned_reason: null,
                banned_by: null,
                banned_case_id: null,
            })
        })

        it("returns false when no expired ban matched", async () => {
            const mockSupabase = {
                from: vi.fn(() => ({
                    update: vi.fn(() => ({
                        eq: vi.fn().mockReturnValue({
                            not: vi.fn().mockReturnValue({
                                not: vi.fn().mockReturnValue({
                                    lte: vi.fn().mockReturnValue({
                                        select: vi.fn().mockResolvedValue({ data: [], error: null }),
                                    }),
                                }),
                            }),
                        }),
                    })),
                })),
            }

            const cleared = await clearExpiredUserBan("user-2", mockSupabase, new Date("2026-11-20T15:00:00Z"))
            expect(cleared).toBe(false)
        })
    })

    describe("clearExpiredPartnerEnforcement", () => {
        it("clears expired partner suspension + expired stores and marks stillBlocked = false", async () => {
            const partnerUpdates: any[] = []
            const storeUpdates: any[] = []

            const mockSupabase = {
                from: vi.fn((table: string) => {
                    if (table === "partners") {
                        return {
                            select: vi.fn(() => ({
                                eq: vi.fn(() => ({
                                    maybeSingle: vi.fn().mockResolvedValue({
                                        data: {
                                            id: "partner-1",
                                            user_id: "owner-1",
                                            is_active: false,
                                            erp_disabled: false,
                                            suspended_at: "2026-11-10T10:00:00Z",
                                            suspended_until: "2026-11-20T14:00:00Z",
                                        },
                                        error: null,
                                    }),
                                })),
                                in: vi.fn().mockResolvedValue({ data: [{ user_id: "owner-1" }], error: null }),
                            })),
                            update: vi.fn((payload: any) => {
                                partnerUpdates.push(payload)
                                return {
                                    eq: vi.fn().mockResolvedValue({ error: null }),
                                }
                            }),
                        }
                    }
                    if (table === "stores") {
                        return {
                            update: vi.fn((payload: any) => {
                                storeUpdates.push(payload)
                                return {
                                    eq: vi.fn().mockReturnValue({
                                        not: vi.fn().mockReturnValue({
                                            not: vi.fn().mockReturnValue({
                                                lte: vi.fn().mockReturnValue({
                                                    select: vi.fn().mockResolvedValue({
                                                        data: [{ id: "store-1" }],
                                                        error: null,
                                                    }),
                                                }),
                                            }),
                                        }),
                                    }),
                                }
                            }),
                        }
                    }
                    if (table === "partner_users") {
                        return {
                            select: vi.fn(() => ({
                                in: vi.fn().mockResolvedValue({ data: [], error: null }),
                            })),
                        }
                    }
                    return {}
                }),
            }

            const result = await clearExpiredPartnerEnforcement(
                "partner-1",
                mockSupabase,
                new Date("2026-11-20T15:00:00Z")
            )

            expect(result).toEqual({
                cleared: true,
                partnerCleared: true,
                erpCleared: false,
                storesCleared: 1,
                stillBlocked: false,
            })
            expect(partnerUpdates[0]).toEqual({
                is_active: true,
                suspended_at: null,
                suspended_until: null,
                suspended_reason: null,
                suspended_by: null,
                suspended_case_id: null,
            })
            expect(storeUpdates[0]).toEqual({
                is_active: true,
                suspended_at: null,
                suspended_until: null,
                suspended_reason: null,
                suspended_by: null,
                suspended_case_id: null,
            })
        })

        it("clears expired ERP disable without touching unrelated fields and marks stillBlocked = false", async () => {
            const partnerUpdates: any[] = []

            const mockSupabase = {
                from: vi.fn((table: string) => {
                    if (table === "partners") {
                        return {
                            select: vi.fn(() => ({
                                eq: vi.fn(() => ({
                                    maybeSingle: vi.fn().mockResolvedValue({
                                        data: {
                                            id: "partner-2",
                                            user_id: "owner-2",
                                            is_active: true,
                                            erp_disabled: true,
                                            suspended_at: null,
                                            suspended_until: "2026-11-20T15:00:00Z",
                                        },
                                        error: null,
                                    }),
                                })),
                                in: vi.fn().mockResolvedValue({ data: [{ user_id: "owner-2" }], error: null }),
                            })),
                            update: vi.fn((payload: any) => {
                                partnerUpdates.push(payload)
                                return {
                                    eq: vi.fn().mockResolvedValue({ error: null }),
                                }
                            }),
                        }
                    }
                    if (table === "stores") {
                        return {
                            update: vi.fn(() => ({
                                eq: vi.fn().mockReturnValue({
                                    not: vi.fn().mockReturnValue({
                                        not: vi.fn().mockReturnValue({
                                            lte: vi.fn().mockReturnValue({
                                                select: vi.fn().mockResolvedValue({ data: [], error: null }),
                                            }),
                                        }),
                                    }),
                                }),
                            })),
                        }
                    }
                    if (table === "partner_users") {
                        return {
                            select: vi.fn(() => ({
                                in: vi.fn().mockResolvedValue({ data: [], error: null }),
                            })),
                        }
                    }
                    return {}
                }),
            }

            const result = await clearExpiredPartnerEnforcement(
                "partner-2",
                mockSupabase,
                new Date("2026-11-20T15:00:00Z")
            )

            expect(result).toEqual({
                cleared: true,
                partnerCleared: false,
                erpCleared: true,
                storesCleared: 0,
                stillBlocked: false,
            })
            expect(partnerUpdates[0]).toEqual({
                erp_disabled: false,
                erp_disabled_at: null,
                erp_disabled_by: null,
                suspended_until: null,
                suspended_reason: null,
                suspended_case_id: null,
            })
        })

        it("keeps stillBlocked = true when suspension is still active (future or permanent)", async () => {
            const partnerUpdateSpy = vi.fn()

            const mockSupabase = {
                from: vi.fn((table: string) => {
                    if (table === "partners") {
                        return {
                            select: vi.fn(() => ({
                                eq: vi.fn(() => ({
                                    maybeSingle: vi.fn().mockResolvedValue({
                                        data: {
                                            id: "partner-3",
                                            user_id: "owner-3",
                                            is_active: false,
                                            erp_disabled: false,
                                            suspended_at: "2026-11-10T10:00:00Z",
                                            suspended_until: "2026-11-25T10:00:00Z",
                                        },
                                        error: null,
                                    }),
                                })),
                            })),
                            update: partnerUpdateSpy,
                        }
                    }
                    if (table === "stores") {
                        return {
                            update: vi.fn(() => ({
                                eq: vi.fn().mockReturnValue({
                                    not: vi.fn().mockReturnValue({
                                        not: vi.fn().mockReturnValue({
                                            lte: vi.fn().mockReturnValue({
                                                select: vi.fn().mockResolvedValue({ data: [], error: null }),
                                            }),
                                        }),
                                    }),
                                }),
                            })),
                        }
                    }
                    return {}
                }),
            }

            const result = await clearExpiredPartnerEnforcement(
                "partner-3",
                mockSupabase,
                new Date("2026-11-20T15:00:00Z")
            )

            expect(result).toEqual({
                cleared: false,
                partnerCleared: false,
                erpCleared: false,
                storesCleared: 0,
                stillBlocked: true,
            })
            expect(partnerUpdateSpy).not.toHaveBeenCalled()
        })
    })

    describe("clearExpiredStoreSuspension", () => {
        it("clears expired store suspension and returns true", async () => {
            const mockSupabase = {
                from: vi.fn((table: string) => {
                    if (table === "stores") {
                        return {
                            update: vi.fn(() => ({
                                eq: vi.fn().mockReturnValue({
                                    not: vi.fn().mockReturnValue({
                                        not: vi.fn().mockReturnValue({
                                            lte: vi.fn().mockReturnValue({
                                                select: vi.fn().mockResolvedValue({
                                                    data: [{ id: "store-9", partner_id: "partner-9" }],
                                                    error: null,
                                                }),
                                            }),
                                        }),
                                    }),
                                }),
                            })),
                        }
                    }
                    return {
                        select: vi.fn(() => ({
                            in: vi.fn().mockResolvedValue({ data: [], error: null }),
                        })),
                    }
                }),
            }

            const cleared = await clearExpiredStoreSuspension("store-9", mockSupabase, new Date("2026-11-20T15:00:00Z"))
            expect(cleared).toBe(true)
        })
    })

    describe("expireAllExpiredEnforcements", () => {
        it("sweeps users, partners, erp_disables, and stores in one pass", async () => {
            const partnerUpdates: Array<{ id: string; payload: any }> = []

            const mockSupabase = {
                from: vi.fn((table: string) => {
                    if (table === "user_profiles") {
                        return {
                            update: vi.fn(() => ({
                                not: vi.fn().mockReturnValue({
                                    not: vi.fn().mockReturnValue({
                                        lte: vi.fn().mockReturnValue({
                                            select: vi.fn().mockResolvedValue({
                                                data: [{ user_id: "u1" }, { user_id: "u2" }],
                                                error: null,
                                            }),
                                        }),
                                    }),
                                }),
                            })),
                        }
                    }
                    if (table === "partners") {
                        return {
                            select: vi.fn(() => ({
                                not: vi.fn().mockReturnValue({
                                    lte: vi.fn().mockResolvedValue({
                                        data: [
                                            { id: "p1", user_id: "o1", suspended_at: "2026-11-01T00:00:00Z", erp_disabled: false },
                                            { id: "p2", user_id: "o2", suspended_at: null, erp_disabled: true },
                                        ],
                                        error: null,
                                    }),
                                }),
                                in: vi.fn().mockResolvedValue({ data: [], error: null }),
                            })),
                            update: vi.fn((payload: any) => ({
                                eq: vi.fn((_col: string, id: string) => {
                                    partnerUpdates.push({ id, payload })
                                    return Promise.resolve({ error: null })
                                }),
                            })),
                        }
                    }
                    if (table === "stores") {
                        return {
                            update: vi.fn(() => ({
                                not: vi.fn().mockReturnValue({
                                    not: vi.fn().mockReturnValue({
                                        lte: vi.fn().mockReturnValue({
                                            select: vi.fn().mockResolvedValue({
                                                data: [{ id: "s1", partner_id: "p1" }],
                                                error: null,
                                            }),
                                        }),
                                    }),
                                }),
                            })),
                        }
                    }
                    if (table === "partner_users") {
                        return {
                            select: vi.fn(() => ({
                                in: vi.fn().mockResolvedValue({ data: [], error: null }),
                            })),
                        }
                    }
                    return {}
                }),
            }

            const result = await expireAllExpiredEnforcements(mockSupabase, new Date("2026-11-20T15:00:00Z"))

            expect(result).toEqual({
                expiredUsers: 2,
                expiredPartners: 1,
                expiredErpDisables: 1,
                expiredStores: 1,
                totalCleared: 5,
            })
            expect(partnerUpdates).toHaveLength(2)
            expect(partnerUpdates[0]).toEqual({
                id: "p1",
                payload: {
                    is_active: true,
                    suspended_at: null,
                    suspended_by: null,
                    suspended_until: null,
                    suspended_reason: null,
                    suspended_case_id: null,
                },
            })
            expect(partnerUpdates[1]).toEqual({
                id: "p2",
                payload: {
                    erp_disabled: false,
                    erp_disabled_at: null,
                    erp_disabled_by: null,
                    suspended_until: null,
                    suspended_reason: null,
                    suspended_case_id: null,
                },
            })
        })
    })
})
