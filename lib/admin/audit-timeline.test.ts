import { describe, it, expect } from "vitest"
import { formatAdminAuditLogToHistoryEntry, formatAdminAuditLogsToHistoryEntries } from "./audit-timeline"

describe("audit-timeline", () => {
    it("formats user.ban with actor, action, reason, case_id, duration and risk score", () => {
        const entry = formatAdminAuditLogToHistoryEntry({
            id: "log-1",
            admin_user_id: "admin-1",
            actor_name: "Murilo Admin",
            action_type: "user.ban",
            created_at: "2026-11-21T15:00:00.000Z",
            metadata: {
                reason: "Tentativa de golpe",
                case_id: "CAS-ABCD1234",
                durationDays: 7,
                bannedUntil: "2026-11-28T15:00:00.000Z",
                riskScore: 80,
            },
        })

        expect(entry.actor_name).toBe("Murilo Admin")
        expect(entry.entry_type).toBe("rejected")
        expect(entry.highlight).toBe(true)
        expect(entry.change_lines).toContain("Ação: Banimento de Usuário")
        expect(entry.change_lines).toContain("Motivo: Tentativa de golpe")
        expect(entry.change_lines).toContain("Protocolo: CAS-ABCD1234")
        expect(entry.change_lines.some((l) => l.startsWith("Vigência: 7 dias"))).toBe(true)
        expect(entry.change_lines).toContain("Score de risco definido para: 80")
    })

    it("distinguishes store suspension from partner suspension via metadata.storeId", () => {
        const storeEntry = formatAdminAuditLogToHistoryEntry({
            id: "log-2",
            action_type: "partner.suspend",
            created_at: "2026-11-21T15:00:00.000Z",
            metadata: {
                storeId: "store-1",
                storeName: "Loja Centro",
                reason: "Auditoria",
                durationDays: "permanent",
            },
        })

        expect(storeEntry.actor_name).toBe("Equipe Dudit")
        expect(storeEntry.change_lines).toContain("Ação: Suspensão de Loja")
        expect(storeEntry.change_lines).toContain("Loja: Loja Centro")
        expect(storeEntry.change_lines).toContain("Vigência: Permanente")
    })

    it("formats showcase disable and enable actions with proper icons", () => {
        const entries = formatAdminAuditLogsToHistoryEntries([
            {
                id: "log-3",
                actor_name: "Ana Mod",
                action_type: "partner.disable_showcase",
                created_at: "2026-11-21T14:00:00.000Z",
                metadata: { storeName: "Loja Sul", reason: "Produtos irregulares" },
            },
            {
                id: "log-4",
                actor_name: "Ana Mod",
                action_type: "partner.enable_showcase",
                created_at: "2026-11-21T15:00:00.000Z",
                metadata: { storeName: "Loja Sul", reason: "Catálogo regularizado" },
            },
        ])

        expect(entries[0].entry_type).toBe("rejected")
        expect(entries[0].change_lines).toContain("Ação: Desativação de Vitrine Online")
        expect(entries[1].entry_type).toBe("approved")
        expect(entries[1].change_lines).toContain("Ação: Ativação de Vitrine Online")
    })

    it("formats risk score changes with oldScore -> newScore", () => {
        const entry = formatAdminAuditLogToHistoryEntry({
            id: "log-5",
            actor_name: "Carlos Admin",
            action_type: "moderation.risk_score",
            created_at: "2026-11-21T15:00:00.000Z",
            metadata: { oldScore: 10, newScore: 45, reason: "Reclamações recorrentes" },
        })

        expect(entry.entry_type).toBe("note")
        expect(entry.change_lines).toContain("Ação: Ajuste de Score de Risco")
        expect(entry.change_lines).toContain("Score de risco: 10 → 45")
        expect(entry.change_lines).toContain("Motivo: Reclamações recorrentes")
    })
})
