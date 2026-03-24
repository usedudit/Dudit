"use client"

import React, { useState } from 'react';
import { 
  ChevronLeftIcon,
  MoreHorizontalIcon, 
  PrinterIcon,
  DownloadIcon, 
  FileIcon, 
  UserIcon, 
  CheckCircle2, 
  ChevronUpIcon,
  ChevronDownIcon,
  MapPin,
  PlusIcon,
  EditIcon,
  TrashIcon,
  Package,
  ClockIcon,
  InfoIcon,
  ChevronRightIcon,
  ArrowRightIcon,
  ThreeDotsIcon
} from '@/lib/icons';
import { Button } from '@/components/reusable';
import { Badge } from '@/components/reusable/Badge';
import Dropdown, { DropdownItem } from '@/components/reusable/Dropdown';
import { useNotification } from '@/hooks/use-notification';

// Sub-components
const StyledDropdownItem: React.FC<{ onClick?: () => void; children: React.ReactNode; className?: string }> = ({ onClick, children, className }) => (
    <div
        className={`flex items-center gap-2 px-3 py-2 text-sm font-medium cursor-pointer rounded-md hover:bg-gray-100 dark:hover:bg-dark-border transition-colors ${className}`}
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
    >
        {children}
    </div>
);

const InfoCard = ({ icon: Icon, title, description, onClick, rightIcon: RightIcon = ChevronRightIcon }: any) => (
    <div 
        onClick={onClick}
        className={`group flex items-center gap-4 p-4 rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface transition-all ${onClick ? 'hover:border-brand-dark/30 dark:hover:border-dark-heading/30 cursor-pointer' : ''}`}
    >
        <div className="w-12 h-12 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">
            <Icon size={20} className="text-brand-dark dark:text-dark-heading" />
        </div>
        <div className="flex-1">
            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-0.5">{title}</h3>
            <p className="text-xs text-brand-inactive-text dark:text-dark-body leading-tight">{description}</p>
        </div>
        {RightIcon && onClick && <RightIcon size={18} className="text-brand-inactive-text group-hover:text-brand-dark dark:group-hover:text-dark-heading transition-colors" />}
    </div>
);

interface StockMovement {
  id: string;
  displayId?: string;
  date: string;
  product: {
    name: string;
    sku: string;
    image: string;
    category: string;
    previousStock: number;
    currentStock: number;
  };
  type: 'in' | 'out';
  quantity: number;
  reason: string;
  user: string;
  notes?: string;
}

interface StockMovementDetailProps {
  onBack: () => void;
  movement: StockMovement | null;
  isLoading?: boolean;
}

