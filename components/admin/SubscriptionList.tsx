'use client';

import React, { useState } from 'react';
import {
  Search,
  Filter,
  MoreHorizontal,
  CreditCard,
  Calendar,
  Download,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  X,
  Building2,
  DollarSign
} from 'lucide-react';
import Button from '@/components/reusable/Button';
import { Badge } from '@/components/reusable/Badge';
import Dropdown, { DropdownItem } from '@/components/reusable/Dropdown';
import { Checkbox } from '@/components/reusable/Checkbox';
import { motion, AnimatePresence } from 'framer-motion';

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
            <Download size={16} /> Export Report
          </Button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white dark:bg-dark-surface p-4 rounded-2xl border border-brand-border dark:border-dark-border flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-inactive-text" size={18} />
            <input
              type="text"
              placeholder="Search tenant, ID, or plan..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-brand-border dark:border-dark-border bg-gray-50 dark:bg-gray-800 text-brand-dark dark:text-dark-heading focus:ring-2 focus:ring-brand-green focus:border-brand-green outline-none transition-all"
            />
          </div>
          <Button variant="outline" className="gap-2 px-3">
            <Filter size={16} /> <span className="hidden sm:inline">Filters</span>
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
              <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 border border-brand-border dark:border-dark-border flex-shrink-0 flex items-center justify-center text-brand-dark dark:text-dark-heading">
                <Building2 size={20} />
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
                    <DollarSign size={14} className="text-brand-inactive-text" />
                    {sub.amount}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-brand-inactive-text dark:text-dark-body">
                    <Calendar size={12} />
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
          <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
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
                      <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 border border-brand-border dark:border-dark-border overflow-hidden flex-shrink-0 flex items-center justify-center text-brand-dark dark:text-dark-heading">
                        <Building2 size={18} />
                      </div>
                      <div>
                        <div className="font-bold text-[13px] text-brand-dark dark:text-dark-heading flex items-center gap-2">
                          {sub.tenant}
                        </div>
                        <div className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body">{sub.tenantId}</div>
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
                      <Calendar size={14} className="text-brand-inactive-text" />
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
                          <MoreHorizontal size={16} />
                        </Button>
                      }
                    >
                      <DropdownItem className="gap-2" onClick={() => setDetailItem(sub)}>
                        <CreditCard size={14} /> View Details
                      </DropdownItem>
                      <DropdownItem className="gap-2">
                        <Download size={14} /> Download Invoice
                      </DropdownItem>
                      <div className="h-px bg-gray-200 dark:bg-gray-800 my-1" />
                      <DropdownItem className="gap-2 text-red-600">
                        <XCircle size={14} /> Cancel Subscription
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
            <ChevronLeft size={18} />
          </Button>
          <button className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-brand-slate dark:bg-gray-800 text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border transition-all hover:border-gray-300 dark:hover:border-gray-600">1</button>
          <button className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-brand-inactive-text dark:text-dark-body hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">2</button>
          <button className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-brand-inactive-text dark:text-dark-body hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">3</button>
          <Button variant="ghost" size="icon" className="w-8 h-8 flex items-center justify-center">
            <ChevronRight size={18} />
          </Button>
        </div>
      </div>

      {/* Detail Slide-over */}
      <AnimatePresence>
        {detailItem && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setDetailItem(null)}
              className="fixed inset-0 bg-black z-[60]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-dark-surface shadow-2xl z-[70] border-l border-brand-border dark:border-dark-border overflow-y-auto flex flex-col"
            >
              <div className="p-6 border-b border-brand-border dark:border-dark-border flex items-center justify-between sticky top-0 bg-white dark:bg-dark-surface z-10">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Subscription Details</h2>
                <button onClick={() => setDetailItem(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                  <X size={20} className="text-brand-dark dark:text-dark-heading" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl bg-gray-100 dark:bg-gray-800 border border-brand-border dark:border-dark-border flex items-center justify-center text-brand-dark dark:text-dark-heading">
                    <Building2 size={32} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{detailItem.tenant}</h3>
                    <div className="text-sm text-brand-inactive-text dark:text-dark-body">{detailItem.tenantId}</div>
                  </div>
                </div>

                {/* Plan Info */}
                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-brand-border dark:border-dark-border">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="text-xs text-brand-inactive-text dark:text-dark-body uppercase font-bold mb-1">Current Plan</div>
                      <div className="text-lg font-bold text-brand-dark dark:text-dark-heading">{detailItem.plan}</div>
                    </div>
                    {getStatusBadge(detailItem.status)}
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t border-brand-border dark:border-dark-border">
                    <div className="text-sm text-brand-dark dark:text-dark-heading font-medium">
                      {detailItem.amount} <span className="text-brand-inactive-text font-normal">/ {detailItem.billingCycle}</span>
                    </div>
                    <div className="text-xs text-brand-inactive-text dark:text-dark-body flex items-center gap-1">
                      <Clock size={12} /> Renews {detailItem.nextBilling}
                    </div>
                  </div>
                </div>

                {/* Payment Method */}
                <div>
                  <h4 className="font-bold text-brand-dark dark:text-dark-heading mb-3">Payment Method</h4>
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-brand-border dark:border-dark-border">
                    <div className="w-10 h-6 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center text-xs font-bold text-gray-500">
                      CARD
                    </div>
                    <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">{detailItem.paymentMethod}</span>
                  </div>
                </div>

                {/* Invoice History */}
                <div>
                  <h4 className="font-bold text-brand-dark dark:text-dark-heading mb-3">Recent Invoices</h4>
                  <div className="space-y-2">
                    {detailItem.history.length > 0 ? detailItem.history.map((inv: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border border-transparent hover:border-brand-border dark:hover:border-dark-border">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${inv.status === 'Paid' ? 'bg-green-500' : 'bg-red-500'}`} />
                          <div>
                            <div className="text-sm font-medium text-brand-dark dark:text-dark-heading">{inv.date}</div>
                            <div className="text-xs text-brand-inactive-text dark:text-dark-body">{inv.invoice}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{inv.amount}</div>
                          <div className="text-xs text-brand-inactive-text dark:text-dark-body">{inv.status}</div>
                        </div>
                      </div>
                    )) : (
                      <div className="text-sm text-brand-inactive-text dark:text-dark-body italic">No invoice history available.</div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-6 border-t border-brand-border dark:border-dark-border space-y-3">
                  <Button className="w-full justify-center gap-2">
                    <Download size={16} /> Download Statement
                  </Button>
                  <Button variant="outline" className="w-full justify-center gap-2 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/30 dark:hover:bg-red-900/20">
                    Cancel Subscription
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SubscriptionList;
