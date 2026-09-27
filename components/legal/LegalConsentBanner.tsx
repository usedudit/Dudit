"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSupabase } from "@/providers/supabase-provider"
import {
  getPendingLegalConsents,
  recordLegalConsent,
} from "@/app/actions/auth/legal-consent"
import type { PendingLegalConsent } from "@/lib/legal/pending"
import { DefaultModal, ListItem, Button } from "@/components/reusable"
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
  const pathname = usePathname()
  const { user, isLoading: isAuthLoading } = useSupabase()
  const [pending, setPending] = useState<PendingLegalConsent[] | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (pathname?.startsWith("/print")) return
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

  const isOpen = Boolean(!isAuthLoading && user && pending && pending.length > 0)

  // Bloqueia o scroll enquanto o modal está aberto
  useEffect(() => {
    if (!isOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen])

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

  return (
    <DefaultModal
      isOpen={isOpen}
      onClose={() => { }}
      title="Documentos atualizados"
      maxWidth="md"
      footer={
        <div className="w-full">
          <Button onClick={handleAccept} isLoading={accepting} className="w-full">
            Aceito os documentos atualizados
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
          Nossos documentos legais foram atualizados. Para continuar usando a Dudit,
          aceite a nova versão:
        </p>

        <div className="space-y-3">
          {(pending ?? []).map((doc) => {
            const url = doc.url
            return (
              <ListItem
                key={doc.tipo}
                icon={FileTextIcon}
                title={DOCUMENT_LABELS[doc.tipo] ?? doc.tipo}
                description={doc.versao ? `Versão ${doc.versao}` : undefined}
                onClick={
                  url
                    ? () => window.open(url, "_blank", "noopener,noreferrer")
                    : undefined
                }
                right={
                  url ? (
                    <Link
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-bold text-brand-green hover:underline shrink-0"
                    >
                      Ler documento
                    </Link>
                  ) : null
                }
                className="px-4 py-3"
              />
            )
          })}
        </div>

        {error && <p className="text-sm text-brand-red">{error}</p>}
      </div>
    </DefaultModal>
  )
}