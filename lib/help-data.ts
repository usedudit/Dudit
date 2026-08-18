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

![Tela de Login](https://img.dudit.com.br/static/screens/Login.png)

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
Seja você um cliente em busca de produtos locais ou um empreendedor pronto para abrir seu negócio, o primeiro passo é criar sua conta na Dudit. O processo é simples e focado na segurança dos seus dados.

![Tela de Cadastro](https://img.dudit.com.br/static/screens/Cadastro.png)

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

Esta seção reúne **pedidos**, **orçamentos**, **PDV**, **caixa**, **devoluções**, **entregas** e **metas** - tudo em um só lugar.

[IMAGEM: Tela principal do módulo de Vendas com os atalhos para cada subseção]
Legenda: O menu de vendas dá acesso rápido a todas as operações do dia a dia.

## Como funciona

Toda venda passa por etapas que se conectam entre si. Veja o fluxo básico:

1. **Antes da venda** - Você cria orçamentos para clientes ou prepara o PDV para atendimento presencial.
2. **A venda acontece** - O pedido é gerado (manual, PDV, orçamento convertido, loja online ou WhatsApp).
3. **Pós-venda** - O pedido pode ser entregue, faturado e, se necessário, devolvido ou trocado.
4. **Gestão** - Metas de vendas acompanham o desempenho da equipe. O caixa registra todas as movimentações financeiras do PDV.

[IMAGEM: Fluxograma simples mostrando a jornada: Orçamento → Pedido → Pagamento → Expedição/Entrega → Devolução (opcional)]
Legenda: Ciclo completo de uma venda na plataforma.

## O que você encontra nesta seção

**Pedidos** - Central de acompanhamento. Aqui você cria, edita, cancela e acompanha todos os pedidos da loja. Cada pedido armazena itens, cliente, forma de pagamento, endereço de entrega e histórico de alterações.

**Orçamentos** - Crie propostas profissionais para enviar aos clientes. O cliente pode visualizar, aprovar ou rejeitar online. Com um clique, o orçamento vira pedido.

**PDV (Ponto de Venda)** - O balcão digital. Ideal para vendas presenciais: adicione itens ao carrinho, aplique descontos, divida o pagamento em múltiplas formas e finalize a venda.

**Caixa** - Controle o dinheiro do PDV. Abra e feche o caixa, registre sangrias e reforços, confira o saldo no fim do expediente.

**Devoluções e trocas** - Gerencie solicitações de troca, reembolso ou crédito. Acompanhe o status de cada solicitação até a resolução.

**Expedição e entregas** - Organize a logística: cadastre entregadores, crie rotas inteligentes agrupando pedidos por região e acompanhe a entrega até a confirmação.

**Metas de vendas** - Defina objetivos para a equipe, acompanhe o progresso em tempo real e veja rankings de desempenho por vendedor.

## Dicas importantes

- Comece organizando seus **produtos** e **clientes** antes de usar o módulo de vendas - isso agiliza o atendimento.
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
A seção de **Pedidos** é onde você acompanha todas as vendas da sua loja, independentemente de como foram feitas - PDV, loja online, WhatsApp ou manualmente.

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

3. **Selecione o cliente** - Busque por nome, email ou telefone. Se o cliente ainda não estiver cadastrado, você pode criá-lo na hora.
4. **Adicione os itens** - Busque produtos ou serviços. Para cada item, informe a quantidade. Você também pode aplicar desconto por item se necessário.
5. **Ajuste os valores** - Configure frete, outros custos e desconto geral (valor fixo ou percentual).

[IMAGEM: Tela de criação de pedido com itens e valores]
Legenda: Preencha as informações principais antes de salvar o pedido.

6. **Defina a forma de pagamento** - Escolha o método e, se aplicável, divida o pagamento entre múltiplas formas (ex: parte no dinheiro, parte no cartão).
7. **Configure a entrega** - Escolha entre **Entrega** (com endereço) ou **Retirada** no balcão.
8. Clique em **Salvar pedido**.

## Como visualizar detalhes do pedido

Clique em qualquer pedido da lista para abrir a tela de detalhes. Lá você encontra:

- **Itens do pedido** - Lista completa com quantidades e preços.
- **Informações do cliente** - Nome, contato e endereço de entrega.
- **Financeiro** - Valores, descontos, forma de pagamento e status (pago, parcial, pendente).
- **Entrega** - Status atual e data prevista.
- **Histórico** - Linha do tempo com todas as alterações feitas no pedido.

[IMAGEM: Tela de detalhes do pedido com abas]
Legenda: As abas organizam as informações para fácil consulta.

## Como imprimir recibo

Na tela de detalhes do pedido, clique em **Imprimir recibo**. Você pode escolher entre:

- **Recibo térmico** (formato reduzido, ideal para impressoras térmicas).
- **Recibo A4** (formato completo, ideal para impressão comum).

## Como alterar o status de pagamento

Na tela de detalhes, você pode atualizar o status de pagamento:

- **Pago** - O cliente já pagou o valor total.
- **Parcialmente pago** - O cliente pagou parte do valor.
- **Pendente** - Aguardando pagamento.

## Como alterar o status de entrega

Da mesma forma, você pode informar em que etapa a entrega se encontra:

- **Não enviado** - Pedido pronto, aguardando envio.
- **Em preparação** - Está sendo separado ou produzido.
- **Enviado** - Saiu para entrega.
- **Entregue** - Foi entregue ao cliente.
- **Pronto para retirada** - Disponível para o cliente buscar.

## Dicas importantes

- Pedidos criados no **PDV** aparecem automaticamente na listagem de pedidos. Não é preciso criá-los novamente.
- Mantenha os status atualizados - isso ajuda a filtrar pedidos pendentes e evita atrasos.
- O desconto geral é aplicado sobre o subtotal. Já o desconto por item é aplicado individualmente. Os dois podem ser usados juntos.
- Para pedidos com entrega, o sistema usa o endereço informado no cadastro do cliente. Você pode alterar o endereço na hora da criação.

## Problemas comuns

**"Não consigo criar um pedido porque o cliente não aparece na busca."**
Você pode cadastrar um novo cliente no momento da criação do pedido - basta clicar em "Adicionar cliente".

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
- O valor pago (se houver) não é estornado automaticamente - você precisa processar o reembolso manualmente pela seção de Devoluções e trocas.

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
`
            },
            {
                id: "criando-enviando-orcamentos",
                title: "Criando e enviando orçamentos",
                description: "Como criar propostas profissionais para seus clientes.",
                slug: "criando-enviando-orcamentos",
                category: "vendas",
                content: `
O **orçamento** é uma proposta comercial que você envia para o cliente antes da venda. Ele lista os produtos ou serviços, quantidades, preços e condições - tudo formatado de forma profissional.

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

3. **Selecione o cliente** - Busque por nome. Se não encontrar, cadastre um novo cliente na hora.
4. **Adicione produtos ou serviços** - Busque pelo nome. Você pode misturar produtos físicos e serviços no mesmo orçamento.
5. **Ajuste quantidades e preços** - Para cada item, você pode alterar a quantidade e o preço unitário.

[IMAGEM: Seção de itens do orçamento com campos de quantidade e preço]
Legenda: Adicione quantos itens precisar.

6. **Configure as condições** - Defina:
   - **Data do orçamento** (geralmente a data de hoje).
   - **Data de validade** (prazo para o cliente aceitar a proposta).
   - **Descontos** (por item ou geral, em valor fixo ou percentual).
   - **Frete** e **outros custos**, se aplicável.
7. **Personalize a aparência** - Escolha as cores do tema, o título (ex: "Orçamento", "Proposta Comercial") e decida se quer exibir a decoração visual.

[IMAGEM: Opções de personalização do orçamento]
Legenda: Deixe o orçamento com a cara da sua loja.

8. Clique em **Salvar**.

## Como visualizar e compartilhar

Após salvar, você pode:

- **Visualizar a prévia** - Veja exatamente como o cliente vai receber o orçamento.
- **Baixar em PDF** - Gere um arquivo PDF para enviar por email ou WhatsApp.
- **Compartilhar link** - O sistema gera um link único. Envie para o cliente. Ele pode abrir no navegador, visualizar e responder.

[IMAGEM: Opções de compartilhamento na tela de detalhes do orçamento]
Legenda: Compartilhe por link, PDF ou WhatsApp.

## Dicas importantes

- Defina uma **data de validade** sempre. Isso cria um senso de urgência e evita que o cliente tente usar um preço antigo.
- Revise os valores antes de enviar. O orçamento é um documento comercial - erros passam uma imagem negativa.
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
Depois que você envia um orçamento, o cliente pode interagir com ele online. Você acompanha cada etapa - desde o envio até a aprovação ou rejeição - e, quando chega a hora, converte o orçamento em pedido com um clique.

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
- **Aprovar** o orçamento - indicando que aceita a proposta.
- **Rejeitar** o orçamento - opcionalmente informando o motivo.

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
- Quando precisar retirar dinheiro do caixa (sangria) - por exemplo, para pagar um fornecedor.
- Quando precisar colocar mais dinheiro no caixa (reforço/suprimento).
- No fim do expediente, para fechar o caixa e conferir o movimento do dia.

## Como abrir o caixa

1. No menu lateral, clique em **Vendas > PDV**.
2. Se não houver um caixa aberto, o sistema exibe a tela de abertura.

[IMAGEM: Tela de abertura de caixa com campo de valor inicial]
Legenda: Informe o valor em dinheiro que está no caixa no início do dia.

3. Informe o **valor inicial** (troco) - é o dinheiro que você está colocando no caixa para começar o dia.
4. Opcionalmente, adicione uma **observação** (ex: "Abertura com R$ 200,00 de troco").
5. Clique em **Abrir caixa**.

Pronto. Agora o PDV está liberado para vendas.

## Como registrar sangria e reforço

Durante o expediente, pode ser necessário movimentar o dinheiro do caixa:

**Sangria (retirada):** Use quando precisar tirar dinheiro do caixa - por exemplo, para pagar um fornecedor ou depositar no banco.

**Reforço (depósito):** Use quando colocar mais dinheiro no caixa - por exemplo, troco extra que foi buscar no banco.

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
3. **Informe a contagem do dinheiro** - Digite quanto tem em cada forma de pagamento (ex: R$ 500,00 em dinheiro, R$ 800,00 em cartão).

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

- **Busque por nome** - Digite o nome do produto. Conforme você digita, o sistema sugere resultados.
- **Selecione variações** - Se o produto tem variações (cor, tamanho), uma janela abre para você escolher a opção correta.
- **Adicione serviços** - Serviços também aparecem na busca e podem ser misturados com produtos no mesmo carrinho.
- **Ajuste a quantidade** - Use os botões + e - ou digite o número diretamente.

[IMAGEM: Busca de produtos no PDV com sugestões]
Legenda: A busca encontra produtos e serviços cadastrados.

### 2. Aplique descontos e cupons

Você pode conceder descontos de duas formas:

- **Desconto por item** - Clique no item do carrinho e aplique um desconto fixo ou percentual naquele item específico.
- **Desconto geral** - Aplique um desconto sobre o total do carrinho (valor fixo ou percentual).

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
   - **Quantidade em estoque** (opcional - se não informar, fica como 0).

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

Você não precisa fazer nada - as promoções são calculadas em tempo real. Se quiser conferir, veja o resumo do carrinho antes de finalizar.

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

3. **Selecione o pedido** - Busque pelo número do pedido ou localize na lista de pedidos pagos.

[IMAGEM: Busca de pedido para devolução]
Legenda: Somente pedidos pagos aparecem como elegíveis.

4. **Escolha os itens** - Selecione quais itens do pedido serão devolvidos. Você pode devolver todos ou apenas alguns.
5. Para cada item, informe:
   - **Quantidade** a ser devolvida.
   - **Motivo** (ex: "Produto com defeito", "Arrependimento", "Avaria no transporte").
   - **Condição** do produto: **Lacrado** (sem uso), **Aberto** (usado mas íntegro) ou **Avariado** (com danos).

6. **Defina a resolução desejada**:
   - **Troca** - O cliente quer outro produto no lugar. É permitida apenas para pedidos já entregues.
   - **Reembolso** - Você vai devolver o valor pago (PIX, cartão ou manual).
   - **Crédito na loja** - O valor vira crédito para o cliente usar em compras futuras.

[IMAGEM: Escolha do tipo de resolução]
Legenda: Cada tipo de resolução segue um fluxo diferente.

7. **Anexe evidências** (opcional) - Faça upload de fotos que comprovem o estado do produto. Útil para produtos com defeito ou avariados.
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
- A solicitação pode ser criada **parcialmente** - você não precisa devolver todos os itens do pedido.

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

- **Itens devolvidos** - Lista com quantidades, motivo e condição de cada item.
- **Evidências** - Fotos enviadas pelo cliente (se houver).
- **Resolução desejada** - O que o cliente espera (troca, reembolso, crédito).
- **Histórico** - Linha do tempo com eventos da solicitação.

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
   - **Itens de troca** (se for troca - veja abaixo).
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

- **Sim** - Os produtos são adicionados de volta ao estoque automaticamente.
- **Não** - O estoque não é alterado (útil para itens danificados que serão descartados).

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
- **Nome da meta** - Ex: "Meta de julho", "Desafio de vendas".
- **Período** - **Semanal** (seg a domingo) ou **Mensal** (do dia 1 ao último dia do mês).
- **Datas de início e fim** - Defina o intervalo da meta.

**A quem se aplica:**
- **Todos os vendedores** - A meta vale para a equipe toda, e o progresso é coletivo.
- **Vendedor específico** - Você escolhe um ou mais vendedores. Cada um tem seu próprio progresso.

**Valor e bônus:**
- **Valor da meta** - Quanto a equipe/vendedor precisa vender para atingir.
- **Tipo de bônus** - **Valor fixo** (ex: R$ 500,00) ou **Percentual** (ex: 5% do valor vendido).
- **Lançamento automático** - Se ativado, quando a meta é atingida o sistema lança o bônus como despesa automaticamente. Você precisa selecionar a **conta financeira** para o lançamento.

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
Sim. Você pode duplicar para criar uma cópia e ajustar o que precisar - útil para orçamentos recorrentes.

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
    },
    {
        id: "produtos-estoque",
        title: "Produtos e Estoque",
        icon: "📦",
        articles: [
            {
                id: "visao-geral-produtos-estoque",
                title: "Visão geral de Produtos e Estoque",
                description: "Entenda o módulo completo de produtos, catálogo e controle de estoque.",
                slug: "visao-geral-produtos-estoque",
                category: "produtos-estoque",
                content: `
## Visão geral

A seção **Produtos e Estoque** é onde você gerencia todo o seu catálogo: cadastra produtos, organiza por categorias e marcas, controla o estoque, registra entradas e saídas, importa notas fiscais e gera etiquetas. Tudo em um só lugar para manter sua operação funcionando.

![Tela principal de Produtos](https://img.dudit.com.br/static/screens/Produtos_VisaoGeral.png)
Legenda: Página inicial da seção de Produtos com listagem, busca, filtros e atalhos.

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

**Situação do estoque**
Cada produto recebe um indicador visual baseado no seu estoque:
- **Normal** (verde): estoque acima do mínimo configurado
- **Baixo** (amarelo): estoque igual ou abaixo do mínimo
- **Esgotado** (vermelho): estoque zero

## O que você encontra nesta seção

**Cadastro de produtos** - Crie produtos físicos, digitais ou serviços com todas as informações: nome, imagens, preços, estoque, dados fiscais, variações e muito mais.

**Organização do catálogo** - Categorias, subcategorias, marcas, unidades de medida e localizações físicas para manter tudo organizado e fácil de encontrar.

**Variações** - Gerencie diferentes versões de um mesmo produto (cor, tamanho, voltagem, etc.) com preço, estoque e imagem próprios para cada variação.

**Controle de estoque** - Acompanhe a quantidade disponível, configure estoque mínimo, visualize a situação (Normal/Baixo/Esgotado) e faça ajustes rápidos.

**Movimentações de estoque** - Registre entradas (compras, devoluções, ajustes) e saídas (avarias, perdas, uso interno, ajustes) com histórico completo e opção de desfazer.

**Fornecedores** - Cadastre fornecedores, vincule aos produtos com SKU e custo próprio, veja histórico de compras e evolução de custos.

**Importação de XML/NF-e** - Importe notas fiscais de entrada (modelo 55) para cadastrar ou atualizar produtos em lote, dar entrada no estoque e atualizar custos automaticamente.

**Etiquetas** - Gere etiquetas com nome, preço, código de barras e outras informações para organizar sua loja física e estoque.

## Como acessar

1. No menu lateral do painel de controle, clique em **Produtos**.
2. Você verá a lista de todos os produtos cadastrados.
3. Use a barra de busca para encontrar produtos por nome ou SKU.
4. Use as abas de estoque (**Todos**, **Normal**, **Baixo**, **Esgotado**, **Arquivados**) para filtrar rapidamente pela situação do estoque.
5. Clique em **Filtros** para refinar por categoria, marca, status, faixa de preço e mais.

![Menu lateral destacando a opção Produtos](https://img.dudit.com.br/static/screens/Menu_Produtos.png)
Legenda: Acesso à seção de produtos pelo menu principal.

## Dicas importantes

- Mantenha os dados fiscais sempre corretos (NCM, origem) para emitir notas fiscais sem problemas.
- Organize seus produtos em categorias desde o início - isso facilita a gestão e ajuda os clientes a encontrarem o que procuram.
- Produtos com imagens de qualidade vendem mais. Tire fotos com boa iluminação e fundo neutro.
- Configure o estoque mínimo para receber alertas visuais quando chegar a hora de reabastecer.
- Registre todas as entradas e saídas de estoque para manter o histórico completo e evitar diferenças entre o estoque físico e o sistema.

## Perguntas frequentes

**Posso ter produtos físicos e digitais na mesma loja?**
Sim. Ao cadastrar, você escolhe o tipo do produto: físico, digital ou serviço.

**O que acontece quando desativo um produto?**
Ele continua salvo com todas as informações, mas não aparece na vitrine e não pode ser comprado. Você pode reativá-lo quando quiser.

**Qual a diferença entre "Inativo" e "Não exibir na vitrine"?**
"Inativo" desativa o produto por completo. "Não exibir na vitrine" mantém o produto ativo no sistema (aparece em relatórios, pode ser vendido no PDV) mas não o mostra na loja online.

**Preciso de plano específico para usar variações?**
Alguns recursos avançados podem estar disponíveis apenas em determinados planos.

**A importação de XML atualiza o preço de venda?**
Não. A importação atualiza o estoque e o preço de custo. O preço de venda permanece o mesmo que você definiu.
`
            },
            {
                id: "como-cadastrar-produto",
                title: "Como cadastrar um produto",
                description: "Aprenda o passo a passo para cadastrar produtos físicos, digitais ou serviços.",
                slug: "como-cadastrar-produto",
                category: "produtos-estoque",
                content: `
## Visão geral

O cadastro de produtos é o primeiro passo para vender. Você pode cadastrar produtos físicos, digitais ou serviços com todas as informações necessárias para a venda, emissão de notas fiscais e controle de estoque.

![Tela de cadastro de produto](https://img.dudit.com.br/static/screens/Produto_Cadastro.png)
Legenda: Formulário completo de cadastro de produto com abas laterais.

## Quando usar

Cadastre um produto sempre que quiser adicionar um novo item ao seu catálogo. Você pode fazer isso de três formas:

- **Manual**: preenchendo o formulário um a um (explicado neste artigo)
- **Importação por XML**: a partir de notas fiscais de fornecedores (ideal para muitos produtos de uma vez)
- **Duplicação**: copiando um produto existente e ajustando as informações

## Como fazer

### 1. Acessar o cadastro

1. No menu lateral, clique em **Produtos**.
2. Clique no botão **Novo produto** no canto superior direito.

![Botão Novo produto](https://img.dudit.com.br/static/screens/Botao_NovoProduto.png)
Legenda: Clique em "Novo produto" para iniciar o cadastro.

### 2. Preencher informações básicas

**Nome do produto** (obrigatório): Escolha um nome claro e descritivo. Inclua informações como marca, modelo e característica principal.

**Imagens**: Clique para adicionar fotos do produto. Você pode:
- Enviar arquivos do computador
- Ajustar o recorte da imagem
- Definir uma imagem principal (primeira da lista)
- Remover imagens indesejadas

![Seção de imagens](https://img.dudit.com.br/static/screens/Produto_Imagens.png)
Legenda: Adicione fotos do produto e defina qual será a imagem principal.

**Status**: Define se o produto está ativo (disponível para venda) ou inativo.

**Exibir na vitrine**: Controla se o produto aparece na sua loja online.

### 3. Configurar preço

- **Preço de custo**: quanto você pagou pelo produto (ou quanto custou para produzir).
- **Preço de venda**: valor que será cobrado do cliente (obrigatório).
- **Preço promocional**: valor promocional temporário. Enquanto estiver preenchido, será exibido no lugar do preço normal.
- **Exibir o preço na vitrine online**: se desmarcar, o produto aparecerá com "Valor sob consulta" e os campos de preço serão zerados.

> [!TIP]
> Use a calculadora de margem ao lado do preço para ver qual será sua margem de lucro baseada no custo e no preço de venda.

### 4. Definir estoque inicial

- **Estoque atual**: quantidade disponível para venda.
- **Estoque mínimo**: quantidade mínima ideal. Quando o estoque atingir esse valor, o sistema alerta que está baixo.
- **Localização**: onde o produto fica armazenado (ex: "Prateleira A3", "Galpão 2"). Você pode criar novas localizações na hora.
- **Permitir vender sem estoque**: quando ativado, o produto pode ser vendido mesmo com estoque zerado (útil para produtos sob encomenda).

### 5. Informações de organização (barra lateral direita)

**SKU (código do produto)**: Um código único para identificar o produto. Se não preencher, o sistema gera automaticamente. Você também pode clicar no ícone de dado para sortear um código aleatório.

**Código de barras (EAN/GTIN)**: O código de barras do produto. Você pode digitar o número ou clicar no ícone de dado para gerar um código EAN-13 automaticamente.

**Categoria**: Classifique o produto em uma categoria (ex: "Roupas", "Eletrônicos"). Se a categoria desejada não existir, você pode criar na hora clicando em "Criar nova categoria".

**Subcategoria**: Disponível após selecionar uma categoria. Exemplo: dentro de "Roupas", você pode ter "Camisetas", "Calças", etc.

**Marca**: Selecione a marca do produto. Também é possível criar uma nova marca durante o cadastro.

**Unidade**: Unidade de medida do produto (UN, KG, LT, PC, CX, etc.).

### 6. Preencher dados de envio (aba "Envio e Dimensões")

Essa seção fica dentro do acordeão "Envio e Dimensões". Preencha estas informações para calcular o frete corretamente:

- **Peso líquido e bruto** (em kg)
- **Prazo de preparação**: quantos dias você leva para preparar o produto após a compra
- **Tipo de embalagem**: pacote/caixa, cilindro/rolo ou envelope
- **Dimensões**: largura, altura e profundidade (em cm)

### 7. Informações fiscais (aba "Dados Fiscais")

- **NCM**: código obrigatório de 8 dígitos. Se não souber, digite o nome do produto e clique no ícone de estrela para sugerir o NCM automaticamente.
- **Origem da mercadoria**: nacional, importada, etc.
- **CEST**: obrigatório apenas para produtos sujeitos a Substituição Tributária.
- **CFOP, CSOSN, alíquotas**: campos para configuração tributária detalhada (o sistema preenche padrões baseados no seu regime).

> [!IMPORTANT]
> NCM e Origem da mercadoria são obrigatórios para emitir notas fiscais. Use o sugeridor automático de NCM sempre que tiver dúvida.

### 8. Salvar

Clique em **Salvar**. O produto será criado e aparecerá na sua lista de produtos.

![Botão Salvar](https://img.dudit.com.br/static/screens/Botao_SalvarProduto.png)
Legenda: Finalize o cadastro clicando em "Salvar".

## Dicas importantes

- **Fotos de qualidade fazem diferença**: produtos com imagens claras e bem iluminadas vendem mais.
- **SKU único**: cada produto precisa ter um SKU diferente. Se tentar usar um SKU já existente, o sistema gera automaticamente um código alternativo.
- **NCM correto**: usar o NCM errado pode gerar problemas fiscais. Use o sugeridor automático sempre que tiver dúvida.
- **Produto sem estoque**: se não quiser controlar estoque, ative "Permitir vender sem estoque" e mantenha o estoque como 0.
- **Duplicação**: para produtos similares, use a opção "Duplicar" no menu de ações do produto - economiza tempo preenchendo dados iguais.

## Problemas comuns

**"Preciso preencher todos os campos?"**
Não. Apenas Nome e Preço de Venda são obrigatórios para salvar. NCM e Origem da Mercadoria também são obrigatórios para emissão de notas fiscais.

**"Posso adicionar imagens depois?"**
Sim. É possível editar o produto e adicionar ou remover imagens a qualquer momento.

**"O que é SKU e para que serve?"**
SKU é um código interno para identificar o produto. Ele ajuda na organização do estoque, na localização do produto no sistema e na integração com marketplaces e transportadoras.

**"Como cadastrar um produto digital ou serviço?"**
No campo "Tipo do Item", selecione "Digital" ou "Serviço". Produtos digitais não precisam de dados de envio nem de estoque físico. Serviços também não controlam estoque.

**"Criei o produto mas não aparece na loja."**
Verifique se: Status = Ativo, Exibir na Vitrine = Sim, e se tem preço de venda (ou "Valor sob consulta" está desmarcado).

## Perguntas frequentes

**Quantos produtos posso cadastrar?**
Depende do seu plano. Se você tentar cadastrar e atingir o limite, o sistema avisa e sugere o upgrade para um plano superior.

**Posso editar um produto depois de criado?**
Sim. Clique no produto na listagem e depois em **Editar produto**. Todas as informações podem ser alteradas, inclusive imagens, preço e estoque.

**Como duplicar um produto?**
Na tela de detalhes do produto, clique no menu de ações (três pontos) e selecione **Duplicar**. O sistema cria uma cópia com "(Cópia)" no nome e um novo SKU.

**Como excluir um produto?**
Na tela de detalhes, clique no menu de ações e selecione **Excluir**. Confirme a exclusão. Atenção: esta ação não pode ser desfeita. O produto e suas imagens são removidos permanentemente.

**É possível excluir vários produtos de uma vez?**
Sim. Selecione os produtos usando os checkboxes na listagem e escolha a opção de exclusão em lote no menu de ações.
`
            },
            {
                id: "como-organizar-catalogo",
                title: "Como organizar seu catálogo",
                description: "Saiba como usar categorias, marcas, SKUs, filtros e ações em lote para manter seus produtos organizados.",
                slug: "como-organizar-catalogo",
                category: "produtos-estoque",
                content: `
## Visão geral

Manter os produtos bem organizados facilita o dia a dia: você encontra qualquer item rapidamente, seus clientes navegam com mais facilidade na loja e a gestão do estoque fica mais simples.

![Lista de produtos com filtros](https://img.dudit.com.br/static/screens/Produtos_Filtros.png)
Legenda: Utilize filtros e busca para encontrar produtos rapidamente.

## Quando usar

A organização é útil em várias situações:

- Você tem muitos produtos e precisa encontrar um específico
- Quer agrupar produtos por tipo, marca ou departamento
- Precisa entender quais produtos estão com estoque baixo
- Deseja aplicar alterações em lote (preço, estoque, ativar/desativar)
- Quer exportar a lista de produtos para uma planilha

## Como organizar seus produtos

### Categorias e subcategorias

Categorias agrupam produtos por tipo. Exemplo: "Roupas", "Calçados", "Acessórios".

As subcategorias são divisões dentro de uma categoria. Exemplo: dentro de "Roupas" você pode ter "Camisetas", "Calças", "Jaquetas".

**Para criar uma categoria:**

1. Ao cadastrar ou editar um produto, localize o campo **Categoria** na barra lateral direita.
2. Clique no botão **Criar nova categoria** dentro do campo.
3. Digite o nome e confirme.
4. A categoria será criada e selecionada automaticamente no produto.

**Para criar uma subcategoria:**

1. Primeiro, selecione a categoria principal.
2. No campo **Subcategoria**, clique em **Criar nova subcategoria**.
3. Digite o nome e confirme.

> [!TIP]
> Ao trocar a categoria de um produto, a subcategoria é limpa automaticamente.

**Gerenciar categorias existentes:**
Acesse **Cadastros** no menu lateral > aba **Categorias**. Lá você pode editar, renomear, ativar/desativar ou excluir categorias e subcategorias.

### Marcas

Vincular marcas aos produtos ajuda na organização e na busca. Para criar uma marca:

1. No campo **Marca**, clique em **Criar nova marca**.
2. Digite o nome e confirme.

![Campo de Marca](https://img.dudit.com.br/static/screens/Produto_Marca.png)
Legenda: Crie marcas diretamente no cadastro do produto.

**Gerenciar marcas existentes:**
Acesse **Cadastros** > aba **Marcas**.

### Localizações físicas

Útil para saber onde cada produto está guardado no seu estoque físico (ex: "Prateleira A3", "Galpão 2", "Caixa 12").

1. No campo **Localização**, clique em **Criar nova localização**.
2. Digite o nome e confirme.

**Gerenciar localizações existentes:**
Acesse **Cadastros** > aba **Localizações**.

### Unidades de medida

Defina a unidade de cada produto (UN, KG, LT, PC, CX, M, M2, M3, etc.). A unidade aparece nos pedidos, notas fiscais e etiquetas.

### SKU (código interno)

O SKU é um código único que identifica cada produto no seu sistema. Diferente do código de barras, o SKU é definido por você.

**Boas práticas para criar SKUs:**
- Use códigos que sejam fáceis de identificar (ex: \`CAM-AZUL-M\` para "Camiseta Azul tamanho M")
- Evite caracteres especiais e espaços
- Mantenha um padrão para todos os produtos

O sistema pode gerar um SKU automaticamente se você não informar um (clique no ícone de dado ao lado do campo).

### Código de barras (EAN/GTIN)

O código de barras é usado para identificação em lojas físicas e para integrações com marketplaces. Você pode:
- **Digitar manualmente**: insira o código de barras oficial do produto
- **Gerar automaticamente**: clique no ícone de dado ao lado do campo para gerar um código EAN-13 interno

![Código de barras](https://img.dudit.com.br/static/screens/Produto_CodigoBarras.png)
Legenda: Gere um código de barras automaticamente com um clique.

### Busca e filtros na listagem

A página de produtos oferece várias ferramentas para encontrar o que você precisa:

**Busca por texto**: digite o nome ou SKU do produto na barra de busca.

**Abas de estoque**: filtre rapidamente por:
- **Todos**: exibe todos os produtos
- **Normal**: produtos com estoque dentro do esperado
- **Baixo**: produtos com estoque abaixo do mínimo configurado
- **Esgotado**: produtos com estoque zero
- **Arquivados**: produtos arquivados

**Filtros avançados**: clique em **Filtros** para refinar por:
- Status (Ativo / Inativo)
- Faixa de preço
- Categoria
- Marca
- Unidade
- Situação de estoque
- Tipo de produto (Físico, Digital, Serviço)
- Com/sem preço de custo
- Em promoção

![Painel de filtros](https://img.dudit.com.br/static/screens/Produtos_FiltrosAvancados.png)
Legenda: Utilize filtros para encontrar produtos específicos.

**Ordenação**: clique nos cabeçalhos da tabela para ordenar por nome, preço, estoque, etc.

### Ações em lote

Selecione vários produtos usando os checkboxes para realizar ações em massa:

- **Ativar / Desativar**: altera o status de todos os selecionados
- **Editar em massa**: ajusta preço, estoque, visibilidade ou imagens de vários produtos de uma vez
- **Arquivar / Desarquivar**: move produtos para fora da listagem principal sem excluir
- **Excluir**: remove todos os selecionados (cuidado: ação irreversível)

**Como editar em massa:**

1. Selecione os produtos desejados.
2. No menu de ações, escolha **Editar em massa**.
3. Escolha o tipo de alteração:
   - **Preço**: aumentar ou diminuir em percentual, ou definir valor fixo
   - **Estoque**: somar, subtrair, definir valor fixo ou zerar
   - **Visibilidade**: publicar ou ocultar da vitrine
   - **Imagem**: adicionar uma imagem a todos os selecionados ou remover imagens

![Modal de edição em massa](https://img.dudit.com.br/static/screens/Produtos_EdicaoMassa.png)
Legenda: Aplique alterações a vários produtos de uma só vez.

### Exportação de produtos

Você pode exportar a lista de produtos atual para uma planilha Excel (.xlsx). A exportação considera os filtros e a busca aplicados no momento.

1. Clique no menu **Ações**.
2. Selecione **Exportar**.
3. O arquivo será baixado com os dados dos produtos filtrados.

## Dicas importantes

- **Crie categorias antes de cadastrar produtos**: planeje sua árvore de categorias com antecedência para manter a organização desde o início.
- **Use SKUs padronizados**: isso facilita a localização no sistema e a integração com marketplaces e transportadoras.
- **Aproveite a busca por código de barras**: você pode usar um leitor de código de barras para localizar produtos rapidamente - o sistema identifica tanto GTIN quanto SKU.
- **Edição em massa com cuidado**: antes de alterar preços ou estoques em lote, verifique se a seleção está correta.
- **Arquive em vez de excluir**: se não vende mais um produto mas quer manter o histórico, use "Arquivar". Produtos arquivados não aparecem na vitrine nem na listagem principal, mas ficam salvos.

## Problemas comuns

**"Não consigo encontrar um produto que sei que existe."**
Verifique se não há filtros ativos (abas de estoque, filtros avançados) que estejam escondendo o produto. Use a busca por nome ou SKU.

**"Alterei a categoria mas a subcategoria sumiu."**
É o comportamento esperado. Ao trocar a categoria, a subcategoria é limpa automaticamente. Selecione a nova subcategoria depois.

**"A edição em massa não funcionou para todos os produtos."**
Verifique se todos os produtos selecionados permitem a alteração. Por exemplo: produtos com variações não permitem editar preço/estoque do produto pai - você deve editar cada variação individualmente.

## Perguntas frequentes

**Posso ter um produto sem categoria?**
Sim. A categoria não é obrigatória, mas recomendamos usar para organizar melhor.

**Como faço para editar uma categoria existente?**
Acesse **Cadastros** no menu lateral > aba **Categorias**. Lá você pode editar, renomear ou excluir categorias e marcas.

**O que acontece se eu excluir uma categoria?**
Os produtos que estavam nela ficam sem categoria. Você precisará reclassificá-los manualmente.

**Posso ter subcategorias em vários níveis?**
O sistema suporta dois níveis: Categoria > Subcategoria. Para estruturas mais complexas, use nomes compostos (ex: "Roupas > Camisetas > Manga Longa").

**É possível imprimir a lista de produtos?**
            Você pode exportar a lista para Excel e imprimir a planilha.

            **Quantos produtos posso selecionar para edição em massa?**
            Não há limite fixo, mas recomendamos selecionar grupos menores (até 50-100 por vez) para evitar problemas de performance.
            `
            },
            {
                id: "como-trabalhar-com-variacoes",
                title: "Como trabalhar com variações",
                description: "Aprenda a criar variações de cor, tamanho e outras opções para seus produtos.",
                slug: "como-trabalhar-com-variacoes",
                category: "produtos-estoque",
                content: `
## Visão geral

Variações permitem vender diferentes versões de um mesmo produto sem precisar criar vários cadastros separados. Por exemplo, uma camiseta que existe nas cores azul, preta e branca e nos tamanhos P, M e G.

![Aba de Variações](https://img.dudit.com.br/static/screens/Produto_Variacoes.png)
Legenda: Gerencie cores, tamanhos e outras variações do produto.

## Quando usar

Use variações quando seu produto tiver diferentes opções que impactam o estoque ou o preço:

- **Roupas e calçados**: cores e tamanhos
- **Eletrônicos**: capacidade de armazenamento, cor
- **Móveis**: acabamento, material
- **Cosméticos**: fragrância, volume

> [!TIP]
> Este recurso pode estar disponível apenas em determinados planos.

## Como criar variações

### 1. Acessar a aba de Variações

1. Cadastre ou edite um produto.
2. Clique na aba **Variações**.

![Aba Variações](https://img.dudit.com.br/static/screens/Produto_AbaVariacoes.png)
Legenda: Acesse a aba de variações para configurar as opções do produto.

### 2. Adicionar os tipos de variação

Clique em **Adicionar variação**. Você pode criar combinações simples ou múltiplas:

**Exemplo 1 - Variação simples (apenas cor):**
- Tipo: "Cor"
- Valores: "Azul", "Preto", "Branco"

**Exemplo 2 - Variação combinada (cor + tamanho):**
- Tipo: "Cor / Tamanho"
- Valores: "Azul / P", "Azul / M", "Azul / G", "Preto / P", "Preto / M", "Preto / G"

![Modal de adição de variantes](https://img.dudit.com.br/static/screens/Produto_AddVariacao.png)
Legenda: Defina os tipos e valores das variações.

### 3. Configurar cada variação

Para cada variação criada, você pode definir individualmente:

- **SKU**: um código único para cada variação. Se não preencher, o sistema gera automaticamente.
- **Preço**: valor adicional em relação ao preço base do produto (pode ser positivo, negativo ou zero).
- **Estoque**: quantidade disponível para cada variação.
- **Status**: ativar ou desativar variações específicas.
- **Imagem**: uma foto diferente para cada variação (útil quando as cores são muito diferentes).

![Tabela de variações](https://img.dudit.com.br/static/screens/Produto_VariacoesTabela.png)
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

> [!IMPORTANT]
> Ao excluir uma variação, a ação não pode ser desfeita.

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
                id: "como-controlar-estoque",
                title: "Como controlar o estoque",
                description: "Gerencie entradas e saídas, configure estoque mínimo e acompanhe a disponibilidade dos produtos.",
                slug: "como-controlar-estoque",
                category: "produtos-estoque",
                content: `
## Visão geral

O controle de estoque ajuda você a saber exatamente quantos produtos têm disponíveis, evitar vendas de itens sem estoque e organizar as entradas e saídas da sua loja.

![Listagem de produtos com indicadores de estoque](https://img.dudit.com.br/static/screens/Estoque_Listagem.png)
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

![Abas de filtro de estoque](https://img.dudit.com.br/static/screens/Estoque_Abas.png)
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

Para controle mais detalhado ou ajustes manuais, use a seção **Movimentação de Estoque** no menu lateral.

### Passo a passo

1. No menu lateral, clique em **Movimentação de Estoque**.
2. Clique em **Nova movimentação**.

![Página de movimentações](https://img.dudit.com.br/static/screens/Estoque_Movimentacoes.png)
Legenda: Inicie o registro de uma movimentação de estoque.

### 3. Escolher o tipo

- **Entrada**: para adicionar itens ao estoque
- **Saída**: para remover itens do estoque

### 4. Adicionar produtos

Busque por nome ou SKU do produto. Você pode adicionar vários itens em uma mesma movimentação.

![Busca de produtos](https://img.dudit.com.br/static/screens/Estoque_BuscaProduto.png)
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

## Ajuste rápido no produto

Você também pode fazer ajustes rápidos de estoque diretamente no cadastro do produto:

1. Edite o produto.
2. No campo **Estoque Atual** (ou clique em "Ajustar" ao lado do estoque na visualização), altere a quantidade.
3. O sistema registrará automaticamente uma movimentação de "Ajuste de Estoque".

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
Acesse a página de **Movimentação de Estoque** no menu lateral. Todas as entradas e saídas registradas aparecem listadas com data, motivo e quantidade.

**Posso desfazer uma movimentação?**
Sim. Na página de detalhes da movimentação, há a opção "Desfazer". O sistema cria automaticamente uma movimentação inversa para corrigir o estoque.

**O que é "Estoque Reservado"?**
São itens que foram comprados mas o pedido ainda não foi finalizado. Assim que o pedido é concluído, o estoque reservado se transforma em baixa definitiva.

**O estoque mínimo impede a venda quando é atingido?**
Não. O estoque mínimo é apenas um alerta visual. A venda continua normalmente, a menos que o estoque chegue a zero (a menos que "Permitir vender sem estoque" esteja ativado).
`
            },
            {
                id: "movimentacoes-de-estoque",
                title: "Movimentações de estoque",
                description: "Histórico completo de entradas, saídas e ajustes com opção de desfazer e exportar.",
                slug: "movimentacoes-de-estoque",
                category: "produtos-estoque",
                content: `
## Visão geral

A página **Movimentação de Estoque** é o histórico completo de tudo que entra e sai do seu inventário. Aqui você consulta, filtra, exporta e pode desfazer movimentações feitas por engano.

![Tela de movimentações](https://img.dudit.com.br/static/screens/Estoque_MovimentacoesListagem.png)
Legenda: Listagem completa com filtros e abas por tipo.

## Quando utilizar

- Para conferir o histórico de entradas e saídas de um período
- Para auditar uma movimentação suspeita
- Para desfazer um lançamento feito por engano
- Para exportar o histórico para o contador ou controle próprio

## Como funciona

### Abas de visualização

- **Todas**: mostra entradas e saídas juntas, ordenadas por data (mais recente primeiro)
- **Entradas**: apenas movimentações que aumentaram o estoque
- **Saídas**: apenas movimentações que diminuíram o estoque

### Informações exibidas

Cada linha mostra:
- **Data e hora** da movimentação
- **Tipo** (Entrada/Saída) com badge colorido
- **Motivo** (Compra, Venda, Ajuste, etc.)
- **Produtos** afetados (clique para ver detalhes)
- **Quantidade total** de itens
- **Usuário** que registrou
- **Referência** (número do pedido, NF-e, etc., se houver)

## Como filtrar

Clique em **Filtros** para refinar a busca:

- **Período**: hoje, semana, mês, período personalizado
- **Tipo de movimentação**: Venda, Compra, Devolução, Ajuste, Avaria, Perda, Uso Interno
- **Produto**: busque por nome ou SKU específico

## Como ver detalhes de uma movimentação

Clique em qualquer linha para abrir os detalhes. Você verá:

- Lista completa de produtos movimentados com quantidades individuais
- Motivo e observações
- Referência vinculada (pedido, nota fiscal)
- Quem registrou e quando
- Botão **Desfazer** (se disponível)

## Como desfazer uma movimentação

Se você lançou uma entrada ou saída por engano:

1. Abra os detalhes da movimentação.
2. Clique em **Desfazer**.
3. Informe o motivo do estorno (opcional, mas recomendado).
4. Confirme.

O sistema criará automaticamente uma movimentação inversa:
- Se era uma **entrada**, cria uma **saída** de "Ajuste" com a mesma quantidade
- Se era uma **saída**, cria uma **entrada** de "Ajuste" com a mesma quantidade

> [!IMPORTANT]
> O desfazer só está disponível para movimentações manuais. Movimentações automáticas (vendas, importação XML) não podem ser desfeitas diretamente - você precisaria criar uma movimentação manual inversa.

## Exportação do histórico

Você pode exportar a listagem filtrada para Excel (.xlsx):

1. Aplique os filtros desejados.
2. Clique no menu **Ações** > **Exportar**.
3. O arquivo será baixado com todas as colunas visíveis.

## Dicas importantes

- **Use motivos corretos**: "Ajuste de Estoque" é genérico. Prefira "Compra de Fornecedor" para entradas de compra e "Avaria/Perda" para quebras.
- **Conferência periódica**: compare o estoque do sistema com o físico periodicamente. Diferenças indicam lançamentos faltando ou errados.
- **Desfazer vs. Nova movimentação**: se o erro foi só na quantidade, use "Desfazer" e refaça certo. Se foi no motivo, crie uma nova movimentação inversa manual.

## Problemas comuns

**"Desfiz uma movimentação mas o estoque não voltou ao normal."**
Verifique se a movimentação original já tinha sido compensada por outra (ex: venda já entregue). O desfazer cria o inverso matemático - se o estoque já mudou depois, o resultado final pode não ser o esperado.

**"Não consigo desfazer uma movimentação de venda."**
Movimentações automáticas de vendas não têm botão "Desfazer". Para corrigir, cancele o pedido (o estoque volta automaticamente) ou registre uma entrada manual de "Devolução de Cliente".

**"A exportação não trouxe todos os dados."**
A exportação respeita os filtros ativos. Limpe os filtros antes de exportar se quiser o histórico completo.
`
            },
            {
                id: "fornecedores",
                title: "Fornecedores",
                description: "Cadastre fornecedores, vincule aos produtos e acompanhe histórico de compras e custos.",
                slug: "fornecedores",
                category: "produtos-estoque",
                content: `
## Visão geral

A seção **Fornecedores** centraliza o cadastro dos seus fornecedores e o relacionamento com os produtos. Você cadastra o fornecedor uma vez, vincula aos produtos e acompanha todo o histórico de compras e evolução de custos.

![Tela de fornecedores](https://img.dudit.com.br/static/screens/Fornecedores_Listagem.png)
Legenda: Listagem de fornecedores com quantidades de XMLs importados e valores totais.

## Quando utilizar

- Para cadastrar um novo fornecedor
- Para vincular fornecedores aos produtos (SKU do fornecedor, custo, lead time)
- Para consultar histórico de compras de um fornecedor
- Para ver a evolução de custos de um produto por fornecedor
- Para usar na importação de XML (o sistema cria/vincula automaticamente)

## Como gerenciar fornecedores

### Cadastrar um fornecedor

1. No menu lateral, clique em **Fornecedores**.
2. Clique em **Novo fornecedor**.

![Cadastro de fornecedor](https://img.dudit.com.br/static/screens/Fornecedor_Cadastro.png)
Legenda: Formulário de cadastro de fornecedor.

3. Preencha as informações:
   - **Nome** (obrigatório)
   - **CNPJ/CPF**
   - **E-mail** e **Telefone**
   - **Endereço** completo (CEP preenche automaticamente)
   - **Observações** (opcional)
4. Clique em **Salvar**.

### Editar ou desativar fornecedor

Na listagem, use o menu de ações (três pontos) para:
- **Editar**: alterar qualquer informação
- **Desativar**: fornecedor desativado não aparece nas opções de vinculação, mas o histórico permanece

## Vínculo com produtos

Você pode vincular fornecedores de duas formas:

### 1. No cadastro do produto (aba Fornecedores)

1. Edite o produto e vá na aba **Fornecedores**.
2. Clique em **Adicionar fornecedor**.
3. Selecione o fornecedor e informe:
   - **SKU do fornecedor**: código que ele usa para identificar o produto
   - **Custo**: preço de compra praticado por este fornecedor
   - **Lead time (dias)**: tempo médio de entrega
4. Salve.

Um produto pode ter vários fornecedores vinculados. O primeiro da lista é considerado o principal.

### 2. Na importação de XML

Ao importar uma NF-e, se o fornecedor da nota não existir no seu cadastro, ele será **criado automaticamente** com os dados da nota (CNPJ/CPF, nome, endereço). Os produtos da nota serão vinculados a ele.

## Histórico de compras

Ao clicar em um fornecedor na listagem, você vê:

- **Total de NF-es importadas** desse fornecedor
- **Valor total comprado**
- **Última importação** (data)
- Lista de **produtos vinculados** a este fornecedor

## Histórico de custos e compras por produto

Na aba **Fornecedores** do produto, ao selecionar um fornecedor vinculado, você vê na lateral direita:

### Última compra
- Data da última NF-e importada desse fornecedor para este produto
- Último custo registrado
- Custo atual cadastrado no produto

### Histórico de custos (timeline)
Linha do tempo mostrando cada vez que o custo mudou:
- Data da alteração
- Valor anterior → novo valor
- Fornecedor responsável

### Compras recentes
Lista das últimas NF-es importadas contendo este produto desse fornecedor:
- Data
- Quantidade
- Custo unitário
- Valor total

## Dicas importantes

- **Mantenha o CNPJ/CPF correto**: isso evita duplicatas na importação de XML e garante que o sistema identifique o fornecedor automaticamente.
- **Atualize o custo no vínculo**: quando o fornecedor reajusta preços, atualize o custo no vínculo do produto. Isso ajuda nas próximas importações e no cálculo de margem.
- **Lead time realista**: informe o prazo real de entrega. Isso ajuda no planejamento de compras e reposição.
- **Fornecedor principal**: o primeiro da lista é usado como padrão em relatórios e sugestões de compra.

## Perguntas frequentes

**Posso ter o mesmo produto com fornecedores diferentes?**
Sim. Um produto pode ter vários fornecedores vinculados, cada um com seu SKU, custo e lead time próprios.

**O que acontece se eu excluir um fornecedor que tem produtos vinculados?**
Os vínculos são removidos, mas os produtos continuam existindo. O histórico de importações XML permanece vinculado ao fornecedor (mesmo desativado).

**A importação de XML cria o fornecedor automaticamente?**
Sim. Se o CNPJ/CPF da nota não existir no seu cadastro, o sistema cria o fornecedor com os dados da nota fiscal.

**Posso importar uma planilha de fornecedores?**
Atualmente a importação em lote de fornecedores não está disponível. Cadastre um a um ou deixe o sistema criar via importação de XML.

**Como vejo quais produtos compram de um fornecedor específico?**
            Acesse o detalhe do fornecedor (clique na listagem). A aba "Produtos vinculados" mostra todos os itens.
            `
            },
            {
                id: "importacao-xml-nfe",
                title: "Importação de XML/NF-e",
                description: "Cadastre produtos em lote a partir de notas fiscais eletrônicas dos seus fornecedores.",
                slug: "importacao-xml-nfe",
                category: "produtos-estoque",
                content: `
## Visão geral

A importação por XML permite cadastrar produtos automaticamente a partir de notas fiscais eletrônicas (NF-e) dos seus fornecedores. Isso economiza tempo e evita erros de digitação.

![Tela de importação XML](https://img.dudit.com.br/static/screens/XML_Importacao.png)
Legenda: Acompanhe todas as importações realizadas.

## Quando usar

A importação por XML é ideal quando:

- Você recebeu uma carga de produtos e quer cadastrá-los rapidamente
- Quer atualizar o estoque e os preços de custo com base em notas fiscais
- Deseja vincular fornecedores automaticamente aos produtos

> [!IMPORTANT]
> A importação aceita apenas NF-e modelo 55 (nota fiscal de entrada). Notas de saída e NFC-e (modelo 65) não são suportadas.

## Como importar

### 1. Acessar a importação

1. No menu lateral, clique em **Produtos**.
2. Clique no botão **Ações** e selecione **Importar XML**.

![Botão Importar XML](https://img.dudit.com.br/static/screens/XML_BotaoImportar.png)
Legenda: Acesse a importação pelo menu de ações na página de produtos.

### 2. Fazer upload do XML

1. Clique na área de upload para selecionar o arquivo XML da nota fiscal.
2. O sistema analisa o XML e extrai todas as informações.
3. Após o processamento, você verá uma prévia dos produtos encontrados.

![Tela de upload XML](https://img.dudit.com.br/static/screens/XML_Upload.png)
Legenda: Selecione o arquivo XML da NF-e para análise.

### 3. Revisar os produtos

Na tela de prévia, você verá:

- **Dados da nota**: número, série, fornecedor, valor total, chave de acesso
- **Produtos encontrados**: lista com nome, NCM, quantidade e valor unitário

![Prévia da importação](https://img.dudit.com.br/static/screens/XML_Previa.png)
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

![Botões de decisão](https://img.dudit.com.br/static/screens/XML_Decisoes.png)
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
                id: "como-gerar-etiquetas",
                title: "Como gerar etiquetas",
                description: "Imprima etiquetas com nome, preço e código de barras para organizar sua loja e estoque.",
                slug: "como-gerar-etiquetas",
                category: "produtos-estoque",
                content: `
## Visão geral

A geração de etiquetas permite imprimir informações dos produtos para organizar sua loja física, facilitar a identificação no estoque ou precificar mercadorias.

![Modal de etiquetas](https://img.dudit.com.br/static/screens/Etiquetas_Modal.png)
Legenda: Selecione produtos, configure a etiqueta e visualize antes de imprimir.

## Quando usar

A geração de etiquetas é útil para:

- **Precificar produtos**: imprima etiquetas com nome e preço para expor na loja
- **Organizar estoque**: identifique prateleiras, caixas e lotes
- **Código de barras**: gere etiquetas com código de barras para agilizar o checkout
- **Promoções**: destaque preços promocionais nas etiquetas

> [!TIP]
> Este recurso pode estar disponível apenas em determinados planos.

## Como gerar etiquetas

### 1. Acessar a ferramenta

1. Na página de **Produtos**, clique no menu **Ações**.
2. Selecione **Gerar Etiquetas**.

![Opção Gerar Etiquetas](https://img.dudit.com.br/static/screens/Etiquetas_Botao.png)
Legenda: Acesse a ferramenta de etiquetas pelo menu de ações.

### 2. Selecionar produtos

Você pode selecionar produtos de duas formas:

- **Na listagem**: use os checkboxes para selecionar e depois acesse Gerar Etiquetas
- **No modal**: clique em **Adicionar** e busque pelos produtos desejados

Para cada produto, defina a **quantidade de etiquetas** que deseja imprimir.

![Lista de produtos para etiquetas](https://img.dudit.com.br/static/screens/Etiquetas_Selecao.png)
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

![Opções de conteúdo](https://img.dudit.com.br/static/screens/Etiquetas_Conteudo.png)
Legenda: Escolha quais informações exibir na etiqueta.

### 5. Visualizar e imprimir

1. A pré-visualização mostra como as etiquetas vão ficar.
2. Clique em **Imprimir** para abrir a impressão no navegador.
3. Ou clique em **Salvar PDF** para baixar um arquivo PDF.

> [!TIP]
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
                id: "cadastros-auxiliares",
                title: "Cadastros auxiliares",
                description: "Gerencie categorias, marcas, unidades e localizações para organizar melhor seu catálogo.",
                slug: "cadastros-auxiliares",
                category: "produtos-estoque",
                content: `
## Visão geral

A página **Cadastros** centraliza a gestão de categorias, subcategorias, marcas, unidades de medida e localizações físicas. Manter esses cadastros organizados facilita a criação de produtos, a busca, os relatórios e a navegação dos clientes na loja.

![Página de Cadastros](https://img.dudit.com.br/static/screens/Cadastros_Pagina.png)
Legenda: Abas para Categorias, Marcas, Unidades e Localizações.

## Como acessar

1. No menu lateral, clique em **Cadastros** (dentro da seção Produtos).
2. Você verá 4 abas: **Categorias**, **Marcas**, **Unidades**, **Localizações**.

## Categorias e subcategorias

Aba **Categorias**: gerencie a árvore de categorias do seu catálogo.

### Criar categoria principal

1. Na aba Categorias, clique em **Nova categoria**.
2. Digite o nome (ex: "Roupas", "Eletrônicos", "Acessórios").
3. Marque como **Ativa** se quiser que possa ser usada.
4. Salve.

### Criar subcategoria

1. Na lista, localize a categoria pai.
2. Clique no menu de ações (três pontos) > **Adicionar subcategoria**.
3. Digite o nome (ex: dentro de "Roupas": "Camisetas", "Calças").
4. Salve.

### Editar ou excluir

- **Editar**: clique no nome ou no ícone de edição para alterar nome ou status.
- **Excluir**: use o menu de ações. Atenção: ao excluir uma categoria que tem subcategorias, elas também serão excluídas. Produtos vinculados ficarão sem categoria.

> [!TIP]
> Crie a estrutura de categorias antes de começar a cadastrar produtos. Isso evita retrabalho depois.

## Marcas

Aba **Marcas**: cadastre as marcas dos seus produtos.

1. Clique em **Nova marca**.
2. Digite o nome da marca.
3. Marque como **Ativa**.
4. Salve.

Marcas ajudam na organização, na busca por filtro e aparecem na ficha do produto e na vitrine.

## Unidades de medida

Aba **Unidades**: defina as unidades usadas nos seus produtos (UN, KG, LT, PC, CX, M, M2, M3, etc.).

1. Clique em **Nova unidade**.
2. Informe o **código** (ex: "UN", "KG") e a **descrição** (ex: "Unidade", "Quilograma").
3. Salve.

A unidade aparece nos pedidos, notas fiscais, etiquetas e relatórios de estoque.

## Localizações físicas

Aba **Localizações**: cadastre onde seus produtos ficam guardados no estoque físico.

Exemplos: "Prateleira A3", "Galpão 2 - Corredor B", "Caixa 12 - Setor Eletrônicos", "Balcao Vitrine".

1. Clique em **Nova localização**.
2. Digite o nome descritivo.
3. Salve.

No cadastro do produto, selecione a localização no campo correspondente. Isso ajuda a equipe a encontrar o produto rapidamente na hora da separação.

## Como esses cadastros ajudam no dia a dia

| Cadastro | Para que serve |
|----------|----------------|
| **Categorias** | Agrupa produtos por tipo; clientes filtram por categoria na loja; relatórios de vendas por categoria |
| **Subcategorias** | Refina a organização dentro de categorias grandes |
| **Marcas** | Filtro de busca; identificação visual na vitrine; relatórios por marca |
| **Unidades** | Padroniza medidas em pedidos, notas e etiquetas; evita confusão entre KG/UN/PC |
| **Localizações** | Agiliza separação de pedidos; inventário físico mais rápido; controle de múltiplos estoques |

## Dicas importantes

- **Planeje a estrutura de categorias** antes de cadastrar produtos em massa.
- **Mantenha nomes consistentes**: use sempre o mesmo padrão (ex: todas no singular, primeira letra maiúscula).
- **Desative em vez de excluir**: se uma categoria/marca não é mais usada, desative. O histórico permanece.
- **Unidades padrão**: o sistema já vem com as mais comuns. Adicione apenas as específicas do seu negócio.
- **Localizações descritivas**: seja específico ("Prateleira A3 - Lado Esquerdo" é melhor que "A3").

## Perguntas frequentes

**Posso ter um produto sem categoria?**
Sim. A categoria não é obrigatória, mas recomendamos usar para organizar melhor.

**O que acontece se eu excluir uma categoria que tem produtos?**
Os produtos ficam sem categoria. Você precisará editá-los para atribuir uma nova categoria.

**As unidades de medida afetam a nota fiscal?**
Sim. A unidade informada no produto é enviada na NF-e. Use códigos compatíveis com a tabela do governo (UN, KG, LT, M, M2, M3, PC, CX, etc.).

**Consigo importar categorias/marcas em lote?**
Atualmente a importação em lote desses cadastros não está disponível. Cadastre um a um ou crie durante o cadastro do produto.

**Quantos níveis de subcategoria posso ter?**
Dois níveis: Categoria > Subcategoria. Para estruturas mais complexas, use nomes compostos na categoria principal.
`
            },
            {
                id: "perguntas-frequentes-produtos-estoque",
                title: "Perguntas frequentes sobre Produtos e Estoque",
                description: "Respostas rápidas para as dúvidas mais comuns sobre cadastro, variações, estoque, XML, etiquetas e cadastros auxiliares.",
                slug: "perguntas-frequentes-produtos-estoque",
                category: "produtos-estoque",
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
Alguns recursos avançados podem estar disponíveis apenas em determinados planos.

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

## Cadastros auxiliares

**Como faço para editar uma categoria existente?**
Acesse **Cadastros** > aba **Categorias**. Lá você pode editar, renomear ou excluir categorias e subcategorias.

**O que acontece se eu excluir uma marca que está em uso?**
Os produtos que usavam essa marca ficarão sem marca. Você precisará editá-los para atribuir uma nova.

**As unidades de medida são fixas ou posso criar as minhas?**
Você pode criar as unidades que precisar. O sistema já vem com as mais comuns (UN, KG, LT, PC, CX, etc.).

**Para que serve a localização física?**
Ajuda sua equipe a encontrar o produto no estoque na hora de separar pedidos. Exemplo: "Prateleira A3", "Galpão 2 - Caixa 12".

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

---

**Ainda com dúvidas?** Entre em contato com nosso suporte ou consulte o artigo específico sobre o assunto na Central de Ajuda.
`
            }
        ]
    },
    {
        id: "vitrine-online",
        title: "Vitrine Online",
        icon: "🛍️",
        articles: [
            {
                id: "visao-geral-vitrine-online",
                title: "Visão geral da Vitrine Online",
                description: "Entenda como os produtos são ranqueados na Vitrine Online, quais fatores influenciam a posição e como melhorar a visibilidade.",
                slug: "visao-geral-vitrine-online",
                category: "vitrine-online",
                content: `
## Visão geral
A **Vitrine Online** é a vitrine digital do seu negócio: o espaço onde os clientes encontram seus produtos e serviços, tanto na loja da sua marca quanto nas páginas de busca e exploração da Dudit.

Para que os clientes encontrem com facilidade o que procuram, os produtos aparecem em uma **ordem de exibição** calculada automaticamente pelo sistema. Esse cálculo é o que chamamos de **ranqueamento**: uma forma justa e transparente de organizar o catálogo, dando destaque aos produtos mais relevantes para cada cliente, sem depender de intervenção manual.

[IMAGEM: Tela da Vitrine Online mostrando resultados de busca com produtos ordenados]
Legenda: Os produtos aparecem em uma ordem calculada automaticamente conforme a relevância.

## Como os produtos são exibidos
Um produto pode aparecer em diferentes lugares da Vitrine Online, e cada local usa critérios próprios para decidir a ordem:

| Local de exibição | Como a ordem é definida |
| :--- | :--- |
| **Busca** | Produtos que mais correspondem ao que o cliente digitou, considerando nome, descrição e categoria. |
| **Navegação e exploração** | Engajamento recente do produto (vendas, visualizações e favoritos), novidade do cadastro e avaliações. |
| **Seções da página inicial** | Seções curadas, como "Em alta", "Mais vendidos", "Mais avaliados" e "Promoções", usam critérios específicos de cada tema. |
| **Vitrine da loja** | Organização da própria loja, com destaque para a reputação e a qualidade geral do atendimento. |

O ranqueamento é **dinâmico**: ele acompanha o desempenho do catálogo ao longo do tempo. Um produto que hoje está em destaque pode subir ou descer conforme o comportamento dos clientes muda.

## Fatores que influenciam a posição
Vários fatores são considerados em conjunto para definir a posição de um produto. Nenhum fator isolado garante o topo — o equilíbrio entre eles é o que importa:

| Fator | Como influencia | Como melhorar |
| :--- | :--- | :--- |
| **Qualidade do cadastro** | Produtos com nome, descrição, imagens, categoria e atributos completos são mais bem compreendidos pelo sistema e mais relevantes nas buscas. | Preencha todos os campos, use termos que os clientes realmente pesquisam e revise o cadastro antes de publicar. |
| **Disponibilidade de estoque** | Produto com estoque disponível pode ser vendido e se destacar. Sem estoque, perde força e pode deixar de aparecer. | Mantenha o estoque sempre atualizado e realista. |
| **Preço competitivo** | Preços alinhados ao mercado atraem mais compras e conversões, o que fortalece a posição ao longo do tempo. | Pesquise a concorrência, calcule sua margem e aproveite promoções. |
| **Vendas e conversão** | Produtos que vendem bem e têm boa taxa de conversão demonstram relevância para os clientes. | Ofereça uma boa experiência de compra e cumpra prazos para gerar vendas consistentes. |
| **Avaliações e interações** | Avaliações positivas, favoritos e visualizações indicam que o produto desperta interesse. | Incentive avaliações genuínas de clientes satisfeitos e mantenha o produto atraente. |
| **Relevância para a busca** | Quanto melhor o produto corresponde ao termo pesquisado, maior a chance de aparecer no topo daquele resultado. | Use nomes claros, descrições ricas e a categoria correta. |
| **Atualização e atividade do catálogo** | Produtos recém-cadastrados ou recentemente atualizados recebem um impulso inicial de visibilidade. | Revise e atualize o catálogo com frequência, evitando itens desatualizados. |
| **Reputação da loja** | Lojas com bom volume de vendas, avaliações e baixo índice de problemas têm mais destaque. | Atenda bem, cumpra o que promete e evite cancelamentos e devoluções por culpa da loja. |
| **Promoções e descontos** | Produtos com descontos ativos ganham espaço em seções específicas e atraem mais cliques. | Use as campanhas e cupons da plataforma de forma planejada. |

## O que pode reduzir a posição
Alguns comportamentos e situações fazem o produto **perder posições** ou até sair da Vitrine Online:

| Situação | Efeito na Vitrine Online |
| :--- | :--- |
| **Produto sem estoque** | Perde força no ranqueamento e pode deixar de aparecer para os clientes. |
| **Informações incompletas ou incorretas** | Dificulta a correspondência nas buscas e reduz a confiança dos clientes. |
| **Tentativa de manipular o ranking** | Compras da própria loja, avaliações falsas e inflação de visualizações são detectadas e podem gerar penalidades graves, incluindo a remoção do produto. |
| **Cancelamentos e desistências frequentes** | Sinalizam baixa qualidade do atendimento e reduzem a reputação da loja. |
| **Devoluções por falha do vendedor** | Produto errado, defeituoso ou diferente do anunciado aumenta o índice de falhas e reduz o alcance da loja. |
| **Reclamações e reportes frequentes** | Problemas recorrentes relatados por clientes podem reduzir ou suspender a visibilidade. |
| **Descumprimento das regras da Vitrine** | Produtos em desacordo com as políticas da plataforma ficam em análise de moderação e podem ser removidos. |

## Boas práticas para melhorar o posicionamento
Seguir boas práticas no dia a dia é a forma mais eficaz de melhorar a visibilidade dos seus produtos:

**Cadastre os produtos corretamente**
*   Use nomes claros e objetivos, com as palavras que os clientes realmente pesquisam.
*   Escreva descrições completas, destacando características, materiais e diferenciais.
*   Escolha a categoria e a subcategoria corretas e preencha todos os atributos disponíveis.
*   Não duplique cadastros: cada produto deve ter um único registro.

**Use imagens de qualidade**
*   Imagens nítidas, bem iluminadas e em boa resolução valorizam o produto.
*   Mostre o produto de ângulos diferentes e, quando fizer sentido, em uso.

**Mantenha o estoque atualizado**
*   Atualize o estoque sempre que houver entrada ou saída de mercadorias.
*   Itens esgotados devem ficar sinalizados como indisponíveis para não frustrar o cliente.

**Trabalhe preços e promoções**
*   Mantenha preços competitivos e condizentes com o mercado.
*   Use campanhas e cupons para gerar movimentação e atrair clientes.

**Mantenha o catálogo organizado**
*   Revise o catálogo com frequência e remova ou atualize itens desatualizados.
*   Evite variações desnecessárias e informações conflitantes entre produtos parecidos.

**Cuide da experiência do cliente**
*   Atenda com rapidez e cordialidade.
*   Cumpra prazos de entrega e resolva problemas com transparência.
*   Avaliações positivas e clientes satisfeitos fortalecem a sua loja.

[IMAGEM: Ilustração com os principais fatores que influenciam o ranqueamento de um produto]
Legenda: Qualidade do cadastro, estoque, preço, vendas, avaliações e reputação trabalham juntos.

## Dicas importantes

> [!TIP]
> Priorize **vendas reais e avaliações genuínas**. Elas são os sinais mais fortes de que um produto é relevante para os clientes.

> [!NOTE]
> Produtos **recém-cadastrados** recebem um impulso inicial de visibilidade para serem testados pelo público. Aproveite esse período com um cadastro impecável.

> [!IMPORTANT]
> Tentativas de **manipular o ranking** (compras da própria loja, avaliações falsas ou inflação de visualizações) são detectadas pelo sistema e podem levar à remoção do produto. Jogue limpo: o ranqueamento recompensa clientes de verdade.

## Problemas comuns

**"Meu produto não aparece na busca"**
O produto pode estar com o status inativo, sem estoque, em análise de moderação ou com o cadastro incompleto. Confira o status do produto e a integridade das informações.

**"Meu produto aparecia bem e de repente caiu de posição"**
O ranqueamento é dinâmico. Novos produtos, concorrentes mais fortes e mudanças no comportamento dos clientes movem as posições naturalmente. Revise a qualidade do cadastro e o desempenho recente.

**"Estou com muitas reclamações de devolução"**
Devoluções por falha do vendedor (produto errado, defeituoso ou diferente do anunciado) reduzem o alcance da loja. Revise o processo de expedição e a conferência dos pedidos antes do envio.

**"Criei uma promoção e não vi o produto em destaque"**
Promoções dão mais visibilidade, mas a posição continua dependendo de outros fatores, como a qualidade do cadastro e o desempenho do produto.

## Perguntas frequentes

**Por que meu produto não aparece em destaque?**
Destaque é resultado de um conjunto de fatores: qualidade do cadastro, desempenho de vendas, avaliações, estoque disponível e reputação da loja. Revise cada um deles no seu catálogo.

**Como faço meu produto aparecer mais?**
Complete o cadastro com informações claras, use imagens de qualidade, mantenha o estoque atualizado, ofereça preços competitivos, crie promoções e atenda bem para gerar avaliações positivas e vendas consistentes.

**Alterar preço muda o ranking?**
O preço em si não move o ranking diretamente, mas preços competitivos tendem a gerar mais vendas e conversões, e são esses resultados que fortalecem a posição do produto ao longo do tempo.

**Produto sem estoque perde posição?**
Sim. Produto sem estoque não pode ser vendido, perde força no ranqueamento e pode deixar de aparecer na Vitrine Online. Mantenha o estoque sempre atualizado.

**Todos os produtos têm a mesma chance de aparecer?**
Todos os produtos ativos, aprovados e com estoque têm a chance de aparecer, mas a posição é proporcional à relevância de cada um: produtos com melhor cadastro e melhor desempenho tendem a ficar mais visíveis.

[IMAGEM: Exemplo de um cadastro de produto completo e bem organizado]
Legenda: Um bom cadastro combina nome claro, descrição rica, imagens de qualidade e atributos preenchidos.

**Ainda com dúvidas?** Entre em contato com nosso suporte ou consulte os artigos de Produtos e Estoque e Marketing na Central de Ajuda.
`
            }
        ]
    },
    {
        id: "servicos",
        title: "Serviços",
        icon: "🛠️",
        articles: [
            {
                id: "visao-geral-servicos",
                title: "Visão geral de Serviços",
                description: "Entenda o módulo de Serviços: agendamentos, ordens de serviço e catálogo.",
                slug: "visao-geral-servicos",
                category: "servicos",
                content: `
## Visão geral

O módulo **Serviços** reúne tudo o que você precisa para gerenciar atendimentos presenciais ou técnicos: desde o agendamento do horário com o cliente até a conclusão da ordem de serviço. Ele é composto por três partes que trabalham juntas:

![Tela principal de Serviços](https://img.dudit.com.br/static/screens/Servicos_VisaoGeral.png)
Legenda: Menu de serviços com acesso rápido a Agendamentos e Ordens de Serviço.

**Agendamentos** - Calendário visual (dia, semana, mês) para marcar horários, escolher cliente, serviço e profissional. Permite recorrência, bloqueio de indisponibilidades e checkout integrado.

**Ordens de Serviço (OS)** - Acompanhamento completo da execução: etapas, responsável, previsão, serviços e produtos utilizados, especificações, anexos e assinatura online.

**Catálogo de Serviços** - Cadastro dos seus serviços com preço, duração, categoria e recursos de estoque. Esses serviços aparecem tanto nos agendamentos quanto nas ordens de serviço.

## Conceitos importantes

**Agendamento vs. Ordem de Serviço**
- **Agendamento**: foca no horário e na reserva de tempo na agenda do profissional.
- **Ordem de Serviço**: foca na execução técnica, com etapas, materiais, diagnóstico e conclusão.
- Um agendamento pode virar uma OS, mas você também pode criar OS direto sem agendamento prévio.

**Profissionais (Equipe)**
São os colaboradores que executam os serviços. No agendamento, você escolhe quem atende. Na OS, define o responsável.

**Status da Ordem de Serviço**
A OS passa por etapas até a entrega:
- **Aberta** → recém-criada, aguardando início
- **Aprovada** → cliente autorizou, pode começar
- **Em andamento** → execução em progresso
- **Aguardando peça** → pausa por falta de material
- **Concluída** → serviço finalizado
- **Entregue** → cliente retirou ou recebeu
- **Cancelada** → não será realizada

**Recursos de estoque nos serviços**
Ao cadastrar um serviço, você pode vincular produtos que ele costuma consumir (ex: tinta, filtro, peça). Ao usar o serviço em agendamento ou OS, o sistema sugere esses itens para baixar do estoque automaticamente.

## Como acessar

1. No menu lateral, clique em **Serviços**.
2. Escolha **Agendamentos** ou **Ordens de Serviço**.
3. No Agendamentos, use as abas **Dia**, **Semana**, **Mês** ou **Lista**.
4. Na OS, use as abas de status: **Todas**, **Abertas**, **Em Andamento**, **Concluídas**, **Canceladas**.

![Menu lateral destacando Serviços](https://img.dudit.com.br/static/screens/Menu_Servicos.png)
Legenda: Acesso ao módulo de Serviços pelo menu principal.

## Dicas importantes

- Cadastre seus serviços **antes** de começar a agendar - isso agiliza muito o dia a dia.
- Configure **categorias de serviço** (ex: "Corte", "Manutenção", "Instalação") para organizar a seleção.
- Defina **duração realista** nos serviços; o calendário usa isso para mostrar horários disponíveis.
- Use **indisponibilidades** (férias, manutenção, feriado) para bloquear horários dos profissionais.
- Na OS, preencha **diagnóstico** e **observações internas** - ajuda na comunicação com a equipe e no histórico.

## Perguntas frequentes

**Qual a diferença entre criar um agendamento e criar uma OS direto?**
Agendamento é para reservar horário na agenda (cliente vem no horário marcado). OS direta é quando o serviço não depende de horário fixo (ex: equipamento deixado na loja, visita técnica externa).

**Preciso ter agendamento para criar uma OS?**
Não. Você pode criar uma OS do zero em **Ordens de Serviço > Nova OS**.

**O que são "recursos" de um serviço?**
São produtos ou materiais que o serviço costuma usar. Ao adicionar o serviço no agendamento ou OS, o sistema sugere esses itens para você confirmar a quantidade e baixar do estoque.

**Posso ter serviços com preço por hora ou por dia?**
Sim. No cadastro do serviço, a unidade de cobrança pode ser **Por Serviço** (preço fixo), **Por Hora** (preço × horas) ou **Por Dia** (preço × dias).

**A assinatura online da OS funciona como?**
Disponível a partir do plano Crescer. Você gera um link público da OS, envia para o cliente (WhatsApp/e-mail), ele visualiza e assina digitalmente. A assinatura fica salva na OS.
`
            },
            {
                id: "cadastro-organizacao-servicos",
                title: "Cadastro e organização de serviços",
                description: "Como criar, editar e organizar seus serviços com categorias, preços e duração.",
                slug: "cadastro-organizacao-servicos",
                category: "servicos",
                content: `
## Visão geral

O **catálogo de serviços** é a base para agendamentos e ordens de serviço. Cada serviço cadastrado fica disponível para seleção rápida, já com preço, duração e categoria definidos.

![Tela de cadastro de serviço](https://img.dudit.com.br/static/screens/Servico_Cadastro.png)
Legenda: Formulário de cadastro rápido de serviço.

## Quando usar

- Para criar um novo serviço que sua empresa oferece
- Para ajustar preço, duração ou categoria de um serviço existente
- Para organizar a lista com categorias e facilitar a busca

## Como fazer

### 1. Acessar o cadastro

Você pode cadastrar serviços de duas formas:

**Opção A - No Agendamento (rápido):**
1. Em **Agendamentos**, clique em **Novo agendamento**.
2. Na etapa "Selecionar Serviços", clique no botão **"+"** ao lado da busca.
3. Preencha o nome, preço e duração. O serviço é salvo no catálogo e já adicionado ao agendamento.

**Opção B - No cadastro completo (recomendado para organizar):**
1. Em **Agendamentos**, clique no menu **Ações** > **Cadastrar serviço** (ou acesse via OS ao adicionar serviço).
2. Preencha todas as informações.

### 2. Preencher as informações

**Nome do serviço** (obrigatório): nome claro que o cliente entenda (ex: "Corte de cabelo", "Manutenção de ar condicionado").

**Preço**: valor cobrado pelo serviço.

**Duração (minutos)**: tempo que o serviço leva. O calendário usa isso para calcular horários disponíveis.

**Unidade de cobrança**:
- **Por Serviço** - preço fixo (padrão)
- **Por Hora** - preço × horas gastas
- **Por Dia** - preço × dias de execução

**Categoria**: agrupe por tipo (ex: "Corte", "Barba", "Hidratação", "Manutenção", "Instalação"). Se não existir, crie na hora.

**Buffer (minutos)**: tempo extra entre um atendimento e outro (ex: 10 min para limpeza/preparação).

**Profissional padrão** (opcional): se o serviço sempre é feito pela mesma pessoa.

**Recursos de estoque** (opcional): produtos que o serviço consome. Adicione itens com quantidade. Ex: serviço "Pintura de parede" → recursos: "Tinta branca (2 latas)", "Lixa (1 pacote)".

### 3. Salvar

Clique em **Salvar**. O serviço aparece no catálogo e fica disponível em agendamentos e OS.

## Como organizar com categorias

As categorias aparecem como grupos na seleção de serviços:

1. Ao cadastrar/editar serviço, clique em **Criar nova categoria**.
2. Digite o nome (ex: "Cabelo", "Barba", "Sobrancelha").
3. A categoria é criada e selecionada.

> [!TIP]
> Planeje suas categorias antes de cadastrar muitos serviços. Ex: se é salão, use "Corte", "Química", "Tratamento". Se é assistência técnica, use "Diagnóstico", "Reparo", "Instalação".

## Editando e excluindo

- **Editar**: clique no serviço no catálogo (ou na seleção do agendamento/OS) > ícone de lápis.
- **Excluir**: menu de ações (três pontos) > **Excluir**. Atenção: se o serviço já foi usado em agendamentos/OS passados, ele fica inativo no catálogo mas o histórico permanece.

## Dicas importantes

- **Duração realista**: evite colocar 30 min se o serviço leva 1 hora. Isso bagunça a agenda.
- **Buffer**: use para tempos de preparação/limpeza entre clientes.
- **Recursos de estoque**: cadastre para serviços que sempre usam os mesmos materiais. Agiliza e evita esquecer itens.
- **Preço por hora/dia**: útil para serviços variáveis (ex: "Consultoria técnica - Por Hora").

## Perguntas frequentes

**Posso cadastrar serviço sem preço?**
Sim. Deixe o preço como 0 e defina na hora do agendamento/OS (útil para orçamentos personalizados).

**O que acontece se eu excluir uma categoria?**
Os serviços dessa categoria ficam sem categoria. Você pode reatribuir depois.

**Consigo duplicar um serviço?**
Não há botão "Duplicar", mas você pode criar um novo copiando as informações.

**Serviço cadastrado no agendamento aparece na OS?**
Sim. O catálogo é compartilhado entre Agendamentos e Ordens de Serviço.
`
            },
            {
                id: "agendamentos",
                title: "Agendamentos",
                description: "Como criar, editar e organizar agendamentos de serviços.",
                slug: "agendamentos",
                category: "servicos",
                content: `
## Visão geral

O **Agendamentos** é sua agenda visual de serviços. Você vê dia, semana ou mês, marca horários com clientes e gerencia a disponibilidade dos profissionais.

![Tela de Agendamentos](https://img.dudit.com.br/static/screens/Agendamentos_Calendario.png)
Legenda: Calendário em visualização semanal com agendamentos coloridos por profissional.

## Quando usar

- Para marcar horário de atendimento com cliente (presencial ou visita)
- Para bloquear horários de indisponibilidade (férias, manutenção, feriado)
- Para visualizar a semana da equipe e evitar conflitos
- Para fazer checkout e receber pagamento no atendimento

## Como fazer

### 1. Criar um agendamento

1. Em **Agendamentos**, clique em **Novo agendamento** (ou clique direto em um horário livre no calendário).
2. **Serviços**: selecione um ou mais serviços do catálogo. Adicione quantos precisar.
3. **Cliente**: escolha cliente existente ou crie novo na hora (nome, telefone, e-mail).
4. **Profissional**: escolha quem vai atender. O calendário mostra só horários livres dele.
5. **Data e hora**: confirme data, horário de início e fim (baseado na duração dos serviços).
6. **Recorrência** (opcional): **Não se repete** (padrão), **Diário**, **Semanal**. Defina até quando ou número de ocorrências.
7. **Observações** (opcional): notas internas ou para o cliente.
8. Clique em **Salvar agendamento**.

![Fluxo de agendamento](https://img.dudit.com.br/static/screens/Agendamento_Fluxo.png)
Legenda: Etapas: Serviços → Cliente → Data/Hora → Itens → Resumo.

### 2. Itens de estoque (opcional)

Se os serviços têm **recursos vinculados** (produtos que consomem), a etapa "Itens" abre automaticamente. Confira as quantidades sugeridas, ajuste se precisar e continue.

### 3. Checkout (opcional)

Após salvar, você pode ir direto para o **Checkout** para registrar o pagamento (dinheiro, cartão, PIX, parcelado).

## Visualizações do calendário

- **Dia**: visão detalhada de um dia, horários por profissional
- **Semana** (padrão): 7 dias, fácil ver a semana toda
- **Mês**: visão compacta, clique no dia para ver detalhes
- **Lista**: todos os agendamentos em ordem cronológica

Use os botões no topo para alternar. Clique em **Hoje** para voltar ao dia atual.

## Indisponibilidades (bloquear horários)

Para impedir agendamentos em certos horários:

1. No calendário, clique em **Ações** > **Horário indisponível** (ou clique em horário livre > "Indisponível").
2. Escolha: **Profissional**, **Data/hora**, **Tipo** (ex: "Férias", "Manutenção", "Feriado", "Almoço").
3. Para recorrentes (ex: almoço todo dia), use recorrência **Diária** ou **Semanal**.

## Editando, cancelando e reagendando

- **Editar**: clique no agendamento > **Editar**. Altere serviço, cliente, profissional, horário, recorrência.
- **Cancelar**: clique no agendamento > **Cancelar**. Opcional: notificar cliente e adicionar motivo.
- **Reagendar**: edite e mude data/hora. Ou arraste o agendamento no calendário (visualização dia/semana) para novo horário.

> [!IMPORTANT]
> Ao cancelar, o sistema pode notificar o cliente automaticamente (WhatsApp/e-mail) se tiver contato cadastrado.

## Conflitos de horário

O sistema avisa se você tenta marcar sobre outro agendamento do mesmo profissional. Na visualização dia/semana, horários ocupados ficam bloqueados.

## Dicas importantes

- **Configure horário de funcionamento** em Configurações > Horários - o calendário respeita isso.
- **Use cores dos profissionais** - cada membro da equipe tem cor, facilita visualizar a agenda.
- **Recorrência para clientes fixos** - cliente que vem toda semana? Crie recorrente semanal.
- **Indisponibilidade de almoço** - crie recorrente diária "Almoço" para bloquear 12h–13h automaticamente.

## Perguntas frequentes

**Posso agendar sem cliente cadastrado?**
Sim. Crie o cliente na hora do agendamento (nome + telefone já bastam).

**O que acontece se o profissional não estiver disponível no horário?**
O sistema não mostra o horário como livre. Se forçar, avisa sobre conflito.

**Consigo ver agendamentos de todos os profissionais junto?**
Sim. Na visualização Semana/Dia, todos aparecem lado a lado (colunas) ou em lista única.

**Agendamento recorrente pode ter exceções?**
Sim. Você pode editar/cancelar uma ocorrência específica da série sem afetar as outras.

**O cliente recebe lembrete?**
Se tiver WhatsApp/e-mail cadastrado, o sistema envia lembrete automático antes do horário.
`
            },
            {
                id: "gerenciando-agendamentos",
                title: "Gerenciando agendamentos",
                description: "Edite, cancele, reagende e acompanhe o status dos seus agendamentos.",
                slug: "gerenciando-agendamentos",
                category: "servicos",
                content: `
## Visão geral

Depois que o agendamento é criado, você precisa acompanhar o dia a dia: confirmar a presença, reagendar quando o cliente pede, bloquear horários e saber o que já foi atendido.

![Detalhes do agendamento](https://img.dudit.com.br/static/screens/Agendamento_Detalhes.png)
Legenda: Tela de detalhes com status, histórico e ações.

## Quando usar

- Para confirmar ou cancelar um atendimento
- Para reagendar um horário (cliente pediu troca de dia/hora)
- Para registrar que o cliente não compareceu
- Para bloquear horários de indisponibilidade
- Para conferir o histórico de um atendimento

## Como fazer

### 1. Abrir um agendamento

Clique no agendamento no calendário (ou na lista) para abrir os detalhes. Você vê:
- **Cliente**, **serviço(s)**, **profissional**, **data/hora**
- **Status atual** (Reservado, Concluído, Cancelado, etc.)
- **Histórico de alterações** (linha do tempo)

### 2. Alterar dados do agendamento

Clique em **Editar** para mudar:
- Serviço(s) selecionado(s)
- Cliente
- Profissional
- Data/hora
- Recorrência
- Observações

O sistema valida conflitos de horário e avisa se o novo horário não está disponível.

### 3. Cancelar um agendamento

1. Abra o agendamento > **Cancelar**.
2. Opcional: marque **notificar cliente** e adicione o **motivo**.
3. Confirme.

> [!TIP]
> Se o cliente só vai trocar de horário, prefira **reagendar** (editar data/hora) em vez de cancelar - mantém o histórico.

### 4. Registrar não comparecimento

Se o cliente não apareceu, use a opção de **ausência** nos status. Isso ajuda a ver no relatório quais atendimentos não foram realizados.

### 5. Bloquear horários (indisponibilidade)

1. Clique em **Ações** > **Horário indisponível**.
2. Escolha profissional, data/hora e tipo (Férias, Manutenção, Feriado, Almoço).
3. Para repetir (ex: almoço diário), use recorrência.

### 6. Acompanhar histórico

Na tela de detalhes, a aba **Histórico** mostra tudo que aconteceu com o agendamento: criação, alterações, cancelamentos, com quem e quando.

## Dicas importantes

- **Reagende em vez de cancelar** sempre que possível - preserva o histórico e evita refazer o agendamento do zero.
- **Use tipos de indisponibilidade** para saber o motivo do bloqueio no calendário (almoço, férias, feriado).
- **Notifique o cliente** ao cancelar para evitar falta sem aviso e cliente chateado.
- **Confira o histórico** antes de duplicar um agendamento - evita erros repetidos.

## Perguntas frequentes

**Posso mudar o profissional depois de criar?**
Sim. Edite o agendamento e troque o profissional. O sistema verifica disponibilidade do novo profissional.

**O que acontece se eu cancelar um agendamento recorrente?**
Ao abrir o cancelamento, escolha entre cancelar **apenas esta ocorrência** ou **toda a série**.

**Consigo desfazer um cancelamento?**
Não. Se cancelou por engano, crie um novo agendamento com os mesmos dados.

**Como vejo os agendamentos do dia?**
Use a visualização **Dia** no calendário, ou filtre a lista por data. Também dá para filtrar por profissional.
`
            },
            {
                id: "ordens-de-servico",
                title: "Ordens de serviço",
                description: "Crie e preencha ordens de serviço com serviços, produtos, especificações e anexos.",
                slug: "ordens-de-servico",
                category: "servicos",
                content: `
## Visão geral

A **Ordem de Serviço (OS)** é o registro completo de um atendimento técnico ou serviço. Ela reúne o que será feito (serviços), os materiais usados (produtos), informações importantes (especificações, diagnóstico) e os arquivos de apoio (anexos).

![Tela de Ordens de Serviço](https://img.dudit.com.br/static/screens/OS_Listagem.png)
Legenda: Listagem de OS com abas de status, busca e filtros.

## Quando usar

- Manutenção, conserto ou reparo de equipamentos
- Serviços de instalação ou montagem
- Visitas técnicas
- Serviços que precisam de acompanhamento por etapas
- Quando o cliente deixa o equipamento/material na loja

## Como criar uma OS

1. Em **Ordens de Serviço**, clique em **Nova OS**.
2. Preencha as abas abaixo.
3. Clique em **Criar OS**.

![Formulário de OS](https://img.dudit.com.br/static/screens/OS_Formulario.png)
Legenda: Formulário dividido em abas: Dados Gerais, Serviços, Produtos, Especificações, Anexos, Observações.

### Aba "Dados Gerais"

- **Título** (obrigatório): resumo do serviço (ex: "Manutenção de ar condicionado")
- **Descrição**: o que será feito
- **Diagnóstico**: problema identificado (preencha no início)
- **Data e hora de abertura** (padrão: agora)
- **Data prevista de conclusão** + **hora** (prazo estimado)
- **Status**: inicial (Aberta)
- **Prioridade**: Baixa, Média, Alta, Urgente
- **Responsável**: membro da equipe que vai executar
- **Cliente** (obrigatório): busque ou crie na hora

![Aba Dados Gerais](https://img.dudit.com.br/static/screens/OS_DadosGerais.png)
Legenda: Campos principais da OS.

### Aba "Serviços" (Mão de obra)

Adicione os serviços executados:
1. Clique em **Adicionar serviço**.
2. Busque no catálogo ou **crie um serviço avulso** (nome + preço na hora).
3. Defina **quantidade** (ex: 2 horas de mão de obra).

Os serviços do catálogo já trazem preço e duração. Serviços avulsos servem para itens que não estão no catálogo.

### Aba "Produtos" (Materiais)

Adicione os produtos/materiais usados:
1. Clique em **Adicionar produto**.
2. Busque no catálogo ou **crie um produto avulso** (nome + preço).
3. Defina **quantidade**.

O sistema verifica o estoque e avisa se o produto está sem estoque (você pode prosseguir com autorização).

### Aba "Especificações"

Adicione campos chave/valor úteis para a execução (ex: "Marca do aparelho: Samsung", "Número de série: XYZ123", "Modelo: Inverter 12000").

1. Clique em **Adicionar especificação**.
2. Informe **nome** (chave) e **valor**.
3. Adicione quantas precisar.

![Aba Especificações](https://img.dudit.com.br/static/screens/OS_Especificacoes.png)
Legenda: Informações técnicas importantes da OS.

### Aba "Anexos"

Anexe arquivos e imagens (fotos do antes/depois, laudos, orçamentos):
1. Clique em **Adicionar anexo**.
2. Selecione o arquivo (imagem, PDF, etc.).
3. Opcional: escolha a **categoria** do anexo.

### Aba "Observações"

- **Observações internas**: notas para a equipe (não aparecem para o cliente).
- Descontos e cupons também podem ser aplicados aqui (aba de valores no formulário).

## Dicas importantes

- **Preencha o diagnóstico no início** e a descrição da solução no fim - deixa o histórico completo.
- **Use especificações** para modelos, números de série, garantias - facilita a consulta depois.
- **Anexe fotos do equipamento** antes de mexer - protege contra reclamações.
- **Serviços avulsos**: use com moderação. Se repete sempre, cadastre no catálogo.
- **Campos congelados após pagamento**: depois que a OS é paga, os campos principais ficam bloqueados (só status, prioridade e previsão continuam editáveis).

## Perguntas frequentes

**Posso criar OS sem serviço cadastrado?**
Sim. Use **serviço avulso** - preencha nome e preço na hora.

**O que significa "Serviço avulso"?**
É um serviço que não está no catálogo. Você digita o nome e o valor manualmente. Útil para itens pontuais.

**Consigo vincular produtos do estoque na OS?**
Sim. Na aba Produtos, busque produtos do catálogo. O sistema verifica o estoque automaticamente.

**Como aplico desconto na OS?**
No formulário, na seção de valores, aplique desconto em valor fixo ou percentual. Também aceita cupom.

**Uma OS pode ter mais de um serviço?**
Sim. Adicione quantos serviços e produtos precisar. O total é calculado automaticamente.
`
            },
            {
                id: "acompanhando-finalizando-os",
                title: "Acompanhando e finalizando ordens de serviço",
                description: "Atualize status, acompanhe etapas, compartilhe com o cliente e conclua a OS.",
                slug: "acompanhando-finalizando-os",
                category: "servicos",
                content: `
## Visão geral

Depois de criar a OS, o acompanhamento é feito pela **tela de detalhes**: você atualiza o status conforme a execução avança, vê o histórico, registra a conclusão e, quando disponível, compartilha com o cliente para assinatura online.

![Detalhes da OS](https://img.dudit.com.br/static/screens/OS_Detalhes.png)
Legenda: Tela de detalhes com timeline de etapas, informações e abas.

## Quando usar

- Para avançar a OS para a próxima etapa (aprovar, iniciar, concluir)
- Para registrar pausa por falta de peça
- Para ver se está dentro do prazo
- Para compartilhar a OS com o cliente (assinatura online)
- Para finalizar e entregar

## Status da OS (de forma simples)

A OS passa por etapas na ordem. Você só avança uma por vez:

| Etapa | O que significa |
|---|---|
| **Aberta** | Recém-criada, aguardando início |
| **Aguardando aprovação** | Esperando cliente autorizar o orçamento/serviço |
| **Aprovada** | Cliente autorizou, pode começar |
| **Em andamento** | Execução em progresso |
| **Aguardando peça** | Pausa por falta de material/peça |
| **Concluída** | Serviço finalizado |
| **Entregue** | Cliente retirou ou recebeu |
| **Cancelada** | Não será realizada |

## Como atualizar o status

1. Abra a OS.
2. Clique no **status atual** (ou menu de ações > **Alterar status**).
3. Escolha o próximo status disponível (o sistema mostra só os permitidos).
4. Confirme.

![Alteração de status](https://img.dudit.com.br/static/screens/OS_Status.png)
Legenda: Escolha o próximo status da OS.

> [!TIP]
> **Em andamento → Aguardando peça**: use quando parar por falta de material. Volte para **Em andamento** quando a peça chegar.

## Acompanhamento de prazo

Na tela de detalhes, você vê:
- **Data prevista de conclusão** (definida na criação)
- **Tempo decorrido** desde a abertura
- **Atrasado/No prazo**: indicador visual se a OS passou do prazo

## Concluindo e entregando

1. Quando o serviço estiver pronto, mude o status para **Concluída**.
2. O sistema registra a **data/hora de conclusão** e calcula o tempo total.
3. Quando o cliente retirar, mude para **Entregue**.

## Compartilhamento e assinatura online

Quando disponível no seu plano:

1. Abra a OS > menu de ações > **Compartilhar**.
2. O sistema gera um **link público** da OS.
3. Envie para o cliente (WhatsApp, e-mail).
4. O cliente visualiza a OS e pode **assinar digitalmente**.
5. A assinatura fica salva na OS com data e hora.

> [!IMPORTANT]
> O link público mostra a OS ao cliente. Você pode regenerar o código de assinatura se necessário.

## Histórico da OS

A aba **Histórico** mostra a linha do tempo completa:
- Criação da OS
- Cada mudança de status (de → para, quem, quando)
- Assinatura realizada
- Alterações em serviços, produtos ou valores

## Dicas importantes

- **Atualize o status em cada etapa** - a timeline e os relatórios dependem disso.
- **Use "Aguardando peça"** para pausas por falta de material em vez de deixar parado em "Em andamento".
- **Compartilhe a OS** assim que aprovar - o cliente acompanha o andamento e assina online.
- **Só marque como Entregue** quando o cliente realmente retirou/recebeu.

## Perguntas frequentes

**Consigo voltar um status?**
Depende. O sistema permite algumas voltas (ex: "Em andamento" → "Aguardando aprovação") enquanto a OS não chegou a estados finais (Entregue, Cancelada).

**O que fazer se a OS está atrasada?**
Abra a OS, edite a **data prevista de conclusão** e atualize o status. Converse com o cliente pelo link compartilhado.

**O cliente vê o valor na OS compartilhada?**
Sim, o link público mostra a OS completa com serviços, produtos e valores.

**Posso excluir uma OS?**
Sim, via menu de ações. Mas é irreversível. Prefira cancelar (mantém o histórico) em vez de excluir.
`
            },
            {
                id: "perguntas-frequentes-servicos",
                title: "Perguntas frequentes sobre Serviços",
                description: "Respostas rápidas sobre agendamentos, ordens de serviço e catálogo de serviços.",
                slug: "perguntas-frequentes-servicos",
                category: "servicos",
                content: `
## Agendamentos

**Qual a diferença entre agendamento e ordem de serviço?**
Agendamento reserva um horário na agenda do profissional (cliente vem no horário). Ordem de serviço acompanha a execução técnica por etapas, com materiais, diagnóstico e conclusão.

**Posso agendar um serviço sem cadastrar o cliente?**
Sim. Crie o cliente na hora do agendamento (nome e telefone bastam).

**Como bloqueio horários de almoço ou férias?**
Use **Horário indisponível** no calendário. Para almoço diário, crie com recorrência diária.

**O cliente recebe lembrete do agendamento?**
Se tiver WhatsApp/e-mail cadastrado, o sistema envia lembrete automático antes do horário.

**Agendamento recorrente pode ter uma ocorrência alterada?**
Sim. Você pode editar/cancelar uma ocorrência específica sem afetar as demais.

## Ordens de serviço

**Quando devo usar uma OS?**
Quando o serviço tem execução por etapas (manutenção, reparo, instalação) ou quando o equipamento/material fica com você. Para serviços rápidos de balcão, um agendamento ou venda pode bastar.

**Preciso ter agendamento para criar uma OS?**
Não. Você pode criar uma OS do zero em **Ordens de Serviço > Nova OS**.

**O que é "serviço avulso"?**
É um serviço que você digita na hora (nome + preço) sem estar no catálogo. Útil para itens pontuais.

**Como adiciono produtos na OS?**
Na aba **Produtos**, busque produtos do catálogo ou crie avulso. O sistema verifica o estoque.

**Posso aplicar desconto na OS?**
Sim. Na seção de valores, aplique desconto fixo ou percentual, ou use cupom.

## Status da OS

**Quais são os status da OS?**
Aberta → Aguardando aprovação → Aprovada → Em andamento → Aguardando peça → Concluída → Entregue. E Cancelada, se não for realizada.

**Preciso seguir a ordem dos status?**
Sim, normalmente você avança uma etapa por vez. O sistema mostra apenas os próximos status permitidos.

**Posso cancelar uma OS depois de concluída?**
Não depois de entregue. Prefira pensar antes: "Concluída" e "Entregue" são etapas finais.

## Assinatura online

**Como o cliente assina a OS?**
Gere o link público (menu **Compartilhar**), envie para o cliente. Ele visualiza e assina digitalmente. A assinatura fica salva.

**A assinatura online está disponível em todos os planos?**
Está disponível a partir do plano Crescer.

**O cliente precisa criar conta para assinar?**
Não. Ele acessa o link e assina diretamente.

## Recursos e estoque

**O que são "recursos" de um serviço?**
Produtos/materiais que o serviço costuma consumir. Ao usar o serviço, o sistema sugere esses itens para baixar do estoque.

**Posso usar produtos sem estoque na OS?**
O sistema avisa quando o produto está sem estoque. Você pode prosseguir com autorização, dependendo da configuração.

## Preços

**Posso cobrar serviço por hora ou por dia?**
Sim. No cadastro do serviço, escolha a unidade de cobrança: **Por Serviço**, **Por Hora** ou **Por Dia**.

**Como funciona o preço por hora na OS?**
Você informa a quantidade de horas. O sistema calcula preço × horas automaticamente.

---

**Ainda com dúvidas?** Entre em contato com nosso suporte ou consulte o artigo específico sobre o assunto na Central de Ajuda.
`
            }
        ]
    },
    {
        id: "clientes",
        title: "Clientes",
        icon: "👥",
        articles: [
            {
                id: "visao-geral-clientes",
                title: "Visão geral de Clientes",
                description: "Entenda o módulo de Clientes: cadastro, lista, detalhes e integração com vendas e serviços.",
                slug: "visao-geral-clientes",
                category: "clientes",
                content: `
## Visão geral

O módulo **Clientes** é sua base de contatos centralizada. Nele você cadastra, organiza e consulta informações de pessoas físicas e jurídicas que compram seus produtos ou contratam seus serviços.

![Tela principal de Clientes](https://img.dudit.com.br/static/screens/Clientes_VisaoGeral.png)
Legenda: Lista de clientes com abas de status, busca e ações rápidas.

Tudo que você faz aqui reflete nos outros módulos:

- **Vendas e PDV** → cliente selecionado no pedido/orçamento
- **Serviços e Agendamentos** → cliente vinculado ao horário
- **Ordens de Serviço** → cliente dono do equipamento/serviço
- **Entregas** → endereço do cliente como padrão

## O que você encontra no módulo

**Lista de clientes** - visualização em grade (cards) ou tabela, com rolagem infinita. Mostra nome, avatar, total de pedidos, valor gasto, crédito disponível, último pedido e status.

**Abas de status** - Todos · Ativo · Inativo · Bloqueado · Arquivado (cada uma com contador).

**Busca unificada** - encontra por nome, e-mail ou telefone digitando qualquer parte.

**Filtros laterais** - refina por status (checkbox).

**Ordenação** - clique no cabeçalho da coluna: Nome, Pedidos, Total Gasto, Crédito, Status, Último Pedido.

**Ações por cliente** - Ver detalhes · Editar · Arquivar/Desarquivar · Excluir.

**Seleção múltipla** - marque vários para ativar/desativar em massa, excluir ou exportar.

**Importar/Exportar** - planilha .xlsx/.csv com mapeamento inteligente.

## Detalhes do cliente

Ao clicar em um cliente, abre a tela de detalhes com três abas:

| Aba | O que mostra |
|-----|--------------|
| **Dados Gerais** | KPIs (pedidos, total gasto, ticket médio, última compra), dados cadastrais completos, endereços, documentos, observações internas, vales-compra |
| **Pedidos** | Histórico de compras com ID, total, status, canal, data - clique para abrir o pedido |
| **Avaliações** | Reviews recebidos no marketplace (se houver) |

## Status dos clientes

- **Ativo** - aparece nas buscas e seleções normais
- **Inativo** - oculto da seleção padrão, mas mantido no histórico
- **Bloqueado** - impedido de novas compras/agendamentos
- **Arquivado** - removido da lista principal, recuperável quando precisar
- **Excluído** - soft delete (mantém histórico, não aparece mais)

> [!TIP]
> Use **Arquivado** para clientes antigos que não compram mais, mas cujo histórico você quer preservar. Use **Inativo** para pausa temporária. **Bloqueado** é para casos de inadimplência ou restrição.

## Como acessar

1. No menu lateral, clique em **Clientes**.
2. A lista abre na aba **Todos** por padrão.
3. Use as abas, busca, filtros e ordenação para encontrar o que precisa.
4. Clique no cliente para ver detalhes ou use os botões de ação (Editar, Arquivar, Excluir).

## Dicas importantes

- **Cadastre antes de vender** - ter o cliente no sistema agiliza PDV, orçamentos e agendamentos.
- **Preencha CPF/CNPJ** - evita duplicatas e permite emissão de nota fiscal.
- **Use observações internas** - anote preferências, restrições, histórico de conversas; só sua equipe vê.
- **Mantenha endereços atualizados** - essenciais para entregas e notas fiscais.
- **Aproveite a importação** - se tem base antiga em planilha, importe de uma vez (até 2.000 linhas).

## Perguntas frequentes

**Qual a diferença entre Inativo, Bloqueado e Arquivado?**
- **Inativo**: cliente pausado, não aparece na seleção rápida, mas continua existindo.
- **Bloqueado**: impedido de comprar/agendar (ex: inadimplência).
- **Arquivado**: removido da lista principal para organizar; pode ser desarquivado a qualquer momento.

**Posso ter dois clientes com o mesmo CPF/CNPJ?**
Não. O sistema impede CPF/CNPJ duplicado na mesma loja. Se tentar cadastrar, avisará que já existe.

**Cliente arquivado some do histórico de vendas?**
Não. Pedidos, orçamentos, agendamentos e OSs antigos continuam vinculados e visíveis.

**Como faço para ver apenas clientes que compraram nos últimos 30 dias?**
Use a ordenação por **Último Pedido** (decrescente) ou filtre pela aba **Ativo** e ordene por data.

**O que acontece se eu excluir um cliente?**
Vira "Excluído" (soft delete). O histórico de compras/serviços permanece, mas o cliente não aparece mais nas listas nem buscas. Para recuperar, contate o suporte.
`
            },
            {
                id: "como-cadastrar-editar-clientes",
                title: "Como cadastrar e editar clientes",
                description: "Passo a passo completo do formulário: dados pessoais/empresariais, contatos, endereços, observações e imagem.",
                slug: "como-cadastrar-editar-clientes",
                category: "clientes",
                content: `
## Visão geral

Cadastrar um cliente preenche a ficha que será usada em vendas, serviços, entregas e notas fiscais. O formulário tem 3 abas: **Dados Gerais**, **Endereço** e **Observações**.

![Formulário de cadastro - aba Dados Gerais](https://img.dudit.com.br/static/screens/Cliente_Cadastro_DadosGerais.png)
Legenda: Aba Dados Gerais com identificação, dados tributários e contatos.

## Quando utilizar

- Para adicionar um novo cliente à base
- Para atualizar informações de um cliente existente (trocar telefone, endereço, status, etc.)
- Para cadastrar cliente rápido durante uma venda/agendamento (versão simplificada)

## Como fazer

### 1. Abrir o cadastro

**Opção A - Lista de Clientes (completo):**
1. Em **Clientes**, clique em **Novo cliente**.
2. Preencha as 3 abas e salve.

**Opção B - Durante Venda/PDV/Agendamento (rápido):**
1. No seletor de cliente, clique no botão **"+"** ou **"Novo cliente"**.
2. Preencha apenas nome, e-mail e telefone.
3. O cliente é salvo e já selecionado no fluxo atual.

> [!TIP]
> Use a **Opção A** para cadastros completos (com endereço, documentos, observações). Use a **Opção B** para agilizar no balcão/PDV e complete depois na lista de Clientes.

### 2. Aba "Dados Gerais"

#### Identificação
- **Nome ou Razão Social** (obrigatório) - nome que aparecerá em documentos e buscas.
- **Status** - Ativo / Inativo / Bloqueado. Padrão: Ativo.

#### Dados Tributários
**Tipo de pessoa** - escolha no início, muda os campos abaixo:

| Pessoa Física | Pessoa Jurídica |
|---------------|-----------------|
| CPF (validado) | CNPJ (validado + consulta automática) |
| RG | Inscrição Estadual (com opção "Isento") |
| Data de nascimento | Nome Fantasia |
| Nome da mãe | Inscrição Municipal |
| Nome do pai | CRT: 1-Simples / 3-Normal / 4-MEI |
| | Contribuinte: 1-ICMS / 2-Isento / 9-Não contribuinte |

**Consulta CNPJ automática** - ao sair do campo CNPJ (14 dígitos), o sistema busca na Receita Federal e preenche: razão social, nome fantasia, endereço, telefone, e-mail, regime tributário (CRT). Funciona só para PJ.

#### Contatos
- **E-mail** - validado; usado para notas fiscais, comunicações, login no marketplace.
- **Celular (WhatsApp)** - principal; usado para notificações, WhatsApp de aniversário, agendamentos.
- **Telefone Fixo** - opcional.
- **Site** - opcional; validado como URL.

#### Imagem do cliente
- Clique na área da foto para enviar imagem (PNG, JPG, WEBP até 5 MB).
- Recorte quadrado automático.
- Aparece no avatar da lista, detalhes e seleção em vendas/serviços.

### 3. Aba "Endereço"

#### Endereço Principal
1. **CEP** - digite e o sistema preenche rua, bairro, cidade, UF (busca automática).
2. Complete: **Número** (ou marque "S/N"), **Complemento**, **Tipo** (Casa, Apartamento, Comercial, Outro).
3. Este endereço é usado como padrão em entregas e notas fiscais.

#### Endereço de Cobrança (opcional)
- Marque **"Endereço de cobrança diferente"** se a nota fiscal deve ir para outro endereço.
- Preencha os mesmos campos do endereço principal.
- Se desmarcar depois, o endereço de cobrança salvo é removido.

> [!IMPORTANT]
> Endereços são salvos em tabela separada. Um cliente pode ter múltiplos endereços cadastrados via API, mas o formulário mostra/edita apenas o principal e o de cobrança.

### 4. Aba "Observações"

- Campo livre para **anotações internas**.
- Exemplos: "Prefere atendimento pela manhã", "Alergia a látex", "Cliente VIP - dar prioridade", "Não ligar após 18h".
- **Só sua equipe vê** - não aparece para o cliente em nenhum canal.

### 5. Salvar

- Clique em **Salvar** (ou **Salvar e continuar** se estiver editando).
- Validações: nome obrigatório, CPF/CNPJ válidos e únicos, e-mail/telefone/CEP/URL válidos.
- Se houver erro, a aba com erro ganha indicador vermelho e o campo fica destacado.

## Editando um cliente existente

1. Na lista, clique em **Editar** (ícone de lápis) no card/linha do cliente.
2. Ou no detalhe, clique em **Editar cliente**.
3. Altere o que precisar - os mesmos campos e validações do cadastro.
4. Salve.

> [!TIP]
> Ao editar, o sistema mostra o indicador de alterações não salvas. Se sair sem salvar, pergunta se deseja descartar.

## Pessoa Física vs Pessoa Jurídica - resumo prático

| Situação | Use |
|----------|-----|
| Consumidor final, autônomo sem CNPJ | **Pessoa Física** (CPF + RG) |
| Empresa, MEI, loja, prestador com CNPJ | **Pessoa Jurídica** (CNPJ + IE + CRT) |
| Estrangeiro sem CPF/CNPJ brasileiro | Selecione PJ e deixe CNPJ vazio (campo "foreign" interno) |

## Dicas importantes

- **CPF/CNPJ único** - não cadastra duplicado. Se avisar "já existe", busque o cliente existente e edite.
- **Consulta CNPJ** - funciona só para PJ com CNPJ válido de 14 dígitos. Se não encontrar, preencha manualmente.
- **Data de nascimento** - habilita automações de aniversário (cupom, WhatsApp, notificação) no plano Crescer.
- **E-mail** - se o cliente for comprar no marketplace, use o mesmo e-mail da conta dele.
- **Observações** - use para contextualizar a equipe; evite dados sensíveis (LGPD).

## Problemas comuns

| Problema | Causa provável | Solução |
|----------|----------------|---------|
| "CPF inválido" | Dígitos verificadores errados | Confira o CPF; use só números ou formato 000.000.000-00 |
| "CNPJ não encontrado" | CNPJ inexistente ou Receita indisponível | Preencha manualmente; tente novamente depois |
| "Já existe cliente com este CPF/CNPJ" | Duplicata real | Busque o cliente existente e edite |
| "CEP não encontrado" | CEP novo ou digitado errado | Confira no site dos Correios; preencha manualmente |
| Imagem não carrega | Arquivo > 5 MB ou formato não suportado | Use PNG/JPG/WEBP até 5 MB |

## Perguntas frequentes

**Posso cadastrar cliente sem CPF/CNPJ?**
Sim, mas não recomendado. Sem documento, não emite nota fiscal e o sistema não impede duplicatas por nome.

**Como mudo o endereço principal?**
Edite o cliente, vá na aba **Endereço**, altere o CEP e campos, salve.

**O endereço de cobrança aparece na nota fiscal?**
Sim, se preenchido e marcado como diferente. Caso contrário, usa o endereço principal.

**Consigo ver quem editou o cliente por último?**
Não há log de alterações visível na interface. Para auditoria, contate o suporte.

**Posso cadastrar vários telefones/e-mails?**
O formulário tem 1 e-mail, 1 celular e 1 fixo. Para mais contatos, use **Observações** ou cadastre como clientes separados (ex: "Empresa X - Compras", "Empresa X - Financeiro").

**A imagem do cliente aparece no PDV?**
Sim, no seletor de cliente do PDV e na tela de venda.
`
            },
            {
                id: "como-organizar-gerenciar-base-clientes",
                title: "Como organizar e gerenciar sua base de clientes",
                description: "Abas de status, busca, filtros, ordenação, ações em massa, arquivar/desarquivar e exportar.",
                slug: "como-organizar-gerenciar-base-clientes",
                category: "clientes",
                content: `
## Visão geral

A lista de Clientes foi feita para você encontrar, filtrar e agir sobre sua base rapidamente - seja para localizar um contato, fazer uma ação em lote ou exportar dados.

![Lista de Clientes com abas e filtros](https://img.dudit.com.br/static/screens/Clientes_Lista_Filtros.png)
Legenda: Abas de status (Todos, Ativo, Inativo, Bloqueado, Arquivado), busca, filtro lateral e ordenação.

## Quando utilizar

- Para localizar um cliente específico (nome, e-mail, telefone)
- Para ver apenas clientes ativos, inativos ou arquivados
- Para ordenar por maior gasto, mais pedidos, último pedido, etc.
- Para ativar/desativar/excluir vários de uma vez
- Para exportar a base para planilha

## Como fazer

### 1. Navegar pelas abas de status

No topo da lista, clique nas abas:

| Aba | Mostra | Quando usar |
|-----|--------|-------------|
| **Todos** | Ativos + Inativos + Bloqueados (sem arquivados) | Visão geral do dia a dia |
| **Ativo** | Só status "Ativo" | Seleção para vendas/agendamentos |
| **Inativo** | Só status "Inativo" | Reativar clientes pausados |
| **Bloqueado** | Só status "Bloqueado" | Gerenciar restrições |
| **Arquivado** | Só status "Arquivado" | Recuperar clientes antigos |

Cada aba mostra um **contador** ao lado do nome.

### 2. Buscar cliente

Digite no campo **Buscar** (canto superior direito):
- Parte do **nome** ("joão", "silva", "empresa")
- **E-mail** completo ou parcial ("@gmail", "joao@")
- **Telefone** com ou sem formatação ("1199999", "(11) 99999-9999")

A busca é **instantânea** (debounced) e filtra todas as colunas visíveis.

### 3. Filtrar por status (painel lateral)

1. Clique no ícone de **Filtro** (funil) ao lado da busca.
2. Marque/desmarque os status desejados (checkbox).
3. O painel mostra só os status que existem na sua base.
4. Clique em **Limpar filtros** para voltar ao padrão.

> [!TIP]
> Combine **aba** + **filtro**: ex: aba "Todos" + filtro "Bloqueado" = vê só bloqueados entre os não-arquivados.

### 4. Ordenar a lista

Clique no **cabeçalho da coluna** na visualização tabela:

| Coluna | Ordena por |
|--------|------------|
| **Cliente** | Nome A–Z / Z–A |
| **Pedidos** | Quantidade de pedidos (maior/menor) |
| **Total Gasto** | Valor total gasto (maior/menor) |
| **Crédito** | Saldo de vale-compra (maior/menor) |
| **Status** | Alfabético do status |
| **Último Pedido** | Data mais recente/antiga |

Clique novamente na mesma coluna para inverter (asc/desc). Uma seta indica a direção.

### 5. Alternar visualização

- **Lista (tabela)** - padrão no desktop; mais colunas, ordenação, seleção em massa.
- **Grade (cards)** - padrão no mobile/tablet; mostra avatar, nome, pedidos, total gasto, status.
- Botão no canto superior direito alterna entre as duas.

### 6. Ações em um cliente (individual)

Passe o mouse sobre a linha (tabela) ou use o menu ⋮ no card (grade):

- **Ver detalhes** - abre tela completa com histórico, pedidos, vales, endereços.
- **Editar** - abre formulário de cadastro preenchido.
- **Arquivar** - move para aba "Arquivado" (sai das listas normais).
- **Desarquivar** - volta para "Ativo" (disponível só na aba Arquivado).
- **Excluir** - soft delete; mantém histórico, remove da base. Confirmação obrigatória.

### 7. Ações em massa (vários clientes)

1. Marque a **checkbox** na primeira coluna (tabela) ou segure/ative seleção múltipla (grade).
2. Selecione quantos quiser - contador na barra flutuante inferior.
3. Escolha a ação na **Barra Flutuante**:
   - **Ativar / Desativar** - alterna status entre Ativo ↔ Inativo para todos selecionados.
   - **Excluir** - soft delete em lote (confirmação com contador).
4. Ou use **Exportar** → "Selecionados" para baixar só os marcados.

> [!IMPORTANT]
> **Arquivar** não está na ação em massa - faça individualmente para confirmar cada um.

### 8. Exportar clientes

Dois caminhos:

**Exportar tudo (com filtros atuais):**
1. Clique em **Exportar** no cabeçalho.
2. Escolha colunas (padrão: todas visíveis + algumas extras).
3. Formato: **.xlsx** (Excel).
4. O arquivo baixa com os clientes que estão na lista respeitando aba, busca, filtro e ordenação atuais.

**Exportar seleção:**
1. Marque os clientes desejados.
2. Na barra flutuante, clique **Exportar** → "Selecionados".

> [!TIP]
> Use exportação para: backup periódico, enviar para contador, criar mala direta, analisar no Excel.

### 9. Importar clientes (planilha)

1. No cabeçalho, clique **Importar** (ou acesse \`/erp/clientes/importar\`).
2. **Passo 1 - Upload:** arraste .xlsx, .xls ou .csv (até 10 MB, 2.000 linhas).
3. **Passo 2 - Mapeamento:** o sistema sugere mapear colunas da planilha para campos do cadastro (nome, e-mail, CPF, etc.). Cada coluna tem **confiança** (Exato/Alto/Médio/Baixo). Ajuste o que precisar.
4. **Passo 3 - Preview:** veja os primeiros clientes como ficarão. Confira.
5. **Importar:** opções "Pular duplicatas" (por CPF/CNPJ/e-mail) e "Pular erros". Clique **Importar**.

![Importação - etapa de mapeamento](https://img.dudit.com.br/static/screens/Clientes_Importacao_Mapeamento.png)
Legenda: Mapeamento de colunas com indicador de confiança.

## Dicas importantes

- **Mantenha a aba "Ativo" como padrão** - é a que o PDV e agendamentos usam para busca rápida.
- **Arquive, não exclua** - cliente arquivado some da lista mas volta com 1 clique. Excluído some de vez.
- **Use ordenação "Total Gasto" desc** - identifica seus melhores clientes (top 20% = 80% da receita).
- **Combine busca + aba** - ex: aba "Inativo" + busca "joão" = acha "João" inativo rápido.
- **Exporte antes de importar em massa** - faz backup da base atual.
- **Limpe duplicatas antes de importar** - a opção "Pular duplicatas" usa CPF/CNPJ/e-mail como chave.

## Problemas comuns

| Problema | Causa | Solução |
|----------|-------|---------|
| Cliente não aparece na busca | Está arquivado ou inativo | Mude para aba "Todos" ou "Arquivado"/"Inativo" |
| Ordenação não funciona | Visualização em grade (cards) | Mude para **Lista (tabela)** - ordenação só funciona lá |
| Exportação vem vazia | Filtro muito restritivo | Limpe filtros/aba/busca antes de exportar |
| Importação falha em algumas linhas | CPF/CNPJ inválido ou duplicado | Ative "Pular erros" e "Pular duplicatas"; revise planilha |
| Não consegue desarquivar | Limite do plano atingido | Upgrade do plano ou exclua/arquive outros para abrir vaga |

## Perguntas frequentes

**Quantos clientes posso cadastrar?**
Depende do seu plano. O sistema avisa quando atingir o limite. Clientes arquivados não contam para o limite.

**Posso restaurar um cliente excluído?**
Excluído é soft delete (não aparece mais). Para restaurar, contate o suporte técnico.

**A importação atualiza clientes existentes?**
Não. A importação só **cria novos**. Se encontrar CPF/CNPJ/e-mail já cadastrado, pula (se "Pular duplicatas" ligado) ou dá erro. Para atualizar em massa, edite individualmente ou use API.

**Como vejo clientes que não compram há 6 meses?**
Ordene por **Último Pedido** (ascendente) na aba "Ativo". Os sem data ficam no final. Ou exporte e filtre no Excel.

**Posso criar listas/tag personalizadas?**
Não há tags nativas. Use **Observações** no cadastro (ex: "TAG: VIP", "TAG: Revenda") e busque por "TAG: VIP" na busca global.

**A busca acha por observações?**
Não. Busca só nome, e-mail e telefone. Para achar por observação, use a exportação e filtre no Excel.
`
            },
            {
                id: "como-consultar-historico-cliente",
                title: "Como consultar informações e histórico do cliente",
                description: "Acesse detalhes, veja KPIs, histórico de pedidos, serviços relacionados e informações importantes.",
                slug: "como-consultar-historico-cliente",
                category: "clientes",
                content: `
## Visão geral

A tela de **Detalhes do Cliente** centraliza tudo o que você precisa saber sobre um contato: dados cadastrais, indicadores de compra, histórico de pedidos, vales-compra, endereços e observações da equipe.

![Tela de detalhes do cliente](https://img.dudit.com.br/static/screens/Cliente_Detalhes_VisaoGeral.png)
Legenda: Aba Dados Gerais com KPIs, informações cadastrais, endereços e vales-compra.

## Quando utilizar

- Para ver o perfil completo de um cliente antes de atender
- Para consultar histórico de compras (pedidos, valores, status)
- Para conferir endereços, documentos e observações internas
- Para verificar vales-compra disponíveis
- Para acessar pedidos e serviços vinculados

## Como fazer

### 1. Abrir os detalhes

**Da lista de Clientes:**
- Visualização **Tabela**: clique na linha ou no botão **Ver detalhes** (ícone de olho)
- Visualização **Grade (cards)**: clique no card ou no menu ⋮ > **Ver detalhes**

**De outros módulos:**
- Em Vendas/PDV/Orçamentos: clique no nome do cliente já selecionado
- Em Serviços/Agendamentos/OS: clique no cliente no detalhe do agendamento/OS

### 2. Aba "Dados Gerais" - Visão 360°

#### KPIs do cliente (topo)
| Indicador | O que mostra |
|-----------|--------------|
| **Pedidos** | Total de pedidos não cancelados |
| **Total Gasto** | Soma dos valores (pedidos pagos/entregues) |
| **Valor médio** | Total Gasto ÷ Pedidos |
| **Última Compra** | Data do pedido mais recente |

> [!TIP]
> Use esses números para classificar o cliente: "Top 10%", "Cliente em risco (sem compra > 90 dias)", "Novo (1º pedido)".

#### Dados cadastrais
- Nome, status (badge colorido), tipo (PF/PJ), ID curto (#ABC12)
- CPF ou CNPJ (formatado)
- Data de nascimento (se preenchida)
- E-mail, celular, telefone fixo, site
- **Cliente desde** - data do primeiro cadastro

#### Endereços
- **Endereço principal** - usado em entregas e notas fiscais
- **Endereço de cobrança** - se diferente do principal (aparece separado)

#### Observações internas
- Caixa laranja com anotações da equipe (ex: "Prefere WhatsApp", "Alérgico a látex")
- Só sua equipe vê - não vai para o cliente

#### Vales-compra (Crédito da loja)
Lista de vales gerados para este cliente:
- **Valor original** / **Utilizado** / **Restante**
- **Status**: Disponível (verde) · Utilizado (cinza) · Expirado (vermelho)
- Data de criação e validade (se houver)
- Clique para ver detalhes do vale

![Vales-compra no detalhe](https://img.dudit.com.br/static/screens/Cliente_ValesCompra.png)
Legenda: Lista de vales-compra com saldo restante e status.

### 3. Aba "Pedidos" - Histórico de compras

Tabela com todos os pedidos do cliente (não cancelados), ordenados do mais recente para o mais antigo:

| Coluna | Descrição |
|--------|-----------|
| **Pedido** | ID curto (#ABC12) - clique para abrir o pedido |
| **Total** | Valor do pedido |
| **Status** | Pago, Pendente, Enviado, Entregue, Cancelado, etc. |
| **Canal** | Manual, PDV, Marketplace, Loja Virtual, etc. |
| **Data** | Data e hora da criação |

**Ações:**
- Clique no **ID do pedido** → abre tela de detalhes do pedido
- Ordene clicando nos cabeçalhos (Data, Total, Status, Canal)
- Paginação automática (8 por página)

> [!IMPORTANT]
> A aba **Pedidos** agrega pedidos feitos pelo \`customer_id\` do ERP **OU** pelo \`user_id\`/\`marketplace_user_id\` vinculados (conta do cliente no marketplace). Por isso, compras feitas pelo cliente logado no site também aparecem aqui.

### 4. Aba "Avaliações" - Reviews do Marketplace

Se o cliente avaliou produtos/loja no marketplace, aparecem aqui:
- Estrelas (1 a 5)
- Comentário
- Data
- Produto avaliado

### 5. Card de Aniversário (quando aplicável)

Se o cliente tem **data de nascimento** cadastrada e o aniversário é **hoje** ou **próximos dias**, um card roxo destaca no topo (aba Dados Gerais, desktop) ou no início (mobile/tablet):

**Ações rápidas (plano Crescer):**
- **Criar cupom** → gera cupom de aniversário e abre tela de Cupons
- **Enviar WhatsApp** → abre wa.me com mensagem pronta + cupom
- **Enviar notificação** → push/app para o cliente (1x por ano)

## Dicas importantes

- **KPIs ajudam na abordagem** - cliente com "Total Gasto alto + Última compra antiga" = reativação
- **Vales-compra** - antes de fechar venda, confira se o cliente tem saldo disponível
- **Observações** - leia antes de ligar/visitar; evita repetir informações
- **Endereço de cobrança** - confira se nota fiscal deve ir para endereço diferente
- **Pedidos do marketplace** - aparecem junto dos manuais; filtre pelo canal se precisar separar

## Problemas comuns

| Problema | Causa | Solução |
|----------|-------|---------|
| Pedido não aparece no histórico | Feito com e-mail/CPF diferente do cadastrado | Verifique se \`marketplace_user_id\` ou \`user_id\` estão vinculados no cadastro |
| Vale-compra não aparece | Status "Expirado" ou "Utilizado" integralmente | Filtre por status; expirados não somam no saldo |
| Aniversário não destaca | Data de nascimento não preenchida | Edite o cliente e preencha a data |
| KPIs zerados | Cliente nunca fez pedido pelo ERP | Compras só no marketplace antigo podem não agregar; contate suporte |

## Perguntas frequentes

**Posso ver agendamentos e ordens de serviço do cliente aqui?**
Não diretamente nesta tela. Em **Serviços > Agendamentos** ou **Ordens de Serviço**, use a busca pelo nome do cliente para filtrar os dele.

**O "Total Gasto" inclui pedidos cancelados?**
Não. Só pedidos com situação diferente de "cancelado".

**Como sei se o cliente tem vale-compra disponível?**
Na aba Dados Gerais, a seção **Vales-compra** mostra badges: verde = disponível, cinza = usado, vermelho = expirado. O badge no topo da seção mostra o saldo total.

**Consigo editar o cliente a partir dos detalhes?**
Sim, botão **Editar cliente** no cabeçalho (desktop) ou no menu de ações (mobile).

**O cliente vê as observações internas?**
Não. Observações são só para sua equipe.
`
            },
            {
                id: "importar-exportar-clientes",
                title: "Importar e exportar clientes",
                description: "Migre sua base por planilha (upload, mapeamento, preview) e exporte para backup ou análise.",
                slug: "importar-exportar-clientes",
                category: "clientes",
                content: `
## Visão geral

A **importação** traz clientes de planilhas (.xlsx, .xls, .csv) em lote - ideal para migração de sistema antigo ou cadastro inicial. A **exportação** baixa a base atual para Excel - útil para backup, análise ou envio ao contador.

![Importação - tela de upload](https://img.dudit.com.br/static/screens/Clientes_Importacao_Upload.png)
Legenda: Arraste a planilha ou clique para selecionar (até 10 MB, 2.000 linhas).

## Quando utilizar

**Importar:**
- Migração de outro sistema/planilha
- Cadastro inicial em massa
- Atualização periódica de lista externa (ex: leads de marketing)

**Exportar:**
- Backup periódico da base
- Análise no Excel (filtros avançados, tabelas dinâmicas)
- Envio para contador/parceiro
- Mala direta / segmentação externa

## Como importar

### 1. Preparar a planilha

**Formatos aceitos:** .xlsx (recomendado), .xls, .csv
**Limites:** até **10 MB** e **2.000 linhas** por importação
**Colunas sugeridas (cabeçalhos):**

| Coluna na planilha | Campo no sistema | Obrigatório? |
|--------------------|------------------|--------------|
| Nome / Razão Social | name | Sim |
| E-mail | email | Não |
| Celular / WhatsApp | phone | Não |
| Telefone Fixo | phone_fixed | Não |
| CPF | cpf | PF: sim |
| CNPJ | cnpj | PJ: sim |
| RG | rg | Não |
| IE / Inscrição Estadual | inscricao_estadual | PJ: não |
| Nome Fantasia | nome_fantasia | PJ: não |
| Inscrição Municipal | inscricao_municipal | Não |
| CRT (1/3/4) | crt | PJ: não |
| Contribuinte (1/2/9) | contribuinte | PJ: não |
| CEP | zip_code | Não |
| Endereço / Rua | street | Não |
| Número | number | Não |
| Complemento | complement | Não |
| Bairro | neighborhood | Não |
| Cidade | city | Não |
| UF / Estado | state | Não |
| Tipo Endereço (Casa/Apto/Comercial) | address_type | Não |
| Data Nascimento | birth_date | Não |
| Observações | notes | Não |
| Status (Ativo/Inativo/Bloqueado) | status | Não |
| Tipo Pessoa (PF/PJ) | person_type | Não |

> [!TIP]
> Não precisa ter todas as colunas. O sistema mapeia o que você enviar. Colunas não mapeadas são ignoradas.

### 2. Fazer o upload

1. Em **Clientes**, clique em **Importar** (botão no cabeçalho).
2. Arraste o arquivo ou clique em **Selecionar Planilha**.
3. Aguarde a leitura - mostra total de linhas e colunas detectadas.

### 3. Revisar o mapeamento

O sistema sugere mapear cada coluna da planilha para um campo do cadastro:

- **Confiança** - badge colorido: **Exato** (verde) · **Alto** (azul) · **Médio** (laranja) · **Baixo** (vermelho)
- Ajuste manualmente se o sistema errou
- Colunas sem mapeamento = **Ignorada** (não importa)

![Importação - mapeamento](https://img.dudit.com.br/static/screens/Clientes_Importacao_Mapeamento.png)
Legenda: Cada linha = coluna da planilha. Escolha o campo do sistema no dropdown.

**Campos obrigatórios do sistema** (marcados com * no dropdown): \`Nome\`, \`CPF\` (se PF), \`CNPJ\` (se PJ).

### 4. Preview e importar

1. Clique **Continuar** → abre **Preview** com os primeiros clientes como ficarão.
2. Confira: nomes, documentos, e-mails, endereços.
3. Opções antes de importar:
   - **Pular duplicatas** (recomendado ON) - ignora linhas com CPF/CNPJ/e-mail já cadastrados
   - **Pular erros** (recomendado ON) - importa o que der certo, pula linhas com erro de validação
4. Clique **Importar X cliente(s)**.

### 5. Resultado

Tela de sucesso mostra: **X de Y clientes importados**.
- Botão **Ver Clientes** → volta para lista
- Botão **Nova Importação** → repete o processo

## Como exportar

### Exportar tudo (com filtros atuais)

1. Na lista de Clientes, clique **Exportar** no cabeçalho.
2. Modal abre com seleção de colunas (todas marcadas por padrão).
3. Desmarque colunas que não quer (ex: \`mother_name\`, \`father_name\`).
4. Clique **Exportar** → baixa \`.xlsx\`.

> [!TIP]
> A exportação respeita **aba ativa**, **busca**, **filtros** e **ordenação** atuais. Para exportar só ativos: aba "Ativo" > Exportar.

### Exportar seleção

1. Marque clientes na tabela (checkbox) ou grade (seleção múltipla).
2. Na **barra flutuante inferior**, clique **Exportar** > **Selecionados**.
3. Escolhe colunas > **Exportar**.

## Dicas importantes

- **Exporte antes de importar em massa** - backup da base atual.
- **Limpe a planilha antes** - remova linhas vazias, corrija CPF/CNPJ inválidos, padronize telefone (DDD + número).
- **Use "Pular duplicatas"** - evita erro se rodar a importação duas vezes.
- **CPF/CNPJ são chaves únicas** - o sistema usa eles (e e-mail) para detectar duplicatas.
- **Importação só CRIA** - não atualiza clientes existentes. Para atualizar em massa, edite individualmente ou use API.
- **Endereços** - a importação cria endereço principal; endereço de cobrança diferente não é suportado na importação (cadastre depois manualmente).

## Problemas comuns

| Problema | Causa | Solução |
|----------|-------|---------|
| "Erro ao processar arquivo" | Arquivo corrompido, senha, ou formato não suportado | Salve como .xlsx padrão; remova senha; evite .ods |
| Linhas não importadas | Validação falhou (CPF inválido, e-mail malformado) | Ative "Pular erros"; revise linhas no preview; corrija planilha |
| Duplicatas não puladas | CPF/CNPJ com formatação diferente (pontos/tracos) | O sistema normaliza (só números); confira se realmente igual |
| Exportação vazia | Filtro/aba restritiva demais | Limpe busca, filtros, mude para aba "Todos" |
| Planilha > 2.000 linhas | Limite de segurança | Divida em vários arquivos de ≤ 2.000 linhas |

## Perguntas frequentes

**Posso importar clientes com endereço de cobrança diferente?**
Não na importação padrão. Importe o endereço principal; depois edite cada cliente e marque "Endereço de cobrança diferente".
`
            },
            {
                id: "clientes-em-outros-modulos",
                title: "Clientes em Vendas, Serviços e outros módulos",
                description: "Como selecionar, criar e usar clientes no PDV, Vendas, Orçamentos, Serviços, Agendamentos e OS.",
                slug: "clientes-em-outros-modulos",
                category: "clientes",
                content: `
## Visão geral

O cadastro de clientes não fica isolado - ele alimenta **Vendas, PDV, Orçamentos, Serviços, Agendamentos, Ordens de Serviço e Entregas**. Entender como o cliente é selecionado e criado nesses fluxos agiliza o dia a dia.

![Seletor de cliente no PDV](https://img.dudit.com.br/static/screens/Cliente_Seletor_PDV.png)
Legenda: Seletor de cliente com busca, fixados e botão de novo cliente rápido.

## Quando utilizar

- Para vincular cliente a uma venda, orçamento, pedido ou serviço
- Para criar cliente rápido durante o atendimento (sem sair do fluxo)
- Para usar endereço do cliente como padrão em entrega
- Para consultar histórico do cliente enquanto atende

---

## Fluxo comum: Seletor de Cliente

Na maioria dos módulos (Vendas, PDV, Orçamentos, Serviços, Agendamentos, OS), ao iniciar um novo atendimento, abre o **Seletor de Cliente** com:

1. **Busca** - digite nome, e-mail ou telefone; filtra em tempo real
2. **Fixados / Recentes** - clientes marcados como favoritos ou usados recentemente aparecem no topo
3. **Lista completa** - todos os clientes ativos (rolagem infinita)
4. **Botão "Novo cliente" (+)** - cria cliente rápido (nome, e-mail, telefone)
5. **Botão "Remover"** - limpa seleção (venda para consumidor final)

> [!TIP]
> O seletor **só mostra clientes com status "Ativo"**. Inativos, bloqueados e arquivados não aparecem. Para usar um inativo, reative antes na lista de Clientes.

---

## Vendas / PDV / Orçamentos

### Selecionar cliente existente
1. Inicie **Nova Venda**, **Novo Pedido** ou **Novo Orçamento**.
2. No campo **Cliente**, clique para abrir o seletor.
3. Busque ou escolha da lista de fixados/recentes.
4. Cliente selecionado → nome aparece no cabeçalho da venda.

### Criar cliente rápido (durante a venda)
1. No seletor, clique no botão **"+"** (Novo cliente).
2. Preencha: **Nome** (obrigatório), **E-mail**, **Telefone**.
3. Salva → cliente criado com status **Ativo**, tipo **Pessoa Física** (padrão), sem endereço/documentos.
4. Cliente já fica selecionado na venda.

> [!IMPORTANT]
> Cliente rápido **não tem CPF/CNPJ, endereço, dados fiscais**. Complete depois em **Clientes > Editar** se for emitir nota fiscal.

### Consumidor final (sem cliente)
- Clique **Remover** (X) no cliente selecionado.
- Venda fica como "Consumidor final" - não vincula a ninguém, não exige CPF na nota (exceto se valor > limite legal).

### Endereço de entrega
- Se o cliente tem **endereço principal** cadastrado, ele pré-preenche o endereço de entrega da venda.
- Pode alterar na hora (não salva no cadastro do cliente).

---

## Serviços / Agendamentos

### Agendar com cliente
1. Em **Agendamentos > Novo agendamento**.
2. Etapa **Cliente** - abra seletor, escolha ou crie rápido.
3. Cliente selecionado → aparece no card do agendamento no calendário.
4. No dia do atendimento, clique no agendamento > **Ver detalhes do cliente** abre a ficha completa.

### Cliente no agendamento recorrente
- Cliente fixo toda semana? Crie agendamento **recorrente semanal** com o mesmo cliente.
- O sistema replica o agendamento mantendo o cliente vinculado.

---

## Ordens de Serviço (OS)

### Criar OS para cliente
1. Em **Ordens de Serviço > Nova OS**.
2. Campo **Cliente** - seletor padrão (busca, fixados, novo rápido).
3. Cliente vinculado → aparece no cabeçalho da OS.
4. **Endereço principal** do cliente pré-preenche o endereço da OS (se for visita técnica).

### Histórico de OS do cliente
- No detalhe do cliente, **não há aba de OS** diretamente.
- Para ver OSs do cliente: vá em **Ordens de Serviço** > use a busca pelo nome do cliente.

---

## Entregas

### Endereço do cliente como padrão
1. Ao criar **Nova Entrega** (ou no fluxo de venda com entrega), o campo **Endereço** busca no cadastro do cliente.
2. Se cliente tem endereço principal → preenche automaticamente.
3. Se tem **endereço de cobrança diferente** → use o botão "Usar endereço de cobrança" se aplicável.

---

## Marketplace / Vitrine

### Cliente logado no site
- Quando cliente compra logado na vitrine/marketplace, o sistema **vincula automaticamente** o \`marketplace_user_id\` ao cadastro do cliente (pelo e-mail).
- Pedidos feitos logados aparecem no **histórico do cliente** (aba Pedidos no detalhe).
- Avaliações (reviews) do cliente aparecem na aba **Avaliações**.

### Cupons de aniversário
- Cupom gerado no card de aniversário → fica disponível para o cliente usar no checkout do marketplace.
- Cliente recebe via WhatsApp/notificação e aplica no carrinho.

---

## Dicas importantes

- **Sempre selecione o cliente** antes de fechar venda/OS - garante histórico, nota fiscal correta, endereço de entrega e vales-compra.
- **Cliente rápido = complete depois** - nome+e-mail+telefone resolve na hora; volte em Clientes para por CPF, endereço, dados fiscais.
- **Fixados** - marque clientes frequentes como fixados (estrela no seletor) para aparecerem no topo.
- **Consumidor final** - use só para vendas rápidas de balcão sem nota fiscal nominal.
- **Endereço de entrega** - alterar na venda **não altera** o cadastro do cliente. Para mudar definitivo, edite em Clientes.

## Problemas comuns

| Problema | Causa | Solução |
|----------|-------|---------|
| Cliente não aparece no seletor | Status Inativo/Bloqueado/Arquivado | Ative/desarquive em Clientes |
| Cliente rápido não emite nota fiscal | Falta CPF/CNPJ e endereço | Edite o cliente depois e complete dados fiscais |
| Endereço de entrega não preenche | Cliente sem endereço principal | Cadastre endereço na aba Endereço do cliente |
| Pedido do site não aparece no histórico | Cliente não logou ou e-mail diferente | Verifique se \`marketplace_user_id\` está vinculado no cadastro |
| Vale-compra não aparece no PDV | Status não é "Disponível" | Confira no detalhe do cliente; só disponíveis somam |

## Perguntas frequentes

**Posso obrigar seleção de cliente em toda venda?**
Não há configuração nativa para obrigar. Treine a equipe. Para nota fiscal, sem cliente = consumidor final (limite de valor sem CPF).

**Cliente criado no PDV aparece na lista de Clientes?**
Sim, imediatamente. Status Ativo, tipo Pessoa Física, sem documento/endereço.

**Consigo ver o limite de crédito do cliente na venda?**
Não há "limite de crédito" nativo. Use **Vales-compra** como crédito pré-pago. Para pós-pago (faturamento), controle externo ou observação interna.

**Como vinculo um cliente do marketplace ao ERP?**
Automático: se e-mail do pedido logado = e-mail do cliente no ERP, o sistema vincula \`marketplace_user_id\`. Se não vinculou, edite o cliente e confira se e-mails batem.

**Posso ter preços diferentes por cliente?**
Não há tabela de preços por cliente nativa. Use **cupons personalizados** ou **observação interna** com "Preço especial: X%".
`
            },
            {
                id: "perguntas-frequentes-clientes",
                title: "Perguntas frequentes sobre Clientes",
                description: "Respostas rápidas sobre cadastro, organização, histórico, importação, recursos e integração.",
                slug: "perguntas-frequentes-clientes",
                category: "clientes",
                content: `
## Cadastro e edição

**Posso cadastrar cliente sem CPF/CNPJ?**
Sim, mas não recomendado. Sem documento, não emite nota fiscal nominal e o sistema não impede duplicatas por nome.

**Qual a diferença entre Pessoa Física e Pessoa Jurídica no cadastro?**
**PF:** CPF, RG, data de nascimento, nome da mãe/pai. **PJ:** CNPJ (com consulta automática), IE, nome fantasia, inscrição municipal, CRT, contribuinte. O tipo muda os campos exibidos.

**Como funciona a consulta CNPJ automática?**
Ao digitar CNPJ válido (14 dígitos) e sair do campo, o sistema consulta a Receita Federal e preenche: razão social, nome fantasia, endereço, telefone, e-mail, regime tributário (CRT). Funciona só para PJ.

**Posso alterar o tipo de pessoa depois de cadastrado?**
Sim, edite o cliente e mude "Tipo de pessoa". Os campos se adaptam (PF ↔ PJ). Dados do tipo anterior ficam salvos mas ocultos.

**O que acontece se eu deixar de preencher campos obrigatórios?**
O sistema destaca a aba e o campo em vermelho e não permite salvar até corrigir.

---

## Status e organização

**Qual a diferença entre Inativo, Bloqueado e Arquivado?**
- **Inativo:** pausa temporária, não aparece na seleção de vendas/agendamentos.
- **Bloqueado:** impedido de comprar/agendar (ex: inadimplência).
- **Arquivado:** removido da lista principal para organizar; recuperável com 1 clique.

**Cliente arquivado some do histórico de vendas?**
Não. Pedidos, orçamentos, agendamentos e OSs antigos continuam vinculados e visíveis nos detalhes.

**Como reativo um cliente arquivado?**
Vá na aba **Arquivado**, clique em **Desarquivar** no menu do cliente. Volta para "Ativo".

**Posso excluir um cliente permanentemente?**
Excluir faz **soft delete** - some das listas e buscas, mas histórico permanece. Para restaurar, contate o suporte.

**Quantos clientes posso cadastrar?**
Depende do seu plano. Clientes arquivados **não contam** para o limite. O sistema avisa ao atingir.

---

## Busca, filtros e exportação

**A busca acha por observações internas?**
Não. Busca só por **nome, e-mail e telefone**. Para achar por observação, exporte para Excel e filtre lá.

**Como exporto apenas clientes ativos?**
Clique na aba **Ativo** > botão **Exportar**. A exportação respeita a aba/visão atual.

**A importação atualiza clientes existentes?**
Não. Importação **só cria novos**. Se CPF/CNPJ/e-mail já existe, pula (se "Pular duplicatas" ligado) ou erro. Para atualizar em massa, edite individualmente.

**Qual o limite da importação?**
Até **10 MB** e **2.000 linhas** por arquivo. Divida bases maiores em vários arquivos.

**Posso importar endereço de cobrança diferente?**
Não na importação padrão. Importe o endereço principal; depois edite cada cliente e marque "Endereço de cobrança diferente".

---

## Histórico e detalhes

**O "Total Gasto" inclui pedidos cancelados?**
Não. Só pedidos com situação diferente de "cancelado".

**Pedidos feitos no site (marketplace) aparecem no histórico?**
Sim, se o cliente fez login e o e-mail bate com o cadastro do ERP. O sistema vincula automaticamente via \`marketplace_user_id\`.
- **Cliente rápido = complete depois** - nome+e-mail+telefone resolve na hora; volte em Clientes para por CPF, endereço, dados fiscais.
- **Fixados** - marque clientes frequentes como fixados (estrela no seletor) para aparecerem no topo.
- **Consumidor final** - use só para vendas rápidas de balcão sem nota fiscal nominal.
- **Endereço de entrega** - alterar na venda **não altera** o cadastro do cliente. Para mudar definitivo, edite em Clientes.

## Problemas comuns

| Problema | Causa | Solução |
|----------|-------|---------|
| Cliente não aparece no seletor | Status Inativo/Bloqueado/Arquivado | Ative/desarquive em Clientes |
| Cliente rápido não emite nota fiscal | Falta CPF/CNPJ e endereço | Edite o cliente depois e complete dados fiscais |
| Endereço de entrega não preenche | Cliente sem endereço principal | Cadastre endereço na aba Endereço do cliente |
| Pedido do site não aparece no histórico | Cliente não logou ou e-mail diferente | Verifique se \`marketplace_user_id\` está vinculado no cadastro |
| Vale-compra não aparece no PDV | Status não é "Disponível" | Confira no detalhe do cliente; só disponíveis somam |

## Perguntas frequentes

**Posso obrigar seleção de cliente em toda venda?**
Não há configuração nativa para obrigar. Treine a equipe. Para nota fiscal, sem cliente = consumidor final (limite de valor sem CPF).

**Cliente criado no PDV aparece na lista de Clientes?**
Sim, imediatamente. Status Ativo, tipo Pessoa Física, sem documento/endereço.

**Consigo ver o limite de crédito do cliente na venda?**
Não há "limite de crédito" nativo. Use **Vales-compra** como crédito pré-pago. Para pós-pago (faturamento), controle externo ou observação interna.

**Como vinculo um cliente do marketplace ao ERP?**
Automático: se e-mail do pedido logado = e-mail do cliente no ERP, o sistema vincula \`marketplace_user_id\`. Se não vinculou, edite o cliente e confira se e-mails batem.

**Posso ter preços diferentes por cliente?**
Não há tabela de preços por cliente nativa. Use **cupons personalizados** ou **observação interna** com "Preço especial: X%".
`
            },
        ]
    },
    {
        id: "financeiro",
        title: "Financeiro",
        icon: "💰",
        articles: [
            {
                id: "visao-geral-financeiro",
                title: "Visão geral de Financeiro",
                description: "Entenda o módulo Financeiro: transações, contas, categorias e integração com os demais módulos.",
                slug: "visao-geral-financeiro",
                category: "financeiro",
                content: `
## Visão geral

O módulo **Financeiro** centraliza todo o dinheiro que entra e sai do seu negócio. Nele você acompanha pagamentos e recebimentos, controla contas bancárias e em dinheiro, organiza tudo em categorias e tira relatórios para decidir com segurança.

![Tela principal de Financeiro](https://img.dudit.com.br/static/screens/Financeiro_VisaoGeral.png)
Legenda: Lista de transações com abas de situação, busca, filtros e resumo de valores.

Tudo que acontece nos outros módulos reflete aqui automaticamente:

- **Vendas e PDV** → recebimentos de vendas
- **Serviços, agendamentos e Ordens de Serviço** → recebimentos de serviços
- **Compras e despesas** → contas a pagar
- **Comissões e metas** → lançamentos gerados pelo sistema
- **Marketplace e assinaturas (Mercado Pago)** → recebimentos de vendas online

## O que você encontra no módulo

**Lista de transações** - cada linha é um lançamento com descrição, categoria, contato, data de vencimento, forma de pagamento, status e valor. Clique em qualquer uma para ver os detalhes.

**Abas de situação** - cinco abas organizam os lançamentos:

| Aba | O que mostra |
|-----|--------------|
| **Transações** | Todos os lançamentos do período |
| **A pagar** | O que você deve pagar (saídas em aberto) |
| **A receber** | O que você deve receber (entradas em aberto) |
| **Vencidos** | Lançamentos com data de vencimento passada e sem baixa |
| **Cancelados** | Lançamentos que foram cancelados |

**Resumo por aba** - cada aba mostra o total pendente, vencido e concluído, facilitando saber quanto está em aberto.

**Busca e filtros** - encontre lançamentos por descrição, categoria, contato, forma de pagamento, data e valor.

**Tipos de lançamento** - ao criar, você escolhe um dos cinco tipos: **Entrada**, **Saída**, **Transferência**, **Ajuste** ou **Reembolso**.

## Como acessar

1. No menu lateral, clique em **Financeiro**.
2. A lista abre na aba **Transações** por padrão.
3. Use as abas, busca e filtros para encontrar o que precisa.
4. Clique em **Nova transação** para lançar entrada, saída, transferência, ajuste ou reembolso.

## Dicas importantes

- **Cadastre suas contas e categorias antes de lançar** - facilita a organização e os relatórios.
- **Use as abas A pagar e A receber** para saber exatamente o que vence no mês.
- **Confira a aba Vencidos** com frequência para evitar juros e cobranças atrasadas.
- **Aproveite as transações automáticas** - vendas, comissões e assinaturas já entram sozinhas no financeiro.

## Perguntas frequentes

**O que aparece na aba Transações?**
Todos os lançamentos do período, incluindo entradas, saídas, transferências, ajustes e reembolsos.

**Vendas feitas no PDV entram no Financeiro?**
Sim, automaticamente. Cada venda gera um recebimento vinculado à forma de pagamento usada.

**Posso cancelar uma transação?**
Sim. Abra o lançamento e use a opção de cancelar. Ele passa para a aba **Cancelados** e não conta mais nos totais.

**O módulo Financeiro substitui meu controle em planilha?**
Sim. Com contas, categorias, parcelamentos e relatórios, ele centraliza tudo que você controlava em planilhas - com menos retrabalho.
`
            },
            {
                id: "primeiros-passos-financeiro",
                title: "Primeiros passos no Financeiro",
                description: "Configuração inicial recomendada: contas, categorias, contatos e primeiros lançamentos.",
                slug: "primeiros-passos-financeiro",
                category: "financeiro",
                content: `
## Visão geral

Começar o Financeiro organizado evita retrabalho. Em poucos passos você cadastra suas contas, define categorias, adiciona contatos e lança as primeiras transações.

## Ordem recomendada

### 1. Cadastre suas contas

Crie as contas onde o dinheiro circula: **caixa**, **conta bancária** e **cartão de crédito**. Cada transação aponta para uma conta, e o saldo dela é atualizado automaticamente.

### 2. Crie categorias e subcategorias

Organize entradas e saídas por tipo, por exemplo:

- **Entradas**: Vendas, Serviços, Outras receitas
- **Saídas**: Fornecedores, Salários, Impostos, Aluguel, Internet

Você pode criar quantas precisar e ainda usar subcategorias para detalhar (ex: Saídas > Fornecedores > Matéria-prima).

### 3. Cadastre contatos

Adicione fornecedores, funcionários e outros parceiros. Isso permite saber, no relatório, para quem você paga e de quem você recebe.

### 4. Faça os primeiros lançamentos

Registre as entradas e saídas que já aconteceram para deixar os saldos corretos. Se tiver parcelas ou valores que se repetem, use **parcelado** ou **recorrente** desde o início.

### 5. Acompanhe pelos relatórios

Depois dos lançamentos, acesse os relatórios para ver seu resultado do mês, despesas por categoria e saldo das contas.

## Quando utilizar

- Na configuração inicial do sistema
- Ao migrar de planilha ou outro software
- Quando quiser começar a controlar despesas e receitas com mais precisão

## Dicas importantes

- **Comece pelo que é essencial** - contas e categorias principais já resolvem a maioria dos casos.
- **Use categorias consistentes** - evite criar nomes diferentes para a mesma coisa (ex: "Energia" e "Conta de luz").
- **Lançamentos antigos** - se precisar de histórico completo, inclua meses anteriores; se quiser começar do zero, lance apenas o saldo atual.

## Perguntas frequentes

**Preciso cadastrar tudo de uma vez?**
Não. O mínimo para começar é ter uma conta e lançar. Categorias e contatos podem ser criados durante o próprio lançamento.

**Posso alterar uma categoria depois?**
Sim. As categorias podem ser editadas, renomeadas e ter subcategorias a qualquer momento.

**O que acontece se eu lançar sem categoria?**
O sistema permite, mas seus relatórios ficam menos detalhados. Use categorias sempre que possível.
`
            },
            {
                id: "categorias-subcategorias-financeiras",
                title: "Categorias e subcategorias financeiras",
                description: "Como criar e usar categorias de entradas e saídas para organizar seus lançamentos e relatórios.",
                slug: "categorias-subcategorias-financeiras",
                category: "financeiro",
                content: `
## Visão geral

Categorias organizam suas transações por tipo. Elas aparecem nos lançamentos, filtros e relatórios, permitindo entender para onde vai o dinheiro e de onde ele vem.

## Categorias de entrada e de saída

Cada categoria é de um tipo:

- **Categoria de entrada (receita)** - para lançamentos que trazem dinheiro: vendas, serviços, outras receitas.
- **Categoria de saída (despesa)** - para lançamentos que tiram dinheiro: fornecedores, aluguel, impostos, salários.

## Subcategorias

Você pode criar subcategorias dentro de uma categoria para detalhar ainda mais. Exemplo:

| Categoria | Subcategoria |
|-----------|--------------|
| Fornecedores | Matéria-prima |
| Fornecedores | Embalagens |
| Despesas fixas | Aluguel |
| Despesas fixas | Internet |

## Como criar

1. No módulo **Financeiro**, acesse o menu de **Cadastros** e escolha **Categorias**.
2. Clique em **Nova categoria**.
3. Informe o **nome** e o **tipo** (entrada ou saída).
4. Para criar subcategoria, escolha a categoria-pai e preencha o nome.
5. Salve. A categoria já fica disponível nos lançamentos.

## Quando utilizar

- Na organização inicial do financeiro
- Sempre que lançar despesas ou receitas que ainda não têm categoria adequada

## Dicas importantes

- **Padronize os nomes** - categorias bem nomeadas geram relatórios limpos.
- **Crie subcategorias com parcimônia** - subcategorias demais dificultam a leitura.
- **Use o tipo correto** - uma categoria de entrada não aparece para saídas e vice-versa.

## Perguntas frequentes

**Posso mudar o tipo de uma categoria?**
Não após criar. Crie uma nova categoria com o tipo correto e use-a nos lançamentos seguintes.

**O que acontece com lançamentos antigos se eu renomear a categoria?**
Eles passam a exibir o novo nome, já que apontam para a mesma categoria.

**Preciso de categoria para transferência entre contas?**
Não. Transferências não usam categoria de entrada ou saída - o sistema as trata de forma específica.
`
            },
            {
                id: "contas-financeiras",
                title: "Contas financeiras",
                description: "Cadastro e uso de contas: caixa, conta bancária e cartão. Saldos atualizados automaticamente.",
                slug: "contas-financeiras",
                category: "financeiro",
                content: `
## Visão geral

**Contas financeiras** representam onde o dinheiro está: **caixa**, **conta bancária** ou **cartão de crédito**. Cada transação é lançada em uma conta, e o saldo dela é atualizado automaticamente a cada movimento.

## Tipos de conta

- **Caixa** - dinheiro em espécie (gaveta, retiradas do dia).
- **Conta bancária** - conta corrente ou poupança (cheque, transferência, Pix).
- **Cartão de crédito** - para lançar gastos no cartão e acompanhar a fatura.

## Como criar uma conta

1. No módulo **Financeiro**, acesse **Cadastros > Contas**.
2. Clique em **Nova conta**.
3. Informe o **nome** (ex: "Caixa da loja", "Banco X - corrente") e o **tipo**.
4. Defina o **saldo inicial** - o valor que a conta tem hoje.
5. Salve. A conta aparece na seleção dos lançamentos.

## Como funciona o saldo

- **Entradas** aumentam o saldo da conta.
- **Saídas** diminuem o saldo.
- **Transferências** movem o valor entre contas (uma sai, outra entra).
- **Ajustes** corrigem o saldo manualmente quando necessário (ex: conciliação bancária).

## Quando utilizar

- Para separar dinheiro em espécie do dinheiro em banco
- Para acompanhar gastos no cartão de crédito
- Para controlar múltiplas contas bancárias

## Dicas importantes

- **Mantenha o saldo inicial real** - ele é a base para tudo que virá depois.
- **Lançamento na conta certa** - um gasto pago pelo cartão deve ser lançado no cartão, não no caixa.
- **Revise saldos periodicamente** - compare com seu banco e use **Ajuste** para corrigir diferenças.

## Perguntas frequentes

**Posso ter mais de uma conta?**
Sim, quantas precisar. Cada transação é vinculada a uma conta.

**Transferência entre contas altera meu resultado?**
Não. Ela move o dinheiro entre contas sem mudar o total do seu negócio.

**Como corrijo um saldo errado?**
Use o tipo de lançamento **Ajuste** para corrigir o saldo da conta para o valor correto.
`
            },
            {
                id: "contatos-financeiros",
                title: "Contatos financeiros",
                description: "Fornecedores, funcionários e outros contatos: como cadastrar e vincular aos lançamentos.",
                slug: "contatos-financeiros",
                category: "financeiro",
                content: `
## Visão geral

**Contatos financeiros** são as pessoas e empresas com quem você transaciona: **fornecedores**, **funcionários**, **clientes** e **outros**. Vincular o contato ao lançamento permite saber com quem você pagou ou recebeu.

## Tipos de contato

- **Fornecedor** - quem te vende produtos, matéria-prima ou serviços (despesas).
- **Funcionário** - pagamentos de salários, comissões e adiantamentos.
- **Cliente** - quem compra de você (receitas).
- **Outro** - demais pessoas ou empresas (ex: sócio, prestador eventual).

## Como criar um contato

1. No módulo **Financeiro**, acesse **Cadastros > Contatos**.
2. Clique em **Novo contato**.
3. Informe o **nome** e o **tipo** (fornecedor, funcionário, cliente ou outro).
4. Preencha os demais dados opcionais (documento, telefone, e-mail).
5. Salve. O contato fica disponível nos lançamentos.

## Quando utilizar

- Para saber para quem e de quem o dinheiro se move
- Para gerar relatórios por contato (total pago a cada fornecedor)
- Para organizar contas a pagar e a receber

## Dicas importantes

- **Reutilize contatos** - o mesmo fornecedor deve ser usado em todos os lançamentos, assim o relatório fica agrupado.
- **Vincule sempre que possível** - lançamentos sem contato aparecem como "Sem contato" nos relatórios.
- **Clientes já cadastrados** - clientes do módulo de Clientes podem aparecer automaticamente aqui nas receitas.

## Perguntas frequentes

**Preciso cadastrar contato para lançar?**
Não é obrigatório, mas recomendado para um relatório completo.

**Contato de fornecedor é o mesmo do módulo Clientes?**
O módulo Financeiro tem contatos próprios para fornecedores, funcionários e outros. Para receitas, você também pode vincular clientes da sua base.

**Posso ter contatos que nunca lançam?**
Sim, cadastre à vontade. Eles só aparecem quando usados.
`
            },
            {
                id: "como-lancar-entrada-saida",
                title: "Como lançar entrada e saída",
                description: "Passo a passo para registrar receitas e despesas no Financeiro, com parcelas e formas de pagamento.",
                slug: "como-lancar-entrada-saida",
                category: "financeiro",
                content: `
## Visão geral

O lançamento mais comum no Financeiro é registrar uma **entrada** (dinheiro que entra) ou uma **saída** (dinheiro que sai). O processo é rápido e você pode repeti-lo todos os dias.

## Quando utilizar

- Para registrar uma venda recebida manualmente
- Para lançar uma despesa (compra, conta, salário)
- Para registrar dinheiro que entrou ou saiu do caixa

## Como fazer

### 1. Abrir o novo lançamento

No módulo **Financeiro**, clique em **Nova transação**.

### 2. Escolher o tipo

Selecione **Entrada** para receita ou **Saída** para despesa.

### 3. Preencher os dados

- **Descrição** - o que é (ex: "Venda balcão", "Compra de matéria-prima").
- **Valor** - o total do lançamento.
- **Categoria** - escolha a categoria (e subcategoria, se houver).
- **Conta** - onde o dinheiro entra ou sai.
- **Contato** - para quem paga ou de quem recebe (opcional).
- **Data de vencimento** - quando vence ou foi pago.
- **Forma de pagamento** - Pix, dinheiro, cartão, etc.
- **Observações** - anotações internas (opcional).

### 4. Opcionais

- **Parcelado** - divida o valor em parcelas (veja o artigo sobre lançamentos parcelados).
- **Recorrente** - repita automaticamente todos os meses (veja o artigo sobre transações recorrentes).

### 5. Salvar

Clique em **Salvar**. O lançamento aparece na aba correspondente e atualiza o saldo da conta.

## Dicas importantes

- **Escolha a categoria certa** - entradas usam categorias de entrada e saídas, de saída.
- **Confira a conta** - o saldo da conta indicada será alterado.
- **Use a data de vencimento** - lançamentos em aberto aparecem em A pagar/A receber até serem baixados.

## Perguntas frequentes

**Um lançamento em aberto aparece onde?**
Em **A pagar** (saída) ou **A receber** (entrada), até ser marcado como pago.

**Como marco como pago?**
Abra o lançamento e use a opção de baixar/marcar como pago, informando a data do pagamento.

**Posso lançar uma entrada e uma saída de uma vez?**
Cada lançamento é individual. Para movimentações entre contas, use **Transferência**.
`
            },
            {
                id: "como-fazer-transferencia-entre-contas",
                title: "Como fazer transferência entre contas",
                description: "Mova dinheiro entre caixa, banco e cartão sem alterar seu resultado financeiro.",
                slug: "como-fazer-transferencia-entre-contas",
                category: "financeiro",
                content: `
## Visão geral

A **transferência** move dinheiro de uma conta para outra - por exemplo, do **caixa** para a **conta bancária**, ou do **banco** para o **cartão** para pagar a fatura. Ela não gera receita nem despesa: apenas muda onde o dinheiro está.

## Quando utilizar

- Quando você retira dinheiro do caixa e deposita no banco
- Quando paga a fatura do cartão com a conta bancária
- Quando faz um Pix entre contas suas

## Como fazer

1. No módulo **Financeiro**, clique em **Nova transação**.
2. Escolha o tipo **Transferência**.
3. Selecione a **conta de origem** (de onde sai o dinheiro) e a **conta de destino** (para onde vai).
4. Informe o **valor**.
5. Adicione uma **descrição** (ex: "Depósito do caixa no banco").
6. Salve. O valor sai da origem e entra no destino.

## Como funciona no resultado

A transferência **não altera** seu resultado do mês, porque uma conta reduz e a outra aumenta na mesma proporção. Ela aparece no histórico de cada conta envolvida.

## Dicas importantes

- **Origem e destino diferentes** - se informar a mesma conta, o sistema não permite ou não faz sentido; confira antes de salvar.
- **Use descrições claras** - facilita entender o histórico depois.
- **Não confunda com Ajuste** - transferência move entre contas; ajuste corrige saldo.

## Perguntas frequentes

**Transferência gera imposto ou taxa no sistema?**
Não. É apenas o registro da movimentação entre contas.

**Consigo desfazer uma transferência?**
Abra a transferência e cancele o lançamento. Os saldos das duas contas voltam ao estado anterior.

**A transferência aparece nos relatórios de resultado?**
Não nos totais de receitas/despesas, mas aparece no detalhamento de cada conta.
`
            },
            {
                id: "como-ajustar-saldo-conta",
                title: "Como ajustar o saldo de uma conta",
                description: "Corrija saldos de caixa e banco com lançamentos de ajuste, inclusive para conciliação.",
                slug: "como-ajustar-saldo-conta",
                category: "financeiro",
                content: `
## Visão geral

O **Ajuste** é o lançamento usado para corrigir o saldo de uma conta quando ele não bate com a realidade - por exemplo, após uma **conciliação bancária** ou quando o saldo do caixa físico está diferente do registrado.

## Quando utilizar

- Quando o saldo da conta no sistema difere do extrato do banco
- Quando o caixa físico não confere com o saldo registrado (sobra ou falta)
- Para fazer a correção de arredondamentos ou lançamentos antigos incorretos

## Como fazer

1. No módulo **Financeiro**, clique em **Nova transação**.
2. Escolha o tipo **Ajuste**.
3. Selecione a **conta** que terá o saldo corrigido.
4. Informe o **valor** da diferença.
5. Adicione uma **descrição** (ex: "Ajuste após conciliação bancária").
6. Salve. O saldo da conta passa a refletir o valor ajustado.

## Dicas importantes

- **Ajuste não é despesa nem receita** - ele só corrige o saldo da conta.
- **Documente o motivo** - a descrição do ajuste é essencial para auditoria depois.
- **Prefira lançar o correto** - se a diferença tem causa conhecida (ex: uma saída esquecida), lance a saída em vez do ajuste.

## Perguntas frequentes

**Qual a diferença entre Ajuste e Transferência?**
Transferência move dinheiro entre contas. Ajuste corrige o saldo de uma única conta sem mover valor para outra.

**O ajuste aparece nos relatórios?**
Sim, com a categoria "Ajuste de saldo", para você identificar facilmente.

**Posso fazer ajuste para cima e para baixo?**
Sim. Informe o valor do ajuste conforme a correção necessária.
`
            },
            {
                id: "como-registrar-reembolso-estorno",
                title: "Como registrar reembolso e estorno",
                description: "Lance reembolsos de despesa e de receita, para estornos de vendas e devoluções de dinheiro.",
                slug: "como-registrar-reembolso-estorno",
                category: "financeiro",
                content: `
## Visão geral

O **Reembolso** registra quando o dinheiro volta ou sai por uma devolução. Existem dois tipos:

- **Reembolso de despesa** - quando uma despesa paga volta (ex: fornecedor devolve o valor de uma compra).
- **Reembolso de receita / estorno** - quando você devolve o dinheiro de uma venda (ex: devolução de produto ou cancelamento).

## Quando utilizar

- Devolução de mercadoria ao fornecedor com retorno do valor pago
- Estorno de uma venda cancelada
- Devolução de dinheiro a um cliente (reembolso de pagamento)
- Crédito em loja (vale-compra) gerado por devolução

## Como fazer

1. No módulo **Financeiro**, clique em **Nova transação**.
2. Escolha o tipo **Reembolso**.
3. Selecione o **tipo de reembolso**:
   - **Reembolso de despesa** - o dinheiro volta para você.
   - **Reembolso de receita** - você devolve dinheiro ao cliente.
4. Preencha descrição, valor, conta, contato e data.
5. Salve. O lançamento fica marcado como reembolso no histórico.

## Dicas importantes

- **Use a categoria Reembolsos** - o sistema registra nessa categoria para facilitar a identificação.
- **Vincule o cliente** - ao reembolsar uma receita, vincule o cliente para controle.
- **Confira o saldo da conta** - o reembolso mexe no saldo da conta escolhida.

## Perguntas frequentes

**Reembolso de receita é o mesmo que estorno de venda?**
No financeiro, sim: é o registro de que o dinheiro da venda voltou. Se a venda foi cancelada, o recebimento dela também é tratado no fluxo de estorno.

**Reembolso reduz minhas receitas do mês?**
Ele aparece como lançamento de reembolso, e o resultado do período reflete a devolução.

**Como lanço crédito em loja por devolução?**
O vale-compra/crédito em loja é gerado no fluxo de devolução de venda. No financeiro, o estorno correspondente é registrado como reembolso.
`
            },
            {
                id: "contas-a-pagar",
                title: "Contas a pagar",
                description: "Acompanhe suas despesas em aberto: o que vence, o que está atrasado e o que já foi pago.",
                slug: "contas-a-pagar",
                category: "financeiro",
                content: `
## Visão geral

A aba **A pagar** reúne todas as **saídas em aberto** do seu negócio: fornecedores, aluguel, impostos, salários, boletos e qualquer outra despesa que ainda não foi paga.

![Aba A pagar](https://img.dudit.com.br/static/screens/Financeiro_Apagar.png)
Legenda: Despesas em aberto com total pendente, vencido e concluído.

## O que você vê

- **Total pendente** - quanto ainda falta pagar
- **Total vencido** - o que já passou do vencimento
- **Total concluído** - o que já foi pago no período

A lista é ordenada por **data de vencimento**, então o que vence primeiro aparece primeiro.

## Como pagar uma conta

1. Na aba **A pagar**, encontre o lançamento.
2. Abra os detalhes.
3. Use a opção **Marcar como pago**.
4. Informe a **data do pagamento** (se necessário).
5. O lançamento sai de "em aberto" e passa a contar como concluído.

## Quando utilizar

- Todos os dias, para saber o que vence hoje e nos próximos dias
- Para evitar atrasos e multas
- Para planejar o caixa do mês

## Dicas importantes

- **Pague com folga** - acompanhe o que vence nos próximos dias, não só o que já venceu.
- **Use os vencidos** - a aba **Vencidos** concentra tudo que está atrasado para você priorizar.
- **Parcelas e recorrências** - parcelas em aberto e ocorrências recorrentes futuras aparecem aqui automaticamente.

## Perguntas frequentes

**Por que uma conta aparece em A pagar?**
Toda saída com data de vencimento futura ou presente e sem baixa aparece como conta a pagar.

**Paguei mas continua aparecendo?**
Verifique se o lançamento foi marcado como pago e se a conta indicada está correta.

**Recorrências futuras aparecem em A pagar?**
Sim. As próximas ocorrências de uma despesa recorrente aparecem com suas respectivas datas de vencimento.
`
            },
            {
                id: "contas-a-receber",
                title: "Contas a receber",
                description: "Acompanhe suas receitas em aberto: vendas a prazo, serviços agendados e valores que ainda entrarão.",
                slug: "contas-a-receber",
                category: "financeiro",
                content: `
## Visão geral

A aba **A receber** reúne todas as **entradas em aberto**: vendas a prazo, parcelas de clientes, serviços prestados e qualquer recebimento agendado que ainda não foi recebido.

## O que você vê

- **Total pendente** - quanto ainda falta receber
- **Total vencido** - o que já passou do vencimento sem receber
- **Total concluído** - o que já foi recebido no período

A lista é ordenada por **data de vencimento**, mostrando primeiro o que deve entrar antes.

## Como receber um valor

1. Na aba **A receber**, encontre o lançamento.
2. Abra os detalhes.
3. Use a opção **Marcar como recebido**.
4. Informe a **data do recebimento** (se necessário).
5. O lançamento sai de "em aberto" e passa a contar como concluído.

## Quando utilizar

- Para saber quanto vai entrar no mês
- Para cobrar valores em atraso
- Para planejar o caixa e evitar surpresas

## Dicas importantes

- **Acompanhe os vencidos** - vendas a prazo não pagas aparecem em **Vencidos** para você cobrar.
- **Vendas a prazo já entram automaticamente** - a parcela da venda aparece como a receber.
- **Serviços e agendamentos** - recebimentos de serviços podem ser lançados como a receber.

## Perguntas frequentes

**Por que uma parcela de venda aparece em A receber?**
Vendas a prazo geram recebimentos com datas de vencimento. Enquanto não recebidos, ficam em aberto.

**Como registro o recebimento de um cliente?**
Abra o lançamento e use **Marcar como recebido**. O saldo da conta indicada aumenta.

**O que é o total vencido em A receber?**
São recebimentos que passaram do vencimento e ainda não entraram - sinal de que vale cobrar.
`
            },
            {
                id: "parcelado-transacoes",
                title: "Lançamentos parcelados",
                description: "Divida um valor em parcelas mensais: como criar, acompanhar e receber/pagar cada parcela.",
                slug: "parcelado-transacoes",
                category: "financeiro",
                content: `
## Visão geral

**Parcelado** divide um lançamento em várias parcelas mensais. Você informa o valor total e o número de parcelas, e o sistema cria cada parcela com sua própria data de vencimento.

## Quando utilizar

- Compra de equipamento paga em 6x no cartão
- Venda a prazo para cliente em 3x
- Qualquer valor que será pago ou recebido em partes

## Como criar um parcelamento

1. No módulo **Financeiro**, clique em **Nova transação**.
2. Escolha **Entrada** ou **Saída**.
3. Preencha descrição, valor total, categoria, conta e contato.
4. Ative a opção **Parcelado**.
5. Informe a **quantidade de parcelas**.
6. Confira as datas de vencimento geradas (uma por mês).
7. Salve. Cada parcela vira um lançamento próprio.

## Como funciona na prática

- Cada parcela aparece com **número da parcela** (ex: 2/6).
- Elas ficam em **A pagar** ou **A receber** conforme a data de vencimento.
- Cada parcela é baixada individualmente (marcar como pago/recebido).
- O detalhe da transação mostra o **grupo de parcelas** com o total.

## Dicas importantes

- **Confira a primeira data** - ela define o vencimento de todas as parcelas seguintes.
- **Baixe parcela a parcela** - o saldo da conta é atualizado a cada baixa.
- **Parcelas atrasadas** - aparecem na aba **Vencidos** para você não esquecer.

## Perguntas frequentes

**Posso pagar uma parcela antes do vencimento?**
Sim. Marque a parcela como paga quando quiser, informando a data do pagamento.

**E se eu pagar a vista o que estava parcelado?**
Baixe todas as parcelas como pagas na data em que o pagamento ocorreu, ou registre cada baixa.

**Posso alterar o número de parcelas depois?**
Não diretamente. Você pode cancelar o grupo e refazer o lançamento com as novas parcelas.
`
            },
            {
                id: "transacoes-recorrentes",
                title: "Transações recorrentes",
                description: "Automatize despesas e receitas fixas que se repetem todos os meses, como aluguel e assinaturas.",
                slug: "transacoes-recorrentes",
                category: "financeiro",
                content: `
## Visão geral

**Transações recorrentes** são lançamentos que se repetem em intervalo fixo, geralmente **mensal**. Você configura uma vez e o sistema gera as próximas ocorrências automaticamente.

## Quando utilizar

- Despesas fixas: aluguel, internet, telefone, mensalidade de sistemas
- Receitas fixas: mensalidades de clientes, planos de manutenção
- Qualquer valor que se repete todo mês

## Como criar

1. No módulo **Financeiro**, clique em **Nova transação**.
2. Escolha **Entrada** ou **Saída**.
3. Preencha descrição, valor, categoria, conta e contato.
4. Ative a opção **Recorrente**.
5. Defina a **frequência** (ex: mensal) e a **data da primeira ocorrência**.
6. Salve. O sistema cria o modelo da recorrência.

## Como funciona na prática

- As próximas ocorrências aparecem em **A pagar** ou **A receber**, com as datas de vencimento.
- Cada ocorrência é baixada individualmente.
- Se algo mudar (valor, dia), você pode **editar a recorrência** e as próximas ocorrências acompanham.

## Dicas importantes

- **Baixe a ocorrência do mês** - pagar a ocorrência não altera o modelo; cada mês é uma nova baixa.
- **Revise o dia de vencimento** - o dia escolhido na criação vale para todas as ocorrências.
- **Recorrência não é parcela** - parcela tem fim definido; recorrência continua até você cancelar.

## Perguntas frequentes

**Onde vejo as ocorrências futuras?**
Em **A pagar** ou **A receber**, conforme a data de vencimento de cada ocorrência.

**Como paro uma recorrência?**
Edite a recorrência e cancele-a, ou cancele as ocorrências futuras conforme o caso.

**Uma recorrência gera lançamento automaticamente?**
Ela gera as ocorrências previstas. O pagamento/recebimento de cada uma é feito por você, como nos demais lançamentos.
`
            },
            {
                id: "transacoes-automaticas",
                title: "Transações automáticas",
                description: "Lançamentos criados pelo sistema: vendas, serviços, comissões, metas e assinaturas entram sozinhos.",
                slug: "transacoes-automaticas",
                category: "financeiro",
                content: `
## Visão geral

O sistema gera **transações automáticas** a partir de movimentações em outros módulos. Você não precisa lançar manualmente - elas entram no Financeiro sozinhas, com origem identificada.

## Origens das transações automáticas

| Origem | O que gera |
|--------|-----------|
| **Vendas (PDV e pedidos)** | Recebimentos de cada venda, conforme a forma de pagamento |
| **Vendas no marketplace** | Recebimentos de pedidos online integrados |
| **Serviços, agendamentos e Ordens de Serviço** | Recebimentos de serviços prestados |
| **Comissões** | Lançamentos de comissões de funcionários/vendedores |
| **Metas e bônus** | Lançamentos gerados por bonificações de metas |
| **Assinaturas / Mercado Pago** | Recebimentos de assinaturas e pré-aprovações |
| **Recorrências** | Ocorrências das transações recorrentes que você configurou |

## Como identificar

Transações automáticas aparecem na lista com sua **origem** indicada (ex: venda, comissão, assinatura). Ao abrir o lançamento, você vê de qual venda, serviço ou pedido ele veio.

## Quando utilizar

- Não é necessário fazer nada - a integração é automática
- Use para conferir se tudo que foi vendido entrou no financeiro

## Dicas importantes

- **Confira periodicamente** - compare as vendas do dia com os recebimentos no Financeiro.
- **Não duplique** - não relance manualmente o que o sistema já gerou, ou o valor contará duas vezes.
- **Estornos** - cancelamentos e devoluções também geram lançamentos automáticos de estorno/reembolso.

## Perguntas frequentes

**Toda venda no PDV gera lançamento no Financeiro?**
Sim. Cada venda gera o recebimento vinculado à forma de pagamento usada.

**Posso editar uma transação automática?**
Em geral, não é necessário. Se algo estiver errado, verifique a venda original no módulo de Vendas.

**Preciso lançar manualmente as vendas do site?**
Não. Pedidos do marketplace integrados entram automaticamente no Financeiro.
`
            },
            {
                id: "detalhes-e-historico-transacao",
                title: "Detalhes e histórico de uma transação",
                description: "O que você vê ao abrir um lançamento: dados, forma de pagamento, parcelas, origem e histórico.",
                slug: "detalhes-e-historico-transacao",
                category: "financeiro",
                content: `
## Visão geral

Ao clicar em um lançamento na lista, abre a **tela de detalhes** com todas as informações da transação e o histórico de movimentações dela.

![Detalhes de uma transação](https://img.dudit.com.br/static/screens/Financeiro_DetalheTransacao.png)
Legenda: Detalhes do lançamento com dados gerais, forma de pagamento e histórico.

## O que você encontra

**Informações principais** - descrição, valor, categoria, subcategoria, conta, contato, data de vencimento, forma de pagamento e status (pago/recebido ou em aberto).

**Origem** - se a transação é manual ou veio de outro módulo (venda, serviço, comissão, assinatura, recorrência).

**Parcelas** - se o lançamento é parcelado, mostra o grupo com número da parcela e total.

**Valores auxiliares** - juros, descontos e valor já pago (pagamentos parciais), quando aplicáveis.

**Histórico** - linha do tempo com o que aconteceu com a transação: criação, alterações, baixas de pagamento e cancelamentos.

## Como abrir

1. No módulo **Financeiro**, encontre o lançamento na lista.
2. Clique nele (ou no botão de detalhes).
3. Navegue pelas seções e pelo histórico.

## Quando utilizar

- Para conferir se um lançamento está correto
- Para entender de onde veio uma transação automática
- Para ver quando um pagamento foi baixado e por quem
- Para acompanhar parcelas e pagamentos parciais

## Dicas importantes

- **Use o histórico para auditoria** - ele mostra alterações e baixas, útil para conciliação.
- **Confira a origem** - em transações automáticas, abra a venda/serviço original se precisar corrigir.
- **Observações** - o campo de observações internas aparece aqui e ajuda a lembrar o contexto do lançamento.

## Perguntas frequentes

**O que é o histórico da transação?**
Uma linha do tempo com os eventos do lançamento: criação, edições, pagamentos e cancelamentos.

**Consigo ver pagamentos parciais no detalhe?**
Sim. Se um lançamento teve pagamento parcial, o valor pago e o saldo restante aparecem nos detalhes.

**Transações automáticas têm detalhes?**
Sim. Elas mostram a origem e podem ser abertas normalmente.
`
            },
            {
                id: "caixa-pdv-abertura-sangria-reforco-fechamento",
                title: "Caixa do PDV: abertura, sangria, reforço e fechamento",
                description: "Gerencie o caixa do PDV: como abrir, retirar (sangria), reforçar e fechar o caixa do dia.",
                slug: "caixa-pdv-abertura-sangria-reforco-fechamento",
                category: "financeiro",
                content: `
## Visão geral

O **caixa do PDV** controla o dinheiro em espécie do balcão ao longo do dia. Você abre o caixa no início, registra retiradas (**sangria**) e depósitos (**reforço**), e no fim fecha o caixa conferindo o valor.

## Como abrir o caixa

1. No PDV, acesse o **Caixa**.
2. Clique em **Abrir caixa**.
3. Informe o **valor inicial** (quanto há em espécie no início).
4. Confirme. O caixa fica aberto para as vendas do dia.

## Sangria

**Sangria** é a retirada de dinheiro do caixa durante o dia - por exemplo, para pagar uma despesa ou depositar no banco.

1. Com o caixa aberto, use a opção **Sangria**.
2. Informe o **valor** e o **motivo**.
3. Confirme. O valor sai do caixa.

## Reforço

**Reforço** é a entrada de dinheiro no caixa durante o dia - por exemplo, quando você repõe troco.

1. Com o caixa aberto, use a opção **Reforço**.
2. Informe o **valor** e o **motivo**.
3. Confirme. O valor entra no caixa.

## Fechamento

No fim do dia:

1. Clique em **Fechar caixa**.
2. O sistema mostra o **total esperado** (valor inicial + vendas em dinheiro + reforços − sangrias).
3. Confira com o dinheiro físico.
4. Confirme o fechamento. O resultado do dia fica registrado.

## Quando utilizar

- Todos os dias, em lojas com atendimento de balcão
- Sempre que retirar ou acrescentar dinheiro ao caixa durante o expediente
- No encerramento do expediente

## Dicas importantes

- **Registre toda retirada como sangria** - evita diferença no fechamento.
- **Confira o caixa antes de fechar** - conte o dinheiro físico e compare com o esperado.
- **Vendas em dinheiro entram no caixa automaticamente** - você só registra o que sai ou entra por fora das vendas.

## Perguntas frequentes

**O caixa do PDV aparece no Financeiro?**
Sim. As vendas e movimentações do caixa do PDV são refletidas no Financeiro, e o artigo de Vendas explica o fluxo do PDV em detalhes.

**Esqueci de abrir o caixa no início do dia. E agora?**
Abra o caixa com o valor inicial correto o quanto antes. O importante é que o registro reflita a realidade do dia.

**Sangria e reforço geram lançamentos no Financeiro?**
Sim. Sangrias e reforços ficam registrados como movimentações do caixa.

**Posso abrir o caixa sem informar valor inicial?**
Em geral o sistema pede um valor inicial. Se o caixa começa zerado, informe zero.
`
            },
            {
                id: "relatorios-financeiros",
                title: "Relatórios financeiros",
                description: "Resultado do período, despesas e receitas por categoria, saldo das contas e outros indicadores.",
                slug: "relatorios-financeiros",
                category: "financeiro",
                content: `
## Visão geral

Os **relatórios financeiros** mostram o panorama do seu dinheiro: quanto entrou, quanto saiu, qual o resultado do período e como o valor se distribui entre categorias e contas.

## Relatórios disponíveis

**Resultado (receitas x despesas)** - total de entradas, total de saídas e o resultado do período (positivo ou negativo).

**Por categoria** - quanto foi movimentado em cada categoria de entrada e de saída, para identificar onde o dinheiro vai.

**Por conta** - saldo e movimentação de cada conta (caixa, banco, cartão).

**Por contato** - total pago a cada fornecedor e recebido de cada cliente.

**Vencidos** - o que está atrasado, tanto a pagar quanto a receber.

## Como acessar

1. No menu lateral, acesse **Relatórios**.
2. Selecione o módulo **Financeiro**.
3. Escolha o relatório desejado.
4. Use os **filtros de período** (ex: este mês, mês passado, intervalo personalizado) para ajustar a visão.

## Quando utilizar

- No fim do mês, para ver o resultado do período
- Para decidir onde cortar gastos (relatório por categoria)
- Para conferir quanto está vencido e cobrar/pagar
- Para acompanhar saldo das contas

## Dicas importantes

- **Use períodos comparáveis** - compare o mesmo intervalo entre meses diferentes.
- **Confira as categorias** - relatórios dependem de lançamentos bem categorizados.
- **Exporte para compartilhar** - os relatórios podem ser exportados para planilha.

## Perguntas frequentes

**O resultado considera transferências e ajustes?**
Não. Transferências e ajustes não entram no total de receitas e despesas, pois não representam ganho ou perda.

**Os relatórios consideram lançamentos em aberto?**
O resultado do período considera as receitas e despesas do período conforme as regras do relatório (data de vencimento/pagamento). Confira o filtro selecionado.

**Posso ver relatório de um período passado?**
Sim. Use o filtro de período para selecionar qualquer intervalo.
`
            },
            {
                id: "exportar-transacoes",
                title: "Exportar transações",
                description: "Exporte seus lançamentos para planilha (Excel/CSV) para análise externa ou contador.",
                slug: "exportar-transacoes",
                category: "financeiro",
                content: `
## Visão geral

A **exportação** gera um arquivo de planilha com os lançamentos do Financeiro. É útil para análise no Excel, repasse ao contador ou arquivamento.

## Como exportar

1. No módulo **Financeiro**, aplique os **filtros desejados** (período, aba, busca).
2. Clique no botão **Exportar**.
3. O sistema gera o arquivo no formato escolhido (planilha).
4. Salve ou abra o arquivo no seu computador.

## O que vai no arquivo

Cada linha é uma transação com informações como descrição, categoria, conta, contato, data de vencimento, forma de pagamento, status e valor.

## Quando utilizar

- Para analisar o financeiro em planilha
- Para enviar dados ao contador
- Para criar relatórios personalizados fora do sistema
- Para arquivamento e auditoria

## Dicas importantes

- **Filtre antes de exportar** - a exportação respeita a visão/filtro atual.
- **Confira o período** - exporte apenas o intervalo que precisa.
- **Não altere no sistema** - o arquivo é um retrato dos dados no momento da exportação.

## Perguntas frequentes

**A exportação respeita a aba selecionada?**
Sim. Se você está na aba A pagar com um filtro de período, a exportação traz apenas os lançamentos dessa visão.

**Em que formato sai o arquivo?**
Em formato de planilha compatível com Excel e editores de planilha.

**Posso exportar todos os lançamentos de uma vez?**
Sim, desde que a visão atual contenha os lançamentos desejados.
`
            },
            {
                id: "perguntas-frequentes-financeiro",
                title: "Perguntas frequentes sobre Financeiro",
                description: "Respostas rápidas sobre lançamentos, abas, contas, parcelas, recorrências, reembolsos e integrações.",
                slug: "perguntas-frequentes-financeiro",
                category: "financeiro",
                content: `
## Lançamentos e abas

**Qual a diferença entre as abas Transações, A pagar, A receber, Vencidos e Cancelados?**
- **Transações**: todos os lançamentos do período.
- **A pagar**: saídas em aberto (você ainda deve).
- **A receber**: entradas em aberto (ainda vai receber).
- **Vencidos**: lançamentos com vencimento passado e sem baixa.
- **Cancelados**: lançamentos cancelados, que não contam nos totais.

**O que é uma transação manual?**
É um lançamento criado por você (entrada, saída, transferência, ajuste ou reembolso), em contraste com os automáticos criados pelo sistema.

**Posso cancelar um lançamento?**
Sim. Abra o lançamento e use a opção de cancelar. Ele passa para a aba **Cancelados**.

## Contas e categorias

**Quantas contas posso ter?**
Quantas precisar: caixa, contas bancárias, cartões.

**Transferência entre contas altera meu resultado?**
Não. Ela apenas move o dinheiro entre contas.

**Como corrijo um saldo de conta errado?**
Use um lançamento do tipo **Ajuste**, informando a conta e o valor da correção.

**Preciso de categoria para transferência?**
Não. Transferências não usam categoria de entrada ou saída.

## Parcelas e recorrências

**Como funciona um lançamento parcelado?**
O valor é dividido em parcelas mensais, cada uma com sua data de vencimento, baixadas individualmente.

**Qual a diferença entre parcelado e recorrente?**
Parcelado tem fim definido (ex: 6x). Recorrente se repete até você cancelar (ex: aluguel mensal).

**Onde vejo as ocorrências de uma recorrência?**
Em **A pagar** ou **A receber**, conforme a data de vencimento de cada ocorrência.

## Reembolsos e estornos

**O que é reembolso de despesa?**
Quando uma despesa paga volta - por exemplo, o fornecedor devolve o valor de uma compra.

**O que é reembolso de receita (estorno)?**
Quando você devolve o dinheiro de uma venda - por exemplo, em uma devolução ou cancelamento.

## Integrações automáticas

**Vendas do PDV entram no Financeiro?**
Sim, automaticamente, cada uma com sua forma de pagamento.

**Vendas do site (marketplace) entram no Financeiro?**
Sim, quando o pedido online é integrado ao sistema.

**Comissões e metas geram lançamentos?**
Sim. Lançamentos de comissões e bonificações de metas são criados pelo sistema.

**Assinaturas (Mercado Pago) geram lançamentos?**
Sim. Recebimentos de assinaturas e pré-aprovações entram automaticamente.

## Diversos

**O Financeiro substitui meu controle em planilha?**
Sim. Ele centraliza lançamentos, contas, categorias, parcelas, recorrências e relatórios.

**Posso exportar os lançamentos?**
Sim, para planilha, respeitando a visão e os filtros atuais.

**Ainda com dúvidas?** Entre em contato com nosso suporte ou consulte o artigo específico sobre o assunto na Central de Ajuda.
`
            }
        ]
    },
    {
        id: "marketing",
        title: "Marketing",
        icon: "📣",
        articles: [
            {
                id: "visao-geral-cupons",
                title: "Visão geral de cupons",
                description: "Entenda os cupons de desconto: tipos, status, escopos e como eles funcionam nas vendas e na vitrine.",
                slug: "visao-geral-cupons",
                category: "marketing",
                content: `
## Visão geral

Os **cupons de desconto** são códigos que seu cliente usa para ganhar um benefício na compra - percentual, valor fixo ou frete grátis. Você cria o cupom no ERP, define as regras, e ele pode ser usado no balcão (PDV), nas vendas e também na sua vitrine online.

![Tela principal de Cupons](https://img.dudit.com.br/static/screens/Cupons_VisaoGeral.png)
Legenda: Lista de cupons com abas de status, busca, filtros e ações rápidas.

## O que você encontra no módulo

**Lista de cupons** - cada linha mostra o código, o tipo de desconto, o escopo (onde vale), o uso (quantas vezes foi usado), a validade e o status.

**Abas de status** - quatro abas organizam os cupons:

| Aba | O que mostra |
|-----|--------------|
| **Todos** | Todos os cupons cadastrados |
| **Ativos** | Cupons disponíveis para uso |
| **Inativos** | Cupons pausados |
| **Automáticos** | Cupons aplicados sozinhos pelo sistema, sem o cliente digitar |

**Busca e filtros** - encontre cupons por código e refine por tipo de desconto, escopo do catálogo, clientes ou automação.

**Tipos de desconto** - três formatos:

- **Percentual** - desconto em % (ex: 10% OFF)
- **Valor fixo** - desconto em reais (ex: R$ 20 OFF)
- **Entrega grátis** - isenta o frete do pedido

**Status** - **Ativo** (pode ser usado) ou **Inativo** (pausado). Cupons automáticos aparecem com uma marcação própria.

## Quando utilizar

- Para atrair novos clientes (cupom de primeira compra)
- Para fidelizar (cupom de aniversário)
- Para escoar estoque (desconto em categoria ou produto)
- Para impulsionar vendas na vitrine online
- Para bonificar um cliente específico (escopo por cliente)

## Como funciona na prática

1. Você cria o cupom com código, tipo e regras.
2. O cupom fica **Ativo** e passa a ser aceito.
3. O cliente usa o código no PDV, na venda ou na vitrine.
4. O sistema valida as regras (validade, limite, mínimo da sacola) e aplica o desconto.
5. O uso fica registrado e aparece no relatório de Marketing.

## Dicas importantes

- **Crie códigos fáceis de lembrar** - ex: ANIVERSARIO10, BEMVINDO15.
- **Defina limites de uso** para não estourar sua margem.
- **Cupons automáticos** são ótimos para campanhas gerais: o desconto entra sozinho, sem o cliente digitar nada.
- **Use o link de compartilhamento** para divulgar o cupom no WhatsApp e redes sociais.

## Perguntas frequentes

**O cliente precisa digitar o código?**
Para cupons normais, sim. Para **cupons automáticos**, não - o sistema aplica o maior desconto automaticamente.

**Cupom funciona na vitrine online?**
Sim. Cupons ativos aparecem na página do seu negócio e podem ser usados no checkout.

**Posso desativar um cupom depois de criá-lo?**
Sim. Basta alternar o status para **Inativo** na lista. Cupons usados antes continuam válidos; novos usos param.
`
            },
            {
                id: "como-criar-configurar-cupom",
                title: "Como criar e configurar um cupom",
                description: "Passo a passo completo do formulário: código, tipo de desconto, valor, opções e escopo.",
                slug: "como-criar-configurar-cupom",
                category: "marketing",
                content: `
## Visão geral

Criar um cupom é rápido. Você informa o **código**, escolhe o **tipo de desconto**, define o **valor**, ajusta **opções** (combinação e automação) e salva. Em seguida pode configurar o **escopo** e os **limites**.

## Quando utilizar

- Para criar um cupom de primeira compra
- Para lançar uma campanha de desconto
- Para criar um cupom de aniversário (com código pré-definido e cliente vinculado)
- Para dar um benefício específico a um cliente

## Como fazer

### 1. Abrir o cadastro

No menu **Marketing > Cupons de Desconto**, clique em **Novo cupom**.

### 2. Dados gerais

- **Código do cupom** - o código que o cliente vai digitar (ex: BEMVINDO15). Sem acentos, letras maiúsculas, máximo 20 caracteres.
- **Status** - Ativo ou Inativo.
- **Tipo de desconto** - Percentual, Valor fixo ou Entrega grátis.
- **Valor do desconto** - informe o percentual ou o valor em reais (para Entrega grátis esse campo é desativado).

### 3. Regras opcionais

- **Valor mínimo da sacola** - o desconto só vale se o pedido atingir esse valor.
- **Desconto máximo** - limita o valor máximo do desconto em reais (ex: cupom de 20%, mas no máximo R$ 50).

### 4. Opções

- **Permitir combinação** - se ativado, o cupom pode ser usado junto com promoções de campanha. Se desativado, o sistema escolhe o melhor benefício entre cupom e promoção.
- **Cupom automático** - se ativado, o sistema aplica esse cupom sozinho nas vendas, sem o cliente digitar.

### 5. Escopo

Na aba **Escopo**, defina onde o cupom vale:

- **Aplicar a** - todas as categorias, ou categorias/produtos/serviços específicos.
- **Escopo de clientes** - todos os clientes ou clientes específicos.

### 6. Limites e validade

No painel lateral:

- **Limitar uso total** - quantas vezes o cupom pode ser usado no total.
- **Limitar por cliente** - quantas vezes cada cliente pode usar.
- **Apenas primeira compra** - o cupom vale só para o primeiro pedido do cliente.
- **Validade** - sem limite de data ou com data de início e fim.

### 7. Salvar

Clique em **Salvar**. O cupom aparece na lista e já pode ser usado.

## Dicas importantes

- **Código sem espaços e sem acentos** - evita erro na hora de digitar.
- **"Apenas primeira compra" e "Limitar por cliente" são exclusivos** - ativar um desativa o outro.
- **Teste o cupom** - faça uma venda de teste para conferir se o desconto aplica como esperado.
- **Use o compartilhamento** - após salvar, use o botão de compartilhar para divulgar o link do cupom.

## Problemas comuns

| Problema | Causa | Solução |
|----------|-------|---------|
| Código não aceito | Espaços ou acentos | Recrie sem espaços e sem acentos |
| Desconto não aplica | Valor mínimo da sacola não atingido | Ajuste o valor mínimo ou o pedido |
| Cupom aparece no seletor desabilitado | Escopo não inclui os itens do pedido | Amplie o escopo ou escolha itens elegíveis |
| Cupom não aparece no PDV | Cupom inativo | Ative o cupom na lista |

## Perguntas frequentes

**Posso editar um cupom depois de criar?**
Sim. Na lista, abra o cupom e use **Editar**. Dados como valor, escopo, limites e validade podem ser alterados.

**O que significa "Entrega grátis"?**
O cupom zera o valor do frete do pedido. Não precisa informar valor de desconto.

**Cupom de aniversário é criado aqui?**
O cupom em si é criado aqui com o código que preferir. No módulo **Clientes**, o recurso de aniversário cria o cupom automaticamente com o código **ANIVERSARIO10** e vincula o cliente.
`
            },
            {
                id: "regras-limites-validade-escopo-cupons",
                title: "Regras, limites, validade e escopo dos cupons",
                description: "Entenda como configurar onde o cupom vale, limites de uso, validade e condições da sacola.",
                slug: "regras-limites-validade-escopo-cupons",
                category: "marketing",
                content: `
## Visão geral

Além do tipo de desconto, um cupom tem **regras** que controlam onde ele vale, quem pode usar, quantas vezes e até quando. Configurar bem essas regras evita abusos e protege sua margem.

## Quando utilizar

- Para limitar um cupom a determinados produtos, serviços ou categorias
- Para restringir o cupom a clientes específicos
- Para evitar que o mesmo cliente use o cupom várias vezes
- Para criar cupons de primeira compra
- Para definir valor mínimo de compra

## Como funciona

### Escopo de aplicação (onde vale)

| Escopo | Descrição |
|--------|-----------|
| **Todas as categorias** | Vale para qualquer item da loja |
| **Categorias específicas** | Vale para itens de categorias selecionadas |
| **Produtos específicos** | Vale só para produtos escolhidos |
| **Serviços específicos** | Vale só para serviços escolhidos |

Ao escolher um escopo específico, você seleciona os itens em uma lista com busca. Itens inativos aparecem desabilitados.

### Escopo de clientes (quem pode usar)

- **Todos os clientes** - qualquer pessoa pode usar.
- **Clientes específicos** - somente clientes selecionados podem usar.

### Limites de uso

- **Limite total** - o cupom vale no máximo N usos. Depois disso, o sistema rejeita novos usos com a mensagem "Limite de uso do cupom atingido."
- **Limite por cliente** - cada cliente pode usar no máximo N vezes.
- **Apenas primeira compra** - vale somente para o primeiro pedido do cliente. (Exclusivo com limite por cliente: ativar um desativa o outro.)

### Validade

- **Sem limite de data** - vale indefinidamente.
- **Com datas** - informa **início** e **fim**. Antes do início: "Cupom ainda não está disponível." Depois do fim: "Cupom expirado."

### Condições da sacola

- **Valor mínimo da sacola** - o desconto só vale se o total do pedido atingir o mínimo informado.
- **Desconto máximo** - limita o valor do desconto em reais, mesmo que o percentual calcule mais.

## Dicas importantes

- **Combine valor mínimo com desconto máximo** - exemplo real: cupom de 20% com mínimo de R$ 100 e desconto máximo de R$ 50.
- **Cupom de primeira compra** - ideal para atrair novos clientes sem que os antigos repitam o benefício.
- **Escopo por cliente** - ótimo para bonificar clientes VIP ou reter quem está sumindo.
- **Reveja a validade** - cupons sem data ficam ativos para sempre; defina datas para campanhas temporárias.

## Problemas comuns

| Problema | Causa | Solução |
|----------|-------|---------|
| "Cupom expirado" | Data de fim já passou | Renove a validade ou crie novo cupom |
| "Limite de uso atingido" | Uso total chegou ao limite | Aumente o limite ou crie novo cupom |
| "Este cliente já atingiu o limite" | Cliente já usou o máximo permitido | Ajuste o limite por cliente |
| "Nenhum item da sacola é elegível" | Itens não estão no escopo | Amplie o escopo do cupom |

## Perguntas frequentes

**Um cupom sem escopo definido vale para tudo?**
Sim. Se o escopo é **Todas as categorias** e não há produtos/serviços vinculados, vale para toda a loja.

**Posso ter limite de uso total e por cliente ao mesmo tempo?**
Sim, os dois podem estar ativos juntos.

**"Apenas primeira compra" pode ser usado com "limite por cliente"?**
Não. São exclusivos - ativar um desativa o outro.

**O desconto máximo vale para cupom de valor fixo?**
Se o desconto fixo for menor que o teto, o teto não muda nada. O teto protege principalmente cupons percentuais em pedidos grandes.
`
            },
            {
                id: "cupons-automaticos-e-aplicacao-nas-vendas",
                title: "Cupons automáticos e aplicação nas vendas",
                description: "Como o cupom é aplicado no PDV, nas vendas e no checkout online, e o que são cupons automáticos.",
                slug: "cupons-automaticos-e-aplicacao-nas-vendas",
                category: "marketing",
                content: `
## Visão geral

O cupom pode ser usado de três formas: o **cliente digita o código** (PDV, venda ou vitrine), você **seleciona o cupom** no PDV, ou o sistema aplica **automaticamente** um cupom configurado como automático. Entender esses caminhos evita dúvidas na hora de vender.

## Quando utilizar

- Para aplicar desconto no balcão sem o cliente ter o código
- Para campanhas em que todo cliente ganha o desconto (cupom automático)
- Para garantir que o desconto seja validado corretamente nas vendas

## Como funciona

### No PDV (balcão)

Na tela do PDV, você pode:

- **Digitar o código** - o sistema valida e aplica o desconto.
- **Selecionar o cupom** - abre uma lista de cupons ativos com o formato do benefício (ex: "10% off", "R$ 20 off", "Entrega grátis"). Cupons com restrições aparecem com aviso "Possui restrições".
- **Aplicar automático** - se houver cupom automático válido, o PDV aplica o maior desconto sozinho.

### Nas Vendas (pedidos)

Ao criar ou editar um pedido no módulo Vendas, existe a opção **"Utiliza um cupom de desconto pré-cadastrado"**. Informe o código e o sistema valida e recalcula o total.

### Na vitrine online

O cliente escolhe o cupom na tela de **Cupom de Desconto** do checkout ou digita o código. O sistema mostra:

- O desconto aplicado no resumo ("Desconto do cupom").
- Aviso **"Desconto aplicado a X de Y itens"** quando o cupom vale só para parte da sacola.

### Cupons automáticos

São cupons marcados com a opção **Cupom automático**. O sistema busca os cupons automáticos ativos e **aplica o de maior desconto**, sem o cliente digitar nada. Eles aparecem marcados como **Automático** na lista.

### Combinação com promoções

- Se o cupom tem **Permitir combinação** ativado, ele soma com as promoções de campanha.
- Se **não** tem, o sistema compara os cenários e usa o que der o **menor total para o cliente** (cupom ou promoção, não os dois).

## Dicas importantes

- **Configure apenas cupons automáticos que você quer que valham sempre** - eles aplicam sozinhos em todas as vendas elegíveis.
- **Verifique a validação** - o sistema recalcula o preço com o cupom no momento do pedido, então o total é sempre o correto.
- **No PDV, desconfie de "Possui restrições"** - confira o motivo antes de aplicar.

## Problemas comuns

| Problema | Causa | Solução |
|----------|-------|---------|
| Cupom não aplica no PDV | Cupom com escopo/condição não atendida | Veja o motivo na lista de cupons do PDV |
| Desconto menor que o esperado | Cupom não é combinável com promoção | Ajuste "Permitir combinação" no cupom |
| Dois descontos parecem somados | Cupom combinável + promoção ativa | Confirme a opção de combinação |

## Perguntas frequentes

**O cupom automático exige código?**
Não. O sistema aplica automaticamente o maior desconto entre os cupons automáticos válidos.

**Cupom e promoção podem ser usados juntos?**
Depende da configuração. Se o cupom permite **combinação** e a promoção também, sim. Caso contrário, vale o melhor benefício.

**Onde vejo se o cupom foi aplicado?**
No resumo do pedido aparece a linha de desconto. No PDV, o cupom aplicado fica indicado na tela com opção de remover.
`
            },
            {
                id: "compartilhamento-e-uso-dos-cupons",
                title: "Compartilhamento e uso dos cupons",
                description: "Divulgue cupons por link, veja-os na vitrine e use o cupom de aniversário com clientes.",
                slug: "compartilhamento-e-uso-dos-cupons",
                category: "marketing",
                content: `
## Visão geral

Cupom não serve só no balcão. Você pode **compartilhar um link** do cupom, o cliente vê os cupons na página do seu negócio, e o módulo de Clientes gera **cupom de aniversário** automaticamente.

## Quando utilizar

- Para divulgar uma promoção no WhatsApp e redes sociais
- Para deixar cupons visíveis na vitrine online
- Para bonificar clientes no aniversário deles

## Como funciona

### Compartilhar por link

Na lista de cupons, use a ação **Compartilhar**. O sistema gera um link público que já traz o cupom preenchido para o cliente. Você cola esse link no WhatsApp, e-mail ou rede social.

### Cupons na vitrine

Cupons ativos aparecem na seção **"Cupons do vendedor"** da página do seu negócio na vitrine. O cliente vê o código e o benefício (ex: "BEMVINDO15 - 15% OFF") e pode usá-lo no checkout. Cupons com restrições mostram o pedido mínimo, o desconto máximo ou a primeira compra.

### Cupom de aniversário

No módulo **Clientes**, quando um cliente tem data de nascimento cadastrada e você está no plano Crescer, aparece um card de aniversário com ações:

- **Criar cupom** - abre a tela de cupons já preenchida com código **ANIVERSARIO10** e o cliente vinculado.
- **Enviar WhatsApp** - abre uma conversa com o cupom no texto.
- **Enviar notificação** - envia uma notificação (uma vez por ano).

### Uso registrado

Cada uso do cupom fica registrado. Você acompanha no **detalhe do cupom** (usos realizados) e no **Relatório de Marketing** (cupons mais usados e taxa de uso).

## Dicas importantes

- **Divulgue com link, não só com código** - o link já leva o cliente direto ao cupom.
- **Use o aniversário para reativar clientes** - uma cortesia no aniversário aumenta as chances de recompra.
- **Confira o uso no relatório** - veja quais cupons performaram e invista nos que trazem resultado.

## Perguntas frequentes

**O link do cupom funciona sem o cliente estar cadastrado?**
Sim, o link leva à vitrine com o cupom indicado. Para cupons de primeira compra, o sistema valida no momento do pedido.

**Todo cupom ativo aparece na vitrine?**
Cupons ativos e com escopo aplicável aparecem na seção de cupons da sua página. Alguns podem aparecer como disponíveis no checkout conforme os itens do pedido.

**O cupom de aniversário tem desconto fixo?**
O padrão é **ANIVERSARIO10** (10%). Você pode editar o cupom depois para ajustar valor, regras e validade.

**Posso ver quantas vezes um cupom foi usado?**
Sim. No detalhe do cupom há o contador de usos realizados, e no Relatório de Marketing o ranking de cupons mais usados.
`
            },
            {
                id: "visao-geral-campanhas-promocoes",
                title: "Visão geral de Campanhas e Promoções",
                description: "Entenda como funcionam campanhas e promoções: desconto automático, brinde e Leve X Pague Y.",
                slug: "visao-geral-campanhas-promocoes",
                category: "marketing",
                content: `
## Visão geral

**Campanhas e Promoções** aplicam descontos e benefícios de forma **automática** nas suas vendas - sem depender de código digitado. Você cria uma **campanha** (o período e o público) e adiciona **promoções** (as regras de desconto, brinde ou Leve X Pague Y) a ela.

![Tela principal de Campanhas e Promoções](https://img.dudit.com.br/static/screens/Campanhas_VisaoGeral.png)
Legenda: Lista de campanhas com status, vigência e a primeira regra de cada uma.

## Estrutura: campanha + promoção

- **Campanha** - é o guarda-chuva: nome, período de vigência, público (todos os clientes ou segmentado) e loja.
- **Promoção (regra)** - é o benefício em si: desconto, brinde ou Leve X Pague Y, com escopo, condições e limites. Uma campanha pode ter mais de uma promoção.

## Tipos de promoção

| Tipo | O que faz | Exemplo |
|------|-----------|---------|
| **Desconto percentual** | Aplica um % de desconto | 10% OFF em uma categoria |
| **Desconto fixo (R$)** | Aplica um valor em reais | R$ 20 OFF acima de R$ 100 |
| **Brinde** | Dá um produto ou serviço grátis | Ganhe um brinde na compra |
| **Leve X Pague Y** | Reduz o preço de unidades | Leve 3, Pague 2 |

## Onde a promoção aparece

- **PDV** - o desconto aplica sozinho na pré-venda; o cliente vê o preço promocional.
- **Vendas/Ordens** - vale na criação e edição de pedidos.
- **Vitrine online** - mostra o preço "de/por", o nome da promoção e o bloco "Brinde Incluso".
- **Checkout** - brindes aparecem como itens grátis ("Você ganhou este brinde").

## Quando utilizar

- Para campanhas sazonais (Black Friday, Dia das Mães, queima de estoque)
- Para incentivar compras acima de um valor
- Para presentear o cliente com um brinde
- Para escoar estoque com Leve X Pague Y

## Dicas importantes

- **Aplicação automática** - o desconto entra sozinho, sem código. Isso reduz atrito na compra.
- **Confira a vigência** - a promoção só vale dentro do período da campanha.
- **Atenção ao escopo** - defina se vale para toda a sacola, produtos, categorias ou serviços.

## Perguntas frequentes

**Qual a diferença entre campanha e promoção?**
A campanha organiza (período, público, nome). A promoção é a regra de desconto/brinde dentro dela.

**Promoção precisa de cupom?**
Não. Promoção é automática. Se quiser um benefício por código, use **Cupons** (módulo ao lado).

**Uma campanha pode ter várias promoções?**
Sim. Uma campanha pode conter várias regras, e cada uma pode ter escopo e condições próprias.

**Em que plano estão disponíveis?**
Campanhas e Promoções exigem o plano **Escalar** ou superior.
`
            },
            {
                id: "como-criar-campanha",
                title: "Como criar uma campanha e suas promoções",
                description: "Passo a passo para criar uma campanha e adicionar as promoções de desconto, brinde ou Leve X Pague Y.",
                slug: "como-criar-campanha",
                category: "marketing",
                content: `
## Visão geral

Criar uma promoção acontece em duas etapas: você informa os dados da **campanha** (nome, período e público) e depois configura a **regra** (o desconto ou brinde). O formulário guia os dois passos.

## Quando utilizar

- Ao lançar uma nova campanha de vendas
- Para aplicar um desconto automático em produtos ou categorias
- Para oferecer brinde ou Leve X Pague Y

## Como fazer

### 1. Abrir o cadastro

No menu **Marketing > Campanhas e Promoções**, clique em **Nova campanha** (ou **Adicionar**).

### 2. Dados da campanha

- **Nome** - ex: "Queima de estoque de inverno".
- **Descrição** (opcional) - contexto interno.
- **Vigência** - data de início e fim da campanha.
- **Público** - **Todos os clientes** ou **Segmentado** (selecione clientes específicos).
- **Loja** - em multi-loja, escolha a loja ou deixe para toda a rede.

### 3. Configurar a promoção (regra)

- **Tipo** - Desconto, Brinde ou Leve X Pague Y.
- **Valores** - percentual ou valor em reais (e teto, se quiser).
- **Condições** - valor mínimo de compra, prioridade de execução, limites de uso.
- **Escopo** - Toda a sacola, Produtos específicos, Categorias específicas ou Serviços específicos.
- **Combinação** - "Permitir uso combinado com cupons de desconto" (opcional).

### 4. Ativar e salvar

A campanha nasce com a opção **"Campanha ativa e disponível"**. Salve para publicar. Enquanto estiver dentro da vigência, a promoção aplica automaticamente.

## Exemplo prático: campanha de 10% em uma categoria

1. Nome: "Promoção de outono".
2. Vigência: mês atual.
3. Tipo: **Desconto percentual**, valor **10%**.
4. Escopo: **Categorias específicas** → selecione a categoria "Blusas".
5. Salve. Toda venda de blusas na vigência aplica 10% automaticamente.

## Dicas importantes

- **Use nomes claros** - facilita identificar a campanha na lista e nos relatórios.
- **Defina a vigência** - sem datas, a campanha fica ativa indefinidamente.
- **Duplique campanhas** - o formulário tem opção de duplicar, ótima para repetir promoções que deram certo.

## Problemas comuns

| Problema | Causa | Solução |
|----------|-------|---------|
| Promoção não aplica | Fora da vigência ou campanha inativa | Confira as datas e o status |
| Desconto fixo não aparece | Faltou valor mínimo de compra | Informe o mínimo na regra |
| Itens não elegíveis | Escopo não inclui os itens | Amplie o escopo |

## Perguntas frequentes

**Posso adicionar mais de uma promoção à mesma campanha?**
Sim. Você pode criar várias regras na mesma campanha, cada uma com seu escopo e condições.

**Como editar uma campanha existente?**
Abra a campanha na lista e use **Editar**. Dados da campanha e das regras podem ser ajustados.

**O que é duplicar campanha?**
Cria uma cópia da campanha com as regras, para você ajustar datas e valores rapidamente.
`
            },
            {
                id: "tipos-de-promocao",
                title: "Tipos de promoção",
                description: "Conheça os quatro tipos: desconto percentual, desconto fixo, brinde e Leve X Pague Y, com exemplos.",
                slug: "tipos-de-promocao",
                category: "marketing",
                content: `
## Visão geral

As promoções automáticas têm **quatro tipos**. Cada um atende um objetivo de venda diferente. Entender as regras de cada tipo ajuda a montar campanhas eficientes.

## 1. Desconto percentual

Aplica um percentual de desconto no escopo definido.

- **Quando usar**: campanhas de % off em produtos ou categorias.
- **Configuração**: tipo **Percentual**, valor (ex: 10) e teto opcional (desconto máximo em reais).
- **Exemplo**: 10% OFF em toda a categoria "Acessórios". Comprou R$ 200 em acessórios → desconto de R$ 20 (ou o teto, se configurado).

## 2. Desconto fixo (R$)

Aplica um valor em reais de desconto.

- **Quando usar**: campanhas de valor fixo com mínimo de compra.
- **Configuração**: tipo **Fixo**, valor (ex: 20) e **valor mínimo de compra obrigatório** (ex: mínimo R$ 100).
- **Exemplo**: R$ 20 OFF em compras acima de R$ 100.

## 3. Brinde

Oferece um produto ou serviço grátis na compra.

- **Quando usar**: para presentear o cliente e incentivar a compra.
- **Configuração**: selecione o **brinde** (produto OU serviço).
- **Como funciona**: o brinde entra como item no pedido, marcado como "BRINDE", com valor zero. Se o brinde não tiver estoque, o sistema registra o "brinde pulado" e não o adiciona.
- **Exemplo**: "Na compra de qualquer tênis, ganhe uma meia". O item "BRINDE - Meia" entra grátis no carrinho.

## 4. Leve X Pague Y

Reduz o preço das unidades quando o cliente leva uma quantidade.

- **Quando usar**: para escoar estoque e incentivar compras em volume.
- **Configuração**: **Leve** (quantidade de compra) e **Pague** (quantidade paga). A compra deve ser maior que a paga (ex: Leve 3, Pague 2).
- **Como funciona**: as unidades mais baratas do item ficam grátis.
- **Exemplo**: "Leve 3, Pague 2" em sucos. Comprou 3 → 1 sai grátis (a mais barata).

## Resumo

| Tipo | Benefício | Pré-requisito |
|------|-----------|---------------|
| Percentual | % OFF | - |
| Fixo | R$ OFF | Valor mínimo de compra |
| Brinde | Item grátis | Selecionar brinde (produto/serviço) |
| Leve X Pague Y | Unidades grátis | Leve > Pague |

## Dicas importantes

- **Brinde depende de estoque** - se o brinde está sem estoque ou inativo, ele é pulado automaticamente.
- **Leve X Pague Y exige compra maior que pagamento** - o formulário bloqueia configurações inválidas.
- **Combine tipos numa mesma campanha** - por exemplo, desconto de 10% + brinde para um determinado público.

## Perguntas frequentes

**Posso ter desconto percentual e brinde na mesma compra?**
Sim, se forem promoções diferentes da mesma campanha (ou de campanhas combináveis), os benefícios podem se somar conforme as regras.

**Brinde entra como item pago?**
Não. Entra como item grátis, marcado como "BRINDE", com valor zero no pedido.

**No Leve X Pague Y, qual unidade fica grátis?**
As mais baratas. O sistema deixa grátis as unidades de menor preço para o cliente aproveitar o melhor benefício.
`
            },
            {
                id: "condicoes-prioridade-e-limites-promocoes",
                title: "Condições, prioridade e limites das promoções",
                description: "Escopo, valor mínimo, prioridade de execução, limites de uso e sobreposição entre promoções.",
                slug: "condicoes-prioridade-e-limites-promocoes",
                category: "marketing",
                content: `
## Visão geral

Além do tipo de benefício, cada promoção tem **condições** que controlam quando ela vale: escopo, valor mínimo, prioridade, limites e a regra contra sobreposição.

## Escopo de aplicação

| Escopo | O que significa |
|--------|-----------------|
| **Toda a sacola** | Aplica em qualquer item do pedido |
| **Produtos específicos** | Só nos produtos selecionados |
| **Categorias específicas** | Só em itens das categorias escolhidas |
| **Serviços específicos** | Só nos serviços escolhidos |

## Condições

- **Valor mínimo de compra (R$)** - a promoção só vale se o total do pedido atingir o mínimo. Obrigatório para desconto fixo.
- **Prioridade de execução** - quando várias promoções são elegíveis, o sistema aplica a de **maior prioridade**; em empate, a de maior desconto.

## Limites de uso

- **Limite global de usos** - quantas vezes a promoção pode ser usada no total.
- **Limite de usos por cliente** - quantas vezes cada cliente pode aproveitar.

Quando o limite global é atingido, a promoção deixa de ser oferecida.

## Regra de sobreposição

O sistema **impede** que duas promoções ativas cubram o mesmo item/escopo no mesmo período. Ao ativar ou editar uma promoção, ele verifica se já existe outra promoção ativa do mesmo tipo no mesmo intervalo:

- **Toda a sacola** sempre conflita com qualquer escopo.
- **Categoria × categoria** conflita quando os itens se sobrepõem.
- **Produto × produto** conflita quando há produto em comum.
- Um produto dentro de uma categoria com promoção também é considerado conflito.

Se houver conflito, você recebe o aviso: *"O item/escopo selecionado já possui uma promoção de {desconto|brinde|Leve X Pague Y} ativa no mesmo período"*.

## Quando utilizar

- Para limitar a promoção a um público ou a itens específicos
- Para definir qual desconto prevalece quando houver mais de uma regra
- Para controlar o custo da campanha com limites de uso

## Dicas importantes

- **Use prioridade para organizar regras** - se duas regras podem valer, a de maior prioridade vence.
- **Defina limites de uso** para evitar custo fora de controle.
- **Respeite a sobreposição** - em vez de criar regras que se sobrepõem, amplie o escopo de uma única regra.

## Perguntas frequentes

**Posso ter duas promoções na mesma campanha cobrindo o mesmo produto?**
Não. O sistema impede sobreposição no mesmo período. Use prioridade e escopos distintos.

**O que acontece se eu aumentar a prioridade de uma promoção?**
Ela passa a vencer quando há mais de uma regra elegível no mesmo item.

**Promoção com limite de uso esgotado continua ativa?**
A regra deixa de ser aplicada até você aumentar o limite ou reabrir a campanha.
`
            },
            {
                id: "combinacao-promocoes-e-cupons",
                title: "Combinação de promoções e cupons",
                description: "Como o sistema decide entre promoção e cupom: pilha de descontos, prioridade e a regra de combinação.",
                slug: "combinacao-promocoes-e-cupons",
                category: "marketing",
                content: `
## Visão geral

Promoções (automáticas) e cupons (por código) podem coexistir. A forma como eles se combinam depende da configuração de **combinação** da promoção e do cupom. Entender essa lógica evita surpresas no total do pedido.

## Quando utilizar

- Para permitir que cupom e promoção sejam usados juntos (pilha de descontos)
- Para impedir descontos acumulados que estouram sua margem
- Para criar campanhas em que o melhor benefício é escolhido automaticamente

## Como funciona

### Combinação permitida

Quando a promoção tem **"Permitir uso combinado com cupons de desconto"** ativado **e** o cupom também permite combinação, os dois benefícios se somam.

**Exemplo**: promoção de 10% na categoria + cupom de 10% → o cliente acumula até 20% (limitado por tetos e condições).

### Combinação não permitida

Quando a combinação não é permitida, o sistema calcula **dois cenários**:

- **Cenário A** - mantém a promoção e aplica o cupom.
- **Cenário B** - descarta a promoção nos itens elegíveis e aplica o cupom sobre o preço original.

O sistema escolhe o cenário que der o **menor total para o cliente** - na prática, o maior desconto.

### Prioridade entre promoções

Quando várias promoções são elegíveis para o mesmo item, vence a de **maior prioridade** (empate → maior desconto). A promoção vencida não é aplicada naquele item.

## Dicas importantes

- **Combinação = margem em risco** - use com critério e defina tetos de desconto.
- **Para descontos altos em datas especiais** - desative a combinação para garantir que o cliente escolha entre cupom e promoção, não os dois.
- **Confira no PDV** - o resumo mostra o desconto aplicado e de qual origem (promoção, cupom ou manual).

## Problemas comuns

| Problema | Causa | Solução |
|----------|-------|---------|
| Desconto acumulado menor que o esperado | Combinação desativada | Compare no detalhe o desconto aplicado |
| Cupom "anula" a promoção | Cenário B venceu (maior desconto) | Comportamento correto: melhor benefício |
| Dois descontos somados | Combinação ativa nos dois | Confira as configurações |

## Perguntas frequentes

**Como sei se promoção e cupom vão somar?**
Se ambos permitem **combinação**, somam. Se a promoção não permite, o sistema usa o melhor benefício entre os dois.

**O desconto manual do ERP também soma?**
Sim. O desconto manual aplicado pelo vendedor é calculado em etapa própria e soma ao total de descontos.

**Posso configurar um cupom para nunca combinar com promoção?**
Sim. Deixe a promoção sem "Permitir uso combinado" e/ou o cupom sem "Permitir combinação".
`
            },
            {
                id: "promocoes-na-vitrine-e-pdv",
                title: "Promoções na vitrine e no PDV",
                description: "Como o cliente enxerga a promoção na loja online e como ela aparece no balcão.",
                slug: "promocoes-na-vitrine-e-pdv",
                category: "marketing",
                content: `
## Visão geral

Quando uma promoção está ativa, ela aparece de formas diferentes para o cliente online e para você no balcão. Saber o que cada lado enxerga ajuda a comunicar a campanha com clareza.

## Na vitrine online (loja online)

- **Preço "de/por"** - o item mostra o preço original riscado e o preço promocional, com o percentual de desconto.
- **Badge da promoção** - aparece o nome da promoção no item.
- **Brinde Incluso** - se a promoção é de brinde, aparece o bloco "Brinde Incluso" na página do produto/serviço.
- **No checkout** - os brindes entram como itens grátis com a marcação "Você ganhou este brinde".
- **Página do produto** - mostra o desconto aplicado e de onde veio (promoção da campanha).

## No PDV (balcão)

- O desconto aplica **automaticamente** na pré-venda, conforme as regras.
- O item exibe o **preço promocional** no carrinho.
- Itens de brinde aparecem com a tag "BRINDE".
- O resumo do pedido mostra um badge **"Pedido com brinde"** quando há brinde no carrinho.
- Você pode conferir o cálculo total do pedido com as promoções aplicadas.

## Nas Vendas (ordens)

A mesma lógica vale na criação e edição de pedidos do módulo Vendas: promoções ativas entram no cálculo e brindes são adicionados automaticamente.

## Quando utilizar

- Para conferir se a campanha está aparecendo corretamente online
- Para explicar ao cliente o preço "de/por" e o brinde no balcão
- Para validar o total do pedido com as promoções aplicadas

## Dicas importantes

- **Comunique o preço "de/por"** - clientes respondem bem a descontos visíveis.
- **Confira o brinde no checkout** - o item grátis deve aparecer no carrinho e na nota.
- **Aviso de brinde sem estoque** - se o brinde esgotou, ele é pulado automaticamente e o pedido segue sem o brinde.

## Perguntas frequentes

**O cliente vê o nome da minha promoção online?**
Sim, quando a promoção está ativa, o nome dela aparece como badge no item.

**O brinde aparece na nota do pedido?**
Sim. Entra como item "BRINDE" com valor zero.

**Se o brinde esgotar, o cliente é bloqueado de comprar?**
Não. O brinde é pulado (registrado como "brinde pulado") e o pedido continua normal, sem o item grátis.
`
            },
            {
                id: "edicao-em-massa-de-promocoes",
                title: "Edição em massa de promoções",
                description: "Ative, desative, ajuste vigência, público, limites e prioridade de várias campanhas de uma vez.",
                slug: "edicao-em-massa-de-promocoes",
                category: "marketing",
                content: `
## Visão geral

A **edição em massa** permite atualizar várias campanhas ao mesmo tempo - mudar o período de validade, o público, os limites de uso ou a prioridade sem abrir uma por uma.

## Quando utilizar

- Para estender ou encurtar a vigência de várias campanhas
- Para mudar o público de várias campanhas de uma vez
- Para padronizar limites de uso e prioridade

## Como fazer

1. Na lista de **Campanhas e Promoções**, selecione as campanhas desejadas (checkboxes).
2. Use a ação de **editar em massa**.
3. Escolha o que alterar:

| Opção | O que ajusta |
|-------|--------------|
| **Validade** | Data de início e/ou fim |
| **Público** | Todos os clientes ou segmentado (selecionar clientes) |
| **Limites** | Prioridade, valor mínimo, limite global e limite por cliente |
4. Salve. As alterações se aplicam a todas as campanhas selecionadas.

## Ativar/desativar em massa

Você também pode **ativar** ou **desativar** várias campanhas de uma vez. Ao ativar, o sistema revalida se não há sobreposição com outras campanhas ativas.

## Excluir em massa

Selecione as campanhas e exclua todas juntas. A exclusão é permanente.

## Dicas importantes

- **Confira a seleção** antes de aplicar - a edição em massa afeta todas as campanhas marcadas.
- **Ao ativar em massa** - atenção ao aviso de sobreposição; campanhas conflitantes não são ativadas.
- **Limites em massa** - útil para padronizar o custo de várias campanhas no mesmo valor.

## Perguntas frequentes

**A edição em massa altera as regras de desconto?**
Depende. Ela altera vigência, público, prioridade e limites. Para mudar o tipo de desconto ou escopo, edite a promoção individualmente.

**Posso desfazer uma edição em massa?**
Não há desfazer automático. Revise antes de salvar.

**O que acontece se uma campanha selecionada conflitar com outra ao ativar?**
Ela não é ativada e o sistema mostra o motivo.
`
            },
            {
                id: "visao-geral-videos-comunidade",
                title: "Visão geral de Vídeos da Comunidade",
                description: "Vídeos curtos vinculados a produtos, serviços ou coleções, exibidos na página Explorar da vitrine.",
                slug: "visao-geral-videos-comunidade",
                category: "marketing",
                content: `
## Visão geral

**Vídeos da Comunidade** são vídeos curtos (de 10 a 60 segundos) que você publica vinculados a um **produto, serviço ou coleção**. Eles aparecem em um carrossel na página **Explorar** da vitrine, e quem assiste pode tocar no item para ver a página dele.

![Tela de Vídeos da Comunidade](https://img.dudit.com.br/static/screens/Videos_VisaoGeral.png)
Legenda: Lista de vídeos com status, visualizações, cliques e data de publicação.

## O que você encontra no módulo

**Lista de vídeos** - cada linha mostra o vídeo, o status, as visualizações, os cliques e a data.

**Abas de status** - quatro abas:

| Aba | O que mostra |
|-----|--------------|
| **Todos** | Todos os vídeos |
| **Pendentes** | Aguardando aprovação |
| **Aprovados** | Publicados na vitrine |
| **Rejeitados** | Recusados na moderação (inclui sinalizados) |

**Busca** - por título ou descrição.

**Visualização** - lista (tabela) ou grade de cards, com miniatura e duração.

## Quando utilizar

- Para mostrar o produto em uso (vídeo demonstrando o item)
- Para apresentar o serviço (antes e depois, ambiente)
- Para destacar uma coleção inteira
- Para gerar engajamento na vitrine e aumentar cliques para produtos

## Limites por plano

| Plano | Limite |
|-------|--------|
| Crescer | **1 vídeo por mês** |
| Escalar | **1 vídeo por semana** |

O plano Free não tem acesso ao módulo.

## Como funciona

1. Você cadastra o vídeo com título, descrição e o arquivo (ou link do YouTube/Vimeo).
2. Opcionalmente vincula um produto, serviço ou coleção.
3. O vídeo entra em **Pendente** (moderação automática).
4. Após aprovação, fica **Aprovado** e aparece no carrossel da vitrine.
5. A cada reprodução e clique, o sistema registra as métricas.

## Dicas importantes

- **Vídeos entre 10 e 60 segundos** - mais curtos engajam melhor e respeitam o limite.
- **Sempre vincule um item** - o vídeo sem vínculo não direciona o cliente para a compra.
- **Capriche na capa** - a miniatura é gerada automaticamente a partir do vídeo.

## Perguntas frequentes

**Onde o cliente vê meus vídeos?**
Na página **Explorar** da vitrine, no carrossel "Vídeos da comunidade".

**Posso postar mais de um vídeo por mês?**
No plano Crescer, o limite é 1 por mês. No Escalar, 1 por semana.

**Meu vídeo aparece imediatamente?**
Não. Ele passa pela moderação e aparece na vitrine apenas quando **aprovado**.
`
            },
            {
                id: "como-cadastrar-video",
                title: "Como cadastrar um vídeo",
                description: "Upload de vídeo (MP4, WebM, MOV), link do YouTube/Vimeo e vínculo com produto, serviço ou coleção.",
                slug: "como-cadastrar-video",
                category: "marketing",
                content: `
## Visão geral

Cadastrar um vídeo da comunidade é rápido: você informa o título, adiciona o vídeo (upload ou link) e, se quiser, vincula a um produto, serviço ou coleção.

## Quando utilizar

- Para publicar o primeiro vídeo da sua loja
- Para trocar o vídeo vinculado a um item
- Para editar título ou descrição de um vídeo existente

## Como fazer

### 1. Abrir o cadastro

No menu **Marketing > Vídeos da Comunidade**, clique em **Novo vídeo**.

### 2. Preencher os dados

- **Título** (obrigatório) - até 200 caracteres.
- **Descrição** (opcional) - até 1.000 caracteres.
- **Vídeo** - escolha a fonte:

### 3. Escolher a fonte do vídeo

| Fonte | Como funciona |
|-------|---------------|
| **Upload** | Envie um arquivo MP4, WebM ou MOV, de **10 a 60 segundos**. A miniatura é gerada automaticamente. |
| **YouTube** | Cole o link do vídeo. O sistema busca duração e miniatura. |
| **Vimeo** | Cole o link do vídeo. O sistema busca duração e miniatura. |

### 4. Vincular um item (opcional, recomendado)

- **Produto vinculado** - selecione um produto da sua loja.
- **Serviço vinculado** - selecione um serviço.
- **Link da coleção** - informe o endereço da coleção.

O item vinculado aparece no player para o cliente ir direto à página da compra.

### 5. Salvar

Clique em **Criar vídeo**. Ele entra em **Pendente** para moderação.

## Editar um vídeo

Para vídeos existentes, você pode alterar **apenas o título e a descrição**. O arquivo e o vínculo não são editáveis.

## Dicas importantes

- **Formatos aceitos**: MP4, WebM e MOV.
- **Duração ideal**: entre 10 e 60 segundos - acima disso o cadastro é bloqueado.
- **Vincule sempre um produto/serviço** - aumenta as chances de clique e venda.
- **Arquivos grandes são comprimidos** automaticamente para caber nos limites.

## Problemas comuns

| Problema | Causa | Solução |
|----------|-------|---------|
| Upload recusado | Formato ou duração fora do limite | Use MP4/WebM/MOV de 10 a 60s |
| Miniatura não gerada | Falha na captura do frame | Tente novamente ou use um trecho com imagem estável |
| Link do YouTube não carrega | URL inválida | Confira se é um link de vídeo válido |

## Perguntas frequentes

**O título pode ser alterado depois?**
Sim. Título e descrição são editáveis. O vídeo em si não.

**Preciso vincular um produto?**
Não é obrigatório, mas é recomendado. Sem vínculo, o cliente só assiste ao vídeo.

**Posso usar um vídeo do YouTube já publicado?**
Sim, basta colar o link. O sistema valida duração e miniatura.
`
            },
            {
                id: "status-e-moderecao-de-videos",
                title: "Status e moderação dos vídeos",
                description: "Entenda os status (pendente, aprovado, rejeitado, sinalizado) e o fluxo de moderação dos vídeos.",
                slug: "status-e-moderecao-de-videos",
                category: "marketing",
                content: `
## Visão geral

Todo vídeo da comunidade passa por **moderação** antes de aparecer na vitrine. Isso garante que o conteúdo publicado siga as regras da plataforma. Entender os status evita dúvidas sobre por que um vídeo ainda não apareceu.

## Status dos vídeos

| Status | O que significa |
|--------|-----------------|
| **Pendente** | Vídeo enviado, aguardando análise |
| **Aprovado** | Publicado e visível na vitrine |
| **Rejeitado** | Não aprovado, com motivo informado |
| **Sinalizado** | Marcado por violar as regras; tratado como rejeitado na lista |

## Fluxo de moderação

1. **Você cadastra** o vídeo com título e descrição.
2. O sistema faz uma **moderação automática** do texto e envia o vídeo para **Pendente**.
3. A equipe de moderação da plataforma **aprova** ou **rejeita** o vídeo.
4. **Aprovado** → o vídeo ganha data de publicação e aparece na página Explorar.
5. **Rejeitado** → o vídeo não aparece e o motivo fica registrado.

## Quando utilizar

- Para acompanhar por que um vídeo não apareceu na vitrine
- Para entender os motivos de rejeição e corrigir no próximo vídeo
- Para saber quantos vídeos ativos você tem publicados

## Como funciona na prática

- A aba **Pendentes** mostra o que ainda aguarda análise.
- A aba **Rejeitados** mostra os vídeos recusados (incluindo os sinalizados).
- Você pode **excluir** um vídeo a qualquer momento, mesmo pendente.

## Dicas importantes

- **Revise o conteúdo antes de enviar** - título, descrição e material dentro das regras passam mais rápido.
- **Rejeitado não é o fim** - corrija o que foi apontado e cadastre um novo vídeo dentro do seu limite mensal.
- **Vídeos sinalizados** contam como rejeitados e não aparecem na vitrine.

## Perguntas frequentes

**Quanto tempo leva a moderação?**
Varia conforme a fila de análise. Enquanto isso, o vídeo fica em **Pendente**.

**Posso excluir um vídeo pendente?**
Sim. Excluir é permitido em qualquer status.

**Um vídeo rejeitado pode ser reenviado?**
O vídeo em si não é editável. Você cadastra um novo vídeo, já ajustado, respeitando o limite do plano.

**Por que meu vídeo ficou sinalizado?**
A sinalização indica que o conteúdo chamou atenção por potencial violação das regras. A lista o trata junto com os rejeitados.
`
            },
            {
                id: "metricas-e-visibilidade-videos",
                title: "Métricas e visibilidade dos vídeos",
                description: "Visualizações, cliques e onde os vídeos aparecem na vitrine para o cliente final.",
                slug: "metricas-e-visibilidade-videos",
                category: "marketing",
                content: `
## Visão geral

Os vídeos da comunidade geram duas métricas principais: **visualizações** (quando alguém reproduz o vídeo) e **cliques** (quando alguém toca no produto/serviço vinculado). Elas aparecem na lista de vídeos e ajudam a medir o interesse.

## Quando utilizar

- Para saber quais vídeos geram mais engajamento
- Para comparar o desempenho entre vídeos
- Para decidir em qual produto investir em vídeo

## Como funciona

### Visualizações

Cada vez que um cliente abre e reproduz o vídeo na vitrine, o contador de **visualizações** aumenta. A coluna na lista mostra esse número.

### Cliques

Quando o cliente toca no **item vinculado** (produto, serviço ou coleção) dentro do player, o contador de **cliques** aumenta. Isso indica o quanto o vídeo está levando as pessoas para a página do item.

### Visibilidade na vitrine

- Os vídeos **aprovados** aparecem no carrossel **"Vídeos da comunidade"** da página Explorar.
- O card mostra a miniatura, a duração, o título e o nome da loja.
- Ao tocar, abre o **player** com o vídeo, a descrição e o **card do item vinculado** (imagem, nome, preço e botão para ver o produto/serviço).

## Dicas importantes

- **Vídeo com vínculo rende cliques** - sem item vinculado, o cliente só assiste e não tem para onde ir.
- **Monitore os cliques** - alto clique indica que o vídeo vende; alto clique baixo, que o item não está atrativo.
- **Compare vídeos** - repita o formato dos vídeos com melhor desempenho.

## Perguntas frequentes

**O que conta como visualização?**
A reprodução do vídeo pelo cliente na vitrine.

**O que conta como clique?**
O toque no item vinculado (produto/serviço/coleção) dentro do player do vídeo.

**Os vídeos aparecem em todas as páginas da vitrine?**
Eles aparecem no carrossel da página **Explorar**. É lá que o cliente navega pelos vídeos da comunidade.

**O vídeo precisa estar aprovado para aparecer?**
Sim. Somente vídeos **aprovados** são exibidos na vitrine.
`
            },
            {
                id: "relatorio-marketing",
                title: "Relatório de Marketing",
                description: "Faturamento por canal, cupons mais usados, taxa de uso e campanhas ativas em um só painel.",
                slug: "relatorio-marketing",
                category: "marketing",
                content: `
## Visão geral

O **Relatório de Marketing** resume o desempenho das suas ações de divulgação: quanto você faturou, de qual canal vieram as vendas, quais cupons foram mais usados e quantas campanhas estão ativas.

![Relatório de Marketing](https://img.dudit.com.br/static/screens/Relatorio_Marketing.png)
Legenda: Painel com indicadores de faturamento, canal de origem, cupons e campanhas.

## Indicadores

| Indicador | O que mostra |
|-----------|--------------|
| **Faturamento** | Total vendido no período |
| **Top Canal** | Canal que mais vendeu e o % do total |
| **Cupons** | Quantidade de cupons ativos |
| **Uso de Cupons** | Taxa de uso dos cupons (%) |
| **Campanhas** | Quantas campanhas estão ativas (de um total) |

## O que você encontra

- **Gráfico "Faturamento por Canal"** - pizza com a participação de cada canal de origem (ex: PDV/Presencial, Vitrine Online, Outros).
- **Evolução** - linha do faturamento dividido em **online**, **presencial** e **outros** ao longo do período.
- **Cupons mais usados** - ranking com a quantidade de usos e o tipo de desconto.
- **Campanhas** - cards com o nome e o status (ativa/inativa).
- **Exportação** - botão para baixar o relatório em planilha (CSV ou Excel).

## Como acessar

1. No menu lateral, acesse **Relatórios**.
2. Selecione a aba **Marketing**.
3. Ajuste o período desejado.
4. Use a exportação para compartilhar com sua equipe ou contador.

## Quando utilizar

- No fim do mês, para avaliar o resultado das campanhas
- Para saber qual canal traz mais resultado e investir nele
- Para medir se os cupons estão sendo usados (e se a margem aguenta)

## Dicas importantes

- **Compare períodos** - veja o efeito de uma campanha comparando antes/durante/depois.
- **Alta taxa de uso de cupons pode apertar a margem** - o sistema sugere atenção quando mais de 30% dos pedidos usam cupom.
- **Canal dominante** - se um canal representa muito do faturamento, diversifique para reduzir o risco.

## Perguntas frequentes

**Preciso do módulo de vendas ativo para ver o relatório?**
Sim. A aba Marketing exige o módulo de vendas/produtos ativo.

**O relatório considera transferências e ajustes financeiros?**
Não. Ele usa as vendas registradas, classificadas pelo canal de origem.

**Posso exportar o relatório?**
Sim. Use a exportação para baixar os indicadores em planilha.

**Em que plano o relatório está disponível?**
Relatórios exigem o plano **Crescer** ou superior.
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

