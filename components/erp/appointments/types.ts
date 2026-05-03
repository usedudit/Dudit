
export type ViewType = 'month' | 'week' | 'day';
export type ModeType = 'calendar' | 'list';

export interface Appointment {
    id: string;
    partnerId: string;
    customer: string;
    service: string;
    date: string;       // Start Date (YYYY-MM-DD)
    time: string;       // Start Time (HH:MM)
    endDate?: string;   // End Date (YYYY-MM-DD) - New
    endTime?: string;   // End Time (HH:MM) - New
    duration: number;   // minutes (calculated total)
    status: 'Reservado' | 'Confirmado' | 'Aguardando' | 'Iniciado' | 'Concluído' | 'Pago' | 'Ausência' | 'Cancelado' | 'Indisponível' | 'Partially Paid' | 'Pago Parcialmente';
    paymentStatus?: string;
    staff: string;
    staffId: string;
    price: number;
    pricingUnit?: 'Por Serviço' | 'Por Hora' | 'Por Dia' | 'Por Semana'; // New
    notes?: string;
    activityLog?: any[];
    source?: 'unavailable' | 'appointment';
    recurrence?: 'none' | 'daily' | 'weekly';
}

// Helper interface for layout calculation
export interface LayoutAppointment extends Appointment {
    start: number; // minutes from midnight
    end: number;   // minutes from midnight
    column?: number;
    totalColumns?: number;
}

export interface StaffMember {
    id: string;
    name: string;
    role: string;
    avatar?: string;
}

export interface PopoverState {
    staffId?: string;
    time?: string;
    date?: Date;
    top?: number;
    left?: number;
    align?: 'left' | 'right';
    mode?: 'resource' | 'absolute';
}
