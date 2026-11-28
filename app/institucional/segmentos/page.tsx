"use client";

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button } from '@/components/reusable/Button';
import {
  FileIcon,
  ClockIcon,
  PhoneIcon,
  CheckCircleIcon
} from '@/lib/icons';
import { GridLines, SectionHeader, CTA, Navbar, Footer } from '@/components/InstitucionalShared';
import { useRouter } from 'next/navigation';
import { trackEvent, getAcquisitionContext } from '@/lib/analytics';

const segments = [
  {
    title: "Lojas de Roupas e Comércio",
    description: "Controle de estoque por grade (tamanho e cor), etiquetas com código de barras, vitrine online e PDV balcão com 0% de comissão da Dudit.",
    planNote: "Grade de variações a partir do plano Crescer",
    type: "fashion",
    href: "/segmentos/lojas-de-roupas-e-calcados"
  },
  {
    title: "Salões de Beleza e Barbearias",
    description: "Agenda online disponível 24h para seus clientes, controle de horários de profissionais e fechamento de caixa sem confusão.",
    planNote: "Comece grátis no plano Começar",
    type: "beauty",
    href: "/segmentos/saloes-e-barbearias"
  },
  {
    title: "Oficinas Mecânicas e Auto Centers",
    description: "Emissão de ordens de serviço digitais com fotos, controle de peças e orçamentos claros enviados direto pelo WhatsApp.",
    planNote: "Ordens de serviço a partir do plano Crescer",
    type: "technical",
    href: "/segmentos/oficinas-e-tecnicos"
  },
  {
    title: "Assistência Técnica e Celulares",
    description: "Ficha de entrada com fotos do aparelho, histórico da OS, orçamentos pelo WhatsApp e acompanhamento do conserto online.",
    planNote: "Ordens de serviço a partir do plano Crescer",
    type: "assistance",
    href: "/segmentos/assistencia-tecnica-celulares"
  },
  {
    title: "Confeitarias, Docerias e Marmitas",
    description: "Receba pedidos organizados, monte seu cardápio digital com 0% de comissão da Dudit e controle produtos e estoque.",
    planNote: "Comece grátis no plano Começar",
    type: "confectionery",
    href: "/segmentos/confeitarias-e-alimentacao"
  },
  {
    title: "Autônomos e Prestadores de Serviços",
    description: "Monte sua vitrine de serviços, envie orçamentos em PDF, organize a agenda e venda sem comissão da plataforma.",
    planNote: "Comece grátis no plano Começar",
    type: "freelance",
    href: "/segmentos/autonomos-e-prestadores-de-servicos"
  }
];

