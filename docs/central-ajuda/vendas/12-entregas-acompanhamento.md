# Acompanhando entregas

Depois que a entrega é criada e o entregador sai para a rota, você acompanha cada etapa em tempo real. O sistema permite atualizar o status de cada pedido individualmente ou da entrega como um todo.

Quando todos os pedidos de uma rota são concluídos, a entrega é finalizada automaticamente.

[IMAGEM: Detalhes da entrega com status de cada pedido]
Legenda: Cada pedido na rota mostra seu status individual.

## Quando utilizar

- O entregador saiu para a rota e você quer marcar a entrega como "Saiu para entrega".
- Um pedido foi entregue e você quer registrar a confirmação.
- Houve uma falha na entrega (cliente ausente, endereço errado) e você precisa registrar.
- Quer consultar métricas de desempenho das entregas.

## Status da entrega

Cada entrega passa pelos seguintes status:

| Status | Significado |
|---|---|
| **Pendente** | Criada, aguardando início. |
| **Em preparação** | Pedidos estão sendo separados. |
| **Saiu para entrega** | O entregador está a caminho. |
| **Entregue** | Todos os pedidos foram concluídos. |
| **Falha na entrega** | Todos os pedidos falharam. |
| **Cancelada** | A entrega foi cancelada. |

Cada **pedido dentro da entrega** também tem seu próprio status (Pendente, Saiu, Entregue, Falha), permitindo controle individual.

## Como atualizar o status

### Status geral da entrega

1. Abra a entrega que deseja atualizar.
2. Clique no botão de status atual.
3. Escolha o novo status:
   - **Em preparação** - Os pedidos estão sendo separados.
   - **Saiu para entrega** - O entregador saiu para a rota.
   - **Entregue** - Todos os pedidos foram entregues (disponível apenas quando todos estiverem concluídos).
   - **Cancelada** - A entrega não será realizada.

[IMAGEM: Opções de atualização de status da entrega]
Legenda: O sistema mostra apenas os status disponíveis para a etapa atual.

### Status por pedido (individual)

Se você precisa atualizar pedidos um a um (útil quando a rota tem múltiplas paradas):

1. Abra a entrega.
2. Localize o pedido na lista.
3. Clique em **Atualizar status** ao lado do pedido.
4. Escolha: **Entregue** ou **Falha na entrega**.

[IMAGEM: Atualização de status por pedido individual]
Legenda: Atualize cada pedido conforme o entregador confirma a entrega.

Quando o último pedido da rota é concluído (entregue ou falha), a entrega é finalizada automaticamente:

- Se **ao menos um** pedido foi entregue, a entrega é concluída como **Entregue**.
- Se **nenhum** pedido foi entregue (todos falharam), a entrega é concluída como **Falha na entrega**.

## Como funciona a confirmação pelo entregador

Se o entregador tem acesso ao sistema (perfil "Entregador"), ele pode:

- Visualizar as entregas atribuídas a ele.
- Ver a lista de pedidos e endereços da rota.
- Atualizar o status de cada pedido (entregue / falha) diretamente pelo celular.

Isso agiliza a comunicação: não precisa ligar para a loja a cada entrega concluída.

## Métricas e relatórios

Na seção de entregas, você encontra um painel com métricas:

- **Total de entregas** no período.
- **Entregas concluídas** vs. **ativas**.
- **Taxa de conclusão** (percentual de entregas finalizadas com sucesso).
- **Tempo médio** por entrega.
- **Distância total percorrida**.
- **Média de pedidos por entrega**.
- **Ranking de entregadores** - Quem entregou mais e o tempo médio de cada um.

[IMAGEM: Painel de métricas de entregas]
Legenda: Acompanhe o desempenho da sua operação logística.

## Dicas importantes

- Atualizar o status **por pedido** dá mais visibilidade do que está acontecendo na rota.
- Quando um pedido é marcado como **Entregue**, o frete é automaticamente contabilizado como comissão para o entregador (se configurado).
- Se o entregador usa o sistema pelo celular, ele mesmo pode atualizar os status - você só acompanha.
- Pedidos com **Falha na entrega** podem ser reagendados e incluídos em uma nova rota.

## Problemas comuns

**"Marquei um pedido como entregue sem querer."**
Você pode reverter o status se a entrega ainda não foi finalizada. Abra o pedido na entrega e altere novamente.

**"A entrega não finalizou sozinha."**
Verifique se todos os pedidos têm status "Entregue" ou "Falha". Se algum ainda estiver como "Pendente" ou "Saiu", a entrega não finaliza.

## Perguntas frequentes

**O entregador vê o valor do pedido?**
Depende da configuração de permissões. Por padrão, o entregador vê apenas os dados necessários para a entrega (endereço, nome do cliente, itens).

**Posso cancelar uma entrega que já saiu?**
Sim, mas apenas se todos os pedidos ainda estiverem pendentes. Se algum já foi entregue, não é possível cancelar.

**O sistema envia notificação para o cliente quando a entrega sai?**
Sim. Se o cliente tem WhatsApp cadastrado, ele recebe uma notificação automática quando a entrega é atualizada para "Saiu para entrega".

---

**Artigo relacionado:** [Gerenciando entregadores e criando rotas](./11-entregas-gerenciamento.md)
**Próximo artigo:** [Definindo e acompanhando metas de vendas](./13-metas-vendas.md)
