import React from "react";
import { TopWidgets, MainCharts, BottomWidgets } from "./FinancialSummaryWidgets";
import type { FinancialOverviewData } from "@/lib/data/financial-overview";

export function FinancialSummary({ data }: { data: FinancialOverviewData }) {
  return (
    <div className="flex flex-col w-full h-full pb-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading tracking-tight mb-2">Resumo Financeiro</h2>
        <p className="text-brand-inactive-text dark:text-dark-body text-sm">Acompanhe suas métricas financeiras</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <TopWidgets data={data} />
        <MainCharts data={data} />
        <BottomWidgets data={data} />
      </div>
    </div>
  );
}
