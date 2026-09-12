"use client"

import React, { useState } from "react"
import { SupportModal } from "./SupportModal"

interface SupportTriggerProps {
  children: React.ReactElement<{ onClick?: () => void }>
  userEmail?: string | null
  partnerPlan?: string | null
  partnerId?: string | null
  userRole?: string | null
}

export function SupportTrigger({
  children,
  userEmail,
  partnerPlan,
  partnerId,
  userRole,
}: SupportTriggerProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {React.cloneElement(children, {
        onClick: () => setIsOpen(true),
      })}
      <SupportModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        userEmail={userEmail}
        partnerPlan={partnerPlan}
        partnerId={partnerId}
        userRole={userRole}
      />
    </>
  )
}
