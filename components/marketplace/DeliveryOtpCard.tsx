"use client"

import React, { useState } from "react"
import { CheckCircleIcon, ShieldIcon, CopyIcon, ClockIcon } from "@/lib/icons"
import { toast } from "@/hooks/use-notification"

interface DeliveryOtpCardProps {
  code?: string
  status?: "pending" | "confirmed"
  confirmedAt?: string | null
  expiresAt?: string
  className?: string
}

export function DeliveryOtpCard({
  code,
  status = "pending",
  confirmedAt,
  expiresAt,
  className = "",
}: DeliveryOtpCardProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success("Código copiado!")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Não foi possível copiar o código.")
    }
  }

  const isConfirmed = status === "confirmed"

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 transition-all duration-200 ${isConfirmed
        ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20"
        : "border-brand-border bg-gradient-to-br from-white to-gray-50/80 dark:border-dark-border dark:from-dark-surface dark:to-dark-surface/80 shadow-xs"
        } ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isConfirmed
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
              : "bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/20"
              }`}
          >
            {isConfirmed ? <CheckCircleIcon size={20} /> : <ShieldIcon size={20} />}
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-brand-inactive-text dark:text-dark-body block">
              Segurança na Entrega
            </span>
            <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading leading-tight">
              {isConfirmed ? "Entrega Validada com Sucesso" : "Código de Confirmação de Entrega"}
            </h4>
          </div>
        </div>

        {isConfirmed ? (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 shrink-0">
            Confirmado
          </span>
        ) : (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-brand-green/15 text-brand-dark dark:bg-brand-green/20 dark:text-brand-green shrink-0">
            Aguardando Entrega
          </span>
        )}
      </div>

      {!isConfirmed && code ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between p-3 sm:p-3.5 rounded-xl bg-white dark:bg-dark-background border border-brand-border dark:border-dark-border shadow-2xs">
            <div className="flex items-center gap-1.5 sm:gap-2">
              {code.split("").map((digit, index) => (
                <span
                  key={index}
                  className="w-8 h-10 sm:w-10 sm:h-12 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-dark-surface border border-gray-200 dark:border-dark-border font-mono text-xl sm:text-2xl font-black text-brand-dark dark:text-white"
                >
                  {digit}
                </span>
              ))}
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-white transition-colors"
              title="Copiar código"
            >
              {copied ? (
                <CheckCircleIcon size={20} className="text-emerald-600" />
              ) : (
                <CopyIcon size={20} />
              )}
            </button>
          </div>

          <p className="text-xs text-brand-inactive-text dark:text-dark-body leading-relaxed">
            Informe este código de 6 dígitos ao entregador <strong>apenas quando ele estiver no seu endereço com o pedido em mãos</strong> para confirmar o recebimento.
          </p>

          {expiresAt && (
            <div className="flex items-center gap-1.5 text-[11px] text-brand-inactive-text dark:text-dark-body pt-1 border-t border-brand-border/60 dark:border-dark-border/60">
              <ClockIcon size={13} className="shrink-0" />
              <span>
                Válido até{" "}
                {new Intl.DateTimeFormat("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(expiresAt))}
              </span>
            </div>
          )}
        </div>
      ) : isConfirmed ? (
        <div className="mt-3">
          <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
            {confirmedAt
              ? `O código de segurança foi validado pelo entregador em ${new Intl.DateTimeFormat(
                "pt-BR",
                {
                  dateStyle: "short",
                  timeStyle: "short",
                }
              ).format(new Date(confirmedAt))}.`
              : "O código de segurança foi validado pelo entregador na conclusão da entrega."}
          </p>
        </div>
      ) : null}
    </div>
  )
}
