"use client";

import React from "react";
import Link from "next/link";
import {
  MoreHorizontal,
  ShoppingCartIcon,
  CreditCardIcon,
  PackageIcon,
  CalendarIcon,
  Settings2Icon,
  UserIcon,
  TruckIcon,
  FileIcon,
  TagIcon,
  AlertCircleIcon
} from "@/lib/icons";
import { Activity } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { IconPlaceholder } from "@/components/reusable";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border p-3.5 shadow-lg flex flex-col gap-2 font-sans min-w-[150px]">
        <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{label}</p>
        <div className="flex flex-col gap-1.5">
          {payload.map((entry: any, index: number) => {
            const color = entry.fill || "var(--color-brand-dark)";
            return (
              <div key={index} className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-current shrink-0" style={{ color }} />
                  <span className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body">
                    Vendas
                  </span>
                </div>
                <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading">
                  {entry.value}
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

export function TopCategories({ categoriesData }: { categoriesData: any[] }) {
  const chartData = (categoriesData || []).map(c => ({
    name: c.label,
    amount: Number(c.value)
  }));

  return (
    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex-1">
      <div className="flex items-center space-x-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
          <TagIcon size={18} className="text-brand-dark dark:text-dark-heading" />
        </div>
        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Principais Categorias</h3>
      </div>

      <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'currentColor', className: 'text-brand-inactive-text dark:text-dark-body', fontSize: 12, fontWeight: 600 }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'currentColor', className: 'text-brand-inactive-text dark:text-dark-body', fontSize: 12, fontWeight: 600 }}
              dx={-10}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: 'var(--color-brand-green-light)', opacity: 0.1 }}
            />
            <Bar dataKey="amount" fill="var(--color-brand-dark)" radius={[6, 6, 6, 6]} barSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const activityIconMap: Record<string, any> = {
  cart: ShoppingCartIcon,
  money: CreditCardIcon,
  package: PackageIcon,
  calendar: CalendarIcon,
  wrench: Settings2Icon,
  user: UserIcon,
  wrenchIcon: Settings2Icon,
  truck: TruckIcon,
  file: FileIcon,
  tag: TagIcon,
};

export function RecentActivities({ activities, moreHref, limit = 4 }: { activities: any[]; moreHref?: string; limit?: number }) {
  if (!activities || activities.length === 0) {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex-1 flex flex-col justify-center min-h-[340px]">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
              <Activity size={18} className="text-brand-dark dark:text-dark-heading" />
            </div>
            <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Atividades Recentes</h3>
          </div>
          {moreHref ? (
            <Link href={moreHref} className="text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading flex items-center justify-center">
              <MoreHorizontal size={20} className="text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading" />
            </Link>
          ) : (
            <button className="text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading flex items-center justify-center">
              <MoreHorizontal size={20} className="text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading" />
            </button>
          )}
        </div>
        <IconPlaceholder
          title="Sem Atividades"
          subtitle="Nenhuma atividade registrada recentemente."
          className="flex-1 py-4"
        />
      </div>
    );
  }

  // Sort and slice to max activities
  const sortedActivities = [...activities].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  const limitedActivities = sortedActivities.slice(0, limit);

  const groups: Record<string, any[]> = {};
  for (const item of limitedActivities) {
    if (!item.date) continue;
    const d = new Date(item.date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const ymd = `${y}-${m}-${day}`;
    if (!groups[ymd]) {
      groups[ymd] = [];
    }
    groups[ymd].push(item);
  }

  const dNow = new Date();
  const today = `${dNow.getFullYear()}-${String(dNow.getMonth() + 1).padStart(2, "0")}-${String(dNow.getDate()).padStart(2, "0")}`;
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const yesterday = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, "0")}-${String(yest.getDate()).padStart(2, "0")}`;

  const activitiesGroups = Object.keys(groups)
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
        items: groups[ymd].map(item => {
          const Icon = typeof item.icon === "string" ? (activityIconMap[item.icon] || AlertCircleIcon) : (item.icon || AlertCircleIcon)
          return {
            id: item.id,
            time: item.time + (item.user ? ` · ${item.user}` : ""),
            text: `${item.title}${item.description ? `: ${item.description}` : ""}`,
            entityRef: item.entityRef || "",
            icon: Icon
          };
        })
      };
    });

  return (
    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex-1">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
            <Activity size={18} className="text-brand-dark dark:text-dark-heading" />
          </div>
          <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Atividades Recentes</h3>
        </div>
        {moreHref ? (
          <Link href={moreHref} className="text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading flex items-center justify-center">
            <MoreHorizontal size={20} className="text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading" />
          </Link>
        ) : (
          <button className="text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading flex items-center justify-center">
            <MoreHorizontal size={20} className="text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading" />
          </button>
        )}
      </div>

      <div className="space-y-8">
        {activitiesGroups.map((group, gIdx) => (
          <div key={group.title}>
            <div className="text-[15px] font-bold text-brand-dark dark:text-dark-heading mb-5">{group.title}</div>
            <div className="space-y-6 relative">
              {/* Timeline Line */}
              {group.items.length > 1 && (
                <div className="absolute left-[15px] top-4 bottom-[-16px] w-[2px] bg-brand-green-light dark:bg-dark-border/40 z-0" />
              )}

              {group.items.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <div key={item.id} className="flex relative z-10 w-full">
                    <div className="w-8 h-8 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex-shrink-0 flex items-center justify-center mr-4 border-[3px] border-white dark:border-dark-surface shadow-[0_0_0_2px_#ffffff] dark:shadow-[0_0_0_2px_rgba(28,28,30,0.5)]">
                      <ItemIcon size={14} className="text-brand-dark dark:text-dark-heading" />
                    </div>
                    <div className="flex flex-col justify-start -mt-0.5">
                      <div className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wide mb-1">
                        {item.time}
                      </div>
                      <div className="text-[14px] font-semibold text-brand-dark dark:text-dark-heading leading-snug">
                        {item.text}
                      </div>
                      {item.entityRef && (
                        <div className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body mt-0.5">
                          {item.entityRef}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
