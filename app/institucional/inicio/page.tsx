"use client";

import { useRouter } from 'next/navigation';

import { Button } from '@/components/reusable/Button';
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
   ArrowRightIcon,
   ChartIcon,
   MoneyIcon,
   BoxIcon,
   GridIcon,
   UserIcon,
   ShoppingBagIcon,
   StoreIcon,
   CheckCircleIcon,
   WhatsappIcon,
   CalendarIcon,
   WrenchIcon,
   TrendingUpIcon
} from '@/lib/icons';
import { GridLines, SectionHeader, Navbar, Footer, CTA } from '../../../components/InstitucionalShared';

const Hero = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
   return (
      <section className="relative bg-white pt-32 pb-20 overflow-hidden flex flex-col justify-center">
         <GridLines />
         <div className="flex-1 flex flex-col container mx-auto px-4 lg:px-6 max-w-[1300px] w-full">
            <div className="grid lg:grid-cols-2 gap-12 items-center">

               <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
               >
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-brand-dark leading-[1.1] mb-6">
                     Descubra o que tem por aqui
                  </h1>
                  <p className="text-brand-dark text-lg md:text-xl font-medium mb-8 max-w-lg leading-tight">
                     Produtos, serviços e oportunidades na sua cidade. <br className="hidden md:block" />
                     E se quiser, mostre o que você faz também.
                  </p>

                  <div className="flex flex-wrap gap-4">
                     <Button onClick={() => onNavigate('explore')}>Ver o que tem por aqui</Button>
                     <Button variant="outline" onClick={() => onNavigate('start-selling')}>Criar anúncio</Button>
                  </div>

               </motion.div>

               {/* Hero Dashboard Mockup */}
               <motion.div
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  className="relative"
               >
                  {/* Main Dashboard Card */}
                  <div className="bg-white rounded-xl overflow-hidden transform rotate-1 md:rotate-0 hover:rotate-0 transition-all duration-500">
                     <div className="bg-gray-100 p-4 border-b border-gray-200 flex items-center gap-4">
                        <div className="flex gap-2">
                           <div className="w-3 h-3 rounded-full bg-brand-red"></div>
                           <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                           <div className="w-3 h-3 rounded-full bg-brand-green"></div>
                        </div>
                        <div className="bg-white px-3 py-1 rounded text-xs text-brand-inactive-text flex-1 text-center font-mono">vitrine.dudit.com.br/seu-negocio</div>
                     </div>
                     <div className="p-6 flex gap-6">
                        <div className="w-16 hidden sm:flex flex-col gap-6 text-brand-inactive-text">
                           <BoxIcon className="w-5 h-5 text-brand-dark" />
                           <GridIcon className="w-5 h-5" />
                           <ChartIcon className="w-5 h-5" />
                           <UserIcon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                           <div className="flex justify-between items-end mb-8">
                              <div>
                                 <p className="text-sm text-brand-inactive-text mb-1">O que tem por aqui</p>
                                 <h3 className="text-3xl font-bold text-brand-dark">Sua Cidade</h3>
                                 <p className="text-xs text-green-600 font-medium flex items-center gap-1 mt-1">
                                    <TrendingUpIcon className="w-3 h-3" /> Descubra novas oportunidades
                                 </p>
                              </div>
                              <div className="text-xs text-brand-inactive-text">Agora</div>
                           </div>
                           {/* Chart Mockup */}
                           <div className="h-40 flex items-end justify-between gap-2 mb-8">
                              {[40, 65, 45, 80, 55, 70, 60, 90, 75, 50, 60].map((h, i) => (
                                 <div key={i} className="w-full bg-brand-slate rounded-t-sm relative group">
                                    <motion.div
                                       initial={{ height: 0 }}
                                       animate={{ height: `${h}%` }}
                                       transition={{ duration: 1, delay: 0.5 + (i * 0.1) }}
                                       className="absolute bottom-0 left-0 right-0 bg-brand-dark opacity-10 group-hover:opacity-20 group-hover:bg-brand-green transition-all"
                                    />
                                    <motion.div
                                       className="absolute w-full h-full border-t-2 border-brand-dark/20"
                                       style={{ top: `${100 - h}%` }}
                                    />
                                 </div>
                              ))}
                           </div>

                           {/* List Mockup - Showing "Qualquer coisa" (Product, Service, Rental) */}
                           <div className="space-y-4">
                              <p className="text-sm font-semibold text-brand-dark mb-2">Destaques da Região</p>

                              {/* Product */}
                              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                 <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                                       <BoxIcon className="w-4 h-4 text-blue-600" />
                                    </div>
                                    <div>
                                       <div className="text-xs font-bold text-brand-dark">Produtos de Qualidade</div>
                                       <div className="text-[10px] text-brand-inactive-text">Perto de você</div>
                                    </div>
                                 </div>
                                 <div className="text-right">
                                    <div className="text-xs font-bold text-brand-dark">Veja agora</div>
                                 </div>
                              </div>

                              {/* Service */}
                              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                 <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-purple-100 rounded flex items-center justify-center">
                                       <CalendarIcon className="w-4 h-4 text-purple-600" />
                                    </div>
                                    <div>
                                       <div className="text-xs font-bold text-brand-dark">Serviços Locais</div>
                                       <div className="text-[10px] text-brand-inactive-text">Encontre quem faz</div>
                                    </div>
                                 </div>
                                 <div className="text-right">
                                    <div className="text-xs font-bold text-brand-dark">Descubra</div>
                                 </div>
                              </div>

                              {/* Rental */}
                              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                 <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-orange-100 rounded flex items-center justify-center">
                                       <ShoppingBagIcon className="w-4 h-4 text-orange-600" />
                                    </div>
                                    <div>
                                       <div className="text-xs font-bold text-brand-dark">Tudo que você precisa</div>
                                       <div className="text-[10px] text-brand-inactive-text">Simples e direto</div>
                                    </div>
                                 </div>
                                 <div className="text-right">
                                    <div className="text-xs font-bold text-brand-dark">Confira</div>
                                 </div>
                              </div>

                           </div>
                        </div>
                     </div>
                  </div>

                  {/* Floating Mobile Mockup */}
                  <motion.div
                     className="absolute -right-4 md:-right-12 bottom-12 w-56 bg-white rounded-2xl p-4 border border-gray-100 shadow-xl hidden md:block"
                     animate={{ y: [0, -15, 0] }}
                     transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
                  >
                     <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-brand-green/20 rounded-full flex items-center justify-center">
                           <TrendingUpIcon className="w-5 h-5 text-brand-dark" />
                        </div>
                        <div>
                           <div className="text-xs font-bold text-brand-inactive-text uppercase tracking-wider">Nova Descoberta</div>
                           <div className="text-sm font-bold text-brand-dark">Perto de você</div>
                        </div>
                     </div>
                     <div className="bg-gray-50 rounded-lg p-2 text-xs">
                        <div className="flex justify-between text-brand-inactive-text mb-1">
                           <span>Anúncio</span>
                           <span>Grátis</span>
                        </div>
                        <div className="flex justify-between font-bold text-brand-dark">
                           <span>Visibilidade</span>
                           <span className="text-brand-green">Máxima</span>
                        </div>
                     </div>
                  </motion.div>
               </motion.div>
            </div>
         </div>
      </section>
   );
};

