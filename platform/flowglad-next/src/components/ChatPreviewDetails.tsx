import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

const ChatPreviewDetails = ({
  children,
  onClose,
  footer,
  title,
}: {
  title?: string
  children: React.ReactNode
  onClose: () => void
  footer?: React.ReactNode
}) => {
  return (
    <div className="relative flex flex-col h-full ml-4">
      <div className="absolute top-0 right-0 left-0 z-10 border-b border-stroke-subtle py-4 px-6 bg-background-input rounded-t-radius-md flex flex-row justify-between items-center">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Button
          onClick={onClose}
          iconLeading={<X size={16} />}
          variant="ghost"
          size="sm"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-4 border-1 border-l border-r border-stroke mt-[60px] mb-[64px] bg-background">
        {children}
      </div>
      <div className="absolute bottom-0 right-0 left-0 z-10 border-t border-b border-stroke-subtle py-4 px-6 bg-background-input rounded-b-radius-md">
        {footer}
      </div>
    </div>
  )
}

export default ChatPreviewDetails
