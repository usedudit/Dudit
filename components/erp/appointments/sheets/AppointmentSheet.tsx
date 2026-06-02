import { useState, useEffect, useMemo, useRef } from 'react';
import { toast } from '@/hooks/use-notification';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, AlertTriangle } from 'lucide-react';
import { ChevronLeftIcon, XIcon, SearchIcon, CheckCircleIcon, ChevronRightIcon, PlusIcon, CalendarIcon, CheckIcon, ClockIcon, RepeatIcon, ArrowRightIcon, ChevronDownIcon } from '@/lib/icons';
import { Button, Input, Dropdown, DropdownItem, AlertModal, DatePicker, TimePicker, FormTextarea, ThreeDotsLoader, IconPlaceholder, Spinner, EmailInput, PhoneInput, Checkbox, MoneyInput, RadioButton } from '@/components/reusable';
import { getAvailableTimeSlotsAction } from '@/app/actions/erp/appointments';
import { usePermissions } from '@/lib/permission-context';
import { RecurrenceView, ActivityLog } from '../Shared';
import { Appointment } from '../types';
import { ServiceItemCard } from '../ServiceItemCard';
import { formatDateStr, formatDuration, parseLocalDate, checkAppointmentCollision } from '../utils';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { useMediaQuery } from '@/components/erp/hooks';
import BottomSheet from '@/components/BottomSheet';
import Portal from '@/components/Portal';
import { UserProfileImage } from '@/lib/utils/UserProfileImage';
import PaymentModal from '@/components/erp/orders/PaymentModal';
import SelectCustomerSheet from '@/components/erp/clientes/SelectCustomerSheet';
import { createPOSCustomerQuickAction } from '@/app/actions/erp/pdv';
import { createServiceAction } from '@/app/actions/erp/servicos';
import { createERPOrderAction } from '@/app/actions/erp/orders';
import { getFinanceAccountsAction } from '@/app/actions/erp/finance-accounts';
import { pickBankThenCashDefaultFinanceAccountId } from '@/lib/finance-utils';
import { updateAppointmentAction } from '@/app/actions/erp/appointments';
import { useCSRFToken } from '@/hooks/use-csrf-token';

