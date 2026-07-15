
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Utensils, Briefcase } from 'lucide-react';
import { Button, DefaultModal, Input as FormInput, Checkbox, Dropdown, DropdownItem, DatePicker, TimePicker, FormTextarea, RadioButton, FormDropdown, IconPlaceholder } from '@/components/reusable';
import AlertModal from "@/components/reusable/AlertModal"
import { Appointment } from '../types';
import { AppointmentListCard } from '../AppointmentListCard';
import { getEndTime, formatDateStr } from '../utils';
import Portal from '@/components/Portal';
import { createUnavailableTypeAction, deleteUnavailableTypeAction } from '@/app/actions/erp/unavailable-types';
import { UserProfileImage } from '@/lib/utils/UserProfileImage';
import BottomSheet from '@/components/BottomSheet';
import { useMediaQuery } from '@/components/erp/hooks';
import { formatCurrency } from '@/lib/utils/formatters';
import { XIcon, EditIcon, PlusIcon, ChevronDownIcon, InfoIcon, AlertTriangleIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, SearchIcon, CalendarIcon } from '@/lib/icons';
import { useRef } from 'react';

const emojis = ["⏰", "☕", "🍴", "🍽️", "🤝", "💻", "📞", "📅", "🚫", "💤", "🚗", "🚶", "🏢", "🏠", "⚠️", "💡", "🛠️", "🩺", "✂️", "🧘", "🚿", "🏋️", "🍕", "🧴", "🧼"];

