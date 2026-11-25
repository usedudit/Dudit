import "server-only"

const BLING_API_BASE_URL = "https://api.bling.com.br/Api/v3"
const BLING_OAUTH_TOKEN_URL = "https://api.bling.com.br/Api/v3/oauth/token"

export interface BlingTokenResponse {
  access_token: string
  expires_in: number
  token_type: string
  scope?: string
  refresh_token: string
}

export interface BlingProductSummary {
  id: number
  nome: string
  codigo?: string
  preco?: number
  tipo?: string
  situacao?: string
  formato?: "S" | "V" | "E" // S=Simples, V=Com variações, E=Com composição
  idProdutoPai?: number
  imagemURL?: string
  estoque?: {
    saldoVirtualTotal?: number
  }
}

export interface BlingProductVariation {
  id: number
  nome: string
  codigo?: string
  preco?: number
  situacao?: string
  variacao?: {
    nome?: string
    ordem?: number
    produtoPai?: {
      cloneInfo?: boolean
    }
  }
}

export interface BlingProductDetail extends BlingProductSummary {
  unidade?: string
  gtin?: string
  pesoLiquido?: number
  pesoBruto?: number
  descricaoCurta?: string
  descricaoComplementar?: string
  precoCusto?: number
  estoque?: {
    minimo?: number
    maximo?: number
    saldoVirtualTotal?: number
  }
  tributacao?: {
    ncm?: string
    origem?: number
    cest?: string
  }
  midia?: {
    imagens?: {
      externas?: Array<{ link: string }>
      internas?: Array<{ link: string; linkMiniatura?: string }>
    }
  }
  variacoes?: BlingProductVariation[]
}

export interface BlingStockBalance {
  produto: { id: number }
  saldoFisicoTotal: number
  saldoVirtualTotal: number
  depositos?: Array<{
    id: number
    saldoFisico: number
    saldoVirtual: number
  }>
}

export interface BlingDeposit {
  id: number
  descricao: string
  situacao?: number
  padrao?: boolean
}

export interface BlingOrderParcela {
  dataVencimento: string // YYYY-MM-DD
  valor: number
  observacoes?: string
  formaPagamento?: {
    id: number
  }
}

export interface BlingOrderPayload {
  numeroLoja?: string
  data: string // YYYY-MM-DD
  dataSaida?: string
  contato: {
    id: number
  }
  desconto?: {
    valor: number
    unidade: "REAL" | "PERCENTUAL"
  }
  outrasDespesas?: number
  observacoes?: string
  observacoesInternas?: string
  itens: Array<{
    codigo?: string
    unidade?: string
    quantidade: number
    valor: number
    descricao: string
    produto?: {
      id: number
    }
  }>
  parcelas?: BlingOrderParcela[]
  transporte?: {
    fretePorConta?: number // 0=CIF(Remetente), 1=FOB(Destinatário), 9=Sem frete
    frete?: number
    contato?: {
      nome?: string
    }
    etiqueta?: {
      nome?: string
      endereco?: string
      numero?: string
      complemento?: string
      municipio?: string
      uf?: string
      cep?: string
      bairro?: string
    }
    volumes?: Array<{
      servico?: string
      codigoRastreamento?: string
    }>
  }
}

export interface BlingOrderResponse {
  id: number
  numero?: number | string
}

export interface BlingNfeDetail {
  id: number
  numero?: string | number
  serie?: string | number
  chaveAcesso?: string
  situacao?: number
  dataEmissao?: string
  linkDanfe?: string
  linkPDF?: string
  xml?: string
  contato?: {
    id?: number
    nome?: string
  }
  numeroPedidoLoja?: string
}

/**
 * Troca o authorization_code recebido no callback OAuth 2.0 por access_token + refresh_token
 */
export async function exchangeBlingAuthCode(params: {
  clientId: string
  clientSecret: string
  code: string
}): Promise<BlingTokenResponse> {
  const basicAuth = Buffer.from(`${params.clientId.trim()}:${params.clientSecret.trim()}`).toString("base64")
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
  })

  const response = await fetch(BLING_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    cache: "no-store",
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data?.access_token) {
    const errMsg = data?.error?.description || data?.error_description || data?.message || `HTTP ${response.status}`
    throw new Error(`Bling OAuth (exchange): ${errMsg}`)
  }

  return data as BlingTokenResponse
}

/**
 * Renova o access_token usando refresh_token (uso único — sempre salve o novo refresh_token!)
 */
