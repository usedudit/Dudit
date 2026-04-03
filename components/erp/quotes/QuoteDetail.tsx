"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ChevronLeftIcon, 
  MoreHorizontalIcon, 
  PrinterIcon, 
  ShareIcon, 
  MailIcon, 
  PhoneIcon, 
  ClockIcon,
  CheckCircle2,
  FileIcon,
  XCircle,
  AlertTriangleIcon,
  ArrowRightIcon,
  UploadIcon,
  EditIcon,
  ChevronDownIcon,
  ThreeDotsIcon
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Badge, Dropdown, DropdownItem, ThreeDotsLoader } from '@/components/reusable';
import CustomerCard from '@/components/reusable/CustomerCard';
import { getQuoteDetailsAction, updateQuoteStatusAction } from '@/app/actions/erp/quotes';
import { useToast } from '@/hooks/use-toast';
import { useSidebar } from "@/lib/sidebar-context";

interface QuoteDetailProps {
  quoteId: string;
  partnerId: string;
  onBack: () => void;
}

const QuoteDetail = ({ quoteId, partnerId, onBack }: QuoteDetailProps) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { setHeaderOverride } = useSidebar();

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
        setIsScrolled(scrollContainerRef.current.scrollTop > 5);
    }
  }, []);

  useEffect(() => {
    async function load() {
      const res = await getQuoteDetailsAction(quoteId, partnerId);
      if (res.success) {
        setQuote(res.data);
      } else {
        toast({ title: "Erro", description: res.error, variant: "destructive" });
        onBack();
      }
      setLoading(false);
    }
    load();
  }, [quoteId, partnerId, toast, onBack]);

  const handleStatusChange = async (newStatus: any) => {
      const res = await updateQuoteStatusAction({ quoteId, partnerId, status: newStatus });
      if (res.success) {
          setQuote((prev: any) => ({ ...prev, status: newStatus }));
          toast({ title: "Sucesso", description: "Status atualizado!" });
      } else {
          toast({ title: "Erro", description: res.error, variant: "destructive" });
      }
  };

  const getStatusInfo = (s: string) => {
      switch(s) {
          case 'sent': return { label: 'Enviado', variant: 'blue' as const, icon: <UploadIcon size={12} />, color: 'bg-blue-500' };
          case 'approved': return { label: 'Aprovado', variant: 'green' as const, icon: <CheckCircle2 size={12} />, color: 'bg-green-500' };
          case 'rejected': return { label: 'Rejeitado', variant: 'red' as const, icon: <XCircle size={12} />, color: 'bg-red-500' };
          case 'expired': return { label: 'Expirado', variant: 'orange' as const, icon: <AlertTriangleIcon size={12} />, color: 'bg-orange-500' };
          case 'draft': return { label: 'Rascunho', variant: 'gray' as const, icon: <FileIcon size={12} />, color: 'bg-gray-400' };
          default: return { label: s, variant: 'gray' as const, icon: <FileIcon size={12} />, color: 'bg-gray-400' };
      }
  };

  const pageTitle = quote ? `Orçamento ${quote.quote_number || `#${quote.id.substring(0, 8)}`}` : "Carregando Orçamento...";

  useEffect(() => {
    setHeaderOverride({
        title: pageTitle,
        onBack: onBack,
        isSubPage: true
    });
    return () => setHeaderOverride(null);
  }, [pageTitle, onBack, setHeaderOverride]);

  if (loading) return <div className="h-full flex items-center justify-center bg-white dark:bg-dark-surface"><ThreeDotsLoader /></div>;
  if (!quote) return null;

  const statusInfo = getStatusInfo(quote.status);
  const subtotal = Number(quote.subtotal || 0);
  const discount = Number(quote.discount_value || 0);
  const shipping = Number(quote.shipping_cost || 0);
  const additional = Number(quote.additional_costs || 0);
  const total = Number(quote.total || 0);

  const formattedIssueDate = quote.issue_date 
    ? new Date(quote.issue_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
    
  const formattedExpiryDate = quote.expiration_date 
    ? new Date(quote.expiration_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  return (
    <div className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300 relative">
        <div 
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto no-scrollbar scroll-smooth"
        >
            {/* STICKY HEADER - MATCHING ADDPRODUCTPAGE */}
            <div className={`sticky top-0 z-40 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out`}>
                <div className="max-w-[1300px] mx-auto px-4 md:px-6 md:pt-4 relative">
                    
                    {/* Back Button - Desktop Only */}
                    <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                        <Button variant="ghost" size="icon" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center bg-brand-gray dark:bg-dark-border">
                            <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                        </Button>
                    </div>

                    {/* Title Row */}
                    <div className="hidden md:flex items-start justify-between md:py-0 md:mb-4">
                        <div className="flex flex-col gap-1 overflow-hidden min-w-0 text-left">
                            <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                <span className="truncate">{pageTitle}</span>
                                <Badge variant={statusInfo.variant} icon={statusInfo.icon} className="h-fit py-0.5">
                                    {statusInfo.label}
                                </Badge>
                            </h1>
                            <div className={`text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                Criado em {formattedIssueDate} • Válido até {formattedExpiryDate}
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="hidden md:flex items-center gap-3 flex-shrink-0 ml-3">
                            <Button variant="outline" size="icon" className="w-10 h-10 p-0 flex items-center justify-center bg-transparent">
                                <PrinterIcon className="w-5 h-5" />
                            </Button>
                            <Button variant="outline" size="icon" className="w-10 h-10 p-0 flex items-center justify-center bg-transparent">
                                <ShareIcon className="w-5 h-5" />
                            </Button>
                            <Dropdown
                                align="right"
                                showChevron={false}
                                trigger={
                                    <Button variant="outline" size="icon" className="w-10 h-10 p-0 flex items-center justify-center bg-transparent">
                                        <ThreeDotsIcon className="w-5 h-5" />
                                    </Button>
                                }
                            >
                                <DropdownItem onClick={() => {}}>Imprimir PDF</DropdownItem>
                                <DropdownItem onClick={() => {}}>Enviar por E-mail</DropdownItem>
                                <DropdownItem onClick={() => {}}>Compartilhar Link</DropdownItem>
                                <DropdownItem onClick={() => {}} className="text-brand-red">Excluir Orçamento</DropdownItem>
                            </Dropdown>
                        </div>
                    </div>

                    {/* Mobile Title - Centered or dynamic */}
                    <div className="md:hidden flex items-center justify-between py-4">
                         <h1 className="text-xl font-bold text-brand-dark dark:text-dark-heading truncate pr-4">
                             {pageTitle}
                         </h1>
                         <Badge variant={statusInfo.variant} icon={statusInfo.icon}>
                             {statusInfo.label}
                         </Badge>
                    </div>
                </div>
            </div>

            {/* CONTENT */}
            <div className="max-w-[1300px] mx-auto p-4 md:p-6 pt-6">
                <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                    
                    {/* LEFT COLUMN - MAIN INFO */}
                    <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-10">
                        
                        {/* Quote Status Card */}
                        <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden mb-8">
                             <div className={`p-6 border-b text-left ${
                                 quote.status === 'approved' ? 'bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-900/20' : 
                                 quote.status === 'rejected' ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/20' :
                                 'bg-[#eff6ff] dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/30'
                             }`}>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className={`font-bold text-lg mb-1 ${
                                            quote.status === 'approved' ? 'text-green-900 dark:text-green-100' :
                                            quote.status === 'rejected' ? 'text-red-900 dark:text-red-100' :
                                            'text-blue-900 dark:text-blue-100'
                                        }`}>
                                            {quote.status === 'approved' ? 'Orçamento Aprovado' : 
                                             quote.status === 'rejected' ? 'Orçamento Recusado' : 
                                             quote.status === 'draft' ? 'Aguardando Revisão' :
                                             'Aguardando Aprovação'}
                                        </h3>
                                        <p className={`text-sm ${
                                            quote.status === 'approved' ? 'text-green-700 dark:text-green-300' :
                                            quote.status === 'rejected' ? 'text-red-700 dark:text-red-300' :
                                            'text-blue-700 dark:text-blue-300'
                                        }`}>
                                            {quote.status === 'approved' ? 'Esta proposta foi aprovada e já pode ser convertida em pedido.' : 
                                             quote.status === 'rejected' ? 'Esta proposta foi recusada pelo cliente.' :
                                             'Esta proposta foi enviada ao cliente e aguarda resposta.'}
                                        </p>
                                    </div>
                                    {quote.status !== 'rejected' && quote.status !== 'approved' && (
                                        <Button 
                                            variant="default" 
                                            className="bg-blue-600 hover:bg-blue-700 text-white border-none h-[38px] text-xs px-6"
                                        >
                                            Converter em Pedido <ArrowRightIcon size={14} className="ml-1" />
                                        </Button>
                                    )}
                                </div>
                             </div>
                             
                             <div className="bg-white dark:bg-dark-surface p-6">
                                  <div className="flex items-center justify-between text-sm">
                                      <div className="flex flex-col items-center gap-2">
                                          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white"><CheckCircle2 size={16} /></div>
                                          <span className="font-bold text-brand-dark dark:text-dark-heading text-[13px]">Criado</span>
                                          <span className="text-xs text-brand-inactive-text font-medium">{formattedIssueDate}</span>
                                      </div>
                                      <div className={`flex-1 h-0.5 mx-2 mb-6 ${quote.status !== 'draft' ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`}></div>
                                      <div className="flex flex-col items-center gap-2">
                                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${quote.status !== 'draft' ? 'bg-green-500 text-white' : 'border-2 border-gray-300 dark:border-gray-600 text-gray-400'}`}>
                                              <UploadIcon size={16} />
                                          </div>
                                          <span className={`text-[13px] ${quote.status !== 'draft' ? 'font-bold text-brand-dark dark:text-dark-heading' : 'font-medium text-gray-500'}`}>Enviado</span>
                                          <span className="text-xs text-brand-inactive-text font-medium">{quote.status !== 'draft' ? formattedIssueDate : '—'}</span>
                                      </div>
                                      <div className={`flex-1 h-0.5 mx-2 mb-6 ${quote.status === 'approved' ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`}></div>
                                      <div className="flex flex-col items-center gap-2">
                                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                                quote.status === 'approved' ? 'bg-green-500 text-white' : 
                                                quote.status === 'rejected' ? 'bg-red-500 text-white' : 
                                                'border-2 border-gray-300 dark:border-gray-600 text-gray-400'
                                          }`}>
                                              {quote.status === 'approved' ? <CheckCircle2 size={16} /> : 
                                               quote.status === 'rejected' ? <XCircle size={16} /> : 
                                               <ClockIcon size={16} />}
                                          </div>
                                          <span className={`text-[13px] ${(quote.status === 'approved' || quote.status === 'rejected') ? 'font-bold text-brand-dark dark:text-dark-heading' : 'font-medium text-gray-500'}`}>
                                              {quote.status === 'rejected' ? 'Recusado' : 'Aprovação'}
                                          </span>
                                          <span className="text-xs text-brand-inactive-text font-medium">—</span>
                                      </div>
                                  </div>
                             </div>
                        </div>

                        {/* Items List */}
                        <div className="mb-8">
                            <div className="flex items-center justify-between mb-4 border-b border-brand-border dark:border-dark-border pb-3">
                                <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading">Itens da Proposta</h3>
                            </div>

                            <div className="space-y-0">
                                {quote.items?.map((item: any) => (
                                    <QuoteItem 
                                        key={item.id}
                                        image={item.products?.images?.[0] || "https://img.dudit.com.br/static/Placeholder.png"}
                                        name={item.custom_name || item.products?.name || "Produto sem nome"}
                                        sku={item.products?.sku || "N/A"}
                                        qty={item.quantity}
                                        price={Number(item.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        total={Number(item.quantity * item.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Financial Summary */}
                        <div className="flex justify-end pr-2">
                            <div className="w-full max-w-xs space-y-3">
                                <div className="flex justify-between items-center text-sm font-medium">
                                    <span className="text-brand-inactive-text dark:text-dark-body text-left">Subtotal</span>
                                    <span className="text-brand-dark dark:text-dark-heading font-bold">R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm font-medium">
                                    <span className="text-brand-inactive-text dark:text-dark-body text-left">Desconto</span>
                                    <span className="text-brand-dark dark:text-dark-heading">R$ {discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm font-medium">
                                    <span className="text-brand-inactive-text dark:text-dark-body text-left">Frete</span>
                                    <span className="text-brand-dark dark:text-dark-heading">R$ {shipping.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm font-medium">
                                    <span className="text-brand-inactive-text dark:text-dark-body text-left">Outros Custos</span>
                                    <span className="text-brand-dark dark:text-dark-heading">R$ {additional.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center pt-4 border-t border-brand-border dark:border-dark-border mt-2">
                                    <span className="font-bold text-[18px] text-brand-dark dark:text-dark-heading text-left tracking-tight">Total</span>
                                    <span className="font-bold text-[22px] text-brand-dark dark:text-dark-heading tracking-tight">R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN - SIDEBAR */}
                    <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-10 border-l-0 xl:border-l border-brand-border dark:border-dark-border mt-8 xl:mt-0 space-y-6">
                        
                         {/* Status Management Card */}
                         <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 relative overflow-hidden transition-colors text-left">
                             <div className="absolute top-0 left-0 w-full h-1 bg-brand-green dark:bg-brand-green/30"></div>
                             <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading mb-4 mt-1">Status do Orçamento</h3>
                             <div className="flex flex-col gap-1.5">
                                <Dropdown 
                                    width="w-full"
                                    trigger={
                                        <button className="flex items-center justify-between w-full h-[42px] px-3 bg-brand-gray dark:bg-dark-border/50 border border-brand-border dark:border-dark-border rounded-lg text-sm font-semibold text-brand-dark dark:text-dark-heading focus:outline-none focus:ring-1 focus:ring-brand-border transition-all">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2.5 h-2.5 rounded-full ${statusInfo.color}`}></div>
                                                {statusInfo.label}
                                            </div>
                                            <ChevronDownIcon size={16} className="text-brand-inactive-text" />
                                        </button>
                                    }
                                >
                                    {[
                                        { val: 'draft', label: 'Rascunho', color: 'bg-gray-400' },
                                        { val: 'sent', label: 'Enviado', color: 'bg-blue-500' },
                                        { val: 'approved', label: 'Aprovado', color: 'bg-green-500' },
                                        { val: 'rejected', label: 'Rejeitado', color: 'bg-red-500' }
                                    ].map(opt => (
                                        <DropdownItem key={opt.val} onClick={() => handleStatusChange(opt.val as any)}>
                                            <div className="flex items-center gap-2 font-medium">
                                                <div className={`w-2 h-2 rounded-full ${opt.color}`}></div>
                                                {opt.label}
                                            </div>
                                        </DropdownItem>
                                    ))}
                                </Dropdown>
                            </div>
                         </div>

                         {/* Customer Card Reusable Component */}
                         <CustomerCard 
                            customer={quote.customers}
                            address={null} // Address mapping would go here if available in DB
                         />

                         {/* Terms/Notes Card */}
                         <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 text-left relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-brand-gray dark:bg-dark-border"></div>
                            <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading mb-3 mt-1">Observações da Proposta</h3>
                            <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body leading-relaxed whitespace-pre-wrap">
                                {quote.notes || "Nenhuma observação ou termo adicional vinculado a este orçamento."}
                            </p>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

const QuoteItem = ({ image, name, sku, qty, price, total }: any) => (
    <div className="flex items-start gap-4 py-4 border-b border-brand-border dark:border-dark-border last:border-0 hover:bg-brand-gray/20 transition-colors px-2 rounded-xl text-left group">
        <div className="w-16 h-16 rounded-xl bg-brand-gray/50 dark:bg-gray-800 border border-brand-border dark:border-dark-border overflow-hidden flex-shrink-0 flex items-center justify-center p-1">
            <img 
                src={image} 
                className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal rounded-lg transition-transform group-hover:scale-105" 
                alt={name} 
                onError={(e: any) => { e.target.src = "https://img.dudit.com.br/static/Placeholder.png" }}
            />
        </div>
        <div className="flex-1 min-w-0">
             <div className="flex justify-between items-start mb-1 gap-2">
                 <h4 className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate">{name}</h4>
                 <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading whitespace-nowrap">R$ {total}</span>
             </div>
             <div className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body mb-2 tracking-wider">{sku}</div>
             <div className="flex items-center gap-2 text-[11px] text-brand-inactive-text dark:text-dark-body font-bold">
                 <span>{qty} un. • R$ {price} / un.</span>
             </div>
        </div>
    </div>
);

export default QuoteDetail;
