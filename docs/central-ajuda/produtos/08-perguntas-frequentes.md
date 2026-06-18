# Perguntas frequentes sobre produtos

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
