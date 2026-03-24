import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { withCSRFProtection } from "@/lib/security/csrf-middleware"

function normalizeNcm(ncm: string): string {
  if (!ncm) return ""
  let clean = ncm.replace(/\D/g, "")
  if (clean.length === 7) clean = "0" + clean
  return clean
}

function normalizeCest(cest: string): string {
  if (!cest) return ""
  return cest.replace(/\D/g, "")
}

const selectionSchema = {
  type: "object",
  properties: {
    selected_id: { type: "integer", description: "ID da opção correta" },
    reasoning: { type: "string" },
  },
  required: ["selected_id", "reasoning"],
}

async function handleSuggestCEST(req: NextRequest) {
  try {
    // --- Auth/Rate Limit ---
    const { RateLimitCategory } = await import("@/lib/rate-limiter")
    const { checkRateLimit } = await import("@/lib/security/rate-limiter-wrapper")
    const rateLimit = await checkRateLimit(RateLimitCategory.API_GENERAL)
    if (!rateLimit.success) return NextResponse.json({ error: "Muitas requisições." }, { status: 429 })

    const { getCurrentUser } = await import("@/lib/auth/authorization")
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    // -----------------------

    const { productName, ncmCode } = await req.json()
    if (!productName || !ncmCode) return NextResponse.json({ error: "Dados incompletos" }, { status: 400 })

    const ncmClean = normalizeNcm(ncmCode)
    const ncmFormatted = ncmClean.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1.$2.$3")

    console.log("[CEST] NCM normalizado:", ncmClean, "formatado:", ncmFormatted)

    const supabase = await getSupabaseServerClient()

    // 1. Busca exata no banco (ambas colunas NCM)
    let { data: candidates, error } = await supabase
      .from("cest_data")
      .select("*")
      .or(`NCM.eq.${ncmClean},NCM.eq.${ncmFormatted}`)

    console.log("[CEST] Busca exata coluna NCM:", candidates?.length || 0, "resultados")

    // Fallback para coluna antiga NCM/SH
    if (!candidates || candidates.length === 0) {
      const { data: retryData } = await supabase
        .from("cest_data")
        .select("*")
        .or(`"NCM/SH.".eq.${ncmClean},"NCM/SH.".eq.${ncmFormatted}`)
      candidates = retryData || []
      console.log("[CEST] Busca exata coluna NCM/SH:", candidates?.length, "resultados")
    }

    // 2. Fallback: busca por prefixo (primeiros 4 dígitos = capítulo)
    if (!candidates || candidates.length === 0) {
      const chapter = ncmClean.substring(0, 4)
      console.log("[CEST] Tentando fallback por capítulo:", chapter)

      const { data: chapterMatches } = await supabase
        .from("cest_data")
        .select("*")
        .or(`NCM.like.${chapter}%,"NCM/SH.".like.${chapter}%`)
        .limit(20)

      candidates = chapterMatches || []
      console.log("[CEST] Busca por capítulo:", candidates?.length, "resultados")
    }

    if (!candidates || candidates.length === 0) {
      console.log("[CEST] Nenhum resultado encontrado")
      return NextResponse.json({
        found: false,
        cest: null,
        csosn: "102",
        message: "Nenhum CEST encontrado.",
      })
    }

    console.log("[CEST]", candidates.length, "opções encontradas")

    // 3. Se encontrou apenas 1 resultado, retorna direto
    if (candidates.length === 1) {
      const row = candidates[0]
      const cestCode = row["CEST"] || row["CEST."]
      const desc = row["Descricao"] || row["Descrição"] || row["Descrição CEST"]

      console.log("[CEST] Match exato encontrado:", cestCode)

      return NextResponse.json({
        found: true,
        cest: normalizeCest(cestCode),
        csosn: "500",
        method: "db_exact",
        description: desc,
      })
    }

    // 4. Múltiplos resultados: usa IA para desempatar
    console.log("[CEST] Desempatando com IA...")
    const optionsList = candidates
      .map((row: any, idx: number) => {
        const c = row["CEST"] || row["CEST."]
        const d = row["Descricao"] || row["Descrição"] || row["Descrição CEST"]
        return `ID: ${idx} | CEST: ${c} | Desc: "${d}"`
      })
      .join("\n")

    const apiKey = process.env.GOOGLE_GEMINI_API_KEY
    if (!apiKey) {
      console.error("[CEST] API Key do Gemini não configurada")
      // Fallback: retorna primeiro resultado
      const fallbackRow = candidates[0]
      return NextResponse.json({
        found: true,
        cest: normalizeCest(fallbackRow["CEST"] || fallbackRow["CEST."]),
        csosn: "500",
        method: "fallback_first",
        description: fallbackRow["Descricao"] || fallbackRow["Descrição"],
      })
    }

    const prompt = `
      Auditor Fiscal. Produto: "${productName}".
      Escolha o CEST correto da lista.
      - Atenção a PESO/VOLUME (ex: 500g, 1kg).
      - Atenção a EMBALAGEM (Vidro, Pet, Lata).
      
      Lista:
      ${optionsList}
    `

    try {
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.0,
              responseMimeType: "application/json",
              responseSchema: selectionSchema,
            },
          }),
        },
      )

      if (!geminiResponse.ok) {
        throw new Error(`Gemini API retornou status ${geminiResponse.status}`)
      }

      const result = await geminiResponse.json()

      if (!result.candidates || !result.candidates[0]?.content?.parts?.[0]?.text) {
        throw new Error("Resposta da IA em formato inesperado")
      }

      const aiContent = JSON.parse(result.candidates[0].content.parts[0].text)

      const selectedIndex = aiContent.selected_id || 0
      const selectedRow = candidates[selectedIndex] || candidates[0]

      const finalCest = selectedRow["CEST"] || selectedRow["CEST."]
      const finalDesc = selectedRow["Descricao"] || selectedRow["Descrição"] || selectedRow["Descrição CEST"]

      console.log("[CEST] IA selecionou:", finalCest)

      return NextResponse.json({
        found: true,
        cest: normalizeCest(finalCest),
        csosn: "500",
        method: "ai_smart_selection",
        description: finalDesc,
        reasoning: aiContent.reasoning,
      })
    } catch (aiError: any) {
      console.error("[CEST] Erro na IA:", aiError.message)

      // Fallback: retorna primeiro resultado se IA falhar
      const fallbackRow = candidates[0]
      return NextResponse.json({
        found: true,
        cest: normalizeCest(fallbackRow["CEST"] || fallbackRow["CEST."]),
        csosn: "500",
        method: "fallback_ai_error",
        description: fallbackRow["Descricao"] || fallbackRow["Descrição"],
        aiError: aiError.message,
      })
    }
  } catch (error: any) {
    console.error("[CEST] Erro crítico:", error)
    return NextResponse.json(
      {
        found: false,
        error: error.message,
      },
      { status: 500 },
    )
  }
}

export const POST = withCSRFProtection(handleSuggestCEST)
