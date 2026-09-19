# Coleções na Vitrine Online

As **coleções** são listas personalizadas que você cria para organizar produtos e serviços favoritados na Vitrine Online. Pense nelas como "listas de desejos", "compras para o futuro", "presentes" ou qualquer outra forma que combinar para você guardar e encontrar itens rapidamente.

[IMAGEM: Tela da página Minhas Coleções mostrando cards de coleções com capas e títulos]

Legenda: Cada coleção tem uma capa visual e mostra a quantidade de itens e visualizações.

## Como criar uma coleção

Criar uma coleção é rápido e intuitivo:

1. Acesse **Minhas coleções** no menu da Vitrine Online.
2. Clique no botão **Nova Coleção** (ou no ícone de "+" no canto inferior direito no celular).
3. Preencha os campos:
   - **Nome**: dê um nome que facilita a identificação (ex: "Compras do mês", "Presentes", "Itens novos").
   - **Descrição (opcional)**: conte mais sobre como pretende usar a coleção.
4. Clique em **Criar**.

> [!IMPORTANT]
> O nome da coleção deve ter **pelo menos 2 caracteres** e no máximo **50**. A descrição pode ter até **500** caracteres.

[IMAGEM: Modal de criação de coleção com campos de nome e descrição]

## Como adicionar itens a uma coleção

Você pode adicionar produtos e serviços a uma coleção de duas formas:

### 1. No momento da visualização do item

1. Navegue até a página do produto ou serviço.
2. Clique nos **três pontos** (⋮) ou no botão **Adicionar à coleção**.
3. Uma janela mostra todas as suas coleções existentes.
4. Clique em **Adicionar** na coleção desejada.

### 2. Através da página Minhas Coleções

1. Acesse **Minhas coleções**.
2. Clique na coleção à qual deseja adicionar itens.
3. Na página da coleção, clique em **Adicionar itens**.
4. Navegue pela vitrine e selecione os itens a serem adicionados.

[IMAGEM: Modal "Adicionar à coleção" mostrando coleções existentes com botões de adicionar/remover]

## Como visualizar uma coleção

Cada coleção tem uma **página pública** com URL compartilhável:

1. Na página **Minhas coleções**, clique em qualquer coleção.
2. A página mostra:
   - A **capa** da coleção
   - O **nome** e **descrição**
   - As **informações do autor** (quem criou)
   - A **contagem de itens** e **visualizações**
   - Os **itens** em um grid de cards

| Informação | Onde aparece |
| :--- | :--- |
| Capa visual | Banner ou imagem de capa no topo |
| Nome | Título principal, no cabeçalho |
| Descrição | Texto abaixo do nome, com "Ver mais" para textos longos |
| Autor | Avatar e nome do criador |
| Contagem de itens | Subtítulo ao lado do nome do autor |
| Visualizações | Mostrado ao lado da contagem de itens |

## Como compartilhar uma coleção

As coleções criadas podem ser **compartilhadas publicamente**:

1. Acesse a coleção na página **Minhas coleções**.
2. Clique no **ícone de compartilhar** (seta/seta para cima).
3. Copie o link ou compartilhe diretamente nas redes sociais.

> [i] Qualquer pessoa com o link pode visualizar a coleção. Ela aparece também no perfil público do criador.

## Editar uma coleção

Se você é o criador (autor) da coleção:

1. Na página da coleção, clique no botão **Editar** (ícone de lápis).
2. Altere o **nome** e a **descrição**.
3. Clique em **Salvar**.

> [!NOTE]
> Os itens da coleção são mantidos após a edição. Você não precisa recriar a coleção para alterar detalhes.

## Remover itens de uma coleção

Para remover um item de uma coleção:

1. Acesse a coleção.
2. Clique nos **três pontos** (⋮) sobre o item que deseja remover.
3. Selecione **Remover da coleção**.

> [!] A remoção só tira o item da coleção, **não exclui o produto** do sistema. O mesmo item pode existir em outras coleções.

## Excluir uma coleção

Apenas o autor pode excluir uma coleção:

1. Na página da coleção, clique nos **três pontos** no canto superior direito.
2. Selecione **Excluir coleção**.
3. Confirme na janela de confirmação.

> [!] A exclusão é **irreversível**. Todos os itens são removidos da coleção (os produtos permanecem disponíveis na loja).

## Como funciona o armazenamento

