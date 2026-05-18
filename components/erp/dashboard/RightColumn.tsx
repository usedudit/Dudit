"use client";

import React from "react";
import {
  MoreHorizontal,
  ChevronDownIcon as ChevronDown,
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
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Dropdown, DropdownItem, IconPlaceholder } from "@/components/reusable";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white rounded-xl border border-brand-border p-3.5 shadow-lg flex flex-col gap-2 font-sans min-w-[150px]">
        <p className="text-[13px] font-extrabold text-brand-dark">{label}</p>
        <div className="flex flex-col gap-1.5">
          {payload.map((entry: any, index: number) => {
            const color = entry.fill || "var(--color-brand-dark)";
            return (
              <div key={index} className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-current shrink-0" style={{ color }} />
                  <span className="text-[12px] font-semibold text-brand-inactive-text">
                    Vendas
                  </span>
                </div>
                <span className="text-[12px] font-bold text-brand-dark">
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
    <div className="bg-white rounded-[24px] p-6 border border-brand-border flex-1">
      <div className="flex flex-wrap items-center justify-between mb-8 gap-4">
        <h3 className="text-xl font-bold text-brand-dark">Principais Categorias</h3>
        <Dropdown
          fullWidth={false}
          align="right"
          width="w-44"
          trigger={
            <button className="flex items-center text-[13px] font-bold text-brand-dark border border-brand-border rounded-full px-4 py-2 hover:bg-brand-green-light transition-colors">
              <span>Este Mês</span>
            </button>
          }
        >
          <DropdownItem>Este Mês</DropdownItem>
        </Dropdown>
      </div>

      <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis 
              dataKey="name" 
              axisLine={false} 
              tickLine={false} 
              tick={{fill: 'var(--color-brand-inactive-text)', fontSize: 12, fontWeight: 600}} 
              dy={10} 
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{fill: 'var(--color-brand-inactive-text)', fontSize: 12, fontWeight: 600}} 
              dx={-10}
            />
            <Tooltip 
              content={<CustomTooltip />}
              cursor={{fill: 'var(--color-brand-green-light)'}}
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
  truck: TruckIcon,
  file: FileIcon,
  tag: TagIcon,
};

export function RecentActivities({ activities }: { activities: any[] }) {
  if (!activities || activities.length === 0) {
    return (
      <div className="bg-white rounded-[24px] p-6 border border-brand-border flex-1 flex flex-col justify-center min-h-[340px]">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-xl font-bold text-brand-dark">Atividades Recentes</h3>
        </div>
        <IconPlaceholder
          title="Sem Atividades"
          subtitle="Nenhuma atividade registrada recentemente."
          className="flex-1 py-4"
        />
      </div>
    );
  }

  const items = activities.map(item => {
    const Icon = activityIconMap[item.icon] || AlertCircleIcon;
    return {
      id: item.id,
      time: item.time + (item.user ? ` · ${item.user}` : ""),
      text: `${item.title}${item.description ? `: ${item.description}` : ""}`,
      icon: Icon
    };
  });

  const activitiesGroups = [
    {
      title: "Atividades do Sistema",
      items
    }
  ];

  return (
    <div className="bg-white rounded-[24px] p-6 border border-brand-border flex-1">
       <div className="flex justify-between items-center mb-8">
          <h3 className="text-xl font-bold text-brand-dark">Atividades Recentes</h3>
          <button className="text-brand-inactive-text hover:text-brand-dark flex items-center justify-center">
            <MoreHorizontal size={20} className="text-brand-inactive-text hover:text-brand-dark" />
          </button>
       </div>

       <div className="space-y-8">
          {activitiesGroups.map((group, gIdx) => (
             <div key={gIdx}>
                <div className="text-[15px] font-bold text-brand-dark mb-5">{group.title}</div>
                <div className="space-y-6 relative">
                   {/* Timeline Line */}
                   <div className="absolute left-[15px] top-4 bottom-[-16px] w-[2px] bg-brand-green-light z-0" />
                   
                   {group.items.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <div key={item.id} className="flex relative z-10 w-full">
                           <div className="w-8 h-8 rounded-full bg-brand-green-second flex-shrink-0 flex items-center justify-center mr-4 border-[3px] border-white shadow-[0_0_0_2px_#ffffff]">
                              <ItemIcon size={14} className="text-brand-green" />
                           </div>
                           <div className="flex flex-col justify-start -mt-0.5">
                              <div className="text-[11px] font-bold text-brand-inactive-text uppercase tracking-wide mb-1">
                                {item.time}
                              </div>
                              <div className="text-[14px] font-semibold text-brand-dark leading-snug">
                                {item.text}
                              </div>
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
