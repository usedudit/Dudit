import React from 'react';
import { motion } from 'framer-motion';
import { Check, MoreHorizontal, RefreshCcw, Edit3, FileText, Mail, Printer, User, X } from 'lucide-react';
import { Button, Badge, Dropdown, DropdownItem } from '../../../reusable';
import { Appointment } from '../types';

interface SaleDetailSheetProps {
    onClose: () => void;
    appointment: Appointment | null;
}

const SaleDetailSheet = ({ onClose, appointment }: SaleDetailSheetProps) => {
    // Mock data based on the appointment or defaults
    const clientName = appointment?.customer || 'Bagus Fikri';
    const saleId = `#14`;
    const dateStr = 'dom 11 jan 2026';
    const subtotal = appointment?.price || 150;
    const total = subtotal; // Assuming no tax/discount for this view
    const services = [
        { 
            name: appointment?.service || 'Consultoria Financeira', 
            time: appointment?.time || '10:00', 
            duration: appointment?.duration || 60, 
            staff: appointment?.staff || 'Ana Silva', 
            price: subtotal 
        }
    ];

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/50 transition-opacity"
                onClick={onClose}
            />
            
            <motion.div 
                initial={{ x: '120%' }}
                animate={{ x: 0 }}
                exit={{ x: '120%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed right-4 top-4 bottom-4 z-50 w-[480px] flex flex-col bg-white shadow-2xl dark:bg-dark-surface overflow-hidden rounded-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex-1 flex flex-col">
                     <div className="p-6 h-full overflow-y-auto custom-scrollbar">
                          <div className="flex justify-between items-start mb-6">
                              <Badge variant="green" className="bg-[#15803d] text-white border-none text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5">
                                  <Check size={12} strokeWidth={3} /> Concluído
                              </Badge>
                              
                              <div className="flex gap-3">
                                  <Button className="bg-[#111827] text-white hover:bg-black rounded-full h-9 text-xs font-bold px-4" onClick={onClose}>Nova reserva</Button>
                                  
                                  <Dropdown 
                                    width="w-56" 
                                    align="right" 
                                    showChevron={false}
                                    trigger={
                                        <button className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                            <MoreHorizontal size={18} className="text-brand-dark dark:text-dark-heading" />
                                        </button>
                                    }
                                  >
                                      <div className="px-3 py-2 text-xs font-bold text-brand-dark dark:text-dark-heading mb-1">Ações rápidas</div>
                                      <DropdownItem className="gap-2 text-brand-dark dark:text-dark-heading"><RefreshCcw size={14} /> Reembolsar venda</DropdownItem>
                                      <DropdownItem className="gap-2 text-brand-dark dark:text-dark-heading"><Edit3 size={14} /> Editar detalhes da venda</DropdownItem>
                                      <DropdownItem className="gap-2 text-brand-dark dark:text-dark-heading"><FileText size={14} /> Adicionar nota</DropdownItem>
                                      <div className="h-px bg-gray-100 dark:bg-dark-border my-1"></div>
                                      <DropdownItem className="gap-2 text-brand-dark dark:text-dark-heading"><Mail size={14} /> E-mail</DropdownItem>
                                      <DropdownItem className="gap-2 text-brand-dark dark:text-dark-heading"><Printer size={14} /> Imprimir</DropdownItem>
                                      <DropdownItem className="gap-2 text-brand-dark dark:text-dark-heading"><FileText size={14} /> Baixar PDF</DropdownItem>
                                      <div className="h-px bg-gray-100 dark:bg-dark-border my-1"></div>
                                      <DropdownItem className="gap-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">Anular venda</DropdownItem>
                                  </Dropdown>
                              </div>
                          </div>

                          <div className="text-left mb-6">
                              <h1 className="text-3xl font-bold text-brand-dark dark:text-dark-heading mb-1">Venda</h1>
                              <div className="text-sm text-brand-inactive-text">{dateStr} • Ecolibrium</div>
                          </div>

                          {/* Customer Card */}
                          <div className="border border-brand-border dark:border-dark-border rounded-xl p-4 flex items-center justify-between mb-6 bg-white dark:bg-dark-surface shadow-sm">
                              <span className="font-bold text-brand-dark dark:text-dark-heading">{clientName}</span>
                              <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                                  <User size={20} className="stroke-current" />
                              </div>
                          </div>

                          {/* Sale Details */}
                          <div className="border border-brand-border dark:border-dark-border rounded-xl p-6 bg-white dark:bg-dark-surface shadow-sm text-left">
                              <div className="mb-4">
                                  <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading">Venda {saleId}</h3>
                                  <div className="text-sm text-brand-inactive-text">{dateStr}</div>
                              </div>

                              <div className="space-y-4 mb-4">
                                  {services.map((s, i) => (
                                      <div key={i} className="flex justify-between items-start">
                                          <div>
                                              <div className="font-medium text-brand-dark dark:text-dark-heading">{s.name}</div>
                                              <div className="text-xs text-brand-inactive-text">{s.time} • {s.duration}min • {s.staff}</div>
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
                                      <div className="font-medium text-brand-dark dark:text-dark-heading">Pago com Cartão de Crédito</div>
                                      <div className="text-xs text-brand-inactive-text">{dateStr} às 16:03</div>
                                  </div>
                                  <div className="font-medium text-brand-dark dark:text-dark-heading">R$ {total}</div>
                              </div>
                          </div>
                     </div>
                </div>
            </motion.div>
        </div>
    );
};

export default SaleDetailSheet;
