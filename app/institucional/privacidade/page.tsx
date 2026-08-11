"use client";

import { motion } from 'framer-motion';
import { GridLines, Navbar, Footer } from '@/components/InstitucionalShared';
import { useRouter } from 'next/navigation';

export default function PrivacyPage() {
    const router = useRouter();

    const onNavigate = (page: string) => {
        if (page === 'home') router.push('/institucional/inicio');
        else if (page === 'segments') router.push('/institucional/segmentos');
        else if (page === 'pricing') router.push('/institucional/planos');
        else if (page === 'terms') router.push('/institucional/termos');
        else if (page === 'privacidade') router.push('/institucional/privacidade');
        else if (page === 'start-selling') router.push('/erp/trocar-erp');
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
                                Privacidade e Segurança
                            </div>
                            <h1 className="text-5xl md:text-6xl font-bold text-brand-dark mb-6">
                                Política de Privacidade
                            </h1>
                            <p className="text-brand-inactive-text text-lg">
                                Versão 1.5 - Última atualização: Julho de 2026
                            </p>
                        </motion.div>
                    </div>
                </section>

                <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <div className="prose prose-lg max-w-none text-brand-dark leading-relaxed space-y-12">
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8">
                            <p className="text-sm text-amber-800">
                                <strong>⚠️ Este documento é uma base jurídica para revisão com advogado antes da publicação oficial.</strong> Os trechos entre colchetes (ex.: [SEU NOME COMPLETO]) devem ser preenchidos antes da publicação.
                            </p>
                        </div>

                        <p className="font-medium text-xl border-l-4 border-brand-green pl-6 py-2 bg-brand-gray rounded-r-xl">
                            Esta Política de Privacidade descreve como a DUDIT coleta, usa, armazena e protege os dados pessoais de seus usuários, em conformidade com a <strong>Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018)</strong> e o <strong>Marco Civil da Internet (Lei 12.965/2014)</strong>.
                        </p>

                        <div className="bg-brand-gray p-8 rounded-2xl border border-brand-border shadow-sm">
                            <h3 className="text-brand-dark text-lg font-bold mb-4 uppercase tracking-wide">Controlador dos Dados</h3>
                            <p className="mb-0 font-bold text-brand-dark text-xl">[SEU NOME COMPLETO]</p>
                            <div className="mt-4 space-y-1 text-brand-inactive-text">
                                <p className="mb-0">CPF: [XXX.XXX.XXX-XX]</p>
                                <p className="mb-0">E-mail de contato: <span className="text-brand-green font-medium">[contato@dudit.com.br]</span></p>
                                <p className="mb-0">Endereço: Lucélia/SP</p>
                            </div>
                        </div>

                        <hr className="border-brand-border" />

                        <div>
                            <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                <span className="text-brand-dark">1.</span>
                                DADOS COLETADOS
                            </h2>

                            <div className="space-y-12">
                                <div>
                                    <h3 className="text-xl font-bold mb-6 text-brand-dark flex items-center gap-3">
                                        <div className="w-2 h-2 bg-brand-green rounded-full"></div>
                                        1.1. Dados fornecidos pelo Parceiro (Vendedor)
                                    </h3>
                                    <div className="overflow-x-auto border border-brand-border dark:border-dark-border rounded-xl mb-8">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border">
                                                <tr>
                                                    <th className="px-6 py-4 font-bold text-brand-dark dark:text-dark-heading">Dado</th>
                                                    <th className="px-6 py-4 font-bold text-brand-dark dark:text-dark-heading">Finalidade</th>
                                                    <th className="px-6 py-4 font-bold text-brand-dark dark:text-dark-heading">Base Legal (LGPD)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                                {[
                                                    { d: 'Nome completo', f: 'Identificação e cadastro', b: 'Execução de contrato (Art. 7º, V)' },
                                                    { d: 'CPF/CNPJ', f: 'Identificação fiscal e antifraude', b: 'Execução de contrato + Obrigação legal' },
                                                    { d: 'E-mail', f: 'Comunicação, notificações, recuperação de senha', b: 'Execução de contrato' },
                                                    { d: 'Telefone', f: 'Suporte e notificações via WhatsApp', b: 'Execução de contrato' },
                                                    { d: 'Endereço', f: 'Exibição na vitrine e logística', b: 'Execução de contrato' },
                                                    { d: 'Dados bancários/gateway', f: 'Processamento de pagamentos (via Mercado Pago)', b: 'Execução de contrato' },
                                                    { d: 'Fotos e vídeos de produtos', f: 'Exibição na vitrine digital', b: 'Execução de contrato' }
                                                ].map((item, i) => (
                                                    <tr key={i} className="hover:bg-brand-gray dark:hover:bg-dark-border/50 transition-colors">
                                                        <td className="px-6 py-4 font-medium text-brand-dark dark:text-dark-heading">{item.d}</td>
                                                        <td className="px-6 py-4 text-gray-600 dark:text-dark-body">{item.f}</td>
                                                        <td className="px-6 py-4 text-gray-600 dark:text-dark-body">{item.b}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-xl font-bold mb-6 text-brand-dark flex items-center gap-3">
                                        <div className="w-2 h-2 bg-brand-green rounded-full"></div>
                                        1.2. Dados fornecidos pelo Usuário (Comprador)
                                    </h3>
                                    <div className="overflow-x-auto border border-brand-border dark:border-dark-border rounded-xl mb-8">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border">
                                                <tr>
                                                    <th className="px-6 py-4 font-bold text-brand-dark dark:text-dark-heading">Dado</th>
                                                    <th className="px-6 py-4 font-bold text-brand-dark dark:text-dark-heading">Finalidade</th>
                                                    <th className="px-6 py-4 font-bold text-brand-dark dark:text-dark-heading">Base Legal (LGPD)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                                {[
                                                    { d: 'Nome completo', f: 'Identificação do pedido', b: 'Execução de contrato' },
                                                    { d: 'E-mail', f: 'Confirmação de pedido e comunicação', b: 'Execução de contrato' },
                                                    { d: 'Telefone', f: 'Contato sobre pedido', b: 'Execução de contrato' },
                                                    { d: 'Endereço de entrega', f: 'Logística de entrega', b: 'Execução de contrato' },
                                                    { d: 'Histórico de pedidos', f: 'Gestão de compras e suporte', b: 'Execução de contrato' },
                                                    { d: 'Avaliações publicadas', f: 'Exibição na vitrine digital', b: 'Execução de contrato / Legítimo interesse' }
                                                ].map((item, i) => (
                                                    <tr key={i} className="hover:bg-brand-gray dark:hover:bg-dark-border/50 transition-colors">
                                                        <td className="px-6 py-4 font-medium text-brand-dark dark:text-dark-heading">{item.d}</td>
                                                        <td className="px-6 py-4 text-gray-600 dark:text-dark-body">{item.f}</td>
                                                        <td className="px-6 py-4 text-gray-600 dark:text-dark-body">{item.b}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-xl font-bold mb-6 text-brand-dark flex items-center gap-3">
                                        <div className="w-2 h-2 bg-brand-green rounded-full"></div>
                                        1.3. Dados coletados automaticamente
                                    </h3>
                                    <div className="overflow-x-auto border border-brand-border dark:border-dark-border rounded-xl mb-8">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border">
                                                <tr>
                                                    <th className="px-6 py-4 font-bold text-brand-dark dark:text-dark-heading">Dado</th>
                                                    <th className="px-6 py-4 font-bold text-brand-dark dark:text-dark-heading">Finalidade</th>
                                                    <th className="px-6 py-4 font-bold text-brand-dark dark:text-dark-heading">Base Legal (LGPD)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                                {[
                                                    { d: 'Dados de navegação (páginas, cliques)', f: 'Melhoria da plataforma', b: 'Legítimo interesse (Art. 7º, IX)' },
                                                    { d: 'Logs de acesso', f: 'Segurança e cumprimento do Marco Civil da Internet', b: 'Obrigação legal' }
                                                ].map((item, i) => (
                                                    <tr key={i} className="hover:bg-brand-gray dark:hover:bg-dark-border/50 transition-colors">
                                                        <td className="px-6 py-4 font-medium text-brand-dark dark:text-dark-heading">{item.d}</td>
                                                        <td className="px-6 py-4 text-gray-600 dark:text-dark-body">{item.f}</td>
                                                        <td className="px-6 py-4 text-gray-600 dark:text-dark-body">{item.b}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                                <span className="text-brand-dark">2.</span>
                                COMO USAMOS OS DADOS
                            </h2>
                            <div className="space-y-6 md:pl-12 pl-6">
                                <p>Os dados coletados são utilizados exclusivamente para as seguintes finalidades:</p>
                                <ul className="list-disc pl-6 space-y-4 text-brand-inactive-text">
                                    <li><strong className="text-brand-dark">Execução do contrato:</strong> identificação, autenticação, processamento de pedidos, exibição na vitrine digital, comunicações operacionais e suporte ao Parceiro e ao Usuário.</li>
                                    <li><strong className="text-brand-dark">Segurança e prevenção de fraudes:</strong> verificação de identidade, análise de logs de acesso, detecção automatizada e manual de comportamentos suspeitos, e colaboração com autoridades competentes quando necessário e previsto em lei.</li>
                                    <li><strong className="text-brand-dark">Logística:</strong> repasse de dados de endereço e contato a transportadoras para viabilizar a entrega de pedidos.</li>
                                    <li><strong className="text-brand-dark">Melhoria da plataforma:</strong> análise de comportamento de navegação por meio de ferramentas analíticas (PostHog), de forma agregada e não identificável sempre que possível.</li>
                                    <li><strong className="text-brand-dark">Obrigações legais:</strong> manutenção de registros de acesso (Marco Civil da Internet) e de transações financeiras (legislação fiscal), pelo prazo exigido por lei.</li>
                                </ul>
                                <p className="bg-brand-gray p-4 rounded-xl font-medium text-brand-dark">A DUDIT <strong>não utiliza dados pessoais para fins publicitários</strong> e <strong>não vende dados a terceiros</strong>.</p>
                            </div>
                        </div>

                        <div>
                            <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                                <span className="text-brand-dark">3.</span>
                                COMPARTILHAMENTO DE DADOS
                            </h2>
                            <div className="space-y-6 md:pl-12 pl-6">
                                <p>A DUDIT <strong>não vende dados pessoais</strong> a terceiros. Os dados são compartilhados apenas nas seguintes situações:</p>
                                <ul className="list-disc pl-6 space-y-4 text-brand-inactive-text">
                                    <li><strong className="text-brand-dark">Mercado Pago:</strong> dados necessários para processar pagamentos online (nome, e-mail, CPF, valor da transação);</li>
                                    <li><strong className="text-brand-dark">Superfrete / Transportadoras:</strong> nome, endereço e telefone do destinatário para geração de etiquetas de envio;</li>
                                    <li><strong className="text-brand-dark">Cloudflare:</strong> dados de tráfego para segurança e proteção contra ataques, e armazenamento de imagens, vídeos e arquivos (Cloudflare R2);</li>
                                    <li><strong className="text-brand-dark">Autoridades competentes, mediante obrigação legal ou ordem judicial:</strong> quando exigido por lei, decisão judicial ou outra hipótese autorizada pela LGPD, para apuração de fraudes, ilícitos ou proteção de direitos, conforme item 2.4 dos Termos de Uso.</li>
                                </ul>
                                <p className="mt-4">A DUDIT não compartilha dados cadastrais de Parceiros diretamente com Usuários (ou vice-versa) que aleguem ter sido lesados, exceto quando amparada por obrigação legal, ordem judicial ou outra hipótese prevista na legislação aplicável.</p>
                            </div>
                        </div>

                        <div>
                            <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                                <span className="text-brand-dark">4.</span>
                                COOKIES E RASTREAMENTO
                            </h2>
                            <div className="space-y-6 md:pl-12 pl-6">
                                <p><strong>4.1.</strong> A DUDIT utiliza cookies técnicos essenciais para funcionamento da plataforma (autenticação, sessão) e cookies analíticos para melhoria da experiência (PostHog).</p>
                                <p><strong>4.2.</strong> Não utilizamos cookies de publicidade ou rastreamento para fins de anúncios.</p>
                                <p><strong>4.3.</strong> O usuário pode configurar seu navegador para bloquear cookies, mas isso pode afetar o funcionamento da plataforma.</p>
                            </div>
                        </div>

                        <div>
                            <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                                <span className="text-brand-dark">5.</span>
                                LOGS E SEGURANÇA
                            </h2>
                            <div className="space-y-6 md:pl-12 pl-6">
                                <p><strong>5.1.</strong> Os dados são armazenados em servidores seguros (Supabase/Vercel), com criptografia em trânsito (HTTPS/TLS) e em repouso.</p>
                                <p><strong>5.2.</strong> Chaves e tokens sensíveis são armazenados com criptografia adicional, com sistema de rotação de chaves (master key versionada) para garantir que eventual comprometimento não exponha dados históricos.</p>
                                <p><strong>5.3.</strong> Senhas nunca são armazenadas em texto simples - utilizamos hash seguro (bcrypt ou equivalente).</p>
                                <p><strong>5.4.</strong> Tokens de integração com gateways de pagamento são criptografados e nunca expostos em logs ou interfaces.</p>
                                <p><strong>5.5.</strong> A DUDIT adota moderação de conteúdo automatizada para imagens, vídeos e textos, visando proteger a plataforma e seus usuários.</p>
                                <p><strong>5.6. Armazenamento de Imagens, Vídeos e Arquivos:</strong> Imagens, vídeos e arquivos enviados por Parceiros e Usuários são armazenados em infraestrutura de terceiros (Cloudflare R2). Conteúdos públicos (imagens e vídeos de anúncios e da vitrine) passam por processo de moderação, conforme item 5.5 dos Termos de Uso. Arquivos e anexos de caráter privado, trocados entre Parceiro e Usuário, não são monitorados rotineiramente, mas a DUDIT possui acesso técnico a todo o conteúdo armazenado, o qual poderá ser acessado para fins de moderação, suporte, segurança, apuração de denúncias ou cumprimento de obrigação legal, sempre limitado a essas finalidades.</p>
                                <p><strong>5.7.</strong> Apesar de todos os esforços técnicos, nenhum sistema é 100% inviolável. Em caso de incidente de segurança que afete dados pessoais, a DUDIT notificará os titulares afetados e a Autoridade Nacional de Proteção de Dados (ANPD) no prazo legal.</p>
                            </div>
                        </div>

                        <div>
                            <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                                <span className="text-brand-dark">6.</span>
                                RETENÇÃO DOS DADOS
                            </h2>
                            <div className="overflow-x-auto md:pl-14 pl-6 border-l-2 border-brand-gray mb-8">
                                <div className="border border-brand-border dark:border-dark-border rounded-xl">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border">
                                            <tr>
                                                <th className="px-6 py-4 font-bold text-brand-dark dark:text-dark-heading">Tipo de dado</th>
                                                <th className="px-6 py-4 font-bold text-brand-dark dark:text-dark-heading">Prazo de retenção</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                            {[
                                                { t: 'Dados de cadastro (Parceiro ativo)', p: 'Enquanto a conta estiver ativa' },
                                                { t: 'Dados de cadastro (após exclusão)', p: 'Até 6 meses (para fins de segurança e disputas)' },
                                                { t: 'Logs de acesso (IP, data, hora)', p: '6 meses (conforme Marco Civil da Internet)' },
                                                { t: 'Dados de transações financeiras', p: '5 anos (obrigação fiscal e legal)' },
                                                { t: 'Dados de pedidos', p: '5 anos (CDC - prazo de prescrição)' }
                                            ].map((item, i) => (
                                                <tr key={i} className="hover:bg-brand-gray dark:hover:bg-dark-border/50 transition-colors">
                                                    <td className="px-6 py-4 font-medium text-brand-dark dark:text-dark-heading">{item.t}</td>
                                                    <td className="px-6 py-4 text-gray-600 dark:text-dark-body">{item.p}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                                <span className="text-brand-dark">7.</span>
                                DIREITOS LGPD
                            </h2>
                            <div className="space-y-6 md:pl-12 pl-6">
                                <p>Em conformidade com a LGPD, você tem direito a:</p>
                                <ul className="list-disc pl-6 space-y-2 text-brand-inactive-text">
                                    <li><strong>Acesso:</strong> solicitar cópia dos seus dados pessoais armazenados;</li>
                                    <li><strong>Correção:</strong> solicitar correção de dados incompletos ou incorretos;</li>
                                    <li><strong>Exclusão:</strong> solicitar a exclusão dos seus dados, respeitados os prazos legais de retenção;</li>
                                    <li><strong>Portabilidade:</strong> solicitar seus dados em formato estruturado;</li>
                                    <li><strong>Revogação do consentimento:</strong> onde o tratamento for baseado em consentimento;</li>
                                    <li><strong>Oposição:</strong> opor-se a tratamentos baseados em legítimo interesse;</li>
                                    <li><strong>Informação:</strong> ser informado sobre com quem seus dados são compartilhados.</li>
                                </ul>
                                <p className="mt-8 p-6 bg-brand-gray rounded-2xl border border-brand-border">
                                    Para exercer qualquer um desses direitos, entre em contato pelo e-mail: <br />
                                    <strong className="text-brand-dark text-lg">[contato@dudit.com.br]</strong><br />
                                    <span className="text-sm text-brand-inactive-text italic">O prazo de resposta é de até 15 dias úteis.</span>
                                </p>
                            </div>
                        </div>

                        <div>
                            <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                                <span className="text-brand-dark">8.</span>
                                EXCLUSÃO E ANONIMIZAÇÃO
                            </h2>
                            <div className="space-y-6 md:pl-12 pl-6">
                                <p><strong>8.1.</strong> O Parceiro pode solicitar a exclusão da conta a qualquer momento através das configurações da plataforma ou pelo canal de suporte.</p>
                                <p><strong>8.2.</strong> Após a solicitação, os dados serão anonimizados ou excluídos em até <strong>30 dias</strong>, exceto aqueles que precisam ser mantidos por obrigação legal (transações financeiras, logs de acesso).</p>
                                <p><strong>8.3.</strong> Dados de pedidos já concluídos podem ser mantidos de forma anonimizada para fins estatísticos.</p>
                            </div>
                        </div>

                        <div>
                            <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                                <span className="text-brand-dark">9.</span>
                                TRANSFERÊNCIA INTERNACIONAL DE DADOS
                            </h2>
                            <div className="md:pl-14 pl-6 border-l-2 border-brand-gray">
                                <p>Alguns serviços utilizados pela DUDIT (Railway, Supabase, Cloudflare, Sentry, PostHog, Mercado Pago) podem armazenar ou processar dados em servidores fora do Brasil. Esses parceiros seguem padrões internacionais de segurança e privacidade compatíveis com a LGPD.</p>
                            </div>
                        </div>

                        <div>
                            <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                                <span className="text-brand-dark">10.</span>
                                CONTATO E ENCARREGADO (DPO)
                            </h2>
                            <div className="space-y-6 md:pl-12 pl-6">
                                <p>Para dúvidas, solicitações ou reclamações sobre privacidade:</p>
                                <p><strong>E-mail:</strong> [contato@dudit.com.br]<br />
                                    <strong>Responsável:</strong> [SEU NOME COMPLETO]</p>
                                <p>Você também pode registrar reclamações na <strong>Autoridade Nacional de Proteção de Dados (ANPD):</strong> <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer" className="text-brand-green font-medium underline underline-offset-4">www.gov.br/anpd</a></p>
                            </div>
                        </div>

                        <div>
                            <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                                <span className="text-brand-dark">11.</span>
                                ALTERAÇÕES DESTA POLÍTICA
                            </h2>
                            <div className="md:pl-14 pl-6 border-l-2 border-brand-gray">
                                <p>Esta Política pode ser atualizada periodicamente. A data da última atualização estará sempre indicada no topo do documento. O uso continuado da plataforma após alterações implica aceitação da nova versão.</p>
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