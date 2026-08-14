export type PaperSize = "a4" | "letter"

export interface LabelPreset {
  id: string
  name: string
  description: string
  paperSize: PaperSize
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

export const PAPER_SIZES: Record<
  PaperSize,
  { width: number; height: number; label: string; shortLabel: string }
> = {
  a4: { width: 210, height: 297, label: "A4 (21 × 29,7 cm)", shortLabel: "A4" },
  letter: { width: 215.9, height: 279.4, label: "Carta (21,59 × 27,94 cm)", shortLabel: "Carta" },
}

export function getPageSize(preset: Pick<LabelPreset, "paperSize">) {
  return PAPER_SIZES[preset.paperSize]
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

interface PresetParams {
  id: string
  name: string
  paperSize: PaperSize
  labelWidth: number
  labelHeight: number
  cols: number
  rows: number
  marginTop: number
  marginLeft: number
  spacingX: number
  spacingY: number
}

const fmt = (n: number) => String(n).replace(".", ",")

function makePreset(params: PresetParams): LabelPreset {
  return {
    id: params.id,
    name: params.name,
    description: `${fmt(params.labelWidth)} × ${fmt(params.labelHeight)} mm · ${params.cols} × ${params.rows} (${PAPER_SIZES[params.paperSize].shortLabel})`,
    paperSize: params.paperSize,
    labelWidth: params.labelWidth,
    labelHeight: params.labelHeight,
    cols: params.cols,
    rows: params.rows,
    marginTop: params.marginTop,
    marginRight: params.marginLeft,
    marginBottom: params.marginTop,
    marginLeft: params.marginLeft,
    spacingX: params.spacingX,
    spacingY: params.spacingY,
  }
}

const a4 = "a4" as const
const letter = "letter" as const

export const LABEL_PRESETS: LabelPreset[] = [
  // ─── Folhas tamanho A4 (21 × 29,7 cm) ───────────────────────────────
  makePreset({
    id: "pimaco-a4048",
    name: "Pimaco A4048/A4248/A4348",
    paperSize: a4,
    labelWidth: 31,
    labelHeight: 17,
    cols: 6,
    rows: 16,
    marginTop: 12.5,
    marginLeft: 7,
    spacingX: 2,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-a4049",
    name: "Pimaco A4049/A4249/A4349",
    paperSize: a4,
    labelWidth: 26,
    labelHeight: 15,
    cols: 7,
    rows: 18,
    marginTop: 13.5,
    marginLeft: 8,
    spacingX: 2,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-a4050",
    name: "Pimaco A4050/A4250/A4350",
    paperSize: a4,
    labelWidth: 99,
    labelHeight: 55.8,
    cols: 2,
    rows: 5,
    marginTop: 9,
    marginLeft: 4.7,
    spacingX: 2.6,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-a4051",
    name: "Pimaco A4051/A4251/A4351",
    paperSize: a4,
    labelWidth: 38.2,
    labelHeight: 21.2,
    cols: 5,
    rows: 13,
    marginTop: 10.7,
    marginLeft: 4.5,
    spacingX: 2.5,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-a4054",
    name: "Pimaco A4054/A4254/A4354/A4054R",
    paperSize: a4,
    labelWidth: 99,
    labelHeight: 25.4,
    cols: 2,
    rows: 11,
    marginTop: 8.8,
    marginLeft: 4.7,
    spacingX: 2.6,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-a4355",
    name: "Pimaco A4055/A4255/A4355",
    paperSize: a4,
    labelWidth: 63.5,
    labelHeight: 31,
    cols: 3,
    rows: 9,
    marginTop: 9,
    marginLeft: 7.2,
    spacingX: 2.6,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-a4056",
    name: "Pimaco A4056/A4256/A4356/A4056R",
    paperSize: a4,
    labelWidth: 63.5,
    labelHeight: 25.4,
    cols: 3,
    rows: 11,
    marginTop: 8.8,
    marginLeft: 7.2,
    spacingX: 2.6,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-a4360",
    name: "Pimaco A4060/A4260/A4360",
    paperSize: a4,
    labelWidth: 63.5,
    labelHeight: 38.1,
    cols: 3,
    rows: 7,
    marginTop: 15.2,
    marginLeft: 7.2,
    spacingX: 2.6,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-a4261",
    name: "Pimaco A4261/A4361",
    paperSize: a4,
    labelWidth: 63.5,
    labelHeight: 46.5,
    cols: 3,
    rows: 6,
    marginTop: 9.1,
    marginLeft: 7.2,
    spacingX: 2.6,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-a4362",
    name: "Pimaco A4062/A4262/A4362",
    paperSize: a4,
    labelWidth: 99,
    labelHeight: 33.9,
    cols: 2,
    rows: 8,
    marginTop: 12.9,
    marginLeft: 4.7,
    spacingX: 2.6,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-a4063",
    name: "Pimaco A4063/A4263/A4363/A4063R",
    paperSize: a4,
    labelWidth: 99,
    labelHeight: 38.1,
    cols: 2,
    rows: 7,
    marginTop: 15.2,
    marginLeft: 4.7,
    spacingX: 2.6,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-a4264",
    name: "Pimaco A4264/A4364",
    paperSize: a4,
    labelWidth: 63.5,
    labelHeight: 71.9,
    cols: 3,
    rows: 4,
    marginTop: 4.7,
    marginLeft: 7.2,
    spacingX: 2.6,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-a4265",
    name: "Pimaco A4265/A4365",
    paperSize: a4,
    labelWidth: 99,
    labelHeight: 67.8,
    cols: 2,
    rows: 4,
    marginTop: 13,
    marginLeft: 4.7,
    spacingX: 2.6,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-a4067",
    name: "Pimaco A4067/A4267/A4367",
    paperSize: a4,
    labelWidth: 200,
    labelHeight: 288.5,
    cols: 1,
    rows: 1,
    marginTop: 4.3,
    marginLeft: 5,
    spacingX: 0,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-a4268",
    name: "Pimaco A4268/A4368",
    paperSize: a4,
    labelWidth: 199.9,
    labelHeight: 143.4,
    cols: 1,
    rows: 2,
    marginTop: 5.1,
    marginLeft: 5.1,
    spacingX: 0,
    spacingY: 0,
  }),

  // ─── Folhas tamanho Carta (21,59 × 27,94 cm) ────────────────────────
  makePreset({
    id: "pimaco-3080",
    name: "Pimaco 3080/3180",
    paperSize: letter,
    labelWidth: 66.7,
    labelHeight: 25.4,
    cols: 3,
    rows: 10,
    marginTop: 12.7,
    marginLeft: 4.8,
    spacingX: 3.1,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-3081",
    name: "Pimaco 3081/3181",
    paperSize: letter,
    labelWidth: 101.6,
    labelHeight: 25.4,
    cols: 2,
    rows: 10,
    marginTop: 12.7,
    marginLeft: 4,
    spacingX: 5.2,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-3082",
    name: "Pimaco 3082/3182",
    paperSize: letter,
    labelWidth: 101.6,
    labelHeight: 33.9,
    cols: 2,
    rows: 7,
    marginTop: 21.2,
    marginLeft: 4,
    spacingX: 5.2,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-5580",
    name: "Pimaco 5580A/5580M/5580V",
    paperSize: letter,
    labelWidth: 66.7,
    labelHeight: 25.4,
    cols: 3,
    rows: 10,
    marginTop: 12.7,
    marginLeft: 4.8,
    spacingX: 3.1,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-6080",
    name: "Pimaco 6080/6180/6280/62580",
    paperSize: letter,
    labelWidth: 66.7,
    labelHeight: 25.4,
    cols: 3,
    rows: 10,
    marginTop: 12.7,
    marginLeft: 4.8,
    spacingX: 3.1,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-6081",
    name: "Pimaco 6081/6181/6281/62581",
    paperSize: letter,
    labelWidth: 101.6,
    labelHeight: 25.4,
    cols: 2,
    rows: 10,
    marginTop: 12.7,
    marginLeft: 4,
    spacingX: 5.2,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-6082",
    name: "Pimaco 6082/6182/6282/62582",
    paperSize: letter,
    labelWidth: 101.6,
    labelHeight: 33.9,
    cols: 2,
    rows: 7,
    marginTop: 21.2,
    marginLeft: 4,
    spacingX: 5.2,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-6083",
    name: "Pimaco 6083/6183/6283",
    paperSize: letter,
    labelWidth: 101.6,
    labelHeight: 50.8,
    cols: 2,
    rows: 5,
    marginTop: 12.7,
    marginLeft: 4,
    spacingX: 5.2,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-6084",
    name: "Pimaco 6084/6184/6284",
    paperSize: letter,
    labelWidth: 101.6,
    labelHeight: 84.7,
    cols: 2,
    rows: 3,
    marginTop: 12.7,
    marginLeft: 4,
    spacingX: 5.2,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-6085",
    name: "Pimaco 6085/6185/6285",
    paperSize: letter,
    labelWidth: 215.9,
    labelHeight: 279.4,
    cols: 1,
    rows: 1,
    marginTop: 0,
    marginLeft: 0,
    spacingX: 0,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-6086",
    name: "Pimaco 6086/6286",
    paperSize: letter,
    labelWidth: 212.7,
    labelHeight: 138.1,
    cols: 1,
    rows: 2,
    marginTop: 1.6,
    marginLeft: 1.6,
    spacingX: 0,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-6087",
    name: "Pimaco 6087/6187/6287",
    paperSize: letter,
    labelWidth: 44.4,
    labelHeight: 12.7,
    cols: 4,
    rows: 20,
    marginTop: 12.7,
    marginLeft: 14.5,
    spacingX: 3.1,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-6088",
    name: "Pimaco 6088/6288",
    paperSize: letter,
    labelWidth: 106.4,
    labelHeight: 138.1,
    cols: 2,
    rows: 2,
    marginTop: 1.6,
    marginLeft: 1.6,
    spacingX: 0,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-6089",
    name: "Pimaco 6089",
    paperSize: letter,
    labelWidth: 44.4,
    labelHeight: 16.9,
    cols: 4,
    rows: 15,
    marginTop: 12.7,
    marginLeft: 14.5,
    spacingX: 3.1,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-6092",
    name: "Pimaco 6092",
    paperSize: letter,
    labelWidth: 17,
    labelHeight: 17,
    cols: 7,
    rows: 9,
    marginTop: 16.9,
    marginLeft: 13,
    spacingX: 12.1,
    spacingY: 11.9,
  }),
  makePreset({
    id: "pimaco-6093",
    name: "Pimaco 6093/6293",
    paperSize: letter,
    labelWidth: 31,
    labelHeight: 27.4,
    cols: 4,
    rows: 6,
    marginTop: 15.1,
    marginLeft: 14.5,
    spacingX: 21,
    spacingY: 16.7,
  }),
  makePreset({
    id: "pimaco-6094",
    name: "Pimaco 6094",
    paperSize: letter,
    labelWidth: 43.5,
    labelHeight: 48.5,
    cols: 3,
    rows: 4,
    marginTop: 16.7,
    marginLeft: 19,
    spacingX: 24,
    spacingY: 17.5,
  }),
  makePreset({
    id: "pimaco-6095",
    name: "Pimaco 6095",
    paperSize: letter,
    labelWidth: 85.7,
    labelHeight: 59.3,
    cols: 2,
    rows: 4,
    marginTop: 21.2,
    marginLeft: 17,
    spacingX: 10.6,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-7088",
    name: "Pimaco 7088/7188/7089",
    paperSize: letter,
    labelWidth: 88.9,
    labelHeight: 50.8,
    cols: 2,
    rows: 5,
    marginTop: 12.7,
    marginLeft: 19,
    spacingX: 0,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-8096",
    name: "Pimaco 8096/8196/8296",
    paperSize: letter,
    labelWidth: 69.8,
    labelHeight: 69.8,
    cols: 3,
    rows: 3,
    marginTop: 12.7,
    marginLeft: 3.2,
    spacingX: 0,
    spacingY: 6.4,
  }),
  makePreset({
    id: "pimaco-8098",
    name: "Pimaco 8098",
    paperSize: letter,
    labelWidth: 88.9,
    labelHeight: 42.3,
    cols: 2,
    rows: 6,
    marginTop: 12.7,
    marginLeft: 12.7,
    spacingX: 12.7,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-8099f",
    name: "Pimaco 8099F",
    paperSize: letter,
    labelWidth: 77.8,
    labelHeight: 46.6,
    cols: 2,
    rows: 5,
    marginTop: 23.3,
    marginLeft: 27.2,
    spacingX: 6,
    spacingY: 0,
  }),
  makePreset({
    id: "pimaco-8099l",
    name: "Pimaco 8099L",
    paperSize: letter,
    labelWidth: 147.6,
    labelHeight: 16.9,
    cols: 1,
    rows: 15,
    marginTop: 12.7,
    marginLeft: 34.1,
    spacingX: 0,
    spacingY: 0,
  }),
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
  paperSize?: PaperSize
}): LabelPreset {
  const paperSize = params.paperSize ?? "a4"
  return {
    id: "custom",
    name: "Customizado",
    description: `${fmt(params.labelWidth)} × ${fmt(params.labelHeight)} mm · ${params.cols} × ${params.rows} (${PAPER_SIZES[paperSize].shortLabel})`,
    ...params,
    paperSize,
  }
}
