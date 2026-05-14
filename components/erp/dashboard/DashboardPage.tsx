
import React from 'react';
import {
    Calendar,
    Settings2,
    HelpCircle,
    MoreHorizontal,
    Maximize2,
    ChevronDown,
    Tag,
    DollarSign,
    FileText,
    BarChart2,
    TrendingUp
} from 'lucide-react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    Cell,
    ReferenceLine,
    AreaChart,
    Area
} from 'recharts';
import Button from '@/components/reusable/Button';

const CustomTooltip = ({ active, payload, label, prefix = '', suffix = '' }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white dark:bg-[#18181b] border border-brand-border dark:border-dark-border p-3 rounded-xl shadow-sm min-w-[140px] z-50 relative">
                <p className="text-sm font-bold text-brand-dark dark:text-[#f0f0f0] mb-2 border-b border-brand-border dark:border-dark-border pb-2">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center justify-between gap-4 text-xs mb-1.5 last:mb-0">
                        <div className="flex items-center gap-2">
                            <div
                                className="w-2.5 h-2.5 rounded-[2px]"
                                style={{ backgroundColor: entry.color || entry.fill }}
                            ></div>
                            <span className="font-medium text-brand-inactive-text dark:text-[#a1a1aa] capitalize">
                                {entry.name === 'thisMonth' ? 'This Month' : entry.name === 'lastMonth' ? 'Last Month' : entry.name}
                            </span>
                        </div>
                        <span className="font-bold text-brand-dark dark:text-[#f0f0f0] tabular-nums">
                            {prefix}{entry.value.toLocaleString()}{suffix}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

const DashboardPage = () => {
    // Mock Data
    const revenueData = [
        { name: 'Feb 01', thisMonth: 400, lastMonth: 240 },
        { name: 'Feb 03', thisMonth: 300, lastMonth: 139 },
        { name: 'Feb 05', thisMonth: 200, lastMonth: 580 },
        { name: 'Feb 07', thisMonth: 278, lastMonth: 390 },
        { name: 'Feb 09', thisMonth: 189, lastMonth: 480 },
        { name: 'Feb 11', thisMonth: 239, lastMonth: 380 },
        { name: 'Feb 13', thisMonth: 349, lastMonth: 430 },
        { name: 'Feb 15', thisMonth: 200, lastMonth: 240 },
        { name: 'Feb 17', thisMonth: 278, lastMonth: 139 },
        { name: 'Feb 19', thisMonth: 189, lastMonth: 980 },
        { name: 'Feb 21', thisMonth: 239, lastMonth: 390 },
        { name: 'Feb 23', thisMonth: 349, lastMonth: 480 },
        { name: 'Feb 25', thisMonth: 200, lastMonth: 380 },
        { name: 'Feb 27', thisMonth: 278, lastMonth: 430 },
        { name: 'Feb 28', thisMonth: 189, lastMonth: 240 },
    ];

    const orderValueData = [
        { name: 'Feb 01', value: 600 },
        { name: 'Feb 03', value: 800 },
        { name: 'Feb 05', value: 700 },
        { name: 'Feb 07', value: 1100 },
        { name: 'Feb 09', value: 650 },
        { name: 'Feb 11', value: 800 },
        { name: 'Feb 13', value: 600 },
        { name: 'Feb 15', value: 900 },
        { name: 'Feb 17', value: 850 },
        { name: 'Feb 19', value: 700 },
        { name: 'Feb 21', value: 950 },
        { name: 'Feb 23', value: 1100 },
        { name: 'Feb 25', value: 800 },
        { name: 'Feb 28', value: 900 },
    ];

    const avgSalesData = [
        { name: 'Feb 01', thisMonth: 200, lastMonth: 450 },
        { name: 'Feb 05', thisMonth: 400, lastMonth: 480 },
        { name: 'Feb 10', thisMonth: 300, lastMonth: 650 },
        { name: 'Feb 15', thisMonth: 900, lastMonth: 700 },
        { name: 'Feb 20', thisMonth: 500, lastMonth: 800 },
        { name: 'Feb 25', thisMonth: 800, lastMonth: 500 },
        { name: 'Feb 28', thisMonth: 1150, lastMonth: 850 },
    ];

    const sessionsData = [
        { name: 'Feb 01', thisMonth: 300, lastMonth: 200 },
        { name: 'Feb 03', thisMonth: 500, lastMonth: 400 },
        { name: 'Feb 05', thisMonth: 600, lastMonth: 500 },
        { name: 'Feb 07', thisMonth: 700, lastMonth: 600 },
        { name: 'Feb 09', thisMonth: 900, lastMonth: 750 },
        { name: 'Feb 11', thisMonth: 400, lastMonth: 300 },
        { name: 'Feb 13', thisMonth: 1000, lastMonth: 850 },
        { name: 'Feb 15', thisMonth: 500, lastMonth: 400 },
        { name: 'Feb 17', thisMonth: 200, lastMonth: 150 },
        { name: 'Feb 19', thisMonth: 600, lastMonth: 550 },
        { name: 'Feb 21', thisMonth: 700, lastMonth: 600 },
        { name: 'Feb 23', thisMonth: 800, lastMonth: 700 },
        { name: 'Feb 25', thisMonth: 600, lastMonth: 500 },
        { name: 'Feb 28', thisMonth: 900, lastMonth: 800 },
    ];

    return (
        <div className="p-4 md:p-8 pt-6 max-w-[1700px] mx-auto text-brand-dark dark:text-dark-heading">

            {/* Header */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight flex items-center gap-2">
                        Hey, Fikri <button className="p-1 rounded-full border border-brand-border dark:border-dark-border hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"><ChevronDown size={16} /></button>
                    </h1>
                    <p className="text-brand-inactive-text dark:text-dark-body font-medium">Monday, 24 February 2024</p>
                </div>

                <div className="flex items-center gap-3">
                    <Button
                        variant="default"
                        className="h-[42px] bg-[#111827] hover:bg-gray-900 text-white border-none"
                        leftIcon={<Calendar size={16} />}
                    >
                        This Month
                    </Button>
                    <Button
                        variant="default"
                        className="h-[42px] bg-[#111827] hover:bg-gray-900 text-white border-none"
                        leftIcon={<Calendar size={16} />}
                    >
                        Compare: Last Month
                    </Button>
                    <Button
                        variant="outline"
                        className="h-[42px]"
                        leftIcon={<Settings2 size={16} />}
                    >
                        Edit Widget
                    </Button>
                </div>
            </div>

            {/* Metrics Row - Unified Card */}
            <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl mb-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 md:gap-0">
                    <MetricItem
                        label="Sales performance"
                        value="$23,127"
                        trend={12}
                        isFirst
                    />
                    <MetricItem
                        label="Total Sales"
                        value="1,849"
                        trend={3}
                    />
                    <MetricItem
                        label="Average Revenue"
                        value="$15,239"
                        trend={8}
                    />
                    <MetricItem
                        label="Average Order"
                        value="2,034"
                        trend={-3}
                        isLast
                    />
                </div>
            </div>

            {/* Middle Row: Revenue Chart & Popular Products */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">

                {/* Total Revenue Chart */}
                <div className="xl:col-span-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-white dark:bg-dark-surface border border-brand-border dark:border-gray-700 text-brand-dark dark:text-dark-heading shadow-sm">
                                <DollarSign size={18} />
                            </div>
                            <h3 className="font-bold text-brand-dark dark:text-dark-heading text-lg">Total Revenue <HelpCircle size={14} className="inline text-brand-inactive-text ml-1" /></h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <button className="text-xs font-bold text-brand-dark dark:text-dark-heading underline decoration-gray-300 dark:decoration-gray-700 underline-offset-4 mr-2">View More</button>
                            <Button variant="outline" className="w-8 h-8 p-0 rounded-lg"><Maximize2 size={14} /></Button>
                            <Button variant="outline" className="w-8 h-8 p-0 rounded-lg"><MoreHorizontal size={14} /></Button>
                        </div>
                    </div>

                    <div className="flex items-baseline gap-4 mb-6">
                        <span className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight">$94,127</span>
                        <span className="text-sm font-bold text-green-600 dark:text-green-400">↑ 9% <span className="text-brand-inactive-text dark:text-dark-body font-medium">vs last month</span></span>

                        <div className="flex items-center gap-4 ml-auto text-xs font-bold">
                            <div className="flex items-center gap-2">
                                {/* Solid Dot */}
                                <div className="w-2.5 h-2.5 rounded-full bg-brand-dark dark:bg-white"></div>
                                <span className="text-brand-dark dark:text-dark-heading">This month</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Hollow Circle */}
                                <div className="w-2.5 h-2.5 rounded-full border-2 border-gray-300 dark:border-gray-500"></div>
                                <span className="text-brand-inactive-text dark:text-dark-body">Last month</span>
                            </div>
                        </div>
                    </div>

                    <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 11, fill: '#9ca3af', fontWeight: 500 }}
                                    dy={10}
                                    interval={2}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 11, fill: '#9ca3af', fontWeight: 500 }}
                                    tickFormatter={(value) => value >= 1000 ? `$${(value / 1000).toFixed(1)}K` : `$${value}`}
                                />
                                <Tooltip content={<CustomTooltip prefix="$" />} cursor={{ stroke: '#e5e7eb', strokeWidth: 1, strokeDasharray: '4 4' }} />
                                <Line
                                    type="monotone"
                                    dataKey="thisMonth"
                                    stroke="#111827"
                                    strokeWidth={3}
                                    dot={false}
                                    activeDot={{ r: 6, fill: "#111827", stroke: "#fff", strokeWidth: 2 }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="lastMonth"
                                    stroke="#d1d5db"
                                    strokeWidth={3}
                                    dot={false}
                                    activeDot={{ r: 6, fill: "#d1d5db", stroke: "#fff", strokeWidth: 2 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Popular Products */}
                <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-white dark:bg-dark-surface border border-brand-border dark:border-gray-700 text-brand-dark dark:text-dark-heading shadow-sm">
                                <Tag size={18} />
                            </div>
                            <h3 className="font-bold text-brand-dark dark:text-dark-heading text-lg">Popular Product <HelpCircle size={14} className="inline text-brand-inactive-text ml-1" /></h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <button className="text-xs font-bold text-brand-dark dark:text-dark-heading underline decoration-gray-300 dark:decoration-gray-700 underline-offset-4 mr-2">View More</button>
                            <Button variant="outline" className="w-8 h-8 p-0 rounded-lg"><Maximize2 size={14} /></Button>
                            <Button variant="outline" className="w-8 h-8 p-0 rounded-lg"><MoreHorizontal size={14} /></Button>
                        </div>
                    </div>

                    {/* Grid Container */}
                    <div className="relative">
                        {/* Vertical Grid Lines */}
                        <div className="absolute inset-0 flex justify-between pointer-events-none pb-6">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="w-px h-full border-r border-dashed border-brand-border dark:border-dark-border"></div>
                            ))}
                        </div>

                        <div className="space-y-7 relative z-10 pb-2">
                            <ProductProgress
                                name="Macbook Air M2 2022 13 Inch"
                                sales="8,172 Sales"
                                percent={100}
                                prevPercent={90}
                                color="bg-[#f97316]"
                            />
                            <ProductProgress
                                name="Macbook Pro 14 Inch 512GB M1 Pro"
                                sales="6,345 Sales"
                                percent={75}
                                prevPercent={45}
                                color="bg-[#c084fc]"
                            />
                            <ProductProgress
                                name="Apple Mac Mini Pro M2 2023"
                                sales="3,287ales"
                                percent={45}
                                prevPercent={65}
                                color="bg-[#3b82f6]"
                            />
                            <ProductProgress
                                name="APPLE 32'' R6KD Pro Display XDR"
                                sales="2,456 Sales"
                                percent={30}
                                prevPercent={40}
                                color="bg-[#10b981]"
                            />
                            <ProductProgress
                                name="Samsung Galaxy Tab S9 Ultra"
                                sales="1,245 Sales"
                                percent={20}
                                prevPercent={25}
                                color="bg-[#f43f5e]"
                            />
                        </div>

                        <div className="flex justify-between text-[10px] font-bold text-brand-inactive-text dark:text-dark-body mt-2 pt-2 relative z-10">
                            <span>0</span>
                            <span>2K</span>
                            <span>4K</span>
                            <span>6K</span>
                            <span>8K</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Row Widgets */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

                {/* Average Order Value */}
                <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                            <span className="p-1 rounded bg-white dark:bg-dark-surface border border-brand-border dark:border-gray-700 shadow-sm"><FileText size={14} /></span>
                            Average Order Value <HelpCircle size={12} className="text-brand-inactive-text" />
                        </h3>
                        <div className="flex gap-2">
                            <Button variant="outline" className="w-8 h-8 p-0 rounded-lg"><Maximize2 size={14} /></Button>
                            <Button variant="outline" className="w-8 h-8 p-0 rounded-lg"><MoreHorizontal size={14} /></Button>
                        </div>
                    </div>

                    <div className="mb-6">
                        <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading inline-block mr-2">$992</span>
                        <span className="text-xs font-bold text-green-600 dark:text-green-400 inline-block">↑ 2.4% <span className="text-brand-inactive-text font-medium">vs last month</span></span>
                    </div>

                    <div className="h-40 relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={orderValueData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }} barGap={2}>
                                <ReferenceLine
                                    y={800}
                                    stroke="#374151"
                                    strokeDasharray="2 2"
                                    strokeWidth={1}
                                />
                                <Tooltip content={<CustomTooltip prefix="$" />} cursor={{ fill: 'transparent' }} />
                                <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={8}>
                                    {orderValueData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill="#f97316" />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                        <div className="absolute top-[32px] left-0 bg-gray-900 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md z-10 shadow-sm">Avg</div>
                    </div>
                    <div className="flex justify-between text-[10px] text-brand-inactive-text dark:text-dark-body font-bold mt-2 border-t border-brand-border dark:border-dark-border pt-2">
                        <span>Feb 01</span>
                        <span>Feb 28</span>
                    </div>
                </div>

                {/* Average Sales */}
                <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                            <span className="p-1 rounded bg-white dark:bg-dark-surface border border-brand-border dark:border-gray-700 shadow-sm"><Tag size={14} /></span>
                            Average Sales <HelpCircle size={12} className="text-brand-inactive-text" />
                        </h3>
                        <div className="flex gap-2">
                            <Button variant="outline" className="w-8 h-8 p-0 rounded-lg"><Maximize2 size={14} /></Button>
                            <Button variant="outline" className="w-8 h-8 p-0 rounded-lg"><MoreHorizontal size={14} /></Button>
                        </div>
                    </div>

                    <div className="mb-6">
                        <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading inline-block mr-2">840</span>
                        <span className="text-xs font-bold text-green-600 dark:text-green-400 inline-block">↑ 1.34% <span className="text-brand-inactive-text font-medium">vs last month</span></span>
                    </div>

                    <div className="flex gap-4 text-[10px] font-bold mb-2">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full border-2 border-[#f97316] flex items-center justify-center">
                                <div className="w-1 h-1 rounded-full bg-[#f97316]"></div>
                            </div>
                            <span className="text-brand-inactive-text dark:text-dark-body">This month</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full border-2 border-[#fdba74]"></div>
                            <span className="text-brand-inactive-text dark:text-dark-body">Last month</span>
                        </div>
                    </div>

                    <div className="h-40">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={avgSalesData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fill: '#9ca3af', fontWeight: 500 }}
                                    tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(1)}K` : `${value}`}
                                />
                                <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#e5e7eb', strokeWidth: 1, strokeDasharray: '4 4' }} />
                                <Line type="monotone" dataKey="thisMonth" stroke="#f97316" strokeWidth={3} dot={false} />
                                <Line type="monotone" dataKey="lastMonth" stroke="#fdba74" strokeWidth={3} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex justify-between text-[10px] text-brand-inactive-text dark:text-dark-body font-bold mt-2 border-t border-brand-border dark:border-dark-border pt-2">
                        <span>Feb 01</span>
                        <span>Feb 28</span>
                    </div>
                </div>

                {/* Total Sessions */}
                <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                            <span className="p-1 rounded bg-white dark:bg-dark-surface border border-brand-border dark:border-gray-700 shadow-sm"><Settings2 size={14} /></span>
                            Total Sessions <HelpCircle size={12} className="text-brand-inactive-text" />
                        </h3>
                        <div className="flex gap-2">
                            <Button variant="outline" className="w-8 h-8 p-0 rounded-lg"><Maximize2 size={14} /></Button>
                            <Button variant="outline" className="w-8 h-8 p-0 rounded-lg"><MoreHorizontal size={14} /></Button>
                        </div>
                    </div>

                    <div className="mb-6">
                        <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading inline-block mr-2">11,240</span>
                        <span className="text-xs font-bold text-green-600 dark:text-green-400 inline-block">↑ 4% <span className="text-brand-inactive-text font-medium">vs last month</span></span>
                    </div>

                    <div className="flex justify-between text-[10px] font-bold text-brand-inactive-text dark:text-dark-body mb-2">
                        <span>User per 2 days</span>
                        <div className="flex gap-3">
                            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-gray-800 dark:bg-white"></div> This month</span>
                            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full border border-gray-400"></div> Last month</span>
                        </div>
                    </div>

                    <div className="h-40">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={sessionsData} barGap={4}>
                                <defs>
                                    <pattern id="pattern-stripe" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                                        <rect width="1.5" height="4" transform="translate(0,0)" fill="#9ca3af" opacity="0.5"></rect>
                                    </pattern>
                                </defs>
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                                <Bar dataKey="thisMonth" fill="#374151" radius={[2, 2, 0, 0]} barSize={6} />
                                <Bar dataKey="lastMonth" fill="url(#pattern-stripe)" radius={[2, 2, 0, 0]} barSize={6} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex justify-between text-[10px] text-brand-inactive-text dark:text-dark-body font-bold mt-2 border-t border-brand-border dark:border-dark-border pt-2">
                        <span>Feb 01</span>
                        <span>Feb 28</span>
                    </div>
                </div>

            </div>
        </div>
    );
};

/* --- Sub Components --- */

const MetricItem = ({ label, value, trend, isFirst, isLast }: { label: string, value: string, trend: number, isFirst?: boolean, isLast?: boolean }) => {
    const isPositive = trend > 0;
    return (
        <div className={`
      flex flex-col justify-start h-full
      ${!isLast ? 'md:border-r border-brand-border dark:border-dark-border md:pr-6' : ''}
      ${!isFirst ? 'md:pl-6' : ''}
    `}>
            <span className="block text-sm font-bold text-brand-inactive-text dark:text-dark-body mb-2">{label}</span>
            <div className="flex items-center gap-2">
                <span className="text-[22px] font-bold text-brand-dark dark:text-dark-heading">{value}</span>
                <div className={`text-[13px] font-bold flex items-center ${isPositive ? 'text-green-500' : 'text-red-500'} align-top`}>
                    {isPositive ? '↑' : '↓'} <span className="ml-0.5">{Math.abs(trend)}%</span> <span className="text-brand-inactive-text text-[10px] font-medium ml-1">vs last month</span>
                </div>
            </div>
        </div>
    );
};

const ProductProgress = ({ name, sales, percent, prevPercent, color }: { name: string, sales: string, percent: number, prevPercent: number, color: string }) => (
    <div>
        <div className="flex justify-between items-end mb-1.5">
            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate pr-4">{name}</span>
            <span className="text-xs text-brand-inactive-text dark:text-dark-body whitespace-nowrap">{sales}</span>
        </div>
        <div className="flex flex-col gap-1">
            <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }}></div>
            </div>
            <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full relative"
                    style={{
                        width: `${prevPercent}%`,
                        backgroundImage: 'repeating-linear-gradient(45deg, #9ca3af 0, #9ca3af 2px, transparent 0, transparent 4px)',
                        backgroundSize: '6px 6px',
                        opacity: 0.3
                    }}
                ></div>
            </div>
        </div>
    </div>
);

export default DashboardPage;
