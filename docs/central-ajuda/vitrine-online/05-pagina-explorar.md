# Página de Explorar

A página **Explorar** é o coração da navegação na Vitrine Online. É aqui que você encontra produtos, serviços e lojas perto de você - seja buscando algo específico ou descobrindo novidades pela sua região.

[IMAGEM: Tela da página Explorar mostrando categorias em círculos e carrosséis de itens em destaque]

Legenda: Comece explorando uma categoria ou pesquisando pelo que precisa.

## Como acessar a página Explorar

Você pode chegar na página Explorar de diversas formas:

| Forma de acesso | O que acontece |
| :--- | :--- |
| **Menu principal** | Clique em **Explorar** no cabeçalho. |
| **Busca** | Digite algo na barra de busca e pressione Enter. |
| **Link direto** | Acesse `/explorar`, `/explorar/[cidade]`, `/explorar/[cidade]/[categoria]` ou `/explorar/estado-[uf]`. |
| **Categoria** | Clique em uma categoria no grid inicial da Explorar. |

## Como funciona a localização

A página Explorar adapta os resultados automaticamente à sua localização. O sistema tenta resolver a cidade na seguinte ordem:

1. **Sua cidade cadastrada no perfil** - se você tem um perfil com cidade e estado definidos.
2. **Cookie de cidade** - uma cidade salva em cookie/localStorage de visitas anteriores.
3. **Geolocalização do navegador** - se você permitir, o sistema usa sua localização atual.
4. **Brasil** - fallback nacional, mostrando itens de todo o país.

### Escopos de localização

| URL | Escopo | Exemplo |
| :--- | :--- | :--- |
| `/explorar` | Cidade do usuário (ou Brasil) | Detecta sua cidade automaticamente |
| `/explorar/brasil` | Todo o Brasil | Produtos de todo o país |
| `/explorar/estado-sp` | Estado inteiro | São Paulo (estado) |
| `/explorar/sao-paulo-sp` | Cidade específica | São Paulo (cidade) |

[IMAGEM: Tela mostrando o seletor de cidade no topo da página Explorar]

## Tela inicial: navegue por categoria

Quando você acessa `/explorar` sem nenhum parâmetro de busca, o sistema mostra a **tela de boas-vindas** com categorias organizadas:

| Seção | O que mostra |
| :--- | :--- |
| **Produtos, Serviços e Lojas** | Na navegação inicial (modo Tudo), aparecem 3 círculos: Produtos, Serviços e Lojas. Clicando em cada um, os círculos trocam e mostram as categorias daquele grupo (no mesmo lugar). |
| **Categorias de Produtos** | Círculos das categorias principais de produtos (Alimentação, Casa, Tecnologia, Moda e Beleza, Saúde, Automotivo, Pets, Outros). |
| **Categorias de Serviços** | Círculos das categorias de serviços. |
| **Categorias de Lojas** | Círculos das categorias de lojas/vitrines. |

Clique em qualquer categoria para ver os produtos/serviços relacionados à sua cidade.

### Categorias disponíveis

| Categoria | Itens incluídos |
| :--- | :--- |
| Alimentação | Alimentos, bebidas, ingredientes |
| Casa | Móveis, decoração, utilidades domésticas |
| Tecnologia | Eletrônicos, computadores, acessórios |
| Moda e Beleza | Roupas, calçados, cosméticos |
| Saúde | Produtos e serviços de saúde e bem-estar |
| Automotivo | Peças, acessórios e serviços para veículos |
| Pets | Ração, brinquedos e serviços para animais |
| Serviços | Todos os tipos de serviços oferecidos |
| Outros | Itens que não se encaixam nas categorias acima |

## Busca de produtos e serviços

A barra de busca permite procurar pelo que você precisa:

| Campo | Como usar |
| :--- | :--- |
| **Buscar** | Digite o nome, parte do nome, categoria ou SKU do produto. |
| **Tipo** | Filtre entre Produtos, Serviços, Lojas ou Tudo. |
| **Categoria** | Limite a busca a uma categoria específica. |
| **Raio** | Defina até quantos km do seu ponto deseja buscar (quando usando localização específica). |

[IMAGEM: Campo de busca com destaque para os filtros de tipo e categoria]

### Como funciona a busca

1. Digite o termo na barra de busca.
2. Os resultados são exibidos em ordem de **relevância** por padrão.
3. A busca considera nome do produto, descrição, categoria e atributos.

> [i] A busca é **inteligente**: mesmo digitando parcialmente, o sistema tenta encontrar correspondências próximas.

## Secções de destaque

