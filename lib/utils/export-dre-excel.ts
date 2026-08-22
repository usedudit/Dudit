"use client"

import type { DreReportData, DreRegime } from "@/lib/services/dre.service"

export interface ExportDreExcelParams {
  report: DreReportData
  regime: DreRegime
  startDate: string
  endDate: string
  storeName: string
}

function translateNodeType(type: "income" | "expense" | "subtotal" | "result" | "item"): string {
  switch (type) {
    case "income":
      return "Receita"
    case "expense":
      return "Despesa / Custo"
    case "subtotal":
      return "Subtotal"
    case "result":
      return "Resultado Líquido"
    case "item":
      return "Item Detalhado"
    default:
      return type
  }
}

export async function exportDreToXLSX({
  report,
  regime,
  startDate,
  endDate,
  storeName,
}: ExportDreExcelParams) {
  const ExcelJS = await import("exceljs")
  const workbook = new ExcelJS.default.Workbook()
  workbook.creator = "Dudit ERP"
  workbook.created = new Date()

  const sheet = workbook.addWorksheet("DRE Contábil", {
    views: [{ showGridLines: true }],
  })

  // ── 1. Largura das Colunas (Formatadas para visualização perfeita no Excel) ──
  sheet.columns = [
    { key: "conta", width: 56 },
    { key: "tipo", width: 18 },
    { key: "atual", width: 22 },
    { key: "av", width: 24 },
    { key: "anterior", width: 22 },
    { key: "ah", width: 26 },
  ]

  // ── 2. Cabeçalho Institucional ─────────────────────────────────────────────
  // Linha 1: Título Principal
  sheet.mergeCells("A1:F1")
  const titleCell = sheet.getCell("A1")
  titleCell.value = "RELATÓRIO DE DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO (DRE)"
  titleCell.font = { bold: true, size: 13, color: { argb: "FF1E824C" } }
  titleCell.alignment = { vertical: "middle", horizontal: "left" }
  sheet.getRow(1).height = 24

  // Linha 2: Empresa e CNPJ
  const row2 = sheet.addRow([
    "Empresa:",
    report.companyInfo?.partnerName || "Empresa Parceira",
    "CNPJ:",
    report.companyInfo?.documentNumber || "—",
  ])
  row2.height = 18
  sheet.getCell("A2").font = { bold: true, size: 10, color: { argb: "FF344054" } }
  sheet.getCell("B2").font = { size: 10, color: { argb: "FF1D2939" } }
  sheet.getCell("C2").font = { bold: true, size: 10, color: { argb: "FF344054" } }
  sheet.getCell("D2").font = { size: 10, color: { argb: "FF1D2939" } }

  // Linha 3: Unidade e Regime
  const row3 = sheet.addRow([
    "Unidade:",
    storeName,
    "Regime:",
    regime === "competencia" ? "Competência" : "Caixa",
  ])
  row3.height = 18
  sheet.getCell("A3").font = { bold: true, size: 10, color: { argb: "FF344054" } }
  sheet.getCell("B3").font = { size: 10, color: { argb: "FF1D2939" } }
  sheet.getCell("C3").font = { bold: true, size: 10, color: { argb: "FF344054" } }
  sheet.getCell("D3").font = { size: 10, color: { argb: "FF1D2939" } }

  // Linha 4: Período e Data de Geração
  const row4 = sheet.addRow([
    "Período:",
    `${startDate} até ${endDate}`,
    "Gerado em:",
    report.companyInfo?.generatedAt || new Date().toLocaleString("pt-BR"),
  ])
  row4.height = 18
  sheet.getCell("A4").font = { bold: true, size: 10, color: { argb: "FF344054" } }
  sheet.getCell("B4").font = { size: 10, color: { argb: "FF1D2939" } }
  sheet.getCell("C4").font = { bold: true, size: 10, color: { argb: "FF344054" } }
  sheet.getCell("D4").font = { size: 10, color: { argb: "FF1D2939" } }

  // Linha 5: Espaço em branco
  sheet.addRow([])
  sheet.getRow(5).height = 12

  // ── 3. Cabeçalho da Tabela (Linha 6) ───────────────────────────────────────
  const headerRow = sheet.addRow([
    "Estrutura / Conta Contábil",
    "Tipo",
    "Período Atual (R$)",
    "Análise Vertical (AV %)",
    "Período Anterior (R$)",
    "Variação Horizontal (AH %)",
  ])
  headerRow.height = 24

  headerRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10.5 }
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E824C" }, // Verde oficial do Dudit
    }
    cell.alignment = {
      vertical: "middle",
      horizontal: colNumber === 1 ? "left" : colNumber === 2 ? "center" : "right",
    }
    cell.border = {
      top: { style: "thin", color: { argb: "FF1E824C" } },
      bottom: { style: "medium", color: { argb: "FF166534" } },
    }
  })

  // ── 4. Linhas de Dados e Subitens ──────────────────────────────────────────
  Object.values(report.structure).forEach((node) => {
    const isResult = node.type === "result"
    const isSubtotal = node.type === "subtotal"

    const dataRow = sheet.addRow([
      node.title,
      translateNodeType(node.type),
      node.amount,
      node.verticalPercent / 100,
      node.previousAmount ?? 0,
      (node.horizontalVariation ?? 0) / 100,
    ])
    dataRow.height = isResult ? 24 : isSubtotal ? 22 : 20

    // Formatação das células do nó principal
    dataRow.eachCell((cell, colNumber) => {
      // Alinhamento
      cell.alignment = {
        vertical: "middle",
        horizontal: colNumber === 1 ? "left" : colNumber === 2 ? "center" : "right",
      }

      // Formatação numérica
      if (colNumber === 3 || colNumber === 5) {
        cell.numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00;"R$ 0,00"'
      } else if (colNumber === 4) {
        cell.numFmt = "0.00%"
      } else if (colNumber === 6) {
        cell.numFmt = "+0.00%;-0.00%;0.00%"
      }

      // Estilo por tipo de linha
      if (isResult) {
        cell.font = { bold: true, size: 11, color: { argb: "FF1E824C" } }
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE8F5E9" }, // Fundo verde claro de resultado
        }
        cell.border = {
          top: { style: "thin", color: { argb: "FF1E824C" } },
          bottom: { style: "double", color: { argb: "FF1E824C" } },
        }
      } else if (isSubtotal) {
        cell.font = { bold: true, size: 10, color: { argb: "FF1D2939" } }
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF2F4F7" }, // Fundo cinza suave de subtotal
        }
        cell.border = {
          top: { style: "thin", color: { argb: "FFD0D5DD" } },
          bottom: { style: "thin", color: { argb: "FFD0D5DD" } },
        }
      } else {
        cell.font = { bold: true, size: 10, color: { argb: "FF344054" } }
        cell.border = {
          bottom: { style: "thin", color: { argb: "FFE4E7EC" } },
        }
      }
    })

    // Subitens detalhados
    if (node.items && node.items.length > 0) {
      node.items.forEach((item) => {
        const itemRow = sheet.addRow([
          `    • ${item.name}`,
          translateNodeType("item"),
          item.amount,
          item.verticalPercent / 100,
          item.previousAmount ?? 0,
          (item.horizontalVariation ?? 0) / 100,
        ])
        itemRow.height = 18

        itemRow.eachCell((cell, colNumber) => {
          cell.alignment = {
            vertical: "middle",
            horizontal: colNumber === 1 ? "left" : colNumber === 2 ? "center" : "right",
          }
          cell.font = { size: 9.5, color: { argb: "FF475467" } }

          if (colNumber === 3 || colNumber === 5) {
            cell.numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00;"R$ 0,00"'
          } else if (colNumber === 4) {
            cell.numFmt = "0.00%"
          } else if (colNumber === 6) {
            cell.numFmt = "+0.00%;-0.00%;0.00%"
          }

          cell.border = {
            bottom: { style: "hair", color: { argb: "FFF2F4F7" } },
          }
        })
      })
    }
  })

  // ── 5. Download do Arquivo XLSX ───────────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `DRE_${startDate}_a_${endDate}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

