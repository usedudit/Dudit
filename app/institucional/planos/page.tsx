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
                  Simples e Transparente
               </h1>

               <p className="text-brand-inactive-text text-lg max-w-2xl mx-auto">
                  Escolha o plano ideal para o momento do seu negócio. Comece grátis e evolua conforme cresce.
               </p>
            </motion.div>
         </div>
      </section>
   )
}

const PricingCards = () => {
   const plans = [
      {
         name: "Grátis",
         price: "0",
         objective: "ativação + marketplace + hábito",
         features: [
            "Vitrine digital pública",
            "Produtos e serviços",
            "Estoque básico",
            "Agendamentos",
            "Orçamentos",
            "Pedidos simples",
            "PDV básico",
            "Clientes",
            "QR Code",
            "WhatsApp integrado"
         ],
         limits: [
            "Até 15 itens",
            "Até 2 imagens por item",
            "Até 20 pedidos e agendamentos/mês",
            "Até 5 orçamentos/mês",
            "1 usuário"
         ],
         variant: "outline" as const,
         popular: false
      },
      {
         name: "Vendedor",
         price: "19,90",
         objective: "primeiro dinheiro da Dudit",
         popular: true,
         features: [
            "Tudo do Grátis +",
            "Pagamento online (Mercado Pago)",
            "Pedidos pelo sistema",
            "Variantes de produtos",
            "Cupons",
            "Frete local configurável",
            "Fornecedores",
            "Importação XML",
            "Financeiro básico",
            "Relatórios básicos"
         ],
         limits: [
            "Até 100 itens",
            "Até 5 imagens por item",
            "Até 150 pedidos e agendamentos/mês",
            "Até 30 orçamentos/mês",
            "Até 3 usuários"
         ],
         variant: "default" as const
      },
      {
         name: "Comerciante",
         price: "49,90",
         objective: "operação estruturada",
         features: [
            "Tudo do Vendedor +",
            "Frete nacional (Superfrete)",
            "Expedição e entregas completas",
            "Financeiro completo (fluxo + DRE Simples)",
            "Relatórios avançados",
            "Ordem de serviço",
            "Devoluções e trocas",
            "Kits de produtos",
            "Campanhas promocionais"
         ],
         limits: [
            "Itens ilimitados",
            "Até 8 imagens por item",
            "Pedidos ilimitados",
            "Agendamentos ilimitados",
            "Orçamentos ilimitados",
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
                        <p className={`text-[10px] font-bold uppercase tracking-widest mb-6 ${plan.popular ? 'text-brand-green' : 'text-brand-green'}`}>
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

                        {/* Seção de Limites */}
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
                        </div>
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
         title: "Vendas & Pedidos",
         items: [
            { name: "Pedidos pelo sistema", g: "check", v: "check", c: "check" },
            { name: "Pagamento online (Mercado Pago)", g: "x", v: "check", c: "check" },
            { name: "PDV (frente de caixa)", g: "Básico", v: "Completo", c: "Completo" },
            { name: "Checkout no marketplace", g: "x", v: "check", c: "check" },
            { name: "Cupons de desconto", g: "x", v: "check", c: "check" },
            { name: "Pedidos/mês", g: "20", v: "150", c: "Ilimitado" },
         ]
      },
      {
         title: "Produtos & Estoque",
         items: [
            { name: "Cadastro de produtos", g: "check", v: "check", c: "check" },
            { name: "Controle de estoque", g: "check", v: "check", c: "check" },
            { name: "Variantes de produtos", g: "x", v: "check", c: "check" },
            { name: "Importação XML", g: "x", v: "check", c: "check" },
            { name: "Kits de produtos", g: "x", v: "x", c: "check" },
            { name: "Itens (produtos + serviços)", g: "15", v: "100", c: "500" },
            { name: "Imagens por item", g: "3", v: "6", c: "9" },
         ]
      },
      {
         title: "Serviços & Agendamentos",
         items: [
            { name: "Cadastro de serviços", g: "check", v: "check", c: "check" },
            { name: "Agendamentos online", g: "check", v: "check", c: "check" },
            { name: "Ordem de serviço", g: "x", v: "x", c: "check" },
            { name: "Agendamentos/mês", g: "20", v: "150", c: "Ilimitado" },
         ]
      },
      {
         title: "Entrega & Logística",
         items: [
            { name: "Frete local", g: "Manual", v: "Configurável", c: "Completo" },
            { name: "Frete nacional", g: "x", v: "x", c: "check" },
            { name: "Expedição e entregas", g: "x", v: "x", c: "check" },
         ]
      },
      {
         title: "Financeiro & Gestão",
         items: [
            { name: "Financeiro básico", g: "x", v: "check", c: "check" },
            { name: "Financeiro completo", g: "x", v: "x", c: "check" },
            { name: "Fluxo de caixa", g: "x", v: "x", c: "check" },
            { name: "DRE Simples", g: "x", v: "x", c: "check" },
            { name: "Fornecedores", g: "x", v: "check", c: "check" },
         ]
      },
      {
         title: "Relatórios",
         items: [
            { name: "Relatórios básicos", g: "x", v: "check", c: "check" },
            { name: "Relatórios avançados", g: "x", v: "x", c: "check" },
         ]
      },
      {
         title: "Equipe",
         items: [
            { name: "Usuários", g: "1", v: "3", c: "5" },
            { name: "Permissões de acesso", g: "x", v: "check", c: "check" },
         ]
      },
      {
         title: "Marketplace & Vitrine",
         items: [
            { name: "Vitrine pública", g: "check", v: "check", c: "check" },
            { name: "QR Code da loja", g: "check", v: "check", c: "check" },
            { name: "WhatsApp integrado", g: "check", v: "check", c: "check" },
            { name: "Clientes", g: "check", v: "check", c: "check" },
         ]
      },
      {
         title: "Marketing",
         items: [
            { name: "Cupons", g: "x", v: "check", c: "check" },
            { name: "Campanhas promocionais", g: "x", v: "x", c: "check" },
         ]
      },
      {
         title: "Orçamentos",
         items: [
            { name: "Criação de orçamentos", g: "check", v: "check", c: "check" },
            { name: "Orçamentos/mês", g: "5", v: "30", c: "Ilimitado" },
         ]
      },
      {
         title: "Operação",
         items: [
            { name: "Devoluções e trocas", g: "x", v: "x", c: "check" },
         ]
      }
   ];

   const [openCategory, setOpenCategory] = useState<string | null>("Vendas & Pedidos");

   const toggle = (cat: string) => {
      setOpenCategory(openCategory === cat ? null : cat);
   };

   const renderValue = (val: string) => {
      if (val === "check") return <div className="bg-brand-green p-1 rounded-full"><CheckCircleIcon size={12} className="text-white" /></div>;
      if (val === "x") return <div className="bg-brand-gray p-1 rounded-full"><XIcon size={12} className="text-brand-inactive-text" /></div>;
      return <span className="text-sm font-medium text-brand-dark">{val}</span>;
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
               <h2 className="text-4xl font-bold text-brand-dark mb-4">Comparação Detalhada</h2>
               <p className="text-brand-inactive-text">Veja tudo o que cada plano oferece e escolha o melhor para você.</p>
            </motion.div>

            {/* Mobile Header Row */}
            <div className="md:hidden grid grid-cols-3 gap-2 mb-6 bg-white sticky top-[80px] z-20 py-4 border-b border-brand-border">
               <div className="text-center px-1">
                  <div className="font-bold text-[10px] text-brand-dark mb-1">Grátis</div>
                  <button className="bg-brand-dark text-white text-[8px] w-full py-1.5 rounded-full font-medium">Começar</button>
               </div>
               <div className="text-center px-1 bg-brand-green/5 rounded-t-lg">
                  <div className="font-bold text-[10px] text-brand-green mb-1">Vendedor</div>
                  <button className="bg-brand-green text-white text-[8px] w-full py-1.5 rounded-full font-medium">Assinar</button>
               </div>
               <div className="text-center px-1">
                  <div className="font-bold text-[10px] text-brand-dark mb-1">Comerciante</div>
                  <button className="bg-white border border-brand-border text-brand-dark text-[8px] w-full py-1.5 rounded-full font-medium">Assinar</button>
               </div>
            </div>

            {/* Desktop Header Row */}
            <div className="hidden md:grid grid-cols-4 gap-4 mb-8 px-4">
               <div className="col-span-1"></div>
               <div className="bg-white p-6 border border-brand-border rounded-2xl text-left flex flex-col h-full">
                  <h4 className="font-bold text-brand-dark mb-1">Grátis</h4>
                  <p className="text-xs text-brand-inactive-text mb-4 flex-1">Ideal para começar</p>
                  <Button variant="outline" className="w-full py-2 text-sm mt-auto h-10">Começar Grátis</Button>
               </div>
               <div className="bg-white p-6 border border-brand-green/20 rounded-2xl text-left flex flex-col h-full relative overflow-hidden ring-1 ring-brand-green/10">
                  <div className="absolute top-0 right-0 bg-brand-green text-white text-[10px] px-2 py-0.5 rounded-bl">Popular</div>
                  <h4 className="font-bold text-brand-dark mb-1">Vendedor</h4>
                  <p className="text-xs text-brand-inactive-text mb-4 flex-1">Para quem quer vender</p>
                  <Button variant="default" className="w-full py-2 text-sm mt-auto h-10 bg-brand-green text-white">Assinar Agora</Button>
               </div>
               <div className="bg-white p-6 border border-brand-border rounded-2xl text-left flex flex-col h-full">
                  <h4 className="font-bold text-brand-dark mb-1">Comerciante</h4>
                  <p className="text-xs text-brand-inactive-text mb-4 flex-1">Operação estruturada</p>
                  <Button variant="outline" className="w-full py-2 text-sm mt-auto h-10">Assinar Agora</Button>
               </div>
            </div>

            {/* Comparison Items */}
            <div className="space-y-4">
               {categories.map((cat) => (
                  <motion.div
                     key={cat.title}
                     initial={{ opacity: 0, y: 10 }}
                     whileInView={{ opacity: 1, y: 0 }}
                     viewport={{ once: true }}
                     className="border-b border-brand-border last:border-0"
                  >
                     <button
                        onClick={() => toggle(cat.title)}
                        className="w-full flex items-center justify-between py-6 px-4 hover:bg-brand-gray transition-colors rounded-xl"
                     >
                        <span className="text-lg font-bold text-brand-dark">{cat.title}</span>
                        <motion.div
                           animate={{ rotate: openCategory === cat.title ? 180 : 0 }}
                        >
                           <ChevronDownIcon size={20} className="text-brand-inactive-text" />
                        </motion.div>
                     </button>

                     <AnimatePresence>
                        {openCategory === cat.title && (
                           <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                           >
                              <div className="pb-6">
                                 {cat.items.map((item, idx) => (
                                    <div key={idx} className="flex flex-col md:grid md:grid-cols-4 gap-2 md:gap-4 py-4 px-4 border-t border-brand-gray first:border-0 md:items-center">

                                       <div className="col-span-1 text-sm text-brand-dark/80 font-medium md:mb-0 mb-2">
                                          {item.name}
                                       </div>

                                       <div className="grid grid-cols-3 md:contents gap-2">
                                          <div className="flex justify-center items-center">
                                             {renderValue(item.g)}
                                          </div>
                                          <div className="flex justify-center items-center bg-brand-green/5 md:bg-transparent py-2 md:py-0 rounded-lg">
                                             {renderValue(item.v)}
                                          </div>
                                          <div className="flex justify-center items-center">
                                             {renderValue(item.c)}
                                          </div>
                                       </div>
                                    </div>
                                 ))}
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

const FAQ = () => {
   const [openIndex, setOpenIndex] = useState<number | null>(0);

   const questions = [
      {
         q: " Dudit cobra comissão por venda?",
         a: "Não. Você paga apenas a mensalidade do plano e fica com 100% do valor das suas vendas."
      },
      {
         q: "Existe algum custo além da mensalidade?",
         a: "Não cobramos taxas adicionais. Se usar pagamento online (ex: Mercado Pago), podem existir taxas da operadora."
      },
      {
         q: "Posso começar gratuitamente?",
         a: "Sim. Você pode usar o plano gratuito pelo tempo que quiser e começar a vender sem pagar nada."
      },
      {
         q: "É difícil de usar?",
         a: "Não. A Dudit foi feita para ser simples e intuitiva, mesmo para quem nunca usou um sistema."
      },
      {
         q: "Funciona na minha cidade?",
         a: "Sim. A Dudit funciona em qualquer cidade do Brasil e mostra seus produtos para pessoas próximas."
      },
      {
         q: "Preciso ter CNPJ?",
         a: "Não. Você pode usar como pessoa física, MEI ou empresa."
      },
      {
         q: "Como eu recebo meus pagamentos?",
         a: "Você pode receber via dinheiro, PIX, cartão ou boleto. Se usar Mercado Pago, o dinheiro vai direto pra sua conta lá."
      },
      {
         q: "Posso cancelar a qualquer momento?",
         a: "Sim. Você pode cancelar quando quiser, sem multa ou fidelidade."
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
            <CTA />
         </main>
         <Footer onNavigate={onNavigate} />
      </div>
   )
}
