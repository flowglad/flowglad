'use client'
import { Controller, useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { trpc } from '@/app/_trpc/client'
import { useEffect, useState } from 'react'
import { ArrowUp, LoaderCircle } from 'lucide-react'
import core, { cn } from '@/utils/core'
import ChatMessage, {
  ChatMessageProps,
} from '@/components/ChatMessage'
import RichEditorInput from '../editor/RichEditorInput'
import { CoreMessage } from 'ai'
import {
  ChatActionStatus,
  useChatActionsContext,
} from '../ChatActionsContext'
import { usePathname } from 'next/navigation'

const AiChatIcon = () => (
  <svg
    width="101"
    height="101"
    viewBox="0 0 101 101"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g filter="url(#filter0_d_1779_11082)">
      <circle cx="50.5" cy="46.5" r="30.5" fill="white" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M59.4139 35.5363C59.4139 35.5362 59.4139 35.5361 59.414 35.5361C65.8129 35.5361 71.0002 40.6717 71.0002 47.0067C71.0002 53.3417 65.8129 58.4773 59.414 58.4773C53.0151 58.4773 47.8278 53.3417 47.8278 47.0067C47.8278 47.0006 47.8327 46.9957 47.8388 46.9957H52.1615C52.1676 46.9957 52.1724 47.0006 52.1724 47.0066C52.1724 50.966 55.4145 54.1757 59.4138 54.1757C63.4131 54.1757 66.6552 50.966 66.6552 47.0066C66.6552 43.7776 64.499 41.0472 61.5343 40.1498C60.3974 39.8056 59.4139 38.8746 59.4139 37.6868V35.5363Z"
        fill="black"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M40.5863 58.456C40.5863 58.456 40.5863 58.4561 40.5862 58.4561C34.1873 58.4561 29 53.3205 29 46.9855C29 40.6505 34.1873 35.5149 40.5862 35.5149C46.9851 35.5149 52.1724 40.6505 52.1724 46.9855C52.1724 46.9915 52.1675 46.9964 52.1615 46.9964H47.8386C47.8326 46.9964 47.8277 46.9916 47.8277 46.9855C47.8277 43.0262 44.5857 39.8164 40.5864 39.8164C36.587 39.8164 33.345 43.0262 33.345 46.9855C33.345 50.2145 35.5012 52.9449 38.4659 53.8424C39.6028 54.1865 40.5863 55.1175 40.5863 56.3053V58.456Z"
        fill="black"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M61.4564 56.4137C61.4565 56.4137 61.4565 56.4138 61.4565 56.4139C61.4565 62.8127 56.321 68 49.9859 68C43.6508 68 38.5153 62.8127 38.5153 56.4139C38.5153 50.015 43.6508 44.8277 49.9859 44.8277C49.992 44.8277 49.9969 44.8327 49.9969 44.8387V49.1613C49.9969 49.1674 49.992 49.1724 49.9859 49.1724C46.0265 49.1724 42.8167 52.4144 42.8167 56.4137C42.8167 60.413 46.0265 63.655 49.9859 63.655C53.9453 63.655 57.155 60.413 57.155 56.4137C57.155 56.4137 57.155 56.4137 57.1551 56.4137H61.4564Z"
        fill="black"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M38.5377 37.5863C38.5376 37.5863 38.5375 37.5862 38.5375 37.5861C38.5375 31.1873 43.6731 26 50.0081 26C56.3432 26 61.4788 31.1873 61.4788 37.5861C61.4788 43.985 56.3432 49.1723 50.0081 49.1723C50.002 49.1723 49.9971 49.1673 49.9971 49.1613V44.8389C49.9971 44.8327 50.0021 44.8276 50.0083 44.8276C53.9677 44.8276 57.1775 41.5856 57.1775 37.5863C57.1775 33.587 53.9677 30.345 50.0083 30.345C46.0489 30.345 42.8392 33.587 42.8392 37.5863C42.8392 37.5863 42.8392 37.5863 42.8391 37.5863H38.5377Z"
        fill="black"
      />
    </g>
    <defs>
      <filter
        id="filter0_d_1779_11082"
        x="0"
        y="0"
        width="101"
        height="101"
        filterUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feColorMatrix
          in="SourceAlpha"
          type="matrix"
          values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
          result="hardAlpha"
        />
        <feOffset dy="4" />
        <feGaussianBlur stdDeviation="10" />
        <feComposite in2="hardAlpha" operator="out" />
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.2 0"
        />
        <feBlend
          mode="normal"
          in2="BackgroundImageFix"
          result="effect1_dropShadow_1779_11082"
        />
        <feBlend
          mode="normal"
          in="SourceGraphic"
          in2="effect1_dropShadow_1779_11082"
          result="shape"
        />
      </filter>
    </defs>
  </svg>
)

const AIModal = () => {
  const sendAIChat = trpc.utils.sendAIChat.useMutation()
  const [messages, setMessages] = useState<ChatMessageProps[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ message: string }>()
  const [increment, setIncrement] = useState(0)
  const { focusedActionId, setAction } = useChatActionsContext()
  const onSubmit = async (data: { message: string }) => {
    setIncrement(increment + 1)
    const withUserMessage = [
      ...messages,
      {
        message: {
          role: 'user',
          content: data.message,
        } as CoreMessage,
        id: core.nanoid(),
      },
    ]
    setMessages(withUserMessage)

    const { data: newMessage } = await sendAIChat.mutateAsync({
      prompt: data.message,
      messages: withUserMessage.map(
        (message) =>
          message.message as {
            role: 'user' | 'system' | 'assistant'
            content: string
          }
      ),
      parsedInput: {},
    })
    setMessages([
      ...withUserMessage,
      {
        message: {
          role: 'assistant',
          content: newMessage.response,
        } as CoreMessage,
        classification: newMessage.classification,
        dataOutput: newMessage.structuredOutput,
        id: newMessage.id,
      },
    ])
    setAction({
      id: newMessage.id,
      status: ChatActionStatus.Proposed,
      structuredOutput: newMessage.structuredOutput,
      classification: newMessage.classification,
    })
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if the pressed key is "/" and no input/textarea is focused
      if (
        event.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        !isOpen
      ) {
        event.preventDefault()
        setIsOpen(true)
      }
      // Close modal on escape key if modal is open
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () =>
      document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])
  const pathname = usePathname()

  if (
    pathname.startsWith('/purchase/access') ||
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up') ||
    pathname.endsWith('/purchase')
  ) {
    return null
  }
  return (
    <>
      <div
        className={cn(
          'fixed inset-y-0 right-0 w-[600px] transform transition-transform duration-300 ease-in-out z-50',
          isOpen ? 'translate-x-0' : 'translate-x-full',
          'bg-background/60 backdrop-blur-xl border-l border-stroke-subtle shadow-2xl'
        )}
      >
        <div className="flex flex-col h-full">
          <div className="flex justify-between items-center p-4 border-b border-stroke-subtle">
            <h2 className="text-lg font-semibold">Flowglad</h2>
            <Button
              onClick={() => setIsOpen(false)}
              variant="ghost"
              size="sm"
            >
              Close
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-2">
              {messages.map((message, index) => (
                <ChatMessage key={index} {...message} />
              ))}
              {isSubmitting && (
                <ChatMessage
                  authorRole="assistant"
                  isThinking={true}
                  message={{ role: 'assistant', content: '' }}
                  id={core.nanoid()}
                />
              )}
            </div>
          </div>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="w-full flex flex-row items-center gap-2 p-4 border-t border-stroke-subtle"
          >
            <Controller
              control={control}
              name="message"
              render={({ field }) => (
                <RichEditorInput
                  onChange={field.onChange}
                  increment={increment}
                  error={errors.message?.message}
                  onEnterSubmit={handleSubmit(onSubmit)}
                  placeholder="Enter your message here..."
                  className="w-full"
                />
              )}
            />
            <Button
              type="submit"
              disabled={isSubmitting}
              loading={isSubmitting}
              iconLeading={
                isSubmitting ? (
                  <LoaderCircle
                    className="animate-spin-slow"
                    size={16}
                  />
                ) : (
                  <ArrowUp size={16} />
                )
              }
            />
          </form>
        </div>
      </div>
      {!isOpen && (
        <div
          className={'fixed bottom-4 right-4 cursor-pointer z-50'}
          onClick={() => setIsOpen(true)}
        >
          <AiChatIcon />
        </div>
      )}
    </>
  )
}

export default AIModal
