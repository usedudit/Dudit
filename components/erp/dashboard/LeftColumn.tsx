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
import { brl } from "@/lib/data/dashboard";

export function SummaryCards({ metrics }: { metrics: any[] }) {
  const icons = [MoneyIcon, SalesIcon, TagIcon, Users];

  const parseTrend = (trendStr: string) => {
    if (!trendStr) return { percent: "↑ 0 %", isPositive: true, change: "0%" };
    const isPositive = !trendStr.trim().startsWith("-");
    const percentMatch = trendStr.match(/([0-9.,]+)%/);
    const percentValue = percentMatch ? percentMatch[1] : "0";
    const changeMatch = trendStr.match(/^[+-]?[0-9.,]+%/);
    const change = changeMatch ? changeMatch[0] : "0%";

    return {
      percent: `${isPositive ? "↑" : "↓"} ${percentValue} %`,
      isPositive,
      change
    };
  };

  if (!metrics || metrics.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4 lg:gap-6 w-full h-full">
      {metrics.slice(0, 4).map((metric, i) => {
        const CardIcon = icons[i % icons.length];
        const { percent, isPositive, change } = parseTrend(metric.trend);

        return (
          <div key={i} className="bg-white rounded-[24px] p-6 border border-brand-border flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-brand-green-light flex items-center justify-center text-brand-dark">
                  <CardIcon size={18} className="text-brand-dark" />
                </div>
                <span className="text-[14px] font-bold text-brand-dark">{metric.title}</span>
              </div>
              <span
                className={`text-[12px] font-bold px-2.5 py-1 rounded-full flex items-center space-x-1 ${isPositive ? "bg-brand-green-secondary text-brand-green" : "bg-[#fce6e5] text-[#cc4745]"
                  }`}
              >
                <span>{percent.split(" ")[0]}</span>
                <span>{percent.split(" ")[1]}</span>
                <span>{percent.split(" ")[2]}</span>
              </span>
            </div>

            <div className="flex items-baseline space-x-2 mt-2">
              <h2 className="text-[32px] font-extrabold text-brand-dark tracking-tight leading-none">{metric.value}</h2>
              <span className="text-[12px] font-semibold text-brand-inactive-text">
                <span className="text-brand-dark">{change}</span> vs mês passado
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Cashflow({ revenueData, totalRevenue }: { revenueData: any[], totalRevenue: number }) {
  const chartData = (revenueData || []).map(p => ({
    name: p.label,
    income: p.value,
    expense: p.secondary
  }));

  return (
    <div className="bg-white rounded-[24px] p-6 border border-brand-border flex-1">
      <div className="flex flex-wrap items-center justify-between mb-4 gap-4">
        <h3 className="text-xl font-bold text-brand-dark">Receita Total</h3>
        <button className="flex items-center space-x-2 text-[13px] font-bold text-brand-dark border border-brand-border rounded-full px-4 py-2 hover:bg-brand-green-light transition-colors">
          <span>Últimos 30 Dias</span>
          <ChevronDownIcon size={16} className="text-brand-inactive-text" />
        </button>
      </div>

      <div className="flex flex-wrap items-end justify-between mb-8 gap-4">
        <div>
          <span className="text-[13px] font-semibold text-brand-inactive-text">Total Acumulado</span>
          <div className="text-[32px] font-extrabold text-brand-dark tracking-tight leading-none mt-1">
            {brl(totalRevenue)}
          </div>
        </div>
        <div className="flex items-center space-x-6 pb-2">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-sm bg-brand-green"></div>
            <span className="text-[13px] font-bold text-brand-inactive-text">Este Período</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-sm bg-brand-dark"></div>
            <span className="text-[13px] font-bold text-brand-inactive-text">Período Anterior</span>
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
              tick={{ fill: 'var(--color-brand-inactive-text)', fontSize: 13, fontWeight: 600 }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--color-brand-inactive-text)', fontSize: 13, fontWeight: 600 }}
              dx={-10}
            />
            <Tooltip
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', padding: '12px 16px', fontWeight: 'bold' }}
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
      <div className="bg-white rounded-[24px] p-6 border border-brand-border flex-1">
        <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
          <h3 className="text-xl font-bold text-brand-dark">Precisa de Atenção</h3>
        </div>
        <div className="py-8 text-center text-brand-inactive-text font-medium text-[15px]">
          Tudo em dia! Nenhum alerta no momento.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[24px] p-6 border border-brand-border flex-1">
      <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
        <h3 className="text-xl font-bold text-brand-dark">Precisa de Atenção</h3>
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
                <tr key={item.id} className="border-b border-brand-border last:border-b-0 h-[80px]">
                  <td className="pl-2">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-brand-green-light flex items-center justify-center text-brand-dark">
                        <Icon size={18} className="text-brand-dark" />
                      </div>
                      <div>
                        <div className="text-[15px] font-bold text-brand-dark mb-0.5">{item.message}</div>
                        <div className="text-[13px] font-medium text-brand-inactive-text">{description}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-right pr-6">
                    <span className="text-[15px] font-extrabold text-brand-dark">
                      {item.count} pendente{item.count > 1 ? "s" : ""}
                    </span>
                  </td>
                  <td className="text-right w-[100px]">
                    <button className="text-[12px] font-bold text-brand-dark bg-brand-green-light border border-brand-border px-4 py-2 rounded-lg hover:bg-brand-green-secondary transition-colors whitespace-nowrap">
                      Resolver
                    </button>
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
