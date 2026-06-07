/**
 * Lightweight local synonym dictionary for marketplace search expansion.
 * Keys and values should be accent-free lowercase (see normalizeSearchQuery).
 */
export const MARKETPLACE_SYNONYMS: Record<string, string[]> = {
  roupa: ["camisa", "camiseta", "calca", "bermuda", "short", "blusa", "jaqueta", "moda"],
  roupas: ["camisa", "camiseta", "calca", "bermuda", "short", "blusa", "jaqueta", "moda"],
  vestuario: ["camisa", "camiseta", "calca", "bermuda", "short", "blusa", "jaqueta", "moda"],
  moda: ["camisa", "camiseta", "calca", "bermuda", "short", "blusa", "jaqueta", "roupa"],

  pet: ["racao", "brinquedo", "coleira", "acessorio", "pets"],
  pets: ["racao", "brinquedo", "coleira", "acessorio", "pet"],

  veiculo: ["carro", "moto", "pneu", "peca", "auto"],
  veiculos: ["carro", "moto", "pneu", "peca", "auto"],
  carro: ["auto", "moto", "peca", "pneu"],

  eletronico: ["celular", "tablet", "notebook", "computador", "fone"],
  eletronicos: ["celular", "tablet", "notebook", "computador", "fone"],
  tecnologia: ["celular", "tablet", "notebook", "computador", "fone"],

  camiseta: ["camisa", "roupa", "moda"],
  camisa: ["camiseta", "roupa", "moda"],
  academia: ["treino", "esporte", "fitness", "roupa"],
  treino: ["academia", "esporte", "fitness"],
  esporte: ["academia", "treino", "fitness"],
}

export function expandSynonyms(token: string): string[] {
  const normalized = token.toLowerCase()
  const direct = MARKETPLACE_SYNONYMS[normalized] || []
  return Array.from(new Set([normalized, ...direct]))
}
