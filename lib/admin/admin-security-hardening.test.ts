import { describe, it, expect, vi } from "vitest"
import { timingSafeStringEqual } from "@/lib/security/timing-safe"
import { requireScope } from "@/lib/auth/admin-authorization"
import { sanitizeUUID } from "@/lib/security/input-sanitizer"
import type { AdminUser } from "@/lib/admin/types"

describe("Admin & System Security Hardening", () => {
    describe("Timing-safe String Comparison", () => {
        it("returns true for identical strings", () => {
            expect(timingSafeStringEqual("secret-token-12345", "secret-token-12345")).toBe(true)
        })

        it("returns false for different strings of equal length", () => {
            expect(timingSafeStringEqual("secret-token-12345", "secret-token-99999")).toBe(false)
        })

        it("returns false for strings of different lengths", () => {
            expect(timingSafeStringEqual("short", "longer-string")).toBe(false)
        })

        it("returns false for empty or non-string inputs", () => {
            expect(timingSafeStringEqual("", "")).toBe(false)
            expect(timingSafeStringEqual(null as any, "secret")).toBe(false)
            expect(timingSafeStringEqual("secret", undefined as any)).toBe(false)
        })
    })

    describe("Admin Scope Enforcement", () => {
        const moderatorUser: AdminUser = {
            userId: "mod-1",
            role: "moderator",
            email: "mod@dudit.com.br",
            isProtected: false,
            scopes: ["moderation", "audit_access"],
        }

        const adminUser: AdminUser = {
            userId: "admin-1",
            role: "admin",
            email: "admin@dudit.com.br",
            isProtected: false,
            scopes: ["moderation", "user_enforcement", "billing_control", "audit_access"],
        }

        const superAdminUser: AdminUser = {
            userId: "super-1",
            role: "super_admin",
            email: "super@dudit.com.br",
            isProtected: true,
            scopes: ["moderation", "user_enforcement", "billing_control", "audit_access", "system_settings"],
        }

        it("moderator has moderation and audit_access scopes", () => {
            expect(() => requireScope(moderatorUser, "moderation")).not.toThrow()
            expect(() => requireScope(moderatorUser, "audit_access")).not.toThrow()
        })

        it("moderator is denied billing_control and system_settings", () => {
            expect(() => requireScope(moderatorUser, "billing_control")).toThrow("Permissão insuficiente")
            expect(() => requireScope(moderatorUser, "system_settings")).toThrow("Permissão insuficiente")
            expect(() => requireScope(moderatorUser, "user_enforcement")).toThrow("Permissão insuficiente")
        })

        it("regular admin is denied system_settings unless explicitly granted", () => {
            expect(() => requireScope(adminUser, "system_settings")).toThrow("Permissão insuficiente")
        })

        it("super_admin has all scopes including system_settings", () => {
            expect(() => requireScope(superAdminUser, "system_settings")).not.toThrow()
            expect(() => requireScope(superAdminUser, "billing_control")).not.toThrow()
            expect(() => requireScope(superAdminUser, "user_enforcement")).not.toThrow()
        })
    })

    describe("UUID Sanitization for Admin Endpoints", () => {
        it("accepts valid v4 UUIDs", () => {
            const valid = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
            expect(sanitizeUUID(valid)).toBe(valid)
        })

        it("rejects path traversal and SQL injection attempts", () => {
            expect(sanitizeUUID("../../etc/passwd")).toBeNull()
            expect(sanitizeUUID("' OR '1'='1")).toBeNull()
            expect(sanitizeUUID("not-a-uuid")).toBeNull()
            expect(sanitizeUUID("")).toBeNull()
            expect(sanitizeUUID(undefined as any)).toBeNull()
        })
    })

    describe("Risk Score Clamping & Normalization", () => {
        function clampRiskScore(score: unknown): number {
            return Math.min(Math.max(Math.round(Number(score) || 0), 0), 100)
        }

        it("clamps scores to [0, 100]", () => {
            expect(clampRiskScore(-50)).toBe(0)
            expect(clampRiskScore(150)).toBe(100)
            expect(clampRiskScore(42)).toBe(42)
            expect(clampRiskScore(0)).toBe(0)
            expect(clampRiskScore(100)).toBe(100)
        })

        it("handles invalid or non-finite numbers safely", () => {
            expect(clampRiskScore(NaN)).toBe(0)
            expect(clampRiskScore(Infinity)).toBe(100)
            expect(clampRiskScore(-Infinity)).toBe(0)
            expect(clampRiskScore("invalid")).toBe(0)
            expect(clampRiskScore(null)).toBe(0)
            expect(clampRiskScore(undefined)).toBe(0)
        })
    })
})
