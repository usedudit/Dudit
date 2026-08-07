import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { toast } from '@/hooks/use-notification';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ChevronLeftIcon, XIcon, SearchIcon, ChevronRightIcon, PlusIcon, CalendarIcon, CheckIcon, ClockIcon, RepeatIcon, ArrowRightIcon, ChevronDownIcon, UserIcon, ThreeDotsIcon, Package } from '@/lib/icons';
import { Button, Input, Dropdown, DropdownItem, AlertModal, DatePicker, TimePicker, FormTextarea, ThreeDotsLoader, IconPlaceholder, Spinner, EmailInput, PhoneInput, Checkbox, MoneyInput, InfoCard, Badge, Tabs, TabsList, TabsTrigger, TabsContent, QuantitySelector, DefaultModal } from '@/components/reusable';
import { getAvailableTimeSlotsAction, getAppointmentDetailsDataAction } from '@/app/actions/erp/appointments';
import { listActivePromotionsForMarketplaceAction } from "@/app/actions/shared/promotions"
import { computeItemDisplayPrice } from "@/lib/services/pricing-engine"
import { fetchProductsByIdsAction } from '@/app/actions/erp/appointment-items';
import { AppointmentItemsStep, resolveResourcesFromServices } from './AppointmentItemsStep';
import AddItemSheet from './AddItemSheet';
import { getR2ImageUrl } from '@/lib/utils/get-r2-image-url';
import { usePermissions } from '@/lib/permission-context';
import { RecurrenceView, ActivityLog } from '../Shared';
import { Appointment } from '../types';
import { ServiceItemCard } from '../ServiceItemCard';
import { formatDateStr, formatDuration, parseLocalDate, checkAppointmentCollision, getDayOpeningTime } from '../utils';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { useMediaQuery } from '@/components/erp/hooks';
import BottomSheet from '@/components/BottomSheet';
import Portal from '@/components/Portal';
import { UserProfileImage } from '@/lib/utils/UserProfileImage';
import { createPOSCustomerQuickAction } from '@/app/actions/erp/pdv';
import { fetchPartnerCustomersBucket } from '@/app/actions/erp/client-loaders';
import { createServiceAction } from '@/app/actions/erp/servicos';
import { getFulfillmentModeLabel, getPaymentStatusLabel, getSalesChannelLabel } from '@/lib/orders/status';
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
    storeId: storeIdProp,
    openingHours,
    onAppointmentUpdated,
    appointmentsList,
    linkedOrderId: propLinkedOrderId,
    linkedOrderItemId,
    allowedOrderServices,
    preselectedClient,
}: {
    onClose: () => void,
    onDelete?: (id: string, notify?: boolean, note?: string) => Promise<boolean>,
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
    storeId?: string | null,
    openingHours?: any,
    onAppointmentUpdated?: (item: any) => void,
    appointmentsList?: Appointment[],
    linkedOrderId?: string,
    linkedOrderItemId?: string,
    allowedOrderServices?: any[],
    preselectedClient?: any,
}) => {
    const servicesSource = useMemo(() => {
        if (allowedOrderServices && allowedOrderServices.length > 0) {
            const isCategorized = allowedOrderServices.some((c: any) => Array.isArray(c?.items));
            if (isCategorized) return allowedOrderServices;
            return [{
                id: "order-services",
                name: "Serviços deste Pedido",
                colorClass: "bg-emerald-500",
                items: allowedOrderServices,
            }];
        }
        return servicesCatalog || [];
    }, [allowedOrderServices, servicesCatalog]);
    const clientsSource = clientsCatalog || [];
    const staffSource = staffCatalog || [];
    const { canEdit, hasSpecific, canDelete } = usePermissions();
    const [currentView, setCurrentView] = useState<'summary' | 'services' | 'client' | 'datetime' | 'items' | 'activity' | 'edit-service' | 'recurrence' | 'notes'>(() => {
        if (mode === 'create') {
            return 'services';
        }
        return 'summary';
    });
    const [isClientOverlayOpen, setIsClientOverlayOpen] = useState(false);
    const [isHistoryOverlayOpen, setIsHistoryOverlayOpen] = useState(false);
    const [isNotesOverlayOpen, setIsNotesOverlayOpen] = useState(false);
    const [isRecurrenceOverlayOpen, setIsRecurrenceOverlayOpen] = useState(false);
    const [selectedServices, setSelectedServices] = useState<any[]>(() => {
        if (allowedOrderServices && allowedOrderServices.length > 0) {
            if (linkedOrderItemId) {
                const found = allowedOrderServices.find(s => (s.orderItemId || s.order_item_id || s.id) === linkedOrderItemId);
                if (found) return [found];
            }
            return [allowedOrderServices[0]];
        }
        return [];
    });
    const [selectedClient, setSelectedClient] = useState<any>(preselectedClient || null);
    const [editingServiceIndex, setEditingServiceIndex] = useState<number | null>(null);
    const [isAddingMore, setIsAddingMore] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [serviceToDeleteIndex, setServiceToDeleteIndex] = useState<number | null>(null);
    const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);
    const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
    const [notifyClientOnCancel, setNotifyClientOnCancel] = useState(true);
    const [cancelNote, setCancelNote] = useState('');

    // Items state (for service resources)
    const [selectedItems, setSelectedItems] = useState<any[]>([]);
    const [isAddItemSheetOpen, setIsAddItemSheetOpen] = useState(false);
    const [savedAppointmentItems, setSavedAppointmentItems] = useState<any[]>([]);
    const [activeDetailTab, setActiveDetailTab] = useState<'general' | 'stock'>('general');
    const [isLoadingItems, setIsLoadingItems] = useState(false);
    const [partnerPlan, setPartnerPlan] = useState<string>('free');
    const [isStockCheckOpen, setIsStockCheckOpen] = useState(false);
    const [stockCheckItems, setStockCheckItems] = useState<any[]>([]);
    const [pendingNextStep, setPendingNextStep] = useState<{ fn: () => void } | null>(null);
    const [isEnrichingItems, setIsEnrichingItems] = useState(false);
    const fetchingProductIdsRef = useRef<Set<string>>(new Set());

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


    const router = useRouter();
    const csrfToken = useCSRFToken();

    const handleViewSale = () => {
        const saleId = linkedOrderId || appointment?.marketplaceOrderId || appointment?.saleId || (appointment as any)?.sale_id;
        if (saleId) {
            router.push(`/erp/orders?view=${saleId}`);
            onClose();
        } else {
            toast.warning("Venda não encontrada", "Não foi possível encontrar a venda associada a este agendamento.");
        }
    };

    const isMobile = useMediaQuery("(max-width: 768px)");

    const [aptPromotions, setAptPromotions] = useState<any[]>([])

    useEffect(() => {
        if (!partnerId) return
        listActivePromotionsForMarketplaceAction(partnerId).then(res => {
            if (Array.isArray(res)) setAptPromotions(res)
        }).catch(() => { })
    }, [partnerId])

    const [marketplaceOrderData, setMarketplaceOrderData] = useState<{
        totalAmount: number
        paymentMethod: string
        paidAmount: number
        situation: string
        orderSource: string
    } | null>(null)

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
    const [selectedStaffId, setSelectedStaffId] = useState<string>(
        appointment?.staffId
        || initialStaffId
        || (staffSource.length > 0 ? staffSource[0].id : '')
    );

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

            // Deep compare services to check if names, prices, durations or staff changed
            const serviceNames = appointment.service.split(',').map(s => s.trim());
            const originalServices = serviceNames.map((name, index) => {
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

            let hasServicesChanged = selectedServices.length !== originalServices.length;
            if (!hasServicesChanged) {
                for (let i = 0; i < selectedServices.length; i++) {
                    const sel = selectedServices[i];
                    const orig = originalServices[i];
                    if (
                        sel.id !== orig.id ||
                        sel.name !== orig.name ||
                        Number(sel.price || 0) !== Number(orig.price || 0) ||
                        Number(sel.duration || 0) !== Number(orig.duration || 0) ||
                        (sel.staffId || '') !== (orig.staffId || '')
                    ) {
                        hasServicesChanged = true;
                        break;
                    }
                }
            }

            const hasClientChanged = (selectedClient?.name || '') !== appointment.customer;

            const currentDateStr = formatDateStr(selectedCalDate);
            const hasDateChanged = currentDateStr !== appointment.date;

            const currentTimeStr = editTime || selectedTimeSlot || appointment.time;
            const hasTimeChanged = currentTimeStr !== appointment.time;

            const hasStaffChanged = (selectedServices[0]?.staffId || '') !== appointment.staffId;

            const hasItemsChanged = savedAppointmentItems.length > 0 && (() => {
                // Check if items were added from the sheet (no DB id)
                const hasNewItems = savedAppointmentItems.some((item: any) => !item.id || item.id.startsWith('new-'));
                if (hasNewItems) return true;
                // Check if any item quantity differs from original
                const origItemMap = new Map((appointment as any)._originalItems?.map((i: any) => [i.id, i]) || []);
                if (origItemMap.size === 0 && savedAppointmentItems.length > 0) return true;
                for (const item of savedAppointmentItems) {
                    const orig = origItemMap.get(item.id) as any;
                    if (!orig || orig.quantity !== item.quantity) return true;
                }
                return false;
            })();

            return hasStatusChanged || hasNotesChanged || hasServicesChanged || hasClientChanged || hasDateChanged || hasTimeChanged || hasStaffChanged || hasItemsChanged;
        }
        return false;
    }, [mode, selectedServices, selectedClient, notes, status, appointment, selectedCalDate, editTime, selectedTimeSlot, savedAppointmentItems]);

    const handleCloseAttempt = () => {
        if (hasChanges) {
            setIsUnsavedModalOpen(true);
        } else {
            onClose();
        }
    };

    const handleCheckoutNavigation = useCallback(() => {
        const linkedOrderId = appointment?.marketplaceOrderId || appointment?.saleId;
        if (linkedOrderId) {
            router.push(`/erp/orders?edit=${linkedOrderId}&payment=1`);
        }
    }, [appointment?.marketplaceOrderId, appointment?.saleId, router]);

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
        if (clientsCatalog && clientsCatalog.length > 0) {
            setLocalClients(clientsCatalog);
        }
    }, [clientsCatalog]);

    useEffect(() => {
        if (partnerId) {
            fetchPartnerCustomersBucket(partnerId).then(res => {
                if (res && res.length > 0) {
                    setLocalClients(res);
                }
            }).catch(err => {
                console.error("Error fetching customers client-side:", err);
            });
        }
    }, [partnerId]);

    const filteredClients = useMemo(() => {
        if (!clientSearch) return localClients;
        const q = clientSearch.toLowerCase();
        return localClients.filter(c =>
            (c.name || '').toLowerCase().includes(q) ||
            (c.email || '').toLowerCase().includes(q) ||
            (c.phone || '').toLowerCase().includes(q)
        );
    }, [clientSearch, localClients]);

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

        getAvailableTimeSlotsAction(targetDate, selectedStaffId, totalDuration, maxBuffer, storeIdProp)
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
            // Check if returning from calendar selection mode in view mode
            if (initialDraft) {
                // Restore draft services and client
                setSelectedServices(initialDraft.services || []);
                setSelectedClient(initialDraft.client || null);

                // Set the chosen date and time from calendar selection
                if (selectedDate) {
                    setSelectedCalDate(selectedDate);
                    setBaseCalDate(selectedDate);
                    setStartDateRange(formatDateStr(selectedDate));
                }
                if (initialTimeSlot) {
                    setEditTime(initialTimeSlot);
                    setSelectedTimeSlot(initialTimeSlot);
                    setStartTimeRange(initialTimeSlot);
                    setEndTimeRange(addMinutes(initialTimeSlot, 60));
                }
                if (initialStaffId) {
                    setSelectedStaffId(initialStaffId);
                }
                setCurrentView('datetime');
            } else {
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

                    const rawSvcPrice = (appointment as any)?.services?.[index]?.price;
                    const effectivePrice = rawSvcPrice !== undefined && rawSvcPrice !== null
                        ? Number(rawSvcPrice)
                        : (serviceNames.length === 1 && appointment.price !== undefined && Number(appointment.price) > 0
                            ? Number(appointment.price)
                            : (catalogService ? catalogService.price : 0));

                    return catalogService ? {
                        ...catalogService,
                        price: effectivePrice,
                        staff: appointment.staff,
                        staffId: appointment.staffId,
                    } : {
                        id: String(990 + index),
                        name: name,
                        price: effectivePrice,
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
            }
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
            setStartTimeRange(initialTimeSlot || getDayOpeningTime(targetDate, openingHours));
            setEndDateRange(todayStr);
            setEndTimeRange(initialTimeSlot ? addMinutes(initialTimeSlot, 60) : addMinutes(getDayOpeningTime(targetDate, openingHours), 60));

            if (initialTimeSlot) {
                setSelectedTimeSlot(initialTimeSlot);
                setEditTime(initialTimeSlot); // Also sync editTime
            }

            if (initialStaffId) {
                setSelectedStaffId(initialStaffId);
            } else if (staffSource.length > 0) {
                setSelectedStaffId(staffSource[0].id);
            }

            // Standard Flow Initialization for Create Mode
            if (mode === 'create') {
                if (initialDraft) {
                    // If returning from draft (calendar selection), go to Datetime step
                    setCurrentView('datetime');
                } else {
                    // Start at Services
                    setCurrentView('services');
                }
            }
        }
    }, [mode, appointment, initialTimeSlot, initialDraft, selectedDate, defaultDate, initialStaffId, staffSource]);

    // Calculate Price dynamically for Time-Based Services
    const isMarketplaceOrder = useMemo(() =>
        mode === 'view' && (marketplaceOrderData?.orderSource === "Online Store" || marketplaceOrderData?.orderSource === "Marketplace"),
        [mode, marketplaceOrderData?.orderSource]
    )

    const effectivePromotions = useMemo(() =>
        isMarketplaceOrder ? aptPromotions : [],
        [isMarketplaceOrder, aptPromotions]
    )

    const getEffectiveServicePrice = (svc: any) => computeItemDisplayPrice(Number(svc.price || 0), svc.promotional_price && Number(svc.promotional_price) < Number(svc.price || 0) ? Number(svc.promotional_price) : null, effectivePromotions, { serviceId: svc.id }).bestPrice

    const calculatedPrice = useMemo(() => {
        return selectedServices.reduce((acc, service) => {
            const effectivePrice = getEffectiveServicePrice(service)
            if (service.pricingUnit === 'Por Dia') {
                const start = new Date(`${startDateRange}T${startTimeRange}`);
                const end = new Date(`${endDateRange}T${endTimeRange}`);
                const diffTime = Math.abs(end.getTime() - start.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const chargeableDays = Math.max(1, diffDays);
                return acc + (effectivePrice * chargeableDays);
            } else if (service.pricingUnit === 'Por Hora') {
                const start = new Date(`${startDateRange}T${startTimeRange}`);
                const end = new Date(`${endDateRange}T${endTimeRange}`);
                const diffTime = Math.abs(end.getTime() - start.getTime());
                const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
                const chargeableHours = Math.max(1, diffHours);
                return acc + (effectivePrice * chargeableHours);
            } else {
                return acc + effectivePrice;
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
                        setEndTimeRange(getDayOpeningTime(selectedDate || defaultDate, openingHours));
                    } else {
                        setEndDateRange(todayStr);
                        setEndTimeRange(addMinutes(initialTimeSlot || getDayOpeningTime(selectedDate || defaultDate, openingHours), 60));
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
                // Re-resolve items with updated services
                const resolvedItems = resolveResourcesFromServices(selectedServices);
                setSelectedItems(resolvedItems);
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
                const updatedServices = selectedServices.map(s => {
                    const staff = staffSource.find(sm => sm.id === selectedStaffId);
                    return {
                        ...s,
                        staffId: selectedStaffId,
                        staff: staff ? staff.name : 'Desconhecido'
                    }
                });
                setSelectedServices(updatedServices);
                const resolvedItems = resolveResourcesFromServices(updatedServices);
                setSelectedItems(resolvedItems);
                if (resolvedItems.length > 0) {
                    setCurrentView('items');
                } else {
                    setCurrentView('summary');
                }
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

            // Resolve items from services
            const resolvedItems = resolveResourcesFromServices(updatedServices);
            setSelectedItems(resolvedItems);

            if (resolvedItems.length > 0) {
                setCurrentView('items');
            } else {
                setCurrentView('summary');
            }
        }
        else if (currentView === 'items') {
            // Security: if enrichment is still loading, block navigation
            if (isEnrichingItems) {
                toast.warning("Aguarde", "Carregando informações de estoque...")
                return
            }

            // Stock verification for Crescer/Escalar plans before proceeding
            const itemsToCheck = selectedItems.filter((item: any) =>
                item.usageType === 'consumed' && item.productId
            )
            const hasStockIssues = itemsToCheck.some((item: any) => {
                const stock = item.stock ?? 0
                const projectedStock = stock - (item.quantity || 0)
                const minStock = item.minStock || 0
                return projectedStock <= 0 || (minStock > 0 && projectedStock <= minStock)
            })

            if (hasStockIssues && (partnerPlan === 'crescer' || partnerPlan === 'escalar')) {
                const stockIssues = itemsToCheck.map((item: any) => {
                    const stock = item.stock ?? 0
                    const projectedStock = stock - (item.quantity || 0)
                    const minStock = item.minStock || 0
                    return {
                        ...item,
                        projectedStock,
                        minStock,
                        issue: projectedStock <= 0 ? 'negativo' : 'abaixo do mínimo'
                    }
                }).filter(i => i.projectedStock <= 0 || (i.minStock > 0 && i.projectedStock <= i.minStock))

                setStockCheckItems(stockIssues)
                setPendingNextStep({
                    fn: () => {
                        setCurrentView('summary')
                    }
                })
                setIsStockCheckOpen(true)
                return
            }

            // Flow: Items -> Summary
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
        const timeStr = needsRangePicker ? startTimeRange : (selectedTimeSlot || getDayOpeningTime(finalDateObj, openingHours));

        const isOutsideHours = checkOutsideOperatingHours(baseDateStr, timeStr, calculatedDuration);
        if (isOutsideHours) {
            toast.error("Horário Inválido", "O horário selecionado está fora do horário de funcionamento do negócio.");
            return;
        }
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
            orderId: propLinkedOrderId || null,
            orderItemId: linkedOrderItemId || (selectedServices[0]?.orderItemId || selectedServices[0]?.order_item_id || null),
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
            items: selectedItems.map(item => ({
                product_id: item.productId || null,
                variant_id: item.variantId || null,
                service_id: item.serviceId || null,
                name: item.name,
                quantity: item.quantity,
                usage_type: item.usageType,
            })),
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
                const combPrice = svcs.reduce((acc, curr) => acc + getEffectiveServicePrice(curr), 0);
                const combDur = svcs.reduce((acc, curr) => acc + Number(curr.duration || 0), 0);

                return {
                    ...baseItem,
                    orderId: propLinkedOrderId || null,
                    orderItemId: svcs[0]?.orderItemId || svcs[0]?.order_item_id || linkedOrderItemId || null,
                    serviceName: combinedName,
                    price: combPrice,
                    duration: combDur,
                    staffId: sId,
                    staffName: staff ? staff.name : 'Profissional',
                    serviceId: svcs[0]?.id || null,
                    categoryId: svcs[0]?.category_id || null,
                    services: svcs.map(s => ({ id: s.id, name: s.name, price: getEffectiveServicePrice(s), categoryId: s.category_id })),
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
                    const combPrice = svcs.reduce((acc, curr) => acc + getEffectiveServicePrice(curr), 0);
                    const combDur = svcs.reduce((acc, curr) => acc + Number(curr.duration || 0), 0);

                    payloads.push({
                        ...baseItem,
                        serviceName: combinedName,
                        price: combPrice,
                        duration: combDur,
                        date: dateStr,
                        staffId: sId,
                        staffName: staff ? staff.name : 'Profissional',
                        serviceId: svcs[0]?.id || null,
                        categoryId: svcs[0]?.category_id || null,
                        services: svcs.map(s => ({ id: s.id, name: s.name, price: getEffectiveServicePrice(s), categoryId: s.category_id })),
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
        else if (currentView === 'items') {
            if (initialTimeSlot) {
                setCurrentView('client');
            } else {
                setCurrentView('datetime');
            }
        }
        else if (currentView === 'summary') {
            if (mode === 'create') {
                const resolvedItems = resolveResourcesFromServices(selectedServices);
                setSelectedItems(resolvedItems);
                if (resolvedItems.length > 0) {
                    setCurrentView('items');
                } else {
                    setCurrentView(initialTimeSlot ? 'client' : 'datetime');
                }
            } else {
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
        const timeStr = needsRangePicker ? startTimeRange : (editTime || selectedTimeSlot || getDayOpeningTime(selectedCalDate, openingHours));
        const isOutsideHours = checkOutsideOperatingHours(finalDateStr, timeStr, calculatedDuration);
        if (isOutsideHours) {
            toast.error("Horário Inválido", "O horário selecionado está fora do horário de funcionamento do negócio.");
            return;
        }
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
            serviceId: selectedServices[0]?.id || null,
            categoryId: selectedServices[0]?.category_id || null,
            services: selectedServices.map(s => ({ id: s.id, name: s.name, price: getEffectiveServicePrice(s), categoryId: s.category_id })),
            appointmentItems: savedAppointmentItems.map(item => ({
                id: item.id,
                product_id: item.productId || null,
                variant_id: item.variantId || null,
                service_id: item.serviceId || null,
                name: item.name,
                quantity: item.quantity,
                usage_type: item.usageType,
            })),
        };
        onSave(updatedApp);
    };

    const getHeaderTitle = () => {
        switch (currentView) {
            case 'services': return 'Selecionar Serviços';
            case 'client': return 'Selecionar Cliente';
            case 'datetime': return 'Data e Horário';
            case 'items': return 'Itens dos Serviços';
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
        if (s === 'em andamento' || s === 'iniciado' || s === 'in progress') return 'bg-[#003229]';
        if (s === 'pago' || s === 'paid' || s === 'parcialmente pago') return 'bg-green-600';
        if (s === 'finalizado' || s === 'finished') return 'bg-gray-700';
        return 'bg-blue-600';
    };

    const [financeAccountId, setFinanceAccountId] = useState<string>('');
    const [orderNumber, setOrderNumber] = useState<string | null>(null);
    const [orderItems, setOrderItems] = useState<any[] | null>(null);
    const [orderPaymentInfo, setOrderPaymentInfo] = useState<{ situation: string; paidAmount: number; totalAmount: number } | null>(null);

    const linkedOrderId = appointment?.marketplaceOrderId
        || appointment?.saleId
        || null;

    useEffect(() => {
        if (!partnerId) return;

        let cancelled = false;

        if (mode !== 'view') {
            setSavedAppointmentItems([]);
            setOrderNumber(null);
            setOrderItems(null);
            setMarketplaceOrderData(null);
            setOrderPaymentInfo(null);
        }

        setIsLoadingItems(true);

        getAppointmentDetailsDataAction({
            appointmentId: mode === 'view' ? appointment?.id : undefined,
            partnerId,
            linkedOrderId: mode === 'view' ? linkedOrderId : null
        }).then(res => {
            if (cancelled) return;
            if (res && res.success && res.data) {
                const { defaultFinanceAccountId, planSlug, appointmentItems, orderData } = res.data;

                if (defaultFinanceAccountId) {
                    setFinanceAccountId(defaultFinanceAccountId);
                }

                setPartnerPlan(planSlug || 'free');

                if (mode === 'view') {
                    setSavedAppointmentItems(appointmentItems || []);
                    if (appointment) {
                        (appointment as any)._originalItems = appointmentItems || [];
                    }
                    if (orderData) {
                        setOrderNumber(orderData.orderNumber);
                        setOrderItems(orderData.items);

                        const svcBookingItems = (orderData.items || []).filter((i: any) => i.lineType === 'service_booking');
                        if (svcBookingItems.length > 0) {
                            setSelectedServices(prevServices => {
                                if (!prevServices || prevServices.length === 0) return prevServices;
                                return prevServices.map((svc, idx) => {
                                    const matchedItem = svcBookingItems.find((item: any) =>
                                        (svc.id && item.serviceId === svc.id) ||
                                        (item.productName && item.productName.trim() === svc.name?.trim())
                                    ) || svcBookingItems[idx];
                                    if (matchedItem && matchedItem.productPrice !== undefined) {
                                        return { ...svc, price: Number(matchedItem.productPrice || 0) };
                                    }
                                    return svc;
                                });
                            });
                        }

                        setMarketplaceOrderData({
                            totalAmount: orderData.totalAmount,
                            paymentMethod: orderData.paymentMethod || "",
                            paidAmount: orderData.paidAmount,
                            situation: orderData.situation,
                            orderSource: orderData.orderSource || "",
                        });
                        setOrderPaymentInfo({
                            situation: orderData.situation,
                            paidAmount: orderData.paidAmount,
                            totalAmount: orderData.totalAmount
                        });
                    } else {
                        setOrderNumber(null);
                        setOrderItems(null);
                        setMarketplaceOrderData(null);
                        setOrderPaymentInfo(null);
                    }
                }
            }
        }).catch(err => {
            console.error("Error loading appointment details data:", err);
        }).finally(() => {
            if (!cancelled) {
                setIsLoadingItems(false);
            }
        });

        return () => { cancelled = true; };
    }, [partnerId, appointment?.id, linkedOrderId, mode]);

    // Enrich selectedItems with product data (images, stock) when they change
    useEffect(() => {
        if (!selectedItems.length || !partnerId) {
            setIsEnrichingItems(false)
            return
        }

        const itemsNeedingEnrichment = selectedItems.filter(
            (item: any) => item.productId && (item.stock == null || !item.image) && !fetchingProductIdsRef.current.has(item.productId)
        )

        if (itemsNeedingEnrichment.length === 0) {
            setIsEnrichingItems(false)
            return
        }

        setIsEnrichingItems(true)

        let cancelled = false
        const productIds = itemsNeedingEnrichment.map((item: any) => item.productId)

        // Cache these immediately in Set before hitting database to prevent duplicate requests
        productIds.forEach((id: string) => fetchingProductIdsRef.current.add(id));

        console.debug("[enrichment] Fetching stock for productIds:", productIds, "partnerId:", partnerId)
        fetchProductsByIdsAction(productIds, partnerId).then((products: any[]) => {
            console.debug("[enrichment] Fetched products:", products.length, products.map((p: any) => ({ id: p.id, stock: p.stock, variants: p.variants })))
            if (!cancelled) {
                productIds.forEach((id: string) => fetchingProductIdsRef.current.delete(id))

                const productsMap = Object.fromEntries(products.map((p: any) => [p.id, p]))
                setSelectedItems(prevItems => prevItems.map((item: any) => {
                    const product = item.productId ? productsMap[item.productId] : null
                    if (product) {
                        let stock = product.stock
                        if (item.variantId && product.variants) {
                            const variant = product.variants.find((v: any) => v.id === item.variantId)
                            if (variant) stock = variant.stock
                        }
                        return {
                            ...item,
                            image: item.image || product.image || product.images?.[0],
                            stock: stock ?? item.stock,
                            minStock: product.minStock,
                            sku: item.sku || product.sku,
                        }
                    }
                    if (item.stock == null) {
                        return { ...item, stock: 0 }
                    }
                    return item
                }))
            }
            if (!cancelled) setIsEnrichingItems(false)
        }).catch((err) => {
            console.error("[enrichment] Failed to fetch stock for items:", err)
            if (!cancelled) {
                productIds.forEach((id: string) => fetchingProductIdsRef.current.delete(id))
                setSelectedItems(prevItems => prevItems.map((item: any) =>
                    item.stock == null ? { ...item, stock: 0 } : item
                ))
                setIsEnrichingItems(false)
            }
        })

        return () => {
            cancelled = true
            productIds.forEach((id: string) => fetchingProductIdsRef.current.delete(id))
        }
    }, [selectedItems, partnerId])

    const VIEW_STATUS_OPTIONS = [
        { value: 'Reservado', label: 'Reservado' },
        { value: 'Confirmado', label: 'Confirmado' },
        { value: 'Aguardando', label: 'Aguardando' },
        { value: 'Em andamento', label: 'Em andamento' },
        { value: 'Iniciado', label: 'Iniciado' },
        { value: 'Concluído', label: 'Concluído' },
        { value: 'Pago', label: 'Pago' },
        { value: 'Ausência', label: 'Ausência' },
    ] as const;

    const statusOptions = mode === 'create'
        ? VIEW_STATUS_OPTIONS.filter(opt => opt.value !== 'Concluído' && opt.value !== 'Ausência')
        : VIEW_STATUS_OPTIONS.filter(opt => opt.value !== 'Pago');

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
        // Fallback for when "editTime" might be empty (new creation), use opening time
        let startTime = needsRangePicker ? startTimeRange : (editTime || selectedTimeSlot || getDayOpeningTime(selectedCalDate, openingHours));

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
                                        placeholder="Buscar serviço..."
                                        value={serviceSearch}
                                        onChange={(e) => setServiceSearch(e.target.value)}
                                        prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                        className="mb-0"
                                        variant="full-rounded"
                                    />
                                </div>
                                <Button
                                    onClick={() => {
                                        setNewServiceName("");
                                        setNewServicePrice(0);
                                        setNewServiceDuration("");
                                        setServiceNameError(null);
                                        setServicePriceError(null);
                                        setServiceDurationError(null);
                                        setIsNewServiceSheetOpen(true);
                                    }}
                                    className="h-[42px] w-[42px]"
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
                                                            {(() => { const pr = computeItemDisplayPrice(Number(item.price || 0), item.promotional_price && Number(item.promotional_price) < Number(item.price || 0) ? Number(item.promotional_price) : null, effectivePromotions, { serviceId: item.id }); return (<div className="flex items-center gap-1.5 mt-2">{pr.referencePrice && <span className="text-xs text-brand-inactive-text line-through">{formatCurrency(pr.referencePrice)}</span>}<span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(pr.bestPrice)}</span>{pr.badgeVariant === "blue" && <Badge variant="blue" icon={null} className="whitespace-nowrap">-{pr.discountPercent}%</Badge>}{pr.badgeVariant === "orange" && <Badge variant="orange" icon={null} className="whitespace-nowrap">-{pr.discountPercent}%</Badge>}</div>) })()}
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
                                                <button onClick={() => handleDateNav('prev')} className="text-brand-inactive-text dark:text-dark-heading"><ChevronLeftIcon size={16} /></button>
                                                <button onClick={() => handleDateNav('next')} className="text-brand-inactive-text dark:text-dark-heading"><ChevronRightIcon size={16} /></button>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center text-center">
                                            {dates.map((d, i) => (
                                                <div key={i} className="flex flex-col gap-2 cursor-pointer group items-center" onClick={() => handleSelectDay(d.fullDate)}>
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${d.active ? 'bg-brand-dark text-white' : 'text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border hover:border-brand-dark/30 dark:hover:border-brand-gray/30'}`}>
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
                                                variant="link"
                                                className="h-8"
                                                leftIcon={<CalendarIcon size={18} className="hidden lg:block" />}
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
                                                        onClick={() => { setSelectedTimeSlot(slot); setEditTime(slot); }}
                                                        className={`w-full p-3 rounded-xl border text-sm font-bold transition-all flex justify-between items-center ${selectedTimeSlot === slot ? 'border-brand-dark border-brand-green text-white' : 'border-brand-border dark:border-dark-border hover:border-brand-dark/30 dark:hover:border-brand-gray/30 text-brand-dark dark:text-dark-heading'}`}
                                                    >
                                                        {slot}
                                                        {selectedTimeSlot === slot && <CheckIcon size={18} />}
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
                                    onClick={() => {
                                        setNewCustomerName("");
                                        setNewCustomerEmail("");
                                        setNewCustomerPhone("");
                                        setIsNewClientOpen(true);
                                    }}
                                    className="h-11 w-11 shrink-0"
                                    leftIcon={<PlusIcon size={18} />}
                                />
                            </div>

                            <div className="space-y-2 max-h-[350px] overflow-y-auto custom-scrollbar">
                                {filteredClients.length === 0 ? (
                                    <IconPlaceholder
                                        icon={UserIcon}
                                        title="Nenhum cliente encontrado"
                                        subtitle="Tente outro termo de busca ou cadastre um novo cliente."
                                    />
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
                                                    } else if (initialTimeSlot && mode === 'create') {
                                                        const updatedServices = selectedServices.map(s => {
                                                            const staff = staffSource.find(sm => sm.id === selectedStaffId);
                                                            return {
                                                                ...s,
                                                                staffId: selectedStaffId,
                                                                staff: staff ? staff.name : 'Desconhecido'
                                                            }
                                                        });
                                                        setSelectedServices(updatedServices);
                                                        const resolvedItems = resolveResourcesFromServices(updatedServices);
                                                        setSelectedItems(resolvedItems);
                                                        if (resolvedItems.length > 0) {
                                                            setCurrentView('items');
                                                        } else {
                                                            setCurrentView('summary');
                                                        }
                                                    } else {
                                                        setCurrentView('datetime');
                                                    }
                                                }}
                                                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${isSelected ? 'border-brand-green bg-green-50/5' : 'border-brand-border dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <UserProfileImage fullName={client.name || "Cliente"} imageUrl={client.avatar_url || client.avatar} className="w-8 h-8 shrink-0 text-[10px]" />
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{client.name}</span>
                                                        <span className="text-xs text-brand-inactive-text truncate">{client.email || client.phone || 'Cliente'}</span>
                                                    </div>
                                                </div>
                                                {isSelected && <CheckIcon size={18} className="text-brand-green shrink-0" />}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* ITEMS STEP */}
                    {currentView === 'items' && (
                        <AppointmentItemsStep
                            items={selectedItems}
                            onItemsChange={setSelectedItems}
                            services={selectedServices}
                            partnerPlan={partnerPlan}
                        />
                    )}

                    {/* VIEW: SUMMARY */}
                    {currentView === 'summary' && (() => {
                        const isCompletedStatus = (status || '').toLowerCase() === 'concluído' || (status || '').toLowerCase() === 'concluido';
                        const isLocked = isPaid || isCompletedStatus;
                        const displaySalesChannel = getSalesChannelLabel(appointment?.salesChannel);
                        const effectivePaymentStatus = orderPaymentInfo?.situation || appointment?.paymentStatus;
                        const displayPaymentStatus = getPaymentStatusLabel(effectivePaymentStatus);
                        const displayFulfillmentMode = getFulfillmentModeLabel(appointment?.fulfillmentMode);
                        const displayOrderNumber = orderNumber || (linkedOrderId ? linkedOrderId.slice(0, 8).toUpperCase() : null);

                        const finalDateStr = needsRangePicker ? startDateRange : formatDateStr(selectedCalDate);
                        const timeStr = needsRangePicker ? startTimeRange : (editTime || selectedTimeSlot || getDayOpeningTime(selectedCalDate, openingHours));
                        const isOutsideHours = checkOutsideOperatingHours(finalDateStr, timeStr, calculatedDuration);
                        const hasCollision = appointmentsList && appointment ? checkAppointmentCollision({
                            ...appointment,
                            date: finalDateStr,
                            time: timeStr,
                            duration: calculatedDuration,
                            staffId: selectedServices[0]?.staffId || '',
                            status: status
                        } as Appointment, appointmentsList) : false;

                        const isViewMode = mode === 'view';

                        const renderGeneralTab = () => (
                            <div className="space-y-6">

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
                                                        className={`flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-brand-dark rounded-full text-sm font-bold transition-colors hover:bg-gray-50 ${isLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
                                                    >
                                                        {status}
                                                        {!isLocked && <ChevronDownIcon size={14} className="text-brand-inactive-text" />}
                                                    </button>
                                                }
                                                showChevron={false}
                                            >
                                                <div className="min-w-[140px]">
                                                    {statusOptions.map(opt => (
                                                        <DropdownItem key={opt.value} onClick={() => handleStatusChange(opt.value)}>{opt.label}</DropdownItem>
                                                    ))}
                                                </div>
                                            </Dropdown>
                                        </div>
                                    </div>
                                )}

                                {/* Outside Hours Alert Banner */}
                                {isOutsideHours && (
                                    <InfoCard
                                        color="orange"
                                        title="Atenção: Horário Especial"
                                        message="Este agendamento está fora do horário de funcionamento do estabelecimento."
                                    />
                                )}

                                {/* Collision Warning Banner */}
                                {hasCollision && (
                                    <InfoCard
                                        color="red"
                                        title="Conflito de Horário"
                                        message="Este profissional já possui outro agendamento ativo neste mesmo horário."
                                    />
                                )}

                                {mode === 'view' && appointment && (
                                    <div className="grid grid-cols-2 gap-3 text-xs">
                                        <div className="rounded-xl border border-brand-border dark:border-dark-border p-3">
                                            <p className="text-brand-inactive-text dark:text-dark-body font-semibold mb-1">Canal</p>
                                            <p className="font-semibold text-brand-dark dark:text-dark-heading">
                                                {displaySalesChannel}
                                            </p>
                                        </div>
                                        <div className="rounded-xl border border-brand-border dark:border-dark-border p-3">
                                            <p className="text-brand-inactive-text dark:text-dark-body font-semibold mb-1">Pagamento</p>
                                            <p className="font-semibold text-brand-dark dark:text-dark-heading">
                                                {displayPaymentStatus}
                                            </p>
                                        </div>
                                        <div className="rounded-xl border border-brand-border dark:border-dark-border p-3">
                                            <p className="text-brand-inactive-text dark:text-dark-body font-semibold mb-1">Local</p>
                                            <p className="font-semibold text-brand-dark dark:text-dark-heading">
                                                {displayFulfillmentMode}
                                            </p>
                                        </div>
                                        <div className="rounded-xl border border-brand-border dark:border-dark-border p-3">
                                            <p className="text-brand-inactive-text dark:text-dark-body font-semibold mb-1">Venda</p>
                                            {displayOrderNumber ? (
                                                <Button variant="link" onClick={handleViewSale}>
                                                    #{displayOrderNumber}
                                                </Button>
                                            ) : (
                                                <p className="font-semibold text-brand-dark dark:text-dark-heading">-</p>
                                            )}
                                        </div>
                                        {appointment.needsReschedule && (
                                            <InfoCard
                                                color="orange"
                                                title="Reagendamento necessário"
                                                message="O horário original não está mais disponível."
                                            />
                                        )}
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
                                                    {selectedClient.phone && (
                                                        <div className="text-xs text-brand-inactive-text">{selectedClient.phone}</div>
                                                    )}
                                                    {selectedClient.email && (
                                                        <div className="text-xs text-brand-inactive-text">{selectedClient.email}</div>
                                                    )}
                                                </div>
                                            </div>
                                            {!isLocked && (
                                                <Button
                                                    variant="link"
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
                                                service={{ ...service, startTime: getServiceTimeRange(idx).split(' - ')[0] }}
                                                onEdit={!isLocked ? () => handleServiceEdit(idx) : undefined}
                                                onRemove={!isLocked ? () => handleRemoveServiceRequest(idx) : undefined}
                                                timeRange={getServiceTimeRange(idx)}
                                                fulfillmentMode={appointment?.fulfillmentMode}
                                                promotions={effectivePromotions}
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

                                {/* Items Section */}
                                {mode === 'create' && selectedItems.length > 0 && (
                                    <div>
                                        <div className="flex justify-between items-center mb-3 px-1">
                                            <h3 className="font-bold text-brand-dark dark:text-dark-heading">Itens Utilizados</h3>
                                            <button
                                                onClick={() => {
                                                    const resolvedItems = resolveResourcesFromServices(selectedServices);
                                                    setSelectedItems(resolvedItems);
                                                    setCurrentView('items');
                                                }}
                                                className="text-sm font-bold text-brand-green hover:underline"
                                                type="button"
                                            >
                                                Alterar
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            {selectedItems.map((item: any) => {
                                                const itemImg = item.image || item.product?.image || item.product?.images?.[0];
                                                return (
                                                    <div key={item.key || item.id} className="flex items-center justify-between p-3 rounded-xl border border-brand-border dark:border-dark-border">
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <div className="w-8 h-8 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border">
                                                                {itemImg ? (
                                                                    <img src={getR2ImageUrl(itemImg, "thumbnail")} className="w-full h-full object-cover" alt="" />
                                                                ) : (
                                                                    <Package size={14} className="text-brand-inactive-text" />
                                                                )}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate">{item.name}</p>
                                                                <p className="text-[11px] text-brand-inactive-text">{item.serviceName} • {item.usageType === 'consumed' ? 'Consumido' : item.usageType === 'returnable' ? 'Retornável' : 'Referência'}</p>
                                                            </div>
                                                        </div>
                                                        <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading shrink-0 ml-3">Qtd: {item.quantity}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Products Section */}
                                {orderItems && orderItems.filter(i => i.lineType !== 'service_booking').length > 0 && (
                                    <div>
                                        <div className="flex justify-between items-center mb-3 px-1">
                                            <h3 className="font-bold text-brand-dark dark:text-dark-heading">Produtos</h3>
                                        </div>
                                        <div className="space-y-3">
                                            {orderItems.filter(i => i.lineType !== 'service_booking').map((item) => (
                                                <div key={item.id} className="relative flex justify-between items-center p-4 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-zinc-900/50">
                                                    <div className="absolute left-1.5 top-1.5 bottom-1.5 w-1 rounded-full bg-brand-green dark:bg-brand-green"></div>
                                                    <div className="pl-4 flex-1">
                                                        <h4 className="font-bold text-brand-dark dark:text-dark-heading text-[15px]">{item.productName}</h4>
                                                        <div className="text-sm text-brand-inactive-text mt-1">
                                                            Qtd: {item.quantity}
                                                            {item.isGift && <span className="ml-2 text-amber-600 font-medium">Brinde</span>}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(item.subtotal)}</span>
                                                        {item.originalPrice && item.originalPrice > item.productPrice && (
                                                            <div className="text-xs text-brand-inactive-text line-through">{formatCurrency(item.originalPrice)}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Total Row */}
                                <div className="flex justify-between items-end border-t border-brand-border dark:border-dark-border pt-4 px-1">
                                    <div className="flex flex-col">
                                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Duração Total</span>
                                        <span className="text-xl font-bold text-brand-dark dark:text-dark-heading">{formatDuration(calculatedDuration)}</span>
                                    </div>
                                    <div className="flex flex-col text-right">
                                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                            {marketplaceOrderData && (marketplaceOrderData.orderSource === "Online Store" || marketplaceOrderData.orderSource === "Marketplace") ? 'Total Final (Marketplace)' : 'Valor Total'}
                                        </span>
                                        <span className="text-xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(marketplaceOrderData?.totalAmount ?? (orderPaymentInfo?.totalAmount ?? calculatedPrice))}</span>
                                    </div>
                                </div>

                            </div>
                        );

                        const renderStockTab = () => {
                            const isStockLocked = isCompletedStatus;
                            return (
                                <div className="space-y-6">
                                    {isLoadingItems ? (
                                        <ThreeDotsLoader />
                                    ) : savedAppointmentItems.length === 0 ? (
                                        <IconPlaceholder
                                            icon={Package}
                                            title="Nenhum item"
                                            subtitle="Este agendamento não possui itens de estoque."
                                            itemButton={!isStockLocked ? {
                                                text: "Adicionar Item",
                                                action: () => setIsAddItemSheetOpen(true),
                                                variant: "outline",
                                            } : undefined}
                                        />
                                    ) : (
                                        <div className="space-y-2">
                                            {savedAppointmentItems.map((item: any) => {
                                                const usageTypeLabel = item.usageType === 'consumed' ? 'Consumido' : item.usageType === 'returnable' ? 'Retornável' : 'Referência';
                                                const usageTypeColor = item.usageType === 'consumed' ? 'text-red-600 bg-red-50 border-red-100' : item.usageType === 'returnable' ? 'text-blue-600 bg-blue-50 border-blue-100' : 'text-gray-500 bg-gray-50 border-gray-200';
                                                const itemImg = item.image || item.product?.image || item.product?.images?.[0];
                                                return (
                                                    <div key={item.id} className="flex items-center gap-4 p-4 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                                                        <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border">
                                                            {itemImg ? (
                                                                <img src={getR2ImageUrl(itemImg, "thumbnail")} className="w-full h-full object-cover" alt="" />
                                                            ) : (
                                                                <Package size={18} className="text-brand-inactive-text" />
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate">{item.name}</div>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                {item.serviceName && (
                                                                    <span className="text-[11px] text-brand-inactive-text truncate">{item.serviceName}</span>
                                                                )}
                                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${usageTypeColor}`}>
                                                                    {usageTypeLabel}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3 shrink-0">
                                                            {!isStockLocked ? (
                                                                <QuantitySelector
                                                                    value={item.quantity}
                                                                    onChange={(val) => {
                                                                        const updated = savedAppointmentItems.map((i: any) =>
                                                                            i.id === item.id ? { ...i, quantity: val } : i
                                                                        );
                                                                        setSavedAppointmentItems(updated);
                                                                    }}
                                                                    size="sm"
                                                                />
                                                            ) : (
                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">Qtd: {item.quantity}</span>
                                                            )}
                                                            {!isStockLocked && (
                                                                <button
                                                                    onClick={async () => {
                                                                        const updated = savedAppointmentItems.filter((i: any) => i.id !== item.id);
                                                                        setSavedAppointmentItems(updated);
                                                                    }}
                                                                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 text-brand-inactive-text hover:text-red-500 transition-colors"
                                                                >
                                                                    <XIcon size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {!isStockLocked && (
                                                <Button
                                                    variant="link"
                                                    onClick={() => setIsAddItemSheetOpen(true)}
                                                >
                                                    <PlusIcon size={14} strokeWidth={3} />
                                                    Adicionar item
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        };

                        if (isViewMode) {
                            return (
                                <motion.div key="summary" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                                    <Tabs value={activeDetailTab} onValueChange={(v) => setActiveDetailTab(v as any)}>
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b border-brand-border dark:border-dark-border mb-6">
                                            <TabsTrigger value="general" className="px-0 pb-3 text-sm">
                                                Dados Gerais
                                            </TabsTrigger>
                                            <TabsTrigger value="stock" className="px-0 pb-3 text-sm">
                                                Controle de Estoque
                                            </TabsTrigger>
                                        </TabsList>
                                        <TabsContent value="general" className="mt-0">
                                            {renderGeneralTab()}
                                        </TabsContent>
                                        <TabsContent value="stock" className="mt-0">
                                            {renderStockTab()}
                                        </TabsContent>
                                    </Tabs>
                                </motion.div>
                            );
                        }

                        return (
                            <motion.div key="summary" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                                {renderGeneralTab()}
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
                                    maxLength={500}
                                    showCharacterCount
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
                                    className="flex-1 h-12"
                                    onClick={handleBack}
                                >
                                    {currentView === 'services' ? 'Cancelar' : 'Voltar'}
                                </Button>
                                <Button
                                    variant="default"
                                    className={`flex-1 h-12 ${currentView === 'services' && selectedServices.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    onClick={
                                        currentView === 'edit-service' ? () => setCurrentView('summary') : handleNext
                                    }
                                    disabled={
                                        (currentView === 'services' && selectedServices.length === 0) ||
                                        (currentView === 'datetime' && !needsRangePicker && !selectedTimeSlot) ||
                                        (currentView === 'items' && isEnrichingItems) ||
                                        isSaving
                                    }
                                >
                                    {isSaving && currentView === 'summary' ? (
                                        <span className="flex items-center gap-2">
                                            <Spinner size={18} />
                                        </span>
                                    ) : currentView === 'summary' ? (
                                        <span className="flex items-center gap-2">Agendar</span>
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
                                const effPaymentStatus = (orderPaymentInfo?.situation || appointment?.paymentStatus || '').toLowerCase();
                                const isFullyPaid = ['pago', 'paid'].includes((status || '').toLowerCase()) || effPaymentStatus === 'paid';
                                const isPartiallyPaid = ['partially paid', 'pago parcialmente', 'parcialmente pago'].includes((status || '').toLowerCase()) || effPaymentStatus === 'partially_paid';
                                const isPaidOrPartiallyPaid = isFullyPaid || isPartiallyPaid;

                                if (isFullyPaid) {
                                    return (
                                        <div className="flex gap-2">
                                            <Dropdown
                                                width="w-56"
                                                align="left"
                                                className='w-fit'
                                                fullWidth={false}
                                                showChevron={false}
                                                trigger={
                                                    <Button variant="outline" className="h-12 w-12 shrink-0 rounded-full border-brand-border bg-white p-0" type="button">
                                                        <ThreeDotsIcon className="h-5 w-5 text-brand-inactive-text dark:text-dark-body" />
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
                                                    <Button variant="outline" className="flex-1 font-bold h-12" onClick={handleViewSale}>
                                                        Ver venda
                                                    </Button>
                                                    <Button variant="default" className="flex-1 font-bold h-12" onClick={handleSaveChanges}>
                                                        Salvar
                                                    </Button>
                                                </>
                                            ) : (
                                                <Button variant="default" className="flex-1 font-bold h-12" onClick={handleViewSale}>
                                                    Ver venda
                                                </Button>
                                            )}
                                        </div>
                                    );
                                }

                                return (
                                    <div className="flex gap-2">
                                        <Dropdown
                                            width="w-56"
                                            align="left"
                                            showChevron={false}
                                            trigger={
                                                <Button variant="outline" className="h-12 w-12 shrink-0 rounded-full border-brand-border bg-white p-0" type="button">
                                                    <ThreeDotsIcon className="h-5 w-5 text-brand-inactive-text dark:text-dark-body" />
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
                                                    <DropdownItem className="text-red-500 hover:text-red-600" onClick={() => { setCancelNote(''); setIsCancelConfirmOpen(true); }}>
                                                        Cancelar
                                                    </DropdownItem>
                                                </>
                                            )}
                                        </Dropdown>

                                        {hasChanges ? (
                                            <>
                                                <Button variant="outline" className="flex-1 font-bold h-12" onClick={handleCheckoutNavigation}>
                                                    Checkout
                                                </Button>
                                                <Button variant="default" className="flex-1 font-bold h-12" onClick={handleSaveChanges}>
                                                    Salvar
                                                </Button>
                                            </>
                                        ) : (
                                            <Button variant="default" className="flex-1 font-bold h-12" onClick={handleCheckoutNavigation}>
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

            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center gap-4">
                    <Button variant="outline" className="h-12 flex-1" onClick={() => setIsNewServiceSheetOpen(false)} disabled={isCreatingService}>
                        Voltar
                    </Button>
                    <Button
                        className="h-12 flex-1"
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

            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center gap-4">
                    <Button variant="outline" className="h-12 flex-1" onClick={() => setIsEditServiceOpen(false)}>
                        Voltar
                    </Button>
                    <Button className="h-12 flex-1" onClick={() => setIsEditServiceOpen(false)}>
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

            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center gap-4">
                    <Button variant="outline" className="h-12 flex-1" onClick={() => setIsNewClientOpen(false)} disabled={isCreatingCustomer}>
                        Voltar
                    </Button>
                    <Button
                        className="h-12 flex-1"
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
                        onClick={() => {
                            setNewCustomerName("");
                            setNewCustomerEmail("");
                            setNewCustomerPhone("");
                            setIsNewClientOpen(true);
                        }}
                        className="h-11"
                        leftIcon={<PlusIcon size={18} />}
                    >
                    </Button>
                </div>

                <div className="space-y-2">
                    {filteredClients.length === 0 ? (
                        <IconPlaceholder
                            icon={UserIcon}
                            title="Nenhum cliente encontrado"
                            subtitle="Tente outro termo de busca ou cadastre um novo cliente."
                        />
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
                                    className={`flex items-center justify-between p-3.5 cursor-pointer transition-all ${isSelected ? 'rounded-xl border border-brand-green bg-green-50/5' : 'border-b last:border-0 border-brand-border dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <UserProfileImage fullName={client.name || "Cliente"} imageUrl={client.avatar_url || client.avatar} className="h-12 w-12 shrink-0 text-lg" />
                                        <div className="flex flex-col min-w-0">
                                            <span className="truncate text-sm font-bold text-brand-dark dark:text-dark-heading">{client.name}</span>
                                            <span className="truncate text-sm font-medium text-brand-inactive-text dark:text-dark-body">{client.email || client.phone || 'Cliente'}</span>
                                        </div>
                                    </div>
                                    {isSelected && <CheckIcon size={18} className="text-brand-green shrink-0" />}
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
                    maxLength={500}
                    showCharacterCount
                />
            </div>

            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center gap-4">
                    <Button variant="outline" className="h-12 flex-1" onClick={() => setIsNotesOverlayOpen(false)}>
                        Cancelar
                    </Button>
                    <Button className="h-12 flex-1" onClick={() => setIsNotesOverlayOpen(false)}>
                        Salvar
                    </Button>
                </div>
            </footer>
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

    const isNestedSheetOpen = isNewClientOpen || isNewServiceSheetOpen || isEditServiceOpen || isClientOverlayOpen || isHistoryOverlayOpen || isNotesOverlayOpen || isRecurrenceOverlayOpen || isAddItemSheetOpen;

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
            isMobile ? (
            <BottomSheet isOpen={isCancelConfirmOpen} onClose={() => setIsCancelConfirmOpen(false)}>
                <div className="p-6 space-y-5">
                    <div className="text-center">
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Cancelar agendamento</h3>
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-2">
                            Tem certeza que deseja cancelar este agendamento? Ele será excluído permanentemente.
                        </p>
                    </div>
                    <div>
                        <FormTextarea
                            label="Observação (opcional)"
                            name="cancelNote"
                            placeholder="Motivo do cancelamento..."
                            value={cancelNote}
                            onChange={(e) => setCancelNote(e.target.value)}
                            maxLength={500}
                            showCharacterCount
                        />
                    </div>
                    <div className="flex items-center gap-2 justify-center">
                        <Checkbox
                            label="Notificar o cliente sobre o cancelamento"
                            checked={notifyClientOnCancel}
                            onChange={(checked) => setNotifyClientOnCancel(!!checked)}
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsCancelConfirmOpen(false)}>Voltar</Button>
                        <Button variant="destructive" onClick={async () => {
                            setIsCancelConfirmOpen(false);
                            if (appointment?.id && onDelete) {
                                const success = await onDelete(appointment.id, notifyClientOnCancel, cancelNote);
                                if (success) {
                                    toast.success("Cancelado", "Agendamento cancelado com sucesso.");
                                } else {
                                    toast.error("Erro", "Não foi possível cancelar o agendamento.");
                                }
                            }
                        }}>Cancelar agendamento</Button>
                    </div>
                </div>
            </BottomSheet>
            ) : (
            <DefaultModal isOpen={isCancelConfirmOpen} onClose={() => setIsCancelConfirmOpen(false)} title="Cancelar agendamento">
                <div className="text-center sm:text-left">
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-2">
                        Tem certeza que deseja cancelar este agendamento? Ele será excluído permanentemente.
                    </p>
                </div>
                <div>
                    <FormTextarea
                        label="Observação (opcional)"
                        name="cancelNote"
                        placeholder="Motivo do cancelamento..."
                        value={cancelNote}
                        onChange={(e) => setCancelNote(e.target.value)}
                        maxLength={500}
                        showCharacterCount
                    />
                </div>
                <div className="flex items-center gap-2 justify-center sm:justify-start">
                    <Checkbox
                        label="Notificar o cliente sobre o cancelamento"
                        checked={notifyClientOnCancel}
                        onChange={(checked) => setNotifyClientOnCancel(!!checked)}
                    />
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsCancelConfirmOpen(false)}>Voltar</Button>
                    <Button variant="destructive" onClick={async () => {
                        setIsCancelConfirmOpen(false);
                        if (appointment?.id && onDelete) {
                            const success = await onDelete(appointment.id, notifyClientOnCancel, cancelNote);
                            if (success) {
                                toast.success("Cancelado", "Agendamento cancelado com sucesso.");
                            } else {
                                toast.error("Erro", "Não foi possível cancelar o agendamento.");
                            }
                        }
                    }}>Cancelar agendamento</Button>
                </div>
            </DefaultModal>
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

            {/* Stock Check Modal */}
            <DefaultModal
                isOpen={isStockCheckOpen}
                onClose={() => {
                    setIsStockCheckOpen(false)
                    setPendingNextStep(null)
                }}
                title="Atenção: Estoque baixo"
            >
                <div className="space-y-4">
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                        Os seguintes itens terão estoque {' '}
                        <span className="font-bold text-red-600">negativo ou abaixo do mínimo</span>
                        {' '}após este agendamento:
                    </p>
                    <div className="max-h-60 overflow-y-auto border border-brand-border dark:border-dark-border rounded-xl px-4 divide-y divide-brand-border/40 dark:divide-dark-border/40 bg-white dark:bg-dark-surface">
                        {stockCheckItems.map((item: any, idx: number) => {
                            const itemStock = item.stock ?? 0;
                            const itemImage = item.image;
                            const itemName = item.name;
                            const itemSku = item.sku;
                            const newStock = item.projectedStock;

                            return (
                                <div key={idx} className="py-4 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="w-8 h-8 rounded-full bg-brand-gray dark:bg-dark-border/50 overflow-hidden shrink-0 border border-brand-border dark:border-dark-border">
                                            <img src={getR2ImageUrl(itemImage, "thumbnail") || "https://img.dudit.com.br/static/Placeholder.png"} className="w-full h-full object-cover rounded-full" alt="" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{itemName}</div>
                                            <div className="text-[10px] font-medium text-brand-inactive-text uppercase tracking-wider">{itemSku || 'N/A'}</div>
                                        </div>
                                    </div>

                                    <div className="h-8 w-px bg-brand-border dark:bg-dark-border shrink-0" />

                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{itemStock} <span className="text-[10px] font-medium opacity-60">un</span></span>
                                        <ArrowRightIcon size={14} className="text-brand-inactive-text" />
                                        <span className="text-[15px] font-bold text-brand-red">
                                            {newStock} <span className="text-xs font-bold">un</span>
                                        </span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body text-center">
                        Deseja prosseguir mesmo assim?
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsStockCheckOpen(false)}>Cancelar</Button>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                setIsStockCheckOpen(false)
                                if (pendingNextStep) {
                                    pendingNextStep.fn()
                                    setPendingNextStep(null)
                                }
                            }}
                        >
                            Prosseguir mesmo assim
                        </Button>
                    </div>
                </div>
            </DefaultModal>

            {isMobile ? (
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
                            animate={{
                                x: isNestedSheetOpen ? "-40px" : 0,
                                scale: isNestedSheetOpen ? 0.97 : 1,
                                opacity: isNestedSheetOpen ? 0.7 : 1
                            }}
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
            }


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

            <AddItemSheet
                isOpen={isAddItemSheetOpen}
                onClose={() => setIsAddItemSheetOpen(false)}
                partnerId={partnerId}
                storeId={storeIdProp}
                onConfirm={(newItem) => {
                    const item = {
                        ...newItem,
                        id: `new-${crypto.randomUUID()}`,
                        appointmentId: appointment?.id || null,
                        serviceId: null,
                        serviceName: null,
                        usageType: newItem.usage_type,
                        quantity: newItem.quantity,
                        product: newItem.product_id ? {
                            name: newItem.name,
                            image: newItem.image || null,
                            stock: 0,
                        } : null,
                    }
                    setSavedAppointmentItems(prev => [...prev, item])
                }}
            />
        </>
    )
}
