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

const segments = [
  {
    title: "Lojas de Roupas e Comércio",
    description: "Controle de estoque por grade (tamanho e cor), etiquetas com código de barras, vitrine online e PDV balcão com 0% de comissão.",
    type: "fashion",
    href: "/segmentos/lojas-de-roupas-e-calcados"
  },
  {
    title: "Salões de Beleza e Barbearias",
    description: "Agenda online disponível 24h para seus clientes, controle de horários de profissionais e fechamento de caixa sem confusão.",
    type: "beauty",
    href: "/segmentos/saloes-e-barbearias"
  },
  {
    title: "Oficinas Mecânicas e Auto Centers",
    description: "Emissão de ordens de serviço digitais com fotos, controle de peças e orçamentos claros enviados direto pelo WhatsApp.",
    type: "technical",
    href: "/segmentos/oficinas-e-tecnicos"
  },
  {
    title: "Assistência Técnica e Celulares",
    description: "Checklist de entrada do aparelho, fotos antes/depois, laudo técnico, termo de garantia e acompanhamento de OS online.",
    type: "technical",
    href: "/segmentos/assistencia-tecnica-celulares"
  },
  {
    title: "Confeitarias, Docerias e Marmitas",
    description: "Receba pedidos e encomendas de forma organizada, monte cardápio digital sem taxas de entrega e controle insumos.",
    type: "confectionery",
    href: "/segmentos/confeitarias-e-alimentacao"
  },
  {
    title: "Autônomos e Prestadores de Serviços",
    description: "Crie orçamentos profissionais em PDF, envie para clientes com um clique e receba pagamentos com 100% do lucro seu.",
    type: "freelance",
    href: "/auth/login?mode=partner"
  }
];

