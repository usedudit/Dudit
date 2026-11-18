import { describe, it, expect } from "vitest"
import {
  SERVICE_ORDER_STATUS_META,
  SERVICE_ORDER_STATUS_ORDER,
  SERVICE_ORDER_ALLOWED_TRANSITIONS,
  isServiceOrderStatus,
  isValidServiceOrderTransition,
  getServiceOrderNextStatuses,
  getServiceOrderEditPolicy,
  isServiceOrderBackwardTransition,
  type ServiceOrderStatus,
} from "@/lib/types/service-order"

const ALL_STATUSES = Object.keys(SERVICE_ORDER_STATUS_META) as ServiceOrderStatus[]

describe("service-order status helpers", () => {
  describe("isServiceOrderStatus", () => {
    it("accepts every known status", () => {
      for (const status of ALL_STATUSES) {
        expect(isServiceOrderStatus(status)).toBe(true)
      }
    })

    it("rejects unknown or non-string values", () => {
      expect(isServiceOrderStatus("finalizada")).toBe(false)
      expect(isServiceOrderStatus("")).toBe(false)
      expect(isServiceOrderStatus(null)).toBe(false)
      expect(isServiceOrderStatus(undefined)).toBe(false)
      expect(isServiceOrderStatus(1)).toBe(false)
      expect(isServiceOrderStatus({})).toBe(false)
    })
  })

  describe("transitions", () => {
    it("never allows a transition to the same status", () => {
      for (const status of ALL_STATUSES) {
        expect(isValidServiceOrderTransition(status, status)).toBe(false)
      }
    })

    it("allows documented transitions", () => {
      expect(isValidServiceOrderTransition("aberta", "aprovada")).toBe(true)
      expect(isValidServiceOrderTransition("aguardando_aprovacao", "aprovada")).toBe(true)
      expect(isValidServiceOrderTransition("aprovada", "em_andamento")).toBe(true)
      expect(isValidServiceOrderTransition("em_andamento", "concluida")).toBe(true)
      expect(isValidServiceOrderTransition("concluida", "entregue")).toBe(true)
      expect(isValidServiceOrderTransition("aberta", "cancelada")).toBe(true)
    })

    it("blocks disallowed transitions", () => {
      expect(isValidServiceOrderTransition("entregue", "em_andamento")).toBe(false)
      expect(isValidServiceOrderTransition("cancelada", "aberta")).toBe(false)
      expect(isValidServiceOrderTransition("aguardando_aprovacao", "em_andamento")).toBe(false)
    })

    it("treats entregue and cancelada as terminal states", () => {
      expect(getServiceOrderNextStatuses("entregue")).toEqual([])
      expect(getServiceOrderNextStatuses("cancelada")).toEqual([])
      for (const status of ALL_STATUSES) {
        expect(isValidServiceOrderTransition("entregue", status)).toBe(false)
        expect(isValidServiceOrderTransition("cancelada", status)).toBe(false)
      }
    })

    it("only references known statuses in the transition map", () => {
      for (const [from, targets] of Object.entries(SERVICE_ORDER_ALLOWED_TRANSITIONS)) {
        expect(isServiceOrderStatus(from)).toBe(true)
        for (const to of targets) {
          expect(isServiceOrderStatus(to)).toBe(true)
          expect(isValidServiceOrderTransition(from as ServiceOrderStatus, to)).toBe(true)
        }
      }
    })

    it("getServiceOrderNextStatuses mirrors the transition map", () => {
      for (const status of ALL_STATUSES) {
        expect(getServiceOrderNextStatuses(status)).toEqual(
          SERVICE_ORDER_ALLOWED_TRANSITIONS[status],
        )
      }
    })
  })

  describe("backward transitions", () => {
    it("detects moves that go back in the canonical order", () => {
      expect(isServiceOrderBackwardTransition("em_andamento", "aprovada")).toBe(true)
      expect(isServiceOrderBackwardTransition("concluida", "em_andamento")).toBe(true)
      expect(isServiceOrderBackwardTransition("entregue", "aberta")).toBe(true)
    })

    it("does not flag forward transitions", () => {
      expect(isServiceOrderBackwardTransition("aberta", "aprovada")).toBe(false)
      expect(isServiceOrderBackwardTransition("aprovada", "em_andamento")).toBe(false)
      expect(isServiceOrderBackwardTransition("concluida", "entregue")).toBe(false)
    })

    it("returns false for cancelada or unknown statuses", () => {
      expect(isServiceOrderBackwardTransition("cancelada", "aberta")).toBe(false)
      expect(isServiceOrderBackwardTransition("aberta", "cancelada")).toBe(false)
      expect(isServiceOrderBackwardTransition("desconhecida" as ServiceOrderStatus, "aberta")).toBe(false)
    })
  })

  describe("canonical order", () => {
    it("contains the expected operational flow", () => {
      expect(SERVICE_ORDER_STATUS_ORDER).toEqual([
        "aberta",
        "aguardando_aprovacao",
        "aprovada",
        "em_andamento",
        "aguardando_peca",
        "concluida",
        "entregue",
      ])
    })

    it("lists every non-cancelled status exactly once", () => {
      const expected = ALL_STATUSES.filter((s) => s !== "cancelada")
      expect([...SERVICE_ORDER_STATUS_ORDER].sort()).toEqual([...expected].sort())
      expect(new Set(SERVICE_ORDER_STATUS_ORDER).size).toBe(SERVICE_ORDER_STATUS_ORDER.length)
    })
  })

  describe("edit policy", () => {
    it("allows full editing while open or awaiting approval", () => {
      for (const status of ["aberta", "aguardando_aprovacao"] as ServiceOrderStatus[]) {
        const policy = getServiceOrderEditPolicy(status)
        expect(policy.readOnly).toBe(false)
        expect(policy.canEditAll).toBe(true)
        expect(policy.canEditItems).toBe(true)
        expect(policy.canEditNotes).toBe(true)
        expect(policy.canAttach).toBe(true)
      }
    })

    it("allows item and scope editing once approved (for revisions)", () => {
      const policy = getServiceOrderEditPolicy("aprovada")
      expect(policy.readOnly).toBe(false)
      expect(policy.canEditAll).toBe(false)
      expect(policy.canEditItems).toBe(true)
      expect(policy.canEditAssignment).toBe(true)
      expect(policy.canChangeStatus).toBe(true)
      expect(policy.canEditSpecs).toBe(true)
      expect(policy.canEditNotes).toBe(true)
      expect(policy.canEditDiagnosis).toBe(true)
      expect(policy.canEditFinancial).toBe(true)
      expect(policy.canAttach).toBe(true)
    })

    it("allows item additions during execution", () => {
      for (const status of ["em_andamento", "aguardando_peca"] as ServiceOrderStatus[]) {
        const policy = getServiceOrderEditPolicy(status)
        expect(policy.canEditItems).toBe(true)
        expect(policy.canEditAll).toBe(false)
      }
    })

    it("locks terminal states except notes and attachments", () => {
      for (const status of ["concluida", "entregue", "cancelada"] as ServiceOrderStatus[]) {
        const policy = getServiceOrderEditPolicy(status)
        expect(policy.readOnly).toBe(true)
        expect(policy.canEditAll).toBe(false)
        expect(policy.canEditItems).toBe(false)
        expect(policy.canEditAssignment).toBe(false)
        expect(policy.canChangeStatus).toBe(false)
        expect(policy.canEditSpecs).toBe(false)
        expect(policy.canEditNotes).toBe(true)
        expect(policy.canAttach).toBe(true)
      }
    })
  })
})
