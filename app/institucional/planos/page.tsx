"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/reusable/Button';
import {
   CheckCircleIcon,
   XIcon,
   ChevronDownIcon,
   MoneyIcon,
   ArrowRightIcon
} from '@/lib/icons';
import { GridLines, Navbar, Footer, CTA } from '../../../components/InstitucionalShared';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/reusable/Badge';

const PricingHero = () => {
   return (
      <section className="relative bg-white pt-32 pb-16 overflow-hidden flex flex-col justify-center text-center">
         <GridLines />
         <div className="flex-1 flex flex-col container mx-auto px-4 lg:px-6 max-w-[1300px] w-full">
            <motion.div
               initial={{ opacity: 0, y: 30 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ duration: 0.6 }}
            >
               <Badge icon={<MoneyIcon />} variant="green">
                  Nossos Planos
               </Badge>

               <h1 className="text-5xl md:text-6xl font-bold text-brand-dark leading-tight mb-6">
                  Venda localmente com 0% de comissão
               </h1>

               <p className="text-brand-inactive-text text-lg max-w-2xl mx-auto">
                  Crie sua vitrine online, gerencie pedidos e organize seu negócio sem taxas abusivas.
               </p>
            </motion.div>
         </div>
      </section>
   )
}

const PricingCards = () => {
   const plans = [
      {
         name: "Começar",
         price: "0",
         highlight: false,
         objective: "O básico para começar sua vitrine online.",
         features: [
            "Crie sua vitrine online e compartilhe com clientes",
            "Cadastre produtos e serviços em poucos passos",
            "Controle seu estoque básico sem planilhas",
            "Receba agendamentos e organize sua agenda",
            "Envie orçamentos de forma simples e rápida",
            "Registre pedidos e vendas no sistema",
            "Use um PDV básico para vendas presenciais",
            "Organize seus clientes em um só lugar",
            "Receba pedidos e agendamentos direto pelo WhatsApp"
         ],
         limits: [
            "Até 15 itens no catálogo",
            "Até 2 imagens por item",
            "Até 25 pedidos/mês",
            "Até 30 agendamentos/mês",
            "Até 15 ordens de serviço/mês",
            "1 usuário"
         ],
         variant: "outline" as const,
         popular: false
      },
      {
         name: "Crescer",
         price: "19,90",
         highlight: true,
         popular: true,
         objective: "Para quem quer profissionalizar as vendas.",
         features: [
            "Tudo do Começar +",
            "Receba pedidos direto pelo sistema",
            "Aceite pagamentos online automáticos (Mercado Pago)",
            "Ofereça variações de produtos (tamanho, cor, etc.)",
            "Crie cupons e promoções para aumentar suas vendas",
            "Configure entrega local de forma simples",
            "Gerencie fornecedores com mais organização",
            "Crie e gerencie ordens de serviço",
            "Controle seu financeiro sem complicação",
            "Acompanhe relatórios básicos do seu negócio",
         ],
         limits: [
            "Até 100 itens no catálogo",
            "Até 5 imagens por item",
            "Até 150 pedidos/mês",
            "Até 150 agendamentos/mês",
            "Até 100 ordens de serviço/mês",
            "Até 3 usuários"
         ],
         variant: "default" as const
      },
      {
         name: "Escalar",
         price: "49,90",
         highlight: false,
         objective: "Ferramentas avançadas para o seu negócio escalar.",
         features: [
            "Tudo do Crescer +",
            "Gerencie expedição e entregas com mais controle",
            "Tenha um financeiro completo (fluxo de caixa + DRE)",
            "Acompanhe relatórios avançados para tomar decisões",
            "Controle devoluções e trocas com facilidade",
            "Monte kits e combos de produtos",
            "Crie campanhas promocionais mais estratégicas",
         ],
         limits: [
            "Itens e Pedidos ilimitados",
            "Até 15 imagens por item",
            "Ordens de serviço ilimitadas",
            "Agendamentos ilimitados",
            "Até 10 usuários"
         ],
         variant: "outline" as const,
         popular: false
      }
   ];

   return (
      <section className="bg-white pb-24 relative">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-3 gap-8 items-stretch pt-8">
               {plans.map((plan, index) => (
                  <motion.div
                     key={plan.name}
                     initial={{ opacity: 0, y: 20 }}
                     whileInView={{ opacity: 1, y: 0 }}
                     viewport={{ once: true }}
                     transition={{ delay: index * 0.1 }}
                     className={`rounded-3xl p-8 flex flex-col h-full relative border overflow-hidden ${plan.popular
                        ? 'bg-brand-dark border-brand-dark md:-translate-y-4 shadow-xl'
                        : 'bg-white border-brand-border hover:border-brand-green/30 transition-all duration-300'
                        }`}
                  >
                     {plan.popular && (
                        <div className="absolute top-6 -right-12 bg-brand-green text-white text-xs font-bold py-1 w-40 text-center transform rotate-45">
                           Mais Popular
                        </div>
                     )}

                     {/* Header */}
                     <div className="mb-8">
                        <h3 className={`text-xl font-bold mb-1 ${plan.popular ? 'text-white' : 'text-brand-dark'}`}>
                           {plan.name}
                        </h3>
                        <p className={`text-[10px] font-bold mb-6 ${plan.popular ? 'text-brand-green' : 'text-brand-green'}`}>
                           {plan.objective}
                        </p>
                        <div className="flex items-baseline gap-1">
                           <span className={`text-sm ${plan.popular ? 'text-brand-inactive-text/80' : 'text-brand-inactive-text'}`}>R$</span>
                           <span className={`text-5xl font-bold ${plan.popular ? 'text-white' : 'text-brand-dark'}`}>{plan.price}</span>
                           <span className={`text-sm ${plan.popular ? 'text-brand-inactive-text/80' : 'text-brand-inactive-text'}`}>/mês</span>
                        </div>
                     </div>

                     {/* Features & Limits */}
                     <div className="space-y-6 flex-1">
                        <div>
                           <p className="text-xs font-bold uppercase mb-4 text-brand-green">
                              O que está incluso:
                           </p>
                           <ul className="space-y-3">
                              {plan.features.map((feature, i) => (
                                 <li key={i} className="flex items-start gap-3 text-sm">
                                    <CheckCircleIcon size={16} className="text-brand-green mt-0.5 shrink-0" />
                                    <span className={plan.popular ? 'text-gray-300' : 'text-gray-600'}>
                                       {feature}
                                    </span>
                                 </li>
                              ))}
                           </ul>
                        </div>

                        {/* Seção de Limites
                        <div className={`pt-6 border-t ${plan.popular ? 'border-white/10' : 'border-brand-border'}`}>
                           <p className={`text-xs font-bold uppercase mb-3 ${plan.popular ? 'text-gray-400' : 'text-brand-inactive-text'}`}>
                              Limites do plano:
                           </p>
                           <ul className="space-y-2">
                              {plan.limits.map((limit, i) => (
                                 <li key={i} className="flex items-center gap-2 text-xs">
                                    <div className={`w-1 h-1 rounded-full ${plan.popular ? 'bg-brand-green' : 'bg-brand-green/40'}`} />
                                    <span className={plan.popular ? 'text-brand-inactive-text' : 'text-brand-inactive-text'}>
                                       {limit}
                                    </span>
                                 </li>
                              ))}
                           </ul>
                        </div>*/}
                     </div>

                     <Button
                        variant={plan.variant}
                        className={`w-full mt-10 h-11 ${plan.popular ? 'bg-brand-green text-white hover:bg-brand-green/90 border-0' : ''}`}
                     >
                        Começar agora
                     </Button>
                  </motion.div>
               ))}
            </div>
         </div>
      </section>
   );
};