Dependendo do contexto, a página Explorar mostra carrosséis de seções específicas:

| Seção | Critério de exibição |
| :--- | :--- |
| **Vendedores em destaque** | Lojas com melhor reputação e avaliações |
| **Vídeos da comunidade** | Vídeos deixados por vendedores na plataforma |
| **Patrocinados na sua região** | Anúncios patrocinados relevantes à sua localização |

[IMAGEM: Carrossel de "Vendedores em destaque" com cards de lojas]

## Filtros

Na página de resultados, você pode refinar a busca utlizando diversos filtros.

| Filtro | O que faz |
| :--- | :--- |
| **Tipo** | Alterna entre Tudo, Produtos, Serviços, Lojas e Assinaturas |
| **Categoria** | Mostra apenas itens da categoria selecionada. A categoria **Outros** agrupa tudo que ainda não tem categoria cadastrada (inclusive lojas sem categoria) |
| **Preço** | Define preço mínimo e máximo (itens "sob consulta" continuam aparecendo) |
| **Avaliação** | Mostra apenas itens com 4+ ou 4,5+ estrelas |
| **Condição** | Filtra entre Novo e Usado/Desapego (apenas produtos) |
| **Promoção** | Mostra apenas itens com desconto ativo |
| **Envio nacional** | Mostra apenas itens enviados por transportadora (apenas produtos) |
| **Entrega** | Em Lojas: com entrega, somente retirada ou entrega grátis |
| **Distância** | Em Lojas: limita a exibição a lojas dentro de X km da sua localização |
| **Vitrine online ativa** | Em Lojas: mostra apenas lojas com a vitrine online ativa |
| **Ordenar** | Define a ordem de exibição |

### Opções de ordenação

| Opção | Como ordena |
| :--- | :--- |
| **Relevância** (padrão) | Produtos com melhor ranqueamento para sua busca |
| **Menor preço** | Do mais barato ao mais caro |
| **Maior preço** | Do mais caro ao mais barato |
| **Mais recentes** | Do recém-cadastrado ao mais antigo |
| **Melhor avaliados** | Do mais bem avaliado para o menos avaliado |
| **Mais próximos** | Da loja mais próxima para a mais distante (disponível em Lojas) |

> [i] A ordenação por relevância considera diversos fatores como qualidade do cadastro, avaliações, estoque e preço. Veja a documentação de [Visão geral da Vitrine Online](./01-visao-geral.md) para entender o ranqueamento.

## Modos de visualização

A página Explorar exibe os resultados em **grade** (cards com imagens), que é o formato padrão e otimizado para navegar visualmente pelo catálogo.

## Navegação e paginação

### Rolagem infinita

A página Explorar usa **rolagem infinita**: ao chegar ao fim da lista, novos itens são carregados automaticamente.

| Limite | Detalhe |
| :--- | :--- |
| Máximo de itens | 300 (para evitar consumo excessivo de memória) |
| Itens por carregamento | 40 (na grade) ou 10 (na tela inicial) |

### Itens distantes

Se sua busca por uma cidade específica retornar poucos resultados, o sistema automaticamente mostra:

| Seção | O que aparece |
| :--- | :--- |
| **Lojas um pouco mais distantes** | Vendedores do seu estado ou região que correspondem à busca |
| **Um pouco mais distantes do seu raio de busca** | Todos os itens encontrados fora do seu raio, listados direto na página. Respondem normalmente aos filtros e à ordenação. Ao lado de cada item aparece apenas a cidade e o estado do vendedor. |

## Controles de navegação

### Navegação por tipo de item

Use as abas no topo (quando disponível) para alternar entre:

| Aba | Mostra |
| :--- | :--- |
| **Tudo** | Produtos, serviços e lojas misturados |
| **Produtos** | Apenas produtos físicos |
| **Serviços** | Apenas serviços |
| **Lojas** | Apenas vitrines / lojas |

### Controle de cidade

Clique no nome da cidade no topo da página para abrir o seletor de cidade. Lá você pode:

- Procurar uma cidade específica
- Navegar por estados
- Voltar para "Brasil" (visão nacional)

> [!NOTE]
> Usuários logados têm a cidade salva automaticamente. Visitantes têm a cidade salva apenas na sessão atual.

## Quando não há resultados

Se a busca ou filtros não retornarem itens, o sistema mostra uma tela amigável com opções:

| Ação | Quando aparece |
| :--- | :--- |
| **Escolher Cidade** | Se nenhuma localização foi definida |
| **Eu vendo** | Se a categoria está vazia para a cidade selecionada |
| **Conheço quem vende** | Oferece convidar alguém para vender na Dudit |
| **Estou procurando isso** | Permite registrar uma demanda de compra/serviço |

