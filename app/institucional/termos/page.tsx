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
                                Versão 1.1 — Última atualização: Novembro de 2026
                            </p>
                        </motion.div>
                    </div>
                </section>

                <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <div className="prose prose-lg max-w-none text-brand-dark leading-relaxed space-y-12">
                        <p className="font-medium text-xl border-l-4 border-brand-green pl-6 py-2 bg-brand-gray rounded-r-xl">
                            Estes Termos de Uso (“Termos”) regem o acesso e a utilização da plataforma DUDIT, operada por <strong>[RAZÃO SOCIAL OU NOME CIVIL COMPLETO DA OPERADORA]</strong>, inscrita no <strong>[CNPJ ou CPF, conforme a estrutura jurídica aplicável]</strong>, com endereço para contato em <strong>[ENDEREÇO COMPLETO]</strong> e e-mail <strong>[E-MAIL OFICIAL DE CONTATO]</strong>, doravante denominada “DUDIT”.
                        </p>

                        <p>
                            Ao utilizar a DUDIT, seja como <strong>PARCEIRO</strong> (Vendedor/Prestador de Serviços), <strong>USUÁRIO</strong> (Comprador/Consumidor Final) ou em qualquer outra modalidade disponibilizada, você declara que teve acesso a estes Termos e compreendeu as condições aplicáveis à utilização da plataforma.
                        </p>

                        <p className="text-brand-inactive-text">
                            A utilização de determinadas funcionalidades poderá exigir aceites específicos, autorizações ou condições complementares, apresentados no momento de sua contratação ou utilização.
                        </p>

                        <div className="bg-brand-dark text-white p-8 rounded-2xl shadow-xl">
                            <h3 className="text-white text-xl font-bold mb-4 uppercase tracking-wide">Uso por menores de idade</h3>
                            <p className="text-gray-300 leading-relaxed">
                                O cadastro como Parceiro, para exercer atividade comercial ou assumir obrigações contratuais, deverá observar os requisitos de capacidade civil e representação previstos na legislação brasileira. O acesso de crianças e adolescentes deverá respeitar o Estatuto da Criança e do Adolescente, a Lei Geral de Proteção de Dados (LGPD) e as normas aplicáveis aos serviços digitais, inclusive o ECA Digital. A DUDIT poderá aplicar restrições de idade e de funcionalidades quando necessárias à proteção dos menores e ao cumprimento da legislação. Pais e responsáveis devem acompanhar a utilização da plataforma por crianças e adolescentes, sem prejuízo das responsabilidades legais próprias da DUDIT e dos demais participantes.
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
                                        <li><strong>• DUDIT:</strong> Plataforma tecnológica que oferece ferramentas de descoberta, divulgação, comercialização e organização de negócios, incluindo vitrines digitais, marketplace e recursos de gestão empresarial.</li>
                                        <li><strong>• Parceiro:</strong> Pessoa física ou jurídica que utiliza a plataforma para divulgar seu negócio, anunciar produtos ou oferecer serviços. Também denominado Vendedor ou Prestador de Serviços, conforme a atividade exercida.</li>
                                        <li><strong>• Usuário:</strong> Pessoa que acessa a plataforma para pesquisar, visualizar, favoritar, contatar, solicitar, contratar ou adquirir produtos e serviços. Também denominado Comprador ou Consumidor Final, conforme a relação estabelecida.</li>
                                        <li><strong>• Plataforma:</strong> Conjunto de funcionalidades disponibilizadas pela DUDIT, incluindo vitrines digitais, marketplace, ferramentas de gestão, recursos de atendimento, pedidos, agendamentos e demais soluções tecnológicas.</li>
                                        <li><strong>• Gateway de Pagamento:</strong> Serviço terceirizado responsável pelo processamento de transações financeiras online. A DUDIT possui integração com o Mercado Pago, conforme disponibilidade e condições técnicas e contratuais aplicáveis.</li>
                                        <li><strong>• Plano:</strong> Modalidade gratuita ou paga disponibilizada ao Parceiro, que determina os recursos, limites e condições de utilização da plataforma.</li>
                                        <li><strong>• Anúncio:</strong> Publicação de produto, serviço ou oferta realizada pelo Parceiro na plataforma.</li>
                                        <li><strong>• Avaliação:</strong> Manifestação de opinião de um Usuário sobre produto, serviço ou Parceiro, conforme as funcionalidades e regras disponíveis na DUDIT.</li>
                                        <li><strong>• Conteúdo Multimídia:</strong> Fotos, vídeos, imagens, áudios e demais materiais publicados ou compartilhados por Parceiros ou Usuários na plataforma.</li>
                                        <li><strong>• Vitrine Digital:</strong> Espaço público do Parceiro na DUDIT, destinado à apresentação de seu negócio, produtos, serviços, informações e conteúdos.</li>
                                        <li><strong>• Pedido:</strong> Registro de uma solicitação de compra ou contratação realizada por meio das funcionalidades disponibilizadas pela plataforma.</li>
                                        <li><strong>• Entregador Participante:</strong> Pessoa previamente convidada ou habilitada pela DUDIT para receber solicitações de entrega local e decidir se aceita ou não realizar determinado serviço.</li>
                                        <li><strong>• Serviços de Terceiros:</strong> Sistemas, empresas e ferramentas externas integradas ou utilizadas pela DUDIT, incluindo serviços de pagamento, logística, hospedagem, comunicação, segurança e análise.</li>
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
                                    <p><strong>2.1.</strong> Para utilizar a plataforma como Parceiro, poderão ser solicitados dados como nome completo, nome da loja ou estabelecimento, CPF/CNPJ, endereço, e-mail, telefone e outras informações necessárias à criação e manutenção da conta. A coleta e o tratamento desses dados observarão a Política de Privacidade da DUDIT e a legislação aplicável.</p>
                                    <p><strong>2.2.</strong> O Parceiro e o Usuário comprometem-se a fornecer informações exatas, completas e verdadeiras, mantendo seus dados atualizados. Cada titular é responsável pelas informações inseridas em sua conta, sem prejuízo dos deveres da DUDIT quanto à segurança, tratamento e utilização adequada dos dados.</p>
                                    <p><strong>2.3. Unicidade de Cadastro:</strong> A DUDIT poderá estabelecer critérios de unicidade e associação de contas por CPF, CNPJ, e-mail, telefone ou outros identificadores. A criação de múltiplas contas com a finalidade de burlar limites, suspensões, bloqueios, verificações ou mecanismos de segurança é expressamente proibida. A existência de mais de uma conta legítima poderá ser analisada conforme a finalidade e as regras da plataforma.</p>
                                    <p><strong>2.4. Compartilhamento de Dados em Casos de Fraude ou Litígio:</strong> Em situações envolvendo suspeita de fraude, golpe, uso indevido da plataforma, ameaça à segurança ou disputa relacionada a uma transação, a DUDIT poderá preservar e compartilhar informações pertinentes quando houver fundamento legal, obrigação regulatória, ordem judicial, solicitação válida de autoridade competente ou outra hipótese autorizada pela LGPD. O compartilhamento será limitado ao necessário para a finalidade correspondente. Sempre que juridicamente adequado, a DUDIT poderá cooperar diretamente com as autoridades competentes, sem que isso impeça o fornecimento de informações a titulares ou terceiros quando houver base legal para tanto.</p>
                                    <p><strong>2.5. Backup e Responsabilidade sobre Informações:</strong> A DUDIT poderá adotar medidas técnicas e organizacionais razoáveis para proteger e manter os dados armazenados na plataforma. Entretanto, o Parceiro deverá manter cópias próprias de informações comerciais e documentos essenciais ao funcionamento de seu negócio, especialmente quando esses dados forem críticos para suas atividades. Essa recomendação não afasta as obrigações legais da DUDIT relacionadas à segurança, disponibilidade, integridade e proteção dos dados sob sua responsabilidade.</p>
                                    <p><strong>2.6. Credenciais e Segurança da Conta:</strong> O titular é responsável por manter a confidencialidade de suas senhas, códigos de acesso e demais credenciais, devendo comunicar à DUDIT qualquer suspeita de acesso não autorizado. É proibido compartilhar, comercializar ou transferir contas a terceiros sem autorização da DUDIT.</p>
                                    <p><strong>2.7. Verificação Cadastral:</strong> A DUDIT poderá solicitar informações ou documentos adicionais para verificar a identidade do titular, a legitimidade de um estabelecimento, a representação de uma pessoa jurídica ou a regularidade de determinada atividade, respeitando a necessidade e a finalidade da verificação e as regras de proteção de dados.</p>
                                    <p><strong>2.8.</strong> Eventual selo, identificação ou indicação de perfil verificado deverá ser interpretado conforme o procedimento efetivamente realizado. A verificação de identidade ou de dados cadastrais não representa garantia de honestidade, qualidade, solvência, segurança ou confiabilidade comercial do Parceiro.</p>
                                </div>
                            </div>

                            {/* Seção 3 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">3.</span>
                                    USO DA PLATAFORMA
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>3.1. Natureza do Serviço:</strong> A DUDIT é uma plataforma tecnológica que disponibiliza ferramentas de gestão empresarial (ERP), vitrines digitais, recursos de marketplace e canais de descoberta e divulgação de produtos e serviços. O Parceiro poderá utilizar as funcionalidades de forma independente e modular, conforme suas necessidades e os recursos disponíveis em seu plano.</p>
                                    <p><strong>3.2. Papel da DUDIT:</strong> A DUDIT fornece ferramentas tecnológicas para organizar vitrines, anúncios, catálogos, carrinhos, checkouts, pedidos, agendamentos, contatos e recursos de gestão. O Parceiro é responsável pelas ofertas que publica, pela disponibilidade dos produtos e serviços, pelas informações comerciais, pelo atendimento e pelo cumprimento das obrigações relacionadas à atividade que exerce. A DUDIT não fabrica os produtos nem executa os serviços anunciados pelos Parceiros. Essa delimitação não exclui as responsabilidades legais da DUDIT por seus próprios serviços, integrações, informações, atividades e obrigações previstas na legislação.</p>
                                    <p><strong>3.3. Relação de Compra e Venda:</strong> A contratação de produtos ou serviços anunciados é estabelecida entre o Usuário e o Parceiro, conforme a oferta apresentada e a modalidade de contratação utilizada. A DUDIT poderá facilitar a descoberta, a comunicação, o registro de pedidos e o início ou acompanhamento de pagamentos por meio de integrações com terceiros. A definição dos papéis contratuais não afasta direitos dos consumidores nem responsabilidades que a legislação atribua à DUDIT conforme sua atuação concreta.</p>
                                    <p><strong>3.4. Responsabilidades do Parceiro:</strong> Sem afastar os deveres próprios da DUDIT e os direitos assegurados aos consumidores, o Parceiro é responsável, conforme sua atividade, por:</p>
                                    <ul className="list-disc pl-6 space-y-2">
                                        <li>Veracidade, clareza e atualização das informações dos anúncios;</li>
                                        <li>Preços, condições comerciais e disponibilidade dos produtos e serviços;</li>
                                        <li>Características, qualidade, segurança e adequação dos produtos;</li>
                                        <li>Cumprimento das ofertas e condições anunciadas;</li>
                                        <li>Entrega dos produtos ou execução dos serviços contratados;</li>
                                        <li>Atendimento ao consumidor e tratamento das solicitações recebidas;</li>
                                        <li>Cumprimento das obrigações legais de garantia, troca, devolução e reembolso;</li>
                                        <li>Observância do Código de Defesa do Consumidor e demais normas aplicáveis;</li>
                                        <li>Emissão de documentos fiscais exigidos pela legislação;</li>
                                        <li>Regularidade de licenças, registros e autorizações necessários à sua atividade.</li>
                                    </ul>
                                    <p><strong>3.5. Confidencialidade e Uso de Dados:</strong> Parceiros e Usuários deverão utilizar os dados pessoais aos quais tiverem acesso em razão de uma transação exclusivamente para finalidades legítimas relacionadas à solicitação, contratação, atendimento, pagamento, entrega ou cumprimento de obrigações legais. É proibido comercializar cadastros, utilizar dados para spam, realizar abordagens não autorizadas ou compartilhar informações pessoais para finalidades incompatíveis com a relação estabelecida. Cada participante deverá observar a LGPD e adotar medidas adequadas de proteção dos dados sob seu controle.</p>
                                    <p><strong>3.6. Responsabilidade por Condutas e Indenização:</strong> Cada Parte responderá por danos, prejuízos, reclamações e despesas decorrentes de seus próprios atos, omissões, descumprimentos contratuais ou violações da legislação. O Parceiro deverá ressarcir a DUDIT por prejuízos comprovadamente causados por sua conduta ilícita, uso indevido da plataforma, violação destes Termos ou violação de direitos de terceiros, desde que exista relação entre sua conduta e o dano reclamado. Esta cláusula não afasta direitos de consumidores, não transfere ao Parceiro responsabilidades próprias da DUDIT e não estabelece isenção geral de responsabilidade.</p>
                                    <p><strong>3.7. Ausência de Vínculo Empregatício ou Societário:</strong> O simples cadastro e uso da DUDIT pelo Parceiro não cria, por si só, vínculo empregatício, societário ou de representação comercial entre o Parceiro e a DUDIT. O Parceiro atua de forma independente na oferta de seus produtos e serviços e responde pelas obrigações trabalhistas, previdenciárias, tributárias e civis relacionadas à sua própria atividade e aos seus colaboradores, sem prejuízo da análise da realidade dos fatos e das responsabilidades que a legislação eventualmente atribua a cada parte.</p>
                                    <p><strong>3.8. Não Exclusividade:</strong> O uso da DUDIT não obriga o Parceiro a atuar com exclusividade na plataforma. O Parceiro poderá divulgar e comercializar seus produtos ou serviços em outros canais, redes sociais, aplicativos, sites e marketplaces, simultaneamente, respeitando os contratos e as leis aplicáveis.</p>
                                    <p><strong>3.9. Arquivos e Anexos entre Parceiro e Usuário:</strong> Arquivos, documentos e anexos trocados entre Parceiro e Usuário por meio da plataforma, como comprovantes, especificações e documentos relacionados a pedidos, poderão ter acesso restrito aos participantes autorizados, conforme as funcionalidades e permissões do sistema. A DUDIT poderá utilizar infraestrutura de terceiros para armazenamento e processamento desses arquivos. O fato de não realizar monitoramento individual e contínuo de todos os arquivos não significa que a DUDIT esteja impedida de adotar medidas de segurança, apurar denúncias, cumprir ordens legais ou restringir conteúdos que apresentem indícios de ilegalidade, fraude ou risco. O acesso aos arquivos deverá respeitar a legislação, as finalidades informadas e os controles de acesso aplicáveis.</p>
                                    <p><strong>3.10. Uso Opcional das Ferramentas de Gestão:</strong> As ferramentas de ERP, cadastro de clientes, estoque, pedidos e organização financeira são disponibilizadas como recursos de apoio à gestão do Parceiro. O Parceiro permanece responsável por conferir os registros, validar informações e manter os controles necessários ao seu negócio. A DUDIT não substitui serviços contábeis, jurídicos, fiscais ou profissionais especializados.</p>
                                    <p><strong>3.11. Documentos Fiscais:</strong> A DUDIT não substitui os sistemas fiscais do Parceiro e não emite, por meio de simples recibos, comprovantes ou cupons não fiscais, documentos fiscais que sejam legalmente exigidos. O Parceiro deverá emitir notas fiscais e demais documentos fiscais quando obrigado pela legislação aplicável à sua atividade.</p>
                                    <p className="bg-brand-gray p-5 rounded-xl border border-brand-border">
                                        <strong>3.12. Tratamento de Dados no Módulo de Gestão (ERP) e Acordo de Tratamento de Dados (DPA):</strong> Quando o Parceiro utiliza as ferramentas de gestão empresarial (ERP) da DUDIT para armazenar e processar dados de seus próprios clientes, colaboradores ou fornecedores, o Parceiro atua como Controlador e a DUDIT atua como Operadora desses dados, nos termos da Lei Geral de Proteção de Dados (LGPD). As obrigações e salvaguardas técnicas e jurídicas aplicáveis a esse tratamento são disciplinadas no <a href="/institucional/dpa" className="text-brand-green font-medium underline underline-offset-4">Acordo de Tratamento de Dados (DPA)</a> da DUDIT, o qual complementa estes Termos de Uso e integra o vínculo contratual entre as partes.
                                    </p>
                                </div>
                            </div>

                            {/* Seção 4 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">4.</span>
                                    POLÍTICA DE CONTEÚDO
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>4.1. Conteúdo Permitido:</strong> A plataforma admite, observadas as leis e as regras aplicáveis, a publicação de anúncios e conteúdos relativos a:</p>
                                    <ul className="list-disc pl-6 space-y-2">
                                        <li>Produtos novos;</li>
                                        <li>Produtos usados, desde que seu estado e suas condições sejam informados corretamente;</li>
                                        <li>Serviços lícitos;</li>
                                        <li>Produtos e serviços digitais permitidos;</li>
                                        <li>Divulgação de estabelecimentos e atividades profissionais regulares;</li>
                                        <li>Conteúdos informativos e promocionais relacionados aos produtos e serviços oferecidos pelo Parceiro.</li>
                                    </ul>
                                    <p><strong>4.2. Conteúdo Proibido:</strong> É expressamente vedado anunciar, publicar, comercializar ou divulgar na DUDIT:</p>
                                    <ul className="list-disc pl-6 space-y-2">
                                        <li>Golpes, esquemas de pirâmide, fraudes ou captação irregular de investimentos;</li>
                                        <li>Spam, correntes ou divulgação em massa não solicitada;</li>
                                        <li>Links maliciosos, phishing, vírus ou conteúdo destinado a comprometer a segurança de terceiros;</li>
                                        <li>Venda, aluguel ou transferência de contas de plataformas ou serviços quando proibidos por seus titulares ou pela legislação;</li>
                                        <li>Drogas, substâncias ilícitas ou entorpecentes;</li>
                                        <li>Armas de fogo, munições, explosivos e outros itens cuja comercialização seja proibida ou restrita pela legislação ou pelas regras da plataforma;</li>
                                        <li>Produtos roubados, furtados, contrabandeados ou de origem ilícita;</li>
                                        <li>Produtos sem autorização, registro, licença ou regularização exigidos por lei;</li>
                                        <li>Produtos perigosos comercializados em desacordo com as exigências legais de segurança, rotulagem ou autorização;</li>
                                        <li>Medicamentos controlados ou de venda restrita, quando a oferta não estiver legalmente autorizada;</li>
                                        <li>Animais vivos, salvo quando houver autorização expressa da DUDIT e cumprimento integral da legislação aplicável;</li>
                                        <li>Documentos pessoais, públicos ou pertencentes a terceiros, quando sua comercialização ou divulgação for ilegal;</li>
                                        <li>Serviços ilegais ou que configurem exercício irregular de profissão regulamentada;</li>
                                        <li>Apostas, jogos de azar ou atividades financeiras não autorizadas pela legislação;</li>
                                        <li>Produtos financeiros ou investimentos oferecidos sem as autorizações regulatórias exigíveis;</li>
                                        <li>Réplicas, falsificações ou produtos que violem direitos de propriedade intelectual ou industrial;</li>
                                        <li>Conteúdo pornográfico, exploração sexual, abuso, aliciamento ou qualquer conteúdo envolvendo exploração de crianças e adolescentes;</li>
                                        <li>Conteúdo discriminatório, ameaçador, de assédio ou que incentive violência contra pessoas ou grupos;</li>
                                        <li>Conteúdo que viole direitos de imagem, privacidade, honra, propriedade intelectual ou outros direitos de terceiros;</li>
                                        <li>Qualquer produto, serviço ou atividade cuja oferta viole a legislação brasileira ou represente risco indevido aos Usuários ou à integridade da plataforma.</li>
                                    </ul>
                                    <p><strong>4.3.</strong> A lista acima é exemplificativa e poderá ser atualizada para contemplar novas situações, exigências legais e riscos identificados. A DUDIT poderá restringir, suspender ou remover conteúdos que violem estes Termos, a legislação ou os direitos de terceiros, observando, quando aplicável, os procedimentos de notificação, fundamentação, revisão e demais garantias legais.</p>
                                    <p><strong>4.4. Responsabilidade pelo Conteúdo:</strong> O Parceiro ou Usuário que publicar conteúdo será responsável por sua legalidade, veracidade, pertinência e pelos direitos necessários à sua utilização. A publicação de conteúdo na plataforma não significa que a DUDIT tenha verificado ou garantido todas as informações nele contidas.</p>
                                    <p><strong>4.5. Denúncias:</strong> Usuários poderão comunicar anúncios, perfis, avaliações ou conteúdos que aparentem violar estes Termos, a legislação ou direitos de terceiros, por meio dos canais de denúncia ou atendimento disponibilizados pela DUDIT. As denúncias poderão ser analisadas e resultar em medidas proporcionais à situação identificada.</p>
                                </div>
                            </div>

                            {/* Seção 5 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">5.</span>
                                    MARKETPLACE E ANÚNCIOS
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>5.1. Canal de Descoberta:</strong> A DUDIT atua como canal tecnológico de descoberta e divulgação de produtos e serviços dos Parceiros, disponibilizando vitrines digitais, ferramentas de pesquisa e recursos para apresentação de anúncios. A publicação de um anúncio não representa, por si só, certificação, aprovação comercial ou garantia de qualidade pela DUDIT.</p>
                                    <p><strong>5.2. Produtos Usados:</strong> O Parceiro deverá informar de maneira clara, verdadeira e destacada o estado de conservação dos produtos usados, incluindo defeitos, avarias, limitações de funcionamento, peças ausentes, sinais relevantes de desgaste e demais características que possam influenciar a decisão de compra. O anúncio não poderá ocultar informações relevantes ou induzir o consumidor a erro.</p>
                                    <p><strong>5.3. Serviços:</strong> A contratação de serviços ocorre entre o Parceiro e o Usuário, conforme a oferta e as condições apresentadas. O Parceiro é responsável por possuir as qualificações, licenças e autorizações necessárias, prestar informações adequadas e executar o serviço de acordo com o que foi contratado. A DUDIT disponibiliza ferramentas tecnológicas de divulgação e organização, sem que isso represente garantia de execução ou qualidade do serviço anunciado.</p>
                                    <p><strong>5.3.1. Ferramenta de Agenda e Agendamentos:</strong> A funcionalidade de agenda disponibilizada pela DUDIT é uma ferramenta de apoio à organização de horários e atendimentos do Parceiro. O Parceiro é responsável por manter sua disponibilidade atualizada, confirmar os compromissos quando necessário e atender às condições informadas ao Usuário. O Usuário é responsável por fornecer informações corretas e observar os horários e condições combinados. Registros, notificações e confirmações gerados automaticamente pela plataforma têm finalidade operacional e informativa, mas deverão ser considerados conforme o funcionamento efetivo da funcionalidade e as informações apresentadas durante o agendamento. A DUDIT não executa o serviço profissional agendado, sem prejuízo de sua responsabilidade pelo correto funcionamento das ferramentas que disponibiliza.</p>
                                    <p><strong>5.4. Avaliações:</strong> As avaliações publicadas na plataforma devem refletir experiências legítimas dos Usuários com Parceiros, produtos ou serviços. É proibido publicar avaliações falsas, manipuladas, compradas, discriminatórias, ameaçadoras, ofensivas ou destinadas a prejudicar injustamente terceiros ou favorecer artificialmente determinado perfil. A DUDIT poderá moderar avaliações que violem estes Termos ou a legislação, inclusive mediante denúncia ou identificação de indícios de manipulação. Sempre que aplicável, o autor poderá solicitar revisão da medida pelos canais de atendimento. A avaliação representa a opinião de seu autor e não necessariamente a posição da DUDIT.</p>
                                    <p><strong>5.5. Vídeos de Divulgação de Parceiros:</strong> A DUDIT poderá disponibilizar funcionalidade de publicação de vídeos de divulgação, por meio da qual o Parceiro apresenta produtos ou serviços relacionados à sua vitrine. A quantidade de vídeos que poderá ser publicada por período será definida conforme o Plano contratado e as regras da funcionalidade.</p>
                                    <p><strong>5.5.1. Aprovação Prévia:</strong> Quando a funcionalidade exigir análise prévia, os vídeos enviados pelo Parceiro poderão ser submetidos à moderação antes da publicação. A DUDIT poderá aprovar, reprovar, solicitar ajustes ou remover conteúdos que violem estes Termos, a Política de Conteúdo, direitos de terceiros ou exigências legais. A análise de conteúdo não representa garantia absoluta de legalidade, qualidade ou veracidade das informações divulgadas.</p>
                                    <p><strong>5.5.2. Natureza da Funcionalidade:</strong> A funcionalidade de vídeos de divulgação destina-se à apresentação de produtos e serviços relacionados às atividades dos Parceiros na DUDIT. Não constitui, por si só, uma rede social de publicação irrestrita. Os vídeos deverão respeitar as regras da plataforma, possuir relação legítima com o negócio anunciado e não poderão conter materiais ilícitos, enganosos ou que violem direitos de terceiros.</p>
                                    <p><strong>5.5.3. Ausência de Comissão sobre Vendas:</strong> A DUDIT não cobra atualmente comissão ou percentual sobre as vendas realizadas pelos Parceiros em razão da publicação de vídeos ou anúncios. A remuneração da DUDIT ocorre principalmente por meio dos planos e serviços contratados pelos Parceiros. Caso esse modelo seja alterado futuramente, as novas condições deverão ser comunicadas previamente, com apresentação clara das regras aplicáveis e obtenção dos aceites necessários quando exigidos.</p>
                                    <p><strong>5.6. Conteúdo em Vídeo — Licença e Responsabilidade:</strong> Ao publicar vídeos na plataforma, o Parceiro ou Usuário declara possuir os direitos, licenças e autorizações necessários para sua utilização. É concedida à DUDIT licença gratuita, não exclusiva e limitada às finalidades de hospedagem, reprodução técnica, exibição, disponibilização e divulgação da própria publicação e da vitrine ou serviço correspondente, nos canais e ambientes da DUDIT. Essa licença permanecerá válida enquanto necessária à prestação do serviço e ao cumprimento de obrigações legais, respeitados os direitos do titular e os procedimentos de exclusão aplicáveis. A publicação não transfere à DUDIT a propriedade do conteúdo.</p>
                                    <p><strong>5.7. Imagens e Conteúdos:</strong> O Parceiro declara ser titular ou possuir autorização válida para utilizar as imagens, marcas, fotografias, vídeos, textos e demais materiais publicados. É proibido utilizar conteúdo de catálogos, marcas, fotógrafos, artistas ou terceiros sem autorização ou fundamento legal. A DUDIT poderá remover ou restringir conteúdos diante de denúncias fundamentadas, indícios de violação ou exigências legais.</p>
                                    <p><strong>5.8. Licença de Uso de Imagem e Vídeo:</strong> Ao cadastrar produtos, logotipos, fotos e vídeos, o Parceiro concede à DUDIT licença gratuita, não exclusiva e limitada ao necessário para exibir os conteúdos na plataforma e divulgar a vitrine ou os serviços do próprio Parceiro. A utilização em campanhas ou materiais externos deverá manter relação com a divulgação da DUDIT ou da vitrine correspondente, respeitando a finalidade da licença, os direitos de terceiros e eventuais solicitações legítimas de retirada. A licença não autoriza uso irrestrito de imagem pessoal, marca ou conteúdo de terceiros.</p>
                                    <p><strong>5.9. Ordem de Exibição e Ranking:</strong> A ordem de exibição de anúncios, Parceiros e conteúdos poderá considerar critérios como relevância da pesquisa, localização, disponibilidade, qualidade e completude do perfil, correspondência com a busca, atividade na plataforma, adequação do conteúdo e outros fatores técnicos ou comerciais. A DUDIT não garante posicionamento específico ou exposição mínima. Caso haja influência de plano contratado ou destaque comercial na ordenação, essa condição deverá ser apresentada de maneira clara quando exigido pela legislação.</p>
                                </div>
                            </div>

                            {/* Seção 6 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">6.</span>
                                    PAGAMENTOS E INTEGRAÇÕES
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>6.1. Integração com Pagamento:</strong> A plataforma possui integração com o Mercado Pago para possibilitar o início e o acompanhamento de pagamentos online, conforme as funcionalidades disponíveis. Quando aplicável, o Parceiro deverá conectar ou configurar sua própria conta junto ao provedor de pagamento e cumprir os requisitos de cadastro, validação e utilização estabelecidos por esse provedor.</p>
                                    <p><strong>6.2. Valores das Vendas:</strong> Nas modalidades atualmente disponibilizadas, os valores das vendas são processados e liquidados pelo provedor de pagamento na conta conectada do Parceiro, conforme as regras e condições do próprio serviço. A DUDIT não recebe nem mantém em custódia os valores das vendas realizadas entre Usuários e Parceiros e não cobra comissão ou percentual sobre essas vendas. A DUDIT poderá cobrar separadamente pelos planos e serviços próprios contratados pelo Parceiro. A ausência de custódia dos valores não afasta as responsabilidades da DUDIT relativas às funcionalidades tecnológicas que efetivamente disponibiliza.</p>
                                    <p><strong>6.3. Disputas, Cancelamentos e Reembolsos:</strong> O Parceiro deverá atender às solicitações dos consumidores e cumprir as obrigações legais relativas aos produtos e serviços que oferece, inclusive quanto a cancelamentos, trocas, devoluções, garantias e reembolsos. As operações financeiras realizadas pelo Mercado Pago ou por outro provedor integrado estarão sujeitas às regras e aos procedimentos desse fornecedor. A DUDIT poderá disponibilizar registros técnicos e informações pertinentes para auxiliar na apuração de ocorrências, sem assumir decisões que competem ao provedor ou ao Parceiro. Essa divisão de atividades não restringe os direitos dos consumidores nem afasta obrigações legais próprias da DUDIT.</p>
                                    <p><strong>6.4. Pagamentos Fora da Plataforma:</strong> Quando o Parceiro disponibilizar formas de pagamento direto, como PIX, dinheiro, cartão presencial ou pagamento na entrega, as condições deverão ser informadas ao Usuário de maneira clara. O pagamento será realizado diretamente ao Parceiro ou ao responsável indicado por ele, sem recebimento dos valores pela DUDIT. O Parceiro deverá confirmar o recebimento e fornecer os comprovantes ou documentos fiscais cabíveis. A DUDIT não se responsabiliza por confirmar pagamentos realizados fora de seus sistemas, salvo pelas informações e funcionalidades que efetivamente disponibilizar.</p>
                                    <p><strong>6.5. Segurança e Dados de Pagamento:</strong> Os dados de pagamento poderão ser tratados diretamente pelo provedor integrado, conforme seus próprios termos e políticas. A DUDIT poderá receber informações necessárias à identificação e atualização do status de uma transação, sem que isso signifique necessariamente acesso aos dados completos do cartão ou custódia dos valores. O Usuário e o Parceiro deverão observar os procedimentos de segurança e autenticação apresentados pelo provedor.</p>
                                    <p><strong>6.6. Falhas e Indisponibilidade do Provedor:</strong> A aprovação, recusa, retenção, análise de risco, bloqueio, estorno ou liquidação de pagamentos poderá depender de decisões e procedimentos do provedor de pagamento. A DUDIT não controla decisões internas do Mercado Pago, mas deverá tratar, dentro de suas atribuições, falhas técnicas de integração e informações incorretas que estejam sob seu controle.</p>
                                    <p><strong>6.7. Logística Integrada — Envios Nacionais:</strong> Quando disponível, a DUDIT poderá oferecer integração com serviços de logística, como SuperFrete, para facilitar a cotação, contratação ou acompanhamento de envios nacionais. As condições de transporte, prazos estimados, preços, restrições, rastreamento e procedimentos de reclamação dependerão do serviço contratado e da transportadora responsável. O Parceiro deverá embalar e preparar corretamente o produto, informar dados verdadeiros e cumprir suas obrigações perante o consumidor. A transportadora será responsável pela execução do transporte nos limites do contrato e da legislação aplicável. A DUDIT atua como facilitadora tecnológica da integração, sem afastar suas responsabilidades pelas funcionalidades e informações que efetivamente disponibiliza.</p>
                                    <p><strong>6.8. Integrações de Terceiros:</strong> A DUDIT poderá integrar ou utilizar serviços de terceiros para oferecer funcionalidades de pagamento, logística, hospedagem, comunicação, análise, segurança e outras finalidades. Esses serviços poderão possuir termos, políticas, requisitos e condições próprios. A utilização de uma integração poderá exigir cadastro, autorização ou aceite diretamente perante o fornecedor. A DUDIT não controla integralmente os sistemas externos, mas deverá adotar medidas razoáveis dentro de sua esfera de atuação para tratar falhas e cumprir suas obrigações legais.</p>
                                </div>
                            </div>

                            {/* Seção 7 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">7.</span>
                                    PLANOS E COBRANÇAS
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>7.1. Cancelamento de Assinatura:</strong> O Parceiro poderá solicitar o cancelamento de sua assinatura paga a qualquer momento, sem multa de fidelidade, observadas as condições de encerramento do ciclo de cobrança e os direitos previstos na legislação. O cancelamento da assinatura não implica necessariamente a exclusão imediata da conta ou dos dados cadastrados.</p>
                                    <p><strong>7.2. Alteração de Plano:</strong> Após a solicitação de cancelamento ou downgrade, a alteração para o Plano Gratuito ou para outro plano poderá ocorrer ao final do período já contratado ou conforme o prazo informado na tela de contratação e nas configurações da assinatura. Caso exista período de transição, ele deverá ser apresentado de forma clara ao Parceiro antes da confirmação da alteração.</p>
                                    <p><strong>7.3. Política de Downgrade:</strong> Caso o Parceiro migre para um plano com limite inferior ao número de itens cadastrados, os itens excedentes poderão ser arquivados ou deixar de ser exibidos publicamente, conforme as regras e funcionalidades do sistema. Sempre que possível, o Parceiro poderá selecionar quais itens permanecerão ativos dentro do limite do novo plano. Caso exista arquivamento automático, o critério utilizado deverá ser informado de maneira clara. O arquivamento não deverá ser confundido com exclusão definitiva dos dados. A DUDIT deverá disponibilizar informações suficientes para que o Parceiro compreenda os efeitos da mudança de plano.</p>
                                    <p><strong>7.4. Exportação de Dados:</strong> O Parceiro poderá solicitar ou realizar a exportação dos dados de sua conta por meio das ferramentas disponíveis ou dos canais de atendimento da DUDIT, observados os limites técnicos, a segurança, os direitos de terceiros e as obrigações legais de retenção. A exclusão da conta não elimina direitos de acesso, portabilidade ou demais direitos previstos na LGPD, quando aplicáveis.</p>
                                    <p><strong>7.5. Reajuste de Valores:</strong> A DUDIT poderá alterar os preços e condições dos planos, mediante comunicação prévia e clara ao Parceiro, preferencialmente com antecedência mínima de 30 (trinta) dias para alterações que afetem assinaturas recorrentes em andamento. As condições já pagas serão respeitadas até o término do período contratado, salvo disposição legal ou contratual válida em sentido diverso. O Parceiro poderá cancelar a assinatura caso não concorde com as novas condições, observados os direitos legais aplicáveis.</p>
                                    <p><strong>7.6. Renovação e Cobrança Recorrente:</strong> Quando o plano possuir cobrança recorrente, as condições de periodicidade, valor, meio de pagamento e renovação deverão ser informadas antes da contratação. O Parceiro autoriza as cobranças conforme a modalidade escolhida e poderá cancelar a renovação futura pelos meios disponibilizados pela DUDIT ou pelo provedor de pagamento, conforme aplicável.</p>
                                    <p><strong>7.7. Falha de Pagamento:</strong> Em caso de falha na cobrança, pagamento recusado ou ausência de confirmação pelo provedor, a DUDIT poderá comunicar o Parceiro e, após aviso e prazo razoável quando aplicável, limitar funcionalidades pagas ou realizar a migração para outro plano, conforme as condições informadas na contratação. A DUDIT deverá evitar medidas desproporcionais e informar os efeitos da inadimplência.</p>
                                    <p><strong>7.8. Reembolsos de Planos:</strong> Solicitações de cancelamento e reembolso de valores pagos diretamente à DUDIT serão analisadas conforme a modalidade de contratação, o período de utilização e a legislação aplicável, inclusive as regras de proteção do consumidor e o direito de arrependimento quando cabível. Nenhuma disposição destes Termos elimina direitos legais de restituição.</p>
                                </div>
                            </div>

                            {/* Seção 8 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">8.</span>
                                    MODERAÇÃO, PENALIDADES E PREVENÇÃO A FRAUDES
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>8.1. Denúncias:</strong> Usuários e Parceiros poderão denunciar anúncios, perfis, avaliações, vídeos, mensagens ou outros conteúdos que aparentem violar estes Termos, a legislação ou direitos de terceiros, por meio dos canais de suporte ou denúncia disponibilizados pela DUDIT.</p>
                                    <p><strong>8.2. Suspensão Preventiva:</strong> A DUDIT poderá remover conteúdos, limitar funcionalidades, restringir temporariamente operações, suspender vitrines ou bloquear contas quando houver indícios razoáveis de fraude, golpe, atividade ilícita, violação destes Termos, risco à segurança dos Usuários ou comprometimento da integridade da plataforma. Medidas urgentes poderão ser adotadas sem aviso prévio quando necessárias para prevenir danos, preservar evidências ou cumprir obrigações legais.</p>
                                    <p><strong>8.3. Moderação de Conteúdo:</strong> A DUDIT poderá analisar e moderar anúncios, avaliações, vídeos, perfis e demais conteúdos publicados. Quando viável e juridicamente adequado, o responsável será informado sobre a medida adotada e seus motivos, podendo solicitar revisão pelos canais disponibilizados. A comunicação poderá ser limitada quando houver obrigação legal de sigilo, risco à investigação ou necessidade de proteção de terceiros.</p>
                                    <p><strong>8.4. Detecção de Fraudes:</strong> A DUDIT poderá utilizar mecanismos automatizados e análises humanas para identificar comportamentos suspeitos, incluindo criação de contas falsas, manipulação de avaliações, anúncios duplicados, tentativas de fraude, uso abusivo de funcionalidades, acessos anormais e outras atividades que comprometam a segurança da plataforma.</p>
                                    <p><strong>8.5. Medidas Aplicáveis:</strong> Conforme a gravidade, recorrência e circunstâncias da ocorrência, poderão ser adotadas medidas como:</p>
                                    <ul className="list-disc pl-6 space-y-2 text-brand-inactive-text">
                                        <li>Orientação ou advertência;</li>
                                        <li>Solicitação de correção de informações;</li>
                                        <li>Remoção ou ocultação de conteúdo;</li>
                                        <li>Restrição temporária de funcionalidades;</li>
                                        <li>Suspensão preventiva da vitrine pública;</li>
                                        <li>Solicitação de documentos ou informações adicionais;</li>
                                        <li>Suspensão temporária da conta;</li>
                                        <li>Encerramento da conta em casos graves ou recorrentes;</li>
                                        <li>Comunicação às autoridades competentes, quando cabível.</li>
                                    </ul>
                                    <p><strong>8.6. Acesso a Ferramentas de Gestão:</strong> Quando tecnicamente possível e seguro, a DUDIT poderá restringir a exposição pública da vitrine sem bloquear integralmente o acesso do Parceiro às ferramentas de gestão necessárias para consultar pedidos, resolver pendências ou cumprir obrigações já assumidas. Essa possibilidade não representa garantia de manutenção de acesso em situações nas quais a restrição integral seja necessária por segurança, ordem legal ou risco a terceiros.</p>
                                    <p><strong>8.7. Revisão de Medidas:</strong> O Parceiro ou Usuário afetado poderá solicitar esclarecimentos ou revisão de uma medida de moderação, apresentando informações pertinentes. A DUDIT analisará a solicitação conforme a natureza do caso, a disponibilidade de informações e as exigências legais, sem obrigação de restabelecer conteúdos ou contas que permaneçam em desacordo com estes Termos.</p>
                                    <p><strong>8.8. Preservação de Registros:</strong> A DUDIT poderá preservar registros e informações relacionados a incidentes, denúncias, fraudes, violações ou solicitações legais pelo período necessário ao cumprimento de obrigações legais, exercício regular de direitos e proteção da plataforma, observada a Política de Privacidade.</p>
                                </div>
                            </div>

                            {/* Seção 9 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">9.</span>
                                    DISPONIBILIDADE DA PLATAFORMA E FORÇA MAIOR
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>9.1. Disponibilidade:</strong> A DUDIT envidará esforços razoáveis para manter a plataforma disponível e funcional, mas não garante disponibilidade ininterrupta ou ausência absoluta de falhas. Poderão ocorrer interrupções temporárias para manutenção, atualização, correção, melhorias técnicas ou em razão de fatores externos.</p>
                                    <p><strong>9.2. Natureza Tecnológica do Serviço:</strong> A plataforma é disponibilizada conforme suas características técnicas, funcionalidades implementadas e condições de disponibilidade. A DUDIT não garante que todos os recursos funcionarão sem erros em qualquer dispositivo, navegador, sistema operacional ou ambiente de rede. Eventuais falhas deverão ser tratadas conforme a natureza do serviço, as obrigações assumidas e a legislação aplicável.</p>
                                    <p><strong>9.3. Entregas e Logística Local:</strong> A DUDIT poderá disponibilizar recursos para que Parceiros solicitem entregas locais a entregadores previamente convidados ou habilitados. O entregador poderá aceitar ou recusar cada solicitação, não existindo garantia de disponibilidade, cobertura ou conclusão de entrega. Quando a solicitação for aceita, as partes envolvidas deverão observar as informações e condições apresentadas, incluindo retirada, destino, valores, forma de pagamento e instruções necessárias.</p>
                                    <p className="bg-brand-gray p-4 rounded-xl border border-brand-border text-sm">
                                        <strong>Privacidade no Módulo de Entregas:</strong> Para fins de privacidade e segurança dos titulares (consumidores e destinatários), a plataforma adota mecanismos de minimização de dados: antes do aceite da corrida pelo entregador, são exibidos apenas dados aproximados e estritamente necessários para a tomada de decisão (como bairro, cidade, distância estimada, taxa de entrega e modalidade de pagamento), mantendo-se mascarados o endereço completo (número e complemento), o nome completo e o telefone de contato. Somente após a confirmação do aceite pelo entregador responsável, os dados necessários à execução da entrega e ao contato indispensável são revelados. Concluída a entrega, o acesso aos dados é restrito ao histórico estritamente necessário à prestação de contas.
                                    </p>
                                    <p>A execução material da entrega será realizada pelo entregador que aceitar a solicitação, conforme as condições acordadas e a legislação aplicável. O Parceiro deverá preparar e disponibilizar corretamente o produto, enquanto o Usuário deverá fornecer informações adequadas de recebimento. A DUDIT atua na disponibilização da ferramenta tecnológica e na organização das solicitações, sem garantir a disponibilidade de entregadores ou o resultado de cada entrega. Essa delimitação não afasta eventual responsabilidade legal da DUDIT por falhas próprias de seus serviços ou por obrigações que a legislação lhe atribua.</p>
                                    <p><strong>9.4. Envios Nacionais:</strong> Os envios para outras regiões do Brasil poderão ocorrer por meio de integrações com serviços de logística, como SuperFrete, quando disponíveis. Essas operações são distintas das solicitações de entregas locais. As condições de transporte, coleta, postagem, rastreamento, prazos e tratamento de ocorrências dependerão do serviço contratado e da transportadora responsável, sem prejuízo das obrigações legais do vendedor perante o consumidor.</p>
                                    <p><strong>9.5. Força Maior e Caso Fortuito:</strong> A DUDIT não será responsabilizada por impossibilidades ou atrasos decorrentes de eventos inevitáveis e alheios ao seu controle razoável, nos limites permitidos pela legislação, como catástrofes naturais, interrupções generalizadas de infraestrutura, determinações governamentais, conflitos, pandemias e outros eventos caracterizados legalmente como caso fortuito ou força maior. Essa disposição não afasta deveres de prevenção, comunicação, segurança ou mitigação que sejam legalmente exigíveis.</p>
                                </div>
                            </div>

                            {/* Seção 10 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">10.</span>
                                    LIMITAÇÃO DE RESPONSABILIDADE
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>10.1. Limites Legais:</strong> As disposições destes Termos relativas à responsabilidade deverão ser interpretadas conforme a legislação brasileira. Nenhuma cláusula tem por finalidade afastar direitos indisponíveis, direitos dos consumidores, deveres de proteção de dados ou responsabilidades que legalmente pertençam à DUDIT.</p>
                                    <p><strong>10.2. Responsabilidade de Cada Participante:</strong> O Parceiro responde pelas ofertas, produtos, serviços, informações comerciais, atendimento e obrigações relacionadas à sua atividade. O Usuário responde pela veracidade das informações que fornece e pelo uso adequado de sua conta. A DUDIT responde pelos serviços que presta, pelas funcionalidades sob seu controle e pelas obrigações que a legislação lhe atribui. Terceiros integrados respondem por suas próprias atividades, conforme os contratos e a legislação aplicável.</p>
                                    <p><strong>10.3. Ausência de Garantia de Resultados:</strong> A DUDIT não garante volume de vendas, geração de clientes, posicionamento específico em pesquisas, crescimento financeiro ou qualquer resultado comercial decorrente do uso da plataforma.</p>
                                    <p><strong>10.4. Falhas de Terceiros:</strong> A DUDIT não controla integralmente os sistemas, decisões e operações de fornecedores externos, como gateways de pagamento, transportadoras, serviços de hospedagem e provedores de comunicação. A eventual falha de um terceiro deverá ser analisada conforme a participação de cada parte no evento, os deveres legais aplicáveis e as medidas que estavam razoavelmente sob seu controle.</p>
                                    <p><strong>10.5. Danos e Prejuízos:</strong> Eventuais pedidos de indenização serão analisados conforme a legislação aplicável, considerando a conduta, o dano, o nexo causal e as responsabilidades de cada envolvido. Não haverá exclusão automática de responsabilidade por danos decorrentes de falha própria, dolo, culpa ou outras hipóteses em que a lei impeça tal exclusão.</p>
                                </div>
                            </div>

                            {/* Seção 11 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">11.</span>
                                    PROPRIEDADE INTELECTUAL
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>11.1. Marca DUDIT:</strong> O nome DUDIT, logotipo, identidade visual, mascote, elementos gráficos, textos institucionais, layouts, sistemas, códigos, funcionalidades e demais elementos próprios da plataforma são protegidos pela legislação aplicável e pertencem à DUDIT ou aos respectivos titulares licenciantes. É proibida sua reprodução, modificação, distribuição ou utilização não autorizada.</p>
                                    <p><strong>11.2. Responsabilidade sobre Conteúdo:</strong> O Parceiro ou Usuário declara ser titular ou possuir autorização válida para utilizar imagens, vídeos, textos, marcas, fotografias e demais conteúdos que publicar. O responsável pela publicação deverá observar os direitos autorais, de imagem, marcas, privacidade e demais direitos de terceiros.</p>
                                    <p><strong>11.3. Licença de Uso Concedida à DUDIT:</strong> Ao publicar conteúdos na plataforma, o titular concede à DUDIT licença gratuita, não exclusiva e limitada às finalidades necessárias para hospedar, armazenar, reproduzir tecnicamente, exibir e divulgar o conteúdo no contexto da plataforma e da vitrine correspondente. A licença não transfere a propriedade do material e não autoriza sua utilização para finalidades incompatíveis com a operação ou divulgação do serviço.</p>
                                    <p><strong>11.4. Denúncias de Violação de Direitos:</strong> O titular de direitos que identificar conteúdo supostamente irregular poderá comunicar a DUDIT por meio dos canais de atendimento, apresentando informações suficientes para identificar o material e demonstrar a alegação. A DUDIT poderá solicitar informações adicionais, restringir preventivamente o conteúdo quando cabível e adotar as medidas legalmente exigíveis.</p>
                                    <p><strong>11.5. Uso Indevido da Plataforma:</strong> É proibido copiar, descompilar, realizar engenharia reversa, explorar vulnerabilidades, extrair dados em larga escala, interferir no funcionamento ou utilizar mecanismos automatizados não autorizados para acessar a plataforma, salvo nas hipóteses permitidas por lei ou mediante autorização expressa.</p>
                                </div>
                            </div>

                            {/* Seção 12 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">12.</span>
                                    ENCERRAMENTO E SUSPENSÃO
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>12.1. Cancelamento pelo Parceiro:</strong> O Parceiro poderá solicitar o cancelamento de sua conta ou assinatura a qualquer momento, por meio das configurações disponíveis na plataforma ou pelos canais de atendimento. O cancelamento da assinatura paga e a exclusão da conta são procedimentos distintos e poderão produzir efeitos diferentes.</p>
                                    <p><strong>12.2. Rescisão por Violação:</strong> A DUDIT poderá suspender ou encerrar contas em casos de violação destes Termos, fraude, atividade ilícita, uso abusivo da plataforma, risco à segurança ou descumprimento grave de obrigações. Conforme a gravidade e a urgência, a medida poderá ser preventiva e imediata. Quando possível e juridicamente adequado, o titular será informado sobre os motivos e poderá solicitar revisão. A suspensão ou encerramento não elimina direitos de consumidores, obrigações pendentes ou responsabilidades legais das partes.</p>
                                    <p><strong>12.3. Vedação de Reincidência:</strong> A criação de novas contas para burlar suspensões, bloqueios, limites ou encerramentos é expressamente proibida e poderá resultar em novas restrições, conforme a gravidade e as circunstâncias do caso.</p>
                                    <p><strong>12.4. Efeitos da Exclusão:</strong> Após o encerramento da conta, os anúncios e a vitrine pública poderão deixar de ser exibidos. Determinados registros poderão permanecer armazenados pelo período necessário ao cumprimento de obrigações legais, exercício regular de direitos, prevenção a fraudes, segurança e demais finalidades legítimas descritas na Política de Privacidade. A retenção não autoriza o uso indiscriminado dos dados.</p>
                                    <p><strong>12.5. Exportação de Dados Antes do Encerramento:</strong> Sempre que tecnicamente disponível, o Parceiro poderá exportar seus dados cadastrados, como produtos, clientes e pedidos, antes do encerramento da conta. A solicitação também poderá ser encaminhada pelos canais de atendimento, observadas as limitações técnicas, a proteção de dados de terceiros e as obrigações legais de retenção.</p>
                                    <p><strong>12.6. Pedidos e Obrigações Pendentes:</strong> O encerramento da conta não elimina automaticamente obrigações relacionadas a pedidos, pagamentos, entregas, agendamentos, garantias, devoluções, reclamações ou outras relações já estabelecidas. O Parceiro deverá tomar as providências necessárias para atender às obrigações assumidas perante consumidores e terceiros, sem prejuízo das obrigações próprias da DUDIT.</p>
                                </div>
                            </div>

                            {/* Seção 13 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">13.</span>
                                    ALTERAÇÕES NOS TERMOS
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>13.1.</strong> A DUDIT poderá alterar estes Termos para refletir mudanças na legislação, nas funcionalidades, nos serviços, nas integrações, nos procedimentos de segurança ou no modelo de operação da plataforma.</p>
                                    <p><strong>13.2.</strong> A nova versão será disponibilizada na plataforma, acompanhada da data de atualização. Alterações relevantes que afetem direitos, obrigações ou condições essenciais de utilização poderão ser comunicadas por meios adequados, inclusive por aviso na plataforma ou e-mail cadastrado, com antecedência razoável sempre que possível. Quando a legislação ou a natureza da alteração exigir novo consentimento ou aceite expresso, a DUDIT solicitará a confirmação correspondente. A simples continuidade de uso não será considerada suficiente para substituir um aceite expresso quando este for legalmente necessário.</p>
                                    <p><strong>13.3. Cessão dos Termos:</strong> A DUDIT poderá transferir ou ceder direitos e obrigações decorrentes destes Termos em caso de reorganização societária, constituição ou alteração de pessoa jurídica responsável, fusão, aquisição ou transferência do negócio, observadas as exigências legais e a continuidade das proteções aplicáveis aos Usuários e titulares de dados. Quando necessário, os envolvidos serão comunicados. O Parceiro não poderá transferir sua posição contratual ou conta a terceiros sem autorização da DUDIT, ressalvadas as hipóteses permitidas por lei.</p>
                                    <p><strong>13.4. Histórico de Versões:</strong> A DUDIT poderá manter registros das versões anteriores destes Termos e dos aceites realizados pelos Usuários e Parceiros, para fins de comprovação, segurança, transparência e cumprimento de obrigações legais.</p>
                                </div>
                            </div>

                            {/* Seção 14 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">14.</span>
                                    FORO E LEGISLAÇÃO APLICÁVEL
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>14.1.</strong> Estes Termos serão interpretados conforme as leis da República Federativa do Brasil.</p>
                                    <p><strong>14.2.</strong> Fica indicado o Foro da Comarca de Lucélia/SP para tratar de controvérsias relacionadas a estes Termos, respeitadas as regras legais de competência e, especialmente, os direitos assegurados aos consumidores, inclusive a possibilidade de ajuizamento de ações no foro de seu domicílio quando previsto na legislação.</p>
                                    <p><strong>14.3.</strong> Caso alguma disposição destes Termos seja considerada inválida ou inexigível, as demais disposições permanecerão em vigor na medida permitida pela legislação.</p>
                                    <p><strong>14.4.</strong> A eventual tolerância da DUDIT quanto ao descumprimento de alguma disposição não representará renúncia de direito, alteração contratual ou impedimento de exigir seu cumprimento posteriormente.</p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-20 pt-12 border-t border-brand-border text-center">
                            <p className="text-brand-inactive-text italic">
                                DUDIT — Lucélia/SP — dudit.com.br
                            </p>
                        </div>
                    </div>
                </section>
            </div>

            <Footer onNavigate={onNavigate} />
        </div>
    );
}
