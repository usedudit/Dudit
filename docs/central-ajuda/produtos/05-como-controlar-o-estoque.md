# Como controlar o estoque

O controle de estoque ajuda você a saber exatamente quantos produtos têm disponíveis, evitar vendas de itens sem estoque e organizar as entradas e saídas da sua loja.

[IMAGEM: Página de listagem de produtos com indicadores de estoque]
Legenda: Acompanhe o estoque de cada produto diretamente na listagem.

## Como funciona

O estoque funciona de forma simples:

- **Estoque atual**: quantidade disponível para venda
- **Estoque mínimo**: quantidade ideal para reabastecer
- **Estoque reservado**: itens que já foram vendidos mas ainda não saíram do estoque

### Situações do estoque

Cada produto recebe um indicador visual baseado no seu estoque:

- **Normal** (verde): estoque acima do mínimo configurado
- **Baixo** (amarelo): estoque igual ou abaixo do mínimo
- **Esgotado** (vermelho): estoque zero

[IMAGEM: Abas de filtro na listagem com "Normal", "Baixo" e "Esgotado"]
Legenda: Use as abas para ver rapidamente a situação do estoque.

## Quando o estoque aumenta

O estoque de um produto aumenta automaticamente quando:

- Você **registra uma entrada manual** (compra de fornecedor, devolução de cliente)
- Você **importa um XML** de uma nota fiscal de entrada
- Você **estorna** uma saída (devolve itens que foram removidos)

## Quando o estoque diminui

O estoque diminui automaticamente quando:

- Um **pedido é confirmado** na loja (baixa automática)
- Você **registra uma saída manual** (venda, ajuste, perda, uso interno)
- Você **estorna** uma entrada (remove itens que foram adicionados)

## Como registrar movimentações

### Passo a passo

1. No menu lateral, clique em **Movimentação de Estoque**.
2. Clique em **Nova movimentação**.

[IMAGEM: Página de movimentações com botão "Nova movimentação"]
Legenda: Inicie o registro de uma movimentação de estoque.

### 3. Escolher o tipo

- **Entrada**: para adicionar itens ao estoque
- **Saída**: para remover itens do estoque

### 4. Adicionar produtos

Busque por nome ou SKU do produto. Você pode adicionar vários itens em uma mesma movimentação.

[IMAGEM: Campo de busca de produtos na tela de movimentação]
Legenda: Busque e adicione produtos à movimentação.

### 5. Definir quantidades

Para cada produto, informe a quantidade. Em saídas, a quantidade não pode ultrapassar o estoque disponível.

### 6. Escolher o motivo

**Para entradas:**
- Compra de Fornecedor
- Devolução de Cliente
- Ajuste de Estoque
- Outro (permitindo descrever o motivo)

**Para saídas:**
- Avaria / Perda
- Ajuste de Estoque
- Uso Interno
- Outro (permitindo descrever o motivo)

### 7. Salvar

Clique em **Salvar** para registrar a movimentação. O estoque dos produtos será atualizado automaticamente.

## Permitir vender sem estoque

Para cada produto, você pode ativar a opção **"Permitir vender sem estoque"**. Quando ativada:

- O produto pode ser comprado mesmo com estoque zerado
- O estoque fica negativo (representando vendas além do disponível)
- Útil para produtos sob encomenda ou serviços

## Dicas importantes

- **Registre todas as entradas e saídas**: manter o histórico completo evita diferenças entre o estoque físico e o sistema.
- **Configure o estoque mínimo**: assim você recebe alertas visuais quando chegar a hora de reabastecer.
- **Use motivos descritivos**: ao registrar movimentações, escolher o motivo certo ajuda a entender o histórico depois.
- **Verifique o estoque antes de registrar saídas**: o sistema bloqueia saídas com quantidade maior que o disponível.

## Perguntas frequentes

**Como vejo o histórico de movimentações de um produto?**
Acesse a página de **Movimentação de Estoque**. Todas as entradas e saídas registradas aparecem listadas com data, motivo e quantidade.

**Posso desfazer uma movimentação?**
Sim. Na página de detalhes da movimentação, há a opção "Desfazer". O sistema cria automaticamente uma movimentação inversa para corrigir o estoque.

**O que é "Estoque Reservado"?**
São itens que foram comprados mas o pedido ainda não foi finalizado. Assim que o pedido é concluído, o estoque reservado se transforma em baixa definitiva.

**O estoque mínimo impede a venda quando é atingido?**
Não. O estoque mínimo é apenas um alerta visual. A venda continua normalmente, a menos que o estoque chegue a zero (a menos que "Permitir vender sem estoque" esteja ativado).
