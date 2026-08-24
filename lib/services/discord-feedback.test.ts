import { describe, it, expect, vi, beforeEach } from "vitest"
import { sendDiscordFeedbackNotification } from "./discord-feedback.service"

describe("sendDiscordFeedbackNotification", () => {
  const originalEnv = process.env.DISCORD_FEEDBACK_WEBHOOK_URL

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns success: true without calling fetch if DISCORD_FEEDBACK_WEBHOOK_URL is not set", async () => {
    delete process.env.DISCORD_FEEDBACK_WEBHOOK_URL
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    const res = await sendDiscordFeedbackNotification({
      id: "test-uuid",
      type: "general",
      sentiment: "positive",
      message: "Adorei a nova interface!",
      userId: "user-123",
      userEmail: "user@example.com",
    })

    expect(res.success).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("formats and posts embed payload correctly when webhook URL is set", async () => {
    process.env.DISCORD_FEEDBACK_WEBHOOK_URL = "https://discord.com/api/webhooks/12345/abcdef"

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 204,
      text: async () => "",
    } as any)

    const res = await sendDiscordFeedbackNotification({
      id: "fb-1234",
      type: "bug",
      sentiment: "negative",
      message: "Botão de salvar não responde ao clique",
      pageUrl: "https://dudit.com.br/erp/produtos",
      userId: "usr-456",
      userName: "Maria Silva",
      userEmail: "maria@loja.com",
      partnerId: "prt-789",
      partnerName: "Loja da Maria",
      metadata: {
        app_area: "ERP",
        partner_plan: "Pro",
        user_role: "Owner",
        browser: "Chrome (Windows)",
        screen: "Desktop (1920x1080)",
      },
    })

    expect(res.success).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    const callArgs = fetchSpy.mock.calls[0]
    expect(callArgs[0]).toBe("https://discord.com/api/webhooks/12345/abcdef")

    const sentBody = JSON.parse(callArgs[1]?.body as string)
    expect(sentBody.embeds).toBeDefined()
    expect(sentBody.embeds.length).toBe(1)

    const embed = sentBody.embeds[0]
    expect(embed.title).toContain("Problema / Bug")
    expect(embed.color).toBe(0xef4444)

    const fieldNames = embed.fields.map((f: any) => f.name)
    expect(fieldNames).toContain("Categoria")
    expect(fieldNames).toContain("👤 Usuário")
    expect(fieldNames).toContain("🏢 Parceiro / Loja")
    expect(fieldNames).toContain("📍 Contexto")
    expect(fieldNames).toContain("💻 Dispositivo")
    expect(fieldNames).toContain("🔗 Página")
    expect(fieldNames).toContain("📝 Mensagem")

    process.env.DISCORD_FEEDBACK_WEBHOOK_URL = originalEnv
  })

  it("handles fetch errors gracefully without throwing", async () => {
    process.env.DISCORD_FEEDBACK_WEBHOOK_URL = "https://discord.com/api/webhooks/12345/abcdef"

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network connection error"))

    const res = await sendDiscordFeedbackNotification({
      id: "fb-fail",
      type: "general",
      message: "Test message",
      userId: "user-1",
    })

    expect(res.success).toBe(false)
    expect(res.error).toBe("Network connection error")

    process.env.DISCORD_FEEDBACK_WEBHOOK_URL = originalEnv
  })
})
