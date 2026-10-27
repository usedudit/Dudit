import "server-only"

type DbClient = {
  from: (table: string) => any
}

export interface PublishGateTarget {
  /** Valor que a action vai gravar em stores.is_active (quando aplicável). */
  isActive?: boolean | null
  /** Valor que a action vai gravar em stores.is_showcase_active (quando aplicável). */
  isShowcaseActive?: boolean | null
}

/**
 * Gate de publicação da loja.
 *
 * O MEI que ainda não informou CNPJ não consegue emitir documento fiscal para
 * comprador PJ, então não deve ir ao ar nesse estado. O bloqueio acontece
 * apenas na transição para ligado: lojas já publicadas continuam editáveis
 * (inclusive para desligar), evitando travar correções cadastrais.
 *
 * Retorna a mensagem de erro ou null quando a publicação é permitida.
 */
export async function getFiscalPublishBlockReason(
  db: DbClient,
  storeId: string,
  next: PublishGateTarget,
): Promise<string | null> {
  if (next.isActive !== true && next.isShowcaseActive !== true) return null

  const { data: store } = await db
    .from("stores")
    .select(
      "cnpj, crt, is_active, is_showcase_active, fiscal_entities(tax_profile, document)",
    )
    .eq("id", storeId)
    .maybeSingle()

  if (!store) return null

  const row = store as any
  const entity = row.fiscal_entities
  const taxProfile = entity?.tax_profile
  const hasDocument = Boolean(entity?.document || row.cnpj)
  const declaredMei = taxProfile === "mei" || row.crt === "4"

  if (!declaredMei || hasDocument) return null

  const turningOn =
    (next.isActive === true && row.is_active !== true) ||
    (next.isShowcaseActive === true && row.is_showcase_active !== true)

  if (!turningOn) return null

  return "Informe o CNPJ nos dados do negócio antes de publicar a loja. Sem CNPJ o MEI não consegue emitir nota fiscal para clientes PJ."
}
