"use client"

import type React from "react"

import { useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"

/**
 * Região de conteúdo do ERP (área abaixo do ERPHeader).
 *
 * O shell do ERP nunca rola: quem rola é esta região. Como existem dois
 * comportamentos desejados, a região alterna o modo conforme a URL:
 *
 * - **Modo conteúdo** (sem `?view=`, `?edit=`, `?create=`, `?duplicate=`):
 *   listas, grids, dashboard, importações, configurações... O conteúdo flui
 *   normalmente e a scrollbar fica na borda da tela (igual à do navegador).
 *   A região é um flex column e a raiz da página perde a altura fixa
 *   (ver `.erp-content-flow` em `app/globals.css`), para que o conjunto do
 *   conteúdo seja rolado pela região.
 *
 * - **Modo entidade** (`?view=`, `?edit=`, `?create=`, `?duplicate=`):
 *   detalhe/criar/editar/duplicar. A página preenche 100% da região
 *   (ver `.erp-entity-region` em `app/globals.css`) e o scroll acontece
 *   dentro da própria página, logo abaixo do ERPHeader, usando a
 *   `custom-scrollbar`.
 */
export function ERPContentRegion({ children }: { children: React.ReactNode }) {
    const searchParams = useSearchParams()

    const isEntityPage =
        searchParams.has("view") ||
        searchParams.has("edit") ||
        searchParams.has("create") ||
        searchParams.has("duplicate")

    return (
        <div
            className={cn(
                "relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden",
                isEntityPage
                    ? "flex flex-col erp-entity-region"
                    : "flex flex-col erp-content-flow",
            )}
        >
            {children}
        </div>
    )
}