As coleções são salvas na tabela **collections** com os seguintes campos:

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | UUID | Identificação única |
| `short_id` | String | Identificador curto para URLs amigáveis |
| `name` | String | Nome da coleção (2-50 caracteres) |
| `description` | String | Descrição opcional (até 500 caracteres) |
| `cover_url` | URL | URL da imagem de capa (banner gerado automaticamente) |
| `banner_color` | String | Cor do banner para fallback visual |
| `author_id` | UUID | Usuário que criou a coleção |
| `items_count` | Int | Quantidade de itens na coleção |
| `views_count` | Int | Quantidade de visualizações da coleção |
| `created_at` | Timestamp | Data de criação |
| `updated_at` | Timestamp | Última atualização |

### Items de coleção

Os itens são vinculados através da tabela **collection_items**:

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `collection_id` | UUID | Referência à coleção |
| `item_type` | Enum | `product` ou `service` |
| `item_id` | UUID | ID do produto ou serviço |
| `sort_order` | Int | Ordem de exibição na coleção |

## Controle de acesso

| Ação | Quem pode |
| :--- | :--- |
| Criar coleção | Qualquer usuário logado |
| Adicionar itens | Apenas o autor da coleção |
| Editar nome/descrição | Apenas o autor da coleção |
| Remover itens | Apenas o autor da coleção |
| Reordenar itens | Apenas o autor da coleção |
| Excluir coleção | Apenas o autor da coleção |
| Visualizar coleção | Qualquer pessoa com o link |

## Paginação

Na página **Minhas coleções**, as coleções são exibidas com paginação:

- **20 coleções por página**
- Navegação com botões "Anterior" e "Próximo"
- A página rola automaticamente para o topo ao trocar de página

## Autocolação e moderação

Todas as coleções passam por uma **moderação automática de conteúdo**:

| Verificação | Como funciona |
| :--- | :--- |
| Conteúdo ofensivo | Nomes e descrições são analisados para bloquear palavras inadequadas |
| Conteúdo promocional | Textos publicitários são detectados e rejeitados |
| Duplicidade | Não afeta, cada coleção é única |

> [!] Uma coleção aprovada pode ser revisada posteriormente se o conteúdo for alterado ou denunciado.

## Boas práticas

**Dê nomes claros**
- Use nomes que você entenda rapidamente: "Presentes de Natal", "Itens para reformar", "Produtos que quero comparar".

**Combine com favoritos**
- Primeiro favorite os itens, depois adicione-os às coleções. É o fluxo mais rápido.

**Compartilhe com intenção**
- Se vai compartilhar a coleção, mantenha nomes e descrições descritivos para que outras pessoas entendam o propósito.

**Limpeza periódica**
- Remova itens que já não fazem sentido na coleção para mantê-la útil e leve.

## Problemas comuns

**"Erro ao criar coleção"**
- Verifique se o nome tem pelo menos 2 caracteres e no máximo 50.
- Certifique-se de que o conteúdo está dentro das regras da plataforma (sem ofensas ou Spam).
- Tente novamente. Se o erro persistir, entre em contato com o suporte.

**"Item já está na coleção"**
- Cada item pode existir apenas uma vez em cada coleção. Use a opção "Remover" para tirar e adicionar novamente se precisar reordenar.

**Coleção não aparece na lista**
- A coleção pode estar temporariamente indisponível devido a manutenção. Atualize a página.
- Verifique se está na aba correta: apenas suas coleções aparecem em "Minhas coleções".

## Perguntas frequentes

**As coleções são públicas ou privadas?**
Por padrão, coleções são **públicas** e visualizáveis por qualquer um com o link. Na página delas, é mostrada a capa, nome, descrição, autor e itens.

**Posso ter quantas coleções quiser?**
Sim, não há limite. Crie quantas precisar para organizar sua vida na Dudit.

**Remover um item da coleção deleta o produto?**
Não. Remover da coleção apenas tira a referência. O produto continua disponível normalmente na loja.

**Posso editar a ordem dos itens na coleção?**
Sim, o autor da coleção pode reordenar os itens arrastando-os. A ordem é salva automaticamente.

**E se o produto na minha coleção for excluído?**
O item desaparece automaticamente da coleção na próxima sincronização. A coleção continua ativa com os itens restantes.

**Como compartilhar uma coleção?**
Clique no ícone de compartilhar na página da coleção e copie o link. Qualquer pessoa com o link pode visualizar a coleção.

