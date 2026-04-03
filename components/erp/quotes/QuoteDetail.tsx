"use client";

import React, { useState, useEffect } from 'react';
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
  MapPin
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Badge, Dropdown, DropdownItem, ThreeDotsLoader } from '@/components/reusable';
import { getQuoteDetailsAction, updateQuoteStatusAction } from '@/app/actions/erp/quotes';
import { useToast } from '@/hooks/use-toast';

interface QuoteDetailProps {
  quoteId: string;
  partnerId: string;
  onBack: () => void;
}

const QuoteDetail = ({ quoteId, partnerId, onBack }: QuoteDetailProps) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

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

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    setIsScrolled(scrollTop > 20);
  };

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
    <div className="flex flex-col h-full bg-white dark:bg-dark-surface transition-colors duration-300 relative">
        {/* HEADER */}
        <div className={`flex-shrink-0 z-40 bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border relative transition-all duration-300 w-full shadow-none ${isScrolled ? 'pt-2 pb-0' : 'pt-6 md:pt-8 pb-0'}`}>
            <div className="max-w-[1400px] mx-auto px-4 md:px-8 relative">
                
                {/* Back Button */}
                <div className={`hidden 2xl:block absolute -left-12 h-full flex items-start z-10 transition-all duration-300 ${isScrolled ? 'pt-1 -left-8' : 'pt-1'}`}>
                    <Button 
                        size="icon"
                        variant="ghost"
                        onClick={onBack}
                        className={`transition-all duration-300 ${isScrolled ? 'w-9 h-9' : 'w-11 h-11'}`}
                    >
                        <ChevronLeftIcon className={`transition-all duration-300 ${isScrolled ? 'w-4 h-4' : 'w-6 h-6'}`} />
                    </Button>
                </div>

                {/* Header Content */}
                <div className={`flex items-center justify-between transition-all duration-300 ${isScrolled ? 'mb-2' : 'mb-8'}`}>
                    <div className="flex items-center w-full md:w-auto overflow-hidden text-left">
                        <div className="flex flex-col justify-center">
                            <div className="flex items-center gap-3">
                                <h1 className={`font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-tight truncate transition-all duration-300 ${isScrolled ? 'text-lg md:text-xl' : 'text-xl md:text-3xl'}`}>
                                    Orçamento {quote.quote_number || `#${quote.id.substring(0, 8)}`}
                                </h1>
                                <Badge variant={statusInfo.variant} icon={statusInfo.icon}>
                                    {statusInfo.label}
                                </Badge>
                            </div>
                            <div className={`flex items-center gap-2 transition-all duration-300 overflow-hidden ${isScrolled ? 'max-h-0 opacity-0' : 'max-h-10 opacity-100 mt-2'}`}>
                                <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                    Criado em {formattedIssueDate} • Válido até {formattedExpiryDate}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className={`flex items-center gap-3 transition-all duration-300 ${isScrolled ? 'scale-90 origin-right' : ''}`}>
                        <Button variant="outline" size="icon" className="hidden sm:flex h-[42px] w-[42px] rounded-full">
                            <PrinterIcon size={18} />
                        </Button>
                        <Button variant="outline" size="icon" className="hidden sm:flex h-[42px] w-[42px] rounded-full">
                            <ShareIcon size={18} />
                        </Button>
                        <Button variant="outline" size="icon" className="flex h-[42px] w-[42px] rounded-full">
                            <MoreHorizontalIcon size={20} />
                        </Button>
                    </div>
                </div>
            </div>
        </div>

        {/* CONTENT */}
        <div 
            className="flex-1 overflow-auto no-scrollbar bg-white dark:bg-dark-surface transition-colors duration-300 scroll-smooth"
            onScroll={handleScroll}
        >
            <div className="max-w-[1400px] mx-auto p-4 md:p-8 pt-6">
                <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                    
                    {/* LEFT COLUMN - MAIN INFO */}
                    <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                        
                        {/* Quote Status Card - Dynamic based on status */}
                        <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden mb-8 shadow-sm">
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
                                            className="bg-blue-600 hover:bg-blue-700 text-white border-none shadow-sm h-[38px] text-xs"
                                        >
                                            Converter em Pedido <ArrowRightIcon size={14} className="ml-1" />
                                        </Button>
                                    )}
                                </div>
                             </div>
                             
                             {/* Timeline Steps */}
                             <div className="bg-white dark:bg-dark-surface p-6">
                                  <div className="flex items-center justify-between text-sm">
                                      <div className="flex flex-col items-center gap-2">
                                          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white"><CheckCircle2 size={16} /></div>
                                          <span className="font-bold text-brand-dark dark:text-dark-heading">Criado</span>
                                          <span className="text-xs text-brand-inactive-text">{formattedIssueDate}</span>
                                      </div>
                                      <div className={`flex-1 h-0.5 mx-2 mb-6 ${quote.status !== 'draft' ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`}></div>
                                      <div className="flex flex-col items-center gap-2">
                                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${quote.status !== 'draft' ? 'bg-green-500 text-white' : 'border-2 border-gray-300 dark:border-gray-600 text-gray-400'}`}>
                                              <UploadIcon size={16} />
                                          </div>
                                          <span className={`${quote.status !== 'draft' ? 'font-bold text-brand-dark dark:text-dark-heading' : 'font-medium text-gray-500'}`}>Enviado</span>
                                          <span className="text-xs text-brand-inactive-text">{quote.status !== 'draft' ? formattedIssueDate : '—'}</span>
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
                                          <span className={`${(quote.status === 'approved' || quote.status === 'rejected') ? 'font-bold text-brand-dark dark:text-dark-heading' : 'font-medium text-gray-500'}`}>
                                              {quote.status === 'rejected' ? 'Recusado' : 'Aprovação'}
                                          </span>
                                          <span className="text-xs text-brand-inactive-text">—</span>
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
                                        image={item.products?.images?.[0] || "https://img.dudit.com.br/static/mascots/Box.png"}
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
                        <div className="flex justify-end">
                            <div className="w-full max-w-sm space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-brand-inactive-text dark:text-dark-body text-left">Subtotal</span>
                                    <span className="font-bold text-brand-dark dark:text-dark-heading">R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-brand-inactive-text dark:text-dark-body text-left">Desconto</span>
                                    <span className="font-medium text-brand-dark dark:text-dark-heading">R$ {discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-brand-inactive-text dark:text-dark-body text-left">Frete</span>
                                    <span className="font-medium text-brand-dark dark:text-dark-heading">R$ {shipping.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-brand-inactive-text dark:text-dark-body text-left">Outros Custos</span>
                                    <span className="font-medium text-brand-dark dark:text-dark-heading">R$ {additional.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center pt-4 border-t border-brand-border dark:border-dark-border mt-2">
                                    <span className="font-bold text-lg text-brand-dark dark:text-dark-heading text-left">Total</span>
                                    <span className="font-bold text-xl text-brand-dark dark:text-dark-heading">R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN - SIDEBAR */}
                    <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-l-0 xl:border-l border-brand-border dark:border-dark-border mt-8 xl:mt-0 space-y-6">
                        
                         {/* Status Management Card */}
                         <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 relative overflow-hidden transition-colors shadow-sm text-left">
                             <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading mb-4">Status do Orçamento</h3>
                             <div className="flex flex-col gap-1.5">
                                <Dropdown 
                                    width="w-full"
                                    trigger={
                                        <button className="flex items-center justify-between w-full h-[42px] px-3 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-lg text-sm font-medium text-brand-dark dark:text-dark-heading focus:outline-none focus:ring-1 focus:ring-brand-border transition-all">
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
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2.5 h-2.5 rounded-full ${opt.color}`}></div>
                                                {opt.label}
                                            </div>
                                        </DropdownItem>
                                    ))}
                                </Dropdown>
                            </div>
                         </div>

                         {/* Customer Info Widget */}
                         <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden transition-colors shadow-sm text-left">
                            <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border"></div>
                            
                            {/* Top Part: Customer Identity */}
                            <div className="p-6 pb-0">
                                <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading mb-4 mt-1">
                                    Cliente
                                </h3>
                                
                                <div className="flex items-start justify-between mb-6">
                                    <div className="flex gap-3">
                                        <div className="relative">
                                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-gray-800 flex items-center justify-center text-lg font-bold text-brand-dark dark:text-dark-heading border border-white dark:border-dark-border shadow-sm overflow-hidden text-brand-inactive-text">
                                                {quote.customers?.name?.charAt(0) || 'C'}
                                            </div>
                                            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white dark:border-dark-surface rounded-full"></div>
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading uppercase truncate">{quote.customers?.name || "Consumidor Final"}</h4>
                                            <span className="text-xs text-brand-inactive-text dark:text-dark-body">Cliente Ativo</span>
                                        </div>
                                    </div>
                                    <Button variant="outline" size="icon" className="w-8 h-8 p-0 rounded-full flex items-center justify-center border-brand-border dark:border-dark-border">
                                        <MailIcon size={14} className="text-brand-inactive-text" />
                                    </Button>
                                </div>
                            </div>
                            
                            <div className="border-t border-brand-border dark:border-dark-border w-full"></div>
                            
                            {/* Bottom Part: Shipping Address */}
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading text-left">
                                        Endereço de Entrega
                                    </h3>
                                    <Button variant="ghost" size="icon" className="p-0 h-auto text-brand-inactive-text hover:text-brand-dark">
                                        <EditIcon size={14} />
                                    </Button>
                                </div>

                                {/* Map Placeholder */}
                                <div className="w-full h-24 bg-blue-50 dark:bg-gray-800 rounded-lg mb-4 overflow-hidden relative border border-blue-100 dark:border-gray-700 group cursor-pointer shadow-inner">
                                    <img src="https://img.dudit.com.br/static/maps/MapSample.png" className="w-full h-full object-cover opacity-60" alt="Map" />
                                    <div className="absolute inset-0 flex items-center justify-center text-left">
                                        <div className="w-6 h-6 bg-brand-green rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white">
                                            <div className="w-2 h-2 bg-white rounded-full"></div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mb-0 text-left">
                                    <div className="flex justify-between items-start mb-1">
                                        <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading">{quote.customers?.name || "Endereço Padrão"}</h4>
                                        <a href="#" className="text-xs font-bold text-brand-dark dark:text-dark-heading underline decoration-brand-dark dark:decoration-dark-heading">Ver Mapa</a>
                                    </div>
                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                        Endereço vinculado ao cadastro<br/>
                                        do cliente para esta proposta.
                                    </p>
                                </div>
                                
                                <div className="mt-4 pt-4 border-t border-brand-border dark:border-dark-border text-left">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading">Informações de Contato</h3>
                                        <Button variant="ghost" size="icon" className="p-0 h-auto text-brand-inactive-text hover:text-brand-dark">
                                            <EditIcon size={14} />
                                        </Button>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-[#1e40af] dark:text-[#60a5fa] bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/30 truncate w-full">
                                                {quote.customers?.email || "sem-email@cliente.com"}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-[#1e40af] dark:text-[#60a5fa] bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/30">
                                                {quote.customers?.phone || "+55 (00) 00000-0000"}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Terms/Notes Card */}
                        <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm text-left">
                            <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading mb-3">Observações da Proposta</h3>
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed whitespace-pre-wrap">
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
    <div className="flex items-start gap-4 py-4 border-b border-brand-border dark:border-dark-border last:border-0 hover:bg-brand-gray/10 transition-colors px-2 rounded-lg text-left">
        <div className="w-16 h-16 rounded-lg bg-brand-gray/30 dark:bg-gray-800 border border-brand-border dark:border-dark-border overflow-hidden flex-shrink-0 flex items-center justify-center">
            <img src={image} className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal" alt={name} />
        </div>
        <div className="flex-1 min-w-0">
             <div className="flex justify-between items-start mb-1 gap-2">
                 <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{name}</h4>
                 <span className="font-bold text-sm text-brand-dark dark:text-dark-heading whitespace-nowrap">R$ {total}</span>
             </div>
             <div className="text-xs text-brand-inactive-text dark:text-dark-body mb-2 lowercase tracking-wider">SKU: {sku}</div>
             <div className="flex items-center gap-2 text-xs text-brand-inactive-text dark:text-dark-body font-medium">
                 <span>{qty} un. • R$ {price} / un.</span>
             </div>
        </div>
    </div>
);

export default QuoteDetail;
