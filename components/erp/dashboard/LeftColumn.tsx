"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  SalesIcon,
  TagIcon,
  Users,
  MoneyIcon,
  ChevronDownIcon,
  CreditCardIcon,
  ShoppingCartIcon,
  PackageIcon,
  CalendarIcon,
  TruckIcon,
  AlertCircleIcon
} from "@/lib/icons";
import { formatCurrency as brl } from "@/lib/utils";
import { Dropdown, DropdownItem, Button, IconPlaceholder } from "@/components/reusable";

export function SummaryCards({ metrics }: { metrics: any[] }) {
  const icons = [MoneyIcon, SalesIcon, TagIcon, Users];

  const parseTrend = (trendStr: string) => {
    if (!trendStr) return { percent: "↑ 0 %", isPositive: true, change: "0%" };
    const isPositive = !trendStr.trim().startsWith("-");
    const percentMatch = trendStr.match(/([0-9.,]+)%/);
    const percentValue = percentMatch ? percentMatch[1] : "0";
    
    return {
      percent: `${isPositive ? "↑" : "↓"} ${percentValue} %`,
      isPositive,
      change: `${percentValue}%`
    };
  };

  const formattedMetrics = (metrics || []).map((m, idx) => {
    const trend = parseTrend(m.trend);
    return {
      title: m.title,
      value: m.value,
      trendText: trend.percent,
      isPositive: trend.isPositive,
      change: trend.change,
      icon: icons[idx % icons.length]
    };
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      {formattedMetrics.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div key={idx} className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col justify-between">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body block mb-1">{card.title}</span>
                <span className="text-[28px] font-extrabold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                  {card.value}
                </span>
              </div>
              <div className="w-12 h-12 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading">
                <Icon size={24} className="text-brand-dark dark:text-dark-heading" />
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-[6px] ${
                card.isPositive ? "bg-brand-green-secondary text-brand-green" : "bg-[#fce6e5] text-[#cc4745]"
              }`}>
                {card.trendText}
              </span>
              <span className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body">vs mês passado</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border p-3.5 shadow-lg flex flex-col gap-2 font-sans min-w-[150px]">
        <p className="text-[13px] font-extrabold text-brand-dark dark:text-dark-heading">{label}</p>
        <div className="flex flex-col gap-1.5">
          {payload.map((entry: any, index: number) => {
            const color = entry.stroke || entry.fill || entry.color || "var(--color-brand-green)";
            const name = entry.name === "income" ? "Este Período" : entry.name === "expense" ? "Período Anterior" : entry.name;
            return (
              <div key={index} className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-current shrink-0" style={{ color }} />
                  <span className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body">
                    {name}
                  </span>
                </div>
                <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading">
                  {typeof entry.value === "number" ? brl(entry.value) : entry.value}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
};

export function Cashflow({ revenueData, totalRevenue }: { revenueData: any[], totalRevenue: number }) {
  const chartData = (revenueData || []).map(p => ({
    name: p.label,
    income: p.value,
    expense: p.secondary
  }));

  return (
    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex-1">
      <div className="flex flex-wrap items-center justify-between mb-4 gap-4">
        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Receita Total</h3>
        <Dropdown
          fullWidth={false}
          align="right"
          width="w-44"
          trigger={
            <button className="flex items-center text-[13px] font-bold text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border rounded-full px-4 py-2 hover:bg-brand-green-light dark:hover:bg-dark-border transition-colors">
              <span>Últimos 30 Dias</span>
            </button>
          }
        >
          <DropdownItem>Hoje</DropdownItem>
          <DropdownItem>Últimos 7 Dias</DropdownItem>
          <DropdownItem>Últimos 30 Dias</DropdownItem>
        </Dropdown>
      </div>

      <div className="flex flex-wrap items-end justify-between mb-8 gap-4">
        <div>
          <span className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body">Total Acumulado</span>
          <div className="text-[32px] font-extrabold text-brand-dark dark:text-dark-heading tracking-tight leading-none mt-1">
            {brl(totalRevenue)}
          </div>
        </div>
        <div className="flex items-center space-x-6 pb-2">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-sm bg-brand-green"></div>
            <span className="text-[13px] font-bold text-brand-inactive-text dark:text-dark-body">Este Período</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-sm bg-brand-dark dark:bg-dark-border"></div>
            <span className="text-[13px] font-bold text-brand-inactive-text dark:text-dark-body">Período Anterior</span>
          </div>
        </div>
      </div>

      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-brand-green)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--color-brand-green)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-brand-dark)" stopOpacity={0.1} />
                <stop offset="95%" stopColor="var(--color-brand-dark)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'currentColor', className: 'text-brand-inactive-text dark:text-dark-body', fontSize: 13, fontWeight: 600 }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'currentColor', className: 'text-brand-inactive-text dark:text-dark-body', fontSize: 13, fontWeight: 600 }}
              dx={-10}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: 'var(--color-brand-border)', strokeWidth: 2, strokeDasharray: '4 4' }}
            />
            <Area
              type="monotone"
              dataKey="income"
              stroke="var(--color-brand-green)"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorIncome)"
            />
            <Area
              type="monotone"
              dataKey="expense"
              stroke="var(--color-brand-dark)"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorExpense)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const iconMap: Record<string, any> = {
  "credit-card": CreditCardIcon,
  cart: ShoppingCartIcon,
  package: PackageIcon,
  calendar: CalendarIcon,
  truck: TruckIcon,
};

export function NeedsAttention({ alerts }: { alerts: any[] }) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex-1 flex flex-col justify-center min-h-[340px]">
        <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
          <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Precisa de Atenção</h3>
        </div>
        <IconPlaceholder
          title="Sem Alertas"
          subtitle="Tudo em dia! Nenhum alerta no momento."
          className="flex-1 py-4"
        />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex-1">
      <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Precisa de Atenção</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left whitespace-nowrap min-w-[600px]">
          <tbody>
            {alerts.map((item) => {
              const Icon = iconMap[item.icon] || AlertCircleIcon;

              let description = "Ação recomendada para manter suas operações organizadas.";
              if (item.id === "due-accounts") {
                description = "Verifique o contas a pagar e receber para evitar juros ou atrasos.";
              } else if (item.id === "pending-orders") {
                description = "Aguardando confirmação de pagamento do cliente.";
              } else if (item.id === "low-stock") {
                description = "Abasteça seu estoque para não perder oportunidades de vendas.";
              } else if (item.id === "pending-appointments") {
                description = "Responda as solicitações pendentes o quanto antes.";
              } else if (item.id === "late-deliveries") {
                description = "Verifique o status do envio dos pedidos.";
              }

              return (
                <tr key={item.id} className="border-b border-brand-border dark:border-dark-border last:border-b-0 h-[80px]">
                  <td className="pl-2">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading">
                        <Icon size={18} className="text-brand-dark dark:text-dark-heading" />
                      </div>
                      <div>
                        <div className="text-[15px] font-bold text-brand-dark dark:text-dark-heading mb-0.5">{item.message}</div>
                        <div className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">{description}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-right pr-6">
                    <span className="text-[15px] font-extrabold text-brand-dark dark:text-dark-heading">
                      {item.count} pendente{item.count > 1 ? "s" : ""}
                    </span>
                  </td>
                  <td className="text-right w-[100px]">
                    <Button variant="outline" size="sm" className="text-[12px] font-bold py-1 px-4 whitespace-nowrap h-auto">
                      Resolver
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
