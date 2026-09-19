# Favoritos na Vitrine Online

Os **favoritos** são o jeito rápido de salvar produtos e serviços que você gostou na Vitrine Online. Com um clique no coração (💚), você guarda itens em um local exclusivo e pode encontrá-los depois para comparar, revisitar ou comprar quando for o momento certo.

[IMAGEM: Produto com destaque no botão de favoritar, mostrando o ícone do coração em verde]

Legenda: O botão de coração💚 aparece sobre a imagem de cada produto. Clique para favoritar ou desfavoritar.

## Como favoritar um item

Favoritar um produto ou serviço é simples e rápido:

1. Navegue até o produto ou serviço que deseja salvar (pode ser em uma busca, categoria, seção de destaque ou página da loja).
2. Clique no ícone de **coração** (💚) que aparece sobre a imagem do item.
3. Pronto! O item foi salvo nos seus favoritos.

> [i] O ícone do coração fica **preenchido em verde** quando o item já está nos seus favoritos.

[IMAGEM: Detalhe do botão de favoritar sobre uma capa de produto]

## Onde acessar seus favoritos

Acesse todos os seus itens salvos em um único lugar:

- **Na web**: clique em **Favoritos** no cabeçalho da Vitrine Online (ícone do coração com a quantidade).
- **No app**: acesse o menu principal e toque em **Favoritos**.

Na página de favoritos, você vê todos os produtos e serviços que salvou, organizados por **tabs** e com opções de busca e ordenação.

## Organizando e filtrando favoritos

A página de favoritos oferece ferramentas para encontrar o que você procura rapidamente:

### Tabs por tipo de item

Os favoritos são separados em três abas:

| Aba | O que mostra |
| :--- | :--- |
| **Todos** | Produtos e serviços juntos |
| **Produtos** | Apenas produtos físicos |
| **Serviços** | Apenas serviços |

Cada aba mostra a **contagem** de itens entre parênteses, atualizada em tempo real.

### Busca

Use a **caixa de busca** na parte superior para filtrar seus favoritos por nome, SKU ou categoria. A busca é **debulada** (aguarda você parar de digitar por 300ms) para não sobrecarregar o sistema.

### Ordenação

Clique no botão de ordenação para escolher como os itens são exibidos:

| Opção | Como ordena |
| :--- | :--- |
| **Mais recentes** (padrão) | Itens favoritados primeiro, do mais novo para o mais antigo |
| **Menor preço** | Do mais barato ao mais caro |
| **Maior preço** | Do mais caro ao mais barato |
| **Nome (A-Z)** | Em ordem alfabética |

[IMAGEM: Tela da página de favoritos mostrando as abas, busca e botão de ordenação]

## Como remover um item dos favoritos

Você pode remover um item dos favoritos de duas formas:

1. **Na página de favoritos**: clique novamente no ícone de coração (💚) sobre o item que deseja remover. Ele sai da lista imediatamente.
2. **Na página do produto ou serviço**: clique no coração preenchido para desfavoritar.

> [i] A remoção é **otimista**: o item desaparece da lista na mesma tela, antes mesmo da confirmação no servidor. Se houver erro, o item volta automaticamente.

## Favoritos e autenticação

Para favoritar itens, você precisa estar **logado**:

| Situação | Comportamento |
| :--- | :--- |
| **Usuário logado** | O coração salva o item na sua conta. Fica disponível em todos os dispositivos. |
| **Usuário não logado** | Ao clicar no coração, você é redirecionado para a tela de login. Após entrar, o item é favoritado normalmente. |

## Como funciona o armazenamento

Os favoritos são salvos na tabela **favorites** do sistema, com os seguintes campos:

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `user_id` | UUID | Identificação do usuário |
| `item_id` | UUID | Identificação do produto ou serviço |
| `item_type` | Enum | Tipo do item: `produto`, `servico`, `parceiro` ou `loja` |
| `created_at` | Timestamp | Momento em que o item foi favoritado |

### Cache local e performance

Para deixar a experiência mais rápida, os favoritos são **cacheados localmente** (sessionStorage) enquanto você navega:

- Na primeira visita, o sistema busca seus favoritos no servidor.
- Depois disso, as informações ficam em cache por toda a sessão.
- Ao favoritar ou desfavoritar, a atualização é **otimista** (a interface reage antes da resposta do servidor).

### Contagem de favoritos

Você pode ver a quantidade total de itens favoritados no ícone de coração no cabeçalho da vitrine. A contagem é separada por tipo:

| Tipo | Onde aparece |
| :--- | :--- |
| Total | Ícone de coração no cabeçalho |
| Produtos | Aba "Produtos" na página de favoritos |
| Serviços | Aba "Serviços" na página de favoritos |

[IMAGEM: Cabeçalho da vitrine mostrando o ícone de coração com a contagem de favoritos]

## Integridade dos dados

O sistema mantém a **integridade** dos favoritos automaticamente:

| Situação | O que acontece |
| :--- | :--- |
| **Produto excluído** | Ele desaparece automaticamente da sua lista de favoritos na próxima visita |
| **Produto desativado ou sem estoque** | Ainda aparece na lista, mas pode não estar disponível para compra. O sistema tenta notificar visualmente. |
| **Serviço excluído** | Remove automaticamente da sua lista |
| **Loja desativada** | Itens da loja continuam listados, mas podem estar indisponíveis |

## Paginação

Os favoritos são exibidos com **paginação** para manter a página leve, mesmo com muitos itens:

- **24 itens por página**
- Navegação com botões "Anterior" e "Próximo"
- A página rola automaticamente para o topo ao trocar de página

## Boas práticas

**Use os favoritos com inteligência**
- Salve itens que realmente pretende comprar para não perder ofertas.
- Combine com **coleções** para organizar por objetivo (ex: " presentes de Natal", " itens de decoração").

**Acompanhe ofertas**
- Produtos favoritados que entram em promoção podem gerar notificações, dependendo das suas preferências.

**Limpeza periódica**
- Revise seus favoritos ocasionalmente e remova itens que não pretende mais comprar.

## Problemas comuns

**"Não consigo favoritar, aparece erro de login"**
- Você precisa estar logado na Dudit para favoritar. Faça login ou crie uma conta primeiro.
- Se já está logado, atualize a página. Em caso persista, limpe o cache do navegador.

**"Favoritos sumtiram depois de limpar o cache"**
- Se o cache local (sessionStorage) foi limpo, os favoritos ainda estão na sua conta no servidor. Faça login novamente e eles reaparecerão.

**"Item favoritado não aparece na lista"**
- O item pode ter sido excluído pelo vendedor entre o momento em que você favoritou e o acesso à página.
- Atualize a página para forçar a sincronização com o servidor.

**"A contagem do coração não bate com itens visíveis"**
- Isso pode acontecer se alguns itens foram excluídos desde a última contagem. A contagem correta aparece quando você acessa a página de favoritos.

## Perguntas frequentes

**Quantos itens posso favoritar?**
Não há limite. Salve quantos quiser!

**Favoritar influencia na compra?**
Não. Favoritar apenas salva o item para você encontrá-lo depois. A decisão de compra depende de você, do estoque e do preço no momento.

**Favoritos são privados?**
Sim. Apenas você vê os seus favoritos. Eles não são exibidos publicamente nem afetam o ranqueamento do produto de forma direta.

**Posso favoritar um serviço?**
Sim. Favoritos funcionam tanto para produtos quanto para serviços, lojas e parceiros.

**Favoritar um item me envia notificação?**
Por padrão, não. Mas produtos em promoção podem ser destacados na sua lista de favoritos.

