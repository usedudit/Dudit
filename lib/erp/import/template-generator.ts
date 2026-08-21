import "server-only"
import ExcelJS from "exceljs"
import { getFieldsForEntity } from "./field-registry"
import type { EntityType, FieldDef } from "./types"

const ENTITY_SHEET_NAMES: Record<EntityType, string> = {
  products: "Produtos",
  customers: "Clientes",
  services: "Serviços",
}

const ENTITY_SAMPLE_ROWS: Record<EntityType, Record<string, any>[]> = {
  products: [
    {
      name: "Camiseta Algodão Básica Preta M",
      sku: "CAM-BAS-BLK-M",
      gtin: "7891234567890",
      price: 49.90,
      cost_price: 22.00,
      promotional_price: 39.90,
      stock_quantity: 50,
      min_stock: 10,
      unit: "UN",
      category: "Vestuário",
      subcategory: "Camisetas",
      brand: "Dudit Wear",
      supplier: "Distribuidora Têxtil Ltda",
      status: "Ativo",
      show_in_marketplace: "Sim",
      description: "Camiseta unissex 100% algodão, corte clássico e costura reforçada.",
      product_type: "Físico",
      condition: "Novo",
      ncm: "61091000",
      cest: "2803800",
      origin: "0 - Nacional",
      weight_gross: 200,
      weight_net: 180,
      width: 20,
      height: 4,
      length: 28,
      packaging_type: "Pacote/Caixa",
      preparation_days: 1,
      tags: "camiseta, algodão, basica, moda",
    },
    {
      name: "Tênis Esportivo Running Pro 41",
      sku: "TEN-RUN-PRO-41",
      gtin: "7899876543210",
      price: 299.90,
      cost_price: 140.00,
      promotional_price: "",
      stock_quantity: 15,
      min_stock: 3,
      unit: "PAR",
      category: "Calçados",
      subcategory: "Tênis",
      brand: "Sprint Runner",
      supplier: "Importadora Brasil",
      status: "Ativo",
      show_in_marketplace: "Sim",
      description: "Tênis com amortecimento em gel, ideal para corridas e treinos diários.",
      product_type: "Físico",
      condition: "Novo",
      ncm: "64041100",
      cest: "2805900",
      origin: "0 - Nacional",
      weight_gross: 850,
      weight_net: 750,
      width: 24,
      height: 12,
      length: 34,
      packaging_type: "Pacote/Caixa",
      preparation_days: 1,
      tags: "tenis, corrida, esporte, running",
    },
  ],
  customers: [
    {
      name: "Maria da Silva Santos",
      person_type: "Física",
      cpf: "123.456.789-00",
      cnpj: "",
      email: "maria.santos@email.com",
      phone: "(11) 98765-4321",
      phone_fixed: "(11) 3456-7890",
      birth_date: "15/04/1990",
      status: "Ativo",
      zip_code: "01310-100",
      street: "Avenida Paulista",
      number: "1578",
      complement: "Apto 42",
      neighborhood: "Bela Vista",
      city: "São Paulo",
      state: "SP",
      inscricao_estadual: "",
      notes: "Cliente VIP, prefere contato por WhatsApp à tarde.",
    },
    {
      name: "Tecnologia e Inovação Brasil Ltda",
      person_type: "Jurídica",
      cpf: "",
      cnpj: "12.345.678/0001-90",
      email: "contato@tecnoinovacao.com.br",
      phone: "(21) 99876-5432",
      phone_fixed: "(21) 2233-4455",
      birth_date: "",
      status: "Ativo",
      zip_code: "20040-002",
      street: "Avenida Rio Branco",
      number: "100",
      complement: "Sala 1205",
      neighborhood: "Centro",
      city: "Rio de Janeiro",
      state: "RJ",
      inscricao_estadual: "12.345.678",
      notes: "Faturamento mensal via boleto 30 dias.",
    },
  ],
  services: [
    {
      name: "Formatação e Instalação de Sistema Operacional",
      sku: "SERV-FOR-001",
      price: 150.00,
      cost_price: 30.00,
      duration_minutes: 90,
      category: "Informática & Suporte",
      service_type: "Presencial",
      status: "Ativo",
      unit: "Serviço",
      description: "Backup de arquivos, formatação completa, instalação de SO e pacotes essenciais.",
    },
    {
      name: "Consultoria de Marketing Digital (Hora)",
      sku: "SERV-MKT-HORA",
      price: 200.00,
      cost_price: 0.00,
      duration_minutes: 60,
      category: "Consultoria",
      service_type: "Online",
      status: "Ativo",
      unit: "Hora",
      description: "Análise de campanhas de tráfego pago, funil de vendas e posicionamento de marca.",
    },
  ],
}

/**
 * Escapes formulas to prevent CSV/Excel formula injection vulnerabilities
 */