const Solutions = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
   return (
      <section id="solutions" className="relative py-24 bg-white overflow-hidden">
         <GridLines />
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <SectionHeader
               subtitle="SIMPLES E DIRETO"
               title="Um lugar simples pra resolver o dia a dia"
            />

            <p className="text-brand-inactive-text max-w-3xl mb-20 text-lg">
               Encontre quem vende, quem faz ou o que você precisa na sua cidade. <br />
               E se quiser, anuncie também — simples, rápido e direto.
            </p>

            {/* Feature 1: Vitrine Online */}
            <div className="grid md:grid-cols-2 gap-16 mb-32 items-center">
               <motion.div
                  initial={{ opacity: 0, x: -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="bg-white p-8 border border-gray-100 rounded-2xl relative"
               >
                  {/* Mockup Form */}
                  <div className="space-y-6">
                     <div className="flex bg-gray-50 p-1 rounded-lg border border-gray-100 w-fit">
                        <div className="px-6 py-1.5 bg-white text-brand-dark text-sm font-semibold rounded-md shadow-sm">Produto</div>
                        <div className="px-6 py-1.5 text-brand-inactive-text text-sm font-medium">Serviço</div>
                     </div>
                     <div>
                        <label className="block text-xs font-semibold text-brand-dark mb-1.5">Nome do item ou serviço</label>
                        <input disabled type="text" value="Corte de Cabelo ou Produto X" className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-brand-dark bg-gray-50" />
                     </div>
                     <div>
                        <label className="block text-xs font-semibold text-brand-dark mb-1.5">Preço na Vitrine</label>
                        <div className="border border-gray-200 rounded-md overflow-hidden bg-gray-50">
                           <div className="px-3 py-2 border-b border-gray-200 flex items-center gap-2">
                              <span className="text-sm text-brand-dark">R$ 150,00</span>
                           </div>
                        </div>
                     </div>
                     <button className="w-full bg-[#009660] hover:bg-[#007b4f] text-white font-semibold py-2.5 rounded-lg transition-colors">
                        Publicar na Minha Vitrine
                     </button>
                  </div>

                  {/* Overlapping Element */}
                  <motion.div
                     initial={{ scale: 0.8, opacity: 0 }}
                     whileInView={{ scale: 1, opacity: 1 }}
                     viewport={{ once: true }}
                     transition={{ delay: 0.2 }}
                     className="absolute -right-8 -bottom-12 bg-white rounded-xl border border-gray-200 w-56 hidden lg:flex flex-col overflow-hidden"
                  >
                     {/* Browser Header */}
                     <div className="bg-gray-50 border-b border-gray-100 p-3 flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-brand-red"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                        <div className="w-3 h-3 rounded-full bg-brand-green"></div>
                        <div className="mx-auto w-24 h-2 bg-gray-200 rounded-full"></div>
                     </div>
                     {/* Browser Content */}
                     <div className="p-4 grid grid-cols-2 gap-3 relative bg-white pb-8">
                        <div className="bg-gray-100 aspect-square rounded-xl"></div>
                        <div className="bg-gray-100 aspect-square rounded-xl"></div>
                        <div className="bg-gray-100 aspect-square rounded-xl"></div>
                        <div className="bg-gray-100 aspect-square rounded-xl"></div>

                        {/* Floating URL Badge */}
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#003828] text-white text-xs font-bold px-4 py-2.5 rounded-full whitespace-nowrap">
                           vitrine.dudit.com/sualoja
                        </div>
                     </div>
                  </motion.div>
               </motion.div>

               <motion.div
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
               >
                  <span className="text-brand-inactive-text uppercase tracking-wider text-sm font-semibold mb-2 block">CATÁLOGO AUTOMÁTICO</span>
                  <h3 className="text-4xl font-bold text-brand-dark mb-6">Tudo ao seu alcance</h3>
                  <p className="text-brand-inactive-text mb-8 leading-relaxed">
                     Produtos, serviços e achados na sua região. Tudo organizado para você encontrar o que precisa em poucos cliques.
                  </p>
                  <Button onClick={() => onNavigate('explore')}>
                     Ver o que tem por aqui <ArrowRightIcon className="w-4 h-4 ml-2" />
                  </Button>
               </motion.div>
            </div>

            {/* Feature 2: Feita para pequeno negócio */}
            <div className="grid md:grid-cols-2 gap-16 items-center">
               <motion.div
                  initial={{ opacity: 0, x: -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="order-2 md:order-1"
               >
                  <span className="text-brand-inactive-text uppercase tracking-wider text-sm font-semibold mb-2 block">PARA QUEM FAZ ACONTECER</span>
                  <h3 className="text-4xl font-bold text-brand-dark mb-6">Mostre o que você faz</h3>
                  <p className="text-brand-inactive-text mb-8 leading-relaxed">
                     Se você vende, faz artesanato ou presta serviços, a Dudit é o lugar certo para você aparecer para quem está por perto. Sem complicação técnica.
                  </p>
                  <Button onClick={() => onNavigate('start-selling')}>
                     Criar meu anúncio <ArrowRightIcon className="w-4 h-4 ml-2" />
                  </Button>
               </motion.div>

               <motion.div
                  initial={{ opacity: 0, x: 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="order-1 md:order-2 bg-gray-50/50 p-8 md:p-12 rounded-2xl relative h-96 flex items-center justify-center border border-gray-100"
               >
                  <div className="relative w-full max-w-sm h-64">
                     {/* Main Card - Multichannel */}
                     <motion.div
                        className="absolute top-0 left-0 w-72 h-auto bg-white rounded-xl z-10 p-5 border border-gray-200 flex flex-col gap-4"
                        whileHover={{ y: -5 }}
                     >
                        <div className="flex items-center gap-2 mb-2">
                           <GridIcon className="w-4 h-4 text-brand-dark" />
                           <span className="text-sm font-bold text-brand-dark">Novidades</span>
                        </div>

                        {/* WhatsApp Sale */}
                        <div className="flex items-center gap-3 bg-green-50 p-2.5 rounded-lg border border-green-100">
                           <div className="bg-green-500 p-1.5 rounded-full text-white">
                              <WhatsappIcon size={14} />
                           </div>
                           <div className="flex-1">
                              <div className="text-xs font-bold text-brand-dark">Interesse via WhatsApp</div>
                              <div className="text-[10px] text-brand-inactive-text">Bolo de Pote • Cliente: Ana</div>
                           </div>
                           <div className="text-xs font-bold text-green-700">R$ 25</div>
                        </div>

                        {/* Service Scheduled */}
                        <div className="flex items-center gap-3 bg-blue-50 p-2.5 rounded-lg border border-blue-100">
                           <div className="bg-blue-500 p-1.5 rounded-full text-white">
                              <CalendarIcon size={14} />
                           </div>
                           <div className="flex-1">
                              <div className="text-xs font-bold text-brand-dark">Agendado</div>
                              <div className="text-[10px] text-brand-inactive-text">Manutenção • Hoje, 14h</div>
                           </div>
                        </div>

                        {/* Physical Store Sale */}
                        <div className="flex items-center gap-3 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                           <div className="bg-gray-700 p-1.5 rounded-full text-white">
                              <StoreIcon size={14} />
                           </div>
                           <div className="flex-1">
                              <div className="text-xs font-bold text-brand-dark">Na sua cidade</div>
                              <div className="text-[10px] text-brand-inactive-text">Camiseta Básica</div>
                           </div>
                           <div className="text-xs font-bold text-brand-dark">R$ 50</div>
                        </div>
                     </motion.div>

                     {/* Floating Badge */}
                     <motion.div
                        className="absolute -bottom-6 -right-6 bg-brand-green rounded-xl z-30 p-4 text-brand-dark flex items-center gap-3 border-2 border-white"
                        initial={{ y: 20, opacity: 0 }}
                        whileInView={{ y: 0, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 }}
                     >
                        <div className="bg-white p-2 rounded-full">
                           <CheckCircleIcon size={20} className="text-brand-green" />
                        </div>
                        <div>
                           <div className="text-sm font-bold">Simples e rápido</div>
                           <div className="text-[10px] font-medium opacity-80">Em um só lugar</div>
                        </div>
                     </motion.div>
                  </div>
               </motion.div>
            </div>
         </div>
      </section>
   );
};

const BentoFeatures = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
   const cards = [
      {
         title: "Resolva rápido",
         description: "Ache produtos e serviços perto de você, sem perder tempo.",
         type: "sales",
         colSpan: "col-span-1"
      },
      {
         title: "Sem complicação",
         description: "Nada de cadastro difícil ou sistema pesado. Só o que você precisa.",
         type: "stock",
         colSpan: "col-span-1"
      },
      {
         title: "Pra todo mundo",
         description: "Negócios ou pessoas — qualquer um pode usar para anunciar ou encontrar.",
         type: "finance",
         colSpan: "col-span-1"
      }
   ];

   return (
      <section className="py-24 bg-white relative border-t border-gray-100">
         <GridLines />
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <SectionHeader
               subtitle="BENEFÍCIOS"
               title="Um lugar simples pra resolver o dia a dia"
            />
            <p className="text-brand-inactive-text max-w-2xl mb-16 text-lg -mt-8">
               A Dudit funciona para todo mundo, de forma rápida e sem complicação.
            </p>

            <div className="grid md:grid-cols-3 gap-8">
               {cards.map((card, idx) => (
                  <motion.div
                     key={idx}
                     initial={{ opacity: 0, y: 20 }}
                     whileInView={{ opacity: 1, y: 0 }}
                     transition={{ delay: idx * 0.1 }}
                     viewport={{ once: true }}
                     className={`${card.colSpan} group`}
                  >
                     <div className="bg-brand-slate border border-gray-100 h-64 rounded-xl overflow-hidden relative p-6 flex items-center justify-center">
                        {/* Visuals based on type */}
                        {card.type === 'sales' && (
                           <div className="bg-white p-4 w-full max-w-[240px] rounded-lg border border-gray-100 text-xs">
                              <div className="flex justify-between mb-4 border-b pb-2">
                                 <span className="text-brand-inactive-text">Novo Pedido</span>
                                 <div className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold">PIX</div>
                              </div>
                              <div className="text-xl font-bold text-brand-dark mb-1">R$ 150,00</div>
                              <div className="text-brand-inactive-text text-[10px] mb-4">Item da sua Vitrine</div>
                              <button className="w-full bg-brand-dark text-white py-2 rounded text-[10px] font-medium">
                                 Ver na Vitrine
                              </button>
                           </div>
                        )}
                        {card.type === 'stock' && (
                           <div className="relative w-full h-full flex justify-center items-center p-4">
                              <div className="w-full max-w-[240px] bg-white rounded-lg border border-gray-100 p-3 flex flex-col gap-3">
                                 <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                                    <div className="text-[10px] font-bold text-brand-inactive-text uppercase">O que tem por aqui</div>
                                    <CalendarIcon size={12} className="text-brand-inactive-text" />
                                 </div>

                                 <div className="flex items-center justify-between bg-gray-50 p-2 rounded border border-gray-100">
                                    <div className="flex items-center gap-2">
                                       <div className="w-6 h-6 bg-brand-green/20 rounded flex items-center justify-center">
                                          <BoxIcon size={10} className="text-brand-dark" />
                                       </div>
                                       <div>
                                          <div className="text-[10px] font-bold text-brand-dark">Encontre Produtos</div>
                                          <div className="text-[8px] text-brand-inactive-text">Perto de você</div>
                                       </div>
                                    </div>
                                    <div className="text-[10px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded">Em alta</div>
                                 </div>

                                 <div className="flex items-center justify-between bg-gray-50 p-2 rounded border border-gray-100">
                                    <div className="flex items-center gap-2">
                                       <div className="w-6 h-6 bg-blue-100 rounded flex items-center justify-center">
                                          <CalendarIcon size={10} className="text-blue-600" />
                                       </div>
                                       <div>
                                          <div className="text-[10px] font-bold text-brand-dark">Ache Serviços</div>
                                          <div className="text-[8px] text-brand-inactive-text">Quem faz o que você precisa</div>
                                       </div>
                                    </div>
                                    <div className="text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">14:00</div>
                                 </div>
                              </div>
                           </div>
                        )}
                        {card.type === 'finance' && (
                           <div className="bg-white w-full max-w-[240px] rounded-lg p-4 border border-gray-100">
                              <div className="flex justify-between items-center mb-4">
                                 <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Fácil de achar</span>
                                 <ChartIcon size={14} className="text-brand-inactive-text" />
                              </div>
                              <div className="flex gap-2 items-end mb-2">
                                 <div className="w-3 bg-brand-green h-8 rounded-sm"></div>
                                 <div className="w-3 bg-brand-green h-12 rounded-sm"></div>
                                 <div className="w-3 bg-gray-200 h-6 rounded-sm"></div>
                                 <div className="w-3 bg-brand-green h-16 rounded-sm"></div>
                                 <div className="w-3 bg-brand-green h-10 rounded-sm"></div>
                              </div>
                              <div className="text-right text-xs font-bold text-brand-dark">+ 100% SEU</div>
                           </div>
                        )}
                     </div>
                     <div className="pt-6">
                        <h4 className="text-xl font-bold text-brand-dark mb-2">{card.title}</h4>
                        <p className="text-brand-inactive-text text-sm leading-relaxed">{card.description}</p>
                     </div>
                  </motion.div>
               ))}
            </div>
         </div>
      </section>
   );
};

const PaymentSuite = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
   const differentials = [
      {
         title: "Para quem quer comprar",
         description: "Encontre tudo o que você precisa na sua cidade, de produtos a serviços, de forma rápida.",
         type: "commission"
      },
      {
         title: "Para quem quer vender",
         description: "Anuncie seus produtos ou serviços em minutos e apareça para quem está por perto.",
         type: "easy"
      },
      {
         title: "Tudo em um só lugar",
         description: "Uma plataforma simples para conectar quem faz e quem precisa na sua região.",
         type: "page"
      },
      {
         title: "Sem burocracia",
         description: "Nada de sistemas pesados. Foco no que realmente importa: resolver o seu dia.",
         type: "market"
      }
   ];

   return (
      <section className="py-24 bg-white relative">
         <GridLines />
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <SectionHeader
               subtitle="PARA TODOS"
               title="O que você precisa hoje?"
            />
            <p className="text-brand-inactive-text max-w-3xl mb-16 text-lg -mt-8">
               A Dudit conecta você com o que tem de melhor na sua cidade. Simples, rápido e direto.
            </p>

            <div className="grid md:grid-cols-2 gap-8">
               {differentials.map((item, idx) => (
                  <motion.div
                     key={idx}
                     initial={{ opacity: 0, y: 20 }}
                     whileInView={{ opacity: 1, y: 0 }}
                     transition={{ delay: idx * 0.1 }}
                     viewport={{ once: true }}
                     className="group"
                  >
                     {/* Visual Area */}
                     <div className="bg-brand-slate border border-gray-100 h-64 rounded-xl overflow-hidden relative p-6 flex items-center justify-center">

                        {/* 1. Sem Comissão Visual */}
                        {item.type === 'commission' && (
                           <div className="bg-white p-4 rounded-xl border border-gray-100 w-56 relative">
                              <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                                 <div className="text-xs text-brand-inactive-text">Valor da Venda</div>
                                 <div className="font-bold text-brand-dark">R$ 100,00</div>
                              </div>
                              <div className="flex justify-between items-center bg-brand-green/20 p-2 rounded-lg">
                                 <div className="text-xs font-bold text-brand-dark">Taxa Dudit</div>
                                 <div className="font-bold text-brand-dark">R$ 0,00</div>
                              </div>
                              <div className="absolute -top-3 -right-3 bg-brand-green text-white font-bold text-xs px-2 py-1 rounded">
                                 100% SEU
                              </div>
                           </div>
                        )}

                        {/* 2. Fácil de Usar Visual */}
                        {item.type === 'easy' && (
                           <div className="bg-white p-4 rounded-xl border border-gray-100 w-56">
                              <div className="flex items-center gap-3 mb-3 border-b border-gray-50 pb-3">
                                 <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                    <UserIcon size={14} className="text-blue-600" />
                                 </div>
                                 <div>
                                    <div className="text-[10px] font-bold text-brand-dark">João Silva</div>
                                    <div className="text-[8px] text-brand-inactive-text">Cliente desde 2023</div>
                                 </div>
                              </div>
                              <div className="space-y-2">
                                 <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-brand-inactive-text">Serviço:</span>
                                    <span className="font-bold text-brand-dark">Manutenção</span>
                                 </div>
                                 <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-brand-inactive-text">Data:</span>
                                    <span className="font-bold text-brand-dark">Hoje, 14:00</span>
                                 </div>
                                 <div className="flex justify-between items-center text-[10px] bg-gray-50 p-1.5 rounded">
                                    <span className="text-brand-inactive-text">Status:</span>
                                    <span className="font-bold text-brand-green">Agendado</span>
                                 </div>
                              </div>
                           </div>
                        )}

                        {/* 3. Página Online Visual */}
                        {item.type === 'page' && (
                           <div className="bg-white border border-gray-200 w-56 h-48 rounded-t-xl overflow-hidden flex flex-col relative top-6">
                              <div className="bg-gray-50 border-b border-gray-100 p-2 flex items-center gap-1">
                                 <div className="w-2 h-2 rounded-full bg-red-300"></div>
                                 <div className="w-2 h-2 rounded-full bg-yellow-300"></div>
                                 <div className="w-2 h-2 rounded-full bg-green-300"></div>
                                 <div className="mx-auto bg-white border border-gray-200 rounded px-2 py-0.5 text-[8px] text-brand-inactive-text">vitrine.dudit.com/sualoja</div>
                              </div>
                              <div className="p-3 space-y-3">
                                 <div className="flex gap-2">
                                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                                       <BoxIcon size={14} className="text-brand-inactive-text" />
                                    </div>
                                    <div className="flex-1">
                                       <div className="h-2 w-16 bg-gray-200 rounded mb-1"></div>
                                       <div className="h-2 w-10 bg-brand-green/50 rounded"></div>
                                    </div>
                                    <div className="text-[10px] font-bold text-brand-dark">R$ 50</div>
                                 </div>
                                 <div className="flex gap-2">
                                    <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                                       <CalendarIcon size={14} className="text-blue-400" />
                                    </div>
                                    <div className="flex-1">
                                       <div className="h-2 w-20 bg-gray-200 rounded mb-1"></div>
                                       <div className="h-2 w-12 bg-blue-200 rounded"></div>
                                    </div>
                                    <div className="text-[10px] font-bold text-brand-dark">R$ 120</div>
                                 </div>
                              </div>
                           </div>
                        )}

                        {/* 4. Local Visual */}
                        {item.type === 'market' && (
                           <div className="bg-white p-4 rounded-xl border border-gray-100 w-56">
                              <div className="flex justify-between items-center mb-3">
                                 <div className="text-[10px] font-bold text-brand-inactive-text uppercase">Locações</div>
                                 <div className="bg-gray-100 text-brand-inactive-text px-2 py-0.5 rounded text-[8px]">Esta semana</div>
                              </div>
                              <div className="space-y-2">
                                 <div className="relative h-8 bg-gray-50 rounded border border-gray-100 overflow-hidden">
                                    <div className="absolute top-0 bottom-0 left-0 w-1/3 bg-gray-200 border-r border-white"></div>
                                    <div className="absolute top-0 bottom-0 left-1/3 w-1/2 bg-brand-green/40 border-r border-white flex items-center px-2">
                                       <span className="text-[8px] font-bold text-brand-dark">Alugado (João)</span>
                                    </div>
                                 </div>
                                 <div className="relative h-8 bg-gray-50 rounded border border-gray-100 overflow-hidden">
                                    <div className="absolute top-0 bottom-0 left-0 w-1/4 bg-blue-200 border-r border-white flex items-center px-2">
                                       <span className="text-[8px] font-bold text-blue-800">Manutenção</span>
                                    </div>
                                    <div className="absolute top-0 bottom-0 left-1/4 w-3/4 bg-gray-200"></div>
                                 </div>
                              </div>
                           </div>
                        )}

                     </div>

                     {/* Text Area */}
                     <div className="pt-6">
                        <h4 className="text-xl font-bold text-brand-dark mb-2">{item.title}</h4>
                        <p className="text-brand-inactive-text text-sm leading-relaxed">{item.description}</p>
                     </div>
                  </motion.div>
               ))}
            </div>
         </div>
      </section>
   )
}

const GlobalScale = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
   return (
      <section className="py-24 bg-white relative">
         <GridLines />
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            {/* Main Rounded Card Container */}
            <div className="flex flex-col lg:flex-row min-h-[600px] rounded-3xl overflow-hidden">

               {/* Left Side - Dark */}
               <div className="flex-1 bg-brand-dark p-12 lg:p-16 flex flex-col justify-center relative z-10">
                  {/* Internal grid lines for the dark area */}
                  <div className="absolute inset-0 pointer-events-none z-0 flex justify-center w-full h-full opacity-20">
                     <div className="w-px h-full bg-white/10 mx-auto hidden md:block" />
                     <div className="w-px h-full bg-white/10 mx-auto hidden md:block" />
                     <div className="w-px h-full bg-white/10 mx-auto hidden md:block" />
                  </div>

                  <div className="relative z-10 text-white">
                     <span className="text-brand-green text-xs uppercase tracking-widest font-bold mb-4 block">SUA VENDA, SEU LUCRO.</span>
                     <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">Você vende. <br />Você recebe. <br />100% seu.</h2>
                     <p className="text-brand-inactive-text text-lg mb-12 max-w-md leading-relaxed">
                        Enquanto outros marketplaces ficam com uma fatia da sua venda, na Dudit você recebe o valor integral. Você escolhe como quer receber e como enviar. A venda é 100% sua.
                     </p>

                     <div className="flex gap-12 pt-8">
                        <div>
                           <div className="text-3xl font-bold text-brand-green mb-1">0%</div>
                           <div className="text-brand-inactive-text text-xs">de comissão por venda</div>
                        </div>
                        <div>
                           <div className="text-3xl font-bold text-brand-green mb-1">100%</div>
                           <div className="text-brand-inactive-text text-xs">do lucro fica com você</div>
                        </div>
                     </div>
                  </div>
               </div>

               {/* Right Side - Lime */}
               <div className="flex-1 bg-brand-green relative overflow-hidden flex items-center justify-center p-12">
                  {/* Decorative Rings */}
                  <div className="absolute inset-0 pointer-events-none">
                     <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] border border-white/20 rounded-full opacity-30"></div>
                     <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] border border-white/20 rounded-full opacity-30"></div>
                  </div>

                  <div className="relative z-10 w-full h-full min-h-[400px]">
                     {/* Loja Local 1 */}
                     <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        whileInView={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.1, duration: 0.5 }}
                        viewport={{ once: true }}
                        className="absolute top-[10%] left-0 lg:left-[5%] bg-white rounded-2xl p-4 pr-8 flex items-center gap-4 max-w-[280px]"
                     >
                        <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center shrink-0">
                           <StoreIcon size={20} className="text-brand-inactive-text" />
                        </div>
                        <div className="flex-1">
                           <p className="text-xs text-brand-inactive-text"><span className="font-bold text-brand-dark">Oficina do Seu Manoel</span> vendeu</p>
                           <p className="text-sm text-brand-dark font-bold mt-0.5">Troca de Óleo</p>
                        </div>
                        <div className="text-brand-green font-bold text-sm">R$ 180,00</div>
                     </motion.div>

                     {/* Loja Local 2 */}
                     <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        whileInView={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.3, duration: 0.5 }}
                        viewport={{ once: true }}
                        className="absolute top-[40%] right-0 lg:right-[5%] bg-white rounded-2xl p-4 pr-8 flex items-center gap-4 max-w-[320px]"
                     >
                        <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center shrink-0">
                           <UserIcon size={20} className="text-brand-inactive-text" />
                        </div>
                        <div className="flex-1">
                           <p className="text-xs text-brand-inactive-text"><span className="font-bold text-brand-dark">Ana Bolos</span> agendou</p>
                           <p className="text-sm text-brand-dark font-bold mt-0.5">Bolo de Festa</p>
                        </div>
                        <div className="text-brand-green font-bold text-sm">R$ 120,00</div>
                     </motion.div>

                     {/* Loja Local 3 */}
                     <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        whileInView={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.5, duration: 0.5 }}
                        viewport={{ once: true }}
                        className="absolute bottom-[10%] left-0 lg:left-[10%] bg-white rounded-2xl p-4 pr-8 flex items-center gap-4 max-w-[280px]"
                     >
                        <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center shrink-0">
                           <ShoppingBagIcon size={20} className="text-brand-inactive-text" />
                        </div>
                        <div className="flex-1">
                           <p className="text-xs text-brand-inactive-text"><span className="font-bold text-brand-dark">Loja de Roupas</span> vendeu</p>
                           <p className="text-sm text-brand-dark font-bold mt-0.5">Camiseta Branca</p>
                        </div>
                        <div className="text-brand-green font-bold text-sm">R$ 59,90</div>
                     </motion.div>

                  </div>
               </div>
            </div>
         </div>
      </section>
   )
}