const ComparisonTable = () => {
   const categories = [
      {
         title: "Vendas",
         items: [
            { name: "Pedidos pelo sistema", g: "check", v: "check", c: "check" },
            { name: "Checkout online", g: "x", v: "check", c: "check" },
            { name: "PDV (caixa)", g: "Básico", v: "Completo", c: "Completo" },
            { name: "Pedidos/mês", g: "25", v: "150", c: "Ilimitado" },
         ]
      },
      {
         title: "Pagamentos",
         items: [
            { name: "Pagamento online", g: "x", v: "check", c: "check" },
         ]
      },
      {
         title: "Produtos",
         items: [
            { name: "Cadastro de produtos", g: "check", v: "check", c: "check" },
            { name: "Variações (tamanho, etc.)", g: "x", v: "check", c: "check" },
            { name: "Kits / combos", g: "x", v: "x", c: "check" },
            { name: "Itens no catálogo", g: "15", v: "100", c: "Ilimitado" },
            { name: "Imagens por item", g: "2", v: "5", c: "15" },
         ]
      },
      {
         title: "Serviços",
         items: [
            { name: "Agendamentos", g: "check", v: "check", c: "check" },
            { name: "Ordens de serviço", g: "check", v: "check", c: "check" },
            { name: "Agendamentos/mês", g: "30", v: "150", c: "Ilimitado" },
         ]
      },
      {
         title: "Entrega",
         items: [
            { name: "Frete local", g: "x", v: "check", c: "check" },
            { name: "Logística avançada", g: "x", v: "x", c: "check" },
         ]
      },
      {
         title: "Marketing",
         items: [
            { name: "Cupons", g: "x", v: "check", c: "check" },
            { name: "Campanhas", g: "x", v: "x", c: "check" },
         ]
      },
      {
         title: "Financeiro",
         items: [
            { name: "Controle financeiro", g: "x", v: "check", c: "check" },
            { name: "Fluxo de caixa + DRE", g: "x", v: "x", c: "check" },
         ]
      },
      {
         title: "Equipe",
         items: [
            { name: "Usuários", g: "1", v: "3", c: "10" },
         ]
      }
   ];

   const renderValue = (val: string) => {
      if (val === "check") return <CheckCircleIcon size={20} className="text-brand-green mx-auto" />;
      if (val === "x") return <XIcon size={20} className="text-brand-inactive-text/30 mx-auto" />;
      return <span className="text-sm font-semibold text-brand-dark">{val}</span>;
   };

   return (
      <section className="py-24 bg-brand-gray/30 relative">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               whileInView={{ opacity: 1, y: 0 }}
               viewport={{ once: true }}
               className="text-center mb-16"
            >
               <h2 className="text-4xl font-bold text-brand-dark mb-4">Compare os Planos</h2>
               <p className="text-brand-inactive-text">Escolha o nível de controle que seu negócio precisa hoje.</p>
            </motion.div>

            <div className="overflow-x-auto">
               <table className="w-full border-collapse">
                  <thead>
                     <tr className="border-b border-brand-border">
                        <th className="py-6 px-4 text-left bg-transparent w-1/3">
                           <span className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text">Recurso</span>
                        </th>
                        <th className="py-6 px-4 text-center bg-white/50 rounded-t-2xl">
                           <span className="text-base font-bold text-brand-dark">Começar</span>
                        </th>
                        <th className="py-6 px-4 text-center bg-brand-dark rounded-t-2xl">
                           <span className="text-base font-bold text-white">Crescer</span>
                        </th>
                        <th className="py-6 px-4 text-center bg-white/50 rounded-t-2xl">
                           <span className="text-base font-bold text-brand-dark">Escalar</span>
                        </th>
                     </tr>
                  </thead>
                  <tbody>
                     {categories.map((cat, idx) => (
                        <React.Fragment key={idx}>
                           <tr className="bg-brand-gray/50">
                              <td colSpan={4} className="py-3 px-4 text-xs font-bold text-brand-green uppercase tracking-widest">
                                 {cat.title}
                              </td>
                           </tr>
                           {cat.items.map((item, i) => (
                              <tr key={i} className="border-b border-brand-border hover:bg-white/40 transition-colors">
                                 <td className="py-4 px-4 text-sm font-medium text-gray-600">
                                    {item.name}
                                 </td>
                                 <td className="py-4 px-4 text-center">
                                    {renderValue(item.g)}
                                 </td>
                                 <td className="py-4 px-4 text-center bg-brand-dark/5">
                                    {renderValue(item.v)}
                                 </td>
                                 <td className="py-4 px-4 text-center">
                                    {renderValue(item.c)}
                                 </td>
                              </tr>
                           ))}
                        </React.Fragment>
                     ))}
                  </tbody>
               </table>
            </div>
         </div>
      </section>
   );
};

