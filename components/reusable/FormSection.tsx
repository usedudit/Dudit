import type React from "react"

interface FormSectionProps {
  title: string
  children: React.ReactNode
  className?: string
}

export const FormSection: React.FC<FormSectionProps> = ({ title, children, className = "" }) => (
  <div className={className}>
    <h2 className="text-lg font-semibold text-brand-dark dark:text-dark-heading mb-4">{title}</h2>
    <div className="space-y-5">{children}</div>
  </div>
)
