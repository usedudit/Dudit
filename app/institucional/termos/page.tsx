"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { GridLines, Navbar, Footer } from '@/components/InstitucionalShared';
import { useRouter } from 'next/navigation';

export default function TermsPage() {
    const router = useRouter();

    const onNavigate = (page: string) => {
        if (page === 'home') router.push('/institucional/inicio');
        else if (page === 'segments') router.push('/institucional/segmentos');
        else if (page === 'pricing') router.push('/institucional/planos');
        else if (page === 'terms') router.push('/institucional/termos');
        else if (page === 'privacidade') router.push('/institucional/privacidade');
        else if (page === 'start-selling') router.push('/erp/inicio');
        else console.log('Navigating to:', page);
    };

    return (
        <div className="bg-white min-h-screen">
            <Navbar onNavigate={onNavigate} />

            <div className="pt-32 pb-24">
                <section className="relative bg-white pb-20 overflow-hidden">
                    <GridLines />
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                        >
                            <div className="inline-flex items-center gap-2 border border-brand-border rounded-full px-4 py-1.5 text-xs text-brand-dark mb-8 bg-brand-gray tracking-wider font-bold uppercase">
                                Documentos Legais
                            </div>
                            <h1 className="text-5xl md:text-6xl font-bold text-brand-dark mb-6">
                                Termos de Uso
                            </h1>
                            <p className="text-brand-inactive-text text-lg">
                                Versão 1.1 - Última atualização: Outubro de 2026
                            </p>
                        </motion.div>
                    </div>
                </section>

                <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <div className="prose prose-lg max-w-none text-brand-dark leading-relaxed space-y-12">
                        <p className="font-medium text-xl border-l-4 border-brand-green pl-6 py-2 bg-brand-gray rounded-r-xl">
                            Estes Termos de Uso ("Termos") regem o acesso e uso da plataforma DUDIT, operada por [NOME CIVIL COMPLETO DA OPERADORA], pessoa física, CPF nº [INFORMAR CPF OU VALIDAR COM ADVOGADO A FORMA DE DIVULGAÇÃO], com endereço para contato em [ENDEREÇO COMPLETO] e e-mail [E-MAIL VÁLIDO DE CONTATO], doravante denominada "DUDIT".
                        </p>

                        <p>
                            Ao utilizar a DUDIT, seja como <strong>PARCEIRO</strong> (Vendedor/Prestador de Serviços) ou <strong>USUÁRIO</strong> (Comprador/Consumidor Final), você declara ter lido, compreendido e aceito integralmente estas condições.
                        </p>

                        <div className="bg-brand-dark text-white p-8 rounded-2xl shadow-xl">
                            <h3 className="text-white text-xl font-bold mb-4 uppercase tracking-wide">Uso por menores de idade</h3>
                            <p className="text-gray-300 leading-relaxed">
                                O cadastro como Parceiro (Vendedor) é restrito a pessoas com 18 anos ou mais, uma vez que implica celebração de contrato e obrigações legais. O acesso como Usuário (Comprador) não possui restrição de idade, sendo recomendado o acompanhamento dos responsáveis para menores de 16 anos. A DUDIT não se responsabiliza por cadastros de Parceiros realizados em desacordo com esta cláusula.
                            </p>
                        </div>

                        <hr className="border-brand-border my-12" />

                        <div className="space-y-16">
                            {/* Seção 1 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">1.</span>
                                    DEFINIÇÕES
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p>Para fins destes Termos, os seguintes termos têm o significado indicado abaixo:</p>
                                    <ul className="space-y-4 list-none p-0">
                                        <li><strong>• DUDIT:</strong> Plataforma tecnológica operada por [NOME CIVIL COMPLETO DA OPERADORA], que oferece ferramentas de gestão empresarial (ERP), vitrine digital e canal de descoberta de produtos e serviços para conexão entre Parceiros e Usuários.</li>
                                        <li><strong>• Parceiro:</strong> Pessoa física ou jurídica que utiliza a plataforma para anunciar, vender produtos ou prestar serviços. Também denominado Vendedor.</li>
                                        <li><strong>• Usuário:</strong> Pessoa física que acessa a plataforma para buscar, visualizar ou adquirir produtos e serviços. Também denominado Comprador ou Consumidor Final.</li>
                                        <li><strong>• Plataforma:</strong> Conjunto de funcionalidades disponibilizadas pela DUDIT, incluindo ERP, vitrine digital, marketplace, ferramentas de gestão e demais recursos tecnológicos.</li>
                                        <li><strong>• Gateway de Pagamento:</strong> Serviço terceirizado responsável pelo processamento de transações financeiras online (atualmente: Mercado Pago).</li>
                                        <li><strong>• Plano:</strong> Modalidade de assinatura contratada pelo Parceiro, que determina os recursos e limites disponíveis na plataforma.</li>
                                        <li><strong>• Anúncio:</strong> Publicação de produto ou serviço realizada pelo Parceiro na vitrine digital da plataforma.</li>
                                        <li><strong>• Avaliação:</strong> Manifestação de opinião do Usuário sobre um produto, serviço ou Parceiro, publicada na plataforma após uma transação.</li>
                                        <li><strong>• Conteúdo Multimídia:</strong> Fotos, vídeos e demais materiais publicados por Parceiros ou Usuários na plataforma.</li>
                                    </ul>
                                </div>
                            </div>

                            {/* Seção 2 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">2.</span>
                                    CADASTRO E ACESSO
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>2.1.</strong> Para utilizar a plataforma como Parceiro, são coletados os seguintes dados: Nome completo, Nome da Loja, CPF/CNPJ, Endereço, E-mail e Telefone. As condições completas de tratamento desses dados estão descritas na Política de Privacidade.</p>
                                    <p><strong>2.2.</strong> O Parceiro garante que as informações fornecidas são exatas, precisas e verdadeiras, e assume o compromisso de manter seus dados atualizados. A DUDIT não se responsabiliza por dados inseridos incorretamente pelo próprio usuário.</p>
                                    <p><strong>2.3. Unicidade de Cadastro:</strong> Cada CPF/CNPJ pode ter apenas um cadastro ativo na plataforma como Parceiro. A criação de múltiplas contas para burlar suspensões ou limites é expressamente proibida.</p>
                                    <p><strong>2.4. Compartilhamento de Dados em Casos de Fraude ou Litígio:</strong> Em casos de suspeita de fraude, golpe ou falha na entrega por parte do Parceiro, a DUDIT poderá compartilhar dados cadastrais e de log (IP, data, hora) quando houver obrigação legal, ordem judicial ou outra hipótese autorizada pela Lei Geral de Proteção de Dados (LGPD). Sempre que juridicamente viável, a DUDIT priorizará colaborar diretamente com as autoridades competentes na apuração de fraudes, em vez de repassar dados pessoais diretamente ao Usuário lesado, resguardando a conformidade com a LGPD.</p>
                                    <p><strong>2.5. Backup e Responsabilidade do Parceiro:</strong> Embora a DUDIT adote boas práticas de segurança e armazenamento, o Parceiro é responsável por manter cópias e controles próprios de informações críticas do seu negócio.</p>
                                </div>
                            </div>

                            {/* Seção 3 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">3.</span>
                                    USO DA PLATAFORMA
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>3.1. Natureza do Serviço:</strong> A DUDIT é uma plataforma tecnológica (modelo SaaS - Software as a Service) que fornece ferramentas de gestão empresarial (ERP), vitrine digital e canal de descoberta e divulgação de produtos e serviços para conectar Parceiros e Usuários.</p>
                                    <p><strong>3.2. Papel da DUDIT:</strong> A DUDIT fornece ferramentas de ERP e um marketplace que organiza vitrines, anúncios, carrinho, checkout, pedidos e recursos de atendimento. O Parceiro define e responde pela oferta, disponibilidade, qualidade, entrega do produto e execução do serviço. A DUDIT não fabrica nem executa os produtos ou serviços dos Parceiros, mas continua responsável pelas obrigações legais relacionadas aos próprios serviços e às atividades que efetivamente realiza na plataforma.</p>
                                    <p><strong>3.3. Relação de compra e venda:</strong> A contratação do produto ou serviço anunciado é feita entre o Usuário e o Parceiro. A DUDIT facilita a descoberta, a comunicação e, quando disponível, a criação do pedido e o início do pagamento por integração com terceiros. A delimitação de papéis nesta cláusula não exclui responsabilidades que a legislação atribua à DUDIT conforme sua atuação concreta.</p>
                                    <p><strong>3.4. Responsabilidades do Parceiro:</strong> Sem afastar os deveres próprios da DUDIT, o Parceiro é responsável por:</p>
                                    <ul className="list-disc pl-6 space-y-2">
                                        <li>Veracidade das informações do anúncio;</li>
                                        <li>Entrega do produto ou prestação do serviço;</li>
                                        <li>Qualidade, garantia, troca e reembolso;</li>
                                        <li>Atendimento ao consumidor;</li>
                                        <li>Cumprimento do Código de Defesa do Consumidor (Lei 8.078/90);</li>
                                        <li>Emissão de documentos fiscais exigidos por lei.</li>
                                    </ul>
                                    <p><strong>3.5. Confidencialidade:</strong> Parceiros e Usuários obrigam-se a manter em sigilo dados pessoais (endereço, telefone, CPF) a que tiverem acesso em razão das transações, sendo vedado o uso para fins diversos da conclusão do negócio, como venda de mailing ou spam.</p>
                                    <p><strong>3.6. Indenização:</strong> O Parceiro concorda em defender, indenizar e isentar a DUDIT de quaisquer reclamações, processos, perdas ou danos (incluindo honorários advocatícios) decorrentes do mau uso da plataforma, violação destes Termos, venda de produtos defeituosos ou violação de direitos de terceiros.</p>
                                    <p><strong>3.7. Ausência de Vínculo Empregatício ou Societário:</strong> O cadastro e uso da plataforma pelo Parceiro não cria, sob nenhuma hipótese, vínculo empregatício, societário, de representação comercial ou de parceria institucional entre o Parceiro e a DUDIT. O Parceiro atua de forma autônoma e independente, sendo o único responsável por suas obrigações trabalhistas, previdenciárias, tributárias e civis perante terceiros e seus próprios colaboradores.</p>
                                    <p><strong>3.8. Não-Exclusividade:</strong> O uso da DUDIT não obriga o Parceiro a atuar com exclusividade na plataforma, podendo livremente anunciar e vender seus produtos ou serviços em outros canais, plataformas ou marketplaces, simultaneamente.</p>
                                    <p><strong>3.9. Arquivos e Anexos entre Parceiro e Usuário:</strong> Arquivos, documentos e anexos trocados entre Parceiro e Usuário por meio da plataforma (ex.: comprovantes, especificações, arquivos de pedido) têm caráter privado e não são exibidos publicamente na vitrine. A DUDIT armazena esses arquivos em infraestrutura de terceiros contratada para essa finalidade, sem realizar monitoramento de rotina sobre seu conteúdo. A DUDIT poderá, no entanto, acessar, remover ou reportar tais arquivos quando exigido por lei, ordem judicial, para apuração de denúncias, ou ao identificar indícios de conteúdo ilegal, mesmo em áreas privadas da plataforma.</p>
                                </div>
                            </div>

                            {/* Seção 4 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">4.</span>
                                    POLÍTICA DE CONTEÚDO
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>4.1. Conteúdo Permitido:</strong> A plataforma admite a publicação de anúncios relativos a:</p>
                                    <ul className="list-disc pl-6 space-y-2">
                                        <li>Produtos novos;</li>
                                        <li>Produtos usados, observado o disposto no item 5.2;</li>
                                        <li>Serviços diversos, observado o disposto no item 5.3;</li>
                                        <li>Produtos e serviços digitais.</li>
                                    </ul>
                                    <p><strong>4.2. Conteúdo Proibido:</strong> É estritamente vedado anunciar, publicar ou divulgar na DUDIT:</p>
                                    <ul className="list-disc pl-6 space-y-2">
                                        <li>Golpes, esquemas de pirâmide ou captação irregular de investimentos;</li>
                                        <li>Spam, correntes ou divulgação em massa não solicitada;</li>
                                        <li>Links maliciosos, phishing ou conteúdo que comprometa a segurança de terceiros;</li>
                                        <li>Venda ou transferência de contas de qualquer plataforma ou serviço;</li>
                                        <li>Drogas, substâncias ilícitas ou entorpecentes;</li>
                                        <li>Armas de fogo, munições ou explosivos;</li>
                                        <li>Produtos roubados, contrabandeados ou de origem ilícita;</li>
                                        <li>Produtos sem autorização, registro ou licença exigidos pela legislação aplicável;</li>
                                        <li>Produtos perigosos que ofereçam risco à saúde ou à segurança sem as advertências e autorizações exigidas;</li>
                                        <li>Medicamentos controlados ou de venda restrita;</li>
                                        <li>Animais vivos, exceto quando expressamente permitido e em conformidade com a legislação de proteção animal;</li>
                                        <li>Documentos pessoais, públicos ou de terceiros;</li>
                                        <li>Serviços ilegais ou que configurem exercício ilegal de profissão regulamentada;</li>
                                        <li>Apostas ou jogos de azar não autorizados pela legislação brasileira;</li>
                                        <li>Produtos financeiros não autorizados pelos órgãos reguladores competentes;</li>
                                        <li>Réplicas ou falsificações que violem leis de propriedade industrial;</li>
                                        <li>Conteúdo pornográfico ou de exploração sexual;</li>
                                        <li>Qualquer item ou serviço que viole a legislação brasileira vigente.</li>
                                    </ul>
                                    <p><strong>4.3.</strong> A lista acima é exemplificativa, não exaustiva. A DUDIT poderá atualizar esta Política de Conteúdo a qualquer momento, aplicando-se as novas regras aos anúncios publicados a partir de sua vigência, e poderá remover anúncios que, a seu critério, coloquem em risco a integridade da plataforma, de seus usuários ou de terceiros.</p>
                                </div>
                            </div>

                            {/* Seção 5 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">5.</span>
                                    MARKETPLACE E ANÚNCIOS
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>5.1. Canal de Descoberta:</strong> A DUDIT atua como canal de descoberta e divulgação de produtos e serviços dos Parceiros, disponibilizando uma vitrine digital para exposição de anúncios.</p>
                                    <p><strong>5.2. Produtos Usados:</strong> O Parceiro é integralmente responsável por informar, de forma clara e precisa, o estado de conservação, eventuais defeitos, funcionamento e demais características relevantes de produtos usados anunciados na plataforma.</p>
                                    <p><strong>5.3. Serviços:</strong> A contratação de serviços ocorre diretamente entre o Parceiro e o Usuário, nos termos do item 3.3. A DUDIT não executa, supervisiona ou garante a prestação dos serviços anunciados, ainda que a plataforma integre funcionalidades de agenda e gestão de atendimentos.</p>
                                    <p><strong>5.3.1. Ferramenta de Agenda e Agendamentos:</strong> A funcionalidade de agenda disponibilizada pela DUDIT é uma ferramenta de gestão colocada à disposição do Parceiro para organizar seus próprios horários e atendimentos. O agendamento, alteração ou cancelamento de horários é decisão exclusiva do Parceiro e do Usuário, não havendo qualquer participação, curadoria ou aprovação da DUDIT nesse processo. Registros, notificações automáticas e confirmações geradas pela plataforma têm natureza meramente informativa e de apoio operacional, não configurando ato de gestão do serviço pela DUDIT nem gerando corresponsabilidade sobre o compromisso agendado.</p>
                                    <p><strong>5.4. Avaliações:</strong> As avaliações publicadas na plataforma devem refletir experiências reais dos Usuários com o Parceiro, produto ou serviço avaliado. A DUDIT poderá remover avaliações que sejam:</p>
                                    <ul className="list-disc pl-6 space-y-2">
                                        <li>ofensivas, discriminatórias ou que violem estes Termos;</li>
                                        <li>comprovadamente falsas ou manipuladas;</li>
                                        <li>caracterizadas como spam ou divulgação indevida.</li>
                                    </ul>
                                    <p><strong>5.5. Vídeos de Divulgação de Parceiros:</strong> A DUDIT poderá disponibilizar funcionalidade de publicação de vídeos de divulgação, por meio da qual o Parceiro apresenta produtos ou serviços com possibilidade de vinculação a anúncios da vitrine. A quantidade de vídeos que podem ser publicados por período (ex.: semanal ou mensal) é definida de acordo com o Plano contratado pelo Parceiro.</p>
                                    <p><strong>5.5.1. Aprovação Prévia:</strong> Todo vídeo enviado pelo Parceiro é submetido à análise da DUDIT antes de sua publicação. A DUDIT poderá aprovar, reprovar ou solicitar ajustes no conteúdo, a seu critério, não havendo obrigação de publicação de vídeo submetido. Após aprovado, o vídeo passa a ser exibido no marketplace/vitrine, vinculado ao(s) anúncio(s) indicado(s) pelo Parceiro.</p>
                                    <p><strong>5.5.2. Natureza Curada, Não Social:</strong> A funcionalidade de vídeos de divulgação não constitui uma rede social ou feed de conteúdo aberto. Os vídeos devem se relacionar diretamente a produtos ou serviços efetivamente anunciados pelo próprio Parceiro na plataforma. A DUDIT poderá remover, a qualquer momento, vídeos já publicados que violem estes Termos, a Política de Conteúdo ou direitos de terceiros.</p>
                                    <p><strong>5.5.3. Comissionamento:</strong> Caso a DUDIT implemente mecanismo de comissão sobre vendas originadas a partir de vídeos de divulgação, as regras específicas de elegibilidade, cálculo e pagamento dessa comissão serão comunicadas previamente ao Parceiro, podendo ser objeto de termo complementar a estes Termos.</p>
                                    <p><strong>5.6. Conteúdo em Vídeo - Licença e Responsabilidade:</strong> Ao publicar vídeos na plataforma, o Parceiro ou Usuário concede à DUDIT licença para exibição do conteúdo dentro do ambiente da plataforma, permanecendo integralmente responsável pelo material publicado e por eventual violação de direitos autorais, de imagem ou de terceiros.</p>
                                    <p><strong>5.7. Imagens e Conteúdos:</strong> O Parceiro declara ser o titular ou licenciado dos direitos sobre as imagens que publicar. É proibido utilizar fotos de catálogos de terceiros ou marcas sem autorização. A DUDIT reserva-se o direito de remover anúncios que violem direitos autorais.</p>
                                    <p><strong>5.8. Licença de Uso de Imagem e Vídeo:</strong> Ao cadastrar produtos, logotipos, fotos e vídeos, o Parceiro concede à DUDIT uma licença gratuita, não exclusiva e limitada ao território nacional para exibir tais conteúdos na plataforma e em materiais de divulgação da vitrine do Parceiro.</p>
                                    <p><strong>5.9. Ordem de Exibição e Ranking:</strong> A ordem de exibição de anúncios, parceiros e conteúdos na plataforma pode considerar critérios automatizados como relevância, localização, disponibilidade, qualidade do perfil, plano contratado, engajamento e outros fatores internos, sem obrigação de posicionamento específico.</p>
                                </div>
                            </div>

                            {/* Seção 6 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">6.</span>
                                    PAGAMENTOS E INTEGRAÇÕES
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>6.1. Integração com pagamento:</strong> A plataforma integra-se atualmente ao Mercado Pago. A DUDIT pode enviar ao gateway os dados necessários para iniciar e acompanhar o pagamento de um pedido; o gateway processa a transação e, conforme a integração e as regras do próprio gateway, liquida os valores na conta conectada do Parceiro.</p>
                                    <p><strong>6.2. Valores de venda:</strong> A DUDIT não recebe nem mantém em custódia os valores das vendas entre Usuários e Parceiros e não cobra comissão ou percentual sobre essas vendas. A ausência de custódia não altera o papel tecnológico da DUDIT no checkout, no registro do pedido e na comunicação de status. A DUDIT cobra separadamente a assinatura dos próprios planos.</p>
                                    <p><strong>6.3. Disputas e reembolsos:</strong> O Parceiro deve atender o Usuário e cumprir as obrigações legais relativas à venda ou serviço que oferece. O gateway decide e executa as operações financeiras sob suas próprias regras. A DUDIT pode fornecer os registros disponíveis e cooperar na apuração; isso não exclui deveres legais próprios da DUDIT nem impede reembolso de valores que ela própria tenha cobrado.</p>
                                    <p><strong>6.4. Pagamentos fora da plataforma:</strong> Em modalidades como pagamento na entrega ou retirada no local, o Parceiro e o Usuário combinam diretamente a forma de pagamento. A DUDIT não recebe esses valores. Ela continua responsável pelo funcionamento e pelas informações que disponibiliza em seus próprios serviços, nos limites da legislação aplicável.</p>
                                    <p><strong>6.7. Logística Integrada:</strong> Ao utilizar o serviço de logística integrada (Superfrete), o Parceiro reconhece que o contrato de transporte é firmado diretamente com a transportadora, sendo esta a responsável pelo serviço de entrega. A DUDIT atua apenas como facilitadora da contratação.</p>
                                    <p><strong>6.8. Integrações de Terceiros:</strong> Serviços externos têm termos, controles e disponibilidade próprios. A DUDIT informará as dependências relevantes e adotará medidas razoáveis para tratar falhas que afetem a plataforma, sem excluir responsabilidades que a lei lhe atribua.</p>
                                </div>
                            </div>

                            {/* Seção 7 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">7.</span>
                                    PLANOS, CANCELAMENTOS E POLÍTICA DE REEMBOLSO
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>7.1. Cancelamento a Qualquer Momento:</strong> O Parceiro pode cancelar a assinatura dos planos pagos a qualquer momento, diretamente nas configurações da plataforma ou pelos canais de suporte, sem qualquer cobrança de multa de fidelidade ou taxa rescisória.</p>
                                    <p><strong>7.2. Direito de Arrependimento (Garantia Legal de 7 Dias):</strong> Nos termos do Art. 49 do Código de Defesa do Consumidor, o Parceiro tem direito a solicitar o cancelamento com reembolso integral de 100% do valor pago na primeira contratação do plano em até 7 (sete) dias corridos a contar da data de confirmação do pagamento inicial.</p>
                                    <p><strong>7.3. Mensalidades Subsequentes e Renovações:</strong> Após transcorrido o prazo legal de 7 (sete) dias da contratação inicial, o cancelamento da assinatura interrompe imediatamente as cobranças automáticas para os ciclos mensais futuros. Os valores relativos a mensalidades já iniciadas, faturadas ou decorridas não são passíveis de reembolso retroativo ou pro-rata, permanecendo o acesso liberado até o término do ciclo mensal vigente contratado.</p>
                                    <p><strong>7.4. Efeitos e Carência em Caso de Reembolso Aprovado:</strong> Na hipótese de concessão de reembolso (pelo exercício do direito de arrependimento ou por liberalidade da DUDIT), o estorno financeiro é processado de imediato e é concedida uma carência de até 24 (vinte e quatro) horas para que o Parceiro exporte seus relatórios e dados cadastrados. Decorrido esse prazo de 24 horas, a conta é migrada automaticamente para o Plano Gratuito, aplicando-se a política de arquivamento de itens excedentes.</p>
                                    <p><strong>7.5. Forma e Meio de Estorno:</strong> Os reembolsos aprovados são processados exclusivamente através do mesmo método de pagamento utilizado na transação original (estorno na fatura do cartão de crédito, devolução instantânea via PIX ou crédito em conta Mercado Pago), observados os prazos operacionais das instituições financeiras e do Gateway de Pagamento.</p>
                                    <p><strong>7.6. Política de Downgrade e Arquivamento:</strong> Caso o Parceiro retorne a um plano com limite inferior ao número de itens cadastrados, os itens excedentes serão automaticamente arquivados - não aparecerão na vitrine digital, mas permanecerão salvos no sistema. O Parceiro poderá gerenciar quais itens permanecem ativos dentro do limite do plano vigente. O critério padrão de arquivamento é por menor volume de vendas, mas o Parceiro pode alterar manualmente a seleção. A DUDIT não se responsabiliza por perda de vendas decorrente do arquivamento automático.</p>
                                    <p><strong>7.7. Exportação de Dados:</strong> O Parceiro poderá exportar seus dados cadastrados (produtos, clientes, pedidos) a qualquer momento antes do encerramento da conta, através das ferramentas disponíveis na plataforma.</p>
                                    <p><strong>7.8. Reajuste de Valores:</strong> A DUDIT reserva-se o direito de alterar os valores dos planos mediante aviso prévio de 30 (trinta) dias. Assinantes ativos terão seus valores mantidos pelo período vigente da assinatura.</p>
                                </div>
                            </div>

                            {/* Seção 8 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">8.</span>
                                    MODERAÇÃO, PENALIDADES E PREVENÇÃO A FRAUDES
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>8.1. Denúncias:</strong> Usuários poderão denunciar anúncios ou conteúdos que violem estes Termos através dos canais de suporte.</p>
                                    <p><strong>8.2. Suspensão Preventiva:</strong> A DUDIT poderá remover anúncios, limitar funcionalidades, suspender contas ou bloquear acessos imediatamente, inclusive preventivamente, em caso de suspeita de fraude, golpe, atividade ilícita, risco à plataforma ou aos usuários, independentemente de confirmação definitiva.</p>
                                    <p><strong>8.3. Moderação de Conteúdo:</strong> A DUDIT poderá, a seu critério exclusivo, remover anúncios ou limitar funcionalidades sem aviso prévio, caso identifique violações a estes Termos.</p>
                                    <p><strong>8.4. Detecção de Fraudes:</strong> A DUDIT poderá utilizar mecanismos automatizados e manuais para detectar comportamentos suspeitos, incluindo criação de contas falsas, manipulação de avaliações, anúncios duplicados, tentativas de fraude e outras atividades que comprometam a integridade da plataforma.</p>
                                </div>
                            </div>

                            {/* Seção 9 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">9.</span>
                                    DISPONIBILIDADE DA PLATAFORMA E FORÇA MAIOR
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>9.1.</strong> A DUDIT envidará seus melhores esforços para manter a plataforma online, mas não garante disponibilidade ininterrupta. O sistema pode passar por indisponibilidades temporárias para manutenção ou por fatores externos.</p>
                                    <p><strong>9.2. Plataforma "Como Está":</strong> A plataforma é fornecida no modelo "como está" (as is) e "conforme disponibilidade", sem garantia de funcionamento ininterrupto, livre de falhas ou totalmente compatível com necessidades específicas do Parceiro.</p>
                                    <p><strong>9.3. Entregas e Logística:</strong> Em casos de entrega local ou retirada presencial, a responsabilidade pela entrega e conferência do produto é integralmente do Parceiro e do Usuário. A DUDIT não se responsabiliza por perdas, furtos, extravios ou atrasos.</p>
                                    <p><strong>9.4. Força Maior:</strong> A DUDIT não responde por indisponibilidades, atrasos ou falhas decorrentes de fatores alheios à sua vontade e controle razoável, incluindo, sem limitação: falhas de conectividade ou fornecimento de energia, ataques cibernéticos, indisponibilidade de serviços de terceiros integrados à plataforma, e casos fortuitos ou de força maior, como catástrofes naturais, pandemias ou determinações governamentais.</p>
                                </div>
                            </div>

                            {/* Seção 10 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">10.</span>
                                    LIMITAÇÃO DE RESPONSABILIDADE
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>10.1. Limites legais:</strong> Eventuais limites de responsabilidade previstos nestes Termos aplicam-se somente na medida permitida pela legislação e não afastam direitos indisponíveis, deveres de proteção de dados ou responsabilidade por falha própria da DUDIT quando aplicável.</p>
                                    <p><strong>10.2. Limitação financeira:</strong> Nenhum limite contratual reduz direitos do consumidor ou de titulares de dados garantidos por lei. Fora dessas hipóteses, eventual limitação será interpretada conforme a legislação aplicável e as circunstâncias do caso.</p>
                                    <p><strong>10.3. Sem Garantia de Resultados:</strong> A DUDIT não garante volume de vendas, geração de clientes, posicionamento em buscas, crescimento financeiro ou qualquer resultado comercial específico decorrente do uso da plataforma.</p>
                                </div>
                            </div>

                            {/* Seção 11 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">11.</span>
                                    PROPRIEDADE INTELECTUAL
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>11.1. Marca DUDIT:</strong> O nome, logotipo, mascote e identidade visual da DUDIT são propriedade exclusiva de seus titulares. É proibida qualquer reprodução, modificação ou uso não autorizado.</p>
                                    <p><strong>11.2. Responsabilidade sobre Conteúdo:</strong> O Parceiro declara ser o titular ou licenciado de todos os direitos sobre imagens, vídeos, textos e conteúdos que publicar na plataforma, respondendo integralmente por eventuais violações de direitos de terceiros.</p>
                                    <p><strong>11.3. Licença de Uso Concedida à DUDIT:</strong> Ao cadastrar produtos, logotipos, fotos e vídeos, o Parceiro concede à DUDIT uma licença gratuita, não exclusiva e limitada ao território nacional para exibir tais conteúdos na plataforma e em materiais de divulgação da vitrine do Parceiro.</p>
                                </div>
                            </div>

                            {/* Seção 12 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">12.</span>
                                    ENCERRAMENTO E SUSPENSÃO
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>12.1. Cancelamento pelo Parceiro:</strong> O Parceiro pode cancelar sua conta ou assinatura a qualquer momento, sem multa de fidelidade, através das configurações da plataforma ou pelo canal de suporte.</p>
                                    <p><strong>12.2. Rescisão por Violação:</strong> A DUDIT reserva-se o direito de suspender ou encerrar qualquer conta, sem aviso prévio e sem direito a reembolso proporcional, em casos de violação destes Termos, fraude comprovada, uso indevido da plataforma ou conduta que cause dano a terceiros ou à reputação da DUDIT.</p>
                                    <p><strong>12.3. Vedação de Reincidência:</strong> A criação de novas contas para burlar suspensões ou encerramentos é expressamente proibida e pode resultar em bloqueio permanente.</p>
                                    <p><strong>12.4. Efeitos da Exclusão:</strong> Após a exclusão da conta, os anúncios públicos do Parceiro deixam de ser exibidos na vitrine digital, sem prejuízo da retenção de dados nos termos da Política de Privacidade.</p>
                                    <p><strong>12.5. Exportação de Dados Antes do Encerramento:</strong> O Parceiro poderá exportar seus dados cadastrados (produtos, clientes, pedidos) a qualquer momento antes do encerramento da conta, através das ferramentas disponíveis na plataforma.</p>
                                </div>
                            </div>

                            {/* Seção 13 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">13.</span>
                                    ALTERAÇÕES NOS TERMOS
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>13.1.</strong> A DUDIT poderá alterar estes Termos a qualquer tempo, mediante publicação da nova versão na plataforma.</p>
                                    <p><strong>13.2.</strong> Os novos Termos entrarão em vigor 10 (dez) dias após publicação. O uso continuado da plataforma após esse prazo implica aceitação tácita das novas condições. Caso não concorde, o Parceiro deverá encerrar sua conta antes do prazo.</p>
                                    <p><strong>13.3. Cessão dos Termos:</strong> A DUDIT poderá ceder ou transferir os direitos e obrigações decorrentes destes Termos em caso de reorganização societária, constituição de Pessoa Jurídica, fusão, aquisição ou venda do negócio, mediante comunicação prévia aos Parceiros, sendo mantidas as condições essenciais de proteção de dados e de uso da plataforma. O Parceiro não poderá ceder sua posição contratual a terceiros sem autorização prévia da DUDIT.</p>
                                </div>
                            </div>

                            {/* Seção 14 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">14.</span>
                                    FORO
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>14.1.</strong> Fica eleito o Foro da Comarca de Lucélia/SP para dirimir quaisquer dúvidas oriundas destes Termos, com renúncia expressa a qualquer outro, por mais privilegiado que seja, sem prejuízo das hipóteses em que a legislação consumerista assegure ao Usuário o direito de ajuizar ação no foro de seu domicílio.</p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-20 pt-12 border-t border-brand-border text-center">
                            <p className="text-brand-inactive-text italic">
                                DUDIT - Lucélia/SP - dudit.com.br
                            </p>
                        </div>
                    </div>
                </section>
            </div>

            <Footer onNavigate={onNavigate} />
        </div>
    );
};
