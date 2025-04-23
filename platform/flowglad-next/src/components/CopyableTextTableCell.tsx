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
      <span className="text-sm font-mono cursor-pointer truncate hover:underline hover:decoration-dotted">
        {children}
      </span>
      <ClipboardIcon className="w-4 h-4 opacity-0 group-hover:opacity-100" />
    </div>
  )
}

export default CopyableTextTableCell
