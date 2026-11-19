"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { HeroBanner } from "@/components/marketplace/shared-components";
import { GridLines, Navbar, Footer } from '@/components/InstitucionalShared';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function DpaPage() {
    const router = useRouter();

    const onNavigate = (page: string) => {
        if (page === 'home') router.push('/institucional/inicio');
        else if (page === 'segments') router.push('/institucional/segmentos');
        else if (page === 'pricing') router.push('/institucional/planos');
        else if (page === 'terms') router.push('/institucional/termos');
        else if (page === 'privacidade') router.push('/institucional/privacidade');
        else if (page === 'dpa') router.push('/institucional/dpa');
        else if (page === 'start-selling') router.push('/auth/login?mode=partner');
        else console.log('Navigating to:', page);
    };

    return (
        <div className="bg-white dark:bg-dark-surface min-h-screen">
            <Navbar onNavigate={onNavigate} />

            <main>
                <HeroBanner href="/explorar" />

                <section className="relative bg-white dark:bg-dark-surface pb-20 overflow-hidden">
                    <GridLines />
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                        >
                            <div className="inline-flex items-center gap-2 border border-brand-border rounded-full px-4 py-1.5 text-xs text-brand-dark dark:text-dark-heading mb-8 bg-brand-gray dark:bg-dark-border/40 tracking-wider font-bold uppercase">
                                Documentos Legais — ERP
                            </div>
                            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-brand-dark dark:text-dark-heading mb-6">
                                Acordo de Tratamento de Dados Pessoais (DPA)
                            </h1>
                            <p className="text-brand-inactive-text text-lg">
                                Versão 1.1 — Última atualização: Novembro de 2026
                            </p>
                        </motion.div>
                    </div>
                </section>

                <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <div className="prose prose-lg max-w-none text-brand-dark dark:text-dark-heading leading-relaxed space-y-12">
                        <p className="font-medium text-xl border-l-4 border-brand-green pl-6 py-2 bg-brand-gray dark:bg-dark-border/40 rounded-r-xl">
                            Este Acordo de Tratamento de Dados Pessoais (&quot;DPA&quot; ou &quot;Acordo&quot;) integra e complementa os{" "}
                            <Link href="/institucional/termos" className="text-brand-dark dark:text-dark-heading font-bold underline">Termos de Uso</Link>{" "}
                            e a{" "}
                            <Link href="/institucional/privacidade" className="text-brand-dark dark:text-dark-heading font-bold underline">Política de Privacidade</Link>{" "}
                            da DUDIT, disciplinando as regras e salvaguardas aplicáveis ao tratamento de dados pessoais no âmbito dos módulos de gestão empresarial (ERP) disponibilizados aos Parceiros.
                        </p>

                        <div className="bg-brand-gray dark:bg-dark-border/40 p-8 rounded-2xl border border-brand-border shadow-sm">
                            <h3 className="text-brand-dark dark:text-dark-heading text-lg font-bold mb-4 uppercase tracking-wide">Qualificação das Partes</h3>
                            <div className="space-y-4 text-brand-inactive-text">
                                <div>
                                    <p className="font-bold text-brand-dark dark:text-dark-heading text-base mb-1">DUDIT (Operadora no ERP / Controladora Independente em operações próprias):</p>
                                    <p className="mb-0 text-sm">[RAZÃO SOCIAL OU NOME CIVIL COMPLETO DA OPERADORA], pessoa jurídica/física inscrita no [CNPJ ou CPF, conforme a estrutura jurídica aplicável], com sede/endereço para contato em [ENDEREÇO COMPLETO] e e-mail de privacidade <span className="text-brand-green font-medium">[E-MAIL VÁLIDO DE PRIVACIDADE]</span>.</p>
                                </div>
                                <div>
                                    <p className="font-bold text-brand-dark dark:text-dark-heading text-base mb-1">PARCEIRO (Controlador dos dados de clientes e equipe no ERP):</p>
                                    <p className="mb-0 text-sm">A pessoa física ou jurídica devidamente cadastrada na plataforma como Vendedor ou Prestador de Serviços que utiliza os recursos de gestão (ERP).</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">Preâmbulo</h2>
                            <p>
                                <strong>CONSIDERANDO QUE:</strong>
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-brand-inactive-text">
                                <li>O PARCEIRO utiliza as soluções tecnológicas disponibilizadas pela DUDIT, incluindo módulos de gestão empresarial (ERP), catálogo e vitrine digital;</li>
                                <li>Na utilização dos módulos de ERP e gestão, o PARCEIRO insere, armazena e processa dados pessoais de titulares a ele vinculados, incluindo seus clientes, colaboradores, funcionários, prestadores e fornecedores;</li>
                                <li>As Partes buscam estabelecer de forma transparente, técnica e segura as regras, limites, salvaguardas e responsabilidades relativas ao tratamento de dados pessoais, em estrita observância à Lei Geral de Proteção de Dados Pessoais (LGPD — Lei nº 13.709/2018), ao Marco Civil da Internet (Lei nº 12.965/2014) e às regulamentações emitidas pela Autoridade Nacional de Proteção de Dados (ANPD).</li>
                            </ul>
                        </div>

                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">1. Objeto e Separação dos Papéis Legais (LGPD)</h2>
                            <p>
                                <strong>1.1. Objeto:</strong> Este DPA disciplina as condições e salvaguardas em que a DUDIT realiza operações de tratamento de dados pessoais inseridos, integrados ou disponibilizados pelo PARCEIRO nas ferramentas de gestão (ERP) da plataforma.
                            </p>
                            <p>
                                <strong>1.2. DUDIT como OPERADORA:</strong> No âmbito estrito dos módulos de gestão (ERP) disponibilizados ao PARCEIRO — abrangendo o cadastro de clientes próprios, gestão de equipe de funcionários e colaboradores, controle interno de pedidos, estoque, agenda de atendimentos, movimentações financeiras internas e orçamentos —, a DUDIT atua na qualidade de <strong>OPERADORA</strong> de dados pessoais (art. 5º, VII, da LGPD). Nessa condição, a DUDIT realiza o tratamento em nome do PARCEIRO e em observância às instruções legítimas por ele transmitidas por meio das funcionalidades da plataforma.
                            </p>
                            <p>
                                <strong>1.3. PARCEIRO como CONTROLADOR:</strong> O PARCEIRO atua na qualidade de <strong>CONTROLADOR</strong> (art. 5º, VI, da LGPD) dos dados pessoais de seus clientes, compradores, equipe, colaboradores e fornecedores cadastrados nas ferramentas de gestão, cabendo ao PARCEIRO a tomada de decisões relativas ao tratamento, a determinação de suas finalidades e a definição de suas respectivas bases legais, nos limites de suas atividades.
                            </p>
                            <p>
                                <strong>1.4. DUDIT como CONTROLADORA INDEPENDENTE:</strong> A qualificação da DUDIT como Operadora restringe-se às operações de processamento realizadas no ERP sob instruções do Parceiro. A DUDIT atua como <strong>CONTROLADORA INDEPENDENTE</strong> em suas operações próprias, autônomas e regulamentares, tais como:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-brand-inactive-text">
                                <li>Criação, validação, manutenção e autenticação de contas de acesso à plataforma;</li>
                                <li>Administração dos planos de assinatura, faturamento e contratos da própria DUDIT;</li>
                                <li>Segurança cibernética da infraestrutura, integridade de sistemas e auditoria técnica de acessos;</li>
                                <li>Prevenção a fraudes, monitoramento de abusos e moderação de conteúdos ilícitos;</li>
                                <li>Cumprimento de obrigações legais e regulatórias próprias que lhe sejam diretamente exigíveis pela legislação brasileira;</li>
                                <li>Funcionamento do canal público de vitrine e marketplace da DUDIT, no tocante à aproximação comercial entre compradores e vendedores, viabilização da visualização de produtos/serviços e gestão das contas de usuários do marketplace, esclarecendo-se que a DUDIT não atua como instituição de pagamento nem recebe ou custodia os valores das transações comerciais realizadas entre as partes.</li>
                            </ul>
                            <p>
                                <strong>1.5.</strong> A definição de papéis descrita nesta Cláusula reflete as operações efetivas de tratamento de dados e não afasta as obrigações e prerrogativas que a legislação atribua a cada uma das Partes.
                            </p>
                        </div>

                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">2. Instruções de Tratamento e Limitação de Finalidade</h2>
                            <p>
                                <strong>2.1.</strong> A DUDIT processará os dados pessoais submetidos pelo PARCEIRO ao ERP estritamente para as seguintes finalidades operacionais:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-brand-inactive-text">
                                <li>Armazenar, indexar, organizar e exibir os registros no painel administrativo do PARCEIRO;</li>
                                <li>Executar as rotinas tecnológicas de cálculo, processamento de pedidos, controle de estoque e agendamentos solicitadas pelo PARCEIRO;</li>
                                <li>Viabilizar as integrações tecnológicas expressamente configuradas pelo PARCEIRO (tais como gateways de pagamento, serviços de logística e canais de mensageria);</li>
                                <li>Assegurar a continuidade, disponibilidade, segurança e recuperação de serviços em nuvem contratados;</li>
                                <li>Cumprir determinações judiciais ou ordens fundamentadas de autoridades públicas competentes.</li>
                            </ul>
                            <p>
                                <strong>2.2. Vedação de Uso Próprio:</strong> A DUDIT não comercializa, não vende, não aluga e não compartilha dados pessoais mantidos no ERP do PARCEIRO para finalidades publicitárias próprias, marketing de terceiros ou prospecção comercial.
                            </p>
                            <p>
                                <strong>2.3. Instruções Ilícitas:</strong> Caso a DUDIT identifique que determinada instrução fornecida pelo PARCEIRO viola expressamente a LGPD, regulamentação da ANPD ou normas vigentes, a DUDIT informará o PARCEIRO no prazo técnico cabível e poderá suspender a execução da funcionalidade correspondente até que a situação seja regularizada.
                            </p>
                        </div>

                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">3. Obrigações e Declarações do Controlador (Parceiro)</h2>
                            <p>
                                <strong>3.1.</strong> O PARCEIRO declara e garante que:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-brand-inactive-text">
                                <li>Todos os dados pessoais inseridos ou importados nas ferramentas de ERP foram obtidos em conformidade com a LGPD e a legislação aplicável;</li>
                                <li>Possui fundamento legal válido e documentado (artigos 7º e/ou 11 da LGPD), tais como execução de contrato com o titular, cumprimento de obrigação legal ou regulatória, legítimo interesse ou consentimento livre e informado, quando exigível;</li>
                                <li>Disponibilizou aviso ou política de privacidade aos seus clientes e colaboradores, informando a utilização de sistemas em nuvem para viabilizar as rotinas de gestão;</li>
                                <li>Não inserirá na plataforma dados pessoais desnecessários, excessivos ou dados sensíveis em desconformidade com a legislação e com o disposto no Anexo I deste Acordo;</li>
                                <li>É responsável pela atualização, exatidão, retenção e descarte das informações de seus clientes e equipe registradas no sistema.</li>
                            </ul>
                            <p>
                                <strong>3.2. Responsabilidade do Parceiro:</strong> Cada Parte responderá perante os titulares, a ANPD e terceiros na extensão de suas condutas, decisões, instruções e participação nas operações de tratamento de dados pessoais. O PARCEIRO responderá pelos danos decorrentes de decisões ilícitas, omissão de deveres de transparência perante seus clientes e colaboradores, instruções contrárias à lei transmitidas à DUDIT ou gestão inadequada de suas credenciais de acesso.
                            </p>
                        </div>

                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">4. Obrigações, Medidas de Segurança e Responsabilidade da Operadora (DUDIT)</h2>
                            <p>
                                <strong>4.1.</strong> A DUDIT compromete-se a tratar os dados pessoais sob sua custódia técnica com padrão de segurança compatível com a natureza das informações e o porte da operação, adotando medidas técnicas e organizacionais proporcionais destinadas a proteger os dados contra destruição acidental ou ilícita, perda, alteração, acesso não autorizado ou qualquer forma de tratamento inadequado.
                            </p>
                            <p>
                                <strong>4.2. Controles Técnicos Auditados e Descrição de Implementação:</strong> O ambiente da plataforma DUDIT adota os seguintes controles técnicos:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-brand-inactive-text">
                                <li><strong>Criptografia em Trânsito:</strong> Comunicação entre navegadores, dispositivos móveis e servidores protegida por protocolos criptográficos seguros (HTTPS sobre TLS 1.3/TLS 1.2 com cabeçalhos HSTS configurados na camada de borda);</li>
                                <li><strong>Criptografia em Repouso:</strong> Dados estruturados e arquivos armazenados em infraestrutura de nuvem gerenciada (Supabase/PostgreSQL e Cloudflare R2) dotados de criptografia em repouso padrão de mercado provida pelos fornecedores de infraestrutura;</li>
                                <li><strong>Criptografia em Nível de Aplicação:</strong> Mecanismo de cifragem simétrica (AES-256-GCM) com chaves derivadas por HKDF por contexto funcional implementado na biblioteca interna (<code>lib/cryptoService.ts</code>) para credenciais de pagamento e tokens de integração externos (WhatsApp, SuperFrete, Mercado Pago), condicionado ao provisionamento e ativação de chaves mestras no ambiente operacional;</li>
                                <li><strong>Armazenamento de Senhas:</strong> Senhas de usuários gerenciadas em formato de hash criptográfico irreversível (algoritmo bcrypt provido pela camada de autenticação do Supabase Auth), complementadas por limitação de taxa de requisições (<code>lib/rate-limiter.ts</code>) para mitigação de ataques de força bruta;</li>
                                <li><strong>Isolamento Lógico Multi-tenant:</strong> Segregação de dados entre diferentes Parceiros mediante associação obrigatória ao identificador de parceiro (<code>partner_id</code>), regras de controle de acesso em nível de linha (Row Level Security - RLS) na camada de dados e verificação programática nas ações de backend (<code>lib/services/authorized-customer-access.ts</code>);</li>
                                <li><strong>Controle de Permissões de Equipe (RBAC):</strong> Módulo de controle de acessos da equipe interna do Parceiro permitindo restringir privilégios por loja, tela e operação (proprietário, administrador, gestor, operador e entregador em <code>lib/permissions/</code>);</li>
                                <li><strong>Mecanismo de Backups Criptografados:</strong> Mecanismo técnico e utilitários de decodificação e restauração de dumps PostgreSQL criptografados em fluxo com algoritmo AES-256-GCM (<code>scripts/decrypt-database-backup.mjs</code> e <code>scripts/restore-database.mjs</code>), ressalvando-se que a frequência, execução de rotina contínua e ciclo de expurgo de cópias em produção dependem de parametrização e auditoria da infraestrutura do ambiente produtivo <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold">[CONTROLE EM FASE DE CONFIGURAÇÃO / PENDENTE DE AUDITORIA OPERACIONAL EM PRODUÇÃO]</span>;</li>
                                <li><strong>Sanitização de Registros Técnicos:</strong> Rotinas de mascaramento preventivo em código (<code>lib/secure-logger.ts</code>) para substituição de dados confidenciais (senhas, tokens, chaves e dados bancários) pelo marcador <code>[REDACTED]</code> nos logs tratados pela aplicação;</li>
                                <li><strong>Proteção de Borda e Perímetro:</strong> Uso de rede de distribuição de conteúdo (CDN) e proteção contra ataques DDoS via Cloudflare, com desafios anti-bot no frontend por meio do Cloudflare Turnstile.</li>
                            </ul>
                            <div className="bg-brand-gray dark:bg-dark-border/40 p-6 rounded-xl border border-brand-border">
                                <p className="text-sm text-brand-dark dark:text-dark-heading font-medium mb-0 leading-relaxed">
                                    <strong>4.3. Regime de Responsabilidade da DUDIT:</strong> Sem prejuízo das salvaguardas técnicas adotadas, a responsabilidade civil da DUDIT e as hipóteses de reparação por eventuais danos causados a titulares de dados ou terceiros em decorrência do tratamento observarão estritamente o regime legal estabelecido na LGPD, em especial o art. 42 e seus parágrafos, bem como as causas de exclusão de responsabilidade previstas no art. 43 da referida Lei, não se limitando esta responsabilidade à comprovação exclusiva de culpa caso configurada a responsabilidade legal objetiva ou solidária nos termos da legislação aplicável.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">5. Confidencialidade e Requisitos de Pessoal</h2>
                            <p>
                                <strong>5.1.</strong> A DUDIT assegura que todas as pessoas sob sua subordinação autorizadas a acessar dados pessoais no âmbito do suporte técnico, infraestrutura ou manutenção estão vinculadas a obrigações formais de sigilo e confidencialidade, as quais subsistem mesmo após o término de suas funções.
                            </p>
                            <p>
                                <strong>5.2.</strong> O acesso interno aos dados do ERP do PARCEIRO é restrito aos colaboradores que justificadamente necessitem de tais informações para prestar suporte solicitado, corrigir falhas técnicas, apurar incidentes ou cumprir determinação legal.
                            </p>
                        </div>

                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">6. Fornecedores e Suboperadores</h2>
                            <p>
                                <strong>6.1. Autorização Geral:</strong> O PARCEIRO expressamente autoriza a DUDIT a contratar fornecedores terceirizados de infraestrutura, hospedagem, tecnologia e serviços especializados estritamente necessários para a execução e disponibilização das ferramentas contratadas.
                            </p>
                            <p>
                                <strong>6.2. Lista de Suboperadores Efetivos (Processamento sob instruções da DUDIT):</strong> Em atendimento ao dever de transparência, a DUDIT informa os fornecedores técnicos que atuam na qualidade de Suboperadores, seus papéis operacionais e status contratual:
                            </p>

                            <div className="overflow-x-auto my-6 border border-brand-border rounded-xl">
                                <table className="w-full text-left text-sm border-collapse">
                                    <thead className="bg-brand-gray dark:bg-dark-border/40 border-b border-brand-border">
                                        <tr>
                                            <th className="p-3 font-semibold text-brand-dark dark:text-dark-heading">Fornecedor</th>
                                            <th className="p-3 font-semibold text-brand-dark dark:text-dark-heading">Função / Escopo</th>
                                            <th className="p-3 font-semibold text-brand-dark dark:text-dark-heading">Dados Pessoais Acessados</th>
                                            <th className="p-3 font-semibold text-brand-dark dark:text-dark-heading">País</th>
                                            <th className="p-3 font-semibold text-brand-dark dark:text-dark-heading">Instrumento de Privacidade</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-brand-border dark:divide-dark-border text-brand-inactive-text">
                                        <tr>
                                            <td className="p-3 font-medium text-brand-dark dark:text-dark-heading">Supabase (Supabase Inc. / AWS)</td>
                                            <td className="p-3">Banco de dados relacional e infraestrutura de autenticação</td>
                                            <td className="p-3">Dados cadastrais, pedidos, registros de ERP e logs de acesso</td>
                                            <td className="p-3">EUA / América do Sul</td>
                                            <td className="p-3">Termos de Serviço / DPA Online de Adesão</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 font-medium text-brand-dark dark:text-dark-heading">Cloudflare (Cloudflare Inc.)</td>
                                            <td className="p-3">CDN, proteção WAF/DDoS, Turnstile e armazenamento de arquivos (R2)</td>
                                            <td className="p-3">Imagens de catálogo, documentos anexos, tráfego e IPs</td>
                                            <td className="p-3">EUA / Global</td>
                                            <td className="p-3">Cloudflare Data Processing Addendum (Online)</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 font-medium text-brand-dark dark:text-dark-heading">Railway (Railway Corp.)</td>
                                            <td className="p-3">Hospedagem da aplicação web, backend/API e instância de mensageria</td>
                                            <td className="p-3">Tráfego de requisições web e metadados de execução transitórios</td>
                                            <td className="p-3">EUA</td>
                                            <td className="p-3">Railway Terms of Service / DPA Online de Adesão</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 font-medium text-brand-dark dark:text-dark-heading">SMTP2GO (Sandev Limited)</td>
                                            <td className="p-3">Disparo de e-mails transacionais (ativações, redefinições de senha)</td>
                                            <td className="p-3">E-mail do destinatário, nome e conteúdo da mensagem</td>
                                            <td className="p-3">Nova Zelândia / EUA / UE</td>
                                            <td className="p-3">Termos de Serviço e Política de Privacidade</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 font-medium text-brand-dark dark:text-dark-heading">Trigger.dev (Trigger.dev Inc.)</td>
                                            <td className="p-3">Orquestração de tarefas assíncronas em segundo plano</td>
                                            <td className="p-3">Identificadores técnicos de tarefas e metadados transitórios</td>
                                            <td className="p-3">EUA</td>
                                            <td className="p-3">Termos de Serviço / DPA Online de Adesão</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 font-medium text-brand-dark dark:text-dark-heading">Sightengine (Sightengine SAS)</td>
                                            <td className="p-3">Moderação automatizada de imagens contra fraudes e ilícitos</td>
                                            <td className="p-3">Buffers/URLs transitórias de imagens enviadas para catálogo</td>
                                            <td className="p-3">França / UE</td>
                                            <td className="p-3">Termos de Serviço sob legislação GDPR / DPA Online</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 font-medium text-brand-dark dark:text-dark-heading">Sentry (Functional Software Inc.)</td>
                                            <td className="p-3">Diagnóstico de erros de código e desempenho</td>
                                            <td className="p-3">Registros técnicos de exceções e metadados sanitizados</td>
                                            <td className="p-3">EUA</td>
                                            <td className="p-3">Sentry Data Processing Addendum (Online)</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 font-medium text-brand-dark dark:text-dark-heading">PostHog (PostHog Inc.)</td>
                                            <td className="p-3">Telemetria de usabilidade (somente mediante consentimento prévio)</td>
                                            <td className="p-3">Eventos agregados de navegação e interface</td>
                                            <td className="p-3">EUA</td>
                                            <td className="p-3">PostHog Data Processing Addendum (Online)</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 font-medium text-brand-dark dark:text-dark-heading">Gateway WhatsApp (Evolution API no Railway)</td>
                                            <td className="p-3">Disparo de mensagens e avisos automáticos de pedidos</td>
                                            <td className="p-3">Telefone de destino e texto da notificação do pedido</td>
                                            <td className="p-3">EUA (Railway)</td>
                                            <td className="p-3">Executado em infraestrutura própria sob gestão no Railway</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <p>
                                <strong>6.3. Fornecedores que Atuam como Controladores Independentes ou Prestadores Autônomos:</strong>
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-brand-inactive-text">
                                <li><strong>Mercado Pago (Mercado Pago Instituição de Pagamento Ltda.):</strong> Atua na qualidade de <strong>Controlador Independente</strong>. Como instituição de pagamento regulada pelo Banco Central do Brasil (Bacen), o Mercado Pago determina autonomamente os meios e finalidades relativos à liquidação financeira, prevenção a fraudes, compliance bancário e combate à lavagem de dinheiro (AML), possuindo política de privacidade própria e obrigações regulatórias autônomas;</li>
                                <li><strong>SuperFrete (SuperFrete Tecnologia Ltda.) e Transportadoras Integradas:</strong> Atuam na qualidade de <strong>Controladores Independentes</strong> no tocante à cotação, emissão de Conhecimento de Transporte Eletrônico (CT-e), despacho e transporte físico de mercadorias, determinando os dados indispensáveis para o cumprimento das normas postais e regulatórias da ANTT;</li>
                                <li><strong>Serviços Públicos de Apoio e Geocodificação (ViaCEP, BrasilAPI, OpenStreetMap):</strong> Serviços utilitários abertos de localização que recebem consultas pontuais de CEP ou coordenadas geográficas. A DUDIT não controla o armazenamento técnico de logs HTTP nos servidores desses prestadores, sendo suas práticas regidas por suas respectivas políticas operacionais <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold">[PENDENTE DE VALIDAÇÃO DOCUMENTAL]</span>.</li>
                            </ul>

                            <p>
                                <strong>6.4. Alterações e Direito de Objeção:</strong> A DUDIT manterá a lista de Suboperadores atualizada na plataforma e notificará o PARCEIRO sobre inclusões ou substituições relevantes de Suboperadores com antecedência razoável de até 10 (dez) dias corridos. O PARCEIRO poderá apresentar objeção técnica justificada no prazo de até 5 (cinco) dias corridos após o aviso, exclusivamente com base em riscos objetivos à proteção de dados pessoais. Caso a DUDIT não possa acomodar a objeção e mantenha o Suboperador, o PARCEIRO terá o direito de rescindir a contratação do módulo de ERP sem multa rescisória, permanecendo responsável pelos valores referentes aos serviços até então usufruídos.
                            </p>
                        </div>

                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">7. Transferência Internacional de Dados e Resolução CD/ANPD nº 19/2024</h2>
                            <p>
                                <strong>7.1. Fluxos Internacionais Reais:</strong> Tendo em vista a utilização de serviços de infraestrutura em nuvem globais descritos na Cláusula 6, os dados tratados no ERP poderão ser transferidos para armazenamento ou processamento em servidores localizados fora do território brasileiro. Nesse fluxo:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-brand-inactive-text">
                                <li><strong>Exportadora:</strong> DUDIT (e os Parceiros cujos dados trafegam pela infraestrutura no Brasil);</li>
                                <li><strong>Importadores:</strong> Os fornecedores de tecnologia internacionais contratados, notadamente Supabase Inc. (EUA), Cloudflare Inc. (EUA), Railway Corp. (EUA), Sandev Limited / SMTP2GO (Nova Zelândia/EUA/UE), Functional Software Inc. / Sentry (EUA), Trigger.dev Inc. (EUA) e Sightengine SAS (França/UE).</li>
                            </ul>
                            <p>
                                <strong>7.2. Mecanismos Jurídicos Utilizados e Status Contratual:</strong>
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-brand-inactive-text">
                                <li>O tratamento internacional de dados decorre da contratação necessária de infraestrutura em nuvem para a disponibilização do serviço SaaS solicitado pelo Parceiro (art. 33, IX, da LGPD);</li>
                                <li>No âmbito operacional, os fornecedores internacionais disponibilizam aditivos de processamento de dados (DPAs online) e termos de serviço padrão de mercado que preveem medidas técnicas de segurança da informação e confidencialidade;</li>
                                <li><strong>Adequação à Resolução CD/ANPD nº 19/2024:</strong> Tendo em vista que o prazo regulamentar transitório da referida Resolução já se encerrou, a DUDIT declara que a celebração formal de contratos bilaterais específicos com fornecedores estrangeiros contendo o texto das Cláusulas-Padrão Contratuais da ANPD encontra-se em fase de avaliação jurídica e operacional <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold">[PENDENTE DE FORMALIZAÇÃO BILATERAL DE CLÁUSULAS-PADRÃO DA ANPD COM FORNECEDORES ESTRANGEIROS]</span>;</li>
                                <li><strong>Compromisso de Integralidade:</strong> Fica expressamente estipulado que, sempre que for adotado formalmente o mecanismo de Cláusulas-Padrão Contratuais aprovado pela ANPD entre as Partes ou com os suboperadores, será incorporado o <strong>texto oficial integral e sem alterações</strong>, conforme publicado no Anexo da Resolução CD/ANPD nº 19/2024.</li>
                            </ul>
                        </div>

                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">8. Gestão e Notificação de Incidentes de Segurança</h2>
                            <div className="bg-brand-dark text-white p-8 rounded-2xl shadow-xl space-y-4">
                                <h3 className="text-white text-xl font-bold uppercase tracking-wide">Comunicação Contratual em até 24 Horas</h3>
                                <p className="text-gray-300 leading-relaxed mb-0">
                                    Caso a DUDIT tome conhecimento e confirme a ocorrência de qualquer incidente de segurança da informação (como acessos não autorizados, vazamento, alteração indevida ou destruição) que envolva dados pessoais tratados no ERP em nome do PARCEIRO, a DUDIT comunicará o PARCEIRO em até <strong>24 (vinte e quatro) horas</strong> contadas da ciência do evento.
                                </p>
                            </div>
                            <p>
                                <strong>8.2. Natureza Estritamente Contratual do Prazo:</strong> O prazo de até 24 (vinte e quatro) horas previsto no item 8.1 constitui obrigação estritamente contratual entre a DUDIT e o PARCEIRO destinada a viabilizar a cooperação técnica célere entre as Partes, <strong>não se confundindo com o prazo regulatório da ANPD</strong>, o qual impõe ao Controlador o dever de comunicar a autoridade e os titulares no prazo estabelecido na regulamentação aplicável (Resolução CD/ANPD nº 15/2024, que fixa o prazo de 3 dias úteis para comunicação de incidentes relevantes).
                            </p>
                            <p>
                                <strong>8.3. Fluxo de Notificação e Atualização:</strong> A comunicação inicial será encaminhada ao e-mail cadastrado pelo PARCEIRO, mesmo que as apurações técnicas ainda estejam em curso, contendo a natureza do incidente, categorias de dados e titulares impactados identificados, medidas de contenção técnica adotadas e canal direto para acompanhamento. A DUDIT fornecerá relatórios e informações complementares conforme forem apurados, cooperando com o PARCEIRO para o atendimento de seus deveres perante a ANPD e os titulares.
                            </p>
                            <p className="text-sm text-brand-inactive-text italic">
                                <strong>8.4.</strong> A notificação de um incidente pela DUDIT ao PARCEIRO não configura, por si só, assunção de culpa ou responsabilidade exclusiva pelo evento.
                            </p>
                        </div>

                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">9. Atendimento aos Direitos dos Titulares de Dados</h2>
                            <p>
                                <strong>9.1. Regra Geral:</strong> Em relação aos dados tratados no âmbito do ERP, cabe ao PARCEIRO, na condição de Controlador, analisar, deliberar e responder diretamente às solicitações de exercício de direitos dos titulares (confirmação de tratamento, acesso, correção, anonimização, bloqueio, eliminação ou revogação de consentimento).
                            </p>
                            <p>
                                <strong>9.2. Demandas Recebidas pela DUDIT:</strong> Caso um cliente, colaborador ou terceiro encaminhe solicitação diretamente aos canais da DUDIT referente a dados tratados no ERP de determinado PARCEIRO:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-brand-inactive-text">
                                <li>A DUDIT receberá a solicitação e identificará a qual PARCEIRO o registro pertence;</li>
                                <li>A DUDIT encaminhará formalmente e de forma segura a demanda ao PARCEIRO responsável no prazo operacionalmente viável de <strong>até 2 (dois) dias úteis</strong>, sempre que possível, com <strong>encaminhamento imediato</strong> em situações de urgência manifesta;</li>
                                <li>A DUDIT informará ao solicitante que o pedido foi direcionado ao Controlador responsável para resposta direta.</li>
                            </ul>
                            <p>
                                <strong>9.3. Assistência Técnica da DUDIT:</strong> A DUDIT disponibiliza funcionalidades operacionais no painel do ERP para que o PARCEIRO possa realizar consultas cadastrais, retificações, exportações de dados e exclusão/anonimização de registros de clientes e equipe sob sua gestão.
                            </p>
                            <p>
                                <strong>9.4. Solicitações sobre Tratamentos Próprios da DUDIT:</strong> Quando a solicitação disser respeito a operações nas quais a DUDIT atua como Controladora Independente (como cadastro da conta geral ou logs de acesso próprios), a própria DUDIT processará e responderá ao titular nos termos da LGPD.
                            </p>
                        </div>

                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">10. Cooperação, Auditorias e Preservação dos Poderes da ANPD</h2>
                            <p>
                                <strong>10.1.</strong> A DUDIT prestará cooperação razoável e juridicamente cabível ao PARCEIRO para que este cumpra suas obrigações legais perante a ANPD e os titulares de dados, incluindo o fornecimento de informações técnicas sobre a arquitetura dos sistemas para elaboração de Relatórios de Impacto à Proteção de Dados Pessoais (RIPD/DPIA), respeitados os segredos comercial e industrial da plataforma.
                            </p>
                            <p>
                                <strong>10.2. Auditorias e Verificações:</strong> A verificação de conformidade da DUDIT poderá ser realizada mediante o fornecimento de declarações técnicas, relatórios de segurança e respostas a questionários de privacidade razoáveis. Caso auditoria adicional seja expressamente exigida por autoridade competente ou legalmente cabível, as Partes acordarão previamente cronograma, escopo e salvaguardas de confidencialidade, de modo a preservar a segurança e o sigilo de dados de outros clientes e parceiros da plataforma.
                            </p>
                            <div className="bg-brand-gray dark:bg-dark-border/40 p-6 rounded-xl border border-brand-border">
                                <p className="text-sm text-brand-dark dark:text-dark-heading font-medium mb-0 leading-relaxed">
                                    <strong>10.3. Poderes de Fiscalização da ANPD:</strong> Nenhuma disposição deste Acordo restringe, limita ou prejudica os poderes legais de fiscalização, requisição de informações, auditoria, monitoramento e aplicação de sanções administrativas atribuídos à Autoridade Nacional de Proteção de Dados (ANPD) nos termos da LGPD e de suas regulamentações, comprometendo-se as Partes a cumprir prontamente as determinações e solicitações expedidas pela autoridade.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">11. Encerramento, Exportação e Descarte de Dados</h2>
                            <p>
                                <strong>11.1. Exportação Prévia:</strong> Antes de requerer o encerramento de sua conta ou do módulo de ERP, o PARCEIRO poderá exportar os dados operacionais de seus clientes, pedidos e produtos por meio dos recursos disponíveis na plataforma.
                            </p>
                            <p>
                                <strong>11.2. Procedimentos de Descarte na Base Ativa:</strong> Após a solicitação definitiva de encerramento da conta pelo PARCEIRO:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-brand-inactive-text">
                                <li>A DUDIT iniciará os procedimentos técnicos para a exclusão lógica e anonimização dos registros operacionais da base ativa do ERP no prazo razoável estimado em até 30 (trinta) dias úteis <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold">[PENDENTE DE VALIDAÇÃO DE CRONOGRAMA EM PRODUÇÃO]</span>;</li>
                                <li>Eventuais pendências financeiras ou comerciais entre as Partes não autorizam a retenção indiscriminada de dados pessoais do ERP. A retenção pela DUDIT limitar-se-á estritamente aos documentos cadastrais e registros fiscais indispensáveis à cobrança legal ou ao cumprimento de obrigações tributárias e contábeis próprias (art. 16, I e II, da LGPD);</li>
                                <li>Registros transacionais e de pedidos poderão ter seus dados pessoais anonimizados, preservando-se apenas valores contábeis e fiscais exigidos pela legislação.</li>
                            </ul>
                            <p>
                                <strong>11.3. Retenções Legalmente Justificadas:</strong> A DUDIT conservará os dados e registros estritamente necessários para:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-brand-inactive-text">
                                <li>O cumprimento de deveres legais de guarda de registros previstos na legislação brasileira, inclusive a retenção de registros de acesso a aplicações de internet quando e na medida em que o art. 15 da Lei nº 12.965/2014 for legalmente exigível da DUDIT <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold">[PENDENTE DE VALIDAÇÃO JURÍDICA QUANTO AO ENQUADRAMENTO DA OPERADORA]</span>, não se aplicando essa retenção aos cadastros gerais do ERP;</li>
                                <li>O exercício regular de direitos em processos judiciais, administrativos ou arbitrais;</li>
                                <li>O cumprimento de ordens emanadas de autoridades competentes.</li>
                            </ul>
                            <p>
                                <strong>11.4. Cópias de Segurança (Backups Residuais):</strong> O PARCEIRO reconhece que cópias de segurança geradas para fins de integridade e recuperação de desastres não são passíveis de expurgo individualizado imediato devido à natureza compactada e criptografada dos snapshots globais do banco de dados. Tais cópias permanecem isoladas, seguras e inacessíveis para o uso operacional corrente, sendo descontinuadas e sobrescritas de forma automatizada ao longo do ciclo técnico regular de rotação de backups adotado pela infraestrutura <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold">[PRAZO EXATO DE RETENÇÃO TÉCNICA DE BACKUPS: PENDENTE DE AUDITORIA OPERACIONAL EM PRODUÇÃO]</span>.
                            </p>
                        </div>

                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">12. Responsabilidades e Indenização</h2>
                            <p>
                                <strong>12.1. Regime Legal da LGPD:</strong> A responsabilidade civil das Partes por danos patrimoniais, morais, individuais ou coletivos causados em virtude do tratamento de dados pessoais observará integralmente os artigos 42 e 43 da LGPD:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-brand-inactive-text">
                                <li>A DUDIT, na qualidade de Operadora nas rotinas do ERP, responde solidariamente pelos danos causados pelo tratamento quando descumprir as obrigações da legislação de proteção de dados pessoais ou quando não tiver seguido as instruções lícitas do PARCEIRO, ressalvadas as hipóteses de exclusão de responsabilidade previstas no art. 43 da LGPD;</li>
                                <li>O PARCEIRO, na qualidade de Controlador, responde pelos danos resultantes do tratamento de dados pessoais decorrentes de suas próprias decisões, instruções ilícitas ou descumprimento da legislação aplicável;</li>
                                <li>A Parte que comprovar a ocorrência de quaisquer das hipóteses do art. 43 da LGPD (não realização do tratamento atribuído, ausência de violação à legislação ou fato exclusivo do titular ou de terceiro) não será responsabilizada;</li>
                                <li>À Parte que reparar o dano ao titular assiste o direito de regresso contra a outra Parte na medida em que esta tenha dado causa ao evento danoso, nos termos do art. 42, § 4º, da LGPD.</li>
                            </ul>
                            <p>
                                <strong>12.2.</strong> O PARCEIRO obriga-se a defender, indenizar e manter a DUDIT indene contra quaisquer condenações, perdas comprovadas, acordos judiciais, custas processuais, honorários advocatícios e penalidades administrativas aplicadas pela ANPD decorrentes diretamente de:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-brand-inactive-text">
                                <li>Inserção ou tratamento de dados pessoais no ERP sem fundamento legal idôneo pelo PARCEIRO;</li>
                                <li>Prática de comunicações não autorizadas, assédio ou spam pelo PARCEIRO;</li>
                                <li>Instruções contrárias à lei emitidas pelo PARCEIRO.</li>
                            </ul>
                            <p>
                                <strong>12.3.</strong> A DUDIT responderá perante o PARCEIRO pelas perdas e danos comprovados que der causa em decorrência do descumprimento de suas obrigações contratuais ou da legislação de proteção de dados pessoais, observados os critérios de nexo de causalidade e as hipóteses de exclusão legalmente previstas.
                            </p>
                            <p>
                                <strong>12.4.</strong> Nenhuma disposição deste Acordo tem por objetivo excluir ou limitar responsabilidades legais cuja exclusão ou limitação seja vedada pela legislação brasileira.
                            </p>
                        </div>

                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">13. Disposições Gerais, Vigência e Aceite Eletrônico</h2>
                            <p>
                                <strong>13.1. Vigência:</strong> Este DPA entra em vigor na data de seu aceite eletrônico pelo PARCEIRO e permanecerá válido enquanto a conta do PARCEIRO estiver ativa e a DUDIT mantiver a custódia técnica de dados pessoais em nome do PARCEIRO.
                            </p>
                            <p>
                                <strong>13.2. Prevalência:</strong> Em caso de divergência entre este DPA e os Termos de Uso no tocante ao tratamento de dados pessoais de terceiros no ERP, prevalecerão as disposições deste DPA.
                            </p>
                            <p>
                                <strong>13.3. Comprovação do Aceite e Critérios de Retenção:</strong> O aceite deste DPA é registrado de forma eletrônica mediante manifestação de concordância no momento do cadastro ou ativação do ERP. Os registros de aceite serão conservados durante a vigência da relação contratual entre a DUDIT e o PARCEIRO e, após seu encerramento, pelo período necessário e legalmente justificado para o cumprimento de obrigações regulatórias e fiscais ou para o exercício regular de direitos em processos judiciais, administrativos ou arbitrais, respeitados os prazos prescricionais ou decadenciais especificamente aplicáveis a cada relação jurídica (em conformidade com o art. 16 da LGPD e a legislação civil/tributária). O sistema registrará e armazenará:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-brand-inactive-text">
                                <li>Identificador único da conta e do usuário autenticado;</li>
                                <li>Versão exata do DPA aceita e identificador de documento;</li>
                                <li>Hash criptográfico (SHA-256) do texto vigente no momento do aceite;</li>
                                <li>Data, hora e endereço IP do solicitante.</li>
                            </ul>
                            <p>
                                <strong>13.4. Foro:</strong> Fica eleito o Foro da Comarca de Lucélia/SP para dirimir quaisquer dúvidas ou litígios oriundos deste Acordo, respeitadas as regras de competência legalmente aplicáveis.
                            </p>
                        </div>

                        {/* ANEXO I */}
                        <div className="mt-12 pt-10 border-t-2 border-brand-border space-y-6">
                            <div className="inline-flex items-center gap-2 border border-brand-green/30 bg-brand-green/10 text-brand-green rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider">
                                Anexo Técnico
                            </div>
                            <h2 className="text-3xl font-bold text-brand-dark dark:text-dark-heading">
                                ANEXO I — Quadro de Escopo do Tratamento de Dados Pessoais no ERP
                            </h2>

                            <div className="overflow-x-auto my-6 border border-brand-border rounded-xl">
                                <table className="w-full text-left text-sm border-collapse">
                                    <thead className="bg-brand-gray dark:bg-dark-border/40 border-b border-brand-border">
                                        <tr>
                                            <th className="p-3 font-semibold text-brand-dark dark:text-dark-heading w-1/4">Parâmetro</th>
                                            <th className="p-3 font-semibold text-brand-dark dark:text-dark-heading">Detalhamento Técnico e Operacional</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-brand-border dark:divide-dark-border text-brand-inactive-text">
                                        <tr>
                                            <td className="p-3 font-medium text-brand-dark dark:text-dark-heading">Papel do PARCEIRO</td>
                                            <td className="p-3 font-semibold text-brand-dark dark:text-dark-heading">Controlador de Dados Pessoais</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 font-medium text-brand-dark dark:text-dark-heading">Papel da DUDIT</td>
                                            <td className="p-3 font-semibold text-brand-dark dark:text-dark-heading">Operadora de Dados Pessoais (provedora de infraestrutura de software SaaS)</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 font-medium text-brand-dark dark:text-dark-heading">Categorias de Titulares</td>
                                            <td className="p-3 space-y-1">
                                                <p className="mb-1">• Clientes e compradores do Parceiro</p>
                                                <p className="mb-1">• Colaboradores, funcionários e equipe interna do Parceiro (<code>partner_users</code>)</p>
                                                <p className="mb-1">• Fornecedores, parceiros comerciais e prestadores de serviços do Parceiro</p>
                                                <p className="mb-0">• Destinatários finais de pedidos e entregas</p>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 font-medium text-brand-dark dark:text-dark-heading">Classificação Legal dos Dados Tratados</td>
                                            <td className="p-3 space-y-4">
                                                <div>
                                                    <p className="font-semibold text-brand-dark dark:text-dark-heading mb-1">A) DADOS PESSOAIS COMUNS (art. 5º, I, LGPD):</p>
                                                    <p className="mb-1">• <strong>Identificação e Contato:</strong> Nome completo, CPF, CNPJ, e-mail, telefone/WhatsApp, endereço residencial ou de entrega.</p>
                                                    <p className="mb-1">• <strong>Pedidos e Consumo:</strong> Histórico de compras, produtos e serviços contratados, quantidades, valores, forma de pagamento, status de preparo e entrega.</p>
                                                    <p className="mb-1">• <strong>Colaboradores e Equipe:</strong> Nome, e-mail comercial, telefone, cargo/função, loja associada, permissões de acesso atribuídas e registros de auditoria interna (<code>audit_logs</code>).</p>
                                                    <p className="mb-1">• <strong>Agendamentos e Serviços:</strong> Data, horário, profissional responsável, especificações do serviço e observações operacionais do atendimento.</p>
                                                    <p className="mb-1">• <strong>Financeiro no ERP:</strong> Registros de contas a pagar/receber, conciliações, despesas e fluxo de caixa interno.</p>
                                                    <p className="text-xs text-brand-inactive-text italic mb-0">*(Nota jurídica: Nenhum dos dados acima é classificado como dado pessoal sensível pela LGPD, devendo receber o tratamento e proteção cabíveis aos dados pessoais comuns).*</p>
                                                </div>

                                                <div className="pt-2 border-t border-brand-border">
                                                    <p className="font-semibold text-brand-red mb-1">B) DADOS PESSOAIS SENSÍVEIS (art. 5º, II, LGPD) — RESTRIÇÃO E VEDAÇÃO:</p>
                                                    <p className="mb-1">• O ERP da DUDIT é destinado à gestão comercial e empresarial geral.</p>
                                                    <p className="mb-0 leading-relaxed">• É <strong>expressamente vedado</strong> ao PARCEIRO cadastrar dados pessoais sensíveis (tais como dados de saúde, convicção religiosa, dados biométricos, opiniões políticas ou vida sexual) nas ferramentas padrão do ERP, salvo se houver funcionalidade expressamente desenhada e homologada para essa finalidade (como ficha de anamnese para estabelecimentos de saúde/estética, se aplicável), estrita necessidade comprovada e fundamentação em uma das bases legais específicas do art. 11 da LGPD, assumindo o PARCEIRO a exclusiva responsabilidade por essa inserção.</p>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 font-medium text-brand-dark dark:text-dark-heading">Operações Realizadas</td>
                                            <td className="p-3">Coleta (via inserção pelo Parceiro ou integração de pedido), registro, armazenamento em nuvem, organização, estruturação, consulta no painel, processamento de cálculos, transmissão criptografada com suboperadores autorizados, anonimização e eliminação.</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 font-medium text-brand-dark dark:text-dark-heading">Finalidades do Tratamento</td>
                                            <td className="p-3 space-y-1">
                                                <p className="mb-1">• Gestão operacional de pedidos, vendas e orçamentos;</p>
                                                <p className="mb-1">• Controle de estoque de produtos e catálogo de serviços;</p>
                                                <p className="mb-1">• Agendamento de atendimentos e compromissos;</p>
                                                <p className="mb-1">• Gestão interna de equipe e controle de acessos do estabelecimento;</p>
                                                <p className="mb-1">• Organização financeira e comercial interna do negócio;</p>
                                                <p className="mb-0">• Apoio à logística e emissão de comprovantes operacionais de entrega.</p>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 font-medium text-brand-dark dark:text-dark-heading">Duração do Tratamento</td>
                                            <td className="p-3">Durante a vigência da conta e contratação do ERP pelo Parceiro, acrescida do prazo técnico de exclusão da base ativa e dos períodos de retenção legalmente justificados.</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 font-medium text-brand-dark dark:text-dark-heading">Instruções do Controlador</td>
                                            <td className="p-3">Os dados pessoais devem ser tratados unicamente para disponibilizar e manter as funcionalidades do software de gestão conforme os comandos, cadastros e parametrizações configurados pelo Parceiro na interface da DUDIT.</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="pt-8 border-t border-brand-border flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-brand-inactive-text">
                            <p className="mb-0">DUDIT Plataforma Tecnológica • Lucélia/SP • dudit.com.br</p>
                            <div className="flex gap-4">
                                <Link href="/institucional/termos" className="hover:text-brand-dark underline">Termos de Uso</Link>
                                <Link href="/institucional/privacidade" className="hover:text-brand-dark underline">Política de Privacidade</Link>
                                <Link href="/institucional/contato" className="hover:text-brand-dark underline">Canal de Privacidade</Link>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <Footer onNavigate={onNavigate} />
        </div>
    );
}
