"use client"

import { useEffect } from "react"
import { useSidebar } from "@/lib/sidebar-context"

interface ERPPageHeaderProps {
  title?: string
  backHref?: string
  onBack?: () => void
  isSubPage?: boolean
}

/**
 * Component to declaratively set the ERP Header state from any page (Server or Client).
 * Usage: <ERPPageHeader title="Products" backHref="/erp" />
 */
export function ERPPageHeader({ title, backHref, onBack, isSubPage }: ERPPageHeaderProps) {
  const { setHeaderOverride } = useSidebar()

  useEffect(() => {
    setHeaderOverride({
      title,
      backHref,
      onBack,
      isSubPage,
    })

    // Optional: Cleanup if the page unmounts
    // return () => setHeaderOverride(null)
  }, [title, backHref, onBack, isSubPage, setHeaderOverride])

  return null
}
