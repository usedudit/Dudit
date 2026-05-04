"use client";

import { useState } from 'react';
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
               <div className="inline-flex items-center gap-2 bg-brand-green/10 rounded-full px-4 py-1.5 text-xs text-brand-dark mb-8 font-bold tracking-wider">
                  <MoneyIcon size={14} className="text-brand-green" />
                  Nossos Planos
               </div>

               <h1 className="text-5xl md:text-6xl font-bold text-brand-dark leading-tight mb-6">
                  Comece a vender na sua cidade hoje
               </h1>

               <p className="text-brand-inactive-text text-lg max-w-2xl mx-auto mb-4">
                  Use a Dudit pra divulgar, vender e organizar seu negócio — sem complicação
               </p>

               <p className="text-brand-inactive-text text-sm font-medium">
                  Sem cartão • Comece grátis
               </p>
            </motion.div>
         </div>
      </section>
   )
}

const PricingCards = () => {
   const router = useRouter();

   const handleGetStarted = () => {
      router.push('/erp/switch');
   };

   const plans = [
      {
         name: "Começar",
         price: "0",
         highlight: false,
         objective: "Pra quem quer testar e começar a vender",
         cta: "Começar grátis",
         microcopy: "Sem compromisso",
         features: [
            "Cadastre seus produtos ou serviços",
            "Receba pedidos",
            "Organize o básico do seu negócio"
         ],
         variant: "outline" as const,
         popular: false
      },
      {
         name: "Crescer",
         price: "19,90",
         highlight: true,
         objective: "Pra quem já vende e quer crescer na cidade",
         cta: "Começar agora",
         microcopy: "Plano mais escolhido",
         badge: "Mais usado",
         features: [
            "Receba pedidos online",
            "Use promoções e cupons",
            "Mais controle do seu negócio"
         ],
         variant: "default" as const,
         popular: true
      },
      {
         name: "Escalar",
         price: "49,90",
         highlight: false,
         objective: "Pra quem quer mais controle e organização",
         cta: "Ver plano",
         features: [
            "Relatórios mais completos",
            "Financeiro mais avançado",
            "Mais recursos pra crescer"
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
                        ? 'bg-white border-brand-green border-2 md:scale-105 z-10 shadow-2xl'
                        : 'bg-white border-brand-border hover:border-brand-green/30 transition-all duration-300'
                        }`}
                  >
                     {plan.popular && plan.badge && (
                        <div className="absolute top-6 -right-12 bg-brand-green text-white text-xs font-bold py-1 w-40 text-center transform rotate-45">
                           {plan.badge}
                        </div>
                     )}

                     {/* Header */}
                     <div className="mb-8">
                        <h3 className={`text-xl font-bold mb-1 text-brand-dark`}>
                           {plan.name}
                        </h3>
                        <p className={`text-xs font-bold mb-6 text-brand-green`}>
                           {plan.objective}
                        </p>
                        <div className="flex items-baseline gap-1">
                           <span className={`text-sm text-brand-inactive-text`}>R$</span>
                           <span className={`text-5xl font-bold text-brand-dark`}>{plan.price}</span>
                           <span className={`text-sm text-brand-inactive-text`}>/mês</span>
                        </div>
                     </div>

                     {/* Features */}
                     <div className="space-y-6 flex-1">
                        <div>
                           <p className="text-xs font-bold uppercase mb-4 text-brand-green">
                              O que você ganha:
                           </p>
                           <ul className="space-y-4">
                              {plan.features.map((feature, i) => (
                                 <li key={i} className="flex items-start gap-3 text-sm">
                                    <CheckCircleIcon size={18} className="text-brand-green mt-0.5 shrink-0" />
                                    <span className="text-gray-600 font-medium">
                                       {feature}
                                    </span>
                                 </li>
                              ))}
                           </ul>
                        </div>
                     </div>

                     <div className="mt-10 text-center">
                        <Button
                           variant={plan.variant}
                           className={`w-full h-12 text-base font-bold ${plan.popular ? 'bg-brand-green text-white hover:bg-brand-green/90 border-0 shadow-lg shadow-brand-green/20' : ''}`}
                           onClick={handleGetStarted}
                        >
                           {plan.cta}
                        </Button>
                        {plan.microcopy && (
                           <p className="text-[10px] text-brand-inactive-text mt-2 font-medium">
                              {plan.microcopy}
                           </p>
                        )}
                     </div>
                  </motion.div>
               ))}
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

            <div className="space-y-4 max-w-3xl mx-auto">
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
      else if (page === 'start-selling') router.push('/erp/switch');
   };

   return (
      <div className="min-h-screen bg-white">
         <Navbar onNavigate={onNavigate} />
         <main>
            <PricingHero />
            <PricingCards />
            <FAQ />
            <CTA onNavigate={onNavigate} />
         </main>
         <Footer onNavigate={onNavigate} />
      </div>
   )
}

