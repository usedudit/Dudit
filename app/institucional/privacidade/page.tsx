"use client";

import React from 'react';
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
                Versão 1.1 — Última atualização: Março de 2026
              </p>
            </motion.div>
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="prose prose-lg max-w-none text-brand-dark leading-relaxed space-y-12">
            <p className="font-medium text-xl border-l-4 border-brand-green pl-6 py-2 bg-brand-gray rounded-r-xl">
              Esta Política de Privacidade descreve como a DUDIT coleta, usa, armazena e protege os dados pessoais de seus usuários, em conformidade com a <strong>Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018)</strong> e o <strong>Marco Civil da Internet (Lei 12.965/2014)</strong>.
            </p>

            <div>
              <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                <span className="text-brand-green">1.</span>
                CONTROLADOR DOS DADOS
              </h2>
              <div className="bg-brand-gray p-8 rounded-2xl border border-brand-border">
                <p className="mb-0 font-bold text-brand-dark">[SEU NOME COMPLETO]</p>
                <p className="mb-0 text-brand-inactive-text">CPF: [XXX.XXX.XXX-XX]</p>
                <p className="mb-0 text-brand-inactive-text">E-mail de contato: [contato@dudit.com.br]</p>
                <p className="mb-0 text-brand-inactive-text">Endereço: Lucélia/SP</p>
              </div>
            </div>

            <div>
              <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                <span className="text-brand-green">2.</span>
                DADOS COLETADOS E FINALIDADE
              </h2>
              
              <div className="space-y-8">
                <div>
                  <h3 className="text-xl font-bold mb-4 text-brand-green uppercase tracking-wide">2.1. Dados fornecidos pelo Parceiro (Vendedor)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse border border-brand-border rounded-xl overflow-hidden">
                      <thead>
                        <tr className="bg-brand-gray">
                          <th className="p-4 border border-brand-border font-bold text-brand-dark">Dado</th>
                          <th className="p-4 border border-brand-border font-bold text-brand-dark">Finalidade</th>
                          <th className="p-4 border border-brand-border font-bold text-brand-dark">Base Legal (LGPD)</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        <tr>
                          <td className="p-4 border border-brand-border">Nome completo</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text">Identificação e cadastro</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text italic">Execução de contrato (Art. 7º, V)</td>
                        </tr>
                        <tr>
                          <td className="p-4 border border-brand-border">CPF/CNPJ</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text">Identificação fiscal e antifraude</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text italic">Execução de contrato + Obrigação legal</td>
                        </tr>
                        <tr>
                          <td className="p-4 border border-brand-border">E-mail</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text">Comunicação, notificações, recuperação de senha</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text italic">Execução de contrato</td>
                        </tr>
                        <tr>
                          <td className="p-4 border border-brand-border">Telefone</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text">Suporte e notificações via WhatsApp</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text italic">Execução de contrato</td>
                        </tr>
                        <tr>
                          <td className="p-4 border border-brand-border">Endereço</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text">Exibição na vitrine e logística</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text italic">Execução de contrato</td>
                        </tr>
                        <tr>
                          <td className="p-4 border border-brand-border">Dados bancários/gateway</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text">Processamento de pagamentos (via Mercado Pago)</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text italic">Execução de contrato</td>
                        </tr>
                        <tr>
                          <td className="p-4 border border-brand-border">Fotos de produtos</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text">Exibição na vitrine digital</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text italic">Execução de contrato</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-bold mb-4 text-brand-green uppercase tracking-wide">2.2. Dados fornecidos pelo Usuário (Comprador)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse border border-brand-border rounded-xl overflow-hidden">
                      <thead>
                        <tr className="bg-brand-gray">
                          <th className="p-4 border border-brand-border font-bold text-brand-dark">Dado</th>
                          <th className="p-4 border border-brand-border font-bold text-brand-dark">Finalidade</th>
                          <th className="p-4 border border-brand-border font-bold text-brand-dark">Base Legal (LGPD)</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        <tr>
                          <td className="p-4 border border-brand-border">Nome completo</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text">Identificação do pedido</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text italic">Execução de contrato</td>
                        </tr>
                        <tr>
                          <td className="p-4 border border-brand-border">E-mail</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text">Confirmação de pedido e comunicação</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text italic">Execução de contrato</td>
                        </tr>
                        <tr>
                          <td className="p-4 border border-brand-border">Telefone</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text">Contato sobre pedido</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text italic">Execução de contrato</td>
                        </tr>
                        <tr>
                          <td className="p-4 border border-brand-border">Endereço de entrega</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text">Logística de entrega</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text italic">Execução de contrato</td>
                        </tr>
                        <tr>
                          <td className="p-4 border border-brand-border">Histórico de pedidos</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text">Gestão de compras e suporte</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text italic">Execução de contrato</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-bold mb-4 text-brand-green uppercase tracking-wide">2.3. Dados coletados automaticamente</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse border border-brand-border rounded-xl overflow-hidden">
                      <thead>
                        <tr className="bg-brand-gray">
                          <th className="p-4 border border-brand-border font-bold text-brand-dark">Dado</th>
                          <th className="p-4 border border-brand-border font-bold text-brand-dark">Finalidade</th>
                          <th className="p-4 border border-brand-border font-bold text-brand-dark">Base Legal (LGPD)</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        <tr>
                          <td className="p-4 border border-brand-border">Endereço IP</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text">Segurança, antifraude e logs</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text italic">Legítimo interesse (Art. 7º, IX)</td>
                        </tr>
                        <tr>
                          <td className="p-4 border border-brand-border">Dados de navegação</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text">Melhoria da plataforma (via PostHog)</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text italic">Legítimo interesse</td>
                        </tr>
                        <tr>
                          <td className="p-4 border border-brand-border">Logs de acesso</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text">Segurança e Marco Civil da Internet</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text italic">Obrigação legal</td>
                        </tr>
                        <tr>
                          <td className="p-4 border border-brand-border">Dados de erro</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text">Monitoramento técnico (via Sentry)</td>
                          <td className="p-4 border border-brand-border text-brand-inactive-text italic">Legítimo interesse</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                <span className="text-brand-green">3.</span>
                COMPARTILHAMENTO DE DADOS
              </h2>
              <p>A DUDIT <strong>não vende dados pessoais</strong> a terceiros. Os dados são compartilhados apenas nas seguintes situações:</p>
              <ul className="list-disc pl-8 space-y-4 text-brand-inactive-text">
                <li><strong className="text-brand-dark">Mercado Pago:</strong> dados necessários para processar pagamentos online;</li>
                <li><strong className="text-brand-dark">Superfrete / Transportadoras:</strong> dados para geração de etiquetas de envio;</li>
                <li><strong className="text-brand-dark">Sentry & PostHog:</strong> dados técnicos e de navegação para melhoria da plataforma;</li>
                <li><strong className="text-brand-dark">Cloudflare:</strong> segurança e proteção contra ataques;</li>
                <li><strong className="text-brand-dark">Autoridades competentes:</strong> quando exigido por lei ou ordem judicial.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                <span className="text-brand-green">4.</span>
                ARMAZENAMENTO E SEGURANÇA
              </h2>
              <div className="space-y-4">
                <p><strong>4.1.</strong> Os dados são armazenados em servidores seguros (Supabase/Vercel), com criptografia em trânsito e em repouso.</p>
                <p><strong>4.2.</strong> Chaves e tokens sensíveis são armazenados com criptografia adicional (master key versionada).</p>
                <p><strong>4.3.</strong> Senhas são armazenadas via hash seguro (bcrypt ou equivalente).</p>
                <p><strong>4.4.</strong> A DUDIT adota moderação de conteúdo automatizada para proteger a plataforma e seus usuários.</p>
              </div>
            </div>

            <div>
              <h2 className="text-3xl font-bold mb-6 flex items-center gap-4">
                <span className="text-brand-green">5.</span>
                DIREITOS DO TITULAR
              </h2>
              <p>Em conformidade com a LGPD, você tem direito a acesso, correção, exclusão, portabilidade e revogação do consentimento sobre seus dados.</p>
              <p className="mt-6">Para exercer seus direitos, entre em contato: <strong>[contato@dudit.com.br]</strong></p>
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
};
