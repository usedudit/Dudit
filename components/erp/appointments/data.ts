
import { Appointment, StaffMember } from './types';

export const staffMembers: StaffMember[] = [
    { id: '1', name: 'Ana Silva', role: 'Especialista', avatar: 'https://i.pravatar.cc/150?u=20' },
    { id: '2', name: 'Carlos Lima', role: 'Técnico', avatar: 'https://i.pravatar.cc/150?u=32' },
    { id: '3', name: 'Roberto Souza', role: 'Consultor', avatar: 'https://i.pravatar.cc/150?u=44' },
    { id: '4', name: 'Julia Martins', role: 'Assistente', avatar: 'https://i.pravatar.cc/150?u=12' },
];

export const mockServices = [
    { category: 'Cabelo 2', colorClass: 'bg-purple-500', items: [{ id: 1, name: 'Corte de cabelo social', duration: '60', price: 20, pricingUnit: 'Por Serviço' }] },
    { category: 'Laje 1', colorClass: 'bg-blue-500', items: [{ id: 2, name: 'Lajeee', duration: '50', price: 40, pricingUnit: 'Por Serviço' }] },
    { category: 'Cabelo e penteado 1', colorClass: 'bg-pink-500', items: [{ id: 3, name: 'Coloração de cabelo', duration: '55', price: 57, pricingUnit: 'Por Serviço' }] },
    { category: 'Locação', colorClass: 'bg-teal-500', items: [
        { id: 7, name: 'Câmera DSLR (Diária)', duration: '1440', price: 100, pricingUnit: 'Por Dia' }, // 1440 min = 1 day
        { id: 8, name: 'Estúdio (Hora)', duration: '60', price: 50, pricingUnit: 'Por Hora' }
    ]},
    { category: 'Unhas 3', colorClass: 'bg-orange-500', items: [
        { id: 4, name: 'Manicure e pedicure', duration: '50', price: 45, pricingUnit: 'Por Serviço' },
        { id: 5, name: 'Pedicure', duration: '40', price: 30, pricingUnit: 'Por Serviço' },
        { id: 6, name: 'Manicure', duration: '30', price: 25, pricingUnit: 'Por Serviço' },
    ]},
];

export const mockClients = [
    { id: 1, name: 'Jane Doe', email: 'jane@example.com', avatar: 'J' },
    { id: 2, name: 'John Doe', email: 'john@example.com', avatar: 'J' },
    { id: 3, name: 'Murilo', avatar: 'https://i.pravatar.cc/150?u=60' }, 
];

export const initialAppointments: Appointment[] = [
    { id: '1', partnerId: 'mock-partner', customer: 'Bagus Fikri', service: 'Consultoria Financeira', date: '2024-02-24', time: '10:00', duration: 60, status: 'Confirmed', staff: 'Ana Silva', staffId: '1', price: 150, notes: 'Cliente prefere sala silenciosa', pricingUnit: 'Por Serviço' },
    { id: '2', partnerId: 'mock-partner', customer: 'Sarah Connor', service: 'Manutenção Preventiva', date: '2024-02-24', time: '14:30', duration: 120, status: 'Pending', staff: 'Carlos Lima', staffId: '2', price: 300, pricingUnit: 'Por Serviço' },
    { id: '3', partnerId: 'mock-partner', customer: 'John Wick', service: 'Câmera DSLR (Diária)', date: '2024-02-25', time: '09:00', endDate: '2024-02-27', endTime: '18:00', duration: 3420, status: 'Confirmed', staff: 'Roberto Souza', staffId: '3', price: 300, pricingUnit: 'Por Dia' },
    { id: '4', partnerId: 'mock-partner', customer: 'Horário Indisponível', service: 'Almoço', date: '2024-02-24', time: '12:00', duration: 60, status: 'Indisponível', staff: 'Ana Silva', staffId: '1', price: 0, pricingUnit: 'Por Serviço' },
];
