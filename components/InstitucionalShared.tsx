"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
   MenuIcon,
   XIcon,
   SparklesIcon,
   FacebookIcon,
   TwitterIcon,
   LinkedinIcon
} from '@/lib/icons';
import { Button } from '@/components/reusable/Button';
import Link from 'next/link';

export const GridLines = ({ dark = false }: { dark?: boolean }) => null;

interface SectionHeaderProps {
   title: string;
   subtitle?: string;
   light?: boolean;
   center?: boolean;
}

export const SectionHeader = ({ title, subtitle, light = false, center = false }: SectionHeaderProps) => (
   <div className={`mb-12 max-w-2xl ${center ? 'mx-auto text-center' : ''}`}>
      {subtitle && (
         <span className={`text-sm font-medium tracking-wider uppercase mb-4 block ${light ? 'text-brand-green' : 'text-brand-inactive-text'}`}>
            {subtitle}
         </span>
      )}
      <h2 className={`text-4xl md:text-5xl font-bold tracking-tight ${light ? 'text-white' : 'text-brand-dark'}`}>
         {title}
      </h2>
   </div>
);

export const Navbar = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
   const [mobileOpen, setMobileOpen] = useState(false);

   const handleNav = (page: string) => {
      onNavigate(page);
      setMobileOpen(false);
      window.scrollTo(0, 0);
   };

   return (
      <header className="fixed top-0 left-0 right-0 z-50 bg-brand-dark py-6 w-full h-[68px] flex items-center justify-between px-4 mx-auto gap-4">
         <div className="w-full flex items-center justify-between max-w-[1300px] mx-auto">
            <Link href="/" prefetch={false} className="cursor-pointer shrink-0 z-110 pt-1">
               <img
                  src="https://img.dudit.com.br/static/Logo.png"
                  alt="Dudit"
                  width={140}
                  height={40}
                  className="h-10 w-auto object-contain"
               />
            </Link>

            <nav className="hidden md:flex items-center gap-8 text-gray-300 font-medium text-sm">
               <button onClick={() => handleNav('home')} className="hover:text-brand-green transition-colors">Home</button>
               <button onClick={() => handleNav('about')} className="hover:text-brand-green transition-colors">Sobre</button>
               <button onClick={() => handleNav('segments')} className="hover:text-brand-green transition-colors">Segmentos</button>
               <button onClick={() => handleNav('pricing')} className="hover:text-brand-green transition-colors">Planos</button>
            </nav>

            <div className="hidden md:block">
               <Button className="py-2.5 text-sm bg-brand-green text-white hover:bg-brand-green" onClick={() => handleNav('start-selling')}>
                  Começar agora
               </Button>
            </div>

            <button className="md:hidden text-white p-1" onClick={() => setMobileOpen(!mobileOpen)}>
               <AnimatePresence mode="wait" initial={false}>
                  {mobileOpen ? (
                     <motion.div
                        key="close"
                        initial={{ rotate: -90, opacity: 0 }}
                        animate={{ rotate: 0, opacity: 1 }}
                        exit={{ rotate: 90, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                     >
                        <XIcon />
                     </motion.div>
                  ) : (
                     <motion.div
                        key="menu"
                        initial={{ rotate: 90, opacity: 0 }}
                        animate={{ rotate: 0, opacity: 1 }}
                        exit={{ rotate: -90, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                     >
                        <MenuIcon />
                     </motion.div>
                  )}
               </AnimatePresence>
            </button>
         </div>

         {/* Mobile Menu */}
         <AnimatePresence>
            {mobileOpen && (
               <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="md:hidden absolute top-full left-0 w-full bg-brand-dark border-t border-white/10 overflow-hidden"
               >
                  <div className="p-4 flex flex-col gap-4">
                     <button onClick={() => handleNav('home')} className="text-gray-300 block py-2 hover:text-brand-green text-left">Home</button>
                     <button onClick={() => handleNav('about')} className="text-gray-300 block py-2 hover:text-brand-green text-left">Sobre</button>
                     <button onClick={() => handleNav('pricing')} className="text-gray-300 block py-2 hover:text-brand-green text-left">Planos</button>
                     <Button className="w-full justify-center bg-brand-green text-white" onClick={() => handleNav('start-selling')}>Começar agora</Button>
                  </div>
               </motion.div>
            )}
         </AnimatePresence>
      </header>
   );
};

export const Footer = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
   const handleNav = (page: string) => {
      onNavigate(page);
      window.scrollTo(0, 0);
   };

   return (
      <footer className="bg-brand-dark py-16 border-t border-white/10 relative">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="flex flex-col md:flex-row justify-between gap-12 mb-16">
               <div className="md:w-1/3">
                  <div className="flex items-center gap-2 text-white font-bold text-2xl mb-6 cursor-pointer" onClick={() => handleNav('home')}>
                     <SparklesIcon className="w-8 h-8 text-white" />
                     <span>Dudit</span>
                  </div>
                  <p className="text-brand-inactive-text text-sm leading-relaxed max-w-xs">
                     A plataforma para descobrir e vender localmente. Crie sua vitrine em minutos, gerencie pedidos e organize seu negócio com 0% de comissão.
                  </p>
               </div>

               <div className="flex-1 flex flex-wrap justify-between gap-8 md:gap-16">
                  <div>
                     <h4 className="text-brand-inactive-text font-medium mb-6">Produto</h4>
                     <ul className="space-y-4 text-sm font-medium text-gray-300">
                        <li><button onClick={() => handleNav('segments')} className="hover:text-brand-green transition-colors">Segmentos</button></li>
                        <li><button onClick={() => handleNav('pricing')} className="hover:text-brand-green transition-colors">Planos</button></li>
                        <li><button onClick={() => handleNav('home')} className="hover:text-brand-green transition-colors">Vitrine Online</button></li>
                     </ul>
                  </div>
                  <div>
                     <h4 className="text-brand-inactive-text font-medium mb-6">Recursos</h4>
                     <ul className="space-y-4 text-sm font-medium text-gray-300">
                        <li><button onClick={() => handleNav('home')} className="hover:text-brand-green transition-colors">Blog</button></li>
                        <li><button onClick={() => handleNav('contact')} className="hover:text-brand-green transition-colors">Central de Ajuda</button></li>
                        <li><button onClick={() => handleNav('404')} className="hover:text-brand-green transition-colors">Página 404</button></li>
                     </ul>
                  </div>
                  <div>
                     <h4 className="text-brand-inactive-text font-medium mb-6">Sobre</h4>
                     <ul className="space-y-4 text-sm font-medium text-gray-300">
                        <li><button onClick={() => handleNav('about')} className="hover:text-brand-green transition-colors">Quem somos</button></li>
                        <li><button onClick={() => handleNav('contact')} className="hover:text-brand-green transition-colors">Fale conosco</button></li>
                     </ul>
                  </div>
               </div>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-center gap-6 border-t border-white/10 pt-8">
               <p className="text-brand-inactive-text text-sm order-1 md:order-1">
                  © 2025 Dudit. Todos os direitos reservados.
               </p>

               <div className="flex gap-4 order-2 md:order-2">
                  <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 hover:border-white/30 transition-all cursor-pointer group">
                     <LinkedinIcon className="w-4 h-4 text-brand-inactive-text group-hover:text-white" />
                  </div>
                  <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 hover:border-white/30 transition-all cursor-pointer group">
                     <TwitterIcon className="w-4 h-4 text-brand-inactive-text group-hover:text-white" />
                  </div>
                  <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 hover:border-white/30 transition-all cursor-pointer group">
                     <FacebookIcon className="w-4 h-4 text-brand-inactive-text group-hover:text-white" />
                  </div>
               </div>
            </div>
         </div>
      </footer>
   )
}

export const CTA = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
   return (
      <section className="py-24 px-4 bg-white relative">
         <GridLines />
         <div className="max-w-7xl mx-auto relative z-10">
            <div className="bg-brand-dark rounded-3xl p-16 text-center overflow-hidden relative">
               {/* Background decorative faint rings */}
               <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-white rounded-full"></div>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-white rounded-full"></div>
               </div>

               <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                  Pronto para vender <br />na sua cidade?
               </h2>
               <h3 className="text-xl md:text-2xl text-gray-300 mb-10 max-w-xl mx-auto">
                  Crie sua vitrine em minutos, receba pedidos direto no celular e mantenha 100% do seu lucro.
               </h3>

               <div className="flex flex-col sm:flex-row justify-center gap-4">
                  <Button className="bg-brand-green text-white hover:bg-brand-green font-bold h-12 px-8" onClick={() => onNavigate('start-selling')}>Começar grátis</Button>
               </div>
            </div>
         </div>
      </section>
   )
}
