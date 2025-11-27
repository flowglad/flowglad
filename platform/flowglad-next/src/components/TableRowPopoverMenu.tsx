import { MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import PopoverMenu, { type PopoverMenuProps } from './PopoverMenu'

export type TableRowPopoverMenuProps = PopoverMenuProps

export function TableRowPopoverMenu({
  items,
}: TableRowPopoverMenuProps) {
  return (
    /**
     * This will prevent clicks on this button from bubbling up to the table row
     * which will then trigger a page navigation.
     */
    <div onClick={(e) => e.stopPropagation()}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="data-[state=open]:bg-muted text-muted-foreground flex size-8"
            size="icon"
          >
            <MoreVertical className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-fit p-1" align="end">
          <PopoverMenu items={items} />
        </PopoverContent>
      </Popover>
    </div>
  )
}

export default TableRowPopoverMenu
