# Gerenciando entregadores e criando rotas

A seção de **Expedição e entregas** organiza a logística da sua loja. Você cadastra entregadores, agrupa pedidos em rotas inteligentes e acompanha cada entrega até a confirmação.

O sistema sugere agrupamentos de pedidos por região (CEP ou bairro) para otimizar as rotas e reduzir o tempo de deslocamento.

[IMAGEM: Tela principal de entregas com listagem de rotas e entregadores]
Legenda: Visão geral da expedição com entregas ativas.

## Quando utilizar

- Você tem pedidos com entrega pendente e precisa organizar a logística.
- Quer cadastrar um novo entregador (funcionário ou motoboy).
- Precisa agrupar vários pedidos em uma mesma rota de entrega.
- Quer otimizar as rotas para economizar tempo e combustível.

## Como gerenciar entregadores

### Cadastrar um entregador

1. No menu lateral, clique em **Vendas > Expedição e entregas**.
2. Acesse a seção **Entregadores**.
3. Clique em **Novo entregador**.

[IMAGEM: Formulário de cadastro de entregador]
Legenda: Informe os dados básicos e o status ativo.

4. Preencha:
   - **Nome** do entregador.
   - **Telefone** para contato (opcional).
   - **Observações** (opcional - ex: "Disponível apenas à tarde").
5. Clique em **Salvar**.

### Editar ou desativar entregador

Na lista de entregadores, você pode:

- **Editar** - Alterar nome, telefone ou observações.
- **Ativar/Desativar** - Um entregador desativado não aparece nas opções ao criar novas entregas. As entregas antigas continuam registradas.

### Estatísticas do entregador

Para cada entregador, o sistema mostra:

- **Entregas ativas** - Quantas estão em andamento no momento.
- **Entregas concluídas** - Total já finalizado.
- **Tempo médio** por entrega.

## Como criar uma entrega

### Sugestões inteligentes de rota

Antes de criar manualmente, veja as **sugestões inteligentes**. O sistema analisa os pedidos pendentes e agrupa por proximidade (mesmo CEP ou bairro):

1. Na tela de entregas, clique em **Sugestões de rota**.
2. O sistema exibe grupos de pedidos organizados por região.

[IMAGEM: Sugestões inteligentes com pedidos agrupados por região]
Legenda: Cada sugestão mostra os pedidos, distância total e tempo estimado.

3. Escolha um grupo e clique em **Criar entrega**.
4. Opcional: ajuste os pedidos incluídos, escolha o entregador e a data/hora de saída.
5. Confirme.

### Criar entrega manualmente

Se preferir montar a rota você mesmo:

1. Clique em **Nova entrega**.
2. **Selecione os pedidos** - Busque pelos pedidos com entrega pendente. Eles aparecem com endereço e valor do frete.

[IMAGEM: Seleção de pedidos para compor a entrega]
Legenda: Selecione um ou mais pedidos para a mesma rota.

3. **Atribua um entregador** (opcional) - Se não atribuir agora, pode fazer depois.
4. Informe a **data e hora de saída**.
5. Adicione **observações** (opcional - ex: "Entregar após as 14h").
6. Clique em **Criar entrega**.

Após criar, a entrega aparece na listagem com status **Pendente**. O entregador designado consegue visualizar os detalhes no sistema (se tiver perfil de acesso).

## Como visualizar a rota

Na tela de detalhes da entrega, você vê:

- **Lista de pedidos** na ordem da rota.
- **Mapa** com os pontos de entrega (se o endereço foi geolocalizado).
- **Distância total** estimada da rota.
- **Entregador** responsável.

[IMAGEM: Detalhes da entrega com mapa e pontos da rota]
Legenda: Visualize a rota completa e a ordem das entregas.

## Dicas importantes

- As **sugestões inteligentes** consideram pedidos que ainda não estão em nenhuma entrega ativa e que têm endereço válido.
- Entregadores com perfil de acesso restrito veem apenas as entregas atribuídas a eles.
- Você pode alterar o entregador ou os pedidos de uma entrega enquanto ela estiver com status **Pendente** ou **Em preparação**.
- A distância e o tempo estimado são calculados com base nos endereços. Se estiverem incorretos, verifique os endereços dos pedidos.

## Problemas comuns

**"Não consigo criar sugestões inteligentes."**
Esse recurso está disponível apenas no plano **Escalar**. Se você usa o plano Crescer, pode criar entregas manualmente (até 1 pedido por entrega).

**"Um pedido que deveria aparecer não está na lista."**
Verifique se o pedido não está em outra entrega ativa, se o status não é "Cancelado" e se o endereço de entrega está preenchido.

## Perguntas frequentes

**Quantos pedidos posso colocar em uma entrega?**
Depende do seu plano. No plano Crescer, 1 pedido por entrega. No plano Escalar, até 20 pedidos por entrega.

**O entregador precisa ter acesso ao sistema?**
Sim, o entregador precisa ter um perfil de usuário com a função "Entregador" para visualizar as entregas atribuídas.

**Posso imprimir a rota para o entregador?**
A rota é visualizada na tela. Se precisar de uma versão impressa, você pode usar a lista de pedidos como referência.

---

**Artigo relacionado:** [Acompanhando entregas](./12-entregas-acompanhamento.md)
**Próximo artigo:** [Acompanhando entregas](./12-entregas-acompanhamento.md)
