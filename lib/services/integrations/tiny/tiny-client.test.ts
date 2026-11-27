import { describe, it, expect, vi, beforeEach } from "vitest"
import { createTinyClient, TinyClient } from "./tiny-client"

describe("TinyClient", () => {
  const fakeToken = "test_token_12345"

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("should throw if token is missing or empty", () => {
    expect(() => createTinyClient("")).toThrow("Token de API do Tiny é obrigatório.")
    expect(() => new TinyClient("   ")).toThrow("Token de API do Tiny é obrigatório.")
  })

  it("testConnection should return valid: true on successful response", async () => {
    const client = createTinyClient(fakeToken)

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        retorno: {
          status_processamento: 3,
          status: "OK",
          produtos: [],
        },
      }),
    } as any)

    const res = await client.testConnection()
    expect(res.valid).toBe(true)
  })

  it("testConnection should return valid: false if Tiny returns error status", async () => {
    const client = createTinyClient(fakeToken)

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        retorno: {
          status_processamento: 1,
          status: "Erro",
          erros: [{ erro: "Token inválido" }],
        },
      }),
    } as any)

    const res = await client.testConnection()
    expect(res.valid).toBe(false)
    expect(res.message).toContain("Token inválido")
  })

  it("getProduct should return product details", async () => {
    const client = createTinyClient(fakeToken)

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        retorno: {
          status_processamento: 3,
          status: "OK",
          produto: {
            id: 12345,
            nome: "Camiseta Dudit",
            codigo: "CAM-01",
            preco: "49.90",
            saldo: "10",
          },
        },
      }),
    } as any)

    const prod = await client.getProduct(12345)
    expect(prod.id).toBe(12345)
    expect(prod.nome).toBe("Camiseta Dudit")
    expect(prod.preco).toBe("49.90")
  })

  it("createOrder should send payload and return id and number", async () => {
    const client = createTinyClient(fakeToken)

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        retorno: {
          status_processamento: 3,
          status: "OK",
          registros: {
            registro: {
              id: 998877,
              numero: 54321,
            },
          },
        },
      }),
    } as any)

    const res = await client.createOrder({
      pedido: {
        cliente: {
          nome: "João Teste",
        },
        itens: [
          {
            item: {
              descricao: "Camiseta",
              quantidade: 1,
              valor_unitario: 49.9,
            },
          },
        ],
      },
    })

    expect(res.id).toBe(998877)
    expect(res.numero).toBe(54321)
  })

  it("updateOrderStatus should send status change request to Tiny", async () => {
    const client = createTinyClient(fakeToken)

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        retorno: {
          status_processamento: 3,
          status: "OK",
        },
      }),
    } as any)

    const success = await client.updateOrderStatus(998877, "cancelado")
    expect(success).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const callArgs = fetchSpy.mock.calls[0]
    expect(callArgs[0]).toContain("pedido.alterar.situacao.php")
    expect(callArgs[1]?.body).toContain("situacao=cancelado")
    expect(callArgs[1]?.body).toContain("id=998877")
  })

  it("updateOrderTracking should send tracking number and url to Tiny", async () => {
    const client = createTinyClient(fakeToken)

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        retorno: {
          status_processamento: 3,
          status: "OK",
        },
      }),
    } as any)

    const success = await client.updateOrderTracking({
      id: 998877,
      codigoRastreamento: "BR123456789BR",
      urlRastreamento: "https://rastreio.exemplo.com",
    })
    expect(success).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const callArgs = fetchSpy.mock.calls[0]
    expect(callArgs[0]).toContain("pedido.atualizar.rastreamento.php")
    expect(callArgs[1]?.body).toContain("codigo_rastreamento=BR123456789BR")
    expect(callArgs[1]?.body).toContain("url_rastreamento=https%3A%2F%2Frastreio.exemplo.com")
    expect(callArgs[1]?.body).toContain("id=998877")
  })

  it("updateProductStock should send stock update to Tiny", async () => {
    const client = createTinyClient(fakeToken)

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        retorno: {
          status_processamento: 3,
          status: "OK",
          registros: {
            registro: {
              saldoEstoque: 42,
            },
          },
        },
      }),
    } as any)

    const res = await client.updateProductStock(12345, 42, {
      tipo: "B",
      observacoes: "Ajuste de teste",
    })

    expect(res.status).toBe("OK")
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const callArgs = fetchSpy.mock.calls[0]
    expect(callArgs[0]).toContain("produto.atualizar.estoque.php")
    expect(callArgs[1]?.body).toContain(encodeURIComponent('"idProduto":12345'))
    expect(callArgs[1]?.body).toContain(encodeURIComponent('"quantidade":42'))
  })

  it("launchOrderStock calls pedido.lancar.estoque.php and handles already-launched idempotently", async () => {
    const client = createTinyClient(fakeToken)

    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          retorno: { status_processamento: 3, status: "OK" },
        }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          retorno: {
            status_processamento: 2,
            status: "Erro",
            erros: [{ erro: "Estoque já lançado para este pedido" }],
          },
        }),
      } as any)

    const res1 = await client.launchOrderStock(998877)
    expect(res1).toEqual({ launched: true })
    expect(fetchSpy.mock.calls[0][0]).toContain("pedido.lancar.estoque.php")
    expect(fetchSpy.mock.calls[0][1]?.body).toContain("id=998877")

    const res2 = await client.launchOrderStock(998877)
    expect(res2).toEqual({ launched: true, alreadyLaunched: true })
  })

  it("reverseOrderStock calls pedido.estornar.estoque.php and handles not-launched idempotently", async () => {
    const client = createTinyClient(fakeToken)

    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          retorno: { status_processamento: 3, status: "OK" },
        }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          retorno: {
            status_processamento: 2,
            status: "Erro",
            erros: [{ erro: "O estoque deste pedido não foi lançado" }],
          },
        }),
      } as any)

    const res1 = await client.reverseOrderStock(998877)
    expect(res1).toEqual({ reversed: true })
    expect(fetchSpy.mock.calls[0][0]).toContain("pedido.estornar.estoque.php")

    const res2 = await client.reverseOrderStock(998877)
    expect(res2).toEqual({ reversed: false, notLaunched: true })
  })
})
