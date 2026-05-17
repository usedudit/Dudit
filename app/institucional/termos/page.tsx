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
        else if (page === 'start-selling') router.push('/erp/switch');
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
                                Versão 1.0 - Última atualização: Maio de 2026
                            </p>
                        </motion.div>
                    </div>
                </section>

                <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <div className="prose prose-lg max-w-none text-brand-dark leading-relaxed space-y-12">
                        <p className="font-medium text-xl border-l-4 border-brand-green pl-6 py-2 bg-brand-gray rounded-r-xl">
                            Estes Termos de Uso ("Termos") regem o acesso e uso da plataforma DUDIT, operada por [SEU NOME COMPLETO], CPF nº [XXX.XXX.XXX-XX] (futuramente constituída como Pessoa Jurídica), com sede na cidade de Lucélia/SP, doravante denominada "DUDIT".
                        </p>

                        <p>
                            Ao utilizar a DUDIT, seja como <strong>PARCEIRO</strong> (Vendedor/Prestador de Serviços) ou <strong>USUÁRIO</strong> (Comprador/Consumidor Final), você declara ter lido, compreendido e aceito integralmente estas condições.
                        </p>

                        <div className="bg-brand-dark text-white p-8 rounded-2xl shadow-xl">
                            <h3 className="text-white text-xl font-bold mb-4 uppercase tracking-wide">Uso por menores de idade</h3>
                            <p className="text-gray-300 leading-relaxed">
                                O cadastro como <strong>Parceiro (Vendedor)</strong> é restrito a pessoas com 18 anos ou mais, uma vez que implica celebração de contrato e obrigações legais. O acesso como <strong>Usuário (Comprador)</strong> não possui restrição de idade, sendo recomendado o acompanhamento dos responsáveis para menores de 16 anos. A DUDIT não se responsabiliza por cadastros de Parceiros realizados em desacordo com esta cláusula.
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
                                        <li><strong>• DUDIT:</strong> Plataforma tecnológica operada por [SEU NOME COMPLETO], que oferece ferramentas de gestão empresarial (ERP) e vitrine digital para conexão entre Parceiros e Usuários.</li>
                                        <li><strong>• Parceiro:</strong> Pessoa física ou jurídica que utiliza a plataforma para anunciar, vender produtos ou prestar serviços. Também denominado Vendedor.</li>
                                        <li><strong>• Usuário:</strong> Pessoa física que acessa a plataforma para buscar, visualizar ou adquirir produtos e serviços. Também denominado Comprador ou Consumidor Final.</li>
                                        <li><strong>• Plataforma:</strong> Conjunto de funcionalidades disponibilizadas pela DUDIT, incluindo sistema de gestão, vitrine digital e demais recursos tecnológicos.</li>
                                        <li><strong>• Gateway de Pagamento:</strong> Serviço terceirizado responsável pelo processamento de transações financeiras online (atualmente: Mercado Pago).</li>
                                        <li><strong>• Plano:</strong> Modalidade de assinatura contratada pelo Parceiro, que determina os recursos e limites disponíveis na plataforma.</li>
                                        <li><strong>• Anúncio:</strong> Publicação de produto ou serviço realizada pelo Parceiro na vitrine digital da plataforma.</li>
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
                                    <p><strong>2.1.</strong> Para utilizar a plataforma como Parceiro, são coletados os seguintes dados: Nome completo, Nome da Loja, Endereço, E-mail e Telefone. As condições completas de tratamento desses dados estão descritas na Política de Privacidade.</p>
                                    <p><strong>2.2.</strong> O Parceiro garante que as informações fornecidas são exatas, precisas e verdadeiras, e assume o compromisso de manter seus dados atualizados. A DUDIT não se responsabiliza por dados inseridos incorretamente pelo próprio usuário.</p>
                                    <p><strong>2.3. Unicidade de Cadastro:</strong> Cada CPF/CNPJ pode ter apenas um cadastro ativo na plataforma como Parceiro. A criação de múltiplas contas para burlar suspensões ou limites é expressamente proibida.</p>
                                    <p><strong>2.4. Colaboração com Autoridades:</strong> Em casos de suspeita de fraude, golpe ou falha na entrega por parte do Parceiro, a DUDIT reserva-se o direito de fornecer todos os dados cadastrais e de log (IP, data, hora) do Parceiro às autoridades competentes ou ao Usuário lesado, para que este possa buscar seus direitos judicialmente. O Parceiro concorda expressamente com esse compartilhamento em casos de litígio.</p>
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
                                    <p><strong>3.1. Natureza do Serviço:</strong> A DUDIT é uma plataforma tecnológica (modelo SaaS - Software as a Service) que fornece ferramentas de gestão empresarial (ERP) e uma vitrine digital para conectar Parceiros e Usuários.</p>
                                    <p><strong>3.2. Mero Intermediador:</strong> A DUDIT atua exclusivamente como provedora de infraestrutura tecnológica. A DUDIT não é proprietária, fornecedora, transportadora ou garantidora dos produtos ou serviços anunciados pelos Parceiros.</p>
                                    <p><strong>3.3. Responsabilidade Integral do Parceiro:</strong> O Parceiro é o único e exclusivo responsável por:</p>
                                    <ul className="list-disc pl-6 space-y-2">
                                        <li>Veracidade das informações do anúncio;</li>
                                        <li>Entrega do produto ou prestação do serviço;</li>
                                        <li>Qualidade, garantia, troca e reembolso;</li>
                                        <li>Atendimento ao consumidor;</li>
                                        <li>Cumprimento do Código de Defesa do Consumidor (Lei 8.078/90);</li>
                                        <li>Emissão de documentos fiscais exigidos por lei.</li>
                                    </ul>
                                    <p><strong>3.4. Confidencialidade:</strong> Parceiros e Usuários obrigam-se a manter em sigilo dados pessoais (endereço, telefone, CPF) a que tiverem acesso em razão das transações, sendo vedado o uso para fins diversos da conclusão do negócio, como venda de mailing ou spam.</p>
                                    <p><strong>3.5. Indenização:</strong> O Parceiro concorda em defender, indenizar e isentar a DUDIT de quaisquer reclamações, processos, perdas ou danos (incluindo honorários advocatícios) decorrentes do mau uso da plataforma, violação destes Termos, venda de produtos defeituosos ou violação de direitos de terceiros.</p>
                                </div>
                            </div>

                            {/* Seção 4 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">4.</span>
                                    MARKETPLACE E ANÚNCIOS
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>4.1. Conteúdo Proibido:</strong> É estritamente vedado anunciar na DUDIT:</p>
                                    <ul className="list-disc pl-6 space-y-2">
                                        <li>Drogas, substâncias ilícitas ou entorpecentes;</li>
                                        <li>Armas de fogo, munições ou explosivos;</li>
                                        <li>Produtos roubados, contrabandeados ou de origem ilícita;</li>
                                        <li>Réplicas ou falsificações que violem leis de propriedade industrial;</li>
                                        <li>Conteúdo pornográfico ou de exploração sexual;</li>
                                        <li>Serviços que configurem exercício ilegal de profissão regulamentada;</li>
                                        <li>Qualquer item que viole a legislação brasileira vigente.</li>
                                    </ul>
                                    <p><strong>4.2. Imagens e Conteúdos:</strong> O Parceiro declara ser o titular ou licenciado dos direitos sobre as imagens que publicar. É proibido utilizar fotos de catálogos de terceiros ou marcas sem autorização. A DUDIT reserva-se o direito de remover anúncios que violem direitos autorais.</p>
                                    <p><strong>4.3. Licença de Uso de Imagem:</strong> Ao cadastrar produtos e logotipos, o Parceiro concede à DUDIT uma licença gratuita, não exclusiva e limitada ao território nacional para exibir tais imagens na plataforma e em materiais de divulgação da vitrine do Parceiro.</p>
                                    <p><strong>4.4. Ordem de Exibição e Ranking:</strong> A ordem de exibição de anúncios, parceiros e conteúdos na plataforma pode considerar critérios automatizados como relevância, localização, disponibilidade, qualidade do perfil, plano contratado, engajamento e outros fatores internos, sem obrigação de posicionamento específico.</p>
                                </div>
                            </div>

                            {/* Seção 5 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">5.</span>
                                    PAGAMENTOS E INTEGRAÇÕES
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>5.1. Gateway de Pagamento:</strong> A DUDIT utiliza gateways de pagamento parceiros (atualmente: Mercado Pago) para processar transações online.</p>
                                    <p><strong>5.2. A DUDIT Não Processa Pagamentos:</strong> A DUDIT não é instituição financeira, não realiza cobrança direta, não intermedeia valores e não possui controle sobre pagamentos efetuados entre Usuários e Parceiros. Todo pagamento ocorre exclusivamente por meio de gateways de terceiros ou diretamente entre as partes.</p>
                                    <p><strong>5.3. Recebimento Direto (Split):</strong> Ao realizar uma compra via gateway na plataforma, o valor é processado e enviado diretamente para a conta do Parceiro, descontadas as taxas do gateway. A DUDIT não custodia, não retém e não gerencia o fluxo financeiro da venda.</p>
                                    <p><strong>5.4. Chargebacks e Estornos:</strong> O Parceiro é o único responsável por eventuais estornos (chargebacks), reembolsos ou disputas financeiras com o Usuário.</p>
                                    <p><strong>5.5. Independência do Gateway:</strong> O Usuário reconhece que a transação financeira é processada integralmente pelo Gateway de Pagamento, e não pela DUDIT. Em casos de fraude ou disputa, a responsabilidade pela custódia do valor é da Instituição Financeira/Gateway, conforme suas próprias regras. A DUDIT fornecerá os dados técnicos disponíveis para auxiliar na disputa, mas não tem poder para estornar valores que não estão em sua posse.</p>
                                    <p><strong>5.6. Transações Fora da Plataforma:</strong> Nas modalidades "Pagamento na Entrega" ou "Retirada no Local", a DUDIT atua estritamente como vitrine digital. A DUDIT não participa, não intervém e não garante a conclusão da transação, que ocorre exclusivamente no mundo físico. Qualquer divergência é de responsabilidade exclusiva das partes, isentando a DUDIT de qualquer solidariedade.</p>
                                    <p><strong>5.7. Logística Integrada:</strong> Ao utilizar o serviço de logística integrada (Superfrete), o Parceiro reconhece que o contrato de transporte é firmado diretamente com a transportadora, sendo esta a responsável pelo serviço de entrega. A DUDIT atua apenas como facilitadora da contratação.</p>
                                    <p><strong>5.8. Integrações de Terceiros:</strong> A DUDIT não se responsabiliza por falhas, indisponibilidades, alterações de API, limitações técnicas ou interrupções causadas por serviços de terceiros integrados à plataforma.</p>
                                </div>
                            </div>

                            {/* Seção 6 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">6.</span>
                                    PLANOS E COBRANÇAS
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>6.1.</strong> O Parceiro pode cancelar a assinatura dos planos pagos a qualquer momento, sem multa de fidelidade.</p>
                                    <p><strong>6.2.</strong> Após o cancelamento, o Parceiro terá até 3 (três) dias antes da migração automática para o Plano Gratuito.</p>
                                    <p><strong>6.3. Política de Downgrade:</strong> Caso o Parceiro retorne a um plano com limite inferior ao número de itens cadastrados, os itens excedentes serão automaticamente <strong>arquivados</strong> - não aparecerão na vitrine digital, mas permanecerão salvos no sistema. O Parceiro poderá gerenciar quais itens permanecem ativos dentro do limite do plano vigente. O critério padrão de arquivamento é por menor volume de vendas, mas o Parceiro pode alterar manualmente a seleção. A DUDIT não se responsabiliza por perda de vendas decorrente do arquivamento automático.</p>
                                    <p><strong>6.4. Exportação de Dados:</strong> O Parceiro poderá exportar seus dados cadastrados (produtos, clientes, pedidos) a qualquer momento antes do encerramento da conta, através das ferramentas disponíveis na plataforma.</p>
                                    <p><strong>6.5. Reajuste de Valores:</strong> A DUDIT reserva-se o direito de alterar os valores dos planos mediante aviso prévio de 30 (trinta) dias. Assinantes ativos terão seus valores mantidos pelo período vigente da assinatura.</p>
                                </div>
                            </div>

                            {/* Seção 7 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">7.</span>
                                    MODERAÇÃO E PENALIDADES
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>7.1. Denúncias:</strong> Usuários poderão denunciar anúncios ou conteúdos que violem estes Termos através dos canais de suporte.</p>
                                    <p><strong>7.2. Suspensão Preventiva:</strong> A DUDIT poderá remover anúncios, limitar funcionalidades, suspender contas ou bloquear acessos imediatamente, inclusive preventivamente, em caso de suspeita de fraude, golpe, atividade ilícita, risco à plataforma ou aos usuários, independentemente de confirmação definitiva.</p>
                                    <p><strong>7.3. Moderação de Conteúdo:</strong> A DUDIT poderá, a seu critério exclusivo, remover anúncios ou limitar funcionalidades sem aviso prévio, caso identifique violações a estes Termos.</p>
                                </div>
                            </div>

                            {/* Seção 8 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">8.</span>
                                    DISPONIBILIDADE DA PLATAFORMA
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>8.1.</strong> A DUDIT envidará seus melhores esforços para manter a plataforma online, mas não garante disponibilidade ininterrupta. O sistema pode passar por indisponibilidades temporárias para manutenção ou por fatores externos.</p>
                                    <p><strong>8.2. Plataforma "Como Está":</strong> A plataforma é fornecida no modelo "como está" (as is) e "conforme disponibilidade", sem garantia de funcionamento ininterrupto, livre de falhas ou totalmente compatível com necessidades específicas do Parceiro.</p>
                                    <p><strong>8.3. Entregas e Logística:</strong> Em casos de entrega local ou retirada presencial, a responsabilidade pela entrega e conferência do produto é integralmente do Parceiro e do Usuário. A DUDIT não se responsabiliza por perdas, furtos, extravios ou atrasos.</p>
                                </div>
                            </div>

                            {/* Seção 9 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">9.</span>
                                    LIMITAÇÃO DE RESPONSABILIDADE
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>9.1. Danos Indiretos:</strong> Em nenhuma hipótese a DUDIT será responsável por lucros cessantes, danos indiretos, perda de dados ou perda de oportunidades de negócio decorrentes de instabilidades da plataforma.</p>
                                    <p><strong>9.2. Limitação Financeira:</strong> A responsabilidade total da DUDIT, independentemente da natureza da reclamação, fica limitada ao valor efetivamente pago pelo Parceiro à plataforma nos últimos 12 (doze) meses anteriores ao evento que originou a reclamação.</p>
                                    <p><strong>9.3. Sem Garantia de Resultados:</strong> A DUDIT não garante volume de vendas, geração de clientes, posicionamento em buscas, crescimento financeiro ou qualquer resultado comercial específico decorrente do uso da plataforma.</p>
                                </div>
                            </div>

                            {/* Seção 10 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">10.</span>
                                    PROPRIEDADE INTELECTUAL
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>10.1. Marca DUDIT:</strong> O nome, logotipo, mascote e identidade visual da DUDIT são propriedade exclusiva de seus titulares. É proibida qualquer reprodução, modificação ou uso não autorizado.</p>
                                    <p><strong>10.2. Responsabilidade sobre Conteúdo:</strong> O Parceiro declara ser o titular ou licenciado de todos os direitos sobre imagens, textos e conteúdos que publicar na plataforma, respondendo integralmente por eventuais violações de direitos de terceiros.</p>
                                    <p><strong>10.3. Licença de Uso Concedida à DUDIT:</strong> Ao cadastrar produtos e logotipos, o Parceiro concede à DUDIT uma licença gratuita, não exclusiva e limitada ao território nacional para exibir tais imagens na plataforma e em materiais de divulgação da vitrine do Parceiro.</p>
                                </div>
                            </div>

                            {/* Seção 11 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">11.</span>
                                    ENCERRAMENTO E SUSPENSÃO
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>11.1. Cancelamento pelo Parceiro:</strong> O Parceiro pode cancelar sua conta ou assinatura a qualquer momento, sem multa de fidelidade, através das configurações da plataforma ou pelo canal de suporte.</p>
                                    <p><strong>11.2. Rescisão por Violação:</strong> A DUDIT reserva-se o direito de suspender ou encerrar qualquer conta, sem aviso prévio e sem direito a reembolso proporcional, em casos de violação destes Termos, fraude comprovada, uso indevido da plataforma ou conduta que cause dano a terceiros ou à reputação da DUDIT.</p>
                                    <p><strong>11.3. Vedação de Reincidência:</strong> A criação de novas contas para burlar suspensões ou encerramentos é expressamente proibida e pode resultar em bloqueio permanente.</p>
                                    <p><strong>11.4. Exportação de Dados Antes do Encerramento:</strong> O Parceiro poderá exportar seus dados cadastrados (produtos, clientes, pedidos) a qualquer momento antes do encerramento da conta, através das ferramentas disponíveis na plataforma.</p>
                                </div>
                            </div>

                            {/* Seção 12 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">12.</span>
                                    ALTERAÇÕES NOS TERMOS
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>12.1.</strong> A DUDIT poderá alterar estes Termos a qualquer tempo, mediante publicação da nova versão na plataforma.</p>
                                    <p><strong>12.2.</strong> Os novos Termos entrarão em vigor 10 (dez) dias após publicação. O uso continuado da plataforma após esse prazo implica aceitação tácita das novas condições. Caso não concorde, o Parceiro deverá encerrar sua conta antes do prazo.</p>
                                </div>
                            </div>

                            {/* Seção 13 */}
                            <div>
                                <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
                                    <span className="text-brand-dark">13.</span>
                                    FORO
                                </h2>
                                <div className="space-y-6 md:pl-12 pl-6">
                                    <p><strong>13.1.</strong> Fica eleito o Foro da Comarca de Lucélia/SP para dirimir quaisquer dúvidas oriundas destes Termos, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p>
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