const SegmentMockup = ({ type }: { type: string }) => {
  switch (type) {
    case 'confectionery':
      return (
        <div className="bg-white p-4 w-full max-w-[240px] rounded-xl border border-brand-border">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-brand-gray">
            <div className="w-6 h-6 bg-brand-green rounded-full flex items-center justify-center text-white">
              <PhoneIcon size={12} color="white" />
            </div>
            <span className="text-[10px] font-bold text-brand-inactive-text uppercase">WhatsApp</span>
          </div>
          <div className="bg-brand-gray p-2 rounded-lg mb-3">
            <p className="text-[10px] text-brand-inactive-text italic">"Quero encomendar um bolo de pote para amanhã!"</p>
          </div>
          <div className="flex justify-between items-center">
            <div>
              <div className="text-[10px] font-bold text-brand-dark">Bolo de Pote</div>
              <div className="text-[12px] font-bold text-brand-green">R$ 15,00</div>
            </div>
            <div className="bg-brand-green text-white text-[8px] font-bold px-2 py-1 rounded">PAGO</div>
          </div>
        </div>
      );
    case 'beauty':
      return (
        <div className="bg-white p-4 w-full max-w-[240px] rounded-xl border border-brand-border">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Agenda Hoje</span>
            <ClockIcon size={12} className="text-brand-inactive-text" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3 bg-blue-50 p-2 rounded-lg border border-blue-100">
              <div className="text-[10px] font-bold text-blue-700">14:00</div>
              <div className="flex-1">
                <div className="text-[10px] font-bold text-gray-900">Corte Masculino</div>
                <div className="text-[8px] text-gray-500">Cliente: Marcos</div>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-brand-gray p-2 rounded-lg border border-brand-border opacity-50">
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
        <div className="bg-white p-4 w-full max-w-[240px] rounded-xl border border-brand-border">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Ordem de Serviço</span>
            <FileIcon size={12} className="text-brand-inactive-text" />
          </div>
          <div className="border-2 border-dashed border-brand-border rounded-lg p-3">
            <div className="text-[10px] font-bold text-brand-dark mb-1">OS #1284</div>
            <div className="text-[8px] text-brand-inactive-text mb-3">Troca de Óleo + Filtro</div>
            <div className="flex justify-between items-center">
              <div className="text-[10px] font-bold text-brand-dark">R$ 250,00</div>
              <div className="bg-brand-orange-light text-brand-orange text-[8px] font-bold px-2 py-0.5 rounded">EM ANDAMENTO</div>
            </div>
          </div>
        </div>
      );
    case 'fashion':
      return (
        <div className="bg-white p-4 w-full max-w-[240px] rounded-xl border border-brand-border">
          <div className="flex gap-3 mb-3">
            <div className="w-12 h-12 bg-brand-gray rounded-lg"></div>
            <div className="flex-1">
              <div className="text-[10px] font-bold text-brand-dark">Camiseta Básica</div>
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
        <div className="bg-white p-4 w-full max-w-[240px] rounded-xl border border-brand-border relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-brand-dark text-white text-[8px] px-2 py-1 rounded-bl-lg">PDF</div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 bg-brand-green/10 rounded flex items-center justify-center text-brand-green">
              <FileIcon size={12} />
            </div>
            <span className="text-[10px] font-bold text-brand-dark">Orçamento Profissional</span>
          </div>
          <div className="space-y-1 mb-4">
            <div className="h-1.5 w-full bg-brand-gray rounded-full"></div>
            <div className="h-1.5 w-3/4 bg-brand-gray rounded-full"></div>
            <div className="h-1.5 w-1/2 bg-brand-gray rounded-full"></div>
          </div>
          <Button variant="default" className="w-full py-1.5 text-[8px] h-auto bg-brand-green text-white">Enviar por WhatsApp</Button>
        </div>
      );
    case 'home':
      return (
        <div className="bg-white p-4 w-full max-w-[240px] rounded-xl border border-brand-border">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Serviço Residencial</span>
            <CheckCircleIcon size={12} className="text-brand-green" />
          </div>
          <div className="bg-brand-gray p-2.5 rounded-lg mb-2">
            <div className="text-[10px] font-bold text-brand-dark">Instalação Elétrica</div>
            <div className="text-[8px] text-brand-inactive-text">Atendimento no seu bairro</div>
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
  <section className="relative bg-white pt-32 pb-20 overflow-hidden flex flex-col justify-center">
    <GridLines />
    <div className="flex-1 flex flex-col container mx-auto px-4 lg:px-0 max-w-[1400px] w-full relative z-10">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-5xl font-bold text-brand-dark mb-6">
            Produtos, serviços e negócios de todos os tipos.
          </h1>
          <p className="text-brand-inactive-text text-lg md:text-xl mb-8 max-w-lg leading-relaxed">
            Na Dudit você encontra desde produtos até profissionais e empresas da sua região para resolver o seu dia a dia.
          </p>
          <div className="flex flex-wrap gap-4">
            <Button onClick={() => onNavigate('explore')}>Explorar categorias</Button>
            <Button variant="outline" onClick={() => onNavigate('start-selling')}>Divulgar meu negócio</Button>
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

          <div className="absolute inset-0 bg-brand-gray/50 rounded-[4rem] transform rotate-6 scale-90 -z-10"></div>
          <div className="absolute inset-0 bg-brand-green/5 rounded-[4rem] transform -rotate-3 scale-95 -z-10"></div>
        </motion.div>
      </div>
    </div>
  </section>
);

const SegmentsGrid = () => (
  <section className="py-24 bg-white relative border-t border-brand-border">
    <GridLines />
    <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
      <SectionHeader
        subtitle="PARA TODOS OS TIPOS DE NEGÓCIOS"
        title="Encontre o que precisa ou mostre o que você faz"
      />
      <p className="text-brand-inactive-text max-w-2xl mb-16 text-lg -mt-8">
        De produtos locais a profissionais autônomos, tudo organizado e conectado de forma simples.
      </p>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {segments.map((segment, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.1 }}
          >
            <Link href={segment.href} className="group block h-full">
              <div className="bg-brand-gray border border-brand-border h-64 rounded-xl overflow-hidden relative p-6 flex items-center justify-center mb-6 group-hover:border-brand-green/40 transition-colors">
                <SegmentMockup type={segment.type} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xl font-bold text-brand-dark hover:text-brand-green transition-colors">{segment.title}</h4>
                </div>
                <p className="text-brand-inactive-text text-sm leading-relaxed">{segment.description}</p>
              </div>
            </Link>
          </motion.div>
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
    else if (page === 'explore') router.push('/');
    else router.push('/');
  };

  return (
    <div className="min-h-screen bg-white">
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
