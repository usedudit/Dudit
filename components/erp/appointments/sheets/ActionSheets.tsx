
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Utensils, Briefcase } from 'lucide-react';
import { Button, Input as FormInput, Checkbox, Dropdown, DropdownItem, DatePicker, TimePicker, FormTextarea } from '@/components/reusable';
import { Appointment } from '../types';
import { AppointmentListCard } from '../AppointmentListCard';
import { getEndTime, formatDateStr } from '../utils';
import Portal from '@/components/Portal';
import { createServiceAction } from '@/app/actions/erp/servicos';
import { getServiceMetadataAction, createServiceCategoryAction } from '@/app/actions/erp/service-metadata';
import { createUnavailableTypeAction } from '@/app/actions/erp/unavailable-types';
import { UserProfileImage } from '@/lib/utils/UserProfileImage';
import BottomSheet from '@/components/BottomSheet';
import { useMediaQuery } from '@/components/erp/hooks';
import { formatCurrency } from '@/lib/utils/formatters';
import { XIcon, EditIcon, PlusIcon, ChevronDownIcon, InfoIcon, AlertTriangleIcon } from '@/lib/icons';


const TypeCard = ({ icon: Icon, label, subLabel, selected, onClick, simple = false }: { icon?: any, label: string, subLabel?: string, selected?: boolean, onClick: () => void, simple?: boolean }) => (
    <div
        onClick={onClick}
        className={`
            border rounded-xl p-3 cursor-pointer transition-all flex flex-col items-center justify-center text-center h-[120px] min-w-[140px] relative flex-shrink-0
            ${selected
                ? 'border-brand-green ring-1 ring-brand-green bg-white dark:bg-dark-surface'
                : 'border-brand-border dark:border-dark-border hover:border-brand-green/30 dark:hover:border-brand-green/30 bg-white dark:bg-dark-surface'
            }
        `}
    >
        {simple ? (
            <div className="flex flex-col items-center justify-center gap-2 h-full text-brand-green">
                <div className="w-10 h-10 rounded-full border border-brand-green flex items-center justify-center bg-brand-green/5">
                    <PlusIcon size={20} />
                </div>
                <span className="text-xs font-bold">Novo Tipo</span>
            </div>
        ) : (
            <>
                {Icon && <Icon size={24} className={`mb-2 ${selected ? 'text-brand-green' : 'text-brand-dark dark:text-dark-heading'}`} />}
                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-1 truncate w-full px-1">{label}</span>
                {subLabel && <span className="text-[10px] text-brand-inactive-text leading-tight">{subLabel}</span>}
            </>
        )}
    </div>
)

