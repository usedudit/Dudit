import "server-only"
import type { EntityType } from "./types"

interface DetectionScore {
  entityType: EntityType
  score: number
  label: string
}

const patterns: Record<EntityType, { keywords: string[] }> = {
  products: {
    keywords: [
      "preço", "preco", "price", "estoque", "stock", "sku", "gtin",
      "ean", "ncm", "cest", "categoria", "marca", "unidade", "quantidade",
      "qtd", "custo", "peso", "altura", "largura", "comprimento",
      "barras", "valor unitario", "produto", "name", "nome",
      "variacao", "variacao", "variante", "variantes", "grade",
    ],
  },
  customers: {
    keywords: [
      "cpf", "cnpj", "cpf/cnpj", "endereço", "endereco", "rua",
      "bairro", "cidade", "estado", "cep", "telefone", "celular",
      "whatsapp", "nascimento", "birth", "cliente",
    ],
  },
  services: {
    keywords: [
      "duração", "duracao", "duration", "minutos", "serviço", "servico",
      "service", "categoria serviço", "categoria servico", "tempo",
      "agendamento", "scheduling",
    ],
  },
}

function normalize(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim()
}

export function detectEntity(headers: string[]): EntityType {
  const normalized = headers.map(normalize)

  const scores: DetectionScore[] = Object.entries(patterns).map(
    ([entity, { keywords }]) => {
      const score = normalized.reduce((acc, h) => {
        const match = keywords.some(
          (kw) => h === kw || h.includes(kw) || kw.includes(h),
        )
        return acc + (match ? 1 : 0)
      }, 0)
      return {
        entityType: entity as EntityType,
        score,
        label: entity,
      }
    },
  )

  scores.sort((a, b) => b.score - a.score)

  const top = scores[0]
  const second = scores[1]

  if (top.score === 0 && second?.score === 0) {
    return "products"
  }

  if (top.score >= 2 || top.score - (second?.score ?? 0) >= 2) {
    return top.entityType
  }

  return "products"
}
