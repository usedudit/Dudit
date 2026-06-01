
import { Appointment, LayoutAppointment } from './types';

// Helper to safely parse YYYY-MM-DD to a local Date object at 00:00:00 without timezone shift
export const parseLocalDate = (dateStr: string): Date => {
    if (!dateStr) return new Date();
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
};

export const isMultiDay = (appointment: Appointment): boolean => {
    // If it has specific start/end dates that differ
    if (appointment.endDate && appointment.date !== appointment.endDate) return true;

    // Or if duration is longer than 24 hours (1440 minutes)
    if (appointment.duration >= 1440) return true;

    return false;
}

export const getMultiDayStyle = (status: string) => {
    // A solid style for multi-day bars similar to Google Calendar
    const s = status.toLowerCase();
    if (s === 'confirmed' || s === 'confirmado') return 'bg-emerald-600 border-emerald-700 text-white';
    if (s === 'pago' || s === 'paid') return 'bg-green-600 border-green-700 text-white';
    if (s === 'pending' || s === 'aguardando') return 'bg-orange-500 border-orange-600 text-white';
    if (s === 'reservado' || s === 'reserved') return 'bg-blue-600 border-blue-700 text-white';
    if (s === 'cancelado' || s === 'canceled' || s === 'cancelar') return 'bg-red-600 border-red-700 text-white';
    if (s === 'ausência' || s === 'absent') return 'bg-red-500 border-red-600 text-white';
    if (s === 'indisponível' || s === 'unavailable' || s === 'almoço') return 'bg-gray-500 border-gray-600 text-white';
    if (s === 'concluído' || s === 'concluido' || s === 'finished' || s === 'completed') return 'bg-emerald-700 border-emerald-800 text-white';
    return 'bg-gray-500 border-gray-600 text-white';
}

export const getAppointmentStyle = (status: string) => {
    // Normalize status to lowercase for comparison to handle both Portuguese and English/Internal codes
    const s = status.toLowerCase();

    // Confirmed -> Emerald
    if (s === 'confirmed' || s === 'confirmado') {
        return {
            container: 'bg-[#ecfdf5] dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900/30',
            bar: 'bg-emerald-500',
            title: 'text-emerald-900 dark:text-emerald-100',
            text: 'text-emerald-700 dark:text-emerald-300/80',
            dot: 'bg-emerald-500'
        };
    }

    // Paid -> Green (Explicit Request)
    if (s === 'paid' || s === 'pago') {
        return {
            container: 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-900/30',
            bar: 'bg-green-600',
            title: 'text-green-900 dark:text-green-100',
            text: 'text-green-700 dark:text-green-300/80',
            dot: 'bg-green-600'
        };
    }

    // Pending / Waiting -> Orange
    if (s === 'pending' || s === 'aguardando') {
        return {
            container: 'bg-[#fff7ed] dark:bg-orange-900/20 border-orange-100 dark:border-orange-900/30',
            bar: 'bg-orange-500',
            title: 'text-orange-900 dark:text-orange-100',
            text: 'text-orange-700 dark:text-orange-300/80',
            dot: 'bg-orange-500'
        };
    }

    // Reserved -> Blue
    if (s === 'reservado' || s === 'reserved') {
        return {
            container: 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/30',
            bar: 'bg-blue-500',
            title: 'text-blue-900 dark:text-blue-100',
            text: 'text-blue-700 dark:text-blue-300/80',
            dot: 'bg-blue-500'
        };
    }

    // In Progress -> Brand Dark / Teal
    if (s === 'iniciado' || s === 'in progress') {
        return {
            container: 'bg-[#003229]/10 dark:bg-[#003229]/30 border-[#003229]/20 dark:border-[#003229]/40',
            bar: 'bg-[#003229]',
            title: 'text-[#003229] dark:text-[#e0f2f1]',
            text: 'text-[#004d40] dark:text-[#b2dfdb]',
            dot: 'bg-[#003229]'
        };
    }

    // Canceled -> Red
    if (s === 'canceled' || s === 'cancelado' || s === 'cancelar') {
        return {
            container: 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/30',
            bar: 'bg-red-600',
            title: 'text-red-900 dark:text-red-100',
            text: 'text-red-700 dark:text-red-300/80',
            dot: 'bg-red-600'
        };
    }

    // Absence -> Red (Lighter or same)
    if (s === 'ausência' || s === 'absent' || s === 'ausencia') {
        return {
            container: 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30',
            bar: 'bg-red-400',
            title: 'text-red-900 dark:text-red-100',
            text: 'text-red-700 dark:text-red-300/80',
            dot: 'bg-red-400'
        };
    }

    // Unavailable / Break / Lunch -> Gray Striped
    if (s === 'indisponível' || s === 'unavailable' || s === 'break' || s === 'almoço' || s === 'lunch') {
        return {
            // Using Tailwind arbitrary values for the striped gradient pattern
            container: 'bg-gray-100 dark:bg-zinc-800 border-gray-300 dark:border-zinc-600 bg-[linear-gradient(45deg,rgba(0,0,0,0.04)_25%,transparent_25%,transparent_50%,rgba(0,0,0,0.04)_50%,rgba(0,0,0,0.04)_75%,transparent_75%,transparent)] bg-[length:12px_12px]',
            bar: 'bg-gray-500',
            title: 'text-gray-700 dark:text-gray-300',
            text: 'text-gray-600 dark:text-gray-400',
            dot: 'bg-gray-500'
        };
    }

    // Partially Paid -> Yellow
    if (s === 'partially paid' || s === 'pago parcialmente') {
        return {
            container: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-100 dark:border-yellow-900/30',
            bar: 'bg-yellow-600',
            title: 'text-yellow-900 dark:text-yellow-100',
            text: 'text-yellow-700 dark:text-yellow-300/80',
            dot: 'bg-yellow-600'
        };
    }

    // Finished / Completed -> Gray (Solid)
    if (s === 'finalizado' || s === 'finished' || s === 'completed' || s === 'concluído' || s === 'concluido') {
        return {
            container: 'bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700',
            bar: 'bg-gray-500',
            title: 'text-gray-700 dark:text-gray-300',
            text: 'text-gray-500 dark:text-gray-400',
            dot: 'bg-gray-500'
        };
    }

    // Default Fallback
    return {
        container: 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-gray-700',
        bar: 'bg-gray-400',
        title: 'text-gray-900 dark:text-gray-100',
        text: 'text-gray-600 dark:text-gray-400',
        dot: 'bg-gray-400'
    };
};