function sanitizeCellValue(val: any): any {
  if (typeof val === "string") {
    if (val.startsWith("=") || val.startsWith("+") || val.startsWith("-") || val.startsWith("@")) {
      return `'${val}`
    }
  }
  return val
}

export async function generateImportTemplate(
  entityType: EntityType,
): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  const fields = getFieldsForEntity(entityType)
  const sheetName = ENTITY_SHEET_NAMES[entityType] || "Modelo"
  const sampleRows = ENTITY_SAMPLE_ROWS[entityType] || []

  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Dudit ERP"
  workbook.created = new Date()
  workbook.properties.date1904 = false

  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  })

  // Define Columns
  worksheet.columns = fields.map((field) => ({
    header: `${field.label}${field.required ? " *" : ""}`,
    key: field.name,
    width: Math.max(field.label.length + 6, field.example ? String(field.example).length + 4 : 18),
  }))

  // Style Header Row (1)
  const headerRow = worksheet.getRow(1)
  headerRow.height = 28
  headerRow.eachCell((cell, colNumber) => {
    const field = fields[colNumber - 1]
    cell.font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
      size: 11,
      name: "Segoe UI",
    }
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: field.required ? "FF1E824C" : "FF2C3E50" },
    }
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: false,
    }
    cell.border = {
      top: { style: "thin", color: { argb: "FF115E30" } },
      bottom: { style: "medium", color: { argb: "FF0E4724" } },
      left: { style: "thin", color: { argb: "FF115E30" } },
      right: { style: "thin", color: { argb: "FF115E30" } },
    }
  })

  // Insert Sample Rows
  for (const sample of sampleRows) {
    const rowValues: Record<string, any> = {}
    for (const field of fields) {
      rowValues[field.name] = sanitizeCellValue(sample[field.name] ?? "")
    }
    const addedRow = worksheet.addRow(rowValues)
    addedRow.height = 22
    addedRow.eachCell((cell) => {
      cell.font = { size: 10, name: "Segoe UI", color: { argb: "FF333333" } }
      cell.alignment = { vertical: "middle" }
      cell.border = {
        top: { style: "thin", color: { argb: "FFE0E0E0" } },
        bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
        left: { style: "thin", color: { argb: "FFE0E0E0" } },
        right: { style: "thin", color: { argb: "FFE0E0E0" } },
      }
    })
  }

  // Configure Data Validation dropdowns for enum fields on the first 500 rows
  fields.forEach((field, colIdx) => {
    if (field.options && field.options.length > 0) {
      const colLetter = String.fromCharCode(65 + colIdx)
      const optionsList = `"${field.options.join(",")}"`

      for (let r = 2; r <= 500; r++) {
        const cell = worksheet.getCell(`${colLetter}${r}`)
        cell.dataValidation = {
          type: "list",
          allowBlank: !field.required,
          formulae: [optionsList],
          showErrorMessage: true,
          errorTitle: "Valor inválido",
          error: `Selecione um dos valores permitidos: ${field.options.join(", ")}`,
        }
      }
    }
  })

  // Add an Instructions Worksheet
  const guideSheet = workbook.addWorksheet("Instruções e Dicas", {
    views: [{ state: "frozen", ySplit: 1 }],
  })
  guideSheet.columns = [
    { header: "Campo", key: "field", width: 25 },
    { header: "Obrigatório", key: "required", width: 14 },
    { header: "Tipo / Formato", key: "type", width: 22 },
    { header: "Exemplo", key: "example", width: 30 },
    { header: "Descrição & Orientações", key: "description", width: 55 },
  ]

  const guideHeader = guideSheet.getRow(1)
  guideHeader.height = 26
  guideHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Segoe UI" }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2C3E50" } }
    cell.alignment = { horizontal: "center", vertical: "middle" }
  })

  for (const field of fields) {
    const row = guideSheet.addRow({
      field: field.label,
      required: field.required ? "Sim (*)" : "Não",
      type: field.options ? `Opções: ${field.options.slice(0, 3).join(", ")}...` : field.type.toUpperCase(),
      example: field.example || "-",
      description: field.description || "-",
    })
    row.height = 20
    row.eachCell((cell, colNumber) => {
      cell.font = { size: 10, name: "Segoe UI" }
      cell.alignment = { vertical: "middle", horizontal: colNumber === 2 ? "center" : "left" }
      cell.border = {
        top: { style: "thin", color: { argb: "FFE0E0E0" } },
        bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
        left: { style: "thin", color: { argb: "FFE0E0E0" } },
        right: { style: "thin", color: { argb: "FFE0E0E0" } },
      }
      if (colNumber === 2 && field.required) {
        cell.font = { bold: true, color: { argb: "FFC0392B" } }
      }
    })
  }

  const raw = (await workbook.xlsx.writeBuffer()) as ArrayBuffer
  const buffer = Buffer.from(raw)
  const filename = `modelo-importacao-${entityType}.xlsx`

  return {
    buffer,
    filename,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }
}
