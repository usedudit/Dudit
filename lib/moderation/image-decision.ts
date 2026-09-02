import type { ModerationAnalysis } from './sightengine-moderation'

export type ImageStatus = 'APPROVED' | 'FLAGGED' | 'BLOCKED' | 'DUPLICATE'

export interface ImageDecision {
  status: ImageStatus
  message: string
  shouldSaveToR2: boolean
  isDuplicate?: boolean
}

/**
 * Decide o status da imagem baseado no resultado de moderação
 * 
 * BLOCKED (high) = Não salva no R2, retorna erro ao usuário
 * FLAGGED (medium) = Salva no R2, mas marca com ícone de alerta
 * APPROVED (low) = Salva normalmente no R2, sem alertas
 * DUPLICATE = Imagem já foi processada (do cache)
 */
export function decideImageStatus(
  analysis: ModerationAnalysis,
  isDuplicate?: boolean
): ImageDecision {
  // Se é duplicada no cache (aprovada antes), retorna mensagem
  if (isDuplicate) {
    return {
      status: 'DUPLICATE',
      message: 'Imagem já foi adicionada.',
      shouldSaveToR2: false,
      isDuplicate: true,
    }
  }

  const { riskLevel, categories } = analysis

  // === REVISÃO / MODERAÇÃO PENDENTE (Risco Alto ou Médio) ===
  // Não bloqueia upload nem impede de salvar no R2: marca como FLAGGED para aprovação/revisão manual
  if (riskLevel === 'high' || riskLevel === 'medium') {
    const flaggedCategories = categories.map(c => c.name).join(', ')
    return {
      status: 'FLAGGED',
      message: `Imagem marcada para revisão: ${flaggedCategories || 'conteúdo sinalizado'}`,
      shouldSaveToR2: true,
    }
  }

  // === APPROVE (Risco Baixo ou Moderação Indisponível) ===
  return {
    status: 'APPROVED',
    message: 'Imagem aprovada.',
    shouldSaveToR2: true,
  }
}