export const AppointmentSheet = ({
    onClose,
    onDelete,
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
    partnerId,
    openingHours,
    onAppointmentUpdated,
    appointmentsList,
}: {
    onClose: () => void,
    onDelete?: (id: string) => Promise<boolean>,
    mode: 'create' | 'view',
    appointment?: Appointment | null,
    onSave: (data: any | any[]) => void,
    onEnterSelectionMode: (currentData: any) => void,
    selectedDate?: Date,
    initialTimeSlot?: string,
    defaultDate: Date,
    initialDraft?: any,
    initialStaffId?: string,
    onCheckout?: (data: any) => void,
    onViewSale?: () => void,
    onStatusChangeRequest?: (type: 'cancel' | 'absence', appointment: Appointment) => void,
    servicesCatalog?: any[],
    clientsCatalog?: any[],
    staffCatalog?: any[],
    isSaving?: boolean,
    partnerId?: string,
    openingHours?: any,
    onAppointmentUpdated?: (item: any) => void,
    appointmentsList?: Appointment[],
}) => {
    const servicesSource = servicesCatalog || [];
    const clientsSource = clientsCatalog || [];
    const staffSource = staffCatalog || [];
    const { canEdit, hasSpecific, canDelete } = usePermissions();
    const [currentView, setCurrentView] = useState<'summary' | 'services' | 'client' | 'datetime' | 'activity' | 'edit-service' | 'recurrence' | 'notes'>(() => {
        if (mode === 'create') {
            return 'services';
        }
        return 'summary';
    });
    const [isClientOverlayOpen, setIsClientOverlayOpen] = useState(false);
    const [isHistoryOverlayOpen, setIsHistoryOverlayOpen] = useState(false);
    const [isNotesOverlayOpen, setIsNotesOverlayOpen] = useState(false);
    const [isRecurrenceOverlayOpen, setIsRecurrenceOverlayOpen] = useState(false);
    const [selectedServices, setSelectedServices] = useState<any[]>([]);
    const [selectedClient, setSelectedClient] = useState<any>(null);
    const [editingServiceIndex, setEditingServiceIndex] = useState<number | null>(null);
    const [isAddingMore, setIsAddingMore] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [serviceToDeleteIndex, setServiceToDeleteIndex] = useState<number | null>(null);
    const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);
    const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
    
    // Inline Client Selection and Overlay Editing states
    const [isEditServiceOpen, setIsEditServiceOpen] = useState(false);
    const [isNewClientOpen, setIsNewClientOpen] = useState(false);
    const [clientSearch, setClientSearch] = useState('');
    const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
    const [newCustomerName, setNewCustomerName] = useState('');
    const [newCustomerEmail, setNewCustomerEmail] = useState('');
    const [newCustomerPhone, setNewCustomerPhone] = useState('');

    const checkOutsideOperatingHours = (aptDateStr: string, aptTimeStr: string, durationMinutes: number) => {
        if (!openingHours) return false;
        const DAYS_OF_WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const parseLocalDate = (dateStr: string): Date => {
            if (!dateStr) return new Date();
            const [year, month, day] = dateStr.split('-').map(Number);
            return new Date(year, month - 1, day);
        };
        const dateObj = parseLocalDate(aptDateStr);
        const dName = DAYS_OF_WEEK[dateObj.getDay()];
        const dConfig = openingHours[dName];
        if (!dConfig || !dConfig.enabled) return true;
        
        const parseTimeToMinutes = (timeStr: string) => {
            if (!timeStr || !timeStr.includes(':')) return -1;
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };

        const fromMin = parseTimeToMinutes(dConfig.from);
        const toMin = parseTimeToMinutes(dConfig.to);
        
        const aptStartMin = parseTimeToMinutes(aptTimeStr);
        const aptEndMin = aptStartMin + durationMinutes;
        
        return aptStartMin < fromMin || aptEndMin > toMin;
    };

    const filteredClients = useMemo(() => {
        if (!clientSearch) return clientsSource;
        const q = clientSearch.toLowerCase();
        return clientsSource.filter(c =>
            (c.name || '').toLowerCase().includes(q) ||
            (c.email || '').toLowerCase().includes(q) ||
            (c.phone || '').toLowerCase().includes(q)
        );
    }, [clientSearch, clientsSource]);


    const router = useRouter();
    const csrfToken = useCSRFToken();

    const handleViewSale = () => {
        const saleId = completedOrderId || appointment?.saleId || (appointment as any)?.sale_id;
        if (saleId) {
            router.push(`/erp/orders/${saleId}`);
            onClose();
        } else {
            toast.warning("Venda não encontrada", "Não foi possível encontrar a venda associada a este agendamento.");
        }
    };

    const isMobile = useMediaQuery("(max-width: 768px)");

    // Status & Notes State
    const [status, setStatus] = useState(appointment?.status || 'Reservado');
    const [notes, setNotes] = useState(appointment?.notes || '');

    // Time & Date State
    const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(initialTimeSlot || null);

    // START/END Ranges (For non-standard services)
    const [startDateRange, setStartDateRange] = useState<string>('');
    const [startTimeRange, setStartTimeRange] = useState<string>('');
    const [endDateRange, setEndDateRange] = useState<string>('');
    const [endTimeRange, setEndTimeRange] = useState<string>('');

    // Specific Staff Selection for New Appointment
    const [selectedStaffId, setSelectedStaffId] = useState<string>(initialStaffId || (staffSource.length > 0 ? staffSource[0].id : ''));

    // Calendar selection and navigation base
    const [selectedCalDate, setSelectedCalDate] = useState<Date>(() => {
        if (mode === 'view' && appointment) {
            const [y, m, d] = appointment.date.split('-').map(Number);
            return new Date(y, m - 1, d);
        }
        return selectedDate || defaultDate;
    });
    const [baseCalDate, setBaseCalDate] = useState<Date>(() => {
        if (mode === 'view' && appointment) {
            const [y, m, d] = appointment.date.split('-').map(Number);
            return new Date(y, m - 1, d);
        }
        return selectedDate || defaultDate;
    });
    const [editTime, setEditTime] = useState<string>('');

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

            const hasClientChanged = (selectedClient?.name || '') !== appointment.customer;
            
            const currentDateStr = formatDateStr(selectedCalDate);
            const hasDateChanged = currentDateStr !== appointment.date;
            
            const currentTimeStr = editTime || selectedTimeSlot || appointment.time;
            const hasTimeChanged = currentTimeStr !== appointment.time;

            const hasStaffChanged = (selectedServices[0]?.staffId || '') !== appointment.staffId;

            return hasStatusChanged || hasNotesChanged || hasServicesChanged || hasClientChanged || hasDateChanged || hasTimeChanged || hasStaffChanged;
        }
        return false;
    }, [mode, selectedServices, selectedClient, notes, status, appointment, selectedCalDate, editTime, selectedTimeSlot]);

    const handleCloseAttempt = () => {
        if (hasChanges) {
            setIsUnsavedModalOpen(true);
        } else {
            onClose();
        }
    };

    // Recurrence State
    const [recurrenceFreq, setRecurrenceFreq] = useState('Não se repete');
    const [recurrenceTerm, setRecurrenceTerm] = useState('Data específica');
    const [recurrenceEndDate, setRecurrenceEndDate] = useState(() => {
        const d = new Date(defaultDate);
        d.setDate(d.getDate() + 30);
        return d;
    });

    // Client Selection State & Search
    const [localClients, setLocalClients] = useState<any[]>(() => clientsCatalog || []);

    useEffect(() => {
        setLocalClients(clientsCatalog || []);
    }, [clientsCatalog]);

    // Client change came from Summary view tracking
    const [cameFromSummary, setCameFromSummary] = useState(false);
    const [previousClient, setPreviousClient] = useState<any>(null);
    const [isSelectCustomerOpen, setIsSelectCustomerOpen] = useState(false);
    const isSelectingClientRef = useRef(false);

    // Services Catalog selection, search & quick-add states
    const [localServices, setLocalServices] = useState<any[]>(() => servicesCatalog || []);

    useEffect(() => {
        setLocalServices(servicesCatalog || []);
    }, [servicesCatalog]);

    const [serviceSearch, setServiceSearch] = useState('');
    const filteredServices = useMemo(() => {
        if (!serviceSearch) return localServices;
        const q = serviceSearch.toLowerCase();
        return localServices.map(group => {
            const filteredItems = (group.items || []).filter((item: any) =>
                (item.name || '').toLowerCase().includes(q)
            );
            return {
                ...group,
                items: filteredItems
            };
        }).filter(group => group.items.length > 0);
    }, [serviceSearch, localServices]);

    // Quick-add service states
    const [isNewServiceSheetOpen, setIsNewServiceSheetOpen] = useState(false);
    const [isCreatingService, setIsCreatingService] = useState(false);
    const [newServiceName, setNewServiceName] = useState("");
    const [newServicePrice, setNewServicePrice] = useState<number>(0);
    const [newServiceDuration, setNewServiceDuration] = useState("");
    const [serviceNameError, setServiceNameError] = useState<string | null>(null);
    const [servicePriceError, setServicePriceError] = useState<string | null>(null);
    const [serviceDurationError, setServiceDurationError] = useState<string | null>(null);

    const handleCreateService = async (payload: { name: string; price: number; duration: number }) => {
        if (!partnerId) {
            throw new Error("ID do parceiro não configurado.");
        }
        const result = await createServiceAction({
            partnerId,
            name: payload.name,
            price: payload.price,
            durationMinutes: payload.duration,
            billingUnit: 'per_service',
            category: 'Serviços',
        });
        if (!result.success) {
            throw new Error(result.error || "Não foi possível cadastrar o serviço.");
        }
        if (!result.data) {
            throw new Error("Não foi possível cadastrar o serviço.");
        }
        return result.data;
    };

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
        const targetDate = formatDateStr(selectedCalDate);

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
    }, [currentView, selectedStaffId, selectedServices, selectedCalDate]);

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
            const foundClient = (clientsSource || []).find(c => c.name === appointment.customer);
            setSelectedClient(foundClient || { name: appointment.customer });

            // Initialize edit state
            const [y, m, d] = appointment.date.split('-').map(Number);
            const aptDate = new Date(y, m - 1, d);
            setSelectedCalDate(aptDate);
            setBaseCalDate(aptDate);
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
            setSelectedCalDate(targetDate);
            setBaseCalDate(targetDate);
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
    }, [mode, appointment, initialTimeSlot, initialDraft, selectedDate, defaultDate, initialStaffId, staffSource]);

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
                // Normal Flow: Services -> Client inline step
                setCurrentView('client');
            }
        }
        else if (currentView === 'client') {
            if (!selectedClient) return;
            if (cameFromSummary) {
                setCurrentView('summary');
                setCameFromSummary(false);
            } else if (initialTimeSlot) {
                setCurrentView('summary');
            } else {
                setCurrentView('datetime');
            }
        }
        else if (currentView === 'datetime') {
            // Validation for range picker
            if (needsRangePicker) {
                if (new Date(`${startDateRange}T${startTimeRange}`) >= new Date(`${endDateRange}T${endTimeRange}`)) {
                    toast.warning("Intervalo inválido", "A data de término deve ser após a data de início.");
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

        const isOutsideHours = checkOutsideOperatingHours(baseDateStr, timeStr, calculatedDuration);
        const hasCollision = appointmentsList && appointment ? checkAppointmentCollision({
            ...appointment,
            date: baseDateStr,
            time: timeStr,
            duration: calculatedDuration,
            staffId: selectedServices[0]?.staffId || '',
            status: status
        } as Appointment, appointmentsList) : false;

        let finalNotes = notes;
        if (isOutsideHours) {
            finalNotes = `${finalNotes ? finalNotes + '\n' : ''}[LOG: Marcado fora do horário de funcionamento]`;
        }
        if (hasCollision) {
            finalNotes = `${finalNotes ? finalNotes + '\n' : ''}[LOG: Conflito de horário detectado]`;
        }

        // Apply staff assignments to generated payload
        const baseItem = {
            customerName: selectedClient?.name || 'Cliente Sem Nome',
            customerId: selectedClient?.id || null,
            serviceName: selectedServices.map(s => s.name).join(', '),
            date: baseDateStr,
            time: timeStr,
            duration: calculatedDuration,
            price: calculatedPrice,
            pricingUnit: selectedServices[0]?.pricingUnit || 'Por Serviço',
            notes: finalNotes,
            status: status,
        };

        if (recurrenceFreq === 'Não se repete') {
            // SINGLE APPOINTMENT: Use the selected services mapping (can map multiple services to same professional)
            const staffGroups: Record<string, typeof selectedServices> = {};
            selectedServices.forEach(s => {
                const sId = s.staffId || selectedStaffId;
                if (!staffGroups[sId]) staffGroups[sId] = [];
                staffGroups[sId].push(s);
            });

            const rows = Object.entries(staffGroups).map(([sId, svcs]) => {
                const staff = staffSource.find(sm => sm.id === sId);
                const combinedName = svcs.map(s => s.name).join(', ');
                const combPrice = svcs.reduce((acc, curr) => acc + Number(curr.price || 0), 0);
                const combDur = svcs.reduce((acc, curr) => acc + Number(curr.duration || 0), 0);

                return {
                    ...baseItem,
                    serviceName: combinedName,
                    price: combPrice,
                    duration: combDur,
                    staffId: sId,
                    staffName: staff ? staff.name : 'Profissional',
                };
            });

            onSave(rows);
        } else {
            // RECURRING APPOINTMENT SERIES
            let repeatCount = 1;
            if (recurrenceTerm === 'Número de ocorrências') {
                repeatCount = 10; // Default count
            } else if (recurrenceTerm === 'Data específica' && recurrenceEndDate) {
                const startD = new Date(baseDateStr + 'T12:00:00');
                const endD = new Date(recurrenceEndDate.toISOString().split('T')[0] + 'T12:00:00');
                const stepDays = recurrenceFreq === 'Diário' ? 1 : 7;
                const diffMs = endD.getTime() - startD.getTime();
                const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                repeatCount = Math.floor(diffDays / stepDays) + 1;
            }

            const baseDate = new Date(baseDateStr + 'T12:00:00');
            const recurrenceGroupId = crypto.randomUUID();
            const payloads: any[] = [];

            // Group by staff for combined recurring rows
            const staffGroups: Record<string, typeof selectedServices> = {};
            selectedServices.forEach(s => {
                const sId = s.staffId || selectedStaffId;
                if (!staffGroups[sId]) staffGroups[sId] = [];
                staffGroups[sId].push(s);
            });

            for (let i = 0; i < repeatCount; i++) {
                const currD = new Date(baseDate);
                if (recurrenceFreq === 'Diário') {
                    currD.setDate(baseDate.getDate() + i);
                } else if (recurrenceFreq === 'Semanal') {
                    currD.setDate(baseDate.getDate() + (i * 7));
                }

                const dateStr = currD.toISOString().split('T')[0];

                Object.entries(staffGroups).forEach(([sId, svcs]) => {
                    const staff = staffSource.find(sm => sm.id === sId);
                    const combinedName = svcs.map(s => s.name).join(', ');
                    const combPrice = svcs.reduce((acc, curr) => acc + Number(curr.price || 0), 0);
                    const combDur = svcs.reduce((acc, curr) => acc + Number(curr.duration || 0), 0);

                    payloads.push({
                        ...baseItem,
                        serviceName: combinedName,
                        price: combPrice,
                        duration: combDur,
                        date: dateStr,
                        staffId: sId,
                        staffName: staff ? staff.name : 'Profissional',
                        recurrenceGroupId,
                        recurrenceRule: recurrenceFreq === 'Diário' ? 'daily' : 'weekly'
                    });
                });
            }

            onSave(payloads);
        }
    };

    const handleCancelClientChange = () => {
        setSelectedClient(previousClient);
        setPreviousClient(null);
        setCameFromSummary(false);
        setCurrentView('summary');
    };

    const handleSaveClientChange = () => {
        setPreviousClient(null);
        setCameFromSummary(false);
        setCurrentView('summary');
    };

    const handleBack = () => {
        // Reverse Flow
        if (currentView === 'services') {
            handleCloseAttempt();
        }
        else if (currentView === 'client') {
            if (cameFromSummary) {
                setCurrentView('summary');
                setCameFromSummary(false);
            } else {
                setCurrentView('services');
            }
        }
        else if (currentView === 'datetime') {
            if (mode === 'view') {
                setCurrentView('summary');
            } else {
                setCurrentView('client');
            }
        }
        else if (currentView === 'summary') {
            if (mode === 'create') {
                if (initialTimeSlot) {
                    setCurrentView('client');
                } else {
                    // Creating: Go back to Datetime
                    setCurrentView('datetime');
                }
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
        const finalDateStr = needsRangePicker ? startDateRange : formatDateStr(selectedCalDate);
        const timeStr = needsRangePicker ? startTimeRange : (editTime || selectedTimeSlot || '09:00');
        const isOutsideHours = checkOutsideOperatingHours(finalDateStr, timeStr, calculatedDuration);
        const hasCollision = appointmentsList && appointment ? checkAppointmentCollision({
            ...appointment,
            date: finalDateStr,
            time: timeStr,
            duration: calculatedDuration,
            staffId: selectedServices[0]?.staffId || '',
            status: status
        } as Appointment, appointmentsList) : false;

        let finalNotes = notes;
        if (isOutsideHours) {
            finalNotes = `${finalNotes ? finalNotes + '\n' : ''}[LOG: Marcado fora do horário de funcionamento]`;
        }
        if (hasCollision) {
            finalNotes = `${finalNotes ? finalNotes + '\n' : ''}[LOG: Conflito de horário detectado]`;
        }

        const updatedApp = {
            ...appointment,
            customer: selectedClient?.name,
            customerName: selectedClient?.name,
            customerId: selectedClient?.id,
            status: status,
            price: calculatedPrice,
            notes: finalNotes,
            service: selectedServices.map(s => s.name).join(', '), // Combine names
            duration: calculatedDuration, // Update total duration
            staff: selectedServices[0]?.staff,
            staffId: selectedServices[0]?.staffId,
            date: finalDateStr,
            time: timeStr,
        };
        onSave(updatedApp);
    };

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
        if (s === 'iniciado' || s === 'in progress') return 'bg-[#003229]';
        if (s === 'pago' || s === 'paid' || s === 'parcialmente pago') return 'bg-green-600';
        if (s === 'finalizado' || s === 'finished') return 'bg-gray-700';
        return 'bg-blue-600';
    }
    const [isPaymentSheetOpen, setIsPaymentSheetOpen] = useState(false);
    const [completedOrderId, setCompletedOrderId] = useState<string | null>(null);
    const [financeAccountId, setFinanceAccountId] = useState<string>('');

    // Fetch default finance account for order creation
    useEffect(() => {
        if (!partnerId) return;
        getFinanceAccountsAction(partnerId).then(res => {
            if (res.success && res.data?.accounts) {
                const active = res.data.accounts.filter((a: any) => a.is_active !== false);
                const defaultId = pickBankThenCashDefaultFinanceAccountId(active);
                if (defaultId) setFinanceAccountId(defaultId);
            }
        });
    }, [partnerId]);

    // Handle payment confirmation: create ERP order + update appointment
    const handleConfirmPayment = async (paymentData: any) => {
        if (!financeAccountId) {
            toast.warning("Conta financeira", "Nenhuma conta de recebimento configurada. Configure em Financeiro > Contas.");
            return { error: "Conta financeira não configurada" };
        }

        const items = selectedServices.map((s, idx) => ({
            productId: null as string | null,
            customName: s.name,
            quantity: 1,
            unitPrice: s.price,
            sortOrder: idx,
        }));

        const payload = {
            partnerId: partnerId || '',
            customerId: selectedClient?.id,
            customerName: selectedClient?.name || 'Consumidor final',
            salesChannel: 'Agendamento',
            deliveryMethod: 'pickup' as const,
            financeAccountId,
            paymentStatus: paymentData.paymentStatus as 'paid' | 'partially_paid' | 'unpaid',
            paymentMethod: paymentData.paymentMethod || 'pendente',
            paymentBreakdown: paymentData.paymentBreakdown,
            deliveryStatus: 'delivered' as const,
            paidAmount: paymentData.paidAmount,
            items,
            subtotal: calculatedPrice,
            discountValue: 0,
            discountType: 'fixed' as const,
            shippingCost: 0,
            additionalCosts: 0,
            totalAmount: calculatedPrice,
            notes: notes ? `Agendamento \u2022 ${notes}` : 'Agendamento',
            csrf_token: csrfToken || undefined,
            paymentProvider: paymentData.paymentProvider || undefined,
            mpPaymentId: paymentData.mpPaymentId || undefined,
        };

        try {
            const result = await createERPOrderAction(payload);
            if (!('success' in result) || !result.success) {
                return { error: ('error' in result ? result.error : 'Erro ao criar venda') || 'Erro ao criar venda' };
            }

            const orderId = 'orderId' in result ? (result as any).orderId : undefined;
            const orderNumber = 'orderNumber' in result ? (result as any).orderNumber : undefined;

            if (orderId) setCompletedOrderId(orderId);

            // Update appointment status to "Concluído"
            const newStatus = 'Concluído';
            setStatus(newStatus);

            if (appointment?.id) {
                try {
                    const updateRes = await updateAppointmentAction(appointment.id, {
                        status: newStatus,
                        paymentStatus: paymentData.paymentStatus === 'paid' ? 'Paid' : 'Partially Paid',
                        saleId: orderId,
                        paidAmount: paymentData.paidAmount
                    } as any);
                    if (updateRes.success && updateRes.item && onAppointmentUpdated) {
                        onAppointmentUpdated(updateRes.item);
                    }
                } catch { }
            }

            return { success: true, orderNumber };
        } catch (error) {
            return { error: 'Erro ao processar venda do agendamento' };
        }
    };

    const VIEW_STATUS_OPTIONS = [
        { value: 'Reservado', label: 'Reservado' },
        { value: 'Confirmado', label: 'Confirmado' },
        { value: 'Aguardando', label: 'Aguardando' },
        { value: 'Ausência', label: 'Ausência' },
    ] as const;

    const calendarMonthYear = useMemo(() => {
        const formatted = baseCalDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }, [baseCalDate]);

    const dates = useMemo(() => {
        const days = [];
        const currentSelectedDateStr = formatDateStr(selectedCalDate);

        for (let i = -2; i < 5; i++) {
            const d = new Date(baseCalDate);
            d.setDate(baseCalDate.getDate() + i);
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
    }, [baseCalDate, selectedCalDate]);

    const handleDateNav = (dir: 'prev' | 'next') => {
        setBaseCalDate(prev => {
            const d = new Date(prev);
            d.setDate(d.getDate() + (dir === 'next' ? 7 : -7));
            return d;
        });
    }

    const handleSelectDay = (date: Date) => {
        setSelectedCalDate(date);
    };

    const handleServiceEdit = (index: number) => {
        setEditingServiceIndex(index);
        setIsEditServiceOpen(true);
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

    const handleStatusChange = (newStatus: Appointment['status']) => {
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

    const handleQuickCreateCustomer = async () => {
        const name = newCustomerName.trim();
        const email = newCustomerEmail.trim();
        const phone = newCustomerPhone.trim();

        if (!name) {
            toast.warning("Nome obrigatório", "Por favor, informe o nome do cliente.");
            return;
        }

        setIsCreatingCustomer(true);
        try {
            const res = await createPOSCustomerQuickAction({
                partnerId: partnerId || '',
                name,
                email: email || undefined,
                phone: phone || undefined,
            });
            if (res.success && res.data) {
                const newCust = res.data;
                setSelectedClient(newCust);
                setLocalClients(prev => [newCust, ...prev]);
                setIsNewClientOpen(false);
                setNewCustomerName('');
                setNewCustomerEmail('');
                setNewCustomerPhone('');
                
                if (cameFromSummary) {
                    setCurrentView('summary');
                    setCameFromSummary(false);
                } else if (initialStaffId && initialTimeSlot && mode === 'create') {
                    setCurrentView('summary');
                } else {
                    setCurrentView('datetime');
                }
            } else {
                toast.error("Erro", res.error || "Não foi possível cadastrar o cliente.");
            }
        } catch (err) {
            toast.error("Erro", "Erro ao cadastrar o cliente.");
        } finally {
            setIsCreatingCustomer(false);
        }
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
    const finalDateForHeader = needsRangePicker ? startDateRange : formatDateStr(selectedCalDate);
    const headerDateObj = parseLocalDate(finalDateForHeader);
    const formattedHeaderDate = formatDate(headerDateObj);

    const SheetContent = (
        <div className="relative w-full bg-white dark:bg-dark-surface flex flex-col h-full overflow-hidden">
            {renderHeader()}

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pb-32 relative">
                <AnimatePresence mode='wait'>
                    {/* SERVICE SELECTION */}
                    {currentView === 'services' && (
                        <motion.div key="services" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-0 -mx-6 -mt-6">
                            <div className="z-10 shrink-0 border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface flex items-center gap-3">
                                <div className="flex-1">
                                    <Input
                                        label=""
                                        name="serviceSearch"
                                        placeholder="Buscar serviço"
                                        value={serviceSearch}
                                        onChange={(e) => setServiceSearch(e.target.value)}
                                        prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                        className="mb-0"
                                        variant="full-rounded"
                                    />
                                </div>
                                <Button
                                    variant="filled"
                                    onClick={() => {
                                        setNewServiceName("");
                                        setNewServicePrice(0);
                                        setNewServiceDuration("");
                                        setServiceNameError(null);
                                        setServicePriceError(null);
                                        setServiceDurationError(null);
                                        setIsNewServiceSheetOpen(true);
                                    }}
                                    className="h-11 w-11 shrink-0 rounded-full p-0 flex items-center justify-center bg-brand-primary hover:bg-brand-primary/95 text-white"
                                    type="button"
                                >
                                    <PlusIcon className="h-5 w-5" />
                                </Button>
                            </div>
                            <div className="p-6 space-y-6">
                                {filteredServices.map((group, idx) => (
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
                                                                {item.pricingUnit === 'Por Serviço' || !item.pricingUnit ? `${item.duration} min` : item.pricingUnit}
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-2">
                                                            {!isEditingMode && (
                                                                <div onClick={(e) => e.stopPropagation()}>
                                                                    <Checkbox
                                                                        checked={isSelected}
                                                                        onChange={() => handleServiceSwap({ ...item, colorClass: group.colorClass })}
                                                                    />
                                                                </div>
                                                            )}
                                                            <div className="font-bold text-brand-dark dark:text-dark-heading mt-2">{formatCurrency(item.price)}</div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
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
                                            <h3 className="font-bold text-brand-dark dark:text-dark-heading">{calendarMonthYear}</h3>
                                            <div className="flex gap-4">
                                                <button onClick={() => handleDateNav('prev')} className="text-brand-inactive-text hover:text-brand-dark"><ChevronLeftIcon size={16} /></button>
                                                <button onClick={() => handleDateNav('next')} className="text-brand-dark dark:text-dark-heading"><ChevronRightIcon size={16} /></button>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center text-center">
                                            {dates.map((d, i) => (
                                                <div key={i} className="flex flex-col gap-2 cursor-pointer group items-center" onClick={() => handleSelectDay(d.fullDate)}>
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

                    {/* CLIENT SELECTION INLINE */}
                    {currentView === 'client' && (
                        <motion.div key="client" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <Input
                                        label=""
                                        name="clientSearch"
                                        placeholder="Buscar por nome, email ou telefone..."
                                        value={clientSearch}
                                        onChange={(e) => setClientSearch(e.target.value)}
                                        prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                        className="mb-0"
                                        variant="full-rounded"
                                    />
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setNewCustomerName("");
                                        setNewCustomerEmail("");
                                        setNewCustomerPhone("");
                                        setIsNewClientOpen(true);
                                    }}
                                    className="h-11 px-3 shrink-0 rounded-xl"
                                    type="button"
                                >
                                    <PlusIcon size={16} /> Novo
                                </Button>
                            </div>

                            <div className="space-y-2 max-h-[350px] overflow-y-auto custom-scrollbar">
                                {filteredClients.length === 0 ? (
                                    <div className="text-center py-8 text-brand-inactive-text">
                                        Nenhum cliente encontrado.
                                    </div>
                                ) : (
                                    filteredClients.map((client) => {
                                        const isSelected = selectedClient?.id === client.id;
                                        return (
                                            <div
                                                key={client.id}
                                                onClick={() => {
                                                    setSelectedClient(client);
                                                    if (cameFromSummary) {
                                                        setCurrentView('summary');
                                                        setCameFromSummary(false);
                                                    } else if (initialStaffId && initialTimeSlot && mode === 'create') {
                                                        setCurrentView('summary');
                                                    } else {
                                                        setCurrentView('datetime');
                                                    }
                                                }}
                                                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                                                    isSelected ? 'border-brand-green bg-green-50/5' : 'border-brand-border dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <UserProfileImage fullName={client.name || "Cliente"} imageUrl={client.avatar_url || client.avatar} className="w-8 h-8 shrink-0 text-[10px]" />
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{client.name}</span>
                                                        <span className="text-xs text-brand-inactive-text truncate">{client.email || client.phone || 'Cliente'}</span>
                                                    </div>
                                                </div>
                                                {isSelected && <CheckCircleIcon size={18} className="text-brand-green shrink-0" />}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* VIEW: SUMMARY */}
                    {currentView === 'summary' && (() => {
                        const isCompletedStatus = (status || '').toLowerCase() === 'concluído' || (status || '').toLowerCase() === 'concluido';
                        const isLocked = isPaid || isCompletedStatus;
                        const currentPaidAmount = completedOrderId ? calculatedPrice : (appointment?.paidAmount || 0);
                        const remainingToPay = Math.max(0, calculatedPrice - currentPaidAmount);

                        const finalDateStr = needsRangePicker ? startDateRange : formatDateStr(selectedCalDate);
                        const timeStr = needsRangePicker ? startTimeRange : (editTime || selectedTimeSlot || '09:00');
                        const isOutsideHours = checkOutsideOperatingHours(finalDateStr, timeStr, calculatedDuration);
                        const hasCollision = appointmentsList && appointment ? checkAppointmentCollision({
                            ...appointment,
                            date: finalDateStr,
                            time: timeStr,
                            duration: calculatedDuration,
                            staffId: selectedServices[0]?.staffId || '',
                            status: status
                        } as Appointment, appointmentsList) : false;

                        return (
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
                                            <Dropdown
                                                width="w-48"
                                                fullWidth={false}
                                                trigger={
                                                    <button
                                                        disabled={isLocked}
                                                        className={`flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 dark:border-dark-border text-brand-dark dark:text-dark-heading rounded-full text-sm font-bold shadow-sm transition-colors hover:bg-gray-50 dark:hover:bg-dark-border ${isLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
                                                    >
                                                        {status}
                                                        {!isLocked && <ChevronDownIcon size={14} className="text-brand-inactive-text" />}
                                                    </button>
                                                }
                                            >
                                                <div className="min-w-[140px]">
                                                    {VIEW_STATUS_OPTIONS.map(opt => (
                                                        <DropdownItem key={opt.value} onClick={() => handleStatusChange(opt.value)}>{opt.label}</DropdownItem>
                                                    ))}
                                                </div>
                                            </Dropdown>
                                        </div>
                                    </div>
                                )}

                                {/* Outside Hours Alert Banner */}
                                {isOutsideHours && (
                                    <div className="p-3.5 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/30 rounded-xl flex items-start gap-2.5 text-xs text-orange-800 dark:text-orange-300">
                                        <AlertTriangle size={16} className="text-orange-500 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-bold">Atenção: Horário Especial</p>
                                            <p className="opacity-90">Este agendamento está fora do horário de funcionamento do estabelecimento.</p>
                                        </div>
                                    </div>
                                )}

                                {/* Collision Warning Banner */}
                                {hasCollision && (
                                    <div className="p-3.5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl flex items-start gap-2.5 text-xs text-red-800 dark:text-red-300">
                                        <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-bold">Conflito de Horário</p>
                                            <p className="opacity-90">Este profissional já possui outro agendamento ativo neste mesmo horário.</p>
                                        </div>
                                    </div>
                                )}

                                {/* Client Section */}
                                <div>
                                    <div className="flex justify-between items-center mb-3 px-1">
                                        <h3 className="font-bold text-brand-dark dark:text-dark-heading">Cliente</h3>
                                    </div>
                                    {selectedClient && (
                                        <div className="flex items-center justify-between py-2 px-1 w-full">
                                            <div className="flex items-center gap-3">
                                                <UserProfileImage fullName={selectedClient.name} imageUrl={selectedClient.avatar_url} className="w-10 h-10" />
                                                <div className="flex flex-col">
                                                    <div className="font-bold text-brand-dark dark:text-dark-heading leading-tight">{selectedClient.name}</div>
                                                    <div className="text-xs text-brand-inactive-text">{selectedClient.email || 'Cliente'}</div>
                                                </div>
                                            </div>
                                            {!isLocked && (
                                                <Button
                                                    variant="link"
                                                    className="font-bold"
                                                    onClick={() => {
                                                        if (mode === 'view') {
                                                            setIsClientOverlayOpen(true);
                                                        } else {
                                                            setPreviousClient(selectedClient);
                                                            setCameFromSummary(true);
                                                            setCurrentView('client');
                                                        }
                                                    }}
                                                >
                                                    Alterar
                                                </Button>
                                            )}
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
                                                onEdit={!isLocked ? () => handleServiceEdit(idx) : undefined}
                                                onRemove={!isLocked ? () => handleRemoveServiceRequest(idx) : undefined}
                                                // Pass formatted time range
                                                timeRange={getServiceTimeRange(idx)}
                                            />
                                        ))}
                                    </div>
                                    {!isLocked && (
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

                                {/* Payment Status InfoCard */}
                                <div className="mt-4">
                                    {remainingToPay <= 0.009 ? (
                                        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-xl flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-300">
                                            <span>Totalmente pago</span>
                                            <span>Valor total atingido!</span>
                                        </div>
                                    ) : currentPaidAmount > 0 ? (
                                        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-xl flex items-center justify-between text-xs font-bold text-amber-800 dark:text-amber-300">
                                            <span>Pago parcialmente</span>
                                            <span>Falta Pagar: {formatCurrency(remainingToPay)}</span>
                                        </div>
                                    ) : (
                                        <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl flex items-center justify-between text-xs font-bold text-red-800 dark:text-red-300">
                                            <span>Não pago</span>
                                            <span>Falta Pagar: {formatCurrency(remainingToPay)}</span>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })()}



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
                        {mode === 'create' || currentView !== 'summary' ? (
                            <div className="flex gap-3">
                                <Button
                                    variant="outline"
                                    className="flex-1 h-[48px]"
                                    onClick={handleBack}
                                >
                                    {currentView === 'services' ? 'Cancelar' : 'Voltar'}
                                </Button>
                                <Button
                                    variant="default"
                                    className={`flex-1 h-[48px] ${currentView === 'services' && selectedServices.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    onClick={
                                        currentView === 'edit-service' ? () => setCurrentView('summary') : handleNext
                                    }
                                    disabled={
                                        (currentView === 'services' && selectedServices.length === 0) ||
                                        (currentView === 'datetime' && !needsRangePicker && !selectedTimeSlot) ||
                                        isSaving
                                    }
                                >
                                    {isSaving && currentView === 'summary' ? (
                                        <span className="flex items-center gap-2">
                                            <Spinner size={18} />
                                        </span>
                                    ) : currentView === 'summary' ? (
                                        <span className="flex items-center gap-2">Agendar <CheckCircleIcon size={18} /></span>
                                    ) : currentView === 'edit-service' ? (
                                        'Aplicar'
                                    ) : (
                                        'Próximo'
                                    )}
                                </Button>
                            </div>
                        ) : (
                            /* VIEW MODE FOOTER */
                            (() => {
                                const isFullyPaid = ['pago', 'paid'].includes((status || '').toLowerCase()) || (appointment?.paymentStatus || '').toLowerCase() === 'paid';
                                const isPartiallyPaid = ['partially paid', 'pago parcialmente', 'parcialmente pago'].includes((status || '').toLowerCase()) || (appointment?.paymentStatus || '').toLowerCase() === 'partially_paid';
                                const isPaidOrPartiallyPaid = isFullyPaid || isPartiallyPaid;

                                if (isFullyPaid) {
                                    return (
                                        <div className="flex gap-3">
                                            <Dropdown
                                                width="w-56"
                                                align="left"
                                                trigger={
                                                    <Button variant="outline" className="px-3 h-[48px] shrink-0" type="button">
                                                        <MoreHorizontal size={18} />
                                                    </Button>
                                                }
                                            >
                                                <DropdownItem onClick={() => setIsNotesOverlayOpen(true)}>
                                                    Observações
                                                </DropdownItem>
                                                <DropdownItem onClick={() => setIsHistoryOverlayOpen(true)}>
                                                    Histórico do agendamento
                                                </DropdownItem>
                                            </Dropdown>

                                            {hasChanges ? (
                                                <>
                                                    <Button variant="outline" className="flex-1 font-bold h-[48px]" onClick={handleViewSale}>
                                                        Ver venda
                                                    </Button>
                                                    <Button variant="default" className="flex-1 font-bold h-[48px]" onClick={handleSaveChanges}>
                                                        Salvar
                                                    </Button>
                                                </>
                                            ) : (
                                                <Button variant="default" className="flex-1 font-bold h-[48px]" onClick={handleViewSale}>
                                                    Ver venda
                                                </Button>
                                            )}
                                        </div>
                                    );
                                }

                                return (
                                    <div className="flex gap-3">
                                        <Dropdown
                                            width="w-56"
                                            align="left"
                                            trigger={
                                                <Button variant="outline" className="px-3 h-[48px] shrink-0" type="button">
                                                    <MoreHorizontal size={18} />
                                                </Button>
                                            }
                                        >
                                            <DropdownItem onClick={() => setIsNotesOverlayOpen(true)}>
                                                Observações
                                            </DropdownItem>
                                            <DropdownItem onClick={() => setIsHistoryOverlayOpen(true)}>
                                                Histórico do agendamento
                                            </DropdownItem>
                                            {isPartiallyPaid && (
                                                <DropdownItem onClick={handleViewSale}>
                                                    Ver venda
                                                </DropdownItem>
                                            )}
                                            {!isPaidOrPartiallyPaid && (
                                                <>
                                                    <DropdownItem onClick={() => setIsRecurrenceOverlayOpen(true)}>
                                                        Recorrente
                                                    </DropdownItem>
                                                    <DropdownItem onClick={() => setCurrentView('datetime')}>
                                                        Remarcar
                                                    </DropdownItem>
                                                    <DropdownItem className="text-red-500 hover:text-red-600" onClick={() => setIsCancelConfirmOpen(true)}>
                                                        Cancelar
                                                    </DropdownItem>
                                                </>
                                            )}
                                        </Dropdown>

                                        {hasChanges ? (
                                            <>
                                                <Button variant="outline" className="flex-1 font-bold h-[48px]" onClick={() => setIsPaymentSheetOpen(true)}>
                                                    Checkout
                                                </Button>
                                                <Button variant="default" className="flex-1 font-bold h-[48px]" onClick={handleSaveChanges}>
                                                    Salvar
                                                </Button>
                                            </>
                                        ) : (
                                            <Button variant="default" className="flex-1 font-bold h-[48px]" onClick={() => setIsPaymentSheetOpen(true)}>
                                                Checkout
                                            </Button>
                                        )}
                                    </div>
                                );
                            })()
                        )}
                    </div>
                )
            )}
        </div>
    );

    const newServiceSheetContent = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Novo serviço</h2>
                <Button variant="filled" onClick={() => { if (!isCreatingService) setIsNewServiceSheetOpen(false); }} size="icon" disabled={isCreatingService}>
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-6">
                <Input
                    label="Nome"
                    name="newServiceName"
                    value={newServiceName}
                    onChange={(e) => {
                        setNewServiceName(e.target.value);
                        setServiceNameError(null);
                    }}
                    placeholder="Nome do serviço"
                    error={!!serviceNameError}
                    errorMessage={serviceNameError || undefined}
                />
                <MoneyInput
                    label="Preço"
                    name="newServicePrice"
                    value={newServicePrice}
                    onChange={(val) => {
                        setNewServicePrice(val);
                        setServicePriceError(null);
                    }}
                    placeholder="0,00"
                    error={!!servicePriceError}
                    errorMessage={servicePriceError || undefined}
                />
                <Input
                    label="Duração (minutos)"
                    name="newServiceDuration"
                    type="number"
                    value={newServiceDuration}
                    onChange={(e) => {
                        setNewServiceDuration(e.target.value);
                        setServiceDurationError(null);
                    }}
                    placeholder="Ex: 60"
                    error={!!serviceDurationError}
                    errorMessage={serviceDurationError || undefined}
                />
            </div>

            <footer className="shrink-0 border-t border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center gap-3">
                    <Button variant="outline" className="h-12 flex-1" onClick={() => setIsNewServiceSheetOpen(false)} disabled={isCreatingService}>
                        Voltar
                    </Button>
                    <Button
                        className="h-12 flex-1 bg-brand-primary text-white"
                        isLoading={isCreatingService}
                        onClick={async () => {
                            const name = newServiceName.trim();
                            const durationStr = newServiceDuration.trim();

                            let hasError = false;
                            setServiceNameError(null);
                            setServicePriceError(null);
                            setServiceDurationError(null);

                            if (!name) {
                                setServiceNameError("Informe o nome do serviço.");
                                hasError = true;
                            }

                            if (newServicePrice <= 0) {
                                setServicePriceError("Informe um preço válido maior que zero.");
                                hasError = true;
                            }

                            const duration = parseInt(durationStr);
                            if (isNaN(duration) || duration <= 0) {
                                setServiceDurationError("Informe uma duração válida maior que zero.");
                                hasError = true;
                            }

                            if (hasError) return;

                            setIsCreatingService(true);
                            try {
                                const created = await handleCreateService({
                                    name,
                                    price: newServicePrice,
                                    duration
                                });
                                if (!created) return;

                                setLocalServices(prev => {
                                    const next = [...prev];
                                    let group = next.find(g => g.category === 'Serviços');
                                    if (!group) {
                                        group = { category: 'Serviços', category_display: true, items: [], colorClass: 'bg-brand-primary' };
                                        next.push(group);
                                    }
                                    group.items = [created, ...group.items];
                                    return next;
                                });

                                setSelectedServices(prev => [...prev, { ...created, staff: getSelectedStaffName(), staffId: selectedStaffId }]);

                                setNewServiceName("");
                                setNewServicePrice(0);
                                setNewServiceDuration("");
                                setIsNewServiceSheetOpen(false);
                            } catch (error) {
                                const errorMsg = error instanceof Error ? error.message : "Não foi possível criar o serviço.";
                                setServiceNameError(errorMsg);
                            } finally {
                                setIsCreatingService(false);
                            }
                        }}
                    >
                        Salvar serviço
                    </Button>
                </div>
            </footer>
        </div>
    );

    const editServiceSheetContent = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Editar serviço</h2>
                <Button variant="filled" onClick={() => setIsEditServiceOpen(false)} size="icon">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-6">
                {editingServiceIndex !== null && selectedServices[editingServiceIndex] && (
                    <>
                        <div className="relative flex justify-between items-center p-4 rounded-xl border border-brand-border dark:border-dark-border bg-transparent">
                            <div className="absolute left-1.5 top-1.5 bottom-1.5 w-1 rounded-full bg-brand-green dark:bg-brand-green"></div>
                            <div className="pl-4 w-full">
                                <h4 className="font-bold text-brand-dark dark:text-dark-heading text-[15px]">
                                    {selectedServices[editingServiceIndex].name}
                                </h4>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <MoneyInput
                                label="Preço do serviço"
                                name="price"
                                value={selectedServices[editingServiceIndex].price}
                                onChange={(val) => updateEditingService('price', val)}
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
                    </>
                )}
            </div>

            <footer className="shrink-0 border-t border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center gap-3">
                    <Button variant="outline" className="h-12 flex-1" onClick={() => setIsEditServiceOpen(false)}>
                        Voltar
                    </Button>
                    <Button className="h-12 flex-1 bg-brand-primary text-white" onClick={() => setIsEditServiceOpen(false)}>
                        Salvar
                    </Button>
                </div>
            </footer>
        </div>
    );

    const newClientSheetContent = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Novo cliente</h2>
                <Button variant="filled" onClick={() => { if (!isCreatingCustomer) setIsNewClientOpen(false); }} size="icon" disabled={isCreatingCustomer}>
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-6">
                <Input
                    label="Nome"
                    name="newCustomerName"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="Nome do cliente"
                />
                <EmailInput
                    label="E-mail"
                    name="newCustomerEmail"
                    value={newCustomerEmail}
                    onChange={(e) => setNewCustomerEmail(e.target.value)}
                    placeholder="exemplo@email.com"
                />
                <PhoneInput
                    label="Telefone"
                    name="newCustomerPhone"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                />
            </div>

            <footer className="shrink-0 border-t border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center gap-3">
                    <Button variant="outline" className="h-12 flex-1" onClick={() => setIsNewClientOpen(false)} disabled={isCreatingCustomer}>
                        Voltar
                    </Button>
                    <Button
                        className="h-12 flex-1 bg-brand-primary text-white"
                        isLoading={isCreatingCustomer}
                        onClick={handleQuickCreateCustomer}
                    >
                        Salvar cliente
                    </Button>
                </div>
            </footer>
        </div>
    );

    const clientOverlayContent = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Selecionar Cliente</h2>
                <Button variant="filled" onClick={() => setIsClientOverlayOpen(false)} size="icon">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-6 custom-scrollbar">
                <div className="flex gap-2">
                    <div className="flex-1">
                        <Input
                            label=""
                            name="clientSearchOverlay"
                            placeholder="Buscar por nome, email ou telefone..."
                            value={clientSearch}
                            onChange={(e) => setClientSearch(e.target.value)}
                            prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                            className="mb-0"
                            variant="full-rounded"
                        />
                    </div>
                    <Button
                         variant="outline"
                         onClick={() => {
                             setNewCustomerName("");
                             setNewCustomerEmail("");
                             setNewCustomerPhone("");
                             setIsNewClientOpen(true);
                         }}
                         className="h-11 px-3 shrink-0 rounded-xl"
                         type="button"
                    >
                         <PlusIcon size={16} /> Novo
                    </Button>
                </div>

                <div className="space-y-2">
                    {filteredClients.length === 0 ? (
                        <div className="text-center py-8 text-brand-inactive-text">
                            Nenhum cliente encontrado.
                        </div>
                    ) : (
                        filteredClients.map((client) => {
                            const isSelected = selectedClient?.id === client.id;
                            return (
                                <div
                                    key={client.id}
                                    onClick={() => {
                                        setSelectedClient(client);
                                        setIsClientOverlayOpen(false);
                                    }}
                                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                                        isSelected ? 'border-brand-green bg-green-50/5' : 'border-brand-border dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <UserProfileImage fullName={client.name || "Cliente"} imageUrl={client.avatar_url || client.avatar} className="w-8 h-8 shrink-0 text-[10px]" />
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{client.name}</span>
                                            <span className="text-xs text-brand-inactive-text truncate">{client.email || client.phone || 'Cliente'}</span>
                                        </div>
                                    </div>
                                    {isSelected && <CheckCircleIcon size={18} className="text-brand-green shrink-0" />}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );

    const historyOverlayContent = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Histórico</h2>
                <Button variant="filled" onClick={() => setIsHistoryOverlayOpen(false)} size="icon">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-6 custom-scrollbar">
                <ActivityLog activity={appointment?.activityLog} />
            </div>
        </div>
    );

    const notesOverlayContent = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Observações</h2>
                <Button variant="filled" onClick={() => setIsNotesOverlayOpen(false)} size="icon">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-6 custom-scrollbar">
                <FormTextarea
                    label="Observações"
                    name="notesOverlay"
                    placeholder="Adicione observações ao agendamento..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
                <div className="flex justify-end pt-4">
                    <Button variant="default" className="px-6 h-[42px]" onClick={() => setIsNotesOverlayOpen(false)}>
                        Salvar Nota
                    </Button>
                </div>
            </div>
        </div>
    );

    const recurrenceOverlayContent = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Recorrente</h2>
                <Button variant="filled" onClick={() => setIsRecurrenceOverlayOpen(false)} size="icon">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-6 custom-scrollbar">
                <RecurrenceView
                    frequency={recurrenceFreq}
                    setFrequency={setRecurrenceFreq}
                    termination={recurrenceTerm}
                    setTermination={setRecurrenceTerm}
                    endDate={recurrenceEndDate}
                    setEndDate={setRecurrenceEndDate}
                />
                <div className="flex justify-end pt-4">
                    <Button variant="default" className="px-6 h-[42px]" onClick={() => setIsRecurrenceOverlayOpen(false)}>
                        Salvar Repetição
                    </Button>
                </div>
            </div>
        </div>
    );

    return (
        <>
            <AlertModal
                isOpen={isUnsavedModalOpen}
                onClose={() => setIsUnsavedModalOpen(false)}
                onConfirm={onClose}
                title="Sair sem salvar?"
                message="Você tem alterações no agendamento que ainda não foram salvas."
                confirmText="Sair sem salvar"
                cancelText="Continuar editando"
                variant="warning"
            />
            <AlertModal
                isOpen={isCancelConfirmOpen}
                onClose={() => setIsCancelConfirmOpen(false)}
                onConfirm={async () => {
                    setIsCancelConfirmOpen(false);
                    if (appointment?.id && onDelete) {
                        const success = await onDelete(appointment.id);
                        if (success) {
                            toast.success("Cancelado", "Agendamento cancelado com sucesso.");
                        } else {
                            toast.error("Erro", "Não foi possível cancelar o agendamento.");
                        }
                    }
                }}
                title="Cancelar agendamento?"
                message="Tem certeza que deseja cancelar este agendamento? Ele será excluído permanentemente."
                confirmText="Cancelar agendamento"
                cancelText="Voltar"
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
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 bg-black/50"
                            onClick={handleCloseAttempt}
                        >
                            <motion.div
                                initial={{ x: '100%', opacity: 1 }}
                                animate={{ x: 0, opacity: 1 }}
                                exit={{ x: '100%', opacity: 1 }}
                                transition={{ type: "spring", stiffness: 400, damping: 40 }}
                                className="fixed right-4 top-4 bottom-4 z-50 w-[450px] flex flex-col bg-white shadow-2xl dark:bg-dark-surface overflow-hidden rounded-2xl"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {SheetContent}
                            </motion.div>
                        </motion.div>
                    </Portal>
                )
            )}


            <AnimatePresence>
                {isNewServiceSheetOpen && (
                    isMobile ? (
                        <BottomSheet isOpen={true} onClose={() => { if (!isCreatingService) setIsNewServiceSheetOpen(false); }}>
                            {newServiceSheetContent}
                        </BottomSheet>
                    ) : (
                        <Portal>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[60] bg-black/50"
                                onClick={() => { if (!isCreatingService) setIsNewServiceSheetOpen(false); }}
                            >
                                <motion.div
                                    initial={{ x: '100%', opacity: 1 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: '100%', opacity: 1 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 40 }}
                                    className="fixed right-4 top-4 bottom-4 z-[60] w-[450px] flex flex-col bg-white shadow-2xl dark:bg-dark-surface overflow-hidden rounded-2xl"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {newServiceSheetContent}
                                </motion.div>
                            </motion.div>
                        </Portal>
                    )
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isEditServiceOpen && (
                    isMobile ? (
                        <BottomSheet isOpen={true} onClose={() => setIsEditServiceOpen(false)}>
                            {editServiceSheetContent}
                        </BottomSheet>
                    ) : (
                        <Portal>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[60] bg-black/50"
                                onClick={() => setIsEditServiceOpen(false)}
                            >
                                <motion.div
                                    initial={{ x: '100%', opacity: 1 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: '100%', opacity: 1 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 40 }}
                                    className="fixed right-4 top-4 bottom-4 z-[60] w-[450px] flex flex-col bg-white shadow-2xl dark:bg-dark-surface overflow-hidden rounded-2xl"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {editServiceSheetContent}
                                </motion.div>
                            </motion.div>
                        </Portal>
                    )
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isNewClientOpen && (
                    isMobile ? (
                        <BottomSheet isOpen={true} onClose={() => { if (!isCreatingCustomer) setIsNewClientOpen(false); }}>
                            {newClientSheetContent}
                        </BottomSheet>
                    ) : (
                        <Portal>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[60] bg-black/50"
                                onClick={() => { if (!isCreatingCustomer) setIsNewClientOpen(false); }}
                            >
                                <motion.div
                                    initial={{ x: '100%', opacity: 1 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: '100%', opacity: 1 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 40 }}
                                    className="fixed right-4 top-4 bottom-4 z-[60] w-[450px] flex flex-col bg-white shadow-2xl dark:bg-dark-surface overflow-hidden rounded-2xl"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {newClientSheetContent}
                                </motion.div>
                            </motion.div>
                        </Portal>
                    )
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isClientOverlayOpen && (
                    isMobile ? (
                        <BottomSheet isOpen={true} onClose={() => setIsClientOverlayOpen(false)}>
                            {clientOverlayContent}
                        </BottomSheet>
                    ) : (
                        <Portal>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[60] bg-black/50"
                                onClick={() => setIsClientOverlayOpen(false)}
                            >
                                <motion.div
                                    initial={{ x: '100%', opacity: 1 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: '100%', opacity: 1 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 40 }}
                                    className="fixed right-4 top-4 bottom-4 z-[60] w-[450px] flex flex-col bg-white shadow-2xl dark:bg-dark-surface overflow-hidden rounded-2xl"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {clientOverlayContent}
                                </motion.div>
                            </motion.div>
                        </Portal>
                    )
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isHistoryOverlayOpen && (
                    isMobile ? (
                        <BottomSheet isOpen={true} onClose={() => setIsHistoryOverlayOpen(false)}>
                            {historyOverlayContent}
                        </BottomSheet>
                    ) : (
                        <Portal>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[60] bg-black/50"
                                onClick={() => setIsHistoryOverlayOpen(false)}
                            >
                                <motion.div
                                    initial={{ x: '100%', opacity: 1 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: '100%', opacity: 1 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 40 }}
                                    className="fixed right-4 top-4 bottom-4 z-[60] w-[450px] flex flex-col bg-white shadow-2xl dark:bg-dark-surface overflow-hidden rounded-2xl"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {historyOverlayContent}
                                </motion.div>
                            </motion.div>
                        </Portal>
                    )
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isNotesOverlayOpen && (
                    isMobile ? (
                        <BottomSheet isOpen={true} onClose={() => setIsNotesOverlayOpen(false)}>
                            {notesOverlayContent}
                        </BottomSheet>
                    ) : (
                        <Portal>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[60] bg-black/50"
                                onClick={() => setIsNotesOverlayOpen(false)}
                            >
                                <motion.div
                                    initial={{ x: '100%', opacity: 1 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: '100%', opacity: 1 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 40 }}
                                    className="fixed right-4 top-4 bottom-4 z-[60] w-[450px] flex flex-col bg-white shadow-2xl dark:bg-dark-surface overflow-hidden rounded-2xl"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {notesOverlayContent}
                                </motion.div>
                            </motion.div>
                        </Portal>
                    )
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isRecurrenceOverlayOpen && (
                    isMobile ? (
                        <BottomSheet isOpen={true} onClose={() => setIsRecurrenceOverlayOpen(false)}>
                            {recurrenceOverlayContent}
                        </BottomSheet>
                    ) : (
                        <Portal>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[60] bg-black/50"
                                onClick={() => setIsRecurrenceOverlayOpen(false)}
                            >
                                <motion.div
                                    initial={{ x: '100%', opacity: 1 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: '100%', opacity: 1 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 40 }}
                                    className="fixed right-4 top-4 bottom-4 z-[60] w-[450px] flex flex-col bg-white shadow-2xl dark:bg-dark-surface overflow-hidden rounded-2xl"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {recurrenceOverlayContent}
                                </motion.div>
                            </motion.div>
                        </Portal>
                    )
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isPaymentSheetOpen && (
                    <PaymentModal
                        isOpen={isPaymentSheetOpen}
                        onClose={() => {
                            setIsPaymentSheetOpen(false);
                            if (completedOrderId) {
                                onClose();
                            }
                        }}
                        partnerId={partnerId || ''}
                        onConfirm={handleConfirmPayment}
                        cart={selectedServices.map(s => ({
                            ...s,
                            qty: 1,
                            quantity: 1,
                            productId: s.id || null,
                            unitPrice: s.price,
                            price: s.price,
                            name: s.name,
                        }))}
                        amountDue={calculatedPrice}
                        customer={{ id: selectedClient?.id, name: selectedClient?.name }}
                        headerSubtitle="Agendamento de Serviço"
                    />
                )}
            </AnimatePresence>
        </>
    )
}
