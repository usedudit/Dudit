# Processando solicitações de devolução

Depois que uma solicitação de devolução ou troca é criada, cabe à gestão da loja analisar e processar. Esta etapa envolve aprovar ou rejeitar a solicitação, definir valores de reembolso, configurar itens de troca e concluir o processo.

[IMAGEM: Tela de detalhes de uma solicitação de devolução]
Legenda: Todas as informações da solicitação em um só lugar.

## Quando utilizar

- Recebeu uma nova solicitação e precisa analisar.
- O cliente entrou em contato e você quer acelerar o processo.
- Precisa processar um reembolso pelo Mercado Pago ou manualmente.
- Vai configurar uma troca com itens diferentes do pedido original.

## Como analisar uma solicitação

1. No menu lateral, clique em **Vendas > Devoluções e trocas**.
2. Localize a solicitação com status **Pendente análise** ou **Em análise**.
3. Clique para abrir os detalhes.

Na tela de detalhes você encontra:

- **Itens devolvidos** — Lista com quantidades, motivo e condição de cada item.
- **Evidências** — Fotos enviadas pelo cliente (se houver).
- **Resolução desejada** — O que o cliente espera (troca, reembolso, crédito).
- **Histórico** — Linha do tempo com eventos da solicitação.

[IMAGEM: Aba de histórico com eventos registrados]
Legenda: Acompanhe cada etapa do processamento.

## Como aprovar ou rejeitar

**Para aprovar:**

1. Clique em **Processar solicitação**.
2. Defina as configurações:
   - **Ação:** "Aprovar".
   - **Próximo status:** "Aprovado" ou "Em processamento".
   - **Valor do reembolso** (se aplicável).
   - **Valor do crédito na loja** (se aplicável).
   - **Itens de troca** (se for troca — veja abaixo).
   - **Restituir ao estoque:** marque se os produtos devolvidos devem voltar ao estoque.

3. Clique em **Confirmar**.

**Para rejeitar:**

1. Clique em **Processar solicitação**.
2. Defina:
   - **Ação:** "Rejeitar".
   - **Próximo status:** "Rejeitado".
   - **Observações:** Explique o motivo da rejeição.
3. Clique em **Confirmar**.

## Como configurar uma troca

Se a resolução for **Troca**, você precisa informar quais produtos serão enviados no lugar dos devolvidos:

1. Na tela de processamento, vá até a seção **Itens de troca**.
2. Adicione os novos produtos que substituirão os devolvidos.
3. Informe quantidade e preço unitário de cada item de troca.
4. Se houver **diferença de valor**:
   - Se os itens de troca forem **mais caros**, o cliente pode pagar a diferença (o sistema permite configurar).
   - Se forem **mais baratos**, você pode reembolsar a diferença ou converter em crédito na loja.

[IMAGEM: Configuração de itens de troca com diferença de valor]
Legenda: O sistema calcula a diferença automaticamente.

## Como processar reembolso

### Reembolso manual (PIX, depósito, dinheiro)

1. Durante o processamento, informe o **valor do reembolso**.
2. Selecione **Reembolso manual** como método.
3. O sistema registra a transação financeira. O pagamento ao cliente é feito por fora (via PIX, transferência, etc.).

### Reembolso pelo Mercado Pago

Se o pagamento original foi processado pelo Mercado Pago:

1. Durante o processamento, informe o **valor do reembolso**.
2. Selecione **Mercado Pago** como método de reembolso.
3. O sistema processa o estorno automático junto ao Mercado Pago. O valor volta para o cliente na forma de pagamento original (cartão ou PIX).

> ⚠️ **Atenção:** O reembolso pelo Mercado Pago está limitado ao valor pago por esse meio. Se o cliente pagou parte no dinheiro e parte no cartão, apenas a parte do cartão pode ser estornada automaticamente.

## Como conceder crédito na loja

Se a resolução for **Crédito na loja**:

1. Durante o processamento, informe o **valor do crédito**.
2. Confirme. O valor fica disponível para o cliente usar em compras futuras.
3. Na próxima compra do cliente, o crédito aparece como opção de pagamento.

## Itens devolvidos: restituir ao estoque

Ao processar uma devolução, você decide se os itens devolvidos voltam ao estoque:

- **Sim** — Os produtos são adicionados de volta ao estoque automaticamente.
- **Não** — O estoque não é alterado (útil para itens danificados que serão descartados).

## Dicas importantes

- Sempre registre **observações** ao processar. Isso ajuda em auditorias futuras.
- Para trocas, verifique o **estoque dos itens de troca** antes de aprovar. Se não tiver, combinar outra opção com o cliente.
- O reembolso pelo Mercado Pago pode levar alguns dias para aparecer na fatura do cliente.
- Se o cliente pediu troca mas o produto não foi entregue ainda, o sistema bloqueia. Troca só vale para pedidos já concluídos.

## Problemas comuns

**"Tentei reembolsar pelo Mercado Pago mas deu erro."**
Verifique se o pedido foi pago pelo Mercado Pago e se o token de acesso está ativo. Em caso de erro, o sistema registra o motivo. Você pode tentar novamente ou optar pelo reembolso manual.

**"A diferença da troca ficou negativa e não sei o que fazer."**
Se o cliente escolheu itens mais baratos, você decide: reembolsar a diferença ou dar como crédito na loja. Ambas as opções estão disponíveis no processamento.

## Perguntas frequentes

**O cliente pode alterar a solicitação depois de criada?**
Não diretamente. Se precisar de ajustes, você pode rejeitar e pedir para o cliente criar uma nova, ou ajustar manualmente durante o processamento.

**O que são solicitações "Escaladas"?**
São solicitações que foram enviadas para análise da equipe Dudit, geralmente em casos de divergência entre loja e cliente no marketplace.

**Preciso esperar o produto ser devolvido para processar o reembolso?**
Não necessariamente. Você pode definir o fluxo: aprovar primeiro, aguardar o item chegar e depois processar o reembolso. O status "Aguardando item" foi feito para isso.

---

**Artigo relacionado:** [Solicitando devolução ou troca](./09-devolucoes-solicitação.md)
**Próximo artigo:** [Gerenciando entregadores e criando rotas](./11-entregas-gerenciamento.md)