### Registrar uma demanda

Se não encontra o que precisa, você pode registrar uma **demanda de compra**:

1. Clique em **Estou procurando isso**.
2. Descreva o que busca (nome do produto, serviço, etc.).
3. Selecione o tipo de demanda: **Quero comprar**, **Quero contratar** ou **Quero encontrar loja**.
4. Envie a demanda.

A equipe da Dudit analisa a demanda e pode entrar em contato para ajudar.

[IMAGEM: Modal de demanda de compra com campos de descrição e tipo]

## Anúncios patrocinados

A página Explorar exibe **anúncios patrocinados** de vendedores que pagam pela exposição:

| Localização | Como funciona |
| :--- | :--- |
| Carrossel "Patrocinados" | Anúncios verticais relevantes à sua localização |
| Busca com anúncios | Anúncios relevantes ao termo pesquisado aparecem em destaque |

> [i] Anúncios são marcados com um selo **"Patrocinado"** e seguem as mesmas regras de qualidade da plataforma.

## Vídeos da comunidade

Quando disponíveis, a página Explorar mostra um carrossel de **vídeos da comunidade** - vídeos deixados por vendedores para apresentar produtos e serviços.

## Navegação móvel

No celular, elementos da navegação são adaptados para o formato:

| Elemento | Funcionamento no mobile |
| :--- | :--- |
| **Controles fixos** | Barra fixa no rodapé com bots de Filtrar e Ordenar |
| **Bottom sheet** | Filtros e ordenação abrem como painel deslizante |
| **Botão flutuante** | No app, o botão de "Nova Coleção" flutua no canto inferior |

[IMAGEM: Celular mostrando a barra de controles móveis fixa no rodapé]

## Problemas comuns

**Não aparecem itens na minha cidade**
- Verifique se a cidade foi selecionada corretamente no seletor.
- Tente ampliar o raio de busca ou alterar para "Todo o Brasil".
- Alguns itens podem estar sem estoque ou inativos na sua região.

**A busca não encontra o que procuro**
- Use termos mais genéricos (ex: "leite" em vez de "leite condensado tipo X").
- Verifique se não há erro de digitação.
- Tente navegar por categorias relacionadas.

**Filtros não aplicam**
- Clique em **Aplicar filtros** após ajustar os valores.
- Use o butão **Limpar filtros** para recomeçar.

**Resultados mudam de posição sozinho**
- O ranqueamento é dinâmico e muda conforme o engajamento de outros usuários e novos cadastros. Isso é normal - veja mais na [Visão geral da Vitrine Online](./01-visao-geral.md).

## Perguntas frequentes

**Como faço para ver itens de uma cidade específica?**
Clique no nome da cidade no topo da página e selecione a cidade desejada. Você também pode digitar `/explorar/[cidade]-[uf]` diretamente na barra de endereços.

**Posso salvar minha cidade preferida?**
Sim. Usuários logados têm a cidade do perfil salva automaticamente. Você também pode escolher uma cidade diferente a qualquer momento e ela ficará salva para próximas visitas.

**A ordenação por "Relevância" é justa?**
Sim. O ranqueamento combina vários fatores de forma equilibrada (qualidade do cadastro, preço, estoque, avaliações e reputação da loja). Nenhum fator sozinho garante o topo da lista.

**Por que alguns itens aparecem com preço riscado?**
Itens com preço riscado estão com **promoção ativa** (preço promocional menor que o original). Eles também podem ser filtrados usando a opção "Promoção" nos filtros.

**Posso filtrar por itens novos ou usados?**
Sim. Usando o filtro de **Condição**, você pode ver apenas itens **Novos** ou **Usados/Desapegos**.

**Por que uma loja aparece na categoria "Outros"?**
Porque ela ainda não tem categoria cadastrada (ou está na categoria "Outros"). Você pode cadastrar a categoria da sua loja no painel para ela aparecer nas categorias corretas.

**Como faço para ver lojas em destaque?**
Na tela inicial ou em buscas sem tipo específico, a seção **Vendedores em destaque** aparece automaticamente mostrando as lojas com melhor reputação. Dentro do filtro de **Lojas** também dá para filtrar por **vitrine online ativa** e ordenar por **melhor avaliados** ou **mais próximos**.

**A página Explorar funciona no celular?**
Sim. A página é totalmente responsiva. No mobile, os filtros e controles de ordenação abrem como painéis deslizantes para melhor usabilidade.

