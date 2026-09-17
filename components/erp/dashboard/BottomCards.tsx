"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ShoppingCartIcon, PackageIcon, CalendarIcon } from "@/lib/icons";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/reusable";

interface ListItem {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  value?: string;
  tone?: "default" | "green" | "red" | "orange" | "blue";
}

interface CardProps {
  items: ListItem[];
}

export function LatestOrdersCard({ items }: CardProps) {
  const router = useRouter();

  return (
    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col h-full min-h-[340px]">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
          <ShoppingCartIcon size={18} className="text-brand-dark dark:text-dark-heading" />
        </div>
        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Últimos Pedidos</h3>
      </div>

      {!items || items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Nenhum pedido recente.</span>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between">
          <div className="divide-y divide-brand-border/40 dark:divide-dark-border/40">
            {items.slice(0, 5).map((item) => {
              const toneClasses = 
                item.tone === "green" ? "text-brand-green" : 
                item.tone === "orange" ? "text-orange-500" : 
                "text-brand-dark dark:text-dark-heading";

              return (
                <div 
                  key={item.id} 
                  onClick={() => router.push(`/erp/pedidos/${item.id}`)}
                  className="py-3 flex items-center justify-between cursor-pointer hover:bg-brand-gray/20 dark:hover:bg-dark-border/10 rounded-lg px-2 -mx-2 transition-colors"
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading truncate">
                      {item.title}
                    </span>
                    <span className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
                      {item.subtitle} · {item.meta}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <span className={`text-[14px] font-bold ${toneClasses}`}>
                      {item.value}
                    </span>
                    <ChevronRight size={14} className="text-brand-inactive-text/60" />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-brand-border/40 dark:border-dark-border/40">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-[12px] font-bold py-2"
              onClick={() => router.push("/erp/pedidos")}
            >
              Ver Todos os Pedidos
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CriticalStockCard({ items }: CardProps) {
  const router = useRouter();

  return (
    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col h-full min-h-[340px]">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
          <PackageIcon size={18} className="text-brand-dark dark:text-dark-heading" />
        </div>
        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Estoque Crítico</h3>
      </div>

      {!items || items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Sem produtos com estoque crítico.</span>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between">
          <div className="divide-y divide-brand-border/40 dark:divide-dark-border/40">
            {items.slice(0, 5).map((item) => {
              const toneClasses = 
                item.tone === "red" ? "text-red-500 bg-red-50 dark:bg-red-950/20 px-2 py-0.5 rounded-full" : 
                "text-orange-500 bg-orange-50 dark:bg-orange-950/20 px-2 py-0.5 rounded-full";

              return (
                <div 
                  key={item.id} 
                  onClick={() => router.push(`/erp/produtos`)}
                  className="py-3 flex items-center justify-between cursor-pointer hover:bg-brand-gray/20 dark:hover:bg-dark-border/10 rounded-lg px-2 -mx-2 transition-colors"
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading truncate">
                      {item.title}
                    </span>
                    <span className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
                      {item.subtitle}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <span className={`text-[12px] font-bold ${toneClasses}`}>
                      {item.value}
                    </span>
                    <ChevronRight size={14} className="text-brand-inactive-text/60" />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-brand-border/40 dark:border-dark-border/40">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-[12px] font-bold py-2"
              onClick={() => router.push("/erp/produtos")}
            >
              Gerenciar Estoque
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function NextAppointmentsCard({ items }: CardProps) {
  const router = useRouter();

  return (
    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col h-full min-h-[340px]">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
          <CalendarIcon size={18} className="text-brand-dark dark:text-dark-heading" />
        </div>
        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Próximos Agendamentos</h3>
      </div>

      {!items || items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Sem agendamentos futuros.</span>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between">
          <div className="divide-y divide-brand-border/40 dark:divide-dark-border/40">
            {items.slice(0, 5).map((item) => {
              return (
                <div 
                  key={item.id} 
                  onClick={() => router.push(`/erp/agendamentos`)}
                  className="py-3 flex items-center justify-between cursor-pointer hover:bg-brand-gray/20 dark:hover:bg-dark-border/10 rounded-lg px-2 -mx-2 transition-colors"
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading truncate">
                      {item.title}
                    </span>
                    <span className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
                      {item.subtitle} · {item.value}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <span className="text-[12px] font-bold text-brand-inactive-text bg-brand-gray/40 dark:bg-dark-border/40 px-2 py-0.5 rounded-full shrink-0">
                      {item.meta}
                    </span>
                    <ChevronRight size={14} className="text-brand-inactive-text/60" />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-brand-border/40 dark:border-dark-border/40">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-[12px] font-bold py-2"
              onClick={() => router.push("/erp/agendamentos")}
            >
              Ver Agenda Completa
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
