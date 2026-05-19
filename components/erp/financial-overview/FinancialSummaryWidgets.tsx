"use client";

import React from "react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area,
    LineChart, Line, ResponsiveContainer, Tooltip, PieChart, Pie, Cell,
    RadialBarChart, RadialBar
} from "recharts";
import {
    BankIcon,
    EyeIcon,
    SparklesIcon,
    MoneyIcon,
    TagIcon,
    ChartIcon,
    CreditCardIcon,
    ListIcon,
    ChevronDownIcon,
    ThreeDotsIcon,
} from "@/lib/icons";
import { formatCurrency as brl, cn } from "@/lib/utils";
import { Dropdown, DropdownItem, IconPlaceholder } from "@/components/reusable";
import type { FinancialOverviewData, FinancialOverviewPeriod } from "@/lib/data/financial-overview";

// Premium tooltips formatted as BRL
const CustomLineTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border p-3.5 shadow-lg flex flex-col gap-2 font-sans min-w-[170px]">
                <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{payload[0].payload.name}</p>
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-current shrink-0" style={{ color: entry.stroke || entry.color }} />
                            <span className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body">
                                {entry.name === "bruta" ? "Bruta" : "Líquida"}
                            </span>
                        </div>
                        <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading">
                            {brl(Number(entry.value))}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

const CustomAreaTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border p-3.5 shadow-lg flex flex-col gap-2 font-sans min-w-[170px]">
                <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{payload[0].payload.name}</p>
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-current shrink-0" style={{ color: entry.stroke || entry.color }} />
                            <span className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body">
                                {entry.name === "entrada" ? "Entrada" : "Saída"}
                            </span>
                        </div>
                        <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading">
                            {brl(Number(entry.value))}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

