"use client";

import React from "react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area,
    ResponsiveContainer, Tooltip
} from "recharts";
import {
    BankIcon,
    MoneyIcon,
    ChartIcon,
    CreditCardIcon,
    ListIcon,
    ChevronDownIcon,
    ThreeDotsIcon,
} from "@/lib/icons";
import { formatCurrency as brl, cn } from "@/lib/utils";
import { Dropdown, DropdownItem, Button, IconPlaceholder } from "@/components/reusable";
import type { FinancialOverviewData, FinancialOverviewPeriod } from "@/lib/data/financial-overview";
import { DashboardPieChart } from "@/components/erp/dashboard/charts/DashboardCharts";
import { useRouter } from "next/navigation";

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

const CustomBarTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        const entry = payload[0];
        return (
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border p-3.5 shadow-lg flex flex-col gap-2 font-sans min-w-[170px]">
                <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{entry.payload.label}</p>
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-current shrink-0 text-brand-green" />
                        <span className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body">
                            Receita
                        </span>
                    </div>
                    <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading">
                        {brl(Number(entry.value))}
                    </span>
                </div>
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

    const pieData = [
        { label: "Entradas", value: currentProjection.inflow || 0, fill: "#059669" },
        { label: "Despesas", value: currentProjection.outflow || 0, fill: "#cc4745" },
    ];

    return (
        <>
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
            <div className="flex flex-col gap-6 lg:col-span-3">
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

            {/* Projeção de receita (PieChart matching ExpenseBreakdown layout and style) */}
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col lg:col-span-6 h-full">
                <div className="flex items-center justify-between mb-8 w-full">
                    <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Projeção de receita</h3>
                    <Dropdown
                        trigger={
                            <button className="flex items-center space-x-2 text-[13px] font-bold text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border rounded-full px-4 py-2 hover:bg-brand-green-light dark:hover:bg-dark-border transition-colors">
                                <span>{projectionPeriod === "sevenDays" ? "Últimos 7 Dias" : "Este Mês"}</span>
                                <ChevronDownIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                            </button>
                        }
                    >
                        <DropdownItem onClick={() => setProjectionPeriod("sevenDays")}>Últimos 7 Dias</DropdownItem>
                        <DropdownItem onClick={() => setProjectionPeriod("thirtyDays")}>Este Mês</DropdownItem>
                    </Dropdown>
                </div>

                <div className="flex flex-col sm:flex-row items-center sm:items-center gap-8 sm:gap-12 flex-1">
                    {/* Donut Chart with Net Value in center */}
                    <div className="w-full max-w-[300px] mx-auto shrink-0 flex items-center justify-center">
                        <DashboardPieChart
                            data={pieData}
                            totalValue={netFormatted}
                            totalLabel="Saldo Líquido"
                            innerRadius={68}
                            outerRadius={92}
                            className="h-[220px]"
                        />
                    </div>

                    {/* Legend breakdown on the right with inline dots */}
                    <div className="flex flex-col flex-1 w-full justify-center">
                        <div className="space-y-3 w-full pr-2">
                            {/* Entradas */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className="w-[14px] h-[14px] rounded-[4px] bg-[#059669] shrink-0" />
                                    <span className="text-[15px] font-medium text-brand-dark dark:text-dark-heading leading-none">
                                        Entradas <span className="text-brand-inactive-text dark:text-dark-body font-medium mx-1.5">•</span> {brl(currentProjection.inflow)}
                                    </span>
                                </div>
                                <div className="text-xs font-bold text-brand-dark dark:text-dark-heading bg-brand-green-light dark:bg-dark-border/40 px-2 py-1 rounded-full border border-brand-border dark:border-dark-border">
                                    {inflowPercent}%
                                </div>
                            </div>

                            {/* Despesas */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className="w-[14px] h-[14px] rounded-[4px] bg-[#cc4745] shrink-0" />
                                    <span className="text-[15px] font-medium text-brand-dark dark:text-dark-heading leading-none">
                                        Despesas <span className="text-brand-inactive-text dark:text-dark-body font-medium mx-1.5">•</span> {brl(currentProjection.outflow)}
                                    </span>
                                </div>
                                <div className="text-xs font-bold text-brand-dark dark:text-dark-heading bg-brand-green-light dark:bg-dark-border/40 px-2 py-1 rounded-full border border-brand-border dark:border-dark-border">
                                    {outflowPercent}%
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export function MainCharts({ data }: { data: FinancialOverviewData }) {
    const [cashflowPeriod, setCashflowPeriod] = React.useState<FinancialOverviewPeriod>("monthly");

    const fluxoData = (data.cashflow[cashflowPeriod] || []).map(item => ({
        name: item.label,
        entrada: item.entrada,
        saida: item.saida
    }));

    return (
        <>
            {/* Distribuição da Receita (Bar chart) */}
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col h-full min-h-[350px] lg:col-span-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Distribuição da Receita</h3>
                </div>

                <div className="h-[250px] w-full mt-auto">
                    {data.revenueDistribution.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center h-full my-auto">
                            <IconPlaceholder icon={ChartIcon} />
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-2">Nenhuma atividade registrada.</p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.revenueDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-brand-border dark:text-dark-border" />
                                <XAxis 
                                    dataKey="label" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: 'currentColor', className: 'text-brand-inactive-text dark:text-dark-body text-[11px] font-medium' }} 
                                    dy={10} 
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(val) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(val)}
                                    tick={{ fill: 'currentColor', className: 'text-brand-inactive-text dark:text-dark-body text-[11px] font-medium' }}
                                    dx={-10}
                                />
                                <Tooltip content={<CustomBarTooltip />} />
                                <Bar dataKey="value" fill="var(--brand-green)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* Fluxo de Caixa */}
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col h-full min-h-[350px] lg:col-span-6">
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
                                <button className="flex items-center space-x-2 text-[13px] font-bold text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border rounded-full px-4 py-2 hover:bg-brand-green-light dark:hover:bg-dark-border transition-colors ml-2 sm:ml-4">
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
        </>
    );
}

function getDueStatusText(item: { dueKind: "overdue" | "today" | "soon"; daysUntilDue: number; dueDate: string }) {
    if (item.dueKind === "overdue") {
        const days = Math.abs(item.daysUntilDue);
        return `Atrasado há ${days} dia${days > 1 ? "s" : ""}`;
    }
    if (item.dueKind === "today") {
        return "Vence hoje";
    }
    return `Vence em ${item.daysUntilDue} dia${item.daysUntilDue > 1 ? "s" : ""}`;
}

export function BottomWidgets({ data }: { data: FinancialOverviewData }) {
    const router = useRouter();
    const receivables = (data.dueAccounts || []).filter(item => item.direction === "in").slice(0, 6);
    const payables = (data.dueAccounts || []).filter(item => item.direction === "out").slice(0, 6);

    const sortedMovs = [...(data.latestMovements || [])].slice(0, 6);
    const movGroups: Record<string, any[]> = {};
    for (const m of sortedMovs) {
        const ymd = m.date; // already YYYY-MM-DD
        if (!movGroups[ymd]) {
            movGroups[ymd] = [];
        }
        movGroups[ymd].push(m);
    }

    const dNow = new Date();
    const today = `${dNow.getFullYear()}-${String(dNow.getMonth() + 1).padStart(2, "0")}-${String(dNow.getDate()).padStart(2, "0")}`;
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const yesterday = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, "0")}-${String(yest.getDate()).padStart(2, "0")}`;

    const groupedMovements = Object.keys(movGroups)
        .sort((a, b) => b.localeCompare(a))
        .map(ymd => {
            let title = "";
            if (ymd === today) {
                title = "Hoje";
            } else if (ymd === yesterday) {
                title = "Ontem";
            } else {
                const [y, m, dayVal] = ymd.split("-").map(Number);
                const dateObj = new Date(y, m - 1, dayVal);
                title = dateObj.toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
            }
            return {
                title,
                items: movGroups[ymd]
            };
        });

    return (
        <>
            {/* Contas a Receber */}
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col h-full min-h-[400px] lg:col-span-4">
                <div className="flex items-center gap-3 mb-6">
                    <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Contas a Receber</h3>
                </div>

                {receivables.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center h-full my-auto">
                        <IconPlaceholder icon={MoneyIcon} />
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-2">Nenhuma conta a receber pendente.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto flex-1">
                        <table className="w-full text-left whitespace-nowrap">
                            <tbody>
                                {receivables.map((m) => (
                                    <tr key={m.id} className="border-b border-brand-border dark:border-dark-border last:border-b-0 h-[80px]">
                                        <td className="pl-2 py-3">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-green shrink-0">
                                                    <MoneyIcon size={18} className="text-brand-green" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-[15px] font-bold text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[110px] sm:max-w-[130px]" title={m.description}>
                                                        {m.description}
                                                    </div>
                                                    <div className={cn("text-[13px] font-medium truncate", m.dueKind === "overdue" ? "text-[#cc4745]" : "text-brand-inactive-text dark:text-dark-body")}>
                                                        {getDueStatusText(m)}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-right px-2 py-3">
                                            <span className="text-[15px] font-bold text-brand-dark dark:text-dark-heading">
                                                {brl(m.value)}
                                            </span>
                                        </td>
                                        <td className="text-right pr-2 py-3 w-[80px]">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-[12px] font-bold py-1 px-3 whitespace-nowrap h-auto"
                                                onClick={() => router.push("/erp/transactions")}
                                            >
                                                Resolver
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Contas a Vencer/Vencidas */}
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col h-full min-h-[400px] lg:col-span-4">
                <div className="flex items-center gap-3 mb-6">
                    <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Contas a Vencer/Vencidas</h3>
                </div>

                {payables.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center h-full my-auto">
                        <IconPlaceholder icon={CreditCardIcon} />
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-2">Nenhuma conta a pagar pendente.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto flex-1">
                        <table className="w-full text-left whitespace-nowrap">
                            <tbody>
                                {payables.map((m) => (
                                    <tr key={m.id} className="border-b border-brand-border dark:border-dark-border last:border-b-0 h-[80px]">
                                        <td className="pl-2 py-3">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-[#fce6e5] dark:bg-dark-border/40 flex items-center justify-center text-[#cc4745] shrink-0">
                                                    <CreditCardIcon size={18} className="text-[#cc4745]" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-[15px] font-bold text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[110px] sm:max-w-[130px]" title={m.description}>
                                                        {m.description}
                                                    </div>
                                                    <div className={cn("text-[13px] font-medium truncate", m.dueKind === "overdue" ? "text-[#cc4745]" : "text-brand-inactive-text dark:text-dark-body")}>
                                                        {getDueStatusText(m)}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-right px-2 py-3">
                                            <span className="text-[15px] font-bold text-brand-dark dark:text-dark-heading">
                                                {brl(m.value)}
                                            </span>
                                        </td>
                                        <td className="text-right pr-2 py-3 w-[80px]">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-[12px] font-bold py-1 px-3 whitespace-nowrap h-auto"
                                                onClick={() => router.push("/erp/transactions")}
                                            >
                                                Resolver
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Últimas movimentações (Timeline style) */}
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col h-full min-h-[400px] lg:col-span-4">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Últimas movimentações</h3>
                    <button className="text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading flex items-center justify-center">
                        <ThreeDotsIcon className="w-5 h-5" />
                    </button>
                </div>

                {groupedMovements.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center h-full my-auto">
                        <IconPlaceholder icon={ListIcon} />
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-2">Nenhuma movimentação registrada recentemente.</p>
                    </div>
                ) : (
                    <div className="space-y-8 overflow-y-auto flex-1 custom-scrollbar">
                        {groupedMovements.map((group) => (
                            <div key={group.title}>
                                <div className="text-[15px] font-bold text-brand-dark dark:text-dark-heading mb-5">{group.title}</div>
                                <div className="space-y-6 relative">
                                    {/* Timeline Line */}
                                    {group.items.length > 1 && (
                                        <div className="absolute left-[15px] top-4 bottom-[-16px] w-[2px] bg-brand-green-light dark:bg-dark-border/40 z-0" />
                                    )}

                                    {group.items.map((m) => {
                                        const ItemIcon = m.direction === "in" ? MoneyIcon : CreditCardIcon;
                                        const iconColor = m.direction === "in" ? "text-brand-green" : "text-[#cc4745]";
                                        const bgColor = m.direction === "in" ? "bg-brand-green-light" : "bg-[#fce6e5]";
                                        return (
                                            <div key={m.id} className="flex relative z-10 w-full justify-between items-center">
                                                <div className="flex items-center min-w-0">
                                                    <div className={cn("w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mr-4 border-[3px] border-white dark:border-dark-surface shadow-[0_0_0_2px_#ffffff] dark:shadow-[0_0_0_2px_rgba(28,28,30,0.5)]", bgColor)}>
                                                        <ItemIcon size={14} className={iconColor} />
                                                    </div>
                                                    <div className="flex flex-col justify-start -mt-0.5 min-w-0">
                                                        <div className="text-[14px] font-bold text-brand-dark dark:text-dark-heading leading-snug truncate max-w-[130px] sm:max-w-[150px]" title={m.description}>
                                                            {m.description}
                                                        </div>
                                                        <div className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body mt-0.5 truncate max-w-[130px] sm:max-w-[150px]">
                                                            {m.accountName}
                                                        </div>
                                                    </div>
                                                </div>
                                                <span className={cn("text-[15px] font-bold text-right pl-4 shrink-0", m.direction === "in" ? "text-brand-green" : "text-[#cc4745]")}>
                                                    {m.direction === "in" ? "+" : "-"}{brl(m.value)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
