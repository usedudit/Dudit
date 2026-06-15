export interface LabelPreset {
  id: string
  name: string
  description: string
  labelWidth: number
  labelHeight: number
  cols: number
  rows: number
  marginTop: number
  marginRight: number
  marginBottom: number
  marginLeft: number
  spacingX: number
  spacingY: number
}

export interface LabelContentConfig {
  showName: boolean
  showPrice: boolean
  showPromotionalPrice: boolean
  showInstallment: boolean
  showSku: boolean
  showBarcode: boolean
  showInternalCode: boolean
  installmentText: string
}

export const DEFAULT_CONTENT_CONFIG: LabelContentConfig = {
  showName: true,
  showPrice: true,
  showPromotionalPrice: false,
  showInstallment: false,
  showSku: false,
  showBarcode: true,
  showInternalCode: false,
  installmentText: "12x",
}

export const LABEL_PRESETS: LabelPreset[] = [
  {
    id: "pimaco-a4355",
    name: "Pimaco A4355",
    description: "63,5 × 31 mm — 3 colunas × 8 linhas",
    labelWidth: 63.5,
    labelHeight: 31,
    cols: 3,
    rows: 8,
    marginTop: 12,
    marginRight: 7,
    marginBottom: 12,
    marginLeft: 7,
    spacingX: 3,
    spacingY: 3,
  },
  {
    id: "pimaco-a4360",
    name: "Pimaco A4360",
    description: "84 × 27 mm — 2 colunas × 10 linhas",
    labelWidth: 84,
    labelHeight: 27,
    cols: 2,
    rows: 10,
    marginTop: 8,
    marginRight: 8,
    marginBottom: 8,
    marginLeft: 8,
    spacingX: 4,
    spacingY: 4,
  },
  {
    id: "pimaco-a4362",
    name: "Pimaco A4362",
    description: "100 × 36 mm — 2 colunas × 7 linhas",
    labelWidth: 100,
    labelHeight: 36,
    cols: 2,
    rows: 7,
    marginTop: 7,
    marginRight: 7,
    marginBottom: 7,
    marginLeft: 7,
    spacingX: 3,
    spacingY: 3,
  },
  {
    id: "pimaco-a4354",
    name: "Pimaco A4354",
    description: "99 × 38,1 mm — 2 colunas × 7 linhas",
    labelWidth: 99,
    labelHeight: 38.1,
    cols: 2,
    rows: 7,
    marginTop: 7,
    marginRight: 7,
    marginBottom: 7,
    marginLeft: 7,
    spacingX: 3,
    spacingY: 3,
  },
  {
    id: "pimaco-a4255",
    name: "Pimaco A4255",
    description: "25,4 × 101,6 mm — 5 colunas × 2 linhas",
    labelWidth: 25.4,
    labelHeight: 101.6,
    cols: 5,
    rows: 2,
    marginTop: 10,
    marginRight: 7,
    marginBottom: 10,
    marginLeft: 7,
    spacingX: 3,
    spacingY: 3,
  },
]

export function getPresetById(id: string): LabelPreset | undefined {
  return LABEL_PRESETS.find((p) => p.id === id)
}

export function buildCustomPreset(params: {
  labelWidth: number
  labelHeight: number
  cols: number
  rows: number
  marginTop: number
  marginRight: number
  marginBottom: number
  marginLeft: number
  spacingX: number
  spacingY: number
}): LabelPreset {
  return {
    id: "custom",
    name: "Customizado",
    description: `${params.labelWidth} × ${params.labelHeight} mm — ${params.cols} colunas × ${params.rows} linhas`,
    ...params,
  }
}
