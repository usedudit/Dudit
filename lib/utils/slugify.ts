export function createSlug(text: string): string {
  return text
    .toString()
    .normalize("NFD") // Separa acentos das letras
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") // Troca espaços por hífens
    .replace(/[^\w-]+/g, "") // Remove caracteres especiais
    .replace(/--+/g, "-") // Remove hífens duplicados
}

/**
 * Slug canônico de categoria do marketplace: "&" vira "e"
 * ("Agro & Jardim" → "agro-e-jardim", igual às rotas do /explorar).
 */
export function createCategorySlug(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ & /g, "-e-")
    .replace(/&/g, "e")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}
