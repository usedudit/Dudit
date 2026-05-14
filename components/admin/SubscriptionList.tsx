'use client';

import { useState } from 'react';
import {
    SearchIcon,
    FilterIcon,
    MoreHorizontalIcon,
    CreditCardIcon,
    CalendarIcon,
    DownloadIcon,
    CancelCircleIcon,
    ClockIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    XIcon,
    StoreIcon,
    MoneyIcon,
} from '@/lib/icons';
import Button from '@/components/reusable/Button';
import { Badge } from '@/components/reusable/Badge';
import Dropdown, { DropdownItem } from '@/components/reusable/Dropdown';
import { Checkbox } from '@/components/reusable/Checkbox';
import BottomSheet from '@/components/BottomSheet';
import Portal from "@/components/Portal";
import { useMediaQuery } from '@/hooks';

const SubscriptionList = () => {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [detailItem, setDetailItem] = useState<any | null>(null);

    const subscriptions = [
        {
            id: 'SUB-1001',
            tenant: 'TechCorp Solutions',
            tenantId: 'TNT-8821',
            plan: 'Enterprise',
            status: 'Active',
            amount: '$299.00',
            billingCycle: 'Monthly',
            nextBilling: 'Oct 24, 2024',
            paymentMethod: 'Visa •••• 4242',
            history: [
                { date: 'Sep 24, 2024', amount: '$299.00', status: 'Paid', invoice: 'INV-001' },
                { date: 'Aug 24, 2024', amount: '$299.00', status: 'Paid', invoice: 'INV-002' },
            ]
        },
        {
            id: 'SUB-1002',
            tenant: 'Creative Studio',
            tenantId: 'TNT-8822',
            plan: 'Pro',
            status: 'Past Due',
            amount: '$49.00',
            billingCycle: 'Monthly',
            nextBilling: 'Oct 15, 2024',
            paymentMethod: 'Mastercard •••• 8822',
            history: [
                { date: 'Sep 15, 2024', amount: '$49.00', status: 'Failed', invoice: 'INV-003' },
                { date: 'Aug 15, 2024', amount: '$49.00', status: 'Paid', invoice: 'INV-004' },
            ]
        },
        {
            id: 'SUB-1003',
            tenant: 'StartUp Inc',
            tenantId: 'TNT-8823',
            plan: 'Free',
            status: 'Active',
            amount: '$0.00',
            billingCycle: 'Monthly',
            nextBilling: 'N/A',
            paymentMethod: 'N/A',
            history: []
        },
        {
            id: 'SUB-1004',
            tenant: 'Global Trade Ltd',
            tenantId: 'TNT-8824',
            plan: 'Pro',
            status: 'Canceled',
            amount: '$49.00',
            billingCycle: 'Monthly',
            nextBilling: 'N/A',
            paymentMethod: 'Visa •••• 1111',
            history: [
                { date: 'Aug 01, 2024', amount: '$49.00', status: 'Paid', invoice: 'INV-005' },
            ]
        },
        {
            id: 'SUB-1005',
            tenant: 'Local Shop',
            tenantId: 'TNT-8825',
            plan: 'Pro',
            status: 'Trial',
            amount: '$49.00',
            billingCycle: 'Monthly',
            nextBilling: 'Nov 01, 2024',
            paymentMethod: 'Pending',
            history: []
        }
    ];

    const handleSelectAll = (checked: boolean | "indeterminate") => {
        if (checked === true) {
            setSelectedIds(subscriptions.map(s => s.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (id: string) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(sid => sid !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'Active': return <Badge variant="green">{status}</Badge>;
            case 'Past Due': return <Badge variant="red">{status}</Badge>;
            case 'Canceled': return <Badge variant="gray">{status}</Badge>;
            case 'Trial': return <Badge variant="blue">{status}</Badge>;
            default: return <Badge variant="gray">{status}</Badge>;
        }
    };

    return (
        <div className="p-6 md:p-8 max-w-[1700px] mx-auto space-y-6">

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none mb-1">Subscriptions</h1>
                    <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">Manage tenant billing, plans, and invoices.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" className="gap-2">
                        <DownloadIcon size={16} /> Export Report
                    </Button>
                </div>
            </div>

            {/* Filters & Search */}
            <div className="bg-white dark:bg-dark-surface p-4 rounded-2xl border border-brand-border dark:border-dark-border flex flex-col sm:flex-row gap-4 justify-between items-center">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-inactive-text" size={18} />
                        <input
                            type="text"
                            placeholder="Search tenant, ID, or plan..."
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-brand-border dark:border-dark-border bg-gray-50 dark:bg-gray-800 text-brand-dark dark:text-dark-heading focus:ring-2 focus:ring-brand-green focus:border-brand-green outline-none transition-all"
                        />
                    </div>
                    <Button variant="outline" className="gap-2 px-3">
                        <FilterIcon size={16} /> <span className="hidden sm:inline">Filters</span>
                    </Button>
                </div>

                {/* Bulk Actions */}
                {selectedIds.length > 0 && (
                    <div className="flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2">
                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                            {selectedIds.length} selected
                        </span>
                        <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/30 dark:hover:bg-red-900/20">
                            Cancel Selected
                        </Button>
                    </div>
                )}
            </div>

            {/* Mobile View - Cards */}
            <div className="md:hidden flex flex-col mb-8 border-b border-brand-border dark:border-dark-border">
                {subscriptions.map((sub) => (
                    <div
                        key={sub.id}
                        className="py-5 border-b border-brand-border dark:border-dark-border last:border-0 cursor-pointer"
                        onClick={() => setDetailItem(sub)}
                    >
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 border border-brand-border dark:border-dark-border shrink-0 flex items-center justify-center text-brand-dark dark:text-dark-heading">
                                <StoreIcon size={20} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                    <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate pr-2">
                                        {sub.tenant}
                                    </h3>
                                    {getStatusBadge(sub.status)}
                                </div>
                                <div className="text-xs text-brand-inactive-text dark:text-dark-body mb-3">
                                    {sub.plan} • {sub.billingCycle}
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-sm font-medium text-brand-dark dark:text-dark-heading">
                                        <MoneyIcon size={14} className="text-brand-inactive-text" />
                                        {sub.amount}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-brand-inactive-text dark:text-dark-body">
                                        <CalendarIcon size={12} />
                                        Next: {sub.nextBilling}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block bg-white dark:bg-dark-surface rounded-2xl overflow-hidden mb-6">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-separate border-spacing-0 min-w-[1200px]">
                        <thead>
                            <tr className="bg-brand-slate dark:bg-dark-surface transition-colors">
                                <th className="py-2 px-4 w-12 pl-6 rounded-l-xl border-b border-brand-border dark:border-dark-border">
                                    <Checkbox
                                        checked={selectedIds.length === subscriptions.length && subscriptions.length > 0}
                                        onCheckedChange={handleSelectAll}
                                    />
                                </th>
                                <th className="py-2 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body relative border-b border-brand-border dark:border-dark-border">
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-px bg-gray-300 dark:bg-gray-700"></div>
                                    <div className="flex items-center gap-1 cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading group">
                                        Tenant
                                    </div>
                                </th>
                                <th className="py-2 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body relative border-b border-brand-border dark:border-dark-border">
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-px bg-gray-300 dark:bg-gray-700"></div>
                                    <div className="flex items-center gap-1 cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading group">
                                        Plan & Status
                                    </div>
                                </th>
                                <th className="py-2 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body relative border-b border-brand-border dark:border-dark-border">
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-px bg-gray-300 dark:bg-gray-700"></div>
                                    <div className="flex items-center gap-1 cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading group">
                                        Amount
                                    </div>
                                </th>
                                <th className="py-2 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body relative border-b border-brand-border dark:border-dark-border">
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-px bg-gray-300 dark:bg-gray-700"></div>
                                    <div className="flex items-center gap-1 cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading group">
                                        Next Billing
                                    </div>
                                </th>
                                <th className="py-2 px-4 w-16 rounded-r-xl relative text-center text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border">
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-px bg-gray-300 dark:bg-gray-700"></div>
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {subscriptions.map((sub) => (
                                <tr
                                    key={sub.id}
                                    className="group hover:bg-gray-50 dark:hover:bg-dark-border/50 transition-colors cursor-pointer"
                                    onClick={() => setDetailItem(sub)}
                                >
                                    <td className="p-4 pl-6 border-b border-brand-border dark:border-dark-border" onClick={(e) => e.stopPropagation()}>
                                        <Checkbox
                                            checked={selectedIds.includes(sub.id)}
                                            onCheckedChange={() => handleSelectOne(sub.id)}
                                        />
                                    </td>
                                    <td className="p-4 border-b border-brand-border dark:border-dark-border">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 border border-brand-border dark:border-dark-border overflow-hidden shrink-0 flex items-center justify-center text-brand-dark dark:text-dark-heading">
                                                <StoreIcon size={18} />
                                            </div>
                                            <div>
                                                <div className="font-bold text-[13px] text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                                    {sub.tenant}
                                                </div>
                                                <div className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">{sub.tenantId}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4 border-b border-brand-border dark:border-dark-border">
                                        <div className="flex flex-col gap-1 items-start">
                                            <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">{sub.plan}</span>
                                            {getStatusBadge(sub.status)}
                                        </div>
                                    </td>
                                    <td className="p-4 border-b border-brand-border dark:border-dark-border">
                                        <div className="flex items-center gap-2 text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                                            {sub.amount} <span className="text-brand-inactive-text text-[11px]">/ {sub.billingCycle}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 border-b border-brand-border dark:border-dark-border">
                                        <div className="flex items-center gap-2 text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                                            <CalendarIcon size={14} className="text-brand-inactive-text" />
                                            {sub.nextBilling}
                                        </div>
                                    </td>
                                    <td className="p-4 text-center border-b border-brand-border dark:border-dark-border relative" onClick={(e) => e.stopPropagation()}>
                                        <Dropdown
                                            align="right"
                                            width="w-48"
                                            showChevron={false}
                                            trigger={
                                                <Button variant="outline" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <MoreHorizontalIcon size={16} />
                                                </Button>
                                            }
                                        >
                                            <DropdownItem className="gap-2" onClick={() => setDetailItem(sub)}>
                                                <CreditCardIcon size={14} /> View Details
                                            </DropdownItem>
                                            <DropdownItem className="gap-2">
                                                <DownloadIcon size={14} /> Download Invoice
                                            </DropdownItem>
                                            <div className="h-px bg-gray-200 dark:bg-gray-800 my-1" />
                                            <DropdownItem className="gap-2 text-red-600">
                                                <CancelCircleIcon size={14} /> Cancel Subscription
                                            </DropdownItem>
                                        </Dropdown>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Detached Pagination */}
            <div className="flex justify-center mb-8">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="w-8 h-8 flex items-center justify-center disabled:opacity-50" disabled>
                        <ChevronLeftIcon size={18} />
                    </Button>
                    <button className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-brand-slate dark:bg-gray-800 text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border transition-all hover:border-gray-300 dark:hover:border-gray-600">1</button>
                    <button className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-brand-inactive-text dark:text-dark-body hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">2</button>
                    <button className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-brand-inactive-text dark:text-dark-body hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">3</button>
                    <Button variant="ghost" size="icon" className="w-8 h-8 flex items-center justify-center">
                        <ChevronRightIcon size={18} />
                    </Button>
                </div>
            </div>

            {/* Detail Sheet */}
            <SubscriptionDetailsSheet
                item={detailItem}
                isOpen={!!detailItem}
                onClose={() => setDetailItem(null)}
            />
        </div>
    );
};

export default SubscriptionList;

// ─── Detail Sheet Sub-component ──────────────────────────────────────────────

interface SubscriptionDetailsSheetProps {
    item: any | null
    isOpen: boolean
    onClose: () => void
}

function SubscriptionDetailsSheet({ item, isOpen, onClose }: SubscriptionDetailsSheetProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'Active': return <Badge variant="green">{status}</Badge>;
            case 'Past Due': return <Badge variant="red">{status}</Badge>;
            case 'Canceled': return <Badge variant="gray">{status}</Badge>;
            case 'Trial': return <Badge variant="blue">{status}</Badge>;
            default: return <Badge variant="gray">{status}</Badge>;
        }
    };

    if (!item) return null

    const content = (
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface">
            {/* Header */}
            <header className="border-b border-brand-border dark:border-dark-border p-6 flex justify-between items-center">
                <h2 className="text-xl font-bold dark:text-dark-heading">Detalhes da Assinatura</h2>
                <Button variant="filled" onClick={onClose} size="icon">
                    <XIcon className="w-5 h-5" />
                </Button>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                {/* Store Header */}
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-xl bg-gray-100 dark:bg-gray-800 border border-brand-border dark:border-dark-border flex items-center justify-center text-brand-dark dark:text-dark-heading">
                        <StoreIcon size={32} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{item.tenant}</h3>
                        <div className="text-sm text-brand-inactive-text dark:text-dark-body font-mono">{item.tenantId}</div>
                    </div>
                </div>

                {/* Plan Card */}
                <div className="bg-gray-50 dark:bg-dark-background/50 p-5 rounded-2xl border border-brand-border dark:border-dark-border space-y-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <span className="text-[11px] font-bold text-brand-inactive-text block mb-1">Plano Atual</span>
                            <div className="text-xl font-bold text-brand-dark dark:text-dark-heading">{item.plan}</div>
                        </div>
                        {getStatusBadge(item.status)}
                    </div>
                    <div className="flex justify-between items-center pt-4 border-t border-brand-border dark:border-dark-border">
                        <div className="flex items-center gap-2 text-base font-bold text-brand-dark dark:text-dark-heading">
                            <MoneyIcon size={18} className="text-brand-inactive-text" />
                            {item.amount} <span className="text-brand-inactive-text text-sm font-medium">/ {item.billingCycle}</span>
                        </div>
                        <div className="text-xs text-brand-inactive-text dark:text-dark-body flex items-center gap-1">
                            <ClockIcon size={14} /> Renova em {item.nextBilling}
                        </div>
                    </div>
                </div>

                {/* Payment Method */}
                <div className="space-y-3">
                    <h4 className="text-[13px] font-bold text-brand-inactive-text dark:text-dark-body">Método de Pagamento</h4>
                    <div className="flex items-center gap-3 p-4 rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray/30">
                        <div className="w-12 h-8 bg-white dark:bg-gray-800 rounded border border-brand-border/50 flex items-center justify-center text-[10px] font-black text-brand-inactive-text">
                            CARD
                        </div>
                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{item.paymentMethod}</span>
                    </div>
                </div>

                {/* Invoice History */}
                <div className="space-y-4">
                    <h4 className="text-[13px] font-bold text-brand-inactive-text dark:text-dark-body">Faturas Recentes</h4>
                    <div className="space-y-2">
                        {item.history.length > 0 ? item.history.map((inv: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between p-4 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2.5 h-2.5 rounded-full ${inv.status === 'Paid' ? 'bg-brand-green shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-brand-red shadow-[0_0_8px_rgba(239,68,68,0.4)]'}`} />
                                    <div>
                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{inv.date}</div>
                                        <div className="text-[11px] text-brand-inactive-text font-mono">{inv.invoice}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-black text-brand-dark dark:text-dark-heading">{inv.amount}</div>
                                    <div className="text-[10px] font-bold text-brand-inactive-text uppercase tracking-tighter">{inv.status}</div>
                                </div>
                            </div>
                        )) : (
                            <div className="flex flex-col items-center justify-center p-8 bg-brand-gray/30 rounded-2xl border border-dashed border-brand-border dark:border-dark-border text-brand-inactive-text">
                                <ClockIcon size={32} className="mb-2 opacity-20" />
                                <span className="text-sm font-medium italic">Nenhum histórico disponível</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="pt-6 border-t border-brand-border dark:border-dark-border space-y-3">
                    <Button className="w-full justify-center gap-2 h-12 rounded-full font-bold">
                        <DownloadIcon size={18} /> Baixar Extrato
                    </Button>
                    <Button variant="outline" className="w-full justify-center gap-2 h-12 rounded-full font-bold text-brand-red border-red-200 hover:bg-red-50 dark:hover:bg-red-900/10">
                        <CancelCircleIcon size={18} /> Cancelar Assinatura
                    </Button>
                </div>
            </div>
        </div>
    )

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose}>
                {content}
            </BottomSheet>
        )
    }

    return (
        <Portal>
            <div
                className={`fixed inset-0 z-50 bg-black/50 transition-opacity ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
                onClick={onClose}
            >
                <div
                    className={`fixed right-4 top-4 bottom-4 w-96 md:w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {content}
                </div>
            </div>
        </Portal>
    )
}

