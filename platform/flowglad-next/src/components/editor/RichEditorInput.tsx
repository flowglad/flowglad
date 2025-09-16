import Placeholder from '@tiptap/extension-placeholder'
import { Extension } from '@tiptap/core'
import Mention from '@tiptap/extension-mention'
import {
  EditorContent,
  mergeAttributes,
  useEditor,
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import mentionSuggestions from './mentionSuggestions'
import ErrorLabel from '../ErrorLabel'
import { useEffect } from 'react'
import { cn } from '@/lib/utils'

const RichEditorInput = ({
  onChange,
  error,
  placeholder,
  content,
  increment,
  onEnterSubmit,
  className,
}: {
  onChange?: (html: string) => void
  error?: string
  placeholder?: string
  content?: string
  increment?: number
  onEnterSubmit?: () => void
  className?: string
}) => {
  const getProperNouns = async (query: string) => {
    const searchParams = new URLSearchParams({ query })

    const response = await fetch(
      `/get-proper-nouns?${searchParams.toString()}`
    )
    const data = await response.json()
    return { data }
  }
  const CustomEnterHandling = Extension.create({
    addKeyboardShortcuts() {
      return {
        Enter: ({ editor }) => {
          if (onEnterSubmit) {
            onEnterSubmit()
          }
          return true
        },
        'Shift-Enter': ({ editor }) => {
          // Shift+Enter logic
          return true
        },
      }
    },
  })

  const editor = useEditor({
    extensions: [
      // @ts-ignore - type mismatch
      CustomEnterHandling.configure(),
      StarterKit.configure(),
      Placeholder.configure({
        placeholder: placeholder ?? 'Enter your message here...',
      }),
      Mention.configure({
        HTMLAttributes: {
          class:
            'bg-primary/20 text-primary rounded-[0.4rem] box-decoration-clone px-[0.1rem] py-[0.3rem]',
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
        suggestion: mentionSuggestions(getProperNouns),
      }),
    ],
    content,
  })

  useEffect(() => {
    if (editor) {
      editor.commands.setContent('')
    }
  }, [increment, editor])

  if (!editor) {
    return null
  }

  if (onChange) {
    editor.on('update', (e) => {
      onChange(editor?.getHTML() ?? '')
    })
  }

  return (
    <div
      className={cn(
        'bg-background border border-border p-2 rounded-md',
        className
      )}
    >
      {/* {editor && <MenuBar editor={editor} />} */}
      <EditorContent editor={editor} />
      {error && <ErrorLabel error={error} />}
    </div>
  )
}

export default RichEditorInput
