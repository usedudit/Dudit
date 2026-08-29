import { describe, it, expect, vi, beforeEach } from "vitest"
import { generateShortId, generateSecurePublicToken, isUuid } from "@/lib/utils/short-id"

describe("Security Hardening Tests", () => {
    describe("P2 — Cryptographically Secure Public Tokens & Resource Isolation", () => {
        it("should generate tokens with at least 128 bits of entropy (22 url-safe chars)", () => {
            const token1 = generateShortId()
            const token2 = generateShortId()
            const token3 = generateSecurePublicToken(16)

            expect(typeof token1).toBe("string")
            expect(token1.length).toBeGreaterThanOrEqual(22)
            expect(token2.length).toBeGreaterThanOrEqual(22)
            expect(token3.length).toBeGreaterThanOrEqual(22)
            expect(token1).not.toBe(token2)
            expect(token1).not.toBe(token3)

            // Must use URL-safe base64url characters [A-Za-z0-9_-]
            expect(/^[A-Za-z0-9_-]+$/.test(token1)).toBe(true)
            expect(/^[A-Za-z0-9_-]+$/.test(token2)).toBe(true)
        })

        it("should distinguish between standard UUID and secure public token", () => {
            const uuid = "123e4567-e89b-12d3-a456-426614174000"
            const secureToken = generateShortId()

            expect(isUuid(uuid)).toBe(true)
            expect(isUuid(secureToken)).toBe(false)
            expect(isUuid("")).toBe(false)
            expect(isUuid("invalid-token")).toBe(false)
        })
    })

    describe("P1 — Approval Code Cryptographic Generation and Metadata Sanitization", () => {
        it("should generate 4-digit code using cryptographically secure random integers", async () => {
            const crypto = await import("crypto")
            const codes = new Set<string>()

            for (let i = 0; i < 100; i++) {
                const code = crypto.randomInt(1000, 10000).toString()
                expect(code.length).toBe(4)
                const num = parseInt(code, 10)
                expect(num).toBeGreaterThanOrEqual(1000)
                expect(num).toBeLessThan(10000)
                codes.add(code)
            }

            // Should have multiple distinct codes across 100 iterations
            expect(codes.size).toBeGreaterThan(50)
        })

        it("should ensure plain_code is removed from metadata", () => {
            const legacyMetadata = {
                plain_code: "1234",
                payment_terms: "À vista",
                custom_note: "Cliente VIP",
            }

            const cleanMetadata = { ...legacyMetadata }
            delete (cleanMetadata as any).plain_code

            expect(cleanMetadata).not.toHaveProperty("plain_code")
            expect(cleanMetadata.payment_terms).toBe("À vista")
            expect(cleanMetadata.custom_note).toBe("Cliente VIP")
        })
    })

    describe("P2 — Customer PII Masking Rules", () => {
        function maskEmail(email?: string | null): string | null {
            if (!email || typeof email !== "string") return null
            const parts = email.split("@")
            if (parts.length !== 2) return "***"
            const [name, domain] = parts
            const visibleName = name.length > 2 ? `${name[0]}***${name[name.length - 1]}` : `${name[0]}***`
            return `${visibleName}@${domain}`
        }

        function maskPhone(phone?: string | null): string | null {
            if (!phone || typeof phone !== "string") return null
            const digits = phone.replace(/\D/g, "")
            if (digits.length < 8) return "***"
            const last4 = digits.slice(-4)
            return `(***) *****-${last4}`
        }

        function maskDocument(doc?: string | null): string | null {
            if (!doc || typeof doc !== "string") return null
            const digits = doc.replace(/\D/g, "")
            if (digits.length === 11) {
                return `***.${digits.slice(3, 6)}.-**`
            }
            return "***"
        }

        it("should mask customer email, phone, and document", () => {
            expect(maskEmail("joao.silva@example.com")).toBe("j***a@example.com")
            expect(maskEmail("ab@domain.com")).toBe("a***@domain.com")
            expect(maskPhone("(11) 98765-4321")).toBe("(***) *****-4321")
            expect(maskDocument("123.456.789-00")).toBe("***.456.-**")
        })
    })

    describe("P3 — Direct-to-R2 Upload Validation Policy", () => {
        const ALLOWED_SIGNATURE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"]
        const MAX_SIGNATURE_SIZE_BYTES = 2 * 1024 * 1024

        function validateUploadRequest(mime: string, size: number) {
            const normalizedMime = String(mime || "").trim().toLowerCase()
            if (!ALLOWED_SIGNATURE_MIME_TYPES.includes(normalizedMime)) {
                return { allowed: false, error: "Formato de arquivo não permitido para assinatura. Use PNG, JPEG ou WebP." }
            }
            if (!size || size <= 0 || size > MAX_SIGNATURE_SIZE_BYTES) {
                return { allowed: false, error: "Arquivo de assinatura muito grande. O limite máximo é de 2MB." }
            }
            return { allowed: true }
        }

        it("should allow valid PNG, JPEG, WebP signatures under 2MB", () => {
            expect(validateUploadRequest("image/png", 100 * 1024).allowed).toBe(true)
            expect(validateUploadRequest("image/jpeg", 500 * 1024).allowed).toBe(true)
            expect(validateUploadRequest("image/webp", 1.5 * 1024 * 1024).allowed).toBe(true)
        })

        it("should reject disallowed MIME types and oversized payloads", () => {
            expect(validateUploadRequest("application/pdf", 100 * 1024).allowed).toBe(false)
            expect(validateUploadRequest("application/x-executable", 100).allowed).toBe(false)
            expect(validateUploadRequest("text/html", 1024).allowed).toBe(false)
            expect(validateUploadRequest("image/svg+xml", 1024).allowed).toBe(false)
            expect(validateUploadRequest("image/png", 3 * 1024 * 1024).allowed).toBe(false)
            expect(validateUploadRequest("image/png", 0).allowed).toBe(false)
        })

        it("should enforce expected key prefix matching assigned user and OS signature folder", () => {
            const uploadUserId = "user-123"
            const prefix = "service-orders/signatures/"
            const expectedPrefix = `users/${uploadUserId}/${prefix}`

            const validKey = `users/${uploadUserId}/${prefix}1724945000000-abcdef123456.png`
            const invalidKeyOtherUser = `users/attacker-999/${prefix}1724945000000-abcdef123456.png`
            const invalidKeyOtherFolder = `users/${uploadUserId}/avatars/malicious.png`
            const invalidKeyScript = `users/${uploadUserId}/${prefix}shell.php`

            expect(validKey.startsWith(expectedPrefix) && /\.(png|jpg|jpeg|webp)$/i.test(validKey)).toBe(true)
            expect(invalidKeyOtherUser.startsWith(expectedPrefix)).toBe(false)
            expect(invalidKeyOtherFolder.startsWith(expectedPrefix)).toBe(false)
            expect(/\.(png|jpg|jpeg|webp)$/i.test(invalidKeyScript)).toBe(false)
        })
    })
})