const StockMovementDetailPage = ({ onBack, movement, isLoading }: StockMovementDetailProps) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const { info } = useNotification();

  const handleScroll = React.useCallback(() => {
    if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5);
  }, []);

  const handlePrint = () => {
    info("Em breve", "Funcionalidade de impressão em desenvolvimento.");
  };

  if (isLoading || !movement) {
    return (
        <div className="flex flex-col items-center justify-center h-full bg-white dark:bg-dark-surface">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-green"></div>
            <p className="mt-4 text-brand-inactive-text dark:text-dark-body">Carregando detalhes...</p>
        </div>
    );
  }

  const data = movement;
  const isIn = data.type === 'in';

  return (
    <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-300">
        
        <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">
            
            {/* Sticky Header */}
            <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border transition-all duration-300">
                <div className="max-w-[1400px] mx-auto relative px-4 md:px-8 md:pt-6">
                    
                    {/* Back Button (Desktop Floating) */}
                    <div className={`hidden XL:flex absolute -left-12 top-8 h-full items-start z-10 transition-all duration-300 ${isScrolled ? 'scale-90' : 'scale-100'}`}>
                        <Button 
                            variant="ghost"
                            size="icon"
                            onClick={onBack}
                            className="w-10 h-10 p-0 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-dark-border"
                        >
                            <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                        </Button>
                    </div>

                    {/* Header Content */}
                    <div className={`flex items-start justify-between transition-all duration-300 ${isScrolled ? 'mb-4 mt-4 md:mt-0' : 'mb-6'}`}>
                        <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                            <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-300 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                <span className="truncate">{data.displayId || data.id}</span>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {isIn ? (
                                        <Badge variant="green" className="flex items-center gap-1"><ChevronDownIcon size={12} /> Entrada</Badge>
                                    ) : (
                                        <Badge variant="red" className="flex items-center gap-1"><ChevronUpIcon size={12} /> Saída</Badge>
                                    )}
                                    <Badge variant="gray" className="flex items-center gap-1 font-bold">CONCLUÍDO</Badge>
                                </div>
                            </h1>

                            {/* Metadata - Hides on scroll */}
                            <div className={`overflow-hidden transition-all duration-300 ${isScrolled ? 'max-h-0 opacity-0' : 'max-h-20 opacity-100 mt-1'}`}>
                                <div className="flex flex-wrap items-center gap-2 text-[15px] text-brand-inactive-text dark:text-dark-body font-medium">
                                    <span className="flex items-center gap-1"><ClockIcon size={14} /> {data.date}</span>
                                    <span className="text-gray-300 dark:text-gray-600 mx-1">•</span>
                                    <span className="flex items-center gap-1"><UserIcon size={14} /> {data.user}</span>
                                </div>
                            </div>
                        </div>

                        {/* Desktop Actions */}
                        <div className="hidden md:flex items-center gap-3 flex-shrink-0 ml-3">
                            <Button variant="outline" className="h-[42px] w-[42px] p-0" onClick={handlePrint}>
                                <PrinterIcon size={18} />
                            </Button>
                            <Dropdown
                                align="right"
                                showChevron={false}
                                trigger={
                                    <Button variant="outline" className="w-10 h-10 p-0 flex items-center justify-center bg-transparent">
                                        <ThreeDotsIcon className="w-5 h-5" />
                                    </Button>
                                }
                            >
                                <StyledDropdownItem className="gap-2">
                                    <EditIcon size={14} /> Editar
                                </StyledDropdownItem>
                                <StyledDropdownItem className="gap-2 text-red-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                                    <TrashIcon size={14} /> Excluir
                                </StyledDropdownItem>
                            </Dropdown>
                            <Button className="px-6 h-[42px] flex items-center gap-2" variant="outline">
                                <DownloadIcon className="w-4.5 h-4.5" />
                                Exportar PDF
                            </Button>
                        </div>

                        {/* Mobile Actions Trigger (handled in bottom bar below) */}
                        <div className="md:hidden flex items-center gap-2">
                             <button onClick={onBack} className="p-2 -ml-2 text-brand-inactive-text">
                                <ChevronLeftIcon size={24} />
                             </button>
                        </div>
                    </div>
                </div>
            </div>

        {/* Scrollable Content */}
        <div 
            className="flex-1 overflow-auto no-scrollbar bg-white dark:bg-dark-surface transition-colors duration-300 scroll-smooth"
            onScroll={handleScroll}
        >
            <div className="max-w-[1400px] mx-auto p-4 md:p-8 pt-6">
                <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                    
                    {/* LEFT COLUMN - MAIN INFO */}
                    <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                        
                        {/* Movement Details Card */}
                        <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden mb-8 shadow-sm">
                            {/* Top: Info (Gray) */}
                            <div className="bg-gray-50 dark:bg-gray-800/50 p-6 border-b border-brand-border dark:border-dark-border">
                                <div className="flex justify-between items-start">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-sm text-brand-inactive-text dark:text-dark-body uppercase font-bold tracking-widest text-[10px]">Motivo da Movimentação</span>
                                        <div className="flex items-center gap-1.5 font-bold text-brand-dark dark:text-dark-heading text-[15px]">
                                            {data.reason}
                                        </div>
                                    </div>
                                    <div className="text-sm text-brand-inactive-text dark:text-dark-body text-right">
                                        <span className="uppercase font-bold tracking-widest text-[10px]">Quantidade</span><br/> 
                                        <strong className={`font-bold text-lg ${isIn ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{isIn ? '+' : '-'}{data.quantity}</strong>
                                    </div>
                                </div>
                            </div>

                            {/* Bottom: Product Info (White) */}
                            <div className="bg-white dark:bg-dark-surface p-6">
                                <div className="flex flex-col md:flex-row md:items-center gap-6">
                                    <div className="flex items-start gap-4 flex-1">
                                        <div className="w-20 h-20 rounded-xl border border-brand-border dark:border-dark-border overflow-hidden flex-shrink-0 bg-white dark:bg-gray-800 shadow-sm">
                                            <img src={data.product.image} className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal" alt={data.product.name} />
                                        </div>
                                        
                                        <div className="flex-1 min-w-0">
                                             <div className="flex justify-between items-start mb-1">
                                                 <h4 className="font-bold text-lg text-brand-dark dark:text-dark-heading truncate pr-4">{data.product.name}</h4>
                                             </div>
                                             
                                             <div className="flex items-center gap-4 mt-2">
                                                <div>
                                                    <div className="text-[10px] uppercase font-bold text-brand-inactive-text dark:text-dark-body mb-0.5 tracking-widest">SKU</div>
                                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{data.product.sku}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] uppercase font-bold text-brand-inactive-text dark:text-dark-body mb-0.5 tracking-widest">Categoria</div>
                                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{data.product.category}</div>
                                                </div>
                                             </div>
                                         </div>
                                    </div>

                                    {/* Separator for mobile, Divider for desktop */}
                                    <div className="w-full h-px md:w-px md:h-12 bg-brand-border dark:bg-dark-border flex-shrink-0 md:mx-2"></div>

                                    <div className="flex items-center justify-between md:justify-start gap-4 md:gap-6 min-w-fit">
                                        <div>
                                            <div className="text-[10px] uppercase font-bold text-brand-inactive-text dark:text-dark-body mb-1 tracking-widest">Anterior</div>
                                            <div className="text-sm font-medium text-brand-dark dark:text-dark-heading">{data.product.previousStock} un</div>
                                        </div>
                                        
                                        <div className="flex items-center justify-center text-brand-inactive-text mt-4">
                                            <ArrowRightIcon size={16} />
                                        </div>

                                        <div>
                                            <div className="text-[10px] uppercase font-bold text-brand-inactive-text dark:text-dark-body mb-1 tracking-widest">Atual</div>
                                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{data.product.currentStock} un</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* RIGHT COLUMN - SIDEBAR */}
                    <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-l-0 xl:border-l border-brand-border dark:border-dark-border mt-8 xl:mt-0 space-y-6">

                        {/* Notes Section */}
                        {data.notes && (
                            <InfoCard 
                                icon={InfoIcon}
                                title="Observações"
                                description={data.notes}
                                RightIcon={null}
                            />
                        )}

                        {/* Sidebar Card */}
                        <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden transition-colors shadow-sm">
                            <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border"></div>

                            {/* Info */}
                            <div className="p-6">
                                <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading mb-6 mt-1 uppercase tracking-widest">
                                    Informações Adicionais
                                </h3>
                                
                                <div className="space-y-6">
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-brand-inactive-text flex-shrink-0 border border-brand-border dark:border-dark-border group-hover:border-brand-dark transition-all duration-300">
                                            <UserIcon size={18} />
                                        </div>
                                        <div>
                                            <div className="text-[10px] uppercase font-bold text-brand-inactive-text dark:text-dark-body mb-0.5 tracking-widest">Registrado por</div>
                                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{data.user}</div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-brand-inactive-text flex-shrink-0 border border-brand-border dark:border-dark-border group-hover:border-brand-dark transition-all duration-300">
                                            <MapPin size={18} />
                                        </div>
                                        <div>
                                            <div className="text-[10px] uppercase font-bold text-brand-inactive-text dark:text-dark-body mb-0.5 tracking-widest">Localização</div>
                                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">Armazém Principal</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-brand-border dark:border-dark-border w-full"></div>

                            {/* Attachments */}
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading uppercase tracking-widest">Anexos</h3>
                                    <Button variant="ghost" className="h-6 px-2 text-xs font-bold" onClick={() => info("Em breve", "Upload de anexos será disponibilizado em breve.")}>
                                        <PlusIcon size={12} className="mr-1" /> Adicionar
                                    </Button>
                                </div>
                                <div className="space-y-3">
                                    <div className="text-center py-6 bg-gray-50 dark:bg-gray-800/30 rounded-xl border-2 border-dashed border-brand-border dark:border-dark-border">
                                        <p className="text-xs font-bold text-brand-inactive-text uppercase tracking-widest">Nenhum anexo</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Mobile Action Bar */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
            <Dropdown
                showChevron={false}
                trigger={
                    <Button variant="outline" className="flex-1 h-[48px] font-bold">
                        <ThreeDotsIcon className="w-4 h-4 mr-2" />
                        Opções
                    </Button>
                }
            >
                <StyledDropdownItem className="gap-2" onClick={handlePrint}>
                    <PrinterIcon size={14} /> Imprimir
                </StyledDropdownItem>
                <StyledDropdownItem className="gap-2 text-red-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                    <TrashIcon size={14} /> Excluir
                </StyledDropdownItem>
            </Dropdown>
            <Button
                className="flex-1 h-[48px] font-bold"
                variant="outline"
            >
                <EditIcon className="w-4 h-4 mr-2" />
                Editar
            </Button>
        </div>
        </div>
    </div>
  );
};

export default StockMovementDetailPage;
