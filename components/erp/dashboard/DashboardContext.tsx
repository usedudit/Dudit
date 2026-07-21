"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

interface Insight {
  message: string;
  color: string;
}

interface DashboardContextType {
  insights: Insight[] | null;
  setInsights: (insights: Insight[] | null) => void;
  exportHandler: ((format: "csv" | "xlsx") => Promise<void>) | null;
  setExportHandler: (handler: ((format: "csv" | "xlsx") => Promise<void>) | null) => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [exportHandler, setExportHandlerState] = useState<((format: "csv" | "xlsx") => Promise<void>) | null>(null);

  const setExportHandler = useCallback((handler: ((format: "csv" | "xlsx") => Promise<void>) | null) => {
    setExportHandlerState(() => handler);
  }, []);

  return (
    <DashboardContext.Provider value={{ insights, setInsights, exportHandler, setExportHandler }}>
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
