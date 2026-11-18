import "server-only"

const TINY_API_BASE_URL = "https://api.tiny.com.br/api2"

export interface TinyProductSummary {
  id: string | number
  nome: string
  codigo?: string
  preco?: number | string
  preco_promocional?: number | string
  unidade?: string
}

export interface TinyProductDetail {
  id: string | number
  nome: string
  codigo?: string
  unidade?: string
  preco: number | string
  preco_promocional?: number | string
  ncm?: string
  gtin?: string
  origem?: string
  situacao?: string
  tipo?: string
  peso_liquido?: number | string
  peso_bruto?: number | string
  estoque_minimo?: number | string
  estoque_maximo?: number | string
  saldo?: number | string
  observacoes?: string
  anexos?: Array<{ anexo: string }>
  imagens?: Array<{ url: string }>
}

export interface TinyStockInfo {
  id: string | number
  nome: string
  codigo?: string
  unidade?: string
  saldo: number
  saldoReservado?: number
  deposito?: string
}

export interface TinyOrderCustomer {
  nome: string
  tipo_pessoa?: "F" | "J"
  cpf_cnpj?: string
  ie?: string
  rg?: string
  endereco?: string
  numero?: string
  complemento?: string
  bairro?: string
  cep?: string
  cidade?: string
  uf?: string
  fone?: string
  email?: string
}

export interface TinyOrderDeliveryAddress {
  nome_destinatario?: string
  tipo_pessoa?: "F" | "J"
  cpf_cnpj?: string
  endereco?: string
  numero?: string
  complemento?: string
  bairro?: string
  cep?: string
  cidade?: string
  uf?: string
  fone?: string
}

export interface TinyOrderItem {
  item: {
    codigo?: string
    descricao: string
    unidade?: string
    quantidade: number
    valor_unitario: number
  }
}

export interface TinyOrderPayload {
  pedido: {
    data_pedido?: string
    cliente: TinyOrderCustomer
    endereco_entrega?: TinyOrderDeliveryAddress
    itens: TinyOrderItem[]
    forma_pagamento?: string
    meio_pagamento?: string
    forma_envio?: string
    forma_frete?: string
    frete_por_conta?: "R" | "D" | "T" | "3" | "4" | "S"
    valor_frete?: number
    valor_desconto?: number
    outras_despesas?: number
    total_produtos?: number
    total_pedido?: number
    numero_ordem_compra?: string
    codigo_rastreamento?: string
    url_rastreamento?: string
    obs?: string
  }
}

export interface TinyOrderResponse {
  id: string | number
  numero: string | number
}

export class TinyClient {
  private token: string

  constructor(token: string) {
    if (!token || !token.trim()) {
      throw new Error("Token de API do Tiny é obrigatório.")
    }
    this.token = token.trim()
  }

  private async request<T = any>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
    const url = `${TINY_API_BASE_URL}/${endpoint}`
    const bodyParams = new URLSearchParams()
    bodyParams.append("token", this.token)
    bodyParams.append("formato", "json")

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        bodyParams.append(key, typeof value === "object" ? JSON.stringify(value) : String(value))
      }
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: bodyParams.toString(),
      cache: "no-store",
    })

    if (!response.ok) {
      throw new Error(`Erro na chamada Tiny API (${response.status}): ${response.statusText}`)
    }

    const data = await response.json()
    const retorno = data?.retorno

    if (!retorno) {
      throw new Error("Resposta inválida do Tiny ERP.")
    }

    if (retorno.status === "Erro" || retorno.status_processamento === 1) {
      const errList = retorno.erros || []
      const msg = Array.isArray(errList)
        ? errList.map((e: any) => e.erro || e).join("; ")
        : String(retorno.erros?.erro || "Erro na API do Tiny")
      throw new Error(`Tiny ERP: ${msg}`)
    }

    return retorno as T
  }

  /**
   * Testa se o token fornecido é válido consultando a pesquisa de produtos
   */
  async testConnection(): Promise<{ valid: boolean; message?: string }> {
    try {
      await this.request("produtos.pesquisa.php", { pesquisa: "", pagina: 1 })
      return { valid: true }
    } catch (err: any) {
      return { valid: false, message: err?.message || "Token inválido ou sem permissão" }
    }
  }

  /**
   * Pesquisa lista de produtos
   */
  async searchProducts(options: { pesquisa?: string; pagina?: number } = {}): Promise<{
    produtos: Array<{ produto: TinyProductSummary }>
    numero_paginas?: number
  }> {
    const res = await this.request("produtos.pesquisa.php", {
      pesquisa: options.pesquisa || "",
      pagina: options.pagina || 1,
    })

    const produtos = res.produtos || []
    return {
      produtos: Array.isArray(produtos) ? produtos : [],
      numero_paginas: res.numero_paginas ? Number(res.numero_paginas) : 1,
    }
  }

  /**
   * Obtém detalhes completos de um produto específico
   */
  async getProduct(id: string | number): Promise<TinyProductDetail> {
    const res = await this.request("produto.obter.php", { id: String(id) })
    if (!res.produto) {
      throw new Error(`Produto com ID ${id} não encontrado no Tiny.`)
    }
    return res.produto as TinyProductDetail
  }

  /**
   * Obtém estoque de um produto específico
   */
  async getProductStock(id: string | number): Promise<TinyStockInfo> {
    const res = await this.request("produto.obter.estoque.php", { id: String(id) })
    if (!res.produto) {
      throw new Error(`Estoque do produto ${id} não encontrado no Tiny.`)
    }
    const p = res.produto
    return {
      id: p.id,
      nome: p.nome,
      codigo: p.codigo,
      unidade: p.unidade,
      saldo: Number(p.saldo || 0),
      saldoReservado: Number(p.saldoReservado || 0),
      deposito: p.deposito,
    }
  }

  /**
   * Cria um pedido de venda no Tiny ERP
   */
  async createOrder(payload: TinyOrderPayload): Promise<TinyOrderResponse> {
    const res = await this.request("pedido.incluir.php", {
      pedido: JSON.stringify(payload),
    })

    const registros = res.registros?.registro
    if (!registros) {
      throw new Error("Tiny não retornou informações do pedido gerado.")
    }

    return {
      id: registros.id,
      numero: registros.numero,
    }
  }

  /**
   * Altera a situação de um pedido no Tiny ERP
   * Situações aceitas: 'aberto', 'aprovado', 'preparando_envio', 'faturado', 'pronto_envio', 'enviado', 'entregue', 'cancelado', 'nao_entregue'
   */
  async updateOrderStatus(
    id: string | number,
    situacao: "aberto" | "aprovado" | "preparando_envio" | "faturado" | "pronto_envio" | "enviado" | "entregue" | "cancelado" | "nao_entregue"
  ): Promise<boolean> {
    await this.request("pedido.alterar.situacao.php", {
      id: String(id),
      situacao,
    })
    return true
  }

  /**
   * Atualiza o código e URL de rastreamento de um pedido no Tiny ERP
   */
  async updateOrderTracking(params: {
    id: string | number
    codigoRastreamento: string
    urlRastreamento?: string
    enviarEmail?: "S" | "N"
  }): Promise<boolean> {
    await this.request("pedido.atualizar.rastreamento.php", {
      id: String(params.id),
      codigo_rastreamento: params.codigoRastreamento,
      url_rastreamento: params.urlRastreamento || "",
      enviar_email: params.enviarEmail || "N",
    })
    return true
  }
}

export function createTinyClient(token: string): TinyClient {
  return new TinyClient(token)
}
