
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MoreHorizontal, Edit3, Utensils, Briefcase, Plus, ChevronDown, ChevronLeft, ChevronRight, Minus, Check, User, Info, AlertCircle, AlertTriangle, ArrowRight, Trash2 } from 'lucide-react';
import { Button, Input as FormInput, Checkbox as FormCheckbox, Dropdown, DropdownItem, Badge } from '../../../reusable';
import { Appointment } from '../types';
import { AppointmentListCard } from '../AppointmentListCard';
import { getEndTime } from '../utils';

// Helper for Calendar within Dropdown
const CalendarContent = ({ onSelect }: { onSelect: (dateStr: string) => void }) => {
    // Mock days for "Janeiro"
    const days = [
        ['', '', '', '', '', '', 1],
        [2, 3, 4, 5, 6, 7, 8],
        [9, 10, 11, 12, 13, 14, 15],
        [16, 17, 18, 19, 20, 21, 22],
        [23, 24, 25, 26, 27, 28, 29],
        [30, 31, '', '', '', '', '']
    ];
    const selectedDay = 12; // Visual mock

    return (
        <div className="p-4 w-[320px]">
            <div className="flex items-center justify-between mb-4">
                <button className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg"><ChevronLeft size={16} /></button>
                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">Janeiro</span>
                <button className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg"><ChevronRight size={16} /></button>
            </div>
            <div className="grid grid-cols-7 text-center mb-2">
                {['seg','ter','qua','qui','sex','sáb','dom'].map(d => (
                    <span key={d} className="text-xs text-brand-inactive-text capitalize">{d}</span>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-y-2">
                {days.map((week, idx) => (
                    <React.Fragment key={idx}>
                        {week.map((d, dIdx) => (
                            <div key={dIdx} className="flex items-center justify-center">
                                {d ? (
                                    <button 
                                        onClick={() => onSelect(`2024-02-24`)} // Hardcoded for demo to match current date
                                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                                            d === selectedDay 
                                            ? 'bg-[#7c3aed] text-white' 
                                            : 'text-brand-dark dark:text-dark-heading hover:bg-gray-100 dark:hover:bg-zinc-800'
                                        }`}
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
    )
}

const TypeCard = ({ icon: Icon, label, subLabel, selected, onClick, simple = false }: { icon: any, label: string, subLabel: string, selected: boolean, onClick: () => void, simple?: boolean }) => (
    <div 
        onClick={onClick}
        className={`
            border rounded-xl p-3 cursor-pointer transition-all flex flex-col items-center justify-center text-center h-[120px] min-w-[140px] relative flex-shrink-0
            ${selected 
                ? 'border-[#7c3aed] ring-1 ring-[#7c3aed] bg-white dark:bg-dark-surface' 
                : 'border-brand-border dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-dark-surface'
            }
        `}
    >
        {simple ? (
            <div className="flex flex-col items-center justify-center gap-2 h-full text-[#7c3aed]">
                <div className="w-8 h-8 rounded-full border border-[#7c3aed] flex items-center justify-center">
                    <Plus size={16} />
                </div>
                <span className="text-sm font-bold opacity-80 group-hover:opacity-100"></span> 
            </div>
        ) : (
            <>
                <Icon size={24} className={`mb-2 ${selected ? 'text-[#7c3aed]' : 'text-brand-dark dark:text-dark-heading'}`} />
                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-1">{label}</span>
                <span className="text-[10px] text-brand-inactive-text leading-tight">{subLabel}</span>
            </>
        )}
    </div>
)

export const AddUnavailableSheet = ({ onClose, onSave, appointment }: { onClose: () => void, onSave?: (data: any) => void, appointment?: Appointment | null }) => {
    // Initial State Logic
    const isEditing = !!appointment;
    
    // Determine initial type
    const initialType = appointment 
        ? (appointment.service === 'Almoço' ? 'Almoço' : 'Personalizar') 
        : 'Personalizar';

    const [selectedType, setSelectedType] = useState(initialType);
    const [title, setTitle] = useState(appointment?.service || '');
    const [date, setDate] = useState(appointment?.date || '2024-02-24');
    const [startTime, setStartTime] = useState(appointment?.time || '11:00');
    
    // Calculate initial End Time based on duration if editing
    const initialEndTime = appointment 
        ? getEndTime(appointment.time, appointment.duration) 
        : '12:00';
        
    const [endTime, setEndTime] = useState(initialEndTime);
    const [collaborator, setCollaborator] = useState(appointment?.staff || 'Ana Silva');
    const [frequency, setFrequency] = useState('Não se repete');
    const [description, setDescription] = useState(appointment?.notes || '');

    const handleConfirm = () => {
        if (onSave) {
            // Calculate duration
            const [startH, startM] = startTime.split(':').map(Number);
            const [endH, endM] = endTime.split(':').map(Number);
            const startTotal = startH * 60 + startM;
            const endTotal = endH * 60 + endM;
            const duration = Math.max(15, endTotal - startTotal);

            const newItem = {
                id: appointment?.id, // Pass ID if editing
                title: title || selectedType,
                type: selectedType, 
                date,
                startTime,
                endTime,
                duration,
                staff: collaborator,
                description
            };
            onSave(newItem);
        }
    };

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
                className="relative w-full md:w-[500px] h-full bg-white dark:bg-dark-surface shadow-2xl flex flex-col overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface z-10">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                            {isEditing ? 'Detalhes do horário indisponível' : 'Adicionar horário indisponível'}
                        </h2>
                        {isEditing && (
                             <button className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
                                <Trash2 size={20} className="text-red-500" />
                            </button>
                        )}
                    </div>
                    <button onClick={onClose} className="text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                    
                    {/* Type Selector */}
                    <div>
                        <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">Tipo de horário indisponível</label>
                        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                            <TypeCard 
                                icon={Edit3} 
                                label="Personalizar" 
                                subLabel="Novo horário indisponível" 
                                selected={selectedType === 'Personalizar'} 
                                onClick={() => setSelectedType('Personalizar')} 
                            />
                            <TypeCard 
                                icon={Utensils} 
                                label="Almoço" 
                                subLabel="30min • Não pago" 
                                selected={selectedType === 'Almoço'} 
                                onClick={() => { setSelectedType('Almoço'); setTitle('Almoço'); }} 
                            />
                            {/* Arrow right visual hint */}
                            <button className="w-12 h-[120px] rounded-xl border border-brand-border dark:border-dark-border flex items-center justify-center flex-shrink-0 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
                                <ArrowRight size={20} className="text-brand-inactive-text" />
                            </button>
                        </div>
                    </div>

                    {/* Title */}
                    <FormInput 
                        label="Título (opcional)" 
                        name="title" 
                        placeholder="por exemplo, reunião de almoço" 
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />

                    {/* Date */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-bold text-brand-dark dark:text-dark-heading">Data</label>
                        <Dropdown 
                            width="w-auto" 
                            showChevron={false}
                            trigger={
                                <button className="flex items-center justify-between w-full h-[42px] px-3 border border-brand-border dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm font-medium text-brand-dark dark:text-dark-heading">
                                    {date} <ChevronDown size={16} className="text-brand-inactive-text" />
                                </button>
                            }
                        >
                            <CalendarContent onSelect={(d) => setDate(d)} />
                        </Dropdown>
                    </div>

                    {/* Time */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-bold text-brand-dark dark:text-dark-heading">Horário de início</label>
                            <Dropdown width="w-full" showChevron={false} trigger={<button className="flex items-center justify-between w-full h-[42px] px-3 border border-brand-border dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm font-medium text-brand-dark dark:text-dark-heading">{startTime} <ChevronDown size={16} className="text-brand-inactive-text" /></button>}>
                                <DropdownItem onClick={() => setStartTime('11:00')}>11:00</DropdownItem>
                                <DropdownItem onClick={() => setStartTime('12:00')}>12:00</DropdownItem>
                                <DropdownItem onClick={() => setStartTime('13:00')}>13:00</DropdownItem>
                            </Dropdown>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-bold text-brand-dark dark:text-dark-heading">Horário de término</label>
                            <Dropdown width="w-full" showChevron={false} trigger={<button className="flex items-center justify-between w-full h-[42px] px-3 border border-brand-border dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm font-medium text-brand-dark dark:text-dark-heading">{endTime} <ChevronDown size={16} className="text-brand-inactive-text" /></button>}>
                                <DropdownItem onClick={() => setEndTime('12:00')}>12:00</DropdownItem>
                                <DropdownItem onClick={() => setEndTime('13:00')}>13:00</DropdownItem>
                                <DropdownItem onClick={() => setEndTime('14:00')}>14:00</DropdownItem>
                            </Dropdown>
                            <div className="text-xs text-brand-inactive-text mt-1">Duração calculada</div>
                        </div>
                    </div>

                    {/* Collaborator */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-bold text-brand-dark dark:text-dark-heading">Colaboradores</label>
                        <Dropdown width="w-full" showChevron={false} trigger={
                            <button className="flex items-center justify-between w-full h-[42px] px-3 border border-brand-border dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm font-medium text-brand-dark dark:text-dark-heading">
                                <div className="flex items-center gap-2">
                                    <img src="https://i.pravatar.cc/150?u=20" className="w-5 h-5 rounded-full" />
                                    {collaborator}
                                </div>
                                <ChevronDown size={16} className="text-brand-inactive-text" />
                            </button>
                        }>
                            <DropdownItem onClick={() => setCollaborator('Ana Silva')}>Ana Silva</DropdownItem>
                            <DropdownItem onClick={() => setCollaborator('Carlos Lima')}>Carlos Lima</DropdownItem>
                        </Dropdown>
                    </div>

                    {/* Frequency */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-bold text-brand-dark dark:text-dark-heading">Frequência</label>
                        <Dropdown width="w-full" showChevron={false} trigger={<button className="flex items-center justify-between w-full h-[42px] px-3 border border-brand-border dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm font-medium text-brand-dark dark:text-dark-heading">{frequency} <ChevronDown size={16} className="text-brand-inactive-text" /></button>}>
                            <DropdownItem onClick={() => setFrequency('Não se repete')}>Não se repete</DropdownItem>
                            <DropdownItem onClick={() => setFrequency('Diariamente')}>Diariamente</DropdownItem>
                            <DropdownItem onClick={() => setFrequency('Semanalmente')}>Semanalmente</DropdownItem>
                        </Dropdown>
                    </div>

                    {/* Description */}
                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <label className="text-sm font-bold text-brand-dark dark:text-dark-heading">Descrição (opcional)</label>
                            <span className="text-xs text-brand-inactive-text">{description.length}/255</span>
                        </div>
                        <textarea 
                            className="w-full h-32 p-3 border border-brand-border dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-sm focus:outline-none focus:ring-1 focus:ring-brand-dark placeholder:text-gray-400 dark:placeholder:text-gray-600 resize-none"
                            placeholder="Adicionar descrição ou nota"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                    <Button variant="default" className="w-full h-[48px] bg-[#111827] hover:bg-black text-white font-bold rounded-xl" onClick={handleConfirm}>
                        {isEditing ? 'Salvar alterações' : 'Salvar'}
                    </Button>
                </div>
            </motion.div>
        </div>
    )
}

export const MoreAppointmentsSheet = ({ date, appointments, onClose, onViewAppointment }: { date: string, appointments: Appointment[], onClose: () => void, onViewAppointment: (apt: Appointment) => void }) => {
    // ... existing MoreAppointmentsSheet implementation
    const dateObj = new Date(date + 'T00:00:00'); 
    return (
        <div className="fixed inset-0 z-[60] flex justify-end">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }} className="relative w-full md:w-[400px] h-full bg-white dark:bg-dark-surface shadow-2xl flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-6 py-5 border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface z-10">
                    <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading capitalize">{dateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
                    <button onClick={onClose} className="text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors"><X size={24} /></button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
                    {appointments.length === 0 ? <div className="text-center text-brand-inactive-text py-10">No appointments.</div> : appointments.map(apt => <AppointmentListCard key={apt.id} appointment={apt} onClick={onViewAppointment} />)}
                </div>
            </motion.div>
        </div>
    )
}

export const StatusActionSheet = ({ type, appointment, onClose, onConfirm }: { type: 'cancel' | 'absence', appointment: Appointment, onClose: () => void, onConfirm: () => void }) => {
    // ... existing StatusActionSheet implementation
    const isCancel = type === 'cancel';
    const title = isCancel ? "Cancelar agendamento" : "Marcar como ausência";
    const buttonText = isCancel ? "Confirmar cancelamento" : 'Confirmar ausência';
    const [reason, setReason] = useState('Nenhum motivo informado');

    return (
        <div className="fixed inset-0 z-[70] flex justify-end">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }} className="relative w-full md:w-[500px] h-full bg-white dark:bg-dark-surface shadow-2xl flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-6 py-5 border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface z-10">
                    <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{title}</h2>
                    <button onClick={onClose} className="text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors"><X size={24} /></button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                    <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl p-4 flex gap-3">
                        <AlertTriangle className="text-red-500 flex-shrink-0" size={20} />
                        <div>
                            <h4 className="text-sm font-bold text-red-700 dark:text-red-400 mb-1">{isCancel ? 'Atenção ao cancelar' : 'Cliente não compareceu?'}</h4>
                            <p className="text-sm text-red-600/80 dark:text-red-300/80 leading-relaxed">{isCancel ? 'Ao cancelar, este agendamento será removido permanentemente da agenda.' : 'A ausência será registrada no histórico do cliente e o horário permanecerá ocupado.'}</p>
                        </div>
                    </div>
                    {/* ... Rest of existing form logic ... */}
                    <div className="bg-[#eff6ff] dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-lg p-3 flex items-start gap-3">
                        <Info className="text-blue-500 mt-0.5 flex-shrink-0" size={18} />
                        <span className="text-sm text-brand-dark dark:text-dark-body">Nenhuma política de cancelamento foi aplicada a este agendamento</span>
                    </div>
                    <div className="flex items-start gap-3 p-4 border border-brand-border dark:border-dark-border rounded-xl">
                        <div className="flex items-center justify-center w-5 h-5 mt-0.5">
                            <FormCheckbox checked={true} onChange={() => {}} />
                        </div>
                        <div><span className="block text-sm font-bold text-brand-dark dark:text-dark-heading">Enviar notificação</span><span className="block text-xs text-brand-inactive-text mt-1">Enviar uma mensagem informando ao cliente sobre a atualização do agendamento.</span></div>
                    </div>
                    {isCancel && (
                        <div>
                            <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">Motivo do cancelamento</label>
                            <Dropdown width="w-full" showChevron={false} trigger={<button className="flex items-center justify-between w-full px-4 py-3 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl text-sm font-medium text-brand-inactive-text dark:text-dark-body">{reason}<ChevronDown size={16} /></button>}>
                                <DropdownItem onClick={() => setReason('Nenhum motivo informado')}>Nenhum motivo informado</DropdownItem>
                                <DropdownItem onClick={() => setReason('Agendamento duplicado')}>Agendamento duplicado</DropdownItem>
                                <DropdownItem onClick={() => setReason('Agendamento feito por engano')}>Agendamento feito por engano</DropdownItem>
                                <DropdownItem onClick={() => setReason('Cliente indisponível')}>Cliente indisponível</DropdownItem>
                            </Dropdown>
                        </div>
                    )}
                    <div className="p-4 bg-gray-50 dark:bg-zinc-900/50 rounded-xl border border-brand-border dark:border-dark-border">
                        <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">Resumo</h4>
                        <div className="flex justify-between items-center text-sm mb-2"><span className="text-brand-inactive-text">Serviço</span><span className="font-medium text-brand-dark dark:text-dark-heading">{appointment.service}</span></div>
                        <div className="flex justify-between items-center text-sm mb-2"><span className="text-brand-inactive-text">Cliente</span><span className="font-medium text-brand-dark dark:text-dark-heading">{appointment.customer}</span></div>
                        <div className="border-t border-brand-border dark:border-dark-border my-2 pt-2 flex justify-between items-center"><span className="text-sm font-bold text-brand-dark dark:text-dark-heading">Total a cobrar</span><span className="text-sm font-bold text-brand-dark dark:text-dark-heading">R$ 0,00</span></div>
                    </div>
                </div>
                <div className="p-6 border-t border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface flex gap-3">
                    <Button variant="outline" className="flex-1 h-[48px] rounded-xl font-bold" onClick={onClose}>Voltar</Button>
                    <Button className="flex-1 h-[48px] bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold rounded-xl shadow-lg shadow-red-200 dark:shadow-none" onClick={onConfirm}>{buttonText}</Button>
                </div>
            </motion.div>
        </div>
    )
}
