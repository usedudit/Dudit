import { describe, it, expect } from "vitest"
import { humanizeTimelineChangeLine, resolveTimelineActorName } from "./formatters"

describe("humanizeTimelineChangeLine", () => {
  it("standardizes delivery status lines cleanly", () => {
    expect(humanizeTimelineChangeLine("alterou status de entrega: Não enviado -> Entregue")).toBe("Pedido entregue.")
    expect(humanizeTimelineChangeLine("alterou o status de entrega: Não enviado -> Saiu para entrega")).toBe("Pedido saiu para entrega.")
    expect(humanizeTimelineChangeLine("status de entrega: Pronto para retirada")).toBe("Pedido pronto para retirada.")
    expect(humanizeTimelineChangeLine("alterou status de entrega: Não enviado -> Retirado")).toBe("Pedido retirado pelo cliente.")
    expect(humanizeTimelineChangeLine("alterou status de entrega: Saiu para entrega -> Falha na entrega")).toBe("Tentativa de entrega não realizada.")
    expect(humanizeTimelineChangeLine("alterou status de entrega: Pendente -> Em preparação")).toBe("Pedido em separação.")
    expect(humanizeTimelineChangeLine("alterou status de entrega: Pendente -> Cancelado")).toBe("Entrega do pedido cancelada.")
    expect(humanizeTimelineChangeLine("alterou status de entrega: cancelado -> Não enviado")).toBe("Pedido aguardando envio.")
  })

  it("standardizes payment status lines cleanly", () => {
    expect(humanizeTimelineChangeLine("alterou status de pagamento: Pendente -> Pago")).toBe("Pagamento aprovado com sucesso.")
    expect(humanizeTimelineChangeLine("alterou o status de pagamento: Pendente -> Aprovado")).toBe("Pagamento aprovado com sucesso.")
    expect(humanizeTimelineChangeLine("alterou status de pagamento: Pago -> Reembolsado")).toBe("Pagamento reembolsado.")
    expect(humanizeTimelineChangeLine("alterou status de pagamento: Pendente -> Cancelado")).toBe("Pagamento cancelado.")
    expect(humanizeTimelineChangeLine("status de pagamento: Aguardando pagamento")).toBe("Aguardando confirmação de pagamento.")
  })

  it("standardizes return status lines cleanly", () => {
    expect(humanizeTimelineChangeLine("alterou status: Pendente → Aprovada")).toBe("Solicitação de troca/devolução aprovada.")
    expect(humanizeTimelineChangeLine("alterou status: Pendente → Recusada")).toBe("Solicitação de troca/devolução recusada.")
    expect(humanizeTimelineChangeLine("alterou status: Pendente → Em análise")).toBe("Solicitação de troca/devolução em análise.")
    expect(humanizeTimelineChangeLine("alterou status: Pendente → Concluída")).toBe("Solicitação de troca/devolução concluída.")
    expect(humanizeTimelineChangeLine("alterou status: Pendente → Aguardando devolução do item")).toBe("Aguardando devolução dos itens.")
    expect(humanizeTimelineChangeLine("Solicitação criada")).toBe("Solicitação de troca/devolução criada.")
    expect(humanizeTimelineChangeLine("Solicitação de devolução criada pelo cliente")).toBe("Solicitação de troca/devolução criada.")
    expect(humanizeTimelineChangeLine("Solicitação atualizada: status alterado.")).toBe("Solicitação de troca/devolução atualizada.")
  })

  it("standardizes deposit lines neutrally for all users", () => {
    expect(humanizeTimelineChangeLine("O sinal do pedido foi cancelado pelo vendedor.")).toBe("Cobrança de sinal cancelada.")
    expect(humanizeTimelineChangeLine("Nova cobrança de sinal gerada via Mercado Pago.")).toBe("Cobrança de sinal gerada via Mercado Pago.")
    expect(humanizeTimelineChangeLine("Recebimento do sinal confirmado.")).toBe("Pagamento do sinal confirmado com sucesso.")
    expect(humanizeTimelineChangeLine("O prazo para pagamento do sinal expirou.")).toBe("Prazo para pagamento do sinal expirado.")
  })

  it("preserves financial detail lines intact", () => {
    expect(humanizeTimelineChangeLine("Valor do reembolso: R$ 987,54")).toBe("Valor do reembolso: R$ 987,54")
    expect(humanizeTimelineChangeLine("Vale-compra gerado: R$ 50,00")).toBe("Vale-compra gerado: R$ 50,00")
    expect(humanizeTimelineChangeLine("Pedido de troca criado: #ABCD1234")).toBe("Pedido de troca criado: #ABCD1234")
    expect(humanizeTimelineChangeLine("Itens restaurados ao estoque físico")).toBe("Itens restaurados ao estoque físico")
  })
})