export function TopWidgets({ data }: { data: FinancialOverviewData }) {
    const [projectionPeriod, setProjectionPeriod] = React.useState<"sevenDays" | "thirtyDays">("thirtyDays");
    const currentProjection = projectionPeriod === "sevenDays" ? data.projection.sevenDays : data.projection.thirtyDays;

    const netVal = currentProjection.net;
    const netFormatted = (netVal >= 0 ? "+" : "") + brl(netVal);

    const total = currentProjection.inflow + currentProjection.outflow;
    const inflowPercent = total > 0 ? Math.round((currentProjection.inflow / total) * 100) : 0;
    const outflowPercent = total > 0 ? Math.round((currentProjection.outflow / total) * 100) : 0;
    const netPercent = Math.abs(inflowPercent - outflowPercent);

    const radialData = [
        { name: "Saldo Líquido", value: netPercent || 0.0001, fill: netVal >= 0 ? "var(--brand-green)" : "#cc4745" },
        { name: "Despesas", value: outflowPercent || 0.0001, fill: "#cc4745" },
        { name: "Entradas", value: inflowPercent || 0.0001, fill: "#064e3b" },
    ];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 w-full mb-6">
            {/* Em caixa */}
            <div className="bg-white dark:bg-dark-surface rounded-[24px] border border-brand-border dark:border-dark-border lg:col-span-3 h-full p-6 flex flex-col justify-between">
                <div className="flex justify-between items-start mb-6">
                    <div className="w-14 h-14 rounded-[16px] bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading">
                        <BankIcon className="w-[26px] h-[26px]" />
                    </div>
                    <button className="text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading transition-colors mt-2">
                        <ThreeDotsIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex flex-col mt-auto">
                    <div className="flex items-center space-x-1 bg-brand-green-light dark:bg-dark-border/40 text-brand-green px-2 py-0.5 rounded-md w-fit mb-4">
                        <span className="text-[12px] font-bold">Saldo Ativo</span>
                    </div>
                    <h2 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none mb-2 mt-1">
                        {brl(data.totals.cash)}
                    </h2>
                    <div className="text-[15px] font-semibold text-brand-inactive-text dark:text-dark-body">Em caixa</div>
                </div>
            </div>

            {/* A receber e Despesas (Standard dashboard layout matching LeftColumn.tsx) */}
            <div className="flex flex-col gap-4 lg:gap-6 lg:col-span-3">
                <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col justify-between flex-1">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-green">
                                <MoneyIcon size={18} className="text-brand-green" />
                            </div>
                            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">A receber</span>
                        </div>
                    </div>

                    <div className="flex items-baseline space-x-2 mt-2">
                        <h2 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            {brl(data.totals.receivable)}
                        </h2>
                    </div>
                </div>

                <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col justify-between flex-1">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full bg-[#fce6e5] dark:bg-dark-border/40 flex items-center justify-center text-[#cc4745]">
                                <CreditCardIcon size={18} className="text-[#cc4745]" />
                            </div>
                            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">Despesas</span>
                        </div>
                    </div>

                    <div className="flex items-baseline space-x-2 mt-2">
                        <h2 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            {brl(data.totals.payable)}
                        </h2>
                    </div>
                </div>
            </div>

            {/* Projeção de receita (Premium RadialBarChart layout matching the requested concentric rings style) */}
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col lg:col-span-6 h-full">
                <div className="flex items-center justify-between mb-4 w-full">
                    <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Projeção de receita</h3>
                    <Dropdown
                        trigger={
                            <button className="flex items-center space-x-2 text-[13px] font-bold text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border rounded-full px-4 py-2 hover:bg-brand-green-light dark:hover:bg-dark-border/40 transition-colors">
                                <span>{projectionPeriod === "sevenDays" ? "Últimos 7 Dias" : "Este Mês"}</span>
                                <ChevronDownIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                            </button>
                        }
                    >
                        <DropdownItem onClick={() => setProjectionPeriod("sevenDays")}>Últimos 7 Dias</DropdownItem>
                        <DropdownItem onClick={() => setProjectionPeriod("thirtyDays")}>Este Mês</DropdownItem>
                    </Dropdown>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center flex-1">
                    {/* Radial Bar Chart with Net Value in center */}
                    <div className="relative w-full h-[180px] flex items-center justify-center">
                        {/* Center value overlay */}
                        <div className="absolute flex flex-col items-center justify-center pointer-events-none mt-1 inset-0">
                            <span className="text-[11px] font-semibold text-brand-inactive-text dark:text-dark-body">Saldo Líquido</span>
                            <span className={cn("text-[17px] font-bold tracking-tight", netVal >= 0 ? "text-brand-green" : "text-[#cc4745]")}>
                                {netFormatted}
                            </span>
                        </div>

                        <ResponsiveContainer width="100%" height="100%">
                            <RadialBarChart
                                cx="50%"
                                cy="50%"
                                innerRadius="35%"
                                outerRadius="100%"
                                barSize={8}
                                data={radialData}
                                startAngle={90}
                                endAngle={-270}
                            >
                                <RadialBar
                                    background={{ fill: "currentColor", className: "text-brand-green-light/10 dark:text-dark-border/10" }}
                                    dataKey="value"
                                    cornerRadius={10}
                                />
                            </RadialBarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Legend breakdown on the right with inline dots */}
                    <div className="flex flex-col gap-4 justify-center pr-2">
                        {/* Entradas */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-3.5 h-3.5 rounded bg-[#064e3b] shrink-0" />
                                <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading leading-none">
                                    Entradas <span className="text-brand-inactive-text dark:text-dark-body font-medium mx-1.5">•</span> {brl(currentProjection.inflow)}
                                </span>
                            </div>
                            <div className="bg-[#f4f4f5] dark:bg-dark-border/40 text-brand-dark dark:text-dark-heading px-3 py-1.5 rounded-lg text-[13px] font-bold">
                                {inflowPercent}%
                            </div>
                        </div>

                        {/* Despesas */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-3.5 h-3.5 rounded bg-[#cc4745] shrink-0" />
                                <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading leading-none">
                                    Despesas <span className="text-brand-inactive-text dark:text-dark-body font-medium mx-1.5">•</span> {brl(currentProjection.outflow)}
                                </span>
                            </div>
                            <div className="bg-[#f4f4f5] dark:bg-dark-border/40 text-brand-dark dark:text-dark-heading px-3 py-1.5 rounded-lg text-[13px] font-bold">
                                {outflowPercent}%
                            </div>
                        </div>

                        {/* Saldo Líquido */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={cn("w-3.5 h-3.5 rounded shrink-0", netVal >= 0 ? "bg-brand-green" : "bg-[#cc4745]")} />
                                <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading leading-none">
                                    Saldo Líq. <span className="text-brand-inactive-text dark:text-dark-body font-medium mx-1.5">•</span> {brl(Math.abs(netVal))}
                                </span>
                            </div>
                            <div className="bg-[#f4f4f5] dark:bg-dark-border/40 text-brand-dark dark:text-dark-heading px-3 py-1.5 rounded-lg text-[13px] font-bold">
                                {netPercent}%
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function MainCharts({ data }: { data: FinancialOverviewData }) {
    const [revenuePeriod, setRevenuePeriod] = React.useState<FinancialOverviewPeriod>("monthly");
    const [cashflowPeriod, setCashflowPeriod] = React.useState<FinancialOverviewPeriod>("monthly");

    const lineData = (data.revenueEvolution[revenuePeriod] || []).map(item => ({
        name: item.label,
        bruta: item.gross,
        liquida: item.net
    }));

    const fluxoData = (data.cashflow[cashflowPeriod] || []).map(item => ({
        name: item.label,
        entrada: item.entrada,
        saida: item.saida
    }));

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 w-full mb-6">
            {/* Evolução da Receita */}
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col h-full min-h-[350px]">
                <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
                    <div className="flex items-center gap-3">
                        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Evolução da Receita</h3>
                    </div>

                    <div className="flex items-center space-x-6">
                        <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 rounded-sm bg-brand-green"></div>
                            <span className="text-[13px] font-bold text-brand-inactive-text dark:text-dark-body hidden sm:block">Bruta</span>
                        </div>
                        <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 rounded-sm bg-brand-dark dark:bg-dark-border"></div>
                            <span className="text-[13px] font-bold text-brand-inactive-text dark:text-dark-body hidden sm:block">Líquida</span>
                        </div>
                        <Dropdown
                            trigger={
                                <button className="flex items-center space-x-2 text-[13px] font-bold text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border rounded-full px-4 py-2 hover:bg-brand-green-light dark:hover:bg-dark-border/40 transition-colors ml-2 sm:ml-4">
                                    <span>{revenuePeriod === "daily" ? "Diário" : revenuePeriod === "weekly" ? "Semanal" : "Mensal"}</span>
                                    <ChevronDownIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                                </button>
                            }
                        >
                            <DropdownItem onClick={() => setRevenuePeriod("daily")}>Diário</DropdownItem>
                            <DropdownItem onClick={() => setRevenuePeriod("weekly")}>Semanal</DropdownItem>
                            <DropdownItem onClick={() => setRevenuePeriod("monthly")}>Mensal</DropdownItem>
                        </Dropdown>
                    </div>
                </div>

                <div className="h-[250px] w-full mt-auto">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={lineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-brand-border dark:text-dark-border" />
                            <XAxis dataKey="name" hide />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'currentColor', className: 'text-brand-inactive-text dark:text-dark-body text-[11px] font-medium' }}
                                dx={-10}
                            />
                            <Tooltip content={<CustomLineTooltip />} />
                            <Line type="monotone" dataKey="bruta" stroke="var(--brand-green)" strokeWidth={3} dot={{ r: 4, fill: 'var(--brand-green)', strokeWidth: 2, stroke: '#fff' }} />
                            <Line type="monotone" dataKey="liquida" stroke="var(--brand-dark)" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 4, fill: 'var(--brand-dark)', strokeWidth: 2, stroke: '#fff' }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Fluxo de Caixa */}
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col h-full min-h-[350px]">
                <div className="flex justify-between items-center mb-8">
                    <div className="flex items-center gap-3">
                        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Fluxo de caixa</h3>
                    </div>

                    <div className="flex items-center space-x-6">
                        <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 rounded-sm bg-brand-green"></div>
                            <span className="text-[13px] font-bold text-brand-inactive-text dark:text-dark-body hidden sm:block">Entrada</span>
                        </div>
                        <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 rounded-sm bg-[#cc4745]"></div>
                            <span className="text-[13px] font-bold text-brand-inactive-text dark:text-dark-body hidden sm:block">Saída</span>
                        </div>
                        <Dropdown
                            trigger={
                                <button className="flex items-center space-x-2 text-[13px] font-bold text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border rounded-full px-4 py-2 hover:bg-brand-green-light dark:hover:bg-dark-border/40 transition-colors ml-2 sm:ml-4">
                                    <span>{cashflowPeriod === "daily" ? "Diário" : cashflowPeriod === "weekly" ? "Semanal" : "Mensal"}</span>
                                    <ChevronDownIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                                </button>
                            }
                        >
                            <DropdownItem onClick={() => setCashflowPeriod("daily")}>Diário</DropdownItem>
                            <DropdownItem onClick={() => setCashflowPeriod("weekly")}>Semanal</DropdownItem>
                            <DropdownItem onClick={() => setCashflowPeriod("monthly")}>Mensal</DropdownItem>
                        </Dropdown>
                    </div>
                </div>
                <div className="h-[220px] w-full mt-auto">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={fluxoData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorEntrada" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--brand-green)" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="var(--brand-green)" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorSaida" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#cc4745" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#cc4745" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-brand-border dark:text-dark-border" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'currentColor', className: 'text-brand-inactive-text dark:text-dark-body text-[11px] font-medium' }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: 'currentColor', className: 'text-brand-inactive-text dark:text-dark-body text-[11px] font-medium' }} dx={-10} />
                            <Tooltip content={<CustomAreaTooltip />} />
                            <Area type="monotone" dataKey="entrada" stroke="var(--brand-green)" fill="url(#colorEntrada)" strokeWidth={3} />
                            <Area type="monotone" dataKey="saida" stroke="#cc4745" fill="url(#colorSaida)" strokeWidth={3} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}

export function BottomWidgets({ data }: { data: FinancialOverviewData }) {
    const movs = data.latestMovements || [];
    const vencidas = data.dueAccounts || [];

    const distributionTotal = data.revenueDistribution.reduce((acc, item) => acc + item.value, 0);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 w-full h-full mb-6">
            {/* Distribuição da Receita */}
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col h-full min-h-[400px]">
                <div className="flex items-center gap-3 mb-6">
                    <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Distribuição da Receita</h3>
                </div>

                <div className="flex justify-between items-end mb-8">
                    <div>
                        <div className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body mb-1">Total período</div>
                        <div className="flex items-baseline space-x-1">
                            <span className="text-[14px] font-semibold text-brand-inactive-text dark:text-dark-body">R$</span>
                            <span className="text-[28px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                {distributionTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                </div>

                {data.revenueDistribution.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center h-full my-auto">
                        <IconPlaceholder icon={ChartIcon} />
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-2">Nenhuma atividade registrada.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {data.revenueDistribution.map((item, index) => (
                            <div key={index}>
                                <div className="flex justify-between text-[13px] font-bold mb-3">
                                    <span className="text-brand-dark dark:text-dark-heading">{item.label}</span>
                                    <div className="flex space-x-4">
                                        <span className="text-brand-inactive-text dark:text-dark-body">{item.percentage}%</span>
                                        <span className="text-brand-dark dark:text-dark-heading">{brl(item.value)}</span>
                                    </div>
                                </div>
                                <div className="w-full bg-brand-green-light dark:bg-dark-border h-[6px] rounded-full overflow-hidden">
                                    <div className="bg-brand-green h-full rounded-full" style={{ width: `${item.percentage}%` }}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Contas vencidas */}
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col h-full min-h-[400px]">
                <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
                    <div className="flex items-center gap-3">
                        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Contas vencidas</h3>
                    </div>
                </div>

                {vencidas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center h-full my-auto">
                        <IconPlaceholder icon={CreditCardIcon} />
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-2">Nenhuma atividade registrada recentemente.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left whitespace-nowrap">
                            <tbody>
                                {vencidas.map((m, i) => (
                                    <tr key={i} className="border-b border-brand-border dark:border-dark-border last:border-b-0 h-[70px]">
                                        <td className="pl-2">
                                            <div className="text-[15px] font-bold text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[150px]">{m.description}</div>
                                            <div className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                                {m.direction === "in" ? "A receber" : "A pagar"}
                                            </div>
                                        </td>
                                        <td className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body w-[60px] text-center">
                                            {new Date(m.dueDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                                        </td>
                                        <td className={cn("text-[15px] font-bold w-[100px] text-right pr-2", m.direction === "in" ? "text-brand-green" : "text-[#cc4745]")}>
                                            {m.direction === "in" ? "+" : "-"}{brl(m.value)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Últimas movimentações */}
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col h-full min-h-[400px]">
                <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
                    <div className="flex items-center gap-3">
                        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Últimas movimentações</h3>
                    </div>
                </div>

                {movs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center h-full my-auto">
                        <IconPlaceholder icon={ListIcon} />
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-2">Nenhuma atividade registrada recentemente.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left whitespace-nowrap">
                            <tbody>
                                {movs.map((m, i) => (
                                    <tr key={i} className="border-b border-brand-border dark:border-dark-border last:border-b-0 h-[70px]">
                                        <td className="pl-2">
                                            <div className="text-[15px] font-bold text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[150px]">{m.description}</div>
                                            <div className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">{m.accountName}</div>
                                        </td>
                                        <td className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body w-[60px] text-center">
                                            {new Date(m.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                                        </td>
                                        <td className={cn("text-[15px] font-bold w-[100px] text-right pr-2", m.direction === "in" ? "text-brand-green" : "text-[#cc4745]")}>
                                            {m.direction === "in" ? "+" : "-"}{brl(m.value)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
