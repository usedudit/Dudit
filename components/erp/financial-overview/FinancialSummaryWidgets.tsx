"use client";

import React from "react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area, 
  LineChart, Line, ResponsiveContainer, Tooltip 
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 w-full mb-6">
      {/* Em caixa */}
      <div className="bg-white dark:bg-dark-surface rounded-[24px] border border-brand-border dark:border-dark-border lg:col-span-4 h-full p-6 flex flex-col justify-between">
        <div className="flex justify-between items-start mb-6">
          <div className="w-14 h-14 rounded-[16px] bg-brand-green-second dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading">
            <BankIcon className="w-[26px] h-[26px]" />
          </div>
          <button className="text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading transition-colors mt-2">
            <ThreeDotsIcon className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex flex-col mt-auto">
          <div className="flex items-center space-x-1 bg-brand-green-second dark:bg-dark-border/40 text-brand-green px-2 py-0.5 rounded-md w-fit mb-4">
            <span className="text-[12px] font-bold">Saldo Ativo</span>
          </div>
          <h2 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none mb-2 mt-1">
            {brl(data.totals.cash)}
          </h2>
          <div className="text-[15px] font-semibold text-brand-inactive-text dark:text-dark-body">Em caixa</div>
        </div>
      </div>

      {/* A receber e Despesas */}
      <div className="flex flex-col gap-4 lg:gap-6 lg:col-span-3">
        <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col justify-between flex-1">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">A receber</span>
            <div className="w-8 h-8 rounded-full bg-brand-green-second dark:bg-dark-border/40 flex items-center justify-center text-brand-green shrink-0 ml-2">
              <span className="text-[12px] font-bold">↑</span>
            </div>
          </div>
          <div className="text-[24px] font-bold text-brand-dark dark:text-dark-heading">
            <span className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body mr-1">R$</span>
            {data.totals.receivable.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col justify-between flex-1">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">Despesas</span>
            <div className="w-8 h-8 rounded-full bg-[#fce6e5] dark:bg-dark-border/40 flex items-center justify-center text-[#cc4745] shrink-0 ml-2">
              <span className="text-[12px] font-bold">↓</span>
            </div>
          </div>
          <div className="text-[24px] font-bold text-brand-dark dark:text-dark-heading">
            <span className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body mr-1">R$</span>
            {data.totals.payable.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Projeção de receita */}
      <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col justify-between lg:col-span-5 h-full">
        <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
          <div>
            <div className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body mb-1">Entradas</div>
            <div className="text-[20px] font-bold text-brand-dark dark:text-dark-heading">
              <span className="text-[13px] text-brand-inactive-text dark:text-dark-body mr-1">R$</span>
              {currentProjection.inflow.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
          </div>
          <div>
            <div className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body mb-1">Despesas</div>
            <div className="text-[20px] font-bold text-brand-dark dark:text-dark-heading">
              <span className="text-[13px] text-brand-inactive-text dark:text-dark-body mr-1">R$</span>
              {currentProjection.outflow.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
          </div>
          <div>
            <div className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body mb-1">Saldo líquido</div>
            <div className={cn("text-[20px] font-bold", netVal >= 0 ? "text-brand-green" : "text-[#cc4745]")}>
              {netFormatted}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button className="text-[13px] font-bold text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border rounded-full px-5 py-2.5 hover:bg-brand-green-light dark:hover:bg-dark-border/40 transition-colors">
            Detalhes
          </button>
          <button className="flex items-center space-x-2 text-[13px] font-bold text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border rounded-full px-5 py-2.5 hover:bg-brand-green-light dark:hover:bg-dark-border/40 transition-colors">
            <SparklesIcon className="w-[18px] h-[18px] text-brand-green" />
            <span>Análise financeira</span>
          </button>
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
             <ChartIcon className="w-[20px] h-[20px] text-brand-dark dark:text-dark-heading" />
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
              <Line type="monotone" dataKey="bruta" stroke="var(--brand-green)" strokeWidth={3} dot={{r: 4, fill: 'var(--brand-green)', strokeWidth: 2, stroke: '#fff'}} />
              <Line type="monotone" dataKey="liquida" stroke="var(--brand-dark)" strokeWidth={2} strokeDasharray="4 4" dot={{r: 4, fill: 'var(--brand-dark)', strokeWidth: 2, stroke: '#fff'}} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Fluxo de Caixa */}
      <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col h-full min-h-[350px]">
        <div className="flex justify-between items-center mb-8">
           <div className="flex items-center gap-3">
             <MoneyIcon className="w-[20px] h-[20px] text-brand-dark dark:text-dark-heading" />
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
                  <stop offset="5%" stopColor="var(--brand-green)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--brand-green)" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorSaida" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#cc4745" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#cc4745" stopOpacity={0}/>
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
