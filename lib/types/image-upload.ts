export interface ImageUploadResponse {
  success: boolean
  error?: string
  publicUrl?: string
  key?: string
  fileName?: string
  imageHash?: string
  moderation?: {
    status: 'APPROVED' | 'FLAGGED' | 'BLOCKED'
    riskLevel: 'low' | 'medium' | 'high'
    confidence: number
    categories: {
      name: string
      confidence: number
    }[]
  }
}
