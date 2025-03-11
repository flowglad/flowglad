'use client'

import { useMemo } from 'react'
import { toast } from 'sonner'

export const useCopyTextHandler = ({ text }: { text: string }) => {
  return useMemo(() => {
    return () => {
      navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard!', { duration: 1500 })
    }
  }, [text])
}
