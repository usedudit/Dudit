"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSupabase } from "@/providers/supabase-provider"
import {
  getPendingLegalConsents,
  recordLegalConsent,
} from "@/app/actions/auth/legal-consent"
import type { PendingLegalConsent } from "@/lib/legal/pending"
import Portal from "@/components/Portal"
import { Button } from "@/components/reusable/Button"
import { FileTextIcon } from "@/lib/icons"

const DOCUMENT_LABELS: Record<string, string> = {
  terms: "Termos de Uso",
  privacy: "Política de Privacidade",
}

/**
 * Banner modal bloqueante de re-consentimento dos documentos legais.
 * Aparece quando existe uma versão em vigor que o usuário ainda não aceitou.
 */
export function LegalConsentBanner() {
  const { user, isLoading: isAuthLoading } = useSupabase()
  const [pending, setPending] = useState<PendingLegalConsent[] | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setPending(null)
      return
    }

    let cancelled = false
    getPendingLegalConsents()
      .then((result) => {
        if (!cancelled) setPending(result)
      })
      .catch(() => {
        if (!cancelled) setPending([])
      })

    return () => {
      cancelled = true
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Bloqueia o scroll enquanto o modal está aberto
  useEffect(() => {
    if (!pending || pending.length === 0) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [pending])

  const handleAccept = async () => {
    if (!pending || pending.length === 0) return
    setAccepting(true)
    setError(null)
    try {
      const results = await Promise.all(
        pending.map((doc) =>
          recordLegalConsent({ tipo: doc.tipo, versao: doc.versao, origem: "reconsent" })
        )
      )
      if (results.some((r) => !r.success)) {
        setError("Não foi possível registrar o aceite. Tente novamente.")
        return
      }
      setPending([])
    } catch {
      setError("Não foi possível registrar o aceite. Tente novamente.")
    } finally {
      setAccepting(false)
    }
  }

  if (isAuthLoading || !user || pending === null || pending.length === 0) return null

  return (
    <Portal>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70">
        <div className="relative bg-white dark:bg-dark-surface rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="shrink-0 flex items-center justify-center h-11 w-11 rounded-full bg-brand-green/10">
              <FileTextIcon className="h-5 w-5 text-brand-green" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                Documentos atualizados
              </h2>
              <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">
                Nossos documentos legais foram atualizados. Para continuar usando a Dudit,
                aceite a nova versão:
              </p>
            </div>
          </div>

          <ul className="space-y-3 mb-6">
            {pending.map((doc) => (
              <li
                key={doc.tipo}
                className="flex items-center justify-between gap-3 rounded-xl border border-brand-border dark:border-dark-border p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                    {DOCUMENT_LABELS[doc.tipo] ?? doc.tipo}
                  </p>
                  <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                    Versão {doc.versao}
                  </p>
                </div>
                {doc.url && (
                  <Link
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-brand-green underline shrink-0"
                  >
                    Ler
                  </Link>
                )}
              </li>
            ))}
          </ul>

          {error && <p className="text-sm text-brand-red mb-4">{error}</p>}

          <Button onClick={handleAccept} isLoading={accepting} className="w-full">
            Aceito os documentos atualizados
          </Button>
        </div>
      </div>
    </Portal>
  )
}