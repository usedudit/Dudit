import { describe, it, expect } from "vitest";
import { DashboardContext } from "../types";
import {
  getChecklistItems,
  getCards,
  getShortcuts,
  getAlerts,
  getIntegrations,
  getRecommendations
} from "../rules";
import { getDefaultResourcesForModeAndCategory } from "@/lib/system-resources";
import { isQuickMode } from "@/lib/business-info";

describe("Dashboard Engine - Rules Evaluation Tests", () => {
  const createBaseContext = (overrides: Partial<DashboardContext> = {}): DashboardContext => {
    return {
      partnerId: "partner-123",
      storeName: "Loja Teste",
      isQuickMode: true,
      sellsProducts: true,
      sellsServices: false,
      planSlug: "free",
      hasPhone: true,
      hasCategory: true,
      hasAddress: true,
      hasHours: true,
      hasPix: true,
      hasItems: true,
      hasLogoAndBanner: true,
      hasDeliveryConfig: false,
      isWhatsAppConnected: true,
      isMercadoPagoConnected: true,
      stats: {
        activeProductsCount: 5,
        activeServicesCount: 0,
        receivedOrdersCount: 2,
        monthlyOrdersCount: 2
      },
      ...overrides
    };
  };

  describe("Checklist Onboarding Rules", () => {
    it("should return completed = false for profile if category or phone is missing", () => {
      const ctx = createBaseContext({ hasPhone: false });
      const checklist = getChecklistItems(ctx);
      const businessDataItem = checklist.find((item) => item.id === "business-data");
      expect(businessDataItem?.completed).toBe(false);
    });

    it("should return completed = false for items if catalogue is empty", () => {
      const ctx = createBaseContext({ hasItems: false });
      const checklist = getChecklistItems(ctx);
      const itemsStep = checklist.find((item) => item.id === "items");
      expect(itemsStep?.completed).toBe(false);
      expect(itemsStep?.href).toBe("/erp/produtos?create=true");
    });

    it("should point to services create path if only selling services and catalogue is empty", () => {
      const ctx = createBaseContext({
        sellsProducts: false,
        sellsServices: true,
        hasItems: false
      });
      const checklist = getChecklistItems(ctx);
      const itemsStep = checklist.find((item) => item.id === "items");
      expect(itemsStep?.completed).toBe(false);
      expect(itemsStep?.href).toBe("/erp/servicos?create=true");
    });

    it("should include hours and exclude logistics for services-only business", () => {
      const ctx = createBaseContext({
        sellsProducts: false,
        sellsServices: true,
        planSlug: "crescer",
        hasAddress: true,
      });
      const checklist = getChecklistItems(ctx);
      const hoursStep = checklist.find((item) => item.id === "hours");
      const logisticsStep = checklist.find((item) => item.id === "logistics");
      expect(hoursStep).toBeDefined();
      expect(logisticsStep).toBeUndefined();
    });

    it("should include logistics for products business on Crescer plan with address", () => {
      const ctx = createBaseContext({
        sellsProducts: true,
        sellsServices: false,
        planSlug: "crescer",
        hasAddress: true,
      });
      const checklist = getChecklistItems(ctx);
      const logisticsStep = checklist.find((item) => item.id === "logistics");
      expect(logisticsStep).toBeDefined();
    });

    it("should exclude logistics on Free plan even if selling products", () => {
      const ctx = createBaseContext({
        sellsProducts: true,
        sellsServices: false,
        planSlug: "free",
        hasAddress: true,
      });
      const checklist = getChecklistItems(ctx);
      const logisticsStep = checklist.find((item) => item.id === "logistics");
      expect(logisticsStep).toBeUndefined();
    });

    it("should exclude payment methods step on Free plan", () => {
      const ctx = createBaseContext({
        planSlug: "free",
      });
      const checklist = getChecklistItems(ctx);
      const paymentsStep = checklist.find((item) => item.id === "payments");
      expect(paymentsStep).toBeUndefined();
    });

    it("should include payment methods step on Crescer/Escalar plan", () => {
      const ctx = createBaseContext({
        planSlug: "crescer",
      });
      const checklist = getChecklistItems(ctx);
      const paymentsStep = checklist.find((item) => item.id === "payments");
      expect(paymentsStep).toBeDefined();
      expect(paymentsStep?.title).toBe("Ativar recebimento online (Mercado Pago)");
    });
  });

  describe("Cards Rules", () => {
    it("should render active products card if partner sells products only", () => {
      const ctx = createBaseContext({
        sellsProducts: true,
        sellsServices: false,
        stats: {
          activeProductsCount: 10,
          activeServicesCount: 0,
          receivedOrdersCount: 5,
          monthlyOrdersCount: 5
        }
      });
      const cards = getCards(ctx);
      expect(cards).toHaveLength(2);
      expect(cards[0].id).toBe("active-products");
      expect(cards[0].value).toBe(10);
    });

    it("should render active services card if partner sells services only", () => {
      const ctx = createBaseContext({
        sellsProducts: false,
        sellsServices: true,
        stats: {
          activeProductsCount: 0,
          activeServicesCount: 8,
          receivedOrdersCount: 5,
          monthlyOrdersCount: 5
        }
      });
      const cards = getCards(ctx);
      expect(cards[0].id).toBe("active-services");
      expect(cards[0].value).toBe(8);
    });

    it("should render combined items card if sells both products and services", () => {
      const ctx = createBaseContext({
        sellsProducts: true,
        sellsServices: true,
        stats: {
          activeProductsCount: 4,
          activeServicesCount: 6,
          receivedOrdersCount: 5,
          monthlyOrdersCount: 5
        }
      });
      const cards = getCards(ctx);
      expect(cards[0].id).toBe("active-items");
      expect(cards[0].value).toBe(10); // 4 + 6
    });
  });

  describe("Shortcuts Rules", () => {
    it("should only show Anunciar Produto for products-only sellers", () => {
      const ctx = createBaseContext({ sellsProducts: true, sellsServices: false });
      const shortcuts = getShortcuts(ctx);
      expect(shortcuts).toHaveLength(1);
      expect(shortcuts[0].id).toBe("add-product");
    });

    it("should show both shortcuts if selling products and services", () => {
      const ctx = createBaseContext({ sellsProducts: true, sellsServices: true });
      const shortcuts = getShortcuts(ctx);
      expect(shortcuts).toHaveLength(2);
      expect(shortcuts[0].id).toBe("add-product");
      expect(shortcuts[1].id).toBe("add-service");
    });
  });

  describe("Alerts & Limits Rules", () => {
    it("should trigger plan limit alert if free plan active products count is 15", () => {
      const ctx = createBaseContext({
        planSlug: "free",
        sellsProducts: true,
        stats: {
          activeProductsCount: 15,
          activeServicesCount: 0,
          receivedOrdersCount: 10,
          monthlyOrdersCount: 10
        }
      });
      const alerts = getAlerts(ctx);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].id).toBe("alert-product-limit");
      expect(alerts[0].type).toBe("danger");
    });

    it("should trigger plan limit alert if free plan orders count is 25", () => {
      const ctx = createBaseContext({
        planSlug: "free",
        stats: {
          activeProductsCount: 5,
          activeServicesCount: 0,
          receivedOrdersCount: 30,
          monthlyOrdersCount: 25
        }
      });
      const alerts = getAlerts(ctx);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].id).toBe("alert-orders-limit");
    });

    it("should trigger warning alert if paid plan has disconnected Mercado Pago", () => {
      const ctx = createBaseContext({
        planSlug: "crescer",
        isMercadoPagoConnected: false
      });
      const alerts = getAlerts(ctx);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].id).toBe("alert-mp-missing");
      expect(alerts[0].type).toBe("warning");
    });
  });

  describe("Business Modes & Resource Presets", () => {
    it("should return minimal resources for desapego mode", () => {
      const resources = getDefaultResourcesForModeAndCategory("desapego");
      expect(resources).toEqual(["products", "services", "showcase"]);
    });

    it("should return empty checklist for desapego mode", () => {
      const items = getChecklistItems(createBaseContext({
        isDesapego: true,
        businessMode: "desapego",
      }));
      expect(items).toEqual([]);
    });

    it("should return streamlined showcase resources for quick mode without ERP overhead", () => {
      const resources = getDefaultResourcesForModeAndCategory("quick");
      expect(resources).toContain("products");
      expect(resources).toContain("orders");
      expect(resources).toContain("quotes");
      expect(resources).toContain("customers");
      expect(resources).not.toContain("pos");
      expect(resources).not.toContain("financial");
      expect(resources).not.toContain("team");
    });

    it("should return full suite for erp mode", () => {
      const resources = getDefaultResourcesForModeAndCategory("erp");
      expect(resources).toContain("pos");
      expect(resources).toContain("financial");
      expect(resources).toContain("team");
      expect(resources).toContain("returns");
    });

    it("should identify desapego and showcase as quick mode interfaces", () => {
      expect(isQuickMode({ mode: "desapego" })).toBe(true);
      expect(isQuickMode({ mode: "quick" })).toBe(true);
      expect(isQuickMode({ mode: "showcase" })).toBe(true);
      expect(isQuickMode({ mode: "erp" })).toBe(false);
    });
  });
});
