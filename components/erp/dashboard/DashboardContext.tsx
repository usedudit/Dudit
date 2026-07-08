"use client";

import React, { createContext, useContext, useState } from "react";

interface Insight {
  message: string;
  color: string;
}

interface DashboardContextType {
  insights: Insight[] | null;
  setInsights: (insights: Insight[] | null) => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [insights, setInsights] = useState<Insight[] | null>(null);

  return (
    <DashboardContext.Provider value={{ insights, setInsights }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return context;
}
