import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { withCSRFProtection } from "@/lib/security/csrf-middleware"

// ------------------------------------------------------------------
// 1. DICIONÁRIO VIP (Blindado e Atualizado 2024/2025)
// ------------------------------------------------------------------
// VIP MAP FOCADO EM "PEGADINHAS" E "SINÔNIMOS"
// O resto (arroz, camisa, martelo) a busca no banco ou a IA resolvem sozinhas.
const VIP_MAP: Record<string, string> = {
    // --- Nomes Populares vs Nomes Técnicos ---
    "bombril": "73231000",   // Técnico: Palha de aço
    "cotonete": "56012190",  // Técnico: Hastes flexíveis
    "band-aid": "30051010",  // Técnico: Curativo adesivo
    "durex": "39191010",     // Técnico: Fita adesiva
    "isopor": "39031120",    // Técnico: Poliestireno expandido
    "tupperware": "39241000",// Técnico: Artefatos de mesa plástico
    "t-shirt": "61091000",   // Técnico: Camisetas
    "regata": "61091000",
    "moletons": "61102000",
    "jeans": "62034200",     // Técnico: Calças de algodão

    // --- Bebidas (Monofásicos Garantidos) ---
    "coca": "22021000",
    "tubaina": "22021000",
    "sukita": "22021000",
    "pepsi": "22021000",
    "guarana": "22021000",
    "fanta": "22021000",
    "sprite": "22021000",
    "energético": "22029900",
    "red bull": "22029900",
    "monster": "22029900",

    // --- Limpeza (Mudanças recentes de NCM) ---
    "detergente": "34025000", // Código novo
    "ypê": "34025000",
    "limpol": "34025000",
    "minuano": "34025000",
    "veja": "34029090",       // Multiuso
    "vanish": "28289011",     // Alvejante

    // --- Higiene ---
    "pampers": "96190000",    // Fraldas
    "huggies": "96190000",
    "modess": "96190000",     // Absorvente
    "colgate": "33061000",
    "sorriso": "33061000",
    "oral-b": "96032100",     // Escova

    // --- Comidas Específicas ---
    "doriana": "15171000",
    "qualy": "15171000",
    "nutella": "18069000",
    "toddy": "18069000",
    "nescau": "18069000",
    "leite ninho": "04022110",
    "miojo": "19023000",
    "nissin": "19023000",
    "bis": "18063210",
    "kitkat": "18063210"
};

// PALAVRAS DE EMBALAGEM (IGNORAR NA BUSCA)
const GENERIC_CONTAINERS = [
    "caixa", "caixinha", "pacote", "pct", "pote", "potes",
    "garrafa", "litro", "lata", "saco", "sacola", "kit", "unidade", "peca", "kg", "g", "ml"
];

const STOP_WORDS = ["de", "da", "do", "com", "para", "e", "sem", "ao"];

