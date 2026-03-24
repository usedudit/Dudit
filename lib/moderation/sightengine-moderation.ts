export interface SightengineResult {
  moderation?: {
    nudity?: { confidence: number }
    gore?: { confidence: number }
    weapon?: { confidence: number }
    violence?: { confidence: number }
  }
  nudity?: { [key: string]: number }
  gore?: { [key: string]: number }
  weapon?: { [key: string]: number }
  violence?: { [key: string]: number }
  status: string
  request?: { id?: string }
  error?: { message?: string }
}

export interface ModerationAnalysis {
  riskLevel: 'low' | 'medium' | 'high'
  confidence: number
  categories: {
    name: string
    confidence: number
  }[]
  rawResponse: SightengineResult | null
  error?: string
}

// Apenas 4 categorias conforme solicitado
// Nomes CORRETOS da documentação do Sightengine
const MODELS = [
  'nudity-2.1',
  'gore-2.0',
  'violence',
  'weapon',
]

const CONFIDENCE_THRESHOLD = 0.5 // 50% threshold

/**
 * Função auxiliar recursiva para encontrar o maior valor numérico em um objeto,
 * ignorando chaves de metadados ou segurança.
 */
function findMaxConfidenceRecursive(data: any, ignoredKeys: string[]): number {
  // Se for número direto, retorna ele
  if (typeof data === 'number') return data

  // Se não for objeto (null, string, etc), retorna 0
  if (!data || typeof data !== 'object') return 0

  let max = 0

  for (const [key, value] of Object.entries(data)) {
    // Pula chaves ignoradas (safe, none, context, etc)
    if (ignoredKeys.includes(key)) continue

    // Chama a função novamente para o valor (recursão)
    // Isso garante que entremos em "classes", "type", etc.
    const currentVal = findMaxConfidenceRecursive(value, ignoredKeys)

    if (currentVal > max) {
      max = currentVal
    }
  }

  return max
}

export function analyzeModerationResult(
  result: SightengineResult
): ModerationAnalysis {
  try {
    const categoriesToCheck = [
      { key: 'nudity', name: 'Nudity/Adult Content' },
      { key: 'gore', name: 'Gore' },
      { key: 'violence', name: 'Violence' },
      { key: 'weapon', name: 'Weapons' },
    ]

    const flaggedCategories: { name: string; confidence: number }[] = []
    let maxConfidence = 0

    // Lista negra expandida de campos para ignorar
    const IGNORED_FIELDS = [
      'safe', 'none', 'context', 'request', 'media',
      'status', 'error', 'operations'
    ]

    for (const { key, name } of categoriesToCheck) {
      const categoryData = (result as any)[key]

      // Se a categoria não veio na resposta, ignora
      if (categoryData === undefined || categoryData === null) continue

      // Usa a busca recursiva para achar o maior valor, mesmo aninhado
      const confidence = findMaxConfidenceRecursive(categoryData, IGNORED_FIELDS)

      if (confidence > CONFIDENCE_THRESHOLD) {
        flaggedCategories.push({
          name,
          confidence: Math.round(confidence * 100),
        })
        maxConfidence = Math.max(maxConfidence, confidence)
      }
    }

    // Determinar nível de risco
    let riskLevel: 'low' | 'medium' | 'high' = 'low'
    if (maxConfidence > 0.8) {
      riskLevel = 'high'
    } else if (maxConfidence > 0.6) {
      riskLevel = 'medium'
    }

    return {
      riskLevel,
      confidence: Math.round(maxConfidence * 100),
      categories: flaggedCategories,
      rawResponse: result,
    }
  } catch (error) {
    console.error('[SIGHTENGINE] Error analyzing result:', error)
    return {
      riskLevel: 'low',
      confidence: 0,
      categories: [],
      rawResponse: result,
      error: 'Erro ao analisar resultado',
    }
  }
}

/**
 * Faz requisição ao Sightengine com base64 de imagem
 * CORREÇÃO: Usa FormData (multipart) em vez de URLSearchParams
 */