const UseCases = () => {
   const cases = [
      {
         text: "Pessoas encontrando produtos únicos da sua região em poucos segundos.",
         type: "Achados Locais",
         icon: ShoppingBagIcon
      },
      {
         text: "Serviços de confiança agendados diretamente, sem complicação.",
         type: "Serviços Rápidos",
         icon: WrenchIcon
      },
      {
         text: "Negócios locais aparecendo para toda a cidade de forma gratuita.",
         type: "Divulgação Grátis",
         icon: StoreIcon
      }
   ];

   return (
      <section className="py-24 bg-white relative">
         <GridLines />
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <SectionHeader subtitle="FEITO PARA O SEU DIA A DIA" title="Como a Dudit transforma negócios" />

            <div className="grid md:grid-cols-3 gap-8">
               {cases.map((item, idx) => (
                  <motion.div
                     key={idx}
                     initial={{ opacity: 0, y: 20 }}
                     whileInView={{ opacity: 1, y: 0 }}
                     viewport={{ once: true }}
                     transition={{ delay: idx * 0.1 }}
                     className="bg-white border border-gray-100 p-8 rounded-2xl hover:border-brand-green/50 transition-colors"
                  >
                     <div className="w-12 h-12 bg-brand-green/20 rounded-full flex items-center justify-center mb-6">
                        <item.icon className="w-6 h-6 text-brand-dark" />
                     </div>
                     <p className="text-brand-dark text-lg font-medium mb-8 leading-relaxed">"{item.text}"</p>
                     <div className="text-sm font-bold text-brand-dark uppercase tracking-wider">{item.type}</div>
                  </motion.div>
               ))}
            </div>
         </div>
      </section>
   )
}


