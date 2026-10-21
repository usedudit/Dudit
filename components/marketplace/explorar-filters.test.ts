import { describe, it, expect } from "vitest"
import {
    LOJA_SEM_CATEGORIA,
    OUTROS_CATEGORY,
    getItemDistanceKm,
    isItemUncategorized,
    itemMatchesCategory,
    matchesConditionFilter,
    matchesDeliveryFilter,
    matchesDistanceFilter,
    matchesPriceRange,
    matchesRatingFilter,
    matchesShippingFilter,
    mergeCategoryLists,
    parseFiltersFromParams,
    serializeFiltersToParams,
    type CategoryLists,
} from "./explorar-filters"

const LISTS: CategoryLists = {
    products: [
        { name: "Alimentação", icon_url: null },
        { name: "Casa", icon_url: null },
        { name: "Moda e Beleza", icon_url: null },
        { name: "Outros", icon_url: null },
    ],
    services: [
        { name: "Reformas e Manutenção", icon_url: null },
        { name: "Beleza e Estética", icon_url: null },
        { name: "Outros Serviços", icon_url: null },
    ],
    partners: [
        { name: "Alimentação", icon_url: null },
        { name: "Varejo", icon_url: null },
        { name: "Serviços", icon_url: null },
        { name: "Beleza e Estética", icon_url: null },
        { name: "Outros", icon_url: null },
    ],
}

describe("categorias", () => {
    it("reconhece item sem categoria (vitrine sem categoria cadastrada)", () => {
        const loja = { itemType: "loja", id: "1", category: LOJA_SEM_CATEGORIA }
        expect(isItemUncategorized(loja, LISTS)).toBe(true)
    })

    it("reconhece vitrine sem categoria alguma", () => {
        const loja = { itemType: "loja", id: "1" }
        expect(isItemUncategorized(loja, LISTS)).toBe(true)
    })

    it("não considera uncategorizada a vitrine com categoria válida", () => {
        const loja = { itemType: "loja", id: "1", category: "Varejo" }
        expect(isItemUncategorized(loja, LISTS)).toBe(false)
    })

    it("vitrine na categoria 'Outros' aparece no filtro 'Outros'", () => {
        const loja = { itemType: "loja", id: "1", category: "Outros" }
        expect(isItemUncategorized(loja, LISTS)).toBe(true)
    })

    it("produto com categoria de outra lista não é tratado como uncategorizado", () => {
        const servico = { itemType: "servico", id: "1", category: "Beleza e Estética" }
        expect(isItemUncategorized(servico, LISTS)).toBe(false)
    })

    it("produto sem categoria é uncategorizado", () => {
        expect(isItemUncategorized({ itemType: "produto", id: "1" }, LISTS)).toBe(true)
    })

    it("compara a categoria do item com a selecionada", () => {
        expect(itemMatchesCategory({ category: "Restaurante" }, "Restaurantes")).toBe(true)
        expect(itemMatchesCategory({ category: "Alimentação" }, "alimentacao")).toBe(true)
        expect(itemMatchesCategory({ category: "Alimentação" }, "Casa")).toBe(false)
    })

    it("une listas de categorias sem duplicar nomes", () => {
        const merged = mergeCategoryLists([LISTS.products, LISTS.partners])
        const names = merged.map(c => c.name)
        expect(names.filter(n => n === "Alimentação")).toHaveLength(1)
        expect(names).toContain("Varejo")
    })
})

describe("preço e promoção", () => {
    it("vitrine não é eliminada pelo filtro de preço", () => {
        const loja = { itemType: "loja", id: "1" }
        expect(matchesPriceRange(loja, 100, 500)).toBe(true)
    })

    it("item sem preço (sob consulta) continua na listagem", () => {
        const servico = { itemType: "servico", id: "1", price: null }
        expect(matchesPriceRange(servico, 10, 20)).toBe(true)
    })

    it("aplica o intervalo de preço nos produtos", () => {
        const produto = { itemType: "produto", id: "1", price: 50 }
        expect(matchesPriceRange(produto, 10, 100)).toBe(true)
        expect(matchesPriceRange(produto, 60, 100)).toBe(false)
        expect(matchesPriceRange(produto, 10, 40)).toBe(false)
    })
})