export async function moderateImageWithBase64(
  base64Image: string
): Promise<ModerationAnalysis> {
  try {
    const apiUser = process.env.SIGHTENGINE_API_USER
    const apiSecret = process.env.SIGHTENGINE_API_SECRET

    if (!apiUser || !apiSecret) {
      console.error('[SIGHTENGINE] Missing API credentials')
      return {
        riskLevel: 'low',
        confidence: 0,
        categories: [],
        rawResponse: null,
        error: 'API credentials not configured',
      }
    }

    console.log('[SIGHTENGINE] Starting moderation with base64 image')

    // 1. Criar o FormData
    const formData = new FormData()
    formData.append('models', MODELS.join(','))
    formData.append('api_user', apiUser)
    formData.append('api_secret', apiSecret)

    // 2. Converter Base64 para Blob para simular um arquivo real
    // Remove o cabeçalho "data:image/png;base64," se existir
    const base64Data = base64Image.includes(',')
      ? base64Image.split(',')[1]
      : base64Image

    // Converte para Buffer e depois para Blob
    const buffer = Buffer.from(base64Data, 'base64')
    const blob = new Blob([buffer], { type: 'image/jpeg' })

    // Anexa como se fosse um arquivo chamado 'image.jpg'
    formData.append('media', blob, 'image.jpg')

    console.log('[SIGHTENGINE] Sending POST request (FormData)')

    // 3. O Fetch gerencia o Content-Type automaticamente (boundary)
    // NÃO defina 'Content-Type': 'multipart/form-data' manualmente!
    const response = await fetch('https://api.sightengine.com/1.0/check.json', {
      method: 'POST',
      body: formData,
    })

    console.log('[SIGHTENGINE] Response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[SIGHTENGINE] API error:', response.status, errorText.slice(0, 300))
      return {
        riskLevel: 'low',
        confidence: 0,
        categories: [],
        rawResponse: null,
        error: `API error: ${response.status}`,
      }
    }

    const result: SightengineResult = await response.json()

    // Tratamento específico para o erro de limite de requisições ou erro de argumentos
    if (result.status === 'failure') {
      console.warn('[SIGHTENGINE] API Failure:', result)
      return {
        riskLevel: 'low',
        confidence: 0,
        categories: [],
        rawResponse: result,
        error: result.error?.message || 'API Failure',
      }
    }

    const analysis = analyzeModerationResult(result)

    return analysis

  } catch (error) {
    console.error('[SIGHTENGINE] Exception:', error instanceof Error ? error.message : error)
    return {
      riskLevel: 'low',
      confidence: 0,
      categories: [],
      rawResponse: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Faz requisição ao Sightengine com URL da imagem (para imagens já salvas)
 * Mais rápido se a imagem já está em servidor público
 */
export async function moderateImageWithUrl(
  imageUrl: string
): Promise<ModerationAnalysis> {
  try {
    const apiUser = process.env.SIGHTENGINE_API_USER
    const apiSecret = process.env.SIGHTENGINE_API_SECRET

    if (!apiUser || !apiSecret) {
      console.error('[SIGHTENGINE] Missing API credentials')
      return {
        riskLevel: 'low',
        confidence: 0,
        categories: [],
        rawResponse: null,
        error: 'API credentials not configured',
      }
    }

    console.log('[SIGHTENGINE] Starting moderation with URL:', imageUrl.slice(0, 50))

    const params = new URLSearchParams({
      url: imageUrl,
      models: MODELS.join(','),
      api_user: apiUser,
      api_secret: apiSecret,
    })

    console.log('[SIGHTENGINE] Sending request to API')

    const response = await fetch(
      `https://api.sightengine.com/1.0/check.json?${params.toString()}`,
      {
        method: 'GET',
      }
    )

    console.log('[SIGHTENGINE] Response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[SIGHTENGINE] API error:', response.status, errorText.slice(0, 200))
      return {
        riskLevel: 'low',
        confidence: 0,
        categories: [],
        rawResponse: null,
        error: `API error: ${response.status}`,
      }
    }

    const result: SightengineResult = await response.json()
    console.log('[SIGHTENGINE] Analysis complete, status:', result.status)

    if (result.status !== 'success') {
      console.warn('[SIGHTENGINE] API returned non-success status:', result.status)
      return {
        riskLevel: 'low',
        confidence: 0,
        categories: [],
        rawResponse: result,
        error: 'API returned error status',
      }
    }

    const analysis = analyzeModerationResult(result)
    console.log('[SIGHTENGINE] Final analysis:', {
      riskLevel: analysis.riskLevel,
      confidence: analysis.confidence,
      categoriesCount: analysis.categories.length,
    })

    return analysis
  } catch (error) {
    console.error('[SIGHTENGINE] Exception:', error instanceof Error ? error.message : error)
    return {
      riskLevel: 'low',
      confidence: 0,
      categories: [],
      rawResponse: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
