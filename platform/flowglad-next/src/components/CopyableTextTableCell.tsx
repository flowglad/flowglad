import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import { ClipboardIcon } from 'lucide-react'

const CopyableTextTableCell = ({
  copyText,
  children,
}: {
  copyText: string
  children: React.ReactNode
}) => {
  const copyTextHandler = useCopyTextHandler({
    text: copyText,
  })
  return (
    <div
      className="flex items-center gap-2 cursor-pointer flex-row group"
      onClick={(e) => {
        e.stopPropagation()
        copyTextHandler()
      }}
    >
      <span className="text-sm font-mono cursor-pointer truncate group-hover:underline group-hover:decoration-dotted">
        {children}
      </span>
      {/* Use flex-shrink-0 to prevent the icon from being compressed when used in different flexbox contexts
          (e.g. inside DetailLabel vs standalone). This ensures consistent 16x16 sizing regardless of parent layout */}
      <div className="flex-shrink-0 w-4 h-4">
        <ClipboardIcon className="w-full h-full opacity-0 group-hover:opacity-100" />
      </div>
    </div>
  )
}

export default CopyableTextTableCell
