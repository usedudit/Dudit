import { permanentRedirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default function GoalsPageRedirect() {
  permanentRedirect("/erp/produtividade/metas")
}
