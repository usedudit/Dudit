'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

type SeparatorProps = React.HTMLAttributes<HTMLDivElement> & {
  orientation?: 'horizontal' | 'vertical'
  decorative?: boolean
}

function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: SeparatorProps) {
  return (
    <div
      role={decorative ? 'presentation' : 'separator'}
      aria-orientation={orientation === 'vertical' ? 'vertical' : undefined}
      className={cn(
        'bg-brand-border shrink-0',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className
      )}
      {...props}
    />
  )
}

export { Separator }