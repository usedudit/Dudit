export interface SimpleExtractedData {
  brand: string
  description: string
  tags: string[]
  specs: Record<string, string>
  category: {
    id: string | null
    confidence: number
  }
}

/**
 * Fallback extremamente simples caso a IA esteja indisponível.
 * Contém somente extrações básicas via regex (armazenamento, potência e voltagem).
 */
export function extractLocalDataSimple(title: string): SimpleExtractedData {
  const specs: Record<string, string> = {}

  // 1. Armazenamento (ex: 256GB, 1TB)
  const storageMatch = title.match(/(\d+)\s*(GB|TB)/i)
  if (storageMatch) {
    specs["Armazenamento"] = `${storageMatch[1]} ${storageMatch[2].toUpperCase()}`
  }

  // 2. Voltagem (ex: 110V, 220V, Bivolt)
  const voltageMatch = title.match(/(\d+)\s*V(olts?)?|bivolt/i)
  if (voltageMatch) {
    if (voltageMatch[0].toLowerCase() === "bivolt") {
      specs["Voltagem"] = "Bivolt"
    } else {
      specs["Voltagem"] = `${voltageMatch[1]}V`
    }
  }

  // 3. Potência (ex: 60W, 1200W)
  const powerMatch = title.match(/(\d+)\s*(W|watts?)/i)
  if (powerMatch) {
    specs["Potência"] = `${powerMatch[1]}W`
  }

  // 4. Detecção básica de marcas conhecidas
  let detectedBrand = ""
  const commonBrands = [
    "Apple", "Samsung", "Nike", "Adidas", "Xiaomi", "Motorola", "LG", "Sony",
    "Dell", "Lenovo", "Asus", "Bosch", "Stanley", "Tramontina", "Philco",
    "Mondial", "Electrolux", "Brastemp", "Consul", "Puma", "Natura", "Boticário",
    "JBL", "Intelbras", "Multilaser", "HP", "Acer", "Microsoft"
  ]

  for (const b of commonBrands) {
    const regex = new RegExp(`\\b${b}\\b`, "i")
    if (regex.test(title)) {
      detectedBrand = b
      break
    }
  }

  if (!detectedBrand) {
    if (/\b(iPhone|iPad|MacBook|AirPods)\b/i.test(title)) detectedBrand = "Apple"
    else if (/\b(Galaxy)\b/i.test(title)) detectedBrand = "Samsung"
    else if (/\b(Air\s*Force|Dunk|Air\s*Max)\b/i.test(title)) detectedBrand = "Nike"
    else if (/\b(PlayStation|PS[45])\b/i.test(title)) detectedBrand = "Sony"
    else if (/\b(Xbox)\b/i.test(title)) detectedBrand = "Microsoft"
  }

  return {
    brand: detectedBrand,
    description: "",
    tags: [],
    specs,
    category: {
      id: null,
      confidence: 0.0,
    },
  }
}
