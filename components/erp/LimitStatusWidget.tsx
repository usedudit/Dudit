"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { XIcon, ChartIcon } from "@/lib/icons"
import { Button } from "@/components/reusable"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { getLimitStatusAction } from "@/app/actions/erp/limits-status"
import type { LimitStatusData } from "@/app/actions/erp/limits-status"
import { getHardcodedPlan } from "@/lib/subscription/feature-labels"

const COOKIE_NAME = "dudit_limit_widget_dismissed"

function getDismissedCookie(): number | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`))
    if (match) {
      const val = parseInt(match[1], 10)
      return isNaN(val) ? null : val
    }
  } catch {}
  return null
}

function setDismissedCookie() {
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000)
  document.cookie = `${COOKIE_NAME}=${Date.now()}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`
}

export function LimitStatusWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [data, setData] = useState<LimitStatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const popupRef = useRef<HTMLDivElement>(null)

  const { openPlanUpgrade } = usePlanUpgrade()

  useEffect(() => {
    const dismissedAt = getDismissedCookie()
    if (dismissedAt && Date.now() - dismissedAt < 24 * 60 * 60 * 1000) {
      setDismissed(true)
      setLoading(false)
      return
    }
    fetchData()
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        const btn = document.getElementById("limit-widget-btn")
        if (btn && !btn.contains(e.target as Node)) {
          setIsOpen(false)
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  const fetchData = async () => {
    setLoading(true)
    const result = await getLimitStatusAction()
    if (result) setData(result)
    setLoading(false)
  }

  const handleClose = useCallback(() => {
    setIsOpen(false)
    setDismissed(true)
    setDismissedCookie()
  }, [])

  const hasNearLimit = data?.items.some(
    (i) => i.limit !== "unlimited" && i.percentage >= 80,
  )

  if (dismissed) return null

  const nextPlanName = data?.nextPlanSlug
    ? getHardcodedPlan(data.nextPlanSlug).name
    : null

  return (
    <>
      <button
        id="limit-widget-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-[90] w-12 h-12 rounded-full shadow-lg shadow-black/10 hover:scale-105 active:scale-95 transition-all flex items-center justify-center bg-brand-dark dark:bg-white text-white dark:text-brand-dark"
        aria-label="Status do plano"
      >
        <ChartIcon className="w-5 h-5" />
        {hasNearLimit && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-brand-dark" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && data && (
          <motion.div
            ref={popupRef}
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed bottom-24 right-6 z-[90] w-[360px] max-w-[calc(100vw-2rem)] bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-brand-border dark:border-dark-border">
              <div>
                <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                  Status do plano
                </h3>
                <p className="text-xs text-brand-inactive-text mt-0.5">
                  Plano {data.planName}
                </p>
              </div>
              <button
                onClick={handleClose}
                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-brand-gray/50 dark:hover:bg-dark-border/50 transition-colors shrink-0"
                aria-label="Fechar"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 max-h-[380px] overflow-y-auto space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <span className="text-sm text-brand-inactive-text">Carregando...</span>
                </div>
              ) : (
                data.items.map((item) => (
                  <LimitRow key={item.key} item={item} />
                ))
              )}

              {!loading && data.items.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs text-brand-inactive-text leading-relaxed">
                    {hasNearLimit
                      ? "Você está próximo do limite de alguns recursos. Que tal fazer upgrade para continuar sem preocupações?"
                      : "Seu plano ainda tem bastante espaço. Quando precisar de mais, estamos aqui!"}
                  </p>
                </div>
              )}
            </div>

            {data.nextPlanSlug && (
              <div className="px-5 py-4 border-t border-brand-border dark:border-dark-border bg-brand-gray/20 dark:bg-dark-border/20">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-brand-inactive-text font-medium uppercase tracking-wide">
                      Quer mais?
                    </p>
                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mt-0.5">
                      Plano {nextPlanName} sem limites
                    </p>
                  </div>
                  <Button
                    variant="default"
                    className="rounded-full shrink-0 text-xs font-bold px-5 h-9"
                    onClick={() => {
                      setIsOpen(false)
                      openPlanUpgrade(data.nextPlanSlug as "crescer" | "escalar")
                    }}
                  >
                    Fazer upgrade
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function LimitRow({ item }: { item: LimitStatusData["items"][number] }) {
  const isUnlimited = item.limit === "unlimited"
  const inDanger = !isUnlimited && item.percentage >= 80
  const inWarning = !isUnlimited && item.percentage >= 60 && item.percentage < 80

  let barColor = "bg-brand-green"
  if (inDanger) barColor = "bg-red-500"
  else if (inWarning) barColor = "bg-amber-500"

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-brand-dark dark:text-dark-heading font-medium">
          {item.label}
        </span>
        <span
          className={`text-xs font-semibold ${
            inDanger
              ? "text-red-500"
              : inWarning
                ? "text-amber-500"
                : "text-brand-inactive-text"
          }`}
        >
          {isUnlimited
            ? `${item.current} usados`
            : `${item.current} / ${item.limit}`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="w-full h-2 bg-brand-gray/50 dark:bg-dark-border/50 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.min(item.percentage, 100)}%` }}
          />
        </div>
      )}
      {item.isMonthly && !isUnlimited && (
        <p className="text-[11px] text-brand-inactive-text mt-1">
          Reseta no início do próximo mês
        </p>
      )}
    </div>
  )
}
