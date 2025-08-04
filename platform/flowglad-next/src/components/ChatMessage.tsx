import { CoreMessage } from 'ai'
import { cn } from '@/utils/core'
import {
  EditorContent,
  mergeAttributes,
  useEditor,
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Mention from '@tiptap/extension-mention'
import type { Classification } from '@/ai/classify'
import { ChatMessageSubcomponent } from './ChatMessageSubcomponent'
import { Skeleton } from '@/components/ui/skeleton'

export interface ChatMessageProps {
  id: string
  message: CoreMessage
  dataOutput?: any
  classification?: Classification
  isThinking?: boolean
  authorRole?: 'user' | 'assistant'
}

const RichChatMessage = ({
  id,
  message,
  classification,
  dataOutput,
  authorRole,
  isThinking,
}: ChatMessageProps) => {
  const isUser = message.role === 'user'
  const content = message.content
  let subcomponent: React.ReactNode | null = null
  if (message.role === 'assistant' && classification) {
    subcomponent = (
      <ChatMessageSubcomponent
        classification={classification}
        innerProps={dataOutput}
        id={id}
      />
    )
  }
  const editor = useEditor({
    editable: false,
    extensions: [
      StarterKit.configure(),
      Mention.configure({
        HTMLAttributes: {
          class:
            'bg-blue-300 rounded-[0.4rem] box-decoration-clone text-blue-900 px-[0.1rem] py-[0.3rem]',
        },
        renderHTML: ({ node, options }) => {
          return [
            'span',
            mergeAttributes(
              { 'data-type': 'mention' },
              options.HTMLAttributes
            ),
            `${node.attrs.label ?? node.attrs.id}`,
          ]
        },
      }),
    ],
    content: content as string,
  })

  return (
    <>
      <div
        className={cn(
          'flex w-full',
          isUser ? 'justify-end' : 'justify-start'
        )}
      >
        <div
          className={cn(
            'w-[80%] rounded-2xl px-4 py-2',
            isUser
              ? 'bg-container-high text-white rounded-tr-sm'
              : 'bg-container-high text-white rounded-tl-sm'
          )}
        >
          {!isThinking && <EditorContent editor={editor} />}
          {subcomponent}
        </div>
      </div>
    </>
  )
}
const ChatMessage = (props: ChatMessageProps) => {
  const content = props.message.content
  if (typeof content !== 'string') {
    return <div></div>
  }
  if (props.isThinking) {
    return (
      <div className="flex w-full">
        <Skeleton className="h-20 w-[80%] rounded-2xl" />
      </div>
    )
  }
  return <RichChatMessage {...props} />
}

export default ChatMessage