export const AddUnavailableSheet = ({
    onClose,
    onSave,
    appointment,
    staffMembers = [],
    defaultDate = new Date(),
    unavailableTypes = [],
    partnerId,
    onRefreshServices
}: {
    onClose: () => void,
    onSave?: (data: any) => void,
    appointment?: Appointment | null,
    staffMembers?: any[],
    defaultDate?: Date,
    unavailableTypes?: any[],
    partnerId?: string,
    onRefreshServices?: () => void
}) => {
    const isMobile = useMediaQuery("(max-width: 768px)");
    const isEditing = !!appointment;

    // States for main sheet
    const [selectedType, setSelectedType] = useState(appointment?.service || 'Personalizar');
    const [title, setTitle] = useState(appointment?.service || '');
    const [date, setDate] = useState(appointment?.date || formatDateStr(defaultDate));
    const [startTime, setStartTime] = useState(appointment?.time || '11:00');
    const [endTime, setEndTime] = useState(appointment ? getEndTime(appointment.time, appointment.duration) : '12:00');
    const [selectedStaffId, setSelectedStaffId] = useState(appointment?.staffId || (staffMembers && staffMembers.length > 0 ? staffMembers[0].id : ''));
    const [description, setDescription] = useState(appointment?.notes || '');
    const [recurrence, setRecurrence] = useState<'none' | 'daily' | 'weekly'>('none');

    // States for nested sheet (New Type)
    const [isNewTypeSheetOpen, setIsNewTypeSheetOpen] = useState(false);
    const [newTypeName, setNewTypeName] = useState('');
    const [newTypeDuration, setNewTypeDuration] = useState('60');
    const [isSavingNewType, setIsSavingNewType] = useState(false);

    const selectedStaff = staffMembers?.find(s => s.id === selectedStaffId);

    const handleConfirm = () => {
        if (onSave) {
            const [startH, startM] = startTime.split(':').map(Number);
            const [endH, endM] = endTime.split(':').map(Number);
            const startTotal = startH * 60 + startM;
            const endTotal = endH * 60 + endM;
            const duration = Math.max(15, endTotal - startTotal);

            onSave({
                id: appointment?.id,
                title: title || selectedType,
                type: selectedType,
                date,
                startTime,
                endTime,
                duration,
                staffId: selectedStaffId,
                staff: selectedStaff?.name || 'Profissional',
                description,
                recurrence
            });
        }
    };

    const handleSaveNewType = async () => {
        if (!newTypeName.trim() || !partnerId) return;
        setIsSavingNewType(true);
        try {
            const createRes = await createUnavailableTypeAction({
                partnerId,
                name: newTypeName,
                durationMinutes: Number(newTypeDuration),
                iconName: 'Plus' // Default for now
            });

            if (createRes.success) {
                if (onRefreshServices) onRefreshServices();
                setIsNewTypeSheetOpen(false);
                setNewTypeName('');
                setNewTypeDuration('60');
                setSelectedType(newTypeName);
                setTitle(newTypeName);
            }
        } catch (err) {
            console.error("Error saving new type:", err);
        } finally {
            setIsSavingNewType(false);
        }
    };

    const defaultTypes = [
        { label: 'Personalizar', icon: EditIcon, sub: 'Livre' },
        { label: 'Almoço', icon: Utensils, sub: 'Intervalo' },
        { label: 'Reunião', icon: Briefcase, sub: 'Evento' },
    ];

    const SheetBody = (
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface overflow-hidden">
            {/* Header */}
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                    {isEditing ? 'Detalhes da Indisponibilidade' : 'Adicionar Horário Indisponível'}
                </h2>
                <Button variant="ghost" onClick={onClose} size="icon">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 pb-32">
                {/* Type Selector Carousel */}
                <div>
                    <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">Tipo</label>
                    <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2">
                        {defaultTypes.map(t => (
                            <TypeCard
                                key={t.label}
                                icon={t.icon}
                                label={t.label}
                                subLabel={t.sub}
                                selected={selectedType === t.label}
                                onClick={() => { setSelectedType(t.label); setTitle(t.label === 'Personalizar' ? '' : t.label); }}
                            />
                        ))}
                        {unavailableTypes.map(t => (
                            <TypeCard
                                key={t.id}
                                label={t.name}
                                subLabel={`${t.default_duration} min`}
                                selected={selectedType === t.name}
                                onClick={() => { setSelectedType(t.name); setTitle(t.name); }}
                            />
                        ))}
                        <TypeCard
                            simple
                            label="Novo Tipo"
                            onClick={() => setIsNewTypeSheetOpen(true)}
                        />
                    </div>
                </div>

                {/* Title */}
                <FormInput
                    label="Título (opcional)"
                    name="title"
                    placeholder="Ex: Reunião, Almoço, etc"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                />

                {/* Date and Times */}
                <div className="space-y-4">
                    <DatePicker
                        label="Data"
                        value={date}
                        onChange={(d) => setDate(formatDateStr(d))}
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <TimePicker
                            label="Início"
                            value={startTime}
                            onChange={setStartTime}
                        />
                        <TimePicker
                            label="Término"
                            value={endTime}
                            onChange={setEndTime}
                        />
                    </div>
                </div>

                {/* Collaborator */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-bold text-brand-dark dark:text-dark-heading ml-1">Profissional</label>
                    <Dropdown
                        width="w-full"
                        showChevron={false}
                        trigger={
                            <Button variant="outline" className="w-full h-12">
                                <div className="flex items-center gap-3">
                                    <UserProfileImage
                                        fullName={selectedStaff?.name || 'Selecione'}
                                        className="w-6 h-6"
                                    />
                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{selectedStaff?.name || 'Selecione'}</span>
                                </div>
                                <ChevronDownIcon size={16} className="text-brand-inactive-text" />
                            </Button>
                        }
                    >
                        <div className="max-h-[300px] overflow-y-auto p-1">
                            {staffMembers?.map(staff => (
                                <DropdownItem key={staff.id} onClick={() => setSelectedStaffId(staff.id)} className="gap-3">
                                    <UserProfileImage fullName={staff.name} className="w-6 h-6" />
                                    <span className="font-medium">{staff.name}</span>
                                </DropdownItem>
                            ))}
                        </div>
                    </Dropdown>
                </div>

                {/* Recurrence */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-bold text-brand-dark dark:text-dark-heading ml-1">Repetição</label>
                    <Dropdown
                        width="w-full"
                        showChevron={false}
                        trigger={
                            <Button variant="outline" className="w-full h-12 justify-between px-4">
                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                    {recurrence === 'none' ? 'Não se repete' : recurrence === 'daily' ? 'Diariamente' : 'Semanalmente'}
                                </span>
                                <ChevronDownIcon size={16} className="text-brand-inactive-text" />
                            </Button>
                        }
                    >
                        <div className="p-1">
                            <DropdownItem onClick={() => setRecurrence('none')}>Não se repete</DropdownItem>
                            <DropdownItem onClick={() => setRecurrence('daily')}>Diariamente</DropdownItem>
                            <DropdownItem onClick={() => setRecurrence('weekly')}>Semanalmente</DropdownItem>
                        </div>
                    </Dropdown>
                </div>

                {/* Description */}
                <FormTextarea
                    label="Notas (opcional)"
                    name="description"
                    placeholder="Adicione detalhes aqui..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                />
            </div>

            {/* Footer */}
            <div className="absolute bottom-0 left-0 w-full p-6 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border z-20">
                <Button className="w-full h-[48px] rounded-xl font-bold" onClick={handleConfirm}>
                    {isEditing ? 'Salvar Alterações' : 'Salvar Horário'}
                </Button>
            </div>
        </div>
    );

    const NewTypeSheetBody = (
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface overflow-hidden">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Novo Tipo de Indisponibilidade</h2>
                <Button variant="ghost" onClick={() => setIsNewTypeSheetOpen(false)} size="icon">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-6">
                <FormInput
                    label="Nome do Tipo"
                    name="typeName"
                    placeholder="Ex: Treinamento, Manutenção"
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)}
                />
                <FormInput
                    label="Duração Padrão (minutos)"
                    name="typeDuration"
                    type="number"
                    value={newTypeDuration}
                    onChange={(e) => setNewTypeDuration(e.target.value)}
                />
            </div>

            <footer className="shrink-0 border-t border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => setIsNewTypeSheetOpen(false)}>
                        Cancelar
                    </Button>
                    <Button
                        className="flex-1"
                        isLoading={isSavingNewType}
                        onClick={handleSaveNewType}
                    >
                        Salvar Tipo
                    </Button>
                </div>
            </footer>
        </div>
    );

    if (isMobile) {
        return (
            <>
                <BottomSheet isOpen={true} onClose={onClose}>
                    {SheetBody}
                </BottomSheet>
                <BottomSheet isOpen={isNewTypeSheetOpen} onClose={() => setIsNewTypeSheetOpen(false)}>
                    {NewTypeSheetBody}
                </BottomSheet>
            </>
        );
    }

    return (
        <>
            <Portal>
                <div
                    className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 opacity-100`}
                    onClick={onClose}
                >
                    <div
                        className={`fixed right-4 top-4 bottom-4 w-[520px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 dark:bg-dark-surface ${isNewTypeSheetOpen
                            ? "-translate-x-10 scale-[0.97] opacity-70"
                            : "translate-x-0 opacity-100"
                            }`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {SheetBody}
                    </div>
                </div>
            </Portal>
            <Portal>
                <div
                    className={`fixed inset-0 z-[60] bg-black/50 transition-opacity duration-300 ${isNewTypeSheetOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
                    onClick={() => setIsNewTypeSheetOpen(false)}
                >
                    <div
                        className={`fixed right-4 top-4 bottom-4 w-[520px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isNewTypeSheetOpen ? "translate-x-0" : "translate-x-[120%]"}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {NewTypeSheetBody}
                    </div>
                </div>
            </Portal>
        </>
    );
};

export const MoreAppointmentsSheet = ({ date, appointments, onClose, onViewAppointment }: { date: string, appointments: Appointment[], onClose: () => void, onViewAppointment: (apt: Appointment) => void }) => {
    // ... existing MoreAppointmentsSheet implementation
    const dateObj = new Date(date + 'T00:00:00');
    return (
        <div className="fixed inset-0 z-[60] flex justify-end">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }} className="relative w-full md:w-[400px] h-full bg-white dark:bg-dark-surface shadow-2xl flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-6 py-5 border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface z-10">
                    <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading capitalize">{dateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
                    <button onClick={onClose} className="text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors"><XIcon size={24} /></button>
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
                    <button onClick={onClose} className="text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors"><XIcon size={24} /></button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                    <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl p-4 flex gap-3">
                        <AlertTriangleIcon className="text-red-500 flex-shrink-0" size={20} />
                        <div>
                            <h4 className="text-sm font-bold text-red-700 dark:text-red-400 mb-1">{isCancel ? 'Atenção ao cancelar' : 'Cliente não compareceu?'}</h4>
                            <p className="text-sm text-red-600/80 dark:text-red-300/80 leading-relaxed">{isCancel ? 'Ao cancelar, este agendamento será removido permanentemente da agenda.' : 'A ausência será registrada no histórico do cliente e o horário permanecerá ocupado.'}</p>
                        </div>
                    </div>
                    {/* ... Rest of existing form logic ... */}
                    <div className="bg-[#eff6ff] dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-lg p-3 flex items-start gap-3">
                        <InfoIcon className="text-blue-500 mt-0.5 flex-shrink-0" size={18} />
                        <span className="text-sm text-brand-dark dark:text-dark-body">Nenhuma política de cancelamento foi aplicada a este agendamento</span>
                    </div>
                    <div className="flex items-start gap-3 p-4 border border-brand-border dark:border-dark-border rounded-xl">
                        <div className="flex items-center justify-center w-5 h-5 mt-0.5">
                            <Checkbox checked={true} onChange={() => { }} />
                        </div>
                        <div><span className="block text-sm font-bold text-brand-dark dark:text-dark-heading">Enviar notificação</span><span className="block text-xs text-brand-inactive-text mt-1">Enviar uma mensagem informando ao cliente sobre a atualização do agendamento.</span></div>
                    </div>
                    {isCancel && (
                        <div>
                            <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">Motivo do cancelamento</label>
                            <Dropdown width="w-full" showChevron={false} trigger={<button className="flex items-center justify-between w-full px-4 py-3 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl text-sm font-medium text-brand-inactive-text dark:text-dark-body">{reason}<ChevronDownIcon size={16} /></button>}>
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
                        <div className="border-t border-brand-border dark:border-dark-border my-2 pt-2 flex justify-between items-center"><span className="text-sm font-bold text-brand-dark dark:text-dark-heading">Total a cobrar</span><span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(appointment.price)}</span></div>
                    </div>
                </div>
                <div className="p-6 border-t border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface flex gap-3">
                    <Button variant="outline" className="flex-1 h-[48px]" onClick={onClose}>Voltar</Button>
                    <Button className="flex-1 h-[48px] bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold rounded-xl shadow-lg shadow-red-200 dark:shadow-none" onClick={onConfirm}>{buttonText}</Button>
                </div>
            </motion.div>
        </div>
    )
}
