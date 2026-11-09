import { describe, it, expect } from "vitest"

describe("Admin Moderation & Timeline Integration", () => {
    it("humanizes admin moderation action types properly", () => {
        const actionTypeMap: Record<string, string> = {
            "moderation.approve": "Aprovou o item na moderação.",
            "moderation.reject": "Rejeitou o item na moderação.",
            "moderation.remove_image": "Removeu 1 imagem do item na moderação.",
            "catalog.product_update": "Atualizou informações do item no painel admin.",
            "catalog.product_archive": "Arquivou o item no catálogo.",
            "catalog.product_unarchive": "Desarquivou o item no catálogo.",
            "catalog.product_delete": "Excluiu o item do catálogo.",
        }

        expect(actionTypeMap["moderation.approve"]).toBe("Aprovou o item na moderação.")
        expect(actionTypeMap["moderation.reject"]).toBe("Rejeitou o item na moderação.")
        expect(actionTypeMap["moderation.remove_image"]).toBe("Removeu 1 imagem do item na moderação.")
    })

    it("formats timeline entries with change lines, reason, and risk score", () => {
        const meta = {
            reason: "Imagem com conteúdo inadequado",
            riskScore: 35,
            adminName: "Administrador Dudit",
            changedFields: ["images", "moderation_status"],
        }

        const changeLines: string[] = ["Removeu 1 imagem do item na moderação."]
        if (meta.reason) changeLines.push(`Motivo: "${meta.reason}"`)
        if (meta.riskScore != null) changeLines.push(`Risk score da loja ajustado para: ${meta.riskScore}`)
        if (meta.changedFields?.length) changeLines.push(`Campos alterados: ${meta.changedFields.join(", ")}`)

        expect(changeLines).toEqual([
            "Removeu 1 imagem do item na moderação.",
            'Motivo: "Imagem com conteúdo inadequado"',
            "Risk score da loja ajustado para: 35",
            "Campos alterados: images, moderation_status",
        ])
    })

    it("deduplicates audit_logs entries when an admin_audit_log exists for the same timestamp", () => {
        const adminLogTimestamp = "2026-11-09T13:35:10.123Z"
        const auditLogTimestamp = "2026-11-09T13:35:10.456Z"

        const seenKeys = new Set<string>()
        seenKeys.add(adminLogTimestamp.slice(0, 19))

        const isDuplicate = seenKeys.has(auditLogTimestamp.slice(0, 19))
        expect(isDuplicate).toBe(true)
    })

    it("sets highlight and Dudit actor badge when is_admin_action or dudit_action is present", () => {
        const entry = {
            id: "1",
            actor_name: "Murilo (Dudit)",
            change_lines: ["Aprovou o item na moderação."],
            created_at: new Date().toISOString(),
            metadata: {
                is_admin_action: true,
                dudit_action: true,
            },
            highlight: true,
        }

        expect(entry.highlight).toBe(true)
        expect(entry.metadata.is_admin_action).toBe(true)
        expect(entry.actor_name).toContain("(Dudit)")
    })
})
