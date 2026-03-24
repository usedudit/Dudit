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