async function handleSuggestNCM(req: NextRequest) {
    try {
        // --- Rate Limit & Auth ---
        const { RateLimitCategory } = await import("@/lib/rate-limiter")
        const { checkRateLimit } = await import("@/lib/security/rate-limiter-wrapper")
        const rateLimit = await checkRateLimit(RateLimitCategory.API_GENERAL)
        if (!rateLimit.success) return NextResponse.json({ error: "Muitas requisições." }, { status: 429 })

        const { getCurrentUser } = await import("@/lib/auth/authorization")
        const user = await getCurrentUser()
        if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
        // -------------------------

        const { productName } = await req.json()
        if (!productName?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 })

        const cleanName = productName.trim().replace(/['"]/g, "").toLowerCase()
        const words = cleanName.split(" ").filter((w: string) => !STOP_WORDS.includes(w) && w.length > 1);

        const supabase = await getSupabaseServerClient()
        const finalSuggestions = []
        const seenNcms = new Set()

        // 1. VIP MAP
        let vipNcm = null
        for (let i = words.length; i > 0; i--) {
            const phrase = words.slice(0, i).join(" ")
            if (VIP_MAP[phrase]) {
                vipNcm = VIP_MAP[phrase]
                break
            }
        }
        if (!vipNcm) {
            for (let i = words.length - 1; i >= 0; i--) { // Busca reversa (Bombom > Caixa)
                if (VIP_MAP[words[i]]) {
                    vipNcm = VIP_MAP[words[i]]
                    break
                }
            }
        }

        if (vipNcm) {
            const { data: dbMatch } = await supabase
                .from("ncm_data")
                .select("*")
                .or(`codigo.eq.${vipNcm},codigo.eq.${formatNcm(vipNcm)}`)
                .maybeSingle()

            return NextResponse.json({
                suggestions: [{
                    ncm: vipNcm,
                    description: dbMatch?.descricao || "Classificação Padrão Varejo",
                    confidence: "alta",
                    reasoning: "Item de alto giro identificado automaticamente.",
                    taxData: dbMatch ? { nacionalFederal: dbMatch.nacionalfederal, estadual: dbMatch.estadual, municipal: dbMatch.municipal } : null
                }]
            })
        }

        // 2. IA (Fonte Primária) - Usando Groq
        const apiKey = process.env.GROQ_API_KEY
        if (apiKey) {
            try {
                console.log(`[NCM] Consultando IA (Groq) para: "${cleanName}"`)
                const prompt = `
              Atue como banco de dados fiscal. Liste 3 NCMs (8 dígitos) para: "${cleanName}".
              - Ignore embalagens (Caixa, Pote). Foque no produto.
              - "Caixa de Bombom" = 18069000 (Chocolate).
              - Ordene por probabilidade.
              - Retorne JSON no formato: { "suggestions": [{ "ncm": "12345678", "description": "...", "confidence": "alta", "reasoning": "..." }] }
            `

                const groqResponse = await fetch(
                    "https://api.groq.com/openai/v1/chat/completions",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${apiKey}`,
                        },
                        body: JSON.stringify({
                            model: "qwen/qwen3.8-27b",
                            messages: [{ role: "user", content: prompt }],
                            temperature: 0.1,
                            response_format: { type: "json_object" },
                        }),
                    }
                )

                if (groqResponse.ok) {
                    const data = await groqResponse.json()
                    const result = JSON.parse(data.choices?.[0]?.message?.content || "{}")
                    const aiSuggestions = result.suggestions || []

                    for (const item of aiSuggestions) {
                        const code = item.ncm.replace(/\D/g, "")
                        if (code.length < 8) continue
                        if (seenNcms.has(code)) continue

                        const { data: check } = await supabase
                            .from("ncm_data")
                            .select("*")
                            .or(`codigo.eq.${code},codigo.eq.${formatNcm(code)}`)
                            .maybeSingle()

                        if (check) {
                            finalSuggestions.push({
                                ncm: code,
                                description: check.descricao,
                                confidence: "alta",
                                reasoning: "Sugestão Inteligente (IA)",
                                taxData: { nacionalFederal: check.nacionalfederal, estadual: check.estadual, municipal: check.municipal }
                            })
                            seenNcms.add(code)
                        }
                    }
                }
            } catch (e) {
                console.warn("[NCM] Erro na IA (Groq), indo para fallback:", e)
            }
        }

        if (finalSuggestions.length >= 3) {
            return NextResponse.json({ suggestions: finalSuggestions.slice(0, 3) })
        }

        // 3. BUSCA OFFLINE MELHORADA (Anti-Embalagem)
        console.log(`[NCM] Iniciando busca offline...`)
        let candidates = []
        let matchedTerm = ""

        // Tenta: Frase Inteira -> Palavras Individuais (Reverso)
        // "caixa de bombom" -> "bombom" (Caixa é ignorado)
        const searchTerms = [cleanName, ...words.reverse()];

        for (const term of searchTerms) {
            if (term.length < 3) continue
            if (GENERIC_CONTAINERS.includes(term) && term !== cleanName) continue; // Pula "caixa"

            const { data } = await supabase
                .from("ncm_data")
                .select("*")
                .ilike("descricao", `%${term}%`)
                .limit(30)

            if (data && data.length > 0) {
                matchedTerm = term
                candidates = data
                break
            }
        }

        if (candidates.length > 0) {
            const scoredCandidates = candidates.map((item: any) => {
                let score = 0
                const desc = item.descricao.toLowerCase()

                // Score: Começa com a palavra? (+100)
                if (desc.startsWith(matchedTerm)) score += 100

                // Score: Tamanho (Menor descrição = categoria mãe = melhor)
                score -= (desc.length * 0.5)

                return { item, score }
            })

            scoredCandidates.sort((a: any, b: any) => b.score - a.score)

            for (const candidate of scoredCandidates) {
                if (finalSuggestions.length >= 3) break
                const code = candidate.item.codigo.replace(/\D/g, "")
                if (!seenNcms.has(code)) {
                    finalSuggestions.push({
                        ncm: code,
                        description: candidate.item.descricao,
                        confidence: "média",
                        reasoning: `Busca local por "${matchedTerm}"`,
                        taxData: { nacionalFederal: candidate.item.nacionalfederal, estadual: candidate.item.estadual, municipal: candidate.item.municipal }
                    })
                    seenNcms.add(code)
                }
            }
        }

        if (finalSuggestions.length > 0) {
            return NextResponse.json({ suggestions: finalSuggestions })
        }

        return NextResponse.json({ error: "NCM não encontrado." }, { status: 404 })

    } catch (error: any) {
        console.error("[NCM] Erro Fatal:", error)
        return NextResponse.json({ error: "Erro interno." }, { status: 500 })
    }
}

function formatNcm(ncm: string) {
    return ncm.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1.$2.$3")
}

export const POST = withCSRFProtection(handleSuggestNCM)
