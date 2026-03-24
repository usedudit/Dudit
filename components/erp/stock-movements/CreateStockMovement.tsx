"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo, type FC } from 'react';
import { 
  ChevronLeftIcon, 
  SaveIcon, 
  SearchIcon, 
  ChevronDownIcon,
  ChevronUpIcon,
  Package,
  FileIcon,
  PlusIcon
} from '@/lib/icons';
import { 
  Button, 
  Input, 
  Tabs, 
  TabsList, 
  TabsTrigger, 
  TabsContent, 
  FormDropdown,
  AlertModal,
  Badge
} from '@/components/reusable';
import { searchProductsForMovement, createStockMovementAction } from '@/app/actions/erp/stock-movements';
import { useNotification } from '@/hooks/use-notification';
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { FadeIn } from "@/components/animations/FadeIn"
import { motion, AnimatePresence } from "framer-motion"

interface ProductSearchResult {
    id: string;
    name: string;
    sku: string;
    stock: number;
    image: string;
}

interface CreateStockMovementProps {
  onBack: () => void;
  onSuccess?: () => void;
}

const CreateStockMovement: FC<CreateStockMovementProps> = ({ onBack, onSuccess }) => {
  const { success: notifySuccess, error: notifyError } = useNotification();
  const [activeTab, setActiveTab] = useState('Geral');
  const [isScrolled, setIsScrolled] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5);
  }, []);
  
  // Form State
  const [type, setType] = useState<'in' | 'out'>('in');
  const [responsible, setResponsible] = useState('Usuário do Sistema');
  const [movementDate, setMovementDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [reason, setReason] = useState('Selecione um motivo...');
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Debounced search
  useEffect(() => {
      const timer = setTimeout(async () => {
          if (searchQuery.trim().length >= 2 && !selectedProduct) {
              setIsSearching(true);
              const results = await searchProductsForMovement(searchQuery);
              setSearchResults(results);
              setIsSearching(false);
          } else {
              setSearchResults([]);
          }
      }, 500);
      return () => clearTimeout(timer);
  }, [searchQuery, selectedProduct]);

  const isDirty = useMemo(() => {
    return (selectedProduct !== null) || (quantity !== '' && quantity !== 0) || (notes !== '') || (reason !== 'Selecione um motivo...');
  }, [selectedProduct, quantity, notes, reason]);

  const { showConfirmDialog: unsavedChangesDialogOpen, confirmNavigation: handleUnsavedChangesConfirm, cancelNavigation: handleUnsavedChangesDialogClose } = useUnsavedChanges(isDirty)

  const [showAlertModal, setShowAlertModal] = useState(false)
  const [nextAction, setNextAction] = useState<(() => void) | null>(null)

  const handleAttemptNav = useCallback((action: () => void) => {
      if (isDirty) { setNextAction(() => action); setShowAlertModal(true) }
      else action()
  }, [isDirty])

  const handleBack = useCallback(() => handleAttemptNav(onBack), [handleAttemptNav, onBack])

  const confirmNavigation = useCallback(() => {
      nextAction?.()
      setShowAlertModal(false)
  }, [nextAction])

  const handleSave = async () => {
      if (!selectedProduct) {
          notifyError("Selecione um produto.");
          return;
      }
      if (!quantity || Number(quantity) <= 0) {
          notifyError("Informe uma quantidade válida maior que zero.");
          return;
      }
      if (reason === 'Selecione um motivo...') {
          notifyError("Selecione um motivo para a movimentação.");
          return;
      }

      setIsSaving(true);
      try {
          const res = await createStockMovementAction({
              productId: selectedProduct.id,
              type,
              quantity: Number(quantity),
              reason,
              notes,
              movementDate,
              responsible
          });

          if (!res || !res.success) {
              notifyError(res?.error || "Erro interno ao salvar movimentação.");
          } else {
              notifySuccess("Movimentação registrada com sucesso!");
              if (onSuccess) onSuccess();
              onBack();
          }
      } catch (err: any) {
          notifyError("Erro interno. Tente novamente.");
      } finally {
          setIsSaving(false);
      }
  };

  const pageTitle = "Nova Movimentação";

  return (
    <FadeIn>
      <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-300">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
              <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">
                  
                  {/* Sticky Header */}
                  <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border transition-all duration-300">
                      <div className="max-w-[1400px] mx-auto relative px-4 md:px-8 md:pt-6">
                          
                          {/* Back button — desktop only */}
                          <div className={`absolute -left-12 top-8 h-full hidden xl:flex justify-center transition-all duration-300 ${isScrolled ? "scale-90" : "scale-100"}`}>
                              <Button variant="ghost" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-dark-border">
                                  <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                              </Button>
                          </div>

                          {/* Title row */}
                          <div className="hidden md:flex items-start justify-between">
                              <div className="flex flex-col gap-1 overflow-hidden min-w-0 mb-6">
                                  <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-300 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                      <span className="truncate">{pageTitle}</span>
                                      <Badge variant={type === 'in' ? 'green' : 'red'} className="text-[10px] uppercase tracking-wider">{type === 'in' ? 'Entrada' : 'Saída'}</Badge>
                                  </h1>

                                  <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100 mt-1"}`}>
                                      Registre uma nova entrada ou saída de itens no seu estoque
                                  </div>
                              </div>

                              {/* Desktop action buttons */}
                              <div className="hidden md:flex items-center gap-3 flex-shrink-0 ml-3">
                                  <Button variant="outline" onClick={handleBack} disabled={isSaving} className="px-5 h-[42px]">
                                      Cancelar
                                  </Button>
                                  <Button onClick={handleSave} disabled={isSaving} className="px-6 h-[42px] flex items-center gap-2">
                                      <SaveIcon className="w-4.5 h-4.5" />
                                      {isSaving ? "Salvando..." : "Salvar Movimentação"}
                                  </Button>
                              </div>
                          </div>

                          {/* Mobile Title Row */}
                          <div className="md:hidden flex items-center gap-3 py-4">
                              <button onClick={handleBack} className="p-2 -ml-2 text-brand-inactive-text">
                                  <ChevronLeftIcon size={24} />
                              </button>
                              <div className="flex flex-col min-w-0">
                                <h1 className="text-xl font-bold text-brand-dark dark:text-dark-heading truncate">{pageTitle}</h1>
                                <span className={`text-[10px] font-bold uppercase tracking-tight ${type === 'in' ? 'text-brand-green' : 'text-red-500'}`}>{type === 'in' ? 'Entrada' : 'Saída'}</span>
                              </div>
                          </div>

                          {/* Tabs */}
                          <div className={`w-full transition-all duration-300 ${isScrolled ? "md:mt-0" : "md:mt-2"}`}>
                              <TabsList className="bg-transparent p-0 gap-8 w-full justify-start border-b-0">
                                  <TabsTrigger value="Geral" className="px-0 pb-3 font-bold text-sm">Dados gerais</TabsTrigger>
                                  <TabsTrigger value="Observações" className="px-0 pb-3 font-bold text-sm">Observações</TabsTrigger>
                                  <TabsTrigger value="Anexos" className="px-0 pb-3 font-bold text-sm">Anexos</TabsTrigger>
                              </TabsList>
                          </div>
                      </div>
                  </div>

                  {/* Content Body */}
                  <div className="px-4 md:px-8 py-8 max-w-[1400px] mx-auto">
                      <div className="grid grid-cols-12 gap-y-10 lg:gap-x-16">
                          
                          {/* Form Column */}
                          <div className="col-span-12 lg:col-span-8">
                              <AnimatePresence mode="wait">
                                  <TabsContent value="Geral" className="mt-0">
                                      <motion.div key="Geral" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-10">
                                          
                                          {/* Tipo de Movimentação */}
                                          <section>
                                              <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Tipo de Movimentação</h3>
                                              <div className="flex flex-col md:flex-row gap-4">
                                                  <motion.button
                                                      whileHover={{ y: -2 }}
                                                      whileTap={{ scale: 0.98 }}
                                                      onClick={() => { setType('in'); setReason('Selecione um motivo...'); }}
                                                      className={`flex-1 flex items-center justify-between p-5 rounded-2xl transition-all border-2 ${
                                                          type === 'in' 
                                                              ? 'bg-green-50/50 dark:bg-green-900/10 border-brand-green shadow-sm' 
                                                              : 'bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border border-brand-border dark:border-dark-border'
                                                      }`}
                                                  >
                                                      <div className="flex items-center gap-4">
                                                          <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                                                              type === 'in' ? 'bg-brand-green text-white' : 'bg-gray-100 dark:bg-gray-800 text-brand-inactive-text'
                                                          }`}>
                                                              <ChevronDownIcon size={22} strokeWidth={2.5} />
                                                          </div>
                                                          <div className="flex flex-col items-start text-left">
                                                              <span className={`font-bold text-[15px] ${type === 'in' ? 'text-brand-green' : 'text-brand-dark dark:text-dark-heading'}`}>Entrada</span>
                                                              <span className="text-xs text-brand-inactive-text mt-0.5">Adicionar itens ao estoque</span>
                                                          </div>
                                                      </div>
                                                      {type === 'in' && <div className="w-2.5 h-2.5 rounded-full bg-brand-green" />}
                                                  </motion.button>

                                                  <motion.button
                                                      whileHover={{ y: -2 }}
                                                      whileTap={{ scale: 0.98 }}
                                                      onClick={() => { setType('out'); setReason('Selecione um motivo...'); }}
                                                      className={`flex-1 flex items-center justify-between p-5 rounded-2xl transition-all border-2 ${
                                                          type === 'out' 
                                                              ? 'bg-red-50/50 dark:bg-red-900/10 border-red-500 shadow-sm' 
                                                              : 'bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border border-brand-border dark:border-dark-border'
                                                      }`}
                                                  >
                                                      <div className="flex items-center gap-4">
                                                          <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                                                              type === 'out' ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-brand-inactive-text'
                                                          }`}>
                                                              <ChevronUpIcon size={22} strokeWidth={2.5} />
                                                          </div>
                                                          <div className="flex flex-col items-start text-left">
                                                              <span className={`font-bold text-[15px] ${type === 'out' ? 'text-red-500' : 'text-brand-dark dark:text-dark-heading'}`}>Saída</span>
                                                              <span className="text-xs text-brand-inactive-text mt-0.5">Remover itens do estoque</span>
                                                          </div>
                                                      </div>
                                                      {type === 'out' && <div className="w-2.5 h-2.5 rounded-full bg-red-500" />}
                                                  </motion.button>
                                              </div>
                                          </section>

                                          <div className="h-px bg-brand-border dark:bg-dark-border w-full" />

                                          {/* Detalhes do Produto */}
                                          <section>
                                              <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Detalhes da Movimentação</h3>
                                              <div className="space-y-6">
                                                  
                                                  <div className="relative">
                                                      <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">Produto <span className="text-red-500">*</span></label>
                                                      
                                                      {!selectedProduct ? (
                                                          <div className="relative">
                                                              <div className="relative flex items-center w-full h-[45px] px-4 bg-white dark:bg-dark-background border border-brand-border dark:border-dark-border rounded-xl focus-within:ring-2 focus-within:ring-brand-green/20 focus-within:border-brand-green transition-all shadow-sm">
                                                                  <SearchIcon size={18} className="text-brand-inactive-text mr-3 flex-shrink-0" />
                                                                  <input 
                                                                      type="text"
                                                                      placeholder="Buscar por nome ou SKU..."
                                                                      className="w-full h-full bg-transparent text-sm text-brand-dark dark:text-dark-body focus:outline-none placeholder:text-brand-inactive-text"
                                                                      value={searchQuery}
                                                                      onChange={(e) => setSearchQuery(e.target.value)}
                                                                  />
                                                              </div>

                                                              {searchQuery.length > 0 && (
                                                                  <motion.div 
                                                                    initial={{ opacity: 0, y: 5 }}
                                                                    animate={{ opacity: 1, y: 0 }}
                                                                    className="absolute z-50 top-full left-0 right-0 mt-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl shadow-xl overflow-hidden max-h-72 overflow-y-auto"
                                                                  >
                                                                      {isSearching ? (
                                                                          <div className="p-8 text-center text-sm text-brand-inactive-text flex flex-col items-center gap-2">
                                                                              <div className="w-5 h-5 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
                                                                              Carregando produtos...
                                                                          </div>
                                                                      ) : searchResults.length > 0 ? (
                                                                          searchResults.map(product => (
                                                                              <div 
                                                                                  key={product.id}
                                                                                  className="flex items-center gap-4 p-3.5 hover:bg-gray-50 dark:hover:bg-dark-border cursor-pointer border-b border-brand-border dark:border-dark-border last:border-0 transition-colors"
                                                                                  onClick={() => {
                                                                                      setSelectedProduct(product);
                                                                                      setSearchQuery('');
                                                                                  }}
                                                                              >
                                                                                  <div className="w-12 h-12 rounded-lg bg-gray-50 dark:bg-gray-800 overflow-hidden flex-shrink-0 border border-brand-border dark:border-dark-border">
                                                                                      <img src={product.image} alt={product.name} className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal" />
                                                                                  </div>
                                                                                  <div className="flex-1 min-w-0">
                                                                                      <div className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{product.name}</div>
                                                                                      <div className="text-[11px] font-medium text-brand-inactive-text mt-0.5 tracking-wider uppercase">{product.sku}</div>
                                                                                  </div>
                                                                                  <div className="text-xs font-bold text-white bg-brand-dark dark:bg-brand-green px-2 py-1 rounded-md whitespace-nowrap">
                                                                                      {product.stock} em estoque
                                                                                  </div>
                                                                              </div>
                                                                          ))
                                                                      ) : (
                                                                          <div className="p-8 text-center text-sm text-brand-inactive-text">
                                                                              Nenhum produto encontrado.
                                                                          </div>
                                                                      )}
                                                                  </motion.div>
                                                              )}
                                                          </div>
                                                      ) : (
                                                          <motion.div initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="p-5 rounded-2xl border-2 border-brand-green bg-green-50/20 dark:bg-brand-green/5 flex items-center gap-5 relative group">
                                                              <div className="w-16 h-16 rounded-xl bg-white dark:bg-gray-800 border-2 border-brand-green/30 flex-shrink-0 overflow-hidden shadow-sm">
                                                                  <img src={selectedProduct.image} alt={selectedProduct.name} className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal" />
                                                              </div>
                                                              <div className="flex-1 min-w-0 pr-8">
                                                                  <div className="text-[15px] font-bold text-brand-dark dark:text-dark-heading truncate">{selectedProduct.name}</div>
                                                                  <div className="text-xs text-brand-inactive-text flex items-center gap-2.5 mt-1.5 font-medium">
                                                                      <span className="bg-gray-200 dark:bg-gray-700 text-brand-dark dark:text-dark-body px-2 py-0.5 rounded text-[10px] font-bold tracking-wider">{selectedProduct.sku}</span>
                                                                      <span className="w-1 h-1 rounded-full bg-brand-inactive-text opacity-30"></span>
                                                                      <span className="flex items-center gap-1">Estoque atual: <strong className="text-brand-dark dark:text-dark-heading underline decoration-brand-green/30">{selectedProduct.stock} unidades</strong></span>
                                                                  </div>
                                                              </div>
                                                              <button 
                                                                  className="absolute top-4 right-4 p-2 text-brand-inactive-text hover:text-red-500 transition-all rounded-full hover:bg-white dark:hover:bg-dark-surface shadow-sm opacity-60 group-hover:opacity-100"
                                                                  onClick={() => { setSelectedProduct(null); setSearchQuery(''); }}
                                                              >
                                                                  <PlusIcon size={18} className="rotate-45" />
                                                              </button>
                                                          </motion.div>
                                                      )}
                                                  </div>

                                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                      <Input 
                                                          label="Quantidade *"
                                                          name="quantity"
                                                          type="number"
                                                          placeholder="Ex: 10"
                                                          value={quantity}
                                                          onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                                                          className="h-[45px] font-bold"
                                                      />
                                                      
                                                      <FormDropdown
                                                          label="Motivo"
                                                          value={reason}
                                                          setValue={setReason}
                                                          options={type === 'in' ? [
                                                              { value: 'Compra de Fornecedor', label: 'Compra de Fornecedor' },
                                                              { value: 'Devolução de Cliente', label: 'Devolução de Cliente' },
                                                              { value: 'Ajuste de Estoque', label: 'Ajuste de Estoque' }
                                                          ] : [
                                                              { value: 'Avaria / Perda', label: 'Avaria / Perda' },
                                                              { value: 'Ajuste de Estoque', label: 'Ajuste de Estoque' },
                                                              { value: 'Uso Interno', label: 'Uso Interno' }
                                                          ]}
                                                          className="mt-[1px]"
                                                      />
                                                  </div>

                                              </div>
                                          </section>
                                      </motion.div>
                                  </TabsContent>
                                  
                                  <TabsContent value="Observações" className="mt-0">
                                      <motion.div key="Observações" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                                          <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Observações Internas</h3>
                                          <div className="bg-gray-50 dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-5 h-[350px] shadow-sm">
                                              <textarea 
                                                  className="w-full h-full bg-transparent border-none text-[15px] text-brand-dark dark:text-dark-heading leading-relaxed focus:outline-none resize-none placeholder:text-brand-inactive-text"
                                                  placeholder="Adicione informações como número da nota fiscal, motivo detalhado, ou observações para controle interno..."
                                                  value={notes}
                                                  onChange={(e) => setNotes(e.target.value)}
                                              ></textarea>
                                          </div>
                                      </motion.div>
                                  </TabsContent>

                                  <TabsContent value="Anexos" className="mt-0">
                                      <motion.div key="Anexos" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden shadow-sm">
                                          <div className="p-6 border-b border-brand-border dark:border-dark-border flex justify-between items-center bg-gray-50/50 dark:bg-dark-surface">
                                              <h3 className="font-bold text-brand-dark dark:text-dark-heading">Gerenciar Anexos</h3>
                                              <Button variant="outline" className="h-9 text-xs font-bold" leftIcon={<PlusIcon size={14} />}>
                                                  Adicionar Arquivo
                                              </Button>
                                          </div>
                                          <div className="p-16 flex flex-col items-center justify-center text-center">
                                              <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-brand-inactive-text mb-5 shadow-inner">
                                                  <FileIcon size={28} />
                                              </div>
                                              <h4 className="font-bold text-brand-dark dark:text-dark-heading mb-2">Nenhum documento anexado</h4>
                                              <p className="text-sm text-brand-inactive-text max-w-xs leading-relaxed">
                                                  Adicione digitalizações de notas, fotos de itens avariados ou comprovantes de recebimento.
                                              </p>
                                          </div>
                                      </motion.div>
                                  </TabsContent>
                              </AnimatePresence>
                          </div>

                          {/* Sidebar Column */}
                          <div className="hidden lg:block col-span-12 lg:col-span-4 border-l border-brand-border dark:border-dark-border pl-12 space-y-8">
                              
                              <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden shadow-sm">
                                  <div className={`absolute top-0 left-0 w-full h-1.5 transition-colors duration-500 ${type === 'in' ? 'bg-brand-green' : 'bg-red-500'}`}></div>

                                  <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-1">Status da Operação</h3>
                                  
                                  <div className="space-y-5">
                                      <FormDropdown
                                          label="Responsável"
                                          value={responsible}
                                          setValue={setResponsible}
                                          options={[
                                              { value: 'Usuário do Sistema', label: 'Usuário do Sistema' },
                                              { value: 'Gerente de Operações', label: 'Gerente de Operações' },
                                              { value: 'Administrador', label: 'Administrador' }
                                          ]}
                                      />
                                      
                                      <div className="flex flex-col gap-2">
                                          <Input 
                                              label="Data da Operação" 
                                              name="movementDate" 
                                              type="date"
                                              value={movementDate}
                                              onChange={(e) => setMovementDate(e.target.value)}
                                              className="h-[42px] font-medium"
                                          />
                                      </div>

                                      <div className="pt-4 mt-2 border-t border-brand-border dark:border-dark-border">
                                          <p className="text-[11px] text-brand-inactive-text italic leading-relaxed">
                                              * Todas as movimentações são registradas com log de auditoria do usuário logado.
                                          </p>
                                      </div>
                                  </div>
                              </div>

                              <AnimatePresence>
                                {selectedProduct && (
                                  <motion.div 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="p-6 rounded-2xl bg-brand-dark/5 dark:bg-white/5 border border-brand-dark/10 dark:border-white/10"
                                  >
                                    <h4 className="text-xs font-bold text-brand-dark dark:text-dark-heading uppercase tracking-widest mb-3 flex items-center gap-2">
                                      <div className={`w-2 h-2 rounded-full ${type === 'in' ? 'bg-brand-green animate-pulse' : 'bg-red-500 animate-pulse'}`} />
                                      Projeção de Estoque
                                    </h4>
                                    <div className="flex items-center justify-between">
                                      <span className="text-[13px] text-brand-inactive-text">Estoque Final:</span>
                                      <span className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                                        {type === 'in' 
                                          ? (selectedProduct.stock + (Number(quantity) || 0)) 
                                          : (selectedProduct.stock - (Number(quantity) || 0))} 
                                        <span className="text-xs ml-1 font-medium">un</span>
                                      </span>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                          </div>
                      </div>
                  </div>
              </div>

              {/* Mobile Bottom Action Bar */}
              <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                  <Button
                      variant="outline"
                      onClick={handleBack}
                      disabled={isSaving}
                      className="flex-1 h-[48px] font-bold"
                  >
                      Cancelar
                  </Button>
                  <Button
                      onClick={handleSave}
                      disabled={isSaving}
                      className={`flex-1 h-[48px] font-bold ${type === 'in' ? 'bg-brand-green hover:bg-brand-green/90' : 'bg-red-500 hover:bg-red-600'}`}
                  >
                      <SaveIcon className="w-4 h-4 mr-2" />
                      {isSaving ? "Salvando..." : "Salvar"}
                  </Button>
              </div>
          </Tabs>

          {/* Modals */}
          {unsavedChangesDialogOpen && (
              <AlertModal
                  isOpen={unsavedChangesDialogOpen}
                  onClose={handleUnsavedChangesDialogClose}
                  onConfirm={handleUnsavedChangesConfirm}
                  title="Descartar alterações?"
                  description="Você tem uma movimentação em andamento. Se sair agora, perderá os dados preenchidos."
                  confirmText="Sair sem salvar"
                  variant="warning"
              />
          )}
          {showAlertModal && (
              <AlertModal
                  isOpen
                  onClose={() => setShowAlertModal(false)}
                  onConfirm={confirmNavigation}
                  title="Descartar alterações?"
                  description="Existem dados não salvos neste formulário. Tem certeza que deseja cancelar o registro?"
                  confirmText="Sair sem salvar"
                  variant="warning"
              />
          )}
      </div>
    </FadeIn>
  );
};

export default CreateStockMovement;
