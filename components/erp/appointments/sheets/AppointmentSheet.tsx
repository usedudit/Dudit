import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeftIcon, XIcon, SearchIcon, CheckCircleIcon, ChevronRightIcon, PlusIcon, ChevronDownIcon, CalendarIcon, CheckIcon, ClockIcon, RepeatIcon, ArrowRightIcon } from '@/lib/icons';
import { Button, Input, Dropdown, DropdownItem, AlertModal, DatePicker, TimePicker, FormTextarea, ThreeDotsLoader, IconPlaceholder, Badge } from '@/components/reusable';
import { getAvailableTimeSlotsAction } from '@/app/actions/erp/appointments';
import { usePermissions } from '@/lib/permission-context';
import { RecurrenceView, ActivityLog } from '../Shared';
import { Appointment } from '../types';
import { ServiceItemCard } from '../ServiceItemCard';
import { formatDateStr, formatDuration, parseLocalDate } from '../utils';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { useMediaQuery } from '@/components/erp/hooks';
import BottomSheet from '@/components/BottomSheet';
import Portal from '@/components/Portal';
import { UserProfileImage } from '@/lib/utils/UserProfileImage';
import PaymentSheet from './PaymentSheet';

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
    onStatusChangeRequest,
    servicesCatalog,
    clientsCatalog,
    staffCatalog,
    isSaving,
    partnerId
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
    staffCatalog?: any[],
    isSaving?: boolean,
    partnerId?: string,
}) => {
    const servicesSource = servicesCatalog || [];
    const clientsSource = clientsCatalog || [];
    const staffSource = staffCatalog || [];
    const { canEdit, hasSpecific, canDelete } = usePermissions();
    const [currentView, setCurrentView] = useState<'summary' | 'services' | 'client' | 'datetime' | 'activity' | 'edit-service' | 'recurrence' | 'notes'>('summary');
    const [selectedServices, setSelectedServices] = useState<any[]>([]);
    const [selectedClient, setSelectedClient] = useState<any>(null);
    const [editingServiceIndex, setEditingServiceIndex] = useState<number | null>(null);
    const [isAddingMore, setIsAddingMore] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [serviceToDeleteIndex, setServiceToDeleteIndex] = useState<number | null>(null);
    const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);

    const isMobile = useMediaQuery("(max-width: 768px)");

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
    const [selectedStaffId, setSelectedStaffId] = useState<string>(initialStaffId || (staffSource.length > 0 ? staffSource[0].id : ''));

    // Date Navigation Base
    const [baseDate, setBaseDate] = useState<Date>(selectedDate || defaultDate);
    const [dateOffset, setDateOffset] = useState(0);

    // Edit Mode State
    const [editDate, setEditDate] = useState<Date | undefined>(undefined);
    const [editTime, setEditTime] = useState<string>('');

    // Recurrence State
    const [recurrenceFreq, setRecurrenceFreq] = useState('Não se repete');
    const [recurrenceTerm, setRecurrenceTerm] = useState('Data específica');
    const [recurrenceEndDate, setRecurrenceEndDate] = useState(() => {
        const d = new Date(defaultDate);
        d.setDate(d.getDate() + 30);
        return d;
    });

    // Client Selection Search
    const [clientSearch, setClientSearch] = useState('');
    const filteredClients = useMemo(() => {
        if (!clientSearch) return clientsSource;
        const q = clientSearch.toLowerCase();
        return clientsSource.filter(c =>
            (c.name || '').toLowerCase().includes(q) ||
            (c.email || '').toLowerCase().includes(q) ||
            (c.phone || '').includes(q)
        );
    }, [clientSearch, clientsSource]);

    // Determine if appointment is paid or absence
    const isPaid = ['paid', 'pago', 'partially paid', 'parcialmente pago'].includes((status || '').toLowerCase());

    // Helper to determine if we need Range Picker
    const needsRangePicker = useMemo(() => {
        if (selectedServices.length === 0) return false;
        // If ANY service is not 'Por Serviço', we need the range picker
        return selectedServices.some(s => s.pricingUnit && s.pricingUnit !== 'Por Serviço');
    }, [selectedServices]);

    // -- Dynamic time slots from server (replaces hardcoded array) --
    const [timeSlots, setTimeSlots] = useState<string[]>([]);
    const [isLoadingSlots, setIsLoadingSlots] = useState(false);

    // Fetch available time slots when the datetime view is shown
    useEffect(() => {
        if (currentView !== 'datetime') return;
        if (!selectedStaffId) return;

        const totalDuration = selectedServices.reduce((sum, s) => sum + (Number(s.duration) || 60), 0);
        const maxBuffer = Math.max(0, ...selectedServices.map((s) => Number(s.bufferMinutes) || 0));
        const targetDate = formatDateStr(editDate || selectedDate || defaultDate);

        let cancelled = false;
        setIsLoadingSlots(true);

        getAvailableTimeSlotsAction(targetDate, selectedStaffId, totalDuration, maxBuffer)
            .then((res) => {
                if (cancelled) return;
                if (res.success) {
                    setTimeSlots(res.slots);
                }
            })
            .catch(() => { })
            .finally(() => {
                if (!cancelled) setIsLoadingSlots(false);
            });

        return () => { cancelled = true; };
    }, [currentView, selectedStaffId, selectedServices, editDate, selectedDate, defaultDate]);

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
                    if (!category.items) continue;
                    const found = category.items.find((i: any) => i.name === name);
                    if (found) {
                        catalogService = { ...found, colorClass: category.colorClass };
                        break;
                    }
                }

                return catalogService ? {
                    ...catalogService,
                    price: catalogService.price,
                    staff: appointment.staff,
                    staffId: appointment.staffId,
                } : {
                    id: String(990 + index),
                    name: name,
                    price: 0,
                    duration: Math.floor(appointment.duration / serviceNames.length),
                    staff: appointment.staff,
                    staffId: appointment.staffId,
                    colorClass: 'bg-purple-500',
                    pricingUnit: appointment.pricingUnit || 'Por Serviço'
                };
            });

            setSelectedServices(loadedServices);
            setSelectedClient({ name: appointment.customer });

            // Initialize edit state
            const [y, m, d] = appointment.date.split('-').map(Number);
            const aptDate = new Date(y, m - 1, d);
            setEditDate(aptDate);
            setBaseDate(aptDate);
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
            const targetDate = selectedDate || defaultDate;
            const todayStr = formatDateStr(targetDate);
            setBaseDate(targetDate);
            setStartDateRange(todayStr);
            setStartTimeRange(initialTimeSlot || '09:00');
            setEndDateRange(todayStr);
            setEndTimeRange(initialTimeSlot ? addMinutes(initialTimeSlot, 60) : '10:00');

            if (initialTimeSlot) {
                setSelectedTimeSlot(initialTimeSlot);
            }

            if (initialStaffId) {
                setSelectedStaffId(initialStaffId);
            } else if (staffSource.length > 0) {
                setSelectedStaffId(staffSource[0].id);
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
    }, [mode, appointment, initialTimeSlot, initialDraft, selectedDate, initialStaffId, staffSource]);

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
            if (!selectedClient) return;
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

    const renderHeader = () => {
        const title = getHeaderTitle();

        return (
            <div className="p-6 border-b border-brand-border dark:border-dark-border flex justify-between items-center bg-white dark:bg-dark-surface z-20">
                <div className="flex items-center gap-3">
                    {currentView !== 'summary' && (
                        <button onClick={handleBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-dark-border transition-colors">
                            <ChevronLeftIcon size={20} className="text-brand-dark dark:text-dark-heading" />
                        </button>
                    )}
                    <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                        {title}
                    </h2>
                </div>

                <button onClick={handleCloseAttempt} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-dark-border transition-colors">
                    <XIcon size={24} className="text-brand-inactive-text dark:text-dark-body" />
                </button>
            </div>
        );
    }

    const getHeaderBgColor = () => {
        const s = status.toLowerCase();
        if (s === 'confirmed' || s === 'confirmado') return 'bg-emerald-600';
        if (s === 'pending' || s === 'aguardando') return 'bg-orange-500';
        if (s === 'ausência' || s === 'absent' || s === 'ausencia') return 'bg-red-500';
        if (s === 'cancelado' || s === 'canceled' || s === 'cancelar') return 'bg-red-600';
        if (s === 'iniciado' || s === 'in progress') return 'bg-[#003d32]';
        if (s === 'pago' || s === 'paid' || s === 'parcialmente pago') return 'bg-green-600';
        if (s === 'finalizado' || s === 'finished') return 'bg-gray-700';
        return 'bg-blue-600';
    }
    const [isPaymentSheetOpen, setIsPaymentSheetOpen] = useState(false);

    const VIEW_STATUS_OPTIONS = [
        { value: 'Reservado', label: 'Reservado' },
        { value: 'Confirmado', label: 'Confirmado' },
        { value: 'Aguardando', label: 'Aguardando' },
        { value: 'Iniciado', label: 'Iniciado' },
        { value: 'Ausência', label: 'Ausência' },
    ];

    const dates = useMemo(() => {
        const days = [];
        const currentSelectedDateStr = formatDateStr(editDate || selectedDate || defaultDate);

        for (let i = -2; i < 5; i++) {
            const d = new Date(baseDate);
            d.setDate(baseDate.getDate() + i + dateOffset);
            const dateStr = formatDateStr(d);
            const isSelected = dateStr === currentSelectedDateStr;
            days.push({
                day: d.toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3),
                num: d.getDate(),
                active: isSelected,
                fullDate: d
            });
        }
        return days;
    }, [baseDate, dateOffset, editDate, selectedDate, defaultDate]);

    const handleDateNav = (dir: 'prev' | 'next') => {
        setDateOffset(prev => dir === 'next' ? prev + 7 : prev - 7);
    }

    const handleSelectDay = (date: Date) => {
        setEditDate(date);
    };

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

    const SheetContent = (
        <div className={`relative w-full ${isMobile ? '' : 'max-w-md'} bg-white dark:bg-dark-surface flex flex-col h-full overflow-hidden`}>
            {renderHeader()}

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
                                    {group.category_display && <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">{group.category}</h3>}
                                    <div className="space-y-3">
                                        {group.items?.map((item: any) => {
                                            const isSelected = selectedServices.some(s => s.id === item.id);
                                            const isEditingMode = editingServiceIndex !== null;

                                            return (
                                                <div
                                                    key={item.id}
                                                    onClick={() => handleServiceSwap({ ...item, colorClass: group.colorClass })}
                                                    className={`relative flex justify-between items-center p-4 rounded-xl cursor-pointer border bg-transparent transition-all ${isSelected && !isEditingMode ? 'border-brand-green' : 'border-brand-border dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600'}`}
                                                >
                                                    <div className="absolute left-1.5 top-1.5 bottom-1.5 w-1 rounded-full bg-brand-green dark:bg-brand-green"></div>
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
                        <motion.div key="client" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-0 -mx-6 -mt-6">
                            <div className="z-10 shrink-0 border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface sticky top-0">
                                <Input
                                    label=""
                                    name="customerSearch"
                                    placeholder="Buscar por nome, email ou telefone..."
                                    value={clientSearch}
                                    onChange={(e) => setClientSearch(e.target.value)}
                                    prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                    className="mb-0"
                                    variant="full-rounded"
                                />
                            </div>

                            <div className="flex flex-col px-2 pb-2">
                                {filteredClients.map((customer) => {
                                    const isSelected = selectedClient?.id === customer.id;
                                    return (
                                        <div
                                            key={customer.id}
                                            role={isSelected ? undefined : "button"}
                                            tabIndex={isSelected ? undefined : 0}
                                            onClick={!isSelected ? () => { setSelectedClient(customer); handleNext(); } : undefined}
                                            className={`group flex items-center gap-4 border-b border-brand-border p-3.5 transition-colors last:border-0 dark:border-dark-border ${isSelected
                                                ? "bg-brand-primary/5 dark:bg-brand-primary/10"
                                                : "cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-border/40"
                                                }`}
                                        >
                                            <UserProfileImage
                                                fullName={customer.name || "Cliente"}
                                                imageUrl={customer.avatar_url}
                                                className="h-12 w-12 shrink-0 text-lg"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                    <span className="truncate text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                        {customer.name}
                                                    </span>
                                                    {isSelected && (
                                                        <Badge variant="green" className="whitespace-nowrap scale-90 shrink-0">
                                                            Selecionado
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="truncate text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                                    ID #{customer.id ? customer.id.substring(0, 5).toUpperCase() : "-"}
                                                </p>
                                                <p className="truncate text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                                    {customer.email || "Sem e-mail"}
                                                </p>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-2">
                                                {!isSelected && (
                                                    <div className="flex h-8 w-8 items-center justify-center text-brand-inactive-text opacity-0 transition-opacity group-hover:opacity-100">
                                                        <PlusIcon size={18} />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </motion.div>
                    )}

                    {/* DATETIME SELECTION */}
                    {currentView === 'datetime' && (
                        <motion.div key="datetime" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-6">
                            {/* Staff Selection */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-bold text-brand-dark dark:text-dark-heading ml-1">Profissional</label>
                                <Dropdown
                                    width="w-full"
                                    trigger={
                                        <Button
                                            variant="outline"
                                            className="w-full h-14 rounded-xl"
                                        >
                                            <div className="flex items-center gap-3">
                                                <UserProfileImage
                                                    fullName={getSelectedStaffName()}
                                                    imageUrl={getSelectedStaffAvatar()}
                                                    className="w-8 h-8"
                                                />
                                                <div className="text-left">
                                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{getSelectedStaffName()}</p>
                                                </div>
                                            </div>
                                        </Button>
                                    }
                                >
                                    {staffSource.map(staff => (
                                        <DropdownItem key={staff.id} onClick={() => setSelectedStaffId(staff.id)} className="gap-3">
                                            <UserProfileImage fullName={staff.name} imageUrl={staff.avatar} className="w-6 h-6" />
                                            <span className="font-medium">{staff.name}</span>
                                        </DropdownItem>
                                    ))}
                                </Dropdown>
                            </div>

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
                                                className="h-8"
                                                leftIcon={<CalendarIcon size={12} />}
                                                onClick={handleEnterSelectionMode}
                                            >
                                                Escolha no calendário
                                            </Button>
                                        </div>
                                        <div className="space-y-3">
                                            {isLoadingSlots ? (
                                                <div className="flex flex-col items-center justify-center py-12 gap-3">
                                                    <ThreeDotsLoader />
                                                    <span className="text-sm text-brand-inactive-text font-medium">Verificando disponibilidade...</span>
                                                </div>
                                            ) : timeSlots.length === 0 ? (
                                                <div className="text-center py-12">
                                                    <IconPlaceholder
                                                        icon={CalendarIcon}
                                                        title="Nenhum horário disponível nesta data"
                                                        subtitle="Tente outra data ou outro profissional."
                                                    />
                                                </div>
                                            ) : (
                                                timeSlots.map((slot, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => setSelectedTimeSlot(slot)}
                                                        className={`w-full p-3 rounded-xl border text-sm font-bold transition-all flex justify-between items-center ${selectedTimeSlot === slot ? 'border-brand-dark bg-brand-dark text-white' : 'border-brand-border dark:border-dark-border hover:border-gray-300 text-brand-dark dark:text-dark-heading'}`}
                                                    >
                                                        {slot}
                                                        {selectedTimeSlot === slot && <CheckIcon size={16} />}
                                                    </button>
                                                ))
                                            )}
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
                                <div className={`${getHeaderBgColor()} text-white rounded-2xl p-5 relative overflow-hidden transition-colors duration-300`}>
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
                                            width="w-[140px]"
                                            trigger={
                                                <button disabled={isPaid} className={`flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-full text-white text-sm font-bold transition-colors ${isPaid ? 'opacity-70 cursor-not-allowed' : ''}`}>
                                                    {status}
                                                    {!isPaid && <ChevronDownIcon size={16} />}
                                                </button>
                                            }
                                        >
                                            {VIEW_STATUS_OPTIONS.map(opt => (
                                                <DropdownItem key={opt.value} onClick={() => setStatus(opt.value)}>{opt.label}</DropdownItem>
                                            ))}
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
                                    <div className="flex items-center justify-between py-2 px-1">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <UserProfileImage fullName={selectedClient.name} imageUrl={selectedClient.avatar_url} className="w-10 h-10" />
                                                <div className="flex flex-col">
                                                    <div className="font-bold text-brand-dark dark:text-dark-heading leading-tight">{selectedClient.name}</div>
                                                    <div className="text-xs text-brand-inactive-text">{selectedClient.email || 'Cliente'}</div>
                                                </div>
                                            </div>
                                            {!isPaid && <Button variant="link" className="font-bold" onClick={() => setCurrentView('client')}>Alterar</Button>}
                                        </div>
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
                                            onEdit={!isPaid ? () => handleServiceEdit(idx) : undefined}
                                            onRemove={!isPaid ? () => handleRemoveServiceRequest(idx) : undefined}
                                            // Pass formatted time range
                                            timeRange={getServiceTimeRange(idx)}
                                        />
                                    ))}
                                </div>
                                {!isPaid && (
                                    <Button
                                        variant="link"
                                        onClick={handleAddMoreService}
                                        className="mt-4"
                                    >
                                        <PlusIcon size={18} /> Adicionar serviço
                                    </Button>
                                )}
                            </div>

                            {/* Total Row */}
                            <div className="flex justify-between items-end border-t border-brand-border dark:border-dark-border pt-4 px-1">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-brand-inactive-text uppercase tracking-wider">Duração Total</span>
                                    <span className="text-lg font-bold text-brand-dark dark:text-dark-heading">{formatDuration(calculatedDuration)}</span>
                                </div>
                                <div className="flex flex-col text-right">
                                    <span className="text-[10px] font-bold text-brand-inactive-text uppercase tracking-wider">Valor Total</span>
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
                                <div className="absolute left-1.5 top-1.5 bottom-1.5 w-1 rounded-full bg-brand-green dark:bg-brand-green"></div>
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
                                <Input
                                    label="Preço do serviço"
                                    name="price"
                                    prefix="BRL"
                                    value={selectedServices[editingServiceIndex].price}
                                    onChange={(e) => updateEditingService('price', Number(e.target.value))}
                                />

                                <Input
                                    label="Duração (minutos)"
                                    name="duration"
                                    type="number"
                                    value={selectedServices[editingServiceIndex].duration}
                                    onChange={(e) => updateEditingService('duration', e.target.value)}
                                />

                                <div className="flex flex-col gap-1.5">
                                    <label className="text-sm font-bold text-brand-dark dark:text-dark-heading ml-1">Profissional</label>
                                    <Dropdown
                                        width="w-full"
                                        showChevron={false}
                                        trigger={
                                            <Button
                                                variant="outline"
                                                className="w-full h-12 rounded-xl"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <UserProfileImage
                                                        fullName={selectedServices[editingServiceIndex].staff}
                                                        imageUrl={staffSource.find(s => s.id === selectedServices[editingServiceIndex].staffId)?.avatar}
                                                        className="w-6 h-6"
                                                    />
                                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{selectedServices[editingServiceIndex].staff}</span>
                                                </div>
                                            </Button>
                                        }
                                    >
                                        {staffSource.map(staff => (
                                            <DropdownItem key={staff.id} onClick={() => updateEditingService('staffId', staff.id)} className="gap-3">
                                                <UserProfileImage fullName={staff.name} imageUrl={staff.avatar} className="w-6 h-6" />
                                                <span className="font-medium">{staff.name}</span>
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
                                    label="Observações"
                                    name="notes"
                                    placeholder="Adicione observações ao agendamento..."
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
                                {currentView !== 'client' && (
                                    <Button variant="outline" className="flex-1 h-[48px]" onClick={handleBack}>
                                        Voltar
                                    </Button>
                                )}
                                <Button
                                    variant="default"
                                    className={`flex-1 h-[48px] ${currentView === 'services' && selectedServices.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    onClick={currentView === 'edit-service' ? () => setCurrentView('summary') : handleNext}
                                    disabled={(currentView === 'services' && selectedServices.length === 0) || isSaving}
                                >
                                    {isSaving && currentView === 'summary' ? (
                                        <span className="flex items-center gap-2">
                                            Loader
                                        </span>
                                    ) : currentView === 'summary' || (currentView === 'datetime' && (selectedTimeSlot || needsRangePicker)) ? <span className="flex items-center gap-2">Agendar <CheckCircleIcon size={18} /></span> : currentView === 'edit-service' ? 'Aplicar' : 'Próximo'}
                                </Button>
                            </div>
                        ) : (
                            /* VIEW MODE FOOTER */
                            isPaid ? (
                                <Button variant="default" className="w-full font-bold" onClick={handleSaveChanges}>
                                    Salvar Observações
                                </Button>
                            ) : (
                                <Button variant="default" className="w-full font-bold bg-brand-green hover:bg-brand-green/90 border-brand-green" onClick={() => setIsPaymentSheetOpen(true)}>
                                    Checkout
                                </Button>
                            )
                        )}
                    </div>
                )
            )}
        </div>
    );

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

            {!isPaymentSheetOpen && (
                isMobile ? (
                    <BottomSheet isOpen={true} onClose={handleCloseAttempt}>
                        {SheetContent}
                    </BottomSheet>
                ) : (
                    <Portal>
                        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={handleCloseAttempt} />
                        <motion.div
                            initial={{ x: '100%', opacity: 0.5 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: '100%', opacity: 0.5 }}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            className="fixed inset-y-0 right-0 z-50 w-full max-w-sm flex flex-col bg-white shadow-2xl dark:bg-dark-surface overflow-hidden"
                        >
                            {SheetContent}
                        </motion.div>
                    </Portal>
                )
            )}

            <AnimatePresence>
                {isPaymentSheetOpen && (
                    <PaymentSheet
                        isOpen={isPaymentSheetOpen}
                        onClose={() => setIsPaymentSheetOpen(false)}
                        appointment={appointment}
                        partnerId={partnerId || ''}
                        onSuccess={() => {
                            setIsPaymentSheetOpen(false);
                            onClose();
                        }}
                        cart={selectedServices.map(s => ({ ...s, qty: 1, productId: s.id }))}
                        total={calculatedPrice}
                        customer={{ id: selectedClient?.id, name: selectedClient?.name }}
                    />
                )}
            </AnimatePresence>
        </>
    )
}
