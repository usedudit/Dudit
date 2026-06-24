

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Button, DatePicker, FormDropdown } from '../../reusable';
import { HistoryTimeline } from '../shared/HistoryTimeline';

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

    const freqOptions = [
        { value: 'Não se repete', label: 'Não se repete' },
        { value: 'Todos os dias', label: 'Todos os dias' },
        { value: 'Semanalmente', label: 'Semanalmente' },
        { value: 'Mensalmente', label: 'Mensalmente' },
        { value: 'Personalizar', label: 'Personalizar' }
    ];

    const termOptions = [
        { value: 'Nunca', label: 'Nunca' },
        { value: 'Data específica', label: 'Data específica' },
        ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 25, 30].map(num => ({
            value: `Após ${num} ocorrências`,
            label: `Após ${num} ocorrências`
        }))
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-1.5">
                <FormDropdown
                    label="Frequência"
                    value={frequency}
                    setValue={setFrequency}
                    options={freqOptions}
                />
            </div>

            {/* Show Termination options only if frequency is NOT "Não se repete" */}
            {frequency !== 'Não se repete' && (
                <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                    <FormDropdown
                        label="Termina"
                        value={termination}
                        setValue={setTermination}
                        options={termOptions}
                    />
                </div>
            )}

            {/* Show DatePicker only if "Data específica" is selected */}
            {frequency !== 'Não se repete' && termination === 'Data específica' && (
                <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                    <DatePicker
                        label="Selecionar data"
                        value={endDate}
                        onChange={(date: Date) => setEndDate(date)}
                        mode="single"
                    />
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

    const entries = logs.map(log => ({
        id: String(log.id),
        actor_name: log.user || 'Sistema',
        change_lines: [log.description],
        created_at: log.timestamp,
        entry_type: log.type
    }));

    return (
        <div className="pt-2">
            <HistoryTimeline
                entries={entries}
                title="Atividade de agendamento"
                emptyMessage="Nenhum histórico encontrado."
            />
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
    const suggestions = [Math.ceil(remaining), Math.ceil(remaining / 5) * 5, Math.ceil(remaining / 10) * 10, Math.ceil(remaining / 50) * 50].filter((v, i, a) => a.indexOf(v) === i && v >= remaining);

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
                    <div className="text-sm font-bold">Restante a pagar • R$ {(remaining - (parseFloat(value) || 0)).toFixed(2)}</div>
                    <Button variant="default" className="bg-black text-white hover:bg-gray-900 rounded-full px-6" onClick={confirm}>Adicionar</Button>
                </div>
            </motion.div>
        </div>
    )
}
