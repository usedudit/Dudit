export const dynamic = "force-static"

const DISALLOW_PATHS = [
  "/api/",
  "/auth/",
  "/erp/",
  "/sacola/",
  "/checkout/",
  "/payment/",
  "/pedidos/",
  "/dashboard/",
  "/invite/",
  "/select-erp/",
  "/perfil/",
  "/assinaturas/",
  "/print/",
  "/ddt-admin/",
  "/entregadores/",
  "/~offline/",
  "*?sort=*",
  "*?searchValue=*",
  "*?category=*",
  "*?tab=*",
  "*?q=*",
]

const AI_AND_SEARCH_BOTS = [
  "Googlebot",
  "Bingbot",
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "Google-Extended",
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "Amazonbot",
]

function buildRobotsTxt(): string {
  const disallowLines = DISALLOW_PATHS.map((p) => `Disallow: ${p}`).join("\n")
  const botAgentLines = AI_AND_SEARCH_BOTS.map((bot) => `User-Agent: ${bot}`).join("\n")

  return [
    "# Content Signals (https://contentsignals.org)",
    "User-Agent: *",
    "Content-Signal: search=yes, ai-input=yes, ai-train=no",
    "Allow: /",
    disallowLines,
    "",
    botAgentLines,
    "Allow: /",
    disallowLines,
    "",
    "Sitemap: https://dudit.com.br/sitemap.xml",
    "",
  ].join("\n")
}

export function GET() {
  return new Response(buildRobotsTxt(), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=14400, must-revalidate",
    },
  })
}
