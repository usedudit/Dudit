"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  SalesIcon,
  TagIcon,
  Users,
  MoneyIcon,
  CreditCardIcon,
  ShoppingCartIcon,
  PackageIcon,
  CalendarIcon,
  TruckIcon,
  AlertCircleIcon,
  RepeatIcon,
  CheckCircleIcon,
  ClockIcon,
  WrenchIcon,
  FileTextIcon,
  TrendingUpIcon,
  TargetIcon,
  MegaphoneIcon,
  ReturnIcon,
  RotateIcon,
  StarIcon,
} from "@/lib/icons";
import { formatCurrency as brl } from "@/lib/utils";
import { Button, IconPlaceholder } from "@/components/reusable";
import { useRouter } from "next/navigation";

export function SummaryCards({ metrics, variant = "grid", showTrend = true }: { metrics: any[], variant?: "grid" | "horizontal", showTrend?: boolean }) {
  const defaultIcons = [MoneyIcon, SalesIcon, TagIcon, Users];

  const parseTrend = (trendStr: string) => {
    if (!trendStr) return { percent: "↑ 0 %", isPositive: true, change: "0%", vsText: "período anterior" };
    const isPositive = !trendStr.trim().startsWith("-");
    const percentMatch = trendStr.match(/([0-9.,]+)%/);
    const percentValue = percentMatch ? percentMatch[1] : "0";
    const changeMatch = trendStr.match(/^[+-]?[0-9.,]+%/);
    const change = changeMatch ? changeMatch[0] : "0%";
    const vsMatch = trendStr.match(/vs\s+(.+)/i);
    const vsText = vsMatch ? vsMatch[1] : "período anterior";

    return {
      percent: `${isPositive ? "↑" : "↓"} ${percentValue} %`,
      isPositive,
      change,
      vsText
    };
  };

  if (!metrics || metrics.length === 0) {
    return null;
  }

  if (variant === "horizontal") {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-[24px] border border-brand-border dark:border-dark-border grid grid-cols-1 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-brand-border dark:divide-dark-border w-full">
        {metrics.slice(0, 4).map((metric, i) => {
          const CardIcon = metric.icon || defaultIcons[i % defaultIcons.length];
          const { percent, isPositive, change, vsText } = parseTrend(metric.trend);

          return (
            <div key={i} className="p-6 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                    <CardIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                  </div>
                  <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">{metric.title}</span>
                </div>
                {showTrend && (
                  <span
                    className={`text-[12px] font-bold px-2.5 py-1 rounded-full flex items-center space-x-1 ${isPositive ? "bg-brand-green-secondary text-brand-green" : "bg-[#fce6e5] text-[#cc4745]"
                      }`}
                  >
                    <span>{percent.split(" ")[0]}</span>
                    <span>{percent.split(" ")[1]}</span>
                    <span>{percent.split(" ")[2]}</span>
                  </span>
                )}
              </div>

              <div className="flex items-baseline mt-2 min-w-0">
                <h2 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none truncate">{metric.value}</h2>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full h-full">
      {metrics.slice(0, 4).map((metric, i) => {
        const CardIcon = metric.icon || defaultIcons[i % defaultIcons.length];
        const { percent, isPositive, change, vsText } = parseTrend(metric.trend);

        return (
          <div key={i} className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                  <CardIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                </div>
                <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">{metric.title}</span>
              </div>
              {showTrend && (
                <span
                  className={`text-[12px] font-bold px-2.5 py-1 rounded-full flex items-center space-x-1 ${isPositive ? "bg-brand-green-secondary text-brand-green" : "bg-[#fce6e5] text-[#cc4745]"
                    }`}
                >
                  <span>{percent.split(" ")[0]}</span>
                  <span>{percent.split(" ")[1]}</span>
                  <span>{percent.split(" ")[2]}</span>
                </span>
              )}
            </div>

            <div className="flex items-baseline mt-2 min-w-0">
              <h2 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none truncate">{metric.value}</h2>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function makeTooltip(secondaryLabel: string) {
  return function CustomTooltip({ active, payload, label }: any) {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border p-3.5 shadow-lg flex flex-col gap-2 font-sans min-w-[150px]">
          <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{label}</p>
          <div className="flex flex-col gap-1.5">
            {payload.map((entry: any, index: number) => {
              const color = entry.stroke || entry.fill || entry.color || "var(--color-brand-green)";
              const name = entry.name === "income" ? "Este Período" : entry.name === "expense" ? (secondaryLabel || "Período Anterior") : entry.name;
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
  }
}

export function Cashflow({ revenueData, totalRevenue, compareLabel }: { revenueData: any[], totalRevenue: number, compareLabel?: string }) {
  const secondaryLabel = compareLabel || "Período Anterior"
  const Tooltip = makeTooltip(secondaryLabel)

  const chartData = (revenueData || []).map(p => ({
    name: p.label,
    income: p.value,
    expense: p.secondary
  }));

  return (
    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex-1">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
          <MoneyIcon size={18} className="text-brand-dark dark:text-dark-heading" />
        </div>
        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Receita Total</h3>
      </div>

      <div className="flex flex-wrap items-end justify-between mb-8 gap-4">
        <div>
          <span className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body">Total Acumulado</span>
          <div className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none mt-1">
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
            <span className="text-[13px] font-bold text-brand-inactive-text dark:text-dark-body">{secondaryLabel}</span>
          </div>
        </div>
      </div>

      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
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
              content={<Tooltip />}
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
  const router = useRouter();

  const alertRouteMap: Record<string, string> = {
    "due-accounts": "/erp/transacoes",
    "pending-orders": "/erp/pedidos",
    "low-stock": "/erp/produtos",
    "pending-appointments": "/erp/agendamentos",
    "late-deliveries": "/erp/entregas",
  };

  const handleResolve = (alertId: string) => {
    const route = alertRouteMap[alertId];
    if (route) router.push(route);
  };

  if (!alerts || alerts.length === 0) {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex-1 flex flex-col justify-center min-h-[340px]">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
            <AlertCircleIcon size={18} className="text-brand-dark dark:text-dark-heading" />
          </div>
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
    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex-1 min-h-[340px] h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
            <AlertCircleIcon size={18} className="text-brand-dark dark:text-dark-heading" />
          </div>
          <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
            Precisa de Atenção ({alerts.length})
          </h3>
        </div>
      </div>

      <div className="custom-scrollbar overflow-y-auto flex-1 -mx-6 px-6">
        <table className="w-full text-left">
          <tbody>
            {alerts.map((item) => {
              const Icon = iconMap[item.icon] || AlertCircleIcon;

              let description = "Ação recomendada para manter suas operações organizadas.";
              if (item.id === "due-accounts") {
                description = "Verifique as contas a pagar e receber para evitar juros ou atrasos.";
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
                <tr
                  key={item.id}
                  onClick={() => handleResolve(item.id)}
                  className="border-b border-brand-border dark:border-dark-border last:border-b-0 h-[72px] cursor-pointer transition-colors hover:bg-brand-green-light/5 dark:hover:bg-dark-border/20"
                >
                  <td className="pl-2 align-top pt-3">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading">
                        <Icon size={18} className="text-brand-dark dark:text-dark-heading" />
                      </div>
                      <div>
                        <div className="text-[15px] font-bold text-brand-dark dark:text-dark-heading mb-0.5">{item.message}</div>
                        <div className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">{description}</div>
                      </div>
                    </div>
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
