import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeftIcon, XIcon, SearchIcon, CheckCircleIcon, ChevronRightIcon, PlusIcon, ChevronDownIcon, CalendarIcon, CheckIcon, MoreHorizontalIcon, EditIcon, ClockIcon, RepeatIcon, SaveIcon, ShoppingBagIcon, ArrowRightIcon, FileIcon } from '@/lib/icons';
import { Button, Input as FormInput, Dropdown, DropdownItem, AlertModal, DatePicker, TimePicker, FormTextarea } from '@/components/reusable';
import { usePermissions } from '@/lib/permission-context';
import { RecurrenceView, ActivityLog } from '../Shared';
import { mockServices, mockClients, staffMembers } from '../data';
import { Appointment } from '../types';
import { ServiceItemCard } from '../ServiceItemCard';
import { formatDateStr, formatDuration, getEndTime, parseLocalDate } from '../utils';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';

export const AppointmentSheet = ({
    onClose,
    mode,
    appointment,
    onSave,
    onEnterSelectionMode,
    selectedDate,
    initialTimeSlot,
    defaultDate,
    initialDraft,
    initialStaffId,
    onCheckout,
    onViewSale,
    onStatusChangeRequest,
    servicesCatalog,
    clientsCatalog,
    staffCatalog
}: {
    onClose: () => void,
    mode: 'create' | 'view',
    appointment?: Appointment | null,
    onSave: (data: any | any[]) => void,
    onEnterSelectionMode: (currentData: any) => void,
    selectedDate?: Date,
    initialTimeSlot?: string,
    defaultDate: Date,
    initialDraft?: any,
    initialStaffId?: string,
    onCheckout: (data: any) => void,
    onViewSale?: () => void,
    onStatusChangeRequest?: (type: 'cancel' | 'absence', appointment: Appointment) => void,
    servicesCatalog?: any[],
    clientsCatalog?: any[],
    staffCatalog?: any[]
}) => {
    const servicesSource = servicesCatalog && servicesCatalog.length ? servicesCatalog : mockServices;
    const clientsSource = clientsCatalog && clientsCatalog.length ? clientsCatalog : mockClients;
    const staffSource = staffCatalog && staffCatalog.length ? staffCatalog : staffMembers;
    const { canEdit, hasSpecific, canDelete } = usePermissions();
    const [currentView, setCurrentView] = useState<'summary' | 'services' | 'client' | 'datetime' | 'activity' | 'edit-service' | 'recurrence' | 'notes'>('summary');
    const [selectedServices, setSelectedServices] = useState<any[]>([]);
    const [selectedClient, setSelectedClient] = useState<any>(null);
    const [editingServiceIndex, setEditingServiceIndex] = useState<number | null>(null);
    const [isAddingMore, setIsAddingMore] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [serviceToDeleteIndex, setServiceToDeleteIndex] = useState<number | null>(null);
    const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);

    // Status & Notes State
    const [status, setStatus] = useState(appointment?.status || 'Reservado');
    const [notes, setNotes] = useState(appointment?.notes || '');

    // Check for changes
    const hasChanges = useMemo(() => {
        if (mode === 'create') {
            return selectedServices.length > 0 || !!selectedClient || !!notes;
        }
        if (mode === 'view' && appointment) {
            const hasStatusChanged = status !== appointment.status;
            const hasNotesChanged = notes !== (appointment.notes || '');
            const initialServiceNames = appointment.service.split(',').map(s => s.trim()).join(',');
            const currentServiceNames = selectedServices.map(s => s.name).join(',');
            const hasServicesChanged = initialServiceNames !== currentServiceNames;
            return hasStatusChanged || hasNotesChanged || hasServicesChanged;
        }
        return false;
    }, [mode, selectedServices, selectedClient, notes, status, appointment]);

    const handleCloseAttempt = () => {
        if (hasChanges) {
            setIsUnsavedModalOpen(true);
        } else {
            onClose();
        }
    };

    // Time & Date State
    const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(initialTimeSlot || null);

    // START/END Ranges (For non-standard services)
    const [startDateRange, setStartDateRange] = useState<string>('');
    const [startTimeRange, setStartTimeRange] = useState<string>('');
    const [endDateRange, setEndDateRange] = useState<string>('');
    const [endTimeRange, setEndTimeRange] = useState<string>('');

    // Specific Staff Selection for New Appointment
    const [selectedStaffId, setSelectedStaffId] = useState<string>(initialStaffId || '1');

    // Edit Mode State
    const [editDate, setEditDate] = useState<Date | undefined>(undefined);
    const [editTime, setEditTime] = useState<string>('');

    // Recurrence State
    const [recurrenceFreq, setRecurrenceFreq] = useState('Não se repete');
    const [recurrenceTerm, setRecurrenceTerm] = useState('Data específica');
    const [recurrenceEndDate, setRecurrenceEndDate] = useState(new Date(2026, 0, 12));

    // Determine if appointment is paid or absence
    const isPaid = status === 'Paid' || status === 'Pago' || status === 'Partially Paid';

    // Helper to determine if we need Range Picker
    const needsRangePicker = useMemo(() => {
        if (selectedServices.length === 0) return false;
        // If ANY service is not 'Por Serviço', we need the range picker
        return selectedServices.some(s => s.pricingUnit && s.pricingUnit !== 'Por Serviço');
    }, [selectedServices]);

    const timeSlots = ['08:00', '08:15', '08:30', '08:45', '09:00', '09:15', '09:30', '09:45', '10:00', '10:15'];

    // Initial State Setup
    useEffect(() => {
        if (mode === 'view' && appointment) {
            // Split services if they were combined in a string
            const serviceNames = appointment.service.split(',').map(s => s.trim());

            // Reconstruct services with ORIGINAL pricing and duration from catalog to avoid showing aggregated totals
            const loadedServices = serviceNames.map((name, index) => {
                // Try to find the service in mock data to get individual price/duration
                let catalogService: any = null;
                for (const category of servicesSource) {
                    const found = category.items.find((i: any) => i.name === name);
                    if (found) {
                        catalogService = { ...found, colorClass: category.colorClass };
                        break;
                    }
                }

                return {
                    id: 990 + index,
                    name: name,
                    // Use catalog values if found, otherwise guess/split (fallback)
                    price: catalogService ? catalogService.price : 0,
                    duration: catalogService ? catalogService.duration : Math.floor(appointment.duration / serviceNames.length),
                    staff: appointment.staff,
                    staffId: appointment.staffId,
                    colorClass: catalogService ? catalogService.colorClass : 'bg-purple-500',
                    pricingUnit: appointment.pricingUnit || 'Por Serviço'
                };
            });

            setSelectedServices(loadedServices);
            setSelectedClient({ name: appointment.customer });

            // Initialize edit state
            const [y, m, d] = appointment.date.split('-').map(Number);
            setEditDate(new Date(y, m - 1, d));
            setEditTime(appointment.time);
            setStatus(appointment.status);
            setNotes(appointment.notes || '');

            // Initialize Range state if needed (for editing existing multi-day)
            setStartDateRange(appointment.date);
            setStartTimeRange(appointment.time);
            setEndDateRange(appointment.endDate || appointment.date);
            setEndTimeRange(appointment.endTime || appointment.time);

            // Important: Set the selected time slot for calculations
            setSelectedTimeSlot(appointment.time);

            setCurrentView('summary');
        } else {
            // Restore draft data if returning from selection mode
            if (initialDraft) {
                setSelectedServices(initialDraft.services || []);
                setSelectedClient(initialDraft.client || null);
            }

            // Init Range Defaults
            const todayStr = formatDateStr(selectedDate || defaultDate);
            setStartDateRange(todayStr);
            setStartTimeRange(initialTimeSlot || '09:00');
            setEndDateRange(todayStr);
            setEndTimeRange(initialTimeSlot ? addMinutes(initialTimeSlot, 60) : '10:00');

            if (initialTimeSlot) {
                setSelectedTimeSlot(initialTimeSlot);
            }

            if (initialStaffId) {
                setSelectedStaffId(initialStaffId);
            }

            // Standard Flow Initialization for Create Mode
            if (mode === 'create') {
                if (initialDraft) {
                    // If returning from draft (calendar selection), go to Summary
                    setCurrentView('summary');
                } else {
                    // Start at Services
                    setCurrentView('services');
                }
            }
        }
    }, [mode, appointment, initialTimeSlot, initialDraft, selectedDate, initialStaffId]);

    // Calculate Price dynamically for Time-Based Services
    const calculatedPrice = useMemo(() => {
        return selectedServices.reduce((acc, service) => {
            if (service.pricingUnit === 'Por Dia') {
                const start = new Date(`${startDateRange}T${startTimeRange}`);
                const end = new Date(`${endDateRange}T${endTimeRange}`);
                const diffTime = Math.abs(end.getTime() - start.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const chargeableDays = Math.max(1, diffDays);
                return acc + (service.price * chargeableDays);
            } else if (service.pricingUnit === 'Por Hora') {
                const start = new Date(`${startDateRange}T${startTimeRange}`);
                const end = new Date(`${endDateRange}T${endTimeRange}`);
                const diffTime = Math.abs(end.getTime() - start.getTime());
                const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
                const chargeableHours = Math.max(1, diffHours);
                return acc + (service.price * chargeableHours);
            } else {
                return acc + service.price;
            }
        }, 0);
    }, [selectedServices, startDateRange, startTimeRange, endDateRange, endTimeRange]);

    const calculatedDuration = useMemo(() => {
        if (needsRangePicker) {
            const start = new Date(`${startDateRange}T${startTimeRange}`);
            const end = new Date(`${endDateRange}T${endTimeRange}`);
            const diffMs = end.getTime() - start.getTime();
            return Math.max(0, Math.floor(diffMs / 60000));
        }
        return selectedServices.reduce((acc, curr) => acc + parseInt(curr.duration || '0'), 0);
    }, [selectedServices, needsRangePicker, startDateRange, startTimeRange, endDateRange, endTimeRange]);

    function addMinutes(time: string, minsToAdd: number) {
        if (!time) return '00:00';
        const [h, m] = time.split(':').map(Number);
        const date = new Date();
        date.setHours(h);
        date.setMinutes(m + minsToAdd);
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    // Helper to get friendly recurrence text
    const getRecurrenceText = () => {
        if (recurrenceFreq === 'Não se repete') return null;

        let text = `Repete ${recurrenceFreq.toLowerCase()}`;
        if (recurrenceTerm === 'Data específica') {
            text += ` até ${recurrenceEndDate.toLocaleDateString('pt-BR')}`;
        } else if (recurrenceTerm.startsWith('Após')) {
            const count = recurrenceTerm.split(' ')[1];
            text += ` (${count}x)`;
        }
        return text;
    };

    const handleServiceSwap = (item: any) => {
        if (editingServiceIndex !== null) {
            // If in edit mode, replace the service
            const updated = [...selectedServices];
            updated[editingServiceIndex] = {
                ...updated[editingServiceIndex],
                ...item
            };
            setSelectedServices(updated);
            // Go back to summary if editing an existing service from summary
            if (!isAddingMore) {
                setCurrentView('summary');
            } else {
                // If adding more, just stay or toggle selection
                setEditingServiceIndex(null);
            }
        } else {
            // Toggle selection logic
            if (selectedServices.find(s => s.id === item.id)) {
                setSelectedServices(prev => prev.filter(s => s.id !== item.id));
            } else {
                // Add new service
                let staffId = selectedStaffId;
                const staffMember = staffSource.find(s => s.id === staffId);
                let staffName = staffMember ? staffMember.name : 'Ana Silva';

                // Initial range setup for non-standard units
                if (selectedServices.length === 0 && item.pricingUnit && item.pricingUnit !== 'Por Serviço') {
                    const todayStr = formatDateStr(selectedDate || defaultDate);
                    setStartDateRange(todayStr);
                    if (item.pricingUnit === 'Por Dia') {
                        const tomorrow = new Date(selectedDate || defaultDate);
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        setEndDateRange(formatDateStr(tomorrow));
                        setEndTimeRange('09:00');
                    } else {
                        setEndDateRange(todayStr);
                        setEndTimeRange(addMinutes(initialTimeSlot || '09:00', 60));
                    }
                }

                setSelectedServices(prev => [...prev, { ...item, staff: staffName, staffId }]);
            }
        }
    };

    // Navigation Flow Logic
    const handleNext = () => {
        if (currentView === 'services') {
            if (selectedServices.length === 0) return;

            // If adding more services, go straight back to summary
            if (isAddingMore) {
                setIsAddingMore(false);
                setCurrentView('summary');
            } else {
                // Normal Flow: Services -> Client
                setCurrentView('client');
            }
        }
        else if (currentView === 'client') {
            // Flow: Client -> Datetime
            setCurrentView('datetime');
        }
        else if (currentView === 'datetime') {
            // Validation for range picker
            if (needsRangePicker) {
                if (new Date(`${startDateRange}T${startTimeRange}`) >= new Date(`${endDateRange}T${endTimeRange}`)) {
                    alert("A data de término deve ser após a data de início.");
                    return;
                }
            }
            // Update staff for all services based on selection in datetime step
            const updatedServices = selectedServices.map(s => {
                const staff = staffSource.find(sm => sm.id === selectedStaffId);
                return {
                    ...s,
                    staffId: selectedStaffId,
                    staff: staff ? staff.name : 'Desconhecido'
                }
            });
            setSelectedServices(updatedServices);

            // Flow: Datetime -> Summary
            setCurrentView('summary');
        }
        else if (currentView === 'summary') {
            // Generate Appointment Data (Handle Recurrence)
            generateRecurringAppointments();
        }
    };

    // Recurrence Generation Logic
    const generateRecurringAppointments = () => {
        const finalDateObj = selectedDate || defaultDate;
        const baseDateStr = needsRangePicker ? startDateRange : formatDateStr(finalDateObj);
        const timeStr = needsRangePicker ? startTimeRange : (selectedTimeSlot || '09:00');

        const baseAppointmentData = {
            customerName: selectedClient?.name,
            serviceName: selectedServices.map(s => s.name).join(', '),
            time: timeStr,
            duration: calculatedDuration,
            staffName: selectedServices[0]?.staff,
            staffId: selectedServices[0]?.staffId,
            price: calculatedPrice,
            notes: notes,
            pricingUnit: selectedServices[0]?.pricingUnit,
            status: status
        };

        const appointmentsToSave = [];

        // Use local date parsing to avoid timezone issues
        const [y, m, d] = baseDateStr.split('-').map(Number);
        // Set hour to noon to avoid DST shifts when adding days
        let currentDateLoop = new Date(y, m - 1, d, 12, 0, 0);

        // Determine limits
        let maxOccurrences = 1;
        let limitDate = null;
        let isRecurrenceEnabled = false;

        if (recurrenceFreq !== 'Não se repete') {
            isRecurrenceEnabled = true;
            if (recurrenceTerm === 'Data específica') {
                limitDate = recurrenceEndDate;
                maxOccurrences = 999; // Cap safety
            } else if (recurrenceTerm.startsWith('Após')) {
                const parts = recurrenceTerm.split(' ');
                maxOccurrences = parseInt(parts[1]) || 1;
            } else {
                maxOccurrences = 52;
            }
        }

        let occurrences = 0;

        while (occurrences < maxOccurrences) {
            // Check date limit if set (compare beginning of day)
            if (limitDate) {
                // Clone to avoid mutation and set to midnight for comparison
                const currentCheck = new Date(currentDateLoop.getFullYear(), currentDateLoop.getMonth(), currentDateLoop.getDate());
                const limitCheck = new Date(limitDate.getFullYear(), limitDate.getMonth(), limitDate.getDate());
                if (currentCheck > limitCheck) break;
            }

            const dateStr = formatDateStr(currentDateLoop);
            const endDateStr = needsRangePicker ? endDateRange : dateStr;

            appointmentsToSave.push({
                ...baseAppointmentData,
                date: dateStr,
                endDate: endDateStr,
                endTime: needsRangePicker ? endTimeRange : addMinutes(timeStr, calculatedDuration),
            });

            occurrences++;

            if (!isRecurrenceEnabled) break;

            // Increment Date based on Frequency
            if (recurrenceFreq === 'Todos os dias') {
                currentDateLoop.setDate(currentDateLoop.getDate() + 1);
            } else if (recurrenceFreq === 'Semanalmente') {
                currentDateLoop.setDate(currentDateLoop.getDate() + 7);
            } else if (recurrenceFreq === 'Mensalmente') {
                currentDateLoop.setMonth(currentDateLoop.getMonth() + 1);
            }
        }

        // Pass array or single object depending on logic (Parent handles array)
        onSave(appointmentsToSave);
    };

    const handleBack = () => {
        // Reverse Flow
        if (currentView === 'client') setCurrentView('services');
        else if (currentView === 'datetime') setCurrentView('client');
        else if (currentView === 'summary') {
            if (mode === 'create') {
                // Creating: Go back to Datetime
                setCurrentView('datetime');
            } else {
                // Viewing: Close sheet
                onClose();
            }
        }
        // Auxiliary Views back to Summary
        else if (currentView === 'activity' || currentView === 'recurrence' || currentView === 'notes') {
            setCurrentView('summary');
        }
        else if (currentView === 'edit-service') {
            setCurrentView('summary');
        }
    };

    const handleSaveChanges = () => {
        const updatedApp = {
            ...appointment,
            status: status,
            price: calculatedPrice,
            notes: notes,
            service: selectedServices.map(s => s.name).join(', '), // Combine names
            duration: calculatedDuration, // Update total duration
            staff: selectedServices[0]?.staff,
            staffId: selectedServices[0]?.staffId,
        };
        onSave(updatedApp);
    }

    const getHeaderTitle = () => {
        switch (currentView) {
            case 'services': return 'Selecionar Serviços';
            case 'client': return 'Selecionar Cliente';
            case 'datetime': return 'Data e Horário';
            case 'summary': return mode === 'view' ? 'Detalhes do Agendamento' : 'Resumo do Agendamento';
            case 'activity': return 'Atividade';
            case 'edit-service': return 'Editar serviço';
            case 'recurrence': return 'Editar opções de repetição';
            case 'notes': return 'Notas internas';
            default: return '';
        }
    }

    const getHeaderBgColor = () => {
        const s = status.toLowerCase();
        if (s === 'confirmed' || s === 'confirmado') return 'bg-emerald-600';
        if (s === 'pending' || s === 'aguardando') return 'bg-orange-500';
        if (s === 'ausência' || s === 'absent' || s === 'ausencia') return 'bg-red-500';
        if (s === 'cancelado' || s === 'canceled' || s === 'cancelar') return 'bg-red-600';
        if (s === 'iniciado' || s === 'in progress') return 'bg-[#003d32]';
        if (s === 'pago' || s === 'paid') return 'bg-green-600';
        if (s === 'finalizado' || s === 'finished') return 'bg-gray-700';
        return 'bg-blue-600';
    }

    const [dateOffset, setDateOffset] = useState(0);
    const dates = useMemo(() => {
        const baseDate = new Date(2026, 0, 12);
        const days = [];
        for (let i = -2; i < 5; i++) {
            const d = new Date(baseDate);
            d.setDate(baseDate.getDate() + i + dateOffset);
            const isSelected = i + dateOffset === 0;
            days.push({
                day: d.toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3),
                num: d.getDate(),
                active: isSelected,
                fullDate: d
            });
        }
        return days;
    }, [dateOffset]);

    const handleDateNav = (dir: 'prev' | 'next') => {
        setDateOffset(prev => dir === 'next' ? prev + 1 : prev - 1);
    }

    const handleServiceEdit = (index: number) => {
        setEditingServiceIndex(index);
        setCurrentView('edit-service');
    };

    const updateEditingService = (field: string, value: any) => {
        if (editingServiceIndex === null) return;
        const updated = [...selectedServices];

        // Special handling for staff update
        if (field === 'staffId') {
            const staff = staffSource.find(s => s.id === value);
            updated[editingServiceIndex] = {
                ...updated[editingServiceIndex],
                staffId: value,
                staff: staff ? staff.name : 'Desconhecido'
            };
        } else {
            updated[editingServiceIndex] = { ...updated[editingServiceIndex], [field]: value };
        }

        setSelectedServices(updated);
    };

    const handleAddMoreService = () => {
        setIsAddingMore(true);
        setEditingServiceIndex(null);
        setCurrentView('services');
    };

    const handleEnterSelectionMode = () => {
        onEnterSelectionMode({
            services: selectedServices,
            client: selectedClient,
            staffId: initialStaffId
        });
    };

    const handleStatusChange = (newStatus: string) => {
        if ((newStatus === 'Ausência' || newStatus === 'Cancelado') && onStatusChangeRequest && appointment) {
            // Trigger the special sheet in parent
            onStatusChangeRequest(newStatus === 'Ausência' ? 'absence' : 'cancel', appointment);
        } else {
            setStatus(newStatus);
        }
    };

    const handleRemoveServiceRequest = (index: number) => {
        setServiceToDeleteIndex(index);
        setIsDeleteModalOpen(true);
    };

    const confirmRemoveService = () => {
        if (serviceToDeleteIndex !== null) {
            const newServices = [...selectedServices];
            newServices.splice(serviceToDeleteIndex, 1);
            setSelectedServices(newServices);

            if (newServices.length === 0) {
                // If list is empty, force back to services view and Reset States
                setEditingServiceIndex(null);
                setIsAddingMore(false);
                setCurrentView('services');
            }
        }
        setIsDeleteModalOpen(false);
        setServiceToDeleteIndex(null);
    };

    const getSelectedStaffName = () => {
        const staff = staffSource.find(s => s.id === selectedStaffId);
        return staff ? staff.name : 'Selecione';
    }

    const getSelectedStaffAvatar = () => {
        const staff = staffSource.find(s => s.id === selectedStaffId);
        return staff ? staff.avatar : null;
    }

    // Logic to calculate sequential time slots for the summary view
    const getServiceTimeRange = (index: number) => {
        // Fallback for when "editTime" might be empty (new creation), usually '09:00' default
        let startTime = needsRangePicker ? startTimeRange : (editTime || selectedTimeSlot || '09:00');

        // Calculate accumulated duration of previous services
        for (let i = 0; i < index; i++) {
            // parseInt ensures it's a number, default to 0 if missing
            const prevDuration = parseInt(selectedServices[i].duration || '0');
            startTime = addMinutes(startTime, prevDuration);
        }

        const duration = parseInt(selectedServices[index].duration || '0');
        const endTime = addMinutes(startTime, duration);

        return `${startTime} - ${endTime}`;
    }

    const recurrenceText = getRecurrenceText();
    const finalDateForHeader = needsRangePicker ? startDateRange : (editDate ? formatDateStr(editDate) : formatDateStr(defaultDate));
    const headerDateObj = parseLocalDate(finalDateForHeader);
    const formattedHeaderDate = formatDate(headerDateObj);

    return (
        <>
            <AlertModal
                isOpen={isUnsavedModalOpen}
                onClose={() => setIsUnsavedModalOpen(false)}
                onConfirm={onClose}
                title="Descartar alterações?"
                message="Você tem alterações não salvas. Se sair agora, todas as alterações serão perdidas. Deseja continuar?"
                confirmText="Sair sem salvar"
                cancelText="Continuar editando"
                variant="danger"
                isDestructive
            />
            <AlertModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmRemoveService}
                title="Remover serviço?"
                message="Tem certeza que deseja remover este serviço do agendamento?"
                confirmText="Remover"
                variant="danger"
                isDestructive
            />
            <div className="fixed inset-0 z-[60] flex justify-end">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCloseAttempt} />
                <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="relative w-full max-w-md bg-white dark:bg-dark-surface shadow-2xl flex flex-col h-full overflow-hidden">
                    <div className="p-6 border-b border-brand-border dark:border-dark-border flex justify-between items-center bg-white dark:bg-dark-surface z-20">
                        <div className="flex items-center gap-3">
                            <button onClick={handleBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-dark-border transition-colors">
                                {currentView === 'summary' && mode === 'view' ? <XIcon size={20} className="text-brand-dark dark:text-dark-heading" /> : <ChevronLeftIcon size={20} className="text-brand-dark dark:text-dark-heading" />}
                            </button>
                            <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                                {getHeaderTitle()}
                            </h2>
                            <span className="text-sm font-medium text-brand-inactive-text">{formattedHeaderDate}</span>
                        </div>

                        <button onClick={handleCloseAttempt} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-dark-border transition-colors">
                            <XIcon size={24} className="text-brand-inactive-text dark:text-dark-body" />
                        </button>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pb-32 relative">
                        <AnimatePresence mode='wait'>
                            {/* SERVICE SELECTION */}
                            {currentView === 'services' && (
                                <motion.div key="services" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                                    {/* ... Service Selection UI ... */}
                                    <div className="relative">
                                        <SearchIcon size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-inactive-text" />
                                        <input type="text" placeholder="Buscar serviço" className="w-full h-[42px] pl-10 pr-4 rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-1 focus:ring-brand-dark dark:focus:ring-dark-heading transition-all" />
                                    </div>
                                    {servicesSource.map((group, idx) => (
                                        <div key={idx}>
                                            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">{group.category}</h3>
                                            <div className="space-y-3">
                                                {group.items.map((item: any) => {
                                                    const isSelected = selectedServices.some(s => s.id === item.id);
                                                    const isEditingMode = editingServiceIndex !== null;

                                                    return (
                                                        <div
                                                            key={item.id}
                                                            onClick={() => handleServiceSwap({ ...item, colorClass: group.colorClass })}
                                                            className={`relative flex justify-between items-center p-4 rounded-xl cursor-pointer border bg-transparent transition-all ${isSelected && !isEditingMode ? 'border-brand-green' : 'border-brand-border dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600'}`}
                                                        >
                                                            <div className={`absolute left-1.5 top-1.5 bottom-1.5 w-1 rounded-full ${group.colorClass}`}></div>
                                                            <div className="pl-4">
                                                                <div className="font-bold text-brand-dark dark:text-dark-heading text-[15px] mb-1">{item.name}</div>
                                                                <div className="text-xs text-brand-inactive-text">
                                                                    {item.pricingUnit === 'Por Serviço' ? `${item.duration} min` : item.pricingUnit}
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col items-end gap-2">
                                                                {!isEditingMode && (
                                                                    <div className={`w-5 h-5 rounded-full border transition-colors flex items-center justify-center ${isSelected ? 'bg-brand-green border-brand-green' : 'border-gray-300 dark:border-gray-600'}`}>
                                                                        {isSelected && <CheckIcon size={12} className="text-white" strokeWidth={3} />}
                                                                    </div>
                                                                )}
                                                                <div className="font-bold text-brand-dark dark:text-dark-heading mt-2">R$ {item.price}</div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </motion.div>
                            )}

                            {/* CLIENT SELECTION */}
                            {currentView === 'client' && (
                                <motion.div key="client" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-6">
                                    <FormInput label="" name="clientSearch" placeholder="Pesquisar cliente (nome, email, telefone)" prefix={<SearchIcon size={18} className="text-brand-inactive-text" />} autoFocus />
                                    <div className="space-y-2">
                                        <button className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors text-left group">
                                            <div className="w-12 h-12 rounded-full bg-[#f3e8ff] dark:bg-[#3b0764]/50 flex items-center justify-center text-[#7c3aed] dark:text-[#d8b4fe]"><PlusIcon size={24} /></div>
                                            <span className="font-bold text-brand-dark dark:text-dark-heading">Cadastrar novo cliente</span>
                                        </button>
                                        <div className="border-t border-brand-border dark:border-dark-border my-2"></div>
                                        {clientsSource.map(client => (
                                            <button key={client.id} onClick={() => { setSelectedClient(client); handleNext(); }} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors text-left group">
                                                <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-lg font-bold text-gray-600 dark:text-gray-300">{client.name.charAt(0)}</div>
                                                <div>
                                                    <div className="font-bold text-brand-dark dark:text-dark-heading">{client.name}</div>
                                                    <div className="text-sm text-brand-inactive-text">{client.email}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            )}

                            {/* DATETIME SELECTION */}
                            {currentView === 'datetime' && (
                                <motion.div key="datetime" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-6">
                                    {/* Staff Selection */}
                                    <Dropdown
                                        width="w-full"
                                        trigger={
                                            <Button
                                                variant="outline"
                                                className="w-full justify-between items-center bg-white dark:bg-dark-surface h-14 px-4 rounded-xl border border-brand-border dark:border-dark-border hover:border-brand-dark transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <img src={getSelectedStaffAvatar() || "https://i.pravatar.cc/150?u=20"} className="w-8 h-8 rounded-full object-cover" />
                                                    <div className="text-left">
                                                        <p className="text-[10px] uppercase tracking-wider text-brand-inactive-text font-bold leading-tight">Profissional</p>
                                                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{getSelectedStaffName()}</p>
                                                    </div>
                                                </div>
                                            </Button>
                                        }
                                    >
                                        {staffSource.map(staff => (
                                            <DropdownItem key={staff.id} onClick={() => setSelectedStaffId(staff.id)} className="gap-2">
                                                <img src={staff.avatar} className="w-6 h-6 rounded-full" /> {staff.name}
                                            </DropdownItem>
                                        ))}
                                    </Dropdown>

                                    {needsRangePicker ? (
                                        /* RANGE PICKER FOR MULTI-DAY / HOURLY RENTALS */
                                        <div className="space-y-6">
                                            <div className="p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl flex items-start gap-3">
                                                <div className="mt-0.5"><ClockIcon size={16} className="text-blue-600 dark:text-blue-400" /></div>
                                                <div>
                                                    <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-1">Duração Variável</h4>
                                                    <p className="text-xs text-blue-700/80 dark:text-blue-300/80">Este serviço é cobrado por {selectedServices[0].pricingUnit.toLowerCase()}. Selecione o início e fim.</p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 gap-4">
                                                <div className="grid grid-cols-5 gap-2 items-end">
                                                    <div className="col-span-3">
                                                        <DatePicker
                                                            label="Início"
                                                            value={startDateRange}
                                                            onChange={(date) => {
                                                                const dateStr = formatDateStr(date);
                                                                setStartDateRange(dateStr);
                                                                if (endDateRange < dateStr) setEndDateRange(dateStr);
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="col-span-2">
                                                        <TimePicker
                                                            value={startTimeRange}
                                                            onChange={setStartTimeRange}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex justify-center -my-1 text-brand-inactive-text">
                                                    <ArrowRightIcon size={16} className="rotate-90 opacity-50" />
                                                </div>

                                                <div className="grid grid-cols-5 gap-2 items-end">
                                                    <div className="col-span-3">
                                                        <DatePicker
                                                            label="Término"
                                                            value={endDateRange}
                                                            onChange={(date) => setEndDateRange(formatDateStr(date))}
                                                        />
                                                    </div>
                                                    <div className="col-span-2">
                                                        <TimePicker
                                                            value={endTimeRange}
                                                            onChange={setEndTimeRange}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="p-4 rounded-xl border border-brand-border dark:border-dark-border flex justify-between items-center bg-gray-50 dark:bg-zinc-900/50">
                                                <span className="text-sm text-brand-inactive-text font-medium">Preço Estimado</span>
                                                <span className="text-lg font-bold text-brand-dark dark:text-dark-heading">R$ {calculatedPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div>
                                                <div className="flex justify-between items-center mb-4 px-1">
                                                    <h3 className="font-bold text-brand-dark dark:text-dark-heading">Janeiro 2026</h3>
                                                    <div className="flex gap-4">
                                                        <button onClick={() => handleDateNav('prev')} className="text-brand-inactive-text hover:text-brand-dark"><ChevronLeftIcon size={16} /></button>
                                                        <button onClick={() => handleDateNav('next')} className="text-brand-dark dark:text-dark-heading"><ChevronRightIcon size={16} /></button>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-center text-center">
                                                    {dates.map((d, i) => (
                                                        <div key={i} className="flex flex-col gap-2 cursor-pointer group items-center" onClick={() => { }}>
                                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${d.active ? 'bg-brand-dark text-white' : 'text-brand-dark dark:text-dark-heading border border-gray-200 dark:border-gray-700 hover:border-brand-dark'}`}>
                                                                {d.num}
                                                            </div>
                                                            <span className={`text-xs font-medium ${d.active ? 'text-brand-dark dark:text-dark-heading' : 'text-brand-inactive-text'}`}>{d.day}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <div className="flex justify-between items-center mb-4 px-1">
                                                    <h3 className="font-bold text-brand-dark dark:text-dark-heading">Horários disponíveis</h3>
                                                    <Button
                                                        variant="outline"
                                                        className="h-8 text-xs gap-2 rounded-full border-brand-border dark:border-dark-border"
                                                        leftIcon={<CalendarIcon size={12} />}
                                                        onClick={handleEnterSelectionMode}
                                                    >
                                                        Escolha no calendário
                                                    </Button>
                                                </div>
                                                <div className="space-y-3">
                                                    {timeSlots.map((slot, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={() => setSelectedTimeSlot(slot)}
                                                            className={`w-full p-3 rounded-xl border text-sm font-bold transition-all flex justify-between items-center ${selectedTimeSlot === slot ? 'border-brand-dark bg-brand-dark text-white' : 'border-brand-border dark:border-dark-border hover:border-gray-300 text-brand-dark dark:text-dark-heading'}`}
                                                        >
                                                            {slot}
                                                            {selectedTimeSlot === slot && <CheckIcon size={16} />}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </motion.div>
                            )}

                            {/* VIEW: SUMMARY */}
                            {currentView === 'summary' && (
                                <motion.div key="summary" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">

                                    {/* Info Header Card - Adjusted for Ranges */}
                                    {headerDateObj && (
                                        <div className={`${getHeaderBgColor()} text-white rounded-2xl p-5 shadow-sm relative overflow-hidden transition-colors duration-300`}>
                                            <div className="relative z-10 flex justify-between items-start">
                                                <div>
                                                    <h2 className="text-xl font-bold mb-1">
                                                        {headerDateObj.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}
                                                    </h2>

                                                    <div className="text-sm opacity-90 font-medium">
                                                        {needsRangePicker ? (
                                                            <span>{startTimeRange} - {endTimeRange} <span className="text-xs opacity-75">({formatDuration(calculatedDuration)})</span></span>
                                                        ) : (
                                                            <span>{editTime || selectedTimeSlot} • {formatDuration(calculatedDuration)}</span>
                                                        )}
                                                    </div>

                                                    {/* Recurrence Indicator */}
                                                    {recurrenceText && (
                                                        <div className="flex items-center gap-2 text-xs opacity-90 mt-2 font-medium bg-white/20 w-fit px-2 py-1 rounded-lg backdrop-blur-sm">
                                                            <RepeatIcon size={12} /> {recurrenceText}
                                                        </div>
                                                    )}
                                                </div>
                                                {/* Status Badge Dropdown */}
                                                <Dropdown
                                                    width="w-40"
                                                    align="right"
                                                    showChevron={false}
                                                    trigger={
                                                        <button className="px-3 py-1.5 rounded-full border border-white/30 text-xs font-bold flex items-center gap-2 cursor-pointer bg-white/10 hover:bg-white/20 transition-colors">
                                                            {status} <ChevronDownIcon size={12} />
                                                        </button>
                                                    }
                                                >
                                                    <DropdownItem onClick={() => handleStatusChange('Reservado')}>Reservado</DropdownItem>
                                                    <DropdownItem onClick={() => handleStatusChange('Confirmado')}>Confirmado</DropdownItem>
                                                    <DropdownItem onClick={() => handleStatusChange('Aguardando')}>Aguardando</DropdownItem>
                                                    <DropdownItem onClick={() => handleStatusChange('Iniciado')}>Iniciado</DropdownItem>
                                                    <div className="h-px bg-gray-100 dark:bg-dark-border my-1"></div>
                                                    <DropdownItem onClick={() => handleStatusChange('Pago')}>Pago</DropdownItem>
                                                    <DropdownItem onClick={() => handleStatusChange('Pago Parcialmente')}>Pago Parcialmente</DropdownItem>
                                                    <DropdownItem onClick={() => handleStatusChange('Ausência')}>Ausência</DropdownItem>
                                                    <DropdownItem onClick={() => handleStatusChange('Cancelado')}>Cancelado</DropdownItem>
                                                </Dropdown>
                                            </div>
                                        </div>
                                    )}

                                    {/* Client Section */}
                                    <div>
                                        <div className="flex justify-between items-center mb-3 px-1">
                                            <h3 className="font-bold text-brand-dark dark:text-dark-heading">Cliente</h3>
                                        </div>
                                        {selectedClient && (
                                            <div className="flex items-center justify-between py-2">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold text-lg">
                                                        {selectedClient.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-sm text-brand-dark dark:text-dark-heading">{selectedClient.name}</div>
                                                        <div className="text-xs text-brand-inactive-text">Cliente</div>
                                                    </div>
                                                </div>
                                                <Button variant="link">Alterar</Button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="border-t border-brand-border dark:border-dark-border"></div>

                                    {/* Services Section */}
                                    <div>
                                        <div className="flex justify-between items-center mb-3 px-1">
                                            <h3 className="font-bold text-brand-dark dark:text-dark-heading">Serviços</h3>
                                        </div>
                                        <div className="space-y-3">
                                            {selectedServices.map((service, idx) => (
                                                <ServiceItemCard
                                                    key={idx}
                                                    // Pass individual service start time for display
                                                    service={{ ...service, startTime: getServiceTimeRange(idx).split(' - ')[0] }}
                                                    onEdit={() => handleServiceEdit(idx)}
                                                    onRemove={() => handleRemoveServiceRequest(idx)}
                                                    // Pass formatted time range
                                                    timeRange={getServiceTimeRange(idx)}
                                                />
                                            ))}
                                        </div>
                                        <button
                                            onClick={handleAddMoreService}
                                            className="mt-4 text-sm font-bold text-brand-dark dark:text-dark-heading flex items-center gap-1 hover:opacity-70"
                                        >
                                            <PlusIcon size={16} /> Adicionar serviço
                                        </button>
                                    </div>

                                    {/* Total Row */}
                                    <div className="flex justify-between items-end border-t border-brand-border dark:border-dark-border pt-4">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-medium text-brand-inactive-text uppercase tracking-wide">Duração Total</span>
                                            <span className="text-lg font-bold text-brand-dark dark:text-dark-heading">{formatDuration(calculatedDuration)}</span>
                                        </div>
                                        <div className="flex flex-col text-right">
                                            <span className="text-xs font-medium text-brand-inactive-text uppercase tracking-wide">Valor Total</span>
                                            <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(calculatedPrice)}</span>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {currentView === 'edit-service' && editingServiceIndex !== null && (
                                <motion.div key="edit-service" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-6">
                                    {/* Edit Service Content */}
                                    <div
                                        className="relative flex justify-between items-center p-4 rounded-xl border border-brand-border dark:border-dark-border bg-transparent cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                                        onClick={() => setCurrentView('services')}
                                    >
                                        <div className={`absolute left-1.5 top-1.5 bottom-1.5 w-1 rounded-full ${selectedServices[editingServiceIndex].colorClass || 'bg-blue-500'}`}></div>
                                        <div className="pl-4 w-full">
                                            <div className="flex justify-between items-center">
                                                <h4 className="font-bold text-brand-dark dark:text-dark-heading text-[15px]">
                                                    {selectedServices[editingServiceIndex].name}
                                                </h4>
                                                <ChevronRightIcon size={16} className="text-brand-inactive-text" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <FormInput
                                            label="Preço do serviço"
                                            name="price"
                                            prefix="BRL"
                                            value={selectedServices[editingServiceIndex].price}
                                            onChange={(e) => updateEditingService('price', Number(e.target.value))}
                                        />

                                        <FormInput
                                            label="Duração (minutos)"
                                            name="duration"
                                            type="number"
                                            value={selectedServices[editingServiceIndex].duration}
                                            onChange={(e) => updateEditingService('duration', e.target.value)}
                                        />

                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-sm font-bold text-brand-dark dark:text-dark-heading">Profissional</label>
                                            <Dropdown
                                                width="w-full"
                                                showChevron={false}
                                                trigger={
                                                    <Button
                                                        variant="outline"
                                                        className="w-full justify-between items-center bg-white dark:bg-dark-surface h-[42px] px-3 rounded-lg border border-brand-border dark:border-dark-border hover:border-brand-dark transition-colors"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <img src={staffSource.find(s => s.id === selectedServices[editingServiceIndex].staffId)?.avatar || "https://i.pravatar.cc/150?u=20"} className="w-6 h-6 rounded-full object-cover" />
                                                            <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">{selectedServices[editingServiceIndex].staff}</span>
                                                        </div>
                                                    </Button>
                                                }
                                            >
                                                {staffSource.map(staff => (
                                                    <DropdownItem key={staff.id} onClick={() => updateEditingService('staffId', staff.id)} className="gap-2">
                                                        <img src={staff.avatar} className="w-6 h-6 rounded-full" /> {staff.name}
                                                    </DropdownItem>
                                                ))}
                                            </Dropdown>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* RECURRENCE VIEW */}
                            {currentView === 'recurrence' && (
                                <motion.div key="recurrence" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                                    <RecurrenceView
                                        frequency={recurrenceFreq}
                                        setFrequency={setRecurrenceFreq}
                                        termination={recurrenceTerm}
                                        setTermination={setRecurrenceTerm}
                                        endDate={recurrenceEndDate}
                                        setEndDate={setRecurrenceEndDate}
                                    />
                                    <div className="mt-8 flex justify-end">
                                        <Button variant="default" onClick={() => setCurrentView('summary')}>
                                            Salvar Repetição
                                        </Button>
                                    </div>
                                </motion.div>
                            )}

                            {/* ACTIVITY VIEW */}
                            {currentView === 'activity' && (
                                <motion.div key="activity" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                                    <ActivityLog activity={appointment?.activityLog} />
                                </motion.div>
                            )}

                            {/* NOTES VIEW */}
                            {currentView === 'notes' && (
                                <motion.div key="notes" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                                    <div className="space-y-4">
                                        <FormTextarea
                                            label="Notas Internas"
                                            name="notes"
                                            rows={8}
                                            placeholder="Adicione notas sobre o agendamento..."
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                        />
                                        <div className="flex justify-end">
                                            <Button variant="default" className="px-6" onClick={() => setCurrentView('summary')}>
                                                Salvar Nota
                                            </Button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                        </AnimatePresence>
                    </div>

                    {/* Footer Actions */}
                    {currentView !== 'activity' && currentView !== 'recurrence' && currentView !== 'notes' && (
                        !(currentView === 'services' && editingServiceIndex !== null) && (
                            <div className="absolute bottom-0 left-0 w-full bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border p-6 z-20">
                                {mode === 'create' || currentView === 'edit-service' ? (
                                    <div className="flex gap-3">
                                        {currentView !== 'services' && (
                                            <Button variant="outline" className="flex-1 h-[48px] rounded-xl font-bold" onClick={handleBack}>
                                                Voltar
                                            </Button>
                                        )}
                                        <Button
                                            variant="default"
                                            className={`flex-1 h-[48px] rounded-xl font-bold bg-black text-white hover:bg-gray-900 dark:bg-white dark:text-black dark:hover:bg-gray-200 ${currentView === 'services' && selectedServices.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            onClick={currentView === 'edit-service' ? () => setCurrentView('summary') : handleNext}
                                            disabled={currentView === 'services' && selectedServices.length === 0}
                                        >
                                            {currentView === 'summary' || (currentView === 'datetime' && (selectedTimeSlot || needsRangePicker)) ? <span className="flex items-center gap-2">Agendar <CheckCircleIcon size={18} /></span> : currentView === 'edit-service' ? 'Aplicar' : 'Próximo'}
                                        </Button>
                                    </div>
                                ) : (
                                    /* VIEW MODE FOOTER */
                                    <div className="flex gap-3">
                                        <Dropdown
                                            align="left"
                                            width="w-56"
                                            showChevron={false}
                                            trigger={
                                                <Button variant="outline" className="w-[48px] h-[48px] rounded-xl flex items-center justify-center p-0">
                                                    <MoreHorizontalIcon size={20} />
                                                </Button>
                                            }
                                        >
                                            <DropdownItem onClick={() => setCurrentView('notes')} className="gap-2"><FileIcon size={14} /> Notas</DropdownItem>
                                            <DropdownItem onClick={() => setCurrentView('recurrence')} className="gap-2"><RepeatIcon size={14} /> Editar repetição</DropdownItem>
                                            <DropdownItem onClick={() => setCurrentView('activity')} className="gap-2"><ClockIcon size={14} /> Ver histórico</DropdownItem>
                                            <div className="h-px bg-gray-100 dark:bg-dark-border my-1"></div>
                                            {isPaid && (
                                                <DropdownItem onClick={onViewSale} className="gap-2"><ShoppingBagIcon size={14} /> Ver venda</DropdownItem>
                                            )}
                                            <DropdownItem className="gap-2 text-brand-dark"><EditIcon size={14} /> Editar</DropdownItem>
                                            <div className="h-px bg-gray-100 dark:bg-dark-border my-1"></div>
                                            <DropdownItem onClick={() => handleStatusChange('Cancelado')} className="gap-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><XIcon size={14} /> Cancelar</DropdownItem>
                                        </Dropdown>

                                        <Button
                                            variant="default"
                                            className="flex-1 h-[48px] rounded-xl font-bold bg-brand-dark text-white hover:bg-black"
                                            onClick={handleSaveChanges}
                                        >
                                            <SaveIcon size={18} className="mr-2" /> Salvar
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )
                    )}
                </motion.div>
            </div>
        </>
    )
}
