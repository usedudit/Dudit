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
import { HeroBanner } from "@/components/marketplace/shared-components";
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
    description: "Ficha de entrada com fotos do aparelho, histórico da OS, orçamentos pelo WhatsApp e acompanhamento do conserto online.",
    type: "assistance",
    href: "/segmentos/assistencia-tecnica-celulares"
  },
  {
    title: "Confeitarias, Docerias e Marmitas",
    description: "Receba pedidos organizados, monte seu cardápio digital sem comissão por venda e controle produtos e estoque.",
    type: "confectionery",
    href: "/segmentos/confeitarias-e-alimentacao"
  },
  {
    title: "Autônomos e Prestadores de Serviços",
    description: "Monte sua vitrine de serviços, envie orçamentos em PDF, organize a agenda e receba com o valor do serviço todo seu.",
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
            <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Ordem de Serviço</span>
            <FileIcon size={12} className="text-brand-inactive-text" />
          </div>
          <div className="border-2 border-dashed border-brand-border rounded-lg p-3">
            <div className="text-[10px] font-bold text-brand-dark dark:text-dark-heading mb-1">OS #1284</div>
            <div className="text-[8px] text-brand-inactive-text mb-3">Troca de tela - iPhone 12</div>
            <div className="flex justify-between items-center">
              <div className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">R$ 380,00</div>
              <div className="bg-brand-orange-light dark:bg-brand-orange/20 text-brand-orange text-[8px] font-bold px-2 py-0.5 rounded">EM ANDAMENTO</div>
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
          <Button variant="default" className="w-full py-1.5 text-[8px] h-auto bg-brand-green text-white">Enviar por WhatsApp</Button>
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

