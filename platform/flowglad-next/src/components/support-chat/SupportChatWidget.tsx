'use client'

import { AnimatePresence } from 'motion/react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { SupportChatPopup } from './SupportChatPopup'
import { SupportChatTrigger } from './SupportChatTrigger'

const STORAGE_KEY = 'flowglad-support-chat-messages'

const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

const chatMessagesSchema = z.array(chatMessageSchema)

export type ChatMessage = z.infer<typeof chatMessageSchema>

export function SupportChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isHydrated, setIsHydrated] = useState(false)

  // Load from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = chatMessagesSchema.safeParse(
          JSON.parse(stored)
        )
        if (parsed.success) {
          setMessages(parsed.data)
        } else {
          // Invalid schema, clear corrupted data
          sessionStorage.removeItem(STORAGE_KEY)
        }
      } catch {
        // Invalid JSON, clear corrupted data
        sessionStorage.removeItem(STORAGE_KEY)
      }
    }
    setIsHydrated(true)
  }, [])

  // Sync to sessionStorage when messages change
  useEffect(() => {
    if (!isHydrated) return

    if (messages.length > 0) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    } else {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }, [messages, isHydrated])

  // Show Discord link after first assistant response
  const showDiscordLink = messages.some((m) => m.role === 'assistant')

  // Don't render until hydrated to avoid hydration mismatch
  if (!isHydrated) {
    return null
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence mode="wait">
        {isOpen ? (
          <SupportChatPopup
            key="popup"
            messages={messages}
            setMessages={setMessages}
            onClose={() => setIsOpen(false)}
            showDiscordLink={showDiscordLink}
          />
        ) : (
          <SupportChatTrigger
            key="trigger"
            onClick={() => setIsOpen(true)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
