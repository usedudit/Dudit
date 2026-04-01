/**
 * Utilitários para geração de códigos únicos
 * Versão: Semantic SKU Generation (Fast Syllable Mimic)
 */

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Gera caracteres aleatórios para complementar
 */
export function generateAlphaNumericCode(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let result = ""
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Lógica RÁPIDA para abreviação baseada em som/consoantes
 * Simula a estrutura de sílabas sem processamento pesado
 */
function getFastAbbreviation(word: string): string {
  // 1. Limpa e normaliza
  const clean = word.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

  if (clean.length <= 3) return clean;

  // Começa sempre com a primeira letra
  let abbr = clean[0];
  const vowels = "AEIOU";

  // Percorre o resto procurando consoantes únicas
  for (let i = 1; i < clean.length; i++) {
    const char = clean[i];

    // Se for consoante
    if (!vowels.includes(char)) {
      // E se não for igual a anterior (Evita "Pa-ra-le-le" virar PRLL, vira PRL)
      if (abbr[abbr.length - 1] !== char) {
        abbr += char;
      }
    }

    // Limite de segurança (Max 5 letras para o prefixo)
    if (abbr.length >= 5) break;
  }

  // Se a palavra for muito curta ou só tiver vogais (ex: "Uia"), preenche com o original
  if (abbr.length < 3) {
    return clean.substring(0, 3);
  }

  return abbr;
}

/**
 * Lógica "Inteligente" para gerar SKU baseado no nome
 */
function generateSemanticBase(name: string): string {
  if (!name) return generateAlphaNumericCode(6)

  // Remove acentos e caracteres especiais para processamento
  const cleanName = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()

  const words = cleanName.split(/\s+/).filter(w => w.length > 0)

  if (words.length === 0) return generateAlphaNumericCode(6)

  // Helper para pegar pedaços de palavras
  const getChunk = (str: string, limit = 3) => str.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().substring(0, limit)

  let skuParts: string[] = []

  if (words.length === 1) {
    // CASO 1 PALAVRA: Usa o algoritmo de abreviação rápida
    // Ex: Paralelepipedo -> PRLPD-X92
    const prefix = getFastAbbreviation(words[0])

    // Sufixo aleatório curto (2 a 3 chars)
    const suffix = generateAlphaNumericCode(3)

    skuParts.push(prefix)
    skuParts.push(suffix)

  } else if (words.length === 2) {
    // CASO 2 PALAVRAS: Coca Cola -> COC-COL
    skuParts.push(getChunk(words[0]))
    skuParts.push(getChunk(words[1]))
  } else if (words.length === 3) {
    // CASO 3 PALAVRAS: Feijão Preto Tipo1 -> FEI-PRE-TIP
    skuParts.push(getChunk(words[0]))
    skuParts.push(getChunk(words[1]))
    skuParts.push(getChunk(words[2]))
  } else {
    // CASO 4+ PALAVRAS: Arroz Empório São João 5kg -> ARR-EMP-5KG
    skuParts.push(getChunk(words[0]))
    skuParts.push(getChunk(words[1]))
    skuParts.push(getChunk(words[words.length - 1]))
  }

  return skuParts.join("-")
}

/**
 * Gera SKU base a partir do nome (função pura, ZERO queries ao banco).
 * Unicidade garantida pelo índice único (partner_id, sku) no banco.
 */
export function generateSKUBase(productName?: string): string {
  return productName ? generateSemanticBase(productName) : generateAlphaNumericCode(6)
}

/**
 * Gera SKU com sufixo aleatório para retry em caso de collision.
 * Usado quando o INSERT falha com unique_violation (23505).
 */
export function generateSKUWithSuffix(baseSku: string, attempt: number): string {
  if (attempt === 0) return baseSku
  const suffix = generateAlphaNumericCode(attempt === 1 ? 2 : 3)
  return `${baseSku}-${suffix}`
}

/**
 * Gera um SKU único tentando manter a semântica do nome.
 * @deprecated Usar generateSKUBase + retry no INSERT para melhor performance.
 */
export async function generateUniqueSKU(
  partnerId: string,
  supabase?: SupabaseClient,
  productName?: string
): Promise<string> {
  if (!supabase) {
    throw new Error("Supabase client is required")
  }

  const baseSku = productName ? generateSemanticBase(productName) : generateAlphaNumericCode(6)

  let attempts = 0
  const maxAttempts = 10

  while (attempts < maxAttempts) {
    let candidateSku = baseSku

    if (attempts > 0) {
      // Ex: PRLPD-X92-2
      const suffix = generateAlphaNumericCode(attempts === 1 ? 1 : 2)
      candidateSku = `${baseSku}-${suffix}`
    }

    const { data, error } = await supabase
      .from("products")
      .select("sku")
      .eq("partner_id", partnerId)
      .eq("sku", candidateSku)
      .maybeSingle()

    if (error) {
      console.error(`Erro ao verificar SKU: ${error.message}`)
      return `${generateAlphaNumericCode(3)}-${Date.now().toString().slice(-4)}`
    }

    if (!data) {
      return candidateSku
    }

    attempts++
  }

  return `PRD-${Date.now().toString().slice(-6)}`
}

// --- Funções Genéricas (Mantidas) ---

async function generateUniqueCode(
  table: string,
  column: string,
  prefix = "",
  length = 6,
  supabase?: SupabaseClient,
): Promise<string> {
  if (!supabase) throw new Error("Supabase client is required")

  let attempts = 0
  while (attempts < 10) {
    const randomCode = generateAlphaNumericCode(length)
    const code = `${prefix}${randomCode}`
    const { data } = await supabase.from(table).select(column).eq(column, code).maybeSingle()
    if (!data) return code
    attempts++
  }
  throw new Error(`Falha ao gerar código único para ${table}`)
}

export async function generateOrderNumber(partnerId: string, supabase?: SupabaseClient): Promise<string> {
  return generateUniqueCode("orders", "order_number", "ORD-", 6, supabase)
}

export async function generateProductCode(partnerId: string, supabase?: SupabaseClient): Promise<string> {
  return generateUniqueCode("products", "sku", "PRD-", 6, supabase)
}

export async function generateUniqueServiceCode(supabase?: SupabaseClient): Promise<string> {
  return generateUniqueCode("services", "service_code", "SRV-", 6, supabase)
}

export async function generateUniqueSupplierCode(supabase?: SupabaseClient): Promise<string> {
  return generateUniqueCode("suppliers", "supplier_code", "FOR-", 6, supabase)
}

export async function generateQuoteNumber(supabase?: SupabaseClient): Promise<string> {
  return generateUniqueCode("quotes", "quote_number", "ORC-", 6, supabase)
}