const SegmentMockup = ({ type }: { type: string }) => {
  switch (type) {
    case 'confectionery':
      return (
        <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[240px] rounded-xl border border-brand-border">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-brand-gray dark:border-dark-border">
            <div className="w-6 h-6 bg-brand-green rounded-full flex items-center justify-center text-white">
              <PhoneIcon size={12} color="white" />
            </div>
            <span className="text-[10px] font-bold text-brand-inactive-text uppercase">WhatsApp</span>
          </div>
          <div className="bg-brand-gray dark:bg-dark-border/40 p-2 rounded-lg mb-3">
            <p className="text-[10px] text-brand-inactive-text italic">"Quero encomendar um bolo de pote para amanhã!"</p>
          </div>
          <div className="flex justify-between items-center">
            <div>
              <div className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">Bolo de Pote</div>
              <div className="text-[12px] font-bold text-brand-green">R$ 15,00</div>
            </div>
            <div className="bg-brand-green text-white text-[8px] font-bold px-2 py-1 rounded">PAGO</div>
          </div>
        </div>
      );
    case 'beauty':
      return (
        <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[240px] rounded-xl border border-brand-border">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Agenda Hoje</span>
            <ClockIcon size={12} className="text-brand-inactive-text" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-950/40 p-2 rounded-lg border border-blue-100 dark:border-blue-900/50">
              <div className="text-[10px] font-bold text-blue-700 dark:text-blue-300">14:00</div>
              <div className="flex-1">
                <div className="text-[10px] font-bold text-gray-900 dark:text-dark-heading">Corte Masculino</div>
                <div className="text-[8px] text-gray-500 dark:text-dark-body">Cliente: Marcos</div>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-brand-gray dark:bg-dark-border/40 p-2 rounded-lg border border-brand-border opacity-50">
              <div className="text-[10px] font-bold text-brand-inactive-text">15:00</div>
              <div className="flex-1">
                <div className="text-[10px] font-bold text-brand-inactive-text">Barba</div>
              </div>
            </div>
          </div>
        </div>
      );
    case 'technical':
      return (
        <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[240px] rounded-xl border border-brand-border">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Ordem de Serviço</span>
            <FileIcon size={12} className="text-brand-inactive-text" />
          </div>
          <div className="border-2 border-dashed border-brand-border rounded-lg p-3">
            <div className="text-[10px] font-bold text-brand-dark dark:text-dark-heading mb-1">OS #1284</div>
            <div className="text-[8px] text-brand-inactive-text mb-3">Troca de Óleo + Filtro</div>
            <div className="flex justify-between items-center">
              <div className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">R$ 250,00</div>
              <div className="bg-brand-orange-light dark:bg-brand-orange/20 text-brand-orange text-[8px] font-bold px-2 py-0.5 rounded">EM ANDAMENTO</div>
            </div>
          </div>
        </div>
      );
    case 'assistance':
      return (
        <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[240px] rounded-xl border border-brand-border">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Ficha de Bancada</span>
            <CheckCircleIcon size={12} className="text-brand-green" />
          </div>
          <div className="bg-brand-gray dark:bg-dark-border/40 rounded-lg p-3">
            <div className="flex justify-between items-center mb-1">
              <div className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">OS #2041</div>
              <div className="bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[8px] font-bold px-2 py-0.5 rounded">APROVADA</div>
            </div>
            <div className="text-[9px] text-brand-inactive-text mb-2">iPhone 12 · Troca de tela</div>
            <div className="flex justify-between items-center pt-2 border-t border-brand-border">
              <div className="text-[8px] text-brand-inactive-text">Garantia 90 dias</div>
              <div className="text-[10px] font-bold text-brand-green">R$ 380,00</div>
            </div>
          </div>
        </div>
      );
    case 'fashion':
      return (
        <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[240px] rounded-xl border border-brand-border">
          <div className="flex gap-3 mb-3">
            <div className="w-12 h-12 bg-brand-gray dark:bg-dark-border/40 rounded-lg"></div>
            <div className="flex-1">
              <div className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">Camiseta Básica</div>
              <div className="text-[12px] font-bold text-brand-green">R$ 59,90</div>
            </div>
          </div>
          <div className="flex gap-2 mb-3">
            {['P', 'M', 'G'].map(s => (
              <div key={s} className="w-6 h-6 border border-brand-border rounded flex items-center justify-center text-[8px] font-bold">{s}</div>
            ))}
          </div>
          <div className="flex justify-between items-center text-[8px] text-brand-inactive-text">
            <span>Estoque: 12 un</span>
            <span className="text-brand-green font-bold">Vitrine Ativa</span>
          </div>
        </div>
      );
    case 'freelance':
      return (
        <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[240px] rounded-xl border border-brand-border relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-brand-dark text-white text-[8px] px-2 py-1 rounded-bl-lg">PDF</div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 bg-brand-green/10 rounded flex items-center justify-center text-brand-green">
              <FileIcon size={12} />
            </div>
            <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">Orçamento Profissional</span>
          </div>
          <div className="space-y-1 mb-4">
            <div className="h-1.5 w-full bg-brand-gray dark:bg-dark-border/40 rounded-full"></div>
            <div className="h-1.5 w-3/4 bg-brand-gray dark:bg-dark-border/40 rounded-full"></div>
            <div className="h-1.5 w-1/2 bg-brand-gray dark:bg-dark-border/40 rounded-full"></div>
          </div>
          <div className="w-full py-1.5 text-[8px] font-bold text-center rounded-md bg-brand-green text-white">Enviar por WhatsApp</div>
        </div>
      );
    case 'home':
      return (
        <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[240px] rounded-xl border border-brand-border">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Serviço Residencial</span>
            <CheckCircleIcon size={12} className="text-brand-green" />
          </div>
          <div className="bg-brand-gray dark:bg-dark-border/40 p-2.5 rounded-lg mb-2">
            <div className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">Instalação Elétrica</div>
            <div className="text-[8px] text-brand-inactive-text">Atendimento local e nacional</div>
          </div>
          <div className="flex justify-between items-center text-[8px]">
            <span className="text-brand-green font-bold">Orçamento no WhatsApp</span>
          </div>
        </div>
      );
    default:
      return null;
  }
};