describe("avaliação, condição e envio", () => {
    it("filtra por nota mínima", () => {
        const loja = { itemType: "loja", id: "1", rating: 4.6 }
        expect(matchesRatingFilter(loja, 4.5)).toBe(true)
        expect(matchesRatingFilter(loja, 4.8)).toBe(false)
        expect(matchesRatingFilter(loja, null)).toBe(true)
    })

    it("filtra condição apenas em produtos", () => {
        expect(matchesConditionFilter({ itemType: "produto", condition: "Novo" }, "novo")).toBe(true)
        expect(matchesConditionFilter({ itemType: "produto", condition: "Usado" }, "novo")).toBe(false)
        expect(matchesConditionFilter({ itemType: "loja" }, "novo")).toBe(true)
    })

    it("filtra envio nacional apenas em produtos", () => {
        expect(matchesShippingFilter({ itemType: "produto", fulfillment_modes: ["shipping"] })).toBe(true)
        expect(matchesShippingFilter({ itemType: "produto", fulfillment_modes: ["pickup"] })).toBe(false)
        expect(matchesShippingFilter({ itemType: "loja" })).toBe(true)
    })
})

describe("entrega e distância", () => {
    it("separa entrega de retirada", () => {
        const comEntrega = { itemType: "loja", id: "1", delivery_settings: { is_delivery_enabled: true } }
        const soRetirada = { itemType: "loja", id: "2", delivery_settings: { is_delivery_enabled: false } }
        expect(matchesDeliveryFilter(comEntrega, "entrega")).toBe(true)
        expect(matchesDeliveryFilter(soRetirada, "entrega")).toBe(false)
        expect(matchesDeliveryFilter(soRetirada, "retirada")).toBe(true)
    })

    it("identifica entrega grátis", () => {
        const gratis = { itemType: "loja", id: "1", delivery_settings: { is_delivery_enabled: true, base_fee: 0 } }
        const paga = { itemType: "loja", id: "2", delivery_settings: { is_delivery_enabled: true, base_fee: 5 } }
        expect(matchesDeliveryFilter(gratis, "frete")).toBe(true)
        expect(matchesDeliveryFilter(paga, "frete")).toBe(false)
    })

    it("usa a distância já calculada e ignora item sem distância", () => {
        const loja = { itemType: "loja", id: "1", partners: { distance_km: 3.2 } }
        expect(getItemDistanceKm(loja)).toBe(3.2)
        expect(matchesDistanceFilter(loja, 5)).toBe(true)
        expect(matchesDistanceFilter(loja, 2)).toBe(false)
        expect(matchesDistanceFilter({ itemType: "loja", id: "2" }, 5)).toBe(false)
    })
})

describe("sincronização com a URL", () => {
    it("faz round-trip dos filtros", () => {
        const params = new URLSearchParams()
        serializeFiltersToParams({
            categories: [],
            minPrice: 10,
            maxPrice: 100,
            promoOn: true,
            condition: "novo",
            shipping: true,
            minRating: 4.5,
            delivery: "frete",
            maxDistanceKm: 5,
            showcaseOnly: true,
        }, params)

        const parsed = parseFiltersFromParams(params)
        expect(parsed.minPrice).toBe("10")
        expect(parsed.maxPrice).toBe("100")
        expect(parsed.promoOn).toBe(true)
        expect(parsed.condition).toBe("novo")
        expect(parsed.shipping).toBe(true)
        expect(parsed.minRating).toBe(4.5)
        expect(parsed.delivery).toBe("frete")
        expect(parsed.maxDistanceKm).toBe(5)
        expect(parsed.showcaseOnly).toBe(true)
    })

    it("não serializa filtros vazios", () => {
        const params = new URLSearchParams()
        serializeFiltersToParams({
            categories: [],
            minPrice: "",
            maxPrice: "",
            promoOn: false,
            condition: "",
            shipping: false,
            minRating: null,
            delivery: "",
            maxDistanceKm: null,
            showcaseOnly: false,
        }, params)
        expect(params.toString()).toBe("")
    })

    it("descarta valores inválidos vindos da URL", () => {
        const parsed = parseFiltersFromParams(new URLSearchParams("avaliacao=abc&raio=-2&entrega=xyz&vitrine=sim"))
        expect(parsed.minRating).toBeNull()
        expect(parsed.maxDistanceKm).toBeNull()
        expect(parsed.delivery).toBe("")
        expect(parsed.showcaseOnly).toBe(false)
    })
})
