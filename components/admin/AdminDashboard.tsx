import React from 'react';
import {
    ShieldAlert,
    Users,
    DollarSign,
    Activity,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Clock,
    ArrowRight
} from 'lucide-react';
import { Badge } from '@/components/reusable/Badge';
import Button from '@/components/reusable/Button';
import type { AdminDashboardStats } from '@/lib/admin/types';

interface AdminDashboardProps {
    stats?: AdminDashboardStats | null;
}

const AdminDashboard = ({ stats: serverStats }: AdminDashboardProps) => {
    const stats = [
        {
            label: 'Pending Moderation',
            value: serverStats ? String(serverStats.pendingModeration) : '0',
            change: '+12%',
            trend: 'up',
            icon: ShieldAlert,
            color: 'text-yellow-600 dark:text-yellow-400',
            bg: 'bg-yellow-50 dark:bg-yellow-900/20',
            border: 'border-yellow-200 dark:border-yellow-900/30'
        },
        {
            label: 'Banned Users',
            value: serverStats ? String(serverStats.bannedUsers) : '0',
            change: '+2',
            trend: 'up',
            icon: Users,
            color: 'text-red-600 dark:text-red-400',
            bg: 'bg-red-50 dark:bg-red-900/20',
            border: 'border-red-200 dark:border-red-900/30'
        },
        {
            label: 'Active Subscriptions',
            value: serverStats ? String(serverStats.activeSubscriptions) : '0',
            change: '+5%',
            trend: 'up',
            icon: DollarSign,
            color: 'text-green-600 dark:text-green-400',
            bg: 'bg-green-50 dark:bg-green-900/20',
            border: 'border-green-200 dark:border-green-900/30'
        },
        {
            label: 'Failed Jobs',
            value: '3',
            change: '-1',
            trend: 'down',
            icon: Activity,
            color: 'text-brand-orange dark:text-orange-400',
            bg: 'bg-orange-50 dark:bg-orange-900/20',
            border: 'border-orange-200 dark:border-orange-900/30'
        }
    ];

    const recentActivity = [
        {
            id: 1,
            type: 'ban',
            user: 'admin@fikri.com',
            target: 'User ID: 9921',
            reason: 'Violation of terms (Fraud)',
            time: '10 mins ago',
            icon: XCircle,
            iconColor: 'text-brand-red'
        },
        {
            id: 2,
            type: 'moderation',
            user: 'system_ai',
            target: 'Product: "Rolex Replica"',
            reason: 'Auto-rejected (Counterfeit)',
            time: '45 mins ago',
            icon: ShieldAlert,
            iconColor: 'text-yellow-500'
        },
        {
            id: 3,
            type: 'subscription',
            user: 'billing_sys',
            target: 'Tenant: Fikri Store',
            reason: 'Subscription renewed (Pro)',
            time: '2 hours ago',
            icon: CheckCircle2,
            iconColor: 'text-green-500'
        },
        {
            id: 4,
            type: 'warning',
            user: 'admin@fikri.com',
            target: 'Partner: TechCorp',
            reason: 'Suspended (Payment Overdue)',
            time: '5 hours ago',
            icon: AlertTriangle,
            iconColor: 'text-brand-orange'
        }
    ];

    return (
        <div className="p-6 md:p-8 max-w-[1700px] mx-auto space-y-8">

            {/* Header */}
            <div>
                <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none mb-2">System Overview</h1>
                <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">High-level metrics and recent administrative actions.</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                {stats.map((stat, index) => {
                    const Icon = stat.icon;
                    return (
                        <div
                            key={index}
                            className={`bg-white dark:bg-dark-surface rounded-2xl p-6 border ${stat.border} transition-all`}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className={`w-10 h-10 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center`}>
                                    <Icon size={20} />
                                </div>
                                <Badge variant={stat.trend === 'up' ? (stat.color.includes('red') ? 'red' : 'green') : 'gray'}>
                                    {stat.change}
                                </Badge>
                            </div>
                            <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">{stat.label}</h3>
                            <p className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{stat.value}</p>
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Main Content Area (Left) */}
                <div className="lg:col-span-2 space-y-8">

                    {/* Action Required Section */}
                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-red-200 dark:border-red-900/30 overflow-hidden">
                        <div className="bg-red-50 dark:bg-red-900/10 px-6 py-4 border-b border-red-100 dark:border-red-900/20 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-bold">
                                <AlertTriangle size={18} />
                                Requires Immediate Attention
                            </div>
                            <Badge variant="red">3 Items</Badge>
                        </div>
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {[1, 2, 3].map((item) => (
                                <div key={item} className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 text-brand-orange dark:text-orange-400 flex items-center justify-center shrink-0 mt-0.5">
                                            <ShieldAlert size={16} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading">High-Risk Moderation Flag</h4>
                                            <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">
                                                AI detected potential illegal content in Product ID: PRD-{9000 + item}. Confidence: 98%.
                                            </p>
                                        </div>
                                    </div>
                                    <Button variant="outline" className="text-sm shrink-0 border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                                        Review Now
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* System Health */}
                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
                        <div className="px-6 py-4 border-b border-brand-border dark:border-dark-border flex items-center justify-between">
                            <h3 className="font-bold text-brand-dark dark:text-dark-heading">System Health</h3>
                            <Button variant="ghost" className="text-sm">View All Checks</Button>
                        </div>
                        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="p-4 rounded-xl border border-green-200 dark:border-green-900/30 bg-green-50/50 dark:bg-green-900/10">
                                <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-bold mb-2">
                                    <CheckCircle2 size={16} /> API Gateway
                                </div>
                                <div className="text-2xl font-bold text-brand-dark dark:text-dark-heading">99.99%</div>
                                <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">Uptime (30d)</div>
                            </div>
                            <div className="p-4 rounded-xl border border-green-200 dark:border-green-900/30 bg-green-50/50 dark:bg-green-900/10">
                                <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-bold mb-2">
                                    <CheckCircle2 size={16} /> Database
                                </div>
                                <div className="text-2xl font-bold text-brand-dark dark:text-dark-heading">12ms</div>
                                <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">Avg Latency</div>
                            </div>
                            <div className="p-4 rounded-xl border border-yellow-200 dark:border-yellow-900/30 bg-yellow-50/50 dark:bg-yellow-900/10">
                                <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400 font-bold mb-2">
                                    <Activity size={16} /> Worker Queue
                                </div>
                                <div className="text-2xl font-bold text-brand-dark dark:text-dark-heading">1,204</div>
                                <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">Pending Jobs (Elevated)</div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Sidebar (Right) */}
                <div className="space-y-8">

                    {/* Recent Activity Feed */}
                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
                        <div className="px-6 py-4 border-b border-brand-border dark:border-dark-border flex items-center justify-between">
                            <h3 className="font-bold text-brand-dark dark:text-dark-heading">Recent Admin Activity</h3>
                        </div>
                        <div className="p-6">
                            <div className="relative border-l border-brand-border dark:border-dark-border ml-3 space-y-6">
                                {recentActivity.map((activity) => {
                                    const Icon = activity.icon;
                                    return (
                                        <div key={activity.id} className="relative pl-6">
                                            <div className={`absolute -left-[13px] top-1 w-6 h-6 rounded-full bg-white dark:bg-dark-surface border-2 border-brand-border dark:border-dark-border flex items-center justify-center`}>
                                                <Icon size={12} className={activity.iconColor} />
                                            </div>
                                            <div>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs font-bold text-brand-dark dark:text-dark-heading">{activity.user}</span>
                                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body flex items-center gap-1"><Clock size={10} /> {activity.time}</span>
                                                </div>
                                                <p className="text-sm text-gray-600 dark:text-gray-300">
                                                    Action on <span className="font-medium text-brand-dark dark:text-dark-heading">{activity.target}</span>
                                                </p>
                                                <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1 bg-gray-50 dark:bg-gray-900 p-2 rounded border border-gray-100 dark:border-gray-800">
                                                    {activity.reason}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <Button variant="ghost" className="w-full mt-6 text-sm flex items-center justify-center gap-2">
                                View Full Audit Log <ArrowRight size={14} />
                            </Button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