export function exportDreToCSV({
  report,
  regime,
  startDate,
  endDate,
  storeName,
}: ExportDreExcelParams) {
  let csv = `RELATÓRIO DE DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO (DRE)\n`
  csv += `Empresa:;${report.companyInfo?.partnerName || ""};CNPJ:;${report.companyInfo?.documentNumber || ""}\n`
  csv += `Unidade:;${storeName};Regime:;${regime === "competencia" ? "Competência" : "Caixa"}\n`
  csv += `Período:;${startDate} até ${endDate};Gerado em:;${report.companyInfo?.generatedAt || ""}\n\n`
  csv += "Estrutura / Conta Contábil;Tipo;Período Atual (R$);Análise Vertical (AV %);Período Anterior (R$);Variação Horizontal (AH %)\n"

  Object.values(report.structure).forEach((node) => {
    csv += `"${node.title}";"${translateNodeType(node.type)}";"${node.amount.toFixed(2).replace(".", ",")}";"${node.verticalPercent.toFixed(2).replace(".", ",")}%";"${(node.previousAmount ?? 0).toFixed(2).replace(".", ",")}";"${(node.horizontalVariation ?? 0).toFixed(2).replace(".", ",")}%"\n`
    node.items.forEach((item) => {
      csv += `  "${item.name}";"${translateNodeType("item")}";"${item.amount.toFixed(2).replace(".", ",")}";"${item.verticalPercent.toFixed(2).replace(".", ",")}%";"${(item.previousAmount ?? 0).toFixed(2).replace(".", ",")}";"${(item.horizontalVariation ?? 0).toFixed(2).replace(".", ",")}%"\n`
    })
  })

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.setAttribute("href", url)
  link.setAttribute("download", `DRE_${startDate}_a_${endDate}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
