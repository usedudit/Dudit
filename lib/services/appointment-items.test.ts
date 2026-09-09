import { describe, it, expect } from "vitest"
import { resolveResourcesFromServices } from "@/components/erp/appointments/sheets/AppointmentItemsStep"

describe("Appointment Items & Stock Control", () => {
    it("correctly marks manual resources as manual without stock control", () => {
        const services = [
            {
                id: "svc-1",
                name: "Corte de Cabelo",
                resources: [
                    {
                        name: "Toalha descartável",
                        quantity: 1,
                        usage_type: "consumed",
                        isManual: true,
                    },
                    {
                        name: "Capa de corte",
                        quantity: 1,
                        usage_type: "returnable",
                        isManual: true,
                    }
                ]
            }
        ]

        const items = resolveResourcesFromServices(services)

        expect(items).toHaveLength(2)
        expect(items[0]).toMatchObject({
            name: "Toalha descartável",
            productId: null,
            variantId: null,
            serviceId: "svc-1",
            quantity: 1,
            usageType: "consumed",
            isManual: true,
            stock: undefined,
        })
        expect(items[1]).toMatchObject({
            name: "Capa de corte",
            productId: null,
            variantId: null,
            serviceId: "svc-1",
            quantity: 1,
            usageType: "returnable",
            isManual: true,
            stock: undefined,
        })
    })

    it("correctly preserves product_id and variants for catalog product resources", () => {
        const services = [
            {
                id: "svc-2",
                name: "Coloração",
                resources: [
                    {
                        product_id: "prod-100",
                        variant_id: "var-200",
                        name: "Tintura Castanho Escuro",
                        quantity: 2,
                        usage_type: "consumed",
                        isManual: false,
                        stock: 15,
                    },
                    {
                        name: "Pincel Manual",
                        quantity: 1,
                        usage_type: "consumed",
                        isManual: true,
                    }
                ]
            }
        ]

        const items = resolveResourcesFromServices(services)

        expect(items).toHaveLength(2)

        const productItem = items.find(i => i.productId === "prod-100")
        expect(productItem).toBeDefined()
        expect(productItem?.isManual).toBe(false)
        expect(productItem?.variantId).toBe("var-200")
        expect(productItem?.stock).toBe(15)

        const manualItem = items.find(i => i.name === "Pincel Manual")
        expect(manualItem).toBeDefined()
        expect(manualItem?.isManual).toBe(true)
        expect(manualItem?.productId).toBeNull()
        expect(manualItem?.stock).toBeUndefined()
    })

    it("aggregates quantities when multiple services share the same resource", () => {
        const services = [
            {
                id: "svc-1",
                name: "Lavagem",
                resources: [
                    {
                        product_id: "prod-shampoo",
                        name: "Shampoo Profissional",
                        quantity: 1,
                        usage_type: "consumed",
                    }
                ]
            },
            {
                id: "svc-2",
                name: "Hidratação",
                resources: [
                    {
                        product_id: "prod-shampoo",
                        name: "Shampoo Profissional",
                        quantity: 1,
                        usage_type: "consumed",
                    }
                ]
            }
        ]

        const items = resolveResourcesFromServices(services)

        expect(items).toHaveLength(1)
        expect(items[0].name).toBe("Shampoo Profissional")
        expect(items[0].quantity).toBe(2)
        expect(items[0].productId).toBe("prod-shampoo")
    })

    it("returns empty items when service has no resources configured (e.g. Troca de Óleo)", () => {
        const services = [
            {
                id: "svc-oil-change",
                name: "Troca de Óleo",
                resources: []
            }
        ]

        const items = resolveResourcesFromServices(services)
        expect(items).toHaveLength(0)
    })

    it("only includes resources from services that have them, ignoring services without resources", () => {
        const services = [
            {
                id: "svc-oil-change",
                name: "Troca de Óleo",
                resources: []
            },
            {
                id: "svc-alignment",
                name: "Alinhamento",
                resources: [
                    {
                        product_id: "prod-peso",
                        name: "Chumbo de Balanceamento",
                        quantity: 4,
                        usage_type: "consumed",
                    }
                ]
            }
        ]

        const items = resolveResourcesFromServices(services)
        expect(items).toHaveLength(1)
        expect(items[0].name).toBe("Chumbo de Balanceamento")
        expect(items[0].quantity).toBe(4)
        expect(items[0].productId).toBe("prod-peso")
        // Troca de Óleo must NEVER be added as an item
        expect(items.some(i => i.name === "Troca de Óleo")).toBe(false)
    })
})

