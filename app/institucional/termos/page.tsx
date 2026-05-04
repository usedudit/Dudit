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
                Versão 1.1 - Última atualização: Março de 2026
              </p>
            </motion.div>
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="prose prose-lg max-w-none text-brand-dark leading-relaxed space-y-8">
            <p className="font-medium text-xl border-l-4 border-brand-green pl-6 py-2 bg-brand-gray rounded-r-xl">
              Estes Termos de Uso ("Termos") regem o acesso e uso da plataforma DUDIT, operada por [SEU NOME COMPLETO], CPF nº [XXX.XXX.XXX-XX] (futuramente constituída como Pessoa Jurídica), com sede na cidade de Lucélia/SP, doravante denominada "DUDIT".
            </p>

            <p>
              Ao utilizar a DUDIT, seja como <strong>PARCEIRO</strong> (Vendedor/Prestador de Serviços) ou <strong>USUÁRIO</strong> (Comprador/Consumidor Final), você declara ter lido, compreendido e aceito integralmente estas condições.
            </p>

            <div className="bg-brand-dark text-white p-8 rounded-2xl">
              <h3 className="text-white text-xl font-bold mb-4 uppercase tracking-wide">Uso por menores de idade</h3>
              <p className="text-gray-300">
                A plataforma é destinada a pessoas com 18 anos ou mais. Menores de 16 anos estão proibidos de se cadastrar. Entre 16 e 18 anos, o cadastro exige autorização do responsável legal. A DUDIT não se responsabiliza por cadastros realizados em desacordo com esta cláusula.
              </p>
            </div>

            <hr className="border-brand-border my-12" />

            <div className="space-y-12">
              <div>
                <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                  <span className="text-brand-green">1.</span>
                  O SERVIÇO (MERO INTERMEDIADOR)
                </h2>
                <div className="space-y-4 md:pl-14 pl-6 border-l-2 border-brand-gray">
                  <p><strong>1.1.</strong> A DUDIT é uma plataforma tecnológica (modelo SaaS - Software as a Service) que fornece ferramentas de gestão empresarial (ERP) e uma vitrine digital para conectar Parceiros e Usuários.</p>
                  <p><strong>1.2. Isenção de Responsabilidade:</strong> A DUDIT atua exclusivamente como provedora de infraestrutura tecnológica. A DUDIT não é proprietária, fornecedora, transportadora ou garantidora dos produtos ou serviços anunciados pelos Parceiros.</p>
                  <p><strong>1.3. Responsabilidade Integral do Parceiro:</strong> O Parceiro é o único e exclusivo responsável por: veracidade das informações do anúncio; entrega do produto ou prestação do serviço; qualidade, garantia, troca e reembolso; atendimento ao consumidor; cumprimento do Código de Defesa do Consumidor (Lei 8.078/90); emissão de documentos fiscais exigidos por lei.</p>
                  <p><strong>1.4. Rescisão por Violação:</strong> A DUDIT reserva-se o direito de suspender ou encerrar qualquer conta, sem aviso prévio e sem direito a reembolso proporcional, em casos de violação destes Termos, fraude comprovada, uso indevido da plataforma ou conduta que cause dano a terceiros ou à reputação da DUDIT.</p>
                </div>
              </div>

              <div>
                <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                  <span className="text-brand-green">2.</span>
                  CADASTRO E VERACIDADE
                </h2>
                <div className="space-y-4 md:pl-14 pl-6 border-l-2 border-brand-gray">
                  <p><strong>2.1.</strong> Para utilizar a plataforma, coletamos dados como: Nome completo, Nome da Loja, CPF/CNPJ, Endereço, E-mail e Telefone.</p>
                  <p><strong>2.2.</strong> O Parceiro garante que as informações fornecidas são exatas, precisas e verdadeiras, e assume o compromisso de manter seus dados atualizados. A DUDIT não se responsabiliza por dados inseridos incorretamente pelo próprio usuário.</p>
                  <p><strong>2.3. Colaboração com Autoridades:</strong> Em casos de suspeita de fraude, golpe ou falha na entrega por parte do Parceiro, a DUDIT reserva-se o direito de fornecer todos os dados cadastrais e de log (IP, data, hora) do Parceiro às autoridades competentes ou ao Usuário lesado, para que este possa buscar seus direitos judicialmente. O Parceiro concorda expressamente com esse compartilhamento em casos de litígio.</p>
                  <p><strong>2.4. Unicidade de Cadastro:</strong> Cada CPF/CNPJ pode ter apenas um cadastro ativo na plataforma como Parceiro. A criação de múltiplas contas para burlar suspensões ou limites é expressamente proibida.</p>
                </div>
              </div>

              <div>
                <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                  <span className="text-brand-green">3.</span>
                  PRODUTOS, CONTEÚDOS E PROPRIEDADE INTELECTUAL
                </h2>
                <div className="space-y-4 md:pl-14 pl-6 border-l-2 border-brand-gray">
                  <p><strong>3.1. Conteúdo Proibido:</strong> É estritamente vedado anunciar na DUDIT: drogas, substâncias ilícitas ou entorpecentes; armas de fogo, munições ou explosivos; produtos roubados, contrabandeados ou de origem ilícita; réplicas ou falsificações que violem leis de propriedade industrial; conteúdo pornográfico ou de exploração sexual; serviços que configurem exercício ilegal de profissão regulamentada; qualquer item que viole a legislação brasileira vigente.</p>
                  <p><strong>3.2. Propriedade Intelectual das Fotos:</strong> O Parceiro declara ser o titular ou licenciado dos direitos sobre as imagens que publicar. É proibido utilizar fotos de catálogos de terceiros ou marcas sem autorização. A DUDIT reserva-se o direito de remover anúncios que violem direitos autorais.</p>
                  <p><strong>3.3. Licença de Uso de Imagem:</strong> Ao cadastrar produtos e logotipos, o Parceiro concede à DUDIT uma licença gratuita, não exclusiva e limitada ao território nacional para exibir tais imagens na plataforma e em materiais de divulgação da vitrine do Parceiro.</p>
                  <p><strong>3.4. Denúncias e Moderação:</strong> Usuários poderão denunciar anúncios ou conteúdos que violem estes Termos através dos canais de suporte. A DUDIT poderá, a seu critério, remover anúncios, sugerir alterações ou suspender contas sem aviso prévio.</p>
                  <p><strong>3.5. Marca DUDIT:</strong> O nome, logotipo, mascote e identidade visual da DUDIT são propriedade exclusiva de seus titulares. É proibida qualquer reprodução, modificação ou uso não autorizado.</p>
                </div>
              </div>

              <div>
                <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                  <span className="text-brand-green">4.</span>
                  PAGAMENTOS E RESPONSABILIDADE FINANCEIRA
                </h2>
                <div className="space-y-4 md:pl-14 pl-6 border-l-2 border-brand-gray">
                  <p><strong>4.1.</strong> A DUDIT utiliza gateways de pagamento parceiros (atualmente: Mercado Pago) para processar transações online.</p>
                  <p><strong>4.2. A DUDIT Não Processa Pagamentos:</strong> A DUDIT não é instituição financeira, não realiza cobrança direta, não intermedeia valores e não possui controle sobre pagamentos efetuados entre Usuários e Parceiros. Todo pagamento ocorre exclusivamente por meio de gateways de terceiros ou diretamente entre as partes.</p>
                  <p><strong>4.3. Recebimento Direto (Split):</strong> Ao realizar uma compra via gateway na plataforma, o valor é processado e enviado diretamente para a conta do Parceiro, descontadas as taxas do gateway. A DUDIT não custodia, não retém e não gerencia o fluxo financeiro da venda.</p>
                  <p><strong>4.4.</strong> O Parceiro é o único responsável por eventuais estornos (chargebacks), reembolsos ou disputas financeiras com o Usuário.</p>
                  <p><strong>4.5. Independência do Gateway:</strong> O Usuário reconhece que a transação financeira é processada integralmente pelo Gateway de Pagamento, e não pela DUDIT. Em casos de fraude ou disputa, a responsabilidade pela custódia do valor é da Instituição Financeira/Gateway, conforme suas próprias regras.</p>
                  <p><strong>4.6. Transações Fora da Plataforma:</strong> Nas modalidades "Pagamento na Entrega" ou "Retirada no Local", a DUDIT atua estritamente como vitrine digital. Qualquer divergência é de responsabilidade exclusiva das partes, isentando a DUDIT de qualquer solidariedade.</p>
                </div>
              </div>

              <div>
                <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                  <span className="text-brand-green">5.</span>
                  PLANOS, CANCELAMENTO E DOWNGRADE
                </h2>
                <div className="space-y-4 md:pl-14 pl-6 border-l-2 border-brand-gray">
                  <p><strong>5.1.</strong> O Parceiro pode cancelar a assinatura dos planos pagos a qualquer momento, sem multa de fidelidade.</p>
                  <p><strong>5.2.</strong> Após o cancelamento, o Parceiro terá até 3 (três) dias antes da migração automática para o Plano Gratuito na renovação subsequente.</p>
                  <p><strong>5.3. Política de Downgrade:</strong> Caso o Parceiro retorne a um plano com limite inferior ao número de itens cadastrados, os itens excedentes serão automaticamente <strong>arquivados</strong>. A DUDIT não se responsabiliza por perda de vendas decorrente do arquivamento automático.</p>
                  <p><strong>5.4. Exportação de Dados:</strong> O Parceiro poderá exportar seus dados cadastrados (produtos, clientes, pedidos) a qualquer momento através das ferramentas disponíveis na plataforma.</p>
                  <p><strong>5.5.</strong> A DUDIT reserva-se o direito de alterar os valores dos planos mediante aviso prévio de 30 (trinta) dias.</p>
                </div>
              </div>

              <div>
                <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                  <span className="text-brand-green">6.</span>
                  DISPONIBILIDADE E LIMITAÇÃO DE RESPONSABILIDADE
                </h2>
                <div className="space-y-4 md:pl-14 pl-6 border-l-2 border-brand-gray">
                  <p><strong>6.1.</strong> A DUDIT envidará seus melhores esforços para manter a plataforma online, mas não garante disponibilidade ininterrupta.</p>
                  <p><strong>6.2.</strong> Em nenhuma hipótese a DUDIT será responsável por lucros cessantes, danos indiretos ou perda de dados decorrentes de instabilidades da plataforma.</p>
                  <p><strong>6.3. Entregas e Logística:</strong> A responsabilidade pela entrega e conferência do produto é integralmente do Parceiro e do Usuário.</p>
                  <p><strong>6.4. Frete Nacional:</strong> Ao utilizar o serviço de logística integrada (Superfrete), o Parceiro reconhece que a responsabilidade final pelo serviço de transporte é da transportadora.</p>
                </div>
              </div>

              <div>
                <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                  <span className="text-brand-green">7.</span>
                  CONFIDENCIALIDADE
                </h2>
                <div className="space-y-4 md:pl-14 pl-6 border-l-2 border-brand-gray">
                  <p><strong>7.1.</strong> Parceiros e Usuários obrigam-se a manter em sigilo dados pessoais a que tiverem acesso em razão das transações, sendo vedado o uso para fins diversos da conclusão do negócio.</p>
                </div>
              </div>

              <div>
                <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                  <span className="text-brand-green">8.</span>
                  INDENIZAÇÃO
                </h2>
                <div className="space-y-4 md:pl-14 pl-6 border-l-2 border-brand-gray">
                  <p><strong>8.1.</strong> O Parceiro concorda em defender, indenizar e isentar a DUDIT de quaisquer reclamações decorrentes do mau uso da plataforma ou violação de direitos de terceiros.</p>
                </div>
              </div>

              <div>
                <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                  <span className="text-brand-green">9.</span>
                  ALTERAÇÃO DOS TERMOS
                </h2>
                <div className="space-y-4 md:pl-14 pl-6 border-l-2 border-brand-gray">
                  <p><strong>9.1.</strong> A DUDIT poderá alterar estes Termos a qualquer tempo, mediante publicação da nova versão na plataforma.</p>
                  <p><strong>9.2.</strong> Os novos Termos entrarão em vigor 10 (dez) dias após publicação. O uso continuado após esse prazo implica aceitação.</p>
                </div>
              </div>

              <div>
                <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                  <span className="text-brand-green">10.</span>
                  FORO
                </h2>
                <div className="space-y-4 md:pl-14 pl-6 border-l-2 border-brand-gray">
                  <p><strong>10.1.</strong> Fica eleito o Foro da Comarca de Lucélia/SP para dirimir quaisquer dúvidas oriundas destes Termos.</p>
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
