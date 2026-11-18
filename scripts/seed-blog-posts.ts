// @ts-nocheck
/**
 * Cria (ou atualiza) os posts de exemplo do Blog do Dino.
 *
 * Uso:
 *   npm run seed:blog
 *
 * Requer NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
 * O upsert usa o slug como chave, então pode ser executado novamente sem
 * duplicar artigos.
 */
import { createClient } from "@supabase/supabase-js"
import fs from "node:fs"
import path from "node:path"

function loadEnv() {
  const paths = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
  ]

  for (const envPath of paths) {
    if (!fs.existsSync(envPath)) continue
    const envContent = fs.readFileSync(envPath, "utf-8")
    envContent.split("\n").forEach((line) => {
      const trimmedLine = line.trim()
      if (!trimmedLine || trimmedLine.startsWith("#")) return
      const [key, ...valueParts] = trimmedLine.split("=")
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join("=").trim().replace(/^["']|["']$/g, "")
      }
    })
  }
}

loadEnv()

function daysAgo(days) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

const posts = [
  {
    slug: "como-evitar-golpes-ao-vender-pelo-whatsapp",
    title: "Como evitar golpes ao vender pelo WhatsApp",
    subtitle: "Sinais de alerta, conferências simples e regras de ouro para não perder dinheiro com falsos clientes.",
    excerpt:
      "Comprovante falso, pedido grande demais e pressa para fechar negócio são alguns dos sinais mais comuns de golpe. Veja como se proteger sem deixar de vender.",
    category: "protecao-e-seguranca",
    tags: ["golpes", "whatsapp", "segurança", "pagamentos", "vendas"],
    author_name: "Equipe Dudit",
    author_role: "Conteúdo de segurança",
    status: "published",
    is_featured: true,
    seo_title: "Como evitar golpes ao vender pelo WhatsApp: guia prático",
    seo_description:
      "Aprenda a identificar comprovantes falsos, pedidos suspeitos e golpes comuns no WhatsApp e proteja o caixa do seu pequeno negócio.",
    seo_keywords: ["golpe no whatsapp", "comprovante falso", "segurança nas vendas", "golpes com pix"],
    key_takeaways: [
      "Confirme o pagamento no seu próprio banco, nunca apenas pelo comprovante.",
      "Desconfie de pressa excessiva, pedidos muito acima do normal e pedidos de reembolso.",
      "Registre o pedido por escrito e combine entrega, valores e responsabilidades.",
      "Proteja sua conta com verificação em duas etapas e senhas exclusivas.",
    ],
    faq: [
      {
        question: "Comprovante de Pix pode ser falsificado?",
        answer:
          "Sim. Prints e PDFs podem ser editados com facilidade. A única confirmação segura é abrir o aplicativo do seu banco e verificar se o valor realmente entrou na conta.",
      },
      {
        question: "O cliente pediu para pagar metade agora e metade na entrega. É seguro?",
        answer:
          "Pode ser uma combinação válida, mas registre o acordo por escrito. Para encomendas personalizadas ou valores altos, peça um sinal que cubra pelo menos o custo dos materiais.",
      },
      {
        question: "Como proteger minha conta do WhatsApp?",
        answer:
          "Ative a verificação em duas etapas no aplicativo, não compartilhe o código de confirmação com ninguém e revise periodicamente os dispositivos conectados.",
      },
    ],
    published_at: daysAgo(12),
    content: `
<p>Vender pelo WhatsApp é rápido, direto e faz parte da rotina de milhares de pequenos negócios. O problema é que os golpes também evoluíram: hoje é comum receber pedidos muito bem escritos, com comprovantes convincentes e até áudios gravados. A boa notícia é que a maioria dos golpes segue o mesmo roteiro e pode ser identificada com conferências simples.</p>

<h2>Os golpes mais comuns contra vendedores</h2>
<p>Antes de falar de prevenção, vale reconhecer os formatos que mais aparecem no dia a dia.</p>

<h3>1. Comprovante de pagamento falso</h3>
<p>O golpista envia um print ou PDF de Pix, boleto ou transferência e pede que você libere o pedido imediatamente. O comprovante parece real, mas o dinheiro nunca entrou. Em alguns casos, o valor é enviado para outra chave ou o agendamento é cancelado depois.</p>

<h3>2. Pedido grande com pressa</h3>
<p>O cliente pede dezenas de unidades, diz que precisa para ontem e insiste para você comprar material ou fazer o envio antes da confirmação do pagamento. A urgência serve para impedir que você confira os dados com calma.</p>

<h3>3. Golpe do reembolso</h3>
<p>Depois de uma compra legítima, a pessoa diz que desistiu e pede o estorno para outra conta, alegando problema com a conta original. Se você devolver, pode ficar sem o produto e sem o dinheiro.</p>

<h3>4. Falsa central de atendimento</h3>
<p>Alguém se passa pelo suporte da plataforma ou do banco e pede código de verificação, senha ou acesso remoto ao seu celular. Nenhum suporte sério pede esse tipo de informação por mensagem.</p>

<h2>Regras de ouro para vender com segurança</h2>
<ul>
  <li><strong>Confirme no seu banco.</strong> Abra o aplicativo oficial e verifique o saldo e o extrato. Print não é prova de pagamento.</li>
  <li><strong>Não aceite pressa como argumento.</strong> Um cliente confiável entende que você precisa conferir o pedido.</li>
  <li><strong>Registre tudo por escrito.</strong> Combine itens, valores, prazo, forma de entrega e política de troca na conversa.</li>
  <li><strong>Não devolva valores para contas diferentes.</strong> Estornos devem voltar para a mesma origem do pagamento.</li>
  <li><strong>Nunca compartilhe códigos.</strong> Código de verificação, senha e acesso remoto são pessoais e intransferíveis.</li>
</ul>

<blockquote>Se a oferta parece boa demais ou o cliente tem pressa demais, pare e confira. Perder cinco minutos é melhor do que perder o valor da venda.</blockquote>

<h2>Como conferir um pagamento em poucos passos</h2>
<ol>
  <li>Abra o aplicativo do seu banco ou adquirente.</li>
  <li>Verifique se o valor está disponível, e não apenas agendado.</li>
  <li>Confira o nome de quem pagou e o identificador da transação.</li>
  <li>Compare com os dados combinados na conversa.</li>
  <li>Só depois separe o produto ou agende a entrega.</li>
</ol>

<p>Para vendas com entrega, uma prática útil é informar por escrito que o pedido será separado após a confirmação do pagamento. Isso reduz a pressão e deixa a regra clara para todos.</p>

<h2>Proteja também a sua conta</h2>
<p>Ative a verificação em duas etapas no WhatsApp, use uma senha exclusiva para o e-mail do negócio e revise os dispositivos conectados. Se possível, separe o número pessoal do número comercial e oriente sua equipe sobre o que pode e o que não pode ser compartilhado.</p>

<p>Na Dudit, você pode acompanhar pedidos e conversas com mais organização, mas a conferência do pagamento continua sendo um hábito essencial. Se ficou com dúvida, veja também o guia de <a href="/ajuda/login-registro/acessando-conta">como proteger o acesso à sua conta</a> e os <a href="/institucional/termos">termos de uso</a> da plataforma.</p>
`,
  },
  {
    slug: "fluxo-de-caixa-o-que-e-e-como-controlar",
    title: "Fluxo de caixa: o que é e como controlar no seu negócio",
    subtitle: "Entenda a diferença entre faturar e ter dinheiro disponível — e organize as contas em uma rotina simples.",
    excerpt:
      "Fluxo de caixa é o registro de tudo o que entra e sai do caixa. Sem esse controle, uma empresa lucrativa pode ficar sem dinheiro para pagar as contas do mês.",
    category: "gestao-financeira",
    tags: ["fluxo de caixa", "finanças", "pix", "contas a pagar", "gestão"],
    author_name: "Equipe Dudit",
    author_role: "Conteúdo de gestão financeira",
    status: "published",
    is_featured: false,
    seo_title: "Fluxo de caixa: o que é, como funciona e como controlar",
    seo_description:
        "Aprenda o que é fluxo de caixa, por que ele é diferente do lucro e como montar um controle simples para o seu pequeno negócio.",
    seo_keywords: ["fluxo de caixa", "controle financeiro", "caixa da empresa", "gestão financeira"],
    key_takeaways: [
      "Fluxo de caixa mostra o dinheiro que entra e sai em determinado período.",
      "Lucro e caixa não são a mesma coisa: vender a prazo não significa dinheiro na conta.",
      "Separe as contas pessoais das contas do negócio.",
      "Registre as movimentações diariamente e revise o acumulado toda semana.",
    ],
    faq: [
      {
        question: "Qual a diferença entre fluxo de caixa e lucro?",
        answer:
          "O lucro é a diferença entre receitas e despesas em um período. O fluxo de caixa acompanha o dinheiro efetivamente disponível. Uma venda a prazo pode gerar lucro no papel e ainda assim deixar o caixa apertado.",
      },
      {
        question: "Preciso de um sistema para controlar o fluxo de caixa?",
        answer:
          "No começo, uma planilha bem organizada resolve. Quando o volume de vendas cresce, um sistema ajuda a evitar retrabalho e a conciliar pagamentos, contas e estoque.",
      },
      {
        question: "Com que frequência devo atualizar o caixa?",
        answer:
          "O ideal é registrar as entradas e saídas diariamente. Uma revisão semanal ajuda a identificar padrões e a projetar as próximas semanas.",
      },
    ],
    published_at: daysAgo(6),
    content: `
<p>Muitos negócios vendem bem e ainda assim vivem no aperto. O motivo quase sempre está no mesmo lugar: falta de controle do fluxo de caixa. Entender esse conceito é o primeiro passo para tomar decisões com mais segurança e parar de descobrir problemas só quando o boleto vence.</p>

<h2>O que é fluxo de caixa</h2>
<p>Fluxo de caixa é o registro de todo o dinheiro que entra e sai do negócio em um período. Ele responde a uma pergunta simples: <strong>quanto eu tenho disponível agora e quanto vou ter nas próximas semanas?</strong></p>

<p>Entram no fluxo de caixa as vendas recebidas, os recebimentos de parcelas, os empréstimos e qualquer outra entrada. Saem os pagamentos a fornecedores, aluguel, contas de consumo, salários, impostos, taxas e retiradas dos sócios.</p>

<h2>Por que lucro não é a mesma coisa que caixa</h2>
<p>Imagine que você vendeu R$ 5 mil em produtos, mas metade foi no cartão com recebimento em 30 dias. No papel, a venda existe. No caixa, o dinheiro ainda não entrou. Se os fornecedores precisam ser pagos esta semana, você pode ter um problema mesmo com vendas boas.</p>

<p>É por isso que o fluxo de caixa precisa considerar <strong>datas</strong>, e não apenas valores. Uma entrada prevista para o mês que vem não paga a conta que vence amanhã.</p>

<h2>Como montar um controle simples</h2>
<ol>
  <li><strong>Separe o caixa pessoal do caixa do negócio.</strong> Conta bancária ou carteira digital exclusiva evita confusão.</li>
  <li><strong>Registre cada entrada e saída.</strong> Anote data, valor, descrição e forma de pagamento.</li>
  <li><strong>Divida em categorias.</strong> Vendas, fornecedores, aluguel, pessoal, impostos, taxas e retiradas.</li>
  <li><strong>Inclua contas a receber e a pagar.</strong> O saldo de hoje não conta a história toda.</li>
  <li><strong>Faça uma revisão semanal.</strong> Compare o previsto com o realizado e ajuste o que for necessário.</li>
</ol>

<blockquote>Caixa positivo não significa lucro alto. Significa que, naquele momento, você tem dinheiro suficiente para honrar os compromissos.</blockquote>

<h2>Uma rotina de 15 minutos por dia</h2>
<p>No fechamento do dia, registre as vendas recebidas, os pagamentos feitos e as contas que vencerão nos próximos dias. Uma vez por semana, olhe para o acumulado e para as próximas duas semanas. Com esse hábito, fica muito mais fácil perceber quando é hora de segurar uma compra, negociar prazo ou cobrar um cliente atrasado.</p>

<h2>Erros que mais desorganizam o caixa</h2>
<ul>
  <li>Misturar dinheiro da empresa com despesas pessoais.</li>
  <li>Contar vendas a prazo como se já estivessem na conta.</li>
  <li>Esquecer taxas de cartão, frete e impostos no preço.</li>
  <li>Fazer retiradas grandes sem reservar o dinheiro dos compromissos.</li>
  <li>Não ter uma reserva para imprevistos e sazonalidade.</li>
</ul>

<p>Se você está começando, a <a href="/ajuda/financeiro/primeiros-passos-financeiro">Central de Ajuda da Dudit</a> explica como lançar entradas e saídas. Para precificar com mais segurança, use a <a href="/ferramentas/calculadora-margem-lucro-preco-venda">calculadora de margem e preço de venda</a> e a <a href="/ferramentas/calculadora-ponto-equilibrio">calculadora de ponto de equilíbrio</a>.</p>
`,
  },
  {
    slug: "como-tirar-fotos-melhores-dos-produtos-com-o-celular",
    title: "Como tirar fotos melhores dos produtos com o celular",
    subtitle: "Luz natural, fundo limpo e alguns ajustes simples fazem o anúncio parecer muito mais profissional.",
    excerpt:
      "Você não precisa de estúdio para vender melhor. Com luz indireta, fundo neutro e ângulos certos, seu produto ganha destaque e passa mais confiança.",
    category: "fotos-e-anuncios",
    tags: ["fotos", "produtos", "anúncios", "celular", "vitrine"],
    author_name: "Equipe Dudit",
    author_role: "Conteúdo de vendas e anúncios",
    status: "published",
    is_featured: false,
    seo_title: "Como tirar fotos de produtos com o celular: 8 dicas práticas",
    seo_description:
      "Aprenda a fotografar produtos com o celular usando luz natural, fundo limpo e enquadramento simples para vender mais na vitrine e no WhatsApp.",
    seo_keywords: ["fotos de produtos", "fotografia com celular", "fotos para anúncio", "vitrine online"],
    key_takeaways: [
      "Prefira luz natural indireta, perto de uma janela, sem sol direto.",
      "Use um fundo neutro e limpe o produto antes de fotografar.",
      "Fotografe de vários ângulos, inclusive detalhes e defeitos.",
      "Mantenha proporção e cores fiéis para evitar frustração na entrega.",
    ],
    faq: [
      {
        question: "Consigo boas fotos usando apenas o celular?",
        answer:
          "Sim. A luz e o fundo fazem mais diferença do que a câmera. Um celular com câmera razoável, boa iluminação e um enquadramento limpo já entregam fotos profissionais para a maioria dos pequenos negócios.",
      },
      {
        question: "Devo usar filtro nas fotos dos produtos?",
        answer:
          "Evite filtros que alterem a cor real. O cliente precisa receber o produto com a aparência que viu no anúncio. Ajustes leves de brilho e contraste são suficientes.",
      },
      {
        question: "Quantas fotos colocar em cada anúncio?",
        answer:
          "Entre três e seis fotos costumam ser suficientes: frente, laterais, verso, detalhes e escala. Mostre também marcas de uso quando o produto for usado.",
      },
    ],
    published_at: daysAgo(2),
    content: `
<p>A foto é o primeiro contato do cliente com o seu produto. Antes de ler a descrição ou perguntar o preço, ele olha a imagem. Fotos escuras, tremidas ou com fundo bagunçado fazem o produto parecer menos valioso e aumentam a desconfiança.</p>

<p>A boa notícia é que melhorar esse resultado não exige equipamento caro. Com um celular, uma janela e alguns cuidados, dá para transformar a apresentação da sua vitrine.</p>

<h2>1. Escolha a luz certa</h2>
<p>A luz natural indireta é a melhor amiga da foto de produto. Posicione o item perto de uma janela, mas evite sol batendo direto: ele cria sombras duras e estoura as cores claras. Se a luz estiver muito forte, use uma cortina fina ou uma folha de papel vegetal para suavizar.</p>

<p>À noite ou em ambientes escuros, prefira duas fontes de luz suaves em lados diferentes, em vez do flash direto do celular.</p>

<h2>2. Use um fundo limpo</h2>
<p>Uma parede lisa, uma mesa neutra ou uma folha grande de papel já resolvem. O objetivo é que o produto seja o protagonista. Evite fundos com objetos, padrões fortes ou cores que briguem com o item.</p>

<h2>3. Limpe e prepare o produto</h2>
<p>Poeira, marcas de dedo e etiquetas tortas aparecem muito mais na foto do que a olho nu. Limpe o item, ajuste o posicionamento e remova o que não faz parte do que será vendido.</p>

<h2>4. Fotografe de vários ângulos</h2>
<ul>
  <li>Frente e laterais.</li>
  <li>Verso e detalhes importantes.</li>
  <li>Textura, material ou acabamento.</li>
  <li>Produto em uso ou ao lado de um objeto para dar escala.</li>
  <li>Defeitos, quando o item for usado.</li>
</ul>

<blockquote>Transparência vende. Mostrar pequenas marcas de uso reduz a chance de devolução e aumenta a confiança na sua loja.</blockquote>

<h2>5. Cuide do enquadramento</h2>
<p>Mantenha o produto centralizado, com uma margem ao redor e sem cortar partes importantes. Para itens pequenos, aproxime-se em vez de usar o zoom digital. Se possível, use a câmera traseira e apoie o celular em uma superfície firme.</p>

<h2>6. Mantenha as cores fiéis</h2>
<p>O cliente compra o que vê. Fotos muito saturadas ou com filtros podem gerar expectativa errada e aumentar as trocas. Ajuste apenas brilho, contraste e nitidez na medida do necessário.</p>

<h2>7. Organize uma rotina de fotos</h2>
<p>Separe um canto com boa luz, fotografe vários produtos de uma vez e mantenha um padrão de fundo e enquadramento. Isso economiza tempo e deixa a vitrine visualmente mais coerente.</p>

<h2>8. Atualize os anúncios</h2>
<p>Reveja as fotos antigas de tempos em tempos. Um produto que já vendeu bem pode ganhar novas imagens com detalhes diferentes. Na Dudit, você pode publicar as fotos diretamente no cadastro do produto — veja o passo a passo em <a href="/ajuda/produtos-estoque/como-cadastrar-produto">como cadastrar um produto</a> e conheça a <a href="/ajuda/vitrine-online/visao-geral-vitrine-online">vitrine online</a>.</p>

<p>Quer mais ferramentas para o dia a dia? Explore as <a href="/ferramentas">ferramentas gratuitas da Dudit</a> e continue lendo as dicas do <a href="/blog">Blog do Dino</a>.</p>
`,
  },
  {
    slug: "como-integrar-tiny-erp-com-catalogo-e-pdv-sem-taxas",
    title: "Como integrar o Tiny ERP com seu catálogo digital e PDV com 0% de comissão",
    subtitle: "Sincronize pedidos e estoque em tempo real com o Tiny ERP sem pagar comissões abusivas por venda.",
    excerpt:
      "Venda online no catálogo digital e no balcão físico enquanto o Tiny ERP cuida da emissão fiscal e do estoque centralizado. Veja como funciona a integração nativa da Dudit.",
    category: "gestao-do-negocio",
    tags: ["tiny erp", "integração", "estoque", "pedidos", "gestão", "vendas"],
    author_name: "Equipe Dudit",
    author_role: "Gestão e Integrações",
    status: "published",
    is_featured: false,
    seo_title: "Como integrar o Tiny ERP ao catálogo digital e PDV sem taxas | Dudit",
    seo_description:
      "Aprenda como unificar suas vendas na Dudit com o Tiny ERP: controle estoque, exporte pedidos automaticamente e emita notas fiscais com 0% de comissão.",
    seo_keywords: [
      "tiny erp integracao",
      "catalogo integrado tiny",
      "pdv tiny erp",
      "sincronizar estoque tiny",
      "tiny erp vendas online",
    ],
    key_takeaways: [
      "Venda no catálogo online ou PDV físico da Dudit com 0% de comissão por venda.",
      "Exportação instantânea de pedidos com dados fiscais completos (CPF/CNPJ, endereço e itens).",
      "Sincronização de estoque em tempo real via webhooks para evitar vendas duplicadas.",
      "Emissão de NF-e e controle de compras centralizados no Tiny ERP sem digitação manual.",
    ],
    faq: [
      {
        question: "A integração com o Tiny ERP tem custo extra na Dudit?",
        answer:
          "Não. A integração com o Tiny ERP é nativa e está inclusa nos planos da Dudit, sem nenhuma comissão sobre o valor faturado.",
      },
      {
        question: "Como os pedidos da Dudit entram no Tiny ERP?",
        answer:
          "Assim que uma venda é aprovada na Dudit, nosso sistema envia os dados completos do pedido via API para o Tiny ERP, onde ele aparece pronto para faturamento e emissão de nota fiscal.",
      },
      {
        question: "O estoque atualiza automaticamente se eu vender em outro canal?",
        answer:
          "Sim. Ao configurar o webhook de estoque no Tiny ERP, qualquer alteração de saldo é refletida imediatamente no catálogo da Dudit.",
      },
    ],
    published_at: daysAgo(1),
    content: `
<p>Para quem já utiliza ou quer utilizar o <strong>Tiny ERP</strong> como coração da sua operação comercial, um dos maiores desafios sempre foi encontrar um canal de vendas direto — seja um catálogo online moderno para WhatsApp ou um PDV frente de caixa ágil — que não cobre porcentagens pesadas sobre cada venda.</p>

<p>A Dudit resolve exatamente essa dor: somos uma plataforma de vendas e gestão com <strong>0% de comissão por venda</strong> e integração nativa com o Tiny ERP.</p>

<h2>Por que integrar a Dudit com o Tiny ERP?</h2>

<p>A combinação da Dudit com o Tiny ERP une o melhor dos dois mundos:</p>

<ul>
  <li><strong>Frente de vendas poderosa (Dudit):</strong> Catálogo digital responsivo, checkout otimizado, pedidos direto pelo WhatsApp ou pagamento online, entrega local por motoboy e cálculo integrado de frete para todo o Brasil.</li>
  <li><strong>Backoffice e fiscal robusto (Tiny ERP):</strong> Emissão de Nota Fiscal Eletrônica (NF-e), controle contábil, compras de fornecedores e relatórios consolidados.</li>
  <li><strong>Economia real:</strong> Nos marketplaces tradicionais, você perde de 12% a 20% do faturamento em taxas. Na Dudit, a comissão é zero.</li>
</ul>

<h2>O que a integração faz por você</h2>

<h3>1. Exportação automática de pedidos de venda</h3>
<p>Cada vez que um pedido é confirmado na Dudit, a integração envia o pedido diretamente para o Tiny ERP com:</p>
<ul>
  <li>Dados cadastrais do cliente (Nome, CPF/CNPJ, e-mail e telefone).</li>
  <li>Endereço de entrega completo.</li>
  <li>Itens do pedido com preços, quantidades e SKUs mapeados.</li>
  <li>Forma de pagamento e valor do frete.</li>
</ul>
<p>Com isso, sua equipe de expedição não perde tempo digitando dados manualmente: basta abrir o Tiny, conferir o pedido e emitir a NF-e com um clique.</p>

<h3>2. Sincronização de estoque em tempo real</h3>
<p>Através de webhooks, quando o estoque de um produto é alterado no Tiny ERP — seja por uma entrada de mercadoria ou por uma venda balcão — o novo saldo é enviado instantaneamente para a Dudit, evitando que você anuncie itens esgotados.</p>

<h3>3. Gestão unificada de pedidos cancelados</h3>
<p>Se um pedido for cancelado na Dudit antes da expedição, o status correspondente é atualizado no Tiny, liberando o estoque reservado automaticamente.</p>

<h2>Como ativar a integração</h2>
<p>Configurar a conexão leva menos de dois minutos:</p>
<ol>
  <li>Acesse sua conta no Tiny ERP e copie seu <strong>Token de API</strong> em Configurações > Geral > API.</li>
  <li>No painel da Dudit, vá em <strong>ERP > Configurações > Integrações</strong> e clique em <strong>Conectar</strong> no card do Tiny ERP.</li>
  <li>Cole o token, salve e ative a exportação automática de pedidos e a sincronização de estoque.</li>
</ol>

<p>Para um tutorial com imagens e detalhes de configuração de webhooks, confira nosso guia passo a passo na <a href="/ajuda/integracoes/como-integrar-tiny-erp-dudit">Central de Ajuda da Dudit</a>.</p>
`,
  },
]

function countWords(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .split(/\s+/)
    .filter(Boolean).length
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error("Faltam variáveis de ambiente (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).")
    process.exit(1)
  }

  const admin = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  for (const post of posts) {
    const readingTime = Math.max(1, Math.ceil(countWords(post.content) / 200))
    const row = {
      ...post,
      reading_time_minutes: readingTime,
      views_count: 0,
    }

    const { error } = await admin
      .from("blog_posts")
      .upsert(row, { onConflict: "slug" })

    if (error) {
      console.error(`Erro ao salvar "${post.slug}":`, error.message)
      process.exitCode = 1
      continue
    }

    console.log(`OK  ${post.slug}  (${readingTime} min de leitura)`)
  }

  console.log("Seed do blog concluído.")
}

main()