export const getEndTime = (startTime: string, durationMinutes: number) => {
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + durationMinutes;
    const endHours = Math.floor(totalMinutes / 60) % 24;
    const endMinutes = totalMinutes % 60;
    return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
};

export const formatDuration = (minutes: number) => {
    // If it's effectively a multiple of days (1440 mins)
    if (minutes >= 1440) {
        const days = Math.round(minutes / 1440);
        return days === 1 ? '1 dia' : `${days} dias`;
    }

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    let parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0) parts.push(`${mins}m`);

    return parts.join(' ');
};

export const formatDateStr = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const getWeekDays = (date: Date) => {
    const day = date.getDay();
    const diff = date.getDate() - day;
    const startOfWeek = new Date(date);
    startOfWeek.setDate(diff);

    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        days.push(d);
    }
    return days;
};

export const arrangeAppointments = (items: Appointment[]): LayoutAppointment[] => {
    const events: LayoutAppointment[] = items.map(item => {
        const [h, m] = item.time.split(':').map(Number);
        const start = h * 60 + m;
        // Cap visual block for day view so it doesn't break layout if multi-day
        // Real logic would split events across days
        const visualDuration = Math.min(item.duration, 1440 - start);
        return { ...item, start, end: start + visualDuration };
    }).sort((a, b) => a.start - b.start || b.duration - a.duration);

    const columns: LayoutAppointment[][] = [];

    events.forEach(event => {
        let placed = false;
        for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            const lastEventInCol = col[col.length - 1];
            if (event.start >= lastEventInCol.end) {
                col.push(event);
                event.column = i;
                placed = true;
                break;
            }
        }
        if (!placed) {
            columns.push([event]);
            event.column = columns.length - 1;
        }
    });

    events.forEach(event => {
        const overlaps = events.filter(other =>
            event.id !== other.id &&
            Math.max(event.start, other.start) < Math.min(event.end, other.end)
        );
        let maxCol = event.column || 0;
        overlaps.forEach(o => {
            if ((o.column || 0) > maxCol) maxCol = o.column || 0;
        });
        event.totalColumns = maxCol + 1;
    });

    return events;
};