const FAQ = () => {
   const [openIndex, setOpenIndex] = useState<number | null>(0);

   const questions = [
      {
         q: "Preciso pagar pra começar?",
         a: "Não. Você pode começar no plano gratuito e usar o básico sem pagar nada."
      },
      {
         q: "Tem taxa ou comissão sobre vendas?",
         a: "Não. Você vende direto e fica com o valor das suas vendas."
      },
      {
         q: "Posso usar sem ter empresa?",
         a: "Sim. Você pode usar pra vender, divulgar serviços ou anunciar algo na sua cidade."
      },
      {
         q: "Funciona na minha cidade?",
         a: "Sim. A Dudit é feita pra funcionar em qualquer cidade."
      },
      {
         q: "Posso cancelar quando quiser?",
         a: "Sim. Sem contrato ou fidelidade."
      }
   ];

   const toggle = (i: number) => {
      setOpenIndex(openIndex === i ? null : i);
   };

   return (
      <section className="bg-white py-24 relative border-t border-brand-border">
         <GridLines />
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <motion.div
               initial={{ opacity: 0 }}
               whileInView={{ opacity: 1 }}
               viewport={{ once: true }}
               className="text-center mb-16"
            >
               <h2 className="text-4xl font-bold text-brand-dark mb-4">Dúvidas Frequentes</h2>
               <p className="text-brand-inactive-text">Tudo o que você precisa saber para começar a vender com a Dudit.</p>
            </motion.div>

            <div className="space-y-4 max-w-4xl mx-auto">
               {questions.map((item, i) => (
                  <motion.div
                     key={i}
                     initial={{ opacity: 0, y: 10 }}
                     whileInView={{ opacity: 1, y: 0 }}
                     viewport={{ once: true }}
                     transition={{ delay: i * 0.1 }}
                     className="border border-brand-border rounded-2xl overflow-hidden bg-white hover:border-brand-green/30 transition-colors"
                  >
                     <button
                        onClick={() => toggle(i)}
                        className="w-full flex items-center justify-between p-6 text-left hover:bg-brand-gray transition-colors"
                     >
                        <span className="font-semibold text-brand-dark text-lg">{item.q}</span>
                        <motion.div
                           animate={{ rotate: openIndex === i ? 180 : 0 }}
                           transition={{ duration: 0.2 }}
                        >
                           <ChevronDownIcon size={20} className="text-brand-inactive-text" />
                        </motion.div>
                     </button>
                     <AnimatePresence>
                        {openIndex === i && (
                           <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: "easeInOut" }}
                           >
                              <div className="px-6 pb-6 text-brand-inactive-text leading-relaxed">
                                 {item.a}
                              </div>
                           </motion.div>
                        )}
                     </AnimatePresence>
                  </motion.div>
               ))}
            </div>

            <div className="mt-12 text-center">
               <Button variant="outline" className="text-brand-dark hover:text-brand-green border-brand-border">
                  Ver todas as dúvidas <ArrowRightIcon size={16} />
               </Button>
            </div>
         </div>
      </section>
   )
}

export default function PricingPage() {
   const router = useRouter();

   const onNavigate = (page: string) => {
      if (page === 'home') router.push('/institucional/inicio');
      else if (page === 'segments') router.push('/institucional/segmentos');
      else if (page === 'pricing') router.push('/institucional/planos');
      else if (page === 'terms') router.push('/institucional/termos');
      else if (page === 'privacidade') router.push('/institucional/privacidade');
   };

   return (
      <div className="min-h-screen bg-white">
         <Navbar onNavigate={onNavigate} />
         <main>
            <PricingHero />
            <PricingCards />
            <ComparisonTable />
            <FAQ />
            <CTA onNavigate={onNavigate} />
         </main>
         <Footer onNavigate={onNavigate} />
      </div>
   )
}
