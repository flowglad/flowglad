import { ReactRenderer } from '@tiptap/react'
import tippy from 'tippy.js'
import type { ProperNoun } from '@/db/schema/properNouns'
import MentionList from './MentionList'

const createMentionSuggestions = (
  getSuggestions: (
    query: string
  ) => Promise<{ data: ProperNoun.ClientRecord[] }>
) => ({
  items: async ({ query }: { query: string }) => {
    const getProperNouns = await getSuggestions(query)
    return (
      getProperNouns.data
        ?.slice(0, 5)
        .map(({ name, entityType, entityId }) => ({
          id: `${entityType}:${entityId}`,
          label: `${name} (${entityType})`,
        })) ?? []
    )
  },

  render: () => {
    let component: ReactRenderer
    let popup: ReturnType<typeof tippy>

    return {
      onStart: (props: any) => {
        component = new ReactRenderer(MentionList, {
          props,
          editor: props.editor,
        })

        if (!props.clientRect) {
          return
        }

        popup = tippy('body', {
          getReferenceClientRect: props.clientRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
        })
      },

      onUpdate(props: any) {
        component.updateProps(props)

        if (!props.clientRect) {
          return
        }

        popup[0].setProps({
          getReferenceClientRect: props.clientRect,
        })
      },

      onKeyDown(props: any) {
        if (props.event.key === 'Escape') {
          popup[0].hide()

          return true
        }
        // @ts-expect-error component has no types
        return component.ref?.onKeyDown(props)
      },

      onExit() {
        popup[0].destroy()
        component.destroy()
      },
    }
  },
})

export default createMentionSuggestions
