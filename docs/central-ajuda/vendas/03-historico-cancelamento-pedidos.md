# Histórico e cancelamento de pedidos

Todo pedido na plataforma mantém um registro automático de todas as alterações feitas. Isso permite que você acompanhe cada etapa e, se necessário, cancele um pedido de forma segura.

[IMAGEM: Aba de histórico dentro dos detalhes do pedido]
Legenda: O histórico mostra quem fez cada alteração e quando.

## Quando utilizar

- Para consultar quando um pedido foi criado, pago ou enviado.
- Para verificar quem alterou o status de pagamento ou entrega.
- Para cancelar um pedido que não será concluído.
- Para confirmar detalhes em caso de contestação do cliente.

## Como funciona

### Histórico de alterações

Cada vez que alguém modifica um pedido (status, itens, valores, endereço), o sistema registra:

- **Quem** fez a alteração (nome do usuário).
- **O que** mudou (descrição da alteração).
- **Quando** aconteceu (data e hora).

Para visualizar, abra o pedido e clique na aba **Histórico**. As entradas aparecem em ordem cronológica, da mais recente para a mais antiga.

[IMAGEM: Linha do tempo do histórico com entradas detalhadas]
Legenda: Cada evento é registrado com data, hora e descrição.

### Cancelamento de pedido

Para cancelar um pedido:

1. Abra o pedido que deseja cancelar.
2. Clique em **Cancelar pedido**.

[IMAGEM: Botão de cancelamento no topo da tela de detalhes]
Legenda: O cancelamento fica disponível em pedidos que ainda não foram finalizados.

3. Informe o **motivo do cancelamento** (opcional, mas recomendado para manter o registro).
4. Confirme o cancelamento.

Após confirmar:

- O status do pedido muda para **Cancelado**.
- O **estoque** dos itens é restaurado automaticamente.
- O valor pago (se houver) não é estornado automaticamente - você precisa processar o reembolso manualmente pela seção de [Devoluções e trocas](./06-devolucoes-trocas.md).

## O que acontece com o estoque

Quando um pedido é cancelado, o sistema automaticamente devolve os itens ao estoque. Por exemplo: se o pedido tinha 5 camisetas, essas 5 unidades voltam a ficar disponíveis.

Isso vale para pedidos que já tiveram o estoque baixado (pedidos com status "Pago" ou "Em preparação").

## Dicas importantes

- Cancelen apenas pedidos que não serão concluídos. Se o cliente quer trocar um item, prefira usar a seção de **Devoluções e trocas**.
- O histórico é útil para auditoria. Incentive sua equipe a registrar observações relevantes ao alterar pedidos.
- Pedidos cancelados continuam aparecendo na listagem, mas com o status "Cancelado". Você pode filtrar para ocultá-los se preferir.

## Problemas comuns

**"Cancelei o pedido mas o produto ainda aparece no estoque."**
Verifique se o pedido já tinha o estoque baixado. Pedidos com status "Pendente" ou "Não pago" geralmente não baixam o estoque - nesse caso não há o que restaurar.

**"Preciso desfazer um cancelamento."**
Não é possível reverter um cancelamento. Você precisará criar um novo pedido com os mesmos itens.

## Perguntas frequentes

**O cancelamento estorna o pagamento automaticamente?**
Não. O cancelamento apenas altera o status do pedido e restaura o estoque. Para estornar o pagamento, você deve abrir uma solicitação de devolução ou reembolso.

**Consigo cancelar um pedido que já foi entregue?**
Sim, é possível. Mas lembre-se de que o estoque será restaurado e você precisará combinar a logística de retorno com o cliente.

**Quem pode cancelar um pedido?**
Usuários com permissão de gestão (proprietário, administrador ou gerente). Operadores podem ter permissão limitada dependendo da configuração da sua loja.

---

**Artigo relacionado:** [Criando e gerenciando pedidos](./02-pedidos.md)
**Próximo artigo:** [Criando e enviando orçamentos](./04-orcamentos-criacao.md)
