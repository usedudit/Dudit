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
    }
]

export function getArticleBySlug(slug: string): HelpArticle | undefined {
    for (const cat of helpCategories) {
        const art = cat.articles.find(a => a.slug === slug)
        if (art) return art
    }
    return undefined
}
