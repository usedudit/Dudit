"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button, ThreeDotsLoader } from "@/components/reusable"
import { ChevronLeftIcon, ClockIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { getAuditLogsAction } from "@/app/actions/erp/audit-logs"
import { usePartnerTimezone } from "@/lib/store-context"

interface LogEntry {
  id: string
  actor: string
  entityType: string
  entityId: string
  actionType: string
  actionRaw: string
  lines: string[]
  source: string
  createdAt: string
}

function formatDate(iso: string, tz?: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: tz,
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function groupByDate(entries: LogEntry[]): Map<string, LogEntry[]> {
  const groups = new Map<string, LogEntry[]>()
  for (const entry of entries) {
    const dateKey = entry.createdAt?.slice(0, 10) || "unknown"
    if (!groups.has(dateKey)) groups.set(dateKey, [])
    groups.get(dateKey)!.push(entry)
  }
  return groups
}

function formatDateGroup(dateStr: string): string {
  try {
    const date = new Date(dateStr + "T00:00:00")
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (dateStr === today.toISOString().slice(0, 10)) return "Hoje"
    if (dateStr === yesterday.toISOString().slice(0, 10)) return "Ontem"

    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "long",
    }).format(date)
  } catch {
    return dateStr
  }
}

const SOURCE_LABELS: Record<string, string> = {
  user: "Usuário",
  system: "Sistema",
  webhook: "Webhook",
  manual: "Manual",
  marketplace: "Marketplace",
}

function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, string> = {
    user: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    system: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    webhook: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    manual: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    marketplace: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  }
  return (
    <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full ${colors[source] || colors.system}`}>
      {SOURCE_LABELS[source] || source}
    </span>
  )
}

export function AuditLogsSubPage({ onBack }: { onBack: () => void }) {
  const tz = usePartnerTimezone()
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isScrolled, setIsScrolled] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
  }, [])

  const handleBack = useCallback(() => onBack(), [onBack])

  useEffect(() => {
    let cancelled = false
      ; (async () => {
        setLoading(true)
        const res = await getAuditLogsAction()
        if (cancelled) return
        if (res.success) {
          setEntries(res.data)
        } else {
          setError(res.error || "Erro ao carregar logs")
        }
        setLoading(false)
      })()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background overflow-hidden">
        <ThreeDotsLoader />
      </FadeIn>
    )
  }

  const grouped = groupByDate(entries)

  return (
    <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background overflow-hidden relative transition-colors duration-500 ease-in-out">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth custom-scrollbar"
      >
        {/* Sticky Header */}
        <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface transition-all duration-500 ease-in-out">
          <div className="max-w-[1300px] mx-auto relative px-4 md:px-6">
            <div className={`absolute -left-12 top-3 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
              <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
              </Button>
            </div>

            <div className="hidden md:flex items-start justify-between">
              <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                  <ClockIcon className="w-7 h-7 text-brand-dark dark:text-dark-heading" />
                  <span className="truncate">Histórico de Atividades</span>
                </h1>
                <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                  Registro de ações realizadas no sistema
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
          {error ? (
            <div className="text-center py-12 text-red-500">{error}</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-brand-inactive-text">
              Nenhum registro de atividade encontrado.
            </div>
          ) : (
            <div className="space-y-10">
              {Array.from(grouped.entries()).map(([dateKey, dayEntries]) => (
                <div key={dateKey}>
                  <h3 className="text-sm font-semibold text-brand-inactive-text dark:text-dark-body uppercase tracking-wide mb-4">
                    {formatDateGroup(dateKey)}
                  </h3>
                  <div className="space-y-3">
                    {dayEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl p-4 hover:shadow-sm transition-shadow"
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-sm text-brand-dark dark:text-dark-heading truncate">
                              {entry.actor}
                            </span>
                            <span className="text-brand-inactive-text text-xs shrink-0">
                              {entry.actionType}
                            </span>
                            <SourceBadge source={entry.source} />
                          </div>
                          <span className="text-xs text-brand-inactive-text shrink-0 whitespace-nowrap">
                            {formatDate(entry.createdAt, tz)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-brand-inactive-text mb-2">
                          <span className="truncate">
                            {entry.entityType}{entry.entityId !== "-" ? ` #${entry.entityId.slice(0, 8)}` : ""}
                          </span>
                        </div>
                        <ul className="space-y-1">
                          {entry.lines.map((line, i) => (
                            <li key={i} className="text-sm text-brand-dark dark:text-dark-body pl-3 border-l-2 border-brand-border dark:border-dark-border">
                              {line}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </FadeIn>
  )
}