describe("resolveTimelineActorName", () => {
  const dummyEntryCustomer = {
    actor_user_id: "user-buyer-1",
    actor_name: "Murilo Storari",
    metadata: { is_buyer: true },
    source: "marketplace",
  }

  const dummyEntrySeller = {
    actor_user_id: "user-seller-1",
    actor_name: "João Silva",
    metadata: {},
    source: "erp",
  }

  const dummyEntryDudit = {
    actor_user_id: "user-admin-1",
    actor_name: "Equipe Dudit",
    metadata: { dudit_action: true, admin_actor_name: "Carlos Moderador" },
    source: "admin",
  }

  const dummyEntrySystem = {
    actor_user_id: null,
    actor_name: "Sistema",
    metadata: {},
    source: "system",
  }

  const dummyEntryDriver = {
    actor_user_id: "user-driver-1",
    actor_name: "Adrian Murilo",
    metadata: { is_driver: true, driver_id: "user-driver-1", driver_name: "Adrian Murilo" },
    source: "delivery_driver_app",
  }

  it("resolves actors correctly for customer viewer", () => {
    expect(resolveTimelineActorName({
      entry: dummyEntryCustomer,
      viewer: "customer",
      buyerId: "user-buyer-1",
      orderCustomerName: "Murilo Storari",
      storeName: "Dudit Store",
    })).toBe("Você")

    expect(resolveTimelineActorName({
      entry: dummyEntrySeller,
      viewer: "customer",
      buyerId: "user-buyer-1",
      orderCustomerName: "Murilo Storari",
      storeName: "Dudit Store",
    })).toBe("Dudit Store")

    expect(resolveTimelineActorName({
      entry: dummyEntryDudit,
      viewer: "customer",
      buyerId: "user-buyer-1",
      orderCustomerName: "Murilo Storari",
      storeName: "Dudit Store",
    })).toBe("Equipe Dudit")

    expect(resolveTimelineActorName({
      entry: dummyEntrySystem,
      viewer: "customer",
      buyerId: "user-buyer-1",
      orderCustomerName: "Murilo Storari",
      storeName: "Dudit Store",
    })).toBe("Sistema")

    expect(resolveTimelineActorName({
      entry: dummyEntryDriver,
      viewer: "customer",
      buyerId: "user-buyer-1",
      orderCustomerName: "Murilo Storari",
      storeName: "Dudit Store",
    })).toBe("Entregador")
  })

  it("resolves actors correctly for seller viewer", () => {
    expect(resolveTimelineActorName({
      entry: dummyEntryCustomer,
      viewer: "seller",
      buyerId: "user-buyer-1",
      orderCustomerName: "Murilo Storari",
      storeName: "Dudit Store",
    })).toBe("Murilo Storari (Cliente)")

    expect(resolveTimelineActorName({
      entry: dummyEntrySeller,
      viewer: "seller",
      buyerId: "user-buyer-1",
      orderCustomerName: "Murilo Storari",
      storeName: "Dudit Store",
    })).toBe("João Silva")

    expect(resolveTimelineActorName({
      entry: dummyEntryDriver,
      viewer: "seller",
      buyerId: "user-buyer-1",
      orderCustomerName: "Murilo Storari",
      storeName: "Dudit Store",
    })).toBe("Adrian Murilo (Entregador)")

    expect(resolveTimelineActorName({
      entry: dummyEntryDudit,
      viewer: "seller",
      buyerId: "user-buyer-1",
      orderCustomerName: "Murilo Storari",
      storeName: "Dudit Store",
    })).toBe("Equipe Dudit")

    expect(resolveTimelineActorName({
      entry: dummyEntrySystem,
      viewer: "seller",
      buyerId: "user-buyer-1",
      orderCustomerName: "Murilo Storari",
      storeName: "Dudit Store",
    })).toBe("Sistema")
  })

  it("resolves actors correctly for admin viewer", () => {
    expect(resolveTimelineActorName({
      entry: dummyEntryCustomer,
      viewer: "admin",
      buyerId: "user-buyer-1",
      orderCustomerName: "Murilo Storari",
      storeName: "Dudit Store",
    })).toBe("Murilo Storari (Cliente)")

    expect(resolveTimelineActorName({
      entry: dummyEntrySeller,
      viewer: "admin",
      buyerId: "user-buyer-1",
      orderCustomerName: "Murilo Storari",
      storeName: "Dudit Store",
    })).toBe("João Silva (Vendedor)")

    expect(resolveTimelineActorName({
      entry: dummyEntryDriver,
      viewer: "admin",
      buyerId: "user-buyer-1",
      orderCustomerName: "Murilo Storari",
      storeName: "Dudit Store",
    })).toBe("Adrian Murilo (Entregador)")

    expect(resolveTimelineActorName({
      entry: dummyEntryDudit,
      viewer: "admin",
      buyerId: "user-buyer-1",
      orderCustomerName: "Murilo Storari",
      storeName: "Dudit Store",
    })).toBe("Equipe Dudit (Carlos Moderador)")

    // Never outputs "Equipe Dudit (Admin)" when admin identity is generic "Admin"
    const dummyEntryDuditGeneric = {
      actor_user_id: "user-admin-1",
      actor_name: "Equipe Dudit (Admin)",
      metadata: { dudit_action: true, admin_actor_name: "Admin" },
      source: "admin",
    }
    expect(resolveTimelineActorName({
      entry: dummyEntryDuditGeneric,
      viewer: "admin",
      buyerId: "user-buyer-1",
      orderCustomerName: "Murilo Storari",
      storeName: "Dudit Store",
    })).toBe("Equipe Dudit")

    expect(resolveTimelineActorName({
      entry: dummyEntryDuditGeneric,
      viewer: "seller",
      buyerId: "user-buyer-1",
      orderCustomerName: "Murilo Storari",
      storeName: "Dudit Store",
    })).toBe("Equipe Dudit")

    expect(resolveTimelineActorName({
      entry: dummyEntryDuditGeneric,
      viewer: "customer",
      buyerId: "user-buyer-1",
      orderCustomerName: "Murilo Storari",
      storeName: "Dudit Store",
    })).toBe("Equipe Dudit")

    expect(resolveTimelineActorName({
      entry: dummyEntrySystem,
      viewer: "admin",
      buyerId: "user-buyer-1",
      orderCustomerName: "Murilo Storari",
      storeName: "Dudit Store",
    })).toBe("Sistema")
  })

  it("never resolves ERP actions as Equipe Dudit, even with legacy dudit flags", () => {
    // Action done in ERP by the owner or staff, but polluted with legacy dudit_action or generic actor_name
    const dummyErpActionPolluted = {
      actor_user_id: "user-seller-1",
      actor_name: "Equipe Dudit",
      metadata: { dudit_action: true, source: "erp" },
      source: "erp",
    }

    expect(resolveTimelineActorName({
      entry: dummyErpActionPolluted,
      viewer: "seller",
      buyerId: "user-buyer-1",
      orderCustomerName: "Murilo Storari",
      storeName: "Dudit Store",
    })).toBe("Vendedor")

    expect(resolveTimelineActorName({
      entry: dummyErpActionPolluted,
      viewer: "customer",
      buyerId: "user-buyer-1",
      orderCustomerName: "Murilo Storari",
      storeName: "Dudit Store",
    })).toBe("Dudit Store")

    const dummyErpActionWithStaffName = {
      actor_user_id: "user-seller-2",
      actor_name: "Roberta Funcionária",
      metadata: { dudit_action: true },
      source: "erp",
    }

    expect(resolveTimelineActorName({
      entry: dummyErpActionWithStaffName,
      viewer: "seller",
      buyerId: "user-buyer-1",
      orderCustomerName: "Murilo Storari",
      storeName: "Dudit Store",
    })).toBe("Roberta Funcionária")
  })
})
