
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import Dropdown, { DropdownItem } from '../../Dropdown';
import Button from '../../Button';

export const TopSelectionBar = ({ onClose, onViewSheet }: { onClose: () => void, onViewSheet: () => void }) => {
    return (
        <motion.div 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="absolute top-0 left-0 w-full h-[60px] bg-brand-dark z-50 flex items-center justify-between px-6 shadow-md"
        >
            <div className="flex gap-3">
                <button onClick={onViewSheet} className="px-4 py-1.5 rounded-full bg-white/20 text-white text-xs font-bold hover:bg-white/30 transition-colors">
                    Ver horários disponíveis
                </button>
                <button onClick={onClose} className="px-4 py-1.5 rounded-full bg-white text-brand-dark text-xs font-bold hover:bg-gray-100 transition-colors">
                    Fechar
                </button>
            </div>
            
            <h3 className="text-white font-bold text-sm hidden sm:block">Selecione um horário para reservar</h3>
        </motion.div>
    )
}

interface RecurrenceViewProps {
    frequency: string;
    setFrequency: (val: string) => void;
    termination: string;
    setTermination: (val: string) => void;
    endDate: Date;
    setEndDate: (date: Date) => void;
}

export const RecurrenceView = ({ 
    frequency, 
    setFrequency, 
    termination, 
    setTermination, 
    endDate, 
    setEndDate 
}: RecurrenceViewProps) => {
    
    // Mock Calendar Data for "Janeiro 2026" based on image
    const days = [
        ['', '', '', 1, 2, 3, 4],
        [5, 6, 7, 8, 9, 10, 11],
        [12, 13, 14, 15, 16, 17, 18],
        [19, 20, 21, 22, 23, 24, 25],
        [26, 27, 28, 29, 30, 31, '']
    ];

    const selectedDay = endDate.getDate();

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-brand-dark dark:text-dark-heading">Frequência</label>
                <Dropdown 
                    width="w-full" 
                    showChevron={false}
                    trigger={
                        <button className="flex items-center justify-between w-full h-[42px] px-3 border border-brand-border dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm font-medium text-brand-dark dark:text-dark-heading transition-all focus:border-brand-dark focus:ring-1 focus:ring-brand-dark">
                            {frequency} 
                            <ChevronDown size={16} className="text-brand-inactive-text" />
                        </button>
                    }
                >
                    <DropdownItem onClick={() => setFrequency('Não se repete')}>Não se repete</DropdownItem>
                    <div className="h-px bg-gray-100 dark:bg-dark-border my-1"></div>
                    <DropdownItem onClick={() => setFrequency('Todos os dias')}>Todos os dias</DropdownItem>
                    <DropdownItem onClick={() => setFrequency('Semanalmente')}>Semanalmente</DropdownItem>
                    <DropdownItem onClick={() => setFrequency('Mensalmente')}>Mensalmente</DropdownItem>
                    <DropdownItem onClick={() => setFrequency('Personalizar')}>Personalizar</DropdownItem>
                </Dropdown>
            </div>

            {/* Show Termination options only if frequency is NOT "Não se repete" */}
            {frequency !== 'Não se repete' && (
                <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                    <label className="text-sm font-bold text-brand-dark dark:text-dark-heading">Termina</label>
                    <Dropdown 
                        width="w-full" 
                        showChevron={false}
                        trigger={
                            <button className="flex items-center justify-between w-full h-[42px] px-3 border border-brand-border dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm font-medium text-brand-dark dark:text-dark-heading focus:border-brand-dark focus:ring-1 focus:ring-brand-dark">
                                {termination} 
                                <ChevronDown size={16} className="text-brand-inactive-text" />
                            </button>
                        }
                    >
                        <DropdownItem onClick={() => setTermination('Nunca')}>Nunca</DropdownItem>
                        <DropdownItem onClick={() => setTermination('Data específica')}>Data específica</DropdownItem>
                        <div className="h-px bg-gray-100 dark:bg-dark-border my-1"></div>
                        {/* Mock options matching screenshot style */}
                        {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 25, 30].map(num => (
                            <DropdownItem key={num} onClick={() => setTermination(`Após ${num} ocorrências`)}>
                                Após {num} ocorrências
                            </DropdownItem>
                        ))}
                    </Dropdown>
                </div>
            )}

            {/* Show Calendar only if "Data específica" is selected */}
            {frequency !== 'Não se repete' && termination === 'Data específica' && (
                <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                    <label className="text-sm font-bold text-brand-dark dark:text-dark-heading">Selecionar data</label>
                    <div className="border border-brand-border dark:border-dark-border rounded-xl p-4 bg-white dark:bg-dark-surface shadow-sm w-full max-w-xs">
                        <div className="flex items-center justify-between mb-4">
                            <button className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"><ChevronLeft size={16}/></button>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">Janeiro 2026</span>
                            <button className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"><ChevronRight size={16}/></button>
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-center text-xs text-brand-inactive-text mb-2 capitalize">
                            <span>segunda</span><span>terça</span><span>quarta</span><span>quinta</span><span>sexta</span><span>sábado</span><span>domingo</span>
                        </div>
                        <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center text-sm">
                            {days.map((week, wIdx) => (
                                <React.Fragment key={wIdx}>
                                    {week.map((d, dIdx) => (
                                        <div key={`${wIdx}-${dIdx}`} className="flex items-center justify-center">
                                            {d ? (
                                                <button 
                                                    onClick={() => {
                                                        const newDate = new Date(endDate);
                                                        newDate.setDate(d as number);
                                                        setEndDate(newDate);
                                                    }}
                                                    className={`
                                                        w-8 h-8 flex items-center justify-center rounded-full transition-all duration-200
                                                        ${d === selectedDay 
                                                            ? 'border border-gray-300 dark:border-gray-600 font-bold text-brand-dark dark:text-dark-heading shadow-sm' 
                                                            : 'text-brand-dark dark:text-dark-heading hover:bg-gray-100 dark:hover:bg-zinc-800'
                                                        }
                                                    `}
                                                >
                                                    {d}
                                                </button>
                                            ) : <div className="w-8 h-8"></div>}
                                        </div>
                                    ))}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export const ActivityLog = ({ activity }: { activity?: any[] }) => {
    // Fallback if no activity
    const logs = activity || [
        { 
            id: 1, 
            type: 'created', 
            description: 'Agendamento criado', 
            timestamp: new Date().toISOString(),
            user: 'Sistema' 
        }
    ];

    return (
        <div className="pt-2">
            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Atividade de agendamento</h3>
            
            <div className="relative pl-4 space-y-8">
                {/* Vertical Line */}
                <div className="absolute left-[5.5px] top-2 bottom-0 w-px bg-gray-200 dark:bg-gray-700"></div>

                {logs.map((log: any) => (
                    <div key={log.id} className="relative pl-6">
                        <div className={`absolute left-0 top-1.5 w-3 h-3 rounded-full border-2 border-white dark:border-dark-surface z-10 ${log.type === 'payment' ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-600'}`}></div>
                        <div className="p-0">
                            <div className="font-bold text-sm text-brand-dark dark:text-dark-heading mb-1">{log.description}</div>
                            <div className="text-xs text-brand-inactive-text mb-1">{new Date(log.timestamp).toLocaleString()}</div>
                            <p className="text-xs text-brand-dark dark:text-dark-body opacity-70">
                                {log.type === 'created' ? 'Criado por' : 'Atualizado por'} <span className="font-bold">{log.user || 'Desconhecido'}</span>
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

export const PaymentOptionCard = ({ icon: Icon, label, onClick, color }: any) => (
    <button 
        onClick={onClick}
        className="flex flex-col items-center justify-center gap-3 p-4 border rounded-xl hover:bg-gray-50 transition-colors h-24"
    >
        <Icon size={24} className={color || 'text-brand-dark'} />
        <span className="text-xs font-bold text-center leading-tight">{label}</span>
    </button>
)

export const NumpadModal = ({ title, total, remaining, onConfirm, onClose }: any) => {
    const [value, setValue] = useState('');
    
    const handleNum = (num: string) => {
        if (num === '.' && value.includes('.')) return;
        setValue(prev => prev + num);
    };
    
    const handleBackspace = () => {
        setValue(prev => prev.slice(0, -1));
    };

    const confirm = () => {
        const amount = parseFloat(value) || 0;
        onConfirm(amount);
    }

    // Quick add suggestions (e.g. next 5, 10, 20, 50)
    const suggestions = [Math.ceil(remaining), Math.ceil(remaining/5)*5, Math.ceil(remaining/10)*10, Math.ceil(remaining/50)*50].filter((v, i, a) => a.indexOf(v) === i && v >= remaining);

    return (
        <div className="absolute inset-0 z-[80] flex items-end justify-center sm:items-center p-4">
             <div className="absolute inset-0 bg-black/20" onClick={onClose}></div>
             <motion.div 
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                className="bg-white dark:bg-dark-surface w-full max-w-sm rounded-2xl p-6 relative z-10 shadow-2xl"
            >
                <div className="flex justify-between items-start mb-6">
                    <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading pr-8 leading-tight">{title}</h3>
                    <button onClick={onClose}><X size={20} /></button>
                </div>
                
                <div className="text-center mb-6">
                     <span className="text-4xl font-bold text-brand-dark dark:text-dark-heading">R$ {value || '0.00'}</span>
                     <div className="h-0.5 w-24 bg-gray-200 mx-auto mt-2"></div>
                </div>

                <div className="flex gap-2 overflow-x-auto no-scrollbar mb-6">
                    {suggestions.map(s => (
                        <button key={s} onClick={() => setValue(s.toString())} className="border rounded-full px-4 py-1 text-sm whitespace-nowrap hover:bg-gray-50">R$ {s}</button>
                    ))}
                </div>

                <div className="grid grid-cols-3 gap-3 mb-6">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0].map(n => (
                        <button 
                            key={n} 
                            onClick={() => handleNum(n.toString())}
                            className="h-14 rounded-full border border-gray-200 text-xl font-bold hover:bg-gray-50 active:bg-gray-100 transition-colors"
                        >
                            {n}
                        </button>
                    ))}
                    <button onClick={handleBackspace} className="h-14 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 active:bg-gray-100">
                        <X size={24} className="rotate-45" /> {/* Backspace icon sim */}
                        ⌫
                    </button>
                </div>

                <div className="flex items-center justify-between">
                    <div className="text-sm font-bold">Restante a pagar • R$ {(remaining - (parseFloat(value)||0)).toFixed(2)}</div>
                    <Button variant="default" className="bg-black text-white hover:bg-gray-900 rounded-full px-6" onClick={confirm}>Adicionar</Button>
                </div>
            </motion.div>
        </div>
    )
}
