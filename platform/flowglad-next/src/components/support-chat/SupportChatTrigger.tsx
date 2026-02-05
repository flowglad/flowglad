'use client'

import * as motion from 'motion/react-client'
import { FlowgladLogomark } from '@/components/icons/FlowgladLogomark'

interface SupportChatTriggerProps {
  onClick: () => void
}

export function SupportChatTrigger({
  onClick,
}: SupportChatTriggerProps) {
  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClick}
      className="h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label="Open support chat"
    >
      <FlowgladLogomark size={28} />
    </motion.button>
  )
}
