import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react'

interface MentionItem {
  id: string
  label: string
}

const MentionList = forwardRef<
  HTMLDivElement,
  {
    items: MentionItem[]
    command: (pparams: { id: string; label: string }) => void
  }
>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const selectItem = (index: number) => {
    const item = props.items[index]

    if (item) {
      props.command(item)
    }
  }

  const upHandler = () => {
    setSelectedIndex(
      (selectedIndex + props.items.length - 1) % props.items.length
    )
  }

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length)
  }

  const enterHandler = () => {
    selectItem(selectedIndex)
  }

  useEffect(() => setSelectedIndex(0), [props.items])

  // @ts-expect-error - weird forward ref typing
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        upHandler()
        return true
      }

      if (event.key === 'ArrowDown') {
        downHandler()
        return true
      }

      if (event.key === 'Enter') {
        enterHandler()
        return true
      }

      return false
    },
  }))

  return (
    <div className="bg-background rounded-md shadow-medium flex flex-col gap-1 overflow-auto p-3 relative border border-border">
      {props.items.length ? (
        props.items.map((item, index) => (
          <button
            className={`hover:bg-accent px-1 text-left rounded-md ${
              index === selectedIndex ? 'bg-accent' : ''
            }`}
            key={index}
            onClick={() => selectItem(index)}
          >
            {item.label}
          </button>
        ))
      ) : (
        <div className="item">No result</div>
      )}
    </div>
  )
})

MentionList.displayName = 'MentionList'

export default MentionList
