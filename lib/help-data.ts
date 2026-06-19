export interface HelpArticle {
    id: string
    title: string
    description: string
    slug: string
    category: string
    content: string
}

export interface HelpCategory {
    id: string
    title: string
    icon?: string
    articles: HelpArticle[]
}

export const helpCategories: HelpCategory[] = [
    {
        id: "boas-vindas",
        title: "Boas vindas!",
        icon: "🚀",
        articles: [
            {
                id: "acessando-sistema",
                title: "Acessando o sistema pela primeira vez",
                description: "Veja como acessar sua loja! 🥰",
                slug: "acessando-sistema",
                category: "boas-vindas",
                content: `
## Como fazer login na plataforma pela primeira vez?

![Primeiro acesso ao Portal](https://img.dudit.com.br/static/Help_Login_FirstAccess.png)

### Primeiro acesso ao Portal

Se este é o seu primeiro acesso, você precisará criar uma senha.

Não se preocupe, é simples! 🤩

Apenas acesse a página do portal gestor clicando aqui: https://dudit.com.br/auth/login

* Na página de login, clique em "ESQUECI MINHA SENHA".
`
            }
        ]
    },
    {
        id: "login-registro",
        title: "Login e Registro",
        articles: [
            {
                id: "acessando-conta",
                title: "Acessando sua conta",
                description: "Como entrar na plataforma.",
                slug: "acessando-conta",
                category: "login-registro",
                content: `
## Visão geral
O acesso à plataforma Dudit é o ponto de partida para gerenciar seu negócio ou realizar compras. Oferecemos métodos de autenticação seguros e rápidos para garantir que você chegue ao que importa com poucos cliques.

![Tela de Login](https://img.dudit.com.br/static/Help_Login_Screen.png)

## O que é possível fazer
*   Entrar com E-mail e Senha.
*   Acessar rapidamente usando sua conta Google.
*   Solicitar recuperação de senha se esquecer seus dados.
*   Alternar para o modo de cadastro de parceiro.

## Como usar
1. Acesse a página de login em https://dudit.com.br/auth/login.
2. Escolha seu método preferido: **E-mail/Senha** ou **Google**.
3. Se escolher e-mail, digite suas credenciais e clique em **Entrar**.
4. Se escolher Google, clique no botão e selecione a conta desejada na janela que abrir.

## Campos e opções

| Campo | Descrição |
| :--- | :--- |
| **E-mail** | O endereço de e-mail utilizado na criação da conta. |
| **Senha** | Sua senha pessoal e intransferível. |
| **Esqueci minha senha** | Link para iniciar o fluxo de recuperação de acesso. |
| **Entrar com Google** | Autenticação rápida sem necessidade de senha manual. |
| **Seja Parceiro** | Botão no topo da página para quem deseja abrir uma loja. |

## Regras e comportamentos
*   **Sessão:** Ao fazer login, sua sessão permanece ativa para facilitar acessos futuros, a menos que você selecione "Sair".
*   **Segurança:** Tentativas de login inválidas podem resultar em bloqueios temporários por segurança.
*   **Redirecionamento:** Se você tentou acessar uma página restrita, o sistema o levará automaticamente para ela após o login bem-sucedido.

## Dicas
> [!TIP]
> Use o **Login com Google** para evitar ter que decorar mais uma senha e agilizar o acesso em diferentes dispositivos.

## Problemas comuns

**"E-mail não confirmado"**
Isso acontece se você acabou de criar a conta e ainda não clicou no link enviado para sua caixa de entrada. Verifique seu e-mail (e a pasta de spam).

**"Senha incorreta"**
Certifique-se de que o *Caps Lock* não está ativado. Se persistir, utilize a opção "Esqueci minha senha".
`
            },
            {
                id: "criando-conta",
                title: "Criando uma conta de usuário",
                description: "Cadastro inicial para clientes e novos parceiros.",
                slug: "criando-conta",
                category: "login-registro",
                content: `
## Visão geral
Seja você um cliente em busca de produtos locais ou um empreendedor pronto para abrir sua loja, o primeiro passo é criar sua conta na Dudit. O processo é simples e focado na segurança dos seus dados.

![Tela de Cadastro](https://img.dudit.com.br/static/Help_Signup_Screen.png)

## O que é possível fazer
*   Criar uma conta nova usando seu e-mail.
*   Utilizar sua conta Google para cadastro instantâneo.
*   Visualizar a força da sua senha em tempo real.
*   Aceitar os Termos de Uso e Políticas da plataforma.

## Como usar
1. Na página de login, clique em **Crie a sua** (abaixo do formulário).
2. Insira um e-mail válido.
3. Escolha uma senha segura. O medidor abaixo do campo ajudará você a criar uma combinação forte.
4. Marque a caixa **"Aceito os Termos"**.
5. Clique em **Criar Conta**.
6. **Importante:** Você receberá um e-mail de confirmação. Clique no link enviado para ativar sua conta.

## Campos e opções

| Campo | Requisito / Descrição |
| :--- | :--- |
| **E-mail** | Deve ser um e-mail válido que você tenha acesso. |
| **Senha** | Deve ser classificada como "Média" ou "Forte" pelo sistema. |
| **Aceito os Termos** | Obrigatório para prosseguir com o cadastro. |
| **Medidor de Senha** | Indica visualmente a segurança da senha escolhida. |

## Regras e comportamentos
*   **Validação de Senha:** O sistema não permite a criação de contas com senhas fracas. Recomendamos o uso de letras, números e símbolos.
*   **E-mail Duplicado:** Se você tentar se cadastrar com um e-mail já existente, o sistema informará o erro.
*   **Confirmação Obrigatória:** Sem a confirmação por e-mail, algumas funcionalidades podem ficar restritas.

## Dicas
> [!IMPORTANT]
> Ao criar a conta com Google, seu nome é importado automaticamente. Para alterar depois, acesse **Perfil e Configurações**.

## Problemas comuns
**"Não recebi o e-mail de confirmação"**
Aguarde alguns minutos. Verifique o **Spam**. Tente "Reenviar e-mail" após 60 segundos.
`
            },
            {
                id: "cadastro-parceiro",
                title: "Cadastro de Parceiro (Loja)",
                description: "Como transformar seu negócio em uma loja na Dudit.",
                slug: "cadastro-parceiro",
                category: "login-registro",
                content: `
## Visão geral
O **Assistente de Cadastro de Parceiro** guia você por 4 etapas simples para configurar sua vitrine e painel de gestão.

![Wizard de Cadastro](https://img.dudit.com.br/static/Help_PartnerWizard.png)

## Como usar (Passo a Passo)

### Etapa 1: Criar sua conta
Se você ainda não tem conta, começará informando seu e-mail e criando uma senha forte.

### Etapa 2: Sobre seu negócio
*   **Logo:** Escolha uma imagem quadrada.
*   **Nome da Loja:** Como seus clientes te encontrarão.
*   **WhatsApp:** O número principal para contato.
*   **Descrição:** Conte sobre o que você oferece.

### Etapa 3: Como seu negócio funciona?
1.  **O que você oferece:** "Produtos", "Serviços" ou ambos.
2.  **Modo de uso:** "Anunciar Rápido" ou "Gerenciar meu negócio (ERP)".

### Etapa 4: Onde fica seu negócio?
Informe o endereço completo. Digite o **CEP** para preenchimento automático.

## Regras e comportamentos
*   **Validação de Imagem:** Logos maiores que 3MB serão bloqueadas.
*   **Finalização:** Você será redirecionado para o Dashboard.

## Dicas
> [!TIP]
> No campo **Descrição**, use palavras-chave que seus clientes usariam para buscar seus produtos.
`
            }
        ]
    },

    {
        id: "gestao",
        title: "Gestão",
        articles: [
            { id: "pedidos", title: "Gestão de pedidos", description: "", slug: "pedidos", category: "gestao", content: "Conteúdo em breve..." },
            { id: "clientes", title: "Clientes", description: "", slug: "clientes", category: "gestao", content: "Conteúdo em breve..." },
            { id: "delivery", title: "Delivery", description: "", slug: "delivery", category: "gestao", content: "Conteúdo em breve..." },
        ]
    },
    {
        id: "produtos",
        title: "Produtos",
        articles: [
            {
                id: "visao-geral-produtos",
                title: "Visão geral de produtos",
                description: "Entenda o módulo de Produtos e seus principais conceitos.",
                slug: "visao-geral-produtos",
                category: "produtos",
                content: `
A seção de **Produtos** é o coração da sua loja. É aqui que você cadastra tudo o que vende: produtos físicos, digitais ou serviços. Cada produto cadastrado aparece na sua vitrine online e fica disponível para seus clientes comprarem.

[IMAGEM: Tela principal da listagem de produtos]
Legenda: Visão geral da página de produtos com busca, filtros e opções de visualização.

## Conceitos importantes

**Produto ativo vs. inativo**
Um produto ativo aparece na vitrine e pode ser comprado. Produtos inativos ficam salvos no sistema mas não são exibidos. Use essa opção quando quiser pausar a venda de um item sem perder seus dados.

**Exibir na vitrine**
Controla se o produto aparece ou não na sua loja online. Diferente do status ativo/inativo, essa opção é específica para a vitrine. Você pode manter um produto ativo no sistema mas ocultá-lo da loja.

**Preço com "Valor sob consulta"**
Você pode optar por não exibir o preço do produto na vitrine. Nesse caso, o cliente verá a mensagem "Valor sob consulta" e precisará entrar em contato para saber o preço.

**Produto com variações**
Produtos que possuem diferentes versões, como roupas com cores e tamanhos. Em vez de criar um cadastro para cada variação, você cria um único produto e adiciona as opções dentro dele.

**Estoque**
Quantidade disponível do produto. Você define o estoque inicial e pode registrar movimentações ao longo do tempo (entradas e saídas).

## Como acessar

1. No menu lateral do painel de controle, clique em **Produtos**.
2. Você verá a lista de todos os produtos cadastrados.
3. Use a barra de busca para encontrar produtos por nome ou SKU.
4. Use os filtros para refinar por categoria, marca, situação de estoque ou status.

[IMAGEM: Menu lateral destacando a opção "Produtos"]
Legenda: Acesso à seção de produtos pelo menu principal.

## Dicas importantes

- Mantenha os dados fiscais sempre corretos (NCM, origem) para emitir notas fiscais sem problemas.
- Organize seus produtos em categorias desde o início — isso facilita a gestão e ajuda os clientes a encontrarem o que procuram.
- Produtos com imagens de qualidade vendem mais. Tire fotos com boa iluminação e fundo neutro.

## Perguntas frequentes

**Posso ter produtos físicos e digitais na mesma loja?**
Sim. Ao cadastrar, você escolhe o tipo do produto: físico, digital ou serviço.

**O que acontece quando desativo um produto?**
Ele continua salvo com todas as informações, mas não aparece na vitrine e não pode ser comprado. Você pode reativá-lo quando quiser.

**Qual a diferença entre "Inativo" e "Não exibir na vitrine"?**
"Inativo" desativa o produto por completo. "Não exibir na vitrine" mantém o produto ativo no sistema (aparece em relatórios, pode ser vendido no PDV) mas não o mostra na loja online.
`
            },
            {
                id: "cadastrar-produto",
                title: "Como cadastrar um produto",
                description: "Aprenda o passo a passo para cadastrar produtos físicos, digitais ou serviços.",
                slug: "cadastrar-produto",
                category: "produtos",
                content: `
O cadastro de produtos é o primeiro passo para vender online. Você pode cadastrar produtos físicos, digitais ou serviços com todas as informações necessárias para a venda e a emissão de notas fiscais.

[IMAGEM: Tela de cadastro de produto com abas visíveis]
Legenda: Formulário completo de cadastro de produto.

## Quando usar

Cadastre um produto sempre que quiser adicionar um novo item ao seu catálogo. Você pode fazer isso de três formas:

- **Manual**: preenchendo o formulário um a um
- **Importação por XML**: a partir de notas fiscais de fornecedores (recomendado para muitos produtos)
- **Duplicação**: copiando um produto existente e ajustando as informações

## Como fazer

### 1. Acessar o cadastro

1. No menu lateral, clique em **Produtos**.
2. Clique no botão **Novo produto** no canto superior direito.

[IMAGEM: Botão "Novo produto" destacado na tela de listagem]
Legenda: Clique em "Novo produto" para iniciar o cadastro.

### 2. Preencher informações básicas

**Nome do produto** (obrigatório): Escolha um nome claro e descritivo. Inclua informações como marca, modelo e característica principal.

**Imagens**: Clique para adicionar fotos do produto. Você pode:
- Enviar arquivos do computador
- Ajustar o recorte da imagem
- Definir uma imagem principal (primeira da lista)
- Remover imagens indesejadas

[IMAGEM: Seção de imagens com botão de upload e destaque da imagem principal]
Legenda: Adicione fotos do produto e defina qual será a imagem principal.

**Status**: Define se o produto está ativo (disponível para venda) ou inativo.

**Exibir na vitrine**: Controla se o produto aparece na sua loja online.

### 3. Configurar preço

- **Preço de custo**: quanto você pagou pelo produto (ou quanto custou para produzir).
- **Preço de venda**: valor que será cobrado do cliente (obrigatório).
- **Preço promocional**: valor promocional temporário. Enquanto estiver preenchido, será exibido no lugar do preço normal.

> Se desmarcar a opção "Exibir o preço na vitrine online", o produto aparecerá com "Valor sob consulta" e os campos de preço serão zerados.

### 4. Definir estoque inicial

- **Estoque atual**: quantidade disponível para venda.
- **Estoque mínimo**: quantidade mínima ideal. Quando o estoque atingir esse valor, o sistema alerta que está baixo.
- **Localização**: onde o produto fica armazenado (ex: "Prateleira A3", "Galpão 2").
- **Permitir vender sem estoque**: quando ativado, o produto pode ser vendido mesmo com estoque zerado.

### 5. Informações de organização (sidebar à direita)

**SKU (código do produto)**: Um código único para identificar o produto. Se não preencher, o sistema gera automaticamente. Você também pode clicar no ícone de dado para sortear um código aleatório.

**Código de barras (EAN/GTIN)**: O código de barras do produto. Você pode digitar o número ou clicar no ícone de dado para gerar um código EAN-13 automaticamente.

**Categoria**: Classifique o produto em uma categoria (ex: "Roupas", "Eletrônicos"). Se a categoria desejada não existir, você pode criar na hora.

**Subcategoria**: Disponível após selecionar uma categoria. Exemplo: dentro de "Roupas", você pode ter "Camisetas", "Calças", etc.

**Marca**: Selecione a marca do produto. Também é possível criar uma nova marca durante o cadastro.

**Unidade**: Unidade de medida do produto (UN, KG, LT, PC, CX, etc.).

### 6. Preencher dados de envio

Essa seção fica dentro do acordeão **"Envio e Dimensões"**. Preencha estas informações para calcular o frete corretamente:

- **Peso líquido e bruto** (em kg)
- **Prazo de preparação**: quantos dias você leva para preparar o produto após a compra
- **Tipo de embalagem**: pacote/caixa, cilindro/rolo ou envelope
- **Dimensões**: largura, altura e profundidade (em cm)

### 7. Informações fiscais (aba "Dados Gerais" → dentro do formulário)

- **NCM**: código obrigatório de 8 dígitos. Se não souber, digite o nome do produto e clique no ícone de estrela para sugerir o NCM automaticamente.
- **Origem da mercadoria**: nacional, importada, etc.
- **CEST**: obrigatório apenas para produtos sujeitos a Substituição Tributária.

### 8. Salvar

Clique em **Salvar**. O produto será criado e aparecerá na sua lista de produtos.

[IMAGEM: Botão "Salvar" destacado no formulário]
Legenda: Finalize o cadastro clicando em "Salvar".

## Dicas importantes

- **Fotos de qualidade fazem diferença**: produtos com imagens claras e bem iluminadas vendem mais.
- **SKU único**: cada produto precisa ter um SKU diferente. Se tentar usar um SKU já existente, o sistema gera automaticamente um código alternativo.
- **NCM correto**: usar o NCM errado pode gerar problemas fiscais. Use o sugeridor automático sempre que tiver dúvida.
- **Produto sem estoque**: se não quiser controlar estoque, ative "Permitir vender sem estoque" e mantenha o estoque como 0.

## Perguntas frequentes

**Preciso preencher todos os campos?**
Não. Apenas Nome e Preço de Venda são obrigatórios. NCM e Origem da Mercadoria também são obrigatórios para emissão de notas fiscais.

**Posso adicionar imagens depois?**
Sim. É possível editar o produto e adicionar ou remover imagens a qualquer momento.

**O que é SKU e para que serve?**
SKU é um código interno para identificar o produto. Ele ajuda na organização do estoque e na localização do produto no sistema.

**Como cadastrar um produto digital?**
No campo "Tipo do Item", selecione a opção adequada. Produtos digitais não precisam de dados de envio nem de estoque físico.
`
            },
            {
                id: "organizar-produtos",
                title: "Como organizar seus produtos",
                description: "Saiba como usar categorias, marcas, SKUs e filtros para manter seus produtos organizados.",
                slug: "organizar-produtos",
                category: "produtos",
                content: `
Manter os produtos bem organizados facilita o dia a dia: você encontra qualquer item rapidamente, seus clientes navegam com mais facilidade e a gestão do estoque fica mais simples.

[IMAGEM: Lista de produtos com filtros e busca abertos]
Legenda: Utilize filtros e busca para encontrar produtos rapidamente.

## Quando usar

A organização é útil em várias situações:

- Você tem muitos produtos e precisa encontrar um específico
- Quer agrupar produtos por tipo, marca ou departamento
- Precisa entender quais produtos estão com estoque baixo
- Deseja aplicar alterações em lote (preço, estoque, ativar/desativar)

## Como organizar seus produtos

### Categorias e subcategorias

Categorias agrupam produtos por tipo. Exemplo: "Roupas", "Calçados", "Acessórios".

As subcategorias são divisões dentro de uma categoria. Exemplo: dentro de "Roupas" você pode ter "Camisetas", "Calças", "Jaquetas".

**Para criar uma categoria:**

1. Ao cadastrar ou editar um produto, localize o campo **Categoria** na sidebar direita.
2. Clique no botão **Criar nova categoria** dentro do campo.
3. Digite o nome e confirme.
4. A categoria será criada e selecionada automaticamente no produto.

**Para criar uma subcategoria:**

1. Primeiro, selecione a categoria principal.
2. No campo **Subcategoria**, clique em **Criar nova subcategoria**.
3. Digite o nome e confirme.

> Ao trocar a categoria de um produto, a subcategoria é limpa automaticamente.

### Marcas

Vincular marcas aos produtos ajuda na organização e na busca. Para criar uma marca:

1. No campo **Marca**, clique em **Criar nova marca**.
2. Digite o nome e confirme.

[IMAGEM: Campo de Marca com opção "Criar nova marca" destacada]
Legenda: Crie marcas diretamente no cadastro do produto.

### SKU (código interno)

O SKU é um código único que identifica cada produto no seu sistema. Diferente do código de barras, o SKU é definido por você.

**Boas práticas para criar SKUs:**
- Use códigos que sejam fáceis de identificar (ex: \`CAM-AZUL-M\` para "Camiseta Azul tamanho M")
- Evite caracteres especiais e espaços
- Mantenha um padrão para todos os produtos

O sistema pode gerar um SKU automaticamente se você não informar um.

### Código de barras (EAN/GTIN)

O código de barras é usado para identificação em lojas físicas e para integrações com marketplaces. Você pode:

- **Digitar manualmente**: insira o código de barras oficial do produto
- **Gerar automaticamente**: clique no ícone de dado ao lado do campo para gerar um código EAN-13 interno

[IMAGEM: Campo de código de barras com ícone de geração automática]
Legenda: Gere um código de barras automaticamente com um clique.

### Busca e filtros na listagem

A página de produtos oferece várias ferramentas para encontrar o que você precisa:

**Busca por texto**: digite o nome ou SKU do produto na barra de busca.

**Abas de estoque**: filtre rapidamente por:
- **Todos**: exibe todos os produtos
- **Normal**: produtos com estoque dentro do esperado
- **Baixo**: produtos com estoque abaixo do mínimo configurado
- **Esgotado**: produtos com estoque zero

**Filtros avançados**: clique em **Filtros** para refinar por:
- Status (Ativo / Inativo)
- Faixa de preço
- Categoria
- Marca
- Unidade
- Situação de estoque

[IMAGEM: Painel de filtros com opções expandidas]
Legenda: Utilize filtros para encontrar produtos específicos.

**Ordenação**: clique nos cabeçalhos da tabela para ordenar por nome, preço, estoque, etc.

### Ações em lote

Selecione vários produtos usando os checkboxes para realizar ações em massa:

- **Ativar / Desativar**: altera o status de todos os selecionados
- **Editar em massa**: ajusta preço, estoque, visibilidade ou imagens de vários produtos de uma vez
- **Excluir**: remove todos os selecionados (cuidado: ação irreversível)

**Como editar em massa:**

1. Selecione os produtos desejados.
2. No menu de ações, escolha **Editar em massa**.
3. Escolha o tipo de alteração:
   - **Preço**: aumentar ou diminuir em percentual, ou definir valor fixo
   - **Estoque**: somar, subtrair, definir valor fixo ou zerar
   - **Visibilidade**: publicar ou ocultar da vitrine
   - **Imagem**: adicionar uma imagem a todos os selecionados ou remover imagens

[IMAGEM: Modal de edição em massa com opções]
Legenda: Aplique alterações a vários produtos de uma só vez.

### Exportação de produtos

Você pode exportar a lista de produtos atual para uma planilha Excel (.xlsx). A exportação considera os filtros e a busca aplicados no momento.

1. Clique no menu **Ações**.
2. Selecione **Exportar**.
3. O arquivo será baixado com os dados dos produtos filtrados.

## Dicas importantes

- **Crie categorias antes de cadastrar produtos**: planeje sua árvore de categorias com antecedência para manter a organização desde o início.
- **Use SKUs padronizados**: isso facilita a localização no sistema e a integração com marketplaces e transportadoras.
- **Aproveite a busca por código de barras**: você pode usar um leitor de código de barras para localizar produtos rapidamente — o sistema identifica tanto GTIN quanto SKU.
- **Edição em massa com cuidado**: antes de alterar preços ou estoques em lote, verifique se a seleção está correta.

## Perguntas frequentes

**Posso ter um produto sem categoria?**
Sim. A categoria não é obrigatória, mas recomendamos usar para organizar melhor.

**Como faço para editar uma categoria existente?**
As categorias são gerenciadas na seção **Cadastros** dentro do ERP. Lá você pode editar, renomear ou excluir categorias e marcas.

**O que acontece se eu excluir uma categoria?**
Os produtos que estavam nela ficam sem categoria. Você precisará reclassificá-los manualmente.

**É possível imprimir a lista de produtos?**
Você pode exportar a lista para Excel e imprimir a planilha.
`
            },
            {
                id: "variacoes",
                title: "Como trabalhar com variações",
                description: "Aprenda a criar variações de cor, tamanho e outras opções para seus produtos.",
                slug: "variacoes",
                category: "produtos",
                content: `
Variações permitem vender diferentes versões de um mesmo produto sem precisar criar vários cadastros separados. Por exemplo, uma camiseta que existe nas cores azul, preta e branca e nos tamanhos P, M e G.

[IMAGEM: Aba de Variações com lista de variantes cadastradas]
Legenda: Gerencie cores, tamanhos e outras variações do produto.

## Quando usar

Use variações quando seu produto tiver diferentes opções que impactam o estoque ou o preço:

- **Roupas e calçados**: cores e tamanhos
- **Eletrônicos**: capacidade de armazenamento, cor
- **Móveis**: acabamento, material
- **Cosméticos**: fragrância, volume

> Importante: este recurso está disponível a partir do plano **Crescer**.

## Como criar variações

### 1. Acessar a aba de Variações

1. Cadastre ou edite um produto.
2. Clique na aba **Variações**.

[IMAGEM: Aba "Variações" destacada no formulário do produto]
Legenda: Acesse a aba de variações para configurar as opções do produto.

### 2. Adicionar os tipos de variação

Clique em **Adicionar variação**. Você pode criar combinações simples ou múltiplas:

**Exemplo 1 — Variação simples (apenas cor):**
- Tipo: "Cor"
- Valores: "Azul", "Preto", "Branco"

**Exemplo 2 — Variação combinada (cor + tamanho):**
- Tipo: "Cor / Tamanho"
- Valores: "Azul / P", "Azul / M", "Azul / G", "Preto / P", "Preto / M", "Preto / G"

[IMAGEM: Modal de adição de variantes com campos de tipo e valor]
Legenda: Defina os tipos e valores das variações.

### 3. Configurar cada variação

Para cada variação criada, você pode definir individualmente:

- **SKU**: um código único para cada variação. Se não preencher, o sistema gera automaticamente.
- **Preço**: valor adicional em relação ao preço base do produto (pode ser positivo, negativo ou zero).
- **Estoque**: quantidade disponível para cada variação.
- **Status**: ativar ou desativar variações específicas.
- **Imagem**: uma foto diferente para cada variação (útil quando as cores são muito diferentes).

[IMAGEM: Tabela de variações com campos de SKU, preço, estoque e status]
Legenda: Configure cada variação individualmente.

### 4. Salvar as variações

Após configurar, clique em **Salvar** no formulário principal. As variações serão vinculadas ao produto.

## Como o produto com variações aparece na vitrine

Na loja online, o cliente vê o produto normalmente e escolhe as opções desejadas (cor, tamanho, etc.). O preço exibido é o preço base do produto, e ao selecionar uma variação, o preço pode ser ajustado conforme configurado.

O estoque mostrado é a soma de todas as variações. Ao finalizar a compra, o sistema dá baixa no estoque da variação específica escolhida.

## Editando e removendo variações

1. Acesse a aba **Variações** do produto.
2. Para alterar, clique em **Adicionar/Editar variações**.
3. Para desativar uma variação sem excluí-la, use o botão de status (switch).
4. Para excluir, use o menu de ações (três pontos) na linha da variação.

> Atenção: ao excluir uma variação, a ação não pode ser desfeita.

### Ações em lote nas variações

Selecione várias variações para aplicar alterações em massa:

- **Ativar / Desativar**: altera o status de todas as selecionadas
- **Editar em massa**: ajusta preço, estoque ou imagem
- **Excluir em lote**: remove todas as variações selecionadas

## Dicas importantes

- **Defina o preço base primeiro**: o preço base do produto é o preço inicial. Cada variação pode ter um ajuste (para mais ou para menos). Exemplo: preço base R\$ 100, variação "Tamanho GG" com ajuste de R\$ 10 → preço final R\$ 110.
- **Imagens por variação**: se as variações têm aparências diferentes (ex: cores diferentes), adicione imagens individuais para cada uma.
- **Estoque separado**: cada variação tem seu próprio estoque. O estoque geral do produto é a soma de todas as variações.
- **SKU único para cada variação**: assim como produtos, cada variação precisa de um SKU diferente.

## Perguntas frequentes

**Posso adicionar variações depois de criar o produto?**
Sim. Edite o produto e vá até a aba **Variações** para adicionar, modificar ou remover.

**Qual a diferença entre criar variações e criar produtos separados?**
Variações mantêm o produto unificado na vitrine. O cliente escolhe as opções dentro da mesma página. Produtos separados aparecem como itens distintos.

**Posso ter preços diferentes para cada variação?**
Sim. Cada variação pode ter um ajuste de preço em relação ao preço base do produto.

**O estoque das variações é somado ao estoque do produto principal?**
Sim. O estoque total do produto é a soma dos estoques de todas as variações ativas.

**Preciso cadastrar variações mesmo que todas tenham o mesmo preço?**
Se o estoque é o mesmo e não há diferença de preço ou imagem, você pode optar por não usar variações e controlar o estoque de forma unificada.
`
            },
            {
                id: "controlar-estoque",
                title: "Como controlar o estoque",
                description: "Gerencie entradas e saídas, configure estoque mínimo e acompanhe a disponibilidade dos produtos.",
                slug: "controlar-estoque",
                category: "produtos",
                content: `
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
`
            },
            {
                id: "importar-produtos-xml",
                title: "Como importar produtos usando XML",
                description: "Cadastre produtos em lote a partir de notas fiscais eletrônicas (NF-e) dos seus fornecedores.",
                slug: "importar-produtos-xml",
                category: "produtos",
                content: `
A importação por XML permite cadastrar produtos automaticamente a partir de notas fiscais eletrônicas (NF-e) dos seus fornecedores. Isso economiza tempo e evita erros de digitação.

[IMAGEM: Tela de importação XML com lista de notas importadas]
Legenda: Acompanhe todas as importações realizadas.

## Quando usar

A importação por XML é ideal quando:

- Você recebeu uma carga de produtos e quer cadastrá-los rapidamente
- Quer atualizar o estoque e os preços de custo com base em notas fiscais
- Deseja vincular fornecedores automaticamente aos produtos

> A importação aceita apenas NF-e modelo 55 (nota fiscal de entrada). Notas de saída e NFC-e (modelo 65) não são suportadas.

## Como importar

### 1. Acessar a importação

1. No menu lateral, clique em **Produtos**.
2. Clique no botão **Ações** e selecione **Importar XML**.

[IMAGEM: Botão "Importar XML" no menu de ações]
Legenda: Acesse a importação pelo menu de ações na página de produtos.

### 2. Fazer upload do XML

1. Clique na área de upload para selecionar o arquivo XML da nota fiscal.
2. O sistema analisa o XML e extrai todas as informações.
3. Após o processamento, você verá uma prévia dos produtos encontrados.

[IMAGEM: Tela de upload com área para arrastar/selcionar o XML]
Legenda: Selecione o arquivo XML da NF-e para análise.

### 3. Revisar os produtos

Na tela de prévia, você verá:

- **Dados da nota**: número, série, fornecedor, valor total, chave de acesso
- **Produtos encontrados**: lista com nome, NCM, quantidade e valor unitário

[IMAGEM: Prévia da importação com lista de produtos e opções de decisão]
Legenda: Revise cada produto antes de confirmar a importação.

**Status de cada produto:**

| Status | Significado |
|--------|-------------|
| **Novo** | Produto não encontrado no seu catálogo. Será criado do zero. |
| **Match** | Produto encontrado no seu catálogo. O estoque e custo serão atualizados. |
| **Conflito** | Produto encontrado mas com diferenças (nome, NCM, preço). Você decide o que fazer. |

### 4. Decidir o que fazer com cada produto

Para cada item, você pode escolher:

- **Manter / Manter cadastro**: mantém o produto existente como está (apenas atualiza estoque)
- **Atualizar campos**: substitui as informações do produto pelos dados do XML
- **Criar novo**: cadastra como um produto novo (mesmo que já exista um similar)
- **Ignorar**: não faz nada com este item

[IMAGEM: Botões de decisão por produto na prévia da importação]
Legenda: Escolha a ação desejada para cada produto.

### 5. Confirmar a importação

Após revisar todos os itens:

1. Clique em **Confirmar Importação**.
2. O sistema cria ou atualiza os produtos conforme suas escolhas.
3. O estoque é ajustado e o custo é atualizado.
4. O fornecedor é automaticamente vinculado ao produto (se já existir no cadastro) ou criado.

## Como funciona o matching automático

Ao processar o XML, o sistema tenta encontrar produtos já existentes no seu catálogo usando estas estratégias, na ordem:

1. **Código de barras (EAN/GTIN)**: busca pelo código de barras do produto
2. **SKU interno**: busca pelo SKU igual ao código do produto na nota
3. **SKU do fornecedor**: busca se o código do produto na nota está vinculado a algum fornecedor
4. **NCM + EAN**: combina o NCM com o código de barras
5. **Similaridade de nome**: compara o nome do produto com nomes existentes do mesmo NCM

## Resolução de conflitos

Quando o sistema encontra um produto similar mas com informações diferentes (nome, NCM, preço, dimensões), ele marca como **Conflito** e exibe as diferenças para você decidir:

- Nome diferente
- NCM diferente
- GTIN diferente
- Unidade diferente
- Peso ou dimensões diferentes
- Fornecedor diferente do atual

## Dicas importantes

- **Sempre revise a prévia**: antes de confirmar, verifique se os produtos foram corretamente identificados.
- **Notas muito antigas**: o sistema alerta se a NF-e foi emitida há mais de 180 dias.
- **Fornecedor é criado automaticamente**: se o fornecedor da nota não existir no seu cadastro, ele será criado com CNPJ/CPF e nome.
- **Notas duplicadas**: o sistema impede a importação da mesma nota fiscal duas vezes.

## Perguntas frequentes

**Quais tipos de XML são aceitos?**
Apenas NF-e modelo 55 (nota fiscal de entrada). NFC-e (modelo 65, notas de consumidor final) e NF-e de saída não são aceitas.

**A importação cria o fornecedor automaticamente?**
Sim. Se o fornecedor da nota ainda não estiver cadastrado, o sistema o cria com os dados da nota (CNPJ/CPF, nome, endereço).

**O que acontece se eu importar a mesma nota duas vezes?**
O sistema bloqueia. Cada nota é identificada pela chave de acesso única e só pode ser importada uma vez.

**Posso importar apenas alguns produtos da nota?**
Sim. Durante a revisão, você pode escolher "Ignorar" para os itens que não deseja importar.

**A importação atualiza o preço de venda?**
Não. A importação atualiza o estoque e o preço de custo. O preço de venda permanece o mesmo que você definiu.

**E se o XML tiver erros?**
O sistema valida o XML antes de processar. Se houver problemas (nota sem protocolo SEFAZ, nota cancelada, etc.), você receberá uma mensagem explicando o motivo.
`
            },
            {
                id: "gerar-etiquetas",
                title: "Como gerar etiquetas",
                description: "Imprima etiquetas com nome, preço e código de barras para organizar sua loja e estoque.",
                slug: "gerar-etiquetas",
                category: "produtos",
                content: `
A geração de etiquetas permite imprimir informações dos produtos para organizar sua loja física, facilitar a identificação no estoque ou precificar mercadorias.

[IMAGEM: Modal de impressão de etiquetas com pré-visualização]
Legenda: Selecione produtos, configure a etiqueta e visualize antes de imprimir.

## Quando usar

A geração de etiquetas é útil para:

- **Precificar produtos**: imprima etiquetas com nome e preço para expor na loja
- **Organizar estoque**: identifique prateleiras, caixas e lotes
- **Código de barras**: gere etiquetas com código de barras para agilizar o checkout
- **Promoções**: destaque preços promocionais nas etiquetas

## Como gerar etiquetas

### 1. Acessar a ferramenta

1. Na página de **Produtos**, clique no menu **Ações**.
2. Selecione **Gerar Etiquetas**.

[IMAGEM: Opção "Gerar Etiquetas" no menu de ações]
Legenda: Acesse a ferramenta de etiquetas pelo menu de ações.

### 2. Selecionar produtos

Você pode selecionar produtos de duas formas:

- **Na listagem**: use os checkboxes para selecionar e depois acesse Gerar Etiquetas
- **No modal**: clique em **Adicionar** e busque pelos produtos desejados

Para cada produto, defina a **quantidade de etiquetas** que deseja imprimir.

[IMAGEM: Lista de produtos selecionados com campo de quantidade]
Legenda: Defina quantas etiquetas imprimir para cada produto.

### 3. Escolher o modelo da etiqueta

Selecione o tamanho da etiqueta entre os modelos disponíveis. Os modelos são compatíveis com as marcas mais comuns do mercado.

Se precisar de um tamanho diferente, escolha a opção **Customizado** e defina manualmente:
- Largura e altura da etiqueta
- Número de colunas e linhas por folha
- Margens e espaçamentos

### 4. Configurar o conteúdo

Marque as informações que devem aparecer na etiqueta:

- **Nome do produto**
- **Preço**
- **Preço promocional** (se houver, o preço normal aparece riscado e o promocional em destaque)
- **Parcelamento** (ex: "ou 12x")
- **SKU** (código interno)
- **Código interno** (código do produto)
- **Código de barras** (gerado automaticamente a partir do EAN/GTIN ou SKU)

[IMAGEM: Opções de conteúdo da etiqueta com checkboxes]
Legenda: Escolha quais informações exibir na etiqueta.

### 5. Visualizar e imprimir

1. A pré-visualização mostra como as etiquetas vão ficar.
2. Clique em **Imprimir** para abrir a impressão no navegador.
3. Ou clique em **Salvar PDF** para baixar um arquivo PDF.

> Para impressão, use folhas adesivas compatíveis com o modelo selecionado (encontradas em papelarias).

## Dicas importantes

- **Código de barras**: se o produto não tiver um código de barras cadastrado, o sistema gera um automaticamente para a etiqueta.
- **Preço promocional**: se o produto tiver um preço promocional, você pode ativar a opção para exibi-lo. O preço normal aparece riscado.
- **Quantidade**: você pode imprimir múltiplas etiquetas do mesmo produto (ex: 10 etiquetas para 10 unidades em exposição).
- **Teste em uma folha comum primeiro**: antes de usar a folha adesiva, imprima em papel comum para ajustar o posicionamento.

## Perguntas frequentes

**Quais tamanhos de etiqueta estão disponíveis?**
O sistema oferece os modelos mais comuns do mercado (como Pimaco). Se precisar de medidas diferentes, use a opção "Customizado".

**O código de barras funciona no checkout?**
Sim. As etiquetas geram código de barras no formato EAN-13 ou conforme o código do produto.

**Posso imprimir etiquetas apenas para alguns produtos selecionados?**
Sim. Selecione os produtos na listagem antes de acessar a ferramenta, ou adicione manualmente dentro do modal.

**Consigo salvar as configurações de etiqueta?**
As configurações (modelo e conteúdo) são ajustadas a cada uso. Você pode reconfigurar sempre que precisar.

**A etiqueta mostra o preço com desconto?**
Se o produto tiver um preço promocional e você ativar a opção correspondente, sim. O preço normal aparece riscado e o promocional em destaque.
`
            },
            {
                id: "perguntas-frequentes-produtos",
                title: "Perguntas frequentes sobre produtos",
                description: "Respostas rápidas para as dúvidas mais comuns sobre cadastro, variações, estoque e etiquetas.",
                slug: "perguntas-frequentes-produtos",
                category: "produtos",
                content: `
## Cadastro e edição

**Quais campos são obrigatórios no cadastro de um produto?**
Apenas **Nome do produto** e **Preço de venda** são obrigatórios para salvar. No entanto, **NCM** e **Origem da mercadoria** são obrigatórios para emitir notas fiscais.

**Posso alterar um produto depois de criado?**
Sim. Clique no produto na listagem e depois em **Editar produto**. Todas as informações podem ser alteradas, inclusive imagens, preço e estoque.

**Como duplicar um produto?**
Na tela de detalhes do produto, clique no menu de ações (três pontos) e selecione **Duplicar**. O sistema cria uma cópia com "(Cópia)" no nome e um novo SKU.

**Como excluir um produto?**
Na tela de detalhes, clique no menu de ações e selecione **Excluir**. Confirme a exclusão. Atenção: esta ação não pode ser desfeita. O produto e suas imagens são removidos permanentemente.

**É possível excluir vários produtos de uma vez?**
Sim. Selecione os produtos usando os checkboxes na listagem e escolha a opção de exclusão em lote.

**O que acontece com as imagens quando excluo um produto?**
As imagens são removidas permanentemente dos servidores.

## Variações

**Preciso de um plano específico para usar variações?**
Sim. Variações estão disponíveis a partir do plano **Crescer**.

**Quantas variações posso criar para um produto?**
Não há um limite prático para a quantidade de variações, mas cada tipo de variação pode ter até 30 valores diferentes (ex: 30 cores, 30 tamanhos).

**Posso ter preços diferentes em cada variação?**
Sim. Cada variação pode ter um ajuste de preço em relação ao preço base do produto, tanto para mais quanto para menos.

**Como funciona o estoque em produtos com variações?**
Cada variação tem seu próprio estoque. O estoque total do produto é a soma de todas as variações. Quando um cliente compra, o sistema dá baixa no estoque da variação específica.

**Preciso adicionar imagem para cada variação?**
Não é obrigatório, mas recomendado quando as variações têm aparências diferentes (como cores). Se não adicionar, a imagem do produto principal será usada.

## Estoque

**O que significa "Permitir vender sem estoque"?**
Quando ativado, o produto pode ser comprado mesmo com estoque zerado. O estoque fica negativo, representando vendas além do disponível. Útil para produtos sob encomenda.

**Como vejo o histórico de movimentações de um produto?**
Acesse a página **Movimentação de Estoque** no menu lateral. Lá você encontra todas as entradas e saídas registradas.

**Posso desfazer uma movimentação de estoque?**
Sim. Na página de detalhes da movimentação, clique em **Desfazer**. O sistema cria automaticamente uma movimentação inversa para corrigir o estoque.

**Qual a diferença entre estoque "Baixo" e "Esgotado"?**
- **Baixo**: o estoque está igual ou abaixo do mínimo configurado, mas ainda tem produtos
- **Esgotado**: o estoque chegou a zero

## Importação XML

**Quais notas fiscais posso importar?**
Apenas NF-e modelo 55 (nota fiscal de entrada). NFC-e (modelo 65) e notas de saída não são aceitas.

**O que acontece se eu importar uma nota com produtos que já existem?**
O sistema tenta fazer o "match" automático. Se encontrar o produto, atualiza o estoque e o custo. Se houver diferenças (nome, NCM, preço), ele mostra um alerta para você decidir.

**A importação cria o fornecedor automaticamente?**
Sim. Se o fornecedor da nota ainda não estiver cadastrado, ele é criado automaticamente com os dados da nota fiscal.

**Posso importar a mesma nota mais de uma vez?**
Não. O sistema bloqueia importações duplicadas usando a chave de acesso da nota.

## Etiquetas

**Preciso de uma impressora especial para imprimir etiquetas?**
Não. Qualquer impressora serve. Você imprime em folhas adesivas próprias para etiquetas, vendidas em papelarias.

**Consigo imprimir etiquetas com código de barras?**
Sim. O código de barras é gerado automaticamente a partir do EAN/GTIN ou SKU do produto.

**O código de barras da etiqueta funciona no leitor?**
Sim. O código é gerado no formato adequado para leitura óptica.

**Posso gerar etiquetas apenas para produtos selecionados?**
Sim. Selecione os produtos na listagem antes de acessar a ferramenta, ou adicione manualmente dentro do modal.

## Geral

**Como faço para um produto aparecer na minha loja online?**
O produto precisa estar com **Status = Ativo** e **Exibir na Vitrine = Sim**. Se ambas as opções estiverem corretas, ele aparecerá na loja.

**O que significa "Valor sob consulta"?**
Quando você desmarca "Exibir o preço na vitrine online", o produto aparece sem preço, com a mensagem "Valor sob consulta". O cliente precisa entrar em contato para saber o valor.

**Posso vender produtos digitais?**
Sim. Ao cadastrar, escolha o tipo do produto como digital. Produtos digitais não precisam de dados de envio ou estoque físico.

**O que é SKU e para que serve?**
SKU é um código interno único para identificar cada produto. Ele ajuda na organização, na busca e na integração com marketplaces e transportadoras.

**Meu plano atual tem limite de produtos?**
Depende do seu plano. Se você tentar cadastrar e atingir o limite, o sistema avisa e sugere o upgrade para um plano superior.
`
            }
        ]
    },
    {
        id: "vendas",
        title: "Vendas",
        articles: [
            {
                id: "visao-geral-vendas",
                title: "Visão geral de vendas",
                description: "Entenda o ecossistema de vendas da plataforma.",
                slug: "visao-geral-vendas",
                category: "vendas",
                content: `
O módulo de **Vendas** é onde você gerencia tudo o que envolve comercializar seus produtos e serviços: desde a criação de um orçamento até a entrega ao cliente final. É o coração operacional do seu negócio.

Esta seção reúne **pedidos**, **orçamentos**, **PDV**, **caixa**, **devoluções**, **entregas** e **metas** — tudo em um só lugar.

[IMAGEM: Tela principal do módulo de Vendas com os atalhos para cada subseção]
Legenda: O menu de vendas dá acesso rápido a todas as operações do dia a dia.

## Como funciona

Toda venda passa por etapas que se conectam entre si. Veja o fluxo básico:

1. **Antes da venda** — Você cria orçamentos para clientes ou prepara o PDV para atendimento presencial.
2. **A venda acontece** — O pedido é gerado (manual, PDV, orçamento convertido, loja online ou WhatsApp).
3. **Pós-venda** — O pedido pode ser entregue, faturado e, se necessário, devolvido ou trocado.
4. **Gestão** — Metas de vendas acompanham o desempenho da equipe. O caixa registra todas as movimentações financeiras do PDV.

[IMAGEM: Fluxograma simples mostrando a jornada: Orçamento → Pedido → Pagamento → Expedição/Entrega → Devolução (opcional)]
Legenda: Ciclo completo de uma venda na plataforma.

## O que você encontra nesta seção

**Pedidos** — Central de acompanhamento. Aqui você cria, edita, cancela e acompanha todos os pedidos da loja. Cada pedido armazena itens, cliente, forma de pagamento, endereço de entrega e histórico de alterações.

**Orçamentos** — Crie propostas profissionais para enviar aos clientes. O cliente pode visualizar, aprovar ou rejeitar online. Com um clique, o orçamento vira pedido.

**PDV (Ponto de Venda)** — O balcão digital. Ideal para vendas presenciais: adicione itens ao carrinho, aplique descontos, divida o pagamento em múltiplas formas e finalize a venda.

**Caixa** — Controle o dinheiro do PDV. Abra e feche o caixa, registre sangrias e reforços, confira o saldo no fim do expediente.

**Devoluções e trocas** — Gerencie solicitações de troca, reembolso ou crédito. Acompanhe o status de cada solicitação até a resolução.

**Expedição e entregas** — Organize a logística: cadastre entregadores, crie rotas inteligentes agrupando pedidos por região e acompanhe a entrega até a confirmação.

**Metas de vendas** — Defina objetivos para a equipe, acompanhe o progresso em tempo real e veja rankings de desempenho por vendedor.

## Dicas importantes

- Comece organizando seus **produtos** e **clientes** antes de usar o módulo de vendas — isso agiliza o atendimento.
- Os status de pagamento e entrega ajudam a filtrar pedidos pendentes. Mantenha-os atualizados para não perder prazos.
- O **caixa** precisa estar aberto para finalizar vendas no PDV. Crie o hábito de abrir e fechar o caixa todos os dias.
- Todas as operações de vendas (PDV e pedidos manuais) geram movimentação de estoque automaticamente.

## Perguntas frequentes

**Qual a diferença entre criar um pedido manual e usar o PDV?**
O pedido manual é usado para vendas à distância (whatsapp, telefone, loja online) e permite preencher todos os dados com calma. O PDV é para vendas presenciais rápidas, com foco em agilidade no checkout.

**Um orçamento vira pedido automaticamente?**
Não. Você precisa converter o orçamento em pedido manualmente. O sistema cria uma cópia dos itens e dados do cliente no novo pedido.

**O que acontece com o estoque quando uma venda é finalizada?**
Os itens vendidos são deduzidos do estoque automaticamente. Se a venda for cancelada ou devolvida, o estoque é restaurado.

**Preciso abrir caixa todos os dias?**
Sim. Para vender no PDV, é obrigatório ter uma sessão de caixa aberta. Ao final do expediente, feche o caixa para registrar o balanço do dia.
`
            },
            {
                id: "criando-gerenciando-pedidos",
                title: "Criando e gerenciando pedidos",
                description: "Como criar, visualizar e gerenciar pedidos na plataforma.",
                slug: "criando-gerenciando-pedidos",
                category: "vendas",
                content: `
A seção de **Pedidos** é onde você acompanha todas as vendas da sua loja, independentemente de como foram feitas — PDV, loja online, WhatsApp ou manualmente.

Cada pedido reúne as informações completas da venda: itens, cliente, valores, forma de pagamento, endereço de entrega e status.

[IMAGEM: Listagem de pedidos com filtros e busca]
Legenda: A tela principal mostra todos os pedidos organizados por data.

## Quando utilizar

- Para registrar uma venda feita por WhatsApp, telefone ou presencialmente (fora do PDV).
- Para acompanhar pedidos que chegaram pela loja online.
- Para consultar detalhes de uma venda antiga.
- Para emitir uma segunda via do recibo ou comprovante.

## Como criar um pedido

1. No menu lateral, clique em **Vendas > Pedidos**.
2. Clique no botão **Novo pedido**.

[IMAGEM: Botão "Novo pedido" destacado no topo da listagem]
Legenda: O botão fica no canto superior direito da tela.

3. **Selecione o cliente** — Busque por nome, email ou telefone. Se o cliente ainda não estiver cadastrado, você pode criá-lo na hora.
4. **Adicione os itens** — Busque produtos ou serviços. Para cada item, informe a quantidade. Você também pode aplicar desconto por item se necessário.
5. **Ajuste os valores** — Configure frete, outros custos e desconto geral (valor fixo ou percentual).

[IMAGEM: Tela de criação de pedido com itens e valores]
Legenda: Preencha as informações principais antes de salvar o pedido.

6. **Defina a forma de pagamento** — Escolha o método e, se aplicável, divida o pagamento entre múltiplas formas (ex: parte no dinheiro, parte no cartão).
7. **Configure a entrega** — Escolha entre **Entrega** (com endereço) ou **Retirada** no balcão.
8. Clique em **Salvar pedido**.

## Como visualizar detalhes do pedido

Clique em qualquer pedido da lista para abrir a tela de detalhes. Lá você encontra:

- **Itens do pedido** — Lista completa com quantidades e preços.
- **Informações do cliente** — Nome, contato e endereço de entrega.
- **Financeiro** — Valores, descontos, forma de pagamento e status (pago, parcial, pendente).
- **Entrega** — Status atual e data prevista.
- **Histórico** — Linha do tempo com todas as alterações feitas no pedido.

[IMAGEM: Tela de detalhes do pedido com abas]
Legenda: As abas organizam as informações para fácil consulta.

## Como imprimir recibo

Na tela de detalhes do pedido, clique em **Imprimir recibo**. Você pode escolher entre:

- **Recibo térmico** (formato reduzido, ideal para impressoras térmicas).
- **Recibo A4** (formato completo, ideal para impressão comum).

## Como alterar o status de pagamento

Na tela de detalhes, você pode atualizar o status de pagamento:

- **Pago** — O cliente já pagou o valor total.
- **Parcialmente pago** — O cliente pagou parte do valor.
- **Pendente** — Aguardando pagamento.

## Como alterar o status de entrega

Da mesma forma, você pode informar em que etapa a entrega se encontra:

- **Não enviado** — Pedido pronto, aguardando envio.
- **Em preparação** — Está sendo separado ou produzido.
- **Enviado** — Saiu para entrega.
- **Entregue** — Foi entregue ao cliente.
- **Pronto para retirada** — Disponível para o cliente buscar.

## Dicas importantes

- Pedidos criados no **PDV** aparecem automaticamente na listagem de pedidos. Não é preciso criá-los novamente.
- Mantenha os status atualizados — isso ajuda a filtrar pedidos pendentes e evita atrasos.
- O desconto geral é aplicado sobre o subtotal. Já o desconto por item é aplicado individualmente. Os dois podem ser usados juntos.
- Para pedidos com entrega, o sistema usa o endereço informado no cadastro do cliente. Você pode alterar o endereço na hora da criação.

## Problemas comuns

**"Não consigo criar um pedido porque o cliente não aparece na busca."**
Você pode cadastrar um novo cliente no momento da criação do pedido — basta clicar em "Adicionar cliente".

**"O recibo não está saindo no formato correto."**
Verifique se selecionou o tipo correto (térmico ou A4) antes de imprimir.

**"Alterei o status de pagamento por engano."**
Você pode reverter a qualquer momento. Basta selecionar o status correto novamente.

## Perguntas frequentes

**Consigo editar um pedido depois de salvo?**
Sim, você pode alterar itens, valores, cliente e outras informações enquanto o pedido não estiver faturado.

**O que significa "Parcialmente pago"?**
O cliente pagou um valor menor que o total do pedido. O saldo restante continua pendente.

**Pedidos do PDV aparecem onde?**
Eles aparecem automaticamente na listagem de pedidos com a indicação de que foram feitos no PDV.
`
            },
            {
                id: "historico-cancelamento-pedidos",
                title: "Histórico e cancelamento de pedidos",
                description: "Como acompanhar alterações e cancelar pedidos.",
                slug: "historico-cancelamento-pedidos",
                category: "vendas",
                content: `
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
- O valor pago (se houver) não é estornado automaticamente — você precisa processar o reembolso manualmente pela seção de Devoluções e trocas.

## O que acontece com o estoque

Quando um pedido é cancelado, o sistema automaticamente devolve os itens ao estoque. Por exemplo: se o pedido tinha 5 camisetas, essas 5 unidades voltam a ficar disponíveis.

Isso vale para pedidos que já tiveram o estoque baixado (pedidos com status "Pago" ou "Em preparação").

## Dicas importantes

- Cancelen apenas pedidos que não serão concluídos. Se o cliente quer trocar um item, prefira usar a seção de **Devoluções e trocas**.
- O histórico é útil para auditoria. Incentive sua equipe a registrar observações relevantes ao alterar pedidos.
- Pedidos cancelados continuam aparecendo na listagem, mas com o status "Cancelado". Você pode filtrar para ocultá-los se preferir.

## Problemas comuns

**"Cancelei o pedido mas o produto ainda aparece no estoque."**
Verifique se o pedido já tinha o estoque baixado. Pedidos com status "Pendente" ou "Não pago" geralmente não baixam o estoque — nesse caso não há o que restaurar.

**"Preciso desfazer um cancelamento."**
Não é possível reverter um cancelamento. Você precisará criar um novo pedido com os mesmos itens.

## Perguntas frequentes

**O cancelamento estorna o pagamento automaticamente?**
Não. O cancelamento apenas altera o status do pedido e restaura o estoque. Para estornar o pagamento, você deve abrir uma solicitação de devolução ou reembolso.

**Consigo cancelar um pedido que já foi entregue?**
Sim, é possível. Mas lembre-se de que o estoque será restaurado e você precisará combinar a logística de retorno com o cliente.

**Quem pode cancelar um pedido?**
Usuários com permissão de gestão (proprietário, administrador ou gerente). Operadores podem ter permissão limitada dependendo da configuração da sua loja.
`
            },
            {
                id: "criando-enviando-orcamentos",
                title: "Criando e enviando orçamentos",
                description: "Como criar propostas profissionais para seus clientes.",
                slug: "criando-enviando-orcamentos",
                category: "vendas",
                content: `
O **orçamento** é uma proposta comercial que você envia para o cliente antes da venda. Ele lista os produtos ou serviços, quantidades, preços e condições — tudo formatado de forma profissional.

O cliente pode visualizar o orçamento online, aprovar ou rejeitar, e você pode convertê-lo em pedido com um clique.

[IMAGEM: Tela de criação de orçamento com itens e preview]
Legenda: Enquanto você monta o orçamento, a prévia é atualizada em tempo real.

## Quando utilizar

- Quando o cliente pede um "orçamento" antes de decidir comprar.
- Para vendas consultivas, onde você precisa explicar os itens e valores antes do fechamento.
- Para propostas formais para empresas (CNPJ) que exigem documentação.
- Quando o cliente não tem pressa e você quer manter a oferta registrada por um prazo de validade.

## Como criar um orçamento

1. No menu lateral, clique em **Vendas > Orçamentos**.
2. Clique em **Novo orçamento**.

[IMAGEM: Botão "Novo orçamento" na listagem]
Legenda: O botão fica no topo da tela.

3. **Selecione o cliente** — Busque por nome. Se não encontrar, cadastre um novo cliente na hora.
4. **Adicione produtos ou serviços** — Busque pelo nome. Você pode misturar produtos físicos e serviços no mesmo orçamento.
5. **Ajuste quantidades e preços** — Para cada item, você pode alterar a quantidade e o preço unitário.

[IMAGEM: Seção de itens do orçamento com campos de quantidade e preço]
Legenda: Adicione quantos itens precisar.

6. **Configure as condições** — Defina:
   - **Data do orçamento** (geralmente a data de hoje).
   - **Data de validade** (prazo para o cliente aceitar a proposta).
   - **Descontos** (por item ou geral, em valor fixo ou percentual).
   - **Frete** e **outros custos**, se aplicável.
7. **Personalize a aparência** — Escolha as cores do tema, o título (ex: "Orçamento", "Proposta Comercial") e decida se quer exibir a decoração visual.

[IMAGEM: Opções de personalização do orçamento]
Legenda: Deixe o orçamento com a cara da sua loja.

8. Clique em **Salvar**.

## Como visualizar e compartilhar

Após salvar, você pode:

- **Visualizar a prévia** — Veja exatamente como o cliente vai receber o orçamento.
- **Baixar em PDF** — Gere um arquivo PDF para enviar por email ou WhatsApp.
- **Compartilhar link** — O sistema gera um link único. Envie para o cliente. Ele pode abrir no navegador, visualizar e responder.

[IMAGEM: Opções de compartilhamento na tela de detalhes do orçamento]
Legenda: Compartilhe por link, PDF ou WhatsApp.

## Dicas importantes

- Defina uma **data de validade** sempre. Isso cria um senso de urgência e evita que o cliente tente usar um preço antigo.
- Revise os valores antes de enviar. O orçamento é um documento comercial — erros passam uma imagem negativa.
- Use a **personalização de cores** para manter a identidade visual da sua marca.
- Para orçamentos com muitos itens, organize por categoria ou tipo de produto para facilitar a leitura.

## Problemas comuns

**"O cliente disse que não recebeu o link."**
Verifique se o orçamento foi salvo e compartilhado corretamente. Você também pode copiar o link manualmente e enviar por outro canal.

**"O preço do produto mudou depois que enviei o orçamento."**
O orçamento salva os preços no momento da criação. Alterações futuras no cadastro do produto não afetam orçamentos já enviados.

## Perguntas frequentes

**Quantos orçamentos posso criar?**
Não há limite. Crie quantos precisar.

**O cliente precisa ter cadastro para receber um orçamento?**
Sim, o orçamento precisa estar vinculado a um cliente. Se ele não existir, cadastre na hora.

**Posso editar um orçamento depois de enviado?**
Sim, você pode editar itens, valores e condições. O link compartilhado sempre mostrará a versão mais recente.
`
            },
            {
                id: "acompanhando-convertendo-orcamentos",
                title: "Acompanhando e convertendo orçamentos",
                description: "Monitore o status e converta orçamentos em pedidos.",
                slug: "acompanhando-convertendo-orcamentos",
                category: "vendas",
                content: `
Depois que você envia um orçamento, o cliente pode interagir com ele online. Você acompanha cada etapa — desde o envio até a aprovação ou rejeição — e, quando chega a hora, converte o orçamento em pedido com um clique.

[IMAGEM: Listagem de orçamentos com indicadores de status]
Legenda: Cada orçamento mostra seu status atual com cores diferentes.

## Status do orçamento

Cada orçamento passa por um fluxo de status. Você consegue ver em qual etapa ele está só de olhar na listagem:

| Status | Significado |
|---|---|
| **Rascunho** | Foi criado mas ainda não foi enviado. Só você vê. |
| **Enviado** | O link foi gerado e compartilhado com o cliente. |
| **Visualizado** | O cliente abriu o link e viu o orçamento. |
| **Pendente** | O cliente visualizou mas ainda não respondeu. |
| **Aprovado** | O cliente confirmou que aceita a proposta. |
| **Rejeitado** | O cliente recusou a proposta. |
| **Expirado** | O prazo de validade passou sem resposta. |
| **Cancelado** | Você cancelou o orçamento. |

> 💡 **Dica:** Orçamentos com status "Aprovado" são os principais candidatos para conversão em pedido.

## Como acompanhar

1. Na listagem de orçamentos, você vê todos os status de uma só vez.
2. Clique em um orçamento para abrir os detalhes completos.
3. Na aba **Histórico**, você vê a linha do tempo com todas as interações: quando foi enviado, visualizado, quando o cliente comentou, etc.

[IMAGEM: Aba de histórico do orçamento com interações]
Legenda: Todas as ações ficam registradas para consulta.

### Interações com o cliente

Se o cliente acessar o link do orçamento, ele pode:

- **Visualizar** todos os itens, quantidades e valores.
- **Aprovar** o orçamento — indicando que aceita a proposta.
- **Rejeitar** o orçamento — opcionalmente informando o motivo.

Quando o cliente aprova ou rejeita, você recebe a notificação no sistema e o status é atualizado automaticamente.

### Comentários da equipe

Você e sua equipe podem registrar **comentários internos** em cada orçamento. Isso é útil para:

- Alinhar descontos especiais.
- Combinar prazos de entrega.
- Registrar observações sobre o cliente.

Para adicionar um comentário, abra o orçamento, vá até a seção de interações e escreva sua observação.

## Como converter em pedido

Quando o cliente aprova o orçamento (ou quando você decide que está bom para fechar):

1. Abra o orçamento aprovado.
2. Clique no botão **Converter em pedido**.

[IMAGEM: Botão "Converter em pedido" destacado]
Legenda: A conversão leva todos os dados do orçamento para o pedido.

3. Pronto. O sistema cria um **pedido** com todos os itens, cliente, valores e condições do orçamento.
4. Você é redirecionado para o pedido recém-criado, onde pode ajustar detalhes finais (forma de pagamento, endereço de entrega) e finalizar.

**Importante:** Orçamentos só podem ser convertidos uma vez. Após a conversão, o orçamento recebe um marcador "Convertido" e o botão de conversão é desabilitado.

## Dicas importantes

- Não converta orçamentos que ainda estão como "Rascunho" ou "Pendente". Aguarde a aprovação do cliente ou, se necessário, combine com ele antes de converter.
- Orçamentos expirados podem ser renovados: duplique o orçamento e ajuste a data de validade.
- Se o cliente rejeitou, tente entender o motivo. Pode ser uma oportunidade de ajustar a proposta e enviar um novo orçamento.

## Problemas comuns

**"O cliente aprovou mas não consigo converter."**
Verifique se o orçamento já não foi convertido antes. Cada orçamento só pode ser convertido uma vez.

**"O cliente diz que aprovou mas o status não mudou."**
Peça para o cliente acessar o link novamente e clicar em "Aprovar". Às vezes ele apenas visualizou sem confirmar.

## Perguntas frequentes

**O que acontece com os itens do orçamento no pedido?**
Todos os itens, quantidades e preços são copiados para o pedido. Você pode ajustar antes de finalizar.

**Consigo desfazer a conversão?**
Não. Após converter, o pedido já existe. Se precisar, cancele o pedido e crie um novo orçamento.

**O cliente pode aprovar pelo celular?**
Sim. O link do orçamento funciona em qualquer dispositivo com navegador.
`
            },
            {
                id: "abrindo-fechando-caixa",
                title: "Abrindo e fechando o caixa",
                description: "Gerencie as sessões de caixa do PDV.",
                slug: "abrindo-fechando-caixa",
                category: "vendas",
                content: `
O **caixa** é o controle do dinheiro físico (e dos recebimentos) do seu PDV. Antes de começar a vender no balcão, você precisa abrir o caixa. Ao final do expediente, você fecha e confere se tudo está certo.

É como o velho livro-caixa, mas digital: o sistema registra cada movimentação e calcula automaticamente o saldo esperado.

[IMAGEM: Tela principal do caixa com sessão ativa]
Legenda: Quando o caixa está aberto, você vê o saldo atual e as movimentações.

## Quando utilizar

- Todo dia útil, antes de começar as vendas presenciais.
- Quando precisar retirar dinheiro do caixa (sangria) — por exemplo, para pagar um fornecedor.
- Quando precisar colocar mais dinheiro no caixa (reforço/suprimento).
- No fim do expediente, para fechar o caixa e conferir o movimento do dia.

## Como abrir o caixa

1. No menu lateral, clique em **Vendas > PDV**.
2. Se não houver um caixa aberto, o sistema exibe a tela de abertura.

[IMAGEM: Tela de abertura de caixa com campo de valor inicial]
Legenda: Informe o valor em dinheiro que está no caixa no início do dia.

3. Informe o **valor inicial** (troco) — é o dinheiro que você está colocando no caixa para começar o dia.
4. Opcionalmente, adicione uma **observação** (ex: "Abertura com R$ 200,00 de troco").
5. Clique em **Abrir caixa**.

Pronto. Agora o PDV está liberado para vendas.

## Como registrar sangria e reforço

Durante o expediente, pode ser necessário movimentar o dinheiro do caixa:

**Sangria (retirada):** Use quando precisar tirar dinheiro do caixa — por exemplo, para pagar um fornecedor ou depositar no banco.

**Reforço (depósito):** Use quando colocar mais dinheiro no caixa — por exemplo, troco extra que foi buscar no banco.

Para registrar:

1. Na tela do caixa ativo, clique em **Sangria** ou **Reforço**.
2. Informe o **valor** e uma **descrição** (ex: "Pagamento fornecedor X").
3. Clique em **Confirmar**.

[IMAGEM: Modal de sangria com campos de valor e descrição]
Legenda: Sempre descreva o motivo para facilitar a conferência no fechamento.

A movimentação aparece automaticamente na lista e o saldo do caixa é atualizado.

## Como fechar o caixa

1. Na tela do caixa ativo, clique em **Fechar caixa**.
2. O sistema exibe o **resumo de fechamento** com:
   - Total de vendas agrupadas por forma de pagamento.
   - Valor calculado (o que o sistema espera que tenha no caixa).
   - Movimentações (sangrias e reforços).
3. **Informe a contagem do dinheiro** — Digite quanto tem em cada forma de pagamento (ex: R$ 500,00 em dinheiro, R$ 800,00 em cartão).

[IMAGEM: Tela de fechamento com contagem por método]
Legenda: Confira cada método de pagamento e informe o valor contado.

4. O sistema calcula a **diferença** entre o valor contado e o valor esperado.
5. Se houver diferença, você pode adicionar uma observação explicando.
6. Clique em **Fechar caixa**.

Após fechar, o caixa não pode mais ser usado. Uma nova sessão precisará ser aberta no próximo dia útil.

## Histórico de sessões

Você pode consultar todas as sessões de caixa anteriores em **Vendas > Caixa > Histórico**. Lá encontra:

- Data e hora de abertura e fechamento.
- Quem abriu e quem fechou.
- Valor inicial, total de vendas, sangrias, reforços.
- Valor calculado vs. valor contado e diferença.

[IMAGEM: Histórico de sessões de caixa]
Legenda: Consulte sessões anteriores para conferência ou auditoria.

## Dicas importantes

- **Abra e feche o caixa todos os dias.** Isso evita que movimentações de dias diferentes se misturem.
- A **sangria** é para retirada de dinheiro. Se o cliente pediu estorno de um pagamento em dinheiro, registre como **sangria** com a descrição adequada.
- Se o caixa fechar com **diferença**, investigue antes de encerrar. Pode ser um troco errado ou uma venda não registrada.
- Somente o **operador que abriu** o caixa ou **usuários com permissão de gestão** podem fechá-lo.

## Problemas comuns

**"Esqueci de abrir o caixa e já comecei a vender."**
As vendas feitas sem caixa aberto não são permitidas no PDV. Feche o atendimento, abra o caixa e refaça as vendas.

**"O caixa está com diferença e não encontro o erro."**
Revise as movimentações do dia no resumo de fechamento. Confira se todas as sangrias e reforços foram registrados.

## Perguntas frequentes

**Preciso ter dinheiro físico para abrir o caixa?**
Sim, o valor inicial é o dinheiro que você coloca no caixa para dar troco. Se não tiver, informe R$ 0,00.

**Posso abrir o caixa e vender só no cartão?**
Sim. O caixa registra vendas de todas as formas de pagamento, não apenas dinheiro.

**O que acontece se eu fechar o caixa com diferença?**
O sistema registra a diferença. Você pode adicionar uma observação explicando. A diferença fica salva no histórico para auditoria.

**Consigo estornar uma sangria ou reforço?**
Sim. Na lista de movimentações, você pode reverter (estornar) uma sangria ou reforço desde que o caixa ainda esteja aberto.
`
            },
            {
                id: "vendendo-no-pdv",
                title: "Vendendo no PDV",
                description: "Fluxo completo de vendas no Ponto de Venda.",
                slug: "vendendo-no-pdv",
                category: "vendas",
                content: `
O **PDV (Ponto de Venda)** é o balcão digital da sua loja. Ele foi feito para vendas presenciais rápidas: você adiciona itens ao carrinho, aplica descontos, divide o pagamento em várias formas e finaliza a venda em segundos.

Antes de começar, certifique-se de que o **caixa está aberto**. Se não estiver, veja o artigo "Abrindo e fechando o caixa".

[IMAGEM: Tela principal do PDV com carrinho e painel de pagamento]
Legenda: O PDV é dividido em carrinho (esquerda) e resumo (direita).

## Quando utilizar

- Vendas presenciais no balcão ou loja física.
- Quando o cliente está na frente de você e quer comprar rápido.
- Para usar funções como divisão de pagamento e desconto por item.
- Para salvar uma venda como rascunho e finalizar depois (pré-venda).

## Como fazer uma venda completa

### 1. Adicione itens ao carrinho

- **Busque por nome** — Digite o nome do produto. Conforme você digita, o sistema sugere resultados.
- **Selecione variações** — Se o produto tem variações (cor, tamanho), uma janela abre para você escolher a opção correta.
- **Adicione serviços** — Serviços também aparecem na busca e podem ser misturados com produtos no mesmo carrinho.
- **Ajuste a quantidade** — Use os botões + e - ou digite o número diretamente.

[IMAGEM: Busca de produtos no PDV com sugestões]
Legenda: A busca encontra produtos e serviços cadastrados.

### 2. Aplique descontos e cupons

Você pode conceder descontos de duas formas:

- **Desconto por item** — Clique no item do carrinho e aplique um desconto fixo ou percentual naquele item específico.
- **Desconto geral** — Aplique um desconto sobre o total do carrinho (valor fixo ou percentual).

Se o cliente tem um **cupom de desconto**, informe o código no campo apropriado. O sistema valida se o cupom é válido e aplica automaticamente.

### 3. Configure o frete (se necessário)

Se o cliente vai levar os produtos na hora, mantenha o frete como **Retirada**. Se precisa entregar:

1. Ative a opção **Entrega**.
2. Informe o **valor do frete** ou selecione a região de entrega.
3. Se disponível, o sistema pode calcular a distância e o tempo estimado.

### 4. Escolha a forma de pagamento

O PDV aceita **pagamento dividido** entre múltiplas formas. Por exemplo:

- R$ 50,00 em dinheiro
- R$ 150,00 no cartão de crédito (em 3x)

Para isso:

1. Clique em **Adicionar forma de pagamento**.
2. Escolha o método (dinheiro, cartão, PIX, etc.).
3. Informe o valor e, para cartão, o número de parcelas.
4. Repita para cada forma de pagamento que o cliente usar.

O sistema mostra quanto falta pagar. Você pode finalizar quando o valor total for atingido.

[IMAGEM: Tela de divisão de pagamento com múltiplos métodos]
Legenda: Divida o pagamento entre dinheiro, cartão, PIX e outros.

### 5. Finalize a venda

1. Revise o carrinho e os valores.
2. Se o cliente vai levar depois, marque a opção **Pendente de entrega** (útil para itens que precisam ser preparados ou estão em falta no balcão).
3. Clique em **Finalizar venda**.

Após finalizar:

- A venda é registrada como **pedido** na listagem de pedidos.
- O **estoque** é baixado automaticamente.
- O **caixa** recebe a movimentação da venda.
- Um **recibo** pode ser impresso.

[IMAGEM: Tela de finalização com opção de imprimir recibo]
Legenda: Após finalizar, escolha se quer imprimir o recibo.

## Como salvar uma pré-venda (rascunho)

Se o cliente não vai pagar agora ou você precisa de mais informações:

1. Adicione os itens e configure como desejar.
2. Clique em **Salvar como rascunho**.
3. O carrinho é salvo como **pré-venda** e aparece na lista de rascunhos.

Para retomar: na tela inicial do PDV, clique no rascunho desejado. Você pode editar os itens e finalizar quando estiver pronto.

## Dicas importantes

- Tenha o **caixa aberto** antes de iniciar o PDV. O sistema bloqueia a finalização sem caixa ativo.
- Itens com **estoque insuficiente** aparecem com aviso. Você pode vender mesmo assim se o produto permitir venda sem estoque.
- O **desconto por item** e o **desconto geral** podem ser usados juntos. O sistema calcula corretamente.
- Se o cliente desistir, você pode limpar o carrinho ou salvar como rascunho para outro momento.

## Problemas comuns

**"Tentei finalizar mas o sistema diz que o caixa está fechado."**
Abra o caixa primeiro.

**"O produto que busquei não aparece."**
Verifique se ele está cadastrado como ativo e se tem estoque. Produtos inativos não aparecem no PDV.

**"O cliente pagou mas o recibo não saiu."**
Você pode imprimir o recibo novamente acessando o pedido gerado em **Pedidos**.

## Perguntas frequentes

**Consigo vender um produto com preço diferente do cadastro?**
Sim. No carrinho você pode alterar o preço unitário do item antes de finalizar.

**O PDV funciona com leitor de código de barras?**
Sim, você pode usar um leitor para agilizar a inclusão dos produtos.

**Onde vejo as vendas que foram feitas no PDV?**
Todas as vendas do PDV aparecem automaticamente na listagem de **Pedidos**.
`
            },
            {
                id: "pdv-funcionalidades-rapidas",
                title: "Funcionalidades rápidas do PDV",
                description: "Crie produtos, clientes e gerencie pré-vendas no PDV.",
                slug: "pdv-funcionalidades-rapidas",
                category: "vendas",
                content: `
Além de vender, o PDV tem atalhos para situações do dia a dia. Você pode criar um produto novo sem sair da tela, cadastrar um cliente na hora, retomar vendas salvas como rascunho e aplicar promoções automáticas.

[IMAGEM: PDV com menu de ações rápidas acessível pelo botão "+"]
Legenda: As ações rápidas ficam disponíveis durante a venda.

## Quando utilizar

- Quando um produto que o cliente quer ainda não está cadastrado.
- Quando o cliente não está na sua base e você precisa finalizar a venda rápido.
- Quando uma venda foi interrompida e você quer continuar depois.
- Quando o cliente tem uma promoção ativa (brinde, desconto) que deve ser aplicada automaticamente.

## Como criar um produto rápido

Se o cliente pede um produto que ainda não existe no sistema:

1. No PDV, clique no botão de **ações rápidas** (atalho).
2. Selecione **Criar produto rápido**.
3. Informe:
   - **Nome do produto** (obrigatório).
   - **Preço** (obrigatório).
   - **Quantidade em estoque** (opcional — se não informar, fica como 0).

[IMAGEM: Modal de criação rápida de produto]
Legenda: Apenas o essencial para não atrasar o atendimento.

4. Clique em **Criar**. O produto é cadastrado e já adicionado ao carrinho.

O produto criado dessa forma aparece no seu catálogo e pode ser editado depois (ajustar categoria, SKU, imagens, etc.).

## Como criar um cliente rápido

Se o cliente não está cadastrado:

1. No PDV, clique em **ações rápidas** > **Criar cliente rápido**.
2. Informe o **nome** (obrigatório) e opcionalmente **email**, **telefone** ou **CPF**.
3. Se quiser, adicione um **endereço** para entrega.
4. Clique em **Criar**.

O cliente é salvo na base e já fica selecionado no carrinho.

## Como salvar e retomar pré-vendas

**Salvar como rascunho:**

Durante a venda, se o cliente precisa de mais tempo ou você vai atender outra pessoa:

1. Clique em **Salvar como rascunho**.
2. Dê um nome ou identificação para o rascunho (opcional).
3. O carrinho é salvo com todos os itens e configurações.

[IMAGEM: Lista de pré-vendas (rascunhos) na tela inicial do PDV]
Legenda: Os rascunhos ficam disponíveis para retomada.

**Retomar um rascunho:**

1. Na tela inicial do PDV, localize o rascunho na lista.
2. Clique sobre ele. O carrinho é carregado exatamente como estava.
3. Continue a venda normalmente.

Os rascunhos expirados ou muito antigos podem ser excluídos manualmente.

## Como aplicar promoções automáticas

Se você tem promoções ativas configuradas (como "Leve 3 pague 2" ou "Compre X e ganhe um brinde"), o PDV as aplica automaticamente quando os critérios são atendidos.

Ao adicionar itens ao carrinho:

- O sistema verifica se alguma promoção ativa se aplica.
- Brindes aparecem no carrinho com valor zero e a tag **[BRINDE]**.
- Descontos promocionais são aplicados automaticamente no item.

Você não precisa fazer nada — as promoções são calculadas em tempo real. Se quiser conferir, veja o resumo do carrinho antes de finalizar.

[IMAGEM: Carrinho com brinde aplicado automaticamente]
Legenda: Brindes aparecem identificados e com valor zero.

## Dicas importantes

- Produtos criados de forma rápida ficam com dados básicos. Depois da venda, edite o cadastro para completar as informações (categoria, NCM, imagens, etc.).
- Clientes criados rapidamente também podem ser complementados depois na seção de **Clientes**.
- Rascunhos (pré-vendas) são salvos por cliente. Se você atendeu um cliente e outro pediu o mesmo carrinho, crie um rascunho novo para não misturar.
- Promoções precisam estar ativas e dentro do período de validade para serem aplicadas.

## Problemas comuns

**"Criei um produto rápido com o nome errado."**
Você pode editar o produto depois em **Produtos**. Localize pelo nome e corrija as informações.

**"Meu rascunho sumiu."**
Rascunhos não são excluídos automaticamente. Verifique se não foi finalizado ou excluído por engano. Use a busca para localizar.

## Perguntas frequentes

**O produto rápido aparece na loja online?**
Aparece, mas com dados mínimos. Recomendamos completar o cadastro (imagens, descrição, categoria) antes de ativar na vitrine.

**Quantos rascunhos posso ter?**
Não há limite, mas recomendamos excluir os que já foram atendidos para não poluir a lista.

**Promoções automáticas funcionam com cupons também?**
Sim. A promoção automática é aplicada primeiro. Depois, se o cliente tem um cupom, ele pode ser adicionado manualmente.
`
            },
            {
                id: "solicitando-devolucao-troca",
                title: "Solicitando devolução ou troca",
                description: "Como criar solicitações de devolução, troca ou reembolso.",
                slug: "solicitando-devolucao-troca",
                category: "vendas",
                content: `
Quando um cliente precisa devolver um produto, trocar por outro ou solicitar reembolso, você cria uma **solicitação de devolução** diretamente pelo pedido. O sistema guia você por todas as etapas: escolha dos itens, motivo, condição do produto e resolução desejada.

[IMAGEM: Tela de criação de solicitação de devolução]
Legenda: Selecione os itens do pedido que serão devolvidos.

## Quando utilizar

- O cliente recebeu o produto errado ou com defeito.
- O cliente se arrependeu da compra e quer devolver.
- O cliente quer trocar um produto por outro (modelo, cor, tamanho diferente).
- Você precisa cancelar um pedido e reembolsar o cliente.
- O cliente solicita crédito na loja em vez de reembolso.

**Importante:** A solicitação de devolução só pode ser criada para pedidos com status de pagamento **Pago** ou **Parcialmente pago**.

## Como criar uma solicitação

1. No menu lateral, clique em **Vendas > Devoluções e trocas**.
2. Clique em **Nova solicitação**.

[IMAGEM: Botão "Nova solicitação" na listagem]
Legenda: O botão inicia o processo de devolução.

3. **Selecione o pedido** — Busque pelo número do pedido ou localize na lista de pedidos pagos.

[IMAGEM: Busca de pedido para devolução]
Legenda: Somente pedidos pagos aparecem como elegíveis.

4. **Escolha os itens** — Selecione quais itens do pedido serão devolvidos. Você pode devolver todos ou apenas alguns.
5. Para cada item, informe:
   - **Quantidade** a ser devolvida.
   - **Motivo** (ex: "Produto com defeito", "Arrependimento", "Avaria no transporte").
   - **Condição** do produto: **Lacrado** (sem uso), **Aberto** (usado mas íntegro) ou **Avariado** (com danos).

6. **Defina a resolução desejada**:
   - **Troca** — O cliente quer outro produto no lugar. É permitida apenas para pedidos já entregues.
   - **Reembolso** — Você vai devolver o valor pago (PIX, cartão ou manual).
   - **Crédito na loja** — O valor vira crédito para o cliente usar em compras futuras.

[IMAGEM: Escolha do tipo de resolução]
Legenda: Cada tipo de resolução segue um fluxo diferente.

7. **Anexe evidências** (opcional) — Faça upload de fotos que comprovem o estado do produto. Útil para produtos com defeito ou avariados.
8. Adicione uma **mensagem** com detalhes sobre a solicitação (opcional).
9. Clique em **Criar solicitação**.

## Status da solicitação

| Status | Significado |
|---|---|
| **Pendente análise** | Aguardando revisão da loja. |
| **Em análise** | A loja está avaliando a solicitação. |
| **Aprovado** | A solicitação foi aceita. |
| **Rejeitado** | A solicitação foi recusada. |
| **Aguardando cliente** | A loja precisa de mais informações do cliente. |
| **Aguardando item** | O cliente precisa devolver o produto primeiro. |
| **Em processamento** | O reembolso, troca ou crédito está sendo executado. |
| **Resolvido** | A solicitação foi concluída. |

[IMAGEM: Listagem de solicitações com indicadores de status]
Legenda: Cada solicitação mostra seu estágio atual.

## Dicas importantes

- **Troca** só é permitida para pedidos com status de entrega **Entregue**. Para pedidos que ainda não saíram, prefira cancelar e criar um novo pedido.
- **Serviços** não podem ser trocados. Para serviços, as opções são reembolso ou crédito.
- Anexar **fotos do produto** acelera a análise, especialmente em casos de defeito ou avaria.
- A solicitação pode ser criada **parcialmente** — você não precisa devolver todos os itens do pedido.

## Problemas comuns

**"Não consigo criar devolução para este pedido."**
Verifique se o pedido está com status **Pago** ou **Parcialmente pago**. Pedidos pendentes ou cancelados não geram devolução.

**"O pedido foi entregue mas não aparece na busca."**
Confirme se o status de pagamento está como "Pago". Se estiver como "Pendente", atualize o pagamento primeiro.

## Perguntas frequentes

**O cliente pode solicitar devolução pelo site?**
Sim, se o pedido foi feito pela loja online, o cliente pode abrir uma solicitação diretamente pela conta dele.

**Qual o prazo para o cliente solicitar devolução?**
O prazo padrão é de 7 dias após o recebimento para arrependimento. Para defeito, o prazo pode variar segundo a legislação. Consulte suas políticas.

**Posso alterar a resolução depois de criar?**
Sim, durante o processamento você pode ajustar a resolução (ex: de troca para reembolso) conforme necessário.
`
            },
            {
                id: "processando-devolucoes",
                title: "Processando solicitações de devolução",
                description: "Analise, aprove, rejeite e processe reembolsos e trocas.",
                slug: "processando-devolucoes",
                category: "vendas",
                content: `
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
- Para trocas, verifique o **estoque dos itens de troca** antes de aprovar. Se não tiver, combine outra opção com o cliente.
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
`
            },
            {
                id: "gerenciando-entregadores-rotas",
                title: "Gerenciando entregadores e criando rotas",
                description: "Cadastre entregadores, crie rotas inteligentes e organize a logística.",
                slug: "gerenciando-entregadores-rotas",
                category: "vendas",
                content: `
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
   - **Observações** (opcional — ex: "Disponível apenas à tarde").
5. Clique em **Salvar**.

### Editar ou desativar entregador

Na lista de entregadores, você pode:

- **Editar** — Alterar nome, telefone ou observações.
- **Ativar/Desativar** — Um entregador desativado não aparece nas opções ao criar novas entregas. As entregas antigas continuam registradas.

### Estatísticas do entregador

Para cada entregador, o sistema mostra:

- **Entregas ativas** — Quantas estão em andamento no momento.
- **Entregas concluídas** — Total já finalizado.
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
2. **Selecione os pedidos** — Busque pelos pedidos com entrega pendente. Eles aparecem com endereço e valor do frete.

[IMAGEM: Seleção de pedidos para compor a entrega]
Legenda: Selecione um ou mais pedidos para a mesma rota.

3. **Atribua um entregador** (opcional) — Se não atribuir agora, pode fazer depois.
4. Informe a **data e hora de saída**.
5. Adicione **observações** (opcional — ex: "Entregar após as 14h").
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
`
            },
            {
                id: "acompanhando-entregas",
                title: "Acompanhando entregas",
                description: "Atualize status, acompanhe rotas e veja métricas de entregas.",
                slug: "acompanhando-entregas",
                category: "vendas",
                content: `
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
   - **Em preparação** — Os pedidos estão sendo separados.
   - **Saiu para entrega** — O entregador saiu para a rota.
   - **Entregue** — Todos os pedidos foram entregues (disponível apenas quando todos estiverem concluídos).
   - **Cancelada** — A entrega não será realizada.

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

## Métricas e relatórios

Na seção de entregas, você encontra um painel com métricas:

- **Total de entregas** no período.
- **Entregas concluídas** vs. **ativas**.
- **Taxa de conclusão** (percentual de entregas finalizadas com sucesso).
- **Tempo médio** por entrega.
- **Distância total percorrida**.
- **Média de pedidos por entrega**.
- **Ranking de entregadores** — Quem entregou mais e o tempo médio de cada um.

[IMAGEM: Painel de métricas de entregas]
Legenda: Acompanhe o desempenho da sua operação logística.

## Dicas importantes

- Atualizar o status **por pedido** dá mais visibilidade do que está acontecendo na rota.
- Quando um pedido é marcado como **Entregue**, o frete é automaticamente contabilizado como comissão para o entregador (se configurado).
- Se o entregador usa o sistema pelo celular, ele mesmo pode atualizar os status — você só acompanha.
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
`
            },
            {
                id: "metas-vendas",
                title: "Definindo e acompanhando metas de vendas",
                description: "Crie metas, acompanhe o progresso e veja rankings da equipe.",
                slug: "metas-vendas",
                category: "vendas",
                content: `
Com as **metas de vendas**, você define objetivos para sua equipe e acompanha o progresso em tempo real. Crie metas semanais ou mensais, por vendedor ou para toda a loja, e veja rankings de desempenho.

O sistema também pode **lançar bônus automaticamente** quando a meta é atingida.

[IMAGEM: Painel de metas com cards de progresso e ranking]
Legenda: Visão geral das metas ativas e desempenho da equipe.

## Quando utilizar

- Você quer motivar a equipe com metas claras de vendas.
- Precisa acompanhar quem está vendendo mais no mês.
- Quer oferecer bônus por desempenho sem precisar calcular manualmente.
- Você gerencia múltiplos vendedores e quer comparar o desempenho de cada um.

## Como criar uma meta

1. No menu lateral, clique em **Vendas > Metas**.
2. Clique em **Nova meta**.

[IMAGEM: Botão "Nova meta" no topo da página]
Legenda: Inicie o cadastro de uma nova meta.

3. Preencha as informações:

**Configurações básicas:**
- **Nome da meta** — Ex: "Meta de julho", "Desafio de vendas".
- **Período** — **Semanal** (seg a domingo) ou **Mensal** (do dia 1 ao último dia do mês).
- **Datas de início e fim** — Defina o intervalo da meta.
- **Tipo de meta** — **Vendas** (valor de produtos), **Ordens de serviço** ou **Ambos**.

**A quem se aplica:**
- **Todos os vendedores** — A meta vale para a equipe toda, e o progresso é coletivo.
- **Vendedor específico** — Você escolhe um ou mais vendedores. Cada um tem seu próprio progresso.

**Valor e bônus:**
- **Valor da meta** — Quanto a equipe/vendedor precisa vender para atingir.
- **Tipo de bônus** — **Valor fixo** (ex: R$ 500,00) ou **Percentual** (ex: 5% do valor vendido).
- **Lançamento automático** — Se ativado, quando a meta é atingida o sistema lança o bônus como despesa automaticamente. Você precisa selecionar a **conta financeira** para o lançamento.

[IMAGEM: Formulário de criação de meta completo]
Legenda: Defina período, valor e bônus da meta.

4. Clique em **Salvar**.

## Como acompanhar o progresso

Na página principal de metas, você vê:

**Cards de meta:**
Cada meta aparece como um card com:
- Nome e período.
- **Barra de progresso** com percentual atingido.
- **Valor atual** vs. **valor da meta**.
- **Status**: "Em andamento", "Concluída" ou "Expirada".

[IMAGEM: Cards de meta com barra de progresso]
Legenda: Visualize rapidamente o andamento de cada meta.

**Ranking de vendedores:**
Na seção **Ranking**, os vendedores aparecem ordenados por valor total vendido no período:

- **Posição** (1º, 2º, 3º...).
- **Nome do vendedor**.
- **Total vendido** no período.
- **Percentual de progresso** em relação à meta.

Você pode filtrar o ranking por **semana atual**, **mês atual** ou **período personalizado**.

[IMAGEM: Ranking de vendedores com posições e valores]
Legenda: Veja quem está se destacando no período.

**Resumo:**
No topo da página, um resumo mostra:
- **Total vendido** no período.
- **Total de comissões** lançadas.
- **Total de bônus pagos** por metas.
- **Metas ativas** e **metas concluídas**.

## Como funciona o lançamento automático de bônus

Quando você ativa o **lançamento automático** na criação da meta:

1. O sistema monitora o progresso continuamente.
2. Assim que o valor da meta é atingido, o bônus é lançado como uma **despesa financeira** na conta selecionada.
3. O lançamento aparece na seção **Financeiro > Transações** com a descrição "Bônus por meta atingida".

Isso elimina a necessidade de calcular e lançar manualmente o bônus de cada vendedor no fim do mês.

## Dicas importantes

- Metas **semanais** são boas para campanhas curtas e manter o ritmo da equipe.
- Metas **mensais** são ideais para planejamento de longo prazo.
- Se a meta é para **toda a equipe**, incentive a colaboração. Se é **individual**, cada um foca no seu desempenho.
- O lançamento automático de bônus só funciona se você tiver uma **conta financeira do tipo caixa** configurada.
- Metas expiradas podem ser excluídas ou renovadas com novas datas.

## Problemas comuns

**"O progresso da meta não está atualizando."**
As vendas precisam estar com status **Pago** ou **Parcialmente pago** para contar na meta. Verifique o status dos pedidos.

**"Não consigo ativar o lançamento automático."**
Você precisa ter uma **conta financeira do tipo caixa** configurada em **Financeiro > Contas**. Crie uma conta e depois edite a meta para ativar o lançamento automático.

## Perguntas frequentes

**O que conta para a meta: o valor total do pedido ou apenas o lucro?**
O valor total do pedido (ou venda), sem descontos de taxas ou custos.

**E se eu criar uma meta no meio do mês?**
O progresso considera as vendas a partir da **data de início** que você definir, não desde o começo do mês.

**O vendedor consegue ver a própria meta e ranking?**
Depende das permissões. Você pode liberar o acesso para que cada vendedor veja seu progresso.

**Posso editar o valor da meta depois de criada?**
Sim. Edite a meta e altere o valor. O progresso acumulado até então é mantido e recalculado proporcionalmente.
`
            },
            {
                id: "perguntas-frequentes-vendas",
                title: "Perguntas frequentes sobre vendas",
                description: "Dúvidas comuns sobre pedidos, orçamentos, PDV, caixa, devoluções, entregas e metas.",
                slug: "perguntas-frequentes-vendas",
                category: "vendas",
                content: `
Esta seção reúne as dúvidas mais comuns sobre o módulo de Vendas. Se você não encontrar o que procura aqui, confira os artigos específicos de cada funcionalidade.

---

## Pedidos

**Qual a diferença entre um pedido criado manualmente e uma venda do PDV?**
Ambos são pedidos no final. A diferença está na origem: o pedido manual é criado diretamente na seção de Pedidos (ideal para vendas por WhatsApp, telefone ou loja online), enquanto a venda do PDV é feita pelo balcão presencial. Os dois aparecem na mesma listagem de pedidos.

**O que significa "Parcialmente pago"?**
O cliente pagou parte do valor do pedido, mas ainda resta um saldo. Por exemplo: um pedido de R$ 200,00 com R$ 150,00 pagos. Você pode registrar o restante quando o cliente pagar.

**Consigo editar um pedido depois de salvo?**
Sim. Você pode alterar itens, quantidades, valores e cliente enquanto o pedido não estiver faturado.

**Como imprimir a segunda via do recibo?**
Abra o pedido e clique em **Imprimir recibo**. Você pode escolher entre formato térmico ou A4.

---

## Orçamentos

**Orçamento tem validade?**
Sim. Você define a data de validade na criação. Após essa data, o orçamento é marcado como "Expirado" automaticamente.

**O cliente precisa ter cadastro para receber um orçamento?**
Sim. O orçamento é vinculado a um cliente. Se ele não existir, cadastre na hora.

**Um orçamento aprovado vira pedido automaticamente?**
Não. Você precisa clicar em **Converter em pedido**. A conversão leva todos os itens e dados do cliente para o novo pedido.

**Posso duplicar um orçamento?**
Sim. Você pode duplicar para criar uma cópia e ajustar o que precisar — útil para orçamentos recorrentes.

---

## PDV

**Preciso de caixa aberto para vender no PDV?**
Sim. O PDV exige uma sessão de caixa aberta. Sem ela, você não consegue finalizar vendas.

**O que é uma pré-venda (rascunho)?**
É um carrinho salvo para finalizar depois. Útil quando o cliente vai pagar mais tarde ou quando a venda foi interrompida.

**Consigo vender um produto sem estoque no PDV?**
Depende da configuração do produto. Se ele permitir "vender sem estoque", sim. Caso contrário, o sistema bloqueia se a quantidade for maior que o disponível.

**O PDV aceita pagamento dividido?**
Sim. Você pode dividir o valor entre múltiplas formas de pagamento (ex: parte em dinheiro, parte no cartão) e até parcelar cada parte separadamente.

---

## Caixa

**O que é sangria?**
É a retirada de dinheiro do caixa durante o expediente. Exemplo: você tira R$ 100,00 do caixa para pagar um fornecedor.

**O que é reforço (suprimento)?**
É a adição de dinheiro ao caixa. Exemplo: você busca R$ 200,00 no banco para ter mais troco.

**O que acontece se eu fechar o caixa com diferença?**
O sistema registra a diferença entre o valor esperado e o valor contado. Você pode adicionar uma observação explicando. A diferença fica salva no histórico para auditoria.

**Posso reabrir um caixa fechado?**
Não. Depois de fechado, o caixa não pode ser reaberto. Você precisa abrir uma nova sessão.

---

## Devoluções e trocas

**Quais pedidos podem ter devolução solicitada?**
Apenas pedidos com status de pagamento **Pago** ou **Parcialmente pago**.

**Troca é permitida para qualquer pedido?**
Não. A troca só é permitida para pedidos com status de entrega **Entregue**. Para pedidos que ainda não saíram, prefira cancelar e criar um novo.

**O reembolso pelo Mercado Pago é automático?**
Você precisa processar a solicitação e selecionar Mercado Pago como método de reembolso. O sistema então faz o estorno automático.

**Itens devolvidos voltam ao estoque?**
Você decide no momento do processamento. Se marcar "Restituir ao estoque", os itens são adicionados de volta automaticamente.

---

## Entregas

**Quantos pedidos posso colocar por entrega?**
Depende do seu plano: **Crescer** permite 1 pedido por entrega; **Escalar** permite até 20.

**O entregador precisa ter acesso ao sistema?**
Sim, ele precisa de um perfil de usuário com função **Entregador** para ver as rotas atribuídas e atualizar status.

**O cliente recebe notificação quando a entrega sai?**
Sim. Se o cliente tem WhatsApp cadastrado, ele recebe uma mensagem automática quando a entrega é atualizada para "Saiu para entrega".

**O que fazer quando um pedido não pode ser entregue?**
Marque o pedido como **Falha na entrega**. Você pode reagendar e incluí-lo em uma nova rota depois.

---

## Metas

**O que conta para a meta?**
O valor total dos pedidos e vendas com status **Pago** ou **Parcialmente pago**.

**Consigo ter metas para serviços e produtos separadamente?**
Sim. Ao criar a meta, você escolhe o tipo: **Vendas**, **Ordens de serviço** ou **Ambos**.

**O bônus é pago automaticamente?**
Se você ativar o **lançamento automático**, sim. Caso contrário, o bônus é apenas informativo e você faz o pagamento por fora.

**Metas expiradas podem ser reativadas?**
Não diretamente. Você pode criar uma nova meta com as mesmas configurações e datas ajustadas.

---

**Ainda com dúvidas?** Entre em contato com nosso suporte ou consulte o artigo específico sobre o assunto na Central de Ajuda.
`
            }
        ]
    }
]

export function getArticleBySlug(slug: string): HelpArticle | undefined {
    for (const cat of helpCategories) {
        const art = cat.articles.find(a => a.slug === slug)
        if (art) return art
    }
    return undefined
}
