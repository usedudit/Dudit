'use client'

import { toast, useNotification } from '@/hooks/use-notification'

export { toast }

export function useToast() {
  const { notify } = useNotification()
  return {
    toast,
    toasts: [] as any[],
    dismiss: (toastId?: string) => {},
  }
}
