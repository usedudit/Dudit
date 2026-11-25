import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  createBlingClient,
  BlingClient,
  exchangeBlingAuthCode,
  refreshBlingAccessToken,
} from "./bling-client"

vi.mock("server-only", () => ({}))

describe("BlingClient (API v3)", () => {
  const fakeToken = "bling_access_token_123"

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("throws if access token is missing", () => {
    expect(() => createBlingClient("")).toThrow("Access token do Bling ERP é obrigatório.")
    expect(() => new BlingClient("   ")).toThrow("Access token do Bling ERP é obrigatório.")
  })

  it("exchanges OAuth authorization code for tokens", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "acc_123",
        refresh_token: "ref_456",
        expires_in: 21600,
        token_type: "Bearer",
      }),
    } as any)

    const tokens = await exchangeBlingAuthCode({
      clientId: "cid",
      clientSecret: "csec",
      code: "auth_code_xyz",
    })

    expect(tokens.access_token).toBe("acc_123")
    expect(tokens.refresh_token).toBe("ref_456")
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toContain("/Api/v3/oauth/token")
    expect(String((init?.headers as any)?.Authorization)).toMatch(/^Basic /)
  })

  it("refreshes access token with single-use refresh token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "acc_new",
        refresh_token: "ref_new",
        expires_in: 21600,
        token_type: "Bearer",
      }),
    } as any)

    const tokens = await refreshBlingAccessToken({
      clientId: "cid",
      clientSecret: "csec",
      refreshToken: "ref_old",
    })

    expect(tokens.access_token).toBe("acc_new")
    expect(tokens.refresh_token).toBe("ref_new")
  })

  it("queries product stock balances with physical and virtual totals", async () => {
    const client = createBlingClient(fakeToken)
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            produto: { id: 1001 },
            saldoFisicoTotal: 29,
            saldoVirtualTotal: 26,
          },
        ],
      }),
    } as any)

    const balances = await client.getProductStocks([1001])
    expect(balances).toHaveLength(1)
    expect(balances[0].saldoFisicoTotal).toBe(29)
    expect(balances[0].saldoVirtualTotal).toBe(26)
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/estoques/saldos")
  })

  it("sends stock balance movement via POST /estoques", async () => {
    const client = createBlingClient(fakeToken)
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: 999 } }),
    } as any)

    await client.updateProductStock({
      produtoId: 1001,
      depositoId: 55,
      quantidade: 40,
      operacao: "B",
      observacoes: "Ajuste Dudit",
    })

    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toContain("/estoques")
    expect(init?.method).toBe("POST")
    const parsed = JSON.parse(String(init?.body))
    expect(parsed.produto.id).toBe(1001)
    expect(parsed.deposito.id).toBe(55)
    expect(parsed.operacao).toBe("B")
    expect(parsed.quantidade).toBe(40)
  })

  it("updates existing contact via PUT /contatos/{id} when CPF or address is missing", async () => {
    const client = createBlingClient(fakeToken)
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      // 1. Search by numeroDocumento -> empty
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      } as any)
      // 2. Search by nome -> finds existing incomplete contact
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: 777, nome: "João Silva" }] }),
      } as any)
      // 3. GET /contatos/777 -> missing numeroDocumento and endereco, has tiposContato
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 777,
            nome: "João Silva",
            tipo: "F",
            situacao: "A",
            numeroDocumento: "",
            tiposContato: [{ id: 10, descricao: "Desenvolvedor" }],
            endereco: { geral: {} },
          },
        }),
      } as any)
      // 4. PUT /contatos/777 -> succeeds
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 777 } }),
      } as any)

    const id = await client.findOrCreateContact({
      nome: "João Silva",
      numeroDocumento: "12345678901",
      tipo: "F",
      endereco: {
        endereco: "Rua das Flores",
        numero: "100",
        bairro: "Centro",
        cep: "01001000",
        municipio: "São Paulo",
        uf: "SP",
      },
    })

    expect(id).toBe(777)
    expect(fetchSpy).toHaveBeenCalledTimes(4)
    const [putUrl, putInit] = fetchSpy.mock.calls[3]
    expect(String(putUrl)).toContain("/contatos/777")
    expect(putInit?.method).toBe("PUT")
    const putBody = JSON.parse(String(putInit?.body))
    expect(putBody.numeroDocumento).toBe("12345678901")
    expect(putBody.tiposContato).toEqual([{ id: 10, descricao: "Desenvolvedor" }])
    expect(putBody.endereco.geral.endereco).toBe("Rua das Flores")
    expect(putBody.endereco.geral.cep).toBe("01001000")
    expect(putBody.endereco.geral.uf).toBe("SP")
  })
})