export async function refreshBlingAccessToken(params: {
  clientId: string
  clientSecret: string
  refreshToken: string
}): Promise<BlingTokenResponse> {
  const basicAuth = Buffer.from(`${params.clientId}:${params.clientSecret}`).toString("base64")
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
  })

  const response = await fetch(BLING_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    cache: "no-store",
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data?.access_token) {
    const errMsg = data?.error?.description || data?.error_description || data?.message || `HTTP ${response.status}`
    throw new Error(`Bling OAuth (refresh): ${errMsg}`)
  }

  return data as BlingTokenResponse
}

export class BlingClient {
  private accessToken: string
  private lastRequestAt = 0

  constructor(accessToken: string) {
    if (!accessToken || !accessToken.trim()) {
      throw new Error("Access token do Bling ERP é obrigatório.")
    }
    this.accessToken = accessToken.trim()
  }

  private async throttle() {
    // Bling API v3 limita a 3 requisições por segundo (~340ms entre chamadas)
    const now = Date.now()
    const elapsed = now - this.lastRequestAt
    if (elapsed < 350) {
      await new Promise((r) => setTimeout(r, 350 - elapsed))
    }
    this.lastRequestAt = Date.now()
  }

  private async request<T = any>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
      body?: any
      query?: Record<string, string | number | Array<string | number> | undefined>
      maxRetries?: number
    } = {}
  ): Promise<T> {
    const method = options.method || "GET"
    const maxRetries = options.maxRetries ?? 2

    const url = new URL(`${BLING_API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`)
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v === undefined || v === null) continue
        if (Array.isArray(v)) {
          for (const item of v) {
            url.searchParams.append(k, String(item))
          }
        } else {
          url.searchParams.set(k, String(v))
        }
      }
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      await this.throttle()

      const response = await fetch(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        cache: "no-store",
      })

      if (response.status === 429 && attempt < maxRetries) {
        const retryAfter = Number(response.headers.get("retry-after") || 1)
        await new Promise((r) => setTimeout(r, Math.max(1000, retryAfter * 1000)))
        continue
      }

      if (response.status === 204) {
        return {} as T
      }

      const json = await response.json().catch(() => ({}))

      if (!response.ok) {
        const fields = Array.isArray(json?.error?.fields)
          ? json.error.fields.map((f: any) => f?.msg || f?.element || JSON.stringify(f)).join("; ")
          : ""
        const baseMsg =
          json?.error?.description ||
          json?.error?.message ||
          json?.message ||
          `HTTP ${response.status} ${response.statusText}`
        throw new Error(`Bling ERP [${method} ${path}]: ${baseMsg}${fields ? ` (${fields})` : ""}`)
      }

      return json as T
    }

    throw new Error("Bling ERP: Limite de requisições excedido após tentativas.")
  }

  /**
   * Valida se o token atual consegue consultar a API do Bling
   */
  async testConnection(): Promise<{ valid: boolean; message?: string }> {
    try {
      await this.request("/produtos", { query: { limite: 1, pagina: 1 } })
      return { valid: true }
    } catch (err: any) {
      return { valid: false, message: err?.message || "Token inválido ou expirado" }
    }
  }

  /**
   * Lista produtos paginados
   */
  async listProducts(options: { pagina?: number; limite?: number; codigo?: string } = {}): Promise<BlingProductSummary[]> {
    const res = await this.request<{ data?: BlingProductSummary[] }>("/produtos", {
      query: {
        pagina: options.pagina || 1,
        limite: options.limite || 100,
        ...(options.codigo ? { codigo: options.codigo } : {}),
      },
    })
    return Array.isArray(res?.data) ? res.data : []
  }

  /**
   * Obtém detalhes completos de um produto (incluindo variações, mídia e tributação)
   */
  async getProduct(id: number | string): Promise<BlingProductDetail> {
    const res = await this.request<{ data?: BlingProductDetail }>(`/produtos/${id}`)
    if (!res?.data) {
      throw new Error(`Produto ${id} não encontrado no Bling.`)
    }
    return res.data
  }

  /**
   * Consulta saldos (físico e virtual/disponível) de uma lista de IDs de produtos
   */
  async getProductStocks(idsProdutos: Array<number | string>): Promise<BlingStockBalance[]> {
    if (!idsProdutos.length) return []
    const res = await this.request<{ data?: BlingStockBalance[] }>("/estoques/saldos", {
      query: {
        "idsProdutos[]": idsProdutos,
      },
    })
    return Array.isArray(res?.data) ? res.data : []
  }

  /**
   * Lista depósitos cadastrados na conta do Bling
   */
  async listDeposits(): Promise<BlingDeposit[]> {
    const res = await this.request<{ data?: BlingDeposit[] }>("/depositos")
    return Array.isArray(res?.data) ? res.data : []
  }

  /**
   * Cria lançamento de estoque no Bling (operacao: 'B' = Balanço, 'E' = Entrada, 'S' = Saída)
   */
  async updateProductStock(params: {
    produtoId: number | string
    depositoId: number | string
    quantidade: number
    operacao?: "B" | "E" | "S"
    observacoes?: string
  }): Promise<any> {
    return this.request("/estoques", {
      method: "POST",
      body: {
        produto: { id: Number(params.produtoId) },
        deposito: { id: Number(params.depositoId) },
        operacao: params.operacao || "B",
        quantidade: Math.max(0, Number(params.quantidade || 0)),
        observacoes: (params.observacoes || "Atualizado via Dudit").substring(0, 100),
      },
    })
  }

  /**
   * Garante que um contato já existente no Bling tenha CPF/CNPJ e endereço preenchidos
   * (evita pendências cadastrais para emissão de NF-e quando o contato foi criado incompleto).
   */
  private async ensureContactComplete(
    contactId: number,
    customer: {
      nome: string
      numeroDocumento?: string
      tipo?: "F" | "J"
      email?: string
      telefone?: string
      endereco?: {
        endereco?: string
        numero?: string
        complemento?: string
        bairro?: string
        cep?: string
        municipio?: string
        uf?: string
      }
    }
  ): Promise<void> {
    const cleanDoc = customer.numeroDocumento?.replace(/\D/g, "") || ""
    const hasNewAddress = Boolean(customer.endereco?.endereco)
    if (!cleanDoc && !hasNewAddress) return

    try {
      const res = await this.request<{ data?: any }>(`/contatos/${contactId}`)
      const existing = res?.data
      if (!existing) return

      const existingDoc = String(existing.numeroDocumento || "").replace(/\D/g, "")
      const existingGeral = existing.endereco?.geral || {}
      const missingDoc = Boolean(cleanDoc && !existingDoc)
      const missingAddressFields = Boolean(
        hasNewAddress &&
          (!existingGeral.endereco ||
            !existingGeral.numero ||
            !existingGeral.bairro ||
            !existingGeral.cep ||
            !existingGeral.municipio ||
            !existingGeral.uf)
      )

      if (!missingDoc && !missingAddressFields) return

      const mergedGeral = {
        endereco: existingGeral.endereco || customer.endereco?.endereco || "",
        numero: existingGeral.numero || customer.endereco?.numero || "",
        complemento: existingGeral.complemento || customer.endereco?.complemento || "",
        bairro: existingGeral.bairro || customer.endereco?.bairro || "",
        cep: existingGeral.cep || customer.endereco?.cep || "",
        municipio: existingGeral.municipio || customer.endereco?.municipio || "",
        uf: existingGeral.uf || customer.endereco?.uf || "",
      }

      const finalDoc = existingDoc || cleanDoc
      const finalTipo =
        existing.tipo ||
        customer.tipo ||
        (finalDoc.length === 14 ? "J" : "F")

      const { id: _ignoredId, ...existingFields } = existing
      await this.request(`/contatos/${contactId}`, {
        method: "PUT",
        body: {
          ...existingFields,
          nome: existing.nome || customer.nome || "Cliente Dudit",
          tipo: finalTipo,
          situacao: existing.situacao || "A",
          ...(finalDoc ? { numeroDocumento: finalDoc } : {}),
          ...(existing.email || customer.email ? { email: existing.email || customer.email } : {}),
          ...(existing.telefone || customer.telefone ? { telefone: existing.telefone || customer.telefone } : {}),
          ...(mergedGeral.endereco
            ? {
              endereco: {
                ...(existing.endereco || {}),
                geral: mergedGeral,
              },
            }
            : {}),
        },
      })
    } catch (err: any) {
      console.warn(`[BLING] Aviso ao completar cadastro do contato ${contactId}:`, err?.message)
    }
  }

  /**
   * Busca ou cria um contato (cliente) no Bling — obrigatório para POST /pedidos/vendas
   */
  async findOrCreateContact(customer: {
    nome: string
    numeroDocumento?: string
    tipo?: "F" | "J"
    email?: string
    telefone?: string
    endereco?: {
      endereco?: string
      numero?: string
      complemento?: string
      bairro?: string
      cep?: string
      municipio?: string
      uf?: string
    }
  }): Promise<number> {
    const cleanDoc = customer.numeroDocumento?.replace(/\D/g, "")
    if (cleanDoc) {
      try {
        const search = await this.request<{ data?: Array<{ id: number; numeroDocumento?: string }> }>("/contatos", {
          query: { numeroDocumento: cleanDoc, limite: 5 },
        })
        const matched = (search?.data || []).find(
          (c) => String(c.numeroDocumento || "").replace(/\D/g, "") === cleanDoc
        )
        if (matched?.id) {
          await this.ensureContactComplete(matched.id, customer)
          return matched.id
        }
      } catch { }
    }

    if (customer.nome) {
      try {
        const searchByName = await this.request<{ data?: Array<{ id: number; nome?: string; email?: string }> }>("/contatos", {
          query: { pesquisa: customer.nome, limite: 5 },
        })
        const matched = (searchByName?.data || []).find(
          (c) =>
            (customer.email && c.email && c.email.toLowerCase() === customer.email.toLowerCase()) ||
            String(c.nome || "").trim().toLowerCase() === customer.nome.trim().toLowerCase()
        )
        if (matched?.id) {
          await this.ensureContactComplete(matched.id, customer)
          return matched.id
        }
      } catch { }
    }

    const created = await this.request<{ data?: { id: number } }>("/contatos", {
      method: "POST",
      body: {
        nome: customer.nome || "Cliente Dudit",
        tipo: customer.tipo || (cleanDoc && cleanDoc.length === 14 ? "J" : "F"),
        situacao: "A",
        ...(cleanDoc ? { numeroDocumento: cleanDoc } : {}),
        ...(customer.email ? { email: customer.email } : {}),
        ...(customer.telefone ? { telefone: customer.telefone } : {}),
        ...(customer.endereco?.endereco
          ? {
            endereco: {
              geral: {
                endereco: customer.endereco.endereco,
                numero: customer.endereco.numero || "",
                complemento: customer.endereco.complemento || "",
                bairro: customer.endereco.bairro || "",
                cep: customer.endereco.cep || "",
                municipio: customer.endereco.municipio || "",
                uf: customer.endereco.uf || "",
              },
            },
          }
          : {}),
      },
    })

    if (!created?.data?.id) {
      throw new Error("Bling ERP não retornou o ID do contato criado.")
    }
    return created.data.id
  }

  /**
   * Cria um pedido de venda no Bling ERP
   */
  async createOrder(payload: BlingOrderPayload): Promise<BlingOrderResponse> {
    const res = await this.request<{ data?: { id: number; numero?: number | string } }>("/pedidos/vendas", {
      method: "POST",
      body: payload,
    })
    if (!res?.data?.id) {
      throw new Error("Bling ERP não retornou o ID do pedido criado.")
    }
    return {
      id: res.data.id,
      numero: res.data.numero,
    }
  }

  /**
   * Altera a situação de um pedido de venda no Bling
   */
  async updateOrderStatus(blingOrderId: number | string, situacaoId: number): Promise<boolean> {
    await this.request(`/pedidos/vendas/${blingOrderId}/situacoes/${situacaoId}`, {
      method: "PATCH",
    })
    return true
  }

  /**
   * Lista situações disponíveis do módulo de Pedidos de Venda no Bling
   */
  async listOrderStatuses(): Promise<Array<{ id: number; nome: string }>> {
    try {
      const modRes = await this.request<{ data?: Array<{ id: number; nome: string }> }>("/situacoes/modulos")
      const vendasMod = (modRes?.data || []).find((m) =>
        String(m.nome || "").toLowerCase().includes("vendas")
      )
      if (!vendasMod?.id) return []
      const sitRes = await this.request<{ data?: Array<{ id: number; nome: string }> }>(
        `/situacoes/modulos/${vendasMod.id}`
      )
      return Array.isArray(sitRes?.data) ? sitRes.data : []
    } catch {
      return []
    }
  }

  /**
   * Busca detalhes de uma NF-e emitida no Bling
   */
  async getNfe(nfeId: number | string): Promise<BlingNfeDetail | null> {
    const res = await this.request<{ data?: BlingNfeDetail }>(`/nfe/${nfeId}`)
    return res?.data || null
  }
}

export function createBlingClient(accessToken: string): BlingClient {
  return new BlingClient(accessToken)
}
