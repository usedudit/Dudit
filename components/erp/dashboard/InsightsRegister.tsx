"use client";

import { useEffect } from "react";
import { useDashboard } from "./DashboardContext";

interface Insight {
  message: string;
  color: string;
}

export function InsightsRegister({ insights }: { insights: Insight[] }) {
  const { setInsights } = useDashboard();

  useEffect(() => {
    setInsights(insights);
    return () => setInsights(null);
  }, [insights, setInsights]);

  return null;
}
