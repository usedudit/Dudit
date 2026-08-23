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
      name: "Camiseta Algodão Básica",
      sku: "CAM-BAS-001",
      gtin: "7891234567890",
      price: 49.90,
      cost_price: 22.00,
      promotional_price: 39.90,
      stock_quantity: 65,
      min_stock: 10,
      unit: "UN",
      brand: "Dudit Wear",
      variant_type: "Tamanho",
      variants: "P (Estoque: 15, Preço: 49.90); M (Estoque: 30, Preço: 49.90); G (Estoque: 20, Preço: 49.90)",
      status: "Ativo",
      show_in_marketplace: "Sim",
      description: "Camiseta unissex 100% algodão, corte clássico e costura reforçada.",
      product_type: "Físico",
      condition: "Novo",
      ncm: "61091000",
      cest: "2803800",
      weight_gross: 200,
      weight_net: 180,
      width: 20,
      height: 4,
      length: 28,
    },
    {
      name: "Tênis Esportivo Running Pro",
      sku: "TEN-RUN-PRO",
      gtin: "7899876543210",
      price: 299.90,
      cost_price: 140.00,
      promotional_price: "",
      stock_quantity: 15,
      min_stock: 3,
      unit: "PAR",
      brand: "Sprint Runner",
      variant_type: "Cor / Tamanho",
      variants: "Preto / 40 (Estoque: 5); Preto / 41 (Estoque: 5); Azul / 41 (Estoque: 5)",
      status: "Ativo",
      show_in_marketplace: "Sim",
      description: "Tênis com amortecimento em gel, ideal para corridas e treinos diários.",
      product_type: "Físico",
      condition: "Novo",
      ncm: "64041100",
      cest: "2805900",
      weight_gross: 850,
      weight_net: 750,
      width: 24,
      height: 12,
      length: 34,
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
    const isReq = !!field.required
    cell.font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
      size: 11,
      name: "Segoe UI",
    }
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: isReq ? "FFEA580C" : "FF059669" }, // Brand Orange (obrigatórios) e Brand Green (demais)
    }
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: false,
    }
    cell.border = {
      top: { style: "thin", color: { argb: isReq ? "FFC2410C" : "FF047857" } },
      bottom: { style: "medium", color: { argb: isReq ? "FF9A3412" : "FF065F46" } },
      left: { style: "thin", color: { argb: isReq ? "FFC2410C" : "FF047857" } },
      right: { style: "thin", color: { argb: isReq ? "FFC2410C" : "FF047857" } },
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

  // Configure Data Validation dropdowns for enum fields on the first 100 rows
  fields.forEach((field, colIdx) => {
    if (field.options && field.options.length > 0) {
      const optionsList = `"${field.options.join(",")}"`
      const colNumber = colIdx + 1

      for (let r = 2; r <= 100; r++) {
        const row = worksheet.getRow(r)
        const cell = row.getCell(colNumber)
        cell.dataValidation = {
          type: "list",
          allowBlank: !field.required,
          formulae: [optionsList],
          showErrorMessage: true,
          errorTitle: "Valor inválido",
          error: `Selecione: ${field.options.slice(0, 5).join(", ")}`,
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
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } } // Brand Green
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
        cell.font = { bold: true, color: { argb: "FFEA580C" } } // Brand Orange text para obrigatórios
      }
    })
  }

  const raw = (await workbook.xlsx.writeBuffer()) as ArrayBuffer
  const buffer = Buffer.from(raw)
  const entitySlug = entityType === "products" ? "produtos" : entityType === "services" ? "servicos" : "clientes"
  const filename = `modelo-importacao-${entitySlug}.xlsx`

  return {
    buffer,
    filename,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }
}