const TypeCard = ({ icon, label, subLabel, selected, onClick, simple = false, onDelete }: { icon?: any, label: string, subLabel?: string, selected?: boolean, onClick: () => void, simple?: boolean, onDelete?: () => void }) => {
    const isEmoji = typeof icon === 'string' && icon.length > 0;
    const IconComponent = !isEmoji ? icon : null;

    return (
        <div
            onClick={onClick}
            className={`
                border rounded-xl p-3 cursor-pointer transition-all flex flex-col items-center justify-center text-center h-[110px] min-w-[130px] relative flex-shrink-0
                ${selected
                    ? 'border-brand-green ring-1 ring-brand-green bg-white dark:bg-dark-surface shadow-sm'
                    : 'border-brand-border dark:border-dark-border hover:border-brand-green/30 dark:hover:border-brand-green/30 bg-white dark:bg-dark-surface'
                }
            `}
        >
            {onDelete && (
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className={`absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-md border border-brand-red/20 text-brand-red hover:bg-brand-red/5 hover:border-brand-red/50 dark:text-brand-red dark:border-brand-red/20 dark:hover:bg-brand-red/10 transition-all z-10 bg-white dark:bg-dark-surface shadow-sm ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                >
                    <XIcon size={12} />
                </button>
            )}
            {simple ? (
                <div className="flex flex-col items-center justify-center gap-2 h-full text-brand-green">
                    <div className="w-10 h-10 rounded-full border border-brand-green flex items-center justify-center bg-brand-green/5">
                        <PlusIcon size={20} />
                    </div>
                    <span className="text-xs font-bold">Novo tipo</span>
                </div>
            ) : (
                <>
                    {icon && (
                        isEmoji ? (
                            <span className="text-2xl mb-2">{icon}</span>
                        ) : (
                            <IconComponent size={24} className={`mb-2 ${selected ? 'text-brand-green' : 'text-brand-dark dark:text-dark-heading'}`} />
                        )
                    )}
                    {!icon && <ClockIcon size={24} className={`mb-2 ${selected ? 'text-brand-green' : 'text-brand-dark dark:text-dark-heading'}`} />}
                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-1 truncate w-full px-1">{label}</span>
                    {subLabel && <span className="text-[10px] text-brand-inactive-text leading-tight">{subLabel}</span>}
                </>
            )}
        </div>
    );
}

export const AddUnavailableSheet = ({
    onClose,
    onSave,
    onDelete,
    appointment,
    staffMembers = [],
    defaultDate = new Date(),
    unavailableTypes = [],
    partnerId,
    onRefreshServices,
    initialTimeSlot,
    initialStaffId,
}: {
    onClose: () => void,
    onSave?: (data: any) => void,
    onDelete?: (id: string, deleteAll: boolean, category: string) => void,
    appointment?: Appointment | null,
    staffMembers?: any[],
    defaultDate?: Date,
    unavailableTypes?: any[],
    partnerId?: string,
    onRefreshServices?: () => void,
    initialTimeSlot?: string,
    initialStaffId?: string,
}) => {
    const isMobile = useMediaQuery("(max-width: 768px)");
    const isEditing = !!appointment;

    // States for main sheet
    const [selectedType, setSelectedType] = useState(appointment?.service || 'Personalizar');
    const [title, setTitle] = useState(appointment?.service || '');
    const [date, setDate] = useState(appointment?.date || formatDateStr(defaultDate));
    const [startTime, setStartTime] = useState(appointment?.time || initialTimeSlot || '11:00');
    const [endTime, setEndTime] = useState(
        appointment
            ? getEndTime(appointment.time, appointment.duration)
            : initialTimeSlot
                ? getEndTime(initialTimeSlot, 60)
                : '12:00'
    );

    // MULTI-STAFF SELECTION
    const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>(
        appointment?.staffId
            ? [appointment.staffId]
            : initialStaffId
                ? [initialStaffId]
                : []
    );

    const [description, setDescription] = useState(appointment?.notes || '');
    const [recurrence, setRecurrence] = useState<'none' | 'daily' | 'weekly'>(
        (appointment as any)?.recurrence || 'none'
    );

    // RECURRENCE END LOGIC
    const [recurrenceEndType, setRecurrenceEndType] = useState<'never' | 'date' | 'count'>('never');
    const [recurrenceEndDate, setRecurrenceEndDate] = useState<string>(formatDateStr(new Date()));
    const [recurrenceCount, setRecurrenceCount] = useState<number>(10);

    // States for nested sheet (New Type)
    const [isNewTypeSheetOpen, setIsNewTypeSheetOpen] = useState(false);
    const [newTypeName, setNewTypeName] = useState('');
    const [newTypeDuration, setNewTypeDuration] = useState('60');
    const [isSavingNewType, setIsSavingNewType] = useState(false);
    const [newTypeEmoji, setNewTypeEmoji] = useState('⏰');
    const [isEmojiModalOpen, setIsEmojiModalOpen] = useState(false);

    // DELETION MODAL STATE
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteOption, setDeleteOption] = useState<'single' | 'series'>('single');

    // TYPE DELETION STATE
    const [isDeleteTypeModalOpen, setIsDeleteTypeModalOpen] = useState(false);
    const [typeToDelete, setTypeToDelete] = useState<any>(null);

    // Horizontal Scroll Ref
    const scrollRef = useRef<HTMLDivElement>(null);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const { current } = scrollRef;
            const scrollAmount = 300;
            current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
        }
    };

    const handleConfirm = () => {
        if (onSave) {
            const [startH, startM] = startTime.split(':').map(Number);
            const [endH, endM] = endTime.split(':').map(Number);
            const startTotal = startH * 60 + startM;
            const endTotal = endH * 60 + endM;
            const duration = Math.max(15, endTotal - startTotal);

            // If multi-staff is selected, the parent might need to handle it as multiple entries
            onSave({
                id: appointment?.id,
                title: title || selectedType,
                type: selectedType,
                date,
                startTime,
                endTime,
                duration,
                staffIds: selectedStaffIds,
                // Fallback for single staff compatibility
                staffId: selectedStaffIds[0] || '',
                staff: selectedStaffIds.map(id => staffMembers.find(s => s.id === id)?.name).filter(Boolean).join(', '),
                description,
                recurrence,
                recurrenceEnd: {
                    type: recurrenceEndType,
                    date: recurrenceEndType === 'date' ? recurrenceEndDate : null,
                    count: recurrenceEndType === 'count' ? recurrenceCount : null
                }
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
                iconName: newTypeEmoji
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

    const handleDeleteType = async () => {
        if (!typeToDelete || !partnerId) return;
        try {
            await deleteUnavailableTypeAction(typeToDelete.id, partnerId);
            if (onRefreshServices) onRefreshServices();
        } catch (err) {
            console.error("Error deleting type:", err);
        } finally {
            setIsDeleteTypeModalOpen(false);
            setTypeToDelete(null);
        }
    };

    const defaultTypes = [
        { label: 'Personalizar', icon: EditIcon, sub: 'Livre' },
        { label: 'Almoço', icon: Utensils, sub: 'Intervalo' },
        { label: 'Reunião', icon: Briefcase, sub: 'Evento' },
    ];

    const toggleStaff = (id: string) => {
        setSelectedStaffIds(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const SheetBody = (
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface overflow-hidden">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                    {isEditing ? 'Detalhes da Indisponibilidade' : 'Adicionar Horário Indisponível'}
                </h2>
                <Button variant="filled" onClick={onClose} size="icon">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 pb-32">
                {/* Type Selector */}
                <div className="relative group/types">
                    <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-3 px-1">Tipo</label>

                    {/* Shadow indicators */}
                    <div className="absolute left-0 top-[44px] bottom-[8px] w-12 bg-gradient-to-r from-white dark:from-dark-surface to-transparent z-10 pointer-events-none opacity-0 group-hover/types:opacity-100 transition-opacity"></div>
                    <div className="absolute right-0 top-[44px] bottom-[8px] w-12 bg-gradient-to-l from-white dark:from-dark-surface to-transparent z-10 pointer-events-none opacity-0 group-hover/types:opacity-100 transition-opacity"></div>

                    {/* Navigation Buttons */}
                    <button
                        onClick={() => scroll('left')}
                        className="absolute left-1 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-white/90 dark:bg-zinc-800/90 shadow-lg border border-brand-border dark:border-dark-border opacity-0 group-hover/types:opacity-100 transition-opacity hover:scale-110 active:scale-95"
                    >
                        <ChevronLeftIcon size={20} className="text-brand-dark dark:text-dark-heading" />
                    </button>
                    <button
                        onClick={() => scroll('right')}
                        className="absolute right-1 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-white/90 dark:bg-zinc-800/90 shadow-lg border border-brand-border dark:border-dark-border opacity-0 group-hover/types:opacity-100 transition-opacity hover:scale-110 active:scale-95"
                    >
                        <ChevronRightIcon size={20} className="text-brand-dark dark:text-dark-heading" />
                    </button>

                    <div
                        ref={scrollRef}
                        className="flex gap-3 overflow-x-auto hide-scrollbar pb-2 px-1 relative scroll-smooth"
                    >
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
                                icon={t.icon_name}
                                label={t.name}
                                subLabel={`${t.default_duration} min`}
                                selected={selectedType === t.name}
                                onClick={() => { setSelectedType(t.name); setTitle(t.name); }}
                                onDelete={() => { setTypeToDelete(t); setIsDeleteTypeModalOpen(true); }}
                            />
                        ))}
                        <TypeCard simple label="Novo tipo" onClick={() => setIsNewTypeSheetOpen(true)} />
                    </div>
                </div>

                <FormInput
                    label="Título (opcional)"
                    name="title"
                    placeholder="Ex: Reunião, Almoço, etc"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                />

                <div className="space-y-4">
                    <DatePicker label="Data" value={date} onChange={(d) => setDate(formatDateStr(d))} />
                    <div className="grid grid-cols-2 gap-4">
                        <TimePicker label="Início" value={startTime} onChange={setStartTime} />
                        <TimePicker label="Término" value={endTime} onChange={setEndTime} />
                    </div>
                </div>

                {/* Professional Selection - MULTI SELECT */}
                <div className="flex flex-col gap-1.5">
                    <label className="block text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 truncate">Profissionais</label>
                    <Dropdown
                        width="w-full"
                        showChevron={false}
                        trigger={
                            <button
                                className="flex items-center text-brand-dark dark:text-dark-heading bg-brand-gray dark:bg-dark-border/30 border border-brand-border dark:border-dark-border rounded-lg py-2.5 px-4 text-sm transition-colors duration-150 w-full text-left justify-between"
                            >
                                <span className="truncate block">
                                    {selectedStaffIds.length === 0
                                        ? 'Selecione os profissionais'
                                        : selectedStaffIds.length === 1
                                            ? staffMembers.find(s => s.id === selectedStaffIds[0])?.name
                                            : `${selectedStaffIds.length} selecionados`}
                                </span>
                                <ChevronDownIcon size={16} className="text-brand-inactive-text" />
                            </button>
                        }
                    >
                        <div className="max-h-[300px] overflow-y-auto p-1">
                            {staffMembers?.map(staff => (
                                <div
                                    key={staff.id}
                                    className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-lg cursor-pointer transition-colors"
                                    onClick={() => toggleStaff(staff.id)}
                                >
                                    <Checkbox
                                        checked={selectedStaffIds.includes(staff.id)}
                                        onChange={() => { }}
                                        className="pointer-events-none"
                                    />
                                    <UserProfileImage fullName={staff.name} className="w-6 h-6" />
                                    <span className="font-medium text-sm text-brand-dark dark:text-dark-heading">{staff.name}</span>
                                </div>
                            ))}
                        </div>
                    </Dropdown>
                </div>

                {/* Recurrence with End Logic */}
                <div className="space-y-4">
                    <div className="flex flex-col gap-1.5">
                        <FormDropdown
                            label="Repetição"
                            value={recurrence}
                            setValue={(val) => setRecurrence(val as any)}
                            options={[
                                { value: 'none', label: 'Não se repete' },
                                { value: 'daily', label: 'Diariamente' },
                                { value: 'weekly', label: 'Semanalmente' }
                            ]}
                        />
                    </div>

                    {recurrence !== 'none' && (
                        <div className="space-y-4">
                            <div className="flex flex-col gap-1.5">
                                <FormDropdown
                                    label="Termina em"
                                    value={recurrenceEndType}
                                    setValue={(val) => setRecurrenceEndType(val as any)}
                                    options={[
                                        { value: 'never', label: 'Nunca' },
                                        { value: 'date', label: 'Em uma data específica' },
                                        { value: 'count', label: 'Após um número de vezes' }
                                    ]}
                                />
                            </div>

                            {recurrenceEndType === 'date' && (
                                <DatePicker
                                    label="Data final"
                                    value={recurrenceEndDate}
                                    onChange={(d) => setRecurrenceEndDate(formatDateStr(d))}
                                />
                            )}

                            {recurrenceEndType === 'count' && (
                                <FormInput
                                    label="Número de ocorrências"
                                    type="number"
                                    value={recurrenceCount.toString()}
                                    onChange={(e) => setRecurrenceCount(parseInt(e.target.value) || 1)}
                                />
                            )}
                        </div>
                    )}
                </div>

                <FormTextarea
                    label="Notas (opcional)"
                    name="description"
                    placeholder="Adicione detalhes aqui..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    maxLength={500}
                    showCharacterCount
                />
            </div>

            <div className="absolute bottom-0 left-0 w-full p-6 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border z-20 flex gap-3">
                {isEditing && (
                    <Button
                        variant="outline"
                        className="flex-1 h-12 border-red-200 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10"
                        onClick={() => setIsDeleteModalOpen(true)}
                    >
                        Excluir
                    </Button>
                )}
                <Button className={isEditing ? "flex-1 h-12" : "w-full h-12"} onClick={handleConfirm}>
                    {isEditing ? 'Salvar alterações' : 'Salvar horário'}
                </Button>
            </div>

            {/* DELETION MODAL */}
            <AlertModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={() => {
                    if (onDelete && appointment && appointment.id) {
                        onDelete(appointment.id, deleteOption === 'series', appointment.service);
                        setIsDeleteModalOpen(false);
                    }
                }}
                title="Excluir horário indisponível"
                confirmText="Excluir"
                variant="danger"
                isDestructive
                message={
                    <div className="space-y-4 py-2 text-left">
                        <p className="text-sm text-brand-inactive-text">Como você deseja excluir este horário indisponível?</p>
                        <div className="space-y-1">
                            <RadioButton
                                name="deleteOption"
                                value="single"
                                checked={deleteOption === 'single'}
                                onChange={() => setDeleteOption('single')}
                                label="Excluir apenas este horário"
                            />
                            <RadioButton
                                name="deleteOption"
                                value="series"
                                checked={deleteOption === 'series'}
                                onChange={() => setDeleteOption('series')}
                                label={`Excluir todos os horários de "${appointment?.service}"`}
                            />
                        </div>
                    </div>
                }
            />

            {/* TYPE DELETION MODAL */}
            <AlertModal
                isOpen={isDeleteTypeModalOpen}
                onClose={() => { setIsDeleteTypeModalOpen(false); setTypeToDelete(null); }}
                onConfirm={handleDeleteType}
                title={`Excluir "${typeToDelete?.name}"?`}
                message={`Tem certeza que deseja excluir o tipo de horário "${typeToDelete?.name}"? Isso não afetará os horários já criados com este tipo.`}
                confirmText="Excluir"
                variant="danger"
                isDestructive
            />
        </div>
    );

    const NewTypeSheetBody = (
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface overflow-hidden">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Novo tipo</h2>
                <Button variant="filled" onClick={() => setIsNewTypeSheetOpen(false)} size="icon">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>
            <div className="flex-1 space-y-6 p-6">
                <div>
                    <div className="flex items-end gap-2">
                        <button
                            onClick={() => setIsEmojiModalOpen(true)}
                            className="w-[42px] h-[42px] flex items-center justify-center bg-brand-gray dark:bg-dark-border/30 border border-brand-border dark:border-dark-border rounded-lg text-2xl hover:bg-white dark:hover:bg-dark-surface transition-colors shrink-0"
                        >
                            {newTypeEmoji}
                        </button>
                        <div className="flex-1">
                            <FormInput label="Nome" placeholder="Ex: Almoço" value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} />
                        </div>
                    </div>
                </div>
                <FormInput label="Duração padrão (min)" type="number" value={newTypeDuration} onChange={(e) => setNewTypeDuration(e.target.value)} />
            </div>
            <DefaultModal isOpen={isEmojiModalOpen} onClose={() => setIsEmojiModalOpen(false)} title="Selecione um ícone" maxWidth="sm">
                <div className="grid grid-cols-5 gap-1.5">
                    {emojis.map(e => (
                        <button
                            key={e}
                            onClick={() => { setNewTypeEmoji(e); setIsEmojiModalOpen(false); }}
                            className="text-xl p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-all hover:scale-110 active:scale-95"
                        >
                            {e}
                        </button>
                    ))}
                </div>
            </DefaultModal>
            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center gap-4">
                    <Button className="h-12 flex-1" isLoading={isSavingNewType} onClick={handleSaveNewType}>Salvar Tipo</Button>
                </div>
            </footer>
        </div>
    );

    if (isMobile) {
        return (
            <>
                <BottomSheet isOpen={true} onClose={onClose}>{SheetBody}</BottomSheet>
                <BottomSheet isOpen={isNewTypeSheetOpen} onClose={() => setIsNewTypeSheetOpen(false)}>{NewTypeSheetBody}</BottomSheet>
            </>
        );
    }

    return (
        <>
            <Portal>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 bg-black/50"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: isNewTypeSheetOpen ? "-40px" : 0, scale: isNewTypeSheetOpen ? 0.97 : 1, opacity: isNewTypeSheetOpen ? 0.7 : 1 }}
                        exit={{ x: '100%' }}
                        transition={{ type: "spring", stiffness: 400, damping: 40 }}
                        className="fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-dark-surface"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {SheetBody}
                    </motion.div>
                </motion.div>
            </Portal>
            <Portal>
                <AnimatePresence>
                    {isNewTypeSheetOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[60] bg-black/50"
                            onClick={() => setIsNewTypeSheetOpen(false)}
                        >
                            <motion.div
                                initial={{ x: '100%' }}
                                animate={{ x: 0 }}
                                exit={{ x: '100%' }}
                                transition={{ type: "spring", stiffness: 400, damping: 40 }}
                                className="fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-dark-surface"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {NewTypeSheetBody}
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </Portal>
        </>
    );
};

export const MoreAppointmentsSheet = ({ date, appointments, onClose, onViewAppointment }: { date: string, appointments: Appointment[], onClose: () => void, onViewAppointment: (apt: Appointment) => void }) => {
    const isMobile = useMediaQuery("(max-width: 768px)");
    const [searchQuery, setSearchQuery] = useState('');
    const dateObj = new Date(date + 'T00:00:00');

    const filteredAppointments = appointments.filter(apt =>
        (apt.customer || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (apt.service || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const sheetContent = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface overflow-hidden">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading capitalize">
                    {dateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h2>
                <Button variant="filled" onClick={onClose} size="icon">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            {/* Search Input bar */}
            <div className="z-10 shrink-0 border-b border-brand-border bg-white px-6 py-4 dark:border-dark-border dark:bg-dark-surface">
                <FormInput
                    label=""
                    name="sheetSearch"
                    placeholder="Buscar cliente ou serviço..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                    className="mb-0"
                    variant="full-rounded"
                />
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
                {filteredAppointments.length === 0 ? (
                    <div className="py-10">
                        <IconPlaceholder
                            icon={CalendarIcon}
                            title="Nenhum agendamento encontrado"
                            subtitle="Tente alterar o período ou a busca."
                        />
                    </div>
                ) : (
                    filteredAppointments.map(apt => (
                        <AppointmentListCard key={apt.id} appointment={apt} onClick={onViewAppointment} />
                    ))
                )}
            </div>
        </div>
    );

    if (isMobile) {
        return (
            <BottomSheet isOpen={true} onClose={onClose}>
                {sheetContent}
            </BottomSheet>
        );
    }

    return (
        <Portal>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/50"
                onClick={onClose}
            >
                <motion.div
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: "spring", stiffness: 400, damping: 40 }}
                    className="fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-dark-surface flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    {sheetContent}
                </motion.div>
            </motion.div>
        </Portal>
    );
};

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
                    <Button variant="outline" className="flex-1 h-12" onClick={onClose}>Voltar</Button>
                    <Button className="flex-1 h-12 bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold rounded-xl shadow-lg shadow-red-200 dark:shadow-none" onClick={onConfirm}>{buttonText}</Button>
                </div>
            </motion.div>
        </div>
    )
}
