import { describe, it, expect, vi } from "vitest"
import { parseTime, validateRow } from "./validators"
import { detectEntity } from "./entity-detector"
import { getFieldsForEntity, getRequiredFields, getFieldByName } from "./field-registry"
import { suggestMapping } from "./mapper"
import { generateImportTemplate } from "./template-generator"

// Mock server-only
vi.mock("server-only", () => ({}))

describe("Appointment Import Engine", () => {
  describe("parseTime helper", () => {
    it("parses standard HH:MM formats", () => {
      expect(parseTime("14:30")).toBe("14:30")
      expect(parseTime("09:00")).toBe("09:00")
      expect(parseTime("9:05")).toBe("09:05")
    })

    it("parses HH:MM:SS formats", () => {
      expect(parseTime("14:30:00")).toBe("14:30")
      expect(parseTime("08:15:45")).toBe("08:15")
    })

    it("parses Brazilian informal time formats", () => {
      expect(parseTime("14h30")).toBe("14:30")
      expect(parseTime("9h")).toBe("09:00")
      expect(parseTime("18H")).toBe("18:00")
      expect(parseTime("15h00")).toBe("15:00")
    })

    it("parses 12-hour AM/PM formats", () => {
      expect(parseTime("2:30 PM")).toBe("14:30")
      expect(parseTime("09:15 AM")).toBe("09:15")
      expect(parseTime("12:00 PM")).toBe("12:00")
      expect(parseTime("12:00 AM")).toBe("00:00")
    })

    it("parses Excel fractional day serial numbers", () => {
      expect(parseTime(0.5)).toBe("12:00")
      expect(parseTime(0.75)).toBe("18:00")
      expect(parseTime("0.5")).toBe("12:00")
    })

    it("returns null on invalid inputs", () => {
      expect(parseTime("")).toBeNull()
      expect(parseTime("invalid")).toBeNull()
      expect(parseTime("25:99")).toBeNull()
    })
  })

  describe("Entity Detector for appointments", () => {
    it("detects appointments from typical headers", () => {
      const headers = ["Cliente", "Serviço", "Data Agendamento", "Hora Início", "Hora Término", "Profissional", "Valor"]
      expect(detectEntity(headers)).toBe("appointments")
    })

    it("detects appointments from salon/clinic software exports (e.g. Trinks, Avec, Fresha)", () => {
      const headers = ["Nome do Cliente", "Procedimento", "Data", "Horário", "Colaborador", "Preço Cobrado"]
      expect(detectEntity(headers)).toBe("appointments")
    })
  })

  describe("Field Registry for appointments", () => {
    it("returns registered fields for appointments", () => {
      const fields = getFieldsForEntity("appointments")
      expect(fields.length).toBeGreaterThan(5)

      const names = fields.map((f) => f.name)
      expect(names).toContain("customer_name")
      expect(names).toContain("service_name")
      expect(names).toContain("start_date")
      expect(names).toContain("start_time")
      expect(names).toContain("end_time")
      expect(names).toContain("duration_minutes")
      expect(names).toContain("staff_name")
      expect(names).toContain("price")
      expect(names).toContain("status")
    })

    it("identifies required fields correctly", () => {
      const required = getRequiredFields("appointments")
      expect(required).toContain("customer_name")
      expect(required).toContain("service_name")
      expect(required).toContain("start_date")
      expect(required).toContain("start_time")
    })

    it("matches synonyms across platforms using mapper", () => {
      const mappings = suggestMapping(["Colaborador", "Paciente"], "appointments")
      const staffMap = mappings.find((m) => m.header === "Colaborador")
      const clientMap = mappings.find((m) => m.header === "Paciente")

      expect(staffMap?.field).toBe("staff_name")
      expect(clientMap?.field).toBe("customer_name")
    })
  })

  describe("Row Validator for appointments", () => {
    it("validates a complete valid appointment row", () => {
      const row = {
        customer_name: "Mariana Silva",
        service_name: "Corte e Escova",
        start_date: "2026-08-28",
        start_time: "14:30",
        end_time: "15:30",
        duration_minutes: "60",
        staff_name: "Ana Paula",
        price: "120.00",
        status: "Confirmado",
      }
      const result = validateRow(row, 1, "appointments")
      expect(result.errors).toHaveLength(0)
    })

    it("fails when required fields are missing or invalid", () => {
      const row = {
        customer_name: "",
        service_name: "",
        start_date: "invalid-date",
        start_time: "invalid-time",
      }
      const result = validateRow(row, 2, "appointments")
      expect(result.errors.length).toBeGreaterThanOrEqual(4)
    })
  })

  describe("Template Generator", () => {
    it("generates an .xlsx template with Agendamentos sheet and sample rows", async () => {
      const result = await generateImportTemplate("appointments")
      expect(result).toBeDefined()
      expect(result.buffer).toBeDefined()
      expect(result.buffer.length).toBeGreaterThan(0)
      expect(result.filename).toBe("modelo-importacao-agendamentos.xlsx")
    })
  })
})