export const HomePage = () => {
   const [activePage, setActivePage] = useState('home');
   const router = useRouter();

   const onNavigate = (page: string) => {
      if (page === 'home') {
         setActivePage('home');
         window.scrollTo(0, 0);
      }
      else if (page === 'explore') router.push('/explorar');
      else if (page === 'segments') router.push('/institucional/segmentos');
      else if (page === 'pricing') router.push('/institucional/planos');
      else if (page === 'terms') router.push('/institucional/termos');
      else if (page === 'privacidade') router.push('/institucional/privacidade');
      else if (page === 'start-selling') router.push('/erp/switch');
      else {
         setActivePage(page);
         window.scrollTo(0, 0);
      }
   };

   return (
      <div className="min-h-screen bg-white">
         <Navbar onNavigate={onNavigate} />
         <main>
            {activePage === 'home' && (
               <>
                  <Hero onNavigate={onNavigate} />
                  <Solutions onNavigate={onNavigate} />
                  <BentoFeatures onNavigate={onNavigate} />
                  <PaymentSuite onNavigate={onNavigate} />
                  <GlobalScale onNavigate={onNavigate} />
                  <UseCases />
                  <CTA onNavigate={onNavigate} />
               </>
            )}
            {activePage !== 'home' && (
               <div className="pt-40 pb-20 text-center">
                  <h2 className="text-4xl font-bold text-brand-dark">Página {activePage} em desenvolvimento</h2>
                  <Button className="mt-8" onClick={() => setActivePage('home')}>Voltar para Home</Button>
               </div>
            )}
         </main>
         <Footer onNavigate={onNavigate} />
      </div>
   );
};

export default HomePage;