const SegmentsHero = ({ onNavigate }: { onNavigate: (page: string) => void }) => (
  <section className="relative bg-white dark:bg-dark-surface pt-32 pb-20 overflow-hidden flex flex-col justify-center">
    <GridLines />
    <div className="flex-1 flex flex-col max-w-[1400px] w-full mx-auto px-4 relative z-10">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-4xl md:text-5xl font-bold text-brand-dark dark:text-dark-heading mb-6 leading-tight">
            A Dudit se adapta ao jeito que o seu negócio vende.
          </h1>
          <p className="text-brand-inactive-text text-lg md:text-xl mb-8 max-w-lg leading-relaxed">
            De lojas de roupas a oficinas, salões e confeitarias: monte sua vitrine, organize o atendimento e venda na sua cidade ou para todo o Brasil com 0% de comissão da Dudit.
          </p>
          <div className="flex flex-wrap gap-4">
            <Button onClick={() => { trackEvent("cta_clicked", { source: "segmentos_hero", target: "start_selling", ...getAcquisitionContext() }); onNavigate('start-selling'); }}>Começar grátis</Button>
            <Button variant="outline" onClick={() => { trackEvent("cta_clicked", { source: "segmentos_hero", target: "explore", ...getAcquisitionContext() }); onNavigate('explore'); }}>Explorar Dudit</Button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative h-[400px] lg:h-[500px] flex items-center justify-center"
        >
          <div className="relative z-10 w-full max-w-[500px]">
            <img
              src="https://img.dudit.com.br/static/mascots/Segmentos.png"
              alt="Mascote Segmentos Dudit"
              className="w-full h-auto"
            />
          </div>

          <div className="absolute inset-0 bg-brand-gray/50 dark:bg-dark-border/30 rounded-[4rem] transform rotate-6 scale-90 -z-10"></div>
          <div className="absolute inset-0 bg-brand-green/5 rounded-[4rem] transform -rotate-3 scale-95 -z-10"></div>
        </motion.div>
      </div>
    </div>
  </section>
);

const SegmentsGrid = () => (
  <section className="py-24 bg-white dark:bg-dark-surface relative border-t border-brand-border">
    <GridLines />
    <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
      <SectionHeader
        subtitle="SOLUÇÕES POR SEGMENTO"
        title="Feita para diferentes tipos de negócios"
      />
      <p className="text-brand-inactive-text max-w-2xl mb-16 text-lg -mt-8">
        Escolha seu segmento para ver como a Dudit organiza vendas, estoque, agenda e entregas no dia a dia.
      </p>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {segments.map((segment, idx) => (
          <motion.article
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.1 }}
            className="group relative flex flex-col h-full"
          >
            <div
              aria-hidden="true"
              className="bg-brand-gray dark:bg-dark-border/40 border border-brand-border h-64 rounded-xl overflow-hidden relative p-6 flex items-center justify-center mb-6 group-hover:border-brand-green/40 transition-colors"
            >
              <SegmentMockup type={segment.type} />
            </div>
            <div className="flex flex-col flex-1">
              <span className="text-[11px] font-semibold text-brand-green mb-1.5">
                {segment.planNote}
              </span>
              <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-2">
                <Link
                  href={segment.href}
                  onClick={() => trackEvent("cta_clicked", { source: "segmentos_card", target: "segment", segment: segment.type, ...getAcquisitionContext() })}
                  className="hover:text-brand-green transition-colors after:absolute after:inset-0"
                >
                  {segment.title}
                </Link>
              </h3>
              <p className="text-brand-inactive-text text-sm leading-relaxed">{segment.description}</p>
            </div>
          </motion.article>
        ))}
      </div>
    </div>
  </section>
);

export default function SegmentsPage() {
  const router = useRouter();

  const onNavigate = (page: string) => {
    if (page === 'home') router.push('/institucional/inicio');
    else if (page === 'segments') router.push('/institucional/segmentos');
    else if (page === 'pricing') router.push('/institucional/planos');
    else if (page === 'terms') router.push('/institucional/termos');
    else if (page === 'privacidade') router.push('/institucional/privacidade');
    else if (page === 'about') router.push('/institucional/sobre');
    else if (page === 'start-selling') router.push('/auth/login?mode=partner');
    else if (page === 'explore') router.push('/explorar');
    else router.push('/');
  };

  return (
    <div className="min-h-screen bg-white dark:bg-dark-surface">
      <Navbar onNavigate={onNavigate} />
      <main>
        <SegmentsHero onNavigate={onNavigate} />
        <SegmentsGrid />
        <CTA onNavigate={onNavigate} />
      </main>
      <Footer onNavigate={onNavigate} />
    </div>
  );
};
