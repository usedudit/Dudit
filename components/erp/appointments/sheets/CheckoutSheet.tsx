
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreHorizontal, Trash2, Plus, Minus, ChevronRight, Banknote, Check, Gift, Split, DollarSign, RefreshCcw, Edit3, FileText, Mail, Printer, ChevronLeft, X, User } from 'lucide-react';
import Button from '../../Button';
import { Badge } from '../../Badge';
import { NumpadModal, PaymentOptionCard } from '../Shared';
import Dropdown, { DropdownItem } from '../../Dropdown';
import { ServiceItemCard } from '../ServiceItemCard';

const CheckoutSheet = ({ onClose, onComplete, initialData, onPaymentSuccess }: { onClose: () => void, onComplete: () => void, initialData: any, onPaymentSuccess?: () => void }) => {
    const [step, setStep] = useState<'summary' | 'processing' | 'receipt'>('summary');
    const [payments, setPayments] = useState<{ id: number, method: string, amount: number }[]>([
        { id: 1, method: 'Cartão de Crédito', amount: 0 }
    ]);
    const [isPaymentMethodModalOpen, setIsPaymentMethodModalOpen] = useState(false);
    const [isCashInputOpen, setIsCashInputOpen] = useState(false);
    const [isOthersInputOpen, setIsOthersInputOpen] = useState(false);
    const [currentEditingPaymentId, setCurrentEditingPaymentId] = useState<number | null>(null);

    // Calculate totals based on initialData.services
    const services = initialData?.services || [];
    const subtotal = services.reduce((acc: number, s: any) => acc + (s.price || 0), 0);
    const tax = 0; 
    const discount = 0;
    const total = subtotal;

    // Initialize payment amount on load if only one method
    React.useEffect(() => {
        if (payments.length === 1 && payments[0].amount === 0) {
            setPayments([{ ...payments[0], amount: total }]);
        }
    }, [total]);

    const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
    const remaining = Math.max(0, total - totalPaid);
    const isFullyPaid = remaining <= 0.01;

    const handleMethodSelect = (method: string) => {
        setIsPaymentMethodModalOpen(false);
        
        if (method === 'Dinheiro') {
            setIsCashInputOpen(true);
        } else if (method === 'Outros') {
            setIsOthersInputOpen(true);
        } else if (method === 'Dividir pagamento') {
            setIsPaymentMethodModalOpen(true);
            setCurrentEditingPaymentId(null); 
        } else {
             addOrUpdatePayment(method, remaining > 0 ? remaining : total);
        }
    };

    const addOrUpdatePayment = (method: string, amount: number) => {
        if (currentEditingPaymentId) {
            setPayments(prev => prev.map(p => p.id === currentEditingPaymentId ? { ...p, method, amount } : p));
        } else {
            if (payments.length === 1 && payments[0].amount === total) {
                 setPayments([{ id: 1, method, amount }]);
            } else {
                 setPayments(prev => [...prev, { id: Date.now(), method, amount }]);
            }
        }
        setCurrentEditingPaymentId(null);
    };

    const handleCashConfirm = (amount: number) => {
        addOrUpdatePayment('Dinheiro', amount);
        setIsCashInputOpen(false);
    }
    
    const handleOthersConfirm = (amount: number) => {
        addOrUpdatePayment('Outros', amount);
        setIsOthersInputOpen(false);
    }

    const handlePay = () => {
        setStep('processing');
        setTimeout(() => {
            setStep('receipt');
            if (onPaymentSuccess) {
                onPaymentSuccess();
            }
        }, 2000);
    };

    const TicketIcon = () => <div className="border border-brand-dark rounded w-4 h-4 flex items-center justify-center text-[10px] font-bold">%</div>;

    const clientName = initialData?.client?.name || 'Cliente Sem Nome';

    return (
        <div className="fixed inset-0 z-[60] flex justify-end">
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />
            
            <motion.div 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="relative w-full md:w-[480px] h-full bg-white dark:bg-dark-surface shadow-2xl flex flex-col overflow-hidden"
            >
                <AnimatePresence mode="wait">
                    {step === 'summary' && (
                        <motion.div
                            key="summary"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col h-full"
                        >
                            <div className="px-6 py-4 border-b border-brand-border dark:border-dark-border flex items-center justify-between">
                                <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Itens</h2>
                                <div className="flex gap-2">
                                    <Button variant="outline" className="h-8 text-xs font-bold px-3 border-brand-border rounded-full" leftIcon={<MoreHorizontal size={14} />}>Operações</Button>
                                    <Button variant="outline" className="h-8 text-xs font-bold px-3 border-brand-border rounded-full" leftIcon={<Trash2 size={14} />}>Reset</Button>
                                </div>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                                
                                {/* Service List */}
                                <div className="space-y-3">
                                    {services.map((service: any, idx: number) => (
                                        <ServiceItemCard 
                                            key={idx}
                                            service={service}
                                            onRemove={() => {}} // No-op for demo
                                            showActions={false}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Bottom Section */}
                            <div className="p-4 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border">
                                 
                                 {/* Customer Card */}
                                 <div className="flex items-center justify-between py-2 mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold text-lg">
                                            {clientName.charAt(0)}
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm text-brand-dark dark:text-dark-heading">{clientName}</div>
                                            <div className="text-xs text-brand-inactive-text">Cliente</div>
                                        </div>
                                    </div>
                                    <button className="text-xs font-bold text-brand-dark underline decoration-gray-300">Alterar</button>
                                 </div>

                                 <div className="rounded-2xl p-0 border-0 mb-4">
                                     {/* Promo Code */}
                                    <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl mb-3">
                                        <div className="flex items-center gap-2 text-sm font-bold text-brand-dark dark:text-dark-heading">
                                            <TicketIcon /> Promo (10%)
                                        </div>
                                        <button className="bg-[#059669] hover:bg-[#047857] text-white px-3 py-1 rounded-full text-xs font-bold transition-colors">Change</button>
                                    </div>

                                    {/* Payment Method Row */}
                                    <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl mb-4 cursor-pointer" onClick={() => { setCurrentEditingPaymentId(payments[0].id); setIsPaymentMethodModalOpen(true); }}>
                                        <div className="flex items-center gap-2 text-sm font-bold text-brand-dark dark:text-dark-heading">
                                            <div className="flex -space-x-1 mr-1">
                                                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                            </div>
                                            {payments[0].method}
                                        </div>
                                        <div className="flex items-center gap-1 bg-white dark:bg-dark-surface px-3 py-1 rounded-full border border-gray-200 dark:border-gray-600 shadow-sm text-xs font-bold text-brand-dark dark:text-dark-heading">
                                            Change <ChevronRight size={10} />
                                        </div>
                                    </div>
                                    
                                    {/* Totals */}
                                    <div className="space-y-2 text-sm pt-2">
                                        <div className="flex justify-between text-brand-inactive-text">
                                            <span>Sub-Total</span>
                                            <span className="text-brand-dark font-bold">${subtotal}</span>
                                        </div>
                                        <div className="flex justify-between text-brand-inactive-text">
                                            <span>Tax</span>
                                            <span className="text-brand-dark font-bold">${tax}</span>
                                        </div>
                                        <div className="flex justify-between text-brand-inactive-text">
                                            <span>Discount</span>
                                            <span className="text-brand-dark font-bold">-${discount}</span>
                                        </div>
                                        <div className="border-t border-dashed border-gray-300 my-2 pt-2 flex justify-between items-end">
                                            <span className="font-bold text-brand-inactive-text">Total Payment</span>
                                            <span className="text-xl font-bold text-brand-dark">${total}</span>
                                        </div>
                                    </div>
                                 </div>

                                <Button 
                                    onClick={handlePay}
                                    className="w-full h-[52px] text-base font-bold bg-[#059669] hover:bg-[#047857] rounded-full shadow-lg shadow-green-200 dark:shadow-none"
                                >
                                    {isFullyPaid ? 'Continue' : 'Pagar Parcialmente'}
                                </Button>
                            </div>
                        </motion.div>
                    )}

                    {step === 'processing' && (
                        <motion.div 
                            key="processing"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.5 }}
                            className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-dark-surface h-full"
                        >
                            <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-[#a855f7] to-[#d946ef] flex items-center justify-center mb-6 shadow-2xl shadow-purple-200 dark:shadow-none relative">
                                <div className="absolute inset-0 rounded-full bg-white opacity-20 animate-ping"></div>
                                <Banknote size={56} className="text-white" />
                            </div>
                            <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-2">Processando pagamento</h2>
                            <div className="mt-8 flex justify-center">
                                <button className="text-sm text-[#6366f1] font-medium hover:underline">Esté com problemas? Obter ajuda</button>
                            </div>
                        </motion.div>
                    )}
                    
                    {step === 'receipt' && (
                        <motion.div 
                             key="receipt"
                             initial={{ opacity: 0 }}
                             animate={{ opacity: 1 }}
                             exit={{ opacity: 0 }}
                             transition={{ duration: 0.5 }}
                             className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-dark-surface h-full relative"
                        >
                            {/* Inner Content with slide up */}
                            <motion.div
                                initial={{ y: 50, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.2 }}
                                className="w-full h-full flex flex-col"
                            >
                                {/* This background success state is just for a moment transition or fallback */}
                                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center absolute inset-0 z-10">
                                    <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-[#a855f7] to-[#d946ef] flex items-center justify-center mb-6 shadow-2xl shadow-purple-200 dark:shadow-none">
                                        <Check size={64} className="text-white" strokeWidth={3} />
                                    </div>
                                    <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-8">Venda concluída</h2>
                                </div>

                                {/* Actual Receipt Details Area - The main view for Receipt */}
                                <div className="absolute inset-0 bg-white dark:bg-dark-surface z-20 flex flex-col">
                                     <div className="p-6 h-full overflow-y-auto">
                                          <div className="flex justify-between items-start mb-6">
                                              <Badge variant="green" className="bg-[#15803d] text-white border-none text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5">
                                                  <Check size={12} strokeWidth={3} /> Concluído
                                              </Badge>
                                              
                                              <div className="flex gap-3">
                                                  <Button className="bg-[#111827] text-white hover:bg-black rounded-full h-9 text-xs font-bold px-4" onClick={onClose}>Nova reserva</Button>
                                                  
                                                  <Dropdown 
                                                    width="w-56" 
                                                    align="right" 
                                                    trigger={
                                                        <button className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50">
                                                            <MoreHorizontal size={18} className="text-brand-dark" />
                                                        </button>
                                                    }
                                                  >
                                                      <div className="px-3 py-2 text-xs font-bold text-brand-dark mb-1">Ações rápidas</div>
                                                      <DropdownItem className="gap-2 text-brand-dark"><RefreshCcw size={14} /> Reembolsar venda</DropdownItem>
                                                      <DropdownItem className="gap-2 text-brand-dark"><Edit3 size={14} /> Editar detalhes da venda</DropdownItem>
                                                      <DropdownItem className="gap-2 text-brand-dark"><FileText size={14} /> Adicionar nota</DropdownItem>
                                                      <div className="h-px bg-gray-100 my-1"></div>
                                                      <DropdownItem className="gap-2 text-brand-dark"><Mail size={14} /> E-mail</DropdownItem>
                                                      <DropdownItem className="gap-2 text-brand-dark"><Printer size={14} /> Imprimir</DropdownItem>
                                                      <DropdownItem className="gap-2 text-brand-dark"><FileText size={14} /> Baixar PDF</DropdownItem>
                                                      <div className="h-px bg-gray-100 my-1"></div>
                                                      <DropdownItem className="gap-2 text-red-500 hover:text-red-600 hover:bg-red-50">Anular venda</DropdownItem>
                                                  </Dropdown>
                                              </div>
                                          </div>

                                          <div className="text-left mb-6">
                                              <h1 className="text-3xl font-bold text-brand-dark dark:text-dark-heading mb-1">Venda</h1>
                                              <div className="text-sm text-brand-inactive-text">dom 11 jan 2026 • Ecolibrium</div>
                                          </div>

                                          {/* Customer Card */}
                                          <div className="border border-brand-border dark:border-dark-border rounded-xl p-4 flex items-center justify-between mb-6 bg-white dark:bg-dark-surface shadow-sm">
                                              <span className="font-bold text-brand-dark dark:text-dark-heading">{clientName}</span>
                                              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
                                                  <User size={20} className="stroke-current" />
                                              </div>
                                          </div>

                                          {/* Sale Details */}
                                          <div className="border border-brand-border dark:border-dark-border rounded-xl p-6 bg-white dark:bg-dark-surface shadow-sm text-left">
                                              <div className="mb-4">
                                                  <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading">Venda #14</h3>
                                                  <div className="text-sm text-brand-inactive-text">dom 11 jan 2026</div>
                                              </div>

                                              <div className="space-y-4 mb-4">
                                                  {services.map((s: any, i: number) => (
                                                      <div key={i} className="flex justify-between items-start">
                                                          <div>
                                                              <div className="font-medium text-brand-dark dark:text-dark-heading">{s.name}</div>
                                                              <div className="text-xs text-brand-inactive-text">{s.startTime ? `${s.startTime} • ` : ''}{s.duration}min • {s.staff}</div>
                                                          </div>
                                                          <div className="font-medium text-brand-dark dark:text-dark-heading">R$ {s.price}</div>
                                                      </div>
                                                  ))}
                                              </div>

                                              <div className="border-t border-brand-border dark:border-dark-border my-4"></div>

                                              <div className="space-y-2 mb-4">
                                                  <div className="flex justify-between text-brand-inactive-text text-sm">
                                                      <span>Subtotal</span>
                                                      <span>R$ {subtotal}</span>
                                                  </div>
                                                  <div className="flex justify-between font-bold text-brand-dark dark:text-dark-heading text-base">
                                                      <span>Total</span>
                                                      <span>R$ {total}</span>
                                                  </div>
                                              </div>

                                              <div className="border-t border-brand-border dark:border-dark-border my-4"></div>

                                              <div className="flex justify-between items-start">
                                                  <div>
                                                      <div className="font-medium text-brand-dark dark:text-dark-heading">Pago com {payments[0].method}</div>
                                                      <div className="text-xs text-brand-inactive-text">dom 11 jan 2026 às 16:03</div>
                                                  </div>
                                                  <div className="font-medium text-brand-dark dark:text-dark-heading">R$ {total}</div>
                                              </div>
                                          </div>
                                     </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
}

export default CheckoutSheet;
