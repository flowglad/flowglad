'use client'

import { Loader2, X } from 'lucide-react'
import * as motion from 'motion/react-client'
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from 'react'
import { trpc } from '@/app/_trpc/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SupportChatInput } from './SupportChatInput'
import { SupportChatMessage } from './SupportChatMessage'
import type { ChatMessage } from './SupportChatWidget'

interface SupportChatPopupProps {
  messages: ChatMessage[]
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  onClose: () => void
  showDiscordLink: boolean
}

const ERROR_MESSAGE =
  'Sorry, I encountered an error processing your request. Please try again, or reach out on Discord if the issue persists.'

export function SupportChatPopup({
  messages,
  setMessages,
  onClose,
  showDiscordLink,
}: SupportChatPopupProps) {
  const scrollAnchorRef = useRef<HTMLDivElement>(null)
  // Use a ref to track messages synchronously, avoiding stale closure issues
  // when multiple messages are sent rapidly before React re-renders
  const messagesRef = useRef<ChatMessage[]>(messages)

  // Keep ref in sync with prop (for initial mount and any external updates)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Helper to update both ref (sync) and state (async) together
  const updateMessages = useCallback(
    (newMessages: ChatMessage[]) => {
      messagesRef.current = newMessages
      setMessages(newMessages)
    },
    [setMessages]
  )

  const sendMessageMutation =
    trpc.supportChat.sendMessage.useMutation({
      onSuccess: (data) => {
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.response,
          sources: data.sources,
        }
        updateMessages([...messagesRef.current, assistantMessage])
      },
      onError: () => {
        const errorMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: ERROR_MESSAGE,
        }
        updateMessages([...messagesRef.current, errorMessage])
      },
    })

  const handleSend = (message: string) => {
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
    }

    // Build updated messages array including the new user message
    const updatedMessages = [...messagesRef.current, userMessage]

    // Update ref synchronously so subsequent rapid calls see this message
    updateMessages(updatedMessages)

    sendMessageMutation.mutate({
      message,
      history: messagesRef.current.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    })
  }

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sendMessageMutation.isPending])

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      transition={{ duration: 0.15 }}
      style={{ originX: 1, originY: 1 }}
    >
      <Card className="w-[380px] h-[500px] flex flex-col shadow-xl py-0 gap-0">
        <div className="flex items-center justify-between py-4 px-4 border-b">
          <span className="font-semibold">Flowglad Support</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <CardContent className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full">
            <div
              className={
                messages.length === 0
                  ? 'flex items-center justify-center h-full p-4'
                  : 'flex flex-col gap-4 p-4'
              }
            >
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center">
                  Hi! How can I help you with Flowglad today?
                </p>
              )}
              {messages.map((message, index) => (
                <SupportChatMessage
                  key={message.id}
                  message={message}
                  isLatest={index === messages.length - 1}
                />
              ))}
              {sendMessageMutation.isPending && (
                <div className="flex gap-2 items-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Thinking...</span>
                </div>
              )}
              <div ref={scrollAnchorRef} />
            </div>
          </ScrollArea>
        </CardContent>

        {showDiscordLink && (
          <div className="px-4 py-2 border-t bg-muted/50 text-center">
            <p className="text-xs text-muted-foreground">
              Need more help?{' '}
              <a
                href="https://discord.com/channels/1273695198639161364/1415806514085498880"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Join our Discord
              </a>
            </p>
          </div>
        )}

        <SupportChatInput
          onSend={handleSend}
          disabled={sendMessageMutation.isPending}
        />
      </Card>
    </motion.div>
  )
}
