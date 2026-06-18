# Como importar produtos usando XML

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
